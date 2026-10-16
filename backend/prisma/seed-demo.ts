import 'dotenv/config';
import { PrismaClient, Prisma, OrgCatalogCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { FieldDef } from '../src/common/utils/field-template.util';
import {
  normalizeFieldTemplate,
  validateCustomValues,
} from '../src/common/utils/field-template.util';
import { normalizeLeadData } from '../src/common/utils/lead-data.util';
import {
  runTeamChatHook,
  teamChatUserActivated,
} from '../src/common/utils/team-chat-membership.util';
import { PLAN_CAPABILITY_CATALOG } from '../src/modules/plans/plan-capabilities';
import { OrgProjectTypesService } from '../src/modules/org-project-types/org-project-types.service';

// One-time demo data for STAGING ONLY — never run this against production.
//
// Creates a brand-new organisation "Skyline Demo Realty" (skyline-demo) with
// an org admin, 10 team members, 10 Bengaluru projects with units, 5
// standalone units and 25 leads, on a dedicated "Demo" plan. Refuses to run
// if the organisation (or any of its demo users) already exists — it never
// touches or reuses existing data.
//
// Build:  npm run build              (emits dist/prisma/seed-demo.js)
// Run:    ALLOW_DEMO_SEED=yes node dist/prisma/seed-demo.js
//
// DATABASE_URL is read from the environment / backend .env, same as the app.

const prisma = new PrismaClient();

const BCRYPT_COST_FACTOR = 12; // same as AuthService / org-users.util
const DEMO_PASSWORD = 'Demo@12345';
const EMAIL_DOMAIN = 'skyline-demo.test';
const ORG_SLUG = 'skyline-demo';
const ORG_NAME = 'Skyline Demo Realty';
const ADMIN_EMAIL = `demo.admin@${EMAIL_DOMAIN}`;
const DEMO_PLAN_SLUG = 'demo';
const DAY = 24 * 60 * 60 * 1000;

type RoleKey = 'admin' | 'manager' | 'sales' | 'telecaller';

interface UserSeed {
  key: string;
  firstName: string;
  lastName: string;
  role: RoleKey;
  phone: string;
}

const USERS: UserSeed[] = [
  {
    key: 'admin',
    firstName: 'Demo',
    lastName: 'Admin',
    role: 'admin',
    phone: '+91 98450 10001',
  },
  {
    key: 'm1',
    firstName: 'Priya',
    lastName: 'Raghavan',
    role: 'manager',
    phone: '+91 98450 10002',
  },
  {
    key: 'm2',
    firstName: 'Karthik',
    lastName: 'Gowda',
    role: 'manager',
    phone: '+91 98450 10003',
  },
  {
    key: 's1',
    firstName: 'Ananya',
    lastName: 'Iyer',
    role: 'sales',
    phone: '+91 98450 10004',
  },
  {
    key: 's2',
    firstName: 'Rahul',
    lastName: 'Shetty',
    role: 'sales',
    phone: '+91 98450 10005',
  },
  {
    key: 's3',
    firstName: 'Sneha',
    lastName: 'Kulkarni',
    role: 'sales',
    phone: '+91 98450 10006',
  },
  {
    key: 's4',
    firstName: 'Vikram',
    lastName: 'Hegde',
    role: 'sales',
    phone: '+91 98450 10007',
  },
  {
    key: 's5',
    firstName: 'Divya',
    lastName: 'Nair',
    role: 'sales',
    phone: '+91 98450 10008',
  },
  {
    key: 't1',
    firstName: 'Arjun',
    lastName: 'Reddy',
    role: 'telecaller',
    phone: '+91 98450 10009',
  },
  {
    key: 't2',
    firstName: 'Meera',
    lastName: 'Joshi',
    role: 'telecaller',
    phone: '+91 98450 10010',
  },
  {
    key: 't3',
    firstName: 'Kiran',
    lastName: 'Rao',
    role: 'telecaller',
    phone: '+91 98450 10011',
  },
];

const emailOf = (u: UserSeed) =>
  u.key === 'admin'
    ? ADMIN_EMAIL
    : `${u.firstName}.${u.lastName}@${EMAIL_DOMAIN}`.toLowerCase();

// --- Catalogs the project / unit / lead forms pick from ----------------------
const CATALOG: Partial<Record<OrgCatalogCategory, string[]>> = {
  project_type: ['Apartment', 'Villa', 'Plot'],
  unit_type: [
    '1 BHK',
    '2 BHK',
    '3 BHK',
    '4 BHK',
    '5 BHK+',
    'Penthouse',
    'Plot',
  ],
  unit_variant: ['Type A', 'Type B', 'Corner', 'Garden facing'],
  facing: ['North', 'East', 'North-East', 'West', 'South'],
  parking: ['1 covered', '2 covered', 'Open', 'None'],
  amenity: [
    'Clubhouse',
    'Swimming pool',
    'Gymnasium',
    "Children's play area",
    'Jogging track',
    'Indoor games',
    '24x7 security',
    'Power backup',
  ],
  connectivity: [
    'Metro station',
    'IT park',
    'International airport',
    'School',
    'Hospital',
    'Shopping mall',
  ],
  price_includes: [
    'Car parking',
    'Club membership',
    'GST',
    'Registration',
    'Maintenance deposit',
  ],
  payment_plan: [
    'Construction-linked',
    'Down payment',
    'Flexi (20:80)',
    'Subvention',
  ],
  lead_purpose: ['End use (self)', 'Investment', 'Rental income'],
  lead_financing: ['Home loan', 'Self-funded', 'Loan + self'],
  lead_loan_status: ['Not applied', 'Applied', 'Sanctioned'],
  lead_timeline_to_buy: [
    'Immediately',
    'Within 3 months',
    '3–6 months',
    '6–12 months',
  ],
  lead_preferred_floor: ['Low (1–4)', 'Mid (5–10)', 'High (11+)'],
  lead_tag: [
    'NRI',
    'Site visit done',
    'Price sensitive',
    'Repeat buyer',
    'Hot lead',
  ],
};

// --- Projects ---------------------------------------------------------------
type TypeName = 'Apartment' | 'Villa' | 'Plot';
interface ProjectSeed {
  name: string;
  type: TypeName;
  locality: string;
  pincode: string;
  tagline: string;
  stage: string;
  possession: string;
  configs: string[]; // Apartment/Villa: unit configurations; Plot: unused
  baseRate: number; // rupees per sq ft
}

const PROJECTS: ProjectSeed[] = [
  {
    name: 'Skyline Whitefield Heights',
    type: 'Apartment',
    locality: 'Whitefield',
    pincode: '560066',
    tagline: 'Homes next to ITPL',
    stage: 'Under construction',
    possession: 'Dec 2027',
    configs: ['2 BHK', '3 BHK'],
    baseRate: 8200,
  },
  {
    name: 'Skyline Sarjapur Greens',
    type: 'Apartment',
    locality: 'Sarjapur Road',
    pincode: '560035',
    tagline: 'Green living on Sarjapur Road',
    stage: 'Under construction',
    possession: 'Jun 2028',
    configs: ['2 BHK', '3 BHK', '4 BHK'],
    baseRate: 7600,
  },
  {
    name: 'Skyline Hebbal Lakeview',
    type: 'Apartment',
    locality: 'Hebbal',
    pincode: '560024',
    tagline: 'Lake views, minutes from the airport road',
    stage: 'Ready to move',
    possession: 'Ready',
    configs: ['3 BHK', '4 BHK', 'Penthouse'],
    baseRate: 11500,
  },
  {
    name: 'Skyline Electronic City Nest',
    type: 'Apartment',
    locality: 'Electronic City',
    pincode: '560100',
    tagline: 'Smart homes for tech professionals',
    stage: 'Launch',
    possession: 'Mar 2029',
    configs: ['1 BHK', '2 BHK'],
    baseRate: 6100,
  },
  {
    name: 'Skyline Koramangala Court',
    type: 'Apartment',
    locality: 'Koramangala',
    pincode: '560034',
    tagline: 'Boutique living in the heart of the city',
    stage: 'Under construction',
    possession: 'Sep 2027',
    configs: ['2 BHK', '3 BHK'],
    baseRate: 14800,
  },
  {
    name: 'Skyline Yelahanka Residency',
    type: 'Apartment',
    locality: 'Yelahanka',
    pincode: '560064',
    tagline: 'Spacious homes in North Bengaluru',
    stage: 'Under construction',
    possession: 'Dec 2028',
    configs: ['2 BHK', '3 BHK'],
    baseRate: 6900,
  },
  {
    name: 'Skyline Devanahalli Villas',
    type: 'Villa',
    locality: 'Devanahalli',
    pincode: '562110',
    tagline: 'Private villas near the airport',
    stage: 'Under construction',
    possession: 'Mar 2028',
    configs: ['3 BHK', '4 BHK'],
    baseRate: 9200,
  },
  {
    name: 'Skyline Kanakapura Retreat',
    type: 'Villa',
    locality: 'Kanakapura Road',
    pincode: '560062',
    tagline: 'Villas surrounded by greenery',
    stage: 'Ready to move',
    possession: 'Ready',
    configs: ['4 BHK', '5 BHK+'],
    baseRate: 10400,
  },
  {
    name: 'Skyline Hoskote Plots',
    type: 'Plot',
    locality: 'Hoskote',
    pincode: '562114',
    tagline: 'BMRDA-approved plots off Old Madras Road',
    stage: 'Ready to register',
    possession: 'Ready',
    configs: [],
    baseRate: 3800,
  },
  {
    name: 'Skyline Bidadi Enclave',
    type: 'Plot',
    locality: 'Bidadi',
    pincode: '562109',
    tagline: 'Gated plotted development on Mysore Road',
    stage: 'Launch',
    possession: 'Jun 2027',
    configs: [],
    baseRate: 3200,
  },
];

// Manager + 1–3 agents per project (keys from USERS). Telecallers are valid
// project agents (ProjectsService only excludes admins and managers).
const PROJECT_TEAMS: Array<{ manager: string; agents: string[] }> = [
  { manager: 'm1', agents: ['s1', 's2', 't1'] },
  { manager: 'm1', agents: ['s3'] },
  { manager: 'm2', agents: ['s4', 's5'] },
  { manager: 'm2', agents: ['s1', 't2'] },
  { manager: 'm1', agents: ['s2', 's5', 't3'] },
  { manager: 'm2', agents: ['s3', 's4'] },
  { manager: 'm1', agents: ['s5'] },
  { manager: 'm2', agents: ['s2', 't1'] },
  { manager: 'm1', agents: ['s4', 's1', 't2'] },
  { manager: 'm2', agents: ['s3', 't3'] },
];

const UNIT_STATUSES: Array<'available' | 'booked' | 'held' | 'sold'> = [
  'available',
  'available',
  'booked',
  'available',
  'held',
  'sold',
  'available',
  'booked',
];

const STANDALONE_UNITS = [
  {
    unitNo: 'JPN-302',
    configuration: '2 BHK',
    area: 1180,
    price: 9800000,
    address: '302, Lakshmi Enclave, JP Nagar 6th Phase, Bengaluru 560078',
    owner: 'Ramesh Babu',
    status: 'available' as const,
    manager: 'm1',
    agents: ['s1'],
  },
  {
    unitNo: 'IND-14',
    configuration: '3 BHK',
    area: 1650,
    price: 21500000,
    address: '14, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru 560008',
    owner: 'Lalitha Krishnan',
    status: 'held' as const,
    manager: 'm2',
    agents: ['s4', 't2'],
  },
  {
    unitNo: 'BSK-7A',
    configuration: '2 BHK',
    area: 1050,
    price: 7200000,
    address: '7A, Hanumanthanagar, Basavanagudi, Bengaluru 560019',
    owner: 'Suresh Murthy',
    status: 'available' as const,
    manager: 'm1',
    agents: ['s2'],
  },
  {
    unitNo: 'MLW-901',
    configuration: '4 BHK',
    area: 2600,
    price: 38500000,
    address: '901, Orchid Towers, Malleshwaram 18th Cross, Bengaluru 560055',
    owner: 'Anil Kapoor',
    status: 'booked' as const,
    manager: 'm2',
    agents: ['s5'],
  },
  {
    unitNo: 'BTM-205',
    configuration: '1 BHK',
    area: 640,
    price: 4600000,
    address: '205, Sai Residency, BTM 2nd Stage, Bengaluru 560076',
    owner: 'Farah Khan',
    status: 'available' as const,
    manager: 'm1',
    agents: ['s3', 't1'],
  },
];

// --- Leads ------------------------------------------------------------------
const LEAD_NAMES = [
  'Aditya Menon',
  'Bhavana Rao',
  'Chetan Patil',
  'Deepa Srinivas',
  'Eshwar Prasad',
  'Fathima Begum',
  'Ganesh Kumar',
  'Harini Venkatesh',
  'Imran Sheikh',
  'Jyothi Naidu',
  'Kavya Bhat',
  'Lokesh Gowda',
  'Manjunath S',
  'Nandini Pai',
  'Omkar Deshpande',
  'Pooja Agarwal',
  'Qasim Ali',
  'Rashmi Shenoy',
  'Sanjay Mishra',
  'Tanvi Kamath',
  'Uday Shankar',
  'Varsha Hegde',
  'Waseem Akram',
  'Yamini Reddy',
  'Zubin Mehta',
];
// Mirrors the Source select on the lead edit page; `platform` feeds Lead Center.
const SOURCES: Array<{
  source: string;
  platform: string | null;
  campaign?: string;
}> = [
  {
    source: 'Meta Lead Ad',
    platform: 'meta',
    campaign: 'Bengaluru Launch — Lead Ads',
  },
  {
    source: 'Google Ads',
    platform: 'google_ads',
    campaign: 'Search — Flats in Bengaluru',
  },
  { source: 'Website form', platform: 'website' },
  { source: 'Portal (99acres)', platform: null },
  { source: 'Walk-in', platform: null },
  { source: 'Referral', platform: null },
];
const STAGES: Array<Prisma.LeadCreateInput['status']> = [
  'new',
  'contacted',
  'follow_up',
  'site_visit',
  'negotiation',
  'won',
  'lost',
];
const NOTES = [
  'Called — interested, asked for the brochure on WhatsApp.',
  'Prefers a higher floor with east facing. Budget is firm.',
  'Site visit planned for the weekend with family.',
  'Comparing with two other projects nearby; follow up after Diwali offers.',
  'Home loan pre-approved with SBI. Wants the payment plan details.',
  'Did not pick up. Will retry in the evening.',
  'Asked about possession date and rental yield.',
  'Visited the site, liked the clubhouse. Negotiating on parking.',
];
const TEMPERATURES = ['hot', 'warm', 'cold'];

function pick<T>(list: T[], i: number): T {
  return list[i % list.length];
}

function keyOf(template: FieldDef[], label: string): string {
  const f = template.find((x) => x.label === label);
  if (!f) throw new Error(`Template has no field "${label}"`);
  return f.key;
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

async function assertSafeToRun() {
  if (process.env.ALLOW_DEMO_SEED !== 'yes') {
    console.error(
      'Refusing to run: this writes demo data and is for STAGING only.\n' +
        'Re-run with ALLOW_DEMO_SEED=yes once DATABASE_URL points at the staging database.',
    );
    process.exit(1);
  }
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    console.log(`Target database: ${url.hostname}${url.pathname}`);
  } catch {
    console.log('Target database: (DATABASE_URL not parseable)');
  }

  const emails = USERS.map(emailOf);
  const [org, users] = await Promise.all([
    prisma.organisation.findFirst({
      where: {
        OR: [{ slug: ORG_SLUG }, { subdomain: ORG_SLUG }, { name: ORG_NAME }],
      },
      select: { id: true, name: true, slug: true },
    }),
    prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
  ]);
  if (org) {
    console.log(
      `"${org.name}" (${org.slug}) already exists — demo data was seeded before. Nothing changed.`,
    );
    process.exit(0);
  }
  if (users.length > 0) {
    console.log(
      `These demo users already exist: ${users.map((u) => u.email).join(', ')}. Nothing changed.`,
    );
    process.exit(0);
  }
}

async function main() {
  await assertSafeToRun();

  const roles = await prisma.role.findMany({
    where: {
      orgId: null,
      key: { in: ['admin', 'manager', 'sales', 'telecaller'] },
    },
  });
  const roleId = (key: RoleKey) => {
    const r = roles.find((x) => x.key === key);
    if (!r)
      throw new Error(
        `System role "${key}" is missing — run the main seed first.`,
      );
    return r.id;
  };
  (['admin', 'manager', 'sales', 'telecaller'] as RoleKey[]).forEach(roleId);

  // Hashed outside the transaction (bcrypt is slow); a fresh salt per user,
  // same cost factor as signup / org-user creation.
  const hashes = await Promise.all(
    USERS.map(() => bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST_FACTOR)),
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const now = new Date();

      // --- Demo plan (reused if a previous run left one behind) ------------
      // Inactive so it never shows up in any organisation's plan picker;
      // the subscription below still resolves it. Free, so no billing.
      let plan = await tx.plan.findUnique({ where: { slug: DEMO_PLAN_SLUG } });
      if (!plan) {
        const capabilities: Record<string, boolean> = {
          teamChat: true,
          metaLeadAds: true,
        };
        for (const c of PLAN_CAPABILITY_CATALOG) capabilities[c.key] = true;
        plan = await tx.plan.create({
          data: {
            name: 'Demo',
            slug: DEMO_PLAN_SLUG,
            description:
              'Internal demo plan for sales demos on staging. Not for sale.',
            priceMonthly: 0,
            priceYearly: 0,
            features: [
              '50 projects',
              '50 team members',
              '20 templates',
              '20 landing pages',
              'All modules',
            ],
            limits: {
              users: 50,
              projects: 50,
              templates: 20,
              landingPages: 20,
              landingPagesCreate: null,
              metaPages: null,
            },
            capabilities,
            isActive: false,
          },
        });
        console.log(
          'Created plan "Demo" (slug demo, inactive — not offered to other orgs).',
        );
      } else {
        console.log(
          `Reusing existing plan "${plan.name}" (slug ${DEMO_PLAN_SLUG}).`,
        );
      }

      // --- Organisation (active, like onboarding-finalize) -------------------
      const org = await tx.organisation.create({
        data: {
          name: ORG_NAME,
          slug: ORG_SLUG,
          subdomain: ORG_SLUG,
          subdomainStatus: 'active',
          status: 'active',
          industry: 'developer',
          teamSize: '11–50',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'India',
          postalCode: '560001',
          addressLine1: '4th Floor, Prestige Meridian, MG Road',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          supportEmail: `support@${EMAIL_DOMAIN}`,
          supportPhone: '+91 80 4000 1234',
        },
      });

      await tx.subscription.create({
        data: {
          orgId: org.id,
          planId: plan.id,
          billingCycle: 'yearly',
          status: 'active',
          amount: plan.priceYearly,
          mrr: plan.priceMonthly,
          currency: 'INR',
          renewsAt: new Date(now.getTime() + 365 * DAY),
        },
      });

      // --- Users ------------------------------------------------------------
      const userIds: Record<string, string> = {};
      for (const [i, u] of USERS.entries()) {
        const created = await tx.user.create({
          data: {
            orgId: org.id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: emailOf(u),
            phoneNumber: u.phone,
            passwordHash: hashes[i],
            status: 'active',
            mustChangePassword: false,
            onboardingStep: 'completed',
            emailVerifiedAt: now,
            approvedAt: now,
            country: 'India',
            termsAcceptedAt: u.role === 'admin' ? now : null,
          },
        });
        await tx.userRole.create({
          data: { userId: created.id, roleId: roleId(u.role) },
        });
        userIds[u.key] = created.id;
      }
      const adminId = userIds.admin;

      // --- Catalog options ---------------------------------------------------
      const catalogRows: Prisma.OrgCatalogOptionCreateManyInput[] = [];
      for (const [category, labels] of Object.entries(CATALOG)) {
        labels.forEach((label, sortOrder) =>
          catalogRows.push({
            orgId: org.id,
            category: category as OrgCatalogCategory,
            label,
            sortOrder,
          }),
        );
      }
      await tx.orgCatalogOption.createMany({ data: catalogRows });

      // --- Project types: the product's own "Add common types" starter set --
      await new OrgProjectTypesService(tx as never).addCommon(org.id);
      const typeDefs = await tx.projectTypeDef.findMany({
        where: { orgId: org.id },
      });
      const typeDef = (name: TypeName) => {
        const d = typeDefs.find((t) => t.name === name);
        if (!d) throw new Error(`Project type "${name}" was not created`);
        return {
          id: d.id,
          projectFields: normalizeFieldTemplate(d.projectFields),
          unitFields: normalizeFieldTemplate(d.unitFields),
        };
      };

      // --- Projects, unit types, units --------------------------------------
      const projects: Array<{
        id: string;
        name: string;
        managerKey: string;
        agentKeys: string[];
        units: Array<{ id: string; configuration: string | null }>;
      }> = [];

      for (const [pi, p] of PROJECTS.entries()) {
        const team = PROJECT_TEAMS[pi];
        const def = typeDef(p.type);
        const pf = def.projectFields;
        const projectValues: Record<string, string> =
          p.type === 'Apartment'
            ? {
                [keyOf(pf, 'No. of Towers / Blocks')]: `${2 + (pi % 3)}`,
                [keyOf(pf, 'Floors / Structure')]: `G + ${12 + pi}`,
                [keyOf(pf, 'Total Land Area')]: `${3 + (pi % 4)} acres`,
              }
            : p.type === 'Villa'
              ? {
                  [keyOf(pf, 'No. of Villas')]: `${60 + pi * 10}`,
                  [keyOf(pf, 'Total Land Area')]: `${12 + pi} acres`,
                  [keyOf(pf, 'Villa Area Range')]: '2,400 – 4,200 sq ft',
                }
              : {
                  [keyOf(pf, 'Total Land Area')]: `${20 + pi} acres`,
                  [keyOf(pf, 'Plot Area Range')]: '1,200 – 4,000 sq ft',
                };

        const typicalArea =
          p.type === 'Plot' ? 1500 : p.type === 'Villa' ? 2800 : 1200;
        const project = await tx.project.create({
          data: {
            orgId: org.id,
            name: p.name,
            projectType: p.type,
            projectTypeId: def.id,
            areaUnit: 'sqft',
            projectFieldTemplate: pf as unknown as Prisma.InputJsonValue,
            unitFieldTemplate:
              def.unitFields as unknown as Prisma.InputJsonValue,
            customFields: validateCustomValues(pf, projectValues, {}, true),
            location: `${p.locality}, Bengaluru`,
            reraId: `PRM/KA/RERA/1251/${310 + pi}/PR/${230100 + pi * 7}/00${1000 + pi}`,
            possession: p.possession,
            managerId: userIds[team.manager],
            status: 'active',
            priceMin: roundTo(p.baseRate * typicalArea * 0.8, 100000),
            priceMax: roundTo(p.baseRate * typicalArea * 2.2, 100000),
            baseRate: p.baseRate,
            tagline: p.tagline,
            launchDate: new Date(now.getTime() - (200 + pi * 30) * DAY)
              .toISOString()
              .slice(0, 10),
            constructionStage: p.stage,
            highlights: `Prime ${p.locality} location\nRERA registered\nBank-approved project`,
            amenities: CATALOG.amenity!.filter(
              (_, ai) => (ai + pi) % 3 !== 0,
            ).map((name) => ({ name, iconUrl: null })),
            bookingAmount: p.type === 'Plot' ? 200000 : 500000,
            currency: 'INR',
            priceIncludes: ['Car parking', 'Club membership'],
            paymentPlan: pick(CATALOG.payment_plan!, pi),
            addressLine: `${p.locality} Main Road`,
            city: 'Bengaluru',
            locality: p.locality,
            pincode: p.pincode,
            connectivity: CATALOG.connectivity!.filter(
              (_, ci) => (ci + pi) % 2 === 0,
            ),
            landmarks: `Near ${p.locality} bus stop`,
            visibleToTelecallers: true,
          },
        });

        await tx.projectSalesAgent.createMany({
          data: team.agents.map((k) => ({
            projectId: project.id,
            userId: userIds[k],
          })),
        });

        // Unit rows, 5–8 per project.
        const unitCount = 5 + (pi % 4);
        const uf = def.unitFields;
        const unitRows: Prisma.UnitCreateManyInput[] = [];
        const planned = new Map<string, number>();

        for (let ui = 0; ui < unitCount; ui++) {
          const status = pick(UNIT_STATUSES, ui + pi);
          const facing = pick(CATALOG.facing!, ui + pi);
          const base: Prisma.UnitCreateManyInput = {
            orgId: org.id,
            projectId: project.id,
            unitNo: '',
            status,
            facing,
            createdById: adminId,
            updatedById: adminId,
            variantLabel:
              ui % 3 === 0 ? pick(CATALOG.unit_variant!, ui + pi) : null,
          };

          if (p.type === 'Apartment') {
            const configuration = pick(p.configs, ui);
            const area =
              {
                '1 BHK': 620,
                '2 BHK': 1150,
                '3 BHK': 1580,
                '4 BHK': 2250,
                Penthouse: 3400,
              }[configuration] ?? 1200;
            const tower = String.fromCharCode(65 + (ui % 2)); // A / B
            const floor = 2 + ((ui * 3 + pi) % 14);
            planned.set(configuration, (planned.get(configuration) ?? 0) + 1);
            unitRows.push({
              ...base,
              unitNo: `${tower}-${floor}0${1 + (ui % 4)}`,
              configuration,
              tower: `Tower ${tower}`,
              floor,
              area,
              price: roundTo(area * p.baseRate * (1 + floor * 0.01), 10000),
              parking: configuration === '1 BHK' ? '1 covered' : '2 covered',
              customFields: validateCustomValues(uf, {
                [keyOf(uf, 'Built-up Area')]: Math.round(area * 1.25),
              }),
            });
          } else if (p.type === 'Villa') {
            const configuration = pick(p.configs, ui);
            const area =
              configuration === '3 BHK'
                ? 2450
                : configuration === '4 BHK'
                  ? 3200
                  : 4100;
            const bedrooms =
              configuration === '5 BHK+' ? 5 : Number(configuration[0]);
            planned.set(configuration, (planned.get(configuration) ?? 0) + 1);
            unitRows.push({
              ...base,
              unitNo: `V-${String(ui + 1 + pi * 10).padStart(3, '0')}`,
              configuration,
              area,
              price: roundTo(area * p.baseRate, 10000),
              parking: '2 covered',
              customFields: validateCustomValues(uf, {
                [keyOf(uf, 'Villa Type')]: pick(
                  ['Independent', 'Twin', 'Row', 'Luxury'],
                  ui,
                ),
                [keyOf(uf, 'Total Floors')]: 2 + (ui % 2),
                [keyOf(uf, 'Construction Status')]:
                  p.stage === 'Ready to move'
                    ? 'Ready to Move'
                    : 'Under Construction',
                [keyOf(uf, 'Furnishing Status')]: pick(
                  ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'],
                  ui,
                ),
                [keyOf(uf, 'Plot Area')]: Math.round(area * 1.4),
                [keyOf(uf, 'Bedrooms')]: bedrooms,
                [keyOf(uf, 'Bathrooms')]: bedrooms + 1,
                [keyOf(uf, 'Private Garden')]: ui % 2 === 0,
                [keyOf(uf, 'Swimming Pool')]: configuration !== '3 BHK',
              }),
            });
          } else {
            const [len, wid] = pick(
              [
                [30, 40],
                [30, 50],
                [40, 60],
                [50, 80],
              ],
              ui + pi,
            );
            const area = len * wid;
            unitRows.push({
              ...base,
              unitNo: `P-${String(ui + 1 + pi * 10).padStart(3, '0')}`,
              area,
              price: roundTo(
                area * p.baseRate * (ui % 4 === 0 ? 1.1 : 1),
                10000,
              ),
              parking: null,
              customFields: validateCustomValues(uf, {
                [keyOf(uf, 'Plot Type')]:
                  ui === unitCount - 1 ? 'Commercial' : 'Residential',
                [keyOf(uf, 'Corner Plot')]: ui % 4 === 0,
                [keyOf(uf, 'Gated Community')]: true,
                [keyOf(uf, 'Length')]: len,
                [keyOf(uf, 'Width')]: wid,
                [keyOf(uf, 'Road Width')]: ui % 2 === 0 ? 40 : 30,
                [keyOf(uf, 'Approved By')]: 'BMRDA',
                [keyOf(uf, 'Water Connection')]: true,
                [keyOf(uf, 'Electricity Connection')]: true,
              }),
            });
          }
        }

        // Planned unit mix — unit configurations must be among the project's
        // unit types (ProjectsService.assertConfigurationForProject).
        if (planned.size > 0) {
          const areaKey = def.unitFields.find((f) => f.role === 'area')!.key;
          const priceKey = def.unitFields.find((f) => f.role === 'price')!.key;
          for (const [name, count] of planned) {
            const sample = unitRows.find((u) => u.configuration === name)!;
            await tx.unitType.create({
              data: {
                projectId: project.id,
                name,
                totalUnits: count * 12,
                fieldDefaults: {
                  [areaKey]: sample.area!,
                  [priceKey]: sample.price!,
                },
                galleryUrls: [],
              },
            });
          }
        }

        await tx.unit.createMany({ data: unitRows });
        const units = await tx.unit.findMany({
          where: { projectId: project.id },
          select: { id: true, configuration: true },
          orderBy: { unitNo: 'asc' },
        });
        projects.push({
          id: project.id,
          name: project.name,
          managerKey: team.manager,
          agentKeys: team.agents,
          units,
        });
      }

      // --- Standalone units (resale / broker listings) ----------------------
      const standalone: Array<{
        id: string;
        configuration: string;
        managerKey: string;
        agentKeys: string[];
      }> = [];
      for (const [si, s] of STANDALONE_UNITS.entries()) {
        const unit = await tx.unit.create({
          data: {
            orgId: org.id,
            projectId: null,
            unitNo: s.unitNo,
            configuration: s.configuration,
            area: s.area,
            price: s.price,
            facing: pick(CATALOG.facing!, si + 1),
            parking: si % 2 === 0 ? '1 covered' : '2 covered',
            addressLine: s.address,
            ownerName: s.owner,
            notes: 'Resale listing — owner open to negotiation.',
            status: s.status,
            managerId: userIds[s.manager],
            createdById: adminId,
            updatedById: adminId,
          },
        });
        await tx.unitSalesAgent.createMany({
          data: s.agents.map((k) => ({ unitId: unit.id, userId: userIds[k] })),
        });
        standalone.push({
          id: unit.id,
          configuration: s.configuration,
          managerKey: s.manager,
          agentKeys: s.agents,
        });
      }

      // --- Leads -------------------------------------------------------------
      // 20 on projects (half pinned to a unit), 5 on standalone units. Each
      // is assigned to the project/unit's manager or one of its agents, so
      // the assignee can always open it.
      let leadCount = 0;
      let noteCount = 0;
      for (let li = 0; li < LEAD_NAMES.length; li++) {
        const fullName = LEAD_NAMES[li];
        const phone = `+91 9${String(8801 + li * 37).padStart(4, '0')} ${String(41000 + li * 211).padStart(5, '0')}`;
        const email = `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
        const src = pick(SOURCES, li);
        const status = pick(STAGES, li);
        const createdAt = new Date(
          now.getTime() - (28 - li) * DAY - (li % 5) * 3600 * 1000,
        );

        let projectId: string | null = null;
        let projectName: string | null = null;
        let unitId: string | null = null;
        let interestedIn: string | null = null;
        let managerKey: string;
        let agentKeys: string[];

        if (li < 20) {
          const p = projects[li % projects.length];
          projectId = p.id;
          projectName = p.name;
          if (li % 2 === 0) {
            const u = pick(p.units, li);
            unitId = u.id;
            interestedIn = u.configuration;
          } else {
            interestedIn = pick(p.units, li + 1).configuration;
          }
          managerKey = p.managerKey;
          agentKeys = p.agentKeys;
        } else {
          const s = standalone[li - 20];
          unitId = s.id;
          interestedIn = s.configuration;
          managerKey = s.managerKey;
          agentKeys = s.agentKeys;
        }
        // Mostly the agents (so every sales/telecaller login has leads), with
        // every fifth lead owned by the manager.
        const assigneeKey =
          li % 5 === 2 ? managerKey : pick(agentKeys, Math.floor(li / 10) + li);
        const assignedToId = userIds[assigneeKey];

        const data = normalizeLeadData(
          {
            fullName,
            phone,
            email,
            ...(interestedIn ? { interestedIn } : {}),
          },
          { unitId, projectName },
        );

        const budgetBase = 5000000 + (li % 6) * 2500000;
        const lead = await tx.lead.create({
          data: {
            orgId: org.id,
            projectId,
            formName:
              src.source === 'Website form'
                ? `${projectName ?? 'Listing'} enquiry`
                : 'Manual lead',
            source: src.source,
            platform: src.platform,
            campaign: src.campaign ?? null,
            utmSource:
              src.platform === 'meta'
                ? 'facebook'
                : src.platform === 'google_ads'
                  ? 'google'
                  : null,
            utmMedium:
              src.platform === 'meta' || src.platform === 'google_ads'
                ? 'cpc'
                : null,
            data: data as Prisma.InputJsonValue,
            status,
            assignedToId,
            city: 'Bengaluru',
            budgetMin: BigInt(budgetBase),
            budgetMax: BigInt(budgetBase + 3000000),
            configurations:
              interestedIn && interestedIn !== 'Plot' ? [interestedIn] : [],
            purpose: pick(CATALOG.lead_purpose!, li),
            financing: pick(CATALOG.lead_financing!, li),
            loanStatus: pick(CATALOG.lead_loan_status!, li),
            timelineToBuy: pick(CATALOG.lead_timeline_to_buy!, li),
            temperature: pick(TEMPERATURES, li),
            tags: li % 4 === 0 ? [pick(CATALOG.lead_tag!, li)] : [],
            consentCall: true,
            consentWhatsapp: li % 2 === 0,
            consentEmail: li % 3 === 0,
            nextActionType:
              status === 'follow_up' || status === 'site_visit' ? 'call' : null,
            nextActionAt:
              status === 'follow_up' || status === 'site_visit'
                ? new Date(now.getTime() + (1 + (li % 4)) * DAY)
                : null,
            createdAt,
          },
        });
        leadCount++;

        await tx.activityEvent.create({
          data: {
            orgId: org.id,
            agentId: adminId,
            leadId: lead.id,
            type: 'status_updated',
            text: 'Lead created in CRM and assigned',
            createdAt,
          },
        });
        const notes = li % 3 === 0 ? 2 : 1;
        for (let n = 0; n < notes; n++) {
          await tx.activityEvent.create({
            data: {
              orgId: org.id,
              agentId: assignedToId,
              leadId: lead.id,
              type: 'note_added',
              text: pick(NOTES, li + n * 3),
              createdAt: new Date(
                createdAt.getTime() + (n + 1) * 6 * 3600 * 1000,
              ),
            },
          });
          noteCount++;
        }
      }

      await tx.auditLog.create({
        data: {
          orgId: org.id,
          actorId: adminId,
          action: 'demo_data_seeded',
          entity: 'Organisation',
          entityId: org.id,
          metadata: { script: 'prisma/seed-demo.ts' },
        },
      });

      return {
        org,
        planName: plan.name,
        userIds,
        projectCount: projects.length,
        unitCount: projects.reduce((n, p) => n + p.units.length, 0),
        standaloneCount: standalone.length,
        leadCount,
        noteCount,
      };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  // Team Chat: everyone joins the org's General channel. Plain client, after
  // commit — the hook must never run inside a transaction.
  for (const userId of Object.values(result.userIds)) {
    await runTeamChatHook('demo seed', () =>
      teamChatUserActivated(prisma, result.org.id, userId),
    );
  }

  console.log(
    `\nCreated "${result.org.name}" (slug/subdomain ${result.org.slug}) on plan "${result.planName}".`,
  );
  console.log(
    `  ${USERS.length} users, ${result.projectCount} projects, ${result.unitCount} project units, ` +
      `${result.standaloneCount} standalone units, ${result.leadCount} leads, ${result.noteCount} notes.`,
  );
  console.log(`\nLogins (password for all: ${DEMO_PASSWORD}):`);
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(10)} ${emailOf(u)}`);
  }
}

main()
  .catch((err) => {
    console.error(
      'Demo seed failed — nothing was written (transaction rolled back).',
    );
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
