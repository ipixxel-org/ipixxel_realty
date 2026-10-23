/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { PaymentEventsService } from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingLedgerService } from './billing-ledger.service';
import { BillingRetentionService } from './billing-retention.service';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

/**
 * Manual mode (online payments off): a request to a plan with fewer users /
 * projects / pages than the org has can be sent once the org has chosen what
 * stays; approval pauses the rest with those choices. Plus the org's requests
 * list and withdrawing a request.
 */

const DAY = 86_400_000;

/** Mark as paid (the request's total) — approval needs it first. */
async function markPaid(
  requests: PackageChangeRequestsService,
  db: any,
  requestId: string,
) {
  const c = db.billingCheckout.rows.find(
    (x: any) => x.packageChangeRequestId === requestId,
  );
  await requests.markPaid(requestId, 'admin-1', {
    amount: c.totalPaise / 100,
    method: 'UPI',
    reference: 'UTR123',
    receivedOn: new Date().toISOString().slice(0, 10),
  });
}
const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  limits: { users: 10, projects: 10, landingPages: 10 },
};
const STARTER = {
  id: 'starter',
  name: 'Starter',
  priceMonthly: 1000,
  priceYearly: 10000,
  limits: { users: 2, projects: 10, landingPages: 10 },
};

function setup(mode: 'manual' | 'online' = 'manual') {
  const user = (id: string, createdAt: number) => ({
    id,
    orgId: 'org-1',
    status: 'active',
    firstName: id,
    lastName: null,
    email: `${id}@acme.test`,
    billingPausedAt: null,
    createdAt: new Date(createdAt),
    userRoles: [{ role: { key: 'sales', name: 'Sales' } }],
  });
  const { db, usage } = createFakeBillingDb({
    plans: [BASIC, STARTER],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'basic',
      billingCycle: 'monthly',
      status: 'active',
      amount: 0,
      renewsAt: null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      movedToBasicAt: null,
    },
    // The fake adds u-admin first: the owner (earliest user), who always stays.
    users: [user('u-2', 2), user('u-3', 3)],
    usage: { users: 3 },
  });
  giveBillingDetails(db);
  db.lead = { groupBy: async () => [] };
  const submitOrgRequest = jest.fn(
    async (
      orgId: string,
      userId: string,
      dto: { targetPlanId: string; billingCycle: string },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read back via mock.calls
      _opts?: { usage?: string },
    ) => {
      const request = await db.packageChangeRequest.create({
        data: {
          orgId,
          requestedById: userId,
          currentPlanId: 'basic',
          targetPlanId: dto.targetPlanId,
          billingCycle: dto.billingCycle,
          status: 'pending',
          createdAt: new Date(),
        },
      });
      return { success: true, request };
    },
  );
  const service = new BillingCheckoutService(
    db as never,
    {
      getMode: async () =>
        mode === 'manual'
          ? { mode: 'manual', reason: 'switched_off' }
          : { mode: 'online', reason: null },
    } as never,
    {
      getSellerSettings: async () => ({
        legalName: 'iPixxel',
        gstin: null,
        state: '29',
        addressLine1: null,
        addressLine2: null,
        city: null,
        pincode: null,
      }),
    } as never,
    { createOrder: jest.fn() } as never,
    new PaymentEventsService(),
    { submitOrgRequest } as never,
  );
  const retention = new BillingRetentionService(db as never);
  const requests = new PackageChangeRequestsService(db as never);
  const paused = () =>
    db.user.rows.filter((u: any) => u.billingPausedAt).map((u: any) => u.id);
  return { db, usage, service, retention, requests, submitOrgRequest, paused };
}

const toStarter = { planId: 'starter', interval: 'monthly' } as const;

describe("manual mode: a request over the target plan's limits", () => {
  it('shows the conflict (not an error) and refuses to send until the choices fit', async () => {
    const { service } = setup();
    const preview = await service.preview('org-1', toStarter);
    expect(preview.usageError).toBeNull();
    expect(preview.usageConflict).toEqual({
      items: [{ key: 'users', limit: 2, used: 3 }],
      choicesFit: false,
    });
    await expect(
      service.start('org-1', 'u-1', toStarter),
    ).rejects.toMatchObject({
      response: {
        code: 'choose_what_stays',
        message:
          'Starter allows 2 users; you have 3. Choose which 2 stay active when this change is approved.',
      },
    });
  });

  it('no conflict → nothing extra', async () => {
    const { service, usage } = setup();
    usage.users = 2;
    const preview = await service.preview('org-1', toStarter);
    expect(preview.usageConflict).toBeNull();
    expect(preview.usageError).toBeNull();
  });

  it('online mode is unchanged: being over the limits is still an error', async () => {
    const { service } = setup('online');
    const preview = await service.preview('org-1', toStarter);
    expect(preview.usageConflict).toBeNull();
    expect(preview.usageError).toMatch(
      /allows 2 user\(s\), but your organisation has 3/,
    );
  });

  it('after choosing what stays the request is sent, and approval applies those choices', async () => {
    const { service, retention, requests, submitOrgRequest, db, paused } =
      setup();
    await retention.saveChoices('org-1', 'u-1', {
      targetPlanId: 'starter',
      userIds: ['u-admin', 'u-3'],
      projectIds: [],
      landingPageIds: [],
    });
    expect(
      (await service.preview('org-1', toStarter)).usageConflict,
    ).toMatchObject({
      choicesFit: true,
    });
    const res = await service.start('org-1', 'u-1', toStarter);
    expect(res).toMatchObject({ status: 'pending_approval' });
    expect(submitOrgRequest.mock.calls[0][3]).toEqual({
      usage: 'after_retention',
      renewal: false,
    });
    expect(paused()).toEqual([]); // nothing changes until it's approved

    await markPaid(requests, db, (res as { requestId: string }).requestId);
    await requests.adminApproveRequest(
      (res as { requestId: string }).requestId,
      'admin-1',
    );
    expect(db.subscription.rows[0].planId).toBe('starter');
    expect(paused()).toEqual(['u-2']); // u-3 was chosen to stay
  });

  it('approval without saved choices uses the default picks (like a scheduled downgrade)', async () => {
    const { service, retention, requests, db, paused } = setup();
    await retention.saveChoices('org-1', 'u-1', {
      targetPlanId: 'starter',
      userIds: ['u-admin', 'u-3'],
      projectIds: [],
      landingPageIds: [],
    });
    const res = await service.start('org-1', 'u-1', toStarter);
    db.retentionChoice.rows.length = 0; // choices cleared before approval
    await markPaid(requests, db, (res as { requestId: string }).requestId);
    await requests.adminApproveRequest(
      (res as { requestId: string }).requestId,
      'admin-1',
    );
    expect(paused()).toHaveLength(1);
    expect(paused()).not.toContain('u-admin'); // the owner always stays
  });
});

describe('the request keeps what they chose to keep', () => {
  it('a copy is saved when sent, follows a change while pending, and records what was kept on approval', async () => {
    const { service, retention, requests, db } = setup();
    await retention.saveChoices('org-1', 'u-admin', {
      targetPlanId: 'starter',
      userIds: ['u-admin', 'u-3'],
      projectIds: [],
      landingPageIds: [],
    });
    const res = (await service.start('org-1', 'u-admin', toStarter)) as {
      requestId: string;
    };
    const request = () => db.packageChangeRequest.rows[0];
    expect(request().whatStays).toMatchObject({
      planId: 'starter',
      choice: 'saved',
      applied: false,
      users: {
        limit: 2,
        total: 3,
        kept: [{ id: 'u-admin' }, { id: 'u-3' }],
        paused: [{ id: 'u-2' }],
      },
    });
    expect(request().whatStays.projects).toBeUndefined(); // not over on projects

    // They change their mind while it's pending: the copy follows.
    await retention.saveChoices('org-1', 'u-admin', {
      targetPlanId: 'starter',
      userIds: ['u-admin', 'u-2'],
      projectIds: [],
      landingPageIds: [],
    });
    expect(request().whatStays.users.paused).toEqual([
      expect.objectContaining({ id: 'u-3' }),
    ]);

    await markPaid(requests, db, res.requestId);
    await requests.adminApproveRequest(res.requestId, 'admin-1');
    expect(request().whatStays).toMatchObject({
      applied: true,
      users: { paused: [{ id: 'u-3' }] },
    });
    expect(
      db.user.rows.find((u: any) => u.id === 'u-3').billingPausedAt,
    ).toBeTruthy();
  });
});

describe('withdrawing a request', () => {
  it('cancels the request and its checkout; Super Admin sees it under All, not Pending', async () => {
    const { service, retention, requests, db } = setup();
    await retention.saveChoices('org-1', 'u-1', {
      targetPlanId: 'starter',
      userIds: ['u-admin', 'u-3'],
      projectIds: [],
      landingPageIds: [],
    });
    const res = (await service.start('org-1', 'u-1', toStarter)) as {
      requestId: string;
    };
    await requests.cancelOrgRequest('org-1', res.requestId, 'u-1');
    expect(db.packageChangeRequest.rows[0].status).toBe('cancelled');
    expect(db.billingCheckout.rows[0].status).toBe('cancelled');
    const pending = await db.packageChangeRequest.findMany({
      where: { status: 'pending' },
    });
    expect(pending).toHaveLength(0);
    // …and a new request can be sent again.
    await expect(
      service.start('org-1', 'u-1', toStarter),
    ).resolves.toMatchObject({
      status: 'pending_approval',
    });
  });
});

describe("the org's requests list", () => {
  it('newest first, every status (cancelled shows as Withdrawn), with the amount and rejection reason', async () => {
    const plan = (id: string, name: string, price: number) => ({
      id,
      name,
      priceMonthly: price,
      priceYearly: price * 10,
    });
    const at = (days: number) => new Date(Date.UTC(2026, 9, 1) + days * DAY);
    const base = {
      orgId: 'org-1',
      billingCycle: 'monthly',
      requestedBy: { firstName: 'Vidya', lastName: 'C', email: 'v@x' },
      currentPlan: { id: 'basic', name: 'Basic' },
      targetPlan: plan('pro', 'Pro', 2000),
      reviewedAt: null,
      rejectionReason: null,
      billingCheckout: null,
    };
    const rows = [
      {
        ...base,
        id: 'r4',
        status: 'pending',
        createdAt: at(4),
        updatedAt: at(4),
        billingCheckout: { kind: 'upgrade_same_interval', taxablePaise: 50000 },
      },
      {
        ...base,
        id: 'r3',
        status: 'cancelled',
        createdAt: at(3),
        updatedAt: at(3.5),
      },
      {
        ...base,
        id: 'r2',
        status: 'rejected',
        createdAt: at(2),
        updatedAt: at(2),
        reviewedAt: at(2.5),
        rejectionReason: 'Pay the open invoice first.',
      },
      {
        ...base,
        id: 'r1',
        status: 'approved',
        createdAt: at(1),
        updatedAt: at(1),
        reviewedAt: at(1.2),
      },
    ];
    const findMany = jest.fn(async () => rows);
    const ledger = new BillingLedgerService({
      packageChangeRequest: { findMany },
    } as never);
    const res = await ledger.listRequests('org-1', 1, 10);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(res.total).toBe(4);
    expect(res.pageSize).toBe(10);
    expect(res.data.map((r) => r.status)).toEqual([
      'pending',
      'withdrawn',
      'rejected',
      'approved',
    ]);
    expect(res.data[0]).toMatchObject({
      requestedBy: 'Vidya C',
      fromPlan: { name: 'Basic' },
      toPlan: { name: 'Pro' },
      amount: 500,
      amountNote: 'prorated',
      decidedAt: null,
    });
    expect(res.data[1].decidedAt).toBe(at(3.5).toISOString());
    expect(res.data[2]).toMatchObject({
      rejectionReason: 'Pay the open invoice first.',
      decidedAt: at(2.5).toISOString(),
    });
    expect(res.data[3]).toMatchObject({
      amount: 2000,
      amountNote: null,
      rejectionReason: null,
    });
  });
});
