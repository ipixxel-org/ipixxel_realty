/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { PaymentEventsService } from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { BillingRetentionService } from './billing-retention.service';
import { OrgBillingV2Service } from './org-billing-v2.service';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

/**
 * While a change to Basic or a smaller plan is scheduled, every other plan
 * change is refused with `change_scheduled` (like `request_pending` while an
 * approval request waits), until it's undone ("Keep <plan>") or takes
 * effect. Renewals and "choose what stays" still work.
 */
const DAY = 86_400_000;
const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  isSystem: true,
};
const STARTER = {
  id: 'starter',
  name: 'Starter',
  priceMonthly: 1000,
  priceYearly: 10000,
};
const GROWTH = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 2000,
  priceYearly: 20000,
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
const longDay = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function setup(mode: 'manual' | 'online', sub: Record<string, unknown> = {}) {
  const renewsAt = new Date(Date.now() + 10 * DAY);
  const { db } = createFakeBillingDb({
    plans: [BASIC, STARTER, GROWTH, PRO],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'growth',
      billingCycle: 'monthly',
      status: 'active',
      amount: 2000,
      renewsAt,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      cancelReason: null,
      scheduledPlanId: null,
      scheduledInterval: null,
      changeScheduledAt: null,
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
  const createOrder = jest.fn(async () => ({
    id: 'pay-1',
    razorpayOrderId: 'order_1',
    keyId: 'rzp_test',
    amountPaise: 0,
    currency: 'INR',
  }));
  const checkout = new BillingCheckoutService(
    db as never,
    modeService as never,
    { getSellerSettings: async () => SELLER } as never,
    { createOrder } as never,
    new PaymentEventsService(),
    requests,
  );
  const overview = new OrgBillingV2Service(db as never, modeService as never);
  const changes = new BillingPlanChangeService(
    db as never,
    overview,
    modeService as never,
    checkout,
  );
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'no error',
      (e: any) => e?.response?.code ?? String(e),
    );
  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: any) => e?.response as { code: string; message: string },
    );
  return {
    db,
    requests,
    checkout,
    changes,
    overview,
    code,
    refusal,
    renewsAt,
    retention: new BillingRetentionService(db as never),
  };
}

describe.each(['online', 'manual'] as const)(
  'a scheduled change blocks other plan changes (%s mode)',
  (mode) => {
    it('Basic scheduled: the overview flag, and checkout / request / another downgrade are refused with change_scheduled', async () => {
      const t = setup(mode);
      await t.changes.cancel('org-1', 'u1', {});
      const message = `You've scheduled a change to Basic on ${longDay(t.renewsAt)}. Click 'Keep Growth' to undo it before choosing another plan.`;

      const o = await t.overview.getOverview('org-1');
      expect(o).toMatchObject({
        planChangeBlockedReason: 'change_scheduled',
        planChangeBlockedMessage: message,
      });

      // An upgrade (online: Razorpay order; manual: a change request).
      expect(
        await t.refusal(
          t.checkout.start('org-1', 'u1', {
            planId: 'pro',
            interval: 'monthly',
          }),
        ),
      ).toMatchObject({ code: 'change_scheduled', message });
      // Yearly billing of the same plan is a plan change too.
      expect(
        await t.code(
          t.checkout.start('org-1', 'u1', {
            planId: 'growth',
            interval: 'yearly',
          }),
        ),
      ).toBe('change_scheduled');
      // The legacy request endpoint.
      expect(
        await t.refusal(
          t.requests.submitOrgRequest('org-1', 'u1', {
            targetPlanId: 'pro',
            billingCycle: 'monthly',
          }),
        ),
      ).toMatchObject({ code: 'change_scheduled', message });
      // Another scheduled change, or Basic again.
      expect(
        await t.code(
          t.changes.scheduleDowngrade('org-1', 'u1', { planId: 'starter' }),
        ),
      ).toBe('change_scheduled');
      expect(await t.code(t.changes.cancel('org-1', 'u1', {}))).toBe(
        'change_scheduled',
      );
      // Nothing was created: one scheduled row, no checkout, no request.
      expect(t.db.billingCheckout.rows).toHaveLength(0);
      expect(
        t.db.packageChangeRequest.rows.map((r: any) => [r.kind, r.status]),
      ).toEqual([['scheduled_change', 'scheduled']]);
    });

    it('a smaller plan scheduled: the message names it; Keep Growth unblocks everything', async () => {
      const t = setup(mode);
      await t.changes.scheduleDowngrade('org-1', 'u1', { planId: 'starter' });
      const o = await t.overview.getOverview('org-1');
      expect(o.planChangeBlockedReason).toBe('change_scheduled');
      expect(o.planChangeBlockedMessage).toBe(
        `You've scheduled a change to Starter on ${longDay(t.renewsAt)}. Click 'Keep Growth' to undo it before choosing another plan.`,
      );
      expect(
        await t.code(
          t.checkout.start('org-1', 'u1', {
            planId: 'pro',
            interval: 'monthly',
          }),
        ),
      ).toBe('change_scheduled');

      await t.changes.undoDowngrade('org-1', 'u1');
      expect(await t.overview.getOverview('org-1')).toMatchObject({
        planChangeBlockedReason: null,
        planChangeBlockedMessage: null,
      });
      expect(
        await t.code(
          t.checkout.start('org-1', 'u1', {
            planId: 'pro',
            interval: 'monthly',
          }),
        ),
      ).toBe('no error');
    });

    it('Keep Growth after Basic was scheduled: another downgrade can be scheduled', async () => {
      const t = setup(mode);
      await t.changes.cancel('org-1', 'u1', {});
      await t.changes.undoCancel('org-1', 'u1');
      expect(
        await t.code(
          t.changes.scheduleDowngrade('org-1', 'u1', { planId: 'starter' }),
        ),
      ).toBe('no error');
      expect(t.db.subscription.rows[0].scheduledPlanId).toBe('starter');
    });

    it('the renewal is still possible, at the scheduled plan’s price', async () => {
      const t = setup(mode, { renewsAt: new Date(Date.now() + 2 * DAY) });
      await t.changes.scheduleDowngrade('org-1', 'u1', { planId: 'starter' });
      expect(
        await t.code(
          t.checkout.start('org-1', 'u1', {
            planId: 'growth',
            interval: 'monthly',
            purpose: 'renewal',
          }),
        ),
      ).toBe('no error');
      // Starter's ₹1,000 + 18% GST.
      expect(t.db.billingCheckout.rows[0]).toMatchObject({
        kind: 'renewal',
        toPlanId: 'starter',
        totalPaise: 118_000,
      });
    });

    it('"choose what stays" for the scheduled plan is still editable', async () => {
      const t = setup(mode);
      await t.changes.scheduleDowngrade('org-1', 'u1', { planId: 'starter' });
      const choices = await t.retention.getChoices('org-1');
      expect(choices.targetPlan.id).toBe('starter');
      await expect(
        t.retention.saveChoices('org-1', 'u1', {
          targetPlanId: 'starter',
          // The owner always stays.
          userIds: choices.users.filter((u) => u.locked).map((u) => u.id),
          projectIds: [],
          landingPageIds: [],
        }),
      ).resolves.toMatchObject({ targetPlan: { id: 'starter' } });
    });
  },
);

describe('request_pending is unchanged', () => {
  it('a pending request: the overview says request_pending; checkout and scheduling refuse with it', async () => {
    const t = setup('manual');
    await t.checkout.start('org-1', 'u1', {
      planId: 'pro',
      interval: 'monthly',
    });
    const o = await t.overview.getOverview('org-1');
    expect(o.planChangeBlockedReason).toBe('request_pending');
    expect(o.planChangeBlockedMessage).toMatch(
      /^You already have a pending request \(Growth → Pro, sent .+\)\. Wait for approval or withdraw it\.$/,
    );
    expect(
      await t.code(
        t.checkout.start('org-1', 'u1', {
          planId: 'pro',
          interval: 'yearly',
        }),
      ),
    ).toBe('request_pending');
    expect(
      await t.code(
        t.changes.scheduleDowngrade('org-1', 'u1', { planId: 'starter' }),
      ),
    ).toBe('request_pending');
  });
});
