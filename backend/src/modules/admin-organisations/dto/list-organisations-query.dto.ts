import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const ORG_LIST_STATUS_VALUES = [
  'active',
  'disabled',
  'rejected',
  'all',
  'pending',
  'draft',
  'trial',
  'suspended',
] as const;
export type OrgListStatus = (typeof ORG_LIST_STATUS_VALUES)[number];

export const ORG_LIST_INDUSTRY_VALUES = [
  'developer',
  'broker',
  'channel',
  'mixed',
] as const;

export class ListOrganisationsQueryDto {
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
  @IsIn(ORG_LIST_STATUS_VALUES)
  status?: OrgListStatus = 'all';

  // Organisation.industry ("role" chosen at signup). Omitted = all.
  @IsOptional()
  @IsIn(ORG_LIST_INDUSTRY_VALUES)
  industry?: (typeof ORG_LIST_INDUSTRY_VALUES)[number];
}
