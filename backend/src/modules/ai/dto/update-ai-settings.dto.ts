import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const AI_PROVIDERS = ['gemini', 'anthropic', 'external'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

/**
 * Super Admin-editable AI provider credentials. Secrets may be sent blank or
 * as the mask to keep the stored value. `provider` may be '' to auto-detect.
 */
export class UpdateAiSettingsDto {
  @IsOptional()
  @IsIn([...AI_PROVIDERS, ''])
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  geminiApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  geminiModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  geminiThinkingBudget?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  anthropicModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  aiGenerateApiUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  aiGenerateApiKey?: string;
}
