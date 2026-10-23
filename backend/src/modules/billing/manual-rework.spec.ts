/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { PaymentEventsService } from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { moveToFreePlan } from '../../common/utils/subscription-lifecycle.util';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingLedgerService } from './billing-ledger.service';
import { BillingPlanChangeService } from './billing-plan-change.service';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

/**
 * Manual mode (online payments off): every paid action is a request the
 * Super Admin handles in one place — Mark as paid → Approve (or Reject).
 * Overdue changes at full price, Request renewal, Basic straight away in
 * grace, Option A (no hold), and invoicing once on approval.
 */

const DAY = 86_400_000;
const BASIC = { id: 'basic', name: 'Basic', priceMonthly: 0, priceYearly: 0 };
const STARTER = {
  id: 'starter',
  name: 'Starter',
  priceMonthly: 1000,
  priceYearly: 10000,
};
const PRO = { id: 'pro', name: 'Pro', priceMonthly: 3000, priceYearly: 30000 };
const SELLER = {
  legalName: 'iPixxel',
  gstin: null,
  state: '29',
  addressLine1: null,
  addressLine2: null,
  city: null,
  pincode: null,
};
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function setup(
  sub: Record<string, unknown>,
  mode: 'manual' | 'online' = 'manual',
) {
  const { db } = createFakeBillingDb({
    plans: [BASIC, STARTER, PRO],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'pro',
      billingCycle: 'monthly',
      status: 'active',
      amount: 3000,
      renewsAt: new Date(Date.now() + 10 * DAY),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      movedToBasicAt: null,
      ...sub,
    },
  });
  giveBillingDetails(db);
  const modeService = {
    getMode: async () =>
      mode === 'manual'
        ? { mode: 'manual', reason: 'switched_off' }
        : { mode: 'online', reason: null },
  };
  const requests = new PackageChangeRequestsService(db as never);
  const invoiced: string[] = [];
  requests.invoiceIssued = async (id) => invoiced.push(id);
  const checkout = new BillingCheckoutService(
    db as never,
    modeService as never,
    { getSellerSettings: async () => SELLER } as never,
    { createOrder: jest.fn() } as never,
    new PaymentEventsService(),
    requests,
  );
  const changes = new BillingPlanChangeService(
    db as never,
    { getOverview: async () => ({}) } as never,
    modeService as never,
    checkout,
  );
  const admin = new AdminSubscriptionsService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    changes,
    {} as never,
    { getSellerSettings: async () => SELLER } as never,
    undefined,
    modeService as never,
  );
  const ledger = new BillingLedgerService(db as never);
  const coupon = (over: Record<string, unknown>) =>
    db.coupon.rows.push({
      id: `cp_${String(over.code)}`,
      description: '',
      kind: 'percent',
      percentOff: 20,
      amountOffPaise: null,
      planIds: ['starter', 'pro'],
      interval: 'any',
      duration: 'first_payment',
      durationCount: null,
      validFrom: new Date(Date.now() - 10 * DAY),
      validTo: null,
      totalUses: null,
      orgIds: [],
      oncePerOrg: true,
      ...over,
    });
  const row = () => db.subscription.rows[0];
  const request = () => db.packageChangeRequest.rows[0];
  const chk = () => db.billingCheckout.rows[0];
  const pay = (requestId: string, over: Record<string, unknown> = {}) =>
    requests.markPaid(requestId, 'admin-1', {
      amount: chk().totalPaise / 100,
      method: 'UPI',
      reference: 'UTR 12345',
      receivedOn: today(),
      ...over,
    } as never);
  return {
    db,
    requests,
    checkout,
    changes,
    admin,
    ledger,
    coupon,
    row,
    request,
    chk,
    pay,
    invoiced,
  };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'no error',
    (e: any) => e?.response?.code ?? String(e?.message ?? e),
  );

/* ------------------------------------------------- 1. overdue (grace) */

describe('manual mode, renewal overdue (grace)', () => {
  const grace = () => ({ status: 'past_due', renewsAt: daysAgo(3) });

  it('a smaller paid plan is a request at its FULL price (no proration); approval continues from renewsAt', async () => {
    const t = setup(grace());
    const missed = t.row().renewsAt as Date;
    const preview = await t.checkout.preview('org-1', {
      planId: 'starter',
      interval: 'monthly',
    });
    expect(preview).toMatchObject({
      kind: 'renewal',
      proration: null,
      planPrice: 1000,
      taxable: 1000,
      total: 1180,
      couponsEnabled: false,
    });
    const res: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'starter',
      interval: 'monthly',
    });
    expect(res.status).toBe('pending_approval');
    expect(t.chk()).toMatchObject({
      kind: 'renewal',
      overdue: true,
      totalPaise: 118_000,
    });
    const listed = await new BillingLedgerService(t.db as never).listRequests(
      'org-1',
    );
    expect(listed.data[0]).toMatchObject({
      label: 'Change to Starter',
      overdue: true,
      total: 1180,
      payment: null,
    });

    await t.pay(res.requestId);
    await t.requests.adminApproveRequest(res.requestId, 'admin-1');
    expect(t.row()).toMatchObject({ planId: 'starter', status: 'active' });
    expect(isoDay(t.row().renewsAt)).toBe(
      isoDay(new Date(missed.getTime() + 30 * DAY)),
    );
  });

  it('the same plan reads "Renewal of Pro"', async () => {
    const t = setup(grace());
    const res: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'pro',
      interval: 'monthly',
    });
    expect(res.status).toBe('pending_approval');
    const listed = await new BillingLedgerService(t.db as never).listRequests(
      'org-1',
    );
    expect(listed.data[0]).toMatchObject({
      label: 'Renewal of Pro',
      overdue: true,
    });
  });

  it('a smaller plan from the downgrade endpoint is sent as that request (no downgrade_not_now)', async () => {
    const t = setup(grace());
    expect(
      await code(
        t.changes.scheduleDowngrade('org-1', 'u-1', { planId: 'starter' }),
      ),
    ).toBe('no error');
    expect(t.request()).toMatchObject({
      targetPlanId: 'starter',
      status: 'pending',
    });
    expect(t.row().scheduledPlanId ?? null).toBeNull();
  });

  it('Basic moves the org straight away — no request, no approval', async () => {
    const t = setup(grace());
    await t.changes.scheduleDowngrade('org-1', 'u-1', { planId: 'basic' });
    expect(t.row()).toMatchObject({
      planId: 'basic',
      status: 'active',
      renewsAt: null,
    });
    expect(t.row().movedToBasicAt).toBeInstanceOf(Date);
    expect(t.db.packageChangeRequest.rows).toHaveLength(0);
  });

  it('online mode is unchanged: still downgrade_not_now, and Basic waits for grace to end', async () => {
    const t = setup(grace(), 'online');
    expect(
      await code(
        t.changes.scheduleDowngrade('org-1', 'u-1', { planId: 'starter' }),
      ),
    ).toBe('downgrade_not_now');
    await t.changes.cancel('org-1', 'u-1', {});
    expect(t.row()).toMatchObject({ planId: 'pro', cancelAtPeriodEnd: true });
  });
});

/* ---------------------------------------------- 2. Request renewal */

describe('manual mode: Request renewal', () => {
  it('in the renewal window it creates a request at the renewal price; approval extends from renewsAt', async () => {
    const renewsAt = new Date(Date.now() + 2 * DAY);
    const t = setup({ renewsAt });
    const res: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'pro',
      interval: 'monthly',
      purpose: 'renewal',
    });
    expect(res.status).toBe('pending_approval');
    expect(t.chk()).toMatchObject({
      kind: 'renewal',
      overdue: false,
      totalPaise: 354_000,
    });
    await t.pay(res.requestId);
    await t.requests.adminApproveRequest(res.requestId, 'admin-1');
    expect(isoDay(t.row().renewsAt)).toBe(
      isoDay(new Date(renewsAt.getTime() + 30 * DAY)),
    );
  });

  it('with a smaller plan scheduled, the renewal request is for that plan at its price', async () => {
    const t = setup({
      renewsAt: new Date(Date.now() + 2 * DAY),
      scheduledPlanId: 'starter',
      scheduledInterval: 'monthly',
    });
    await t.checkout.start('org-1', 'u-1', {
      planId: 'starter',
      interval: 'monthly',
      purpose: 'renewal',
    });
    expect(t.chk()).toMatchObject({ toPlanId: 'starter', totalPaise: 118_000 });
  });
});

/* -------------------------------------------- 3. Option A: no hold */

describe('Option A: grace ends while a request waits', () => {
  it('the org still falls back to Basic, the request stays pending; a later approval starts the term on the payment date', async () => {
    const t = setup({ status: 'past_due', renewsAt: daysAgo(3) });
    const res: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'starter',
      interval: 'monthly',
    });
    await moveToFreePlan(t.db as never, t.row(), 'grace_ended');
    expect(t.row().planId).toBe('basic');
    expect(t.request()).toMatchObject({ status: 'pending' });
    expect(t.request().movedToBasicAt).toBeInstanceOf(Date);

    const paidOn = isoDay(daysAgo(1));
    await t.pay(res.requestId, { receivedOn: paidOn });
    await t.requests.adminApproveRequest(res.requestId, 'admin-1');
    expect(t.row()).toMatchObject({
      planId: 'starter',
      status: 'active',
      movedToBasicAt: null,
    });
    expect(isoDay(t.row().renewsAt)).toBe(
      isoDay(new Date(new Date(`${paidOn}T00:00:00Z`).getTime() + 30 * DAY)),
    );
  });
});

/* --------------------------------------- 4. Mark as paid → Approve */

describe('Mark as paid, then Approve', () => {
  async function requested() {
    const t = setup({ planId: 'starter', amount: 1000 });
    const res: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'pro',
      interval: 'monthly',
    });
    return { ...t, id: res.requestId as string };
  }

  it('Approve is refused until the request is marked paid', async () => {
    const t = await requested();
    expect(await code(t.requests.adminApproveRequest(t.id, 'admin-1'))).toBe(
      'payment_required',
    );
    expect(t.row().planId).toBe('starter');
  });

  it('checks the form: reference (except cash), no future date; can be edited and cleared', async () => {
    const t = await requested();
    expect(await code(t.pay(t.id, { reference: '' }))).toBe(
      'reference_required',
    );
    expect(await code(t.pay(t.id, { reference: '', method: 'Cash' }))).toBe(
      'no error',
    );
    const tomorrow = isoDay(new Date(Date.now() + 2 * DAY));
    expect(await code(t.pay(t.id, { receivedOn: tomorrow }))).toBe(
      'date_in_future',
    );
    // The amount sent is ignored: always the request total.
    await t.pay(t.id, { amount: 500, reference: 'UTR 9' });
    expect(t.db.offlinePayment.rows).toHaveLength(1);
    expect(t.db.offlinePayment.rows[0]).toMatchObject({
      amountPaise: t.chk().totalPaise,
      reference: 'UTR 9',
      status: 'awaiting_approval',
    });
    await t.requests.clearPayment(t.id, 'admin-1');
    expect(t.db.offlinePayment.rows).toHaveLength(0);
  });

  it('approval applies, invoices from the quote and emails exactly once; a second approval changes nothing', async () => {
    const t = await requested();
    await t.pay(t.id);
    await t.requests.adminApproveRequest(t.id, 'admin-1');
    const renewsAt = t.row().renewsAt;
    expect(t.row().planId).toBe('pro');
    expect(t.db.invoice.rows).toHaveLength(1);
    expect(t.db.invoice.rows[0]).toMatchObject({
      checkoutId: t.chk().id,
      offlinePaymentId: t.db.offlinePayment.rows[0].id,
      totalPaise: t.chk().totalPaise,
      taxablePaise: t.chk().taxablePaise,
    });
    expect(t.db.offlinePayment.rows[0].status).toBe('received');
    expect(t.invoiced).toEqual([t.db.invoice.rows[0].id]);

    expect(
      await code(t.requests.adminApproveRequest(t.id, 'admin-1')),
    ).not.toBe('no error');
    expect(t.db.invoice.rows).toHaveLength(1);
    expect(t.row().renewsAt).toEqual(renewsAt);
    expect(t.invoiced).toHaveLength(1);
  });

  it('the amount is always the request total, so the invoice is the quoted breakdown', async () => {
    const t = await requested();
    await t.pay(t.id, { amount: 1180 });
    await t.requests.adminApproveRequest(t.id, 'admin-1');
    expect(t.db.invoice.rows[0]).toMatchObject({
      totalPaise: t.chk().totalPaise,
      taxablePaise: t.chk().taxablePaise,
    });
  });

  it('reject after Mark as paid: the payment is kept as refund due, and no invoice', async () => {
    const t = await requested();
    await t.pay(t.id);
    await t.requests.adminRejectRequest(t.id, 'admin-1', {
      rejectionReason: 'Plan not available for this account',
    });
    expect(t.db.offlinePayment.rows[0].status).toBe('refund_due');
    expect(t.db.invoice.rows).toHaveLength(0);
    expect(t.row().planId).toBe('starter');
  });

  it('the org can withdraw until it is marked paid', async () => {
    const t = await requested();
    await t.pay(t.id);
    expect(await code(t.requests.cancelOrgRequest('org-1', t.id, 'u-1'))).toBe(
      'request_paid',
    );
    await t.requests.clearPayment(t.id, 'admin-1');
    expect(await code(t.requests.cancelOrgRequest('org-1', t.id, 'u-1'))).toBe(
      'no error',
    );
  });
});

/* ------------------------ 5. org-level Mark paid offline while waiting */

describe('Subscriptions → Mark paid offline', () => {
  it('online mode: is blocked while the org has a pending request', async () => {
    const t = setup({ planId: 'starter', amount: 1000 }, 'online');
    t.db.packageChangeRequest.rows.push({
      id: 'pcr-old',
      orgId: 'org-1',
      status: 'pending',
      targetPlanId: 'pro',
      billingCycle: 'monthly',
    });
    const err = await t.admin
      .markPaidOffline('org-1', 'admin-1', {
        amount: 1180,
        method: 'UPI',
        reference: 'UTR',
        receivedOn: today(),
      })
      .catch((e: any) => e.response);
    expect(err).toMatchObject({ code: 'request_pending' });
    expect(err.message).toMatch(/Use Mark as paid on the pending request/);
    expect(t.db.offlinePayment.rows).toHaveLength(0);
  });
});

/* -------------------------- 6. a coupon on the request (Mark as paid) */

describe('Mark as paid dialog: a coupon on the request', () => {
  async function renewal() {
    const t = setup({ renewsAt: new Date(Date.now() + 2 * DAY) });
    const res: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'pro',
      interval: 'monthly',
      purpose: 'renewal',
    });
    return { ...t, id: res.requestId as string };
  }
  const err = (p: Promise<unknown>) => p.catch((e: any) => e.response);

  it('re-quotes the request (coupon before GST): its total, the org Requests tab and the invoice use it; Remove restores', async () => {
    const t = await renewal();
    t.coupon({ code: 'SAVE20' });
    const res = await t.requests.applyCoupon(t.id, 'admin-1', ' save20 ');
    expect(res.quote).toEqual({
      price: 3000,
      couponCode: 'SAVE20',
      couponDiscount: 600,
      gst: 432,
      total: 2832,
      couponAdded: true,
    });
    expect(t.chk()).toMatchObject({
      couponId: 'cp_SAVE20',
      couponDiscountPaise: 60_000,
      taxablePaise: 240_000,
      cgstPaise: 21_600,
      sgstPaise: 21_600,
      totalPaise: 283_200,
    });
    const org = await t.ledger.listRequests('org-1');
    expect(org.data[0]).toMatchObject({
      total: 2832,
      quote: { price: 3000, couponCode: 'SAVE20', couponDiscount: 600 },
    });

    await t.requests.removeCoupon(t.id, 'admin-1');
    expect(t.chk()).toMatchObject({
      couponId: null,
      couponDiscountPaise: 0,
      taxablePaise: 300_000,
      totalPaise: 354_000,
      quoteBeforeCoupon: null,
    });
    expect((await t.ledger.listRequests('org-1')).data[0].quote).toMatchObject({
      couponCode: null,
      total: 3540,
    });

    await t.requests.applyCoupon(t.id, 'admin-1', 'SAVE20');
    await t.pay(t.id);
    expect(t.db.offlinePayment.rows[0].amountPaise).toBe(283_200);
    await t.requests.adminApproveRequest(t.id, 'admin-1');
    expect(t.db.invoice.rows[0]).toMatchObject({
      totalPaise: 283_200,
      taxablePaise: 240_000,
    });
    expect(t.db.couponRedemption.rows).toHaveLength(1);
  });

  it("an invalid coupon is refused with the checkout's wording", async () => {
    const t = setup({ planId: 'starter', amount: 1000 });
    const started: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'pro',
      interval: 'monthly',
    });
    t.coupon({ code: 'STARTERONLY', planIds: ['starter'] });
    expect(
      await err(t.requests.applyCoupon(started.requestId, 'admin-1', 'NOPE')),
    ).toMatchObject({
      code: 'coupon_invalid',
      message: "There's no coupon called NOPE. Check the spelling.",
    });
    const preview = await t.checkout.preview('org-1', {
      planId: 'pro',
      interval: 'monthly',
      couponCode: 'STARTERONLY',
    });
    expect(preview.couponError).toBeTruthy();
    expect(
      await err(
        t.requests.applyCoupon(started.requestId, 'admin-1', 'STARTERONLY'),
      ),
    ).toMatchObject({ code: 'coupon_invalid', message: preview.couponError });
    expect(t.chk().couponId).toBeNull();
  });

  it('changing it after Mark as paid clears the payment; only while pending', async () => {
    const t = await renewal();
    t.coupon({ code: 'SAVE20' });
    await t.pay(t.id);
    const res = await t.requests.applyCoupon(t.id, 'admin-1', 'SAVE20');
    expect(res.paymentCleared).toBe(true);
    expect(t.db.offlinePayment.rows).toHaveLength(0);
    await t.pay(t.id);
    await t.requests.adminApproveRequest(t.id, 'admin-1');
    expect(await code(t.requests.removeCoupon(t.id, 'admin-1'))).toBe(
      'request_not_pending',
    );
  });

  it('a 100% coupon: ₹0, nothing to mark paid, approve directly, no invoice', async () => {
    const t = await renewal();
    t.coupon({ code: 'FREE', percentOff: 100 });
    const res = await t.requests.applyCoupon(t.id, 'admin-1', 'FREE');
    expect(res.quote.total).toBe(0);
    expect(await code(t.pay(t.id))).toBe('nothing_to_pay');
    await t.requests.adminApproveRequest(t.id, 'admin-1');
    expect(t.request().status).toBe('approved');
    expect(t.db.invoice.rows).toHaveLength(0);
    expect(t.db.couponRedemption.rows).toHaveLength(1);
  });

  it('first_n attaches to the subscription on approval (on a renewal request too)', async () => {
    const t = await renewal();
    t.coupon({ code: 'THREE', duration: 'first_n', durationCount: 3 });
    await t.requests.applyCoupon(t.id, 'admin-1', 'THREE');
    await t.pay(t.id);
    await t.requests.adminApproveRequest(t.id, 'admin-1');
    expect(t.row()).toMatchObject({
      couponId: 'cp_THREE',
      couponRenewalsLeft: 2,
    });
    expect(t.db.couponRedemption.rows[0]).toMatchObject({
      couponId: 'cp_THREE',
      discountPaise: 60_000,
    });
  });

  it('forever attaches on a change request', async () => {
    const t = setup({ planId: 'starter', amount: 1000 });
    const started: any = await t.checkout.start('org-1', 'u-1', {
      planId: 'pro',
      interval: 'monthly',
    });
    t.coupon({ code: 'ALWAYS', duration: 'forever' });
    await t.requests.applyCoupon(started.requestId, 'admin-1', 'ALWAYS');
    await t.pay(started.requestId);
    await t.requests.adminApproveRequest(started.requestId, 'admin-1');
    expect(t.row()).toMatchObject({
      planId: 'pro',
      couponId: 'cp_ALWAYS',
      couponRenewalsLeft: null,
    });
  });
});

/* ------------- 7. org-level offline payment / coupon in manual mode */

describe('Subscriptions → org actions by payment mode', () => {
  it('manual mode refuses Mark paid offline and Apply coupon (use the request)', async () => {
    const t = setup({});
    t.coupon({ code: 'SAVE20' });
    const offline = await t.admin
      .markPaidOffline('org-1', 'admin-1', {
        amount: 3540,
        method: 'UPI',
        reference: 'UTR',
        receivedOn: today(),
      })
      .catch((e: any) => e.response);
    expect(offline).toMatchObject({ code: 'use_request' });
    expect(offline.message).toMatch(/Use the pending request instead/);
    const coupon = await t.admin
      .applyCoupon('org-1', 'admin-1', 'SAVE20')
      .catch((e: any) => e.response);
    expect(coupon).toMatchObject({ code: 'use_request' });
    expect(coupon.message).toMatch(/Use the pending request instead/);
    expect(t.row().couponId).toBeNull();
    expect(t.db.offlinePayment.rows).toHaveLength(0);
  });

  it('online mode is unchanged: Apply coupon attaches it', async () => {
    const t = setup({}, 'online');
    t.coupon({ code: 'SAVE20' });
    expect(
      await code(t.admin.applyCoupon('org-1', 'admin-1', 'SAVE20')),
    ).not.toBe('use_request');
    expect(t.row().couponId).toBe('cp_SAVE20');
  });
});
