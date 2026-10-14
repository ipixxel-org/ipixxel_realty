/**
 * The "default picks" rule for moving to a smaller plan: which users,
 * projects and landing pages stay active when nobody chooses.
 *
 * - Users: the owner first, then admins, then everyone else — each group by
 *   most recent login.
 * - Projects: most recently updated first.
 * - Landing pages: most leads in the last 30 days first.
 *
 * Pure functions, unit-tested in `__tests__/default-picks.test.ts`. The
 * backend applies the same rule when an org moves to a smaller plan.
 */
import { formatShortDate } from "./pricing";
import type { PlanLimits } from "./types";

export type MemberRole = "owner" | "admin" | "manager" | "agent";

export interface PickUser {
  id: string;
  name: string;
  role: MemberRole;
  lastLoginAt: string;
}

export interface PickProject {
  id: string;
  name: string;
  updatedAt: string;
}

export interface PickLandingPage {
  id: string;
  name: string;
  leadsLast30Days: number;
}

export interface RankedItem<T> {
  item: T;
  /** Why the rule ranks it where it is. */
  reason: string;
  picked: boolean;
}

const ROLE_RANK: Record<MemberRole, number> = { owner: 0, admin: 1, manager: 2, agent: 2 };

export function rankUsers<U extends PickUser>(users: U[], limit: number): RankedItem<U>[] {
  const sorted = [...users].sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || b.lastLoginAt.localeCompare(a.lastLoginAt) || a.name.localeCompare(b.name),
  );
  return sorted.map((u, i) => ({
    item: u,
    picked: i < limit,
    reason:
      u.role === "owner"
        ? "Owner — always stays"
        : u.role === "admin"
          ? `Admin · last login ${formatShortDate(u.lastLoginAt)}`
          : `Last login ${formatShortDate(u.lastLoginAt)}`,
  }));
}

export function rankProjects<P extends PickProject>(projects: P[], limit: number): RankedItem<P>[] {
  const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  return sorted.map((p, i) => ({ item: p, picked: i < limit, reason: `Updated ${formatShortDate(p.updatedAt)}` }));
}

export function rankLandingPages<L extends PickLandingPage>(pages: L[], limit: number): RankedItem<L>[] {
  const sorted = [...pages].sort((a, b) => b.leadsLast30Days - a.leadsLast30Days || a.name.localeCompare(b.name));
  return sorted.map((p, i) => ({
    item: p,
    picked: i < limit,
    reason: `${p.leadsLast30Days} lead${p.leadsLast30Days === 1 ? "" : "s"} in the last 30 days`,
  }));
}

export function defaultPicks(
  data: { users: PickUser[]; projects: PickProject[]; landingPages: PickLandingPage[] },
  limits: Pick<PlanLimits, "users" | "projects" | "landingPages">,
) {
  const ids = <T extends { id: string }>(ranked: RankedItem<T>[]) => ranked.filter((r) => r.picked).map((r) => r.item.id);
  return {
    users: ids(rankUsers(data.users, limits.users)),
    projects: ids(rankProjects(data.projects, limits.projects)),
    landingPages: ids(rankLandingPages(data.landingPages, limits.landingPages)),
  };
}
