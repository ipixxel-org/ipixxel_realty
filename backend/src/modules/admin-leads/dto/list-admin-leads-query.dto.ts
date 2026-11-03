import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus } from '@prisma/client';

export const ADMIN_LEAD_SORT_FIELDS = [
  'createdAt',
  'status',
  'source',
  'formName',
] as const;

export type AdminLeadSortField = (typeof ADMIN_LEAD_SORT_FIELDS)[number];

export class ListAdminLeadsQueryDto {
  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  formName?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ADMIN_LEAD_SORT_FIELDS)
  sortBy?: AdminLeadSortField;

  @IsOptional()
  @IsEnum(['asc', 'desc'] as const)
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
