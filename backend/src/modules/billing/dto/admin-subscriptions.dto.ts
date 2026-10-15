import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STATUSES = [
  'free',
  'active',
  'renewal_due',
  'past_due',
  'grace_ending',
  'expired',
  'moved_to_basic',
  'cancellation_scheduled',
  'downgrade_scheduled',
] as const;

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** GET /admin/billing/subscriptions */
export class ListSubscriptionsQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

/** POST /admin/billing/subscriptions/:orgId/extend-grace */
export class ExtendGraceDto {
  @IsInt() @Min(1) @Max(60) days!: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/** POST /admin/billing/subscriptions/:orgId/offline-payment */
export class MarkPaidOfflineDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @IsNotEmpty() @MaxLength(60) method!: string;
  @IsString() @MaxLength(100) reference!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) receivedOn!: string;
}

/** POST /admin/billing/subscriptions/:orgId/coupon */
export class ApplyCouponDto {
  @IsString() @IsNotEmpty() @MaxLength(20) code!: string;
}

/** POST /admin/billing/subscriptions/:orgId/cancel */
export class AdminCancelDto {
  @IsIn(['period_end', 'now']) when!: 'period_end' | 'now';
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/** GET /admin/billing/payments */
export class ListAdminPaymentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['captured', 'failed', 'refunded', 'offline'])
  status?: string;
  @IsOptional() @IsString() orgId?: string;
}

/** POST /admin/billing/payments/:id/refund */
export class RefundPaymentDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
