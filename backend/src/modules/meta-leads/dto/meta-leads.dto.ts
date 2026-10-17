import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class MetaOAuthCallbackDto {
  @IsString()
  code!: string;

  /** CSRF / state token returned from the connect URL (orgId encoded). */
  @IsString()
  state!: string;
}

export class UpdateMetaConnectionDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class MetaManualTokenDto {
  @IsString()
  @MaxLength(64)
  pageId!: string;

  @IsString()
  @MaxLength(200)
  pageName!: string;

  @IsString()
  @MaxLength(4000)
  accessToken!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class SaveOrgMetaAppCredentialsDto {
  @IsOptional()
  @IsString()
  metaAppId?: string;

  @IsOptional()
  @IsString()
  metaAppSecret?: string;

  @IsOptional()
  @IsString()
  metaWebhookVerifyToken?: string;
}
