import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAdminLeadFollowUpDto {
  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsISO8601()
  reminderAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
