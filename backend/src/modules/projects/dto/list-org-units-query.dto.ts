import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { UNIT_STATUS_VALUES } from './create-unit.dto';
import type { UnitStatusValue } from './create-unit.dto';

// Cross-project unit list (the "All Units" screen). Unlike the per-project
// ListUnitsQueryDto this one paginates — an org's whole inventory is
// unbounded — and follows the same { data, total, page, limit } shape as
// ListProjectsQueryDto.
export class ListOrgUnitsQueryDto {
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

  // Narrow to one project (the "All projects" filter picks a specific one).
  @IsOptional()
  @IsUUID()
  projectId?: string;

  // Only standalone units (no project). Ignored if `projectId` is also set.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  standalone?: boolean;

  @IsOptional()
  @IsIn(UNIT_STATUS_VALUES)
  status?: UnitStatusValue;

  // Matches unit number (case-insensitive, contains).
  @IsOptional()
  @IsString()
  search?: string;

  // Billing v2: only units of projects made view-only by the plan.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  viewOnly?: boolean;
}
