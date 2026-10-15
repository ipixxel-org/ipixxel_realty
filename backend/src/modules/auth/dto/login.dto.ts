import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Messages start with the field name so the login pages can show each one
// under its input. class-validator reports the decorator nearest the
// property first, so "required" wins over the format check for empty input.
export class LoginDto {
  @IsEmail({}, { message: 'email ID must be a valid email address' })
  @IsNotEmpty({ message: 'email ID is required' })
  email: string;

  @IsString({ message: 'password is required' })
  @IsNotEmpty({ message: 'password is required' })
  password: string;

  /** Browser host when signing in on an organisation subdomain or custom domain. */
  @IsOptional()
  @IsString()
  host?: string;

  /** Login surface requested by the browser, used to keep portal accounts isolated. */
  @IsIn(['organisation', 'platform'])
  portal: 'organisation' | 'platform';
}
