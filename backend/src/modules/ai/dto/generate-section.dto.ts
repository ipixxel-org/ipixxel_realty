import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class GenerateSectionDto {
  @IsNotEmpty()
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  sectionType?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsObject()
  siteContext?: {
    projectName?: string;
    location?: string;
    category?: string;
  };
}

