import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** POST /org/billing/cancel */
export class CancelPlanDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  /** Over Basic's limits with no saved choice: "Keep the default picks shown above". */
  @IsOptional() @IsBoolean() acceptDefaultPicks?: boolean;
}

/** POST /org/billing/downgrade */
export class ScheduleDowngradeDto {
  @IsString() @IsNotEmpty() planId!: string;
  /** Defaults to the current interval; 'monthly' from yearly is a downgrade too. */
  @IsOptional() @IsIn(['monthly', 'yearly']) interval?: 'monthly' | 'yearly';
  /** Over the smaller plan's limits with no saved choice: "Keep the default picks shown above". */
  @IsOptional() @IsBoolean() acceptDefaultPicks?: boolean;
}
