import { BadRequestException } from '@nestjs/common';

// Plan.limits.{projects,users,templates} are `number | null` since the
// numeric-limits migration (null = unlimited). Legacy string values
// ("3" / "All" / "Unlimited" / "—") are still tolerated in case a row predates
// that migration. Centralised because every place that enforces a plan quota
// (signup, admin activate/approve, project creation, user invite, template
// assignment, plan downgrade) needs identical parsing.

export type PlanLimitKey =
  | 'projects'
  | 'users'
  | 'templates'
  | 'landingPages'
  | 'landingPagesCreate';

const LIMIT_NOUN: Record<PlanLimitKey, string> = {
  projects: 'project',
  users: 'user',
  templates: 'template',
  landingPages: 'published landing page',
  landingPagesCreate: 'created landing page',
};

/** Resolve a plan limit to a number; `Infinity` means unlimited. */
export function resolveLimit(
  plan: { limits: unknown } | null | undefined,
  key: PlanLimitKey,
): number {
  const limits = (plan?.limits ?? {}) as Partial<Record<PlanLimitKey, unknown>>;
  const raw = limits[key];

  // New shape: number (>= 0) or null (null / undefined => unlimited).
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : Infinity;
  }

  // Legacy string shape: "3" / "All" / "Unlimited" / "—" / "".
  if (typeof raw === 'string') {
    if (raw === '' || raw === 'All' || raw === 'Unlimited' || raw === '—') {
      return Infinity;
    }
    const max = parseInt(raw, 10);
    return Number.isNaN(max) || max < 0 ? Infinity : max;
  }

  // null / undefined / any other type -> unlimited.
  return Infinity;
}

/**
 * Assert that adding `addCount` more of `key` keeps the org within the plan.
 * `currentCount` is what the org already has. Unlimited (`null`) never blocks.
 * Used at every create path (projects, users) and — with `currentCount = 0`,
 * `addCount = requestedTotal` — for the wholesale template assignment.
 */
export function assertLimit(
  plan: { name?: string; limits: unknown } | null | undefined,
  key: PlanLimitKey,
  currentCount: number,
  addCount = 1,
): void {
  const max = resolveLimit(plan, key);
  if (currentCount + addCount > max) {
    const noun = LIMIT_NOUN[key];
    const planName = plan?.name ? `"${plan.name}" ` : '';
    throw new BadRequestException(
      `Your ${planName}plan allows ${max} ${noun}(s); your organisation already has ${currentCount}. Upgrade the plan to add more.`,
    );
  }
}

// --- Template quota — kept as named wrappers so the existing call sites and
// their exact error text are unchanged. ---

export function resolveTemplateQuota(
  plan: { limits: unknown } | null | undefined,
): number {
  return resolveLimit(plan, 'templates');
}

export function assertTemplateQuota(
  plan: { name: string; limits: unknown } | null | undefined,
  requestedCount: number,
): void {
  const max = resolveTemplateQuota(plan);
  if (requestedCount > max) {
    throw new BadRequestException(
      `Plan "${plan?.name ?? 'selected'}" allows max ${max} template(s), got ${requestedCount}`,
    );
  }
}

// --- Usage counters ---
// The agreed counting rules live here and nowhere else:
//   - users:    active + pending organisation users, including the
//               organisation admin; disabled users and users paused by
//               billing ("choose what stays") do not consume a seat.
//   - projects: every project counts, regardless of status — except ones
//               made view-only by billing.
//   - templates: assigned OrganisationTemplate rows.
//   - landingPages: LandingPage rows with pageType 'landing' — thank-you
//               companion pages are linked from a landing page, not sold
//               separately, so they do NOT consume an extra slot.

interface UserCountPrisma {
  user: { count: (args: any) => Promise<number> };
}
interface ProjectCountPrisma {
  project: { count: (args: any) => Promise<number> };
}
interface LandingPageCountPrisma {
  landingPage: { count: (args: any) => Promise<number> };
}

export function countBillableOrgUsers(
  prisma: UserCountPrisma,
  orgId: string,
): Promise<number> {
  return prisma.user.count({
    where: {
      orgId,
      status: { in: ['active', 'pending'] },
      billingPausedAt: null,
    },
  });
}

export function countOrgProjects(
  prisma: ProjectCountPrisma,
  orgId: string,
): Promise<number> {
  return prisma.project.count({ where: { orgId, billingViewOnlyAt: null } });
}

export function countOrgLandingPages(
  prisma: LandingPageCountPrisma,
  orgId: string,
): Promise<number> {
  return prisma.landingPage.count({
    where: { orgId, pageType: 'landing', status: 'published' },
  });
}

export function countOrgTotalLandingPages(
  prisma: LandingPageCountPrisma,
  orgId: string,
): Promise<number> {
  return prisma.landingPage.count({
    where: { orgId, pageType: 'landing' },
  });
}

// --- Downgrade guard ---

interface CountPrisma
  extends UserCountPrisma,
    ProjectCountPrisma,
    LandingPageCountPrisma {
  organisationTemplate: { count: (args: any) => Promise<number> };
}

/**
 * Reject switching an org onto `targetPlan` when the org is already using more
 * than that plan would allow for any limit. Names the limit and the numbers,
 * and never deletes anything to make it fit. No-op for unlimited limits or
 * when usage is within bounds. Counting rules are defined by the helpers above.
 */
/** One limit the org is over on a plan. */
export interface UsageOverLimit {
  key: PlanLimitKey;
  limit: number;
  used: number;
  /**
   * "Choose what stays" can make it fit (users, projects and published
   * landing pages are paused / taken offline); templates and created pages
   * can't be.
   */
  fixable: boolean;
}

const LIMIT_KEYS: PlanLimitKey[] = [
  'projects',
  'users',
  'templates',
  'landingPages',
  'landingPagesCreate',
];
const FIXABLE: ReadonlySet<PlanLimitKey> = new Set([
  'users',
  'projects',
  'landingPages',
]);

/** Every limit of `targetPlan` the org's current usage is over (empty = fits). */
export async function usageOverLimits(
  prisma: CountPrisma,
  orgId: string,
  targetPlan: { limits: unknown } | null | undefined,
): Promise<UsageOverLimit[]> {
  const [projects, users, templates, landingPages, landingPagesCreate] =
    await Promise.all([
      countOrgProjects(prisma, orgId),
      countBillableOrgUsers(prisma, orgId),
      prisma.organisationTemplate.count({ where: { orgId } }),
      countOrgLandingPages(prisma, orgId),
      countOrgTotalLandingPages(prisma, orgId),
    ]);
  const usage: Record<PlanLimitKey, number> = {
    projects,
    users,
    templates,
    landingPages,
    landingPagesCreate,
  };
  return LIMIT_KEYS.flatMap((key) => {
    const limit = resolveLimit(targetPlan, key);
    return usage[key] > limit
      ? [{ key, limit, used: usage[key], fixable: FIXABLE.has(key) }]
      : [];
  });
}

function overLimitError(
  targetPlan: { name?: string } | null | undefined,
  over: UsageOverLimit,
): BadRequestException {
  const planName = targetPlan?.name
    ? `The "${targetPlan.name}" plan`
    : 'This plan';
  return new BadRequestException(
    `${planName} allows ${over.limit} ${LIMIT_NOUN[over.key]}(s), but your organisation has ${over.used}. ` +
      `Reduce usage or choose a higher plan before switching.`,
  );
}

/**
 * Reject switching an org onto `targetPlan` when the org is already using more
 * than that plan would allow for any limit. Names the limit and the numbers,
 * and never deletes anything to make it fit. No-op for unlimited limits or
 * when usage is within bounds. Counting rules are defined by the helpers above.
 */
export async function assertPlanFitsCurrentUsage(
  prisma: CountPrisma,
  orgId: string,
  targetPlan: { name?: string; limits: unknown } | null | undefined,
): Promise<void> {
  const [first] = await usageOverLimits(prisma, orgId, targetPlan);
  if (first) throw overLimitError(targetPlan, first);
}

/**
 * Like assertPlanFitsCurrentUsage, but only for what "choose what stays"
 * can't fix (templates, created landing pages): users, projects and
 * published pages over the limit are paused by applyRetention when the plan
 * changes, using the org's saved choice or the default picks.
 */
export async function assertPlanFitsAfterRetention(
  prisma: CountPrisma,
  orgId: string,
  targetPlan: { name?: string; limits: unknown } | null | undefined,
): Promise<void> {
  const blocking = (await usageOverLimits(prisma, orgId, targetPlan)).find(
    (o) => !o.fixable,
  );
  if (blocking) throw overLimitError(targetPlan, blocking);
}
