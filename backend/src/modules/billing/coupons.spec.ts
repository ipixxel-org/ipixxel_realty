/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { PaymentEventsService } from '../payments/payment-events';
import { AdminCouponsService } from './admin-coupons.service';
import { BillingCheckoutService } from './billing-checkout.service';
import {
  checkCoupon,
  couponDiscountPaise,
  couponStatus,
  describeCouponV2,
  renewalsCoveredAfterFirst,
  type CouponRule,
} from './coupon-rules';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

const DAY = 86_400_000;
const NOW = new Date('2026-10-15T10:00:00Z');

const rule = (over: Partial<CouponRule> = {}): CouponRule => ({
  id: 'c1',
  code: 'LAUNCH20',
  kind: 'percent',
  percentOff: 20,
  amountOffPaise: null,
  planIds: ['growth', 'pro'],
  interval: 'any',
  duration: 'first_n',
  durationCount: 3,
  validFrom: new Date('2026-10-01T00:00:00Z'),
  validTo: null,
  totalUses: null,
  oncePerOrg: true,
  orgIds: [],
  ...over,
});
const ctx = (over: Record<string, unknown> = {}) => ({
  now: NOW,
  orgId: 'org-1',
  planId: 'growth',
  interval: 'monthly' as const,
  planNames: { growth: 'Growth', pro: 'Pro' },
  usesSoFar: 0,
  orgHasUsed: false,
  ...over,
});
const reason = (r: ReturnType<typeof checkCoupon>) => (r.ok ? 'ok' : r.reason);

describe('coupon rules (same order and words as the UI)', () => {
  it('checks dates, organisation, plan, interval, limit, once per org', () => {
    expect(reason(checkCoupon(rule(), ctx()))).toBe('ok');
    expect(
      reason(
        checkCoupon(
          rule({ validFrom: new Date('2026-10-20T00:00:00Z') }),
          ctx(),
        ),
      ),
    ).toBe("LAUNCH20 isn't active yet — it starts on 20 Oct 2026.");
    expect(
      reason(
        checkCoupon(rule({ validTo: new Date('2026-10-14T00:00:00Z') }), ctx()),
      ),
    ).toBe('LAUNCH20 expired on 14 Oct 2026.');
    // valid through its last day
    expect(
      reason(
        checkCoupon(rule({ validTo: new Date('2026-10-15T00:00:00Z') }), ctx()),
      ),
    ).toBe('ok');
    expect(reason(checkCoupon(rule({ orgIds: ['org-9'] }), ctx()))).toMatch(
      /reserved for specific organisations/,
    );
    expect(reason(checkCoupon(rule({ planIds: ['pro'] }), ctx()))).toBe(
      'LAUNCH20 only works on Pro.',
    );
    expect(reason(checkCoupon(rule({ interval: 'yearly' }), ctx()))).toBe(
      'LAUNCH20 only works with yearly billing.',
    );
    expect(
      reason(checkCoupon(rule({ totalUses: 5 }), ctx({ usesSoFar: 5 }))),
    ).toBe('LAUNCH20 has reached its usage limit.');
    expect(reason(checkCoupon(rule(), ctx({ orgHasUsed: true })))).toBe(
      'Your organisation has already used LAUNCH20.',
    );
    // Reusable coupon: an org that used it doesn't count against the limit again.
    expect(
      reason(
        checkCoupon(
          rule({ totalUses: 5, oncePerOrg: false }),
          ctx({ usesSoFar: 5, orgHasUsed: true }),
        ),
      ),
    ).toBe('ok');
  });

  it('discount in paise: percent rounded half up, fixed capped at the amount', () => {
    expect(couponDiscountPaise(rule(), 200000)).toBe(40000);
    expect(couponDiscountPaise(rule({ percentOff: 15 }), 174194)).toBe(26129); // 26129.1
    expect(
      couponDiscountPaise(
        rule({ kind: 'fixed', amountOffPaise: 50000 }),
        200000,
      ),
    ).toBe(50000);
    expect(
      couponDiscountPaise(
        rule({ kind: 'fixed', amountOffPaise: 50000 }),
        30000,
      ),
    ).toBe(30000);
    expect(couponDiscountPaise(rule({ percentOff: 100 }), 200000)).toBe(200000);
  });

  it('describes itself and knows how many renewals it covers', () => {
    expect(describeCouponV2(rule())).toBe('20% off the first 3 payments');
    expect(
      describeCouponV2(
        rule({
          kind: 'fixed',
          amountOffPaise: 50000,
          duration: 'first_payment',
        }),
      ),
    ).toBe('₹500 off the first payment');
    expect(renewalsCoveredAfterFirst(rule())).toBe(2);
    expect(renewalsCoveredAfterFirst(rule({ duration: 'first_payment' }))).toBe(
      0,
    );
    expect(renewalsCoveredAfterFirst(rule({ duration: 'forever' }))).toBeNull();
    expect(couponStatus(rule({ totalUses: 1 }), 1, NOW)).toBe('used_up');
    expect(
      couponStatus(
        rule({ validFrom: new Date('2026-11-01T00:00:00Z') }),
        0,
        NOW,
      ),
    ).toBe('scheduled');
  });
});

/* ------------------------------------------------------------- checkout */

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
  const { db } = createFakeBillingDb({
    plans: [BASIC, GROWTH, PRO],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'basic',
      billingCycle: 'monthly',
      status: 'active',
      renewsAt: new Date(Date.now() + 20 * DAY),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      couponRenewalsLeft: null,
      ...sub,
    },
  });
  db.billingProfile.rows.push({
    id: 'p1',
    organisationId: 'org-1',
    legalName: 'Acme',
    state: '29',
    country: 'IN',
    gstin: null,
  });
  const coupon = (over: Record<string, unknown>) =>
    db.coupon.rows.push({
      id: `cp_${String(over.code)}`,
      description: '',
      kind: 'percent',
      percentOff: 20,
      amountOffPaise: null,
      planIds: ['growth', 'pro'],
      interval: 'any',
      duration: 'first_n',
      durationCount: 3,
      validFrom: new Date(Date.now() - 10 * DAY),
      validTo: null,
      totalUses: null,
      oncePerOrg: true,
      orgIds: [],
      ...over,
    });
  const payments = {
    createOrder: jest.fn(async (input: any) => {
      const pay = await db.payment.create({
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
  const service = new BillingCheckoutService(
    db as never,
    { getMode: async () => ({ mode: 'online', reason: null }) } as never,
    { getSellerSettings: async () => ({ state: '29' }) } as never,
    payments as never,
    new PaymentEventsService(),
    {} as never,
  );
  return { db, service, coupon, payments, sub: () => db.subscription.rows[0] };
}
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'no error',
    (e: any) => e?.response?.code ?? String(e),
  );
const buy = { planId: 'growth', interval: 'monthly' } as const;

describe('coupons at checkout', () => {
  it('preview: taken off before GST; a bad code is a message, not an error', async () => {
    const { service, coupon } = setup();
    coupon({ code: 'LAUNCH20' });
    const pv = await service.preview('org-1', {
      ...buy,
      couponCode: ' launch20 ',
    });
    expect(pv).toMatchObject({
      couponsEnabled: true,
      coupon: { code: 'LAUNCH20', description: '20% off the first 3 payments' },
      couponError: null,
      planPrice: 2000,
      couponDiscount: 400,
      taxable: 1600,
      gst: { kind: 'intra', cgst: 144, sgst: 144 },
      total: 1888,
      couponRenewalsLeft: 2,
    });
    const bad = await service.preview('org-1', { ...buy, couponCode: 'NOPE' });
    expect(bad).toMatchObject({
      coupon: null,
      couponError: "There's no coupon called NOPE. Check the spelling.",
      total: 2360,
    });
  });

  it('start refuses a code that does not apply, so the charge never differs from the preview', async () => {
    const { service, coupon } = setup();
    coupon({ code: 'PROONLY', planIds: ['pro'] });
    expect(
      await code(
        service.start('org-1', 'u1', { ...buy, couponCode: 'PROONLY' }),
      ),
    ).toBe('coupon_invalid');
  });

  it('paid: records the use and attaches the coupon for the next renewals, which apply and count it down', async () => {
    const { service, coupon, db, sub } = setup();
    coupon({ code: 'LAUNCH20' });
    await service.start('org-1', 'u1', { ...buy, couponCode: 'LAUNCH20' });
    const c = db.billingCheckout.rows[0];
    expect(c).toMatchObject({
      couponId: 'cp_LAUNCH20',
      couponDiscountPaise: 40000,
      totalPaise: 188800,
    });
    await service.fulfil(c.id, c.totalPaise);
    expect(db.couponRedemption.rows).toEqual([
      expect.objectContaining({
        couponId: 'cp_LAUNCH20',
        organisationId: 'org-1',
        discountPaise: 40000,
        checkoutId: c.id,
      }),
    ]);
    expect(sub()).toMatchObject({
      planId: 'growth',
      couponId: 'cp_LAUNCH20',
      couponRenewalsLeft: 2,
    });

    // Renewals: the coupon applies by itself (no code), twice, then stops.
    const renew = { ...buy, purpose: 'renewal' } as const;
    for (const left of [1, 0]) {
      sub().renewsAt = new Date(Date.now() + 2 * DAY);
      const pv = await service.preview('org-1', renew);
      expect(pv).toMatchObject({
        kind: 'renewal',
        couponsEnabled: false,
        coupon: { code: 'LAUNCH20' },
        couponDiscount: 400,
        total: 1888,
      });
      await service.start('org-1', 'u1', renew);
      const r = db.billingCheckout.rows[db.billingCheckout.rows.length - 1];
      await expect(service.fulfil(r.id, r.totalPaise)).resolves.toBe('paid');
      expect(sub().couponRenewalsLeft ?? 0).toBe(left);
    }
    expect(sub().couponId).toBeNull();
    sub().renewsAt = new Date(Date.now() + 2 * DAY);
    expect((await service.preview('org-1', renew)).total).toBe(2360);
    expect(db.couponRedemption.rows).toHaveLength(3);
    // Still once per org: it can't be entered again.
    expect(
      (
        await service.preview('org-1', {
          planId: 'pro',
          interval: 'monthly',
          couponCode: 'LAUNCH20',
        })
      ).couponError,
    ).toBe('Your organisation has already used LAUNCH20.');
  });

  it('a 100% coupon activates the plan straight away, with no payment', async () => {
    const { service, coupon, db, sub, payments } = setup();
    coupon({ code: 'PARTNER100', percentOff: 100, duration: 'first_payment' });
    const res: any = await service.start('org-1', 'u1', {
      ...buy,
      couponCode: 'PARTNER100',
    });
    expect(res).toMatchObject({
      status: 'activated',
      receipt: {
        planId: 'growth',
        amount: 0,
        reference: 'free_coupon',
        couponCode: 'PARTNER100',
      },
    });
    expect(payments.createOrder).not.toHaveBeenCalled();
    expect(db.billingCheckout.rows[0]).toMatchObject({
      status: 'paid',
      totalPaise: 0,
    });
    expect(sub()).toMatchObject({ planId: 'growth', couponId: null });
    expect(db.couponRedemption.rows).toHaveLength(1);
  });

  it('an upgrade: the coupon comes off the prorated charge', async () => {
    const { service, coupon } = setup({
      planId: 'growth',
      renewsAt: new Date(Date.now() + 15 * DAY),
    });
    coupon({
      code: 'FLAT500',
      kind: 'fixed',
      percentOff: null,
      amountOffPaise: 50000,
      duration: 'first_payment',
    });
    const pv = await service.preview('org-1', {
      planId: 'pro',
      interval: 'monthly',
      couponCode: 'FLAT500',
    });
    // (5000 − 2000) × 15 ÷ 30 = 1500 → − 500 = 1000 taxable
    expect(pv).toMatchObject({
      kind: 'upgrade_same_interval',
      couponDiscount: 500,
      taxable: 1000,
      total: 1180,
    });
    expect(pv.proration?.charge).toBe(1500);
  });

  it('usage limit counts organisations', async () => {
    const { service, coupon, db } = setup();
    coupon({ code: 'ONEORG', totalUses: 1 });
    db.couponRedemption.rows.push({
      id: 'r1',
      couponId: 'cp_ONEORG',
      organisationId: 'org-2',
      checkoutId: 'x',
      planId: 'growth',
      discountPaise: 1,
    });
    expect(
      (await service.preview('org-1', { ...buy, couponCode: 'ONEORG' }))
        .couponError,
    ).toBe('ONEORG has reached its usage limit.');
  });
});

describe('Super Admin coupons', () => {
  function admin() {
    const { db } = createFakeBillingDb({ plans: [BASIC, GROWTH, PRO] });
    db.organisation = {
      ...db.plan, // only count / findMany used
      count: async ({ where }: any) =>
        where.id.in.filter((id: string) => ['org-1', 'org-2'].includes(id))
          .length,
      findMany: async () => [{ id: 'org-1', name: 'Acme' }],
    };
    db.couponRedemption.aggregate = async ({ where }: any) => ({
      _sum: {
        discountPaise: db.couponRedemption.rows
          .filter((r: any) => r.couponId === where.couponId)
          .reduce((s: number, r: any) => s + r.discountPaise, 0),
      },
    });
    db.plan.findMany = async ({ where }: any = {}) =>
      db.plan.rows.filter(
        (p: any) => !where?.id?.in || where.id.in.includes(p.id),
      );
    return { db, service: new AdminCouponsService(db as never) };
  }
  const valid = {
    code: 'summer15',
    description: 'Summer',
    kind: 'percent' as const,
    value: 15,
    planIds: ['growth'],
    interval: 'any' as const,
    duration: 'first_payment' as const,
    durationCount: null,
    validFrom: '2026-10-01',
    validTo: '2026-12-31',
    totalUses: 100,
    oncePerOrg: true,
    orgIds: null,
  };

  it('creates (code upper-cased), lists with uses and status, and shows redemptions', async () => {
    const { service, db } = admin();
    const row = await service.save(valid, true, 'admin-1');
    expect(row).toMatchObject({
      coupon: {
        code: 'SUMMER15',
        value: 15,
        orgIds: null,
        validTo: '2026-12-31',
      },
      uses: 0,
      status: 'active',
    });
    const id = db.coupon.rows[0].id;
    db.couponRedemption.rows.push({
      id: 'r1',
      couponId: id,
      organisationId: 'org-1',
      checkoutId: 'k1',
      planId: 'growth',
      discountPaise: 30000,
      createdAt: NOW,
    });
    db.couponRedemption.rows.push({
      id: 'r2',
      couponId: id,
      organisationId: 'org-1',
      checkoutId: 'k2',
      planId: 'growth',
      discountPaise: 30000,
      createdAt: NOW,
    });
    expect((await service.list())[0]).toMatchObject({ uses: 1 });
    const detail = await service.get('summer15');
    expect(detail).toMatchObject({ uses: 1, totalDiscount: 600 });
    expect(detail.redemptions[0]).toMatchObject({
      orgName: 'Acme',
      planName: 'Growth',
      discount: 300,
    });
  });

  it("validates like the form, and the code can't be renamed", async () => {
    const { service } = admin();
    const err = (c: Partial<typeof valid>, isNew = true, path?: string) =>
      code(service.save({ ...valid, ...c }, isNew, null, path));
    expect(await err({ code: 'A B' })).toBe('coupon_code');
    expect(await err({ value: 120 })).toBe('coupon_value');
    expect(await err({ value: 12.5 })).toBe('coupon_value');
    expect(await err({ planIds: [] })).toBe('coupon_plans');
    expect(await err({ planIds: ['basic'] })).toBe('coupon_plans');
    expect(
      await err({ duration: 'first_n' as never, durationCount: 1 } as never),
    ).toBe('coupon_duration');
    expect(await err({ validTo: '2026-09-01' })).toBe('coupon_dates');
    expect(await err({ orgIds: [] as never })).toBe('coupon_orgs');
    expect(await err({ orgIds: ['org-1', 'ghost'] as never })).toBe(
      'coupon_orgs',
    );
    await service.save(valid, true, null);
    expect(await err({})).toBe('coupon_exists');
    expect(await err({ code: 'OTHER' }, false, 'SUMMER15')).toBe('coupon_code');
    await expect(
      service.save({ ...valid, value: 20 }, false, null, 'SUMMER15'),
    ).resolves.toMatchObject({ coupon: { value: 20 } });
  });
});
