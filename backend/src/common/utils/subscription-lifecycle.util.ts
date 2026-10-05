import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { NotificationType, Subscription, PrismaClient } from '@prisma/client';
import {
  assertLimit,
  countOrgLandingPages,
  resolveLimit,
} from './plan-quota.util';
import { orgBillingRecipientsWhere } from './notification-recipients.util';

// ---------------------------------------------------------------------------
// Subscription expiry lifecycle + plan-package gates for org-owned resources.
//
// Rules (all of them read the single PlatformConfig row, so a Super Admin can
// tune every knob live from the console):
//   - active/trial with renewsAt in the past  => `past_due`, grace starts
//     (graceEndsAt = renewsAt + gracePeriodDays). During the grace window the
//     org keeps working — publishing still allowed.
//   - past_due past graceEndsAt               => `expired` (behavior
//     'restrict') or `cancelled` (behavior 'cancel'). Publishing (and other
//     quota-gated actions) stop for `expired`.
//   - active/trial whose renewsAt falls within `notifyDays` => an
//     "expiring soon" popup notification is raised for the org's admins.
//
// The sweep is cheap (a single scan) and runs on a timer + lazily on every
// org billing read / publish attempt, so the UI always reflects reality even
// if the timer hasn't ticked yet.
// ---------------------------------------------------------------------------

export interface BillingExpiryConfig {
  gracePeriodDays: number;
  notifyDays: number;
  behavior: 'restrict' | 'cancel';
  message: string;
}

export const DEFAULT_BILLING_EXPIRY_CONFIG: BillingExpiryConfig = {
  gracePeriodDays: 7,
  notifyDays: 3,
  behavior: 'restrict',
  message:
    'Your subscription is due for renewal soon. Renew to keep your landing pages and features running without interruption.',
};

export type LifecycleRunSummary = {
  scanned: number;
  newlyPastDue: number;
  newlyExpired: number;
  newlyCancelled: number;
  expiringNotified: number;
  pastDueNotified: number;
  expiredNotified: number;
};

const EMPTY_SUMMARY: LifecycleRunSummary = {
  scanned: 0,
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
>;

/** Read the Super Admin's expiry policy, falling back to safe defaults. */
export async function getBillingExpiryConfig(
  prisma: PrismaLike,
): Promise<BillingExpiryConfig> {
  try {
    const row = await prisma.platformConfig.findUnique({
      where: { id: 'platform' },
    });
    if (!row) return { ...DEFAULT_BILLING_EXPIRY_CONFIG };
    return {
      gracePeriodDays:
        typeof row.billingGracePeriodDays === 'number'
          ? row.billingGracePeriodDays
          : DEFAULT_BILLING_EXPIRY_CONFIG.gracePeriodDays,
      notifyDays:
        typeof row.billingExpiryNotifyDays === 'number'
          ? row.billingExpiryNotifyDays
          : DEFAULT_BILLING_EXPIRY_CONFIG.notifyDays,
      behavior:
        row.billingExpiryBehavior === 'cancel' ? 'cancel' : 'restrict',
      message:
        row.billingExpiryMessage?.trim() ||
        DEFAULT_BILLING_EXPIRY_CONFIG.message,
    };
  } catch {
    return { ...DEFAULT_BILLING_EXPIRY_CONFIG };
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
): Promise<LifecycleRunSummary> {
  const summary: LifecycleRunSummary = { ...EMPTY_SUMMARY };
  try {
    const cfg = await getBillingExpiryConfig(prisma);
    const now = new Date();

    const subs = await prisma.subscription.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        status: { in: ['active', 'trial', 'past_due'] as never[] },
        renewsAt: { not: null },
      },
    });

    summary.scanned = subs.length;

    for (const sub of subs) {
      const renewsAt = sub.renewsAt as Date;

      // Term ended -> enter the grace window.
      if (
        (sub.status === 'active' || sub.status === 'trial') &&
        renewsAt.getTime() <= now.getTime()
      ) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'past_due',
            graceEndsAt: new Date(renewsAt.getTime() + cfg.gracePeriodDays * DAY_MS),
          },
        });
        summary.newlyPastDue++;
        if (
          await ensureOrgNotified(prisma, sub, 'subscription_past_due', 'Subscription past due', cfg)
        ) {
          summary.pastDueNotified++;
        }
        continue;
      }

      // Still within the active term but expiring soon -> notify admins.
      if (
        (sub.status === 'active' || sub.status === 'trial') &&
        renewsAt.getTime() <= now.getTime() + cfg.notifyDays * DAY_MS
      ) {
        if (await ensureOrgNotified(prisma, sub, 'subscription_expiring', 'Subscription renewing soon', cfg)) {
          summary.expiringNotified++;
        }
        continue;
      }

      // Grace window over -> apply the configured expiry behaviour.
      if (
        sub.status === 'past_due' &&
        sub.graceEndsAt &&
        sub.graceEndsAt.getTime() <= now.getTime()
      ) {
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
          await ensureOrgNotified(prisma, sub, 'subscription_expired', 'Subscription ended', cfg)
        ) {
          summary.expiredNotified++;
        }
      }
    }
  } catch (err) {
    // Pre-migration prod DBs may lack grace_ends_at / the billing config
    // columns. Never let the sweep blow up a request — callers that need to
    // act (publish, quota asserts) still do their own hard checks.
    return summary;
  }
  return summary;
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
  const renewed = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'active',
      graceEndsAt: null,
      cancelledAt: null,
      renewsAt: new Date(Date.now() + periodMs),
    },
  });
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

  let sub = await prisma.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
    include: { plan: true },
  });
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

  const sub = await prisma.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
    include: { plan: true },
  });

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