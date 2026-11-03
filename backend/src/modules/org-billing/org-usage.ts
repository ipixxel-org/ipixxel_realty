import {
  countBillableOrgUsers,
  countOrgLandingPages,
  countOrgProjects,
  countOrgTotalLandingPages,
  resolveLimit,
} from '../../common/utils/plan-quota.util';

/**
 * What the org uses against its plan's limits — the `usage` block of
 * GET /org/billing, and of GET /org/billing/access (open to every member, so
 * limit prompts show before a form is filled in). `*Limit: null` = unlimited,
 * or no plan at all.
 */
export interface OrgUsageSummary {
  templatesUsed: number;
  templatesLimit: number | null;
  projectsUsed: number;
  projectsLimit: number | null;
  usersUsed: number;
  usersLimit: number | null;
  landingPagesUsed: number;
  landingPagesLimit: number | null;
  landingPagesCreateUsed: number;
  landingPagesCreateLimit: number | null;
}

type UsagePrisma = Parameters<typeof countBillableOrgUsers>[0] &
  Parameters<typeof countOrgProjects>[0] &
  Parameters<typeof countOrgLandingPages>[0] & {
    organisationTemplate: { count: (args: any) => Promise<number> };
  };

/** `plan` is the org's version of its subscription plan, or null with no subscription. */
export async function orgUsageSummary(
  prisma: UsagePrisma,
  orgId: string,
  plan: { limits: unknown } | null,
): Promise<OrgUsageSummary> {
  const [
    templatesUsed,
    projectsUsed,
    usersUsed,
    landingPagesUsed,
    landingPagesCreateUsed,
  ] = await Promise.all([
    prisma.organisationTemplate.count({ where: { orgId } }),
    countOrgProjects(prisma, orgId),
    countBillableOrgUsers(prisma, orgId),
    countOrgLandingPages(prisma, orgId),
    countOrgTotalLandingPages(prisma, orgId),
  ]);
  // Infinity -> null so the UI renders "unlimited" without a magic number.
  const asLimit = (
    key: 'projects' | 'users' | 'templates' | 'landingPages' | 'landingPagesCreate',
  ) => {
    if (!plan) return null;
    const n = resolveLimit(plan, key);
    return n === Infinity ? null : n;
  };
  return {
    templatesUsed,
    templatesLimit: asLimit('templates'),
    projectsUsed,
    projectsLimit: asLimit('projects'),
    usersUsed,
    usersLimit: asLimit('users'),
    landingPagesUsed,
    landingPagesLimit: asLimit('landingPages'),
    landingPagesCreateUsed,
    landingPagesCreateLimit: asLimit('landingPagesCreate'),
  };
}
