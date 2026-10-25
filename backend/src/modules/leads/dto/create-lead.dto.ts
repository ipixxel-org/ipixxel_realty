import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

function emptyToUndefined(value: unknown) {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

export class CreateLeadDto {
  /** Landing page the form belongs to — used to resolve orgId on a public POST. */
  @IsOptional()
  @IsString()
  landingPageId?: string;

  /** Optional slug of the landing page the lead was captured from. */
  @IsOptional()
  @IsString()
  slug?: string;

  /** Project this enquiry is about — lead will be scoped to its org and visible to assigned sales. */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  formName?: string;

  @IsOptional()
  @IsString()
  source?: string;

  /** Free-form field values captured by the form (label/key -> value). */
  @IsObject()
  data!: Record<string, unknown>;

  /** Honeypot anti-bot field: hidden from humans, filled by automated spam bots. */
  @IsOptional()
  @IsString()
  hp?: string;

  /** Optional Turnstile or captcha response token for anti-bot verification. */
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
