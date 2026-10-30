/**
 * Billing v2 plan versions: what changes when an org moves from the version it
 * has to its plan's latest version, and when that happens.
 *
 * - A paid plan moves at its renewal. From the renewal window (notifyDays
 *   before) and through grace, the org sees what changes: price, limits and
 *   features ("Starter changes on 26 Nov: 3 users instead of 5").
 * - Basic has no renewal. A new Basic version that's the same or bigger, or
 *   that the org fits, applies straight away; one with lower limits the org
 *   is over applies BASIC_NOTICE_DAYS after it was made, with what doesn't fit
 *   paused (their choice or the default picks).
 */
import type { Plan, PlanVersion } from '@prisma/client';
import { PLAN_CAPABILITY_CATALOG } from '../../modules/plans/plan-capabilities';
import {
  latestPlanVersion,
  planVersionsApplied,
  type PlanTerms,
} from './plan-version.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days of notice before a smaller Basic version applies to an org over it. */
export const BASIC_NOTICE_DAYS = 7;

export interface VersionChange {
  /** A limit key (users, projects, landingPages, templates, metaPages) or a feature key. */
  key: string;
  kind: 'limit' | 'feature';
  label: string;
  /** Limits: a number, or null for unlimited. Features: on / off. */
  from: number | boolean | null;
  to: number | boolean | null;
  /** Fewer than before, or a feature switched off. */
  lower: boolean;
}

export interface VersionPriceChange {
  monthly: { from: number; to: number } | null;
  yearly: { from: number; to: number } | null;
}

const LIMITS: { key: string; label: string; one: string }[] = [
  { key: 'users', label: 'users', one: 'user' },
  { key: 'projects', label: 'projects', one: 'project' },
  {
    key: 'landingPages',
    label: 'live landing pages',
    one: 'live landing page',
  },
  { key: 'templates', label: 'templates', one: 'template' },
  { key: 'metaPages', label: 'Meta pages', one: 'Meta page' },
];

const FEATURE_LABELS: Record<string, string> = {
  teamChat: 'Team chat',
  metaLeadAds: 'Meta lead ads',
  ...Object.fromEntries(PLAN_CAPABILITY_CATALOG.map((c) => [c.key, c.label])),
};
const ON_BY_DEFAULT = new Set(['teamChat', 'metaLeadAds']);

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

function limitOf(limits: unknown, key: string): number | null {
  const raw = asObject(limits)[key];
  if (typeof raw === 'number')
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n < 0 ? null : n;
  }
  return null;
}

function featureOn(caps: unknown, key: string): boolean {
  const v = asObject(caps)[key];
  return v === undefined ? ON_BY_DEFAULT.has(key) : v === true;
}

/** Each limit and feature that differs between two versions. */
export function versionChanges(
  from: PlanTerms,
  to: PlanTerms,
): VersionChange[] {
  const out: VersionChange[] = [];
  for (const l of LIMITS) {
    const a = limitOf(from.limits, l.key);
    const b = limitOf(to.limits, l.key);
    if (a === b) continue;
    out.push({
      key: l.key,
      kind: 'limit',
      label: l.label,
      from: a,
      to: b,
      // null = unlimited.
      lower: b !== null && (a === null || b < a),
    });
  }
  const keys = new Set([
    ...Object.keys(asObject(from.capabilities)),
    ...Object.keys(asObject(to.capabilities)),
  ]);
  for (const key of keys) {
    if (!(key in FEATURE_LABELS)) continue;
    const a = featureOn(from.capabilities, key);
    const b = featureOn(to.capabilities, key);
    if (a === b) continue;
    out.push({
      key,
      kind: 'feature',
      label: FEATURE_LABELS[key],
      from: a,
      to: b,
      lower: a && !b,
    });
  }
  return out;
}

export function priceChange(
  from: PlanTerms,
  to: PlanTerms,
): VersionPriceChange | null {
  const monthly =
    from.priceMonthly !== to.priceMonthly
      ? { from: from.priceMonthly, to: to.priceMonthly }
      : null;
  const yearly =
    from.priceYearly !== to.priceYearly
      ? { from: from.priceYearly, to: to.priceYearly }
      : null;
  return monthly || yearly ? { monthly, yearly } : null;
}

/** "3 users instead of 5", "unlimited projects instead of 3", "no Team chat". */
export function describeChange(c: VersionChange): string {
  if (c.kind === 'feature')
    return c.to ? `${c.label} included` : `no ${c.label}`;
  const l = LIMITS.find((x) => x.key === c.key)!;
  const n = (v: number | boolean | null) =>
    v === null
      ? `unlimited ${l.label}`
      : `${v as number} ${v === 1 ? l.one : l.label}`;
  const was = c.from === null ? 'unlimited' : String(c.from);
  return `${n(c.to)} instead of ${was}`;
}

export interface UpcomingVersion {
  planId: string;
  planName: string;
  /** The plan row as it is now (its latest version's terms). */
  plan: Plan;
  fromVersion: number | null;
  toVersion: number;
  toVersionId: string;
  /** When the org moves to it: the renewal date, or (Basic) the end of the notice. */
  at: Date;
  reason: 'renewal' | 'basic';
  price: VersionPriceChange | null;
  changes: VersionChange[];
  /** Some limit is lower or a feature is switched off. */
  lower: boolean;
}

type SubWithVersion = {
  planId: string;
  planVersionId: string | null;
  status: string;
  renewsAt: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  scheduledPlanId?: string | null;
  plan: Plan;
  planVersion?: PlanVersion | null;
};

/**
 * The newer version the org will move to, and when — or null (on the latest,
 * versions not applied, a change to another plan or Basic is scheduled, or a
 * paid plan outside its renewal window).
 */
export async function upcomingVersion(
  db: Parameters<typeof latestPlanVersion>[0],
  sub: SubWithVersion | null,
  opts: { notifyDays: number; now: Date },
): Promise<UpcomingVersion | null> {
  if (!sub || !planVersionsApplied() || !sub.planVersion) return null;
  if (sub.scheduledPlanId || sub.cancelAtPeriodEnd) return null;
  const latest = await latestPlanVersion(db, sub.planId);
  if (!latest || latest.id === sub.planVersionId) return null;
  const free = sub.plan.isSystem;
  let at: Date;
  if (free) {
    at = new Date(latest.createdAt.getTime() + BASIC_NOTICE_DAYS * DAY_MS);
  } else {
    if (!sub.renewsAt) return null;
    const inWindow =
      sub.renewsAt.getTime() - opts.now.getTime() <= opts.notifyDays * DAY_MS;
    const overdue = sub.status === 'past_due' || sub.status === 'expired';
    if (!inWindow && !overdue) return null;
    at = sub.renewsAt;
  }
  const changes = versionChanges(sub.planVersion, latest);
  const price = free ? null : priceChange(sub.planVersion, latest);
  if (!changes.length && !price) return null;
  return {
    planId: sub.planId,
    planName: sub.plan.name,
    plan: sub.plan,
    fromVersion: sub.planVersion.version,
    toVersion: latest.version,
    toVersionId: latest.id,
    at,
    reason: free ? 'basic' : 'renewal',
    price,
    changes,
    lower: changes.some((c) => c.lower),
  };
}

/** Each plan's newest version, by plan id. */
export async function latestVersionsByPlan(db: {
  planVersion?: { findMany: (args: object) => Promise<PlanVersion[]> };
}): Promise<Map<string, PlanVersion>> {
  const out = new Map<string, PlanVersion>();
  if (!db.planVersion) return out;
  const rows = await db.planVersion.findMany({ orderBy: { version: 'desc' } });
  for (const v of rows) if (!out.has(v.planId)) out.set(v.planId, v);
  return out;
}

/** For Super Admin: the version an org is on, the plan's newest, and when it moves. */
export interface OrgPlanVersionInfo {
  /** null = not recorded (treated as the latest). */
  planVersion: number | null;
  latestVersion: number | null;
  /** YYYY-MM-DD the newer version applies (renewal, or the end of Basic's notice); null = on the latest. */
  versionAppliesOn: string | null;
}

export function orgPlanVersionInfo(
  sub: {
    planId: string;
    renewsAt: Date | null;
    planVersion?: { id: string; version: number } | null;
    plan?: { isSystem: boolean } | null;
  } | null,
  latest: Map<string, PlanVersion>,
): OrgPlanVersionInfo {
  const newest = sub ? latest.get(sub.planId) : undefined;
  const mine = sub?.planVersion ?? null;
  const behind = !!mine && !!newest && newest.id !== mine.id;
  const appliesOn = !behind
    ? null
    : sub!.plan?.isSystem
      ? new Date(newest.createdAt.getTime() + BASIC_NOTICE_DAYS * DAY_MS)
      : sub!.renewsAt;
  return {
    planVersion: mine?.version ?? newest?.version ?? null,
    latestVersion: newest?.version ?? null,
    versionAppliesOn: appliesOn ? appliesOn.toISOString().slice(0, 10) : null,
  };
}
