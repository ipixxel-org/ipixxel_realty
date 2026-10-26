import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Step 1 fields freshly typed on a retry. The target draft is always the
// authenticated actor's own account; existingUserId is ignored.
export class ResolveDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string;

  @IsEmail()
  work_email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone_number: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  // Kept only for backwards compatibility: the backend always operates on
  // the authenticated actor's own draft and ignores this field.
  @IsOptional()
  @IsString()
  existingUserId?: string;
}
