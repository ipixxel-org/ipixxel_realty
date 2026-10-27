/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { BillingRetentionService } from './billing-retention.service';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

/**
 * "Choose what stays" is part of every plan change the org is over on: it's
 * confirmed once (a saved choice that fits, or the default picks), editable
 * until the change is decided or takes effect, then Super Admin only.
 */

const DAY = 86_400_000;
const d = (days: number) => new Date(Date.now() + days * DAY);

const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  isSystem: true,
  limits: { users: 2, projects: 10, landingPages: 10 },
};
const STARTER = {
  id: 'starter',
  name: 'Starter',
  priceMonthly: 999,
  priceYearly: 9990,
  limits: { users: 2, projects: 10, landingPages: 10 },
};
const GROWTH = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 2000,
  priceYearly: 20000,
  limits: { users: 10, projects: 10, landingPages: 10 },
};

function setup(sub: Record<string, unknown> = {}) {
  const user = (id: string, createdAt: number, orgId = 'org-1') => ({
    id,
    orgId,
    status: 'active',
    firstName: id,
    lastName: null,
    email: `${id}@acme.test`,
    billingPausedAt: null,
    createdAt: new Date(createdAt),
    userRoles: [{ role: { key: 'sales', name: 'Sales' } }],
  });
  const { db, usage } = createFakeBillingDb({
    plans: [BASIC, STARTER, GROWTH],
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
    // u-admin (the owner) + 3 more = 4 users; Starter and Basic allow 2.
    users: [user('u-2', 2), user('u-3', 3), user('u-4', 4)],
    usage: { users: 4 },
  });
  // The Super Admin (not an org member).
  db.user.rows.push({
    ...user('admin-1', 0, 'platform'),
    firstName: 'Priya',
    lastName: 'Admin',
  });
  const retention = new BillingRetentionService(db as never);
  const changes = new BillingPlanChangeService(
    db as never,
    { getOverview: async () => ({}) } as never,
  );
  const pausedUsers = () =>
    db.user.rows
      .filter((u: any) => u.billingPausedAt)
      .map((u: any) => u.id)
      .sort();
  const request = (id: string) =>
    db.packageChangeRequest.rows.find((r: any) => r.id === id);
  const addRequest = (status: string, targetPlanId = 'starter') => {
    const row = {
      id: `req-${status}`,
      orgId: 'org-1',
      currentPlanId: 'growth',
      targetPlanId,
      billingCycle: 'monthly',
      kind: 'request',
      status,
      createdAt: new Date(),
    };
    db.packageChangeRequest.rows.push(row);
    return row.id;
  };
  return { db, usage, retention, changes, pausedUsers, request, addRequest };
}

const keep = (userIds: string[], targetPlanId = 'starter') => ({
  targetPlanId,
  userIds,
  projectIds: [],
  landingPageIds: [],
});

describe('confirm what stays before the plan change', () => {
  it('a downgrade over the limits is refused until the org saves a choice or keeps the default picks', async () => {
    const { changes, retention, db } = setup();
    await expect(
      changes.scheduleDowngrade('org-1', 'u-admin', { planId: 'starter' }),
    ).rejects.toMatchObject({
      response: {
        code: 'choose_what_stays',
        message:
          'Starter allows 2 users; you have 4. Choose which 2 stay active when this change is approved.',
      },
    });
    expect(db.subscription.rows[0].scheduledPlanId).toBeNull();

    // The checkbox: "Keep the default picks shown above".
    await changes.scheduleDowngrade('org-1', 'u-admin', {
      planId: 'starter',
      acceptDefaultPicks: true,
    });
    const row = db.packageChangeRequest.rows.find(
      (r: any) => r.kind === 'scheduled_change',
    );
    expect(row.whatStays).toMatchObject({
      planId: 'starter',
      choice: 'default',
      applied: false,
      users: { limit: 2, total: 4 },
    });

    // Changing it while scheduled refreshes the copy: now the saved choice.
    await retention.saveChoices('org-1', 'u-admin', {
      ...keep(['u-admin', 'u-4']),
      requestId: row.id,
    });
    expect(row.whatStays.choice).toBe('saved');
    expect(row.whatStays.users.kept.map((u: any) => u.id)).toEqual([
      'u-admin',
      'u-4',
    ]);
  });

  it('a saved choice that fits is enough; moving to Basic needs it too', async () => {
    const { changes, retention, db } = setup();
    await expect(changes.cancel('org-1', 'u-admin', {})).rejects.toMatchObject({
      response: { code: 'choose_what_stays' },
    });
    await retention.saveChoices(
      'org-1',
      'u-admin',
      keep(['u-admin', 'u-2'], 'basic'),
    );
    await changes.cancel('org-1', 'u-admin', {});
    expect(db.subscription.rows[0].cancelAtPeriodEnd).toBe(true);
    const row = db.packageChangeRequest.rows.find(
      (r: any) => r.kind === 'scheduled_change',
    );
    expect(row.whatStays).toMatchObject({ planId: 'basic', choice: 'saved' });
  });

  it('nothing over the limits: nothing to confirm', async () => {
    const { changes, usage, db } = setup();
    usage.users = 2;
    await changes.scheduleDowngrade('org-1', 'u-admin', { planId: 'starter' });
    expect(db.subscription.rows[0].scheduledPlanId).toBe('starter');
  });
});

describe('editable until decided, then view-only for the org', () => {
  it('pending: editable; approved, rejected or withdrawn: what_stays_locked', async () => {
    const { retention, addRequest } = setup();
    const pending = addRequest('pending');
    await expect(
      retention.saveChoices('org-1', 'u-admin', {
        ...keep(['u-admin', 'u-2']),
        requestId: pending,
      }),
    ).resolves.toMatchObject({ locked: false });

    for (const status of ['approved', 'rejected', 'cancelled']) {
      const id = addRequest(status);
      expect((await retention.getChoices('org-1', undefined, id)).locked).toBe(
        true,
      );
      await expect(
        retention.saveChoices('org-1', 'u-admin', {
          ...keep(['u-admin', 'u-2']),
          requestId: id,
        }),
      ).rejects.toMatchObject({ response: { code: 'what_stays_locked' } });
    }
  });

  it('grace before falling back to Basic: editable', async () => {
    const { retention } = setup({
      status: 'past_due',
      renewsAt: d(-2),
      graceEndsAt: d(5),
    });
    const c = await retention.saveChoices(
      'org-1',
      'u-admin',
      keep(['u-admin', 'u-3'], 'basic'),
    );
    expect(c).toMatchObject({ locked: false, isDefault: false });
  });

  it('scheduled: editable; once it takes effect: locked, and the copy is marked applied', async () => {
    const { db, changes, retention, pausedUsers } = setup();
    await changes.scheduleDowngrade('org-1', 'u-admin', {
      planId: 'starter',
      acceptDefaultPicks: true,
    });
    const row = db.packageChangeRequest.rows.find(
      (r: any) => r.kind === 'scheduled_change',
    );
    expect(
      (await retention.getChoices('org-1', undefined, row.id)).locked,
    ).toBe(false);

    // The term ends: the sweep applies the scheduled plan.
    db.subscription.rows[0].renewsAt = new Date(Date.now() - 60_000);
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    expect(db.subscription.rows[0].planId).toBe('starter');
    expect(row.status).toBe('done');
    expect(row.whatStays.applied).toBe(true);
    expect(pausedUsers()).toHaveLength(2);

    for (const requestId of [row.id, undefined]) {
      await expect(
        retention.saveChoices('org-1', 'u-admin', {
          ...keep(['u-admin', 'u-2']),
          requestId,
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'what_stays_locked',
          message: 'To change what stays, contact our support team.',
        },
      });
    }
  });
});

describe('Super Admin can change what stays any time', () => {
  it('before it applies: updates the saved choice and the copy, pauses nothing; audit log + notification', async () => {
    const { db, changes, retention, pausedUsers } = setup();
    await changes.scheduleDowngrade('org-1', 'u-admin', {
      planId: 'starter',
      acceptDefaultPicks: true,
    });
    const row = db.packageChangeRequest.rows.find(
      (r: any) => r.kind === 'scheduled_change',
    );
    await retention.adminSaveChoices('org-1', 'admin-1', {
      ...keep(['u-admin', 'u-3']),
      requestId: row.id,
    });
    expect(pausedUsers()).toEqual([]);
    expect(db.retentionChoice.rows[0]).toMatchObject({
      targetPlanId: 'starter',
      userIds: ['u-admin', 'u-3'],
      updatedById: 'admin-1',
    });
    expect(row.whatStays.users.kept.map((u: any) => u.id)).toEqual([
      'u-admin',
      'u-3',
    ]);
    const audit = db.auditLog.rows.find(
      (a: any) => a.action === 'retention_choices_saved_by_admin',
    );
    expect(audit).toMatchObject({
      actorId: 'admin-1',
      metadata: {
        appliedNow: false,
        requestId: row.id,
        admin: { name: 'Priya Admin', email: 'admin-1@acme.test' },
      },
    });
    expect(
      db.notification.rows.some(
        (n: any) =>
          n.title === 'Our team updated what stays active on your plan',
      ),
    ).toBe(true);
  });

  it('after it applied: applied at once (pauses and unpauses), the copy shows what was kept', async () => {
    const { db, changes, retention, pausedUsers } = setup();
    await changes.scheduleDowngrade('org-1', 'u-admin', {
      planId: 'starter',
      acceptDefaultPicks: true,
    });
    const row = db.packageChangeRequest.rows.find(
      (r: any) => r.kind === 'scheduled_change',
    );
    db.subscription.rows[0].renewsAt = new Date(Date.now() - 60_000);
    await applyOrgSubscriptionLifecycle(db as never, 'org-1');
    const before = pausedUsers();
    expect(before).toHaveLength(2);
    const keepNow = ['u-admin', before[0]];

    const c = await retention.adminSaveChoices('org-1', 'admin-1', {
      ...keep(keepNow),
      requestId: row.id,
    });
    expect(c.locked).toBe(false);
    expect(pausedUsers()).toEqual(
      ['u-2', 'u-3', 'u-4'].filter((id) => id !== before[0]),
    );
    expect(row.whatStays).toMatchObject({ applied: true, choice: 'saved' });
    expect(row.whatStays.users.kept.map((u: any) => u.id).sort()).toEqual(
      keepNow.sort(),
    );
    expect(
      db.auditLog.rows.find(
        (a: any) => a.action === 'retention_choices_saved_by_admin',
      ).metadata.appliedNow,
    ).toBe(true);
  });

  it("a change that was never applied (rejected) can't be edited", async () => {
    const { retention, addRequest } = setup();
    const id = addRequest('rejected');
    await expect(
      retention.adminSaveChoices('org-1', 'admin-1', {
        ...keep(['u-admin', 'u-2']),
        requestId: id,
      }),
    ).rejects.toMatchObject({ response: { code: 'request_closed' } });
  });
});
