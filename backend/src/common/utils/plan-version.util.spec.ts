/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion -- test-only in-memory fake: rows are untyped on purpose */
import {
  effectivePlan,
  ensureLatestPlanVersion,
  latestPlanVersionId,
  sameTerms,
  withEffectivePlan,
} from './plan-version.util';
import { AdminBillingService } from '../../modules/billing/admin-billing.service';
import { PlansService } from '../../modules/plans/plans.service';

/** In-memory plans + plan_versions (enough for the version helpers). */
function fakeVersionDb(plans: Record<string, any>[]) {
  const rows = plans.map((p) => ({ ...p }));
  const versions: any[] = [];
  let seq = 0;
  const db = {
    versions,
    rows,
    plan: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(rows.find((p) => p.id === where.id) ?? null),
      ),
      findUniqueOrThrow: jest.fn(({ where }: any) =>
        Promise.resolve(rows.find((p) => p.id === where.id)),
      ),
      findMany: jest.fn(() => Promise.resolve(rows)),
      update: jest.fn(({ where, data }: any) => {
        const row = rows.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
      create: jest.fn(({ data }: any) => {
        const row = { id: `plan-${rows.length + 1}`, ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
    },
    planVersion: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          versions
            .filter((v) => v.planId === where.planId)
            .sort((a, b) => b.version - a.version)[0] ?? null,
        ),
      ),
      create: jest.fn(({ data }: any) => {
        if (
          versions.some(
            (v) => v.planId === data.planId && v.version === data.version,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('dup'), { code: 'P2002' }),
          );
        }
        const v = { id: `ver-${++seq}`, createdAt: new Date(), ...data };
        versions.push(v);
        return Promise.resolve(v);
      }),
    },
  };
  return db;
}

const starter = {
  id: 'starter',
  name: 'Starter',
  slug: 'starter',
  description: '',
  priceMonthly: 999,
  priceYearly: 9990,
  limits: {
    users: 5,
    projects: 3,
    landingPages: 2,
    templates: 2,
    metaPages: 1,
  },
  capabilities: { publishing: true, teamChat: true },
  isSystem: false,
  isActive: true,
  createdAt: new Date('2026-01-01'),
};

describe('sameTerms', () => {
  const t = {
    priceMonthly: 999,
    priceYearly: 9990,
    limits: starter.limits,
    capabilities: starter.capabilities,
  };

  it('the same price, limits and features — however they are stored — is no change', () => {
    expect(sameTerms(t, { ...t })).toBe(true);
    // Reordered keys, "5" vs 5, null vs a missing key (both unlimited).
    expect(
      sameTerms(t, {
        ...t,
        limits: {
          metaPages: 1,
          templates: 2,
          landingPages: 2,
          projects: '3',
          users: 5,
          landingPagesCreate: null,
        },
      }),
    ).toBe(true);
    // A missing team chat / Meta key reads as ON; a missing catalog key as OFF.
    expect(
      sameTerms(t, {
        ...t,
        capabilities: {
          publishing: true,
          metaLeadAds: true,
          premiumTemplates: false,
        },
      }),
    ).toBe(true);
  });

  it('a different monthly or yearly price, limit or feature is a change', () => {
    expect(sameTerms(t, { ...t, priceMonthly: 1199 })).toBe(false);
    expect(sameTerms(t, { ...t, priceYearly: 11990 })).toBe(false);
    expect(sameTerms(t, { ...t, limits: { ...t.limits, users: 3 } })).toBe(
      false,
    );
    expect(sameTerms(t, { ...t, limits: { ...t.limits, users: null } })).toBe(
      false,
    );
    expect(sameTerms(t, { ...t, limits: { ...t.limits, metaPages: 2 } })).toBe(
      false,
    );
    expect(
      sameTerms(t, {
        ...t,
        capabilities: { ...t.capabilities, teamChat: false },
      }),
    ).toBe(false);
    expect(
      sameTerms(t, {
        ...t,
        capabilities: { ...t.capabilities, premiumTemplates: true },
      }),
    ).toBe(false);
  });
});

describe('ensureLatestPlanVersion', () => {
  it('makes v1, then a new version only when the terms change', async () => {
    const db = fakeVersionDb([starter]);
    const v1 = await ensureLatestPlanVersion(db as never, starter, 'admin-1');
    expect(v1).toMatchObject({
      version: 1,
      priceMonthly: 999,
      createdById: 'admin-1',
    });
    expect(await ensureLatestPlanVersion(db as never, starter)).toBe(v1);
    const v2 = await ensureLatestPlanVersion(
      db as never,
      { ...starter, priceMonthly: 1199 },
      'admin-2',
    );
    expect(v2).toMatchObject({
      version: 2,
      priceMonthly: 1199,
      limits: starter.limits,
    });
    expect(db.versions).toHaveLength(2);
  });

  it('latestPlanVersionId gives a plan with no versions its v1', async () => {
    const db = fakeVersionDb([starter]);
    const id = await latestPlanVersionId(db as never, 'starter');
    expect(id).toBe(db.versions[0].id);
    expect(await latestPlanVersionId(db as never, 'starter')).toBe(id);
    expect(await latestPlanVersionId(db as never, 'missing')).toBeNull();
  });

  it('does nothing on a database without the table (old mocks)', async () => {
    expect(await ensureLatestPlanVersion({}, starter)).toBeNull();
    expect(await latestPlanVersionId({}, 'starter')).toBeNull();
  });
});

describe('effectivePlan', () => {
  const v1 = {
    planId: 'starter',
    version: 1,
    priceMonthly: 999,
    priceYearly: 9990,
    limits: { users: 5 },
    capabilities: { publishing: true },
  };
  const latest = { ...starter, priceMonthly: 1199, limits: { users: 3 } };
  const prev = process.env.BILLING_V2;
  afterEach(() => {
    process.env.BILLING_V2 = prev;
  });

  it("billing v2 on: the org's version's price, limits and features over the plan row", () => {
    process.env.BILLING_V2 = 'true';
    const p = effectivePlan(latest, v1);
    expect(p).toMatchObject({
      id: 'starter',
      name: 'Starter',
      priceMonthly: 999,
      limits: { users: 5 },
    });
    expect(
      withEffectivePlan({ id: 's', plan: latest, planVersion: v1 }).plan.limits,
    ).toEqual({ users: 5 });
    // No version, or one of another plan: the latest.
    expect(effectivePlan(latest, null)).toBe(latest);
    expect(effectivePlan(latest, { ...v1, planId: 'pro' })).toBe(latest);
  });

  it('billing v2 off: versions are recorded but ignored', () => {
    delete process.env.BILLING_V2;
    expect(effectivePlan(latest, v1)).toBe(latest);
  });
});

describe('plan editors create versions', () => {
  const v2dto = (over: Record<string, unknown> = {}) => ({
    name: 'Starter',
    tagline: '',
    priceMonthly: 999,
    priceYearly: 9990,
    isFree: false,
    limits: { users: 5, projects: 3, landingPages: 2, templates: 2 },
    modules: { teamChat: true, metaLeadAds: true, metaPages: 1 },
    ...over,
  });

  it('Plans & Pricing (v2): a price / limit / feature change makes the next version; a name or tagline change does not', async () => {
    const db = fakeVersionDb([starter]);
    await ensureLatestPlanVersion(db as never, starter);
    const service = new AdminBillingService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.savePlan(
      'starter',
      v2dto({ name: 'Starter Plus', tagline: 'New words' }) as never,
      'admin-1',
    );
    expect(db.versions).toHaveLength(1);
    await service.savePlan(
      'starter',
      v2dto({ priceYearly: 11990 }) as never,
      'admin-1',
    );
    await service.savePlan(
      'starter',
      v2dto({
        priceYearly: 11990,
        limits: { users: 3, projects: 3, landingPages: 2, templates: 2 },
      }) as never,
      'admin-1',
    );
    await service.savePlan(
      'starter',
      v2dto({
        priceYearly: 11990,
        limits: { users: 3, projects: 3, landingPages: 2, templates: 2 },
        modules: { teamChat: false, metaLeadAds: true, metaPages: 1 },
      }) as never,
    );
    expect(db.versions.map((v) => v.version)).toEqual([1, 2, 3, 4]);
    expect(db.versions[3]).toMatchObject({
      priceYearly: 11990,
      limits: expect.objectContaining({ users: 3 }),
      capabilities: expect.objectContaining({ teamChat: false }),
    });
    expect(db.versions[1].createdById).toBe('admin-1');
  });

  it('the older plan editor: create makes v1; only price / limit / feature edits make a version', async () => {
    const db = fakeVersionDb([]);
    const service = new PlansService(db as never);
    const created = await service.create(
      {
        name: 'Pro',
        priceMonthly: 1999,
        priceYearly: 19990,
        limits: { users: 10 },
        capabilities: {},
      } as never,
      'admin-1',
    );
    expect(db.versions).toEqual([
      expect.objectContaining({
        planId: created.id,
        version: 1,
        priceMonthly: 1999,
      }),
    ]);
    await service.update(
      created.id,
      { color: '#fff', isPopular: true, features: ['Nice'] } as never,
      'admin-1',
    );
    expect(db.versions).toHaveLength(1);
    await service.update(
      created.id,
      { priceMonthly: 2499 } as never,
      'admin-1',
    );
    expect(db.versions.map((v) => [v.version, v.priceMonthly])).toEqual([
      [1, 1999],
      [2, 2499],
    ]);
  });
});
