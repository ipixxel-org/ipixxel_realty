import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  /**
   * Login surface the request came from. 'platform' (Super Admin / Platform
   * Team, /admin-login) only matches accounts with no organisation and emails
   * a link back to the platform reset page. Omitted = organisation portal.
   */
  @IsOptional()
  @IsIn(['organisation', 'platform'])
  portal?: 'organisation' | 'platform';
}
