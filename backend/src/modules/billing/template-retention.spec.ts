/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { ForbiddenException } from '@nestjs/common';
import { applyPlanChange } from '../../common/utils/plan-change.util';
import {
  countOrgTemplates,
  usageOverLimits,
} from '../../common/utils/plan-quota.util';
import {
  applyRetention,
  pickRetention,
  rankRetention,
  type RetentionTemplate,
} from '../../common/utils/retention.util';
import * as lifecycle from '../../common/utils/subscription-lifecycle.util';
import { OrgLandingPagesService } from '../org-landing-pages/org-landing-pages.service';
import { PaymentEventsService } from '../payments/payment-events';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingRetentionService } from './billing-retention.service';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

/**
 * Templates in "choose what stays": over a smaller plan's template limit the
 * extra templates are paused (no new landing pages from them); pages already
 * made from them are separate copies and stay live and editable.
 */

const DAY = 86_400_000;
const d = (days: number) => new Date(Date.now() + days * DAY);

const tpl = (
  id: string,
  over: Partial<RetentionTemplate> = {},
): RetentionTemplate => ({
  id,
  name: id,
  pagesMade: 0,
  lastUsedAt: null,
  assignedAt: d(-30),
  paused: false,
  ...over,
});

describe('template default picks', () => {
  it('most landing pages made, then most recently used, then most recently assigned', () => {
    const ranked = rankRetention({
      users: [],
      projects: [],
      landingPages: [],
      templates: [
        tpl('new-unused', { assignedAt: d(-1) }),
        tpl('old-unused', { assignedAt: d(-40) }),
        tpl('two-pages-old', { pagesMade: 2, lastUsedAt: d(-20) }),
        tpl('two-pages-recent', { pagesMade: 2, lastUsedAt: d(-2) }),
        tpl('five-pages', { pagesMade: 5, lastUsedAt: d(-50) }),
      ],
    });
    expect(ranked.templates.map((t) => t.id)).toEqual([
      'five-pages',
      'two-pages-recent',
      'two-pages-old',
      'new-unused',
      'old-unused',
    ]);
    const limits = {
      users: Infinity,
      projects: Infinity,
      landingPages: Infinity,
      templates: 2,
    };
    expect(pickRetention(ranked, limits, null).templates).toEqual([
      'five-pages',
      'two-pages-recent',
    ]);
    // A saved choice wins; one saved before templates existed (null) uses the defaults.
    const saved = { users: [], projects: [], landingPages: [] };
    expect(
      pickRetention(ranked, limits, { ...saved, templates: ['old-unused'] })
        .templates,
    ).toEqual(['old-unused']);
    expect(
      pickRetention(ranked, limits, { ...saved, templates: null }).templates,
    ).toEqual(['five-pages', 'two-pages-recent']);
  });
});

/* ------------------------------------------------------------ with a db */

const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  isSystem: true,
  limits: { users: 10, projects: 10, landingPages: 10, templates: 1 },
};
const GROWTH = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 2000,
  priceYearly: 20000,
  limits: { users: 10, projects: 10, landingPages: 10, templates: 5 },
};

function setup(planId = 'growth') {
  const assignment = (templateId: string, assignedDaysAgo: number) => ({
    id: `ot-${templateId}`,
    orgId: 'org-1',
    templateId,
    assignedAt: d(-assignedDaysAgo),
    billingPausedAt: null,
    template: { name: `Template ${templateId}` },
  });
  const { db } = createFakeBillingDb({
    plans: [BASIC, GROWTH],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId,
      billingCycle: 'monthly',
      status: 'active',
      amount: planId === 'growth' ? 2000 : 0,
      renewsAt: d(10),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      movedToBasicAt: null,
    },
    templates: [assignment('t-used', 20), assignment('t-spare', 1)],
    landingPages: [
      {
        id: 'lp-from-spare',
        orgId: 'org-1',
        name: 'Made from the spare one',
        slug: 'spare',
        pageType: 'landing',
        status: 'published',
        sourceTemplateId: 't-spare',
        billingOfflineAt: null,
        parentId: null,
        createdAt: d(-5),
      },
      {
        id: 'lp-a',
        orgId: 'org-1',
        name: 'A',
        slug: 'a',
        pageType: 'landing',
        status: 'published',
        sourceTemplateId: 't-used',
        billingOfflineAt: null,
        parentId: null,
        createdAt: d(-9),
      },
      {
        id: 'lp-b',
        orgId: 'org-1',
        name: 'B',
        slug: 'b',
        pageType: 'landing',
        status: 'draft',
        sourceTemplateId: 't-used',
        billingOfflineAt: null,
        parentId: null,
        createdAt: d(-8),
      },
    ],
  });
  const assigned = (id: string) =>
    db.organisationTemplate.rows.find((r: any) => r.templateId === id);
  return { db, assigned };
}

describe('pausing templates on a smaller plan', () => {
  it('pauses the extras, leaves pages made from them live, ignores paused ones in the quota; upgrading unpauses', async () => {
    const { db, assigned } = setup();
    const res = await applyRetention(db as never, 'org-1', BASIC);
    // Basic allows 1 template: t-used (2 pages made) stays, t-spare (1) is paused.
    expect(res.paused.templates).toBe(1);
    expect(assigned('t-used').billingPausedAt).toBeNull();
    expect(assigned('t-spare').billingPausedAt).toBeInstanceOf(Date);
    // The page made from the paused template is untouched.
    expect(
      db.landingPage.rows.find((p: any) => p.id === 'lp-from-spare'),
    ).toMatchObject({ status: 'published', billingOfflineAt: null });

    // The template quota counts only the non-paused one, so Basic now fits.
    expect(await countOrgTemplates(db as never, 'org-1')).toBe(1);
    expect(
      (await usageOverLimits(db as never, 'org-1', BASIC)).map((o) => o.key),
    ).not.toContain('templates');

    // Buying Growth again unpauses it.
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
    expect(assigned('t-spare').billingPausedAt).toBeNull();
    expect(await countOrgTemplates(db as never, 'org-1')).toBe(2);
  });

  it('choose what stays lists templates with the default pick and saves the choice', async () => {
    const { db, assigned } = setup('basic');
    const retention = new BillingRetentionService(db as never);
    const c = await retention.getChoices('org-1', 'basic');
    expect(c.templates.map((t) => [t.id, t.defaultPicked, t.reason])).toEqual([
      ['t-used', true, expect.stringMatching(/^2 landing pages made from it/)],
      ['t-spare', false, expect.stringMatching(/^1 landing page made from it/)],
    ]);
    // Already on Basic: saving swaps what's paused straight away.
    await retention.saveChoices('org-1', 'u-admin', {
      targetPlanId: 'basic',
      userIds: ['u-admin'],
      projectIds: [],
      landingPageIds: [],
      templateIds: ['t-spare'],
    });
    expect(assigned('t-used').billingPausedAt).toBeInstanceOf(Date);
    expect(assigned('t-spare').billingPausedAt).toBeNull();
    expect((await retention.paused('org-1')).pausedTemplateIds).toEqual([
      't-used',
    ]);
    await expect(
      retention.saveChoices('org-1', 'u-admin', {
        targetPlanId: 'basic',
        userIds: ['u-admin'],
        projectIds: [],
        landingPageIds: [],
        templateIds: ['t-spare', 't-used'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'retention_over_limit' },
    });
  });
});

describe('a template conflict goes through choose what stays (manual mode)', () => {
  function checkout(db: any) {
    giveBillingDetails(db);
    return new BillingCheckoutService(
      db as never,
      {
        getMode: async () => ({ mode: 'manual', reason: 'switched_off' }),
      } as never,
      {
        getSellerSettings: async () => ({
          legalName: 'iPixxel',
          gstin: null,
          state: '29',
          addressLine1: null,
          addressLine2: null,
          city: null,
          pincode: null,
        }),
      } as never,
      { createOrder: jest.fn() } as never,
      new PaymentEventsService(),
      { submitOrgRequest: jest.fn() } as never,
    );
  }

  it('shows a usageConflict, not a usageError, and fits once templates are chosen', async () => {
    // On Basic with 2 templates; Starter costs more but allows only 1.
    const { db } = setup('basic');
    db.plan.rows.push({
      id: 'starter',
      name: 'Starter',
      priceMonthly: 1000,
      priceYearly: 10000,
      isActive: true,
      isSystem: false,
      limits: { users: 10, projects: 10, landingPages: 10, templates: 1 },
      capabilities: {},
      createdAt: new Date(0),
    });
    const service = checkout(db);
    const toStarter = { planId: 'starter', interval: 'monthly' } as const;
    const preview = await service.preview('org-1', toStarter);
    expect(preview.usageError).toBeNull();
    expect(preview.usageConflict).toEqual({
      items: [{ key: 'templates', limit: 1, used: 2 }],
      choicesFit: false,
    });
    await expect(
      service.start('org-1', 'u-admin', toStarter),
    ).rejects.toMatchObject({
      response: {
        code: 'choose_what_stays',
        message:
          'Starter allows 1 template; you have 2. Choose which 1 stay active when this change is approved.',
      },
    });

    await new BillingRetentionService(db as never).saveChoices(
      'org-1',
      'u-admin',
      {
        targetPlanId: 'starter',
        userIds: ['u-admin'],
        projectIds: [],
        landingPageIds: [],
        templateIds: ['t-spare'],
      },
    );
    expect(
      (await service.preview('org-1', toStarter)).usageConflict,
    ).toMatchObject({ choicesFit: true });
  });
});

describe('a paused template can not be used for a new landing page', () => {
  const body = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return (e as ForbiddenException).getResponse?.() as Record<string, any>;
    }
    return null;
  };
  afterEach(() => jest.restoreAllMocks());

  it('refuses with plan_locked / template_paused', async () => {
    jest
      .spyOn(lifecycle, 'assertOrgLandingPageQuota')
      .mockResolvedValue(undefined);
    const prisma: any = {
      organisationTemplate: {
        findUnique: jest.fn(async () => ({
          orgId: 'org-1',
          templateId: 't-spare',
          billingPausedAt: new Date(),
        })),
      },
      template: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new OrgLandingPagesService(
      prisma,
      {} as never,
      {} as never,
    );
    expect(
      await body(
        service.create('org-1', { name: 'New', templateId: 't-spare' } as any),
      ),
    ).toMatchObject({ code: 'plan_locked', lock: 'template_paused' });
    expect(prisma.template.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a page already made from it stays editable and publishable', async () => {
    jest.spyOn(lifecycle, 'assertOrgCanPublish').mockResolvedValue(undefined);
    const page = {
      id: 'lp-from-spare',
      orgId: 'org-1',
      name: 'Made from the spare one',
      slug: 'spare',
      status: 'draft',
      pageType: 'landing',
      sourceTemplateId: 't-spare',
      billingOfflineAt: null,
      content: {},
      children: [{ id: 'ty', name: 'Thanks', slug: 'ty', status: 'draft' }],
      parent: null,
      orgDomainRequests: [],
    };
    const prisma: any = {
      landingPage: {
        findFirst: jest.fn(async () => page),
        update: jest.fn(async ({ data }: any) => ({ ...page, ...data })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      organisation: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const service = new OrgLandingPagesService(
      prisma,
      {} as never,
      { captureLandingPage: jest.fn() } as never,
    );
    const updated = await service.update('org-1', 'lp-from-spare', {
      name: 'Renamed',
    });
    expect(updated).toMatchObject({ name: 'Renamed' });
    await expect(
      service.publish('org-1', 'lp-from-spare'),
    ).resolves.toBeTruthy();
  });
});
