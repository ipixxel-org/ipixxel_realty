/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { BadRequestException } from '@nestjs/common';
import { PaymentEventsService } from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingInvoiceMailer } from './billing-invoice-mailer.service';
import { findRejectedUpgrade } from './checkout-state';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

const DAY = 86_400_000;
// Some tests switch the server flag off; put it back afterwards.
const BILLING_V2 = process.env.BILLING_V2;
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
  opts: {
    mode?: 'online' | 'manual';
    sub?: Record<string, unknown> | null;
    profile?: boolean;
  } = {},
) {
  const { db, usage } = createFakeBillingDb({
    plans: [BASIC, GROWTH, PRO],
    subscription:
      opts.sub === null
        ? null
        : {
            id: 'sub-1',
            orgId: 'org-1',
            planId: 'basic',
            billingCycle: 'monthly',
            status: 'active',
            renewsAt: new Date(Date.now() + 10 * DAY),
            graceEndsAt: null,
            ...opts.sub,
          },
  });
  // Billing details are the org profile (Settings → General).
  if (opts.profile !== false) giveBillingDetails(db);

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
        return {
          paymentId: pay.id,
          orderId: pay.razorpayOrderId,
          amount: input.amountPaise,
          currency: 'INR',
          keyId: 'rzp_test_x',
          name: 'Acme',
          description: 'Payment',
          prefill: {},
        };
      },
    ),
    verifyCheckout: jest.fn(),
  };
  const requests = {
    submitOrgRequest: jest.fn(
      async (
        orgId: string,
        userId: string,
        dto: { targetPlanId: string; billingCycle: string },
      ) => {
        const pending = await db.packageChangeRequest.findFirst({
          where: { orgId, status: 'pending' },
        });
        if (pending) throw new BadRequestException('already pending');
        const request = await db.packageChangeRequest.create({
          data: {
            orgId,
            requestedById: userId,
            currentPlanId: 'basic',
            targetPlanId: dto.targetPlanId,
            billingCycle: dto.billingCycle,
            status: 'pending',
          },
        });
        return { success: true, request };
      },
    ),
  };
  const mode = {
    getMode: async () =>
      opts.mode === 'manual'
        ? { mode: 'manual', reason: 'switched_off' }
        : { mode: 'online', reason: null },
  };
  const platformConfig = {
    getSellerSettings: async () => ({
      legalName: 'iPixxel',
      gstin: null,
      state: '29',
      addressLine1: null,
      addressLine2: null,
      city: null,
      pincode: null,
    }),
  };
  // The invoice email goes through the real mailer; only SMTP is faked.
  const email = {
    sendMail: jest.fn<Promise<{ success: boolean }>, [Record<string, any>]>(
      async () => ({ success: true }),
    ),
  };
  const mailer = new BillingInvoiceMailer(db as never, email as never);
  const service = new BillingCheckoutService(
    db as never,
    mode as never,
    platformConfig as never,
    payments as never,
    events,
    requests as never,
    mailer,
  );
  service.onModuleInit();
  return { db, usage, service, payments, requests, events, email };
}

const capturedEvent = (payment: Record<string, any>) => ({
  paymentId: payment.id,
  organisationId: 'org-1',
  amount: payment.amount,
  currency: 'INR',
  status: 'captured' as const,
  purpose: 'plan_purchase' as const,
  referenceType: 'billing_checkout',
  referenceId: payment.referenceId,
  razorpayOrderId: payment.razorpayOrderId,
  razorpayPaymentId: 'pay_X',
});

describe('startCheckout (online)', () => {
  it('is blocked until the org profile has every invoice field', async () => {
    const { service, payments } = setup({ profile: false });
    await expect(
      service.start('org-1', 'u1', { planId: 'growth', interval: 'monthly' }),
    ).rejects.toMatchObject({
      response: {
        code: 'billing_details_incomplete',
        message: 'Complete your organisation details to continue.',
      },
    });
    expect(payments.createOrder).not.toHaveBeenCalled();
  });

  it('is blocked when only one required field is missing (PIN code)', async () => {
    const { service, db } = setup();
    giveBillingDetails(db, { postalCode: '  ' });
    await expect(
      service.start('org-1', 'u1', { planId: 'growth', interval: 'monthly' }),
    ).rejects.toMatchObject({
      response: { code: 'billing_details_incomplete' },
    });
  });

  it('takes the buyer from the org profile (state decides the GST split)', async () => {
    const { service, db } = setup();
    giveBillingDetails(db, { state: '27' });
    const p = await service.preview('org-1', {
      planId: 'growth',
      interval: 'monthly',
    });
    expect(p.billingState).toBe('27');
    expect(p.gst.kind).toBe('inter');
  });

  it('over the plan\'s limits: no payment until "choose what stays" is picked (online step 2)', async () => {
    const { service, db, usage, payments } = setup();
    usage.users = 9; // Growth allows 5
    const preview = await service.preview('org-1', {
      planId: 'growth',
      interval: 'monthly',
    });
    expect(preview.usageError).toBeNull();
    expect(preview.usageConflict).toMatchObject({
      items: [{ key: 'users', limit: 5, used: 9 }],
    });
    await expect(
      service.start('org-1', 'u1', { planId: 'growth', interval: 'monthly' }),
    ).rejects.toMatchObject({ response: { code: 'choose_what_stays' } });
    expect(payments.createOrder).not.toHaveBeenCalled();
    expect(db.billingCheckout.rows).toHaveLength(0);
    // Within the limits it goes ahead.
    usage.users = 3;
    const fits = await service.preview('org-1', {
      planId: 'growth',
      interval: 'monthly',
    });
    expect(fits.usageError).toBeNull();
  });

  it('records the quote and creates a Razorpay order for the recomputed total', async () => {
    const { service, db, payments } = setup();
    const res = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    expect(res).toMatchObject({
      status: 'payment_required',
      mode: 'online',
      amount: 2360,
      razorpay: { amountPaise: 236000, orderId: 'order_T1' },
    });
    const c = db.billingCheckout.rows[0];
    expect(c).toMatchObject({
      kind: 'new',
      totalPaise: 236000,
      cgstPaise: 18000,
      sgstPaise: 18000,
      mode: 'online',
      status: 'pending',
      fromPlanId: 'basic',
    });
    expect(c.paymentId).toBe(db.payment.rows[0].id);
    expect(payments.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaise: 236000,
        purpose: 'plan_purchase',
        referenceType: 'billing_checkout',
        referenceId: c.id,
      }),
    );
  });

  it('keeps only one open checkout per org', async () => {
    const { service, db } = setup();
    await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    await service.start('org-1', 'u1', { planId: 'pro', interval: 'monthly' });
    expect(db.billingCheckout.rows.map((c: any) => c.status)).toEqual([
      'cancelled',
      'pending',
    ]);
  });

  it('refuses while a manual request is pending', async () => {
    const { service, db } = setup();
    db.packageChangeRequest.rows.push({
      id: 'pcr-old',
      orgId: 'org-1',
      status: 'pending',
      targetPlanId: 'pro',
      billingCycle: 'monthly',
      createdAt: new Date('2026-10-22T10:00:00Z'),
    });
    await expect(
      service.start('org-1', 'u1', { planId: 'growth', interval: 'monthly' }),
    ).rejects.toMatchObject({
      response: {
        code: 'request_pending',
        message:
          'You already have a pending request (Pro, sent 22 Oct). Wait for approval or withdraw it.',
      },
    });
  });
});

describe('renewal (pay each time)', () => {
  const renew = {
    planId: 'growth',
    interval: 'monthly',
    purpose: 'renewal',
  } as const;

  it('quotes the current plan at full price, with the term continuing from renewsAt', async () => {
    const renewsAt = new Date(Date.now() + 2 * DAY);
    const { service, db, payments } = setup({
      sub: { planId: 'growth', renewsAt },
    });
    const pv = await service.preview('org-1', renew);
    expect(pv).toMatchObject({
      kind: 'renewal',
      planPrice: 2000,
      taxable: 2000,
      total: 2360,
      proration: null,
    });
    expect(pv.periodEnd).toBe(
      new Date(renewsAt.getTime() + 30 * DAY).toISOString().slice(0, 10),
    );

    const res = await service.start('org-1', 'u1', renew);
    expect(res).toMatchObject({ status: 'payment_required', amount: 2360 });
    expect(payments.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaise: 236000,
        purpose: 'plan_purchase',
      }),
    );
    expect(db.billingCheckout.rows[0]).toMatchObject({
      kind: 'renewal',
      fromRenewsAt: renewsAt,
      fromPlanId: 'growth',
    });
  });

  it('is not open before the reminder window, nor for another plan or the free plan', async () => {
    const early = setup({
      sub: { planId: 'growth', renewsAt: new Date(Date.now() + 10 * DAY) },
    });
    await expect(early.service.preview('org-1', renew)).rejects.toMatchObject({
      response: { code: 'renewal_not_due' },
    });
    await expect(
      early.service.preview('org-1', { ...renew, planId: 'pro' }),
    ).rejects.toMatchObject({
      response: { code: 'renewal_plan_mismatch' },
    });
    const free = setup();
    await expect(
      free.service.preview('org-1', { ...renew, planId: 'basic' }),
    ).rejects.toMatchObject({
      response: { code: 'nothing_to_renew' },
    });
  });

  it('manual mode: a renewal is a request (Request renewal) at the renewal price', async () => {
    const { service, db } = setup({
      mode: 'manual',
      sub: {
        planId: 'growth',
        status: 'past_due',
        renewsAt: new Date(Date.now() - DAY),
      },
    });
    await expect(service.start('org-1', 'u1', renew)).resolves.toMatchObject({
      status: 'pending_approval',
    });
    expect(db.packageChangeRequest.rows).toHaveLength(1);
    expect(db.packageChangeRequest.rows[0]).toMatchObject({
      targetPlanId: 'growth',
      status: 'pending',
    });
    expect(db.billingCheckout.rows[0]).toMatchObject({
      kind: 'renewal',
      mode: 'manual',
      overdue: true,
      totalPaise: 236_000,
    });
  });

  it('a pending upgrade request does not block paying the renewal', async () => {
    const { service, db } = setup({
      sub: {
        planId: 'growth',
        status: 'past_due',
        renewsAt: new Date(Date.now() - DAY),
      },
    });
    db.packageChangeRequest.rows.push({
      id: 'pcr-1',
      orgId: 'org-1',
      status: 'pending',
      targetPlanId: 'pro',
      billingCycle: 'monthly',
    });
    await expect(service.start('org-1', 'u1', renew)).resolves.toMatchObject({
      status: 'payment_required',
    });
  });

  it('payment in grace: active again, the term continues from the old renewsAt, applied once', async () => {
    const renewsAt = new Date(Date.now() - 3 * DAY);
    const { service, db } = setup({
      sub: {
        planId: 'growth',
        status: 'past_due',
        renewsAt,
        graceEndsAt: new Date(Date.now() + 4 * DAY),
      },
    });
    await service.start('org-1', 'u1', renew);
    const c = db.billingCheckout.rows[0];
    const outcomes = await Promise.all([
      service.fulfil(c.id, c.totalPaise),
      service.fulfil(c.id, c.totalPaise),
    ]);
    expect(outcomes.sort()).toEqual(['already_done', 'paid']);
    expect(db.subscription.rows[0]).toMatchObject({
      planId: 'growth',
      status: 'active',
      graceEndsAt: null,
      renewsAt: new Date(renewsAt.getTime() + 30 * DAY),
    });
    expect(
      db.auditLog.rows.filter((a: any) => a.action === 'subscription_renewed'),
    ).toHaveLength(1);
    expect(
      db.notification.rows.some((n: any) => n.title === 'Plan Renewed'),
    ).toBe(true);
  });

  it('after expiry the new term starts on the day of payment', async () => {
    const { service, db } = setup({
      sub: {
        planId: 'growth',
        status: 'expired',
        renewsAt: new Date(Date.now() - 40 * DAY),
      },
    });
    // "expired" only happens under the old "restrict" rule (flag off).
    delete process.env.BILLING_V2; // restored in afterEach
    db.platformConfig.findUnique = async () => ({
      billingGracePeriodDays: 7,
      billingExpiryNotifyDays: 3,
      billingExpiryBehavior: 'restrict',
    });
    await service.start('org-1', 'u1', renew);
    const c = db.billingCheckout.rows[0];
    await service.fulfil(c.id, c.totalPaise);
    const end = db.subscription.rows[0].renewsAt.getTime();
    expect(Math.abs(end - (Date.now() + 30 * DAY))).toBeLessThan(60_000);
    expect(db.subscription.rows[0].status).toBe('active');
  });

  it('a second paid renewal (e.g. an old tab) goes to review instead of extending twice', async () => {
    const renewsAt = new Date(Date.now() + 2 * DAY);
    const { service, db } = setup({ sub: { planId: 'growth', renewsAt } });
    await service.start('org-1', 'u1', renew);
    await service.start('org-1', 'u1', renew);
    const [first, second] = db.billingCheckout.rows;
    expect(first.status).toBe('cancelled'); // one open checkout per org
    await expect(service.fulfil(second.id, second.totalPaise)).resolves.toBe(
      'paid',
    );
    // The cancelled one's payment still arrives:
    await expect(service.fulfil(first.id, first.totalPaise)).resolves.toBe(
      'needs_review',
    );
    expect(db.billingCheckout.rows[0].reviewReason).toMatch(/already renewed/);
    expect(db.subscription.rows[0].renewsAt).toEqual(
      new Date(renewsAt.getTime() + 30 * DAY),
    );
  });

  it('usage over the plan does not stop a renewal (it is the plan they already have)', async () => {
    const { service, db, usage } = setup({
      sub: { planId: 'growth', renewsAt: new Date(Date.now() + DAY) },
    });
    usage.users = 9; // Growth allows 5
    await service.start('org-1', 'u1', renew);
    const c = db.billingCheckout.rows[0];
    await expect(service.fulfil(c.id, c.totalPaise)).resolves.toBe('paid');
  });
});

describe('payment.captured → plan applied', () => {
  async function paidCheckout() {
    const ctx = setup();
    await ctx.service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    return {
      ...ctx,
      payment: ctx.db.payment.rows[0],
      checkout: ctx.db.billingCheckout.rows[0],
    };
  }

  it('applies the plan exactly once even when verify and the webhook both deliver', async () => {
    const { service, db, events, payment, checkout } = await paidCheckout();
    const outcomes = await Promise.all([
      service.fulfil(checkout.id, payment.amount),
      service.fulfil(checkout.id, payment.amount),
    ]);
    expect(outcomes.sort()).toEqual(['already_done', 'paid']);
    await events.emit('payment.captured', capturedEvent(payment)); // a third delivery
    expect(db.subscription.rows[0]).toMatchObject({
      planId: 'growth',
      billingCycle: 'monthly',
      status: 'active',
      amount: 2000,
    });
    expect(db.billingCheckout.rows[0]).toMatchObject({ status: 'paid' });
    expect(db.billingCheckout.rows[0].fulfilledAt).toBeInstanceOf(Date);
    expect(
      db.auditLog.rows.filter((a: any) => a.action === 'plan_purchased'),
    ).toHaveLength(1);
  });

  it('emails the GST invoice to the owner and admins exactly once, even when verify and the webhook both deliver', async () => {
    const { service, db, events, payment, checkout, email } =
      await paidCheckout();
    await Promise.all([
      service.fulfil(checkout.id, payment.amount),
      service.fulfil(checkout.id, payment.amount),
    ]);
    await events.emit('payment.captured', capturedEvent(payment)); // the webhook again
    await service.mailing;
    const invoice = db.invoice.rows[0];
    expect(email.sendMail).toHaveBeenCalledTimes(1); // one admin (the owner)
    const mail = email.sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({
      to: 'asha@acme.test',
      subject: `Payment received – Invoice ${invoice.number}`,
      template: 'billing',
      orgId: 'org-1',
      smtpOrgId: null,
      metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number },
    });
    // Plan, period and the amount breakdown; the invoice attached.
    expect(mail.html).toContain('Growth · Monthly');
    expect(mail.html).toContain('Period:');
    expect(mail.html).toContain('Package amount');
    expect(mail.html).toContain('₹2,000.00');
    expect(mail.html).toContain('₹2,360.00');
    expect(mail.attachments[0].filename).toMatch(/^Invoice-INV-.*.html$/);
    expect(mail.attachments[0].content).toContain(invoice.number);
    expect(invoice.emailedAt).toBeInstanceOf(Date);
  });

  it('sends no invoice email for a payment that went to review', async () => {
    const { service, payment, checkout, email } = await paidCheckout();
    await service.fulfil(checkout.id, payment.amount - 100);
    await service.mailing;
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it('puts the checkout in needs_review when the amount does not match', async () => {
    const { service, db, payment, checkout } = await paidCheckout();
    await expect(
      service.fulfil(checkout.id, payment.amount - 100),
    ).resolves.toBe('needs_review');
    expect(db.billingCheckout.rows[0]).toMatchObject({
      status: 'needs_review',
    });
    expect(db.billingCheckout.rows[0].reviewReason).toMatch(/Amount mismatch/);
    expect(db.subscription.rows[0].planId).toBe('basic');
    expect(
      db.notification.rows.some(
        (n: any) =>
          n.title === 'Plan payment needs review' &&
          n.recipientId === undefined,
      ),
    ).toBe(true);
  });

  it('puts the checkout in needs_review when usage is over the new plan', async () => {
    const { service, db, usage, payment, checkout } = await paidCheckout();
    usage.users = 9; // Growth allows 5
    await expect(service.fulfil(checkout.id, payment.amount)).resolves.toBe(
      'needs_review',
    );
    expect(db.billingCheckout.rows[0].reviewReason).toMatch(/allows 5 user/);
    expect(db.subscription.rows[0].planId).toBe('basic');
  });

  it('puts a late payment on a stale quote in needs_review instead of applying it', async () => {
    const { service, db, payment, checkout } = await paidCheckout();
    db.subscription.rows[0].planId = 'pro'; // plan changed after the quote
    await expect(service.fulfil(checkout.id, payment.amount)).resolves.toBe(
      'needs_review',
    );
    expect(db.billingCheckout.rows[0].reviewReason).toMatch(/plan changed/);
  });

  it('payment.failed marks the checkout failed; never throws out of the handler', async () => {
    const { events, db, payment } = await paidCheckout();
    await events.emit('payment.failed', {
      ...capturedEvent(payment),
      status: 'failed',
    });
    expect(db.billingCheckout.rows[0].status).toBe('failed');
    await expect(
      events.emit('payment.captured', {
        ...capturedEvent(payment),
        referenceId: 'missing',
      }),
    ).resolves.toBeUndefined();
  });

  it('a same-interval upgrade keeps renewsAt', async () => {
    const renewsAt = new Date(Date.now() + 18 * DAY);
    const ctx = setup({ sub: { planId: 'growth', renewsAt } });
    await ctx.service.start('org-1', 'u1', {
      planId: 'pro',
      interval: 'monthly',
    });
    const c = ctx.db.billingCheckout.rows[0];
    expect(c.kind).toBe('upgrade_same_interval');
    await ctx.service.fulfil(c.id, c.totalPaise);
    expect(ctx.db.subscription.rows[0]).toMatchObject({
      planId: 'pro',
      renewsAt,
    });
  });
});

describe('manual mode', () => {
  it('creates exactly one request: the same one again is returned, a second (different) one is refused', async () => {
    const { service, db, requests } = setup({ mode: 'manual' });
    const first = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const again = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    expect(first).toMatchObject({ status: 'pending_approval', mode: 'manual' });
    expect(again).toEqual(first);
    await expect(
      service.start('org-1', 'u1', { planId: 'pro', interval: 'monthly' }),
    ).rejects.toMatchObject({
      response: {
        code: 'request_pending',
        message: expect.stringContaining(
          'Wait for approval or withdraw it.',
        ),
      },
    });
    expect(requests.submitOrgRequest).toHaveBeenCalledTimes(1);
    expect(db.packageChangeRequest.rows).toHaveLength(1);
    expect(db.billingCheckout.rows[0]).toMatchObject({
      mode: 'manual',
      status: 'pending',
      packageChangeRequestId: db.packageChangeRequest.rows[0].id,
    });
  });

  it('Super Admin approval applies the plan and marks the checkout approved; a second approval fails', async () => {
    const { service, db } = setup({ mode: 'manual' });
    const res = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const requestId = (res as { requestId: string }).requestId;
    const pcr = new PackageChangeRequestsService(db as never);
    await pcr.markPaid(requestId, 'admin-1', {
      amount: db.billingCheckout.rows[0].totalPaise / 100,
      method: 'Bank transfer',
      reference: 'UTR1',
      receivedOn: new Date().toISOString().slice(0, 10),
    });
    await pcr.adminApproveRequest(requestId, 'admin-1');
    expect(db.subscription.rows[0]).toMatchObject({
      planId: 'growth',
      status: 'active',
    });
    expect(db.billingCheckout.rows[0]).toMatchObject({ status: 'approved' });
    expect(db.packageChangeRequest.rows[0]).toMatchObject({
      status: 'approved',
      reviewedById: 'admin-1',
    });
    await expect(pcr.adminApproveRequest(requestId, 'admin-2')).rejects.toThrow(
      /no longer pending/,
    );
  });

  it('rejecting the request marks the checkout rejected', async () => {
    const { service, db } = setup({ mode: 'manual' });
    const res = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const pcr = new PackageChangeRequestsService(db as never);
    await pcr.adminRejectRequest(
      (res as { requestId: string }).requestId,
      'admin-1',
      { rejectionReason: 'Pay by NEFT first' },
    );
    expect(db.billingCheckout.rows[0]).toMatchObject({
      status: 'rejected',
      reviewReason: 'Pay by NEFT first',
    });
    expect(db.subscription.rows[0].planId).toBe('basic');
  });

  it('reject needs a reason of 10–500 characters; nothing changes without one', async () => {
    const { service, db } = setup({ mode: 'manual' });
    const res = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const requestId = (res as { requestId: string }).requestId;
    const pcr = new PackageChangeRequestsService(db as never);
    for (const reason of [undefined, '', '   ', 'too short', 'x'.repeat(501)]) {
      await expect(
        pcr.adminRejectRequest(requestId, 'admin-1', {
          rejectionReason: reason as string,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(db.packageChangeRequest.rows[0].status).toBe('pending');
    expect(db.billingCheckout.rows[0].status).toBe('pending');
  });

  it('the reason is stored, sent in the notification and shown on the org overview', async () => {
    const { service, db } = setup({ mode: 'manual' });
    const res = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const requestId = (res as { requestId: string }).requestId;
    expect(await findRejectedUpgrade(db as never, 'org-1')).toBeNull();
    const pcr = new PackageChangeRequestsService(db as never);
    await pcr.adminRejectRequest(requestId, 'admin-1', {
      rejectionReason: '  Please pay by NEFT first  ',
    });
    expect(db.packageChangeRequest.rows[0]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Please pay by NEFT first',
      reviewedById: 'admin-1',
    });
    const notes = db.notification.rows.filter(
      (n: { type: string }) => n.type === 'package_change_rejected',
    );
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].body).toContain('Reason: Please pay by NEFT first');
    expect(await findRejectedUpgrade(db as never, 'org-1')).toMatchObject({
      requestId,
      toPlan: { id: 'growth' },
      reason: 'Please pay by NEFT first',
    });
  });
});
