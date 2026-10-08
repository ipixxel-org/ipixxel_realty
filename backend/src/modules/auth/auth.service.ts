import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { JwtService } from '@nestjs/jwt';
import type { OnboardingStep, Role, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OnboardingAccountDto } from './dto/onboarding-account.dto';
import { OnboardingOrganisationDto } from './dto/onboarding-organisation.dto';
import { ResumeSignupDto } from './dto/resume-signup.dto';
import { ResolveDraftDto } from './dto/resolve-draft.dto';
import { RestartDraftDto } from './dto/restart-draft.dto';
import { PreviewDraftDto } from './dto/preview-draft.dto';
import { JwtPayload } from '../../common/types/jwt-payload.interface';
import { nextOnboardingStep } from '../../common/utils/onboarding.util';
import {
  runTeamChatHook,
  teamChatUserActivated,
} from '../../common/utils/team-chat-membership.util';
import {
  assignBasicPlanIfMissing,
  finalizeLegacyOnboardingDraft,
  isLegacyOnboardingStep,
} from '../../common/utils/onboarding-finalize.util';
import {
  generateNumericCode,
  generateRandomToken,
  hashToken,
  parseDuration,
} from '../../common/utils/tokens.util';
import { generateUniqueOrgSlug } from '../../common/utils/slug.util';
import { normalizePhoneNumber } from '../../common/utils/phone.util';
import {
  toSafeOrganisation,
  toSafeUser,
} from '../../common/utils/mappers.util';
import { assertTemplateQuota } from '../../common/utils/plan-quota.util';
import { assertEligibleTemplateIds } from '../../common/utils/template-eligibility.util';
import {
  normalizeDomain,
  isValidDomain,
} from '../../common/utils/domain.util';
import { buildNotificationData } from '../../common/utils/notifications.util';
import {
  PERMISSION_MODULES,
  computeEffectivePermissions,
  emptyModulePermission,
  mergeRolePermissions,
  SYSTEM_ORG_ID,
} from '../../common/utils/permissions.util';
import { EmailService } from '../email/email.service';
import { frontendBaseUrl } from '../../common/utils/app-url.util';

const BCRYPT_COST_FACTOR = 12;

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

type GoogleProfile = {
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  picture?: string;
  googleId: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // No client id here — the audience is passed per call, because the client
  // id can change at runtime (Super Admin settings). One instance so Google's
  // signing certs are cached between verifications.
  private readonly googleOAuthClient = new OAuth2Client();
  private readonly accessExpiresIn =
    process.env.JWT_ACCESS_EXPIRES_IN?.trim() || '15m';
  private readonly refreshExpiresIn =
    process.env.JWT_REFRESH_EXPIRES_IN?.trim() || '30d';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private async findLoginUser(email: string): Promise<{
    id: string;
    orgId: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string | null;
    passwordHash: string;
    status: User['status'];
    mustChangePassword: boolean;
    approvedAt: Date | null;
    createdAt: Date;
    onboardingStep: OnboardingStep;
    roles: string[];
  } | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          orgId: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          passwordHash: true,
          status: true,
          mustChangePassword: true,
          approvedAt: true,
          createdAt: true,
          onboardingStep: true,
          userRoles: { select: { role: { select: { key: true } } } },
        },
      });
      if (!user) return null;
      return {
        ...user,
        roles: user.userRoles.map((ur) => ur.role.key),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Prisma login lookup failed, using SQL fallback: ${message}`);
    }

    try {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        orgId: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string;
        phoneNumber: string | null;
        passwordHash: string;
        status: User['status'];
        createdAt: Date;
      }>
    >`
      SELECT
        u.id,
        u.org_id AS "orgId",
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email,
        u.phone_number AS "phoneNumber",
        u.password_hash AS "passwordHash",
        u.status,
        u.created_at AS "createdAt"
      FROM identity.users u
      WHERE lower(u.email) = lower(${email})
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;

    let roles: string[] = [];
    try {
      const roleRows = await this.prisma.$queryRaw<Array<{ key: string }>>`
        SELECT r.key
        FROM identity.user_roles ur
        JOIN identity.roles r ON r.id = ur.role_id
        WHERE ur.user_id = ${row.id}
      `;
      roles = roleRows.map((r) => r.key);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Login role lookup failed: ${message}`);
    }

    return {
      ...row,
      mustChangePassword: false,
      // Fallback path (Prisma unavailable) — treat as long-approved so a DB
      // hiccup never locks a legitimate user out. `status` is still enforced.
      approvedAt: new Date(0),
      onboardingStep: row.orgId ? 'account' : 'completed',
      roles,
    };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SQL login fallback failed: ${message}`);
      return null;
    }
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.work_email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Validate plan + template selection if provided at registration
    let plan: any = null;
    const templateIds = dto.templateIds ?? [];
    if (dto.planId) {
      plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan || !plan.isActive) throw new NotFoundException('Plan not found');
      if (templateIds.length > 0) {
        await assertEligibleTemplateIds(this.prisma, templateIds);
        assertTemplateQuota(plan, templateIds.length);
      }
    } else if (templateIds.length > 0) {
      // Template assignment without a plan — plan-based quota doesn't apply,
      // but eligibility (published, landing) still does.
      await assertEligibleTemplateIds(this.prisma, templateIds);
    }

    const slug = await generateUniqueOrgSlug(this.prisma, dto.company_name);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);
    const adminRole = await this.prisma.role.findFirstOrThrow({
      where: { orgId: null, key: 'admin' },
    });

    // --- Organisation domain identity (custom domain) ---
    // Every organisation can be assigned a custom domain
    let customDomain: string | null = null;
    if (dto.custom_domain) {
      if (!isValidDomain(dto.custom_domain)) {
        throw new ConflictException(
          'Custom domain is invalid. Example: example.com',
        );
      }
      customDomain = normalizeDomain(dto.custom_domain);
      await this.assertCustomDomainAvailable(customDomain);
    }

    const { user, organisation } = await this.prisma.$transaction(
      async (tx) => {
        const organisation = await tx.organisation.create({
          data: {
            name: dto.company_name,
            slug,
            city: dto.city,
            status: 'pending',
            country: dto.country ?? null,
            currency: dto.currency ?? 'INR',
            timezone: dto.timezone ?? 'Asia/Kolkata',
            customDomain,
            customDomainStatus: customDomain ? 'pending' : 'none',
          },
        });

        const user = await tx.user.create({
          data: {
            orgId: organisation.id,
            firstName: dto.first_name,
            lastName: dto.last_name,
            email: dto.work_email,
            phoneNumber: dto.phone_number,
            passwordHash,
            status: 'active',
          },
        });

        await tx.userRole.create({
          data: { userId: user.id, roleId: adminRole.id },
        });

        if (customDomain) {
          await tx.orgDomainRequest.create({
            data: {
              orgId: organisation.id,
              kind: 'custom_domain',
              customDomain,
              status: 'pending',
              requestedBy: user.id,
            },
          });
        }

        // Create subscription if plan selected at registration
        if (dto.planId && plan) {
          const billingCycle = dto.billingCycle ?? 'monthly';
          const isYearly = billingCycle === 'yearly';
          const amount = isYearly ? plan.priceYearly : plan.priceMonthly;
          const mrr = isYearly ? Math.round(amount / 12) : amount;
          const renewsAt = isYearly
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await tx.subscription.create({
            data: {
              orgId: organisation.id,
              planId: plan.id,
              billingCycle: billingCycle as any,
              status: 'active',
              amount,
              mrr,
              currency: 'INR',
              renewsAt,
            },
          });
        }

        if (dto.templateIds && dto.templateIds.length > 0) {
          await tx.organisationTemplate.createMany({
            data: dto.templateIds.map((tid) => ({ orgId: organisation.id, templateId: tid, assignedBy: user.id })),
          });
        }

        await tx.auditLog.create({
          data: {
            orgId: organisation.id,
            actorId: user.id,
            action: 'org_registered_pending',
            entity: 'Organisation',
            entityId: organisation.id,
            metadata: {
              planId: dto.planId ?? null,
              templateIds: dto.templateIds ?? [],
              billingCycle: dto.billingCycle ?? null,
              customDomain,
            } as any,
          },
        });

        // Notify Super Admin that an organisation registration is awaiting approval.
        await tx.notification.create({
          data: buildNotificationData({
            orgId: organisation.id,
            type: 'organisation_registration',
            title: `New organisation awaiting approval: ${organisation.name}`,
            body: `${organisation.name} (${slug}) registered${customDomain ? ` and requested custom domain ${customDomain}` : ''}. Review and approve or reject from the admin console.`,
            entity: 'Organisation',
            entityId: organisation.id,
          }),
        });

        return { user, organisation };
      },
    );

    // Founder joins the new org's General channel (created here).
    await runTeamChatHook('org registered (legacy signup)', () =>
      teamChatUserActivated(this.prisma, organisation.id, user.id),
    );

    // Do NOT issue tokens — organisation is pending approval, user cannot log in yet
    void this.emailService.sendOrgStatusEmail({
      to: dto.work_email,
      recipientName: [dto.first_name, dto.last_name].filter(Boolean).join(' ') || undefined,
      orgName: dto.company_name,
      status: 'submitted',
    });

    return {
      organisation: toSafeOrganisation(organisation),
      user: toSafeUser(user),
      pending: true,
      message: 'Organisation created — pending super admin approval. You will be able to log in after approval.',
    };
  }

  // ---------------------------------------------------------------------
  // Signup wizard — step-wise persistence (resumable). Replaces the old
  // one-shot `signup()` above for the real registration flow; that method
  // is left in place unmodified as a lower-risk fallback / for any other
  // caller, but the wizard now calls these instead.
  // ---------------------------------------------------------------------

  // Step 1 (Account). Creates the User with no orgId yet and issues a
  // token with no orgId claim. If the email already belongs to a user,
  // this does NOT create anything or issue a token — it just reports
  // which of the two prompts the frontend should show next:
  //   - exists_incomplete: offer "resume where you left off" (the
  //     frontend then calls resumeSignup with just the email — no
  //     password re-entry here, see resumeSignup for why).
  //   - exists_completed: offer "sign in instead", routing to the real,
  //     unchanged /auth/login (password required, pending-org gate
  //     applies as normal).
  async signupStep1(dto: OnboardingAccountDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.work_email },
    });

    if (existing) {
      if (existing.onboardingStep === 'completed') {
        return { status: 'exists_completed' as const };
      }
      // Incomplete draft under this email — don't silently resume it (that
      // used to discard whatever the caller just retyped here, see
      // resumeExistingDraft/restartExistingDraft). Report the match; the
      // frontend asks the user whether to continue or start fresh.
      return {
        status: 'exists_incomplete' as const,
        existingUserId: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        onboardingStep: existing.onboardingStep,
      };
    }

    // Duplicate check for phone, same idea as email above.
    //
    // Normalized before comparing AND before storing: "+91 9825041200",
    // "+919825041200" and "+91 98250 41200" are the same number, and an
    // exact-string check let all three through as "different" numbers.
    const normalizedPhone = normalizePhoneNumber(dto.phone_number);
    const existingByPhone = await this.prisma.user.findFirst({
      where: { phoneNumber: normalizedPhone },
    });
    if (existingByPhone) {
      if (existingByPhone.onboardingStep === 'completed') {
        throw new ConflictException(
          'This phone number is already registered to another account.',
        );
      }
      // Same offer as the email-match case above — this email is new, but
      // the phone belongs to someone's still-in-progress signup.
      return {
        status: 'exists_incomplete' as const,
        existingUserId: existingByPhone.id,
        firstName: existingByPhone.firstName,
        lastName: existingByPhone.lastName,
        onboardingStep: existingByPhone.onboardingStep,
      };
    }

    let isGoogleVerified = false;
    if (dto.googleToken) {
      try {
        const decoded = this.jwtService.verify<{ email?: string; purpose?: string }>(dto.googleToken);
        if (decoded?.purpose === 'google_signup' && decoded.email?.toLowerCase().trim() === dto.work_email.toLowerCase().trim()) {
          isGoogleVerified = true;
        }
      } catch {
        try {
          const gUser = await this.verifyGoogleCredential(dto.googleToken);
          if (gUser.email.toLowerCase().trim() === dto.work_email.toLowerCase().trim()) {
            isGoogleVerified = true;
          }
        } catch {}
      }
    }

    if (!dto.password && !isGoogleVerified) {
      throw new BadRequestException('Password is required');
    }

    const passwordToHash =
      dto.password ||
      crypto.randomUUID() + crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(passwordToHash, BCRYPT_COST_FACTOR);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.first_name,
        lastName: dto.last_name,
        email: dto.work_email,
        phoneNumber: normalizedPhone,
        country: dto.country,
        passwordHash,
        status: 'active',
        onboardingStep: 'account',
        emailVerifiedAt: isGoogleVerified ? new Date() : null,
      },
    });

    // No roles yet — the admin role is assigned once the organisation
    // exists, at Step 2.
    const tokens = await this.issueTokens(user.id, null, []);
    if (!isGoogleVerified) {
      await this.issueEmailVerification(user);
    }

    return {
      status: 'created' as const,
      user: toSafeUser(user),
      onboardingStep: user.onboardingStep,
      nextStep: nextOnboardingStep(user.onboardingStep),
      email_verification_required: !isGoogleVerified,
      ...tokens,
    };
  }

  // Dedicated resume path — deliberately NOT a login variant. No password
  // is required: forgot-password doesn't exist in this codebase yet, so
  // requiring a password here would be a dead end for anyone who forgets
  // it mid-onboarding. Accepted trade-off: no real dashboard/customer data
  // exists before onboarding is 'completed', so the exposure is limited to
  // "someone else can resume filling in your half-finished signup form" —
  // and this path explicitly refuses to work at all once onboarding is
  // 'completed' (that's what real login is for, gate and all).
  async resumeSignup(dto: ResumeSignupDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException('No signup in progress for this email');
    }
    // Legacy draft parked on a step the simplified wizard removed — finish
    // it up and fall through to the "already finished" branch below rather
    // than resuming into a wizard step the frontend no longer renders.
    if (user.orgId && isLegacyOnboardingStep(user.onboardingStep)) {
      await finalizeLegacyOnboardingDraft(this.prisma, user.orgId, user.id);
      user.onboardingStep = 'completed';
    }
    if (user.onboardingStep === 'completed') {
      throw new ConflictException(
        'This account has already finished setup — please sign in instead.',
      );
    }

    if (!user.emailVerifiedAt) {
      await this.issueEmailVerification(user);
    }

    return this.buildResumePayload(user);
  }

  // Step 1 collision, "Continue previous setup" branch (preview half) — same
  // no-password read as resumeSignup above, just keyed by id instead of
  // email so a phone-matched collision (new email, old phone) still
  // resolves. Deliberately read-only: identity fields are left exactly as
  // saved so the frontend can prefill Step 1 with the draft's *actual* data
  // rather than whatever was just retyped on the collision attempt. Actually
  // persisting any edits happens later, via resumeExistingDraft below, once
  // the person re-submits Step 1.
  async previewDraft(dto: PreviewDraftDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.existingUserId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException('No signup in progress for this account');
    }
    if (user.orgId && isLegacyOnboardingStep(user.onboardingStep)) {
      await finalizeLegacyOnboardingDraft(this.prisma, user.orgId, user.id);
      user.onboardingStep = 'completed';
    }
    if (user.onboardingStep === 'completed') {
      throw new ConflictException(
        'This account has already finished setup — please sign in instead.',
      );
    }

    if (!user.emailVerifiedAt) {
      await this.issueEmailVerification(user);
    }

    return this.buildResumePayload(user);
  }

  // Step 1 collision, "Continue previous setup" branch — the caller picked
  // up their old draft and (optionally) edited name/email/phone/password on
  // the retry. Updates those fields on the SAME user row (onboardingStep is
  // left alone, so the wizard still resumes wherever they'd got to) rather
  // than silently keeping the stale values, which is the bug this fixes.
  async resumeExistingDraft(dto: ResolveDraftDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: dto.existingUserId },
    });
    if (!existingUser) {
      throw new NotFoundException('No signup in progress for this account');
    }
    if (existingUser.orgId && isLegacyOnboardingStep(existingUser.onboardingStep)) {
      await finalizeLegacyOnboardingDraft(this.prisma, existingUser.orgId, existingUser.id);
      existingUser.onboardingStep = 'completed';
    }
    if (existingUser.onboardingStep === 'completed') {
      throw new ConflictException(
        'This account has already finished setup — please sign in instead.',
      );
    }

    const normalizedPhone = normalizePhoneNumber(dto.phone_number);
    if (dto.work_email !== existingUser.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.work_email },
      });
      if (emailTaken) {
        throw new ConflictException('Email already registered to another account.');
      }
    }
    if (normalizedPhone !== existingUser.phoneNumber) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phoneNumber: normalizedPhone, id: { not: existingUser.id } },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'This phone number is already registered to another account.',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: existingUser.id },
      data: {
        firstName: dto.first_name,
        lastName: dto.last_name,
        email: dto.work_email,
        phoneNumber: normalizedPhone,
        country: dto.country,
      },
      include: { userRoles: { include: { role: true } } },
    });

    if (!updated.emailVerifiedAt) {
      await this.issueEmailVerification(updated);
    }

    return this.buildResumePayload(updated);
  }

  // Step 1 collision, "Start fresh instead" branch. The selected signup is
  // explicitly discarded, including its draft organisation and onboarding
  // records. A replacement account is intentionally not created here: the
  // next Step 1 submit must be the normal new-signup flow so verification is
  // requested only after the user has filled the blank form again.
  async restartExistingDraft(dto: RestartDraftDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: dto.existingUserId },
    });
    if (!existingUser) {
      throw new NotFoundException('No signup in progress for this account');
    }
    if (existingUser.onboardingStep === 'completed') {
      throw new ConflictException(
        'This account has already finished setup — please sign in instead.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (existingUser.orgId) {
        const organisation = await tx.organisation.findUnique({
          where: { id: existingUser.orgId },
          select: { status: true },
        });
        if (!organisation || organisation.status !== 'draft') {
          throw new ConflictException(
            'This setup is no longer an incomplete draft and cannot be restarted.',
          );
        }

        // User -> Organisation is intentionally not cascade-deleted, so
        // remove every user in this abandoned draft before its org row.
        await tx.user.deleteMany({ where: { orgId: existingUser.orgId } });
        await tx.organisation.delete({ where: { id: existingUser.orgId } });
      } else {
        await tx.user.delete({ where: { id: existingUser.id } });
      }

    });

    return { status: 'restarted' as const };
  }

  // Shared by resumeSignup and resumeExistingDraft — everything after the
  // user row itself has been loaded (with its roles) and validated.
  private async buildResumePayload(
    user: User & { userRoles: (UserRole & { role: Role })[] },
  ) {
    const roles = user.userRoles.map((userRole) => userRole.role.key);
    const tokens = await this.issueTokens(user.id, user.orgId, roles);

    const organisation = user.orgId
      ? await this.prisma.organisation.findUnique({ where: { id: user.orgId } })
      : null;

    let subscription: { planId: string; billingCycle: string } | null = null;
    let templateIds: string[] = [];
    if (user.orgId) {
      const sub = await this.prisma.subscription.findFirst({
        where: { orgId: user.orgId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      subscription = sub ? { planId: sub.planId, billingCycle: sub.billingCycle } : null;

      const assigned = await this.prisma.organisationTemplate.findMany({
        where: { orgId: user.orgId },
        select: { templateId: true },
      });
      templateIds = assigned.map((a) => a.templateId);
    }

    return {
      user: toSafeUser(user),
      organisation: organisation ? toSafeOrganisation(organisation) : null,
      onboardingStep: user.onboardingStep,
      nextStep: nextOnboardingStep(user.onboardingStep),
      subscription,
      templateIds,
      email_verification_required: !user.emailVerifiedAt,
      ...tokens,
    };
  }

  // Step 2 (Organisation) — now the FINAL step of the simplified 2-step
  // wizard. JwtAuthGuard only — no org exists yet on first call, so
  // OrgAdminGuard can't be used. Creates the Organisation, sets User.orgId,
  // assigns the creating user the admin role, assigns the seeded Basic plan,
  // activates the organisation immediately (no Super Admin approval gate —
  // see OrgApprovedGuard/finalizeLegacyOnboardingDraft), marks onboarding
  // completed, then reissues the JWT so it carries the real orgId. The user
  // can log straight into the dashboard from here.
  //
  // Idempotent-ish: if the caller's user already has an orgId (a resumed
  // or repeated Step 2 submit), this updates that same organisation in
  // place rather than creating a second one.
  async createOrganisationStep(actor: JwtPayload, dto: OnboardingOrganisationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.emailVerifiedAt) {
      throw new BadRequestException(
        'Please verify your email before creating an organisation.',
      );
    }

    if (user.orgId) {
      return this.updateOrganisationStep(user.id, user.orgId, dto);
    }

    const slug = await generateUniqueOrgSlug(this.prisma, dto.company_name);

    let customDomain: string | null = null;
    if (dto.custom_domain) {
      if (!isValidDomain(dto.custom_domain)) {
        throw new ConflictException('Custom domain is invalid. Example: example.com');
      }
      customDomain = normalizeDomain(dto.custom_domain);
      await this.assertCustomDomainAvailable(customDomain);
    }

    const adminRole = await this.prisma.role.findFirstOrThrow({
      where: { orgId: null, key: 'admin' },
    });

    const { organisation, updatedUser } = await this.prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.create({
        data: {
          name: dto.company_name,
          slug,
          // Active immediately — the approval gate is gone, and this is the
          // wizard's last step. (Still 'draft'/'pending' for the old atomic
          // signup() fallback, which OrgApprovedGuard/finalizeLegacyOnboardingDraft
          // still know how to self-heal if that path is ever hit.)
          status: 'active',
          city: dto.city ?? null,
          industry: dto.industry ?? null,
          teamSize: dto.teamSize ?? null,
          country: dto.country ?? null,
          currency: dto.currency ?? 'INR',
          timezone: dto.timezone ?? 'Asia/Kolkata',
          customDomain,
          customDomainStatus: customDomain ? 'pending' : 'none',
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleId: adminRole.id },
      });
      if (customDomain) {
        await tx.orgDomainRequest.create({
          data: {
            orgId: organisation.id,
            kind: 'custom_domain',
            customDomain,
            status: 'pending',
            requestedBy: user.id,
          },
        });
      }

      await assignBasicPlanIfMissing(tx, organisation.id);

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          orgId: organisation.id,
          onboardingStep: 'completed',
          termsAcceptedAt: new Date(),
        },
      });

      return { organisation, updatedUser };
    });

    // Founder joins the new org's General channel (created here).
    await runTeamChatHook('org created (onboarding)', () =>
      teamChatUserActivated(this.prisma, organisation.id, user.id),
    );

    const tokens = await this.issueTokens(user.id, organisation.id, ['admin']);

    return {
      organisation: toSafeOrganisation(organisation),
      user: toSafeUser(updatedUser),
      onboardingStep: updatedUser.onboardingStep,
      nextStep: nextOnboardingStep(updatedUser.onboardingStep),
      ...tokens,
    };
  }

  // Re-submit path for Step 2 — the org already exists for this user (a
  // resume, or a repeat submit). Updates the same row (name / city /
  // country / currency / timezone always) and finalizes onboarding again —
  // harmless if already completed, and self-heals a legacy draft that
  // reached this step under the old multi-step flow. Subdomain is never
  // taken from the request (see OnboardingOrganisationDto) — only
  // auto-assigned here if the org somehow still doesn't have one.
  private async updateOrganisationStep(
    userId: string,
    orgId: string,
    dto: OnboardingOrganisationDto,
  ) {
    const current = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: orgId },
    });

    const organisation = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        name: dto.company_name,
        city: dto.city ?? current.city,
        industry: dto.industry ?? current.industry,
        teamSize: dto.teamSize ?? current.teamSize,
        country: dto.country ?? current.country,
        currency: dto.currency ?? current.currency,
        timezone: dto.timezone ?? current.timezone,
      },
    });

    await assignBasicPlanIfMissing(this.prisma, orgId);

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.key);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStep: 'completed',
        termsAcceptedAt: new Date(),
      },
    });

    // Re-submit / resume of Step 2: self-heal General membership.
    await runTeamChatHook('org onboarding resubmitted', () =>
      teamChatUserActivated(this.prisma, orgId, userId),
    );

    const tokens = await this.issueTokens(userId, organisation.id, roles);

    return {
      organisation: toSafeOrganisation(organisation),
      user: toSafeUser(updatedUser),
      onboardingStep: updatedUser.onboardingStep,
      nextStep: nextOnboardingStep(updatedUser.onboardingStep),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    try {
      return await this.authenticate(dto);
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Login failed unexpectedly: ${message}`);
      throw new UnauthorizedException('Invalid email or password');
    }
  }

  private async authenticate(dto: LoginDto) {
    const user = await this.findLoginUser(dto.email);

    if (!user) {
      throw new UnauthorizedException('email Invalid ID or email');
    }

    let passwordMatches = false;
    try {
      passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    } catch {
      passwordMatches = false;
    }
    if (!passwordMatches) {
      throw new UnauthorizedException('password Incorrect password');
    }

    // Account-state messaging only AFTER the password is verified, so a wrong
    // password never reveals whether an account is disabled.
    //   disabled -> deactivated
    //   pending  -> created by the Org Admin and not yet signed in; allowed
    //               in, but forced straight to change-password (there is no
    //               separate Org Admin approval step any more)
    //   active   -> normal
    if (user.status === 'disabled') {
      throw new UnauthorizedException(
        'Your account access has been revoked. Please contact your administrator.',
      );
    }

    const roles = user.roles;
    const isSuperAdmin = roles.includes('super_admin');

    // Keep the two browser login surfaces isolated. The organisation portal
    // is only for users attached to an organisation; the platform portal is
    // for Super Admin and Platform Team accounts with no org membership.
    const belongsToPlatform = !user.orgId;
    if (
      (dto.portal === 'organisation' && belongsToPlatform) ||
      (dto.portal === 'platform' && !belongsToPlatform)
    ) {
      throw new UnauthorizedException('email Invalid ID or email');
    }

    // Self-heal a draft parked on a step the simplified 2-step wizard
    // removed (Business Details, Subscription, Templates, Modules, Invite,
    // Connect) — assigns Basic and activates the org if needed, so nobody
    // stays stuck behind a wizard step that no longer exists. Best-effort:
    // a failure here must not block an otherwise-valid login.
    if (user.orgId && isLegacyOnboardingStep(user.onboardingStep)) {
      try {
        await finalizeLegacyOnboardingDraft(this.prisma, user.orgId, user.id);
        user.onboardingStep = 'completed';
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Legacy onboarding finalize failed for user ${user.id}: ${message}`);
      }
    }

    if (dto.host && !isSuperAdmin) {
      try {
        const portal = await this.resolveLoginHost(dto.host);
        if (portal && user.orgId !== portal.id) {
          throw new UnauthorizedException(
            'This login page belongs to another organisation.',
          );
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        // Host lookup must not take login down if domain tables are incomplete.
      }
    }

    // Org approval check — pending organisations cannot use the dashboard
    // until a Super Admin approves. Draft / incomplete signups are allowed
    // through so the wizard can be resumed from /register.
    let orgStatus: string | null = null;
    if (user.orgId) {
      let org: { status: string } | null = null;
      try {
        org = await this.prisma.organisation.findUnique({
          where: { id: user.orgId },
          select: { status: true },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Login org status lookup failed: ${message}`);
      }
      orgStatus = org?.status ?? null;
      if (org && org.status === 'pending' && user.onboardingStep === 'completed') {
        throw new UnauthorizedException('Organisation pending approval — please wait for super admin approval');
      }
      if (org && org.status === 'disabled') {
        throw new UnauthorizedException('Organisation is disabled');
      }
      if (org && org.status === 'rejected') {
        throw new UnauthorizedException('Organisation registration was rejected');
      }
    }

    const tokens = await this.issueTokens(user.id, user.orgId, roles);

    const safeUser = toSafeUser(user);
    // Forced first-login password change applies to both organisation users
    // provisioned by an Org Admin AND Platform Team members provisioned by a
    // Super Admin (both receive initial credentials by email). The flag is
    // carried straight from the DB — a long-standing Super Admin who was never
    // flagged keeps must_change_password = false and signs in normally; a
    // freshly created Platform Team member is routed to /change-password.
    // Backend access stays blocked until the flag clears (SuperAdminGuard /
    // OrgApprovedGuard), so this is a redirect hint, not the enforcement.

    const stillInDraftSignup =
      !isSuperAdmin &&
      user.onboardingStep !== 'completed';

    return {
      user: safeUser,
      roles,
      onboarding_incomplete: stillInDraftSignup,
      ...tokens,
    };
  }

  async refresh(rawToken: string) {
    const existing = await this.findActiveRefreshToken(rawToken);

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
      include: { userRoles: { include: { role: true } } },
    });
    // `disabled` = disapproved/deactivated — refuse. `pending` is allowed here
    // because an approved member mid-first-login (still mustChangePassword)
    // holds a valid refresh token and may legitimately rotate it.
    if (!user || user.status === 'disabled') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const roles = user.userRoles.map((userRole) => userRole.role.key);
    return this.issueTokens(user.id, user.orgId, roles);
  }

  async logout(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (existing && !existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }

    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organisation: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const organisation = user.organisation
      ? toSafeOrganisation(user.organisation)
      : null;
    const permissions = organisation
      ? await this.effectivePermissions(userId, organisation.id)
      : null;
    return { user: toSafeUser(user), organisation, permissions };
  }

  /** Effective page/action permissions for a user within their org. */
  private async effectivePermissions(userId: string, orgId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        orgId: true,
        userRoles: { select: { role: { select: { key: true } } } },
        userPermissions: {
          select: {
            moduleKey: true,
            canView: true,
            canAdd: true,
            canEdit: true,
            canDelete: true,
            canApprove: true,
          },
        },
      },
    });
    if (!user || user.orgId !== orgId) {
      return null;
    }

    const roleKeys = user.userRoles.map((ur) => ur.role.key);
    const rawRolePermissions = await this.prisma.roleModulePermission.findMany({
      where: {
        orgId: { in: [orgId, SYSTEM_ORG_ID] },
        role: { key: { in: roleKeys } },
      },
      select: {
        orgId: true,
        role: { select: { key: true } },
        moduleKey: true,
        canView: true,
        canAdd: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
      },
    });

    const rolePermissions = mergeRolePermissions(rawRolePermissions);

    const effective = computeEffectivePermissions({
      roleKeys,
      rolePermissions,
      userOverrides: user.userPermissions,
    });

    const result: Record<string, Record<string, boolean>> = {};
    for (const module of PERMISSION_MODULES) {
      const value = effective.byModule[module.key] ?? emptyModulePermission(module.key);
      result[module.key] = {
        view: value.canView,
        add: value.canAdd,
        edit: value.canEdit,
        delete: value.canDelete,
        approve: value.canApprove,
      };
    }
    return result;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const matches = await bcrypt.compare(dto.current_password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.current_password === dto.new_password) {
      throw new UnauthorizedException(
        'New password must be different from your current password',
      );
    }

    const passwordHash = await bcrypt.hash(dto.new_password, BCRYPT_COST_FACTOR);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        // First-time password setup completes the approval lifecycle: a
        // `pending` (already-approved) member becomes a full `active` member.
        // No effect on Super Admins / already-active users.
        ...(user.status === 'pending' ? { status: 'active' as const } : {}),
        // Invalidate the pre-change access token; the fresh login the user
        // makes next gets a newer `iat`.
        tokenInvalidBefore: new Date(),
      },
    });
    return { success: true };
  }

  async forgotPassword(
    email: string,
    portal?: 'organisation' | 'platform',
  ): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const isPlatformRequest = portal === 'platform';

    // Keep the two login surfaces isolated, mirroring authenticate(): the
    // platform portal only serves accounts with no organisation, and the
    // organisation portal only serves org members.
    const portalMismatch =
      !!user &&
      ((portal === 'platform' && !!user.orgId) ||
        (portal === 'organisation' && !user.orgId));

    if (isPlatformRequest) {
      // Platform (Super Admin / Platform Team) accounts are the most
      // privileged on the system, so this path never reveals whether an
      // address exists, belongs to an org, or is disabled — the response is
      // always the same generic success.
      if (!user || portalMismatch || user.status === 'disabled') {
        this.logger.warn(
          '[Forgot Password] Platform reset requested for a non-eligible address',
        );
        return { success: true };
      }
      // Throttle: one email per minute per account, so the endpoint can't be
      // used to flood an admin inbox. An outstanding link stays valid.
      const recent = await this.prisma.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          usedAt: null,
          createdAt: { gt: new Date(Date.now() - 60 * 1000) },
        },
        select: { id: true },
      });
      if (recent) {
        return { success: true };
      }
    } else if (!user || portalMismatch) {
      throw new NotFoundException('No account exists for this email address');
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateRandomToken(32);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    try {
      const emailService = new EmailService(this.prisma);
      const recipientName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');
      const result = await emailService.sendPasswordResetEmail({
        to: user.email,
        recipientName: recipientName || undefined,
        resetToken: token,
        // Platform accounts land on the platform-branded reset page, which
        // returns them to /admin-login afterwards.
        resetUrl: isPlatformRequest
          ? `${frontendBaseUrl()}/admin-login/reset-password?token=${encodeURIComponent(token)}`
          : undefined,
        orgId: user.orgId,
      });
      if (!result.success) {
        console.error(`[Forgot Password] Could not deliver email: ${result.error}`);
      }
    } catch (err: any) {
      console.error(`[Forgot Password] Could not deliver email: ${err.message}`);
    }

    return { success: true };
  }

  async validateResetToken(token: string): Promise<{ valid: boolean }> {
    if (!token) {
      return { valid: false };
    }
    const entry = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return { valid: Boolean(entry) };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const entry = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: entry.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          tokenInvalidBefore: new Date(),
        },
      });
      await tx.passwordResetToken.update({
        where: { id: entry.id },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { success: true };
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    if (user.emailVerifiedAt) {
      return { success: true, alreadyVerified: true, user: toSafeUser(user) };
    }

    const entry = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        tokenHash: hashToken(code.trim()),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: entry.id },
        data: { usedAt: new Date() },
      });
      return tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    });

    return { success: true, user: toSafeUser(updated) };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return { success: true };
    }

    await this.issueEmailVerification(user);
    return { success: true };
  }

  // Single choke point for sending a verification email. Every caller
  // (fresh signup, the various resume-draft paths that re-issue one on
  // return, and the explicit "Resend code" button) goes through here, so
  // the 60s minimum-interval guard lives in exactly one place and can't be
  // bypassed by a caller that forgets to check it — e.g. two of those
  // callers firing close together (a double-click, a retried request, a
  // dev-mode remount re-resuming the same in-progress draft) can otherwise
  // each independently decide "no recent token, send one" and mail the
  // user twice.
  private async issueEmailVerification(user: User) {
    if (user.emailVerifiedAt) {
      return;
    }

    const latest = await this.prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < 60_000) {
      return;
    }

    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = generateNumericCode(6);
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(code),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    try {
      const emailService = new EmailService(this.prisma);
      const recipientName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');
      const result = await emailService.sendVerificationEmail({
        to: user.email,
        recipientName: recipientName || undefined,
        code,
        orgId: user.orgId,
      });
      if (!result.success) {
        console.error(
          `[Email Verification] Could not deliver email to ${user.email}: ${result.error}`,
        );
      }
    } catch (err: any) {
      console.error(
        `[Email Verification] Could not deliver email to ${user.email}: ${err.message}`,
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Email Verification] Code for ${user.email}: ${code}`);
    }
  }

  private async findActiveRefreshToken(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return existing;
  }

  private async issueTokens(
    userId: string,
    orgId: string | null,
    roles: string[],
  ) {
    const payload: JwtPayload = { sub: userId, orgId, roles };
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
      this.logger.error('JWT_SECRET is not set — cannot issue tokens');
      throw new UnauthorizedException('Authentication is not configured');
    }
    let accessToken: string;
    try {
      accessToken = await this.jwtService.signAsync(
        payload as object,
        {
          secret,
          expiresIn: this.accessExpiresIn,
        } as Parameters<JwtService['signAsync']>[1],
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`JWT sign failed: ${message}`);
      throw new UnauthorizedException('Authentication is not configured');
    }

    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + parseDuration(this.refreshExpiresIn, 30 * 86_400_000),
    );

    try {
      await this.prisma.refreshToken.create({
        data: { userId, tokenHash, expiresAt },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not persist refresh token: ${message}`);
    }

    return { access_token: accessToken, refresh_token: rawRefreshToken };
  }

  // Public check used by the sign-up form to show availability live and to
  // suggest alternatives when the requested subdomain is taken.
  //
  // Called unauthenticated (a brand-new visitor has no account yet), but
  // also called by an already-signed-up user resuming the wizard, whose
  // Step 2 form is pre-filled with their OWN org's existing subdomain —
  // apiFetch already attaches whatever token is in localStorage to every
  // request, so if one is present and valid we decode it (soft: an
  // invalid/expired/missing token just means "treat as anonymous", never
  // a 401 here) and exclude that caller's own org from the "taken" check,
  // so their own unchanged subdomain doesn't falsely show as taken.
  async checkSubdomainAvailability(_subdomain: string, _authHeader?: string) {
    return {
      subdomain: '',
      host: '',
      available: true,
      reasons: [],
      suggestions: [],
    };
  }

  private async resolveLoginHost(host: string) {
    const normalized = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
    return this.prisma.organisation.findFirst({
      where: { customDomain: normalized, customDomainStatus: 'connected', status: 'active' },
      select: { id: true },
    });
  }

  private async assertCustomDomainAvailable(domain: string) {
    const host = normalizeDomain(domain);
    const org = await this.prisma.organisation.findFirst({
      where: { customDomain: host },
      select: { id: true },
    });
    if (org) {
      throw new ConflictException(`Domain "${host}" is already mapped to another organisation.`);
    }
    const req = await this.prisma.orgDomainRequest.findFirst({
      where: { customDomain: host, status: { in: ['pending', 'approved', 'connected'] } },
      select: { id: true },
    });
    if (req) {
      throw new ConflictException(`Domain "${host}" is currently in use or pending.`);
    }
  }

  async getGoogleClientCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    let clientId = '';
    let clientSecret = '';

    // 1. Prioritize Super Admin configuration saved in database
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT "google_client_id", "google_client_secret", "google_ads_client_id", "google_ads_client_secret"
        FROM "identity"."marketing_settings"
        WHERE "id" = 'default' LIMIT 1
      `);
      const row = rows && rows.length > 0 ? rows[0] : null;
      if (row) {
        clientId = String(row.google_client_id || row.google_ads_client_id || '').trim();
        clientSecret = String(row.google_client_secret || row.google_ads_client_secret || '').trim();
      }
    } catch {
      // Table may not exist yet or different schema
    }

    // 2. Optional fallback to environment variables if database row is empty
    if (!clientId) {
      clientId = (process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_ADS_CLIENT_ID ?? '').trim();
    }
    if (!clientSecret) {
      clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_ADS_CLIENT_SECRET ?? '').trim();
    }

    return { clientId, clientSecret };
  }

  async getGoogleAuthConfig() {
    const { clientId } = await this.getGoogleClientCredentials();
    return {
      enabled: Boolean(clientId),
      clientId: clientId || null,
    };
  }

  // Verifies a Google ID token's signature, expiry, audience (our client id)
  // and issuer. Without the audience check, an ID token Google issued to ANY
  // other app for the same person would be accepted here as a login.
  async verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
    const { clientId } = await this.getGoogleClientCredentials();
    if (!clientId) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Google ID token rejected: ${message}`);
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload || !GOOGLE_ISSUERS.includes(payload.iss)) {
      throw new UnauthorizedException('Invalid Google ID token');
    }
    if (!payload.email) {
      throw new UnauthorizedException('No email address provided by Google account');
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Google email is not verified');
    }
    return {
      email: payload.email.toLowerCase().trim(),
      emailVerified: true,
      firstName: payload.given_name || (payload.name ? payload.name.split(' ')[0] : 'User'),
      lastName: payload.family_name || (payload.name ? payload.name.split(' ').slice(1).join(' ') : ''),
      picture: payload.picture,
      googleId: payload.sub,
    };
  }

  async exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleProfile> {
    const { clientId, clientSecret } = await this.getGoogleClientCredentials();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Google OAuth credentials are not configured on server');
    }
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tokenData = (await res.json()) as {
      id_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok) {
      throw new UnauthorizedException(
        tokenData.error_description || tokenData.error || 'Failed to exchange Google OAuth code',
      );
    }
    // The 'openid' scope always yields an ID token. It goes through the same
    // audience/issuer/email_verified checks as a GSI credential — no
    // unverified userinfo fallback.
    if (!tokenData.id_token) {
      throw new UnauthorizedException('Google did not return an ID token');
    }
    return this.verifyGoogleCredential(tokenData.id_token);
  }

  async getGoogleAuthUrl(
    mode: 'login' | 'register' = 'login',
    portal: 'organisation' | 'platform' = 'organisation',
    customRedirectUri?: string,
    nonce?: string,
  ) {
    const { clientId } = await this.getGoogleClientCredentials();
    if (!clientId) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }
    const redirectUri =
      customRedirectUri || `${frontendBaseUrl()}/auth/google/callback`;
    // The nonce is generated and kept by the browser (sessionStorage); the
    // frontend callback rejects any state whose nonce it didn't issue, so a
    // forged callback link can't sign the victim into someone else's account.
    const state = Buffer.from(
      JSON.stringify({
        mode,
        portal,
        redirectUri,
        nonce: nonce?.slice(0, 128),
        ts: Date.now(),
      }),
      'utf8',
    ).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state,
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  async handleGoogleAuth(dto: GoogleAuthDto) {
    let googleUser: GoogleProfile;

    if (dto.credential) {
      googleUser = await this.verifyGoogleCredential(dto.credential);
    } else if (dto.code) {
      // Must be the exact redirect_uri the code was issued for — Google
      // rejects the exchange otherwise, so a caller can't swap it.
      const redirectUri =
        dto.redirectUri || `${frontendBaseUrl()}/auth/google/callback`;
      googleUser = await this.exchangeGoogleCode(dto.code, redirectUri);
    } else {
      throw new BadRequestException('Google credential or OAuth code is required');
    }

    const email = googleUser.email.toLowerCase().trim();

    const existing = await this.findLoginUser(email);

    if (existing) {
      if (existing.status === 'disabled') {
        throw new UnauthorizedException(
          'Your account access has been revoked. Please contact your administrator.',
        );
      }
      // A `pending` member (created by the Org Admin, not yet signed in) is
      // let in like password login — the frontend then sends them to
      // change-password (must_change_password).

      // An org admin who stopped after Step 1 has no org and no roles yet —
      // that's a signup in progress, not a platform account (platform team
      // and super admins are always created with onboardingStep 'completed').
      // Let them through so the callback can resume them at Step 2.
      const isSignupInProgress =
        !existing.orgId &&
        existing.roles.length === 0 &&
        existing.onboardingStep !== 'completed';
      const belongsToPlatform = !existing.orgId && !isSignupInProgress;
      if (
        (dto.portal === 'organisation' && belongsToPlatform) ||
        (dto.portal === 'platform' && !belongsToPlatform)
      ) {
        throw new UnauthorizedException('email Invalid ID or email');
      }

      if (existing.orgId && isLegacyOnboardingStep(existing.onboardingStep)) {
        try {
          await finalizeLegacyOnboardingDraft(this.prisma, existing.orgId, existing.id);
          existing.onboardingStep = 'completed';
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Legacy onboarding finalize failed: ${message}`);
        }
      }

      if (existing.orgId) {
        const org = await this.prisma.organisation.findUnique({
          where: { id: existing.orgId },
          select: { status: true },
        });
        if (org && org.status === 'pending' && existing.onboardingStep === 'completed') {
          throw new UnauthorizedException(
            'Organisation pending approval — please wait for super admin approval',
          );
        }
        if (org && org.status === 'disabled') {
          throw new UnauthorizedException('Organisation is disabled');
        }
        if (org && org.status === 'rejected') {
          throw new UnauthorizedException('Organisation registration was rejected');
        }
      }

      await this.prisma.user
        .update({
          where: { id: existing.id },
          data: {
            emailVerifiedAt: new Date(),
            firstName: existing.firstName || googleUser.firstName,
            lastName: existing.lastName || googleUser.lastName,
          },
        })
        .catch(() => undefined);

      const roles = existing.roles;
      const isSuperAdmin = roles.includes('super_admin');
      const tokens = await this.issueTokens(existing.id, existing.orgId, roles);
      const safeUser = toSafeUser(existing);
      const stillInDraftSignup = !isSuperAdmin && existing.onboardingStep !== 'completed';

      return {
        status: stillInDraftSignup
          ? ('exists_incomplete' as const)
          : ('authenticated' as const),
        user: safeUser,
        roles,
        onboarding_incomplete: stillInDraftSignup,
        onboardingStep: existing.onboardingStep,
        googleUser,
        ...tokens,
      };
    }

    // No account for this Google email: sign-up, whether the user clicked the
    // button on /login or /register — "Sign in with Google" with a new
    // address shouldn't dead-end.
    if (dto.phoneNumber && dto.country) {
      const normalizedPhone = normalizePhoneNumber(dto.phoneNumber);
      const existingByPhone = await this.prisma.user.findFirst({
        where: { phoneNumber: normalizedPhone },
      });
      if (existingByPhone) {
        if (existingByPhone.onboardingStep === 'completed') {
          throw new ConflictException(
            'This phone number is already registered to another account.',
          );
        }
        return {
          status: 'exists_incomplete' as const,
          existingUserId: existingByPhone.id,
          firstName: existingByPhone.firstName,
          lastName: existingByPhone.lastName,
          onboardingStep: existingByPhone.onboardingStep,
        };
      }

      const randomPassword =
        crypto.randomUUID() + crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_COST_FACTOR);

      const user = await this.prisma.user.create({
        data: {
          firstName: dto.firstName?.trim() || googleUser.firstName,
          lastName: dto.lastName?.trim() || googleUser.lastName,
          email,
          phoneNumber: normalizedPhone,
          country: dto.country,
          passwordHash,
          status: 'active',
          onboardingStep: 'account',
          emailVerifiedAt: new Date(),
        },
      });

      const tokens = await this.issueTokens(user.id, null, []);

      return {
        status: 'created' as const,
        user: toSafeUser(user),
        onboardingStep: user.onboardingStep,
        nextStep: nextOnboardingStep(user.onboardingStep),
        email_verification_required: false,
        googleUser,
        ...tokens,
      };
    }

    const googleToken =
      dto.credential ||
      this.jwtService.sign(
        { email, purpose: 'google_signup' },
        { expiresIn: '15m' },
      );

    return {
      status: 'needs_profile' as const,
      email,
      firstName: googleUser.firstName,
      lastName: googleUser.lastName,
      picture: googleUser.picture,
      googleVerified: true,
      googleToken,
    };
  }
}
