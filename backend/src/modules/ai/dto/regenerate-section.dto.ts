import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export type SectionAiAction =
  | 'rewrite'
  | 'improve-headline'
  | 'shorten'
  | 'change-tone'
  | 'improve-cta'
  | 'regenerate'
  | 'suggest-styling';

export class RegenerateSectionDto {
  @IsNotEmpty()
  @IsString()
  action: SectionAiAction;

  @IsNotEmpty()
  @IsObject()
  block: Record<string, unknown>;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsObject()
  siteContext?: {
    projectName?: string;
    location?: string;
    category?: string;
  };
}
