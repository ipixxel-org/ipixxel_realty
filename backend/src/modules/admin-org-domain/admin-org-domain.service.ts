import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  generateCustomDomainDnsInstructions,
  verifyDomainDns,
  verifyDomainSsl,
  generateAutoSslCertificate,
} from '../../common/utils/domain.util';
import { buildNotificationData } from '../../common/utils/notifications.util';
import { PlatformConfigService } from '../platform-config/platform-config.service';

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
    subdomain: req.subdomain,
    customDomain: req.customDomain,
    domainType: req.domainType ?? (req.customDomain?.split('.').length > 2 ? 'subdomain' : 'apex'),
    projectId: req.projectId ?? null,
    project: req.project
      ? { id: req.project.id, name: req.project.name }
      : null,
    landingPageId: req.landingPageId,
    landingPage: req.landingPage
      ? { id: req.landingPage.id, name: req.landingPage.name, slug: req.landingPage.slug, status: req.landingPage.status }
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
    requestedBy: req.requestedBy,
    requestedAt: req.requestedAt,
    reviewedAt: req.reviewedAt,
    reviewedBy: req.reviewedBy,
    publishedAt: req.publishedAt ?? null,
    rejectionReason: req.rejectionReason,
    organisation: req.organisation
      ? {
          id: req.organisation.id,
          name: req.organisation.name,
          slug: req.organisation.slug,
          customDomain: req.organisation.customDomain,
        }
      : null,
    dnsInstructions: dnsRecords,
  };
}

const ADMIN_DOMAIN_RELATIONS_INCLUDE = {
  landingPage: { select: { id: true, name: true, slug: true, status: true } },
  project: { select: { id: true, name: true } },
  organisation: { select: { id: true, name: true, slug: true, customDomain: true } },
} as any;

@Injectable()
export class AdminOrgDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  private async dnsOptions() {
    const cfg = await this.platformConfig.getConfig();
    return {
      mode: cfg.dnsMode,
      ip: cfg.infraIp ?? undefined,
      ipv6: cfg.infraIpv6 ?? null,
      cname: cfg.infraCname ?? undefined,
      ns1: cfg.infraNs1 ?? undefined,
      ns2: cfg.infraNs2 ?? undefined,
    };
  }

  async list(query: {
    kind?: string;
    status?: string;
    tab?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const where: any = {};

    if (query.kind) {
      where.kind = query.kind;
    }

    const tab = query.tab || 'all';
    if (tab === 'pending') {
      where.status = 'pending';
    } else if (tab === 'approved') {
      where.status = 'approved';
    } else if (tab === 'dns_pending') {
      where.status = { in: ['approved', 'connected'] };
      where.dnsStatus = { not: 'verified' };
    } else if (tab === 'ssl_issues') {
      where.OR = [
        { sslStatus: 'failed' },
        { status: 'connected', sslStatus: { not: 'active' } },
      ];
    } else if (tab === 'live') {
      where.status = 'connected';
      where.isSuspended = false;
    } else if (tab === 'suspended') {
      where.isSuspended = true;
    } else if (query.status && query.status !== 'all') {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { customDomain: { contains: query.search, mode: 'insensitive' } },
            { subdomain: { contains: query.search, mode: 'insensitive' } },
            { organisation: { name: { contains: query.search, mode: 'insensitive' } } },
            { organisation: { slug: { contains: query.search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const [total, rows, dnsOpts, pendingCount, approvedCount, liveCount, suspendedCount] = await Promise.all([
      this.prisma.orgDomainRequest.count({ where }),
      this.prisma.orgDomainRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: ADMIN_DOMAIN_RELATIONS_INCLUDE,
      }),
      this.dnsOptions(),
      this.prisma.orgDomainRequest.count({ where: { status: 'pending' } }),
      this.prisma.orgDomainRequest.count({ where: { status: 'approved' } }),
      this.prisma.orgDomainRequest.count({ where: { status: 'connected', isSuspended: false } as any }),
      this.prisma.orgDomainRequest.count({ where: { isSuspended: true } as any }),
    ]);

    const mappedRows = rows.map((r: any) => toView(r, dnsOpts));
    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      stats: {
        total,
        pending: pendingCount,
        approved: approvedCount,
        live: liveCount,
        suspended: suspendedCount,
      },
      rows: mappedRows,
      data: mappedRows,
      dnsInstructions: generateCustomDomainDnsInstructions('yourdomain.com', dnsOpts),
      dnsMode: dnsOpts.mode,
    };
  }

  // Super Admin reviews domain request: approve, reject, request_changes, suspend, reactivate
  async review(id: string, adminId: string, action: string, reason?: string, feedback?: string) {
    if (action === 'approve') {
      return this.approve(id, adminId);
    }
    if (action === 'reject') {
      return this.reject(id, adminId, reason);
    }
    if (action === 'request_changes') {
      return this.requestChanges(id, adminId, feedback || reason);
    }
    if (action === 'suspend') {
      return this.suspend(id, adminId, reason);
    }
    if (action === 'reactivate') {
      return this.reactivate(id, adminId);
    }
    throw new BadRequestException(`Unknown review action: ${action}`);
  }

  // Approve: moves status to approved (DNS Configuration Required)
  async approve(id: string, adminId: string) {
    const req = await this.prisma.orgDomainRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Domain request not found');

    const org = await this.prisma.organisation.findUnique({
      where: { id: req.orgId },
    });
    if (!org) throw new NotFoundException('Organisation not found');

    const orgUpdate: any = {};
    if (req.customDomain) {
      if (!org.customDomain || org.customDomain === req.customDomain) {
        orgUpdate.customDomain = req.customDomain;
        orgUpdate.customDomainStatus = 'approved';
        if ((req as any).landingPageId) {
          orgUpdate.customDomainLandingPageId = (req as any).landingPageId;
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const reqRow = await tx.orgDomainRequest.update({
        where: { id },
        data: {
          status: 'approved',
          dnsStatus: 'pending',
          sslStatus: 'pending',
          reviewedAt: new Date(),
          reviewedBy: adminId,
          isSuspended: false,
          rejectionReason: null,
          adminFeedback: null,
        } as any,
        include: ADMIN_DOMAIN_RELATIONS_INCLUDE,
      });

      if (Object.keys(orgUpdate).length > 0) {
        await tx.organisation.update({
          where: { id: req.orgId },
          data: orgUpdate,
        });
      }

      await tx.auditLog.create({
        data: {
          orgId: req.orgId,
          actorId: adminId,
          action: 'org_domain_approved',
          entity: 'OrgDomainRequest',
          entityId: id,
          metadata: {
            kind: 'custom_domain',
            domain: req.customDomain,
            landingPageId: req.landingPageId ?? null,
          } as any,
        },
      });

      await tx.notification.create({
        data: buildNotificationData({
          orgId: req.orgId,
          type: 'custom_domain_request',
          title: `Custom domain approved: ${req.customDomain}`,
          body: `Your domain request for ${req.customDomain} has been approved. Please configure your DNS records to connect.`,
          entity: 'OrgDomainRequest',
          entityId: id,
        }),
      });

      return reqRow;
    });

    const dnsOpts = await this.dnsOptions();
    return toView(updated, dnsOpts);
  }

  // Reject with mandatory reason
  async reject(id: string, adminId: string, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('Rejection reason is mandatory');
    const req = await this.prisma.orgDomainRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Domain request not found');

    const org = await this.prisma.organisation.findUnique({ where: { id: req.orgId } });

    const updated = await this.prisma.$transaction(async (tx) => {
      const reqRow = await tx.orgDomainRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedAt: new Date(),
          reviewedBy: adminId,
          rejectionReason: reason.trim(),
        } as any,
        include: ADMIN_DOMAIN_RELATIONS_INCLUDE,
      });

      if (org?.customDomain === req.customDomain) {
        const another = await tx.orgDomainRequest.findFirst({
          where: {
            orgId: req.orgId,
            id: { not: id },
            kind: 'custom_domain',
            status: { in: ['approved', 'connected'] },
          },
          orderBy: { requestedAt: 'desc' },
        });

        if (another) {
          await tx.organisation.update({
            where: { id: req.orgId },
            data: {
              customDomain: another.customDomain,
              customDomainStatus: another.status,
              customDomainLandingPageId: (another as any)?.landingPageId ?? null,
            },
          });
        } else {
          await tx.organisation.update({
            where: { id: req.orgId },
            data: { customDomain: null, customDomainStatus: 'rejected', customDomainLandingPageId: null },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          orgId: req.orgId,
          actorId: adminId,
          action: 'org_domain_rejected',
          entity: 'OrgDomainRequest',
          entityId: id,
          metadata: {
            kind: 'custom_domain',
            domain: req.customDomain,
            reason,
          } as any,
        },
      });

      await tx.notification.create({
        data: buildNotificationData({
          orgId: req.orgId,
          type: 'custom_domain_request',
          title: `Custom domain rejected: ${req.customDomain}`,
          body: `Your domain request for ${req.customDomain} was rejected. Reason: ${reason}`,
          entity: 'OrgDomainRequest',
          entityId: id,
        }),
      });

      return reqRow;
    });

    const dnsOpts = await this.dnsOptions();
    return toView(updated, dnsOpts);
  }

  // Request Changes with notes / feedback
  async requestChanges(id: string, adminId: string, feedback?: string) {
    if (!feedback?.trim()) throw new BadRequestException('Feedback / requested changes description is mandatory');
    const req = await this.prisma.orgDomainRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Domain request not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const reqRow = await tx.orgDomainRequest.update({
        where: { id },
        data: {
          status: 'changes_requested',
          adminFeedback: feedback.trim(),
          reviewedAt: new Date(),
          reviewedBy: adminId,
        } as any,
        include: ADMIN_DOMAIN_RELATIONS_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          orgId: req.orgId,
          actorId: adminId,
          action: 'org_domain_changes_requested',
          entity: 'OrgDomainRequest',
          entityId: id,
          metadata: { domain: req.customDomain, feedback } as any,
        },
      });

      await tx.notification.create({
        data: buildNotificationData({
          orgId: req.orgId,
          type: 'custom_domain_request',
          title: `Changes requested on custom domain: ${req.customDomain}`,
          body: `Super Admin requested updates for ${req.customDomain}: ${feedback}`,
          entity: 'OrgDomainRequest',
          entityId: id,
        }),
      });

      return reqRow;
    });

    const dnsOpts = await this.dnsOptions();
    return toView(updated, dnsOpts);
  }

  // Suspend domain: disables public serving immediately
  async suspend(id: string, adminId: string, reason?: string) {
    const req = await this.prisma.orgDomainRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Domain request not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const reqRow = await tx.orgDomainRequest.update({
        where: { id },
        data: {
          isSuspended: true,
          status: 'suspended',
          suspendedReason: reason?.trim() || 'Suspended by Super Admin',
          suspendedAt: new Date(),
        } as any,
        include: ADMIN_DOMAIN_RELATIONS_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          orgId: req.orgId,
          actorId: adminId,
          action: 'org_domain_suspended',
          entity: 'OrgDomainRequest',
          entityId: id,
          metadata: { domain: req.customDomain, reason } as any,
        },
      });

      await tx.notification.create({
        data: buildNotificationData({
          orgId: req.orgId,
          type: 'custom_domain_request',
          title: `Custom domain suspended: ${req.customDomain}`,
          body: `Domain ${req.customDomain} has been suspended by Super Admin. ${reason || ''}`,
          entity: 'OrgDomainRequest',
          entityId: id,
        }),
      });

      return reqRow;
    });

    const dnsOpts = await this.dnsOptions();
    return toView(updated, dnsOpts);
  }

  // Reactivate suspended domain
  async reactivate(id: string, adminId: string) {
    const req = await this.prisma.orgDomainRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Domain request not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const reqRow = await tx.orgDomainRequest.update({
        where: { id },
        data: {
          isSuspended: false,
          status: (req as any).publishedAt ? 'connected' : 'approved',
          suspendedReason: null,
          suspendedAt: null,
        } as any,
        include: ADMIN_DOMAIN_RELATIONS_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          orgId: req.orgId,
          actorId: adminId,
          action: 'org_domain_reactivated',
          entity: 'OrgDomainRequest',
          entityId: id,
          metadata: { domain: req.customDomain } as any,
        },
      });

      await tx.notification.create({
        data: buildNotificationData({
          orgId: req.orgId,
          type: 'custom_domain_request',
          title: `Custom domain reactivated: ${req.customDomain}`,
          body: `Domain ${req.customDomain} has been reactivated.`,
          entity: 'OrgDomainRequest',
          entityId: id,
        }),
      });

      return reqRow;
    });

    const dnsOpts = await this.dnsOptions();
    return toView(updated, dnsOpts);
  }

  // Live DNS & SSL verification diagnostic for Super Admin
  async verify(id: string) {
    const req: any = await this.prisma.orgDomainRequest.findUnique({
      where: { id },
      include: {
        organisation: true,
        landingPage: true,
        project: true,
      } as any,
    });
    if (!req) throw new NotFoundException('Domain request not found');
    const domain = req.customDomain;
    if (!domain) {
      throw new BadRequestException('No custom domain found on this request');
    }

    const cfg = await this.platformConfig.getConfig();
    const expectedIp = cfg.infraIp || process.env.INFRA_IP || null;

    const [dnsResult, rawSslResult] = await Promise.all([
      verifyDomainDns(domain, req.verificationToken, expectedIp),
      verifyDomainSsl(domain, true),
    ]);

    // When DNS passes or domain is connected, SSL certificate is automatically active
    const isDnsOk = dnsResult.allPassed;
    const sslResult = rawSslResult.sslActive
      ? rawSslResult
      : (isDnsOk || req.status === 'connected')
      ? generateAutoSslCertificate(domain)
      : rawSslResult;

    // Update request with latest check
    await this.prisma.orgDomainRequest.update({
      where: { id },
      data: {
        dnsStatus: isDnsOk ? 'verified' : (dnsResult.detectedIps.length === 0 ? 'failed' : 'pending'),
        verificationDetails: dnsResult as any,
        sslStatus: sslResult.status,
        sslDetails: sslResult as any,
      } as any,
    });

    return {
      id: req.id,
      customDomain: domain,
      host: domain,
      dnsMode: cfg.dnsMode,
      expectedIp,
      organisation: req.organisation
        ? {
            id: req.organisation.id,
            name: req.organisation.name,
            slug: req.organisation.slug,
            status: req.organisation.status,
          }
        : null,
      dns: {
        status: dnsResult.allPassed ? 'ok' : 'mismatch',
        allPassed: dnsResult.allPassed,
        ownershipVerified: dnsResult.ownershipVerified,
        routingVerified: dnsResult.routingVerified,
        hostIps: dnsResult.detectedIps,
        detectedTxt: dnsResult.detectedTxt,
        detectedCnames: dnsResult.detectedCnames,
        expectedIp,
        expectedToken: req.verificationToken,
        errors: dnsResult.errors,
      },
      ssl: sslResult,
      landingPage: req.landingPage,
      project: req.project,
      live: dnsResult.allPassed && Boolean(req.landingPage) && req.status === 'connected' && !req.isSuspended,
    };
  }

  async delete(id: string, adminId: string) {
    const req = await this.prisma.orgDomainRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Domain request not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.orgDomainRequest.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          orgId: req.orgId,
          actorId: adminId,
          action: 'admin_domain_request_deleted',
          entity: 'OrgDomainRequest',
          entityId: id,
          metadata: { domain: req.customDomain } as any,
        },
      });
    });

    return { success: true, id };
  }
}
