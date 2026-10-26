import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Signup wizard — Step 1 (Account). Creates the User; no Organisation
// exists yet, so nothing org-related belongs here.
export class OnboardingAccountDto {
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

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  // Stored on User (not Organisation — none exists yet) purely so a resume
  // before Step 2 can restore the Country select and strip the dial code
  // back off the phone number. See User.country's schema comment.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @IsOptional()
  @IsString()
  googleToken?: string;
}
