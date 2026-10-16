import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const LANDING_PAGE_STATUS_VALUES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'published',
  'unpublished',
] as const;
export type LandingPageStatusValue = (typeof LANDING_PAGE_STATUS_VALUES)[number];

export class ListLandingPagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(LANDING_PAGE_STATUS_VALUES)
  status?: LandingPageStatusValue;

  /** Only pages bound to this project (see propertyBinding in content.config). */
  @IsOptional()
  @IsString()
  projectId?: string;

  // Billing v2: only pages taken offline by the plan.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  offline?: boolean;
}
