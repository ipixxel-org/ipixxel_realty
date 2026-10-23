import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const REQUEST_PAYMENT_METHODS = [
  'Bank transfer',
  'UPI',
  'Cheque',
  'Cash',
  'Other',
] as const;
export type RequestPaymentMethod = (typeof REQUEST_PAYMENT_METHODS)[number];

/** PUT /admin/package-change-requests/:id/payment — "Mark as paid". */
export class MarkRequestPaidDto {
  /**
   * Ignored: the amount is always the request's current total incl. GST.
   * Still accepted so older clients keep working.
   */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsIn(REQUEST_PAYMENT_METHODS) method!: RequestPaymentMethod;
  /** UTR / cheque number; required except for Cash. */
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  /** YYYY-MM-DD, not in the future. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/) receivedOn!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/** PUT /admin/package-change-requests/:id/coupon — a coupon on a pending request. */
export class RequestCouponDto {
  @IsString() @MaxLength(40) code!: string;
}
