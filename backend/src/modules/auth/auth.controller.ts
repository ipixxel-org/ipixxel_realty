import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OnboardingAccountDto } from './dto/onboarding-account.dto';
import { OnboardingOrganisationDto } from './dto/onboarding-organisation.dto';
import { ResumeSignupDto } from './dto/resume-signup.dto';
import { ResolveDraftDto } from './dto/resolve-draft.dto';
import { RestartDraftDto } from './dto/restart-draft.dto';
import { PreviewDraftDto } from './dto/preview-draft.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google/config')
  @HttpCode(200)
  getGoogleConfig() {
    return this.authService.getGoogleAuthConfig();
  }

  @Get('google/url')
  @HttpCode(200)
  getGoogleAuthUrl(
    @Query('mode') mode?: 'login' | 'register',
    @Query('portal') portal?: 'organisation' | 'platform',
    @Query('redirectUri') redirectUri?: string,
    @Query('nonce') nonce?: string,
  ) {
    return this.authService.getGoogleAuthUrl(
      mode || 'login',
      portal || 'organisation',
      redirectUri,
      nonce,
    );
  }

  @Post('google')
  @HttpCode(200)
  googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.handleGoogleAuth(dto);
  }

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  // --- Signup wizard (resumable, step-wise) ---

  @Post('signup/step1')
  @HttpCode(200)
  signupStep1(@Body() dto: OnboardingAccountDto) {
    return this.authService.signupStep1(dto);
  }

  @Post('resume-signup')
  @HttpCode(200)
  resumeSignup(@Body() dto: ResumeSignupDto) {
    return this.authService.resumeSignup(dto);
  }

  // "Continue previous setup" preview — read-only fetch of the draft the
  // Step 1 collision matched, keyed by id (the match may have been on
  // phone number with a brand-new email). See AuthService.previewDraft.
  @Post('signup/step1/preview')
  @HttpCode(200)
  previewDraft(@Body() dto: PreviewDraftDto) {
    return this.authService.previewDraft(dto);
  }

  // "You already started this" popup — one of these two fires once the
  // caller picks an option, see AuthService.resumeExistingDraft /
  // restartExistingDraft.
  @Post('signup/step1/resume')
  @HttpCode(200)
  resumeExistingDraft(@Body() dto: ResolveDraftDto) {
    return this.authService.resumeExistingDraft(dto);
  }

  @Post('signup/step1/restart')
  @HttpCode(200)
  restartExistingDraft(@Body() dto: RestartDraftDto) {
    return this.authService.restartExistingDraft(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('signup/organisation')
  @HttpCode(200)
  createOrganisationStep(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: OnboardingOrganisationDto,
  ) {
    return this.authService.createOrganisationStep(actor, dto);
  }

  // Deliberately no @UseGuards — must work for a brand-new visitor with no
  // account yet. Still reads the Authorization header when present (e.g. a
  // resuming user whose Step 2 is pre-filled with their own org's
  // subdomain) so that caller's own org isn't falsely flagged as taken —
  // see AuthService.checkSubdomainAvailability.
  @Get('subdomain-availability')
  @HttpCode(200)
  subdomainAvailability(
    @Query('subdomain') subdomain: string,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.authService.checkSubdomainAvailability(subdomain ?? '', authHeader);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refresh_token);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Post('resend-verification')
  @HttpCode(200)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email, dto.portal);
  }

  @Get('reset-password/validate')
  validateResetToken(@Query('token') token: string) {
    return this.authService.validateResetToken(token);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.new_password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() actor: JwtPayload) {
    return this.authService.getProfile(actor.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(actor.sub, dto);
  }
}
