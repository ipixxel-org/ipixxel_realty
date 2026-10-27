import { Injectable } from '@nestjs/common';
import type { Plan, Prisma, Subscription } from '@prisma/client';
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
} from '../../common/utils/subscription-lifecycle.util';
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
 * pages and templates stay active on a smaller plan: shown, chosen and saved here; applied
 * by retention.util whenever the plan changes (and at once when the org is
 * already on that plan).
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

  async getChoices(
    orgId: string,
    targetPlanId?: string,
  ): Promise<RetentionChoicesV2> {
    const { sub, active } = await this.context(orgId);
    const target = targetPlanId
      ? active.find((p) => p.id === targetPlanId)
      : await this.defaultTarget(sub, active);
    if (!target) {
      throw billingError('plan_not_found', 'That plan is not available.');
    }
    const ranked = rankRetention(
      await loadRetentionCandidates(this.prisma, orgId),
    );
    const limits = retentionLimits(target);
    const saved = await savedChoiceFor(this.prisma, orgId, target.id);
    const defaults = pickRetention(ranked, limits, null);
    const selected = pickRetention(ranked, limits, saved);
    const rank = planRanker(active)(target);

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

  async saveChoices(
    orgId: string,
    userId: string,
    dto: SaveRetentionChoicesDto,
  ): Promise<RetentionChoicesV2> {
    const { sub, active } = await this.context(orgId);
    const target = active.find((p) => p.id === dto.targetPlanId);
    if (!target) {
      throw billingError('plan_not_found', 'That plan is not available.');
    }
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

    await this.prisma.retentionChoice.upsert({
      where: { organisationId: orgId },
      create: {
        organisationId: orgId,
        targetPlanId: target.id,
        userIds: ids.users,
        projectIds: ids.projects,
        landingPageIds: ids.landingPages,
        templateIds: ids.templates,
        updatedById: userId,
      },
      update: {
        targetPlanId: target.id,
        userIds: ids.users,
        projectIds: ids.projects,
        landingPageIds: ids.landingPages,
        templateIds: ids.templates,
        updatedById: userId,
      },
    });
    // Already on that plan (e.g. moved to Basic): swap what's paused now.
    // A pending request to this plan keeps a copy of the choice (Requests tab).
    const pending = await this.prisma.packageChangeRequest.findFirst({
      where: { orgId, status: 'pending', targetPlanId: target.id },
      select: { id: true },
    });
    if (pending) {
      const whatStays = await whatStaysFor(this.prisma, orgId, target);
      await this.prisma.packageChangeRequest.update({
        where: { id: pending.id },
        data: {
          whatStays: (whatStays ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });
    }
    if (sub?.planId === target.id) {
      await applyRetention(this.prisma, orgId, target);
    }
    await this.prisma.auditLog
      .create({
        data: {
          orgId,
          actorId: userId,
          action: 'retention_choices_saved',
          entity: 'RetentionChoice',
          entityId: orgId,
          metadata: { targetPlanId: target.id, ...ids },
        },
      })
      .catch(() => undefined);
    return this.getChoices(orgId, target.id);
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
