import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** PUT /org/billing/profile — the BillingProfile shape from the contract. */
export class SaveBillingProfileDto {
  @IsString() @MaxLength(200) legalName!: string;
  @IsString() @MaxLength(200) addressLine1!: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string | null;
  @IsString() @MaxLength(100) city!: string;
  /** 2-digit GST state code for Indian addresses. */
  @IsString() @MaxLength(50) state!: string;
  @IsString() @MaxLength(12) pincode!: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) country?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string | null;
}
