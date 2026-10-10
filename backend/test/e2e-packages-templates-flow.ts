import { PrismaClient } from '@prisma/client';
import { canPlanAccessTier } from '../src/common/utils/subscription-lifecycle.util';
import { resolveLimit, countOrgLandingPages, countOrgTotalLandingPages } from '../src/common/utils/plan-quota.util';
import { snapshotFromProject, bindLandingPageContent } from '../src/common/utils/landing-page-property.util';
import { OrgLandingPagesService } from '../src/modules/org-landing-pages/org-landing-pages.service';
import { OrgTemplatesService } from '../src/modules/org-templates/org-templates.service';

const prisma = new PrismaClient();

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING END-TO-END TEMPLATE & LANDING PAGE MANAGEMENT SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // --- Step 0: Create Clean Test Sandbox Data ---
  console.log('--- Step 0: Preparing Test Fixtures ---');
  const orgSlug = `test-org-${Date.now()}`;
  const testOrg = await prisma.organisation.create({
    data: {
      name: 'Test E2E Realty Org',
      slug: orgSlug,
      city: 'Bangalore',
      status: 'active',
      country: 'India',
      currency: 'INR',
    },
  });

  // Plans
  const freePlan = await prisma.plan.create({
    data: {
      name: 'Test Free Plan',
      slug: `free-${Date.now()}`,
      priceMonthly: 0,
      priceYearly: 0,
      limits: { projects: 1, users: 1, templates: 2, landingPages: 0, landingPagesCreate: 2 },
      capabilities: { publishing: false, paidTemplates: false, premiumTemplates: false },
    },
  });

  const starterPlan = await prisma.plan.create({
    data: {
      name: 'Test Starter Plan',
      slug: `starter-${Date.now()}`,
      priceMonthly: 2999,
      priceYearly: 29990,
      limits: { projects: 5, users: 2, templates: 2, landingPages: 1, landingPagesCreate: 5 },
      capabilities: { publishing: true, paidTemplates: true, premiumTemplates: false },
    },
  });

  const premiumPlan = await prisma.plan.create({
    data: {
      name: 'Test Premium Plan',
      slug: `premium-${Date.now()}`,
      priceMonthly: 15000,
      priceYearly: 150000,
      limits: { projects: 50, users: 20, templates: 10, landingPages: 10, landingPagesCreate: 20 },
      capabilities: { publishing: true, paidTemplates: true, premiumTemplates: true },
    },
  });

  // Templates in 3 tiers
  const freeTpl = await prisma.template.create({
    data: {
      name: 'Test Free Template',
      slug: `free-tpl-${Date.now()}`,
      tier: 'free',
      status: 'published',
      pageType: 'landing',
      designId: 'modern-oasis',
      baseDesignName: 'Modern Oasis',
      content: {
        engine: 'openpage',
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            config: {
              title: '{{project.name}}',
              tagline: '{{project.tagline}}',
              location: '{{project.location}}',
              price: '{{project.priceRange}}',
            },
          },
          {
            id: 'units-1',
            type: 'unit_plans',
            config: {
              heading: 'Available Residences',
            },
          },
        ],
      } as any,
    },
  });

  const paidTpl = await prisma.template.create({
    data: {
      name: 'Test Paid Template',
      slug: `paid-tpl-${Date.now()}`,
      tier: 'paid',
      status: 'published',
      pageType: 'landing',
      designId: 'urban-nest',
      baseDesignName: 'Urban Nest',
      content: { engine: 'openpage', sections: [] } as any,
    },
  });

  const premTpl = await prisma.template.create({
    data: {
      name: 'Test Premium Template',
      slug: `prem-tpl-${Date.now()}`,
      tier: 'premium',
      status: 'published',
      pageType: 'landing',
      designId: 'luxury-villa',
      baseDesignName: 'Luxury Villa',
      content: { engine: 'openpage', sections: [] } as any,
    },
  });

  const mockStorage: any = { createUploadUrl: async () => ({}) };
  const templatesService = new OrgTemplatesService(prisma as any);
  const landingPagesService = new OrgLandingPagesService(prisma as any, mockStorage, {} as any);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Template Access by Package Tier
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Template Access by Package Tier ---');

    // Attach Free Plan to Org
    let sub = await prisma.subscription.create({
      data: {
        orgId: testOrg.id,
        planId: freePlan.id,
        billingCycle: 'monthly',
        status: 'active',
        amount: 0,
        currency: 'INR',
        renewsAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    // 1.1 Free template on Free plan -> Allowed
    const freeRes = await templatesService.assignTemplate(freeTpl.id, testOrg.id);
    assert(freeRes.success === true, 'Free template can be assigned on Free Plan');

    // 1.2 Paid template on Free plan -> Blocked
    let paidBlocked = false;
    try {
      await templatesService.assignTemplate(paidTpl.id, testOrg.id);
    } catch (err: any) {
      paidBlocked = err.message?.includes('Paid template') || err.status === 403;
    }
    assert(paidBlocked, 'Paid template assignment is strictly blocked on Free Plan');

    // 1.3 Premium template on Free plan -> Blocked
    let premBlocked = false;
    try {
      await templatesService.assignTemplate(premTpl.id, testOrg.id);
    } catch (err: any) {
      premBlocked = err.message?.includes('Premium template') || err.status === 403;
    }
    assert(premBlocked, 'Premium template assignment is strictly blocked on Free Plan');

    // Switch Org to Starter Plan (Paid)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: starterPlan.id },
    });

    // 1.4 Paid template on Starter Plan -> Allowed
    const paidRes = await templatesService.assignTemplate(paidTpl.id, testOrg.id);
    assert(paidRes.success === true, 'Paid template can be assigned on Starter Plan');

    // 1.5 Premium template on Starter Plan -> Blocked
    let premBlockedOnStarter = false;
    try {
      await templatesService.assignTemplate(premTpl.id, testOrg.id);
    } catch (err: any) {
      premBlockedOnStarter = err.message?.includes('Premium template') || err.status === 403;
    }
    assert(premBlockedOnStarter, 'Premium template assignment is strictly blocked on Starter Plan');

    // Switch Org to Premium Plan
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: premiumPlan.id },
    });

    // 1.6 Premium template on Premium Plan -> Allowed
    const premRes = await templatesService.assignTemplate(premTpl.id, testOrg.id);
    assert(premRes.success === true, 'Premium template can be assigned on Premium Plan');

    // -------------------------------------------------------------------------
    // TEST 2: Landing Page Creation (Scratch & Drafts when Publishing Disabled)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Landing Page Creation & Publishing Independence ---');

    // Revert to Free Plan (where publishing: false, landingPages: 0, landingPagesCreate: 2)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: freePlan.id },
    });

    // 2.1 Create Page 1 from scratch (no templateId)
    const scratchPage1 = await landingPagesService.create(testOrg.id, {
      name: 'Scratch Lead Page 1',
      content: { sections: [], config: {}, engine: 'openpage' } as any,
    });
    assert(!!scratchPage1 && scratchPage1.status === 'draft', 'Organization can create landing page from scratch');

    // 2.2 Create Page 2 from scratch (no templateId)
    const scratchPage2 = await landingPagesService.create(testOrg.id, {
      name: 'Scratch Lead Page 2',
      content: { sections: [], config: {}, engine: 'openpage' } as any,
    });
    assert(!!scratchPage2 && scratchPage2.status === 'draft', 'Organization can create multiple landing pages from scratch');

    // 2.3 Verify publishing is blocked for Free Plan
    let publishBlockedNoPerm = false;
    try {
      await landingPagesService.publish(testOrg.id, scratchPage1.id);
    } catch (err: any) {
      publishBlockedNoPerm = err.message?.includes('does not include Publishing') || err.status === 403;
    }
    assert(publishBlockedNoPerm, 'Publishing is blocked when package publishing capability is disabled');

    // -------------------------------------------------------------------------
    // TEST 3: Creation Limit Enforcement (landingPagesCreate)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Creation Limit Enforcement (landingPagesCreate) ---');

    // Free plan has landingPagesCreate: 2. Org already has 2 pages.
    let creationLimitBlocked = false;
    try {
      await landingPagesService.create(testOrg.id, {
        name: 'Scratch Lead Page 3 (Over Limit)',
        content: { sections: [], config: {}, engine: 'openpage' } as any,
      });
    } catch (err: any) {
      creationLimitBlocked = err.message?.includes('creation limit reached') || err.status === 400;
    }
    assert(creationLimitBlocked, 'Creation blocked when total created pages reach landingPagesCreate quota');

    // -------------------------------------------------------------------------
    // TEST 4: Publishing Limits (landingPages Quota)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Publishing Limits (landingPages Quota) ---');

    // Switch Org to Starter Plan (landingPages: 1, publishing: true)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: starterPlan.id },
    });

    // 4.1 Publish Page 1 -> Allowed (published count = 1)
    const pubPage1 = await landingPagesService.publish(testOrg.id, scratchPage1.id);
    assert(pubPage1.status === 'published', 'First page publishes successfully on Starter Plan (within limit of 1)');

    // 4.2 Publish Page 2 -> Blocked (quota is 1, attempting 2)
    let publishLimitExceeded = false;
    try {
      await landingPagesService.publish(testOrg.id, scratchPage2.id);
    } catch (err: any) {
      publishLimitExceeded = err.message?.includes('Publishing limit reached') || err.status === 403;
    }
    assert(publishLimitExceeded, 'Publishing second page is blocked when package limit is 1');

    // 4.3 Unpublish Page 1 -> Publish Page 2 -> Allowed
    await landingPagesService.unpublish(testOrg.id, scratchPage1.id);
    const pubPage2 = await landingPagesService.publish(testOrg.id, scratchPage2.id);
    assert(pubPage2.status === 'published', 'Page 2 can be published after Page 1 is unpublished');

    // -------------------------------------------------------------------------
    // TEST 5: Project → Template Auto Data Population Flow
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Project → Template Auto Data Population Flow ---');

    // Create a rich Project in the organisation
    const project = await prisma.project.create({
      data: {
        orgId: testOrg.id,
        name: 'Prestige Azure Bay',
        tagline: 'Ultra-Luxury Waterfront Living',
        location: 'Marine Drive, Mumbai',
        city: 'Mumbai',
        locality: 'Marine Drive',
        status: 'active',
        priceMin: 25000000,
        priceMax: 75000000,
        currency: 'INR',
        amenities: [{ name: 'Infinity Pool' }, { name: 'Panoramic Sky Lounge' }],
        unitTypes: {
          create: [
            { name: '3 BHK Grande', fieldDefaults: { area: 1850 }, totalUnits: 24 },
            { name: '4 BHK Sky Suite', fieldDefaults: { area: 2900 }, totalUnits: 12 },
          ],
        },
      },
      include: { unitTypes: true },
    });

    // Create Landing Page bound to this project using freeTpl
    const projectLp = await landingPagesService.create(testOrg.id, {
      name: 'Prestige Azure Bay — Official Launch',
      templateId: freeTpl.id,
      projectId: project.id,
    });

    assert(!!projectLp, 'Project-bound landing page created successfully');

    // Verify auto data population in content
    const content = projectLp.content as any;
    const heroSection = content?.sections?.find((s: any) => s.type === 'hero');
    assert(
      heroSection?.config?.title === 'Prestige Azure Bay',
      `Project name auto-populated into template hero title (got: "${heroSection?.config?.title}")`,
    );
    assert(
      heroSection?.config?.tagline === 'Ultra-Luxury Waterfront Living',
      `Project tagline auto-populated into template hero tagline (got: "${heroSection?.config?.tagline}")`,
    );
    assert(
      heroSection?.config?.location === 'Marine Drive, Mumbai',
      `Project location auto-populated into template hero location (got: "${heroSection?.config?.location}")`,
    );

    // -------------------------------------------------------------------------
    // TEST 6: Super Admin Package Management (Dynamic Reconfiguration)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Super Admin Dynamic Package Management ---');

    // Update Starter Plan dynamically: increase landingPages limit from 1 to 5
    await prisma.plan.update({
      where: { id: starterPlan.id },
      data: {
        limits: {
          projects: 5,
          users: 2,
          templates: 5,
          landingPages: 5,
          landingPagesCreate: 10,
        },
      },
    });

    // Now publishing the project landing page (which was previously blocked by quota 1) should SUCCEED!
    const pubProjectLp = await landingPagesService.publish(testOrg.id, projectLp.id);
    assert(
      pubProjectLp.status === 'published',
      'Dynamic package limit expansion by Super Admin took immediate effect for the organization',
    );

    console.log('\n===============================================================');
    console.log(`🎉 ALL TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Clean up test sandbox data
    console.log('\nCleaning up test sandbox data…');
    await prisma.landingPage.deleteMany({ where: { orgId: testOrg.id } });
    await prisma.unitType.deleteMany({ where: { project: { orgId: testOrg.id } } });
    await prisma.project.deleteMany({ where: { orgId: testOrg.id } });
    await prisma.organisationTemplate.deleteMany({ where: { orgId: testOrg.id } });
    await prisma.subscription.deleteMany({ where: { orgId: testOrg.id } });
    await prisma.template.deleteMany({ where: { id: { in: [freeTpl.id, paidTpl.id, premTpl.id] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [freePlan.id, starterPlan.id, premiumPlan.id] } } });
    await prisma.organisation.delete({ where: { id: testOrg.id } });
    await prisma.$disconnect();
    console.log('Cleanup complete.');
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  prisma.$disconnect();
  process.exit(1);
});
