import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';
import { normalizeCapabilityMap } from './plan-capabilities';
import { carryV2Keys } from '../billing/plan-modules';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface PlanLimits {
  projects: number | null;
  users: number | null;
  templates: number | null;
  landingPages: number | null;
  landingPagesCreate: number | null;
}

/** All unlimited — the shape written when no limits are supplied. */
const UNLIMITED_LIMITS: PlanLimits = {
  projects: null,
  users: null,
  templates: null,
  landingPages: null,
  landingPagesCreate: null,
};

/**
 * Coerce a (possibly loose / legacy / partial) limits value to the canonical
 * `{ projects, users, templates, landingPages }` numeric shape. A field is a
 * non-negative integer, or `null` meaning unlimited. Legacy string values
 * ("3", "All", "Unlimited", "—") are tolerated so rows that predate the
 * numeric migration still read sensibly.
 */
export function normalizeLimits(raw: unknown): PlanLimits {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const one = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
    }
    if (v === 'All' || v === 'Unlimited' || v === '—') return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) || n < 0 ? null : n;
  };
  return {
    projects: one(src.projects),
    users: one(src.users),
    templates: one(src.templates),
    landingPages: one(src.landingPages),
    landingPagesCreate: one(src.landingPagesCreate),
  };
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPlansQueryDto) {
    const where: Prisma.PlanWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.isPopular !== undefined) where.isPopular = query.isPopular;

    // Ensure the platform's fixed default Free Plan exists
    try {
      const hasSystem = await this.prisma.plan.findFirst({
        where: {
          OR: [
            { isSystem: true },
            { priceMonthly: 0 },
            { slug: 'basic' },
            { slug: 'free' },
          ],
        },
      });
      if (!hasSystem) {
        await this.prisma.plan.create({
          data: {
            name: 'Free Plan',
            slug: 'basic',
            description: 'Fixed core plan for every organisation with essential access.',
            priceMonthly: 0,
            priceYearly: 0,
            features: [
              '1 Landing Page & Template slot',
              'Basic project and unit showcase',
              'Single user access',
              'Lead collection forms',
            ],
            limits: {
              projects: 1,
              users: 1,
              templates: 1,
              landingPages: 1,
              landingPagesCreate: 2,
            } as any,
            capabilities: {},
            color: '#ecfdf5',
            badge: 'b-green',
            isSystem: true,
            isPopular: false,
            isActive: true,
          },
        });
      }
    } catch {
      // Best-effort ensure, ignore if schema in transition
    }

    // The platform's default plan (isSystem — the ₹0 Basic every new org lands
    // on) always leads, ahead of "popular" and price ordering: it is the one
    // plan that must never be buried or overshadowed. This single endpoint
    // feeds every plan list in the app (Super Admin, org settings, org detail).
    const plans = await this.prisma.plan.findMany({
      where,
      orderBy: [
        { isSystem: 'desc' },
        { isPopular: 'desc' },
        { priceMonthly: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return plans.map(toPlanResponse);
  }

  async getById(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return toPlanResponse(plan);
  }

  async create(dto: CreatePlanDto) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    const existing = await this.prisma.plan.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Plan slug "${slug}" already exists`);

    const created = await this.prisma.plan.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? '',
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        features: (dto.features ?? []) as Prisma.InputJsonValue,
        limits: (dto.limits
          ? normalizeLimits(dto.limits)
          : UNLIMITED_LIMITS) as unknown as Prisma.InputJsonValue,
        capabilities: normalizeCapabilityMap(
          dto.capabilities ?? {},
        ) as Prisma.InputJsonValue,
        color: dto.color ?? '#eef0fe',
        badge: dto.badge ?? 'b-indigo',
        isPopular: dto.isPopular ?? false,
        isActive: dto.isActive ?? true,
      },
    });
    return toPlanResponse(created);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    // The default plan is looked up by its slug at onboarding
    // (assignBasicPlanIfMissing → 'basic') and must stay active, otherwise new
    // signups silently get no plan. Editing it is fine — renaming or
    // re-slugging it, or switching it off, is not: delete is already refused
    // for the same reason (see remove()).
    if (plan.isSystem && dto.isActive === false) {
      throw new ConflictException(
        `"${plan.name}" is the platform's default onboarding plan and cannot be deactivated.`,
      );
    }
    let slug = dto.slug ? slugify(dto.slug) : undefined;
    if (dto.name && !dto.slug) slug = slugify(dto.name);
    if (plan.isSystem) slug = undefined;
    if (slug && slug !== plan.slug) {
      const clash = await this.prisma.plan.findUnique({ where: { slug } });
      if (clash) throw new ConflictException(`Plan slug "${slug}" already exists`);
    }

    const data: Prisma.PlanUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (slug) data.slug = slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priceMonthly !== undefined) data.priceMonthly = dto.priceMonthly;
    if (dto.priceYearly !== undefined) data.priceYearly = dto.priceYearly;
    if (dto.features !== undefined) data.features = dto.features as Prisma.InputJsonValue;
    // Billing v2 keeps a few plan settings outside the catalog (team chat,
    // Meta lead ads, Meta pages); carry them over so a save from this editor
    // doesn't drop them. No effect on plans that never had them.
    const carried = carryV2Keys(plan, {
      limits:
        dto.limits !== undefined
          ? (normalizeLimits(dto.limits) as unknown as Record<string, unknown>)
          : undefined,
      capabilities:
        dto.capabilities !== undefined
          ? normalizeCapabilityMap(dto.capabilities)
          : undefined,
    });
    if (carried.limits) {
      data.limits = carried.limits as Prisma.InputJsonValue;
    }
    if (carried.capabilities) {
      data.capabilities = carried.capabilities as Prisma.InputJsonValue;
    }
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.badge !== undefined) data.badge = dto.badge;
    if (dto.isPopular !== undefined) data.isPopular = dto.isPopular;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.plan.update({ where: { id }, data });
    return toPlanResponse(updated);
  }

  async remove(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.isSystem) {
      throw new ConflictException(
        `"${plan.name}" is the platform's default onboarding plan and cannot be deleted — edit it instead.`,
      );
    }
    const subs = await this.prisma.subscription.findMany({
      where: { planId: id, status: { not: 'cancelled' } },
      select: { organisation: { select: { name: true } } },
      take: 3,
    });
    if (subs.length > 0) {
      const names = subs
        .map((s) => s.organisation?.name)
        .filter(Boolean)
        .join(', ');
      throw new ConflictException(
        `"${plan.name}" can't be deleted while organisations are on it${names ? ` (${names})` : ''}. Move them to another plan first, or make it inactive to stop offering it.`,
      );
    }
    await this.prisma.plan.delete({ where: { id } });
    return { success: true };
  }
}

function toPlanResponse(plan: any) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    features: (plan.features ?? []) as string[],
    limits: normalizeLimits(plan.limits),
    capabilities: normalizeCapabilityMap(plan.capabilities),
    color: plan.color,
    badge: plan.badge,
    isPopular: plan.isPopular,
    isActive: plan.isActive,
    isSystem: plan.isSystem,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}
