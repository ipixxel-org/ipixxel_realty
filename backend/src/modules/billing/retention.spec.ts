/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { ForbiddenException } from '@nestjs/common';
import { ProjectEditableGuard } from '../../common/guards/project-editable.guard';
import { applyPlanChange } from '../../common/utils/plan-change.util';
import {
  pickRetention,
  rankRetention,
  type RetentionCandidates,
} from '../../common/utils/retention.util';
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { BillingRetentionService } from './billing-retention.service';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

const DAY = 86_400_000;
const d = (days: number) => new Date(Date.now() + days * DAY);

describe('default picks (same rule as the UI)', () => {
  const c: RetentionCandidates = {
    users: [
      {
        id: 'm1',
        name: 'Zed',
        email: '',
        role: 'member',
        roleName: 'Sales',
        lastLoginAt: d(-1),
        paused: false,
      },
      {
        id: 'a1',
        name: 'Bea',
        email: '',
        role: 'admin',
        roleName: 'Admin',
        lastLoginAt: d(-9),
        paused: false,
      },
      {
        id: 'o1',
        name: 'Owner',
        email: '',
        role: 'owner',
        roleName: 'Owner',
        lastLoginAt: null,
        paused: false,
      },
      {
        id: 'm2',
        name: 'Amy',
        email: '',
        role: 'member',
        roleName: 'Sales',
        lastLoginAt: null,
        paused: false,
      },
    ],
    projects: [
      {
        id: 'p-old',
        name: 'Old',
        location: null,
        updatedAt: d(-30),
        viewOnly: false,
      },
      {
        id: 'p-new',
        name: 'New',
        location: null,
        updatedAt: d(-1),
        viewOnly: false,
      },
    ],
    landingPages: [
      {
        id: 'lp-quiet',
        name: 'Quiet',
        slug: 'q',
        leadsLast30Days: 2,
        offline: false,
      },
      {
        id: 'lp-busy',
        name: 'Busy',
        slug: 'b',
        leadsLast30Days: 40,
        offline: false,
      },
    ],
    templates: [],
  };
  const ranked = rankRetention(c);

  it('orders owner, admins, then latest sign-in; projects by update; pages by leads', () => {
    expect(ranked.users.map((u) => u.id)).toEqual(['o1', 'a1', 'm1', 'm2']);
    expect(ranked.projects.map((p) => p.id)).toEqual(['p-new', 'p-old']);
    expect(ranked.landingPages.map((p) => p.id)).toEqual([
      'lp-busy',
      'lp-quiet',
    ]);
  });

  it('keeps the top N, or the saved choice (owner always in), and everything when unlimited', () => {
    const limits = { users: 2, projects: 1, landingPages: 1, templates: 1 };
    expect(pickRetention(ranked, limits, null)).toEqual({
      users: ['o1', 'a1'],
      projects: ['p-new'],
      landingPages: ['lp-busy'],
      templates: [],
    });
    expect(
      pickRetention(ranked, limits, {
        users: ['m2', 'm1'],
        projects: ['p-old'],
        landingPages: ['lp-quiet'],
        templates: null,
      }),
    ).toEqual({
      users: ['o1', 'm1'],
      projects: ['p-old'],
      landingPages: ['lp-quiet'],
      templates: [],
    });
    const all = pickRetention(
      ranked,
      {
        users: Infinity,
        projects: Infinity,
        landingPages: Infinity,
        templates: Infinity,
      },
      null,
    );
    expect(all.users).toHaveLength(4);
  });
});

/* ------------------------------------------------------------ with a db */

const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  isSystem: true,
  limits: { users: 2, projects: 1, landingPages: 1 },
};
const GROWTH = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 2000,
  priceYearly: 20000,
  limits: { users: 5, projects: 5, landingPages: 5 },
};

function setup(sub: Record<string, unknown> = {}) {
  const user = (id: string, createdAt: number, role = 'sales') => ({
    id,
    orgId: 'org-1',
    status: 'active',
    firstName: id,
    lastName: null,
    email: `${id}@acme.test`,
    billingPausedAt: null,
    createdAt: new Date(createdAt),
    userRoles: [
      { role: { key: role, name: role === 'admin' ? 'Admin' : 'Sales' } },
    ],
  });
  const { db } = createFakeBillingDb({
    plans: [BASIC, GROWTH],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'growth',
      billingCycle: 'monthly',
      status: 'active',
      amount: 2000,
      renewsAt: d(10),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      movedToBasicAt: null,
      ...sub,
    },
    users: [user('u-2', 1, 'admin'), user('u-3', 2), user('u-4', 3)],
    projects: [
      {
        id: 'p1',
        orgId: 'org-1',
        name: 'Tower A',
        location: 'Pune',
        updatedAt: d(-1),
        billingViewOnlyAt: null,
      },
      {
        id: 'p2',
        orgId: 'org-1',
        name: 'Tower B',
        location: null,
        updatedAt: d(-20),
        billingViewOnlyAt: null,
      },
    ],
    landingPages: [
      {
        id: 'lp1',
        orgId: 'org-1',
        name: 'Launch',
        slug: 'launch',
        pageType: 'landing',
        status: 'published',
        billingOfflineAt: null,
        parentId: null,
      },
      {
        id: 'lp2',
        orgId: 'org-1',
        name: 'Promo',
        slug: 'promo',
        pageType: 'landing',
        status: 'published',
        billingOfflineAt: null,
        parentId: null,
      },
      {
        id: 'ty2',
        orgId: 'org-1',
        name: 'Thanks',
        slug: 'promo-thanks',
        pageType: 'thank_you',
        status: 'published',
        billingOfflineAt: null,
        parentId: 'lp2',
      },
    ],
  });
  db.lead = {
    groupBy: async () => [
      { landingPageId: 'lp2', _count: { _all: 30 } },
      { landingPageId: 'lp1', _count: { _all: 3 } },
    ],
  };
  db.refreshToken.rows.push(
    { id: 'rt1', userId: 'u-4', createdAt: d(-1), revokedAt: null },
    { id: 'rt2', userId: 'u-3', createdAt: d(-5), revokedAt: null },
  );
  const retention = new BillingRetentionService(db as never);
  const changes = new BillingPlanChangeService(
    db as never,
    { getOverview: async () => ({}) } as never,
  );
  const row = (table: string, id: string) =>
    db[table].rows.find((r: any) => r.id === id);
  const pausedUsers = () =>
    db.user.rows.filter((u: any) => u.billingPausedAt).map((u: any) => u.id);
  return { db, retention, changes, row, pausedUsers };
}
const ended = { renewsAt: new Date(Date.now() - 60_000) };

describe('moving to a smaller plan pauses what does not fit; buying again restores it', () => {
  it('cancel → Basic at the end of the term: default picks stay, the rest is paused / view-only / offline', async () => {
    const { db, row, pausedUsers } = setup({
      ...ended,
      cancelAtPeriodEnd: true,
    });
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(db.subscription.rows[0]).toMatchObject({
      planId: 'basic',
      previousPlanId: 'growth',
      previousInterval: 'monthly',
    });
    expect(db.subscription.rows[0].movedToBasicAt).toBeInstanceOf(Date);
    // Basic: 2 users → owner (u-admin) + the admin (u-2); members paused and signed out.
    expect(pausedUsers().sort()).toEqual(['u-3', 'u-4']);
    expect(db.refreshToken.rows.every((t: any) => t.revokedAt)).toBe(true);
    // 1 project → the most recently updated stays.
    expect(row('project', 'p1').billingViewOnlyAt).toBeNull();
    expect(row('project', 'p2').billingViewOnlyAt).toBeInstanceOf(Date);
    // 1 landing page → the one with most leads (lp2) stays; lp1 goes offline.
    expect(row('landingPage', 'lp2')).toMatchObject({
      status: 'published',
      billingOfflineAt: null,
    });
    expect(row('landingPage', 'lp1')).toMatchObject({ status: 'unpublished' });
    expect(row('landingPage', 'lp1').billingOfflineAt).toBeInstanceOf(Date);
    expect(row('landingPage', 'ty2').status).toBe('published');

    // Buying Growth again brings everything back and clears "moved to Basic".
    await db.$transaction((tx: any) =>
      applyPlanChange(tx, {
        organisationId: 'org-1',
        toPlanId: 'growth',
        toInterval: 'monthly',
        kind: 'new',
        source: 'payment',
        actorId: null,
      }),
    );
    expect(pausedUsers()).toEqual([]);
    expect(row('project', 'p2').billingViewOnlyAt).toBeNull();
    expect(row('landingPage', 'lp1')).toMatchObject({
      status: 'published',
      billingOfflineAt: null,
    });
    expect(db.subscription.rows[0]).toMatchObject({
      planId: 'growth',
      movedToBasicAt: null,
      previousPlanId: null,
    });
  });

  it('a saved choice wins, and the thank-you page follows its landing page', async () => {
    const { db, retention, row, pausedUsers } = setup({
      ...ended,
      cancelAtPeriodEnd: true,
    });
    await retention.saveChoices('org-1', 'u-admin', {
      targetPlanId: 'basic',
      userIds: ['u-admin', 'u-4'],
      projectIds: ['p2'],
      landingPageIds: ['lp1'],
    });
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(pausedUsers().sort()).toEqual(['u-2', 'u-3']);
    expect(row('project', 'p1').billingViewOnlyAt).toBeInstanceOf(Date);
    expect(row('landingPage', 'lp2').status).toBe('unpublished');
    expect(row('landingPage', 'ty2')).toMatchObject({ status: 'unpublished' });
    expect(row('landingPage', 'lp1').status).toBe('published');
  });

  it('on Basic already, changing what stays swaps it at once', async () => {
    const { db, retention, pausedUsers } = setup({
      ...ended,
      cancelAtPeriodEnd: true,
    });
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(pausedUsers().sort()).toEqual(['u-3', 'u-4']);
    await retention.saveChoices('org-1', 'u-admin', {
      targetPlanId: 'basic',
      userIds: ['u-admin', 'u-3'],
      projectIds: ['p1'],
      landingPageIds: ['lp2'],
    });
    expect(pausedUsers().sort()).toEqual(['u-2', 'u-4']);
  });

  it('"fall back to Basic" after grace: the same, and the overview can offer "buy again"', async () => {
    const { db, pausedUsers } = setup({
      status: 'past_due',
      renewsAt: d(-8),
      graceEndsAt: new Date(Date.now() - 60_000),
    });
    db.platformConfig = {
      findUnique: async () => ({
        billingGracePeriodDays: 7,
        billingExpiryNotifyDays: 3,
        billingExpiryBehavior: 'fall_back_to_basic',
        billingExpiryMessage: '',
      }),
    };
    const summary = await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(summary.movedToFreePlan).toBe(1);
    expect(db.subscription.rows[0]).toMatchObject({
      planId: 'basic',
      status: 'active',
      previousPlanId: 'growth',
    });
    expect(pausedUsers()).toHaveLength(2);
    expect(
      db.notification.rows.some((n: any) => n.title === 'Moved to Basic'),
    ).toBe(true);
  });

  it("a downgrade over the smaller plan's limits can now be scheduled", async () => {
    const { changes, db } = setup();
    db.plan.rows.push({
      id: 'starter',
      name: 'Starter',
      priceMonthly: 999,
      priceYearly: 9990,
      isActive: true,
      isSystem: false,
      limits: { users: 2 },
      capabilities: {},
      createdAt: new Date(0),
    });
    await changes.scheduleDowngrade('org-1', 'u-admin', { planId: 'starter' });
    expect(db.subscription.rows[0].scheduledPlanId).toBe('starter');
  });
});

describe('choose what stays — choices API', () => {
  it('lists default picks with reasons for the plan the org is heading to', async () => {
    const { retention } = setup({ cancelAtPeriodEnd: true });
    const c = await retention.getChoices('org-1');
    expect(c.targetPlan.id).toBe('basic');
    expect(c.isDefault).toBe(true);
    expect(c.users.map((u) => [u.id, u.selected, u.locked])).toEqual([
      ['u-admin', true, true],
      ['u-2', true, false],
      ['u-4', false, false],
      ['u-3', false, false],
    ]);
    expect(c.users[0].reason).toBe('Owner — always stays');
    expect(c.users[2].reason).toMatch(/^Last login /);
    expect(c.landingPages[0]).toMatchObject({
      id: 'lp2',
      reason: '30 leads in the last 30 days',
      selected: true,
    });
    expect(c.projects[0]).toMatchObject({
      id: 'p1',
      detail: 'Pune',
      selected: true,
    });
  });

  it('refuses more than the plan allows, leaving out the owner, or unknown ids', async () => {
    const { retention } = setup();
    const code = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: any) => e.response?.code,
      );
    const base = {
      targetPlanId: 'basic',
      userIds: ['u-admin'],
      projectIds: [],
      landingPageIds: [],
    };
    expect(
      await code(
        retention.saveChoices('org-1', 'u', {
          ...base,
          userIds: ['u-admin', 'u-2', 'u-3'],
        }),
      ),
    ).toBe('retention_over_limit');
    expect(
      await code(
        retention.saveChoices('org-1', 'u', { ...base, userIds: ['u-2'] }),
      ),
    ).toBe('retention_owner');
    expect(
      await code(
        retention.saveChoices('org-1', 'u', { ...base, projectIds: ['ghost'] }),
      ),
    ).toBe('retention_unknown');
    expect(await code(retention.saveChoices('org-1', 'u', base))).toBe('ok');
  });
});

describe('view-only projects', () => {
  it('blocks edits on a view-only project, not on others', async () => {
    const { db } = setup();
    db.project.rows[1].billingViewOnlyAt = new Date();
    db.project.findFirst = async ({ where }: any) =>
      db.project.rows.find(
        (p: any) => p.id === where.id && p.orgId === where.orgId,
      ) ?? null;
    const guard = new ProjectEditableGuard(db as never);
    const ctx = (params: Record<string, string>) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ params, user: { orgId: 'org-1' } }),
        }),
      }) as never;
    await expect(guard.canActivate(ctx({ id: 'p1' }))).resolves.toBe(true);
    await expect(
      guard.canActivate(ctx({ projectId: 'p2', id: 'unit-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
