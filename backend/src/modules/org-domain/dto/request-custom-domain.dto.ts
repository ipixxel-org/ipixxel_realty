import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestCustomDomainDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  domain!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  landingPageId?: string;

  @IsOptional()
  @IsString()
  preferredHostname?: string;

  @IsOptional()
  @IsString()
  domainType?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  redirectWww?: boolean;

  @IsOptional()
  @IsBoolean()
  ownershipConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}