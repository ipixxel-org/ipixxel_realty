import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/** GET /org/billing/retention?targetPlanId= */
export class RetentionQueryDto {
  @IsOptional() @IsString() targetPlanId?: string;
}

/** PUT /org/billing/retention */
export class SaveRetentionChoicesDto {
  @IsString() @IsNotEmpty() targetPlanId!: string;
  @IsArray() @ArrayMaxSize(5000) @IsString({ each: true }) userIds!: string[];
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  projectIds!: string[];
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  landingPageIds!: string[];
  /** Optional so older clients still save; missing = the default picks. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  templateIds?: string[];
}
