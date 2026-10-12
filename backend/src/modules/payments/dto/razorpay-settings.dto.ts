import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PUT /admin/payments/settings. Secrets left blank or sent back as the mask
 * ('••••••••') keep their stored value — the API never returns them.
 */
export class UpdateRazorpaySettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  keySecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** POST /admin/payments/settings/test — the values currently in the form. */
export class TestRazorpaySettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  keySecret?: string;
}
