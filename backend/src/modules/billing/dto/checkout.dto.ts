import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** POST /org/billing/checkout/preview */
export class PreviewCheckoutDto {
  @IsString() @IsNotEmpty() planId!: string;
  @IsIn(['monthly', 'yearly']) interval!: 'monthly' | 'yearly';
  /** Coupons arrive in step 5; accepted and ignored until then. */
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string;
  /** GST state code typed in the (unsaved) billing form. */
  @IsOptional() @IsString() @MaxLength(50) billingState?: string;
}

/** POST /org/billing/checkout */
export class StartCheckoutDto {
  @IsString() @IsNotEmpty() planId!: string;
  @IsIn(['monthly', 'yearly']) interval!: 'monthly' | 'yearly';
  /** Only 'purchase' in step 2 (renewals are step 3). */
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
