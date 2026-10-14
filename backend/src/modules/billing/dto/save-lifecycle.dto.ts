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

class ReminderRuleDto {
  @IsIn(['before_renewal', 'payment_day', 'mid_grace', 'day_before_grace_ends'])
  id!: 'before_renewal' | 'payment_day' | 'mid_grace' | 'day_before_grace_ends';
  @IsBoolean() enabled!: boolean;
}

/** PUT /admin/billing/lifecycle — the LifecycleSettings shape from the contract. */
export class SaveLifecycleDto {
  @IsInt() @Min(0) @Max(90) notifyDaysBefore!: number;
  @IsInt() @Min(0) @Max(365) graceDays!: number;
  @IsIn(['fall_back_to_basic', 'restrict', 'cancel']) afterGrace!:
    'fall_back_to_basic' | 'restrict' | 'cancel';
  @IsString() @MaxLength(500) expiryMessage!: string;
  @IsBoolean() onlinePaymentsEnabled!: boolean;
  // Not stored yet (supports.reminderSchedule = false); accepted so the
  // contract shape round-trips, then ignored.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  reminders?: ReminderRuleDto[];
  // Read-only in the contract shape (computed by the server); accepted, ignored.
  @IsOptional() @IsIn(['online', 'manual']) paymentMode?: string;
  @IsOptional() @IsString() paymentModeReason?: string | null;
  @IsOptional() @IsObject() supports?: Record<string, boolean>;
}
