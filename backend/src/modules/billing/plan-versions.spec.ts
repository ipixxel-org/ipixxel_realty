/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
/**
 * Plan versions: which version an org is put on (every purchase, plan change,
 * move to Basic and scheduled change), and that an org on an older version
 * keeps that version's price, limits and features.
 */
import { applyPlanChange } from '../../common/utils/plan-change.util';
import { ensureLatestPlanVersion } from '../../common/utils/plan-version.util';
import {
  applyOrgSubscriptionLifecycle,
  applyPlanVersionChanges,
  getOrgActivePlan,
  renewOrgSubscription,
} from '../../common/utils/subscription-lifecycle.util';
import {
  describeChange,
  latestVersionsByPlan,
  orgPlanVersionInfo,
  priceChange,
  versionChanges,
} from '../../common/utils/plan-version-change.util';
import { AdminBillingService } from './admin-billing.service';
import { platformModuleForPath } from '../../common/utils/permissions.util';
import { BillingRetentionService } from './billing-retention.service';
import { resolveLimit } from '../../common/utils/plan-quota.util';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { PaymentEventsService } from '../payments/payment-events';
import { BillingCheckoutService } from './billing-checkout.service';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

const DAY = 86_400_000;
const BILLING_V2 = process.env.BILLING_V2;
beforeEach(() => {
  process.env.BILLING_V2 = 'true';
});
afterEach(() => {
  if (BILLING_V2 === undefined) delete process.env.BILLING_V2;
  else process.env.BILLING_V2 = BILLING_V2;
});

const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  isSystem: true,
  limits: { users: 2 },
};
const GROWTH = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 2000,
  priceYearly: 20000,
  limits: { users: 5 },
};
const PRO = {
  id: 'pro',
  name: 'Pro',
  priceMonthly: 5000,
  priceYearly: 50000,
  limits: { users: 10 },
};

function setup(
  sub: Record<string, unknown> = {},
  seed: { users?: Record<string, unknown>[] } = {},
) {
  const fake = createFakeBillingDb({
    ...seed,
    plans: [BASIC, GROWTH, PRO],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'basic',
      billingCycle: 'monthly',
      status: 'active',
      amount: 0,
      renewsAt: new Date(Date.now() + 10 * DAY),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      scheduledInterval: null,
      ...sub,
    },
  });
  giveBillingDetails(fake.db);
  const row = () => fake.db.subscription.rows[0];
  /** Save a change to a plan in Plans & Pricing: the plan row + its next version. */
  const edit = async (planId: string, changes: Record<string, unknown>) => {
    const plan = fake.planById(planId)!;
    if (!fake.versions.some((v) => v.planId === planId)) {
      await ensureLatestPlanVersion(fake.db, plan as never);
    }
    Object.assign(plan, changes);
    return ensureLatestPlanVersion(fake.db, plan as never);
  };
  const version = (planId: string, n: number): Record<string, any> =>
    fake.versions.find((v) => v.planId === planId && v.version === n)!;
  return { ...fake, row, edit, version };
}

function checkoutService(db: any) {
  const events = new PaymentEventsService();
  let order = 0;
  const payments = {
    createOrder: jest.fn(
      async (input: { referenceId: string; amountPaise: number }) => {
        const pay = await db.payment.create({
          data: {
            organisationId: 'org-1',
            amount: input.amountPaise,
            purpose: 'plan_purchase',
            referenceType: 'billing_checkout',
            referenceId: input.referenceId,
            razorpayOrderId: `order_T${++order}`,
          },
        });
        return { paymentId: pay.id, orderId: pay.razorpayOrderId };
      },
    ),
    verifyCheckout: jest.fn(),
  };
  const service = new BillingCheckoutService(
    db as never,
    { getMode: async () => ({ mode: 'online', reason: null }) } as never,
    {
      getSellerSettings: async () => ({ legalName: 'iPixxel', state: '29' }),
    } as never,
    payments as never,
    events,
    {} as never,
    { sendForCheckout: jest.fn(async () => undefined) } as never,
  );
  return service;
}

/* --------------------------------------------- Which version an org gets */

describe('the version an org is put on', () => {
  it('a purchase gets the version that was quoted, even if the plan is edited before it is paid', async () => {
    const t = setup();
    const service = checkoutService(t.db);
    await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const checkout = t.db.billingCheckout.rows[0];
    const v1 = t.version('growth', 1);
    expect(checkout.planVersionId).toBe(v1.id);

    // Super Admin raises the price and cuts the users before the payment lands.
    await t.edit('growth', { priceMonthly: 2500, limits: { users: 3 } });
    expect(t.version('growth', 2)).toBeTruthy();

    await expect(
      service.fulfil(checkout.id, checkout.totalPaise),
    ).resolves.toBe('paid');
    expect(t.row()).toMatchObject({
      planId: 'growth',
      planVersionId: v1.id,
      amount: 2000,
    });
  });

  it('a plan change without a quote gets the latest version; a quoted version of another plan is ignored', async () => {
    const t = setup();
    await t.edit('pro', { priceMonthly: 6000 });
    const proV1 = t.version('pro', 1);
    const growthV1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('growth') as never,
    );
    await applyPlanChange(t.db as never, {
      organisationId: 'org-1',
      toPlanId: 'pro',
      toInterval: 'monthly',
      kind: 'new',
      source: 'super_admin',
      actorId: 'admin',
      planVersionId: growthV1!.id,
    });
    expect(t.row()).toMatchObject({
      planId: 'pro',
      planVersionId: t.version('pro', 2).id,
      amount: 6000,
    });
    expect(proV1.priceMonthly).toBe(5000);
  });

  it('moving to Basic gets the latest Basic version', async () => {
    const t = setup({
      planId: 'growth',
      amount: 2000,
      renewsAt: new Date(Date.now() - 60_000),
      cancelAtPeriodEnd: true,
    });
    await t.edit('basic', { limits: { users: 3 } });
    await applyOrgSubscriptionLifecycle(t.db as never, 'org-1');
    expect(t.row()).toMatchObject({
      planId: 'basic',
      planVersionId: t.version('basic', 2).id,
      previousPlanId: 'growth',
    });
  });

  it('a scheduled downgrade taking effect gets the smaller plan as it is then (latest version)', async () => {
    const t = setup({
      planId: 'pro',
      amount: 5000,
      renewsAt: new Date(Date.now() - 60_000),
      scheduledPlanId: 'growth',
      scheduledInterval: 'monthly',
    });
    await t.edit('growth', { priceMonthly: 2200 });
    await applyOrgSubscriptionLifecycle(t.db as never, 'org-1');
    expect(t.row()).toMatchObject({
      planId: 'growth',
      planVersionId: t.version('growth', 2).id,
      amount: 2200,
    });
  });

  it('billing v2 off on the server: the version is recorded, the latest price applies (as before)', async () => {
    delete process.env.BILLING_V2;
    const t = setup();
    const service = checkoutService(t.db);
    await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const checkout = t.db.billingCheckout.rows[0];
    await t.edit('growth', { priceMonthly: 2500 });
    await service.fulfil(checkout.id, checkout.totalPaise);
    expect(t.row()).toMatchObject({
      planVersionId: t.version('growth', 1).id,
      amount: 2500,
    });
  });
});

/* ------------------------------- An org on an older version keeps it */

describe('an org on an older version keeps its price, limits and features', () => {
  /** Org on Growth v1 (₹2,000, 5 users, team chat on); then Growth is edited to v2. */
  async function onOldGrowth(sub: Record<string, unknown> = {}) {
    const t = setup({ planId: 'growth', amount: 2000, ...sub });
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('growth') as never,
    );
    t.row().planVersionId = v1!.id;
    await t.edit('growth', {
      priceMonthly: 2500,
      priceYearly: 25000,
      limits: { users: 3, landingPages: 1 },
      capabilities: { teamChat: false, publishing: false },
    });
    return t;
  }
  const overviewService = (db: any) =>
    new OrgBillingV2Service(
      db as never,
      { getMode: async () => ({ mode: 'online', reason: null }) } as never,
    );

  it("quota checks read the org's version (users, landing pages, publishing)", async () => {
    const t = await onOldGrowth();
    const active = await getOrgActivePlan(t.db as never, 'org-1');
    expect(active?.plan).toMatchObject({
      id: 'growth',
      name: 'Growth',
      priceMonthly: 2000,
      limits: { users: 5 },
    });
    expect(resolveLimit(active!.plan, 'users')).toBe(5);
    // v2 allows 1 live page and no publishing; v1 (no limit set) allows both.
    expect(resolveLimit(active!.plan, 'landingPages')).toBe(Infinity);
    expect(
      (active!.plan.capabilities as Record<string, unknown>).publishing,
    ).toBeUndefined();
  });

  it("Billing overview and access: the version's limits and features; the renewal at the latest price", async () => {
    const t = await onOldGrowth({
      renewsAt: new Date(Date.now() + 3 * DAY),
    });
    const service = overviewService(t.db);
    const o = await service.getOverview('org-1');
    expect(o.plan).toMatchObject({
      id: 'growth',
      priceMonthly: 2000,
      limits: { users: 5 },
      modules: { teamChat: true },
    });
    expect(o.usage.find((u) => u.key === 'users')?.limit).toBe(5);
    // The renewal moves to the latest version: ₹2,500 + 18% GST.
    expect(o.renewalAmount).toBe(2950);
    const access = await service.getAccess('org-1');
    expect(access.limits.users).toBe(5);
    expect(access.modules.teamChat).toBe(true);
  });

  it("an upgrade's credit uses the price of the org's version; the new plan its latest price", async () => {
    const t = await onOldGrowth({ renewsAt: new Date(Date.now() + 15 * DAY) });
    await t.edit('pro', { priceMonthly: 6000 });
    const ctx = await checkoutService(t.db).quote('org-1', 'pro', 'monthly');
    expect(ctx.quote.proration).toMatchObject({
      oldPricePaise: 200000,
      newPricePaise: 600000,
    });
  });

  it('a renewal is quoted at the latest price', async () => {
    const t = await onOldGrowth({ renewsAt: new Date(Date.now() + 3 * DAY) });
    const ctx = await checkoutService(t.db).quote(
      'org-1',
      'growth',
      'monthly',
      new Date(),
      'renewal',
    );
    expect(ctx.quote.subtotalPaise).toBe(250000);
  });

  it('billing v2 off on the server: the latest values, as before', async () => {
    const t = await onOldGrowth();
    delete process.env.BILLING_V2;
    const active = await getOrgActivePlan(t.db as never, 'org-1');
    expect(active?.plan).toMatchObject({
      priceMonthly: 2500,
      limits: { users: 3, landingPages: 1 },
    });
  });

  it('an org without a version (null) follows the latest values', async () => {
    const t = await onOldGrowth();
    t.row().planVersionId = null;
    const active = await getOrgActivePlan(t.db as never, 'org-1');
    expect(resolveLimit(active!.plan, 'users')).toBe(3);
  });
});

/* ------------------------------------- What changes, and when (commit 4) */

const member = (id: string, days: number) => ({
  id,
  orgId: 'org-1',
  status: 'active',
  firstName: id,
  lastName: null,
  email: `${id}@acme.test`,
  billingPausedAt: null,
  lastLoginAt: new Date(Date.now() - days * DAY),
  createdAt: new Date(Date.now() - 100 * DAY),
  userRoles: [{ role: { key: 'sales', name: 'Sales' } }],
});

describe('what a newer version changes', () => {
  const v1 = {
    priceMonthly: 999,
    priceYearly: 9990,
    limits: { users: 5, projects: null },
    capabilities: { teamChat: true },
  };

  it('lists lower and higher limits, features and prices', () => {
    const v2 = {
      priceMonthly: 1199,
      priceYearly: 9990,
      limits: { users: 3, projects: 10 },
      capabilities: { teamChat: false, premiumTemplates: true },
    };
    const changes = versionChanges(v1, v2);
    expect(changes.map((c) => [describeChange(c), c.lower])).toEqual([
      ['3 users instead of 5', true],
      ['10 projects instead of unlimited', true],
      ['no Team chat', true],
      ['Premium templates included', false],
    ]);
    expect(priceChange(v1, v2)).toEqual({
      monthly: { from: 999, to: 1199 },
      yearly: null,
    });
  });

  it('a price change on its own is a change, not a lower one', () => {
    expect(versionChanges(v1, { ...v1, priceMonthly: 1199 })).toEqual([]);
    expect(priceChange(v1, { ...v1, priceMonthly: 1199 })).not.toBeNull();
  });
});

describe('renewal moves to the latest version (paid plans)', () => {
  /** On Growth v1 (5 users) with 4 members; Growth v2: 3 users, 2,500. */
  async function renewalDue(sub: Record<string, unknown> = {}) {
    const t = setup(
      {
        planId: 'growth',
        amount: 2000,
        renewsAt: new Date(Date.now() + 3 * DAY),
        ...sub,
      },
      { users: [member('m1', 1), member('m2', 2), member('m3', 30)] },
    );
    t.usage.users = 4;
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('growth') as never,
    );
    t.row().planVersionId = v1!.id;
    return t;
  }
  const overview = (db: any) =>
    new OrgBillingV2Service(
      db as never,
      { getMode: async () => ({ mode: 'online', reason: null }) } as never,
      undefined,
      new BillingRetentionService(db as never),
    );
  const keepUsers = {
    targetPlanId: 'growth',
    userIds: ['u-admin', 'm3', 'm2'],
    projectIds: [],
    landingPageIds: [],
    templateIds: [],
  } as never;

  it('from the renewal window the overview says what changes: limits, features and price', async () => {
    const t = await renewalDue();
    await t.edit('growth', { priceMonthly: 2500, limits: { users: 3 } });
    const o = await overview(t.db).getOverview('org-1');
    expect(o.planVersion).toBe(1);
    expect(o.nextVersion).toMatchObject({
      planName: 'Growth',
      fromVersion: 1,
      toVersion: 2,
      reason: 'renewal',
      lower: true,
      price: { interval: 'monthly', from: 2000, to: 2500 },
      changes: [{ key: 'users', from: 5, to: 3, text: '3 users instead of 5' }],
    });
    expect(o.nextVersion!.at).toBe(t.row().renewsAt.toISOString().slice(0, 10));
    // "Choose what stays" for the new version: the banner's summary.
    expect(o.retention).toMatchObject({ targetPlanId: 'growth' });
  });

  it('a price change on its own is shown too (not lower)', async () => {
    const t = await renewalDue();
    await t.edit('growth', { priceMonthly: 2500 });
    const o = await overview(t.db).getOverview('org-1');
    expect(o.nextVersion).toMatchObject({
      lower: false,
      changes: [],
      price: { from: 2000, to: 2500 },
    });
  });

  it('nothing before the renewal window, or with a change of plan scheduled', async () => {
    const early = await renewalDue({
      renewsAt: new Date(Date.now() + 20 * DAY),
    });
    await early.edit('growth', { limits: { users: 3 } });
    expect(
      (await overview(early.db).getOverview('org-1')).nextVersion,
    ).toBeNull();
    const scheduled = await renewalDue({ scheduledPlanId: 'basic' });
    await scheduled.edit('growth', { limits: { users: 3 } });
    expect(
      (await overview(scheduled.db).getOverview('org-1')).nextVersion,
    ).toBeNull();
  });

  it('choose what stays is open for the new version (not locked), applies at renewal, and pauses nothing yet', async () => {
    const t = await renewalDue();
    await t.edit('growth', { limits: { users: 3 } });
    const retention = new BillingRetentionService(t.db as never);
    const choices = await retention.getChoices('org-1');
    expect(choices).toMatchObject({
      targetPlan: { id: 'growth', limits: { users: 3 } },
      locked: false,
      appliesOn: t.row().renewsAt.toISOString().slice(0, 10),
    });
    await retention.saveChoices('org-1', 'u-admin', keepUsers);
    expect(t.db.retentionChoice.rows).toHaveLength(1);
    expect(t.db.user.rows.every((u: any) => !u.billingPausedAt)).toBe(true);
  });

  it('the renewal moves the org to the latest version and pauses what does not fit (their choice)', async () => {
    const t = await renewalDue();
    await t.edit('growth', { priceMonthly: 2500, limits: { users: 3 } });
    await new BillingRetentionService(t.db as never).saveChoices(
      'org-1',
      'u-admin',
      keepUsers,
    );
    await applyPlanChange(t.db as never, {
      organisationId: 'org-1',
      toPlanId: 'growth',
      toInterval: 'monthly',
      kind: 'renewal',
      source: 'payment',
      actorId: null,
    });
    expect(t.row()).toMatchObject({
      planVersionId: t.version('growth', 2).id,
      amount: 2500,
    });
    const paused = t.db.user.rows.filter((u: any) => u.billingPausedAt);
    expect(paused.map((u: any) => u.id)).toEqual(['m1']);
  });

  it('the org is told once, when the renewal window opens — what gets worse, no version number', async () => {
    const t = await renewalDue();
    await t.edit('growth', { priceMonthly: 2500, limits: { users: 3 } });
    await applyPlanVersionChanges(t.db as never, 'org-1');
    await applyPlanVersionChanges(t.db as never, 'org-1');
    const notes = t.db.notification.rows;
    expect(new Set(notes.map((n: any) => n.title)).size).toBe(1);
    expect(notes[0].title).toBe('Growth: changes at your next renewal');
    expect(notes[0].body).toMatch(
      /^From your next renewal on .+, Growth includes 3 users \(you have 4\) and costs ₹2,500 \+ GST\. Choose what stays/,
    );
    expect(`${notes[0].title} ${notes[0].body}`).not.toMatch(/\bv\d/);
  });

  it('a price rise on its own: "… Growth costs ₹2,500 + GST."', async () => {
    const t = await renewalDue();
    await t.edit('growth', { priceMonthly: 2500 });
    await applyPlanVersionChanges(t.db as never, 'org-1');
    expect(t.db.notification.rows[0].body).toMatch(
      /^From your next renewal on .+, Growth costs ₹2,500 \+ GST\.$/,
    );
  });

  it('no reminder when the new version is the same or better', async () => {
    const t = await renewalDue();
    await t.edit('growth', { priceMonthly: 1800, limits: { users: 8 } });
    await applyPlanVersionChanges(t.db as never, 'org-1');
    expect(t.db.notification.rows).toHaveLength(0);
  });

  it('in grace: "When you renew, …" (never a past date)', async () => {
    const t = await renewalDue({
      status: 'past_due',
      renewsAt: new Date(Date.now() - 2 * DAY),
    });
    await t.edit('growth', { limits: { users: 3 } });
    await applyPlanVersionChanges(t.db as never, 'org-1');
    expect(t.db.notification.rows[0].body).toMatch(
      /^When you renew, Growth includes 3 users \(you have 4\)\./,
    );
  });
});

describe('Basic: a new version applies now, or after 7 days for orgs over it', () => {
  async function onBasic(users: number) {
    const t = setup(
      { planId: 'basic', amount: 0, renewsAt: null },
      { users: [member('m1', 1), member('m2', 9)] },
    );
    t.usage.users = users;
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('basic') as never,
    );
    t.row().planVersionId = v1!.id;
    return t;
  }

  it('a bigger Basic: every Basic org moves straight away', async () => {
    const t = await onBasic(2);
    await t.edit('basic', { limits: { users: 4 } });
    await applyPlanVersionChanges(t.db as never);
    expect(t.row().planVersionId).toBe(t.version('basic', 2).id);
  });

  it('a smaller Basic the org fits: moves straight away', async () => {
    const t = await onBasic(1);
    await t.edit('basic', { limits: { users: 1 } });
    await applyPlanVersionChanges(t.db as never);
    expect(t.row().planVersionId).toBe(t.version('basic', 2).id);
    expect(t.db.notification.rows).toHaveLength(0);
  });

  it('a smaller Basic the org is over: told once, keeps its version for 7 days, then moves with what does not fit paused', async () => {
    const t = await onBasic(3);
    const v2 = await t.edit('basic', { limits: { users: 1 } });
    await applyPlanVersionChanges(t.db as never);
    await applyPlanVersionChanges(t.db as never);
    expect(t.row().planVersionId).toBe(t.version('basic', 1).id);
    // Once (one per admin; the fake sends it to every member).
    expect(new Set(t.db.notification.rows.map((n: any) => n.title)).size).toBe(
      1,
    );
    expect(t.db.notification.rows[0].body).toContain(
      'Basic includes 1 user (you have 3)',
    );
    expect(t.db.notification.rows[0].title).not.toMatch(/\bv\d/);
    // Still on v1 limits meanwhile.
    const active = await getOrgActivePlan(t.db as never, 'org-1');
    expect(resolveLimit(active!.plan, 'users')).toBe(2);
    // 7 days later.
    await applyPlanVersionChanges(
      t.db as never,
      undefined,
      new Date(v2!.createdAt.getTime() + 7 * DAY + 1000),
    );
    expect(t.row().planVersionId).toBe(v2!.id);
    expect(t.db.user.rows.filter((u: any) => u.billingPausedAt)).toHaveLength(
      2,
    );
    expect(t.db.notification.rows.at(-1).title).toBe('Basic has changed');
  });
});

describe('the older renew path (no checkout)', () => {
  it('renewOrgSubscription moves the org to the latest version, even for a deactivated plan', async () => {
    const t = setup({ planId: 'growth', amount: 2000 });
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('growth') as never,
    );
    t.row().planVersionId = v1!.id;
    await t.edit('growth', { limits: { users: 8 }, isActive: false });
    await renewOrgSubscription(t.db as never, 'org-1');
    expect(t.row().planVersionId).toBe(t.version('growth', 2).id);
  });
});

/* ------------------------------------------------- Super Admin (commit 5) */

describe('Super Admin: versions on plans and organisations', () => {
  const dto = (over: Record<string, unknown> = {}) =>
    ({
      name: 'Growth',
      tagline: '',
      priceMonthly: 2000,
      priceYearly: 20000,
      isFree: false,
      limits: { users: 5, projects: null, landingPages: null, templates: null },
      modules: { teamChat: true, metaLeadAds: true, metaPages: null },
      ...over,
    }) as never;
  const adminBilling = (db: any) =>
    new AdminBillingService(db as never, {} as never, {} as never, {} as never);
  /** Growth with v1 + v2; the org on v1. */
  async function twoVersions() {
    const t = setup({ planId: 'growth', amount: 2000 });
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('growth') as never,
    );
    t.row().planVersionId = v1!.id;
    await t.edit('growth', { priceMonthly: 2500 });
    return t;
  }

  it('the plan list: newest version and organisations per version (none recorded = newest)', async () => {
    const t = await twoVersions();
    t.db.subscription.rows.push({
      id: 'sub-2',
      orgId: 'org-2',
      planId: 'growth',
      planVersionId: null,
      status: 'active',
    });
    t.db.subscription.groupBy = async () => {
      const groups = new Map<string, any>();
      for (const s of t.db.subscription.rows.filter(
        (r: any) => r.status !== 'cancelled',
      )) {
        const key = `${s.planId}|${s.planVersionId}`;
        const g = groups.get(key) ?? {
          planId: s.planId,
          planVersionId: s.planVersionId ?? null,
          _count: { _all: 0 },
        };
        g._count._all++;
        groups.set(key, g);
      }
      return [...groups.values()];
    };
    const plans = await adminBilling(t.db).listPlans();
    const growth = plans.find((p) => p.id === 'growth')!;
    expect(growth.version).toBe(2);
    expect(growth.versions).toEqual([
      { version: 2, orgs: 1 },
      { version: 1, orgs: 1 },
    ]);
  });

  it('save preview (paid): a price change makes the next version; a name change does not', async () => {
    const t = await twoVersions();
    const service = adminBilling(t.db);
    expect(
      await service.previewPlanSave(
        'growth',
        dto({ name: 'Growth+', priceMonthly: 2500 }),
      ),
    ).toMatchObject({ createsVersion: false, version: 2, orgsOnPlan: 1 });
    expect(
      await service.previewPlanSave('growth', dto({ priceMonthly: 2700 })),
    ).toMatchObject({
      createsVersion: true,
      version: 3,
      orgsOnPlan: 1,
      basic: null,
    });
  });

  it('save preview (Basic): how many are over the new limits (7 days notice) and how many move now', async () => {
    const t = setup({ planId: 'basic', amount: 0, renewsAt: null });
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('basic') as never,
    );
    t.row().planVersionId = v1!.id;
    t.usage.users = 2;
    const basicDto = (users: number) =>
      dto({
        name: 'Basic',
        priceMonthly: 0,
        priceYearly: 0,
        isFree: true,
        limits: { users, projects: null, landingPages: null, templates: null },
      });
    const service = adminBilling(t.db);
    expect(await service.previewPlanSave('basic', basicDto(1))).toMatchObject({
      createsVersion: true,
      isFree: true,
      version: 2,
      basic: { overLimits: 1, moveNow: 0, noticeDays: 7 },
    });
    expect(await service.previewPlanSave('basic', basicDto(4))).toMatchObject({
      basic: { overLimits: 0, moveNow: 1 },
    });
  });

  it('an organisation: its version, the newest, and when the newer one applies', async () => {
    const t = await twoVersions();
    const latest = await latestVersionsByPlan(t.db);
    const sub = await t.db.subscription.findFirst({
      include: { plan: true, planVersion: true },
    });
    expect(orgPlanVersionInfo(sub, latest)).toEqual({
      planVersion: 1,
      planVersionId: expect.any(String),
      latestVersion: 2,
      versionAppliesOn: t.row().renewsAt.toISOString().slice(0, 10),
    });
    // On the newest: nothing applies later.
    t.row().planVersionId = t.version('growth', 2).id;
    const now = await t.db.subscription.findFirst({
      include: { plan: true, planVersion: true },
    });
    expect(orgPlanVersionInfo(now, latest)).toMatchObject({
      planVersion: 2,
      versionAppliesOn: null,
    });
  });

  it('Basic: the newer version applies 7 days after it was made', async () => {
    const t = setup({ planId: 'basic', amount: 0, renewsAt: null });
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('basic') as never,
    );
    t.row().planVersionId = v1!.id;
    const v2 = await t.edit('basic', { limits: { users: 1 } });
    const sub = await t.db.subscription.findFirst({
      include: { plan: true, planVersion: true },
    });
    expect(
      orgPlanVersionInfo(sub, await latestVersionsByPlan(t.db))
        .versionAppliesOn,
    ).toBe(
      new Date(v2!.createdAt.getTime() + 7 * DAY).toISOString().slice(0, 10),
    );
  });
});

/* --------------------------------------------- Version history (Super Admin) */

describe('Super Admin: version history', () => {
  const adminBilling = (db: any) =>
    new AdminBillingService(db as never, {} as never, {} as never, {} as never);

  /** Growth v1 (₹2,000, 5 users, team chat on) → v2 (₹2,500, 3 users, team chat off), saved by Asha. */
  async function history() {
    const t = setup({ planId: 'growth', amount: 2000 });
    const v1 = await ensureLatestPlanVersion(
      t.db,
      t.planById('growth') as never,
    );
    t.row().planVersionId = v1!.id;
    const plan = t.planById('growth')!;
    Object.assign(plan, {
      priceMonthly: 2500,
      limits: { users: 3, landingPagesCreate: 4 },
      capabilities: { teamChat: false },
    });
    await ensureLatestPlanVersion(t.db, plan as never, 'u-admin');
    // A second org on the latest (no version recorded counts as the latest).
    t.db.subscription.rows.push({
      id: 'sub-2',
      orgId: 'org-2',
      planId: 'growth',
      planVersionId: null,
      status: 'active',
      billingCycle: 'yearly',
      renewsAt: new Date(Date.now() + 40 * DAY),
    });
    return t;
  }

  it('every version newest first: values, who made it, and orgs on it', async () => {
    const t = await history();
    const h = await adminBilling(t.db).planVersions('growth');
    expect(h).toMatchObject({
      planId: 'growth',
      planName: 'Growth',
      isFree: false,
    });
    expect(h.limitRows.map((r) => r.label)).toEqual([
      'Users',
      'Projects',
      'Live landing pages',
      'Created landing pages',
      'Templates',
      'Meta pages',
    ]);
    expect(h.featureRows.slice(0, 2).map((f) => f.label)).toEqual([
      'Team chat',
      'Meta lead ads',
    ]);
    const [v2, v1] = h.versions;
    expect(v2).toMatchObject({
      version: 2,
      latest: true,
      createdBy: 'Asha',
      priceMonthly: 2500,
      limits: { users: 3, landingPagesCreate: 4, projects: null },
      features: { teamChat: false, metaLeadAds: true },
      orgs: 1,
    });
    expect(v1).toMatchObject({
      version: 1,
      latest: false,
      createdBy: null,
      priceMonthly: 2000,
      limits: { users: 5, landingPagesCreate: null },
      features: { teamChat: true },
      orgs: 1,
    });
  });

  it('the orgs on a version: when they move to the latest (renewal); none for the latest', async () => {
    const t = await history();
    const service = adminBilling(t.db);
    const h = await service.planVersions('growth');
    const old = await service.planVersionOrgs('growth', h.versions[1].id);
    expect(old).toMatchObject({ total: 1, page: 1 });
    expect(old.data[0]).toMatchObject({
      orgId: 'org-1',
      interval: 'monthly',
      movesOn: t.row().renewsAt.toISOString().slice(0, 10),
    });
    const latest = await service.planVersionOrgs('growth', h.versions[0].id);
    expect(latest.data).toEqual([
      expect.objectContaining({
        orgId: 'org-2',
        interval: 'yearly',
        movesOn: null,
      }),
    ]);
    // Paged.
    const page2 = await service.planVersionOrgs('growth', h.versions[0].id, {
      page: 2,
      pageSize: 1,
    });
    expect(page2).toMatchObject({ data: [], total: 1, page: 2, pageSize: 1 });
  });

  it('a version of another plan is not found', async () => {
    const t = await history();
    const h = await adminBilling(t.db).planVersions('growth');
    await expect(
      adminBilling(t.db).planVersionOrgs('pro', h.versions[0].id),
    ).rejects.toThrow('Version not found');
  });

  it('the paths are Plans & Pricing (admin_subscriptions)', () => {
    expect(platformModuleForPath('/admin/billing/plans/growth/versions')).toBe(
      'admin_subscriptions',
    );
    expect(
      platformModuleForPath('/admin/billing/plans/growth/versions/v1/orgs'),
    ).toBe('admin_subscriptions');
  });
});
