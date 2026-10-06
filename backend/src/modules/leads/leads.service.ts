import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { CreateManualLeadDto } from './dto/create-manual-lead.dto';
import type { AssignLeadDto } from './dto/assign-lead.dto';
import type { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import type { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import type { UpdateLeadNextActionDto } from './dto/update-lead-next-action.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';
import type { ImportLeadsDto } from './dto/import-leads.dto';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  leadContactFromData,
  normalizeLeadData,
} from '../../common/utils/lead-data.util';
import {
  attributionToPrismaData,
  resolveAttribution,
} from '../../common/utils/lead-attribution.util';
import { isValidLoosePhone } from '../../common/utils/phone.util';
import {
  actorLeadOrClauses,
  canSeeAllLeads,
} from '../../common/utils/lead-scope.util';
import { listLeadAssignableUsers } from '../../common/utils/lead-assignee.util';
import { GoogleSheetsService } from '../marketing/google-sheets.service';

/** The unit a lead is about — stored as `data.unitId` (Lead has no column). */
function leadUnitId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const unitId = normalizeLeadData(data as Record<string, unknown>).unitId;
  return typeof unitId === 'string' && unitId ? unitId : null;
}

/** Sentinel org id for Super Admin template captures (Lead.orgId has no FK). */
export const PLATFORM_LEAD_ORG_ID = 'platform';

// Per-row rules for CSV lead import.
const LEAD_IMPORT_NAME_MAX = 120;
const LEAD_IMPORT_EMAIL_MAX = 254;
const LEAD_IMPORT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Why a CSV import row must be skipped, or null when it can be saved. All
 * three fields are required.
 */
function importRowError(row: {
  name: string;
  phone: string;
  email: string;
}): string | null {
  const missing = [
    !row.name && 'Name',
    !row.phone && 'Phone',
    !row.email && 'Email',
  ].filter(Boolean);
  if (missing.length > 0) return `Missing ${missing.join(', ')}`;
  if (row.name.length > LEAD_IMPORT_NAME_MAX) {
    return `Name is longer than ${LEAD_IMPORT_NAME_MAX} characters`;
  }
  if (!isValidLoosePhone(row.phone)) {
    return 'Invalid phone number (7–15 digits)';
  }
  if (
    row.email.length > LEAD_IMPORT_EMAIL_MAX ||
    !LEAD_IMPORT_EMAIL_REGEX.test(row.email)
  ) {
    return 'Invalid email address';
  }
  return null;
}

export type LeadImportResult = {
  total: number;
  created: number;
  failed: number;
  /** One entry per skipped row; `row` is the 1-based line in the CSV. */
  errors: { row: number; reason: string }[];
};

type ResolvedPublicPage = {
  id: string;
  orgId: string;
  status: string;
  content?: unknown;
};

/** Fields needed to render an activity/call actor. */
const ACTOR_SELECT = {
  select: { id: true, firstName: true, lastName: true, email: true },
} as const;

type ActorRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
} | null;

/** Actor for the activity feed. `null` (no user) renders as "System". */
function toActor(user: ActorRow): { id: string; name: string } | null {
  if (!user) return null;
  return {
    id: user.id,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
  };
}

type ActivityRow = {
  id: string;
  type: string;
  text: string;
  createdAt: Date;
  agent?: ActorRow;
};

/** Shape an ActivityEvent row (with `agent` selected) for the API. */
function toActivity(row: ActivityRow) {
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    createdAt: row.createdAt,
    actor: toActor(row.agent ?? null),
  };
}

@Injectable()
export class LeadsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly googleSheets?: GoogleSheetsService,
  ) {}

  async onModuleInit() {
    try {
      const platformLeads = await this.prisma.lead.findMany({
        where: { orgId: PLATFORM_LEAD_ORG_ID },
        select: { id: true, landingPageId: true, projectId: true },
      });
      if (platformLeads.length > 0) {
        const defaultOrg = await this.prisma.organisation.findFirst({
          where: { status: 'active' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (defaultOrg) {
          for (const l of platformLeads) {
            let targetOrgId = defaultOrg.id;
            if (l.landingPageId) {
              const lp = await this.prisma.landingPage.findUnique({
                where: { id: l.landingPageId },
                select: { orgId: true },
              });
              if (lp?.orgId) targetOrgId = lp.orgId;
            } else if (l.projectId) {
              const prj = await this.prisma.project.findUnique({
                where: { id: l.projectId },
                select: { orgId: true },
              });
              if (prj?.orgId) targetOrgId = prj.orgId;
            }
            await this.prisma.lead.update({
              where: { id: l.id },
              data: { orgId: targetOrgId },
            });
            await this.prisma.activityEvent.updateMany({
              where: { leadId: l.id, orgId: PLATFORM_LEAD_ORG_ID },
              data: { orgId: targetOrgId },
            });
          }
        }
      }
    } catch {
      // Safe fallback on module init
    }
  }

  /**
   * Public capture path: an anonymous visitor submits a form. We resolve the
   * owning org from the landing page id, slug, and/or project id rather than
   * trusting a client-supplied orgId.
   */
  async createFromPublic(dto: CreateLeadDto) {
    if (!dto.landingPageId && !dto.projectId && !dto.slug) {
      throw new NotFoundException(
        'landingPageId, slug, or projectId is required to attribute the lead',
      );
    }

    let orgId: string | null = null;
    let projectName: string | null = null;

    let resolvedLandingPageId = dto.landingPageId ?? null;

    const pageRef = dto.landingPageId || dto.slug;
    if (pageRef) {
      const page = await this.resolvePublicLandingPage(pageRef, dto.slug);
      if (page) {
        orgId = page.orgId;
        resolvedLandingPageId = page.id;

        // Auto-extract propertyBinding from the landing page if not explicitly supplied
        const pageContent = page.content as {
          config?: {
            propertyBinding?: {
              kind?: string;
              projectId?: string;
              unitId?: string;
            };
          };
        } | null;
        const binding = pageContent?.config?.propertyBinding;
        if (binding?.kind === "project" && binding.projectId && !dto.projectId) {
          dto.projectId = binding.projectId;
        } else if (binding?.kind === "unit" && binding.unitId && !dto.unitId) {
          dto.unitId = binding.unitId;
        }
      }
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { orgId: true, status: true, name: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
      if (project.status !== 'active') {
        throw new BadRequestException('Project is not available for website enquiries');
      }
      // Platform template captures may bind a project later — then the project
      // org wins. Otherwise org + project must match.
      if (
        orgId &&
        orgId !== PLATFORM_LEAD_ORG_ID &&
        project.orgId !== orgId
      ) {
        throw new BadRequestException(
          'Project and landing page must belong to the same organisation',
        );
      }
      orgId = project.orgId;
      projectName = project.name;
    }

    if (dto.unitId) {
      const unit = await this.prisma.unit.findUnique({
        where: { id: dto.unitId },
        select: { id: true, projectId: true, orgId: true, unitNo: true, configuration: true },
      });
      if (!unit) {
        throw new BadRequestException('Selected unit not found');
      }
      if (unit.projectId) {
        if (dto.projectId && unit.projectId !== dto.projectId) {
          throw new BadRequestException('Selected unit does not belong to the selected project');
        }
        if (!dto.projectId) {
          dto.projectId = unit.projectId;
        }
      } else {
        if (dto.projectId) {
          throw new BadRequestException('Selected standalone unit does not belong to a project');
        }
      }
      if (orgId && orgId !== unit.orgId) {
        throw new BadRequestException('Selected unit belongs to another organisation');
      }
      if (!orgId) {
        orgId = unit.orgId;
      }
    }

    if (!orgId || orgId === PLATFORM_LEAD_ORG_ID) {
      const defaultOrg = await this.prisma.organisation.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (defaultOrg) {
        orgId = defaultOrg.id;
      } else {
        throw new NotFoundException('Unable to resolve organisation');
      }
    }

    const projectId =
      dto.projectId ??
      (await this.resolveProjectId(orgId, resolvedLandingPageId, dto.data));

    const data = normalizeLeadData(dto.data ?? {}, {
      unitId: dto.unitId,
      projectName,
    });

    // Promote UTM / ad params from the form blob onto structured columns so
    // Lead Center attribution and reporting stay filterable.
    // Do not force platform:'website' — UTM / referrer / source infer via
    // Integration Engine attribution (fbclid → meta, gclid → google_ads, etc.).
    const attribution = resolveAttribution(data as Record<string, unknown>, {
      source: dto.source ?? 'website',
      landingPageUrl:
        typeof (data as Record<string, unknown>).landingPageUrl === 'string'
          ? String((data as Record<string, unknown>).landingPageUrl)
          : typeof (data as Record<string, unknown>).landing_page_url ===
              'string'
            ? String((data as Record<string, unknown>).landing_page_url)
            : null,
      referrer:
        typeof (data as Record<string, unknown>).referrer === 'string'
          ? String((data as Record<string, unknown>).referrer)
          : null,
    });

    const existing = await this.findRecentDuplicate(orgId, projectId, data);
    if (existing) {
      if (resolvedLandingPageId) {
        this.prisma.trackingEvent.create({
          data: {
            orgId,
            landingPageId: resolvedLandingPageId,
            eventType: 'lead_submit',
            metadata: { leadId: existing.id, formName: dto.formName, source: dto.source } as Prisma.InputJsonValue,
          },
        }).catch(() => {});
      }
      const attrData = attributionToPrismaData(attribution);
      // Preserve original first-touch on duplicate merges.
      delete attrData.firstTouchSource;
      return this.prisma.lead.update({
        where: { id: existing.id },
        data: {
          data: data as Prisma.InputJsonValue,
          landingPageId: resolvedLandingPageId ?? existing.landingPageId,
          projectId: projectId ?? existing.projectId,
          formName: dto.formName ?? existing.formName,
          source: attribution.source ?? dto.source ?? existing.source,
          ...attrData,
        },
      });
    }

    const assignedToId = await this.nextRoundRobinAssignee(orgId, projectId);

    const lead = await this.prisma.lead.create({
      data: {
        orgId,
        landingPageId: resolvedLandingPageId,
        projectId,
        formName: dto.formName ?? null,
        source: attribution.source ?? dto.source ?? 'website',
        data: data as Prisma.InputJsonValue,
        configurations: [],
        tags: [],
        ...attributionToPrismaData(attribution),
        ...(assignedToId ? { assignedToId } : {}),
      },
    });

    if (this.googleSheets) {
      void this.googleSheets
        .appendLeadRow(orgId, lead, projectId ?? undefined)
        .catch(() => {});
    }

    if (resolvedLandingPageId) {
      this.prisma.trackingEvent.create({
        data: {
          orgId,
          landingPageId: resolvedLandingPageId,
          eventType: 'lead_submit',
          metadata: { leadId: lead.id, formName: dto.formName, source: dto.source } as Prisma.InputJsonValue,
        },
      }).catch(() => {});
    }

    // Always record the capture on the timeline. It's an automated event, so
    // there is no actor — `agentId: null` renders as "System". (Previously this
    // row was only written when a round-robin assignee existed, and was then
    // mis-attributed to that assignee.)
    await this.prisma.activityEvent.create({
      data: {
        orgId,
        agentId: null,
        leadId: lead.id,
        type: 'status_updated',
        text: assignedToId
          ? 'Lead captured from website and assigned automatically'
          : 'Lead captured from website',
      },
    });

    return lead;
  }

  async createFromCrm(orgId: string, actor: JwtPayload, dto: CreateManualLeadDto) {
    let unitId: string | undefined;
    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, orgId, projectId: null },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Standalone unit not found');
      unitId = unit.id;
    }

    const data = normalizeLeadData(dto.data ?? {}, { unitId });
    const contact = leadContactFromData(data);
    if (!contact.fullName && !contact.phone && !contact.email) {
      throw new BadRequestException('Enter a name, phone, or email for the lead');
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assignedToId, orgId },
        select: { id: true },
      });
      if (!assignee) {
        throw new NotFoundException('Assignee not found in this organisation');
      }
    }

    const assignedToId =
      dto.assignedToId ??
      (await this.nextRoundRobinAssignee(orgId, dto.projectId ?? null));

    const lead = await this.insertCrmLead(orgId, actor, {
      projectId: dto.projectId ?? null,
      formName: dto.formName ?? 'Manual lead',
      source: dto.source ?? 'crm',
      data,
      assignedToId,
      activityText: assignedToId
        ? 'Lead created in CRM and assigned'
        : 'Lead created in CRM',
    });

    return this.toListItem(lead);
  }

  /**
   * Bulk-create leads from CSV rows into one project or one standalone unit,
   * picked for the whole file in the import dialog. Each row is validated
   * independently — Name, Phone and Email are all required and email/phone
   * must be well-formed. Invalid rows are skipped (never written) and reported
   * with their line number; valid rows go through the same insert path as a
   * manual CRM lead. Project leads follow the project's round-robin setting;
   * standalone-unit leads are always left unassigned.
   */
  async importFromCsv(
    orgId: string,
    actor: JwtPayload,
    dto: ImportLeadsDto,
  ): Promise<LeadImportResult> {
    if (!!dto.projectId === !!dto.unitId) {
      throw new BadRequestException(
        'Select a project or a standalone unit to import these leads into',
      );
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }
    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, orgId, projectId: null },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Standalone unit not found');
    }
    const projectId = dto.projectId ?? null;

    const errors: LeadImportResult['errors'] = [];
    let created = 0;

    for (const [index, row] of dto.rows.entries()) {
      // Header is line 1, so the first data row is line 2 unless the client
      // sent the real line number (it skips blank lines).
      const rowNumber = row.rowNumber ?? index + 2;
      const name = (row.name ?? '').trim();
      const phone = (row.phone ?? '').trim();
      const email = (row.email ?? '').trim();

      const reason = importRowError({ name, phone, email });
      if (reason) {
        errors.push({ row: rowNumber, reason });
        continue;
      }

      try {
        const assignedToId = await this.nextRoundRobinAssignee(
          orgId,
          projectId,
        );
        await this.insertCrmLead(orgId, actor, {
          projectId,
          formName: 'CSV import',
          source: 'crm',
          data: normalizeLeadData(
            { fullName: name, name, phone, email },
            { unitId: dto.unitId },
          ),
          assignedToId,
          activityText: assignedToId
            ? 'Lead imported from CSV and assigned'
            : 'Lead imported from CSV',
        });
        created += 1;
      } catch {
        errors.push({
          row: rowNumber,
          reason: 'Could not be saved — please try again',
        });
      }
    }

    return {
      total: dto.rows.length,
      created,
      failed: dto.rows.length - created,
      errors,
    };
  }

  /**
   * Shared write path for CRM-created leads (manual form and CSV import). The
   * lead and its activity event are written in one transaction so a failure
   * never leaves a lead without its creation event (or reports a saved lead
   * as failed during an import).
   */
  private async insertCrmLead(
    orgId: string,
    actor: JwtPayload,
    input: {
      projectId: string | null;
      formName: string;
      source: string;
      data: Record<string, unknown>;
      assignedToId: string | null;
      activityText: string;
    },
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          orgId,
          projectId: input.projectId,
          formName: input.formName,
          source: input.source,
          data: input.data as Prisma.InputJsonValue,
          configurations: [],
          tags: [],
          assignedToId: input.assignedToId,
        },
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          project: { select: { id: true, name: true } },
        },
      });

      await tx.activityEvent.create({
        data: {
          orgId,
          agentId: actor.sub,
          leadId: lead.id,
          type: 'status_updated',
          text: input.activityText,
        },
      });

      return lead;
    });

    if (this.googleSheets) {
      void this.googleSheets
        .appendLeadRow(orgId, created, created.projectId ?? undefined)
        .catch(() => {});
    }

    return created;
  }

  /**
   * Public forms may send a landing-page id, a page slug, a Super Admin
   * template id (published/draft live or preview), or a template id that an
   * org has already published as a landing page.
   */
  private async resolvePublicLandingPage(
    ref: string,
    fallbackSlug?: string,
  ): Promise<ResolvedPublicPage | null> {
    const select = { id: true, orgId: true, status: true, content: true } as const;

    // 1. Direct match by landing page UUID
    const byId = await this.prisma.landingPage.findUnique({
      where: { id: ref },
      select,
    });
    if (byId) return byId;

    // Build candidate slugs for insensitive and path matching
    const rawCandidates = [ref, fallbackSlug]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim().toLowerCase());

    const slugVariants: string[] = [];
    for (const c of rawCandidates) {
      const clean = c.replace(/^\/p\//, '').replace(/^\//, '').replace(/\/+$/, '');
      const base = clean.replace(/(\/|-)?thank-you$/, '');
      const hyphenated = base.replace(/\s+/g, '-');
      slugVariants.push(clean, base, hyphenated, `${base}-thank-you`, `${hyphenated}-thank-you`);
    }
    const uniqueSlugs = Array.from(new Set(slugVariants.filter(Boolean)));

    // 2. Look for published landing page matching candidate slugs
    if (uniqueSlugs.length > 0) {
      const bySlug = await this.prisma.landingPage.findFirst({
        where: {
          OR: [
            ...uniqueSlugs.map((s) => ({ slug: { equals: s, mode: 'insensitive' as const } })),
            ...uniqueSlugs.map((s) => ({
              pageType: 'thank_you' as const,
              parent: { slug: { equals: s, mode: 'insensitive' as const } },
            })),
          ],
          status: 'published',
        },
        orderBy: { publishedAt: 'desc' },
        select,
      });
      if (bySlug) return bySlug;

      // 3. Draft landing page matching candidate slugs (allow testing/preview captures)
      const byDraftSlug = await this.prisma.landingPage.findFirst({
        where: {
          OR: uniqueSlugs.map((s) => ({ slug: { equals: s, mode: 'insensitive' as const } })),
        },
        orderBy: { updatedAt: 'desc' },
        select,
      });
      if (byDraftSlug) return byDraftSlug;
    }

    // 4. Organisation landing page cloned from this sourceTemplateId
    const bySourceTemplate = await this.prisma.landingPage.findFirst({
      where: {
        OR: [
          { sourceTemplateId: ref },
          ...uniqueSlugs.map((s) => ({ sourceTemplateId: s })),
          ...uniqueSlugs.map((s) => ({
            sourceTemplate: { slug: { equals: s, mode: 'insensitive' as const } },
          })),
        ],
        status: 'published',
      },
      orderBy: { publishedAt: 'desc' },
      select,
    });
    if (bySourceTemplate) return bySourceTemplate;

    const bySourceTemplateDraft = await this.prisma.landingPage.findFirst({
      where: {
        OR: [
          { sourceTemplateId: ref },
          ...uniqueSlugs.map((s) => ({ sourceTemplateId: s })),
          ...uniqueSlugs.map((s) => ({
            sourceTemplate: { slug: { equals: s, mode: 'insensitive' as const } },
          })),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select,
    });
    if (bySourceTemplateDraft) return bySourceTemplateDraft;

    // 5. Super Admin template lookup
    const template = await this.prisma.template.findFirst({
      where: {
        OR: [
          { id: ref },
          ...uniqueSlugs.map((s) => ({ slug: { equals: s, mode: 'insensitive' as const } })),
        ],
      },
      select: { id: true, status: true },
    });
    if (template) {
      // Check if any organisation has created a landing page from this template
      const orgPage = await this.prisma.landingPage.findFirst({
        where: { sourceTemplateId: template.id },
        orderBy: { updatedAt: 'desc' },
        select,
      });
      if (orgPage) return orgPage;

      // Attribute to the primary active organisation instead of black hole 'platform'
      const defaultOrg = await this.prisma.organisation.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      return {
        id: template.id,
        orgId: defaultOrg?.id ?? PLATFORM_LEAD_ORG_ID,
        status: template.status,
      };
    }

    return null;
  }

  /** Map a captured lead onto a project via linked landing page or form data. */
  private async resolveProjectId(
    orgId: string,
    landingPageId?: string | null,
    data?: Record<string, unknown>,
  ): Promise<string | null> {
    if (landingPageId) {
      const linked = await this.prisma.project.findFirst({
        where: {
          orgId,
          marketing: { path: ['landingPageId'], equals: landingPageId },
        },
        select: { id: true },
      });
      if (linked) return linked.id;
    }

    const normalized = normalizeLeadData(data ?? {});
    const projectName =
      typeof normalized.project === 'string' ? normalized.project.trim() : '';
    if (projectName) {
      const byName = await this.prisma.project.findFirst({
        where: { orgId, name: { equals: projectName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (byName) return byName.id;
    }

    return null;
  }

  private async findRecentDuplicate(
    orgId: string,
    projectId: string | null,
    data: Record<string, unknown>,
  ) {
    const contact = leadContactFromData(data);
    const or: Prisma.LeadWhereInput[] = [];
    if (contact.phone) {
      or.push({ data: { path: ['phone'], equals: contact.phone } });
    }
    if (contact.email) {
      or.push({ data: { path: ['email'], equals: contact.email } });
    }
    if (or.length === 0) return null;

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return this.prisma.lead.findFirst({
      where: {
        orgId,
        createdAt: { gte: since },
        ...(projectId ? { projectId } : {}),
        OR: or,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async nextRoundRobinAssignee(
    orgId: string,
    projectId: string | null,
  ): Promise<string | null> {
    if (!projectId) return null;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { marketing: true },
    });
    const marketing =
      project?.marketing && typeof project.marketing === 'object'
        ? (project.marketing as Record<string, unknown>)
        : {};
    if (marketing.roundRobinEnabled !== true) return null;

    const agents = await this.prisma.projectSalesAgent.findMany({
      where: { projectId, user: { orgId, status: 'active' } },
      select: { userId: true },
      orderBy: { assignedAt: 'asc' },
    });
    if (agents.length === 0) return null;

    const last =
      typeof marketing.roundRobinIndex === 'number' ? marketing.roundRobinIndex : -1;
    const next = (last + 1) % agents.length;
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        marketing: { ...marketing, roundRobinIndex: next } as Prisma.InputJsonValue,
      },
    });
    return agents[next].userId;
  }

  private async projectLeadMatch(
    orgId: string,
    projectId: string,
  ): Promise<Prisma.LeadWhereInput[]> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { name: true, marketing: true },
    });
    const match: Prisma.LeadWhereInput[] = [{ projectId }];
    const landingPageId =
      project?.marketing &&
      typeof (project.marketing as Record<string, unknown>).landingPageId ===
        'string'
        ? ((project.marketing as Record<string, unknown>).landingPageId as string)
        : null;
    if (landingPageId) {
      match.push({ landingPageId });
    }
    if (project?.name) {
      match.push({ data: { path: ['project'], equals: project.name } });
    }
    return match;
  }

  /**
   * Gate a single lead behind the same visibility rule `list()` uses — by
   * re-running the scope clauses as a real query rather than re-checking the
   * loaded row in memory, so the by-id path can never drift from the list
   * path. A lead the caller may not see 404s (same as a non-existent id).
   */
  private async assertCanAccessLead(
    orgId: string,
    leadId: string,
    actor: JwtPayload,
  ) {
    if (canSeeAllLeads(actor.roles)) return;
    const scope = await actorLeadOrClauses(this.prisma, orgId, actor.sub);
    const visible = await this.prisma.lead.count({
      where: { id: leadId, orgId, OR: scope },
    });
    if (visible === 0) {
      throw new NotFoundException('Lead not found');
    }
  }

  private async buildListWhere(
    orgId: string,
    actor: JwtPayload,
    query: ListLeadsQueryDto,
  ): Promise<Prisma.LeadWhereInput> {
    const and: Prisma.LeadWhereInput[] = [{ orgId }];

    if (query.projectId) {
      and.push({ OR: await this.projectLeadMatch(orgId, query.projectId) });
    }
    if (query.status) and.push({ status: query.status as never });
    if (query.source) and.push({ source: query.source });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });

    if (query.search) {
      const s = query.search.trim();
      if (s) {
        and.push({
          OR: [
            { formName: { contains: s, mode: 'insensitive' } },
            { source: { contains: s, mode: 'insensitive' } },
            { data: { path: ['fullName'], string_contains: s } },
            { data: { path: ['name'], string_contains: s } },
            { data: { path: ['Name'], string_contains: s } },
            { data: { path: ['Full Name'], string_contains: s } },
            { data: { path: ['phone'], string_contains: s } },
            { data: { path: ['Phone'], string_contains: s } },
            { data: { path: ['email'], string_contains: s } },
          ],
        });
      }
    }

    if (!canSeeAllLeads(actor.roles ?? [])) {
      and.push({ OR: await actorLeadOrClauses(this.prisma, orgId, actor.sub) });
    }

    return and.length === 1 ? { orgId } : { AND: and };
  }

  /**
   * Org-scoped list for the CRM/lead inbox. Admins see every lead in the org;
   * other roles are restricted to assigned leads or projects they manage/are on.
   */
  async list(orgId: string, actor: JwtPayload, query: ListLeadsQueryDto = {}) {
    const where = await this.buildListWhere(orgId, actor, query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const kpiWhere = query.status
      ? await this.buildListWhere(orgId, actor, { ...query, status: undefined })
      : where;

    const [leads, total, kpiTotal, unassigned, byStatus] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          project: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: kpiWhere }),
      this.prisma.lead.count({
        where: { AND: [kpiWhere, { assignedToId: null }] },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: kpiWhere,
        _count: { _all: true },
      }),
    ]);

    const statusCount = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    const [teams, projectAgents, unitAgents] = await Promise.all([
      this.projectTeamsByProject(
        leads.filter((l) => !l.assignedToId).map((l) => l.projectId),
      ),
      this.projectAgentsByProject(
        orgId,
        leads.map((l) => l.projectId),
      ),
      this.standaloneUnitAgentsByUnit(
        orgId,
        leads.filter((l) => !l.projectId).map((l) => leadUnitId(l.data)),
      ),
    ]);

    return {
      data: leads.map((lead) => ({
        ...this.toListItem(lead),
        projectTeam: this.projectTeamFor(lead, teams),
        assignableAgents: this.assignableAgentsFor(lead, projectAgents, unitAgents),
      })),
      total,
      page,
      limit,
      stats: {
        total: kpiTotal,
        unassigned,
        new: statusCount('new'),
        followUp: statusCount('follow_up'),
        siteVisit: statusCount('site_visit'),
        won: statusCount('won'),
      },
    };
  }

  async getById(orgId: string, leadId: string, actor: JwtPayload) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, orgId },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        project: { select: { id: true, name: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            type: true,
            text: true,
            createdAt: true,
            agent: ACTOR_SELECT,
          },
        },
        callLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            direction: true,
            outcome: true,
            durationSeconds: true,
            createdAt: true,
            agent: ACTOR_SELECT,
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    await this.assertCanAccessLead(orgId, leadId, actor);

    const teams = await this.projectTeamsByProject([
      lead.assignedToId ? null : lead.projectId,
    ]);

    return {
      ...this.toListItem(lead),
      ...this.leadEditFields(lead),
      projectTeam: this.projectTeamFor(lead, teams),
      activities: lead.activities.map(toActivity),
      callLogs: lead.callLogs.map((call) => ({
        id: call.id,
        direction: call.direction,
        outcome: call.outcome,
        durationSeconds: call.durationSeconds,
        createdAt: call.createdAt,
        actor: toActor(call.agent ?? null),
      })),
      nextAction: lead.nextActionType
        ? {
            type: lead.nextActionType,
            scheduledAt: lead.nextActionAt,
            note: lead.nextActionNote,
            reminderAt: lead.reminderAt,
          }
        : null,
    };
  }

  /**
   * The structured CRM edit-form columns, shaped for the API. BigInt budgets
   * become plain numbers (rupee amounts are well within Number range).
   */
  private leadEditFields(lead: {
    altName: string | null;
    altPhone: string | null;
    whatsapp: string | null;
    city: string | null;
    budgetMin: bigint | null;
    budgetMax: bigint | null;
    configurations: string[];
    purpose: string | null;
    financing: string | null;
    loanStatus: string | null;
    timelineToBuy: string | null;
    preferredFloor: string | null;
    facing: string | null;
    parking: string | null;
    requirementNotes: string | null;
    campaign: string | null;
    medium?: string | null;
    campaignId?: string | null;
    adSet?: string | null;
    adSetId?: string | null;
    ad?: string | null;
    adId?: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm?: string | null;
    utmContent?: string | null;
    landingPageUrl?: string | null;
    landingPage?: string | null;
    platform?: string | null;
    referrer?: string | null;
    firstTouchSource?: string | null;
    lastTouchSource?: string | null;
    fbclid?: string | null;
    gclid?: string | null;
    temperature: string | null;
    tags: string[];
    consentWhatsapp: boolean;
    consentCall: boolean;
    consentEmail: boolean;
  }) {
    return {
      altName: lead.altName,
      altPhone: lead.altPhone,
      whatsapp: lead.whatsapp,
      city: lead.city,
      budgetMin: lead.budgetMin == null ? null : Number(lead.budgetMin),
      budgetMax: lead.budgetMax == null ? null : Number(lead.budgetMax),
      configurations: lead.configurations,
      purpose: lead.purpose,
      financing: lead.financing,
      loanStatus: lead.loanStatus,
      timelineToBuy: lead.timelineToBuy,
      preferredFloor: lead.preferredFloor,
      facing: lead.facing,
      parking: lead.parking,
      requirementNotes: lead.requirementNotes,
      campaign: lead.campaign,
      medium: lead.medium ?? null,
      campaignId: lead.campaignId ?? null,
      adSet: lead.adSet ?? null,
      adSetId: lead.adSetId ?? null,
      ad: lead.ad ?? null,
      adId: lead.adId ?? null,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      utmTerm: lead.utmTerm ?? null,
      utmContent: lead.utmContent ?? null,
      landingPageUrl: lead.landingPageUrl ?? null,
      landingPage: lead.landingPage ?? null,
      platform: lead.platform ?? null,
      referrer: lead.referrer ?? null,
      firstTouchSource: lead.firstTouchSource ?? null,
      lastTouchSource: lead.lastTouchSource ?? null,
      fbclid: lead.fbclid ?? null,
      gclid: lead.gclid ?? null,
      temperature: lead.temperature,
      tags: lead.tags,
      consentWhatsapp: lead.consentWhatsapp,
      consentCall: lead.consentCall,
      consentEmail: lead.consentEmail,
    };
  }

  /**
   * Full lead edit form (lead edit page). Writes the structured columns and
   * merges contact name/phone/email back into the capture `data` blob. Pipeline
   * `status` is intentionally not handled here — it keeps its note-required path
   * in `assign`. An activity entry is written, attributed to the editor, so the
   * change shows up (correctly attributed) on the timeline.
   */
  async update(
    orgId: string,
    leadId: string,
    actor: JwtPayload,
    dto: UpdateLeadDto,
  ) {
    const existing = await this.prisma.lead.findFirst({
      where: { id: leadId, orgId },
    });
    if (!existing) throw new NotFoundException('Lead not found');
    await this.assertCanAccessLead(orgId, leadId, actor);

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    let assignee: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null = null;
    if (dto.assignedToId != null) {
      assignee = await this.prisma.user.findFirst({
        where: { id: dto.assignedToId, orgId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (!assignee) {
        throw new NotFoundException('Assignee not found in this organisation');
      }
    }

    // Merge contact fields into the raw capture blob without disturbing other
    // submitted values.
    const currentData =
      existing.data && typeof existing.data === 'object'
        ? (existing.data as Record<string, unknown>)
        : {};
    let data = currentData;
    if (dto.contact) {
      const merged = { ...currentData };
      if (dto.contact.fullName !== undefined) {
        merged.fullName = dto.contact.fullName;
        merged.name = dto.contact.fullName;
      }
      if (dto.contact.phone !== undefined) {
        merged.phone = dto.contact.phone;
        merged.phoneNumber = dto.contact.phone;
      }
      if (dto.contact.email !== undefined) merged.email = dto.contact.email;
      data = normalizeLeadData(merged);
    }

    const has = <K extends keyof UpdateLeadDto>(key: K): boolean =>
      Object.prototype.hasOwnProperty.call(dto, key) === true;
    const bignum = (v: number | null | undefined) =>
      v == null ? null : BigInt(Math.trunc(v));

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        ...(dto.contact ? { data: data as Prisma.InputJsonValue } : {}),
        ...(has('altName') ? { altName: dto.altName ?? null } : {}),
        ...(has('altPhone') ? { altPhone: dto.altPhone ?? null } : {}),
        ...(has('whatsapp') ? { whatsapp: dto.whatsapp ?? null } : {}),
        ...(has('city') ? { city: dto.city ?? null } : {}),
        ...(has('tags') ? { tags: dto.tags ?? [] } : {}),
        ...(has('configurations')
          ? { configurations: dto.configurations ?? [] }
          : {}),
        ...(has('budgetMin') ? { budgetMin: bignum(dto.budgetMin) } : {}),
        ...(has('budgetMax') ? { budgetMax: bignum(dto.budgetMax) } : {}),
        ...(has('purpose') ? { purpose: dto.purpose ?? null } : {}),
        ...(has('financing') ? { financing: dto.financing ?? null } : {}),
        ...(has('loanStatus') ? { loanStatus: dto.loanStatus ?? null } : {}),
        ...(has('timelineToBuy')
          ? { timelineToBuy: dto.timelineToBuy ?? null }
          : {}),
        ...(has('preferredFloor')
          ? { preferredFloor: dto.preferredFloor ?? null }
          : {}),
        ...(has('facing') ? { facing: dto.facing ?? null } : {}),
        ...(has('parking') ? { parking: dto.parking ?? null } : {}),
        ...(has('requirementNotes')
          ? { requirementNotes: dto.requirementNotes ?? null }
          : {}),
        ...(has('projectId') ? { projectId: dto.projectId ?? null } : {}),
        ...(has('source') ? { source: dto.source ?? null } : {}),
        ...(has('campaign') ? { campaign: dto.campaign ?? null } : {}),
        ...(has('medium') ? { medium: dto.medium ?? null } : {}),
        ...(has('campaignId') ? { campaignId: dto.campaignId ?? null } : {}),
        ...(has('adSet') ? { adSet: dto.adSet ?? null } : {}),
        ...(has('adSetId') ? { adSetId: dto.adSetId ?? null } : {}),
        ...(has('ad') ? { ad: dto.ad ?? null } : {}),
        ...(has('adId') ? { adId: dto.adId ?? null } : {}),
        ...(has('utmSource') ? { utmSource: dto.utmSource ?? null } : {}),
        ...(has('utmMedium') ? { utmMedium: dto.utmMedium ?? null } : {}),
        ...(has('utmCampaign') ? { utmCampaign: dto.utmCampaign ?? null } : {}),
        ...(has('utmTerm') ? { utmTerm: dto.utmTerm ?? null } : {}),
        ...(has('utmContent') ? { utmContent: dto.utmContent ?? null } : {}),
        ...(has('landingPageUrl')
          ? { landingPageUrl: dto.landingPageUrl ?? null }
          : {}),
        ...(has('fbclid') ? { fbclid: dto.fbclid ?? null } : {}),
        ...(has('gclid') ? { gclid: dto.gclid ?? null } : {}),
        ...(has('temperature') ? { temperature: dto.temperature ?? null } : {}),
        ...(has('assignedToId')
          ? { assignedToId: dto.assignedToId ?? null }
          : {}),
        ...(has('consentWhatsapp')
          ? { consentWhatsapp: dto.consentWhatsapp ?? false }
          : {}),
        ...(has('consentCall')
          ? { consentCall: dto.consentCall ?? false }
          : {}),
        ...(has('consentEmail')
          ? { consentEmail: dto.consentEmail ?? false }
          : {}),
      },
    });

    // One timeline entry for the edit, plus a distinct assignment line when the
    // owner actually changed (mirrors `assign`'s wording).
    const parts: string[] = [];
    if (
      has('assignedToId') &&
      (dto.assignedToId ?? null) !== existing.assignedToId
    ) {
      const name = assignee
        ? [assignee.firstName, assignee.lastName].filter(Boolean).join(' ') ||
          assignee.email
        : 'Unassigned';
      parts.push(`Assigned to ${name}`);
    }
    parts.push('Lead details updated');
    await this.prisma.activityEvent.create({
      data: {
        orgId,
        agentId: actor.sub,
        leadId,
        type: 'status_updated',
        text: parts.join(' · '),
      },
    });

    return this.getById(orgId, updated.id, actor);
  }

  async addNote(
    orgId: string,
    leadId: string,
    actor: JwtPayload,
    dto: CreateLeadNoteDto,
  ) {
    await this.getById(orgId, leadId, actor);
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Note cannot be empty');
    const activity = await this.prisma.activityEvent.create({
      data: { orgId, agentId: actor.sub, leadId, type: 'note_added', text },
      select: {
        id: true,
        type: true,
        text: true,
        createdAt: true,
        agent: ACTOR_SELECT,
      },
    });
    return toActivity(activity);
  }

  async updateNextAction(
    orgId: string,
    leadId: string,
    actor: JwtPayload,
    dto: UpdateLeadNextActionDto,
  ) {
    await this.getById(orgId, leadId, actor);
    const current = await this.prisma.lead.findFirst({
      where: { id: leadId, orgId },
      select: { nextActionAt: true },
    });
    const scheduledAt = new Date(dto.scheduledAt);
    const reminderAt = dto.reminderAt ? new Date(dto.reminderAt) : null;
    if (Number.isNaN(scheduledAt.getTime()) || (reminderAt && Number.isNaN(reminderAt.getTime()))) {
      throw new BadRequestException('Invalid action or reminder date');
    }
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        nextActionType: dto.actionType,
        nextActionAt: scheduledAt,
        nextActionNote: dto.note?.trim() || null,
        reminderAt,
      },
      select: { nextActionType: true, nextActionAt: true, nextActionNote: true, reminderAt: true },
    });
    const kind = dto.actionType === 'site_visit' ? 'Site visit' : 'Follow-up';
    const verb = current?.nextActionAt ? 'updated' : 'scheduled';
    const note = dto.note?.trim();
    const activity = await this.prisma.activityEvent.create({
      data: {
        orgId,
        agentId: actor.sub,
        leadId,
        type: dto.actionType === 'site_visit' ? 'site_visit_booked' : 'status_updated',
        text: `Next action ${verb}: ${kind} on ${scheduledAt.toLocaleString('en-IN')}${note ? ` — ${note}` : ''}${reminderAt ? ` · reminder ${reminderAt.toLocaleString('en-IN')}` : ''}`,
      },
      select: {
        id: true,
        type: true,
        text: true,
        createdAt: true,
        agent: ACTOR_SELECT,
      },
    });

    return {
      type: updated.nextActionType,
      scheduledAt: updated.nextActionAt,
      note: updated.nextActionNote,
      reminderAt: updated.reminderAt,
      activity: toActivity(activity),
    };
  }

  /**
   * (Re)assign a lead to an org member and optionally move its CRM stage.
   * Caller must already be able to see the lead.
   */
  async assign(orgId: string, leadId: string, dto: AssignLeadDto, actor: JwtPayload) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, orgId },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    await this.assertCanAccessLead(orgId, leadId, actor);

    if (dto.assignedToId != null) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assignedToId, orgId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (!assignee) {
        throw new NotFoundException('Assignee not found in this organisation');
      }
    }

    if (dto.status && dto.status !== lead.status && !dto.note?.trim()) {
      throw new BadRequestException('A note is required when changing pipeline status');
    }

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        assignedToId: dto.assignedToId ?? null,
        ...(dto.status ? { status: dto.status as never } : {}),
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        project: { select: { id: true, name: true } },
      },
    });

    const assigneeName = updated.assignedTo
      ? [updated.assignedTo.firstName, updated.assignedTo.lastName]
          .filter(Boolean)
          .join(' ') || updated.assignedTo.email
      : 'Unassigned';
    const parts: string[] = [];
    if (lead.assignedToId !== updated.assignedToId) {
      parts.push(`Assigned to ${assigneeName}`);
    }
    if (dto.status && dto.status !== lead.status) {
      parts.push(
        `Status changed from ${lead.status.replaceAll('_', ' ')} to ${dto.status.replaceAll('_', ' ')} — ${dto.note!.trim()}`,
      );
    }
    let activity: ReturnType<typeof toActivity> | null = null;
    if (parts.length > 0) {
      const row = await this.prisma.activityEvent.create({
        data: {
          orgId,
          agentId: actor.sub,
          leadId,
          type: 'status_updated',
          text: parts.join(' · '),
        },
        select: {
          id: true,
          type: true,
          text: true,
          createdAt: true,
          agent: ACTOR_SELECT,
        },
      });
      activity = toActivity(row);
    }

    return { ...this.toListItem(updated), activity };
  }

  /**
   * Org members eligible to hold a lead — one shared rule (permission-based)
   * used by this picker and the project Sales Agent picker alike. See
   * listLeadAssignableUsers.
   */
  async listAssignableUsers(orgId: string) {
    const data = await listLeadAssignableUsers(this.prisma, orgId);
    return { data, total: data.length };
  }

  /**
   * Sales-agent roster for a set of projects. Used to show "Project team" on a
   * lead that has a project but no individual assignee — those agents can all
   * see it, nobody owns it. Purely derived, never written to Lead.assignedToId.
   */
  private async projectTeamsByProject(
    projectIds: Array<string | null | undefined>,
  ): Promise<Map<string, { count: number; names: string[] }>> {
    const map = new Map<string, { count: number; names: string[] }>();
    const ids = [...new Set(projectIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return map;
    const rows = await this.prisma.projectSalesAgent.findMany({
      where: { projectId: { in: ids } },
      select: {
        projectId: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });
    for (const row of rows) {
      const name =
        [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
        row.user.email;
      const entry = map.get(row.projectId) ?? { count: 0, names: [] };
      entry.count += 1;
      entry.names.push(name);
      map.set(row.projectId, entry);
    }
    return map;
  }

  /**
   * Active sales agents per project — the people a project lead can be
   * assigned to from the CRM list. Leads without a project aren't looked up
   * here; they fall back to the org-wide assignable list.
   */
  private async projectAgentsByProject(
    orgId: string,
    projectIds: Array<string | null | undefined>,
  ): Promise<Map<string, Array<{ id: string; name: string }>>> {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    const ids = [...new Set(projectIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return map;
    const rows = await this.prisma.projectSalesAgent.findMany({
      where: { projectId: { in: ids }, user: { orgId, status: 'active' } },
      select: {
        projectId: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });
    for (const id of ids) map.set(id, []);
    for (const row of rows) {
      map.get(row.projectId)?.push({
        id: row.user.id,
        name:
          [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
          row.user.email,
      });
    }
    return map;
  }

  /**
   * A standalone unit's own team (UnitSalesAgent), for leads on units with no
   * project. Units with nobody on the team are left out of the map.
   */
  private async standaloneUnitAgentsByUnit(
    orgId: string,
    unitIds: Array<string | null>,
  ): Promise<Map<string, Array<{ id: string; name: string }>>> {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    const ids = [...new Set(unitIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return map;
    const rows = await this.prisma.unitSalesAgent.findMany({
      where: {
        unitId: { in: ids },
        unit: { orgId, projectId: null },
        user: { orgId, status: 'active' },
      },
      select: {
        unitId: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });
    for (const row of rows) {
      const list = map.get(row.unitId) ?? [];
      list.push({
        id: row.user.id,
        name:
          [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
          row.user.email,
      });
      map.set(row.unitId, list);
    }
    return map;
  }

  /**
   * Who a lead can be assigned to from the CRM list: its project's sales
   * agents, or a standalone unit's team. Null means "no restriction" — the
   * client offers the org-wide assignable list (no project, or a standalone
   * unit with nobody on its team).
   */
  private assignableAgentsFor(
    lead: { projectId?: string | null; data: unknown },
    projectAgents: Map<string, Array<{ id: string; name: string }>>,
    unitAgents: Map<string, Array<{ id: string; name: string }>>,
  ): Array<{ id: string; name: string }> | null {
    if (lead.projectId) return projectAgents.get(lead.projectId) ?? [];
    const unitId = leadUnitId(lead.data);
    return (unitId && unitAgents.get(unitId)) || null;
  }

  /** `projectTeam` for one lead, or null when it has an owner / no project. */
  private projectTeamFor(
    lead: { assignedToId?: string | null; projectId?: string | null },
    teams: Map<string, { count: number; names: string[] }>,
  ): { count: number; names: string[] } | null {
    if (lead.assignedToId || !lead.projectId) return null;
    return teams.get(lead.projectId) ?? null;
  }

  private toListItem(lead: {
    id: string;
    orgId: string;
    landingPageId?: string | null;
    projectId?: string | null;
    project?: { id: string; name: string } | null;
    formName: string | null;
    source: string | null;
    platform?: string | null;
    medium?: string | null;
    campaign?: string | null;
    campaignId?: string | null;
    adSet?: string | null;
    ad?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    landingPageUrl?: string | null;
    data: unknown;
    status: string;
    assignedTo?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
    createdAt: Date;
  }) {
    const data =
      lead.data && typeof lead.data === 'object' && !Array.isArray(lead.data)
        ? normalizeLeadData(lead.data as Record<string, unknown>)
        : lead.data;

    return {
      id: lead.id,
      orgId: lead.orgId,
      landingPageId: lead.landingPageId ?? null,
      projectId: lead.projectId ?? null,
      project: lead.project ?? null,
      formName: lead.formName,
      source: lead.source,
      platform: lead.platform ?? null,
      medium: lead.medium ?? null,
      campaign: lead.campaign ?? null,
      campaignId: lead.campaignId ?? null,
      adSet: lead.adSet ?? null,
      ad: lead.ad ?? null,
      utmSource: lead.utmSource ?? null,
      utmMedium: lead.utmMedium ?? null,
      utmCampaign: lead.utmCampaign ?? null,
      landingPageUrl: lead.landingPageUrl ?? null,
      data,
      status: lead.status,
      assignedTo: lead.assignedTo
        ? {
            id: lead.assignedTo.id,
            name:
              [lead.assignedTo.firstName, lead.assignedTo.lastName]
                .filter(Boolean)
                .join(' ') || lead.assignedTo.email,
          }
        : null,
      createdAt: lead.createdAt,
    };
  }
}
