import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Plan, Subscription } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  applyRetention,
  RETENTION_KINDS,
  loadRetentionCandidates,
  pickRetention,
  rankRetention,
  retentionLimits,
  savedChoiceFor,
  whatStaysFor,
} from '../../common/utils/retention.util';
import {
  findFreePlan,
  getBillingExpiryConfig,
  notifyOrgAdmins,
} from '../../common/utils/subscription-lifecycle.util';
import {
  APPLIED_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  WHAT_STAYS_LOCKED_MESSAGE,
  whatStaysLockedForOrg,
} from './what-stays';
import { billingError } from './billing-checkout.service';
import { planRanker, toBillingPlan } from './plan-modules';
import type {
  RetentionChoicesV2,
  RetentionItemV2,
  RetentionSummaryV2,
} from './billing.types';
import type { SaveRetentionChoicesDto } from './dto/retention.dto';

const shortDate = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type SubWithPlan = Subscription & { plan: Plan };

/**
 * Billing v2 step 6 — "choose what stays". Which users, projects, landing
 * pages and templates stay active on a smaller plan: shown, chosen and saved
 * here; applied by retention.util whenever the plan changes. The org can
 * change it until the change is decided or takes effect (what-stays.ts);
 * Super Admin any time (applied at once when the org is on that plan).
 */
@Injectable()
export class BillingRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  private async context(orgId: string) {
    const [sub, active] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { orgId, status: { not: 'cancelled' } },
        include: { plan: true },
      }),
      this.prisma.plan.findMany({ where: { isActive: true } }),
    ]);
    return { sub, active };
  }

  /**
   * The plan the org is heading to: a scheduled downgrade, else the free plan
   * (cancelling, falling back after grace, or already there).
   */
  private async defaultTarget(sub: SubWithPlan | null, active: Plan[]) {
    if (sub?.scheduledPlanId) {
      const scheduled = active.find((p) => p.id === sub.scheduledPlanId);
      if (scheduled) return scheduled;
    }
    return findFreePlan(this.prisma);
  }

  /** When the choice takes effect; null when the org is already on that plan. */
  private appliesOn(sub: SubWithPlan | null, target: Plan): string | null {
    if (!sub || sub.planId === target.id) return null;
    if (sub.status === 'past_due' && sub.graceEndsAt)
      return isoDate(sub.graceEndsAt);
    return sub.renewsAt ? isoDate(sub.renewsAt) : null;
  }

  /**
   * The plan to choose for: the request's plan when `requestId` is given
   * (it must be this org's), else `targetPlanId`, else the plan the org is
   * heading to.
   */
  private async resolveTarget(
    orgId: string,
    sub: SubWithPlan | null,
    active: Plan[],
    targetPlanId?: string,
    requestId?: string,
  ) {
    let request: { id: string; status: string; targetPlanId: string } | null =
      null;
    if (requestId) {
      request = await this.prisma.packageChangeRequest.findFirst({
        where: { id: requestId, orgId },
        select: { id: true, status: true, targetPlanId: true },
      });
      if (!request) {
        throw billingError('request_not_found', 'That request was not found.');
      }
      if (targetPlanId && targetPlanId !== request.targetPlanId) {
        throw billingError(
          'plan_not_found',
          "That plan isn't the one this request is for.",
        );
      }
    }
    const id = request?.targetPlanId ?? targetPlanId;
    const target = id
      ? (active.find((p) => p.id === id) ??
        // A request's plan may have been archived since; still show it.
        (request ? await this.prisma.plan.findUnique({ where: { id } }) : null))
      : await this.defaultTarget(sub, active);
    if (!target) {
      throw billingError('plan_not_found', 'That plan is not available.');
    }
    return { target, request };
  }

  /**
   * GET /org/billing/retention. `locked`: the org can only look (the change
   * was decided or took effect — whatStaysLockedForOrg); Super Admin can
   * still change it.
   */
  async getChoices(
    orgId: string,
    targetPlanId?: string,
    requestId?: string,
  ): Promise<RetentionChoicesV2> {
    const { sub, active } = await this.context(orgId);
    const { target } = await this.resolveTarget(
      orgId,
      sub,
      active,
      targetPlanId,
      requestId,
    );
    const locked = await whatStaysLockedForOrg(
      this.prisma,
      orgId,
      target.id,
      requestId,
    );
    return this.choicesFor(orgId, sub, active, target, locked);
  }

  /** GET /admin/billing/subscriptions/:orgId/retention — never locked. */
  async adminGetChoices(
    orgId: string,
    targetPlanId?: string,
    requestId?: string,
  ): Promise<RetentionChoicesV2> {
    const { sub, active } = await this.context(orgId);
    const { target } = await this.resolveTarget(
      orgId,
      sub,
      active,
      targetPlanId ?? (requestId ? undefined : sub?.planId),
      requestId,
    );
    return this.choicesFor(orgId, sub, active, target, false);
  }

  private async choicesFor(
    orgId: string,
    sub: SubWithPlan | null,
    active: Plan[],
    target: Plan,
    locked: boolean,
  ): Promise<RetentionChoicesV2> {
    const ranked = rankRetention(
      await loadRetentionCandidates(this.prisma, orgId),
    );
    const limits = retentionLimits(target);
    const saved = await savedChoiceFor(this.prisma, orgId, target.id);
    const defaults = pickRetention(ranked, limits, null);
    const selected = pickRetention(ranked, limits, saved);
    const rank = planRanker(
      active.some((p) => p.id === target.id) ? active : [...active, target],
    )(target);

    const item = (
      id: string,
      name: string,
      detail: string,
      reason: string,
      kind: (typeof RETENTION_KINDS)[number],
      locked = false,
    ): RetentionItemV2 => ({
      id,
      name,
      detail,
      reason,
      defaultPicked: defaults[kind].includes(id),
      selected: selected[kind].includes(id),
      locked,
    });
    return {
      targetPlan: toBillingPlan(target, rank),
      appliesOn: this.appliesOn(sub, target),
      isDefault: !saved,
      locked,
      users: ranked.users.map((u) => {
        const login = u.lastLoginAt
          ? `last login ${shortDate(u.lastLoginAt)}`
          : 'never signed in';
        const reason =
          u.role === 'owner'
            ? 'Owner — always stays'
            : u.role === 'admin'
              ? `Admin · ${login}`
              : login[0].toUpperCase() + login.slice(1);
        return item(
          u.id,
          u.name,
          `${u.roleName} · ${u.email}`,
          reason,
          'users',
          u.role === 'owner',
        );
      }),
      projects: ranked.projects.map((p) =>
        item(
          p.id,
          p.name,
          p.location ?? '',
          `Updated ${shortDate(p.updatedAt)}`,
          'projects',
        ),
      ),
      landingPages: ranked.landingPages.map((p) =>
        item(
          p.id,
          p.name,
          `/${p.slug}`,
          `${p.leadsLast30Days} lead${p.leadsLast30Days === 1 ? '' : 's'} in the last 30 days`,
          'landingPages',
        ),
      ),
      templates: ranked.templates.map((t) =>
        item(
          t.id,
          t.name,
          `Added ${shortDate(t.assignedAt)}`,
          t.pagesMade
            ? `${t.pagesMade} landing page${t.pagesMade === 1 ? '' : 's'} made from it` +
                (t.lastUsedAt ? ` · last used ${shortDate(t.lastUsedAt)}` : '')
            : 'No landing pages made from it yet',
          'templates',
        ),
      ),
    };
  }

  /**
   * PUT /org/billing/retention. Only while the change isn't decided yet:
   * before it's sent, while the request is pending or the change scheduled,
   * in grace before falling back to Basic. After that (and on the plan the
   * org is already on) it's what_stays_locked — Super Admin only.
   */
  async saveChoices(
    orgId: string,
    userId: string,
    dto: SaveRetentionChoicesDto,
  ): Promise<RetentionChoicesV2> {
    const { sub, active } = await this.context(orgId);
    const { target } = await this.resolveTarget(
      orgId,
      sub,
      active,
      dto.targetPlanId,
      dto.requestId,
    );
    if (
      await whatStaysLockedForOrg(this.prisma, orgId, target.id, dto.requestId)
    ) {
      throw billingError('what_stays_locked', WHAT_STAYS_LOCKED_MESSAGE);
    }
    const ids = await this.validate(orgId, target, dto);
    await this.store(orgId, userId, target.id, ids);
    await this.refreshOpenCopies(orgId, target);
    await this.audit(orgId, userId, 'retention_choices_saved', {
      targetPlanId: target.id,
      requestId: dto.requestId ?? null,
      ...ids,
    });
    return this.getChoices(orgId, target.id, dto.requestId);
  }

  /**
   * PUT /admin/billing/subscriptions/:orgId/retention — Super Admin, any time.
   * Before the change is applied it updates the saved choice (and the
   * request's copy); once applied (the org is on that plan) it applies at
   * once: pauses and unpauses to match. A request that was rejected,
   * withdrawn, undone or replaced never applied: request_closed.
   */
  async adminSaveChoices(
    orgId: string,
    adminId: string,
    dto: SaveRetentionChoicesDto,
  ): Promise<RetentionChoicesV2> {
    const { sub, active } = await this.context(orgId);
    const { target, request } = await this.resolveTarget(
      orgId,
      sub,
      active,
      dto.targetPlanId,
      dto.requestId,
    );
    const requestApplied =
      !!request &&
      (APPLIED_REQUEST_STATUSES as readonly string[]).includes(request.status);
    if (
      request &&
      !requestApplied &&
      !(OPEN_REQUEST_STATUSES as readonly string[]).includes(request.status)
    ) {
      throw billingError(
        'request_closed',
        "This change wasn't applied, so there's nothing to change.",
      );
    }
    const ids = await this.validate(orgId, target, dto);
    await this.store(orgId, adminId, target.id, ids);
    const applyNow = sub?.planId === target.id && (!request || requestApplied);
    if (applyNow) {
      await applyRetention(this.prisma, orgId, target);
      if (request) {
        const whatStays = await whatStaysFor(this.prisma, orgId, target, true);
        await this.prisma.packageChangeRequest.update({
          where: { id: request.id },
          data: {
            whatStays: whatStays
              ? (whatStays as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
          },
        });
      }
    } else {
      await this.refreshOpenCopies(orgId, target);
    }
    const admin = await this.prisma.user
      .findUnique({
        where: { id: adminId },
        select: { firstName: true, lastName: true, email: true },
      })
      .catch(() => null);
    await this.audit(orgId, adminId, 'retention_choices_saved_by_admin', {
      targetPlanId: target.id,
      requestId: request?.id ?? null,
      appliedNow: applyNow,
      admin: admin
        ? {
            name:
              [admin.firstName, admin.lastName].filter(Boolean).join(' ') ||
              admin.email,
            email: admin.email,
          }
        : { id: adminId },
      ...ids,
    });
    if (sub) {
      await notifyOrgAdmins(
        this.prisma,
        sub,
        'package_change_request',
        'Our team updated what stays active on your plan',
        applyNow
          ? `Our support team changed which users, projects, landing pages and templates stay active on ${target.name}. Anything else is paused, never deleted.`
          : `Our support team changed which users, projects, landing pages and templates stay active when you move to ${target.name}.`,
      ).catch(() => undefined);
    }
    return this.adminGetChoices(orgId, target.id, request?.id);
  }

  /** Same rules for everyone: known ids, within the limits, owner always in. */
  private async validate(
    orgId: string,
    target: Plan,
    dto: SaveRetentionChoicesDto,
  ) {
    const ranked = rankRetention(
      await loadRetentionCandidates(this.prisma, orgId),
    );
    const limits = retentionLimits(target);
    const ids = {
      users: [...new Set(dto.userIds)],
      projects: [...new Set(dto.projectIds)],
      landingPages: [...new Set(dto.landingPageIds)],
      templates: [...new Set(dto.templateIds ?? [])],
    };
    const known = {
      users: ranked.users.map((u) => u.id),
      projects: ranked.projects.map((p) => p.id),
      landingPages: ranked.landingPages.map((p) => p.id),
      templates: ranked.templates.map((t) => t.id),
    };
    for (const k of RETENTION_KINDS) {
      if (ids[k].some((id) => !known[k].includes(id))) {
        throw billingError(
          'retention_unknown',
          "Some of those aren't in your organisation any more. Reload and try again.",
        );
      }
    }
    const nouns = {
      users: 'users',
      projects: 'projects',
      landingPages: 'landing pages',
      templates: 'templates',
    };
    for (const k of RETENTION_KINDS) {
      if (ids[k].length > limits[k]) {
        throw billingError(
          'retention_over_limit',
          `${target.name} allows ${limits[k]} ${nouns[k]}.`,
        );
      }
    }
    const owner = ranked.users.find((u) => u.role === 'owner');
    if (owner && !ids.users.includes(owner.id)) {
      throw billingError('retention_owner', 'The owner always stays active.');
    }
    return ids;
  }

  private store(
    orgId: string,
    actorId: string,
    targetPlanId: string,
    ids: Record<(typeof RETENTION_KINDS)[number], string[]>,
  ) {
    const data = {
      targetPlanId,
      userIds: ids.users,
      projectIds: ids.projects,
      landingPageIds: ids.landingPages,
      templateIds: ids.templates,
      updatedById: actorId,
    };
    return this.prisma.retentionChoice.upsert({
      where: { organisationId: orgId },
      create: { organisationId: orgId, ...data },
      update: data,
    });
  }

  /**
   * A pending request or scheduled change to this plan keeps a copy of the
   * choice (Requests tab); refresh it.
   */
  private async refreshOpenCopies(orgId: string, target: Plan) {
    const open = await this.prisma.packageChangeRequest.findMany({
      where: {
        orgId,
        status: { in: [...OPEN_REQUEST_STATUSES] },
        targetPlanId: target.id,
      },
      select: { id: true },
    });
    if (!open.length) return;
    const whatStays = await whatStaysFor(this.prisma, orgId, target);
    for (const row of open) {
      await this.prisma.packageChangeRequest.update({
        where: { id: row.id },
        data: {
          whatStays: whatStays
            ? (whatStays as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });
    }
  }

  private audit(
    orgId: string,
    actorId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog
      .create({
        data: {
          orgId,
          actorId,
          action,
          entity: 'RetentionChoice',
          entityId: orgId,
          metadata: metadata as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }

  /**
   * For the overview banners: what stays on the plan the org is heading to —
   * only when it's heading to a smaller one (grace with "fall back to Basic",
   * cancelling, downgrading) or is already on Basic after a paid plan.
   */
  async summary(orgId: string): Promise<RetentionSummaryV2 | null> {
    const { sub, active } = await this.context(orgId);
    if (!sub) return null;
    const cfg = await getBillingExpiryConfig(this.prisma);
    const heading =
      !!sub.scheduledPlanId ||
      sub.cancelAtPeriodEnd ||
      !!sub.movedToBasicAt ||
      (sub.status === 'past_due' && cfg.behavior === 'fall_back_to_basic');
    if (!heading) return null;
    const target = sub.movedToBasicAt
      ? sub.plan
      : await this.defaultTarget(sub, active);
    if (!target) return null;
    const ranked = rankRetention(
      await loadRetentionCandidates(this.prisma, orgId),
    );
    const saved = await savedChoiceFor(this.prisma, orgId, target.id);
    const keep = pickRetention(ranked, retentionLimits(target), saved);
    const names = <T extends { id: string; name: string }>(
      items: T[],
      ids: string[],
    ) => items.filter((i) => ids.includes(i.id)).map((i) => i.name);
    return {
      targetPlanId: target.id,
      targetPlanName: target.name,
      isDefault: !saved,
      users: names(ranked.users, keep.users),
      projects: names(ranked.projects, keep.projects),
      landingPages: names(ranked.landingPages, keep.landingPages),
      templates: names(ranked.templates, keep.templates),
    };
  }

  /** What's paused right now (locked-state UI). */
  async paused(orgId: string) {
    const [users, projects, pages, templates] = await Promise.all([
      this.prisma.user.findMany({
        where: { orgId, billingPausedAt: { not: null } },
        select: { id: true },
      }),
      this.prisma.project.findMany({
        where: { orgId, billingViewOnlyAt: { not: null } },
        select: { id: true },
      }),
      this.prisma.landingPage.findMany({
        where: { orgId, pageType: 'landing', billingOfflineAt: { not: null } },
        select: { id: true },
      }),
      this.prisma.organisationTemplate.findMany({
        where: { orgId, billingPausedAt: { not: null } },
        select: { templateId: true },
      }),
    ]);
    return {
      pausedUserIds: users.map((u) => u.id),
      viewOnlyProjectIds: projects.map((p) => p.id),
      offlineLandingPageIds: pages.map((p) => p.id),
      pausedTemplateIds: templates.map((t) => t.templateId),
    };
  }
}
