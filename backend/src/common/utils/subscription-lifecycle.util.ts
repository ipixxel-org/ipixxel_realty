import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { NotificationType, Subscription, PrismaClient } from '@prisma/client';
import {
  assertLimit,
  countBillableOrgUsers,
  countOrgLandingPages,
  countOrgProjects,
  countOrgTemplates,
  resolveLimit,
  usageOverLimits,
} from './plan-quota.util';
import { orgBillingRecipientsWhere } from './notification-recipients.util';
import { NO_SCHEDULED_CHANGE } from './plan-change.util';
import { closeScheduledChange } from './scheduled-change.util';
import {
  applyRetention,
  whatStaysFor,
  type RetentionDb,
} from './retention.util';
import { billingNow, isBillingV2Server } from './billing-clock.util';
import {
  effectivePlan,
  latestPlanVersionId,
  planVersionsApplied,
  SUB_PLAN_INCLUDE,
  withEffectivePlan,
} from './plan-version.util';
import {
  describeChange,
  upcomingVersion,
  worseNotice,
  type UpcomingVersion,
} from './plan-version-change.util';

// ---------------------------------------------------------------------------
// Subscription expiry lifecycle + plan-package gates for org-owned resources.
//
// Rules (all of them read the single PlatformConfig row, so a Super Admin can
// tune every knob live from the console):
//   - active/trial with renewsAt in the past  => `past_due`, grace starts.
//     Grace always ends at renewsAt + gracePeriodDays + graceExtensionDays
//     (graceEndFor) — measured from the due date, not from when the sweep
//     noticed; graceEndsAt is re-synced on every pass. During the grace
//     window the org keeps working — publishing still allowed.
//   - grace over (checked in the same pass)   => `expired` (behavior
//     'restrict'), `cancelled` (behavior 'cancel'), or — billing v2,
//     'fall_back_to_basic' — the free plan with what doesn't fit paused
//     ("choose what stays"; buying again restores it). Publishing (and other
//     quota-gated actions) stop for `expired`. With BILLING_V2=true on the
//     server the behaviour is always 'fall_back_to_basic'.
//   - reminders (each can be switched off in the billing v2 settings):
//     `notifyDays` before renewsAt, on the due date, mid-grace (grace of 3+
//     days) and on the last day of grace — once each per due date.
//   - "now" is billingNow(): BILLING_CLOCK_OVERRIDE moves it outside
//     production (testing aid).
//   - billing v2 end-of-term changes, when the term ends: a scheduled
//     cancellation moves the org to the free plan (no grace — they chose to
//     stop); a scheduled smaller plan / interval is switched to, and the
//     unpaid term then goes through grace as usual on that plan. A
//     cancellation scheduled during grace applies when grace ends.
//
// The sweep is cheap (a single scan) and runs on a timer + lazily on every
// org billing read / publish attempt, so the UI always reflects reality even
// if the timer hasn't ticked yet.
// ---------------------------------------------------------------------------

export type ReminderId =
  'before_renewal' | 'payment_day' | 'mid_grace' | 'day_before_grace_ends';
export const REMINDER_IDS: ReminderId[] = [
  'before_renewal',
  'payment_day',
  'mid_grace',
  'day_before_grace_ends',
];
export type ReminderSettings = Record<ReminderId, boolean>;

/** Stored JSON → settings; a missing or unreadable key means "on". */
export function readReminderSettings(raw: unknown): ReminderSettings {
  const o =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    REMINDER_IDS.map((id) => [id, o[id] !== false]),
  ) as ReminderSettings;
}

export interface BillingExpiryConfig {
  gracePeriodDays: number;
  notifyDays: number;
  /**
   * What happens when grace ends unpaid. With billing v2 on the server
   * (BILLING_V2=true) it is always 'fall_back_to_basic' — the stored legacy
   * value (restrict / cancel) only applies with v2 off.
   */
  behavior: 'restrict' | 'cancel' | 'fall_back_to_basic';
  message: string;
  /** Which reminder notifications go out (billing v2 settings). */
  reminders: ReminderSettings;
}

export const DEFAULT_BILLING_EXPIRY_CONFIG: BillingExpiryConfig = {
  gracePeriodDays: 7,
  notifyDays: 3,
  behavior: 'restrict',
  message:
    'Your subscription is due for renewal soon. Renew to keep your landing pages and features running without interruption.',
  reminders: readReminderSettings(null),
};

/**
 * When grace ends for a term that fell due at renewsAt: the due date plus the
 * grace days (today's setting) plus any extension a Super Admin granted.
 * Always measured from the due date, never from when the sweep noticed.
 */
export function graceEndFor(
  sub: { renewsAt: Date; graceExtensionDays?: number | null },
  gracePeriodDays: number,
): Date {
  const days =
    Math.max(0, gracePeriodDays) + Math.max(0, sub.graceExtensionDays ?? 0);
  return new Date(sub.renewsAt.getTime() + days * DAY_MS);
}

export type LifecycleRunSummary = {
  scanned: number;
  movedToFreePlan: number;
  scheduledPlanApplied: number;
  newlyPastDue: number;
  newlyExpired: number;
  newlyCancelled: number;
  expiringNotified: number;
  pastDueNotified: number;
  expiredNotified: number;
};

const EMPTY_SUMMARY: LifecycleRunSummary = {
  scanned: 0,
  movedToFreePlan: 0,
  scheduledPlanApplied: 0,
  newlyPastDue: 0,
  newlyExpired: 0,
  newlyCancelled: 0,
  expiringNotified: 0,
  pastDueNotified: 0,
  expiredNotified: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

type PrismaLike = Pick<
  PrismaClient,
  | 'platformConfig'
  | 'subscription'
  | 'notification'
  | 'user'
  | 'landingPage'
  | 'organisationTemplate'
  | 'template'
  | 'plan'
  // Billing v2 "choose what stays" (retention.util)
  | 'project'
  | 'refreshToken'
  | 'retentionChoice'
  | 'lead'
> &
  // Plan versions (optional so older test mocks still fit).
  Partial<Pick<PrismaClient, 'planVersion' | 'auditLog'>>;

function defaultExpiryConfig(): BillingExpiryConfig {
  return {
    ...DEFAULT_BILLING_EXPIRY_CONFIG,
    behavior: isBillingV2Server()
      ? 'fall_back_to_basic'
      : DEFAULT_BILLING_EXPIRY_CONFIG.behavior,
  };
}

/** Read the Super Admin's expiry policy, falling back to safe defaults. */
export async function getBillingExpiryConfig(
  prisma: PrismaLike,
): Promise<BillingExpiryConfig> {
  try {
    const row = await prisma.platformConfig.findUnique({
      where: { id: 'platform' },
    });
    if (!row) return defaultExpiryConfig();
    return {
      gracePeriodDays:
        typeof row.billingGracePeriodDays === 'number'
          ? row.billingGracePeriodDays
          : DEFAULT_BILLING_EXPIRY_CONFIG.gracePeriodDays,
      notifyDays:
        typeof row.billingExpiryNotifyDays === 'number'
          ? row.billingExpiryNotifyDays
          : DEFAULT_BILLING_EXPIRY_CONFIG.notifyDays,
      behavior: isBillingV2Server()
        ? 'fall_back_to_basic'
        : row.billingExpiryBehavior === 'cancel' ||
            row.billingExpiryBehavior === 'fall_back_to_basic'
          ? row.billingExpiryBehavior
          : 'restrict',
      message:
        row.billingExpiryMessage?.trim() ||
        DEFAULT_BILLING_EXPIRY_CONFIG.message,
      reminders: readReminderSettings(
        (row as { billingReminders?: unknown }).billingReminders,
      ),
    };
  } catch {
    return defaultExpiryConfig();
  }
}

/**
 * Statuses that keep the org usable (past_due = still inside the grace
 * window). Any other status blocks publishing and reads as "subscription
 * not active" across the platform.
 */
export function isSubscriptionUsable(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trial' || status === 'past_due';
}

/**
 * Run one pass of the lifecycle over every non-cancelled subscription (or only
 * `orgId`'s, when given). Idempotent: transitions apply once and notifications
 * are deduped, so callers may run it freely from the timer or a per-request
 * lazy read.
 */
export async function applyOrgSubscriptionLifecycle(
  prisma: PrismaLike,
  orgId?: string,
  now: Date = billingNow(),
): Promise<LifecycleRunSummary> {
  const summary: LifecycleRunSummary = { ...EMPTY_SUMMARY };
  try {
    const cfg = await getBillingExpiryConfig(prisma);

    const fallBack = cfg.behavior === 'fall_back_to_basic';
    const subs = await prisma.subscription.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        // With "fall back to Basic", a plan left `expired` by the old
        // "restrict" rule (before the switch) is moved to Basic too.
        status: {
          in: (fallBack
            ? ['active', 'trial', 'past_due', 'expired']
            : ['active', 'trial', 'past_due']) as never[],
        },
        renewsAt: { not: null },
      },
    });

    summary.scanned = subs.length;

    for (let sub of subs) {
      if (sub.status === 'expired') {
        if (
          fallBack &&
          (await moveToFreePlan(prisma, sub, 'grace_ended', now))
        ) {
          summary.movedToFreePlan++;
        }
        continue;
      }
      const renewsAt = sub.renewsAt as Date;
      const termOver = renewsAt.getTime() <= now.getTime();
      // Grace is measured from the due date (renewsAt), never from when the
      // sweep noticed — an edited renewsAt or grace setting applies at once.
      const graceEnd = graceEndFor(
        { renewsAt, graceExtensionDays: sub.graceExtensionDays },
        cfg.gracePeriodDays,
      );
      const graceOver = termOver && graceEnd.getTime() <= now.getTime();
      const running = sub.status === 'active' || sub.status === 'trial';

      // Billing v2: a cancellation the org scheduled takes effect at the end
      // of the term (or, made during grace, when grace ends).
      if (
        sub.cancelAtPeriodEnd &&
        ((running && termOver) || (sub.status === 'past_due' && graceOver))
      ) {
        if (await moveToFreePlan(prisma, sub, 'cancelled', now)) {
          summary.movedToFreePlan++;
          continue;
        }
      }
      // A scheduled smaller plan / interval switches in when the term ends…
      if (sub.scheduledPlanId && running && termOver) {
        sub = await applyScheduledPlan(prisma, sub);
        summary.scheduledPlanApplied++;
        // …then the unpaid term goes into grace below, on the new plan.
      }

      // Still within the term: the "renews soon" reminder.
      if (running && !termOver) {
        if (
          !sub.cancelAtPeriodEnd &&
          cfg.reminders.before_renewal &&
          renewsAt.getTime() <= now.getTime() + cfg.notifyDays * DAY_MS &&
          (await notifyOnce(
            prisma,
            sub,
            'subscription_expiring',
            `Your plan renews on ${dayLabel(renewsAt)}`,
            cfg.message,
          ))
        ) {
          summary.expiringNotified++;
        }
        continue;
      }

      // Term ended unpaid -> grace (past_due), and the payment-day reminder.
      if (running) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'past_due', graceEndsAt: graceEnd },
        });
        sub = { ...sub, status: 'past_due', graceEndsAt: graceEnd };
        summary.newlyPastDue++;
        if (
          cfg.reminders.payment_day &&
          !graceOver &&
          (await notifyOnce(
            prisma,
            sub,
            'subscription_past_due',
            `Your renewal was due on ${dayLabel(renewsAt)}`,
            `Pay now to keep your plan. Everything keeps working until ${dayLabel(graceEnd)}; after that the organisation moves to the free plan.`,
          ))
        ) {
          summary.pastDueNotified++;
        }
        // No `continue`: when the grace window is already over (a late sweep,
        // an edited renewsAt, a short grace) it is applied in this same pass.
      } else if (sub.graceEndsAt?.getTime() !== graceEnd.getTime()) {
        // past_due: keep the stored grace end in step with the rule.
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { graceEndsAt: graceEnd },
        });
        sub = { ...sub, graceEndsAt: graceEnd };
      }

      if (!graceOver) {
        // In grace: the mid-grace and last-day reminders (only one per pass).
        const graceDays = Math.round(
          (graceEnd.getTime() - renewsAt.getTime()) / DAY_MS,
        );
        const lastDay = graceEnd.getTime() - now.getTime() <= DAY_MS;
        const midGrace =
          graceDays >= 3 &&
          now.getTime() >=
            renewsAt.getTime() + Math.ceil(graceDays / 2) * DAY_MS;
        if (lastDay && cfg.reminders.day_before_grace_ends) {
          if (
            await notifyOnce(
              prisma,
              sub,
              'subscription_past_due',
              `Grace ends on ${dayLabel(graceEnd)}`,
              'This is the last day to pay before the organisation moves to the free plan. Anything over its limits will be paused, never deleted.',
            )
          ) {
            summary.pastDueNotified++;
          }
        } else if (!lastDay && midGrace && cfg.reminders.mid_grace) {
          if (
            await notifyOnce(
              prisma,
              sub,
              'subscription_past_due',
              `Payment reminder: grace ends on ${dayLabel(graceEnd)}`,
              `Your renewal was due on ${dayLabel(renewsAt)}. Pay now to keep your plan.`,
            )
          ) {
            summary.pastDueNotified++;
          }
        }
        continue;
      }

      // Grace window over -> apply the configured expiry behaviour.
      if (
        cfg.behavior === 'fall_back_to_basic' &&
        (await moveToFreePlan(prisma, sub, 'grace_ended', now))
      ) {
        summary.movedToFreePlan++;
        continue;
      }
      if (cfg.behavior === 'cancel') {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'cancelled', cancelledAt: now },
        });
        summary.newlyCancelled++;
      } else {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'expired' },
        });
        summary.newlyExpired++;
      }
      if (
        await ensureOrgNotified(
          prisma,
          sub,
          'subscription_expired',
          'Subscription ended',
          cfg,
        )
      ) {
        summary.expiredNotified++;
      }
    }
  } catch (err) {
    // Pre-migration prod DBs may lack grace_ends_at / the billing config
    // columns. Never let the sweep blow up a request — callers that need to
    // act (publish, quota asserts) still do their own hard checks.
    return summary;
  }
  await applyPlanVersionChanges(prisma, orgId, now).catch(() => undefined);
  return summary;
}

/** "3 users instead of 5, no Team chat" — what a newer version changes. */
function changesText(up: UpcomingVersion): string {
  return up.changes.map(describeChange).join(', ');
}

/** The org's usage, for "3 users (you have 5)". */
async function orgUsage(prisma: PrismaLike, orgId: string) {
  const [users, projects, landingPages, templates] = await Promise.all([
    countBillableOrgUsers(prisma, orgId),
    countOrgProjects(prisma, orgId),
    countOrgLandingPages(prisma, orgId),
    countOrgTemplates(prisma, orgId),
  ]);
  return { users, projects, landingPages, templates };
}

const WHAT_STAYS_HINT =
  'Choose what stays from Settings → Billing; otherwise the default picks apply. Nothing is deleted.';

/**
 * Plan versions, run with every sweep (billing v2 only):
 * - Basic: a newer version that isn't lower, or that the org fits, applies
 *   now; a lower one the org is over applies BASIC_NOTICE_DAYS after it was
 *   made (what doesn't fit is paused: their choice or the default picks) and
 *   until then the org is told once.
 * - Paid plans move at renewal (applyPlanChange); from the renewal window the
 *   org is told once — only when the new version is worse for them (a lower
 *   limit, a feature off, a higher price), never with a version number.
 */
export async function applyPlanVersionChanges(
  prisma: PrismaLike,
  orgId?: string,
  now: Date = billingNow(),
): Promise<{ moved: number; notified: number }> {
  const out = { moved: 0, notified: 0 };
  if (!planVersionsApplied() || !prisma.planVersion) return out;
  const cfg = await getBillingExpiryConfig(prisma);
  const subs = await prisma.subscription.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      status: { not: 'cancelled' },
      planVersionId: { not: null },
    },
    include: SUB_PLAN_INCLUDE,
  });
  for (const sub of subs) {
    const up = await upcomingVersion(prisma, sub, {
      notifyDays: cfg.notifyDays,
      now,
    });
    if (!up) continue;
    if (up.reason === 'basic') {
      const target = effectivePlan(up.plan, null);
      const over = up.lower
        ? (await usageOverLimits(prisma, sub.orgId, target)).length > 0
        : false;
      if (!over || now.getTime() >= up.at.getTime()) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { planVersionId: up.toVersionId },
        });
        out.moved++;
        if (over) {
          const retention = await applyRetention(prisma, sub.orgId, target);
          await notifyOrgAdmins(
            prisma,
            sub,
            'subscription_expiring',
            `${up.planName} has changed`,
            `${up.planName} now has ${changesText(up)}. What doesn't fit is paused, not deleted, and leads keep coming in. Upgrade to bring it back.`,
          );
          await prisma.auditLog
            ?.create({
              data: {
                orgId: sub.orgId,
                action: 'plan_version_applied',
                entity: 'Subscription',
                entityId: sub.id,
                metadata: {
                  planId: sub.planId,
                  version: up.toVersion,
                  paused: retention.paused,
                },
              },
            })
            .catch(() => undefined);
        }
        continue;
      }
      const basic = worseNotice(up, await orgUsage(prisma, sub.orgId), {
        interval: sub.billingCycle,
        overdue: false,
        dateLabel: dayLabel,
      });
      if (
        basic &&
        (await notifyOnce(
          prisma,
          sub,
          'subscription_expiring',
          `${up.planName} changes on ${dayLabel(up.at)}`,
          `${basic.text} ${WHAT_STAYS_HINT}`,
          true,
        ))
      )
        out.notified++;
      continue;
    }
    // A paid plan: told once, from the renewal window, only when it's worse.
    const notice = worseNotice(up, await orgUsage(prisma, sub.orgId), {
      interval: sub.billingCycle,
      overdue:
        sub.status === 'past_due' ||
        sub.status === 'expired' ||
        up.at.getTime() <= now.getTime(),
      dateLabel: dayLabel,
    });
    if (!notice) continue;
    if (
      await notifyOnce(
        prisma,
        sub,
        'subscription_expiring',
        `${up.planName}: changes at your next renewal`,
        notice.overLimit ? `${notice.text} ${WHAT_STAYS_HINT}` : notice.text,
        true,
      )
    )
      out.notified++;
  }
  return out;
}

const dayLabel = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * A reminder to the org's admins, sent once: the title carries the date it is
 * about (the due date or the grace end), so it goes out once per term even
 * after it's been read, and again for the next term.
 */
async function notifyOnce(
  prisma: PrismaLike,
  sub: Subscription,
  type: NotificationType,
  title: string,
  body: string,
  // Plan version notices: once per wording (a later, different change is new).
  matchBody = false,
): Promise<boolean> {
  const existing = await prisma.notification.count({
    where: {
      orgId: sub.orgId,
      type,
      entityId: sub.id,
      title,
      ...(matchBody ? { body } : {}),
    },
  });
  if (existing > 0) return false;
  const recipients = await prisma.user.findMany({
    where: orgBillingRecipientsWhere(sub.orgId),
    select: { id: true },
  });
  if (recipients.length === 0) return false;
  await prisma.notification.createMany({
    data: recipients.map((u) => ({
      orgId: sub.orgId,
      recipientId: u.id,
      type,
      title,
      body,
      entity: 'Subscription',
      entityId: sub.id,
    })),
  });
  return true;
}

type ChangeDb = Pick<
  PrismaClient,
  'plan' | 'subscription' | 'notification' | 'user'
> &
  RetentionDb &
  Partial<
    Pick<PrismaClient, 'auditLog' | 'packageChangeRequest' | 'planVersion'>
  >;

export async function notifyOrgAdmins(
  prisma: ChangeDb,
  sub: Subscription,
  type: NotificationType,
  title: string,
  body: string,
) {
  const recipients = await prisma.user.findMany({
    where: orgBillingRecipientsWhere(sub.orgId),
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((u) => ({
      orgId: sub.orgId,
      recipientId: u.id,
      type,
      title,
      body,
      entity: 'Subscription',
      entityId: sub.id,
    })),
  });
}

/** The platform's free plan: the system (Basic) plan, else any active ₹0 plan. */
export async function findFreePlan(prisma: Pick<PrismaClient, 'plan'>) {
  return (
    (await prisma.plan.findFirst({
      where: { isSystem: true, isActive: true },
    })) ??
    (await prisma.plan.findFirst({
      where: { isActive: true, priceMonthly: 0, priceYearly: 0 },
      orderBy: { createdAt: 'asc' },
    }))
  );
}

/**
 * Billing v2: a paid plan ends and the org moves to the free plan (no renewal
 * date, nothing to pay) — a cancellation taking effect, or "fall back to
 * Basic" when grace ends unpaid. What doesn't fit the free plan is paused
 * ("choose what stays"); nothing is deleted, and buying again restores it.
 * Returns false when there is no free plan, so the caller falls back to the
 * normal expiry handling.
 */
export async function moveToFreePlan(
  prisma: ChangeDb,
  sub: Subscription,
  reason: 'cancelled' | 'grace_ended' = 'cancelled',
  now: Date = billingNow(),
): Promise<boolean> {
  const free = await findFreePlan(prisma);
  if (!free) return false;
  const old = await prisma.plan.findUnique({ where: { id: sub.planId } });
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      planId: free.id,
      planVersionId: await latestPlanVersionId(prisma, free.id),
      billingCycle: 'monthly',
      status: 'active',
      amount: 0,
      mrr: 0,
      renewsAt: null,
      graceEndsAt: null,
      graceExtensionDays: 0,
      ...NO_SCHEDULED_CHANGE,
      movedToBasicAt: now,
      previousPlanId: sub.planId,
      previousInterval: sub.billingCycle,
    },
  });
  // A scheduled move to Basic is done (with what stays as it's applied);
  // any other scheduled change is replaced.
  await closeScheduledChange(
    prisma,
    sub.orgId,
    { planId: free.id, interval: 'monthly' },
    now,
    () => whatStaysFor(prisma, sub.orgId, free, true),
  );
  const retention = await applyRetention(prisma, sub.orgId, free);
  // Option A (manual mode): a request still waiting stays pending; it notes
  // that the org fell back to Basic meanwhile. Approving it later starts the
  // new term on the payment date.
  await prisma.packageChangeRequest
    ?.updateMany({
      where: { orgId: sub.orgId, status: 'pending', movedToBasicAt: null },
      data: { movedToBasicAt: now },
    })
    .catch(() => undefined);
  await prisma.auditLog
    ?.create({
      data: {
        orgId: sub.orgId,
        action: 'subscription_cancelled',
        entity: 'Subscription',
        entityId: sub.id,
        metadata: {
          source:
            reason === 'grace_ended' ? 'grace_ended_fall_back' : 'scheduled_cancellation',
          paused: retention.paused,
          fromPlanId: sub.planId,
          toPlanId: free.id,
          reason: sub.cancelReason ?? null,
        },
      },
    })
    .catch(() => undefined);
  await notifyOrgAdmins(
    prisma,
    sub,
    'subscription_expired',
    reason === 'grace_ended' ? 'Moved to Basic' : `You're on ${free.name} now`,
    reason === 'grace_ended'
      ? `Your ${old?.name ?? 'paid'} plan wasn't renewed, so you're on ${free.name} now. Anything over its limits is paused, not deleted, and leads keep coming in. Buy ${old?.name ?? 'your plan'} again to bring everything back.`
      : `Your change from ${old?.name ?? 'your paid plan'} to ${free.name} has taken effect. Anything over its limits is paused, not deleted, and leads keep coming in.`,
  );
  return true;
}

/**
 * Billing v2 scheduled downgrade taking effect: switch to the smaller plan /
 * interval (amount and mrr as everywhere else) and clear the schedule. The
 * renewal date stays — the next term is paid at the new price.
 */
async function applyScheduledPlan(
  prisma: ChangeDb,
  sub: Subscription,
): Promise<Subscription> {
  const plan = await prisma.plan.findUnique({
    where: { id: sub.scheduledPlanId! },
  });
  if (!plan || !plan.isActive) {
    // The plan was archived meanwhile: keep the current plan.
    await closeScheduledChange(prisma, sub.orgId, 'replaced');
    return prisma.subscription.update({
      where: { id: sub.id },
      data: { ...NO_SCHEDULED_CHANGE },
    });
  }
  const interval = sub.scheduledInterval ?? sub.billingCycle;
  const amount = interval === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      planId: plan.id,
      // A scheduled change gets the plan's version as it is now (the latest).
      planVersionId: await latestPlanVersionId(prisma, plan.id),
      billingCycle: interval,
      amount,
      mrr: interval === 'yearly' ? Math.round(amount / 12) : amount,
      ...NO_SCHEDULED_CHANGE,
    },
  });
  await closeScheduledChange(
    prisma,
    sub.orgId,
    { planId: plan.id, interval },
    billingNow(),
    () => whatStaysFor(prisma, sub.orgId, plan, true),
  );
  await applyRetention(prisma, sub.orgId, plan);
  await prisma.auditLog
    ?.create({
      data: {
        orgId: sub.orgId,
        action: 'subscription_downgraded',
        entity: 'Subscription',
        entityId: sub.id,
        metadata: {
          source: 'scheduled_downgrade',
          fromPlanId: sub.planId,
          toPlanId: plan.id,
          billingCycle: interval,
        },
      },
    })
    .catch(() => undefined);
  await notifyOrgAdmins(
    prisma,
    sub,
    'package_change_approved',
    `You're on ${plan.name} now`,
    `Your scheduled change to the "${plan.name}" plan (${interval}) has taken effect.`,
  );
  return updated;
}

async function ensureOrgNotified(
  prisma: PrismaLike,
  sub: Subscription,
  type: NotificationType,
  title: string,
  cfg: BillingExpiryConfig,
): Promise<boolean> {
  // Already raised an unread event for this subscription? Skip — repeated
  // lazy reads must not spam the org's admins.
  const existing = await prisma.notification.count({
    where: { orgId: sub.orgId, type, entityId: sub.id, readAt: null },
  });
  if (existing > 0) return false;

  // Addressed to the org's Admins only — billing is theirs to act on; other
  // members (Sales, Telecaller, ...) only see notifications meant for them.
  const recipients = await prisma.user.findMany({
    where: orgBillingRecipientsWhere(sub.orgId),
    select: { id: true },
  });
  if (recipients.length === 0) return false;

  await prisma.notification.createMany({
    data: recipients.map((u) => ({
      orgId: sub.orgId,
      recipientId: u.id,
      type,
      title,
      body: cfg.message,
      entity: 'Subscription',
      entityId: sub.id,
    })),
  });
  return true;
}

/**
 * Renew the org's subscription, ending any grace/expired state. If the plan
 * or billing cycle changed the amount/mrr are left to changePlan — this only
 * extends the term on the current plan.
 */
export async function renewOrgSubscription(
  prisma: PrismaLike,
  orgId: string,
): Promise<Subscription> {
  // Re-run the lifecycle first so a stuck `past_due` reflects post-grace once
  // the config says so — after that, renewing a genuinely expired/cancelled
  // subscription is still allowed (an org can always buy its way back).
  await applyOrgSubscriptionLifecycle(prisma, orgId);

  const sub = await prisma.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
  });
  if (!sub) {
    throw new BadRequestException(
      'No active subscription to renew — choose a plan to continue.',
    );
  }

  const periodMs = sub.billingCycle === 'yearly' ? 365 * DAY_MS : 30 * DAY_MS;
  // A renewal moves the org to its plan's latest version.
  const planVersionId = await latestPlanVersionId(prisma, sub.planId);
  const renewed = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'active',
      graceEndsAt: null,
      graceExtensionDays: 0,
      cancelledAt: null,
      renewsAt: new Date(billingNow().getTime() + periodMs),
      ...(planVersionId ? { planVersionId } : {}),
    },
  });
  // Smaller limits in the new version: what doesn't fit is paused (their
  // choice or the default picks).
  if (
    planVersionsApplied() &&
    planVersionId &&
    planVersionId !== sub.planVersionId
  ) {
    const plan = await prisma.plan.findUnique({ where: { id: sub.planId } });
    if (plan) await applyRetention(prisma, orgId, plan);
  }
  return renewed;
}

/**
 * Resolve the org's active plan (the one its subscription is on). Returns
 * null when there is no usable subscription. Applies the lazy lifecycle first
 * so `expired` reads don't masquerade as usable.
 */
export async function getOrgActivePlan(
  prisma: PrismaLike,
  orgId: string,
): Promise<{
  subscription: Subscription | null;
  plan: {
    id?: string;
    name: string;
    slug?: string;
    priceMonthly?: number;
    limits: unknown;
    capabilities?: unknown;
  };
} | null> {
  await applyOrgSubscriptionLifecycle(prisma, orgId);

  // The plan as the org has it: its version's limits, features and price.
  let sub = withEffectivePlan(
    await prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: SUB_PLAN_INCLUDE,
    }),
  );
  if (sub && isSubscriptionUsable(sub.status)) {
    return {
      subscription: sub,
      plan: {
        id: (sub as any).plan?.id,
        name: (sub as any).plan?.name,
        slug: (sub as any).plan?.slug,
        priceMonthly: (sub as any).plan?.priceMonthly,
        limits: (sub as any).plan?.limits,
        capabilities: (sub as any).plan?.capabilities,
      },
    };
  }

  // Fallback to the platform's fixed Free / System plan
  try {
    const freePlan = await prisma.plan.findFirst({
      where: {
        OR: [
          { isSystem: true },
          { priceMonthly: 0 },
          { slug: 'basic' },
          { slug: 'free' },
        ],
        isActive: true,
      },
      // The system Basic plan first — never an internal ₹0 plan such as "Demo".
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });

    if (freePlan) {
      return {
        subscription: sub,
        plan: {
          id: freePlan.id,
          name: freePlan.name,
          slug: freePlan.slug,
          priceMonthly: freePlan.priceMonthly,
          limits: freePlan.limits,
          capabilities: freePlan.capabilities,
        },
      };
    }
  } catch {
    // ignore query failure if schema lacks columns
  }

  // Virtual fixed Free Plan
  return {
    subscription: sub,
    plan: {
      name: 'Free Plan',
      slug: 'free',
      priceMonthly: 0,
      limits: {
        projects: 1,
        users: 1,
        templates: 1,
        landingPages: 1,
        landingPagesCreate: 2,
      },
      capabilities: {},
    },
  };
}

// --- Package gates ---------------------------------------------------------

export function canPlanAccessTier(
  plan: { slug?: string; priceMonthly?: number; capabilities?: unknown } | null | undefined,
  tier: 'free' | 'paid' | 'premium',
): { allowed: boolean; reason?: string } {
  if (tier === 'free') {
    return { allowed: true };
  }

  const capabilities = ((plan?.capabilities ?? {}) as Record<string, boolean>);
  const price = plan?.priceMonthly ?? 0;
  const slug = (plan?.slug ?? '').toLowerCase();

  if (tier === 'paid') {
    if (
      capabilities.paidTemplates === true ||
      capabilities.premiumTemplates === true ||
      price > 0
    ) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'This template requires a paid subscription plan (Starter or higher). Please upgrade your plan.',
    };
  }

  if (tier === 'premium') {
    if (
      capabilities.premiumTemplates === true ||
      price >= 10000 ||
      /ultra|premium|max|enterprise/i.test(slug)
    ) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        'This template is exclusive to the Ultra Pro subscription plan. Please upgrade to Ultra Pro to access it.',
    };
  }

  return { allowed: true };
}

/**
 * Enforce active subscription and landing page creation limits before
 * creating/duplicating a landing page.
 * Organizations can create multiple landing pages (drafts) even if publishing
 * is disabled, up to their plan's `landingPagesCreate` limit (if specified).
 * Publishing limits and template restrictions are strictly enforced at publish time.
 */
export async function assertOrgLandingPageQuota(
  prisma: PrismaLike,
  orgId: string,
  addCount = 1,
): Promise<void> {
  const active = await getOrgActivePlan(prisma, orgId);
  if (!active) {
    throw new BadRequestException(
      'An active subscription is required to create landing pages. Choose a plan from Org Settings → Billing.',
    );
  }

  const maxCreate = resolveLimit((active as any).plan, 'landingPagesCreate');
  if (Number.isFinite(maxCreate)) {
    const totalCreated = await (prisma as any).landingPage.count({
      where: { orgId, pageType: 'landing' },
    });
    if (totalCreated + addCount > maxCreate) {
      const planName = (active as any).plan?.name
        ? `"${(active as any).plan.name}" `
        : '';
      throw new BadRequestException(
        `Landing page creation limit reached. Your ${planName}package allows creating up to ${maxCreate} landing page(s) (drafts + live). You currently have ${totalCreated}. Upgrade your package to create more.`,
      );
    }
  }
}

/**
 * Gate for the publish/unpublish actions.
 * Enforces:
 *   1. A usable subscription must exist (active / trial / inside grace);
 *   2. Plan must include the `publishing` capability;
 *   3. Total published landing pages limit (plan `landingPages` limit);
 *   4. Template restrictions: template must be assigned to org, template tier must be eligible on plan,
 *      and distinct templates published cannot exceed plan `templates` limit.
 */
export async function assertOrgCanPublish(
  prisma: PrismaLike,
  orgId: string,
  pageId?: string,
): Promise<void> {
  // Lazy sweep so a past-due-entering-grace / expired transition is reflected
  // the moment the user hits publish instead of waiting for the timer.
  await applyOrgSubscriptionLifecycle(prisma, orgId);

  const sub = withEffectivePlan(
    await prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: SUB_PLAN_INCLUDE,
    }),
  );

  if (!sub) {
    throw new ForbiddenException(
      'A paid plan is required to publish landing pages. Choose a plan from Org Settings → Billing, then try again.',
    );
  }
  if (!isSubscriptionUsable(sub.status)) {
    if (sub.status === 'expired') {
      throw new ForbiddenException(
        'Your subscription has expired. Renew from Org Settings → Billing to keep your live pages running.',
      );
    }
    throw new ForbiddenException(
      'Your subscription is not active. Renew from Org Settings → Billing to continue publishing.',
    );
  }

  const capabilities = ((sub as any).plan?.capabilities ??
    {}) as Record<string, boolean>;
  const maxPublishedAllowed = resolveLimit((sub as any).plan, 'landingPages');
  const canPublish =
    capabilities.publishing === true ||
    (capabilities.publishing !== false && maxPublishedAllowed > 0);

  if (!canPublish) {
    throw new ForbiddenException(
      'Your current plan does not include Publishing. Upgrade your plan from Org Settings → Billing to publish landing pages.',
    );
  }

  // Retrieve target landing page to inspect source template restrictions
  let targetPage: { id: string; sourceTemplateId: string | null } | null = null;
  if (pageId) {
    targetPage = await prisma.landingPage.findUnique({
      where: { id: pageId },
      select: { id: true, sourceTemplateId: true },
    });
  }

  // 1. Published landing pages limit check (exclude this page if it's already published and being updated)
  if (Number.isFinite(maxPublishedAllowed)) {
    const publishedCount = await prisma.landingPage.count({
      where: {
        orgId,
        status: 'published',
        pageType: 'landing',
        ...(pageId ? { id: { not: pageId } } : {}),
      },
    });
    if (publishedCount >= maxPublishedAllowed) {
      const planName = (sub as any).plan?.name ? `"${(sub as any).plan.name}" ` : '';
      throw new ForbiddenException(
        `Publishing limit reached. Your ${planName}plan allows a maximum of ${maxPublishedAllowed} published landing page(s) simultaneously. Please unpublish an existing page or upgrade your package limit to publish this page.`,
      );
    }
  }

  // 2. Template restrictions check (if page was created from a template)
  if (targetPage?.sourceTemplateId) {
    // A. Verify template is currently assigned to the organization
    const isAssigned = await prisma.organisationTemplate.findUnique({
      where: {
        orgId_templateId: {
          orgId,
          templateId: targetPage.sourceTemplateId,
        },
      },
    });
    if (!isAssigned) {
      throw new ForbiddenException(
        'Cannot publish. The source template is not assigned to your organisation workspace. Please add this template to your workspace first.',
      );
    }

    // B. Verify template tier access
    const template = await prisma.template.findUnique({
      where: { id: targetPage.sourceTemplateId },
      select: { id: true, name: true, tier: true },
    });
    if (template) {
      const tier = template.tier ?? 'free';
      const access = canPlanAccessTier((sub as any).plan, tier);
      if (!access.allowed) {
        const tierLabel = tier === 'premium' ? 'Premium' : 'Paid';
        throw new ForbiddenException(
          `Cannot publish. This landing page was created from "${template.name}", which is a ${tierLabel} template. ${access.reason ?? 'Upgrade your subscription plan to publish this page.'}`,
        );
      }
    }

    // C. Distinct template publishing limit (if plan restricts number of templates)
    const maxTemplatesAllowed = resolveLimit((sub as any).plan, 'templates');
    if (Number.isFinite(maxTemplatesAllowed)) {
      const distinctPublished = await prisma.landingPage.findMany({
        where: {
          orgId,
          status: 'published',
          pageType: 'landing',
          ...(pageId ? { id: { not: pageId } } : {}),
          sourceTemplateId: { not: null },
        },
        select: { sourceTemplateId: true },
        distinct: ['sourceTemplateId'],
      });
      const publishedTemplateIds = new Set(
        distinctPublished
          .map((p) => p.sourceTemplateId)
          .filter((id): id is string => Boolean(id)),
      );
      if (
        !publishedTemplateIds.has(targetPage.sourceTemplateId) &&
        publishedTemplateIds.size >= maxTemplatesAllowed
      ) {
        throw new ForbiddenException(
          `Template publishing limit reached. Your plan allows publishing from a maximum of ${maxTemplatesAllowed} template(s). You already have published pages using ${publishedTemplateIds.size} different template(s). Unpublish those pages or upgrade your plan to publish from this template.`,
        );
      }
    }
  }
}