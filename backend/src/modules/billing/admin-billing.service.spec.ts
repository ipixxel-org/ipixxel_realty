import { BadRequestException } from '@nestjs/common';
import {
  AdminBillingService,
  validateAdminPlan,
} from './admin-billing.service';
import { carryV2Keys, planModulesV2, toBillingPlans } from './plan-modules';
import type { SaveAdminPlanDto } from './dto/save-admin-plan.dto';

const paidStored = { isSystem: false, priceMonthly: 2000, priceYearly: 20000 };
const freeStored = { isSystem: true, priceMonthly: 0, priceYearly: 0 };

const dto = (over: Partial<SaveAdminPlanDto> = {}): SaveAdminPlanDto => ({
  name: 'Growth',
  tagline: 'For teams',
  priceMonthly: 2500,
  priceYearly: 25000,
  isFree: false,
  limits: { users: 5, projects: 5, landingPages: null, templates: 5 },
  modules: { teamChat: true, metaLeadAds: true, metaPages: 2 },
  ...over,
});

describe('validateAdminPlan', () => {
  it('accepts a valid paid plan and a valid free plan', () => {
    expect(validateAdminPlan(dto(), paidStored)).toBeNull();
    expect(
      validateAdminPlan(
        dto({ isFree: true, priceMonthly: 0, priceYearly: 0 }),
        freeStored,
      ),
    ).toBeNull();
  });

  it('rejects each kind of bad input with a readable reason', () => {
    expect(validateAdminPlan(dto({ name: '  ' }), paidStored)).toMatch(
      /plan name/,
    );
    expect(validateAdminPlan(dto({ isFree: true }), paidStored)).toMatch(
      /Only the default Basic plan/,
    );
    expect(
      validateAdminPlan(
        dto({ isFree: false, priceMonthly: 100, priceYearly: 1000 }),
        freeStored,
      ),
    ).toMatch(/must stay free/);
    expect(
      validateAdminPlan(
        dto({ isFree: true, priceMonthly: 100, priceYearly: 0 }),
        freeStored,
      ),
    ).toMatch(/can't have a price/);
    expect(validateAdminPlan(dto({ priceMonthly: 0 }), paidStored)).toMatch(
      /needs a monthly price/,
    );
    expect(validateAdminPlan(dto({ priceYearly: 0 }), paidStored)).toMatch(
      /needs a yearly price/,
    );
    expect(
      validateAdminPlan(dto({ priceMonthly: 1999.5 }), paidStored),
    ).toMatch(/whole number of rupees/);
    expect(validateAdminPlan(dto({ priceYearly: -1 }), paidStored)).toMatch(
      /whole number of rupees/,
    );
    expect(
      validateAdminPlan(
        dto({
          limits: { users: -1, projects: 1, landingPages: 1, templates: 1 },
        }),
        paidStored,
      ),
    ).toMatch(/Users must be/);
    expect(
      validateAdminPlan(
        dto({
          limits: { users: 1, projects: 2.5, landingPages: 1, templates: 1 },
        }),
        paidStored,
      ),
    ).toMatch(/Projects must be/);
    expect(
      validateAdminPlan(
        dto({ modules: { teamChat: true, metaLeadAds: true, metaPages: 0 } }),
        paidStored,
      ),
    ).toMatch(/at least 1 page/);
  });
});

describe('AdminBillingService.savePlan', () => {
  const stored = {
    id: 'p1',
    name: 'Growth',
    description: 'old',
    priceMonthly: 2000,
    priceYearly: 20000,
    limits: { users: 3, landingPagesCreate: 10 },
    capabilities: { publishing: true, whatsappIntegration: true },
    isSystem: false,
    isActive: true,
    createdAt: new Date('2026-01-01'),
  };
  const make = () => {
    let row = { ...stored };
    const prisma = {
      plan: {
        findUnique: jest.fn(() => Promise.resolve(row)),
        findUniqueOrThrow: jest.fn(() => Promise.resolve(row)),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          row = { ...row, ...data };
          return Promise.resolve(row);
        }),
        findMany: jest.fn(() => Promise.resolve([row])),
      },
    };
    return {
      prisma,
      service: new AdminBillingService(
        prisma as never,
        {} as never,
        {} as never,
      ),
    };
  };

  it('saves prices, limits and modules, keeping fields v2 does not edit', async () => {
    const { prisma, service } = make();
    const saved = await service.savePlan('p1', dto());
    const data = prisma.plan.update.mock.calls[0][0].data;
    expect(data.limits).toEqual({
      users: 5,
      projects: 5,
      landingPages: null,
      templates: 5,
      landingPagesCreate: 10,
      metaPages: 2,
    });
    expect(data.capabilities).toEqual({
      publishing: true,
      whatsappIntegration: true,
      teamChat: true,
      metaLeadAds: true,
    });
    expect(saved).toMatchObject({
      priceMonthly: 2500,
      tagline: 'For teams',
      limits: { users: 5, landingPages: null },
      modules: { metaPages: 2, whatsapp: true },
    });
  });

  it('refuses an invalid save without writing', async () => {
    const { prisma, service } = make();
    await expect(
      service.savePlan('p1', dto({ priceMonthly: 0 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.plan.update).not.toHaveBeenCalled();
  });
});

describe('plan modules', () => {
  it('reads unset team chat / Meta lead ads as on and unlimited (not plan-gated today)', () => {
    expect(planModulesV2({ capabilities: {}, limits: {} })).toEqual({
      teamChat: true,
      metaLeadAds: true,
      metaPages: null,
      whatsapp: false,
      aiCalling: false,
    });
    expect(
      planModulesV2({
        capabilities: { teamChat: false, metaLeadAds: false },
        limits: { metaPages: 3 },
      }),
    ).toMatchObject({ teamChat: false, metaLeadAds: false, metaPages: 0 });
  });

  it('ranks the free plan first, then by price', () => {
    const row = (id: string, price: number, isSystem = false) => ({
      id,
      name: id,
      description: null,
      priceMonthly: price,
      priceYearly: price * 10,
      limits: {},
      capabilities: {},
      isSystem,
      isActive: true,
      createdAt: new Date(),
    });
    expect(
      toBillingPlans([
        row('pro', 5000),
        row('basic', 0, true),
        row('growth', 2000),
      ]).map((p) => [p.id, p.rank]),
    ).toEqual([
      ['basic', 0],
      ['growth', 1],
      ['pro', 2],
    ]);
  });

  it('carries v2-only keys over a legacy save that replaces the maps', () => {
    const out = carryV2Keys(
      { limits: { metaPages: 2, users: 1 }, capabilities: { teamChat: false } },
      { limits: { users: 9 }, capabilities: { publishing: true } },
    );
    expect(out).toEqual({
      limits: { users: 9, metaPages: 2 },
      capabilities: { publishing: true, teamChat: false },
    });
    expect(carryV2Keys({ limits: {}, capabilities: {} }, {})).toEqual({});
  });
});
