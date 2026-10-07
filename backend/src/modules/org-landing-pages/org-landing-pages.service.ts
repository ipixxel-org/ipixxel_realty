import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { generateUniqueLandingPageSlug } from '../../common/utils/slug.util';
import { deepEqual } from '../../common/utils/deep-equal.util';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { ListLandingPagesQueryDto } from './dto/list-landing-pages-query.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import {
  bindLandingPageContent,
  snapshotFromProject,
  snapshotFromStandaloneUnit,
  type PropertyBinding,
} from '../../common/utils/landing-page-property.util';
import {
  assertOrgCanPublish,
  assertOrgLandingPageQuota,
} from '../../common/utils/subscription-lifecycle.util';
import { PageRevisionsService } from '../page-revisions/page-revisions.service';

function defaultThankYouContent(pageName: string, slug: string) {
  const brandName = pageName.replace(/\s*—\s*Thank You$/i, '').trim() || 'Property';
  const thankYouTitle = "Thank You — You're All Set!";
  const thankYouSubtitle = `We have received your enquiry for ${brandName}. Our property specialist will reach out to you within 15 minutes with exclusive details and brochure.`;

  const site = {
    name: `${brandName} — Thank You`,
    theme: {
      colors: {
        primary: '#0f172a',
        accent: '#c5a880',
        background: '#ffffff',
        text: '#0f172a',
        muted: '#64748b',
        border: '#e2e8f0',
      },
      fonts: {
        heading: 'Outfit',
        body: 'Inter',
      },
    },
    header: {
      enabled: true,
      logoText: brandName,
      links: [{ label: 'Back to Landing Page', url: `/${slug.replace(/-thank-you$/, '')}` }],
    },
    footer: {
      enabled: true,
      copyright: `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`,
    },
    seo: {
      metaTitle: `Thank You | ${brandName}`,
      metaDescription: thankYouSubtitle,
      robots: 'noindex, nofollow',
    },
    blocks: [
      {
        id: 'block-thank-you-hero',
        type: 'hero',
        props: {
          title: thankYouTitle,
          subtitle: thankYouSubtitle,
          badge: 'Enquiry Received Successfully',
          alignment: 'center',
          buttons: [
            {
              id: 'btn-back-home',
              label: 'Return to Landing Page',
              href: `/${slug.replace(/-thank-you$/, '')}`,
              variant: 'solid',
            },
          ],
        },
      },
      {
        id: 'block-thank-you-highlights',
        type: 'highlights',
        props: {
          eyebrow: 'WHAT HAPPENS NEXT',
          title: '3 Simple Steps to Your Dream Property',
          items: [
            {
              title: '1. Instant Verification',
              description: 'Our lead desk reviews your preferences and matches availability.',
              icon: 'CheckCircle2',
            },
            {
              title: '2. Dedicated Specialist Call',
              description: 'A relationship manager will contact you with customized floor plans and pricing.',
              icon: 'PhoneCall',
            },
            {
              title: '3. Priority Site Visit',
              description: 'Schedule a VIP private preview or virtual video walkthrough at your convenience.',
              icon: 'Calendar',
            },
          ],
        },
      },
      {
        id: 'block-thank-you-cta',
        type: 'cta',
        props: {
          title: 'Need Immediate Assistance?',
          subtitle: 'Connect with our sales gallery team directly via WhatsApp or phone call.',
          ctaLabel: 'Visit Main Page',
          ctaLink: `/${slug.replace(/-thank-you$/, '')}`,
        },
      },
    ],
    pages: [
      {
        id: 'page-home',
        name: 'Thank You',
        path: `/${slug}`,
        blocks: [],
      },
    ],
  };

  const sections = [
    {
      id: 'sec-heading-1',
      type: 'heading',
      name: 'Thank You',
      icon: 'Type',
      visible: true,
      props: {
        text: "Thank you — you're all set!",
        tag: 'h2',
        size: 36,
        align: 'center',
      },
      styles: {
        paddingTop: 80,
        paddingBottom: 16,
      },
    },
    {
      id: 'sec-text-1',
      type: 'text',
      name: 'Thank You Text',
      icon: 'AlignLeft',
      visible: true,
      props: {
        text: `We have received your enquiry for ${brandName}. Our team will call you shortly and share the project brochure and price sheet.`,
        html: '',
      },
      styles: {
        paddingTop: 8,
        paddingBottom: 32,
        textAlign: 'center',
      },
    },
    {
      id: 'sec-button-1',
      type: 'button',
      name: 'Button',
      icon: 'MousePointerClick',
      visible: true,
      props: {
        text: 'Back to Landing Page',
        action: 'link',
        link: `/${slug.replace(/-thank-you$/, '')}`,
        style: 'solid',
        size: 'md',
        popupId: '',
      },
      styles: {
        paddingTop: 12,
        paddingBottom: 80,
      },
    },
  ];

  return {
    sections,
    config: {
      seo: {
        metaTitle: `Thank You | ${brandName}`,
        metaDescription: thankYouSubtitle,
        index: false,
      },
    },
    engine: 'openpage',
    site,
  };
}

@Injectable()
export class OrgLandingPagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly revisions: PageRevisionsService,
  ) {}

  // Presigned PUT URL for a builder image. Ownership is checked (getOwned)
  // so an org can only ever get a URL keyed into its own landing page's
  // prefix; the key's org/{orgId}/... segment comes from the JWT.
  async createUploadUrl(orgId: string, id: string, dto: CreateUploadUrlDto) {
    await this.getOwned(orgId, id);
    return this.storage.createUploadUrl({
      orgId,
      field: 'builderImage',
      landingPageId: id,
      filename: dto.filename,
      contentType: dto.contentType,
      size: dto.size,
    });
  }

  async create(orgId: string, dto: CreateLandingPageDto) {
    if (dto.projectId && dto.unitId) {
      throw new BadRequestException('Choose a project or a standalone unit, not both.');
    }

    await assertOrgLandingPageQuota(this.prisma, orgId);

    if (!dto.templateId) {
      const blank = await this.createBlank(orgId, dto);
      // Seed version history with the page exactly as created, so the
      // builder's Version History panel has a "day one" restore point.
      await this.revisions.captureLandingPage(
        orgId,
        blank.id,
        blank.content as Prisma.InputJsonValue,
      );
      return blank;
    }

    // An org may only copy a template it was actually granted — verified
    // server-side via the assignment row, never trusted from the client.
    const assignment = await this.prisma.organisationTemplate.findUnique({
      where: { orgId_templateId: { orgId, templateId: dto.templateId } },
    });
    if (!assignment) {
      throw new ForbiddenException('Template is not assigned to your organisation');
    }

    const template = await this.prisma.template.findFirst({
      where: { id: dto.templateId, status: 'published', pageType: 'landing' },
      include: {
        childPages: { where: { status: 'published', pageType: 'thank_you' }, take: 1 },
      },
    });
    if (!template) {
      throw new NotFoundException('Template not found or not eligible for use');
    }

    const slugSource = dto.slug ? dto.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '') : dto.name;
    const slug = await generateUniqueLandingPageSlug(this.prisma, orgId, slugSource);
    const companion = template.childPages[0] ?? null;
    const companionSlug = await generateUniqueLandingPageSlug(this.prisma, orgId, `${slugSource} thank you`);

    const bound = await this.bindContent(orgId, dto, template.content);
    const companionBound = companion
      ? await this.bindContent(orgId, dto, companion.content)
      : defaultThankYouContent(dto.name, companionSlug);

    const created = await this.prisma.$transaction(async (tx) => {
      const page = await tx.landingPage.create({
        data: {
          orgId,
          sourceTemplateId: template.id,
          name: dto.name,
          slug,
          status: 'draft',
          content: bound as Prisma.InputJsonValue,
          thumbnail: template.thumbnail,
          pageType: 'landing',
        },
      });

      // Every landing page has its own dedicated thank-you page companion,
      // linked to the new parent page and fully customizable in the builder.
      await tx.landingPage.create({
        data: {
          orgId,
          sourceTemplateId: companion?.id ?? null,
          name: companion?.name ?? `${dto.name} — Thank You`,
          slug: companionSlug,
          status: 'draft',
          content: (companionBound ?? companion?.content ?? defaultThankYouContent(dto.name, companionSlug)) as Prisma.InputJsonValue,
          thumbnail: companion?.thumbnail ?? null,
          pageType: 'thank_you',
          parentId: page.id,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          action: 'landing_page_created',
          entity: 'LandingPage',
          entityId: page.id,
          metadata: {
            sourceTemplateId: template.id,
            name: dto.name,
            projectId: dto.projectId ?? null,
            unitId: dto.unitId ?? null,
          },
        },
      });

      return page;
    });

    await this.revisions.captureLandingPage(
      orgId,
      created.id,
      created.content as Prisma.InputJsonValue,
    );
    return this.getOwned(orgId, created.id);
  }

  private asPageContent(raw: unknown): {
    sections?: unknown;
    config?: Record<string, unknown>;
    engine?: string;
    site?: unknown;
  } {
    if (raw && typeof raw === 'object') {
      const o = raw as {
        sections?: unknown;
        config?: Record<string, unknown>;
        engine?: string;
        site?: unknown;
      };
      return {
        sections: o.sections ?? [],
        config: o.config ?? {},
        engine: o.engine,
        site: o.site,
      };
    }
    return { sections: [], config: {} };
  }

  private async resolveBinding(orgId: string, dto: CreateLandingPageDto) {
    if (!dto.projectId && !dto.unitId) return null;

    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const orgName = org?.name ?? '';

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        include: {
          _count: { select: { units: true } },
          unitTypes: {
            select: {
              name: true,
              floorPlanUrl: true,
            },
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');
      return {
        binding: { kind: 'project' as const, projectId: project.id },
        snapshot: snapshotFromProject({
          orgName,
          project,
          unitCount: project._count.units,
          unitTypes: project.unitTypes,
        }),
      };
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, orgId, projectId: null },
    });
    if (!unit) {
      throw new BadRequestException(
        'Standalone unit not found. Project units cannot be bound on their own.',
      );
    }
    return {
      binding: { kind: 'unit' as const, unitId: unit.id },
      snapshot: snapshotFromStandaloneUnit({ orgName, unit }),
    };
  }

  private async bindContent(orgId: string, dto: CreateLandingPageDto, raw: unknown) {
    const content = this.asPageContent(raw);
    const resolved = await this.resolveBinding(orgId, dto);
    if (!resolved) {
      return {
        sections: content.sections ?? [],
        config: content.config ?? {},
        engine: content.engine,
        site: content.site,
      };
    }
    const bound = bindLandingPageContent(
      { sections: content.sections, config: content.config, site: content.site },
      resolved.binding,
      resolved.snapshot,
    );
    return {
      ...bound,
      engine: content.engine,
      site: bound.site ?? content.site,
    };
  }

  // Blank creation: no template to verify, copy, or derive a companion
  // from — `dto.content` is caller-supplied (built client-side by the same
  // factories the Super Admin blank-template flow uses; the DTO already
  // guarantees it's present and well-formed when templateId is absent).
  private async createBlank(orgId: string, dto: CreateLandingPageDto) {
    const slugSource = dto.slug ? dto.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '') : dto.name;
    const slug = await generateUniqueLandingPageSlug(this.prisma, orgId, slugSource);
    const companionSlug = await generateUniqueLandingPageSlug(this.prisma, orgId, `${slugSource} thank you`);
    const bound = await this.bindContent(orgId, dto, {
      sections: dto.content!.sections,
      config: dto.content!.config as unknown as Record<string, unknown>,
      engine: dto.content!.engine,
      site: dto.content!.site,
    });
    const thankYouContent = defaultThankYouContent(dto.name, companionSlug);

    const created = await this.prisma.$transaction(async (tx) => {
      const page = await tx.landingPage.create({
        data: {
          orgId,
          sourceTemplateId: null,
          name: dto.name,
          slug,
          status: 'draft',
          content: bound as Prisma.InputJsonValue,
          pageType: 'landing',
        },
      });

      await tx.landingPage.create({
        data: {
          orgId,
          sourceTemplateId: null,
          name: `${dto.name} — Thank You`,
          slug: companionSlug,
          status: 'draft',
          content: thankYouContent as Prisma.InputJsonValue,
          thumbnail: null,
          pageType: 'thank_you',
          parentId: page.id,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          action: 'landing_page_created',
          entity: 'LandingPage',
          entityId: page.id,
          metadata: {
            sourceTemplateId: null,
            name: dto.name,
            projectId: dto.projectId ?? null,
            unitId: dto.unitId ?? null,
          },
        },
      });

      return page;
    });

    return this.getOwned(orgId, created.id);
  }

  async list(orgId: string, query: ListLandingPagesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.LandingPageWhereInput = { orgId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    // A page's project link lives in its own content.config.propertyBinding
    // JSON, not a real FK column (see resolveBinding/bindLandingPageContent
    // below) — filter on that path rather than a relation that doesn't exist
    // on the schema.
    if (query.projectId) {
      where.content = {
        path: ['config', 'propertyBinding', 'projectId'],
        equals: query.projectId,
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.landingPage.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          thumbnail: true,
          pageType: true,
          parentId: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          sourceTemplate: { select: { id: true, name: true } },
          orgDomainRequests: {
            where: { status: { in: ['approved', 'connected', 'pending'] } },
            select: { id: true, customDomain: true, status: true },
          },
          children: {
            where: { pageType: 'thank_you' },
            select: { id: true, name: true, slug: true, status: true },
            take: 1,
          },
          parent: {
            select: { id: true, name: true, slug: true, status: true },
          },
        },
      }),
      this.prisma.landingPage.count({ where }),
    ]);

    const pageIds = rows.map((r) => r.id);
    const [viewEvents, leadSubmits, leadCounts] = pageIds.length > 0
      ? await Promise.all([
          this.prisma.trackingEvent.groupBy({
            by: ['landingPageId'],
            where: { orgId, landingPageId: { in: pageIds }, eventType: 'page_view' },
            _count: { _all: true },
          }),
          this.prisma.trackingEvent.groupBy({
            by: ['landingPageId'],
            where: { orgId, landingPageId: { in: pageIds }, eventType: { in: ['lead_submit', 'form_submit'] } },
            _count: { _all: true },
          }),
          this.prisma.lead.groupBy({
            by: ['landingPageId'],
            where: { orgId, landingPageId: { in: pageIds } },
            _count: { _all: true },
          }),
        ])
      : [[], [], []];

    const viewMap = new Map<string, number>();
    for (const v of viewEvents) {
      if (v.landingPageId) viewMap.set(v.landingPageId, v._count._all);
    }
    const leadMap = new Map<string, number>();
    for (const l of leadCounts) {
      if (l.landingPageId) leadMap.set(l.landingPageId, l._count._all);
    }
    for (const s of leadSubmits) {
      if (s.landingPageId) {
        const cur = leadMap.get(s.landingPageId) ?? 0;
        leadMap.set(s.landingPageId, Math.max(cur, s._count._all));
      }
    }

    const formattedRows = rows.map((r) => {
      const activeDomain =
        r.orgDomainRequests?.find((d) => d.status === 'connected' || d.status === 'approved') ??
        r.orgDomainRequests?.[0] ??
        null;
      return {
        ...r,
        views: viewMap.get(r.id) ?? 0,
        leads: leadMap.get(r.id) ?? 0,
        thankYouPage: r.children?.[0] ?? null,
        parentLandingPage: r.parent ?? null,
        children: undefined,
        parent: undefined,
        orgDomainRequests: undefined,
        assignedDomain: activeDomain
          ? {
              id: activeDomain.id,
              customDomain: activeDomain.customDomain,
              status: activeDomain.status,
            }
          : null,
      };
    });

    return { data: formattedRows, total, page, limit };
  }

  async getById(orgId: string, id: string) {
    return this.getOwned(orgId, id);
  }

  async update(orgId: string, id: string, dto: UpdateLandingPageDto) {
    const page = await this.getOwned(orgId, id);

    const data: Prisma.LandingPageUpdateInput = {};
    let contentChanged = false;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) {
      const cleanSlug = dto.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
      if (cleanSlug) {
        data.slug = cleanSlug;
      }
    } else if (dto.content && (dto.content as any).site) {
      const sitePages = (dto.content as any).site?.pages;
      if (Array.isArray(sitePages) && sitePages[0]?.path) {
        const pathSlug = sitePages[0].path.replace(/^\/+/, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
        if (pathSlug && pathSlug !== 'page-home') {
          data.slug = pathSlug;
        }
      }
    }
    if (dto.thumbnail !== undefined) data.thumbnail = dto.thumbnail;

    if (dto.content !== undefined) {
      const nextContent = {
        sections: dto.content.sections,
        config: dto.content.config,
        engine: dto.content.engine,
        site: dto.content.site,
      };
      data.content = nextContent as Prisma.InputJsonValue;
      contentChanged = !deepEqual(page.content, nextContent);

      // Editing a published page reverts it to draft — only when the
      // content actually changed (deep equality against what's stored, not
      // just "a content-carrying PATCH arrived") so merely opening a page
      // doesn't flip it, and republishing is an explicit, visible action
      // rather than a silent no-op. See OrgLandingPagesController comment
      // history for why this was tried without the revert and reverted:
      // the Publish/Unpublish button looked stuck on "Unpublish" after an
      // edit, giving no signal the live page hadn't picked up the change.
      if (contentChanged && page.status === 'published') {
        data.status = 'draft';
      }
    }

    try {
      const updated = await this.prisma.landingPage.update({ where: { id }, data });
      // Version history: snapshot only real content changes — name/slug/
      // thumbnail-only saves and no-op PATCHes (identical content) must not
      // burn a revision slot. captureLandingPage is best-effort internally
      // and can never fail this save.
      if (contentChanged) {
        await this.revisions.captureLandingPage(
          orgId,
          id,
          data.content as Prisma.InputJsonValue,
        );
      }
      return updated;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('You already have a page with that slug');
      }
      throw err;
    }
  }

  async publish(orgId: string, id: string) {
    const page = await this.getOwned(orgId, id);

    // Publishing is a package-gated action: a usable subscription (active /
    // trial / inside grace) AND the `publishing` plan capability. Drafting and
    // editing stay open to everyone so builders can prepare work while waiting
    // on an upgrade/renewal — the gate fires exactly at publish.
    await assertOrgCanPublish(this.prisma, orgId, page.id);

    const updated = await this.prisma.landingPage.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    });

    if (page.pageType === 'landing') {
      await this.prisma.landingPage.updateMany({
        where: { parentId: page.id, orgId, pageType: 'thank_you' },
        data: { status: 'published', publishedAt: new Date() },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        orgId,
        action: 'landing_page_published',
        entity: 'LandingPage',
        entityId: page.id,
        metadata: {},
      },
    });
    return updated;
  }

  async unpublish(orgId: string, id: string) {
    const page = await this.getOwned(orgId, id);
    if (page.status !== 'published') {
      throw new BadRequestException('Only published pages can be unpublished');
    }
    const updated = await this.prisma.landingPage.update({
      where: { id },
      data: { status: 'unpublished' },
    });

    if (page.pageType === 'landing') {
      await this.prisma.landingPage.updateMany({
        where: { parentId: page.id, orgId, pageType: 'thank_you' },
        data: { status: 'unpublished' },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        orgId,
        action: 'landing_page_unpublished',
        entity: 'LandingPage',
        entityId: page.id,
        metadata: {},
      },
    });
    return updated;
  }

  async remove(orgId: string, id: string) {
    const page = await this.getOwned(orgId, id);
    if (page.pageType === 'landing') {
      await this.prisma.landingPage.deleteMany({
        where: { parentId: page.id, orgId, pageType: 'thank_you' },
      });
    }
    await this.prisma.landingPage.delete({ where: { id } });
    return { success: true };
  }

  async duplicate(orgId: string, id: string) {
    const page = await this.getOwned(orgId, id);

    if (page.pageType === 'landing') {
      await assertOrgLandingPageQuota(this.prisma, orgId);
    }

    const slug = await generateUniqueLandingPageSlug(this.prisma, orgId, `${page.name} copy`);
    const copy = await this.prisma.landingPage.create({
      data: {
        orgId,
        sourceTemplateId: page.sourceTemplateId,
        name: `${page.name} (copy)`,
        slug,
        status: 'draft',
        content: page.content as Prisma.InputJsonValue,
        thumbnail: page.thumbnail,
        pageType: page.pageType,
        parentId: page.parentId,
      },
    });

    // Also duplicate companion thank-you page if present
    const companion = await this.prisma.landingPage.findFirst({
      where: { orgId, parentId: page.id, pageType: 'thank_you' },
    });
    if (companion) {
      const companionSlug = await generateUniqueLandingPageSlug(this.prisma, orgId, `${copy.slug} thank you`);
      await this.prisma.landingPage.create({
        data: {
          orgId,
          sourceTemplateId: companion.sourceTemplateId,
          name: `${copy.name} — Thank You`,
          slug: companionSlug,
          status: 'draft',
          content: companion.content as Prisma.InputJsonValue,
          thumbnail: companion.thumbnail,
          pageType: 'thank_you',
          parentId: copy.id,
        },
      });
    }

    await this.prisma.auditLog.create({ data: { orgId, action: 'landing_page_duplicated', entity: 'LandingPage', entityId: copy.id, metadata: { sourceId: id } as any } });
    return copy;
  }

  async reorder(orgId: string, orderedIds: string[]) {
    // Validate ownership
    for (const id of orderedIds) await this.getOwned(orgId, id);
    // No explicit order column; touch updatedAt in order to reflect reorder - real ordering via updatedAt for now
    // For true reorder, we store order in content or rely on client; here we just validate
    return { success: true, ordered: orderedIds };
  }

  async sitemap(orgId: string) {
    const pages = await this.prisma.landingPage.findMany({ where: { orgId, status: 'published' }, select: { slug: true, updatedAt: true } });
    // Build sitemap using the org's connected custom domain for the canonical base
    const domainReq = await this.prisma.organisation.findFirst({ where: { id: orgId, customDomainStatus: 'connected' }, select: { customDomain: true } });
    const base = domainReq?.customDomain ? `https://${domainReq.customDomain}` : `https://app.bigestate.io/org/${orgId}`;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const p of pages) xml += `  <url><loc>${base}/${p.slug}</loc><lastmod>${p.updatedAt.toISOString().split('T')[0]}</lastmod></url>\n`;
    xml += `</urlset>`;
    return xml;
  }

  async robots(orgId: string) {
    const sitemapUrl = `https://app.bigestate.io/org/${orgId}/sitemap.xml`;
    const domainReq = await this.prisma.organisation.findFirst({ where: { id: orgId, customDomainStatus: 'connected' }, select: { customDomain: true } });
    const sitemap = domainReq?.customDomain ? `https://${domainReq.customDomain}/sitemap.xml` : sitemapUrl;
    // respect SEO index settings per page? For robots we allow all published
    return `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${sitemap}`;
  }

  async getOrCreateThankYouPage(orgId: string, parentId: string) {
    const parent = await this.getOwned(orgId, parentId);
    let companion = await this.prisma.landingPage.findFirst({
      where: { orgId, parentId: parent.id, pageType: 'thank_you' },
    });
    if (!companion) {
      const companionSlug = await generateUniqueLandingPageSlug(this.prisma, orgId, `${parent.slug} thank you`);
      const thankYouContent = defaultThankYouContent(parent.name, companionSlug);
      companion = await this.prisma.landingPage.create({
        data: {
          orgId,
          sourceTemplateId: null,
          name: `${parent.name} — Thank You`,
          slug: companionSlug,
          status: parent.status === 'published' ? 'published' : 'draft',
          publishedAt: parent.status === 'published' ? new Date() : null,
          content: thankYouContent as Prisma.InputJsonValue,
          thumbnail: parent.thumbnail,
          pageType: 'thank_you',
          parentId: parent.id,
        },
      });
    }
    return this.getOwned(orgId, companion.id);
  }

  // Never leaks cross-tenant existence: a foreign org's page 404s exactly
  // the same as an id that doesn't exist at all.
  async getOwned(orgId: string, id: string) {
    let page = await this.prisma.landingPage.findFirst({
      where: { id, orgId },
      include: {
        sourceTemplate: { select: { id: true, name: true } },
        orgDomainRequests: {
          where: { status: { in: ['approved', 'connected', 'pending'] } },
          select: { id: true, customDomain: true, status: true },
        },
        children: {
          where: { pageType: 'thank_you' },
          select: { id: true, name: true, slug: true, status: true },
          take: 1,
        },
        parent: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }

    // Auto-heal: If it is a landing page without a companion thank-you page, create one automatically
    if (page.pageType === 'landing' && (!page.children || page.children.length === 0)) {
      const companionSlug = await generateUniqueLandingPageSlug(this.prisma, orgId, `${page.slug} thank you`);
      const thankYouContent = defaultThankYouContent(page.name, companionSlug);
      const companion = await this.prisma.landingPage.create({
        data: {
          orgId,
          sourceTemplateId: null,
          name: `${page.name} — Thank You`,
          slug: companionSlug,
          status: page.status === 'published' ? 'published' : 'draft',
          publishedAt: page.status === 'published' ? new Date() : null,
          content: thankYouContent as Prisma.InputJsonValue,
          thumbnail: page.thumbnail,
          pageType: 'thank_you',
          parentId: page.id,
        },
        select: { id: true, name: true, slug: true, status: true },
      });
      (page as any).children = [companion];
    }

    const activeDomain =
      page.orgDomainRequests?.find((d) => d.status === 'connected' || d.status === 'approved') ??
      page.orgDomainRequests?.[0] ??
      null;

    const thankYouPage = page.children?.[0] ?? null;
    const parentLandingPage = page.parent ?? null;

    return {
      ...page,
      thankYouPage,
      parentLandingPage,
      assignedDomain: activeDomain
        ? {
            id: activeDomain.id,
            customDomain: activeDomain.customDomain,
            status: activeDomain.status,
          }
        : null,
    };
  }
}
