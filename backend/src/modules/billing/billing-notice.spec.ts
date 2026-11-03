import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { OrgBillingV2Controller } from './billing.controller';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { toBillingNotice } from './billing-notice';

/**
 * GET /org/billing/access and /org/billing/notice: open to every member of
 * the org (a sales agent with no billing permission gets both), and nothing
 * in the notice is money.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-10-14T10:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

/** PermissionGuard for one controller method, signed in as a sales agent with no billing rows. */
function guardFor(handler: (...args: never[]) => unknown) {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u1',
        orgId: 'org1',
        userRoles: [{ role: { key: 'sales' } }],
      }),
    },
    roleModulePermission: { findMany: jest.fn().mockResolvedValue([]) },
    userModulePermission: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const req = { user: { sub: 'u1', orgId: 'org1' } };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => OrgBillingV2Controller,
  } as unknown as ExecutionContext;
  return new PermissionGuard(new Reflector(), prisma).canActivate(context);
}

describe('billing access and notice for members without billing permission', () => {
  const proto = OrgBillingV2Controller.prototype;

  it('a sales agent passes the permission check for access and notice', async () => {
    await expect(guardFor(proto.access)).resolves.toBe(true);
    await expect(guardFor(proto.notice)).resolves.toBe(true);
  });

  it('the full overview, invoices and coupons still need billing:view', async () => {
    await expect(guardFor(proto.overview)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guardFor(proto.invoices)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guardFor(proto.orgCoupons)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('OrgBillingV2Service: notice and access', () => {
  function service(sub: Record<string, unknown> = {}) {
    const growth = {
      id: 'p-growth',
      name: 'Growth',
      description: 'For teams',
      priceMonthly: 2000,
      priceYearly: 20000,
      limits: { users: 5, projects: 3, landingPagesCreate: 4 },
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
    // Every landing page count returns 2 (published and total alike).
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
        count: jest.fn().mockResolvedValue(3),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'past_due',
          billingCycle: 'monthly',
          renewsAt: at(-2),
          graceEndsAt: at(5),
          graceExtensionDays: 0,
          plan: growth,
          ...sub,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      plan: {
        findMany: jest.fn().mockResolvedValue([growth, basic]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      project: { count: jest.fn().mockResolvedValue(3) },
      landingPage: { count: jest.fn().mockResolvedValue(2) },
      organisationTemplate: { count: jest.fn().mockResolvedValue(6) },
      platformConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: {},
      billingCheckout: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      packageChangeRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return new OrgBillingV2Service(
      prisma as never,
      {
        getMode: () => Promise.resolve({ mode: 'online', reason: null }),
      } as never,
    );
  }

  it('the notice has the banner state, dates and owner, and no amounts', async () => {
    const svc = service();
    const overview = await svc.getOverview('org-1');
    const notice = toBillingNotice(overview);
    expect(notice).toMatchObject({
      orgName: 'Skyline',
      ownerName: 'Rohan Mehta',
      planName: 'Growth',
      graceEndsAt: expect.any(String),
    });
    expect(Object.keys(notice).sort()).toEqual(
      [
        'status',
        'orgName',
        'ownerName',
        'planName',
        'currentPlanName',
        'periodEnd',
        'daysLeftInPeriod',
        'dueDate',
        'graceEndsAt',
        'graceDays',
        'graceExtraDays',
        'graceDay',
        'graceDaysLeft',
        'movedToBasicAt',
        'cancelAt',
        'downgradeAt',
        'downgradeToName',
        'locked',
        'nextVersion',
      ].sort(),
    );
    const json = JSON.stringify(notice);
    for (const word of [
      'price',
      'amount',
      'renewalBreakdown',
      'coupon',
      'invoice',
      'gst',
      'total',
      'billingProfile',
      'paymentMethod',
    ]) {
      expect(json.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it('a newer plan version: shown without its price, and only when it lowers something', async () => {
    const overview = await service().getOverview('org-1');
    const nextVersion = {
      planName: 'Growth',
      fromVersion: 1,
      toVersion: 2,
      at: '2026-11-26',
      reason: 'renewal' as const,
      price: { interval: 'monthly' as const, from: 2000, to: 2500 },
      changes: [
        { key: 'users', kind: 'limit', label: 'users', from: 5, to: 3, lower: true, text: 'x' },
      ] as never,
      lower: true,
      overLimits: [{ key: 'users', limit: 3, used: 5 }],
      whatStays: null,
    };
    const notice = toBillingNotice({ ...overview, nextVersion });
    expect(notice.nextVersion).toEqual({
      planName: 'Growth',
      at: '2026-11-26',
      reason: 'renewal',
      overLimit: true,
      answered: false,
    });
    expect(JSON.stringify(notice)).not.toMatch(/2500/);
    // A price rise alone isn't a member's business: no notice.
    const priceOnly = toBillingNotice({
      ...overview,
      nextVersion: { ...nextVersion, changes: [], lower: false, overLimits: [] },
    });
    expect(priceOnly.nextVersion).toBeNull();
  });

  it('getNotice returns the same slice', async () => {
    const notice = await service().getNotice('org-1');
    expect(notice.planName).toBe('Growth');
    expect(JSON.stringify(notice)).not.toMatch(/2000|20000|2360/);
  });

  it('access carries the usage counts the limit prompts need (same as GET /org/billing)', async () => {
    const access = await service().getAccess('org-1');
    expect(access.usage).toEqual({
      templatesUsed: 6,
      templatesLimit: null,
      projectsUsed: 3,
      projectsLimit: 3,
      usersUsed: 3,
      usersLimit: 5,
      landingPagesUsed: 2,
      landingPagesLimit: null,
      landingPagesCreateUsed: 2,
      landingPagesCreateLimit: 4,
    });
    expect(JSON.stringify(access)).not.toMatch(/price|amount|coupon/i);
  });
});
