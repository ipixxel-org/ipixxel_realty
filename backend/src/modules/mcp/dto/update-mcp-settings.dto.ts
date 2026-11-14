import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Everything the Super Admin can tune for the MCP connection. Blank fields
 * reset to the auto-detected default, so no server .env values are required.
 */
export class UpdateMcpSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  command?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  backendUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^$|^\d+(ms|s|m|h|d|w|y)$/i, {
    message: 'Token lifetime must include a unit, e.g. 90d, 12h or 30m.',
  })
  tokenExpiresIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tsxCli?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  serverEntry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  siteFile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brandKitDir?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  claudeConfigPath?: string;
}
