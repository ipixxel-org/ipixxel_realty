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
import {
  ORG_USER_STATUS_VALUES,
} from '../../../common/utils/org-users.util';
import type {
  OrgUserStatus,
} from '../../../common/utils/org-users.util';

export class ListOrgUsersQueryDto {
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
  @IsString()
  role?: string;

  @IsOptional()
  @IsIn(ORG_USER_STATUS_VALUES)
  status?: OrgUserStatus;

  // Billing v2: only users paused by the plan.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  paused?: boolean;
}
