import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  EXCLUDED_ROLE_KEYS,
  listLeadAssignableUsers,
} from '../../common/utils/lead-assignee.util';
import {
  CustomValues,
  FieldDef,
  FieldRole,
  nonRoleFields,
  normalizeFieldTemplate,
  roleField,
  validateCustomValues,
} from '../../common/utils/field-template.util';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import { UpdateUnitTypeDto } from './dto/update-unit-type.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto, UpdateUnitStatusDto } from './dto/update-unit.dto';
import { ListUnitsQueryDto } from './dto/list-units-query.dto';
import { ListOrgUnitsQueryDto } from './dto/list-org-units-query.dto';
import {
  assertLimit,
  countOrgProjects,
} from '../../common/utils/plan-quota.util';

// Columns a PATCH may set on a Project, and the coercion each needs. Keeps
// update() free of a 12-branch if-ladder while still only touching the keys
// the caller actually sent (an omitted key is left untouched; an explicit
// null clears a nullable column).
const PROJECT_SCALARS = [
  'name',
  'location',
  'reraId',
  'possession',
  'managerId',
  'status',
  'priceMin',
  'priceMax',
  'baseRate',
  'areaUnit',
  // Wizard Steps 1-2 identity & timeline.
  'projectType',
  'tagline',
  'launchDate',
  'constructionStage',
  'highlights',
  'salesTeam',
  // Onboarding-wizard scalars (Steps 3-8). Arrays (priceIncludes,
  // connectivity, galleryUrls) and Json (specifications, marketing) are
  // handled separately below.
  'bookingAmount',
  'currency',
  'paymentPlan',
  'offers',
  'addressLine',
  'city',
  'locality',
  'pincode',
  'latitude',
  'longitude',
  'landmarks',
  'requireBookingApproval',
  'visibleToTelecallers',
  'publishedToWebsite',
  'coverImageUrl',
  'brochureUrl',
  'reraCertificateUrl',
] as const;

// Authorship is expanded on every unit response so the units list can show
// "Updated by X" without a second request or an audit_logs lookup.
const UNIT_ACTOR_SELECT = {
  select: { id: true, firstName: true, lastName: true, email: true },
} as const;

const UNIT_INCLUDE = {
  project: { select: { currency: true, areaUnit: true, unitFieldTemplate: true } },
  createdBy: UNIT_ACTOR_SELECT,
  updatedBy: UNIT_ACTOR_SELECT,
  manager: UNIT_ACTOR_SELECT,
  salesAgents: { select: { userId: true } },
} satisfies Prisma.UnitInclude;

type UnitRow = Prisma.UnitGetPayload<{ include: typeof UNIT_INCLUDE }>;

// The manager relation is expanded on every project response so the client
// never needs a second round-trip just to show a name — same approach as
// OrgLandingPages including `sourceTemplate: { select: { id, name } }`.
const PROJECT_INCLUDE = {
  manager: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

type UnitTypeWithCounts = Prisma.UnitTypeGetPayload<Record<string, never>> & {
  unitCount: number;
  availableUnits: number;
  bookedUnits: number;
  heldUnits: number;
  soldUnits: number;
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // -------------------------------------------------------------------------
  // Media uploads — issue a short-lived presigned PUT URL for direct
  // browser → R2 upload. Bytes never pass through this API. The key's
  // orgId segment is always the caller's own (from the JWT); if a
  // projectId / unitTypeId is given we verify the caller owns it before
  // signing, so a URL can only ever be scoped into your own key space.
  // -------------------------------------------------------------------------
  async createUploadUrl(orgId: string, dto: CreateUploadUrlDto) {
    if (dto.unitTypeId) {
      if (!dto.projectId) {
        throw new BadRequestException(
          'projectId is required when unitTypeId is given.',
        );
      }
      await this.getOwnedUnitType(orgId, dto.projectId, dto.unitTypeId);
    } else if (dto.projectId) {
      await this.getOwnedProject(orgId, dto.projectId);
    }

    return this.storage.createUploadUrl({
      orgId,
      field: dto.field,
      filename: dto.filename,
      contentType: dto.contentType,
      size: dto.size,
      projectId: dto.projectId,
      unitTypeId: dto.unitTypeId,
    });
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  async create(orgId: string, dto: CreateProjectDto, actorId?: string) {
    const managerId = await this.resolveManagerId(orgId, dto.managerId);

    // Plan project quota — enforced only when the org has a subscription
    // (mirrors the template-quota behaviour). All projects count, any status.
    const subscription = await this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: { plan: true },
    });
    if (subscription) {
      const currentCount = await countOrgProjects(this.prisma, orgId);
      assertLimit(subscription.plan, 'projects', currentCount, 1);
    }

    // The templates start as a copy of the project's type's — which the
    // caller may have edited for this project — never from the client
    // otherwise. There is no fixed layout: which inventory controls exist is
    // derived at read time from which role fields the unit template has.
    const def = dto.projectType
      ? await this.resolveProjectType(orgId, dto.projectType)
      : null;
    const projectFieldTemplate = normalizeFieldTemplate(
      dto.projectFieldTemplate ?? def?.projectFields ?? [],
    );
    const unitFieldTemplate = normalizeFieldTemplate(
      dto.unitFieldTemplate ?? def?.unitFields ?? [],
    );
    const customFields = validateCustomValues(
      projectFieldTemplate,
      dto.customFields,
      {},
      true,
    );

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          orgId,
          projectTypeId: def?.id ?? null,
          areaUnit: dto.areaUnit,
          projectFieldTemplate: projectFieldTemplate as unknown as Prisma.InputJsonValue,
          unitFieldTemplate: unitFieldTemplate as unknown as Prisma.InputJsonValue,
          customFields: customFields as unknown as Prisma.InputJsonValue,
          name: dto.name,
          location: dto.location ?? null,
          reraId: dto.reraId ?? null,
          possession: dto.possession ?? null,
          managerId,
          // Required on the DTO now (@IsNotEmpty) — no silent 'active' default.
          status: dto.status,
          priceMin: dto.priceMin ?? null,
          priceMax: dto.priceMax ?? null,
          baseRate: dto.baseRate ?? null,
          projectType: dto.projectType ?? null,
          tagline: dto.tagline ?? null,
          launchDate: dto.launchDate ?? null,
          constructionStage: dto.constructionStage ?? null,
          highlights: dto.highlights ?? null,
          salesTeam: dto.salesTeam ?? null,
          amenities: (dto.amenities ?? []) as unknown as Prisma.InputJsonValue,
          // Onboarding-wizard fields (Steps 3-8).
          bookingAmount: dto.bookingAmount ?? null,
          // Required on the DTO now (@IsNotEmpty) — no silent INR fallback.
          currency: dto.currency,
          priceIncludes: dto.priceIncludes ?? [],
          paymentPlan: dto.paymentPlan ?? null,
          offers: dto.offers ?? null,
          addressLine: dto.addressLine ?? null,
          city: dto.city ?? null,
          locality: dto.locality ?? null,
          pincode: dto.pincode ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          connectivity: dto.connectivity ?? [],
          landmarks: dto.landmarks ?? null,
          specifications: dto.specifications as unknown as
            Prisma.InputJsonValue | undefined,
          marketing: dto.marketing as unknown as
            Prisma.InputJsonValue | undefined,
          requireBookingApproval: dto.requireBookingApproval ?? false,
          visibleToTelecallers: dto.visibleToTelecallers ?? true,
          publishedToWebsite: dto.publishedToWebsite ?? false,
          coverImageUrl: dto.coverImageUrl ?? null,
          galleryUrls: dto.galleryUrls ?? [],
          brochureUrl: dto.brochureUrl ?? null,
          reraCertificateUrl: dto.reraCertificateUrl ?? null,
          floorPlanUrls: dto.floorPlanUrls ?? [],
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actorId ?? null,
          action: 'project_created',
          entity: 'Project',
          entityId: created.id,
          metadata: { name: created.name },
        },
      });

      return created;
    });

    return this.getById(orgId, project.id);
  }

  async list(orgId: string, query: ListProjectsQueryDto, actor?: JwtPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const andConditions: Prisma.ProjectWhereInput[] = [{ orgId }];
    if (query.status) andConditions.push({ status: query.status });
    if (query.search) {
      andConditions.push({ name: { contains: query.search, mode: 'insensitive' } });
    }

    if (actor && !actor.roles?.includes('admin') && !actor.roles?.includes('super_admin')) {
      andConditions.push({
        OR: [
          { managerId: actor.sub },
          { salesAgents: { some: { userId: actor.sub } } },
        ],
      });
    }

    const where: Prisma.ProjectWhereInput = andConditions.length > 1 ? { AND: andConditions } : andConditions[0]!;

    const [rows, total, landingPageCounts] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ...PROJECT_INCLUDE,
          _count: { select: { unitTypes: true, units: true } },
        },
      }),
      this.prisma.project.count({ where }),
      // A landing page's project link lives in its own `content.config.
      // propertyBinding` JSON, not a real FK column (see org-landing-pages'
      // resolveBinding/bindLandingPageContent) — grouped raw query rather
      // than an N+1 per-project lookup or a Prisma relation that doesn't
      // exist on the schema.
      this.prisma.$queryRaw<Array<{ projectId: string; count: bigint }>>`
        SELECT (content->'config'->'propertyBinding'->>'projectId') AS "projectId", COUNT(*) AS count
        FROM templates.landing_pages
        WHERE org_id = ${orgId}
          AND content->'config'->'propertyBinding'->>'kind' = 'project'
        GROUP BY (content->'config'->'propertyBinding'->>'projectId')
      `,
    ]);

    const landingPageCountByProject = new Map(
      landingPageCounts.map((r) => [r.projectId, Number(r.count)]),
    );

    const data = rows.map((row) => ({
      ...this.serializeProject(row),
      unitTypeCount: row._count.unitTypes,
      unitCount: row._count.units,
      landingPageCount: landingPageCountByProject.get(row.id) ?? 0,
    }));

    return { data, total, page, limit };
  }

  async getById(orgId: string, id: string, actor?: JwtPayload) {
    const project = await this.getOwnedProject(orgId, id, actor);

    const unitTypes = await this.prisma.unitType.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
    });
    const decorated = await this.decorateUnitTypes(unitTypes);

    const salesAgentRows = await this.prisma.projectSalesAgent.findMany({
      where: { projectId: id },
      select: { userId: true },
    });

    // Actual counts come straight from the project's Unit rows (grouped by
    // status), so a unit whose configuration matches no planned UnitType is
    // still counted. Planned total still comes from the UnitType rows.
    const statusGrouped = await this.prisma.unit.groupBy({
      by: ['status'],
      where: { projectId: id },
      _count: { _all: true },
    });
    const actual = { available: 0, booked: 0, held: 0, sold: 0, total: 0 };
    for (const g of statusGrouped) {
      actual[g.status] = g._count._all;
      actual.total += g._count._all;
    }

    const rollup = {
      totalUnitsPlanned: decorated.reduce((s, ut) => s + ut.totalUnits, 0),
      unitsCreated: actual.total,
      unitsAvailable: actual.available,
      unitsBooked: actual.booked,
      unitsHeld: actual.held,
      unitsSold: actual.sold,
    };

    // Every distinct configuration actually present on the project's units
    // (a superset of the planned UnitType names) with its status breakdown —
    // the [id]/units page renders one card per configuration.
    const configGrouped = await this.prisma.unit.groupBy({
      by: ['configuration', 'status'],
      where: { projectId: id, configuration: { not: null } },
      _count: { _all: true },
    });
    const configMap = new Map<
      string,
      {
        label: string;
        total: number;
        available: number;
        booked: number;
        held: number;
        sold: number;
      }
    >();
    for (const g of configGrouped) {
      const label = g.configuration!;
      const e =
        configMap.get(label) ??
        { label, total: 0, available: 0, booked: 0, held: 0, sold: 0 };
      const n = g._count._all;
      e.total += n;
      e[g.status] += n;
      configMap.set(label, e);
    }

    return {
      ...this.serializeProject(project),
      unitTypes: decorated.map((ut) => this.serializeUnitType(ut)),
      configurations: [...configMap.values()].sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      rollup,
      salesAgentIds: salesAgentRows.map((r) => r.userId),
    };
  }

  async update(orgId: string, id: string, dto: UpdateProjectDto, actor?: JwtPayload) {
    const existingProject = await this.getOwnedProject(orgId, id, actor);
    const managerId =
      dto.managerId !== undefined
        ? await this.resolveManagerId(orgId, dto.managerId)
        : undefined;

    // Block a currency switch once real unit/unit-type prices exist — those
    // numbers were entered under the old currency and would be silently
    // reinterpreted (₹1,00,00,000 becoming AED 1,00,00,000) rather than
    // converted. Deliberately NOT checking the project's own priceMin/
    // priceMax/baseRate/bookingAmount here: priceMin is a mandatory field on
    // every project (required at creation, never nullable through the edit
    // form's own validation), so including it would make this block
    // permanent for every project that exists, not a guard against stale
    // data. Those headline price fields are edited on this exact form, in
    // the same request as the currency change, so the person changing
    // currency is already looking at them — unlike a unit's price, which
    // lives on a different page and is easy to forget about.
    if (dto.currency !== undefined && dto.currency !== existingProject.currency) {
      const priceField = roleField(
        this.readTemplate(existingProject.unitFieldTemplate),
        'price',
      );
      const [pricedUnit, pricedUnitType] = await Promise.all([
        this.prisma.unit.findFirst({
          where: { projectId: id, price: { not: null } },
          select: { id: true },
        }),
        this.prisma.unitType.findMany({
          where: { projectId: id },
          select: { id: true, fieldDefaults: true },
        }).then((rows) =>
          priceField
            ? rows.find((row) => {
                const defaults = row.fieldDefaults;
                return typeof defaults === 'object' && defaults !== null &&
                  !Array.isArray(defaults) &&
                  Object.prototype.hasOwnProperty.call(defaults, priceField.key) &&
                  defaults[priceField.key] !== null &&
                  defaults[priceField.key] !== undefined &&
                  defaults[priceField.key] !== '';
              }) ?? null
            : null,
        ),
      ]);

      if (pricedUnit || pricedUnitType) {
        throw new BadRequestException(
          'Currency cannot be changed after unit or unit-type prices have been entered. Clear all unit and unit-type prices first.',
        );
      }

      // The project's own headline price fields can't be required-empty the
      // way unit prices are (priceMin is mandatory), so instead require them
      // to actually be RE-ENTERED alongside a currency change: if a field
      // already holds a value and the submitted value is exactly the same
      // number, that's the old amount sitting there unchanged under a new
      // currency label — the same silent-reinterpretation bug, just not
      // caught by the block above. A genuinely different number (including
      // one the user retyped identically on purpose) passes through.
      const HEADLINE_PRICE_FIELDS: {
        key: 'priceMin' | 'priceMax' | 'baseRate' | 'bookingAmount';
        label: string;
      }[] = [
        { key: 'priceMin', label: 'Price range — from' },
        { key: 'priceMax', label: 'Price range — to' },
        { key: 'baseRate', label: 'Price per sqft' },
        { key: 'bookingAmount', label: 'Booking amount' },
      ];
      const stale = HEADLINE_PRICE_FIELDS.filter(({ key }) => {
        const oldVal = existingProject[key];
        if (oldVal == null) return false;
        const newVal = dto[key] !== undefined ? dto[key] : oldVal;
        return newVal === oldVal;
      });
      if (stale.length > 0) {
        throw new BadRequestException(
          `Currency changed — re-enter these in the new currency before saving: ${stale
            .map((f) => f.label)
            .join(', ')}.`,
        );
      }
    }

    const data: Prisma.ProjectUncheckedUpdateInput = {};
    for (const key of PROJECT_SCALARS) {
      if (dto[key] !== undefined) {
        (data as Record<string, unknown>)[key] = dto[key];
      }
    }
    if (managerId !== undefined) data.managerId = managerId;

    // Switching type re-copies its templates onto the project (the caller may
    // then edit them further). Existing units keep whatever values they
    // already have — a field the new template doesn't define is simply kept,
    // just hidden, same as any other template edit.
    let typeDef: Awaited<ReturnType<typeof this.resolveProjectType>> | null = null;
    if (
      dto.projectType != null &&
      dto.projectType !== existingProject.projectType
    ) {
      typeDef = await this.resolveProjectType(orgId, dto.projectType);
      data.projectTypeId = typeDef.id;
    }

    const readTemplate = (v: Prisma.JsonValue): FieldDef[] =>
      (Array.isArray(v) ? v : []) as unknown as FieldDef[];
    let projectFieldTemplate = readTemplate(existingProject.projectFieldTemplate);
    if (dto.projectFieldTemplate !== undefined) {
      projectFieldTemplate = normalizeFieldTemplate(dto.projectFieldTemplate);
      data.projectFieldTemplate = projectFieldTemplate as unknown as Prisma.InputJsonValue;
    } else if (typeDef) {
      projectFieldTemplate = normalizeFieldTemplate(typeDef.projectFields);
      data.projectFieldTemplate = projectFieldTemplate as unknown as Prisma.InputJsonValue;
    }
    if (dto.unitFieldTemplate !== undefined) {
      data.unitFieldTemplate = normalizeFieldTemplate(
        dto.unitFieldTemplate,
      ) as unknown as Prisma.InputJsonValue;
    } else if (typeDef) {
      data.unitFieldTemplate = normalizeFieldTemplate(
        typeDef.unitFields,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (dto.customFields !== undefined || dto.projectFieldTemplate !== undefined || typeDef) {
      data.customFields = validateCustomValues(
        projectFieldTemplate,
        dto.customFields,
        (existingProject.customFields ?? {}) as CustomValues,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (dto.amenities !== undefined) {
      data.amenities = dto.amenities as unknown as Prisma.InputJsonValue;
    }
    // Onboarding-wizard arrays + preference blobs.
    if (dto.priceIncludes !== undefined) data.priceIncludes = dto.priceIncludes;
    if (dto.connectivity !== undefined) data.connectivity = dto.connectivity;
    if (dto.galleryUrls !== undefined) data.galleryUrls = dto.galleryUrls;
    if (dto.floorPlanUrls !== undefined) data.floorPlanUrls = dto.floorPlanUrls;
    if (dto.specifications !== undefined) {
      data.specifications =
        dto.specifications as unknown as Prisma.InputJsonValue;
    }
    if (dto.marketing !== undefined) {
      data.marketing = dto.marketing as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.project.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'project_updated',
          entity: 'Project',
          entityId: id,
          metadata: { fields: Object.keys(data) },
        },
      });
      return row;
    });

    void updated;
    return this.getById(orgId, id);
  }

  async remove(orgId: string, id: string, actor?: JwtPayload) {
    await this.getOwnedProject(orgId, id, actor);
    // Hard delete — no soft-delete anywhere in this codebase. Child
    // unit_types and units cascade via the FK ON DELETE CASCADE.
    await this.prisma.$transaction(async (tx) => {
      await tx.project.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'project_deleted',
          entity: 'Project',
          entityId: id,
          metadata: {},
        },
      });
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Sales agents assigned to a project (Step 7 of the onboarding wizard).
  // A plain many-to-many with User; PUT replaces the whole set so
  // re-submitting is idempotent (delete-all + recreate in one transaction).
  // -------------------------------------------------------------------------

  /**
   * CRM-eligible candidates for LEAD assignment and STANDALONE-unit agents.
   * Narrower than a project's sales-agent rule below: it also requires crm:view.
   */
  async listSalesAgentCandidates(orgId: string) {
    const data = await listLeadAssignableUsers(this.prisma, orgId);
    return { data, total: data.length };
  }

  /**
   * A user is barred from being a project SALES AGENT when any of their roles
   * is Admin, Manager or Super Admin. Status-agnostic on purpose: a disabled
   * role's existing memberships keep working (see Role.status), so a user who
   * still holds `admin` is still an admin. The one predicate behind both the
   * picker list and the server-side check in `setSalesAgents`.
   */
  private hasExcludedAgentRole(roleKeys: string[]): boolean {
    return roleKeys.some((key) => EXCLUDED_ROLE_KEYS.has(key));
  }

  /**
   * Active org members for a project's assignment pickers, each with their
   * role and the projects they are already on.
   *
   *  - `sales_agent` (default): everyone EXCEPT Admins and Managers. There is
   *    no CRM-permission requirement — telecallers and custom roles are valid
   *    project agents. Active members only. `setSalesAgents` enforces this
   *    same predicate.
   *  - `manager`: every active user holding the `manager` role — the same set
   *    `GET /org/users?role=manager` returns, so the Project manager dropdown
   *    keeps listing exactly the managers it always did, now with context.
   */
  async listProjectAssigneeCandidates(
    orgId: string,
    kind: 'sales_agent' | 'manager' = 'sales_agent',
  ) {
    const users = await this.prisma.user.findMany({
      where: { orgId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userRoles: {
          select: { role: { select: { key: true, name: true, status: true } } },
        },
        managedProjects: { select: { id: true, name: true } },
        salesProjects: {
          select: { project: { select: { id: true, name: true } } },
        },
      },
    });

    const data = users
      .filter((user) => {
        const keys = user.userRoles.map((ur) => ur.role.key);
        return kind === 'manager'
          ? keys.includes('manager')
          : !this.hasExcludedAgentRole(keys);
      })
      .map((user) => {
        const projects = new Map<string, { id: string; name: string; role: string }>();
        for (const project of user.managedProjects) {
          projects.set(project.id, { ...project, role: 'Manager' });
        }
        for (const assignment of user.salesProjects) {
          if (!projects.has(assignment.project.id)) {
            projects.set(assignment.project.id, {
              ...assignment.project,
              role: 'Sales agent',
            });
          }
        }

        const activeRoles = user.userRoles
          .filter((ur) => ur.role.status === 'active')
          .map((ur) => ur.role);
        const role =
          (kind === 'manager'
            ? activeRoles.find((r) => r.key === 'manager')
            : undefined) ?? activeRoles[0];

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
          role: role ? { key: role.key, name: role.name } : null,
          projects: [...projects.values()],
        };
      });
    return { data, total: data.length };
  }

  async listSalesAgents(orgId: string, projectId: string) {
    await this.getOwnedProject(orgId, projectId);
    const rows = await this.prisma.projectSalesAgent.findMany({
      where: { projectId },
      orderBy: { assignedAt: 'asc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    return rows.map((r) => ({
      id: r.user.id,
      firstName: r.user.firstName,
      lastName: r.user.lastName,
      email: r.user.email,
      name:
        [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') ||
        r.user.email,
      assignedAt: r.assignedAt,
    }));
  }

  /**
   * STANDALONE-unit agents only (a project's own agents use the broader rule
   * in `setSalesAgents`): every id must be someone the shared "who can hold a
   * lead" rule allows — never trusted from the body. Same list
   * `listSalesAgentCandidates` shows, so a direct API call can't attach anyone
   * the picker wouldn't offer.
   *
   * Callers must pass only the ids being newly added to the set, not the
   * whole resubmitted list — an id that's already assigned may have since
   * gone inactive or lost CRM access (a role/permission change made after
   * they were assigned), and re-saving the *same* set, or removing a
   * *different* agent, must not be blocked by that. Eligibility only gates
   * adding someone new.
   */
  private async assertAssignableAgents(orgId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    const eligible = new Set(
      (await listLeadAssignableUsers(this.prisma, orgId)).map((u) => u.id),
    );
    if (!userIds.every((id) => eligible.has(id))) {
      throw new BadRequestException(
        'Assigned agents must be organisation members who can be assigned leads (not admins or managers)',
      );
    }
  }

  async setSalesAgents(orgId: string, projectId: string, userIds: string[]) {
    await this.getOwnedProject(orgId, projectId);

    const unique = [...new Set(userIds)];
    // Only ids being newly added need to pass the eligibility check (see
    // assertAssignableAgents) — dropping or re-saving an already-assigned
    // agent must always be possible, even if they'd no longer be offered by
    // the picker today.
    const currentIds = new Set(
      (
        await this.prisma.projectSalesAgent.findMany({
          where: { projectId },
          select: { userId: true },
        })
      ).map((r) => r.userId),
    );
    const newIds = unique.filter((id) => !currentIds.has(id));
    if (newIds.length > 0) {
      const candidates = await this.prisma.user.findMany({
        where: { orgId, status: 'active', id: { in: newIds } },
        select: {
          id: true,
          userRoles: { select: { role: { select: { key: true } } } },
        },
      });
      if (candidates.length !== newIds.length) {
        throw new BadRequestException(
          'Assigned users must be active members of this organisation',
        );
      }
      // Same predicate as the sales-agent picker (see hasExcludedAgentRole) —
      // a direct API call can't attach anyone the picker wouldn't offer.
      if (
        candidates.some((user) =>
          this.hasExcludedAgentRole(user.userRoles.map((ur) => ur.role.key)),
        )
      ) {
        throw new BadRequestException(
          'Admins and Managers cannot be assigned as project sales agents',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.projectSalesAgent.deleteMany({ where: { projectId } });
      if (unique.length > 0) {
        await tx.projectSalesAgent.createMany({
          data: unique.map((userId) => ({ projectId, userId })),
        });
      }
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'project_sales_agents_set',
          entity: 'Project',
          entityId: projectId,
          metadata: { count: unique.length },
        },
      });
    });

    return this.listSalesAgents(orgId, projectId);
  }

  // -------------------------------------------------------------------------
  // Unit types
  // -------------------------------------------------------------------------

  async createUnitType(
    orgId: string,
    projectId: string,
    dto: CreateUnitTypeDto,
  ) {
    const project = await this.getOwnedProject(orgId, projectId);
    // A planned configuration mix only makes sense once the project's unit
    // template actually has a `configuration`-role field.
    const template = this.readTemplate(project.unitFieldTemplate);
    if (!roleField(template, 'configuration')) {
      throw new BadRequestException(
        "Unit types (a planned configuration mix) need a configuration field in this project's unit template first.",
      );
    }
    const fieldDefaults = validateCustomValues(template, dto.fieldDefaults);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.unitType.create({
        data: {
          projectId,
          name: dto.name,
          fieldDefaults: fieldDefaults as unknown as Prisma.InputJsonValue,
          totalUnits: dto.totalUnits ?? 0,
          floorPlanUrl: dto.floorPlanUrl ?? null,
          brochureUrl: dto.brochureUrl ?? null,
          videoUrl: dto.videoUrl ?? null,
          galleryUrls: dto.galleryUrls ?? [],
        },
      });
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'unit_type_created',
          entity: 'UnitType',
          entityId: row.id,
          metadata: { projectId, name: row.name },
        },
      });
      return row;
    });

    const [decorated] = await this.decorateUnitTypes([created]);
    return this.serializeUnitType(decorated);
  }

  async listUnitTypes(orgId: string, projectId: string) {
    await this.getOwnedProject(orgId, projectId);
    const rows = await this.prisma.unitType.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    const decorated = await this.decorateUnitTypes(rows);
    return decorated.map((ut) => this.serializeUnitType(ut));
  }

  async getUnitType(orgId: string, projectId: string, id: string) {
    const row = await this.getOwnedUnitType(orgId, projectId, id);
    const [decorated] = await this.decorateUnitTypes([row]);
    return this.serializeUnitType(decorated);
  }

  async updateUnitType(
    orgId: string,
    projectId: string,
    id: string,
    dto: UpdateUnitTypeDto,
  ) {
    const [project, existing] = await Promise.all([
      this.getOwnedProject(orgId, projectId),
      this.getOwnedUnitType(orgId, projectId, id),
    ]);

    const data: Prisma.UnitTypeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.fieldDefaults !== undefined) {
      data.fieldDefaults = validateCustomValues(
        this.readTemplate(project.unitFieldTemplate),
        dto.fieldDefaults,
        (existing.fieldDefaults ?? {}) as CustomValues,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (dto.totalUnits !== undefined) data.totalUnits = dto.totalUnits;
    if (dto.floorPlanUrl !== undefined) data.floorPlanUrl = dto.floorPlanUrl;
    if (dto.brochureUrl !== undefined) data.brochureUrl = dto.brochureUrl;
    if (dto.videoUrl !== undefined) data.videoUrl = dto.videoUrl;
    if (dto.galleryUrls !== undefined) data.galleryUrls = dto.galleryUrls;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.unitType.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'unit_type_updated',
          entity: 'UnitType',
          entityId: id,
          metadata: { projectId, fields: Object.keys(data) },
        },
      });
      return row;
    });

    const [decorated] = await this.decorateUnitTypes([updated]);
    return this.serializeUnitType(decorated);
  }

  async removeUnitType(orgId: string, projectId: string, id: string) {
    const unitType = await this.getOwnedUnitType(orgId, projectId, id);

    // A configuration that real units are using can't be dropped from the
    // planned mix. Deleting the row can't cascade to those units (there is no
    // FK from Unit to UnitType) — it would orphan them, leaving them with no
    // planned sizes or pricing to prefill from. Both UI paths block this too;
    // this is the authority, so a direct API call can't slip past it.
    const unitsUsing = await this.prisma.unit.count({
      where: { projectId, configuration: unitType.name },
    });
    if (unitsUsing > 0) {
      const plural = unitsUsing === 1 ? '' : 's';
      throw new BadRequestException(
        `"${unitType.name}" can't be removed from the planned mix — ` +
          `${unitsUsing} unit${plural} on this project ` +
          `${unitsUsing === 1 ? 'uses' : 'use'} it. ` +
          `Delete ${unitsUsing === 1 ? 'that unit' : 'those units'} first, ` +
          `or leave the configuration in place.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.unitType.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'unit_type_deleted',
          entity: 'UnitType',
          entityId: id,
          metadata: { projectId },
        },
      });
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Units
  // -------------------------------------------------------------------------

  async createUnit(
    orgId: string,
    projectId: string,
    dto: CreateUnitDto,
    actorId?: string,
  ) {
    const project = await this.getOwnedProject(orgId, projectId);
    const template = this.readTemplate(project.unitFieldTemplate);

    // Which fields a unit may carry depends on which role fields the
    // project's unit template has.
    this.assertUnitFitsTemplate(template, dto);
    if (roleField(template, 'configuration')) {
      // In a project, the configuration must be one the project itself has —
      // not just anything in the org catalog. Never trusted from the body.
      if (!dto.configuration?.trim()) {
        throw new BadRequestException('Configuration is required');
      }
      await this.assertConfigurationForProject(projectId, dto.configuration);
    }
    await this.assertVariantInCatalog(orgId, dto.variantLabel);

    const tower = dto.tower?.trim() || null;
    const customFields = validateCustomValues(
      nonRoleFields(template),
      dto.customFields,
      {},
      true,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.unit.create({
        data: {
          orgId,
          projectId,
          configuration: dto.configuration?.trim() || null,
          variantLabel: dto.variantLabel?.trim() || null,
          unitNo: dto.unitNo,
          area: dto.area ?? null,
          customFields: customFields as unknown as Prisma.InputJsonValue,
          tower,
          floor: dto.floor ?? null,
          facing: dto.facing ?? null,
          parking: dto.parking?.trim() || null,
          price: dto.price ?? null,
          addressLine: dto.addressLine?.trim() || null,
          ownerName: dto.ownerName?.trim() || null,
          notes: dto.notes?.trim() || null,
          floorPlanUrl: dto.floorPlanUrl ?? null,
          galleryUrls: dto.galleryUrls ?? [],
          status: dto.status ?? 'available',
          createdById: actorId ?? null,
          updatedById: actorId ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actorId ?? null,
          action: 'unit_created',
          entity: 'Unit',
          entityId: row.id,
          metadata: {
            projectId,
            configuration: row.configuration,
            unitNo: row.unitNo,
          },
        },
      });
      return row;
    });

    return this.getUnit(orgId, projectId, created.id);
  }

  async listUnits(orgId: string, projectId: string, query: ListUnitsQueryDto) {
    await this.getOwnedProject(orgId, projectId);

    const where: Prisma.UnitWhereInput = { projectId };
    if (query.configuration) where.configuration = query.configuration;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.unitNo = { contains: query.search, mode: 'insensitive' };
    }

    const rows = await this.prisma.unit.findMany({
      where,
      orderBy: [{ unitNo: 'asc' }],
      include: UNIT_INCLUDE,
    });

    return rows.map((row) => this.serializeUnit(row));
  }

  async getUnit(orgId: string, projectId: string, id: string) {
    const row = await this.getOwnedUnit(orgId, projectId, id);
    return this.serializeUnit(row);
  }

  async updateUnit(
    orgId: string,
    projectId: string,
    id: string,
    dto: UpdateUnitDto,
    actorId?: string,
  ) {
    const project = await this.getOwnedProject(orgId, projectId);
    const existing = await this.getOwnedUnit(orgId, projectId, id);
    const template = this.readTemplate(project.unitFieldTemplate);

    this.assertUnitFitsTemplate(template, dto);
    if (dto.configuration !== undefined && roleField(template, 'configuration')) {
      // The unit's own current value stays valid, so an edit never has to
      // rename a unit whose configuration has since been dropped.
      await this.assertConfigurationForProject(
        projectId,
        dto.configuration,
        existing.configuration,
      );
    }
    if (dto.variantLabel !== undefined) {
      await this.assertVariantInCatalog(
        orgId,
        dto.variantLabel,
        existing.variantLabel,
      );
    }
    const data: Prisma.UnitUncheckedUpdateInput = {};
    if (dto.configuration !== undefined) {
      data.configuration = dto.configuration.trim();
    }
    if (dto.variantLabel !== undefined) {
      data.variantLabel =
        typeof dto.variantLabel === 'string'
          ? dto.variantLabel.trim() || null
          : null;
    }
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.customFields !== undefined) {
      data.customFields = validateCustomValues(
        nonRoleFields(template),
        dto.customFields,
        (existing.customFields ?? {}) as CustomValues,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (dto.unitNo !== undefined) data.unitNo = dto.unitNo;
    if (dto.tower !== undefined) {
      data.tower =
        typeof dto.tower === 'string' ? dto.tower.trim() || null : null;
    }
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.facing !== undefined) data.facing = dto.facing;
    if (dto.parking !== undefined) {
      data.parking =
        typeof dto.parking === 'string' ? dto.parking.trim() || null : null;
    }
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.addressLine !== undefined) {
      data.addressLine =
        typeof dto.addressLine === 'string'
          ? dto.addressLine.trim() || null
          : null;
    }
    if (dto.ownerName !== undefined) {
      data.ownerName =
        typeof dto.ownerName === 'string' ? dto.ownerName.trim() || null : null;
    }
    if (dto.notes !== undefined) {
      data.notes =
        typeof dto.notes === 'string' ? dto.notes.trim() || null : null;
    }
    if (dto.floorPlanUrl !== undefined) data.floorPlanUrl = dto.floorPlanUrl;
    if (dto.galleryUrls !== undefined) data.galleryUrls = dto.galleryUrls;

    data.updatedById = actorId ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actorId ?? null,
          action: 'unit_updated',
          entity: 'Unit',
          entityId: id,
          metadata: { projectId, fields: Object.keys(data) },
        },
      });
    });

    return this.getUnit(orgId, projectId, id);
  }

  async updateUnitStatus(
    orgId: string,
    projectId: string,
    id: string,
    dto: UpdateUnitStatusDto,
    actorId?: string,
  ) {
    const current = await this.getOwnedUnit(orgId, projectId, id);
    if (current.status === dto.status) {
      return this.serializeUnit(current);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({
        where: { id },
        // A status change is an edit — it counts towards "updated by".
        data: { status: dto.status, updatedById: actorId ?? null },
      });
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actorId ?? null,
          action: 'unit_status_changed',
          entity: 'Unit',
          entityId: id,
          metadata: { projectId, from: current.status, to: dto.status },
        },
      });
    });

    return this.getUnit(orgId, projectId, id);
  }

  async removeUnit(orgId: string, projectId: string, id: string) {
    await this.getOwnedUnit(orgId, projectId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.unit.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'unit_deleted',
          entity: 'Unit',
          entityId: id,
          metadata: { projectId },
        },
      });
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Standalone units — resale / broker listings with no project. Same table,
  // same catalog-validated `configuration`, `projectId` is null. No tower /
  // floor (there's no project to bound the tower count against). Reached via
  // the non-nested /org/units routes.
  // -------------------------------------------------------------------------

  async createStandaloneUnit(
    orgId: string,
    dto: CreateUnitDto,
    actorId?: string,
  ) {
    // Standalone units belong to no project, so the org catalog is the scope.
    this.assertStandaloneHasNoTemplateFields(dto);
    if (!dto.configuration?.trim()) {
      throw new BadRequestException('Configuration is required');
    }
    await this.assertConfigurationInCatalog(orgId, dto.configuration);
    await this.assertVariantInCatalog(orgId, dto.variantLabel);
    const managerId = await this.resolveManagerId(orgId, dto.managerId);
    const agentIds = [...new Set(dto.salesAgentIds ?? [])];
    await this.assertAssignableAgents(orgId, agentIds);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.unit.create({
        data: {
          orgId,
          projectId: null,
          configuration: (dto.configuration as string).trim(),
          variantLabel: dto.variantLabel?.trim() || null,
          unitNo: dto.unitNo,
          area: dto.area ?? null,
          tower: null,
          floor: null,
          facing: dto.facing ?? null,
          parking: dto.parking?.trim() || null,
          price: dto.price ?? null,
          addressLine: dto.addressLine?.trim() || null,
          ownerName: dto.ownerName?.trim() || null,
          notes: dto.notes?.trim() || null,
          floorPlanUrl: dto.floorPlanUrl ?? null,
          galleryUrls: dto.galleryUrls ?? [],
          status: dto.status ?? 'available',
          managerId,
          createdById: actorId ?? null,
          updatedById: actorId ?? null,
        },
      });
      if (agentIds.length > 0) {
        await tx.unitSalesAgent.createMany({
          data: agentIds.map((userId) => ({ unitId: row.id, userId })),
        });
      }
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actorId ?? null,
          action: 'standalone_unit_created',
          entity: 'Unit',
          entityId: row.id,
          metadata: { configuration: row.configuration, unitNo: row.unitNo },
        },
      });
      return row;
    });

    return this.getStandaloneUnit(orgId, created.id);
  }

  async getStandaloneUnit(orgId: string, id: string) {
    const row = await this.getOwnedStandaloneUnit(orgId, id);
    return this.serializeUnit(row);
  }

  async updateStandaloneUnit(
    orgId: string,
    id: string,
    dto: UpdateUnitDto,
    actorId?: string,
  ) {
    const existing = await this.getOwnedStandaloneUnit(orgId, id);

    this.assertStandaloneHasNoTemplateFields(dto);
    if (dto.configuration !== undefined) {
      await this.assertConfigurationInCatalog(orgId, dto.configuration);
    }
    if (dto.variantLabel !== undefined) {
      await this.assertVariantInCatalog(
        orgId,
        dto.variantLabel,
        existing.variantLabel,
      );
    }
    const managerId =
      dto.managerId !== undefined
        ? await this.resolveManagerId(orgId, dto.managerId)
        : undefined;
    // Full-set replace, like a project's sales agents: omit the field to
    // leave the current agents untouched, send `[]` to clear them all. Only
    // newly-added ids need to pass the eligibility check (see
    // assertAssignableAgents) — dropping or re-saving an already-assigned
    // agent must always be possible.
    let nextAgentIds: string[] | undefined;
    if (dto.salesAgentIds !== undefined) {
      nextAgentIds = [...new Set(dto.salesAgentIds)];
      const currentAgentIds = new Set(
        existing.salesAgents.map((row) => row.userId),
      );
      const newAgentIds = nextAgentIds.filter(
        (uid) => !currentAgentIds.has(uid),
      );
      await this.assertAssignableAgents(orgId, newAgentIds);
    }

    const data: Prisma.UnitUncheckedUpdateInput = {};
    if (dto.configuration !== undefined) {
      data.configuration = dto.configuration.trim();
    }
    if (dto.variantLabel !== undefined) {
      data.variantLabel =
        typeof dto.variantLabel === 'string'
          ? dto.variantLabel.trim() || null
          : null;
    }
    if (dto.unitNo !== undefined) data.unitNo = dto.unitNo;
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.facing !== undefined) data.facing = dto.facing;
    if (dto.parking !== undefined) {
      data.parking =
        typeof dto.parking === 'string' ? dto.parking.trim() || null : null;
    }
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.addressLine !== undefined) {
      data.addressLine =
        typeof dto.addressLine === 'string'
          ? dto.addressLine.trim() || null
          : null;
    }
    if (dto.ownerName !== undefined) {
      data.ownerName =
        typeof dto.ownerName === 'string' ? dto.ownerName.trim() || null : null;
    }
    if (dto.notes !== undefined) {
      data.notes =
        typeof dto.notes === 'string' ? dto.notes.trim() || null : null;
    }
    if (dto.floorPlanUrl !== undefined) data.floorPlanUrl = dto.floorPlanUrl;
    if (dto.galleryUrls !== undefined) data.galleryUrls = dto.galleryUrls;
    if (managerId !== undefined) data.managerId = managerId;
    data.updatedById = actorId ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id }, data });
      if (nextAgentIds !== undefined) {
        await tx.unitSalesAgent.deleteMany({ where: { unitId: id } });
        if (nextAgentIds.length > 0) {
          await tx.unitSalesAgent.createMany({
            data: nextAgentIds.map((userId) => ({ unitId: id, userId })),
          });
        }
      }
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actorId ?? null,
          action: 'standalone_unit_updated',
          entity: 'Unit',
          entityId: id,
          metadata: { fields: Object.keys(data) },
        },
      });
    });

    return this.getStandaloneUnit(orgId, id);
  }

  async removeStandaloneUnit(orgId: string, id: string) {
    await this.getOwnedStandaloneUnit(orgId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.unit.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          orgId,
          action: 'standalone_unit_deleted',
          entity: 'Unit',
          entityId: id,
          metadata: {},
        },
      });
    });
    return { success: true };
  }

  private async getOwnedStandaloneUnit(orgId: string, id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, orgId, projectId: null },
      include: UNIT_INCLUDE,
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  // -------------------------------------------------------------------------
  // Cross-project unit list — the "All Units" screen. Org-scoped directly by
  // Unit.orgId (project-bound and standalone units alike). Paginated
  // { data, total, page, limit } like ListProjects; `counts` is the status
  // breakdown for the same filter set (minus pagination) so the summary
  // tiles don't need a second request.
  // -------------------------------------------------------------------------

  async listAllUnits(
    orgId: string,
    query: ListOrgUnitsQueryDto,
    actor?: JwtPayload,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UnitWhereInput = { orgId };
    if (query.projectId) where.projectId = query.projectId;
    else if (query.standalone) where.projectId = null;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.unitNo = { contains: query.search, mode: 'insensitive' };
    }

    // Non-admin members only see units they have access to: a project-bound
    // unit if they manage that project or are one of its assigned sales
    // agents, or a standalone unit they were directly assigned to as manager
    // or sales agent. Mirrors ProjectsService.list's own-project scoping —
    // without this, "All Units" leaked every project's inventory to whoever
    // could open the page.
    if (
      actor &&
      !actor.roles?.includes('admin') &&
      !actor.roles?.includes('super_admin')
    ) {
      where.AND = [
        {
          OR: [
            { project: { managerId: actor.sub } },
            { project: { salesAgents: { some: { userId: actor.sub } } } },
            { projectId: null, managerId: actor.sub },
            { projectId: null, salesAgents: { some: { userId: actor.sub } } },
          ],
        },
      ];
    }

    const [rows, total, grouped] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ...UNIT_INCLUDE,
          project: {
            select: {
              id: true,
              name: true,
              currency: true,
              areaUnit: true,
              unitFieldTemplate: true,
            },
          },
        },
      }),
      this.prisma.unit.count({ where }),
      this.prisma.unit.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    const counts = { available: 0, booked: 0, held: 0, sold: 0 };
    for (const g of grouped) {
      counts[g.status] = g._count._all;
    }

    const data = rows.map((u) => {
      const template = this.readTemplate(u.project?.unitFieldTemplate ?? []);
      return {
        id: u.id,
        unitNo: u.unitNo,
        configuration: u.configuration,
        variantLabel: u.variantLabel,
        tower: u.tower,
        floor: u.floor,
        facing: u.facing,
        parking: u.parking,
        price: u.price,
        area: u.area,
        customFields: u.customFields,
        pricePerArea: this.pricePerArea(u, template),
        status: u.status,
        createdById: u.createdById,
        updatedById: u.updatedById,
        createdBy: this.serializeActor(u.createdBy),
        updatedBy: this.serializeActor(u.updatedBy),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        project: u.project
          ? {
              id: u.project.id,
              name: u.project.name,
              currency: u.project.currency,
              areaUnit: u.project.areaUnit,
            }
          : null,
      };
    });

    return { data, total, page, limit, counts };
  }

  // -------------------------------------------------------------------------
  // Ownership helpers — every path re-derives scope from orgId (the JWT),
  // never from a client-supplied id. A foreign org's row 404s exactly the
  // same as a non-existent id, so existence never leaks across tenants.
  // -------------------------------------------------------------------------

  // The org's project type a project names. A name that matches no type is a
  // 400 — structure is never guessed from a label.
  private async resolveProjectType(orgId: string, name: string) {
    const def = await this.prisma.projectTypeDef.findFirst({
      where: { orgId, name },
    });
    if (!def) {
      throw new BadRequestException(
        `Unknown project type "${name}". Pick one from Settings → Project types.`,
      );
    }
    return def;
  }

  private async getOwnedProject(orgId: string, id: string, actor?: JwtPayload) {
    const project = await this.prisma.project.findFirst({
      where: { id, orgId },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException('Project not found');

    if (actor && !actor.roles?.includes('admin') && !actor.roles?.includes('super_admin')) {
      const isManager = project.managerId === actor.sub;
      const isSales = await this.prisma.projectSalesAgent.findFirst({
        where: { projectId: id, userId: actor.sub },
        select: { userId: true },
      });
      if (!isManager && !isSales) {
        throw new ForbiddenException('You do not have access to this project');
      }
    }

    return project;
  }

  // A project's manager must be a user in the same org — verified here,
  // never trusted from the body.
  private async assertOrgUser(orgId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        'Manager must be a user in your organisation',
      );
    }
  }

  /**
   * The manager to store for a project / standalone unit. An explicit pick is
   * verified and kept. With no pick, a small agency that has no Manager at
   * all (one admin running everything) gets its earliest active org admin
   * auto-assigned, so the record never sits ownerless — the forms say so
   * next to the picker. When Managers do exist, "no pick" stays null.
   */
  private async resolveManagerId(
    orgId: string,
    requested: string | null | undefined,
  ): Promise<string | null> {
    if (requested) {
      await this.assertOrgUser(orgId, requested);
      return requested;
    }
    const manager = await this.prisma.user.findFirst({
      where: {
        orgId,
        status: 'active',
        userRoles: { some: { role: { key: 'manager' } } },
      },
      select: { id: true },
    });
    if (manager) return null;
    const admin = await this.prisma.user.findFirst({
      where: {
        orgId,
        status: 'active',
        userRoles: { some: { role: { key: 'admin' } } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return admin?.id ?? null;
  }

  private async getOwnedUnitType(orgId: string, projectId: string, id: string) {
    await this.getOwnedProject(orgId, projectId);
    const unitType = await this.prisma.unitType.findFirst({
      where: { id, projectId },
    });
    if (!unitType) throw new NotFoundException('Unit type not found');
    return unitType;
  }

  private async getOwnedUnit(orgId: string, projectId: string, id: string) {
    await this.getOwnedProject(orgId, projectId);
    const unit = await this.prisma.unit.findFirst({
      where: { id, projectId },
      include: UNIT_INCLUDE,
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  // `configuration` must be one of the caller org's `unit_type` catalog
  // labels. Same catalog the wizard and the [id]/units page read.
  /**
   * A project unit's configuration must be one the *project* actually has —
   * not merely something in the org catalog. The allowed set mirrors what the
   * two unit forms offer: the project's planned UnitType names, plus any
   * configuration already present on its units (imports and older projects
   * can carry labels that were never planned), plus the value the unit already
   * holds, so an edit can never be forced to rename an existing unit.
   *
   * The UI restricting the dropdown is not enough — this is the authority.
   */
  private readTemplate(v: Prisma.JsonValue): FieldDef[] {
    return (Array.isArray(v) ? v : []) as unknown as FieldDef[];
  }

  // What a unit may carry is derived from which role fields the project's
  // CURRENT unit template has — never a fixed layout. A value sent for a
  // role the template doesn't have is rejected loudly rather than silently
  // dropped, so no stale structure accumulates; a role the template simply
  // never had (or no longer has) just means that input isn't offered.
  private assertUnitFitsTemplate(
    template: FieldDef[],
    d: {
      configuration?: string | null;
      area?: number | null;
      floor?: number | null;
      tower?: string | null;
      price?: number | null;
    },
  ) {
    const checks: Array<[FieldRole, string, unknown]> = [
      ['configuration', 'a configuration', typeof d.configuration === 'string' ? d.configuration.trim() : d.configuration],
      ['area', 'an area', d.area],
      ['floor', 'a floor', d.floor],
      ['group', 'a group', typeof d.tower === 'string' ? d.tower.trim() : d.tower],
      ['price', 'a price', d.price],
    ];
    for (const [role, what, value] of checks) {
      if (value !== undefined && value !== null && value !== '' && !roleField(template, role)) {
        throw new BadRequestException(`Units in this project don't have ${what}.`);
      }
    }
  }

  // Standalone units aren't in a project, so they have no field template —
  // custom fields (which a template would validate) are refused rather than
  // silently dropped. Area is still allowed (single generic figure, no unit
  // template needed) so a resale/broker listing can still show a price/area.
  private assertStandaloneHasNoTemplateFields(d: {
    customFields?: Record<string, unknown>;
  }) {
    if (d.customFields && Object.keys(d.customFields).length > 0) {
      throw new BadRequestException(
        'Custom fields apply to units inside a project.',
      );
    }
  }

  private async assertConfigurationForProject(
    projectId: string,
    configuration: string,
    currentValue?: string | null,
  ) {
    const label = configuration.trim();
    if (currentValue && label === currentValue) return;

    const [planned, onUnits] = await Promise.all([
      this.prisma.unitType.findMany({
        where: { projectId },
        select: { name: true },
      }),
      this.prisma.unit.findMany({
        where: { projectId, configuration: { not: null } },
        select: { configuration: true },
        distinct: ['configuration'],
      }),
    ]);

    const allowed = new Set<string>([
      ...planned.map((p) => p.name),
      ...onUnits.map((u) => u.configuration as string),
    ]);
    if (allowed.has(label)) return;

    throw new BadRequestException(
      allowed.size === 0
        ? `This project has no unit configurations yet. Add "${label}" to the project's unit types first.`
        : `"${label}" is not one of this project's configurations (${[...allowed].sort().join(', ')}).`,
    );
  }

  /**
   * The optional variant label ("Type A", "Corner"). Blank is always valid.
   * Validated against the org's `unit_variant` catalog, except when it's the
   * value the unit already carries — units created while this was free text
   * keep their label and stay editable.
   */
  private async assertVariantInCatalog(
    orgId: string,
    variantLabel: string | null | undefined,
    currentValue?: string | null,
  ) {
    const label = variantLabel?.trim();
    if (!label) return;
    if (currentValue && label === currentValue) return;

    const match = await this.prisma.orgCatalogOption.findFirst({
      where: { orgId, category: 'unit_variant', label },
      select: { id: true },
    });
    if (!match) {
      throw new BadRequestException(
        `"${label}" is not one of your unit variants. Add it in Settings → Project Catalogs first.`,
      );
    }
  }

  private async assertConfigurationInCatalog(
    orgId: string,
    configuration: string,
  ) {
    const label = configuration.trim();
    const match = await this.prisma.orgCatalogOption.findFirst({
      where: { orgId, category: 'unit_type', label },
      select: { id: true },
    });
    if (!match) {
      throw new BadRequestException(
        `"${label}" is not one of your unit configurations. Add it in Settings → Project Catalogs first.`,
      );
    }
  }


  // -------------------------------------------------------------------------
  // Serialisation / derived fields
  // -------------------------------------------------------------------------

  // A UnitType no longer owns Units. Its live counts come from Unit rows on
  // the same project whose `configuration` equals this type's `name` (both
  // are `unit_type` catalog labels). Never stored — always counted live.
  private async decorateUnitTypes(
    unitTypes: Prisma.UnitTypeGetPayload<Record<string, never>>[],
  ): Promise<UnitTypeWithCounts[]> {
    if (unitTypes.length === 0) return [];
    const projectIds = [...new Set(unitTypes.map((ut) => ut.projectId))];
    const grouped = await this.prisma.unit.groupBy({
      by: ['configuration', 'status'],
      where: { projectId: { in: projectIds }, configuration: { not: null } },
      _count: { _all: true },
    });

    type Row = {
      unitCount: number;
      available: number;
      booked: number;
      held: number;
      sold: number;
    };
    const byLabel = new Map<string, Row>();
    for (const g of grouped) {
      const label = g.configuration!;
      const entry =
        byLabel.get(label) ??
        { unitCount: 0, available: 0, booked: 0, held: 0, sold: 0 };
      const n = g._count._all;
      entry.unitCount += n;
      if (g.status === 'available') entry.available += n;
      else if (g.status === 'booked') entry.booked += n;
      else if (g.status === 'held') entry.held += n;
      else if (g.status === 'sold') entry.sold += n;
      byLabel.set(label, entry);
    }

    return unitTypes.map((ut) => {
      const c =
        byLabel.get(ut.name) ??
        { unitCount: 0, available: 0, booked: 0, held: 0, sold: 0 };
      return {
        ...ut,
        unitCount: c.unitCount,
        availableUnits: c.available,
        bookedUnits: c.booked,
        heldUnits: c.held,
        soldUnits: c.sold,
      };
    });
  }

  private serializeProject(project: ProjectRow) {
    const m = project.manager;
    const managerName = m
      ? [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email
      : null;
    return {
      id: project.id,
      orgId: project.orgId,
      name: project.name,
      location: project.location,
      reraId: project.reraId,
      possession: project.possession,
      managerId: project.managerId,
      // Expanded so the client can render a name without a second request.
      manager: m
        ? {
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            email: m.email,
            name: managerName,
          }
        : null,
      status: project.status,
      priceMin: project.priceMin,
      priceMax: project.priceMax,
      baseRate: project.baseRate,
      projectType: project.projectType,
      projectTypeId: project.projectTypeId,
      areaUnit: project.areaUnit,
      projectFieldTemplate: project.projectFieldTemplate,
      unitFieldTemplate: project.unitFieldTemplate,
      customFields: project.customFields,
      tagline: project.tagline,
      launchDate: project.launchDate,
      constructionStage: project.constructionStage,
      highlights: project.highlights,
      salesTeam: project.salesTeam,
      amenities: (project.amenities ?? []) as Array<{
        name: string;
        iconUrl: string | null;
      }>,
      // Onboarding-wizard fields (Steps 3-8).
      bookingAmount: project.bookingAmount,
      currency: project.currency,
      priceIncludes: project.priceIncludes,
      paymentPlan: project.paymentPlan,
      offers: project.offers,
      addressLine: project.addressLine,
      city: project.city,
      locality: project.locality,
      pincode: project.pincode,
      latitude: project.latitude,
      longitude: project.longitude,
      connectivity: project.connectivity,
      landmarks: project.landmarks,
      specifications: project.specifications,
      marketing: project.marketing,
      requireBookingApproval: project.requireBookingApproval,
      visibleToTelecallers: project.visibleToTelecallers,
      publishedToWebsite: project.publishedToWebsite,
      coverImageUrl: project.coverImageUrl,
      galleryUrls: project.galleryUrls,
      brochureUrl: project.brochureUrl,
      reraCertificateUrl: project.reraCertificateUrl,
      floorPlanUrls: project.floorPlanUrls,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private serializeUnitType(ut: UnitTypeWithCounts) {
    return {
      id: ut.id,
      projectId: ut.projectId,
      name: ut.name,
      fieldDefaults: ut.fieldDefaults,
      totalUnits: ut.totalUnits,
      // Media — always null / empty for now (upload is out of scope).
      floorPlanUrl: ut.floorPlanUrl,
      brochureUrl: ut.brochureUrl,
      videoUrl: ut.videoUrl,
      galleryUrls: ut.galleryUrls,
      unitCount: ut.unitCount,
      availableUnits: ut.availableUnits,
      bookedUnits: ut.bookedUnits,
      heldUnits: ut.heldUnits,
      soldUnits: ut.soldUnits,
      createdAt: ut.createdAt,
      updatedAt: ut.updatedAt,
    };
  }

  /** { id, name, email } for a unit's creator/editor, or null. */
  private serializeActor(
    actor: { id: string; firstName: string | null; lastName: string | null; email: string } | null,
  ) {
    if (!actor) return null;
    return {
      id: actor.id,
      name:
        [actor.firstName, actor.lastName].filter(Boolean).join(' ') ||
        actor.email,
      email: actor.email,
    };
  }

  /**
   * Price per unit area, in the project's Project.areaUnit. Null (not zero)
   * whenever the price or area is missing — a blank cell is honest, a zero is
   * not — and also null whenever the project's CURRENT unit template no
   * longer has both a `price`- and an `area`-role field (deleting either
   * role turns this figure off rather than showing a stale one). `template`
   * is null for a standalone unit (no project, no template to gate on).
   */
  private pricePerArea(
    unit: { price: number | null; area: number | null },
    template: FieldDef[] | null,
  ): number | null {
    if (template && (!roleField(template, 'price') || !roleField(template, 'area'))) {
      return null;
    }
    if (!unit.price || !unit.area) return null;
    // Never stored — derived fresh on every read — so unlike the price
    // itself (a real Int column) there's no reason to round it to a whole
    // unit. In real estate the difference between 2.50 and 2.72 per unit area
    // is real money at project scale, so keep two decimal places rather than
    // rounding both down to a misleadingly identical "3".
    return Math.round((unit.price / unit.area) * 100) / 100;
  }

  private serializeUnit(unit: UnitRow) {
    const template = unit.project
      ? this.readTemplate(unit.project.unitFieldTemplate)
      : null;
    return {
      id: unit.id,
      orgId: unit.orgId,
      projectId: unit.projectId,
      currency: unit.project?.currency ?? null,
      areaUnit: unit.project?.areaUnit ?? null,
      configuration: unit.configuration,
      variantLabel: unit.variantLabel,
      unitNo: unit.unitNo,
      tower: unit.tower,
      floor: unit.floor,
      facing: unit.facing,
      parking: unit.parking,
      price: unit.price,
      area: unit.area,
      customFields: unit.customFields,
      pricePerArea: this.pricePerArea(unit, template),
      addressLine: unit.addressLine,
      ownerName: unit.ownerName,
      notes: unit.notes,
      floorPlanUrl: unit.floorPlanUrl,
      galleryUrls: unit.galleryUrls,
      status: unit.status,
      // Assignment — mainly meaningful for a standalone unit (no project to
      // inherit access from); null/empty for a project-bound unit today.
      managerId: unit.managerId,
      manager: this.serializeActor(unit.manager),
      salesAgentIds: unit.salesAgents.map((row) => row.userId),
      createdById: unit.createdById,
      updatedById: unit.updatedById,
      createdBy: this.serializeActor(unit.createdBy),
      updatedBy: this.serializeActor(unit.updatedBy),
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    };
  }
}
