/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { whatStaysPlace } from '../../common/utils/what-stays-rows.util';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { BillingRetentionService } from './billing-retention.service';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

/**
 * Super Admin "Choose what stays" from the latest Package requests row saves
 * users, projects, landing pages and templates — like the org-page button —
 * and only one of the two buttons is ever the place to do it.
 */

const DAY = 86_400_000;
const d = (days: number) => new Date(Date.now() + days * DAY);
const SMALL = { users: 2, projects: 1, landingPages: 1, templates: 1 };
const BIG = { users: 10, projects: 10, landingPages: 10, templates: 10 };

function setup(starterLimits: Record<string, number> = SMALL) {
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
    plans: [
      {
        id: 'basic',
        name: 'Basic',
        priceMonthly: 0,
        priceYearly: 0,
        limits: SMALL,
      },
      {
        id: 'starter',
        name: 'Starter',
        priceMonthly: 999,
        priceYearly: 9990,
        limits: starterLimits,
      },
      {
        id: 'growth',
        name: 'Growth',
        priceMonthly: 2000,
        priceYearly: 20000,
        limits: BIG,
      },
    ],
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
    },
    users: [user('u-2', 2), user('u-3', 3)],
    projects: ['p1', 'p2'].map((id, i) => ({
      id,
      orgId: 'org-1',
      name: id,
      location: null,
      updatedAt: d(-i),
      billingViewOnlyAt: null,
    })),
    landingPages: ['l1', 'l2'].map((id) => ({
      id,
      orgId: 'org-1',
      name: id,
      slug: id,
      pageType: 'landing',
      status: 'published',
      sourceTemplateId: null,
      billingOfflineAt: null,
      parentId: null,
      createdAt: d(-1),
    })),
    templates: ['t1', 't2'].map((id, i) => ({
      orgId: 'org-1',
      templateId: id,
      assignedAt: d(-i),
      billingPausedAt: null,
      template: { name: id },
    })),
    usage: { users: 3, projects: 2, landingPages: 2 },
  });
  db.user.rows.push({ ...user('admin-1', 0), orgId: 'platform' });
  const retention = new BillingRetentionService(db as never);
  const changes = new BillingPlanChangeService(
    db as never,
    { getOverview: async () => ({}) } as never,
  );
  const schedule = async () => {
    await changes.scheduleDowngrade('org-1', 'u-admin', {
      planId: 'starter',
      whatStaysChoice: 'default',
    });
    return db.packageChangeRequest.rows.find(
      (r: any) => r.kind === 'scheduled_change',
    );
  };
  const takeEffect = async () => {
    db.subscription.rows[0].renewsAt = new Date(Date.now() - 60_000);
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
  };
  return { db, retention, schedule, takeEffect };
}

// Keep u-3, p2, l2, t2 (the defaults would keep u-2, p1, l1, t1).
const PICKS = {
  targetPlanId: 'starter',
  userIds: ['u-admin', 'u-3'],
  projectIds: ['p2'],
  landingPageIds: ['l2'],
  templateIds: ['t2'],
};
const EXPECTED = {
  users: ['u-3', 'u-admin'],
  projects: ['p2'],
  landingPages: ['l2'],
  templates: ['t2'],
};
const KINDS = ['users', 'projects', 'landingPages', 'templates'] as const;
const selected = (c: any) =>
  Object.fromEntries(
    KINDS.map((k) => [
      k,
      c[k]
        .filter((i: any) => i.selected)
        .map((i: any) => i.id)
        .sort(),
    ]),
  );
const copyKept = (row: any) =>
  Object.fromEntries(
    KINDS.map((k) => [
      k,
      (row.whatStays?.[k]?.kept ?? []).map((i: any) => i.id).sort(),
    ]),
  );

describe('Super Admin saves what stays from the latest row', () => {
  it('open (scheduled): saves the planned choice for all four and the row copy; reload shows it on both sides', async () => {
    const { retention, schedule } = setup();
    const row = await schedule();
    expect(row.status).toBe('scheduled');
    const saved = await retention.adminSaveChoices('org-1', 'admin-1', {
      ...PICKS,
      requestId: row.id,
    });
    expect(selected(saved)).toEqual(EXPECTED);
    // Reload: Super Admin dialog and the org's Requests tab.
    expect(
      selected(await retention.adminGetChoices('org-1', 'starter', row.id)),
    ).toEqual(EXPECTED);
    expect(
      selected(await retention.getChoices('org-1', undefined, row.id)),
    ).toEqual(EXPECTED);
    expect(copyKept(row)).toEqual(EXPECTED);
    expect(row.whatStays.choice).toBe('saved');
  });

  it('applied (org on its plan): pauses at once for all four and updates the copy; reload shows it on both sides', async () => {
    const { db, retention, schedule, takeEffect } = setup();
    const row = await schedule();
    await takeEffect();
    expect(row.status).toBe('done');
    await retention.adminSaveChoices('org-1', 'admin-1', {
      ...PICKS,
      requestId: row.id,
    });
    const paused = (rows: any[], key: string, marker: string) =>
      rows
        .filter((r) => r[marker])
        .map((r) => r[key])
        .sort();
    expect(paused(db.project.rows, 'id', 'billingViewOnlyAt')).toEqual(['p1']);
    expect(paused(db.landingPage.rows, 'id', 'billingOfflineAt')).toEqual([
      'l1',
    ]);
    expect(
      paused(db.organisationTemplate.rows, 'templateId', 'billingPausedAt'),
    ).toEqual(['t1']);
    expect(paused(db.user.rows, 'id', 'billingPausedAt')).toEqual(['u-2']);
    expect(
      selected(await retention.adminGetChoices('org-1', 'starter', row.id)),
    ).toEqual(EXPECTED);
    expect(
      selected(await retention.getChoices('org-1', undefined, row.id)),
    ).toEqual(EXPECTED);
    expect(copyKept(row)).toEqual(EXPECTED);
  });

  it("the copy is refreshed with every limit the org is over now, not only the request's", async () => {
    const { db, retention, schedule } = setup({ ...BIG, users: 2 });
    const row = await schedule();
    // Only users were over when the change was made.
    expect(Object.keys(row.whatStays)).not.toContain('projects');
    // Then Starter's project limit was lowered: now over projects too.
    db.plan.rows.find((p: any) => p.id === 'starter').limits = {
      ...BIG,
      users: 2,
      projects: 1,
    };
    await retention.adminSaveChoices('org-1', 'admin-1', {
      ...PICKS,
      landingPageIds: ['l1', 'l2'],
      templateIds: ['t1', 't2'],
      requestId: row.id,
    });
    expect(copyKept(row)).toMatchObject({
      users: EXPECTED.users,
      projects: ['p2'],
    });
  });

  it('a refused save says why (closed row, not the latest, org-page save while a row is the place)', async () => {
    const { db, retention, schedule } = setup();
    const row = await schedule();
    await expect(
      retention.adminSaveChoices('org-1', 'admin-1', PICKS),
    ).rejects.toMatchObject({ response: { code: 'what_stays_use_latest' } });
    row.status = 'cancelled';
    await expect(
      retention.adminSaveChoices('org-1', 'admin-1', {
        ...PICKS,
        requestId: row.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'request_closed' } });
    db.packageChangeRequest.rows.push({
      ...row,
      id: 'newer',
      status: 'pending',
      createdAt: d(1),
    });
    await expect(
      retention.adminSaveChoices('org-1', 'admin-1', {
        ...PICKS,
        requestId: row.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'what_stays_not_latest' } });
  });
});

describe('only one "Choose what stays" button', () => {
  const both = (p: { latestEditable: boolean; orgLevel: boolean }) =>
    p.latestEditable && p.orgLevel;

  it('plan assigned directly, no rows: the org-page button only', async () => {
    const { db } = setup();
    const place = await whatStaysPlace(db as never, 'org-1');
    expect(place).toMatchObject({ orgLevel: true, latestEditable: false });
  });

  it('plan assigned directly with an open row: the row only (it used to show both)', async () => {
    const { db, schedule } = setup();
    await schedule();
    const place = await whatStaysPlace(db as never, 'org-1');
    expect(place).toMatchObject({ orgLevel: false, latestEditable: true });
  });

  it('the row set the current plan: the row only', async () => {
    const { db, schedule, takeEffect } = setup();
    await schedule();
    await takeEffect();
    const place = await whatStaysPlace(db as never, 'org-1');
    expect(place).toMatchObject({ orgLevel: false, latestEditable: true });
  });

  it('moved to Basic with no row after a row: the org-page button only', async () => {
    const { db, schedule, takeEffect } = setup();
    await schedule();
    await takeEffect();
    Object.assign(db.subscription.rows[0], {
      planId: 'basic',
      movedToBasicAt: new Date(),
    });
    const place = await whatStaysPlace(db as never, 'org-1');
    expect(place).toMatchObject({ orgLevel: true, latestEditable: false });
  });

  it('never both, whatever the latest row', async () => {
    for (const status of [
      'pending',
      'scheduled',
      'approved',
      'done',
      'rejected',
      'cancelled',
    ]) {
      for (const planId of ['growth', 'starter', 'basic']) {
        const { db, schedule } = setup();
        const row = await schedule();
        row.status = status;
        db.subscription.rows[0].planId = planId;
        expect(both(await whatStaysPlace(db as never, 'org-1'))).toBe(false);
      }
    }
  });
});
