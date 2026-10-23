import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class PlanLimitsV2Dto {
  @IsOptional() @IsInt() @Min(0) users!: number | null;
  @IsOptional() @IsInt() @Min(0) projects!: number | null;
  @IsOptional() @IsInt() @Min(0) landingPages!: number | null;
  @IsOptional() @IsInt() @Min(0) templates!: number | null;
}

class PlanModulesV2Dto {
  @IsBoolean() teamChat!: boolean;
  @IsBoolean() metaLeadAds!: boolean;
  @IsOptional() @IsInt() @Min(0) metaPages!: number | null;
  // Shown as "coming later" — accepted but not changed through this endpoint.
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() aiCalling?: boolean;
}

/** PUT /admin/billing/plans/:id — the BillingPlan shape from the contract. */
export class SaveAdminPlanDto {
  // Read-only in the contract shape; accepted so a BillingPlan round-trips, then ignored.
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsInt() rank?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) tagline?: string;
  @IsNumber() priceMonthly!: number;
  @IsNumber() priceYearly!: number;
  @IsBoolean() isFree!: boolean;
  @ValidateNested() @Type(() => PlanLimitsV2Dto) limits!: PlanLimitsV2Dto;
  @ValidateNested() @Type(() => PlanModulesV2Dto) modules!: PlanModulesV2Dto;
}
