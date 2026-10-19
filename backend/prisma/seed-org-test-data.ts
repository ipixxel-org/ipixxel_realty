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
import {
  countBillableOrgUsers,
  countOrgProjects,
  countOrgTotalLandingPages,
  resolveLimit,
} from '../src/common/utils/plan-quota.util';
import { getOrgActivePlan } from '../src/common/utils/subscription-lifecycle.util';
import {
  bindLandingPageContent,
  snapshotFromProject,
} from '../src/common/utils/landing-page-property.util';
import { generateUniqueLandingPageSlug } from '../src/common/utils/slug.util';
import { OrgProjectTypesService } from '../src/modules/org-project-types/org-project-types.service';

// One-time test data for an EXISTING staging organisation — never run this
// against production.
//
// Adds to the organisation (default: "Prestige Test Org"):
//   - 4 team members (1 manager, 2 sales, 1 telecaller) → 5 users with the
//     existing org admin
//   - 3 projects (Apartment, Villa, Plot) with units and unit types
//   - 2 standalone units, 12 leads with notes
//   - one draft landing page (+ thank-you companion) per project, copied from
//     a template already assigned to the organisation — skipped if none is
//     assigned, and capped at the plan's landing page creation limit
//
// It never changes the organisation's plan or its existing records. It
// refuses to run if the plan can't hold the new users/projects (that would
// put the org into "choose what stays"), or if it has already been run.
//
// Build:  npm run build              (emits dist/prisma/seed-org-test-data.js)
// Run:    ALLOW_TEST_SEED=yes node dist/prisma/seed-org-test-data.js
//         (SEED_ORG_ID=<uuid> to target a different organisation)
//
// DATABASE_URL is read from the environment / backend .env, same as the app.

const prisma = new PrismaClient();

const ORG_ID = process.env.SEED_ORG_ID ?? '66c965a7-0622-42ea-9be1-eaa12b8c8fdc';
const BCRYPT_COST_FACTOR = 12; // same as AuthService / org-users.util
const TEST_PASSWORD = 'Test@12345';
const EMAIL_DOMAIN = 'prestige-test-org.test';
const SEED_ACTION = 'test_data_seeded';
const DAY = 24 * 60 * 60 * 1000;

type RoleKey = 'manager' | 'sales' | 'telecaller';

interface UserSeed {
  key: string;
  firstName: string;
  lastName: string;
  role: RoleKey;
  phone: string;
}

// The existing org admin is the fifth user (key "admin").
const USERS: UserSeed[] = [
  {
    key: 'm1',
    firstName: 'Rohan',
    lastName: 'Kamath',
    role: 'manager',
    phone: '+91 98860 20001',
  },
  {
    key: 's1',
    firstName: 'Shreya',
    lastName: 'Bhat',
    role: 'sales',
    phone: '+91 98860 20002',
  },
  {
    key: 's2',
    firstName: 'Nikhil',
    lastName: 'Gowda',
    role: 'sales',
    phone: '+91 98860 20003',
  },
  {
    key: 't1',
    firstName: 'Lavanya',
    lastName: 'Rao',
    role: 'telecaller',
    phone: '+91 98860 20004',
  },
];

const emailOf = (u: UserSeed) =>
  `${u.firstName}.${u.lastName}@${EMAIL_DOMAIN}`.toLowerCase();

// --- Catalogs the project / unit / lead forms pick from ----------------------
// Only missing options are added (unique on org + category + label).
const CATALOG: Partial<Record<OrgCatalogCategory, string[]>> = {
  project_type: ['Apartment', 'Villa', 'Plot'],
  unit_type: ['1 BHK', '2 BHK', '3 BHK', '4 BHK', 'Plot'],
  unit_variant: ['Type A', 'Type B', 'Corner'],
  facing: ['North', 'East', 'North-East', 'West'],
  parking: ['1 covered', '2 covered', 'Open', 'None'],
  amenity: [
    'Clubhouse',
    'Swimming pool',
    'Gymnasium',
    "Children's play area",
    'Jogging track',
    '24x7 security',
  ],
  connectivity: ['Metro station', 'IT park', 'School', 'Hospital'],
  price_includes: ['Car parking', 'Club membership', 'GST'],
  payment_plan: ['Construction-linked', 'Down payment', 'Flexi (20:80)'],
  lead_purpose: ['End use (self)', 'Investment'],
  lead_financing: ['Home loan', 'Self-funded'],
  lead_loan_status: ['Not applied', 'Applied', 'Sanctioned'],
  lead_timeline_to_buy: ['Immediately', 'Within 3 months', '3–6 months'],
  lead_tag: ['NRI', 'Site visit done', 'Hot lead'],
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
  agents: string[]; // USERS keys; the manager is always m1
}

const PROJECTS: ProjectSeed[] = [
  {
    name: 'Lakeside Residences Whitefield',
    type: 'Apartment',
    locality: 'Whitefield',
    pincode: '560066',
    tagline: 'Lake-facing homes next to ITPL',
    stage: 'Under construction',
    possession: 'Dec 2027',
    configs: ['2 BHK', '3 BHK'],
    baseRate: 8400,
    agents: ['s1', 't1'],
  },
  {
    name: 'Green Acres Villas Devanahalli',
    type: 'Villa',
    locality: 'Devanahalli',
    pincode: '562110',
    tagline: 'Private villas near the airport',
    stage: 'Under construction',
    possession: 'Mar 2028',
    configs: ['3 BHK', '4 BHK'],
    baseRate: 9200,
    agents: ['s2'],
  },
  {
    name: 'Meadows Plots Hoskote',
    type: 'Plot',
    locality: 'Hoskote',
    pincode: '562114',
    tagline: 'BMRDA-approved plots off Old Madras Road',
    stage: 'Ready to register',
    possession: 'Ready',
    configs: [],
    baseRate: 3800,
    agents: ['s1', 's2'],
  },
];

const UNIT_STATUSES: Array<'available' | 'booked' | 'held' | 'sold'> = [
  'available',
  'available',
  'booked',
  'held',
  'available',
  'sold',
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
    agents: ['s2', 't1'],
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
];
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
  'Home loan pre-approved. Wants the payment plan details.',
  'Did not pick up. Will retry in the evening.',
  'Visited the site, liked the clubhouse. Negotiating on parking.',
];
const TEMPERATURES = ['hot', 'warm', 'cold'];

function pick<T>(list: T[], i: number): T {
  return list[i % list.length];
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

// Custom-field values by label. The org's project types may have been edited
// in the app, so labels that no longer exist are simply left out.
function valuesByLabel(
  template: FieldDef[],
  byLabel: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [label, value] of Object.entries(byLabel)) {
    const f = template.find((x) => x.label === label);
    if (f) out[f.key] = value;
  }
  return out;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function assertSafeToRun() {
  if (process.env.ALLOW_TEST_SEED !== 'yes') {
    fail(
      'Refusing to run: this writes test data and is for STAGING only.\n' +
        'Re-run with ALLOW_TEST_SEED=yes once DATABASE_URL points at the staging database.',
    );
  }
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    console.log(`Target database: ${url.hostname}${url.pathname}`);
  } catch {
    console.log('Target database: (DATABASE_URL not parseable)');
  }

  const org = await prisma.organisation.findUnique({
    where: { id: ORG_ID },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!org) fail(`Organisation ${ORG_ID} not found. Nothing changed.`);
  if (org.status !== 'active') {
    fail(`"${org.name}" is ${org.status}, not active. Nothing changed.`);
  }
  console.log(`Organisation: "${org.name}" (${org.slug})`);

  const [seededBefore, users, projects] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { orgId: ORG_ID, action: SEED_ACTION },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: { email: { in: USERS.map(emailOf) } },
      select: { email: true },
    }),
    prisma.project.findMany({
      where: { orgId: ORG_ID, name: { in: PROJECTS.map((p) => p.name) } },
      select: { name: true },
    }),
  ]);
  if (seededBefore) {
    console.log(
      `Test data was already seeded on ${seededBefore.createdAt.toISOString()}. Nothing changed.`,
    );
    process.exit(0);
  }
  if (users.length > 0) {
    fail(
      `These test users already exist: ${users.map((u) => u.email).join(', ')}. Nothing changed.`,
    );
  }
  if (projects.length > 0) {
    fail(
      `These projects already exist: ${projects.map((p) => p.name).join(', ')}. Nothing changed.`,
    );
  }

  // The org admin who "created" everything (units, notes, audit rows).
  const admin = await prisma.user.findFirst({
    where: {
      orgId: ORG_ID,
      status: 'active',
      userRoles: { some: { role: { key: 'admin' } } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!admin) fail(`"${org.name}" has no active org admin. Nothing changed.`);

  // Plan check — seeding past a limit would lock records behind
  // "choose what stays", so refuse instead.
  const active = await getOrgActivePlan(prisma, ORG_ID);
  if (!active) fail(`"${org.name}" has no usable plan. Nothing changed.`);
  const [userCount, projectCount, pageCount] = await Promise.all([
    countBillableOrgUsers(prisma, ORG_ID),
    countOrgProjects(prisma, ORG_ID),
    countOrgTotalLandingPages(prisma, ORG_ID),
  ]);
  const maxUsers = resolveLimit(active.plan, 'users');
  const maxProjects = resolveLimit(active.plan, 'projects');
  const maxPages = resolveLimit(active.plan, 'landingPagesCreate');
  console.log(
    `Plan "${active.plan.name}": users ${userCount}/${maxUsers}, projects ${projectCount}/${maxProjects}, ` +
      `landing pages ${pageCount}/${maxPages}`,
  );
  const problems: string[] = [];
  if (userCount + USERS.length > maxUsers) {
    problems.push(`users: needs ${userCount + USERS.length}, plan allows ${maxUsers}`);
  }
  if (projectCount + PROJECTS.length > maxProjects) {
    problems.push(
      `projects: needs ${projectCount + PROJECTS.length}, plan allows ${maxProjects}`,
    );
  }
  if (problems.length > 0) {
    fail(
      `The "${active.plan.name}" plan can't hold the test data:\n  ${problems.join('\n  ')}\n` +
        'Move the organisation to a bigger plan first. Nothing changed.',
    );
  }

  return {
    org,
    adminId: admin.id,
    landingPageRoom: Math.max(0, Math.min(PROJECTS.length, maxPages - pageCount)),
  };
}

async function main() {
  const { org, adminId, landingPageRoom } = await assertSafeToRun();

  const roles = await prisma.role.findMany({
    where: { orgId: null, key: { in: ['manager', 'sales', 'telecaller'] } },
  });
  const roleId = (key: RoleKey) => {
    const r = roles.find((x) => x.key === key);
    if (!r)
      throw new Error(
        `System role "${key}" is missing — run the main seed first.`,
      );
    return r.id;
  };
  (['manager', 'sales', 'telecaller'] as RoleKey[]).forEach(roleId);

  // Landing pages copy the first published landing template assigned to the
  // org — the same rule the app applies (OrgLandingPagesService.create).
  const assigned = await prisma.organisationTemplate.findMany({
    where: {
      orgId: org.id,
      template: { status: 'published', pageType: 'landing' },
    },
    include: {
      template: {
        include: {
          childPages: {
            where: { status: 'published', pageType: 'thank_you' },
            take: 1,
          },
        },
      },
    },
    orderBy: { assignedAt: 'asc' },
  });
  const template = assigned[0]?.template ?? null;

  // Hashed outside the transaction (bcrypt is slow); a fresh salt per user,
  // same cost factor as signup / org-user creation.
  const hashes = await Promise.all(
    USERS.map(() => bcrypt.hash(TEST_PASSWORD, BCRYPT_COST_FACTOR)),
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const now = new Date();

      // --- Users ------------------------------------------------------------
      const userIds: Record<string, string> = { admin: adminId };
      const newUserIds: string[] = [];
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
          },
        });
        await tx.userRole.create({
          data: { userId: created.id, roleId: roleId(u.role) },
        });
        userIds[u.key] = created.id;
        newUserIds.push(created.id);
      }

      // --- Catalog options (missing ones only) -------------------------------
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
      await tx.orgCatalogOption.createMany({
        data: catalogRows,
        skipDuplicates: true,
      });

      // --- Project types -------------------------------------------------
      // Reuse the org's own types; only if one we need is missing, run the
      // product's "Add common types" to add it.
      const needed: TypeName[] = ['Apartment', 'Villa', 'Plot'];
      let typeDefs = await tx.projectTypeDef.findMany({
        where: { orgId: org.id },
      });
      const has = (n: string) =>
        typeDefs.some((t) => t.name.toLowerCase() === n.toLowerCase());
      if (!needed.every(has)) {
        await new OrgProjectTypesService(tx as never).addCommon(org.id);
        typeDefs = await tx.projectTypeDef.findMany({
          where: { orgId: org.id },
        });
      }
      const typeDef = (name: TypeName) => {
        const d = typeDefs.find(
          (t) => t.name.toLowerCase() === name.toLowerCase(),
        );
        if (!d) throw new Error(`Project type "${name}" was not created`);
        return {
          id: d.id,
          name: d.name,
          projectFields: normalizeFieldTemplate(d.projectFields),
          unitFields: normalizeFieldTemplate(d.unitFields),
        };
      };

      // --- Projects, unit types, units --------------------------------------
      const projects: Array<{
        id: string;
        name: string;
        agentKeys: string[];
        units: Array<{ id: string; configuration: string | null }>;
      }> = [];

      for (const [pi, p] of PROJECTS.entries()) {
        const def = typeDef(p.type);
        const pf = def.projectFields;
        const projectValues = valuesByLabel(
          pf,
          p.type === 'Apartment'
            ? {
                'No. of Towers / Blocks': '2',
                'Floors / Structure': 'G + 14',
                'Total Land Area': '4 acres',
              }
            : p.type === 'Villa'
              ? {
                  'No. of Villas': '80',
                  'Total Land Area': '14 acres',
                  'Villa Area Range': '2,400 – 3,600 sq ft',
                }
              : {
                  'Total Land Area': '22 acres',
                  'Plot Area Range': '1,200 – 4,000 sq ft',
                },
        );

        const typicalArea =
          p.type === 'Plot' ? 1500 : p.type === 'Villa' ? 2800 : 1200;
        const project = await tx.project.create({
          data: {
            orgId: org.id,
            name: p.name,
            projectType: def.name,
            projectTypeId: def.id,
            areaUnit: 'sqft',
            projectFieldTemplate: pf as unknown as Prisma.InputJsonValue,
            unitFieldTemplate:
              def.unitFields as unknown as Prisma.InputJsonValue,
            customFields: validateCustomValues(pf, projectValues, {}, true),
            location: `${p.locality}, Bengaluru`,
            reraId: `PRM/KA/RERA/1251/${410 + pi}/PR/${240100 + pi * 7}/00${2000 + pi}`,
            possession: p.possession,
            managerId: userIds.m1,
            status: 'active',
            priceMin: roundTo(p.baseRate * typicalArea * 0.8, 100000),
            priceMax: roundTo(p.baseRate * typicalArea * 2.2, 100000),
            baseRate: p.baseRate,
            tagline: p.tagline,
            launchDate: new Date(now.getTime() - (180 + pi * 30) * DAY)
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
          data: p.agents.map((k) => ({
            projectId: project.id,
            userId: userIds[k],
          })),
        });

        // 6 units per project.
        const unitCount = 6;
        const uf = def.unitFields;
        const unitRows: Prisma.UnitCreateManyInput[] = [];
        const planned = new Map<string, number>();

        for (let ui = 0; ui < unitCount; ui++) {
          const base: Prisma.UnitCreateManyInput = {
            orgId: org.id,
            projectId: project.id,
            unitNo: '',
            status: pick(UNIT_STATUSES, ui + pi),
            facing: pick(CATALOG.facing!, ui + pi),
            createdById: adminId,
            updatedById: adminId,
            variantLabel:
              ui % 3 === 0 ? pick(CATALOG.unit_variant!, ui + pi) : null,
          };

          if (p.type === 'Apartment') {
            const configuration = pick(p.configs, ui);
            const area = configuration === '2 BHK' ? 1150 : 1580;
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
              parking: '2 covered',
              customFields: validateCustomValues(
                uf,
                valuesByLabel(uf, { 'Built-up Area': Math.round(area * 1.25) }),
              ),
            });
          } else if (p.type === 'Villa') {
            const configuration = pick(p.configs, ui);
            const area = configuration === '3 BHK' ? 2450 : 3200;
            const bedrooms = Number(configuration[0]);
            planned.set(configuration, (planned.get(configuration) ?? 0) + 1);
            unitRows.push({
              ...base,
              unitNo: `V-${String(ui + 1).padStart(3, '0')}`,
              configuration,
              area,
              price: roundTo(area * p.baseRate, 10000),
              parking: '2 covered',
              customFields: validateCustomValues(
                uf,
                valuesByLabel(uf, {
                  'Villa Type': pick(['Independent', 'Twin', 'Row'], ui),
                  'Total Floors': 2 + (ui % 2),
                  'Construction Status': 'Under Construction',
                  'Furnishing Status': pick(
                    ['Unfurnished', 'Semi-Furnished'],
                    ui,
                  ),
                  'Plot Area': Math.round(area * 1.4),
                  Bedrooms: bedrooms,
                  Bathrooms: bedrooms + 1,
                  'Private Garden': ui % 2 === 0,
                  'Swimming Pool': configuration !== '3 BHK',
                }),
              ),
            });
          } else {
            const [len, wid] = pick(
              [
                [30, 40],
                [30, 50],
                [40, 60],
              ],
              ui,
            );
            const area = len * wid;
            unitRows.push({
              ...base,
              unitNo: `P-${String(ui + 1).padStart(3, '0')}`,
              area,
              price: roundTo(area * p.baseRate * (ui % 4 === 0 ? 1.1 : 1), 10000),
              parking: null,
              customFields: validateCustomValues(
                uf,
                valuesByLabel(uf, {
                  'Plot Type': 'Residential',
                  'Corner Plot': ui % 4 === 0,
                  'Gated Community': true,
                  Length: len,
                  Width: wid,
                  'Road Width': ui % 2 === 0 ? 40 : 30,
                  'Approved By': 'BMRDA',
                  'Water Connection': true,
                  'Electricity Connection': true,
                }),
              ),
            });
          }
        }

        // Planned unit mix — unit configurations must be among the project's
        // unit types (ProjectsService.assertConfigurationForProject).
        if (planned.size > 0) {
          const areaKey = uf.find((f) => f.role === 'area')?.key;
          const priceKey = uf.find((f) => f.role === 'price')?.key;
          for (const [name, count] of planned) {
            const sample = unitRows.find((u) => u.configuration === name)!;
            const fieldDefaults: Record<string, number> = {};
            if (areaKey) fieldDefaults[areaKey] = sample.area!;
            if (priceKey) fieldDefaults[priceKey] = sample.price!;
            await tx.unitType.create({
              data: {
                projectId: project.id,
                name,
                totalUnits: count * 12,
                fieldDefaults,
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
          agentKeys: p.agents,
          units,
        });
      }

      // --- Standalone units (resale listings) -------------------------------
      const standalone: Array<{
        id: string;
        configuration: string;
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
            managerId: userIds.m1,
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
          agentKeys: s.agents,
        });
      }

      // --- Leads -------------------------------------------------------------
      // 10 on projects (half pinned to a unit), 2 on standalone units. Each is
      // assigned to the manager or one of the project/unit's agents, so the
      // assignee can always open it.
      let leadCount = 0;
      let noteCount = 0;
      for (let li = 0; li < LEAD_NAMES.length; li++) {
        const fullName = LEAD_NAMES[li];
        const phone = `+91 9${String(7701 + li * 37).padStart(4, '0')} ${String(52000 + li * 211).padStart(5, '0')}`;
        const email = `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
        const src = pick(SOURCES, li);
        const status = pick(STAGES, li);
        const createdAt = new Date(
          now.getTime() - (14 - li) * DAY - (li % 5) * 3600 * 1000,
        );

        let projectId: string | null = null;
        let projectName: string | null = null;
        let unitId: string | null = null;
        let interestedIn: string | null = null;
        let agentKeys: string[];

        if (li < 10) {
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
          agentKeys = p.agentKeys;
        } else {
          const s = standalone[li - 10];
          unitId = s.id;
          interestedIn = s.configuration;
          agentKeys = s.agentKeys;
        }
        const assigneeKey = li % 4 === 3 ? 'm1' : pick(agentKeys, li);
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
            configurations: interestedIn ? [interestedIn] : [],
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

      // --- Landing pages (drafts, one per project) -----------------------
      // Same shape as OrgLandingPagesService.create: the template's content
      // bound to the project, plus a thank-you companion page.
      const pages: string[] = [];
      if (template) {
        const companion = template.childPages[0] ?? null;
        for (const p of projects.slice(0, landingPageRoom)) {
          const full = await tx.project.findUniqueOrThrow({
            where: { id: p.id },
            include: {
              _count: { select: { units: true } },
              unitTypes: { select: { name: true, floorPlanUrl: true } },
            },
          });
          const snapshot = snapshotFromProject({
            orgName: org.name,
            project: full,
            unitCount: full._count.units,
            unitTypes: full.unitTypes,
          });
          const bind = (raw: unknown) => {
            const c = (raw ?? {}) as {
              sections?: unknown;
              config?: Record<string, unknown>;
              engine?: string;
              site?: unknown;
            };
            const bound = bindLandingPageContent(
              { sections: c.sections ?? [], config: c.config ?? {}, site: c.site },
              { kind: 'project', projectId: p.id },
              snapshot,
            );
            return {
              ...bound,
              engine: c.engine,
              site: bound.site ?? c.site,
            } as Prisma.InputJsonValue;
          };

          const slug = await generateUniqueLandingPageSlug(
            tx as never,
            org.id,
            p.name,
          );
          const companionSlug = await generateUniqueLandingPageSlug(
            tx as never,
            org.id,
            `${p.name} thank you`,
          );
          const content = bind(template.content);
          const page = await tx.landingPage.create({
            data: {
              orgId: org.id,
              sourceTemplateId: template.id,
              name: p.name,
              slug,
              status: 'draft',
              content,
              thumbnail: template.thumbnail,
              pageType: 'landing',
            },
          });
          await tx.landingPage.create({
            data: {
              orgId: org.id,
              sourceTemplateId: companion?.id ?? null,
              name: companion?.name ?? `${p.name} — Thank You`,
              slug: companionSlug,
              status: 'draft',
              content: companion
                ? bind(companion.content)
                : ({ sections: [], config: {} } as Prisma.InputJsonValue),
              thumbnail: companion?.thumbnail ?? null,
              pageType: 'thank_you',
              parentId: page.id,
            },
          });
          await tx.pageRevision.create({
            data: { landingPageId: page.id, orgId: org.id, content },
          });
          await tx.auditLog.create({
            data: {
              orgId: org.id,
              actorId: adminId,
              action: 'landing_page_created',
              entity: 'LandingPage',
              entityId: page.id,
              metadata: {
                sourceTemplateId: template.id,
                name: p.name,
                projectId: p.id,
                unitId: null,
              },
            },
          });
          pages.push(p.name);
        }
      }

      await tx.auditLog.create({
        data: {
          orgId: org.id,
          actorId: adminId,
          action: SEED_ACTION,
          entity: 'Organisation',
          entityId: org.id,
          metadata: { script: 'prisma/seed-org-test-data.ts' },
        },
      });

      return {
        newUserIds,
        projectCount: projects.length,
        unitCount: projects.reduce((n, p) => n + p.units.length, 0),
        standaloneCount: standalone.length,
        leadCount,
        noteCount,
        pages,
      };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  // Team Chat: new users join the org's General channel. Plain client, after
  // commit — the hook must never run inside a transaction.
  for (const userId of result.newUserIds) {
    await runTeamChatHook('test data seed', () =>
      teamChatUserActivated(prisma, org.id, userId),
    );
  }

  console.log(`\nSeeded "${org.name}":`);
  console.log(
    `  ${USERS.length} users, ${result.projectCount} projects, ${result.unitCount} project units, ` +
      `${result.standaloneCount} standalone units, ${result.leadCount} leads, ${result.noteCount} notes.`,
  );
  if (!template) {
    console.log(
      '  Landing pages: skipped — no published landing template is assigned to this organisation.',
    );
  } else if (result.pages.length < PROJECTS.length) {
    console.log(
      `  Landing pages: ${result.pages.length} draft(s) from "${template.name}" — the plan's landing page limit stopped the rest.`,
    );
  } else {
    console.log(
      `  Landing pages: ${result.pages.length} drafts from "${template.name}" (one per project, with thank-you pages).`,
    );
  }
  console.log(`\nNew logins (password for all: ${TEST_PASSWORD}):`);
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(10)} ${emailOf(u)}`);
  }
}

main()
  .catch((err) => {
    console.error(
      'Test data seed failed — nothing was written (transaction rolled back).',
    );
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
