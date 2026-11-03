import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeadStatus } from '@prisma/client';

export const ADMIN_LEAD_STATUSES = [
  'new',
  'contacted',
  'connected',
  'follow_up',
  'interested',
  'not_interested',
  'converted',
  'lost',
] as const;

export type AdminLeadStatus = (typeof ADMIN_LEAD_STATUSES)[number];

export class UpdateAdminLeadStatusDto {
  @IsEnum(ADMIN_LEAD_STATUSES)
  status!: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;
}
