import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** The contract's `Coupon` shape (value in percent or rupees). */
export class CouponDto {
  @IsString() @MaxLength(20) code!: string;
  @IsString() @MaxLength(200) description!: string;
  @IsIn(['percent', 'fixed']) kind!: 'percent' | 'fixed';
  @IsNumber({ maxDecimalPlaces: 2 }) value!: number;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) planIds!: string[];
  @IsIn(['any', 'monthly', 'yearly']) interval!: 'any' | 'monthly' | 'yearly';
  @IsIn(['first_payment', 'first_n', 'forever']) duration!:
    'first_payment' | 'first_n' | 'forever';
  @IsOptional() @IsInt() durationCount?: number | null;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) validFrom!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) validTo?: string | null;
  @IsOptional() @IsInt() @Min(0) totalUses?: number | null;
  @IsBoolean() oncePerOrg!: boolean;
  /** Open coupons only: list it on the org Billing → Coupons page. Omitted = off. */
  @IsOptional() @IsBoolean() showToCustomers?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  orgIds?: string[] | null;
}

/** POST /admin/billing/coupons · PUT /admin/billing/coupons/:code */
export class SaveCouponDto {
  @ValidateNested() @Type(() => CouponDto) coupon!: CouponDto;
  @IsOptional() @IsBoolean() isNew?: boolean;
}
