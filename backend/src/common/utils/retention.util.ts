import type { Prisma, PrismaClient } from '@prisma/client';
import { resolveLimit } from './plan-quota.util';

// ---------------------------------------------------------------------------
// Billing v2 "choose what stays". When an organisation is on a plan smaller
// than what it has, the extra users are paused (can't sign in, no seat),
// projects become view-only (don't count), landing pages go offline
// (unpublished, so they don't count either) and templates are paused (can't
// be used for new landing pages; pages already made from them are separate
// copies and stay as they are). Nothing is deleted. When the plan has room
// again everything comes back.
//
// What stays: the org's saved choice for that plan (retention_choices), else
// the default picks — the same rule as frontend/lib/billing/default-picks.ts:
//   users          owner, then admins, then everyone else; each by latest sign-in
//   projects       most recently updated
//   landing pages  most leads in the last 30 days
//   templates      most landing pages made from it, then the most recently
//                  used (latest page made from it), then the most recently
//                  assigned
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
  | 'organisationTemplate'
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
export interface RetentionTemplate {
  /** The template id (organisation_templates.template_id). */
  id: string;
  name: string;
  /** Landing pages made from it (sourceTemplateId). */
  pagesMade: number;
  /** When the latest of those was made. */
  lastUsedAt: Date | null;
  assignedAt: Date;
  paused: boolean;
}
export interface RetentionCandidates {
  users: RetentionUser[];
  projects: RetentionProject[];
  landingPages: RetentionPage[];
  templates: RetentionTemplate[];
}

/** Everything that could be kept: active/pending users, projects, live or billing-offline landing pages, assigned templates. */
export async function loadRetentionCandidates(
  db: RetentionDb,
  orgId: string,
  now = new Date(),
): Promise<RetentionCandidates> {
  const [users, projects, pages, templates] = await Promise.all([
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
    db.organisationTemplate.findMany({
      where: { orgId },
      select: {
        templateId: true,
        assignedAt: true,
        billingPausedAt: true,
        template: { select: { name: true } },
      },
    }),
  ]);

  const userIds = users.map((u) => u.id);
  const [logins, leads, used] = await Promise.all([
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
    templates.length
      ? db.landingPage.groupBy({
          by: ['sourceTemplateId'],
          where: {
            orgId,
            pageType: 'landing',
            sourceTemplateId: { in: templates.map((t) => t.templateId) },
          },
          _count: { _all: true },
          _max: { createdAt: true },
        })
      : Promise.resolve(
          [] as {
            sourceTemplateId: string | null;
            _count: { _all: number };
            _max: { createdAt: Date | null };
          }[],
        ),
  ]);
  const usedBy = new Map(used.map((u) => [u.sourceTemplateId, u]));
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
    templates: templates.map((t) => ({
      id: t.templateId,
      name: t.template.name,
      pagesMade: usedBy.get(t.templateId)?._count._all ?? 0,
      lastUsedAt: usedBy.get(t.templateId)?._max.createdAt ?? null,
      assignedAt: t.assignedAt,
      paused: !!t.billingPausedAt,
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
    templates: [...c.templates].sort(
      (a, b) =>
        b.pagesMade - a.pagesMade ||
        time(b.lastUsedAt) - time(a.lastUsedAt) ||
        b.assignedAt.getTime() - a.assignedAt.getTime() ||
        a.name.localeCompare(b.name),
    ),
  };
}

export interface RetentionLimits {
  users: number;
  projects: number;
  landingPages: number;
  templates: number;
}

export const retentionLimits = (plan: {
  limits: unknown;
}): RetentionLimits => ({
  users: resolveLimit(plan, 'users'),
  projects: resolveLimit(plan, 'projects'),
  landingPages: resolveLimit(plan, 'landingPages'),
  templates: resolveLimit(plan, 'templates'),
});

export interface RetentionKeep {
  users: string[];
  projects: string[];
  landingPages: string[];
  templates: string[];
}

/** A saved choice; `templates` is null on choices saved before templates could be paused. */
export type SavedRetention = Omit<RetentionKeep, 'templates'> & {
  templates: string[] | null;
};

export const RETENTION_KINDS = [
  'users',
  'projects',
  'landingPages',
  'templates',
] as const;
export type RetentionKind = (typeof RETENTION_KINDS)[number];

/**
 * What stays on a plan. A saved choice wins (limited to what still exists and
 * to the limit, owner always in); otherwise the top of the default order.
 */
export function pickRetention(
  ranked: RetentionCandidates,
  limits: RetentionLimits,
  choice: SavedRetention | RetentionKeep | null,
): RetentionKeep {
  const pick = <T extends { id: string }>(
    items: T[],
    limit: number,
    chosen: string[] | null | undefined,
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
    templates: pick(ranked.templates, limits.templates, choice?.templates),
  };
}

/** The saved choice for this plan, or null (then the defaults apply). */
export async function savedChoiceFor(
  db: Pick<RetentionDb, 'retentionChoice'>,
  orgId: string,
  planId: string,
): Promise<SavedRetention | null> {
  const row = await db.retentionChoice.findUnique({
    where: { organisationId: orgId },
  });
  return row && row.targetPlanId === planId
    ? {
        users: row.userIds,
        projects: row.projectIds,
        landingPages: row.landingPageIds,
        templates: row.templateIds.length ? row.templateIds : null,
      }
    : null;
}

/** One limit the org is over on a plan: what stays and what is paused. */
export interface WhatStaysGroup {
  limit: number;
  total: number;
  kept: { id: string; name: string }[];
  paused: { id: string; name: string }[];
}

/**
 * A copy of "choose what stays" for a plan, kept on a package change request
 * (Settings → Billing → Requests). Only the limits the org is over appear.
 * `choice`: the org's saved choice, or the default picks. `applied`: what
 * was actually kept when the request was approved.
 */
export interface WhatStays {
  planId: string;
  planName: string;
  choice: 'saved' | 'default';
  applied: boolean;
  users?: WhatStaysGroup;
  projects?: WhatStaysGroup;
  landingPages?: WhatStaysGroup;
  templates?: WhatStaysGroup;
}

/** What stays on `plan` with the saved choice (or the defaults); null when nothing is over. */
export async function whatStaysFor(
  db: RetentionDb,
  orgId: string,
  plan: { id: string; name: string; limits: unknown },
  applied = false,
  now = new Date(),
): Promise<WhatStays | null> {
  const ranked = rankRetention(await loadRetentionCandidates(db, orgId, now));
  const limits = retentionLimits(plan);
  const saved = await savedChoiceFor(db, orgId, plan.id);
  const keep = pickRetention(ranked, limits, saved);
  const out: WhatStays = {
    planId: plan.id,
    planName: plan.name,
    choice: saved ? 'saved' : 'default',
    applied,
  };
  let over = false;
  for (const key of RETENTION_KINDS) {
    const items: { id: string; name: string }[] = ranked[key];
    if (!Number.isFinite(limits[key]) || items.length <= limits[key]) continue;
    over = true;
    const pick = ({ id, name }: { id: string; name: string }) => ({ id, name });
    out[key] = {
      limit: limits[key],
      total: items.length,
      kept: items.filter((i) => keep[key].includes(i.id)).map(pick),
      paused: items.filter((i) => !keep[key].includes(i.id)).map(pick),
    };
  }
  return over ? out : null;
}

export type RetentionCounts = Record<RetentionKind, number>;
export interface RetentionResult {
  paused: RetentionCounts;
  restored: RetentionCounts;
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
    paused: { users: 0, projects: 0, landingPages: 0, templates: 0 },
    restored: { users: 0, projects: 0, landingPages: 0, templates: 0 },
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

  // Templates: only new landing pages are blocked; pages already made from a
  // paused template are untouched.
  const pauseTemplates = ranked.templates
    .filter((t) => !keep.templates.includes(t.id) && !t.paused)
    .map((t) => t.id);
  const restoreTemplates = ranked.templates
    .filter((t) => keep.templates.includes(t.id) && t.paused)
    .map((t) => t.id);
  if (pauseTemplates.length) {
    await db.organisationTemplate.updateMany({
      where: { orgId, templateId: { in: pauseTemplates } },
      data: { billingPausedAt: now },
    });
  }
  if (restoreTemplates.length) {
    await db.organisationTemplate.updateMany({
      where: { orgId, templateId: { in: restoreTemplates } },
      data: { billingPausedAt: null },
    });
  }
  result.paused.templates = pauseTemplates.length;
  result.restored.templates = restoreTemplates.length;
  return result;
}
