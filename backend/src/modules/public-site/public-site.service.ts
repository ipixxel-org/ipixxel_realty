import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FieldDef, roleField } from '../../common/utils/field-template.util';

function readTemplate(v: Prisma.JsonValue): FieldDef[] {
  return (Array.isArray(v) ? v : []) as unknown as FieldDef[];
}

@Injectable()
export class PublicSiteService {
  constructor(private readonly prisma: PrismaService) {}

  // Resolve an incoming host to an organisation site.
  // Supports a custom domain that the org has verified/connected.
  // Returns the org + its active, published landing page.
  async resolvePortal(host: string) {
    const normalized = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
    let org: any = null;

    const domainReq = await this.prisma.orgDomainRequest.findFirst({
      where: { customDomain: normalized, status: { in: ['connected', 'approved'] } },
      include: { organisation: true },
    });
    if (domainReq?.organisation && !(domainReq as any).isSuspended && domainReq.organisation.status === 'active') {
      org = domainReq.organisation;
    }

    if (!org) {
      org = await this.prisma.organisation.findFirst({
        where: { customDomain: normalized, customDomainStatus: 'connected', status: 'active' },
      });
    }

    if (!org) throw new NotFoundException('No organisation for host');
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      brandColour: org.brandColour,
      customDomain: org.customDomain,
      loginPath: '/login',
      sitePath: '/site',
    };
  }

  async resolveByHost(host: string) {
    const normalized = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');

    // 1) Per-landing-page custom domain mapped via OrgDomainRequest
    const domainReq = await this.prisma.orgDomainRequest.findFirst({
      where: {
        customDomain: normalized,
        status: { in: ['approved', 'connected'] },
        isSuspended: false,
      } as any,
      include: {
        organisation: true,
        landingPage: true,
      },
    });

    if (domainReq && domainReq.organisation && domainReq.organisation.status === 'active') {
      return this.buildSiteFromDomainRequest(domainReq, host);
    }

    // 2) Custom domain mapped to an organisation (verified/connected fallback).
    const custom = await this.prisma.organisation.findFirst({
      where: { customDomain: normalized, customDomainStatus: 'connected', status: 'active' },
    });
    if (custom) {
      return this.buildOrgSite(custom, host);
    }

    throw new NotFoundException('No site for host');
  }

  private async buildSiteFromDomainRequest(domainReq: any, host: string) {
    const org = domainReq.organisation;
    let landingPage = domainReq.landingPage;
    if (!landingPage || landingPage.status !== 'published') {
      landingPage = domainReq.landingPageId
        ? (await this.prisma.landingPage.findFirst({
            where: { id: domainReq.landingPageId, orgId: org.id, status: 'published' },
          }))
        : null;
    }
    if (!landingPage) {
      landingPage = (await this.prisma.landingPage.findFirst({
        where: { orgId: org.id, status: 'published' },
        orderBy: { updatedAt: 'desc' },
      })) ?? null;
    }

    return {
      type: 'custom',
      organisation: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        customDomain: domainReq.customDomain,
        customDomainStatus: domainReq.status,
        customDomainLandingPageId: landingPage?.id ?? null,
        logoUrl: org.logoUrl,
        brandColour: org.brandColour,
        defaultLanguage: org.defaultLanguage,
      },
      landingPage: landingPage
        ? {
            id: landingPage.id,
            slug: landingPage.slug,
            name: landingPage.name,
            status: landingPage.status,
            content: landingPage.content,
            publishedAt: landingPage.publishedAt,
          }
        : null,
    };
  }

  private async buildOrgSite(org: any, host: string) {
    // The org's PRIMARY landing page: an explicitly selected one (its custom
    // domain target), else the most recently published page.
    let landingPage: any = null;
    if (org.customDomainLandingPageId) {
      landingPage = await this.prisma.landingPage.findFirst({
        where: { id: org.customDomainLandingPageId, orgId: org.id, status: 'published' },
      }) ?? null;
    }
    if (!landingPage) {
      landingPage = await this.prisma.landingPage.findFirst({
        where: { orgId: org.id, status: 'published' },
        orderBy: { updatedAt: 'desc' },
      }) ?? null;
    }
    return {
      type: 'custom',
      organisation: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        customDomain: org.customDomain,
        customDomainStatus: org.customDomainStatus,
        customDomainLandingPageId: org.customDomainLandingPageId,
        logoUrl: org.logoUrl,
        brandColour: org.brandColour,
        defaultLanguage: org.defaultLanguage,
      },
      landingPage: landingPage
        ? {
            id: landingPage.id,
            slug: landingPage.slug,
            name: landingPage.name,
            status: landingPage.status,
            content: landingPage.content,
            publishedAt: landingPage.publishedAt,
          }
        : null,
    };
  }

  async projectsForLandingPage(landingPageId: string) {
    const page = await this.prisma.landingPage.findFirst({
      where: { id: landingPageId, status: 'published' },
      select: { orgId: true },
    });
    if (!page) throw new NotFoundException('Published landing page not found');

    const projects = await this.prisma.project.findMany({
      where: {
        orgId: page.orgId,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        // Planned unit mix.
        unitTypes: { orderBy: { createdAt: 'asc' } },
        // A unit now belongs straight to the project, not to a unit type.
        units: {
          where: { status: 'available' },
          orderBy: { unitNo: 'asc' },
          select: {
            id: true,
            unitNo: true,
            configuration: true,
            variantLabel: true,
            area: true,
            tower: true,
            floor: true,
            facing: true,
            price: true,
            status: true,
          },
        },
      },
    });

    return projects.map((project) => {
      const template = readTemplate(project.unitFieldTemplate);
      const hasConfiguration = !!roleField(template, 'configuration');
      const hasFloor = !!roleField(template, 'floor');
      const hasGroup = !!roleField(template, 'group');

      return {
        ...project,
        units: project.units.map((unit) => ({
          ...unit,
          configuration: hasConfiguration ? unit.configuration : null,
          tower: hasGroup ? unit.tower : null,
          floor: hasFloor ? unit.floor : null,
        })),
      };
    });
  }

  async resolveByDomain(domain: string) {
    const normalized = domain.toLowerCase().replace(/^www\./, '');

    const domainReq = await this.prisma.orgDomainRequest.findFirst({
      where: { customDomain: normalized, status: { in: ['approved', 'connected'] } },
      include: { organisation: true, landingPage: true },
    });
    if (domainReq && !(domainReq as any).isSuspended && domainReq.organisation && domainReq.organisation.status === 'active') {
      let page = domainReq.landingPage;
      if (!page || page.status !== 'published') {
        page = domainReq.landingPageId
          ? await this.prisma.landingPage.findFirst({ where: { id: domainReq.landingPageId, orgId: domainReq.orgId, status: 'published' } })
          : null;
      }
      if (!page) {
        page = await this.prisma.landingPage.findFirst({ where: { orgId: domainReq.orgId, status: 'published' }, orderBy: { updatedAt: 'desc' } });
      }
      if (!page) throw new NotFoundException('Site not published');
      return { domain: domainReq.customDomain, landingPage: page, organisation: domainReq.organisation };
    }

    const org = await this.prisma.organisation.findFirst({ where: { customDomain: normalized, customDomainStatus: 'connected', status: 'active' } });
    if (!org) throw new NotFoundException('No site for domain');

    const landingPage = org.customDomainLandingPageId
      ? await this.prisma.landingPage.findFirst({ where: { id: org.customDomainLandingPageId, orgId: org.id, status: 'published' } })
      : null;
    const page = landingPage ?? (await this.prisma.landingPage.findFirst({ where: { orgId: org.id, status: 'published' }, orderBy: { updatedAt: 'desc' } }));
    if (!page) throw new NotFoundException('Site not published');
    return { domain: org.customDomain, landingPage: page, organisation: org };
  }

  async sitemapForDomain(domain: string): Promise<string> {
    const site = await this.resolveByDomain(domain);
    const cfg: any = site.landingPage.content;
    const base = `https://${site.domain}`;
    // Includes only published pages for that website - currently single page + children (thank-you) excluded if not published
    const pages = await this.prisma.landingPage.findMany({ where: { orgId: site.landingPage.orgId, status: 'published' } });
    const urls = pages
      .filter((p) => p.id === site.landingPage.id || p.parentId === site.landingPage.id)
      .map((p) => `${base}/${p.slug === site.landingPage.slug ? '' : p.slug}`.replace(/\/$/, '/'));
    const unique = [...new Set(urls)];
    if (unique.length === 0) unique.push(`${base}/`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('\n')}\n</urlset>`;
  }

  async robotsForDomain(domain: string): Promise<string> {
    const site = await this.resolveByDomain(domain);
    const cfg: any = site.landingPage.content;
    const seoIndex = cfg?.config?.seo?.index !== false;
    const sitemapUrl = `https://${site.domain}/sitemap.xml`;
    if (!seoIndex) {
      return `User-agent: *\nDisallow: /\n# Sitemap: ${sitemapUrl}`;
    }
    return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${sitemapUrl}`;
  }

  async canonicalForPage(landingPageId: string, slug?: string) {
    const page = await this.prisma.landingPage.findUnique({ where: { id: landingPageId }, select: { id: true, slug: true, orgId: true } });
    if (!page) throw new NotFoundException('Page not found');

    const domainReq = await this.prisma.orgDomainRequest.findFirst({
      where: {
        orgId: page.orgId,
        landingPageId: page.id,
        status: { in: ['approved', 'connected'] },
        customDomain: { not: null },
      },
    });
    if (domainReq?.customDomain) {
      const path = slug ? `/${slug}` : page.slug ? `/${page.slug}` : '/';
      return `https://${domainReq.customDomain}${path === '/' ? '/' : path}`;
    }

    const org = await this.prisma.organisation.findFirst({
      where: {
        id: page.orgId,
        customDomain: { not: null },
        customDomainStatus: 'connected',
        OR: [{ customDomainLandingPageId: page.id }, { customDomainLandingPageId: null }],
      },
    });
    const domain = org?.customDomain ?? null;
    if (domain) {
      const path = slug ? `/${slug}` : page.slug ? `/${page.slug}` : '/';
      return `https://${domain}${path === '/' ? '/' : path}`;
    }
    return null;
  }

  async resolveBySlug(slug: string) {
    const raw = (slug ?? '').trim().toLowerCase();
    const hyphenated = raw.replace(/\s+/g, '-').replace(/\/thank-you$/, '-thank-you');
    const isThankYou = raw.endsWith('/thank-you') || raw.endsWith('-thank-you');
    const baseSlug = raw.replace(/(\/|-)?thank-you$/, '');

    const whereOr: Prisma.LandingPageWhereInput[] = [
      { slug: { equals: raw, mode: 'insensitive' } },
      { slug: { equals: hyphenated, mode: 'insensitive' } },
    ];
    if (isThankYou) {
      whereOr.push({
        slug: { equals: `${baseSlug}-thank-you`, mode: 'insensitive' },
      });
      whereOr.push({
        pageType: 'thank_you',
        parent: { slug: { equals: baseSlug, mode: 'insensitive' } },
      });
    }

    const page = await this.prisma.landingPage.findFirst({
      where: {
        OR: whereOr,
        status: 'published',
      },
      include: {
        organisation: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            brandColour: true,
            customDomain: true,
          },
        },
        sourceTemplate: {
          select: { id: true, name: true, baseDesignName: true },
        },
      },
    });
    if (!page) {
      const draft = await this.prisma.landingPage.findFirst({
        where: {
          OR: whereOr,
        },
        include: {
          organisation: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              brandColour: true,
              customDomain: true,
            },
          },
          sourceTemplate: {
            select: { id: true, name: true, baseDesignName: true },
          },
        },
      });
      if (draft) return draft;

      throw new NotFoundException('Landing page not found or not published');
    }

    this.prisma.trackingEvent.create({
      data: {
        orgId: page.orgId,
        landingPageId: page.id,
        eventType: 'page_view',
      },
    }).catch(() => {});

    return page;
  }

  async resolveById(id: string) {
    const page = await this.prisma.landingPage.findUnique({
      where: { id },
      include: {
        organisation: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            brandColour: true,
            customDomain: true,
          },
        },
        sourceTemplate: {
          select: { id: true, name: true, baseDesignName: true },
        },
      },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }

    this.prisma.trackingEvent.create({
      data: {
        orgId: page.orgId,
        landingPageId: page.id,
        eventType: 'page_view',
      },
    }).catch(() => {});

    return page;
  }

  async recordPublicTrack(dto: { landingPageId: string; eventType?: string; metadata?: any }) {
    if (!dto?.landingPageId) return { ok: false };
    const page = await this.prisma.landingPage.findUnique({
      where: { id: dto.landingPageId },
      select: { id: true, orgId: true },
    });
    if (!page) return { ok: false };
    await this.prisma.trackingEvent.create({
      data: {
        orgId: page.orgId,
        landingPageId: page.id,
        eventType: dto.eventType || 'page_view',
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    }).catch(() => {});
    return { ok: true };
  }
}
