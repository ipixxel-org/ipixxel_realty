import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../../common/types/jwt-payload.interface';
import { generateUniqueOrgSlug } from '../../common/utils/slug.util';
import { provisionOrgPortal } from '../../common/utils/org-site.util';
import { generateTempPassword } from '../../common/utils/tokens.util';
import {
  buildOrganisationUpdateData,
  toSafeOrganisation,
  toSafeUser,
} from '../../common/utils/mappers.util';
import {
  listOrgUsers,
  provisionInvitedUser,
  setOrgUserStatus,
} from '../../common/utils/org-users.util';
import { assertTemplateQuota } from '../../common/utils/plan-quota.util';
import {
  runTeamChatHook,
  teamChatUserActivated,
} from '../../common/utils/team-chat-membership.util';
import { assertEligibleTemplateIds } from '../../common/utils/template-eligibility.util';
import { OnboardCompanyDto } from './dto/onboard-company.dto';
import { OnboardAdminDto } from './dto/onboard-admin.dto';
import { CreateOrganisationWithAdminDto } from './dto/create-organisation-with-admin.dto';
import { ActivateOrganisationDto } from './dto/activate-organisation.dto';
import { ListOrganisationsQueryDto } from './dto/list-organisations-query.dto';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';
import { UpdateOrganisationStatusDto } from './dto/update-organisation-status.dto';
import { LogoUploadUrlDto } from './dto/logo-upload-url.dto';
import { StorageService } from '../../common/storage/storage.service';
import { CreateOrgUserDto } from '../org-users/dto/create-org-user.dto';
import { UpdateOrgUserStatusDto } from '../org-users/dto/update-org-user-status.dto';
import { ListOrgUsersQueryDto } from '../org-users/dto/list-org-users-query.dto';
import { buildNotificationData } from '../../common/utils/notifications.util';
import type { Prisma } from '@prisma/client';
import { EmailService } from '../email/email.service';

const BCRYPT_COST_FACTOR = 12;

// A "Pending signup" (Super Admin's Organisations screen) is a Step 1
// (Account) draft that never became an Organisation: no orgId, so it can
// never be represented as an organisation row — a fake orgId would enable
// organisation actions (approve/reject/activate/delete-org) against
// something that isn't one. `emailVerifiedAt: { not: null }` is the one
// deliberate narrowing from "every incomplete Step 1 user": someone who
// typed a throwaway address and never clicked the verification link is
// junk, not a real stalled signup, and shouldn't clutter this list.
const PENDING_SIGNUP_WHERE: Prisma.UserWhereInput = {
  status: 'active',
  orgId: null,
  onboardingStep: { not: 'completed' },
  emailVerifiedAt: { not: null },
};

@Injectable()
export class AdminOrganisationsService {
  // Ephemeral, single-instance only: bridges the temp password generated in
  // onboardAdmin to the stub credential email sent at activate — by design,
  // never persisted in plaintext and never returned to the client. A server
  // restart between the two steps just means the email log can't include it.
  private readonly pendingTempPasswords = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly emailService: EmailService,
  ) {}

  async onboardCompany(dto: OnboardCompanyDto) {
    const slug = await generateUniqueOrgSlug(this.prisma, dto.company_name);

    const organisation = await this.prisma.organisation.create({
      data: { name: dto.company_name, city: dto.city, slug, status: 'draft' },
    });

    return { orgId: organisation.id, slug: organisation.slug };
  }

  async createWithAdmin(dto: CreateOrganisationWithAdminDto) {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
    });
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    const slug = await generateUniqueOrgSlug(this.prisma, dto.name);

    const adminRole = await this.prisma.role.findFirstOrThrow({
      where: { orgId: null, key: 'admin' },
    });

    const rawPassword = dto.adminPassword || generateTempPassword();
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_COST_FACTOR);
    const mustChangePassword = dto.adminPassword ? false : true;

    const orgStatus = dto.status ?? 'active';

    const { organisation, user } = await this.prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.create({
        data: {
          name: dto.name,
          slug,
          city: dto.city,
          status: orgStatus as any,
        },
      });

      const user = await tx.user.create({
        data: {
          orgId: organisation.id,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          email: dto.adminEmail,
          phoneNumber: dto.adminPhone,
          passwordHash,
          status: 'active',
          mustChangePassword,
          onboardingStep: 'completed',
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleId: adminRole.id },
      });

      return { organisation, user };
    });

    // Founder joins the new org's General channel (created here).
    await runTeamChatHook('org created by super admin', () =>
      teamChatUserActivated(this.prisma, organisation.id, user.id),
    );

    if (!dto.adminPassword) {
      void this.emailService.sendInviteEmail({
        to: user.email,
        recipientName: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        orgName: organisation.name,
        orgId: organisation.id,
        role: 'Organisation Admin',
        tempPassword: rawPassword,
      });
    }

    return {
      organisation: toSafeOrganisation(organisation),
      user: toSafeUser(user),
      tempPassword: dto.adminPassword ? undefined : rawPassword,
    };
  }

  async onboardAdmin(orgId: string, dto: OnboardAdminDto) {
    const organisation = await this.getDraftOrganisation(orgId);

    const existingAdmin = await this.prisma.user.findFirst({
      where: { orgId: organisation.id },
    });
    if (existingAdmin) {
      throw new ConflictException(
        'An admin account already exists for this organisation',
      );
    }

    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.work_email },
    });
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    const adminRole = await this.prisma.role.findFirstOrThrow({
      where: { orgId: null, key: 'admin' },
    });

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST_FACTOR);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          orgId: organisation.id,
          firstName: dto.first_name,
          lastName: dto.last_name,
          email: dto.work_email,
          phoneNumber: dto.phone_number,
          passwordHash,
          status: 'active',
          mustChangePassword: dto.force_password_change ?? true,
        },
      });

      await tx.userRole.create({
        data: { userId: created.id, roleId: adminRole.id },
      });

      return created;
    });

    await runTeamChatHook('org admin onboarded by super admin', () =>
      teamChatUserActivated(this.prisma, organisation.id, user.id),
    );

    this.pendingTempPasswords.set(organisation.id, tempPassword);
    void this.emailService.sendInviteEmail({
      to: user.email,
      recipientName: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      orgName: organisation.name,
      orgId: organisation.id,
      role: 'Organisation Admin',
      tempPassword,
    });

    return toSafeUser(user);
  }

  async activate(
    orgId: string,
    actor: JwtPayload,
    dto: ActivateOrganisationDto,
  ) {
    const organisation = await this.getDraftOrganisation(orgId);

    const admin = await this.prisma.user.findFirst({
      where: { orgId: organisation.id },
    });
    if (!admin) {
      throw new BadRequestException(
        'Complete the admin account step before activating',
      );
    }

    // --- Validate plan + template assignment if provided ---
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
      // template assignment without plan — eligibility still applies
      await assertEligibleTemplateIds(this.prisma, templateIds);
    }

    // Transactionally activate, create subscription and assignments
    const result = await this.prisma.$transaction(async (tx) => {
      const activated = await tx.organisation.update({
        where: { id: organisation.id },
        data: { status: 'active' },
      });

      let subscription: any = null;
      if (dto.planId && plan) {
        const billingCycle = dto.billingCycle ?? 'monthly';
        const isYearly = billingCycle === 'yearly';
        const amount = isYearly ? plan.priceYearly : plan.priceMonthly;
        const mrr = isYearly ? Math.round(amount / 12) : amount;
        const renewsAt = isYearly
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        subscription = await tx.subscription.create({
          data: {
            orgId: activated.id,
            planId: plan.id,
            billingCycle: billingCycle as any,
            status: 'active',
            amount,
            mrr,
            currency: dto.currency ?? 'INR',
            renewsAt,
          },
        });
      }

      if (dto.templateIds && dto.templateIds.length > 0) {
        const rows = dto.templateIds.map((tid) => ({
          orgId: activated.id,
          templateId: tid,
          assignedBy: actor.sub,
        }));
        await tx.organisationTemplate.createMany({ data: rows, skipDuplicates: true });
      }

      await tx.auditLog.create({
        data: {
          orgId: activated.id,
          actorId: actor.sub,
          action: 'org_onboarded',
          entity: 'Organisation',
          entityId: activated.id,
          metadata: { planId: dto.planId ?? null, templateIds: dto.templateIds ?? [] } as any,
        },
      });

      const portal = await provisionOrgPortal(
        tx,
        { id: activated.id, name: activated.name, slug: activated.slug },
        actor.sub,
        dto.templateIds?.[0] ?? null,
      );
      return { activated, subscription, portal };
    });

    const tempPassword = this.pendingTempPasswords.get(organisation.id);
    this.pendingTempPasswords.delete(organisation.id);
    void this.emailService.sendInviteEmail({
      to: admin.email,
      recipientName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || undefined,
      orgName: result.activated.name,
      orgId: organisation.id,
      role: 'Organisation Admin',
      tempPassword,
    });

    return {
      organisation: toSafeOrganisation(result.activated),
      admin: toSafeUser(admin),
      subscription: result.subscription
        ? { id: result.subscription.id, planId: result.subscription.planId, billingCycle: result.subscription.billingCycle }
        : null,
    };
  }

  async list(query: ListOrganisationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Statuses that don't exist in the data yet — an empty page, not an error.
    if (query.status === 'trial' || query.status === 'suspended') {
      return { data: [], total: 0, page, limit };
    }

    const where: Prisma.OrganisationWhereInput = {};
    if (query.status === 'all' || !query.status) {
      // Include incomplete onboarding attempts in the unfiltered list so
      // Super Admin can see and identify them as drafts.
    } else if (query.status === 'pending') {
      where.status = 'pending';
    } else if (query.status === 'disabled') {
      // The Super Admin UI's "Rejected/Disabled" tab is one bucket over two
      // distinct statuses — an admin-initiated disable and a rejected
      // registration both land an org here, kept separate in the data model
      // but shown together since both mean "not usable right now".
      where.status = { in: ['disabled', 'rejected'] };
    } else {
      where.status = query.status as any;
    }

    if (query.search) {
      const search = query.search;
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { city: { contains: search, mode: 'insensitive' } },
            {
              users: {
                some: {
                  email: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ],
        },
      ];
    }

    const [organisations, total] = await Promise.all([
      this.prisma.organisation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          users: {
            where: { userRoles: { some: { role: { key: 'admin' } } } },
            take: 1,
            select: { email: true, firstName: true, lastName: true, phoneNumber: true },
          },
          _count: { select: { users: true, teams: true, organisationTemplates: true } },
        },
      }),
      this.prisma.organisation.count({ where }),
    ]);

    // Enrich with latest active subscription plan per org
    const orgIds = organisations.map((o) => o.id);
    const subs = orgIds.length
      ? await this.prisma.subscription.findMany({
          where: { orgId: { in: orgIds }, status: { not: 'cancelled' } },
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        })
      : [];
    const subByOrg = new Map<string, (typeof subs)[number]>();
    for (const s of subs) {
      if (!subByOrg.has(s.orgId)) subByOrg.set(s.orgId, s);
    }

    return {
      data: organisations.map((org) => {
        const sub = subByOrg.get(org.id) ?? null;
        const admin = org.users[0] ?? null;
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          city: org.city,
          subdomain: null,
          subdomainHost: null,
          subdomainStatus: 'none',
          customDomain: org.customDomain,
          customDomainStatus: org.customDomainStatus,
          adminName: admin ? [admin.firstName, admin.lastName].filter(Boolean).join(' ') : null,
          adminEmail: admin?.email ?? null,
          adminPhone: admin?.phoneNumber ?? null,
          status: org.status,
          rejectionReason: org.rejectionReason,
          createdAt: org.createdAt,
          userCount: org._count.users,
          teamCount: (org._count as any).teams ?? 0,
          templatesCount: (org._count as any).organisationTemplates ?? 0,
          plan: sub ? { id: sub.plan.id, name: sub.plan.name, slug: sub.plan.slug, badge: sub.plan.badge, billingCycle: sub.billingCycle, amount: sub.amount } : null,
          mrr: sub?.mrr ?? sub?.amount ?? null,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async summary() {
    const [total, active, pending, disabled, draft, pendingSignups] = await Promise.all([
      this.prisma.organisation.count({ where: { status: { not: 'draft' } } }),
      this.prisma.organisation.count({ where: { status: 'active' } }),
      this.prisma.organisation.count({ where: { status: 'pending' } }),
      // Matches the list() "Rejected/Disabled" bucket — both statuses read
      // as "not usable right now" in the Super Admin UI.
      this.prisma.organisation.count({ where: { status: { in: ['disabled', 'rejected'] } } }),
      this.prisma.organisation.count({ where: { status: 'draft' } }),
      this.prisma.user.count({ where: PENDING_SIGNUP_WHERE }),
    ]);

    return { total, active, pending, disabled, draft, pendingSignups, onTrial: null, suspended: null };
  }

  // Step 1 (Account) drafts that never became an Organisation — a
  // completely different kind of "incomplete" from Organisation.status ===
  // 'draft' (which the list()/summary() `draft` bucket above already
  // covers): these users have no orgId at all, so there's no organisation
  // row to show them as. Only verified ones surface here — the concern is
  // real people who stalled, not throwaway addresses that never came back
  // to click the verification link. See listPendingSignups for why
  // unverified rows are filtered out rather than just delayed.
  async listPendingSignups(query: { page?: number; limit?: number; search?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {
      ...PENDING_SIGNUP_WHERE,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phoneNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          country: true,
          onboardingStep: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: rows, total, page, limit };
  }

  // Single-row fetch for the detail drawer — same PENDING_SIGNUP_WHERE gate
  // as the list, so a stale drawer reference to a user who has since
  // verified... no, completed onboarding, or was deleted, 404s instead of
  // quietly showing (possibly stale) data. Never selects passwordHash.
  async getPendingSignupById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...PENDING_SIGNUP_WHERE },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        country: true,
        onboardingStep: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Pending signup not found');
    }
    return user;
  }

  // Hard delete, not a status flip — a stale, never-finished signup has no
  // organisation and no real data to preserve, and disabling it would just
  // leave a dead row permanently squatting on that email/phone, blocking
  // the person from ever signing up properly later. Re-checks
  // PENDING_SIGNUP_WHERE itself (not just "does this id exist") so this can
  // never be pointed at a real, completed account.
  //
  // Deferred policy (not built): auto-notify at 7 days, auto-delete at
  // 30-90 days. Skipped for now — current volume is near zero and the
  // project has no @nestjs/schedule (or any cron mechanism) installed;
  // adding one is a real architectural decision, not something to smuggle
  // in for a handful of rows. This manual action is the entire cleanup
  // story until volume actually justifies that investment.
  async deletePendingSignup(id: string, actor: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...PENDING_SIGNUP_WHERE },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('Pending signup not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          orgId: null,
          actorId: actor.sub,
          action: 'pending_signup_deleted',
          entity: 'User',
          entityId: id,
          metadata: { email: user.email },
        },
      });
    });

    return { success: true };
  }

  async getById(id: string) {
    const organisation = await this.getRealOrganisation(id);

    const [admin, userCount, teamCount, subscription, assignedCount] = await Promise.all([
      this.prisma.user.findFirst({
        where: { orgId: id, userRoles: { some: { role: { key: 'admin' } } } },
      }),
      this.prisma.user.count({ where: { orgId: id } }),
      this.prisma.team.count({ where: { orgId: id } }),
      this.prisma.subscription.findFirst({
        where: { orgId: id, status: { not: 'cancelled' } },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
      this.prisma.organisationTemplate.count({ where: { orgId: id } }),
    ]);

    return {
      id: organisation.id,
      name: organisation.name,
      slug: organisation.slug,
      city: organisation.city,
      subdomain: null,
      subdomainHost: null,
      subdomainStatus: 'none',
      customDomain: organisation.customDomain,
      customDomainStatus: organisation.customDomainStatus,
      status: organisation.status,
      rejectionReason: organisation.rejectionReason,
      createdAt: organisation.createdAt,
      timezone: organisation.timezone,
      currency: organisation.currency,
      defaultLanguage: organisation.defaultLanguage,
      logoUrl: organisation.logoUrl,
      faviconUrl: organisation.faviconUrl,
      brandColour: organisation.brandColour,
      website: organisation.website,
      addressLine1: organisation.addressLine1,
      addressLine2: organisation.addressLine2,
      state: organisation.state,
      postalCode: organisation.postalCode,
      country: organisation.country,
      admin: admin
        ? {
            firstName: admin.firstName,
            lastName: admin.lastName,
            email: admin.email,
            phoneNumber: admin.phoneNumber,
          }
        : null,
      userCount,
      teamCount,
      plan: subscription ? { id: subscription.plan.id, name: subscription.plan.name, slug: subscription.plan.slug, badge: subscription.plan.badge } : null,
      planValue: subscription?.amount ?? null,
      subscriptionRenewsAt: subscription?.renewsAt ?? null,
      assignedTemplates: assignedCount,
      subscription,
    };
  }

  async listUsers(id: string, query: ListOrgUsersQueryDto) {
    await this.getRealOrganisation(id);
    return listOrgUsers(this.prisma, id, query);
  }

  async createUser(id: string, dto: CreateOrgUserDto) {
    await this.getRealOrganisation(id);
    return provisionInvitedUser(this.prisma, id, dto);
  }

  async updateUserStatus(
    id: string,
    userId: string,
    dto: UpdateOrgUserStatusDto,
  ) {
    await this.getRealOrganisation(id);
    return setOrgUserStatus(this.prisma, id, userId, dto.status);
  }

  async listActivity(id: string) {
    await this.getRealOrganisation(id);

    const logs = await this.prisma.auditLog.findMany({
      where: { orgId: id },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      createdAt: log.createdAt,
    }));
  }

  async update(id: string, dto: UpdateOrganisationDto) {
    await this.getRealOrganisation(id);

    const updated = await this.prisma.organisation.update({
      where: { id },
      data: buildOrganisationUpdateData(dto),
    });

    return toSafeOrganisation(updated);
  }

  // Presigned PUT URL for the target org's logo or favicon, used by the
  // Super Admin org-detail edit form. Same StorageService rules as the
  // signup wizard — the key is scoped to this org's id (path param,
  // already validated to be a real org above), never a client value.
  async createAssetUploadUrl(
    id: string,
    field: 'logo' | 'favicon',
    dto: LogoUploadUrlDto,
  ) {
    await this.getRealOrganisation(id);
    return this.storage.createUploadUrl({
      orgId: id,
      field,
      filename: dto.filename,
      contentType: dto.contentType,
      size: dto.size,
    });
  }

  async updateStatus(id: string, dto: UpdateOrganisationStatusDto) {
    const existing = await this.getRealOrganisation(id);

    const updated = await this.prisma.organisation.update({
      where: { id },
      data: {
        status: dto.status,
        ...(existing.status === 'rejected' ? { rejectionReason: null } : {}),
      },
    });

    // Notify every organisation member when the workspace is suspended so
    // users who are not currently signed in also understand why access stops.
    if (existing.status !== dto.status && dto.status === 'disabled') {
      const users = await this.prisma.user.findMany({
        where: { orgId: id },
        select: { email: true, firstName: true, lastName: true },
      });
      for (const user of users) {
        void this.emailService.sendOrgStatusEmail({
          to: user.email,
          recipientName:
            [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
          orgName: existing.name,
          status: 'disabled',
        });
      }
    } else if (existing.status !== dto.status) {
      // Preserve the existing reactivation notification for the primary org admin.
      const admin = await this.prisma.user.findFirst({
        where: { orgId: id, userRoles: { some: { role: { key: 'admin' } } } },
        orderBy: { createdAt: 'asc' },
      });
      if (admin) {
        void this.emailService.sendOrgStatusEmail({
          to: admin.email,
          recipientName:
            [admin.firstName, admin.lastName].filter(Boolean).join(' ') || undefined,
          orgName: existing.name,
          status: 'enabled',
        });
      }
    }

    return toSafeOrganisation(updated);
  }

  async approvePending(
    orgId: string,
    actor: JwtPayload,
    dto: { planId?: string; billingCycle?: 'monthly' | 'yearly'; templateIds?: string[] },
  ) {
    const organisation = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!organisation) throw new NotFoundException('Organisation not found');
    if (organisation.status !== 'pending') throw new BadRequestException('Only pending organisations can be approved');

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
      await assertEligibleTemplateIds(this.prisma, templateIds);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organisation.update({ where: { id: orgId }, data: { status: 'active' } });
      let subscription: any = null;
      const existingSub = await tx.subscription.findFirst({ where: { orgId: updated.id, status: { not: 'cancelled' } } });
      if (dto.planId && plan && !existingSub) {
        const billingCycle = dto.billingCycle ?? 'monthly';
        const isYearly = billingCycle === 'yearly';
        const amount = isYearly ? plan.priceYearly : plan.priceMonthly;
        const mrr = isYearly ? Math.round(amount / 12) : amount;
        const renewsAt = isYearly ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        subscription = await tx.subscription.create({
          data: { orgId: updated.id, planId: plan.id, billingCycle: billingCycle as any, status: 'active', amount, mrr, currency: 'INR', renewsAt },
        });
      } else if (existingSub) {
        subscription = existingSub;
      }
      if (dto.templateIds && dto.templateIds.length > 0) {
        // If templates already assigned at registration, skipDuplicates handles, but if existing assignments exist, we merge
        await tx.organisationTemplate.createMany({
          data: dto.templateIds.map((tid) => ({ orgId: updated.id, templateId: tid, assignedBy: actor.sub })),
          skipDuplicates: true,
        });
      }
      await tx.auditLog.create({
        data: { orgId: updated.id, actorId: actor.sub, action: 'org_approved', entity: 'Organisation', entityId: updated.id, metadata: dto as any },
      });

      const portal = await provisionOrgPortal(
        tx,
        {
          id: updated.id,
          name: organisation.name,
          slug: organisation.slug,
        },
        actor.sub,
        dto.templateIds?.[0] ?? null,
      );

      await tx.notification.create({
        data: buildNotificationData({
          orgId: orgId,
          type: 'organisation_approved',
          title: `Organisation approved: ${organisation.name}`,
          body: `${organisation.name} was approved and activated. Login is live at ${portal.host}.`,
          entity: 'Organisation',
          entityId: orgId,
        }),
      });

      return { updated, subscription, portal };
    });

    const admin = await this.prisma.user.findFirst({
      where: { orgId, userRoles: { some: { role: { key: 'admin' } } } },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      void this.emailService.sendOrgApprovedEmail({
        to: admin.email,
        recipientName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || undefined,
        orgName: organisation.name,
      });
    }

    const latest = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    return {
      organisation: toSafeOrganisation(latest ?? result.updated),
      subscription: result.subscription,
      portal: result.portal,
    };
  }

  async rejectPending(orgId: string, actor: JwtPayload, reason: string) {
    const org = await this.prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organisation not found');
    if (org.status !== 'pending') throw new BadRequestException('Only pending organisations can be rejected');
    // Reason is mandatory (enforced by RejectOrganisationDto) — defensive
    // check here too since this is a public service method, not just a
    // controller-reachable one.
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }
    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: { status: 'rejected', rejectionReason: reason },
    });
    await this.prisma.auditLog.create({
      data: { orgId: updated.id, actorId: actor.sub, action: 'org_rejected', entity: 'Organisation', entityId: updated.id, metadata: { reason } as any },
    });
    await this.prisma.notification.create({
      data: buildNotificationData({
        orgId,
        type: 'organisation_rejected',
        title: `Organisation rejected: ${org.name}`,
        body: `${org.name} was rejected${reason ? ` — ${reason}` : ''}.`,
        entity: 'Organisation',
        entityId: orgId,
      }),
    });

    const admin = await this.prisma.user.findFirst({
      where: { orgId, userRoles: { some: { role: { key: 'admin' } } } },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      void this.emailService.sendOrgStatusEmail({
        to: admin.email,
        recipientName:
          [admin.firstName, admin.lastName].filter(Boolean).join(' ') || undefined,
        orgName: org.name,
        status: 'rejected',
        reason,
      });
    }

    return toSafeOrganisation(updated);
  }

  async getOrgTemplates(id: string) {
    await this.getRealOrganisation(id);
    const rows = await this.prisma.organisationTemplate.findMany({
      where: { orgId: id },
      include: { template: { include: { templateCategory: true } } },
    });
    const landingPageCounts = await this.prisma.landingPage.groupBy({
      by: ['sourceTemplateId'],
      where: { orgId: id, sourceTemplateId: { in: rows.map((r) => r.templateId) } },
      _count: { _all: true },
    });
    const countsByTemplate = new Map(
      landingPageCounts.map((row) => [row.sourceTemplateId, row._count._all]),
    );
    return rows.map((r) => ({
      templateId: r.templateId,
      assignedAt: r.assignedAt,
      landingPageCount: countsByTemplate.get(r.templateId) ?? 0,
      template: {
        id: r.template.id,
        name: r.template.name,
        slug: r.template.slug,
        thumbnail: r.template.thumbnail,
        tier: r.template.tier,
        category: (r.template as any).templateCategory?.name ?? null,
      },
    }));
  }

  async setOrgTemplates(id: string, actor: JwtPayload, templateIds: string[]) {
    await this.getRealOrganisation(id);
    const currentAssignments = await this.prisma.organisationTemplate.findMany({
      where: { orgId: id },
      select: { templateId: true },
    });
    const currentIds = new Set(currentAssignments.map((row) => row.templateId));
    const nextIds = new Set(templateIds);
    const removedIds = [...currentIds].filter((templateId) => !nextIds.has(templateId));
    if (removedIds.length > 0) {
      const landingPageCount = await this.prisma.landingPage.count({
        where: { orgId: id, sourceTemplateId: { in: removedIds } },
      });
      if (landingPageCount > 0) {
        throw new BadRequestException(
          `Can't remove this template — ${landingPageCount} landing page${landingPageCount === 1 ? '' : 's'} in this organisation ${landingPageCount === 1 ? 'was' : 'were'} built from it. Delete ${landingPageCount === 1 ? 'that page' : 'those pages'} first if you want to remove the template.`,
        );
      }
    }
    // validate plan limits if subscription exists
    const sub = await this.prisma.subscription.findFirst({
      where: { orgId: id, status: { not: 'cancelled' } },
      include: { plan: true },
    });
    if (sub) {
      assertTemplateQuota(sub.plan, templateIds.length);
    }
    if (templateIds.length > 0) {
      await assertEligibleTemplateIds(this.prisma, templateIds);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.organisationTemplate.deleteMany({ where: { orgId: id } });
      if (templateIds.length > 0) {
        await tx.organisationTemplate.createMany({
          data: templateIds.map((tid) => ({ orgId: id, templateId: tid, assignedBy: actor.sub })),
        });
      }
      await tx.auditLog.create({
        data: { orgId: id, actorId: actor.sub, action: 'org_templates_updated', entity: 'Organisation', entityId: id, metadata: { templateIds } as any },
      });
    });
    return this.getOrgTemplates(id);
  }

  async remove(id: string, actor: JwtPayload) {
    // Deliberately NOT getRealOrganisation here — deletion is exactly the
    // one action that should work on a 'draft' org too (an abandoned
    // self-serve signup, or a Super-Admin-precreated placeholder never
    // assigned an admin). Every other admin action keeps treating drafts
    // as not-found.
    const organisation = await this.prisma.organisation.findUnique({ where: { id } });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // users.orgId only SET NULLs on delete by default — deleting the org
    // alone would leave its accounts orphaned but still able to log in.
    // Removing the users first cascades their roles/tokens/team membership,
    // then the org delete cascades its teams and template assignments.
    await this.prisma.$transaction(async (tx) => {
      await tx.user.deleteMany({ where: { orgId: organisation.id } });
      await tx.organisation.delete({ where: { id: organisation.id } });
      await tx.auditLog.create({
        data: {
          orgId: null,
          actorId: actor.sub,
          action: 'org_deleted',
          entity: 'Organisation',
          entityId: organisation.id,
          metadata: { name: organisation.name, slug: organisation.slug },
        },
      });
    });

    return { success: true };
  }

  async getOrgDomains(id: string) {
    const org = await this.getRealOrganisation(id);

    const [requests, landingPages] = await Promise.all([
      this.prisma.orgDomainRequest.findMany({
        where: { orgId: id },
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.landingPage.findMany({
        where: { orgId: id },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          sourceTemplate: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      customDomain: org.customDomain,
      customDomainStatus: org.customDomainStatus,
      customDomainLandingPageId: org.customDomainLandingPageId,
      orgDomainRequests: requests.filter((r) => r.kind === 'custom_domain'),
      landingPages,
    };
  }

  async assignSubdomain(_id: string, _actor: JwtPayload, _requested?: string) {
    return {
      subdomain: '',
      subdomainHost: '',
      subdomainStatus: 'none',
      message: 'Subdomains have been disabled.',
    };
  }

  private async getDraftOrganisation(orgId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    if (organisation.status !== 'draft') {
      throw new BadRequestException('Organisation is not in draft status');
    }
    return organisation;
  }

  // Drafts are incomplete onboarding attempts, not real customers — treated
  // as not-found everywhere outside the onboarding wizard itself.
  private async getRealOrganisation(id: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id },
    });
    if (!organisation || organisation.status === 'draft') {
      throw new NotFoundException('Organisation not found');
    }
    return organisation;
  }
}
