/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { PaymentEventsService } from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { whatStaysPlace } from '../../common/utils/what-stays-rows.util';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingLedgerService } from './billing-ledger.service';
import { BillingRetentionService } from './billing-retention.service';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

/**
 * Online step 3: every online payment is a row on the Requests list (kind
 * online_payment): awaiting_payment → approved (paid) / cancelled (failed,
 * expired, replaced) / needs_review. It counts as the org's latest row for
 * "choose what stays", and the standalone Super Admin button hides after an
 * online purchase.
 */

const DAY = 86_400_000;
const LIMITS = { projects: 10, landingPages: 10 };
const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    priceMonthly: 0,
    priceYearly: 0,
    limits: { users: 2, ...LIMITS },
  },
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 1000,
    priceYearly: 10000,
    limits: { users: 2, ...LIMITS },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 3000,
    priceYearly: 30000,
    limits: { users: 10, ...LIMITS },
  },
];
const SELLER = { legalName: 'iPixxel', gstin: null, state: '29' };

function setup(sub: Record<string, unknown> = {}, extraUsers: string[] = []) {
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
  const { db } = createFakeBillingDb({
    plans: PLANS,
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'starter',
      billingCycle: 'monthly',
      status: 'active',
      amount: 1000,
      renewsAt: new Date(Date.now() + 10 * DAY),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      movedToBasicAt: null,
      ...sub,
    },
    users: extraUsers.map((id, i) => user(id, i + 1)),
    usage: { users: extraUsers.length + 1 },
  });
  giveBillingDetails(db);
  db.user.rows.push({ ...user('admin-1', 0), orgId: 'platform' });
  let mode: 'online' | 'manual' = 'online';
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
  const requests = new PackageChangeRequestsService(db as never);
  const checkout = new BillingCheckoutService(
    db as never,
    {
      getMode: async () =>
        mode === 'online'
          ? { mode: 'online', reason: null }
          : { mode: 'manual', reason: 'switched_off' },
    } as never,
    { getSellerSettings: async () => SELLER } as never,
    { createOrder } as never,
    events,
    requests,
  );
  checkout.onModuleInit();
  const ledger = new BillingLedgerService(db as never);
  const retention = new BillingRetentionService(db as never);
  // Each new row is the newest (rows made in the same millisecond tie).
  let tick = 0;
  const bumpNewest = () => {
    const rows = db.packageChangeRequest.rows;
    rows[rows.length - 1].createdAt = new Date(Date.now() + ++tick * 1000);
  };
  const start = async (planId: string, extra: Record<string, unknown> = {}) => {
    const res: any = await checkout.start('org-1', 'u-admin', {
      planId,
      interval: 'monthly',
      ...extra,
    } as never);
    bumpNewest();
    return db.billingCheckout.rows.find((r: any) => r.id === res.checkoutId);
  };
  const pay = (c: any) => checkout.fulfil(c.id, c.totalPaise);
  const rowOf = (c: any) =>
    db.packageChangeRequest.rows.find(
      (r: any) => r.id === c.packageChangeRequestId,
    );
  const orgList = async () => (await ledger.listRequests('org-1')).data;
  const adminList = async () =>
    (await requests.adminListRequests({ orgId: 'org-1', limit: 100 }))
      .data as any[];
  return {
    db,
    events,
    checkout,
    requests,
    retention,
    start,
    pay,
    rowOf,
    orgList,
    adminList,
    setMode: (m: 'online' | 'manual') => (mode = m),
    sub: () => db.subscription.rows[0],
  };
}

describe('every online payment is a row', () => {
  it('a purchase: Waiting for payment → Paid online, with the order ID and the invoice; read-only on both sides', async () => {
    const t = setup();
    const c = await t.start('pro');
    const row = t.rowOf(c);
    expect(row).toMatchObject({
      kind: 'online_payment',
      status: 'awaiting_payment',
      currentPlanId: 'starter',
      targetPlanId: 'pro',
    });
    let [listed] = await t.orgList();
    expect(listed).toMatchObject({
      kind: 'online_payment',
      label: 'Change to Pro',
      status: 'awaiting_payment',
      decidedAt: null,
      online: { state: 'waiting', orderId: `order_${c.id}`, invoice: null },
    });

    expect(await t.pay(c)).toBe('paid');
    expect(row.status).toBe('approved');
    [listed] = await t.orgList();
    expect(listed.status).toBe('approved');
    expect(listed.online).toMatchObject({
      state: 'paid',
      orderId: `order_${c.id}`,
    });
    const invoice = t.db.invoice.rows.find((i: any) => i.checkoutId === c.id);
    expect(listed.online!.invoice).toMatchObject({
      id: invoice.id,
      number: invoice.number,
    });
    expect(listed.online!.invoice!.url).toContain(invoice.id);
    expect(listed.online).not.toHaveProperty('reviewReason');
    expect(listed.total).toBe(c.totalPaise / 100);

    const [admin] = await t.adminList();
    expect(admin).toMatchObject({
      kind: 'online_payment',
      status: 'approved',
      label: 'Change to Pro',
      online: { state: 'paid', orderId: `order_${c.id}`, reviewReason: null },
    });
  });

  it('a renewal and a grace change: "Renewal of Starter" / "Change to Pro", both overdue', async () => {
    const t = setup({
      status: 'past_due',
      renewsAt: new Date(Date.now() - 3 * DAY),
    });
    await t.start('starter', { purpose: 'renewal' });
    let [listed] = await t.orgList();
    expect(listed).toMatchObject({
      label: 'Renewal of Starter',
      overdue: true,
    });
    await t.start('pro');
    [listed] = await t.orgList();
    expect(listed).toMatchObject({ label: 'Change to Pro', overdue: true });
  });

  it('a failed payment: Payment failed', async () => {
    const t = setup();
    const c = await t.start('pro');
    await t.events.emit('payment.failed', {
      purpose: 'plan_purchase',
      referenceType: 'billing_checkout',
      referenceId: c.id,
      amount: c.totalPaise,
    } as never);
    expect(t.rowOf(c).status).toBe('cancelled');
    const [listed] = await t.orgList();
    expect(listed).toMatchObject({
      status: 'closed',
      online: { state: 'failed' },
    });
    expect(listed.decidedAt).not.toBeNull();
  });

  it('not paid in 30 minutes: Expired (not paid)', async () => {
    const t = setup();
    const c = await t.start('pro');
    c.expiresAt = new Date(Date.now() - 1000);
    const [listed] = await t.orgList();
    expect(c.status).toBe('expired');
    expect(listed).toMatchObject({
      status: 'closed',
      online: { state: 'expired' },
    });
  });

  it('a newer checkout replaces the open one', async () => {
    const t = setup();
    const first = await t.start('pro');
    await t.start('pro');
    expect(first.status).toBe('cancelled');
    expect(t.rowOf(first).status).toBe('cancelled');
    const [newest, older] = await t.orgList();
    expect(newest.online!.state).toBe('waiting');
    expect(older.online!.state).toBe('replaced');
  });

  it('paid but not applied: Needs review (with the reason for the Super Admin)', async () => {
    const t = setup();
    const c = await t.start('pro');
    expect(await t.checkout.fulfil(c.id, c.totalPaise - 100)).toBe(
      'needs_review',
    );
    expect(t.rowOf(c).status).toBe('needs_review');
    const [listed] = await t.orgList();
    expect(listed).toMatchObject({
      status: 'needs_review',
      online: { state: 'needs_review' },
    });
    const [admin] = await t.adminList();
    expect(admin.online.reviewReason).toMatch(/Amount mismatch/);
    expect(t.sub().planId).toBe('starter');
  });
});

describe('what stays on online rows (the latest-row rule)', () => {
  // On Pro in grace with 4 users; Starter allows 2.
  const overStarter = () =>
    setup(
      {
        planId: 'pro',
        amount: 3000,
        status: 'past_due',
        renewsAt: new Date(Date.now() - 3 * DAY),
      },
      ['u-2', 'u-3', 'u-4'],
    );

  it('the latest online row: Change what stays while waiting, View once paid; the org and Super Admin edit it there', async () => {
    const t = overStarter();
    const c = await t.start('starter', { whatStaysChoice: 'default' });
    let [listed] = await t.orgList();
    expect(listed.whatStays).toMatchObject({
      planId: 'starter',
      users: { limit: 2, total: 4 },
    });
    expect(listed.whatStaysAction).toBe('change');
    // The org changes it on the waiting row; the payment then uses it.
    await t.retention.saveChoices('org-1', 'u-admin', {
      targetPlanId: 'starter',
      userIds: ['u-admin', 'u-4'],
      projectIds: [],
      landingPageIds: [],
      requestId: listed.id,
    });
    expect(c.whatStaysChoice).toBe('saved');
    expect(await t.pay(c)).toBe('paid');
    [listed] = await t.orgList();
    expect(listed.whatStaysAction).toBe('view');
    expect(listed.whatStays!.applied).toBe(true);
    expect(listed.whatStays!.users!.kept.map((u: any) => u.id).sort()).toEqual([
      'u-4',
      'u-admin',
    ]);
    // Latest applied, org on its plan: Super Admin edits it there.
    const [admin] = await t.adminList();
    expect(admin.whatStaysEditable).toBe(true);
  });

  it('older rows show their history; only the latest row can be edited', async () => {
    const t = overStarter();
    const old = await t.start('starter', { whatStaysChoice: 'default' });
    await t.pay(old);
    // A newer online payment (Starter → Pro) is the latest row now.
    await t.start('pro');
    const oldRow = t.rowOf(old);
    const history = await t.retention.getChoices('org-1', undefined, oldRow.id);
    expect(history).toMatchObject({ locked: true, view: 'history' });
    await expect(
      t.retention.adminSaveChoices('org-1', 'admin-1', {
        targetPlanId: 'starter',
        userIds: ['u-admin', 'u-2'],
        projectIds: [],
        landingPageIds: [],
        requestId: oldRow.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'what_stays_not_latest' } });
    const rows = await t.adminList();
    expect(rows.find((r) => r.id === oldRow.id).whatStaysEditable).toBe(false);
  });
});

describe('the standalone Super Admin button', () => {
  it('shows while the plan was assigned directly, hides once an online purchase set it', async () => {
    const t = setup();
    expect(await whatStaysPlace(t.db as never, 'org-1')).toMatchObject({
      orgLevel: true,
    });
    const c = await t.start('pro');
    // Waiting for payment: the open row is the place.
    expect(await whatStaysPlace(t.db as never, 'org-1')).toMatchObject({
      orgLevel: false,
      latestEditable: true,
    });
    await t.pay(c);
    expect(await whatStaysPlace(t.db as never, 'org-1')).toMatchObject({
      orgLevel: false,
      latestEditable: true,
    });
    // An unpaid one that expired doesn't count: back to the org page.
    const t2 = setup();
    const c2 = await t2.start('pro');
    c2.expiresAt = new Date(Date.now() - 1000);
    await t2.orgList();
    expect(await whatStaysPlace(t2.db as never, 'org-1')).toMatchObject({
      orgLevel: true,
    });
  });
});

describe('manual mode with online rows present', () => {
  it('switching to manual still sends a request; online rows never count as pending', async () => {
    const t = setup();
    const c = await t.start('pro');
    await t.pay(c);
    // Another online order left waiting (Pro monthly → yearly).
    await t.start('pro', { interval: 'yearly' });
    t.setMode('manual');
    const res: any = await t.checkout.start('org-1', 'u-admin', {
      planId: 'pro',
      interval: 'yearly',
    });
    expect(res.status).toBe('pending_approval');
    const kinds = (await t.orgList()).map((r) => `${r.kind}:${r.status}`);
    expect(kinds).toContain('request:pending');
    expect(kinds).toContain('online_payment:approved');
    expect(
      t.db.packageChangeRequest.rows.filter((r: any) => r.status === 'pending'),
    ).toHaveLength(1);
  });
});
