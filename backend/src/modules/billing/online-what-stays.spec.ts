/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { PaymentEventsService } from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingRetentionService } from './billing-retention.service';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

/**
 * Online mode, step 2: "choose what stays" at the online checkout. Over the
 * target's limits the org picks an option before paying; the option is
 * stored on the checkout and used when the payment is fulfilled (online =
 * Approve). A payment that can't be applied as picked goes to needs_review.
 */

const DAY = 86_400_000;
const LIMITS = { projects: 10, landingPages: 10 };
const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  limits: { users: 2, ...LIMITS },
};
const STARTER = {
  id: 'starter',
  name: 'Starter',
  priceMonthly: 1000,
  priceYearly: 10000,
  limits: { users: 2, ...LIMITS },
};
const PRO = {
  id: 'pro',
  name: 'Pro',
  priceMonthly: 3000,
  priceYearly: 30000,
  limits: { users: 10, ...LIMITS },
};
const SELLER = { legalName: 'iPixxel', gstin: null, state: '29' };

/** On Pro, renewal overdue (grace), with 4 users; Starter allows 2. */
function setup(users = ['u-2', 'u-3', 'u-4']) {
  const user = (id: string, n: number) => ({
    id,
    orgId: 'org-1',
    status: 'active',
    firstName: id,
    lastName: null,
    email: `${id}@acme.test`,
    billingPausedAt: null,
    createdAt: new Date(n),
    userRoles: [{ role: { key: 'sales', name: 'Sales' } }],
  });
  const { db, usage } = createFakeBillingDb({
    plans: [BASIC, STARTER, PRO],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'pro',
      billingCycle: 'monthly',
      status: 'past_due',
      amount: 3000,
      renewsAt: new Date(Date.now() - 3 * DAY),
      graceEndsAt: new Date(Date.now() + 4 * DAY),
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      movedToBasicAt: null,
    },
    // The fake adds u-admin first: the owner, who always stays.
    users: users.map((id, i) => user(id, i + 1)),
    usage: { users: users.length + 1 },
  });
  giveBillingDetails(db);
  const createOrder = jest.fn(
    async (input: { referenceId: string; amountPaise: number }) => {
      const p = await db.payment.create({
        data: {
          organisationId: 'org-1',
          amount: input.amountPaise,
          purpose: 'plan_purchase',
          referenceType: 'billing_checkout',
          referenceId: input.referenceId,
          razorpayOrderId: `order_${input.referenceId}`,
        },
      });
      return {
        paymentId: p.id,
        orderId: p.razorpayOrderId,
        amount: input.amountPaise,
        currency: 'INR',
        keyId: 'rzp_test_x',
        name: 'Acme',
        description: 'Payment',
        prefill: {},
      };
    },
  );
  const events = new PaymentEventsService();
  const checkout = new BillingCheckoutService(
    db as never,
    { getMode: async () => ({ mode: 'online', reason: null }) } as never,
    { getSellerSettings: async () => SELLER } as never,
    { createOrder } as never,
    events,
    new PackageChangeRequestsService(db as never),
  );
  checkout.onModuleInit();
  const retention = new BillingRetentionService(db as never);
  const addUser = (id: string) => {
    db.user.rows.push(user(id, 100));
    usage.users += 1;
  };
  const paused = () =>
    db.user.rows
      .filter((u: any) => u.billingPausedAt)
      .map((u: any) => u.id)
      .sort();
  const chk = (id: string) =>
    db.billingCheckout.rows.find((r: any) => r.id === id);
  const sub = () => db.subscription.rows[0];
  /** Start the online checkout for Starter; returns the checkout row. */
  const start = async (extra: Record<string, unknown> = {}) => {
    const res: any = await checkout.start('org-1', 'u-admin', {
      planId: 'starter',
      interval: 'monthly',
      ...extra,
    } as never);
    expect(res.status).toBe('payment_required');
    return chk(res.checkoutId);
  };
  const saveChoice = (userIds: string[]) =>
    retention.saveChoices('org-1', 'u-admin', {
      targetPlanId: 'starter',
      userIds,
      projectIds: [],
      landingPageIds: [],
    });
  return {
    db,
    events,
    checkout,
    retention,
    createOrder,
    addUser,
    paused,
    sub,
    start,
    saveChoice,
  };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'no error',
    (e: any) => e?.response?.code ?? String(e?.message ?? e),
  );

describe('online checkout over the limits: pick what stays first', () => {
  it('the preview reports the conflict (not an error); paying without an option is refused before any order', async () => {
    const t = setup();
    const preview = await t.checkout.preview('org-1', {
      planId: 'starter',
      interval: 'monthly',
    });
    expect(preview.usageError).toBeNull();
    expect(preview.usageConflict).toEqual({
      items: [{ key: 'users', limit: 2, used: 4 }],
      choicesFit: false,
    });
    expect(
      await code(
        t.checkout.start('org-1', 'u-admin', {
          planId: 'starter',
          interval: 'monthly',
        }),
      ),
    ).toBe('choose_what_stays');
    // "I'll choose" with nothing saved: refused too.
    expect(
      await code(
        t.checkout.start('org-1', 'u-admin', {
          planId: 'starter',
          interval: 'monthly',
          whatStaysChoice: 'saved',
        }),
      ),
    ).toBe('choose_what_stays');
    expect(t.createOrder).not.toHaveBeenCalled();

    const c = await t.start({ whatStaysChoice: 'default' });
    expect(c.whatStaysChoice).toBe('default');
    expect(t.createOrder).toHaveBeenCalledTimes(1);
  });

  it('after saving a choice the preview says it fits', async () => {
    const t = setup();
    await t.saveChoice(['u-admin', 'u-4']);
    const preview = await t.checkout.preview('org-1', {
      planId: 'starter',
      interval: 'monthly',
    });
    expect(preview.usageConflict).toMatchObject({ choicesFit: true });
  });
});

describe('paid online = approved: the picked option is used', () => {
  it('"Keep the default picks": the default picks stay and an earlier saved choice is dropped', async () => {
    const t = setup();
    await t.saveChoice(['u-admin', 'u-4']);
    // What the org was shown as the default picks.
    const shown = await t.retention.getChoices('org-1', 'starter');
    const defaultPaused = shown.users
      .filter((u) => !u.defaultPicked)
      .map((u) => u.id)
      .sort();
    expect(defaultPaused).toHaveLength(2);
    expect(defaultPaused).not.toEqual(['u-2', 'u-3']); // not the saved choice
    const c = await t.start({ whatStaysChoice: 'default' });
    // Nothing changes until it's paid.
    expect(t.db.retentionChoice.rows).toHaveLength(1);
    expect(await t.checkout.fulfil(c.id, c.totalPaise)).toBe('paid');
    expect(t.sub()).toMatchObject({ planId: 'starter', status: 'active' });
    expect(t.db.retentionChoice.rows).toHaveLength(0);
    expect(t.paused()).toEqual(defaultPaused);
  });

  it('"I\'ll choose": exactly the saved picks stay', async () => {
    const t = setup();
    await t.saveChoice(['u-admin', 'u-4']);
    const c = await t.start({ whatStaysChoice: 'saved' });
    expect(c.whatStaysChoice).toBe('saved');
    expect(await t.checkout.fulfil(c.id, c.totalPaise)).toBe('paid');
    expect(t.sub().planId).toBe('starter');
    expect(t.paused()).toEqual(['u-2', 'u-3']);
    expect(t.db.retentionChoice.rows).toHaveLength(1);
  });

  it('nothing over the limits: no option needed, nothing paused', async () => {
    const t = setup(['u-2']);
    const c = await t.start();
    expect(c.whatStaysChoice).toBeNull();
    expect(await t.checkout.fulfil(c.id, c.totalPaise)).toBe('paid');
    expect(t.sub().planId).toBe('starter');
    expect(t.paused()).toEqual([]);
  });
});

describe('paid, but it no longer applies as picked: needs_review', () => {
  it('a user added while the payment popup was open (nothing was chosen): needs_review with the reason, Super Admin notified, plan not applied', async () => {
    const t = setup(['u-2']);
    const c = await t.start();
    t.addUser('u-new');
    expect(await t.checkout.fulfil(c.id, c.totalPaise)).toBe('needs_review');
    expect(c.status).toBe('needs_review');
    expect(c.reviewReason).toMatch(
      /over Starter's limits and didn't choose what stays.*Starter allows 2 users; you have 3/,
    );
    expect(t.sub()).toMatchObject({ planId: 'pro', status: 'past_due' });
    expect(t.paused()).toEqual([]);
    expect(t.db.notification.rows).toEqual([
      expect.objectContaining({
        title: 'Plan payment needs review',
        entityId: c.id,
      }),
    ]);
  });

  it('"I\'ll choose" whose saved choice no longer fits: needs_review, and the saved choice is kept', async () => {
    const t = setup();
    await t.saveChoice(['u-admin', 'u-4']);
    const c = await t.start({ whatStaysChoice: 'saved' });
    // The saved choice is replaced by one that's too big for Starter (as if
    // the plan's limit was lowered after it was saved).
    t.db.retentionChoice.rows[0].userIds = ['u-admin', 'u-3', 'u-4'];
    expect(await t.checkout.fulfil(c.id, c.totalPaise)).toBe('needs_review');
    expect(c.reviewReason).toMatch(
      /saved choice of what stays no longer fits Starter's limits/,
    );
    expect(t.sub().planId).toBe('pro');
    expect(t.db.retentionChoice.rows).toHaveLength(1);
  });

  it('"Keep the default picks" still applies when usage went up (the defaults pause the extra one)', async () => {
    const t = setup();
    const c = await t.start({ whatStaysChoice: 'default' });
    t.addUser('u-new');
    expect(await t.checkout.fulfil(c.id, c.totalPaise)).toBe('paid');
    expect(t.paused()).toHaveLength(3);
  });
});

describe('a closed or failed payment changes nothing', () => {
  it('the saved choice and the plan stay as they were', async () => {
    const t = setup();
    await t.saveChoice(['u-admin', 'u-4']);
    const c = await t.start({ whatStaysChoice: 'default' });
    // Closed popup: nothing is fulfilled. Failed payment:
    await t.events.emit('payment.failed', {
      purpose: 'plan_purchase',
      referenceType: 'billing_checkout',
      referenceId: c.id,
      amount: c.totalPaise,
    } as never);
    expect(t.sub()).toMatchObject({ planId: 'pro', status: 'past_due' });
    expect(t.db.retentionChoice.rows).toHaveLength(1);
    expect(t.paused()).toEqual([]);
  });
});
