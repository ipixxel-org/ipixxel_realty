/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- test-only Prisma stubs */
import { BillingPlanChangeService } from './billing-plan-change.service';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { planChangeDirection, planRanker } from './plan-modules';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

/**
 * One rank rule everywhere. Bug: with an active internal ₹0 plan ("Demo"),
 * the overview ranked Starter 2 (Demo counted) while GET /org/billing/plans
 * ranked Pro 2 (Demo left out) — so Pro showed as a downgrade from Starter.
 */
const DAY = 86_400_000;
const row = (over: Record<string, unknown>) => ({
  id: 'x',
  name: 'X',
  description: '',
  isActive: true,
  isSystem: false,
  priceMonthly: 1000,
  priceYearly: 10000,
  limits: {},
  capabilities: {},
  createdAt: new Date(0),
  ...over,
});
const BASIC = row({
  id: 'basic',
  name: 'Basic',
  isSystem: true,
  priceMonthly: 0,
  priceYearly: 0,
});
const DEMO = row({ id: 'demo', name: 'Demo', priceMonthly: 0, priceYearly: 0 });
const STARTER = row({ id: 'starter', name: 'Starter', priceMonthly: 999 });
const PRO = row({ id: 'pro', name: 'Pro', priceMonthly: 1499 });
const OLD = row({
  id: 'old',
  name: 'Old',
  priceMonthly: 1200,
  isActive: false,
});
const ALL = [PRO, DEMO, STARTER, BASIC];

describe('planRanker', () => {
  it('matches GET /org/billing/plans even with an active internal plan', async () => {
    const service = new OrgBillingV2Service(
      { plan: { findMany: async () => ALL } } as never,
      {} as never,
    );
    const listed = await service.listPlans();
    const rank = planRanker(ALL);
    for (const p of listed) {
      expect(rank(ALL.find((r) => r.id === p.id)!)).toBe(p.rank);
    }
    expect(listed.map((p) => [p.id, p.rank])).toEqual([
      ['basic', 0],
      ['starter', 1],
      ['pro', 2],
    ]);
  });

  it('a plan that is not offered sits between its neighbours', () => {
    const rank = planRanker([...ALL, OLD]);
    expect(rank(DEMO)).toBe(0.5); // after Basic, before Starter
    expect(rank(OLD)).toBe(1.5); // ₹1,200: between Starter and Pro
  });
});

describe('planChangeDirection', () => {
  it('by rank; same plan monthly → yearly up, yearly → monthly down', () => {
    const at = (rank: number, interval: 'monthly' | 'yearly') => ({
      rank,
      interval,
    });
    expect(planChangeDirection(at(1, 'monthly'), at(2, 'monthly'))).toBe(
      'upgrade',
    );
    expect(planChangeDirection(at(1, 'monthly'), at(0, 'monthly'))).toBe(
      'downgrade',
    );
    expect(planChangeDirection(at(1, 'monthly'), at(1, 'yearly'))).toBe(
      'upgrade',
    );
    expect(planChangeDirection(at(1, 'yearly'), at(1, 'monthly'))).toBe(
      'downgrade',
    );
    expect(planChangeDirection(at(1, 'yearly'), at(1, 'yearly'))).toBe('same');
  });
});

describe('scheduleDowngrade with an active internal plan', () => {
  function setup(planId: string) {
    const { db } = createFakeBillingDb({
      plans: ALL,
      subscription: {
        id: 'sub-1',
        orgId: 'org-1',
        planId,
        billingCycle: 'monthly',
        status: 'active',
        amount: 999,
        renewsAt: new Date(Date.now() + 10 * DAY),
        graceEndsAt: null,
        cancelAtPeriodEnd: false,
        cancelReason: null,
        scheduledPlanId: null,
        scheduledInterval: null,
        changeScheduledAt: null,
      },
    });
    const overview = { getOverview: jest.fn(async () => ({ ok: true })) };
    const service = new BillingPlanChangeService(
      db as never,
      overview as never,
    );
    return { service, row: () => db.subscription.rows[0] };
  }
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'no error',
      (e: { response?: { code?: string } }) => e?.response?.code ?? 'unknown',
    );

  it('Starter → Pro is an upgrade (refused here); Pro → Starter is scheduled', async () => {
    const s = setup('starter');
    expect(
      await code(s.service.scheduleDowngrade('org-1', 'u1', { planId: 'pro' })),
    ).toBe('not_a_downgrade');

    const p = setup('pro');
    await p.service.scheduleDowngrade('org-1', 'u1', { planId: 'starter' });
    expect(p.row()).toMatchObject({ scheduledPlanId: 'starter' });
  });
});
