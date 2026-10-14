import { BadRequestException } from '@nestjs/common';
import { OrgBillingService } from './org-billing.service';

/**
 * Free plan-change loophole (billing v2 step 2): PATCH /org/billing/plan used
 * to switch an org onto any plan for free. Paid targets are now refused;
 * free ones still work.
 *
 * POST /org/billing/renew is deliberately still open: the existing Settings →
 * Billing "Renew" button (app/org/settings/page.tsx → renewSubscription()
 * in lib/api.ts) calls it. It is closed in step 3 with paid renewals.
 */
describe('OrgBillingService.changePlan — paid plans need checkout', () => {
  const plans = {
    basic: {
      id: 'basic',
      name: 'Basic',
      isActive: true,
      priceMonthly: 0,
      priceYearly: 0,
      limits: { users: 5 },
    },
    growth: {
      id: 'growth',
      name: 'Growth',
      isActive: true,
      priceMonthly: 2000,
      priceYearly: 20000,
      limits: {},
    },
    y: {
      id: 'y',
      name: 'Yearly deal',
      isActive: true,
      priceMonthly: 0,
      priceYearly: 9000,
      limits: {},
    },
  };

  const make = () => {
    const update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'sub-1', ...data, plan: plans.basic }),
    );
    const prisma = {
      plan: {
        findUnique: jest.fn(
          ({ where }: { where: { id: keyof typeof plans } }) =>
            Promise.resolve(plans[where.id]),
        ),
      },
      subscription: {
        findFirst: jest.fn(() =>
          Promise.resolve({ id: 'sub-1', status: 'active' }),
        ),
        update,
        create: jest.fn(),
      },
      user: { count: jest.fn(() => Promise.resolve(1)) },
      project: { count: jest.fn(() => Promise.resolve(0)) },
      landingPage: { count: jest.fn(() => Promise.resolve(0)) },
      organisationTemplate: { count: jest.fn(() => Promise.resolve(0)) },
      auditLog: { create: jest.fn(() => Promise.resolve({})) },
    };
    return { service: new OrgBillingService(prisma as never), update };
  };

  it('refuses a paid plan (monthly or yearly price) without changing anything', async () => {
    const { service, update } = make();
    for (const planId of ['growth', 'y']) {
      const err = await service
        .changePlan('org-1', { planId, billingCycle: 'monthly' } as never)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'paid_plan_requires_checkout',
      });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('still lets an org move onto a free plan', async () => {
    const { service, update } = make();
    await service.changePlan('org-1', {
      planId: 'basic',
      billingCycle: 'monthly',
    } as never);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toMatchObject({
      planId: 'basic',
      amount: 0,
    });
  });
});
