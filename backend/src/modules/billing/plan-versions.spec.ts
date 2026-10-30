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
  getOrgActivePlan,
} from '../../common/utils/subscription-lifecycle.util';
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

function setup(sub: Record<string, unknown> = {}) {
  const fake = createFakeBillingDb({
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
