import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { toLandingPageData } from '../admin-templates/template.mapper';
import { ListOrgTemplatesQueryDto } from './dto/list-org-templates-query.dto';
import {
  countOrgTemplates,
  resolveTemplateQuota,
} from '../../common/utils/plan-quota.util';
import { getOrgActivePlan, canPlanAccessTier } from '../../common/utils/subscription-lifecycle.util';

export { canPlanAccessTier } from '../../common/utils/subscription-lifecycle.util';

// Templates are plan-quota based, not per-template priced — access is
// entirely determined by the OrganisationTemplate assignment made at
// signup or by a super admin, never by isPaid. Eligibility beyond that is
// just published + a real landing page (not a thank-you companion).
const ELIGIBLE_WHERE: Prisma.TemplateWhereInput = {
  status: 'published',
  pageType: 'landing',
};

@Injectable()
export class OrgTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListOrgTemplatesQueryDto, orgId?: string | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TemplateWhereInput = { ...ELIGIBLE_WHERE };
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    } else if (query.category) {
      where.templateCategory = { name: { equals: query.category, mode: 'insensitive' } };
    }
    if (query.tier) {
      where.tier = query.tier as any;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { baseDesignName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Org sees only its assigned templates — no assignments means no
    // templates, not "all templates" (that fallback was the old
    // globally-visible-free-templates rule, superseded by plan quotas).
    // OrgAdminGuard guarantees orgId is always present on this route, but
    // guard against a missing one resolving to "no filter" (= every org).
    const assigned = orgId
      ? await this.prisma.organisationTemplate.findMany({
          where: { orgId },
          select: { templateId: true, billingPausedAt: true },
        })
      : [];
    where.id = { in: assigned.map((a) => a.templateId) };
    // Billing v2 "choose what stays": paused templates can't be used for new
    // landing pages (the picker shows them with a Paused badge).
    const paused = new Set(
      assigned.filter((a) => a.billingPausedAt).map((a) => a.templateId),
    );

    const [templates, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        include: { templateCategory: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.template.count({ where }),
    ]);

    const landingPageCounts = await this.landingPageCountsByTemplate(
      orgId,
      templates.map((t) => t.id),
    );

    return {
      data: templates.map((t) => {
        const mapped = toLandingPageData(t);
        return {
          id: mapped.id,
          name: mapped.name,
          slug: mapped.slug,
          thumbnail: mapped.thumbnail,
          tier: t.tier,
          categoryId: t.categoryId,
          category: mapped.category,
          template: mapped.template,
          updatedAt: mapped.updatedAt,
          landingPageCount: landingPageCounts.get(t.id) ?? 0,
          paused: paused.has(t.id),
        };
      }),
      total,
      page,
      limit,
    };
  }

  // Shared by list() and getAvailable() — the frontend needs this per
  // template so it can disable/explain "Remove" before the person clicks
  // it, rather than letting them confirm an action the API guard (see
  // unassignTemplate below) is just going to reject anyway. A template that
  // was never assigned to this org can't have any (create() only allows
  // building from an assigned template), so callers only need to look this
  // up for assigned ids.
  private async landingPageCountsByTemplate(
    orgId: string | null | undefined,
    templateIds: string[],
  ): Promise<Map<string, number>> {
    if (!orgId || templateIds.length === 0) return new Map();
    const grouped = await this.prisma.landingPage.groupBy({
      by: ['sourceTemplateId'],
      where: { orgId, sourceTemplateId: { in: templateIds } },
      _count: { _all: true },
    });
    return new Map(
      grouped
        .filter((g): g is typeof g & { sourceTemplateId: string } => g.sourceTemplateId !== null)
        .map((g) => [g.sourceTemplateId, g._count._all]),
    );
  }

  async getAvailable(orgId: string) {
    const activePlanInfo = await getOrgActivePlan(this.prisma, orgId);
    const plan = activePlanInfo?.plan;
    const maxAllowed = resolveTemplateQuota(plan);

    const [allPublishedTemplates, assignedRecords] = await Promise.all([
      this.prisma.template.findMany({
        where: ELIGIBLE_WHERE,
        include: { templateCategory: true },
        orderBy: [{ tier: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.organisationTemplate.findMany({
        where: { orgId },
        select: { templateId: true, billingPausedAt: true },
      }),
    ]);

    // Filter options for the org's "Add templates" view: the live
    // subscription plans and the super admin's template categories.
    const [activePlans, categories] = await Promise.all([
      this.prisma.plan.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          priceMonthly: true,
          capabilities: true,
        },
        orderBy: [{ priceMonthly: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.templateCategory.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const assignedSet = new Set(assignedRecords.map((a) => a.templateId));
    const pausedSet = new Set(
      assignedRecords.filter((a) => a.billingPausedAt).map((a) => a.templateId),
    );
    // Paused templates don't use a plan slot.
    const assignedCount = assignedSet.size - pausedSet.size;
    const remainingQuota = Number.isFinite(maxAllowed)
      ? Math.max(0, maxAllowed - assignedCount)
      : null;

    // Only assigned templates can possibly have any (see
    // landingPageCountsByTemplate's comment) — no point counting for the
    // rest of the catalog.
    const landingPageCounts = await this.landingPageCountsByTemplate(orgId, [...assignedSet]);

    const data = allPublishedTemplates.map((t) => {
      const mapped = toLandingPageData(t);
      const allowedPlanIds: string[] = (mapped as any).allowedPlanIds ?? [];
      let access: { allowed: boolean; reason?: string };
      if (allowedPlanIds && Array.isArray(allowedPlanIds) && allowedPlanIds.length > 0) {
        if (plan?.id && allowedPlanIds.includes(plan.id)) {
          access = { allowed: true };
        } else {
          access = {
            allowed: false,
            reason: `This template is not included in your ${plan?.name ?? 'current'} package.`,
          };
        }
      } else {
        access = canPlanAccessTier(plan, t.tier);
      }
      // Which plans unlock this template — same rule as `access` above
      // (explicit plan grants win, otherwise the tier), applied per plan.
      const planIds = activePlans
        .filter((p) =>
          allowedPlanIds.length > 0
            ? allowedPlanIds.includes(p.id)
            : canPlanAccessTier(p, t.tier).allowed,
        )
        .map((p) => p.id);
      return {
        id: mapped.id,
        name: mapped.name,
        slug: mapped.slug,
        thumbnail: mapped.thumbnail,
        tier: t.tier,
        categoryId: t.categoryId,
        category: mapped.category,
        template: mapped.template,
        updatedAt: mapped.updatedAt,
        isAssigned: assignedSet.has(t.id),
        paused: pausedSet.has(t.id),
        landingPageCount: landingPageCounts.get(t.id) ?? 0,
        isLocked: !access.allowed,
        lockReason: access.reason ?? null,
        planIds,
      };
    });

    return {
      data,
      assignedCount,
      maxAllowed: Number.isFinite(maxAllowed) ? maxAllowed : null,
      remainingQuota,
      planName: plan?.name ?? 'Free Plan',
      plans: activePlans.map((p) => ({ id: p.id, name: p.name })),
      categories: categories.map((c) => c.name),
    };
  }

  async assignTemplate(templateId: string, orgId: string, userId?: string) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, ...ELIGIBLE_WHERE },
    });
    if (!template) {
      throw new NotFoundException('Template not found or not published');
    }

    const activePlanInfo = await getOrgActivePlan(this.prisma, orgId);
    const plan = activePlanInfo?.plan;

    // Check plan/tier access
    const mapped = toLandingPageData(template);
    const allowedPlanIds: string[] = (mapped as any).allowedPlanIds ?? [];
    let access: { allowed: boolean; reason?: string };
    if (allowedPlanIds && Array.isArray(allowedPlanIds) && allowedPlanIds.length > 0) {
      if (plan?.id && allowedPlanIds.includes(plan.id)) {
        access = { allowed: true };
      } else {
        access = {
          allowed: false,
          reason: `This template is not included in your ${plan?.name ?? 'current'} package.`,
        };
      }
    } else {
      access = canPlanAccessTier(plan, template.tier);
    }
    if (!access.allowed) {
      throw new ForbiddenException(access.reason);
    }

    const existing = await this.prisma.organisationTemplate.findUnique({
      where: { orgId_templateId: { orgId, templateId } },
    });
    if (existing) {
      return { success: true, message: 'Template is already assigned to your organisation' };
    }

    const maxAllowed = resolveTemplateQuota(plan);
    const currentCount = await countOrgTemplates(this.prisma, orgId);

    if (currentCount >= maxAllowed) {
      const planName = plan?.name ? `"${plan.name}" ` : '';
      throw new BadRequestException(
        `Template limit reached. Your ${planName}plan allows a maximum of ${maxAllowed} template(s). Upgrade your package to add more templates.`,
      );
    }

    await this.prisma.organisationTemplate.create({
      data: {
        orgId,
        templateId,
        assignedBy: userId,
      },
    });

    return {
      success: true,
      message: 'Template added to your organisation successfully',
    };
  }

  // Removal is blocked, not just discouraged, when the org actually built
  // something from this template — otherwise a 1-template plan lets someone
  // cycle assign -> build a landing page -> unassign -> assign a different
  // template -> build again, drawing on as many templates as their
  // landingPages quota allows while only ever paying for one slot at a
  // time. A template nothing was built from stays freely removable, so a
  // mistaken pick is still correctable.
  async unassignTemplate(templateId: string, orgId: string) {
    const existing = await this.prisma.organisationTemplate.findUnique({
      where: { orgId_templateId: { orgId, templateId } },
    });
    if (!existing) {
      throw new NotFoundException('Template assignment not found');
    }

    const landingPageCount = await this.prisma.landingPage.count({
      where: { orgId, sourceTemplateId: templateId },
    });
    if (landingPageCount > 0) {
      throw new BadRequestException(
        `Can't remove this template — ${landingPageCount} landing page${landingPageCount === 1 ? '' : 's'} in your workspace ${landingPageCount === 1 ? 'was' : 'were'} built from it. Delete ${landingPageCount === 1 ? 'that page' : 'those pages'} first if you want to free up this slot.`,
      );
    }

    await this.prisma.organisationTemplate.delete({
      where: { orgId_templateId: { orgId, templateId } },
    });

    return { success: true, message: 'Template removed from your organisation' };
  }

  // Deliberately NOT gated on assignment — this is the "preview before you
  // spend one of your plan's template slots" read, reused by both the "My
  // Templates" page's own preview and the "Add Template to Workspace"
  // modal's preview. ELIGIBLE_WHERE (published + pageType 'landing') is the
  // only gate: draft/scheduled/password/unpublished templates and
  // thank-you companion pages still 404, same as everywhere else a
  // template id is resolved.
  async getById(id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, ...ELIGIBLE_WHERE },
      include: { templateCategory: true },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return toLandingPageData(template, { includeContent: true });
  }
}

