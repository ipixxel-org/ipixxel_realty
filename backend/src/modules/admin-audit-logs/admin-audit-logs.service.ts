import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/** Human-friendly labels for every action the platform currently writes.
 *  Unknown actions fall back to a humanised version of the key. */
const ACTION_LABELS: Record<string, string> = {
  // auth / onboarding
  login: 'Sign in',
  logout: 'Sign out',
  org_registered_pending: 'Organisation registered',
  // organisations
  org_onboarded: 'Organisation onboarded',
  org_approved: 'Organisation approved',
  org_rejected: 'Organisation rejected',
  org_templates_updated: 'Organisation templates updated',
  org_deleted: 'Organisation deleted',
  org_domain_approved: 'Domain approved',
  org_domain_rejected: 'Domain rejected',
  // platform team & roles
  platform_member_created: 'Platform admin created',
  platform_member_updated: 'Platform admin updated',
  platform_member_removed: 'Platform admin removed',
  platform_role_created: 'Platform role created',
  platform_role_updated: 'Platform role updated',
  platform_role_deleted: 'Platform role deleted',
  platform_role_permissions_updated: 'Platform role permissions updated',
  org_role_created: 'Organisation role created',
  org_role_updated: 'Organisation role updated',
  org_role_deleted: 'Organisation role deleted',
  org_role_permissions_updated: 'Organisation role permissions updated',
  // billing / subscriptions
  plan_created: 'Plan created',
  plan_updated: 'Plan updated',
  plan_deleted: 'Plan deleted',
  subscription_created: 'Subscription created',
  subscription_updated: 'Subscription updated',
  // domains
  custom_domain_requested: 'Custom domain requested',
  // projects / units
  project_created: 'Project created',
  project_updated: 'Project updated',
  project_deleted: 'Project deleted',
  project_duplicated: 'Project duplicated',
  project_sales_agents_set: 'Project sales agents set',
  unit_type_created: 'Unit type created',
  unit_type_updated: 'Unit type updated',
  unit_type_deleted: 'Unit type deleted',
  unit_created: 'Unit created',
  unit_updated: 'Unit updated',
  unit_status_changed: 'Unit status changed',
  unit_deleted: 'Unit deleted',
  standalone_unit_created: 'Standalone unit created',
  standalone_unit_updated: 'Standalone unit updated',
  standalone_unit_deleted: 'Standalone unit deleted',
  // landing pages
  landing_page_created: 'Landing page created',
  landing_page_duplicated: 'Landing page duplicated',
  landing_page_published: 'Landing page published',
  landing_page_unpublished: 'Landing page unpublished',
  // users
  user_created: 'User created',
  user_updated: 'User updated',
  user_deleted: 'User deleted',
  user_status_changed: 'User status changed',
  user_approved: 'User approved',
  lead_created: 'Lead created',
  lead_updated: 'Lead updated',
  lead_deleted: 'Lead deleted',
};

function humanise(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanise(action);
}

const EXPORT_CAP = 5000;

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: ListAuditLogsQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.orgId) where.orgId = query.orgId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.moduleKey) where.moduleKey = query.moduleKey;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        if (!Number.isNaN(end.getTime())) {
          end.setUTCHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { entity: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term, mode: 'insensitive' } },
        { actor: { OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ] } },
        { organisation: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private toEntry(log: {
    id: string;
    orgId: string | null;
    actorId: string | null;
    moduleKey: string | null;
    action: string;
    entity: string | null;
    entityId: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    actor?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
    organisation?: { id: string; name: string } | null;
  }) {
    return {
      id: log.id,
      orgId: log.orgId,
      actorId: log.actorId,
      moduleKey: log.moduleKey,
      action: log.action,
      actionLabel: auditActionLabel(log.action),
      entity: log.entity,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt,
      actor: log.actor ?? null,
      organisation: log.organisation ?? null,
    };
  }

  async list(query: ListAuditLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          organisation: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      data: rows.map((log) => this.toEntry(log)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Distinct values used to populate the filter dropdowns. */
  async meta() {
    const [actions, actors, organisations, modules] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
      }),
      this.prisma.auditLog.findMany({
        where: { actorId: { not: null } },
        distinct: ['actorId'],
        select: {
          actorId: true,
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.auditLog.findMany({
        where: { orgId: { not: null } },
        distinct: ['orgId'],
        select: {
          orgId: true,
          organisation: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.auditLog.groupBy({ by: ['moduleKey'] }),
    ]);

    return {
      actions: actions.map((a) => ({
        value: a.action,
        label: auditActionLabel(a.action),
        count: a._count.action,
      })),
      actors: actors
        .filter((a) => a.actor)
        .map((a) => ({
          id: a.actorId!,
          name: [a.actor!.firstName, a.actor!.lastName]
            .filter(Boolean)
            .join(' ') || a.actor!.email,
          email: a.actor!.email,
        })),
      organisations: organisations
        .filter((o) => o.organisation)
        .map((o) => ({
          id: o.orgId!,
          name: o.organisation!.name,
        })),
      modules: modules
        .filter((m) => m.moduleKey)
        .map((m) => ({ key: m.moduleKey!, moduleKey: m.moduleKey! }))
        .filter((m) => m.moduleKey.includes('admin_')),
    };
  }

  /** JSON payload for the frontend's CSV export (kept on the server so the
   *  same filters drive both screen and file). */
  async export(query: ListAuditLogsQueryDto) {
    const where = this.buildWhere(query);
    const count = await this.prisma.auditLog.count({ where });
    if (count > EXPORT_CAP) {
      throw new BadRequestException(
        `Export is limited to ${EXPORT_CAP.toLocaleString()} rows. Narrow your filters.`,
      );
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_CAP,
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        organisation: { select: { id: true, name: true } },
      },
    });

    return {
      filename: `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      data: rows.map((log) => this.toEntry(log)),
    };
  }
}