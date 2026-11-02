import { Type } from 'class-transformer';
import {
  IsArray,
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
  // A plan that isn't offered (inactive / internal) has a half rank, e.g. 0.5.
  @IsOptional() @IsNumber() rank?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  // Plan versions (the Super Admin list): read-only, accepted so the plan
  // round-trips, then ignored — the version is decided by what changed.
  @IsOptional() @IsInt() version?: number | null;
  @IsOptional() @IsArray() versions?: unknown[];
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) tagline?: string;
  @IsNumber() priceMonthly!: number;
  @IsNumber() priceYearly!: number;
  @IsBoolean() isFree!: boolean;
  @ValidateNested() @Type(() => PlanLimitsV2Dto) limits!: PlanLimitsV2Dto;
  @ValidateNested() @Type(() => PlanModulesV2Dto) modules!: PlanModulesV2Dto;
}
