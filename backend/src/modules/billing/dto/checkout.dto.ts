import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type { BillingCheckoutStatus } from '@prisma/client';

/** POST /org/billing/checkout/preview */
export class PreviewCheckoutDto {
  @IsString() @IsNotEmpty() planId!: string;
  @IsIn(['monthly', 'yearly']) interval!: 'monthly' | 'yearly';
  /** Coupons arrive in step 5; accepted and ignored until then. */
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string;
  /** 'renewal' quotes one more term of the current plan. */
  @IsOptional() @IsIn(['purchase', 'renewal']) purpose?: 'purchase' | 'renewal';
}

/** POST /org/billing/checkout */
export class StartCheckoutDto {
  @IsString() @IsNotEmpty() planId!: string;
  @IsIn(['monthly', 'yearly']) interval!: 'monthly' | 'yearly';
  /** 'renewal' pays for one more term of the current plan (planId + interval must match it). */
  @IsOptional() @IsIn(['purchase', 'renewal']) purpose?: 'purchase' | 'renewal';
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string;
  /**
   * Over the plan's limits: the option the org picked — 'default' ("Keep the
   * default picks") or 'saved' ("I'll choose what stays", needs a saved
   * choice that fits). Missing → choose_what_stays.
   */
  @IsOptional()
  @IsIn(['default', 'saved'])
  whatStaysChoice?: 'default' | 'saved';
  /** Older clients: true = whatStaysChoice 'default'. */
  @IsOptional() @IsBoolean() acceptDefaultPicks?: boolean;
}

/** POST /org/billing/checkout/confirm — Razorpay Checkout's success payload. */
export class ConfirmCheckoutDto {
  @IsString()
  @Matches(/^order_[A-Za-z0-9]+$/)
  razorpay_order_id!: string;

  @IsString()
  @Matches(/^pay_[A-Za-z0-9]+$/)
  razorpay_payment_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  razorpay_signature!: string;
}

/** POST /admin/billing/checkouts/:id/resolve — close a payment under review by hand. */
export class ResolveCheckoutDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** GET /admin/billing/checkouts */
export class ListCheckoutsQueryDto {
  @IsOptional()
  @IsIn([
    'pending',
    'paid',
    'failed',
    'expired',
    'cancelled',
    'approved',
    'rejected',
    'needs_review',
  ])
  status?: BillingCheckoutStatus;
}
