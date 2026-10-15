import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type AiGenerationMode = 'prompt' | 'project' | 'template' | 'improve';

export class GenerateTemplateDto {
  @IsNotEmpty()
  @IsString()
  mode: AiGenerationMode;

  @IsNotEmpty()
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  pageType?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  designStyle?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  typography?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsArray()
  selectedSections?: string[];

  @IsOptional()
  @IsString()
  imageStyle?: string;

  @IsOptional()
  currentSite?: Record<string, unknown>;
}
