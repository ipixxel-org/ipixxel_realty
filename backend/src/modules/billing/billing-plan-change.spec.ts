/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { PaymentEventsService } from '../payments/payment-events';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { buildOverview } from './billing-overview';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

const DAY = 86_400_000;
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
  const { db, usage } = createFakeBillingDb({
    plans: [BASIC, GROWTH, PRO],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'pro',
      billingCycle: 'monthly',
      status: 'active',
      amount: 5000,
      renewsAt: new Date(Date.now() + 10 * DAY),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      cancelReason: null,
      scheduledPlanId: null,
      scheduledInterval: null,
      changeScheduledAt: null,
      ...sub,
    },
  });
  const overview = { getOverview: jest.fn(async () => ({ ok: true })) };
  const service = new BillingPlanChangeService(db as never, overview as never);
  const row = () => db.subscription.rows[0];
  return { db, usage, service, row };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'no error',
    (e: any) => e?.response?.code ?? String(e),
  );

describe('cancel at the end of the term', () => {
  it('schedules it (replacing a scheduled downgrade) and can be undone', async () => {
    const { service, row, db } = setup({
      scheduledPlanId: 'growth',
      scheduledInterval: 'monthly',
    });
    await service.cancel('org-1', 'u1', { reason: 'Too expensive' });
    expect(row()).toMatchObject({
      planId: 'pro',
      cancelAtPeriodEnd: true,
      cancelReason: 'Too expensive',
      scheduledPlanId: null,
    });
    expect(db.auditLog.rows.map((a: any) => a.action)).toContain(
      'subscription_cancellation_scheduled',
    );

    await service.undoCancel('org-1', 'u1');
    expect(row()).toMatchObject({
      cancelAtPeriodEnd: false,
      cancelReason: null,
    });
    expect(await code(service.undoCancel('org-1', 'u1'))).toBe(
      'nothing_scheduled',
    );
  });

  it('refuses on the free plan; an expired plan moves to the free plan straight away', async () => {
    expect(
      await code(setup({ planId: 'basic' }).service.cancel('org-1', 'u1', {})),
    ).toBe('nothing_to_cancel');

    const { service, row } = setup({
      status: 'expired',
      renewsAt: new Date(Date.now() - 40 * DAY),
    });
    await service.cancel('org-1', 'u1', {});
    expect(row()).toMatchObject({
      planId: 'basic',
      status: 'active',
      amount: 0,
      renewsAt: null,
      cancelAtPeriodEnd: false,
    });
  });
});

describe('downgrade at the end of the term', () => {
  it('schedules a smaller plan, or yearly → monthly on the same plan', async () => {
    const a = setup();
    await a.service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' });
    expect(a.row()).toMatchObject({
      planId: 'pro',
      scheduledPlanId: 'growth',
      scheduledInterval: 'monthly',
      cancelAtPeriodEnd: false,
    });
    await a.service.undoDowngrade('org-1', 'u1');
    expect(a.row().scheduledPlanId).toBeNull();

    const b = setup({ billingCycle: 'yearly' });
    await b.service.scheduleDowngrade('org-1', 'u1', {
      planId: 'pro',
      interval: 'monthly',
    });
    expect(b.row()).toMatchObject({
      scheduledPlanId: 'pro',
      scheduledInterval: 'monthly',
    });
  });

  it('a downgrade to the free plan is a cancellation', async () => {
    const { service, row } = setup();
    await service.scheduleDowngrade('org-1', 'u1', { planId: 'basic' });
    expect(row()).toMatchObject({
      cancelAtPeriodEnd: true,
      scheduledPlanId: null,
    });
  });

  it('refuses upgrades, the same plan, grace, over-limit usage and a pending request', async () => {
    const s = setup({ planId: 'growth', amount: 2000 });
    expect(
      await code(s.service.scheduleDowngrade('org-1', 'u1', { planId: 'pro' })),
    ).toBe('not_a_downgrade');
    expect(
      await code(
        s.service.scheduleDowngrade('org-1', 'u1', {
          planId: 'growth',
          interval: 'yearly',
        }),
      ),
    ).toBe('not_a_downgrade');
    expect(
      await code(
        s.service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' }),
      ),
    ).toBe('same_plan');

    const grace = setup({
      status: 'past_due',
      renewsAt: new Date(Date.now() - DAY),
      graceEndsAt: new Date(Date.now() + 6 * DAY),
    });
    expect(
      await code(
        grace.service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' }),
      ),
    ).toBe('downgrade_not_now');

    const over = setup();
    over.usage.users = 8; // Growth allows 5
    expect(
      await code(
        over.service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' }),
      ),
    ).toBe('over_plan_limits');
    expect(over.row().scheduledPlanId).toBeNull();

    const pending = setup();
    pending.db.packageChangeRequest.rows.push({
      id: 'pcr-1',
      orgId: 'org-1',
      status: 'pending',
    });
    expect(
      await code(
        pending.service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' }),
      ),
    ).toBe('request_pending');
  });
});

describe('the lifecycle sweep applies scheduled changes when the term ends', () => {
  const ended = { renewsAt: new Date(Date.now() - 60_000) };

  it('a cancellation moves the org to the free plan — no grace, nothing to pay', async () => {
    const { db, row } = setup({ ...ended, cancelAtPeriodEnd: true });
    const summary = await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(summary.movedToFreePlan).toBe(1);
    expect(row()).toMatchObject({
      planId: 'basic',
      status: 'active',
      amount: 0,
      mrr: 0,
      renewsAt: null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
    });
    expect(
      db.notification.rows.some((n: any) => n.title === 'Plan ended'),
    ).toBe(true);
  });

  it('a scheduled downgrade switches plan, then the unpaid term goes into grace on it', async () => {
    const { db, row } = setup({
      ...ended,
      billingCycle: 'yearly',
      scheduledPlanId: 'growth',
      scheduledInterval: 'monthly',
    });
    const summary = await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(summary).toMatchObject({ scheduledPlanApplied: 1, newlyPastDue: 1 });
    expect(row()).toMatchObject({
      planId: 'growth',
      billingCycle: 'monthly',
      amount: 2000,
      mrr: 2000,
      status: 'past_due',
      scheduledPlanId: null,
    });
    expect(row().graceEndsAt).toBeInstanceOf(Date);
  });

  it('a cancellation made during grace applies when grace ends', async () => {
    const { db, row } = setup({
      status: 'past_due',
      renewsAt: new Date(Date.now() - 8 * DAY),
      graceEndsAt: new Date(Date.now() + DAY),
      cancelAtPeriodEnd: true,
    });
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(row().planId).toBe('pro'); // grace still running
    row().graceEndsAt = new Date(Date.now() - 60_000);
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(row()).toMatchObject({ planId: 'basic', status: 'active' });
  });

  it('nothing scheduled: the term ends into grace as before', async () => {
    const { db, row } = setup(ended);
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(row()).toMatchObject({ planId: 'pro', status: 'past_due' });
  });
});

describe('renewal with a scheduled change', () => {
  function checkoutSetup(sub: Record<string, unknown>) {
    const ctx = setup({ renewsAt: new Date(Date.now() + 2 * DAY), ...sub });
    ctx.db.billingProfile.rows.push({
      id: 'p1',
      organisationId: 'org-1',
      legalName: 'Acme',
      state: '29',
      country: 'IN',
      gstin: null,
    });
    const payments = {
      createOrder: jest.fn(async (input: any) => {
        const pay = await ctx.db.payment.create({
          data: {
            amount: input.amountPaise,
            referenceId: input.referenceId,
            razorpayOrderId: 'order_X',
          },
        });
        return {
          paymentId: pay.id,
          orderId: 'order_X',
          amount: input.amountPaise,
          keyId: 'k',
          name: 'n',
          prefill: {},
        };
      }),
    };
    const checkouts = new BillingCheckoutService(
      ctx.db as never,
      { getMode: async () => ({ mode: 'online', reason: null }) } as never,
      { getSellerSettings: async () => ({ state: '29' }) } as never,
      payments as never,
      new PaymentEventsService(),
      {} as never,
    );
    return { ...ctx, checkouts };
  }
  const renew = {
    planId: 'pro',
    interval: 'monthly',
    purpose: 'renewal',
  } as const;

  it('a scheduled downgrade: the renewal charges the smaller plan and switches to it', async () => {
    const { checkouts, db, row } = checkoutSetup({
      scheduledPlanId: 'growth',
      scheduledInterval: 'monthly',
    });
    const pv = await checkouts.preview('org-1', renew);
    expect(pv).toMatchObject({
      kind: 'renewal',
      planId: 'growth',
      planPrice: 2000,
      total: 2360,
    });
    await checkouts.start('org-1', 'u1', renew);
    const c = db.billingCheckout.rows[0];
    await expect(checkouts.fulfil(c.id, c.totalPaise)).resolves.toBe('paid');
    expect(row()).toMatchObject({
      planId: 'growth',
      amount: 2000,
      status: 'active',
      scheduledPlanId: null,
    });
  });

  it('a scheduled cancellation: no renewal', async () => {
    const { checkouts } = checkoutSetup({ cancelAtPeriodEnd: true });
    expect(await code(checkouts.preview('org-1', renew))).toBe(
      'cancellation_scheduled',
    );
  });
});

describe('overview with a scheduled change', () => {
  const plan = (id: string, name: string, price: number) => ({
    id,
    name,
    tagline: '',
    priceMonthly: price,
    priceYearly: price * 10,
    isFree: price === 0,
    rank: price === 0 ? 0 : price === 2000 ? 1 : 2,
    limits: {
      users: null,
      projects: null,
      landingPages: null,
      templates: null,
    },
    modules: {
      teamChat: true,
      metaLeadAds: true,
      metaPages: null,
      whatsapp: false,
      aiCalling: false,
    },
  });
  const NOW = new Date('2026-10-15T10:00:00Z');
  const base = (sub: Record<string, unknown>) =>
    buildOverview({
      now: NOW,
      orgName: 'Acme',
      ownerName: 'Asha',
      plan: plan('pro', 'Pro', 5000),
      subscription: {
        status: 'active',
        billingCycle: 'monthly',
        renewsAt: new Date(NOW.getTime() + 10 * DAY),
        graceEndsAt: null,
        ...sub,
      } as never,
      counts: { users: 1, projects: 1, landingPages: 0, templates: 0 },
      notifyDays: 3,
      graceDays: 7,
      mode: { mode: 'online', reason: null },
    });

  it('cancellation: status, end date, nothing to renew', () => {
    const o = base({ cancelAtPeriodEnd: true });
    expect(o).toMatchObject({
      status: 'cancellation_scheduled',
      cancelAt: '2026-10-25',
      renewalAmount: null,
    });
  });

  it('downgrade: status, target and date; the renewal window still shows first, at the smaller price', () => {
    const scheduled = {
      plan: plan('growth', 'Growth', 2000),
      interval: 'monthly',
    };
    const o = base({ scheduled });
    expect(o).toMatchObject({
      status: 'downgrade_scheduled',
      downgradeAt: '2026-10-25',
      downgradeInterval: 'monthly',
      renewalAmount: 2360,
    });
    expect(o.downgradeTo?.id).toBe('growth');
    const due = base({
      scheduled,
      renewsAt: new Date(NOW.getTime() + 2 * DAY),
    });
    expect(due.status).toBe('renewal_due');
    expect(due.downgradeTo?.id).toBe('growth');
  });
});
