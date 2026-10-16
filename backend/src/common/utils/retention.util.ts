import type { Prisma, PrismaClient } from '@prisma/client';
import { resolveLimit } from './plan-quota.util';

// ---------------------------------------------------------------------------
// Billing v2 "choose what stays". When an organisation is on a plan smaller
// than what it has, the extra users are paused (can't sign in, no seat),
// projects become view-only (don't count), and landing pages go offline
// (unpublished, so they don't count either). Nothing is deleted. When the
// plan has room again everything comes back.
//
// What stays: the org's saved choice for that plan (retention_choices), else
// the default picks — the same rule as frontend/lib/billing/default-picks.ts:
//   users          owner, then admins, then everyone else; each by latest sign-in
//   projects       most recently updated
//   landing pages  most leads in the last 30 days
// applyRetention() is called on every plan change (plan-change.util,
// subscription-lifecycle.util), so the state always matches the plan.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export type RetentionDb = Pick<
  PrismaClient | Prisma.TransactionClient,
  | 'user'
  | 'project'
  | 'landingPage'
  | 'lead'
  | 'refreshToken'
  | 'retentionChoice'
>;

export interface RetentionUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  roleName: string;
  lastLoginAt: Date | null;
  paused: boolean;
}
export interface RetentionProject {
  id: string;
  name: string;
  location: string | null;
  updatedAt: Date;
  viewOnly: boolean;
}
export interface RetentionPage {
  id: string;
  name: string;
  slug: string;
  leadsLast30Days: number;
  offline: boolean;
}
export interface RetentionCandidates {
  users: RetentionUser[];
  projects: RetentionProject[];
  landingPages: RetentionPage[];
}

/** Everything that could be kept: active/pending users, projects, live or billing-offline landing pages. */
export async function loadRetentionCandidates(
  db: RetentionDb,
  orgId: string,
  now = new Date(),
): Promise<RetentionCandidates> {
  const [users, projects, pages] = await Promise.all([
    db.user.findMany({
      where: { orgId, status: { in: ['active', 'pending'] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        billingPausedAt: true,
        userRoles: { select: { role: { select: { key: true, name: true } } } },
      },
    }),
    db.project.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        location: true,
        updatedAt: true,
        billingViewOnlyAt: true,
      },
    }),
    db.landingPage.findMany({
      where: {
        orgId,
        pageType: 'landing',
        OR: [{ status: 'published' }, { billingOfflineAt: { not: null } }],
      },
      select: { id: true, name: true, slug: true, billingOfflineAt: true },
    }),
  ]);

  const userIds = users.map((u) => u.id);
  const [logins, leads] = await Promise.all([
    userIds.length
      ? db.refreshToken.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['userId'],
          select: { userId: true, createdAt: true },
        })
      : Promise.resolve([] as { userId: string; createdAt: Date }[]),
    pages.length
      ? db.lead.groupBy({
          by: ['landingPageId'],
          where: {
            orgId,
            landingPageId: { in: pages.map((p) => p.id) },
            createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
          },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as { landingPageId: string | null; _count: { _all: number } }[],
        ),
  ]);
  const lastLogin = new Map(logins.map((l) => [l.userId, l.createdAt]));
  const leadCount = new Map(leads.map((l) => [l.landingPageId, l._count._all]));

  return {
    users: users.map((u, i) => {
      const keys = u.userRoles.map((r) => r.role.key);
      return {
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        email: u.email,
        // The org's first account is its owner (the person who signed up).
        role: i === 0 ? 'owner' : keys.includes('admin') ? 'admin' : 'member',
        roleName: i === 0 ? 'Owner' : (u.userRoles[0]?.role.name ?? 'Member'),
        lastLoginAt: lastLogin.get(u.id) ?? null,
        paused: !!u.billingPausedAt,
      };
    }),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      location: p.location,
      updatedAt: p.updatedAt,
      viewOnly: !!p.billingViewOnlyAt,
    })),
    landingPages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      leadsLast30Days: leadCount.get(p.id) ?? 0,
      offline: !!p.billingOfflineAt,
    })),
  };
}

const ROLE_RANK = { owner: 0, admin: 1, member: 2 } as const;
const time = (d: Date | null) => (d ? d.getTime() : 0);

/** Default order (best first) — the same rule as the UI's default-picks.ts. */
export function rankRetention(c: RetentionCandidates): RetentionCandidates {
  return {
    users: [...c.users].sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        time(b.lastLoginAt) - time(a.lastLoginAt) ||
        a.name.localeCompare(b.name),
    ),
    projects: [...c.projects].sort(
      (a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime() ||
        a.name.localeCompare(b.name),
    ),
    landingPages: [...c.landingPages].sort(
      (a, b) =>
        b.leadsLast30Days - a.leadsLast30Days || a.name.localeCompare(b.name),
    ),
  };
}

export interface RetentionLimits {
  users: number;
  projects: number;
  landingPages: number;
}

export const retentionLimits = (plan: {
  limits: unknown;
}): RetentionLimits => ({
  users: resolveLimit(plan, 'users'),
  projects: resolveLimit(plan, 'projects'),
  landingPages: resolveLimit(plan, 'landingPages'),
});

export interface RetentionKeep {
  users: string[];
  projects: string[];
  landingPages: string[];
}

/**
 * What stays on a plan. A saved choice wins (limited to what still exists and
 * to the limit, owner always in); otherwise the top of the default order.
 */
export function pickRetention(
  ranked: RetentionCandidates,
  limits: RetentionLimits,
  choice: RetentionKeep | null,
): RetentionKeep {
  const pick = <T extends { id: string }>(
    items: T[],
    limit: number,
    chosen: string[] | undefined,
    mustKeep: string[] = [],
  ) => {
    if (!Number.isFinite(limit) || items.length <= limit) {
      return items.map((i) => i.id);
    }
    const order = chosen
      ? [
          ...mustKeep,
          ...items
            .map((i) => i.id)
            .filter((id) => chosen.includes(id) && !mustKeep.includes(id)),
        ]
      : items.map((i) => i.id);
    return order.slice(0, Math.max(limit, mustKeep.length));
  };
  const owner = ranked.users.filter((u) => u.role === 'owner').map((u) => u.id);
  return {
    users: pick(ranked.users, limits.users, choice?.users, owner),
    projects: pick(ranked.projects, limits.projects, choice?.projects),
    landingPages: pick(
      ranked.landingPages,
      limits.landingPages,
      choice?.landingPages,
    ),
  };
}

/** The saved choice for this plan, or null (then the defaults apply). */
export async function savedChoiceFor(
  db: Pick<RetentionDb, 'retentionChoice'>,
  orgId: string,
  planId: string,
): Promise<RetentionKeep | null> {
  const row = await db.retentionChoice.findUnique({
    where: { organisationId: orgId },
  });
  return row && row.targetPlanId === planId
    ? {
        users: row.userIds,
        projects: row.projectIds,
        landingPages: row.landingPageIds,
      }
    : null;
}

export interface RetentionResult {
  paused: { users: number; projects: number; landingPages: number };
  restored: { users: number; projects: number; landingPages: number };
}

/**
 * Make the organisation match `plan`: pause / take offline what doesn't stay,
 * bring back what does. Idempotent; never deletes anything.
 */
export async function applyRetention(
  db: RetentionDb,
  orgId: string,
  plan: { id: string; limits: unknown },
  now = new Date(),
): Promise<RetentionResult> {
  const ranked = rankRetention(await loadRetentionCandidates(db, orgId, now));
  const keep = pickRetention(
    ranked,
    retentionLimits(plan),
    await savedChoiceFor(db, orgId, plan.id),
  );
  const result: RetentionResult = {
    paused: { users: 0, projects: 0, landingPages: 0 },
    restored: { users: 0, projects: 0, landingPages: 0 },
  };

  // Users
  const pauseUsers = ranked.users
    .filter((u) => !keep.users.includes(u.id) && !u.paused)
    .map((u) => u.id);
  const restoreUsers = ranked.users
    .filter((u) => keep.users.includes(u.id) && u.paused)
    .map((u) => u.id);
  if (pauseUsers.length) {
    await db.user.updateMany({
      where: { id: { in: pauseUsers } },
      data: { billingPausedAt: now },
    });
    // End their sessions: refresh is refused and open tabs sign out on the
    // next request (OrgApprovedGuard).
    await db.refreshToken.updateMany({
      where: { userId: { in: pauseUsers }, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  if (restoreUsers.length) {
    await db.user.updateMany({
      where: { id: { in: restoreUsers } },
      data: { billingPausedAt: null },
    });
  }
  result.paused.users = pauseUsers.length;
  result.restored.users = restoreUsers.length;

  // Projects
  const viewOnly = ranked.projects
    .filter((p) => !keep.projects.includes(p.id) && !p.viewOnly)
    .map((p) => p.id);
  const editable = ranked.projects
    .filter((p) => keep.projects.includes(p.id) && p.viewOnly)
    .map((p) => p.id);
  if (viewOnly.length) {
    await db.project.updateMany({
      where: { id: { in: viewOnly } },
      data: { billingViewOnlyAt: now },
    });
  }
  if (editable.length) {
    await db.project.updateMany({
      where: { id: { in: editable } },
      data: { billingViewOnlyAt: null },
    });
  }
  result.paused.projects = viewOnly.length;
  result.restored.projects = editable.length;

  // Landing pages (and their thank-you companions)
  const offline = ranked.landingPages
    .filter((p) => !keep.landingPages.includes(p.id) && !p.offline)
    .map((p) => p.id);
  const online = ranked.landingPages
    .filter((p) => keep.landingPages.includes(p.id) && p.offline)
    .map((p) => p.id);
  if (offline.length) {
    await db.landingPage.updateMany({
      where: {
        OR: [
          { id: { in: offline } },
          { parentId: { in: offline }, pageType: 'thank_you' },
        ],
        status: 'published',
      },
      data: { status: 'unpublished', billingOfflineAt: now },
    });
  }
  if (online.length) {
    await db.landingPage.updateMany({
      where: {
        OR: [
          { id: { in: online } },
          { parentId: { in: online }, pageType: 'thank_you' },
        ],
        billingOfflineAt: { not: null },
      },
      data: { status: 'published', billingOfflineAt: null },
    });
  }
  result.paused.landingPages = offline.length;
  result.restored.landingPages = online.length;
  return result;
}
