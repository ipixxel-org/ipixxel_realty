import {
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
