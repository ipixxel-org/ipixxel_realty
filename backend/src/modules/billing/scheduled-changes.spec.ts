/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { BillingLedgerService } from './billing-ledger.service';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

/**
 * Scheduled plan changes (to Basic, or a smaller plan) are recorded on the
 * Requests list as kind 'scheduled_change': Scheduled → Done / Undone /
 * Replaced. No approval, and never "pending".
 */
const DAY = 86_400_000;
const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  isSystem: true,
};
const GROWTH = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 999,
  priceYearly: 9990,
};
const PRO = { id: 'pro', name: 'Pro', priceMonthly: 1499, priceYearly: 14990 };

function setup(sub: Record<string, unknown> = {}) {
  const renewsAt = new Date(Date.now() + 10 * DAY);
  const { db } = createFakeBillingDb({
    plans: [BASIC, GROWTH, PRO],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'pro',
      billingCycle: 'monthly',
      status: 'active',
      amount: 1499,
      renewsAt,
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
  const ledger = new BillingLedgerService(db as never);
  const rows = () => db.packageChangeRequest.rows;
  const list = async () => (await ledger.listRequests('org-1')).data;
  return { db, service, rows, list, renewsAt };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'no error',
    (e: { response?: { code?: string } }) => e?.response?.code ?? 'unknown',
  );

describe('scheduled plan changes on the Requests list', () => {
  it('choosing Basic: a Scheduled row; Keep Pro marks it Undone', async () => {
    const { service, list, renewsAt } = setup();
    await service.cancel('org-1', 'u1', { reason: 'Too expensive' });

    let [r] = await list();
    expect(r).toMatchObject({
      kind: 'scheduled_change',
      status: 'scheduled',
      label: 'Change to Basic',
      fromPlan: { id: 'pro', name: 'Pro' },
      toPlan: { id: 'basic', name: 'Basic' },
      amount: null, // nothing to pay
      total: null,
      reason: 'Too expensive',
      startsAt: renewsAt.toISOString(),
      decidedAt: null,
    });

    await service.undoCancel('org-1', 'u1');
    [r] = await list();
    expect(r.status).toBe('undone');
    expect(r.decidedAt).not.toBeNull();
  });

  it('the sweep marks it Done when the term ends', async () => {
    const { db, service, list } = setup();
    await service.cancel('org-1', 'u1', {});
    db.subscription.rows[0].renewsAt = new Date(Date.now() - 60_000);
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(db.subscription.rows[0].planId).toBe('basic');
    const [r] = await list();
    expect(r).toMatchObject({ status: 'done' });
    expect(r.decidedAt).not.toBeNull();
  });

  it('a smaller paid plan: a row with its price; the sweep applies it (Done)', async () => {
    const { db, service, list } = setup();
    await service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' });
    expect((await list())[0]).toMatchObject({
      kind: 'scheduled_change',
      status: 'scheduled',
      label: 'Change to Growth',
      toPlan: { id: 'growth' },
      interval: 'monthly',
      amount: 999,
    });
    db.subscription.rows[0].renewsAt = new Date(Date.now() - 60_000);
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(db.subscription.rows[0].planId).toBe('growth');
    expect((await list())[0].status).toBe('done');
  });

  it('another choice is refused (change_scheduled); after Keep, a new one can be scheduled', async () => {
    const { service, rows } = setup();
    await service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' });
    expect(await code(service.cancel('org-1', 'u1', {}))).toBe(
      'change_scheduled',
    );
    expect(rows().map((r: any) => [r.targetPlanId, r.status])).toEqual([
      ['growth', 'scheduled'],
    ]);
    await service.undoDowngrade('org-1', 'u1');
    await service.cancel('org-1', 'u1', {});
    expect(rows().map((r: any) => [r.targetPlanId, r.status])).toEqual([
      ['growth', 'undone'],
      ['basic', 'scheduled'],
    ]);
  });

  it("is never pending: not in Super Admin's Pending filter, still in All", async () => {
    const { db, service } = setup();
    await service.cancel('org-1', 'u1', {});
    const admin = new PackageChangeRequestsService(db as never);
    const pending = await admin.adminListRequests({
      status: 'pending',
    } as never);
    expect(pending.total).toBe(0);
    const all = await admin.adminListRequests({});
    expect(all.data).toHaveLength(1);
    expect(all.data[0]).toMatchObject({
      kind: 'scheduled_change',
      status: 'scheduled',
    });
  });

  it("can't be approved: approval needs a pending request", async () => {
    const { db, service, rows } = setup();
    await service.cancel('org-1', 'u1', {});
    const admin = new PackageChangeRequestsService(db as never);
    await expect(
      admin.adminApproveRequest(rows()[0].id as string, 'admin-1'),
    ).rejects.toThrow();
    expect(rows()[0].status).toBe('scheduled');
  });

  it('a pending approval request still refuses scheduling a change', async () => {
    const { db, service, rows } = setup();
    db.packageChangeRequest.rows.push({
      id: 'pcr-pending',
      orgId: 'org-1',
      currentPlanId: 'pro',
      targetPlanId: 'growth',
      status: 'pending',
      createdAt: new Date(),
    });
    expect(
      await code(
        service.scheduleDowngrade('org-1', 'u1', { planId: 'growth' }),
      ),
    ).toBe('request_pending');
    expect(rows()).toHaveLength(1);
  });
});
