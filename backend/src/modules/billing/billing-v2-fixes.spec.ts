/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { ForbiddenException } from '@nestjs/common';
import {
  applyOrgSubscriptionLifecycle,
  graceEndFor,
} from '../../common/utils/subscription-lifecycle.util';
import {
  billingNow,
  parseClockOverride,
} from '../../common/utils/billing-clock.util';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';
import { AdminBillingService } from './admin-billing.service';
import { AdminCouponsService } from './admin-coupons.service';
import { AdminBillingController } from './billing.controller';
import { quoteRenewal } from './checkout-quote';
import {
  couponVisibleToOrg,
  orgCouponStatus,
  renewalCharge,
  withCoupon,
} from './coupon-rules';

const DAY = 86_400_000;
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
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
  priceMonthly: 1499,
  priceYearly: 14990,
  limits: { users: 5 },
};

function setup(
  sub: Record<string, unknown> = {},
  platformConfig: Record<string, unknown> | null = null,
) {
  const { db } = createFakeBillingDb({
    plans: [BASIC, GROWTH],
    platformConfig,
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'growth',
      billingCycle: 'monthly',
      status: 'active',
      amount: 1499,
      renewsAt: at('2026-10-13'),
      graceEndsAt: null,
      graceExtensionDays: 0,
      cancelAtPeriodEnd: false,
      cancelReason: null,
      scheduledPlanId: null,
      scheduledInterval: null,
      couponId: null,
      movedToBasicAt: null,
      ...sub,
    },
  });
  const row = () => db.subscription.rows[0];
  const titles = () => db.notification.rows.map((n: any) => n.title);
  return { db, row, titles };
}

const config = (o: Record<string, unknown> = {}) => ({
  billingGracePeriodDays: 7,
  billingExpiryNotifyDays: 3,
  billingExpiryBehavior: 'restrict',
  billingExpiryMessage: 'Renew soon.',
  billingReminders: null,
  ...o,
});

const withServerV2 = (on: boolean) => {
  const before = process.env.BILLING_V2;
  beforeEach(() => {
    if (on) process.env.BILLING_V2 = 'true';
    else delete process.env.BILLING_V2;
  });
  afterEach(() => {
    if (before === undefined) delete process.env.BILLING_V2;
    else process.env.BILLING_V2 = before;
  });
};

describe('grace is measured from the due date (renewsAt)', () => {
  withServerV2(true);

  it('renewsAt 13 Oct, 1-day grace, now 15 Oct → already on Basic in one pass', async () => {
    const { db, row } = setup({}, config({ billingGracePeriodDays: 1 }));
    await applyOrgSubscriptionLifecycle(db as never, 'org-1', at('2026-10-15'));
    expect(row()).toMatchObject({
      planId: 'basic',
      status: 'active',
      renewsAt: null,
      graceEndsAt: null,
      previousPlanId: 'growth',
    });
  });

  it('entering grace stores grace end = renewsAt + grace days (not "now" + grace days)', async () => {
    const { db, row } = setup({}, config({ billingGracePeriodDays: 7 }));
    await applyOrgSubscriptionLifecycle(db as never, 'org-1', at('2026-10-15'));
    expect(row().status).toBe('past_due');
    expect(row().graceEndsAt).toEqual(at('2026-10-20'));
  });

  it('an edited renewsAt or a changed grace setting applies on the next pass', async () => {
    const { db, row } = setup(
      { status: 'past_due', graceEndsAt: null }, // e.g. set by hand: null grace end
      config({ billingGracePeriodDays: 7 }),
    );
    await applyOrgSubscriptionLifecycle(db as never, 'org-1', at('2026-10-15'));
    expect(row().graceEndsAt).toEqual(at('2026-10-20')); // null re-synced

    row().renewsAt = at('2026-10-10'); // edited in the DB
    await applyOrgSubscriptionLifecycle(db as never, 'org-1', at('2026-10-15'));
    expect(row().graceEndsAt).toEqual(at('2026-10-17'));

    // Grace shortened to 2 days → 12 Oct, already over → Basic.
    const short = setup(
      {
        status: 'past_due',
        renewsAt: at('2026-10-10'),
        graceEndsAt: at('2026-10-17'),
      },
      config({ billingGracePeriodDays: 2 }),
    );
    await applyOrgSubscriptionLifecycle(
      short.db as never,
      'org-1',
      at('2026-10-15'),
    );
    expect(short.row().planId).toBe('basic');
  });

  it('a Super Admin extension is kept on top of the rule', () => {
    expect(
      graceEndFor({ renewsAt: at('2026-10-13'), graceExtensionDays: 5 }, 7),
    ).toEqual(at('2026-10-25'));
  });
});

describe('when grace ends: fall back to Basic with billing v2 on the server', () => {
  describe('BILLING_V2=true', () => {
    withServerV2(true);
    it.each(['restrict', 'cancel', 'fall_back_to_basic'])(
      'stored "%s" → the org moves to Basic',
      async (stored) => {
        const { db, row } = setup(
          { status: 'past_due', renewsAt: at('2026-10-01') },
          config({ billingExpiryBehavior: stored }),
        );
        await applyOrgSubscriptionLifecycle(
          db as never,
          'org-1',
          at('2026-10-15'),
        );
        expect(row()).toMatchObject({ planId: 'basic', status: 'active' });
        expect(row().movedToBasicAt).toEqual(at('2026-10-15'));
      },
    );

    it('a plan already left "expired" by the old restrict rule moves to Basic on the next pass', async () => {
      const { db, row } = setup(
        {
          status: 'expired',
          renewsAt: at('2026-10-13'),
          graceEndsAt: at('2026-10-14'),
        },
        config({ billingGracePeriodDays: 1 }),
      );
      await applyOrgSubscriptionLifecycle(
        db as never,
        'org-1',
        at('2026-10-16'),
      );
      expect(row()).toMatchObject({
        planId: 'basic',
        status: 'active',
        renewsAt: null,
        previousPlanId: 'growth',
      });
    });
  });

  describe('BILLING_V2 off (old behaviour unchanged)', () => {
    withServerV2(false);
    it('restrict → expired on the paid plan; cancel → cancelled', async () => {
      const r = setup(
        { status: 'past_due', renewsAt: at('2026-10-01') },
        config({ billingExpiryBehavior: 'restrict' }),
      );
      await applyOrgSubscriptionLifecycle(
        r.db as never,
        'org-1',
        at('2026-10-15'),
      );
      expect(r.row()).toMatchObject({ planId: 'growth', status: 'expired' });
      // …and stays expired on later passes.
      await applyOrgSubscriptionLifecycle(
        r.db as never,
        'org-1',
        at('2026-10-20'),
      );
      expect(r.row()).toMatchObject({ planId: 'growth', status: 'expired' });

      const c = setup(
        { status: 'past_due', renewsAt: at('2026-10-01') },
        config({ billingExpiryBehavior: 'cancel' }),
      );
      await applyOrgSubscriptionLifecycle(
        c.db as never,
        'org-1',
        at('2026-10-15'),
      );
      expect(c.row()).toMatchObject({ planId: 'growth', status: 'cancelled' });
    });
  });
});

describe('"Run lifecycle check now"', () => {
  withServerV2(true);

  it('runs the sweep at once, moves a lapsed org to Basic and writes an audit log', async () => {
    const { db, row } = setup(
      { status: 'past_due', renewsAt: new Date(Date.now() - 30 * DAY) },
      config(),
    );
    const service = new AdminBillingService(
      db as never,
      {} as never,
      {} as never,
    );
    const res = await service.runLifecycleNow('super-1');
    expect(res).toMatchObject({ scanned: 1, movedToFreePlan: 1 });
    expect(row().planId).toBe('basic');
    expect(db.auditLog.rows).toContainEqual(
      expect.objectContaining({
        actorId: 'super-1',
        action: 'billing_lifecycle_run',
      }),
    );
  });

  it('is refused for platform roles other than super_admin', () => {
    const service = { runLifecycleNow: jest.fn() };
    const controller = new AdminBillingController(
      service as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(() =>
      controller.runLifecycle({
        sub: 'u',
        orgId: null,
        roles: ['platform_ops'],
      }),
    ).toThrow(ForbiddenException);
    void controller.runLifecycle({
      sub: 'u',
      orgId: null,
      roles: ['super_admin'],
    });
    expect(service.runLifecycleNow).toHaveBeenCalledWith('u');
  });
});

describe('reminders follow the settings', () => {
  withServerV2(true);
  const reminders = (o: Record<string, boolean>) =>
    config({ billingGracePeriodDays: 7, billingReminders: o });

  it('"N days before renewal" uses the notify-days setting and can be switched off', async () => {
    const on = setup({ renewsAt: at('2026-10-17') }, reminders({}));
    await applyOrgSubscriptionLifecycle(
      on.db as never,
      'org-1',
      at('2026-10-15'),
    );
    expect(on.titles()).toEqual(['Your plan renews on 17 Oct 2026']);
    // Once per due date, even after a second pass.
    await applyOrgSubscriptionLifecycle(
      on.db as never,
      'org-1',
      at('2026-10-15'),
    );
    expect(on.titles()).toHaveLength(1);

    const early = setup({ renewsAt: at('2026-10-20') }, reminders({}));
    await applyOrgSubscriptionLifecycle(
      early.db as never,
      'org-1',
      at('2026-10-15'),
    );
    expect(early.titles()).toEqual([]); // 5 days out, notify days = 3

    const off = setup(
      { renewsAt: at('2026-10-17') },
      reminders({ before_renewal: false }),
    );
    await applyOrgSubscriptionLifecycle(
      off.db as never,
      'org-1',
      at('2026-10-15'),
    );
    expect(off.titles()).toEqual([]);
  });

  it('payment day, mid-grace and last-day reminders each respect their switch', async () => {
    const due = setup({ renewsAt: at('2026-10-14') }, reminders({}));
    await applyOrgSubscriptionLifecycle(
      due.db as never,
      'org-1',
      at('2026-10-15'),
    );
    expect(due.titles()).toEqual(['Your renewal was due on 14 Oct 2026']);

    const dueOff = setup(
      { renewsAt: at('2026-10-14') },
      reminders({ payment_day: false }),
    );
    await applyOrgSubscriptionLifecycle(
      dueOff.db as never,
      'org-1',
      at('2026-10-15'),
    );
    expect(dueOff.titles()).toEqual([]);
    expect(dueOff.row().status).toBe('past_due'); // the switch is only the message

    // Due 10 Oct, 7-day grace → ends 17 Oct; mid-grace from 14 Oct.
    const mid = setup(
      { status: 'past_due', renewsAt: at('2026-10-10') },
      reminders({}),
    );
    await applyOrgSubscriptionLifecycle(
      mid.db as never,
      'org-1',
      at('2026-10-14'),
    );
    expect(mid.titles()).toEqual([
      'Payment reminder: grace ends on 17 Oct 2026',
    ]);
    const midOff = setup(
      { status: 'past_due', renewsAt: at('2026-10-10') },
      reminders({ mid_grace: false }),
    );
    await applyOrgSubscriptionLifecycle(
      midOff.db as never,
      'org-1',
      at('2026-10-14'),
    );
    expect(midOff.titles()).toEqual([]);

    const last = setup(
      { status: 'past_due', renewsAt: at('2026-10-10') },
      reminders({}),
    );
    await applyOrgSubscriptionLifecycle(
      last.db as never,
      'org-1',
      new Date(at('2026-10-17').getTime() - 3_600_000),
    );
    expect(last.titles()).toEqual(['Grace ends on 17 Oct 2026']);
    const lastOff = setup(
      { status: 'past_due', renewsAt: at('2026-10-10') },
      reminders({ day_before_grace_ends: false }),
    );
    await applyOrgSubscriptionLifecycle(
      lastOff.db as never,
      'org-1',
      new Date(at('2026-10-17').getTime() - 3_600_000),
    );
    expect(lastOff.titles()).toEqual([]);
  });

  it('no mid-grace reminder when grace is under 3 days', async () => {
    const r = setup(
      { status: 'past_due', renewsAt: at('2026-10-14') },
      config({ billingGracePeriodDays: 2, billingReminders: {} }),
    );
    // Half-way through a 2-day grace (ends 16 Oct): no mid-grace message.
    await applyOrgSubscriptionLifecycle(
      r.db as never,
      'org-1',
      new Date(at('2026-10-14').getTime() + 12 * 3_600_000),
    );
    expect(r.titles()).toEqual([]);
  });
});

describe('org coupons: visibility and status', () => {
  const now = at('2026-10-15');
  const coupon = (o: Record<string, unknown> = {}) => ({
    id: 'c1',
    code: 'WELCOME20',
    description: '',
    kind: 'percent' as const,
    percentOff: 20,
    amountOffPaise: null,
    planIds: ['growth'],
    interval: 'any' as const,
    duration: 'first_payment' as const,
    durationCount: null,
    validFrom: at('2026-10-01'),
    validTo: at('2026-12-31'),
    totalUses: null,
    oncePerOrg: true,
    orgIds: [] as string[],
    showToCustomers: false,
    createdAt: new Date(),
    ...o,
  });

  it('shows coupons reserved for the org, and open ones only when listed for customers', () => {
    expect(
      couponVisibleToOrg(coupon({ orgIds: ['org-1'] }), 'org-1', now),
    ).toBe(true);
    expect(
      couponVisibleToOrg(coupon({ orgIds: ['org-2'] }), 'org-1', now),
    ).toBe(false);
    expect(couponVisibleToOrg(coupon(), 'org-1', now)).toBe(false);
    expect(
      couponVisibleToOrg(coupon({ showToCustomers: true }), 'org-1', now),
    ).toBe(true);
    // Not started yet: hidden.
    expect(
      couponVisibleToOrg(
        coupon({ showToCustomers: true, validFrom: at('2026-11-01') }),
        'org-1',
        now,
      ),
    ).toBe(false);
  });

  it('status: redeemed / expired / used up / available', () => {
    const s = (
      o: Record<string, unknown>,
      ctx: { usesSoFar?: number; orgHasUsed?: boolean } = {},
    ) =>
      orgCouponStatus(coupon(o), {
        now,
        usesSoFar: 0,
        orgHasUsed: false,
        ...ctx,
      });
    expect(s({}, { orgHasUsed: true, usesSoFar: 1 })).toBe('redeemed');
    expect(s({ oncePerOrg: false }, { orgHasUsed: true, usesSoFar: 1 })).toBe(
      'available',
    );
    expect(s({ validTo: at('2026-10-14') })).toBe('expired');
    expect(s({ totalUses: 3 }, { usesSoFar: 3 })).toBe('used_up');
    expect(s({ totalUses: 3 }, { usesSoFar: 2 })).toBe('available');
  });

  it('lists them for the org with the redemption date and the invoice link', async () => {
    const { db } = setup();
    db.coupon.rows.push(
      coupon({ id: 'c1', code: 'ACME50', orgIds: ['org-1'], percentOff: 50 }),
      coupon({
        id: 'c2',
        code: 'PUBLIC10',
        showToCustomers: true,
        percentOff: 10,
      }),
      coupon({ id: 'c3', code: 'HIDDEN', percentOff: 5 }),
      coupon({ id: 'c4', code: 'OTHERORG', orgIds: ['org-2'] }),
    );
    db.couponRedemption.rows.push({
      id: 'r1',
      couponId: 'c1',
      organisationId: 'org-1',
      checkoutId: 'chk-1',
      planId: 'growth',
      discountPaise: 74950,
      createdAt: at('2026-10-05'),
    });
    db.invoice.rows.push({
      id: 'inv-1',
      number: 'INV/26-27/0007',
      kind: 'invoice',
      checkoutId: 'chk-1',
    });
    const rows = await new AdminCouponsService(db as never).orgCoupons(
      'org-1',
      now,
    );
    expect(rows.map((r) => r.code).sort()).toEqual(['ACME50', 'PUBLIC10']);
    const acme = rows.find((r) => r.code === 'ACME50')!;
    expect(acme).toMatchObject({
      forYourOrg: true,
      status: 'redeemed',
      redeemedAt: at('2026-10-05').toISOString(),
      invoiceNumber: 'INV/26-27/0007',
      plans: [{ id: 'growth', name: 'Growth' }],
      description: '50% off the first payment',
    });
    expect(acme.invoiceUrl).toMatch(
      /\/api\/billing\/invoices\/inv-1\/document\?/,
    );
    expect(rows.find((r) => r.code === 'PUBLIC10')).toMatchObject({
      forYourOrg: false,
      status: 'available',
      redeemedAt: null,
      invoiceUrl: null,
    });
  });
});

describe('the Pay now breakdown uses the renewal checkout calculation', () => {
  it('₹1,499 + GST = ₹1,768.82, and with a coupon it equals quoteRenewal + withCoupon', () => {
    const parties = {
      buyer: { state: '29', country: 'IN' },
      seller: { state: '29' },
    };
    const plain = renewalCharge(149_900, null, parties);
    expect(plain).toEqual({
      subtotalPaise: 149_900,
      couponDiscountPaise: 0,
      taxablePaise: 149_900,
      gstPaise: 26_982,
      totalPaise: 176_882,
    });

    const coupon = {
      id: 'c',
      code: 'TEN',
      description: '',
      kind: 'percent' as const,
      percentOff: 10,
      amountOffPaise: null,
      planIds: ['growth'],
      interval: 'any' as const,
      duration: 'forever' as const,
      durationCount: null,
      validFrom: at('2026-01-01'),
      validTo: null,
      totalUses: null,
      oncePerOrg: false,
      orgIds: [],
    };
    const plan = {
      id: 'growth',
      name: 'Growth',
      priceMonthly: 1499,
      priceYearly: 14990,
      isFree: false,
      rank: 1,
    };
    const quote = withCoupon(
      quoteRenewal({
        now: at('2026-10-15'),
        current: {
          plan,
          interval: 'monthly',
          status: 'active',
          renewsAt: at('2026-10-16'),
          cancelAtPeriodEnd: false,
          scheduled: null,
        },
        ...parties,
        notifyDays: 3,
        requested: { planId: 'growth', interval: 'monthly' },
      } as never),
      coupon,
      parties,
      null,
    );
    const charge = renewalCharge(149_900, coupon, parties);
    expect(charge.totalPaise).toBe(quote.totalPaise);
    expect(charge.couponDiscountPaise).toBe(quote.couponDiscountPaise);
  });
});

describe('BILLING_CLOCK_OVERRIDE', () => {
  const real = at('2026-10-15');
  it('takes a date, a datetime or an offset — never in production', () => {
    expect(parseClockOverride('2026-11-20', 'development')!(real)).toEqual(
      at('2026-11-20'),
    );
    expect(
      parseClockOverride('2026-11-20T09:30:00Z', undefined)!(real),
    ).toEqual(new Date('2026-11-20T09:30:00Z'));
    expect(parseClockOverride('+10d', 'test')!(real)).toEqual(at('2026-10-25'));
    expect(parseClockOverride('-36h', 'test')!(real)).toEqual(
      new Date(real.getTime() - 36 * 3_600_000),
    );
    expect(parseClockOverride('+10d', 'production')).toBeNull();
    expect(parseClockOverride('soon', 'development')).toBeNull();
    expect(parseClockOverride('', 'development')).toBeNull();
  });

  it('billingNow() follows the env outside production', () => {
    const before = {
      o: process.env.BILLING_CLOCK_OVERRIDE,
      e: process.env.NODE_ENV,
    };
    try {
      process.env.BILLING_CLOCK_OVERRIDE = '2030-01-01';
      process.env.NODE_ENV = 'test';
      expect(billingNow()).toEqual(at('2030-01-01'));
      process.env.NODE_ENV = 'production';
      expect(billingNow().getFullYear()).not.toBe(2030);
    } finally {
      if (before.o === undefined) delete process.env.BILLING_CLOCK_OVERRIDE;
      else process.env.BILLING_CLOCK_OVERRIDE = before.o;
      process.env.NODE_ENV = before.e;
    }
  });
});
