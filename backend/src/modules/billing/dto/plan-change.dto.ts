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
  /** Over Basic's limits: 'default' ("Keep the default picks") or 'saved' ("I'll choose what stays"). */
  @IsOptional()
  @IsIn(['default', 'saved'])
  whatStaysChoice?: 'default' | 'saved';
  /** Older clients: true = whatStaysChoice 'default'. */
  @IsOptional() @IsBoolean() acceptDefaultPicks?: boolean;
}

/** POST /org/billing/downgrade */
export class ScheduleDowngradeDto {
  @IsString() @IsNotEmpty() planId!: string;
  /** Defaults to the current interval; 'monthly' from yearly is a downgrade too. */
  @IsOptional() @IsIn(['monthly', 'yearly']) interval?: 'monthly' | 'yearly';
  /** Over the smaller plan's limits: 'default' or 'saved' (see CancelPlanDto). */
  @IsOptional()
  @IsIn(['default', 'saved'])
  whatStaysChoice?: 'default' | 'saved';
  /** Older clients: true = whatStaysChoice 'default'. */
  @IsOptional() @IsBoolean() acceptDefaultPicks?: boolean;
}
