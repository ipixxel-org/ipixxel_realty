/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
/**
 * Minimal in-memory stand-in for the Prisma calls the billing checkout and
 * plan-change code make. Transactions run one at a time (a mutex), which is
 * what the row locks guarantee in Postgres — enough to test idempotency.
 * Test-only.
 */
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;
type Where = Record<string, any>;

/** Prisma.DbNull writes SQL NULL: stored as null here. */
const dbNulls = (data: Row): Row =>
  Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === Prisma.DbNull ? null : v]),
  );

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    const v = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return (cond.in as unknown[]).includes(v);
      if ('notIn' in cond) return !(cond.notIn as unknown[]).includes(v);
      if ('not' in cond) return v !== cond.not;
      if ('lt' in cond) return v instanceof Date && v < cond.lt;
      return true; // relation filters etc. — not needed here
    }
    // A column the row never set reads as NULL, like in Postgres.
    return v === cond || (cond === null && v === undefined);
  });
}

let seq = 0;
const id = (p: string) => `${p}_${++seq}`;

function table(
  rows: Row[],
  prefix: string,
  includes: (row: Row, inc?: Row) => Row = (r) => r,
) {
  const find = (where?: Where) => rows.find((r) => matches(r, where));
  const out = (r: Row | undefined, inc?: Row) =>
    r ? includes({ ...r }, inc) : null;
  return {
    rows,
    findUnique: async ({ where, include }: { where: Where; include?: Row }) =>
      out(find(where), include),
    findUniqueOrThrow: async ({
      where,
      include,
    }: {
      where: Where;
      include?: Row;
    }) => {
      const r = out(find(where), include);
      if (!r) throw new Error(`${prefix} not found`);
      return r;
    },
    findFirst: async ({
      where,
      include,
    }: { where?: Where; include?: Row } = {}) => out(find(where), include),
    findFirstOrThrow: async ({
      where,
      include,
    }: { where?: Where; include?: Row } = {}) => {
      const r = out(find(where), include);
      if (!r) throw new Error(`${prefix} not found`);
      return r;
    },
    findMany: async ({
      where,
      distinct,
      include,
      orderBy,
      skip,
      take,
    }: {
      where?: Where;
      distinct?: string[];
      include?: Row;
      orderBy?: Row | Row[];
      skip?: number;
      take?: number;
    } = {}) => {
      let hit = rows
        .filter((r) => matches(r, where))
        .map((r) => (include ? includes({ ...r }, include) : { ...r }));
      // orderBy: { field: 'asc' | 'desc' } (or a list of them), dates or values.
      const order = (
        Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
      )
        .flatMap((o) => Object.entries(o))
        .filter(([, dir]) => dir === 'asc' || dir === 'desc');
      if (order.length) {
        const val = (v: unknown) => (v instanceof Date ? v.getTime() : v);
        hit = [...hit].sort((a, b) => {
          for (const [k, dir] of order) {
            const x = val(a[k]) as number;
            const y = val(b[k]) as number;
            if (x === y) continue;
            return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
          }
          return 0;
        });
      }
      if (skip) hit = hit.slice(skip);
      if (take !== undefined) hit = hit.slice(0, take);
      if (!distinct) return hit;
      const seen = new Set<string>();
      return hit.filter((r) => {
        const key = distinct.map((k) => String(r[k])).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    count: async ({ where }: { where?: Where } = {}) =>
      rows.filter((r) => matches(r, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row = {
        id: id(prefix),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      rows.push(row);
      return { ...row };
    },
    createMany: async ({ data }: { data: Row[] }) => {
      for (const d of data) rows.push({ id: id(prefix), ...d });
      return { count: data.length };
    },
    update: async ({ where, data }: { where: Where; data: Row }) => {
      const r = find(where);
      if (!r) throw new Error(`${prefix} not found`);
      Object.assign(r, dbNulls(data), { updatedAt: new Date() });
      return { ...r };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: Where;
      create: Row;
      update: Row;
    }) => {
      const r = find(where);
      if (r) {
        // Supports { field: { increment: n } } (invoice counters).
        for (const [k, v] of Object.entries(update)) {
          r[k] =
            v !== null && typeof v === 'object' && 'increment' in v
              ? (r[k] as number) + (v as { increment: number }).increment
              : v;
        }
        return { ...r };
      }
      const row = { id: id(prefix), createdAt: new Date(), ...create };
      rows.push(row);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) =>
        Object.assign(r, dbNulls(data), { updatedAt: new Date() }),
      );
      return { count: hit.length };
    },
    deleteMany: async ({ where }: { where?: Where } = {}) => {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    },
  };
}

/** A complete org profile for invoices (Settings → General fields). */
export const ORG_BILLING_DETAILS = {
  name: 'Acme Pvt Ltd',
  addressLine1: '1 Road',
  addressLine2: null,
  city: 'Bengaluru',
  state: '29',
  postalCode: '560001',
  country: 'India',
  gstin: null,
};

/** Fill in org-1's billing details (they live on the organisation row). */
export function giveBillingDetails(
  db: Row, // createFakeBillingDb().db
  over: Row = {},
  orgId = 'org-1',
) {
  const rows = (db.organisation as { rows: Row[] }).rows;
  let org = rows.find((r) => r.id === orgId);
  if (!org) {
    org = { id: orgId, name: 'Acme Realty' };
    rows.push(org);
  }
  Object.assign(org, ORG_BILLING_DETAILS, over);
}

export interface Seed {
  plans: Row[];
  subscription?: Row | null;
  /** The platform_configs row (grace days, reminders…); absent = defaults. */
  platformConfig?: Row | null;
  /** Extra org users / projects / landing pages (for choose-what-stays tests). */
  users?: Row[];
  projects?: Row[];
  landingPages?: Row[];
  /**
   * organisation_templates rows ({ orgId, templateId, assignedAt,
   * billingPausedAt, template: { name } }). When given, the template count
   * comes from these rows (non-paused) instead of usage.templates.
   */
  templates?: Row[];
  usage?: {
    users?: number;
    projects?: number;
    landingPages?: number;
    templates?: number;
  };
}

export function createFakeBillingDb(seed: Seed) {
  const plans: Row[] = seed.plans.map((p) => ({
    isActive: true,
    // Like the real Basic: the ₹0 plan in a fixture is the system (free) plan.
    isSystem: p.isSystem ?? (p.priceMonthly === 0 && p.priceYearly === 0),
    limits: {},
    capabilities: {},
    createdAt: new Date(0),
    description: '',
    ...p,
  }));
  const planById = (pid: string) => plans.find((p) => p.id === pid);
  const usage = {
    users: 1,
    projects: 1,
    landingPages: 0,
    templates: 0,
    ...seed.usage,
  };

  const db: Row = {};
  db.plan = table(plans, 'plan');
  // Plan versions (billing.plan_versions): findFirst is always "the newest".
  const versions = table([], 'ver');
  db.planVersion = {
    ...versions,
    findFirst: async ({ where }: { where?: Where } = {}) =>
      versions.rows
        .filter((v: Row) => matches(v, where))
        .sort((a: Row, b: Row) => b.version - a.version)[0] ?? null,
  };
  const versionById = (vid: string | null | undefined) =>
    versions.rows.find((v: Row) => v.id === vid) ?? null;
  db.subscription = table(
    seed.subscription ? [{ ...seed.subscription }] : [],
    'sub',
    (r, inc) => ({
      ...r,
      ...(inc?.plan ? { plan: planById(r.planId) } : {}),
      ...(inc?.planVersion
        ? { planVersion: versionById(r.planVersionId) }
        : {}),
    }),
  );
  db.packageChangeRequest = table([], 'pcr', (r, inc) => ({
    ...r,
    ...(inc?.billingCheckout
      ? {
          billingCheckout: withCoupon(
            db.billingCheckout.rows.find(
              (c: Row) => c.packageChangeRequestId === r.id,
            ),
          ),
        }
      : {}),
    ...(inc?.targetPlan ? { targetPlan: planById(r.targetPlanId) } : {}),
    ...(inc?.currentPlan ? { currentPlan: planById(r.currentPlanId) } : {}),
    ...(inc?.offlinePayment
      ? {
          offlinePayment:
            db.offlinePayment.rows.find(
              (p: Row) => p.packageChangeRequestId === r.id,
            ) ?? null,
        }
      : {}),
    ...(inc?.organisation
      ? { organisation: { id: r.orgId, name: 'Acme' } }
      : {}),
  }));
  // A checkout read with its coupon (include / select of `coupon`).
  const withCoupon = (c: Row | undefined): Row | null =>
    c
      ? {
          ...c,
          coupon: db.coupon.rows.find((x: Row) => x.id === c.couponId) ?? null,
          payment:
            db.payment.rows.find((p: Row) => p.id === c.paymentId) ?? null,
        }
      : null;
  db.billingCheckout = table([], 'chk', (r, inc) =>
    inc?.toPlan ? { ...r, toPlan: planById(r.toPlanId) } : r,
  );
  // Billing details are fields on the org (no billing profile table any more).
  db.organisation = table([{ id: 'org-1', name: 'Acme Realty' }], 'org');
  db.coupon = table([], 'cpn');
  db.invoice = table([], 'inv');
  db.invoiceCounter = table([], 'ctr');
  db.offlinePayment = table([], 'off');
  db.couponRedemption = table([], 'red');
  db.payment = table([], 'pay');
  db.auditLog = table([], 'audit');
  db.notification = table([], 'note');
  db.platformConfig = {
    findUnique: async () =>
      seed.platformConfig ? { ...seed.platformConfig } : null,
  };
  // One org admin (the owner). Counts come from `usage`; the rows below are
  // what "choose what stays" (retention.util) reads and pauses.
  const users = table(
    [
      {
        id: 'u-admin',
        orgId: 'org-1',
        status: 'active',
        firstName: 'Asha',
        lastName: null,
        email: 'asha@acme.test',
        billingPausedAt: null,
        createdAt: new Date(0),
        userRoles: [{ role: { key: 'admin', name: 'Admin' } }],
      },
      ...(seed.users ?? []),
    ],
    'user',
  );
  db.user = { ...users, count: async () => usage.users };
  const projects = table([...(seed.projects ?? [])], 'proj');
  db.project = { ...projects, count: async () => usage.projects };
  const pages = table([...(seed.landingPages ?? [])], 'page');
  db.landingPage = {
    ...pages,
    count: async () => usage.landingPages,
    // Only the shape retention.util asks for: by sourceTemplateId.
    groupBy: async ({ where }: { where?: Where }) => {
      const groups = new Map<string, Row[]>();
      for (const r of pages.rows.filter((p) => matches(p, where))) {
        const key = r.sourceTemplateId as string;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      return [...groups].map(([sourceTemplateId, rs]) => ({
        sourceTemplateId,
        _count: { _all: rs.length },
        _max: {
          createdAt: rs
            .map((r) => r.createdAt as Date)
            .reduce((a, b) => (a > b ? a : b)),
        },
      }));
    },
  };
  db.refreshToken = table([], 'rt');
  db.retentionChoice = table([], 'ret');
  db.lead = { groupBy: async () => [] };
  const templates = table([...(seed.templates ?? [])], 'ot');
  db.organisationTemplate = {
    ...templates,
    count: async (args?: { where?: Where }) =>
      seed.templates ? templates.count(args) : usage.templates,
  };

  let chain = Promise.resolve();
  db.$transaction = (fn: (tx: Row) => Promise<unknown>) => {
    const run = chain.then(() => fn(db));
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  db.$queryRaw = async () => [];
  db.$executeRaw = async () => 0;
  return { db, usage, planById, versions: versions.rows };
}
