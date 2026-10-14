/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
/**
 * Minimal in-memory stand-in for the Prisma calls the billing checkout and
 * plan-change code make. Transactions run one at a time (a mutex), which is
 * what the row locks guarantee in Postgres — enough to test idempotency.
 * Test-only.
 */
type Row = Record<string, any>;
type Where = Record<string, any>;

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const v = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return (cond.in as unknown[]).includes(v);
      if ('notIn' in cond) return !(cond.notIn as unknown[]).includes(v);
      if ('not' in cond) return v !== cond.not;
      if ('lt' in cond) return v instanceof Date && v < cond.lt;
      return true; // relation filters etc. — not needed here
    }
    return v === cond;
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
    findMany: async ({ where }: { where?: Where } = {}) =>
      rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
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
      Object.assign(r, data, { updatedAt: new Date() });
      return { ...r };
    },
    updateMany: async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: hit.length };
    },
  };
}

export interface Seed {
  plans: Row[];
  subscription?: Row | null;
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
    isSystem: false,
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
  db.subscription = table(
    seed.subscription ? [{ ...seed.subscription }] : [],
    'sub',
    (r, inc) => (inc?.plan ? { ...r, plan: planById(r.planId) } : r),
  );
  db.packageChangeRequest = table([], 'pcr', (r, inc) => ({
    ...r,
    ...(inc?.billingCheckout
      ? {
          billingCheckout:
            db.billingCheckout.rows.find(
              (c: Row) => c.packageChangeRequestId === r.id,
            ) ?? null,
        }
      : {}),
    ...(inc?.targetPlan ? { targetPlan: planById(r.targetPlanId) } : {}),
    ...(inc?.organisation
      ? { organisation: { id: r.orgId, name: 'Acme' } }
      : {}),
  }));
  db.billingCheckout = table([], 'chk', (r, inc) =>
    inc?.toPlan ? { ...r, toPlan: planById(r.toPlanId) } : r,
  );
  db.billingProfile = table([], 'prof');
  db.payment = table([], 'pay');
  db.auditLog = table([], 'audit');
  db.notification = table([], 'note');
  db.user = {
    ...table([], 'user'),
    count: async () => usage.users,
    findMany: async () => [{ id: 'u-admin' }],
  };
  db.project = { count: async () => usage.projects };
  db.landingPage = { count: async () => usage.landingPages };
  db.organisationTemplate = { count: async () => usage.templates };

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
  return { db, usage, planById };
}
