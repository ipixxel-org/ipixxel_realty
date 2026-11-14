import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class EditComponentDto {
  @IsNotEmpty()
  @IsObject()
  block: Record<string, unknown>;

  @IsNotEmpty()
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  elementId?: string;

  @IsOptional()
  @IsString()
  action?: string;

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

