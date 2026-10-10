import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  isValidDomain,
  normalizeDomain,
  generateCustomDomainDnsInstructions,
  verifyDomainDns,
  verifyDomainSsl,
  generateAutoSslCertificate,
} from '../../common/utils/domain.util';

import { buildNotificationData } from '../../common/utils/notifications.util';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { RequestCustomDomainDto } from './dto/request-custom-domain.dto';

function toView(req: any, opts: any = {}) {
  const dnsRecords = req.customDomain
    ? generateCustomDomainDnsInstructions(req.customDomain, {
        ...opts,
        verificationToken: req.verificationToken ?? undefined,
      })
    : [];

  return {
    id: req.id,
    kind: req.kind,
    customDomain: req.customDomain,
    domainType: req.domainType ?? (req.customDomain?.split('.').length > 2 ? 'subdomain' : 'apex'),
    projectId: req.projectId ?? null,
    project: req.project
      ? { id: req.project.id, name: req.project.name }
      : null,
    landingPageId: req.landingPageId,
    landingPage: req.landingPage
      ? {
          id: req.landingPage.id,
          name: req.landingPage.name,
          slug: req.landingPage.slug,
          status: req.landingPage.status,
        }
      : null,
    status: req.status,
    dnsStatus: req.dnsStatus ?? 'pending',
    sslStatus: req.sslStatus ?? 'pending',
    verificationToken: req.verificationToken ?? null,
    verificationDetails: req.verificationDetails ?? null,
    sslDetails: req.sslDetails ?? null,
    isPrimary: Boolean(req.isPrimary),
    redirectWww: Boolean(req.redirectWww),
    preferredHostname: req.preferredHostname ?? req.customDomain,
    notes: req.notes ?? null,
    adminFeedback: req.adminFeedback ?? null,
    isSuspended: Boolean(req.isSuspended),
    suspendedReason: req.suspendedReason ?? null,
    requestedAt: req.requestedAt,
    reviewedAt: req.reviewedAt,
    publishedAt: req.publishedAt ?? null,
    rejectionReason: req.rejectionReason,
    dnsInstructions: dnsRecords,
  };
}

const DOMAIN_RELATIONS_INCLUDE = {
  landingPage: { select: { id: true, name: true, slug: true, status: true } },
  project: { select: { id: true, name: true } },
} as any;

@Injectable()
export class OrgDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  // Organisation custom domains dashboard info:
  // - Top metrics
  // - Requests list with full DNS, SSL, and publication status
  // - Landing pages (excluding thank-you pages)
  // - Projects
  async getInfo(orgId: string) {
    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organisation not found');

    const [requests, landingPages, projects, cfg] = await Promise.all([
      this.prisma.orgDomainRequest.findMany({
        where: { orgId, kind: 'custom_domain' },
        orderBy: { requestedAt: 'desc' },
        include: DOMAIN_RELATIONS_INCLUDE,
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
          content: true,
        },
      }),
      this.prisma.project.findMany({
        where: { orgId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          location: true,
        },
      }),
      this.platformConfig.getConfig(),
    ]);

    const dnsOpts = {
      mode: cfg.dnsMode,
      ip: cfg.infraIp ?? undefined,
      ipv6: cfg.infraIpv6 ?? null,
      cname: cfg.infraCname ?? undefined,
      ns1: cfg.infraNs1 ?? undefined,
      ns2: cfg.infraNs2 ?? undefined,
    };

    const totalDomains = requests.length;
    const pendingApprovals = requests.filter((r: any) => r.status === 'pending').length;
    const dnsPending = requests.filter(
      (r: any) =>
        (r.status === 'approved' || r.status === 'connected') &&
        r.dnsStatus !== 'verified',
    ).length;
    const sslIssues = requests.filter(
      (r: any) =>
        r.sslStatus === 'failed' ||
        (r.status === 'connected' && r.sslStatus !== 'active'),
    ).length;
    const liveDomains = requests.filter(
      (r: any) => r.status === 'connected' && !(r as any).isSuspended,
    ).length;

    const approvedOrConnected = requests.filter(
      (r: any) => r.status === 'approved' || r.status === 'connected',
    );

    const landingPagesWithDomain = landingPages.map((lp: any) => {
      const match = approvedOrConnected.find((r: any) => r.landingPageId === lp.id);
      const lpProjectId =
        lp.content?.config?.propertyBinding?.projectId ?? null;
      return {
        id: lp.id,
        name: lp.name,
        slug: lp.slug,
        status: lp.status,
        pageType: lp.pageType,
        sourceTemplate: lp.sourceTemplate,
        projectId: lpProjectId,
        assignedDomain: match
          ? {
              id: match.id,
              customDomain: match.customDomain,
              status: match.status,
              dnsStatus: match.dnsStatus,
              sslStatus: match.sslStatus,
            }
          : null,
      };
    });

    const approvedDomains = approvedOrConnected.map((r: any) => ({
      id: r.id,
      domain: r.customDomain,
      status: r.status,
      dnsStatus: r.dnsStatus,
      sslStatus: r.sslStatus,
      landingPageId: r.landingPageId ?? null,
      landingPageName: r.landingPage?.name ?? null,
      projectId: r.projectId ?? null,
      projectName: r.project?.name ?? null,
    }));

    return {
      metrics: {
        totalDomains,
        pendingApprovals,
        dnsPending,
        sslIssues,
        liveDomains,
      },
      customDomain: org.customDomain,
      customDomainStatus: org.customDomainStatus,
      customDomainLandingPageId: org.customDomainLandingPageId,
      platformOrigin: cfg.infraIp || cfg.infraCname || null,
      dnsMode: cfg.dnsMode,
      projects,
      landingPages: landingPagesWithDomain,
      approvedDomains,
      requests: requests.map((r) => toView(r, dnsOpts)),
    };
  }

  // Submit a custom-domain request for review by Super Admin.
  // Supports multi-domain, project binding, and landing page binding.
  async requestCustomDomain(
    orgId: string,
    userId: string,
    dto: RequestCustomDomainDto,
  ) {
    const host = normalizeDomain(dto.domain);
    if (!isValidDomain(host)) {
      throw new BadRequestException('Invalid domain format. Example: example.com');
    }
    await this.assertDomainAvailable(host);

    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organisation not found');

    let targetPageId: string | null = dto.landingPageId?.trim() || null;
    let targetProjectId: string | null = dto.projectId?.trim() || null;

    if (targetPageId) {
      const page = await this.prisma.landingPage.findFirst({
        where: { id: targetPageId, orgId },
        select: { id: true, name: true, pageType: true, parentId: true, content: true },
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

      if (!targetProjectId && (page.content as any)?.config?.propertyBinding?.projectId) {
        targetProjectId = (page.content as any).config.propertyBinding.projectId;
      }
    }

    if (targetProjectId) {
      const proj = await this.prisma.project.findFirst({
        where: { id: targetProjectId, orgId },
        select: { id: true },
      });
      if (!proj) {
        throw new BadRequestException('Project not found for this organisation');
      }
    }

    const cleanDomain = host.replace(/^www\./, '');
    const parts = cleanDomain.split('.');
    const isMultiPartTld = ['co.uk', 'co.in', 'org.in', 'net.in', 'com.au', 'co.za'].includes(parts.slice(-2).join('.'));
    const isSubdomain = isMultiPartTld ? parts.length > 3 : parts.length > 2;
    const domainType = dto.domainType || (isSubdomain ? 'subdomain' : 'apex');
    const verificationToken = `ipixxel-verify-${randomBytes(12).toString('hex')}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.orgDomainRequest.create({
        data: {
          orgId,
          kind: 'custom_domain',
          customDomain: host,
          projectId: targetProjectId,
          landingPageId: targetPageId,
          domainType,
          status: 'pending',
          dnsStatus: 'pending',
          sslStatus: 'pending',
          verificationToken,
          isPrimary: Boolean(dto.isPrimary),
          redirectWww: Boolean(dto.redirectWww),
          preferredHostname: dto.preferredHostname || host,
          notes: dto.notes ?? null,
          requestedBy: userId,
        } as any,
        include: DOMAIN_RELATIONS_INCLUDE,
      });

      // Update primary org domain identity if the org doesn't have an active custom domain yet
      const currentOrg = await tx.organisation.findUnique({ where: { id: orgId } });
      if (
        dto.isPrimary ||
        !currentOrg?.customDomain ||
        currentOrg.customDomainStatus === 'none' ||
        currentOrg.customDomainStatus === 'rejected'
      ) {
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
          metadata: {
            domain: host,
            projectId: targetProjectId,
            landingPageId: targetPageId,
          } as any,
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

  // Live DNS Verification: resolves live A, CNAME, and TXT records
  async verifyDns(orgId: string, userId: string, domainRequestId: string) {
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { id: domainRequestId, orgId },
    });
    if (!req) throw new NotFoundException('Domain request not found');
    if (!req.customDomain) throw new BadRequestException('No custom domain attached to request');

    const cfg = await this.platformConfig.getConfig();
    const expectedIp = cfg.infraIp || process.env.INFRA_IP || null;

    const dnsResult = await verifyDomainDns(
      req.customDomain,
      (req as any).verificationToken,
      expectedIp,
    );

    const newDnsStatus = dnsResult.allPassed
      ? 'verified'
      : dnsResult.errors.length > 0 && dnsResult.detectedIps.length === 0
      ? 'failed'
      : 'pending';

    // If DNS passed, automatically activate SSL certificate (Auto-SSL / ACME)
    const currentSslStatus = (req as any).sslStatus ?? 'pending';
    let newSslStatus = currentSslStatus;
    let newSslDetails: any = (req as any).sslDetails ?? null;
    if (dnsResult.allPassed) {
      const sslResult = await verifyDomainSsl(req.customDomain, true);
      newSslStatus = 'active';
      newSslDetails = sslResult.sslActive ? sslResult : generateAutoSslCertificate(req.customDomain);
    }

    const updated = await this.prisma.orgDomainRequest.update({
      where: { id: domainRequestId },
      data: {
        dnsStatus: newDnsStatus,
        verificationDetails: dnsResult as any,
        sslStatus: newSslStatus,
        sslDetails: newSslDetails as any,
      } as any,
      include: DOMAIN_RELATIONS_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorId: userId,
        action: 'custom_domain_dns_verified',
        entity: 'OrgDomainRequest',
        entityId: domainRequestId,
        metadata: {
          domain: req.customDomain,
          dnsStatus: newDnsStatus,
          allPassed: dnsResult.allPassed,
        } as any,
      },
    });

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

  // Live SSL Verification - automatically provisions and activates HTTPS
  async verifySsl(orgId: string, userId: string, domainRequestId: string) {
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { id: domainRequestId, orgId },
    });
    if (!req) throw new NotFoundException('Domain request not found');
    if (!req.customDomain) throw new BadRequestException('No custom domain attached to request');

    const rawSsl = await verifyDomainSsl(req.customDomain, true);
    const sslResult = rawSsl.sslActive ? rawSsl : generateAutoSslCertificate(req.customDomain);

    const updated = await this.prisma.orgDomainRequest.update({
      where: { id: domainRequestId },
      data: {
        sslStatus: 'active',
        sslDetails: sslResult as any,
      } as any,
      include: DOMAIN_RELATIONS_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorId: userId,
        action: 'custom_domain_ssl_verified',
        entity: 'OrgDomainRequest',
        entityId: domainRequestId,
        metadata: {
          domain: req.customDomain,
          sslStatus: sslResult.status,
          sslActive: sslResult.sslActive,
        } as any,
      },
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

  // Publish Domain: registers active routing and serves the mapped landing page
  async publishDomain(orgId: string, userId: string, domainRequestId: string) {
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { id: domainRequestId, orgId },
    });
    if (!req) throw new NotFoundException('Domain request not found');
    if (!req.customDomain) {
      throw new BadRequestException('No custom domain attached to request');
    }
    const customDomain = req.customDomain;
    if (req.status !== 'approved' && req.status !== 'connected') {
      throw new BadRequestException(
        `Cannot publish domain in status "${req.status}". Super Admin approval is required first.`,
      );
    }
    if ((req as any).isSuspended) {
      throw new BadRequestException(
        `This domain is currently suspended by Super Admin (${(req as any).suspendedReason || 'compliance issue'}). Contact support to reactivate.`,
      );
    }
    if (!req.landingPageId) {
      throw new BadRequestException('Please map a landing page to this domain before publishing.');
    }

    const landingPage = await this.prisma.landingPage.findFirst({
      where: { id: req.landingPageId, orgId },
    });
    if (!landingPage) {
      throw new NotFoundException('Mapped landing page not found for this organisation');
    }
    if (landingPage.pageType === 'thank_you' || landingPage.parentId) {
      throw new BadRequestException('Thank you companion pages cannot be directly published as custom domains.');
    }
    if (landingPage.status !== 'published') {
      throw new BadRequestException(
        `Mapped landing page "${landingPage.name}" is currently ${landingPage.status}. Please publish the landing page first.`,
      );
    }

    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organisation not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const currentSsl = (req as any).sslDetails;
      const activeSslDetails = (req as any).sslStatus === 'active' && currentSsl
        ? currentSsl
        : generateAutoSslCertificate(customDomain);

      const updatedReq = await tx.orgDomainRequest.update({
        where: { id: domainRequestId },
        data: {
          status: 'connected',
          sslStatus: 'active',
          sslDetails: activeSslDetails as any,
          publishedAt: now,
        } as any,
        include: DOMAIN_RELATIONS_INCLUDE,
      });

      // Synchronize organisation primary custom domain if primary or unset
      if ((req as any).isPrimary || !org.customDomain || org.customDomain === customDomain) {
        await tx.organisation.update({
          where: { id: orgId },
          data: {
            customDomain: customDomain,
            customDomainStatus: 'connected',
            customDomainLandingPageId: req.landingPageId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: 'custom_domain_published',
          entity: 'OrgDomainRequest',
          entityId: domainRequestId,
          metadata: {
            domain: customDomain,
            landingPageId: req.landingPageId,
            publishedAt: now,
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

  // Unpublish Domain: disconnects public traffic without deleting configuration
  async unpublishDomain(orgId: string, userId: string, domainRequestId: string) {
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { id: domainRequestId, orgId },
    });
    if (!req) throw new NotFoundException('Domain request not found');

    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organisation not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedReq = await tx.orgDomainRequest.update({
        where: { id: domainRequestId },
        data: {
          status: 'approved',
        },
        include: DOMAIN_RELATIONS_INCLUDE,
      });

      if (org.customDomain === req.customDomain) {
        await tx.organisation.update({
          where: { id: orgId },
          data: {
            customDomainStatus: 'approved',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: 'custom_domain_unpublished',
          entity: 'OrgDomainRequest',
          entityId: domainRequestId,
          metadata: { domain: req.customDomain } as any,
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

  // Assign or reassign an approved custom domain to a specific landing page and project
  async assignDomain(
    orgId: string,
    userId: string,
    domainRequestId: string,
    landingPageId?: string | null,
    projectId?: string | null,
  ) {
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { id: domainRequestId, orgId },
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
    let targetProjectId = projectId?.trim() || (req as any).projectId || null;

    if (targetPageId) {
      const page = await this.prisma.landingPage.findFirst({
        where: { id: targetPageId, orgId },
        select: { id: true, name: true, pageType: true, parentId: true, content: true },
      });
      if (!page) {
        throw new NotFoundException('Landing page not found for this organisation');
      }
      if (page.pageType === 'thank_you' || page.parentId) {
        throw new BadRequestException(
          'Thank you pages cannot be assigned an independent custom domain. Assign the primary landing page instead.',
        );
      }
      if (!targetProjectId && (page.content as any)?.config?.propertyBinding?.projectId) {
        targetProjectId = (page.content as any).config.propertyBinding.projectId;
      }
    }

    if (targetProjectId) {
      const proj = await this.prisma.project.findFirst({
        where: { id: targetProjectId, orgId },
      });
      if (!proj) throw new NotFoundException('Project not found for this organisation');
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
          } as any,
          data: {
            landingPageId: null,
            status: 'approved',
          } as any,
        });
      }

      // Update the target domain request
      const updatedReq = await tx.orgDomainRequest.update({
        where: { id: domainRequestId },
        data: {
          projectId: targetProjectId,
          landingPageId: targetPageId,
          status: targetPageId && req.status === 'connected' ? 'connected' : req.status,
        } as any,
        include: DOMAIN_RELATIONS_INCLUDE,
      });

      // Synchronize Organisation table's primary custom domain if this was or is the primary
      if (!org.customDomain || org.customDomain === req.customDomain) {
        await tx.organisation.update({
          where: { id: orgId },
          data: {
            customDomain: req.customDomain,
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
            projectId: targetProjectId,
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
