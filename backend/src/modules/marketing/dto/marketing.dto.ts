import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateMarketingPlatformDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string | null;
}

export class CreateMarketingPlatformDto {
  @IsString()
  @MaxLength(64)
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsOAuth?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsWebhook?: boolean;
}

export class UpdateOrgPlatformAccessDto {
  @IsUUID()
  orgId!: string;

  @IsString()
  platformKey!: string;

  @IsBoolean()
  allowed!: boolean;
}

export class UpdateMarketingConnectionDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalAccountName?: string;
}

export class ConnectMarketingCredentialsDto {
  @IsString()
  @MaxLength(200)
  externalAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalAccountName?: string;

  @IsString()
  @MaxLength(4000)
  accessToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  refreshToken?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class UpdateMarketingCredentialsDto {
  @IsOptional()
  @IsString()
  metaAppId?: string;

  @IsOptional()
  @IsString()
  metaAppSecret?: string;

  @IsOptional()
  @IsString()
  metaWebhookVerifyToken?: string;

  @IsOptional()
  @IsString()
  googleAdsClientId?: string;

  @IsOptional()
  @IsString()
  googleAdsClientSecret?: string;

  @IsOptional()
  @IsString()
  googleAdsDeveloperToken?: string;

  @IsOptional()
  @IsString()
  googleClientId?: string;

  @IsOptional()
  @IsString()
  googleClientSecret?: string;
}
