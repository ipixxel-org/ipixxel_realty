/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { BadRequestException } from '@nestjs/common';
import { PaymentEventsService } from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { BillingCheckoutService } from './billing-checkout.service';
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
const PROFILE = {
  organisationId: 'org-1',
  legalName: 'Acme Pvt Ltd',
  addressLine1: '1 Road',
  addressLine2: null,
  city: 'Bengaluru',
  state: '29',
  pincode: '560001',
  country: 'IN',
  gstin: null,
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
  if (opts.profile !== false)
    db.billingProfile.rows.push({ id: 'p1', ...PROFILE });

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
  const service = new BillingCheckoutService(
    db as never,
    mode as never,
    platformConfig as never,
    payments as never,
    events,
    requests as never,
  );
  service.onModuleInit();
  return { db, usage, service, payments, requests, events };
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
  it('requires a billing profile', async () => {
    const { service } = setup({ profile: false });
    await expect(
      service.start('org-1', 'u1', { planId: 'growth', interval: 'monthly' }),
    ).rejects.toMatchObject({
      response: { code: 'billing_profile_required' },
    });
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

  it('refuses while a manual request is pending, and rejects renewals for now', async () => {
    const { service, db } = setup();
    db.packageChangeRequest.rows.push({
      id: 'pcr-old',
      orgId: 'org-1',
      status: 'pending',
      targetPlanId: 'pro',
      billingCycle: 'monthly',
    });
    await expect(
      service.start('org-1', 'u1', { planId: 'growth', interval: 'monthly' }),
    ).rejects.toMatchObject({ response: { code: 'request_pending' } });
    await expect(
      service.start('org-1', 'u1', {
        planId: 'growth',
        interval: 'monthly',
        purpose: 'renewal',
      }),
    ).rejects.toMatchObject({ response: { code: 'renewal_not_available' } });
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
  it('creates exactly one request, and returns it again instead of duplicating', async () => {
    const { service, db, requests } = setup({ mode: 'manual' });
    const first = await service.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const again = await service.start('org-1', 'u1', {
      planId: 'pro',
      interval: 'monthly',
    });
    expect(first).toMatchObject({ status: 'pending_approval', mode: 'manual' });
    expect(again).toEqual(first);
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
});
