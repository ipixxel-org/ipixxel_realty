import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PackageChangeRequestStatus } from '@prisma/client';

export class ListPackageChangeRequestsDto {
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
  @IsEnum(['pending', 'approved', 'rejected', 'cancelled'])
  status?: PackageChangeRequestStatus;

  @IsOptional()
  @IsString()
  search?: string;

  /** One organisation's requests (the org subscription page). */
  @IsOptional()
  @IsString()
  orgId?: string;
}
