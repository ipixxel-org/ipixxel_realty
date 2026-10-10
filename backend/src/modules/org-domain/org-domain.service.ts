import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  isValidDomain,
  normalizeDomain,
  generateCustomDomainDnsInstructions,
} from '../../common/utils/domain.util';
import { buildNotificationData } from '../../common/utils/notifications.util';
import { PlatformConfigService } from '../platform-config/platform-config.service';

function toView(req: any, opts: any = {}) {
  return {
    id: req.id,
    kind: req.kind,
    customDomain: req.customDomain,
    landingPageId: req.landingPageId,
    landingPage: req.landingPage
      ? { id: req.landingPage.id, name: req.landingPage.name, slug: req.landingPage.slug }
      : null,
    status: req.status,
    requestedAt: req.requestedAt,
    reviewedAt: req.reviewedAt,
    rejectionReason: req.rejectionReason,
    dnsInstructions: req.customDomain
      ? generateCustomDomainDnsInstructions(req.customDomain, opts)
      : [],
  };
}

@Injectable()
export class OrgDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  // The organisation's own custom-domain identity plus the history
  // of the org's own domain requests (org-scoped, single-tenant isolation).
  async getInfo(orgId: string) {
    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organisation not found');

    const [requests, landingPages] = await Promise.all([
      this.prisma.orgDomainRequest.findMany({
        where: { orgId, kind: 'custom_domain' },
        orderBy: { requestedAt: 'desc' },
        include: { landingPage: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.landingPage.findMany({
        where: {
          orgId,
          pageType: { not: 'thank_you' },
          parentId: null,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          pageType: true,
          sourceTemplate: { select: { name: true } },
        },
      }),
    ]);

    const approvedOrConnected = requests.filter(
      (r) => r.status === 'approved' || r.status === 'connected',
    );

    const landingPagesWithDomain = landingPages.map((lp) => {
      const match = approvedOrConnected.find((r) => r.landingPageId === lp.id);
      return {
        ...lp,
        assignedDomain: match
          ? {
              id: match.id,
              customDomain: match.customDomain,
              status: match.status,
            }
          : null,
      };
    });

    const approvedDomains = approvedOrConnected.map((r) => ({
      id: r.id,
      domain: r.customDomain,
      status: r.status,
      landingPageId: r.landingPageId ?? null,
      landingPageName: r.landingPage?.name ?? null,
    }));

    const cfg = await this.platformConfig.getConfig();
    const dnsOpts = {
      mode: cfg.dnsMode,
      ip: cfg.infraIp ?? undefined,
      ipv6: cfg.infraIpv6 ?? null,
      cname: cfg.infraCname ?? undefined,
      ns1: cfg.infraNs1 ?? undefined,
      ns2: cfg.infraNs2 ?? undefined,
    };

    return {
      customDomain: org.customDomain,
      customDomainStatus: org.customDomainStatus,
      customDomainLandingPageId: org.customDomainLandingPageId,
      platformOrigin: cfg.infraIp || cfg.infraCname || null,
      dnsMode: cfg.dnsMode,
      landingPages: landingPagesWithDomain,
      approvedDomains,
      requests: requests.map((r) => toView(r, dnsOpts)),
    };
  }

  // Submit a custom-domain request for review by a Super Admin.
  // Each landing page can have its own distinct custom domain.
  async requestCustomDomain(
    orgId: string,
    userId: string,
    domain: string,
    landingPageId?: string,
  ) {
    const host = normalizeDomain(domain);
    if (!isValidDomain(host)) {
      throw new BadRequestException('Invalid domain format. Example: example.com');
    }
    await this.assertDomainAvailable(host);

    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organisation not found');

    let targetPageId: string | null = landingPageId ?? null;
    if (targetPageId) {
      const page = await this.prisma.landingPage.findFirst({
        where: { id: targetPageId, orgId },
        select: { id: true, name: true, pageType: true, parentId: true },
      });
      if (!page) {
        throw new BadRequestException('Landing page not found for this organisation');
      }
      if (page.pageType === 'thank_you' || page.parentId) {
        throw new BadRequestException(
          'Thank you pages cannot be assigned an independent custom domain. Assign the primary landing page instead.',
        );
      }

      // Check if this landing page already has an unreviewed pending request
      const existingPending = await this.prisma.orgDomainRequest.findFirst({
        where: { orgId, landingPageId: targetPageId, status: 'pending', kind: 'custom_domain' },
      });
      if (existingPending) {
        throw new ConflictException(
          `This landing page already has a pending domain request ("${existingPending.customDomain}"). Please wait for Super Admin approval or delete that request first.`,
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.orgDomainRequest.create({
        data: {
          orgId,
          kind: 'custom_domain',
          customDomain: host,
          landingPageId: targetPageId,
          status: 'pending',
          requestedBy: userId,
        },
        include: { landingPage: { select: { id: true, name: true, slug: true } } },
      });

      // Update primary org domain identity if the org doesn't have an active custom domain yet
      const currentOrg = await tx.organisation.findUnique({ where: { id: orgId } });
      if (!currentOrg?.customDomain || currentOrg.customDomainStatus === 'none' || currentOrg.customDomainStatus === 'rejected') {
        await tx.organisation.update({
          where: { id: orgId },
          data: {
            customDomain: host,
            customDomainStatus: 'pending',
            customDomainLandingPageId: targetPageId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: 'custom_domain_requested',
          entity: 'OrgDomainRequest',
          entityId: row.id,
          metadata: { domain: host, landingPageId: targetPageId } as any,
        },
      });

      await tx.notification.create({
        data: buildNotificationData({
          orgId,
          type: 'custom_domain_request',
          title: `Custom domain request: ${host}`,
          body: `${org.name} requested to map custom domain ${host}. Review in the Org Domains screen.`,
          entity: 'OrgDomainRequest',
          entityId: row.id,
        }),
      });

      return row;
    });

    const cfg = await this.platformConfig.getConfig();
    const dnsOpts = {
      mode: cfg.dnsMode,
      ip: cfg.infraIp ?? undefined,
      ipv6: cfg.infraIpv6 ?? null,
      cname: cfg.infraCname ?? undefined,
      ns1: cfg.infraNs1 ?? undefined,
      ns2: cfg.infraNs2 ?? undefined,
    };
    return toView(created, dnsOpts);
  }

  // Assign or reassign an approved custom domain to a specific landing page (or unassign by passing null).
  // This allows the organisation admin to configure and switch domains across landing pages after Super Admin approval.
  async assignDomain(
    orgId: string,
    userId: string,
    domainRequestId: string,
    landingPageId?: string | null,
  ) {
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { id: domainRequestId, orgId },
      include: { landingPage: true },
    });
    if (!req) {
      throw new NotFoundException('Domain request not found for your organisation');
    }

    if (req.status === 'pending') {
      throw new BadRequestException(
        'This domain is still pending approval from Super Admin. You can assign it once approved.',
      );
    }
    if (req.status === 'rejected') {
      throw new BadRequestException(
        `This domain request was rejected (${req.rejectionReason ?? 'reason not specified'}).`,
      );
    }

    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organisation not found');

    const targetPageId = landingPageId?.trim() || null;

    if (targetPageId) {
      const page = await this.prisma.landingPage.findFirst({
        where: { id: targetPageId, orgId },
        select: { id: true, name: true, pageType: true, parentId: true },
      });
      if (!page) {
        throw new NotFoundException('Landing page not found for this organisation');
      }
      if (page.pageType === 'thank_you' || page.parentId) {
        throw new BadRequestException(
          'Thank you pages cannot be assigned an independent custom domain. Assign the primary landing page instead.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // If assigning to a landing page, unassign any OTHER domain request currently mapped to that landing page
      if (targetPageId) {
        await tx.orgDomainRequest.updateMany({
          where: {
            orgId,
            landingPageId: targetPageId,
            id: { not: domainRequestId },
            status: { in: ['approved', 'connected'] },
          },
          data: {
            landingPageId: null,
            status: 'approved',
          },
        });
      }

      // Update the target domain request
      const updatedReq = await tx.orgDomainRequest.update({
        where: { id: domainRequestId },
        data: {
          landingPageId: targetPageId,
          status: targetPageId ? 'connected' : 'approved',
        },
        include: { landingPage: { select: { id: true, name: true, slug: true } } },
      });

      // Synchronize Organisation table's primary custom domain if this was or is the primary
      if (!org.customDomain || org.customDomain === req.customDomain) {
        await tx.organisation.update({
          where: { id: orgId },
          data: {
            customDomain: req.customDomain,
            customDomainStatus: targetPageId ? 'connected' : 'approved',
            customDomainLandingPageId: targetPageId,
          },
        });
      } else if (org.customDomainLandingPageId === targetPageId && targetPageId) {
        // If org had a previous domain linked to this landing page, update org's pointer
        await tx.organisation.update({
          where: { id: orgId },
          data: {
            customDomainLandingPageId: targetPageId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: targetPageId ? 'custom_domain_assigned' : 'custom_domain_unassigned',
          entity: 'OrgDomainRequest',
          entityId: domainRequestId,
          metadata: {
            domain: req.customDomain,
            landingPageId: targetPageId,
          } as any,
        },
      });

      return updatedReq;
    });

    const cfg = await this.platformConfig.getConfig();
    const dnsOpts = {
      mode: cfg.dnsMode,
      ip: cfg.infraIp ?? undefined,
      ipv6: cfg.infraIpv6 ?? null,
      cname: cfg.infraCname ?? undefined,
      ns1: cfg.infraNs1 ?? undefined,
      ns2: cfg.infraNs2 ?? undefined,
    };
    return toView(updated, dnsOpts);
  }

  // Delete / cancel a domain request
  async deleteCustomDomain(orgId: string, userId: string, domainRequestId: string) {
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { id: domainRequestId, orgId },
    });
    if (!req) {
      throw new NotFoundException('Domain request not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orgDomainRequest.delete({
        where: { id: domainRequestId },
      });

      const org = await tx.organisation.findUnique({ where: { id: orgId } });
      if (org?.customDomain === req.customDomain) {
        // Fall back to another active domain request if present
        const another = await tx.orgDomainRequest.findFirst({
          where: {
            orgId,
            kind: 'custom_domain',
            status: { in: ['connected', 'approved'] },
          },
          orderBy: { requestedAt: 'desc' },
        });

        if (another) {
          await tx.organisation.update({
            where: { id: orgId },
            data: {
              customDomain: another.customDomain,
              customDomainStatus: another.status,
              customDomainLandingPageId: another.landingPageId,
            },
          });
        } else {
          await tx.organisation.update({
            where: { id: orgId },
            data: {
              customDomain: null,
              customDomainStatus: 'none',
              customDomainLandingPageId: null,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: 'custom_domain_deleted',
          entity: 'OrgDomainRequest',
          entityId: domainRequestId,
          metadata: { domain: req.customDomain } as any,
        },
      });
    });

    return { success: true, id: domainRequestId };
  }

  private async assertDomainAvailable(host: string) {
    const ownedByOtherOrg = await this.prisma.organisation.findFirst({
      where: { customDomain: host, status: { not: 'draft' } },
      select: { id: true },
    });
    if (ownedByOtherOrg) {
      throw new ConflictException(`Domain "${host}" is already mapped to another organisation.`);
    }
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: {
        customDomain: host,
        status: { in: ['pending', 'approved', 'connected'] },
      },
      select: { id: true },
    });
    if (req) {
      throw new ConflictException(`Domain "${host}" is currently in use or pending review.`);
    }
  }
}
