import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  DEFAULT_ATTRIBUTION_LABELS,
  DEFAULT_MARKETING_PLATFORMS,
} from '../src/common/utils/lead-attribution.util';
import { seedVisualBuilderTemplates } from './seed-visual-builder-templates';

// Place this at: prisma/seed.ts
// Run with: npx prisma db seed
//
// Seeds:
//   1. Roles catalogue (super_admin / admin / manager / sales)
//   2. Super Admin account (from env, optional)
//   3. A demo organisation + org admin (no extra sales/users roster)
//   4. Demo landing pages (empty until published content is added)
//   5. Demo CRM leads for Lead Center (website + Meta + Google attributed)
//   6. Marketing hub dummy data (connections, campaigns, sync logs, metrics)
//
// No demo Project is seeded — project types are fully dynamic now (see
// ProjectTypeDef), so a hardcoded project has no template to match. Create
// one through the product instead (Settings → Project types → add a project).
//
const prisma = new PrismaClient();

const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'Welcome@123';
const DEMO_META_PAGE_ID = 'demo_page_skylinedev';
const DEMO_GOOGLE_ACCOUNT_ID = 'demo_google_ads_skylinedev';
const DEMO_TOKEN = 'demo_seed_token_not_for_production';

interface AgentSeed {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: 'admin' | 'manager' | 'sales';
  status: 'active' | 'disabled';
}

const AGENTS: AgentSeed[] = [
  {
    firstName: 'Rohan',
    lastName: 'Shah',
    email: 'rohan@skylinedev.in',
    phone: '+91 98250 11020',
    role: 'admin',
    status: 'active',
  },
];

async function seedRoles() {
  const roles = [
    {
      key: 'super_admin',
      name: 'Super Admin',
      scope: 'platform' as const,
      sortOrder: 0,
    },
    {
      key: 'admin',
      name: 'Admin',
      scope: 'organisation' as const,
      sortOrder: 1,
    },
    { key: 'manager', name: 'Manager', scope: 'team' as const, sortOrder: 2 },
    { key: 'sales', name: 'Sales', scope: 'team' as const, sortOrder: 3 },
    {
      key: 'telecaller',
      name: 'Telecaller',
      scope: 'team' as const,
      sortOrder: 4,
    },
  ];

  for (const role of roles) {
    const existingRole = await prisma.role.findFirst({
      where: { orgId: null, key: role.key },
    });
    if (existingRole) {
      // no fields to update — system role definitions are fixed
    } else {
      await prisma.role.create({ data: role });
    }
  }
  console.log(`Seeded ${roles.length} roles.`);
  return roles;
}

async function seedSuperAdmin() {
  const superAdminEmail =
    process.env.SUPER_ADMIN_EMAIL ?? 'admin@realestate.com';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!superAdminPassword) {
    console.warn(
      'SUPER_ADMIN_PASSWORD not set in env — skipping Super Admin creation. ' +
        'Set it and re-run: SUPER_ADMIN_PASSWORD=yourpassword npx prisma db seed',
    );
    return;
  }

  const passwordHash = await bcrypt.hash(superAdminPassword, 12);
  const superAdminRole = await prisma.role.findFirstOrThrow({
    where: { orgId: null, key: 'super_admin' },
  });

  const existing = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });
  if (!existing) {
    const user = await prisma.user.create({
      data: {
        orgId: null,
        email: superAdminEmail,
        passwordHash,
        status: 'active',
        mustChangePassword: false,
        onboardingStep: 'completed',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: superAdminRole.id },
    });
    console.log(`Super Admin created: ${superAdminEmail}`);
  } else {
    console.log(`Super Admin already exists: ${superAdminEmail} — skipped.`);
  }
}

async function seedDemoOrg() {
  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 12);

  // --- Organisation ---------------------------------------------------------
  const org = await prisma.organisation.upsert({
    where: { slug: 'skylinedev' },
    update: {
      name: 'Skyline Developers',
      city: 'Mumbai',
      status: 'active',
      industry: 'developer',
      teamSize: '11–50',
      country: 'India',
      state: 'Maharashtra',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    },
    create: {
      name: 'Skyline Developers',
      slug: 'skylinedev',
      city: 'Mumbai',
      status: 'active',
      industry: 'developer',
      teamSize: '11–50',
      country: 'India',
      state: 'Maharashtra',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    },
  });

  // --- Org admin (login). Extra demo sales users are not seeded. ------------
  const userIds: Record<string, string> = {};
  for (const agent of AGENTS) {
    const role = await prisma.role.findFirstOrThrow({
      where: { orgId: null, key: agent.role },
    });

    const user = await prisma.user.upsert({
      where: { email: agent.email },
      update: {
        orgId: org.id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        phoneNumber: agent.phone,
        status: agent.status,
      },
      create: {
        orgId: org.id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        phoneNumber: agent.phone,
        passwordHash,
        status: agent.status,
        onboardingStep: 'completed',
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    userIds[agent.email] = user.id;
  }
  console.log(
    `Org admin seeded: rohan@skylinedev.in — password: ${SEED_USER_PASSWORD}`,
  );

  // Demo project seeding was removed — it predated fully dynamic project
  // types and had no ProjectTypeDef/template to match, so it was never a
  // useful demonstration of the current feature. Recreate one manually
  // through the product (Settings → Project types → add a project) if a
  // demo project is needed again.
  const managerId = userIds['rohan@skylinedev.in'];

  await prisma.templateCategory.upsert({
    where: { slug: 'real-estate' },
    update: {},
    create: {
      name: 'Real Estate',
      slug: 'real-estate',
      tier: 'free',
    },
  });

  // Remove legacy seeded preset if it still exists.
  const legacyBuilder = await prisma.template.findUnique({
    where: { slug: 'skyline-heights-builder' },
    select: { id: true },
  });
  if (legacyBuilder) {
    await prisma.organisationTemplate.deleteMany({
      where: { templateId: legacyBuilder.id },
    });
    await prisma.landingPage.updateMany({
      where: { sourceTemplateId: legacyBuilder.id },
      data: { sourceTemplateId: null },
    });
    await prisma.template.delete({ where: { id: legacyBuilder.id } });
    console.log('Removed legacy preset template: Project launch (builder)');
  }

  // --- Landing pages --------------------------------------------------------
  const landingPages: { name: string; slug: string }[] = [
    { name: 'Palm Residency', slug: 'palm-residency' },
    { name: 'Green Vista', slug: 'green-vista' },
  ];
  const pageIds: Record<string, string> = {};
  for (const page of landingPages) {
    const row = await prisma.landingPage.upsert({
      where: { orgId_slug: { orgId: org.id, slug: page.slug } },
      update: { status: 'published' },
      create: {
        orgId: org.id,
        name: page.name,
        slug: page.slug,
        status: 'published',
        content: { sections: [] },
      },
    });
    pageIds[page.slug] = row.id;
  }
  console.log(`Landing pages seeded (${landingPages.length}) for ${org.name}.`);

  const demoLeads = [
    {
      email: 'ananya.mehta@example.com',
      source: 'website',
      formName: 'Palm Residency enquiry',
      landingPageId: pageIds['palm-residency'],
      status: 'new' as const,
      data: {
        fullName: 'Ananya Mehta',
        name: 'Ananya Mehta',
        phone: '+91 98765 43101',
        phoneNumber: '+91 98765 43101',
        email: 'ananya.mehta@example.com',
        'Interested in': '3 BHK',
      },
    },
    {
      email: 'vikram.rao@example.com',
      source: 'crm',
      formName: 'Manual lead',
      landingPageId: pageIds['green-vista'],
      status: 'contacted' as const,
      data: {
        fullName: 'Vikram Rao',
        name: 'Vikram Rao',
        phone: '+91 98765 43102',
        phoneNumber: '+91 98765 43102',
        email: 'vikram.rao@example.com',
        'Interested in': '4 BHK',
      },
    },
  ];

  let createdLeads = 0;
  for (const demo of demoLeads) {
    const existing = await prisma.lead.findFirst({
      where: {
        orgId: org.id,
        data: { path: ['email'], equals: demo.email },
      },
      select: { id: true },
    });
    if (existing) continue;

    const lead = await prisma.lead.create({
      data: {
        orgId: org.id,
        landingPageId: demo.landingPageId,
        formName: demo.formName,
        source: demo.source,
        status: demo.status,
        assignedToId: managerId,
        data: demo.data,
      },
    });
    await prisma.activityEvent.create({
      data: {
        orgId: org.id,
        agentId: managerId,
        leadId: lead.id,
        type: 'status_updated',
        text: `Lead seeded for ${demo.data.fullName}`,
      },
    });
    createdLeads += 1;
  }
  console.log(
    `Lead Center seeded: ${demoLeads.length} demo leads for ${org.name} (${createdLeads} new).`,
  );

  return { orgId: org.id, managerId, pageIds };
}

/** Attribution labels + Connected Apps + campaigns + Meta/Google demo leads. */
async function seedMarketingDemo(ctx?: {
  orgId: string;
  managerId: string;
  pageIds: Record<string, string>;
}) {
  const org =
    ctx ??
    (await (async () => {
      const o = await prisma.organisation.findUnique({
        where: { slug: 'skylinedev' },
      });
      if (!o) return null;
      const admin = await prisma.user.findUnique({
        where: { email: 'rohan@skylinedev.in' },
      });
      const pages = await prisma.landingPage.findMany({
        where: { orgId: o.id },
        select: { id: true, slug: true },
      });
      return {
        orgId: o.id,
        managerId: admin?.id ?? '',
        pageIds: Object.fromEntries(pages.map((p) => [p.slug, p.id])),
      };
    })());
  if (!org) {
    console.warn('Marketing demo seed skipped — demo org not found.');
    return;
  }

  const { orgId, managerId, pageIds } = org;
  const now = new Date();

  for (const row of DEFAULT_ATTRIBUTION_LABELS) {
    await prisma.platformAttributionLabel.upsert({
      where: { key: row.key },
      create: {
        key: row.key,
        label: row.label,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
      },
      update: {
        label: row.label,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
      },
    });
  }

  for (const row of DEFAULT_MARKETING_PLATFORMS) {
    await prisma.marketingPlatform.upsert({
      where: { key: row.key },
      create: {
        key: row.key,
        name: row.name,
        description: row.description,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
        supportsOAuth: row.supportsOAuth,
        supportsWebhook: row.supportsWebhook,
      },
      update: {
        name: row.name,
        description: row.description,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
        supportsOAuth: row.supportsOAuth,
        supportsWebhook: row.supportsWebhook,
      },
    });
  }

  await prisma.metaPageConnection.upsert({
    where: {
      orgId_pageId: { orgId, pageId: DEMO_META_PAGE_ID },
    },
    create: {
      orgId,
      pageId: DEMO_META_PAGE_ID,
      pageName: 'Skyline Developers (Demo Page)',
      accessToken: DEMO_TOKEN,
      connectedBy: managerId || null,
    },
    update: {
      pageName: 'Skyline Developers (Demo Page)',
      accessToken: DEMO_TOKEN,
      connectedBy: managerId || null,
    },
  });

  const metaConn = await prisma.marketingConnection.upsert({
    where: {
      orgId_platformKey_externalAccountId: {
        orgId,
        platformKey: 'meta',
        externalAccountId: DEMO_META_PAGE_ID,
      },
    },
    create: {
      orgId,
      platformKey: 'meta',
      status: 'connected',
      externalAccountId: DEMO_META_PAGE_ID,
      externalAccountName: 'Skyline Developers (Demo Page)',
      accessToken: DEMO_TOKEN,
      connectedBy: managerId || null,
      lastSyncAt: now,
      metadata: { demo: true, seed: true, via: 'prisma_seed' },
    },
    update: {
      status: 'connected',
      externalAccountName: 'Skyline Developers (Demo Page)',
      accessToken: DEMO_TOKEN,
      lastSyncAt: now,
      lastError: null,
      metadata: { demo: true, seed: true, via: 'prisma_seed' },
    },
  });

  for (const platformKey of ['instagram', 'whatsapp'] as const) {
    await prisma.marketingConnection.upsert({
      where: {
        orgId_platformKey_externalAccountId: {
          orgId,
          platformKey,
          externalAccountId: DEMO_META_PAGE_ID,
        },
      },
      create: {
        orgId,
        platformKey,
        status: 'connected',
        externalAccountId: DEMO_META_PAGE_ID,
        externalAccountName:
          platformKey === 'instagram'
            ? 'Skyline Instagram (Demo)'
            : 'Skyline WhatsApp Ads (Demo)',
        accessToken: DEMO_TOKEN,
        connectedBy: managerId || null,
        lastSyncAt: now,
        metadata: {
          demo: true,
          seed: true,
          via: 'prisma_seed',
          mirroredFrom: 'meta',
        },
      },
      update: {
        status: 'connected',
        lastSyncAt: now,
        lastError: null,
        metadata: {
          demo: true,
          seed: true,
          via: 'prisma_seed',
          mirroredFrom: 'meta',
        },
      },
    });
  }

  const googleConn = await prisma.marketingConnection.upsert({
    where: {
      orgId_platformKey_externalAccountId: {
        orgId,
        platformKey: 'google_ads',
        externalAccountId: DEMO_GOOGLE_ACCOUNT_ID,
      },
    },
    create: {
      orgId,
      platformKey: 'google_ads',
      status: 'connected',
      externalAccountId: DEMO_GOOGLE_ACCOUNT_ID,
      externalAccountName: 'Skyline Google Ads (Demo)',
      accessToken: DEMO_TOKEN,
      connectedBy: managerId || null,
      lastSyncAt: now,
      metadata: { demo: true, seed: true, via: 'prisma_seed' },
    },
    update: {
      status: 'connected',
      lastSyncAt: now,
      lastError: null,
      metadata: { demo: true, seed: true, via: 'prisma_seed' },
    },
  });

  const fbCampaign = await prisma.marketingCampaign.upsert({
    where: {
      orgId_platformKey_externalId: {
        orgId,
        platformKey: 'meta',
        externalId: 'demo_fb_campaign_palm',
      },
    },
    create: {
      orgId,
      connectionId: metaConn.id,
      platformKey: 'meta',
      externalId: 'demo_fb_campaign_palm',
      name: 'Palm Residency — Lead Ads',
      status: 'ACTIVE',
      spend: new Prisma.Decimal('42850.00'),
      impressions: BigInt(312400),
      clicks: BigInt(8420),
      leadsCount: 3,
      syncedAt: now,
      metadata: { demo: true },
    },
    update: {
      connectionId: metaConn.id,
      name: 'Palm Residency — Lead Ads',
      status: 'ACTIVE',
      spend: new Prisma.Decimal('42850.00'),
      impressions: BigInt(312400),
      clicks: BigInt(8420),
      leadsCount: 3,
      syncedAt: now,
      metadata: { demo: true },
    },
  });

  const fbAdSet = await prisma.marketingAdSet.upsert({
    where: {
      campaignId_externalId: {
        campaignId: fbCampaign.id,
        externalId: 'demo_fb_adset_mumbai',
      },
    },
    create: {
      orgId,
      campaignId: fbCampaign.id,
      externalId: 'demo_fb_adset_mumbai',
      name: 'Mumbai · 25–45 · Home intent',
      status: 'ACTIVE',
      spend: new Prisma.Decimal('28100.00'),
      impressions: BigInt(198200),
      clicks: BigInt(5210),
      metadata: { demo: true },
    },
    update: {
      name: 'Mumbai · 25–45 · Home intent',
      status: 'ACTIVE',
      spend: new Prisma.Decimal('28100.00'),
      impressions: BigInt(198200),
      clicks: BigInt(5210),
      metadata: { demo: true },
    },
  });

  await prisma.marketingAd.upsert({
    where: {
      adSetId_externalId: {
        adSetId: fbAdSet.id,
        externalId: 'demo_fb_ad_carousel',
      },
    },
    create: {
      orgId,
      adSetId: fbAdSet.id,
      externalId: 'demo_fb_ad_carousel',
      name: '3 BHK carousel — Instant Form',
      status: 'ACTIVE',
      spend: new Prisma.Decimal('15420.00'),
      impressions: BigInt(112300),
      clicks: BigInt(2980),
      metadata: { demo: true },
    },
    update: {
      name: '3 BHK carousel — Instant Form',
      status: 'ACTIVE',
      spend: new Prisma.Decimal('15420.00'),
      impressions: BigInt(112300),
      clicks: BigInt(2980),
      metadata: { demo: true },
    },
  });

  const gCampaign = await prisma.marketingCampaign.upsert({
    where: {
      orgId_platformKey_externalId: {
        orgId,
        platformKey: 'google_ads',
        externalId: 'demo_gads_campaign_search',
      },
    },
    create: {
      orgId,
      connectionId: googleConn.id,
      platformKey: 'google_ads',
      externalId: 'demo_gads_campaign_search',
      name: 'Green Vista — Search',
      status: 'ENABLED',
      spend: new Prisma.Decimal('18640.50'),
      impressions: BigInt(89400),
      clicks: BigInt(3120),
      leadsCount: 2,
      syncedAt: now,
      metadata: { demo: true },
    },
    update: {
      connectionId: googleConn.id,
      name: 'Green Vista — Search',
      status: 'ENABLED',
      spend: new Prisma.Decimal('18640.50'),
      impressions: BigInt(89400),
      clicks: BigInt(3120),
      leadsCount: 2,
      syncedAt: now,
      metadata: { demo: true },
    },
  });

  await prisma.marketingAdSet.upsert({
    where: {
      campaignId_externalId: {
        campaignId: gCampaign.id,
        externalId: 'demo_gads_adgroup_brand',
      },
    },
    create: {
      orgId,
      campaignId: gCampaign.id,
      externalId: 'demo_gads_adgroup_brand',
      name: 'Brand + Project keywords',
      status: 'ENABLED',
      spend: new Prisma.Decimal('18640.50'),
      impressions: BigInt(89400),
      clicks: BigInt(3120),
      metadata: { demo: true },
    },
    update: {
      name: 'Brand + Project keywords',
      status: 'ENABLED',
      spend: new Prisma.Decimal('18640.50'),
      impressions: BigInt(89400),
      clicks: BigInt(3120),
      metadata: { demo: true },
    },
  });

  for (let i = 0; i < 7; i++) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - i);
    const spend = 4200 + i * 380;
    const clicks = 180 + i * 22;
    const impressions = 12000 + i * 900;
    const leads = i % 3 === 0 ? 1 : 0;
    await prisma.marketingMetricSnapshot.upsert({
      where: {
        orgId_platformKey_date: {
          orgId,
          platformKey: 'meta',
          date: day,
        },
      },
      create: {
        orgId,
        platformKey: 'meta',
        date: day,
        spend: new Prisma.Decimal(spend.toFixed(2)),
        impressions: BigInt(impressions),
        clicks: BigInt(clicks),
        leadsCount: leads,
        metadata: { demo: true },
      },
      update: {
        spend: new Prisma.Decimal(spend.toFixed(2)),
        impressions: BigInt(impressions),
        clicks: BigInt(clicks),
        leadsCount: leads,
        metadata: { demo: true },
      },
    });
    await prisma.marketingMetricSnapshot.upsert({
      where: {
        orgId_platformKey_date: {
          orgId,
          platformKey: 'google_ads',
          date: day,
        },
      },
      create: {
        orgId,
        platformKey: 'google_ads',
        date: day,
        spend: new Prisma.Decimal((spend * 0.45).toFixed(2)),
        impressions: BigInt(Math.round(impressions * 0.35)),
        clicks: BigInt(Math.round(clicks * 0.4)),
        leadsCount: i % 4 === 0 ? 1 : 0,
        metadata: { demo: true },
      },
      update: {
        spend: new Prisma.Decimal((spend * 0.45).toFixed(2)),
        impressions: BigInt(Math.round(impressions * 0.35)),
        clicks: BigInt(Math.round(clicks * 0.4)),
        leadsCount: i % 4 === 0 ? 1 : 0,
        metadata: { demo: true },
      },
    });
  }

  const existingLogs = await prisma.marketingSyncLog.count({
    where: { orgId, message: { contains: '[demo seed]' } },
  });
  if (existingLogs === 0) {
    await prisma.marketingSyncLog.createMany({
      data: [
        {
          orgId,
          connectionId: metaConn.id,
          platformKey: 'meta',
          direction: 'inbound',
          status: 'success',
          message: '[demo seed] Connected Facebook Page via seed',
          detail: { demo: true },
        },
        {
          orgId,
          connectionId: metaConn.id,
          platformKey: 'meta',
          direction: 'inbound',
          status: 'success',
          message: '[demo seed] Imported 3 Meta Lead Ad submissions',
          detail: { demo: true, imported: 3 },
        },
        {
          orgId,
          connectionId: googleConn.id,
          platformKey: 'google_ads',
          direction: 'inbound',
          status: 'success',
          message: '[demo seed] Google Ads account linked (demo)',
          detail: { demo: true },
        },
        {
          orgId,
          connectionId: metaConn.id,
          platformKey: 'instagram',
          direction: 'inbound',
          status: 'success',
          message: '[demo seed] Instagram connected via Meta Page mirror',
          detail: { demo: true },
        },
      ],
    });
  }

  const attributedLeads: Array<{
    email: string;
    status: 'new' | 'contacted' | 'follow_up';
    formName: string;
    landingPageId: string | null;
    source: string;
    platform: string;
    medium: string;
    campaign: string;
    campaignId: string;
    adSet: string;
    adSetId: string;
    ad: string;
    adId: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    firstTouchSource: string;
    lastTouchSource: string;
    metaLeadgenId?: string;
    metaFormId?: string;
    metaPageId?: string;
    fbclid?: string;
    gclid?: string;
    landingPageUrl?: string;
    data: Record<string, string>;
  }> = [
    {
      email: 'priya.nair.demo@example.com',
      status: 'new',
      formName: 'Meta Lead Form demo_form_palm',
      landingPageId: pageIds['palm-residency'] ?? null,
      source: 'Facebook',
      platform: 'meta',
      medium: 'Paid Social',
      campaign: 'Palm Residency — Lead Ads',
      campaignId: 'demo_fb_campaign_palm',
      adSet: 'Mumbai · 25–45 · Home intent',
      adSetId: 'demo_fb_adset_mumbai',
      ad: '3 BHK carousel — Instant Form',
      adId: 'demo_fb_ad_carousel',
      utmSource: 'Facebook',
      utmMedium: 'Paid',
      utmCampaign: 'Palm Residency — Lead Ads',
      firstTouchSource: 'Facebook',
      lastTouchSource: 'Facebook',
      metaLeadgenId: 'demo_leadgen_priya_001',
      metaFormId: 'demo_form_palm',
      metaPageId: DEMO_META_PAGE_ID,
      fbclid: 'demo_fbclid_priya',
      data: {
        fullName: 'Priya Nair',
        name: 'Priya Nair',
        phone: '+91 98765 44001',
        phoneNumber: '+91 98765 44001',
        email: 'priya.nair.demo@example.com',
        city: 'Mumbai',
      },
    },
    {
      email: 'arjun.kapoor.demo@example.com',
      status: 'contacted',
      formName: 'Meta Lead Form demo_form_palm',
      landingPageId: pageIds['palm-residency'] ?? null,
      source: 'Facebook',
      platform: 'meta',
      medium: 'Paid Social',
      campaign: 'Palm Residency — Lead Ads',
      campaignId: 'demo_fb_campaign_palm',
      adSet: 'Mumbai · 25–45 · Home intent',
      adSetId: 'demo_fb_adset_mumbai',
      ad: '3 BHK carousel — Instant Form',
      adId: 'demo_fb_ad_carousel',
      utmSource: 'Facebook',
      utmMedium: 'Paid',
      utmCampaign: 'Palm Residency — Lead Ads',
      firstTouchSource: 'Facebook',
      lastTouchSource: 'Facebook',
      metaLeadgenId: 'demo_leadgen_arjun_002',
      metaFormId: 'demo_form_palm',
      metaPageId: DEMO_META_PAGE_ID,
      data: {
        fullName: 'Arjun Kapoor',
        name: 'Arjun Kapoor',
        phone: '+91 98765 44002',
        phoneNumber: '+91 98765 44002',
        email: 'arjun.kapoor.demo@example.com',
        city: 'Thane',
      },
    },
    {
      email: 'meera.joshi.demo@example.com',
      status: 'follow_up',
      formName: 'Meta Lead Form demo_form_palm',
      landingPageId: pageIds['palm-residency'] ?? null,
      source: 'Facebook',
      platform: 'meta',
      medium: 'Paid Social',
      campaign: 'Palm Residency — Lead Ads',
      campaignId: 'demo_fb_campaign_palm',
      adSet: 'Mumbai · 25–45 · Home intent',
      adSetId: 'demo_fb_adset_mumbai',
      ad: '3 BHK carousel — Instant Form',
      adId: 'demo_fb_ad_carousel',
      utmSource: 'Facebook',
      utmMedium: 'Paid',
      utmCampaign: 'Palm Residency — Lead Ads',
      firstTouchSource: 'Facebook',
      lastTouchSource: 'Facebook',
      metaLeadgenId: 'demo_leadgen_meera_003',
      metaFormId: 'demo_form_palm',
      metaPageId: DEMO_META_PAGE_ID,
      data: {
        fullName: 'Meera Joshi',
        name: 'Meera Joshi',
        phone: '+91 98765 44003',
        phoneNumber: '+91 98765 44003',
        email: 'meera.joshi.demo@example.com',
        city: 'Navi Mumbai',
      },
    },
    {
      email: 'sahil.khan.demo@example.com',
      status: 'new',
      formName: 'Green Vista enquiry',
      landingPageId: pageIds['green-vista'] ?? null,
      source: 'Google Ads',
      platform: 'google_ads',
      medium: 'Paid Search',
      campaign: 'Green Vista — Search',
      campaignId: 'demo_gads_campaign_search',
      adSet: 'Brand + Project keywords',
      adSetId: 'demo_gads_adgroup_brand',
      ad: 'Search ad — 2 & 3 BHK',
      adId: 'demo_gads_ad_rsa',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'green-vista-search',
      firstTouchSource: 'Google Ads',
      lastTouchSource: 'Google Ads',
      gclid: 'demo_gclid_sahil',
      landingPageUrl:
        'https://skylinedev.example/green-vista?utm_source=google',
      data: {
        fullName: 'Sahil Khan',
        name: 'Sahil Khan',
        phone: '+91 98765 44004',
        phoneNumber: '+91 98765 44004',
        email: 'sahil.khan.demo@example.com',
        city: 'Pune',
      },
    },
    {
      email: 'neha.shah.demo@example.com',
      status: 'contacted',
      formName: 'Website form',
      landingPageId: pageIds['green-vista'] ?? null,
      source: 'Website',
      platform: 'website',
      medium: 'Organic',
      campaign: 'Direct / organic',
      campaignId: '',
      adSet: '',
      adSetId: '',
      ad: '',
      adId: '',
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'march-launch',
      firstTouchSource: 'Website',
      lastTouchSource: 'Website',
      landingPageUrl: 'https://skylinedev.example/green-vista',
      data: {
        fullName: 'Neha Shah',
        name: 'Neha Shah',
        phone: '+91 98765 44005',
        phoneNumber: '+91 98765 44005',
        email: 'neha.shah.demo@example.com',
        city: 'Mumbai',
      },
    },
  ];

  let createdAttributed = 0;
  for (const demo of attributedLeads) {
    const existing = demo.metaLeadgenId
      ? await prisma.lead.findUnique({
          where: { metaLeadgenId: demo.metaLeadgenId },
          select: { id: true },
        })
      : await prisma.lead.findFirst({
          where: {
            orgId,
            data: { path: ['email'], equals: demo.email },
          },
          select: { id: true },
        });
    if (existing) continue;

    const lead = await prisma.lead.create({
      data: {
        orgId,
        landingPageId: demo.landingPageId,
        formName: demo.formName,
        source: demo.source,
        platform: demo.platform,
        medium: demo.medium,
        campaign: demo.campaign || null,
        campaignId: demo.campaignId || null,
        adSet: demo.adSet || null,
        adSetId: demo.adSetId || null,
        ad: demo.ad || null,
        adId: demo.adId || null,
        utmSource: demo.utmSource || null,
        utmMedium: demo.utmMedium || null,
        utmCampaign: demo.utmCampaign || null,
        firstTouchSource: demo.firstTouchSource || null,
        lastTouchSource: demo.lastTouchSource || null,
        landingPageUrl: demo.landingPageUrl ?? null,
        fbclid: demo.fbclid ?? null,
        gclid: demo.gclid ?? null,
        metaLeadgenId: demo.metaLeadgenId ?? null,
        metaFormId: demo.metaFormId ?? null,
        metaPageId: demo.metaPageId ?? null,
        status: demo.status,
        assignedToId: managerId || null,
        data: demo.data,
        configurations: [],
        tags: ['demo', 'marketing-seed'],
      },
    });
    await prisma.activityEvent.create({
      data: {
        orgId,
        agentId: managerId || null,
        leadId: lead.id,
        type: 'status_updated',
        text: `Demo ${demo.platform} lead seeded for ${demo.data.fullName}`,
      },
    });
    createdAttributed += 1;
  }

  console.log(
    `Marketing hub seeded for demo org: connections, campaigns, metrics, sync logs, ${createdAttributed} attributed leads.`,
  );
}

async function seedEmailTables() {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS identity;`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS audit;`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS identity.email_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 587,
      secure BOOLEAN NOT NULL DEFAULT false,
      "user" TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL,
      from_name TEXT NOT NULL DEFAULT 'iPixxel Realty',
      reply_to TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      invite_subject TEXT,
      invite_body TEXT,
      reset_subject TEXT,
      reset_body TEXT,
      account_activated_subject TEXT,
      account_activated_body TEXT,
      account_deactivated_subject TEXT,
      account_deactivated_body TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS invite_subject TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS invite_body TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS reset_subject TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS reset_body TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_activated_subject TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_activated_body TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_deactivated_subject TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_deactivated_body TEXT;`,
  );
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS audit.email_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "to" TEXT NOT NULL,
      subject TEXT NOT NULL,
      template TEXT,
      status TEXT NOT NULL,
      error TEXT,
      metadata JSONB,
      sent_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS email_logs_to_idx ON audit.email_logs("to");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS email_logs_status_idx ON audit.email_logs(status);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS email_logs_sent_at_idx ON audit.email_logs(sent_at);`,
  );
  console.log(
    'Email configuration & audit log tables initialized successfully.',
  );
}

async function seedDemoPlanAndSubscription() {
  const org = await prisma.organisation.findUnique({
    where: { slug: 'skylinedev' },
  });
  if (!org) return;

  const plan = await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {},
    create: {
      name: 'Starter',
      slug: 'starter',
      description:
        'For small teams getting started — 5 landing pages, 1 project, 10 users.',
      priceMonthly: 999,
      priceYearly: 9990,
      features: [
        '5 landing pages',
        '1 project',
        '10 team members',
        'Publishing',
        'WhatsApp integration',
      ],
      limits: { projects: 1, users: 10, templates: 5, landingPages: 5 },
      capabilities: { publishing: true, whatsappIntegration: true },
      color: '#eef0fe',
      badge: 'b-indigo',
      isPopular: true,
      isActive: true,
    },
  });

  // One active subscription for the demo org so the publish gate and billing
  // screen work out of the box. Renews ~1 year out.
  const existing = await prisma.subscription.findFirst({
    where: { orgId: org.id, status: { not: 'cancelled' } },
  });
  if (!existing) {
    await prisma.subscription.create({
      data: {
        orgId: org.id,
        planId: plan.id,
        billingCycle: 'monthly',
        status: 'active',
        amount: plan.priceMonthly,
        mrr: plan.priceMonthly,
        currency: 'INR',
        renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`Demo subscription seeded for ${org.name} (${plan.name}).`);
  }
}

// The platform's default onboarding plan — every newly onboarded org is
// auto-assigned this the moment Step 2 (Organisation) completes (see
// onboarding-finalize.util.ts), since the simplified 2-step wizard no
// longer has a Subscription step. Editable from Super Admin → Plans like
// any other plan, but `isSystem: true` means it can never be deleted
// (AdminPlansService.remove()) — auto-assignment always needs a target.
//
// Limits are sized so a brand-new org can immediately do the thing
// onboarding promises — create a project, add units, capture leads —
// without hitting a wall on its first day: 3 projects (room to try more
// than one before settling in), 5 users (founding admin + a small starting
// team), 1 template (so the Templates page isn't a hard "upgrade to pick
// anything" wall), 3 landing pages. `publishing: true` is load-bearing —
// without it, assertOrgCanPublish() blocks every publish/republish past
// the very first auto-provisioned page, which would defeat the point of a
// "just get started" plan.
async function seedBasicPlan() {
  await prisma.plan.upsert({
    where: { slug: 'basic' },
    update: {},
    create: {
      name: 'Basic',
      slug: 'basic',
      description:
        'The default plan for every new workspace — enough to create a project, add units and start capturing leads.',
      priceMonthly: 0,
      priceYearly: 0,
      features: [
        '3 projects',
        '5 team members',
        '1 template',
        '3 landing pages',
        'Publishing',
      ],
      limits: { projects: 3, users: 5, templates: 1, landingPages: 3 },
      capabilities: { publishing: true },
      color: '#eef0fe',
      badge: 'b-slate',
      isPopular: false,
      isActive: true,
      isSystem: true,
    },
  });
  console.log('Basic plan seeded (isSystem, auto-assigned at onboarding).');
}

async function main() {
  await seedRoles();
  await seedSuperAdmin();
  const demo = await seedDemoOrg();
  await seedMarketingDemo(demo);
  await seedEmailTables();
  await seedDemoPlanAndSubscription();
  await seedBasicPlan();
  await seedVisualBuilderTemplates(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
