/* eslint-disable @typescript-eslint/require-await -- test-only Prisma stubs */
import { ConflictException } from '@nestjs/common';
import { PlansService } from '../plans/plans.service';
import {
  AdminBillingService,
  validateAdminPlan,
} from './admin-billing.service';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { isFreePlan, isInternalPlan } from './plan-modules';
import { BillingCheckoutService } from './billing-checkout.service';
import { PaymentEventsService } from '../payments/payment-events';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

/**
 * An internal ₹0 plan (the staging "Demo" plan) is not Basic: it isn't the
 * free plan, it's never offered to organisations, the Super Admin can see,
 * edit and delete it (when no organisation is on it).
 */

const row = (over: Record<string, unknown>) => ({
  id: 'x',
  name: 'X',
  slug: 'x',
  description: '',
  isActive: true,
  isSystem: false,
  priceMonthly: 1000,
  priceYearly: 10000,
  limits: {},
  capabilities: {},
  features: [],
  createdAt: new Date(0),
  ...over,
});
const BASIC = row({
  id: 'basic',
  name: 'Basic',
  slug: 'basic',
  isSystem: true,
  priceMonthly: 0,
  priceYearly: 0,
});
const STARTER = row({ id: 'starter', name: 'Starter', slug: 'starter' });
const DEMO = row({
  id: 'demo',
  name: 'Demo',
  slug: 'demo',
  priceMonthly: 0,
  priceYearly: 0,
  createdAt: new Date(1),
});

describe('the free plan is Basic (the system plan), not any ₹0 plan', () => {
  it('isFreePlan / isInternalPlan', () => {
    expect(isFreePlan(BASIC)).toBe(true);
    expect(isFreePlan(DEMO)).toBe(false);
    expect(isInternalPlan(DEMO)).toBe(true);
    expect(isInternalPlan(BASIC)).toBe(false);
    expect(isInternalPlan(STARTER)).toBe(false);
  });

  it("organisations never see an internal plan, even when it's active", async () => {
    const service = new OrgBillingV2Service(
      { plan: { findMany: async () => [BASIC, STARTER, DEMO] } } as never,
      {} as never,
    );
    expect((await service.listPlans()).map((p) => p.id)).toEqual([
      'basic',
      'starter',
    ]);
  });

  it('Super Admin sees every plan, inactive ones marked isActive: false', async () => {
    const findMany = jest.fn(async () => [
      BASIC,
      STARTER,
      { ...DEMO, isActive: false },
    ]);
    const service = new AdminBillingService(
      { plan: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const plans = await service.listPlans();
    expect(findMany).toHaveBeenCalledWith();
    expect(plans.find((p) => p.id === 'demo')).toMatchObject({
      isFree: false,
      isActive: false,
    });
    expect(plans.find((p) => p.id === 'basic')).toMatchObject({
      isFree: true,
      isActive: true,
    });
  });

  it('an inactive ₹0 plan can be saved; an offered one needs a price', () => {
    const input = {
      name: 'Demo',
      tagline: '',
      priceMonthly: 0,
      priceYearly: 0,
      isFree: false,
      limits: { users: 50, projects: 50, landingPages: 20, templates: 20 },
      modules: { teamChat: true, metaLeadAds: true, metaPages: null },
    } as never;
    expect(validateAdminPlan(input, { ...DEMO, isActive: false })).toBeNull();
    expect(validateAdminPlan(input, DEMO)).toBe(
      'A paid plan needs a monthly price.',
    );
  });

  it('can be deleted once no organisation is on it; while one is, the message names it', async () => {
    const subscriptions: { organisation: { name: string } }[] = [
      { organisation: { name: 'Skyline Demo Realty' } },
    ];
    const del = jest.fn(async () => DEMO);
    const service = new PlansService({
      plan: { findUnique: async () => DEMO, delete: del },
      subscription: { findMany: async () => subscriptions },
    } as never);
    await expect(service.remove('demo')).rejects.toThrow(
      /"Demo" can't be deleted while organisations are on it \(Skyline Demo Realty\)/,
    );
    expect(del).not.toHaveBeenCalled();
    subscriptions.length = 0;
    await expect(service.remove('demo')).resolves.toEqual({ success: true });
    expect(del).toHaveBeenCalledWith({ where: { id: 'demo' } });
  });

  it("Basic still can't be deleted", async () => {
    const service = new PlansService({
      plan: { findUnique: async () => BASIC },
    } as never);
    await expect(service.remove('basic')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('checkout', () => {
  it('refuses an internal plan even when asked for it by id', async () => {
    const { db } = createFakeBillingDb({
      plans: [
        { id: 'basic', name: 'Basic', priceMonthly: 0, priceYearly: 0 },
        {
          id: 'demo',
          name: 'Demo',
          priceMonthly: 0,
          priceYearly: 0,
          isSystem: false,
        },
      ],
      subscription: {
        id: 'sub-1',
        orgId: 'org-1',
        planId: 'basic',
        billingCycle: 'monthly',
        status: 'active',
        renewsAt: null,
        graceEndsAt: null,
      },
    });
    giveBillingDetails(db);
    const service = new BillingCheckoutService(
      db as never,
      {
        getMode: async () => ({ mode: 'manual', reason: 'switched_off' }),
      } as never,
      { getSellerSettings: async () => ({ state: '29' }) } as never,
      {} as never,
      new PaymentEventsService(),
      {} as never,
    );
    await expect(
      service.preview('org-1', { planId: 'demo', interval: 'monthly' }),
    ).rejects.toMatchObject({ response: { code: 'plan_not_found' } });
  });
});
