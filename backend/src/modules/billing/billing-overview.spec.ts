import {
  buildOverview,
  deriveStatus,
  type OverviewInput,
} from './billing-overview';
import { OrgBillingV2Service } from './org-billing-v2.service';
import type { BillingPlanV2 } from './billing.types';

const DAY = 86_400_000;
const NOW = new Date('2026-10-14T10:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const plan = (over: Partial<BillingPlanV2> = {}): BillingPlanV2 => ({
  id: 'p-growth',
  name: 'Growth',
  tagline: '',
  priceMonthly: 2000,
  priceYearly: 20000,
  isFree: false,
  rank: 1,
  limits: { users: 5, projects: 5, landingPages: 5, templates: null },
  modules: {
    teamChat: true,
    metaLeadAds: true,
    metaPages: 1,
    whatsapp: false,
    aiCalling: false,
  },
  ...over,
});

const input = (over: Partial<OverviewInput> = {}): OverviewInput => ({
  now: NOW,
  orgName: 'Skyline',
  ownerName: 'Rohan',
  plan: plan(),
  subscription: {
    status: 'active',
    billingCycle: 'monthly',
    renewsAt: at(18),
    graceEndsAt: null,
  },
  counts: { users: 4, projects: 2, landingPages: 3, templates: 7 },
  notifyDays: 3,
  graceDays: 7,
  mode: { mode: 'manual', reason: 'switched_off' },
  ...over,
});

describe('deriveStatus', () => {
  it('maps subscription rows to the contract statuses', () => {
    expect(deriveStatus(input({ subscription: null }))).toBe('free');
    expect(deriveStatus(input({ plan: plan({ isFree: true }) }))).toBe('free');
    expect(deriveStatus(input())).toBe('active');
    expect(
      deriveStatus(
        input({
          subscription: {
            status: 'trial',
            billingCycle: 'monthly',
            renewsAt: at(2),
            graceEndsAt: null,
          },
        }),
      ),
    ).toBe('renewal_due');
    expect(
      deriveStatus(
        input({
          subscription: {
            status: 'past_due',
            billingCycle: 'monthly',
            renewsAt: at(-1),
            graceEndsAt: at(6),
          },
        }),
      ),
    ).toBe('past_due');
    expect(
      deriveStatus(
        input({
          subscription: {
            status: 'past_due',
            billingCycle: 'monthly',
            renewsAt: at(-6),
            graceEndsAt: at(1),
          },
        }),
      ),
    ).toBe('grace_ending');
    expect(
      deriveStatus(
        input({
          subscription: {
            status: 'expired',
            billingCycle: 'monthly',
            renewsAt: at(-20),
            graceEndsAt: at(-13),
          },
        }),
      ),
    ).toBe('expired');
    expect(
      deriveStatus(
        input({
          subscription: {
            status: 'paused',
            billingCycle: 'monthly',
            renewsAt: null,
            graceEndsAt: null,
          },
        }),
      ),
    ).toBe('expired');
  });
});

describe('buildOverview', () => {
  it('reports usage against the plan limits, unlimited as null', () => {
    const o = buildOverview(input());
    expect(o.usage).toEqual([
      { key: 'users', label: 'Users', used: 4, limit: 5 },
      { key: 'projects', label: 'Projects', used: 2, limit: 5 },
      { key: 'landingPages', label: 'Landing pages', used: 3, limit: 5 },
      { key: 'templates', label: 'Templates', used: 7, limit: null },
    ]);
  });

  it('works out the period, renewal amount incl. GST, and payment mode', () => {
    const o = buildOverview(input());
    expect(o.periodEnd).toBe('2026-11-01');
    expect(o.periodStart).toBe('2026-10-02');
    expect(o.daysLeftInPeriod).toBe(18);
    expect(o.daysInPeriod).toBe(30);
    expect(o.renewalAmount).toBe(2360);
    expect(o.paidPlan?.id).toBe('p-growth');
    expect(o).toMatchObject({
      paymentMode: 'manual',
      paymentModeReason: 'switched_off',
      autoRenewAvailable: false,
      renewalMode: 'manual',
      retention: null,
    });
  });

  it('counts grace days for a past-due subscription', () => {
    const o = buildOverview(
      input({
        subscription: {
          status: 'past_due',
          billingCycle: 'monthly',
          renewsAt: at(-0.5),
          graceEndsAt: at(6.5),
        },
      }),
    );
    expect(o.status).toBe('past_due');
    expect(o.dueDate).toBe('2026-10-13');
    expect(o.graceDay).toBe(1);
    expect(o.graceDaysLeft).toBe(7);
    expect(o.daysLeftInPeriod).toBe(0);
  });

  it('has no period or renewal on the free plan', () => {
    const o = buildOverview(
      input({ plan: plan({ isFree: true, priceMonthly: 0, priceYearly: 0 }) }),
    );
    expect(o).toMatchObject({
      status: 'free',
      paidPlan: null,
      periodEnd: null,
      renewalAmount: null,
    });
  });
});

describe('OrgBillingV2Service.getOverview', () => {
  it('counts users, projects, published landing pages and templates with the quota helpers', async () => {
    const growth = {
      id: 'p-growth',
      name: 'Growth',
      description: 'For teams',
      priceMonthly: 2000,
      priceYearly: 20000,
      limits: { users: 5, projects: null },
      capabilities: {},
      isSystem: false,
      isActive: true,
      createdAt: new Date('2026-01-02'),
    };
    const basic = {
      id: 'p-basic',
      name: 'Basic',
      description: '',
      priceMonthly: 0,
      priceYearly: 0,
      limits: { users: 1 },
      capabilities: {},
      isSystem: true,
      isActive: true,
      createdAt: new Date('2026-01-01'),
    };
    const userCount = jest.fn().mockResolvedValue(3);
    const projectCount = jest.fn().mockResolvedValue(4);
    const pageCount = jest.fn().mockResolvedValue(2);
    const prisma = {
      organisation: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Skyline' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          firstName: 'Rohan',
          lastName: 'Mehta',
          email: 'r@x',
        }),
        count: userCount,
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'active',
          billingCycle: 'monthly',
          renewsAt: at(18),
          graceEndsAt: null,
          plan: growth,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      plan: { findMany: jest.fn().mockResolvedValue([growth, basic]) },
      project: { count: projectCount },
      landingPage: { count: pageCount },
      organisationTemplate: { count: jest.fn().mockResolvedValue(6) },
      platformConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: {},
      billingProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      billingCheckout: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      packageChangeRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new OrgBillingV2Service(
      prisma as never,
      {
        getMode: () => Promise.resolve({ mode: 'online', reason: null }),
      } as never,
    );

    const o = await service.getOverview('org-1', NOW);

    // The agreed counting rules: active + pending users (not paused by billing);
    // every project (not view-only); published landing pages.
    expect(userCount).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        status: { in: ['active', 'pending'] },
        billingPausedAt: null,
      },
    });
    expect(projectCount).toHaveBeenCalledWith({
      where: { orgId: 'org-1', billingViewOnlyAt: null },
    });
    expect(pageCount).toHaveBeenCalledWith({
      where: { orgId: 'org-1', pageType: 'landing', status: 'published' },
    });
    expect(o.usage.map((u) => [u.key, u.used, u.limit])).toEqual([
      ['users', 3, 5],
      ['projects', 4, null],
      ['landingPages', 2, null],
      ['templates', 6, null],
    ]);
    expect(o).toMatchObject({
      orgName: 'Skyline',
      ownerName: 'Rohan Mehta',
      status: 'active',
      paymentMode: 'online',
    });
    expect(o.plan.rank).toBe(1); // Basic (free) is rank 0
  });
});
