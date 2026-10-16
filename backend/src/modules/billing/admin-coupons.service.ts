import { billingNow } from '../../common/utils/billing-clock.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Coupon } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { billingError } from './billing-checkout.service';
import {
  couponStatus,
  couponVisibleToOrg,
  dayOf,
  describeCouponV2,
  normaliseCouponCode,
  orgCouponStatus,
} from './coupon-rules';
import { isFreePlan } from './plan-modules';
import { toRupees } from './checkout-quote';
import { invoiceDocumentUrl } from './invoice.util';
import type { OrgCouponV2 } from './billing.types';
import type { CouponDto } from './dto/coupon.dto';

/** The contract's Coupon shape. */
export interface CouponV2 {
  code: string;
  description: string;
  kind: 'percent' | 'fixed';
  value: number;
  planIds: string[];
  interval: 'any' | 'monthly' | 'yearly';
  duration: 'first_payment' | 'first_n' | 'forever';
  durationCount: number | null;
  validFrom: string;
  validTo: string | null;
  totalUses: number | null;
  oncePerOrg: boolean;
  orgIds: string[] | null;
  /** Open coupons: listed on the org Billing → Coupons page. */
  showToCustomers: boolean;
}

export interface CouponRowV2 {
  coupon: CouponV2;
  uses: number;
  status: 'active' | 'scheduled' | 'expired' | 'used_up';
}

const toCouponV2 = (c: Coupon): CouponV2 => ({
  code: c.code,
  description: c.description,
  kind: c.kind,
  value:
    c.kind === 'percent'
      ? (c.percentOff ?? 0)
      : toRupees(c.amountOffPaise ?? 0),
  planIds: c.planIds,
  interval: c.interval,
  duration: c.duration,
  durationCount: c.duration === 'first_n' ? c.durationCount : null,
  validFrom: dayOf(c.validFrom),
  validTo: c.validTo ? dayOf(c.validTo) : null,
  totalUses: c.totalUses,
  oncePerOrg: c.oncePerOrg,
  orgIds: c.orgIds.length ? c.orgIds : null,
  showToCustomers: c.showToCustomers,
});

/** Billing v2 step 5 — Super Admin coupons (and the org picker for org-only ones). */
@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Uses = organisations that have redeemed it. */
  private async usesByCoupon(couponIds: string[]) {
    const rows = await this.prisma.couponRedemption.findMany({
      where: { couponId: { in: couponIds } },
      select: { couponId: true, organisationId: true },
      distinct: ['couponId', 'organisationId'],
    });
    const uses = new Map<string, number>();
    for (const r of rows) uses.set(r.couponId, (uses.get(r.couponId) ?? 0) + 1);
    return uses;
  }

  private row(c: Coupon, uses: number, now = billingNow()): CouponRowV2 {
    return { coupon: toCouponV2(c), uses, status: couponStatus(c, uses, now) };
  }

  async list(): Promise<CouponRowV2[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const uses = await this.usesByCoupon(coupons.map((c) => c.id));
    return coupons.map((c) => this.row(c, uses.get(c.id) ?? 0));
  }

  async get(rawCode: string) {
    const code = normaliseCouponCode(rawCode);
    const c = await this.prisma.coupon.findUnique({ where: { code } });
    if (!c) throw new NotFoundException(`There is no coupon called ${code}.`);
    const redemptions = await this.prisma.couponRedemption.findMany({
      where: { couponId: c.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const [orgs, plans] = await Promise.all([
      this.prisma.organisation.findMany({
        where: {
          id: { in: [...new Set(redemptions.map((r) => r.organisationId))] },
        },
        select: { id: true, name: true },
      }),
      this.prisma.plan.findMany({ select: { id: true, name: true } }),
    ]);
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const planName = new Map(plans.map((p) => [p.id, p.name]));
    const uses = new Set(redemptions.map((r) => r.organisationId)).size;
    const totalPaise = await this.prisma.couponRedemption.aggregate({
      where: { couponId: c.id },
      _sum: { discountPaise: true },
    });
    return {
      ...this.row(c, uses),
      redemptions: redemptions.map((r) => ({
        orgId: r.organisationId,
        orgName: orgName.get(r.organisationId) ?? r.organisationId,
        at: r.createdAt.toISOString(),
        planName: planName.get(r.planId) ?? r.planId,
        discount: toRupees(r.discountPaise),
      })),
      totalDiscount: toRupees(totalPaise._sum.discountPaise ?? 0),
    };
  }

  /** Create (isNew) or edit a coupon. The code can't be renamed. */
  async save(
    dto: CouponDto,
    isNew: boolean,
    actorId: string | null,
    pathCode?: string,
  ): Promise<CouponRowV2> {
    const code = normaliseCouponCode(dto.code);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      throw billingError(
        'coupon_code',
        'Codes are 3–20 letters or digits, no spaces.',
      );
    }
    if (pathCode && normaliseCouponCode(pathCode) !== code) {
      throw billingError('coupon_code', "A coupon's code can't be changed.");
    }
    if (dto.kind === 'percent') {
      if (!Number.isInteger(dto.value) || dto.value < 1 || dto.value > 100) {
        throw billingError(
          'coupon_value',
          'A percentage is a whole number from 1 to 100.',
        );
      }
    } else if (!(dto.value > 0)) {
      throw billingError('coupon_value', 'Enter an amount above zero.');
    }
    const planIds = [...new Set(dto.planIds)];
    if (planIds.length === 0) {
      throw billingError('coupon_plans', 'Pick at least one plan.');
    }
    const plans = await this.prisma.plan.findMany({
      where: { id: { in: planIds } },
    });
    if (plans.length !== planIds.length || plans.some((p) => isFreePlan(p))) {
      throw billingError('coupon_plans', 'Pick paid plans that exist.');
    }
    if (dto.duration === 'first_n' && !((dto.durationCount ?? 0) >= 2)) {
      throw billingError(
        'coupon_duration',
        'Use 2 or more payments (1 is the same as "First payment").',
      );
    }
    if (dto.validTo && dto.validTo < dto.validFrom) {
      throw billingError(
        'coupon_dates',
        'The end date is before the start date.',
      );
    }
    if (dto.totalUses != null && dto.totalUses < 1) {
      throw billingError(
        'coupon_uses',
        'Leave the limit blank for unlimited, or enter 1 or more.',
      );
    }
    const orgIds = dto.orgIds == null ? [] : [...new Set(dto.orgIds)];
    if (dto.orgIds != null) {
      if (orgIds.length === 0) {
        throw billingError(
          'coupon_orgs',
          'Pick at least one organisation, or open it to all.',
        );
      }
      const found = await this.prisma.organisation.count({
        where: { id: { in: orgIds } },
      });
      if (found !== orgIds.length) {
        throw billingError(
          'coupon_orgs',
          'Some of those organisations no longer exist.',
        );
      }
    }

    const data = {
      description: dto.description.trim(),
      kind: dto.kind,
      percentOff: dto.kind === 'percent' ? dto.value : null,
      amountOffPaise: dto.kind === 'fixed' ? Math.round(dto.value * 100) : null,
      planIds,
      interval: dto.interval,
      duration: dto.duration,
      durationCount: dto.duration === 'first_n' ? dto.durationCount! : null,
      validFrom: new Date(`${dto.validFrom}T00:00:00.000Z`),
      validTo: dto.validTo ? new Date(`${dto.validTo}T00:00:00.000Z`) : null,
      totalUses: dto.totalUses ?? null,
      oncePerOrg: dto.oncePerOrg,
      orgIds,
      // Only meaningful for open coupons; org-only ones are always listed for those orgs.
      showToCustomers: orgIds.length === 0 && dto.showToCustomers === true,
    };
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (isNew && existing) {
      throw billingError('coupon_exists', `${code} already exists.`);
    }
    if (!isNew && !existing) {
      throw new NotFoundException(`There is no coupon called ${code}.`);
    }
    const saved = existing
      ? await this.prisma.coupon.update({ where: { id: existing.id }, data })
      : await this.prisma.coupon.create({
          data: { ...data, code, createdById: actorId },
        });
    await this.prisma.auditLog
      .create({
        data: {
          actorId,
          action: existing ? 'coupon_updated' : 'coupon_created',
          entity: 'Coupon',
          entityId: saved.id,
          metadata: { code },
        },
      })
      .catch(() => undefined);
    const uses = await this.usesByCoupon([saved.id]);
    return this.row(saved, uses.get(saved.id) ?? 0);
  }

  /**
   * Org Billing → Coupons: coupons reserved for this organisation, and open
   * ones listed for customers, with this organisation's status (and, once
   * used, the date and the invoice of that payment).
   */
  async orgCoupons(orgId: string, now = billingNow()): Promise<OrgCouponV2[]> {
    const coupons = (
      await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } })
    ).filter((c) => couponVisibleToOrg(c, orgId, now));
    if (coupons.length === 0) return [];
    const ids = coupons.map((c) => c.id);
    const [uses, mine, plans] = await Promise.all([
      this.usesByCoupon(ids),
      this.prisma.couponRedemption.findMany({
        where: { couponId: { in: ids }, organisationId: orgId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.plan.findMany({ select: { id: true, name: true } }),
    ]);
    const first = new Map<string, (typeof mine)[number]>();
    for (const r of mine) if (!first.has(r.couponId)) first.set(r.couponId, r);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        checkoutId: { in: [...first.values()].map((r) => r.checkoutId) },
        kind: 'invoice',
      },
      select: { id: true, number: true, checkoutId: true },
    });
    const invoiceFor = new Map(invoices.map((i) => [i.checkoutId, i]));
    const planName = new Map(plans.map((p) => [p.id, p.name]));
    return coupons.map((c) => {
      const used = first.get(c.id) ?? null;
      const inv = used ? invoiceFor.get(used.checkoutId) : undefined;
      const v = toCouponV2(c);
      return {
        code: v.code,
        description: c.description || describeCouponV2(c),
        kind: v.kind,
        value: v.value,
        plans: c.planIds.map((id) => ({ id, name: planName.get(id) ?? id })),
        interval: v.interval,
        duration: v.duration,
        durationCount: v.durationCount,
        validTo: v.validTo,
        forYourOrg: c.orgIds.length > 0,
        status: orgCouponStatus(c, {
          now,
          usesSoFar: uses.get(c.id) ?? 0,
          orgHasUsed: !!used,
        }),
        redeemedAt: used ? used.createdAt.toISOString() : null,
        invoiceUrl: inv ? invoiceDocumentUrl(inv.id) : null,
        invoiceNumber: inv?.number ?? null,
      };
    });
  }

  /** Organisations for the "only these organisations" picker. */
  async orgOptions() {
    const orgs = await this.prisma.organisation.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        city: true,
        subscriptions: {
          where: { status: { not: 'cancelled' } },
          select: { plan: { select: { name: true } } },
          take: 1,
        },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city ?? '',
      planName: o.subscriptions[0]?.plan.name ?? '—',
    }));
  }
}
