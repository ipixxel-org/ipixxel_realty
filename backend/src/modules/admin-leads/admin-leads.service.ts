import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../email/email.service';
import { normalizeLeadData } from '../../common/utils/lead-data.util';
import { generateTempPassword } from '../../common/utils/tokens.util';
import { generateUniqueOrgSlug } from '../../common/utils/slug.util';
import {
  runTeamChatHook,
  teamChatUserActivated,
} from '../../common/utils/team-chat-membership.util';
import type { ListAdminLeadsQueryDto } from './dto/list-admin-leads-query.dto';
import {
  ADMIN_LEAD_STATUSES,
  type AdminLeadStatus,
  type UpdateAdminLeadStatusDto,
} from './dto/update-admin-lead-status.dto';
import type { CreateAdminLeadRemarkDto } from './dto/create-admin-lead-remark.dto';
import type { UpdateAdminLeadFollowUpDto } from './dto/update-admin-lead-follow-up.dto';
import type { ConvertLeadToOrgDto } from './dto/convert-lead-to-org.dto';

const STATUS_LABEL: Record<AdminLeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  connected: 'Connected',
  follow_up: 'Follow-up',
  interested: 'Interested',
  not_interested: 'Not Interested',
  converted: 'Converted',
  lost: 'Lost',
};

/**
 * The org CRM still uses three legacy stage keys. Lead Management has a fixed
 * eight-stage vocabulary, so those rows are presented under their canonical
 * stage and filters expand to include both values.
 */
const STATUS_ALIASES: Record<AdminLeadStatus, LeadStatus[]> = {
  new: ['new'],
  contacted: ['contacted'],
  connected: ['connected'],
  follow_up: ['follow_up', 'site_visit'],
  interested: ['interested', 'negotiation'],
  not_interested: ['not_interested'],
  converted: ['converted', 'won'],
  lost: ['lost'],
};

const LEGACY_STATUS_MAP: Partial<Record<string, AdminLeadStatus>> = {
  site_visit: 'follow_up',
  negotiation: 'interested',
  won: 'converted',
  completed: 'converted',
};

const ACTOR_SELECT = {
  select: { id: true, firstName: true, lastName: true, email: true },
} as const;

const ACTIVITY_SELECT = {
  id: true,
  type: true,
  text: true,
  createdAt: true,
  agent: ACTOR_SELECT,
} as const;

type ActorRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
} | null;

function normalizeStatus(status: string): AdminLeadStatus {
  if (ADMIN_LEAD_STATUSES.includes(status as AdminLeadStatus)) {
    return status as AdminLeadStatus;
  }
  return LEGACY_STATUS_MAP[status as LeadStatus] ?? 'new';
}

function toActor(user: ActorRow) {
  if (!user) return null;
  return {
    id: user.id,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
  };
}

function toActivity(row: {
  id: string;
  type: string;
  text: string;
  createdAt: Date;
  agent?: ActorRow;
}) {
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    createdAt: row.createdAt,
    actor: toActor(row.agent ?? null),
  };
}

@Injectable()
export class AdminLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private async buildWhere(
    query: ListAdminLeadsQueryDto,
  ): Promise<Prisma.LeadWhereInput> {
    const and: Prisma.LeadWhereInput[] = [];

    // Super Admin Lead Management only displays leads captured via Lead Forms builder
    // (platform LeadForms / embed forms / platform-owned captures), NOT internal tenant CRM / marketing leads.
    const platformForms = await this.prisma.leadForm.findMany({
      where: { orgId: null },
      select: { name: true, content: true },
    });
    const platformFormNames = platformForms.map((f) => f.name).filter(Boolean);
    const platformEmbedIds = platformForms
      .map(
        (f) =>
          (f.content as Record<string, unknown> | null)?.embed as
            { id?: string } | undefined,
      )
      .map((e) => e?.id)
      .filter((id): id is string => Boolean(id));

    const formBuilderOr: Prisma.LeadWhereInput[] = [
      { landingPageId: { startsWith: 'embed_' } },
      { orgId: 'platform' },
      { source: { in: ['embed', 'form_builder', 'iframe', 'Form Builder'] } },
    ];
    if (platformFormNames.length) {
      formBuilderOr.push({ formName: { in: platformFormNames } });
    }
    for (const emb of platformEmbedIds) {
      formBuilderOr.push({ landingPageId: `embed_${emb}` });
    }
    and.push({ OR: formBuilderOr });

    if (query.formName?.trim()) {
      and.push({ formName: query.formName.trim() });
    }
    if (query.orgId) and.push({ orgId: query.orgId });
    if (query.projectId) and.push({ projectId: query.projectId });
    if (query.status) {
      and.push({
        status: { in: STATUS_ALIASES[normalizeStatus(query.status)] },
      });
    }
    if (query.source?.trim()) and.push({ source: query.source.trim() });

    if (query.search?.trim()) {
      const s = query.search.trim();
      and.push({
        OR: [
          { formName: { contains: s, mode: 'insensitive' } },
          { source: { contains: s, mode: 'insensitive' } },
          { altName: { contains: s, mode: 'insensitive' } },
          { altPhone: { contains: s, mode: 'insensitive' } },
          { whatsapp: { contains: s, mode: 'insensitive' } },
          { city: { contains: s, mode: 'insensitive' } },
          { campaign: { contains: s, mode: 'insensitive' } },
          { utmSource: { contains: s, mode: 'insensitive' } },
          { data: { path: ['fullName'], string_contains: s } },
          { data: { path: ['name'], string_contains: s } },
          { data: { path: ['Name'], string_contains: s } },
          { data: { path: ['Full Name'], string_contains: s } },
          { data: { path: ['phone'], string_contains: s } },
          { data: { path: ['Phone'], string_contains: s } },
          { data: { path: ['email'], string_contains: s } },
          { data: { path: ['Email'], string_contains: s } },
        ],
      });
    }

    return and.length ? { AND: and } : {};
  }

  private orderBy(
    query: ListAdminLeadsQueryDto,
  ): Prisma.LeadOrderByWithRelationInput {
    const direction = query.sortDir ?? 'desc';
    switch (query.sortBy) {
      case 'status':
        return { status: direction };
      case 'source':
        return { source: direction };
      case 'formName':
        return { formName: direction };
      default:
        return { createdAt: direction };
    }
  }

  async list(query: ListAdminLeadsQueryDto) {
    const where = await this.buildWhere(query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const kpiWhere = query.status
      ? await this.buildWhere({ ...query, status: undefined })
      : where;

    const [
      leads,
      total,
      kpiTotal,
      unassigned,
      followUpsDue,
      todayCount,
      byStatus,
      bySource,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: this.orderBy(query),
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
      this.prisma.lead.count({
        where: {
          AND: [
            kpiWhere,
            { nextActionAt: { lte: now } },
            {
              status: { notIn: ['converted', 'won', 'lost', 'not_interested'] },
            },
          ],
        },
      }),
      this.prisma.lead.count({
        where: { AND: [kpiWhere, { createdAt: { gte: today } }] },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: kpiWhere,
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['source'],
        where: kpiWhere,
        _count: { _all: true },
      }),
    ]);

    const orgIds = [...new Set(leads.map((l) => l.orgId).filter(Boolean))];
    const orgs = orgIds.length
      ? await this.prisma.organisation.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const orgById = new Map(orgs.map((o) => [o.id, o]));

    const statusCounts = Object.fromEntries(
      ADMIN_LEAD_STATUSES.map((status) => [status, 0]),
    ) as Record<AdminLeadStatus, number>;
    for (const row of byStatus) {
      statusCounts[normalizeStatus(row.status)] += row._count._all;
    }

    return {
      data: leads.map((lead) => {
        const rawData =
          lead.data && typeof lead.data === 'object' && !Array.isArray(lead.data)
            ? (lead.data as Record<string, unknown>)
            : null;
        const convertedOrg = rawData?.convertedOrgId
          ? {
              id: String(rawData.convertedOrgId),
              name: String(rawData.convertedOrgName || 'Organisation'),
              convertedAt: rawData.convertedAt ? String(rawData.convertedAt) : null,
            }
          : null;
        const data =
          lead.data &&
          typeof lead.data === 'object' &&
          !Array.isArray(lead.data)
            ? normalizeLeadData(lead.data)
            : lead.data;
        const org = orgById.get(lead.orgId) ?? null;
        const status = normalizeStatus(lead.status);
        return {
          id: lead.id,
          orgId: lead.orgId,
          organisation: org
            ? { id: org.id, name: org.name, slug: org.slug }
            : lead.orgId === 'platform'
              ? {
                  id: 'platform',
                  name: 'Platform (Super Admin)',
                  slug: 'platform',
                }
              : null,
          landingPageId: lead.landingPageId ?? null,
          projectId: lead.projectId ?? null,
          project: lead.project ?? null,
          formName: lead.formName,
          source: lead.source,
          platform: lead.platform ?? null,
          data,
          convertedOrg,
          status,
          legacyStatus: status !== lead.status ? lead.status : null,
          assignedTo: lead.assignedTo
            ? {
                id: lead.assignedTo.id,
                name:
                  [lead.assignedTo.firstName, lead.assignedTo.lastName]
                    .filter(Boolean)
                    .join(' ') || lead.assignedTo.email,
              }
            : null,
          nextAction: lead.nextActionAt
            ? {
                type: lead.nextActionType,
                scheduledAt: lead.nextActionAt,
                note: lead.nextActionNote,
                reminderAt: lead.reminderAt,
                overdue: lead.nextActionAt.getTime() < now.getTime(),
              }
            : null,
          createdAt: lead.createdAt,
        };
      }),
      total,
      page,
      limit,
      stats: {
        total: kpiTotal,
        unassigned,
        followUpsDue,
        today: todayCount,
        conversionRate:
          kpiTotal > 0
            ? Math.round((statusCounts.converted / kpiTotal) * 1000) / 10
            : 0,
        byStatus: statusCounts,
        topSources: bySource
          .filter((row) => row.source)
          .map((row) => ({
            source: row.source as string,
            count: row._count._all,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      },
    };
  }

  async meta() {
    const [orgIdRows, sourceRows, projectIdRows, platformForms] =
      await Promise.all([
        this.prisma.lead.findMany({
          distinct: ['orgId'],
          select: { orgId: true },
        }),
        this.prisma.lead.findMany({
          distinct: ['source'],
          where: { source: { not: null } },
          select: { source: true },
          orderBy: { source: 'asc' },
          take: 50,
        }),
        this.prisma.lead.findMany({
          distinct: ['projectId'],
          where: { projectId: { not: null } },
          select: { projectId: true },
        }),
        this.prisma.leadForm.findMany({
          where: { orgId: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    const orgIds = orgIdRows.map((r) => r.orgId).filter(Boolean);
    const projectIds = projectIdRows
      .map((r) => r.projectId)
      .filter((id): id is string => Boolean(id));

    const [orgs, projects] = await Promise.all([
      orgIds.length
        ? this.prisma.organisation.findMany({
            where: { id: { in: orgIds } },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, slug: true },
          })
        : Promise.resolve([]),
      projectIds.length
        ? this.prisma.project.findMany({
            where: { id: { in: projectIds } },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      organisations: [
        ...orgs,
        ...(orgIds.includes('platform')
          ? [
              {
                id: 'platform',
                name: 'Platform (Super Admin)',
                slug: 'platform',
              },
            ]
          : []),
      ],
      projects,
      forms: platformForms.map((f) => ({ id: f.id, name: f.name })),
      sources: sourceRows
        .map((r) => r.source)
        .filter((s): s is string => Boolean(s)),
      statuses: [...ADMIN_LEAD_STATUSES],
    };
  }

  async getById(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        project: { select: { id: true, name: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: ACTIVITY_SELECT,
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

    const org = await this.prisma.organisation.findUnique({
      where: { id: lead.orgId },
      select: { id: true, name: true, slug: true },
    });
    const status = normalizeStatus(lead.status);
    const rawData =
      lead.data && typeof lead.data === 'object' && !Array.isArray(lead.data)
        ? (lead.data as Record<string, unknown>)
        : null;
    const convertedOrg = rawData?.convertedOrgId
      ? {
          id: String(rawData.convertedOrgId),
          name: String(rawData.convertedOrgName || 'Organisation'),
          convertedAt: rawData.convertedAt ? String(rawData.convertedAt) : null,
        }
      : null;
    const data =
      lead.data && typeof lead.data === 'object' && !Array.isArray(lead.data)
        ? normalizeLeadData(lead.data)
        : lead.data;

    return {
      id: lead.id,
      orgId: lead.orgId,
      organisation: org
        ? { id: org.id, name: org.name, slug: org.slug }
        : lead.orgId === 'platform'
          ? { id: 'platform', name: 'Platform (Super Admin)', slug: 'platform' }
          : null,
      landingPageId: lead.landingPageId ?? null,
      landingPageUrl: lead.landingPageUrl ?? null,
      projectId: lead.projectId ?? null,
      project: lead.project ?? null,
      formName: lead.formName,
      source: lead.source,
      platform: lead.platform ?? null,
      data,
      convertedOrg,
      status,
      legacyStatus: status !== lead.status ? lead.status : null,
      assignedTo: lead.assignedTo
        ? {
            id: lead.assignedTo.id,
            name:
              [lead.assignedTo.firstName, lead.assignedTo.lastName]
                .filter(Boolean)
                .join(' ') || lead.assignedTo.email,
            email: lead.assignedTo.email,
          }
        : null,
      createdAt: lead.createdAt,
      nextAction: lead.nextActionAt
        ? {
            type: lead.nextActionType,
            scheduledAt: lead.nextActionAt,
            note: lead.nextActionNote,
            reminderAt: lead.reminderAt,
            overdue: lead.nextActionAt.getTime() < Date.now(),
          }
        : null,
      details: {
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
        temperature: lead.temperature,
        tags: lead.tags,
        consentWhatsapp: lead.consentWhatsapp,
        consentCall: lead.consentCall,
        consentEmail: lead.consentEmail,
      },
      attribution: {
        campaign: lead.campaign,
        medium: lead.medium,
        campaignId: lead.campaignId,
        adSet: lead.adSet,
        adSetId: lead.adSetId,
        ad: lead.ad,
        adId: lead.adId,
        utmSource: lead.utmSource,
        utmMedium: lead.utmMedium,
        utmCampaign: lead.utmCampaign,
        utmTerm: lead.utmTerm,
        utmContent: lead.utmContent,
        referrer: lead.referrer,
        fbclid: lead.fbclid,
        gclid: lead.gclid,
        firstTouchSource: lead.firstTouchSource,
        lastTouchSource: lead.lastTouchSource,
      },
      activities: lead.activities.map(toActivity),
      callLogs: lead.callLogs.map((call) => ({
        id: call.id,
        direction: call.direction,
        outcome: call.outcome,
        durationSeconds: call.durationSeconds,
        createdAt: call.createdAt,
        actor: toActor(call.agent ?? null),
      })),
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateAdminLeadStatusDto,
    actorId: string,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, orgId: true, status: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const previous = normalizeStatus(lead.status);
    const next = normalizeStatus(dto.status);
    const remark = dto.remark?.trim();

    if (previous === next && !remark) {
      return this.getById(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.activityEvent.create({
        data: {
          orgId: lead.orgId,
          agentId: actorId,
          leadId: id,
          type: 'status_updated',
          text:
            previous === next
              ? `Status remains ${STATUS_LABEL[next]}${remark ? ` - ${remark}` : ''}`
              : `Status changed from ${STATUS_LABEL[previous]} to ${STATUS_LABEL[next]}${remark ? ` - ${remark}` : ''}`,
        },
      });
    });

    return this.getById(id);
  }

  async addRemark(id: string, dto: CreateAdminLeadRemarkDto, actorId: string) {
    const remark = dto.remark.trim();
    if (!remark) throw new BadRequestException('Remark cannot be empty');

    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, orgId: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const activity = await this.prisma.activityEvent.create({
      data: {
        orgId: lead.orgId,
        agentId: actorId,
        leadId: id,
        type: 'note_added',
        text: remark,
      },
      select: ACTIVITY_SELECT,
    });

    return toActivity(activity);
  }

  async updateFollowUp(
    id: string,
    dto: UpdateAdminLeadFollowUpDto,
    actorId: string,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, orgId: true, nextActionAt: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const scheduledAt = new Date(dto.scheduledAt);
    const reminderAt = dto.reminderAt ? new Date(dto.reminderAt) : null;
    if (
      Number.isNaN(scheduledAt.getTime()) ||
      (reminderAt && Number.isNaN(reminderAt.getTime()))
    ) {
      throw new BadRequestException('Invalid follow-up or reminder date');
    }

    const note = dto.note?.trim() || null;
    const verb = lead.nextActionAt ? 'updated' : 'scheduled';

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        nextActionType: 'follow_up',
        nextActionAt: scheduledAt,
        nextActionNote: note,
        reminderAt,
      },
      select: {
        nextActionType: true,
        nextActionAt: true,
        nextActionNote: true,
        reminderAt: true,
      },
    });

    const activity = await this.prisma.activityEvent.create({
      data: {
        orgId: lead.orgId,
        agentId: actorId,
        leadId: id,
        type: 'status_updated',
        text: `Follow-up ${verb} for ${scheduledAt.toLocaleString('en-IN')}${note ? ` - ${note}` : ''}${reminderAt ? ` (reminder ${reminderAt.toLocaleString('en-IN')})` : ''}`,
      },
      select: ACTIVITY_SELECT,
    });

    return {
      nextAction: {
        type: updated.nextActionType,
        scheduledAt: updated.nextActionAt,
        note: updated.nextActionNote,
        reminderAt: updated.reminderAt,
        overdue: updated.nextActionAt
          ? updated.nextActionAt.getTime() < Date.now()
          : false,
      },
      activity: toActivity(activity),
    };
  }

  async convertToOrganisation(
    leadId: string,
    dto: ConvertLeadToOrgDto,
    actorId: string,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { project: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const leadData =
      lead.data && typeof lead.data === 'object' && !Array.isArray(lead.data)
        ? (lead.data as Record<string, unknown>)
        : {};

    // Prevent duplicate organisation conversion
    if (leadData.convertedOrgId) {
      throw new ConflictException(
        `This lead has already been converted into organisation "${leadData.convertedOrgName || leadData.convertedOrgId}".`,
      );
    }

    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone?.trim() || null;
    const orgName = dto.orgName.trim();
    if (!orgName) throw new BadRequestException('Organisation name is required');
    if (!email) throw new BadRequestException('Administrator email is required');

    // Ensure email is not already registered in User table
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException(
        `A user with email "${email}" is already registered. Please provide a different email address.`,
      );
    }

    // Name resolution
    let firstName = dto.firstName?.trim();
    let lastName = dto.lastName?.trim();
    if (!firstName && !lastName) {
      const normalized = normalizeLeadData(leadData);
      const rawFullName = (normalized as Record<string, unknown>)?.fullName ?? lead.altName ?? '';
      const nameParts = String(rawFullName).trim().split(/\s+/);
      firstName = nameParts[0] || 'Admin';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    const city = dto.city?.trim() || lead.city || 'Bengaluru';
    const slug = await generateUniqueOrgSlug(this.prisma, orgName);

    const adminRole = await this.prisma.role.findFirstOrThrow({
      where: { orgId: null, key: 'admin' },
    });

    // 4. Secure temporary password generation
    const tempPassword = generateTempPassword(12);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const { organisation, user } = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organisation.create({
        data: {
          name: orgName,
          slug,
          city,
          status: 'active',
        },
      });

      const usr = await tx.user.create({
        data: {
          orgId: org.id,
          firstName: firstName || 'Admin',
          lastName: lastName || '',
          email,
          phoneNumber: phone,
          passwordHash,
          status: 'active',
          mustChangePassword: true,
          onboardingStep: 'completed',
        },
      });

      await tx.userRole.create({
        data: { userId: usr.id, roleId: adminRole.id },
      });

      const updatedLeadData = {
        ...leadData,
        convertedOrgId: org.id,
        convertedOrgName: org.name,
        convertedAt: new Date().toISOString(),
        convertedUserId: usr.id,
      };

      await tx.lead.update({
        where: { id: leadId },
        data: {
          status: 'converted',
          data: updatedLeadData as Prisma.InputJsonValue,
        },
      });

      await tx.activityEvent.create({
        data: {
          orgId: org.id,
          agentId: actorId,
          leadId,
          type: 'status_updated',
          text: `Lead converted to organisation "${org.name}" (${org.id}). Admin user created for ${email}. Temporary password sent via email.`,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: org.id,
          actorId,
          action: 'organisation_created_from_lead',
          entity: 'lead',
          entityId: leadId,
          metadata: {
            leadId,
            orgId: org.id,
            orgName: org.name,
            adminEmail: email,
            adminPhone: phone,
          },
        },
      });

      return { organisation: org, user: usr };
    });

    // Founder joins the new org's General channel
    await runTeamChatHook('org created by lead conversion', () =>
      teamChatUserActivated(this.prisma, organisation.id, user.id),
    );

    // Send credentials to confirmed email address
    void this.emailService.sendInviteEmail({
      to: user.email,
      recipientName:
        [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      orgName: organisation.name,
      orgId: organisation.id,
      role: 'Organisation Admin',
      tempPassword,
    });

    return {
      success: true,
      organisation: {
        id: organisation.id,
        name: organisation.name,
        slug: organisation.slug,
        city: organisation.city,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
      },
      tempPassword,
    };
  }
}
