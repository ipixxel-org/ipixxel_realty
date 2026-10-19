import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** The platform as GST seller. Every field optional (null = not set yet). */
export class SellerSettingsDto {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string | null;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string | null;
  /** 2-digit GST state code. */
  @IsOptional() @IsString() @MaxLength(2) state?: string | null;
  @IsOptional() @IsString() @MaxLength(200) addressLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsString() @MaxLength(12) pincode?: string | null;
}

/** PUT /admin/billing/company — Super Admin → Settings → Company & tax details. */
export class SaveCompanyDetailsDto {
  @ValidateNested()
  @Type(() => SellerSettingsDto)
  seller!: SellerSettingsDto;
  // Read-only in the contract shape; accepted, ignored.
  @IsOptional() @IsArray() warnings?: unknown[];
}

class ReminderRuleDto {
  @IsIn(['before_renewal', 'payment_day', 'mid_grace', 'day_before_grace_ends'])
  id!: 'before_renewal' | 'payment_day' | 'mid_grace' | 'day_before_grace_ends';
  @IsBoolean() enabled!: boolean;
}

/** PUT /admin/billing/online-payments — Integrations → Online payments switch. */
export class SaveOnlinePaymentsDto {
  @IsBoolean() enabled!: boolean;
}

/** PUT /admin/billing/lifecycle — the LifecycleSettings shape from the contract. */
export class SaveLifecycleDto {
  @IsInt() @Min(0) @Max(90) notifyDaysBefore!: number;
  @IsInt() @Min(0) @Max(365) graceDays!: number;
  // Billing v2 always falls back to Basic (BILLING_V2 on the server); the
  // stored legacy value is left as it is for the flag-off screens. Accepted
  // so the contract shape round-trips, then ignored.
  @IsOptional()
  @IsIn(['fall_back_to_basic', 'restrict', 'cancel'])
  afterGrace?: 'fall_back_to_basic' | 'restrict' | 'cancel';
  @IsString() @MaxLength(500) expiryMessage!: string;
  /**
   * Moved to Integrations → Online payments (PUT /admin/billing/online-payments).
   * Still accepted for older clients; omitted = unchanged.
   */
  @IsOptional() @IsBoolean() onlinePaymentsEnabled?: boolean;
  /** Which reminders are on; omitted = unchanged. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  reminders?: ReminderRuleDto[];
  // Read-only in the contract shape (computed by the server); accepted, ignored.
  @IsOptional() @IsIn(['online', 'manual']) paymentMode?: string;
  @IsOptional() @IsString() paymentModeReason?: string | null;
  @IsOptional() @IsObject() supports?: Record<string, boolean>;
  @IsOptional() @IsArray() warnings?: unknown[];
  /** Company tax settings — moved to PUT /admin/billing/company; still accepted here, omitted = unchanged. */
  @IsOptional()
  @ValidateNested()
  @Type(() => SellerSettingsDto)
  seller?: SellerSettingsDto;
}
