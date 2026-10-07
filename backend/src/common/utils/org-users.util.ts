import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import {
  generateTempPassword,
} from './tokens.util';
import { toSafeUser } from './mappers.util';
import { isSamePhoneNumber, normalizePhoneNumber } from './phone.util';
import { assertLimit, countBillableOrgUsers } from './plan-quota.util';
import {
  runTeamChatHook,
  teamChatUserActivated,
  teamChatUserDeactivated,
} from './team-chat-membership.util';

import { EmailService } from '../../modules/email/email.service';

const BCRYPT_COST_FACTOR = 12;
export const ASSIGNABLE_ROLES = [
  'admin',
  'manager',
  'sales',
  'telecaller',
] as const;
export type AssignableRole = string;

// Only an Organisation Admin may hand out the Admin role — otherwise any
// member with Users > Add/Edit could promote someone (or a new account they
// control) to full, unrestricted access.
export function assertCanAssignRole(
  actor: { roles?: string[] },
  roleKey: string | undefined,
) {
  if (roleKey === 'admin' && !actor.roles?.includes('admin')) {
    throw new ForbiddenException(
      'Only an organisation admin can assign the Admin role',
    );
  }
}

export const ORG_USER_STATUS_VALUES = [
  'active',
  'disabled',
  'pending',
] as const;
export type OrgUserStatus = (typeof ORG_USER_STATUS_VALUES)[number];

type OrgUsersPrisma = Pick<
  PrismaService,
  | 'user'
  | 'role'
  | 'userRole'
  | 'subscription'
  | 'refreshToken'
  | 'passwordResetToken'
  | '$transaction'
  // Team Chat lifecycle hooks (General channel membership).
  | 'teamChannel'
  | 'teamChannelMember'
  | 'teamMessage'
> & {
  organisation?: { findUnique: (...args: any[]) => Promise<any> };
  emailConfig?: { findFirst: (...args: any[]) => Promise<any> };
  emailLog?: { create: (...args: any[]) => Promise<any> };
};

export interface ProvisionUserInput {
  firstName?: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  role: string;
  password?: string;
}

async function sendInviteEmailNotification(
  prisma: OrgUsersPrisma,
  orgId: string,
  user: { email: string; firstName?: string | null; lastName?: string | null },
  tempPassword?: string,
  roleName?: string,
) {
  try {
    let orgName = 'iPixxel Realty';
    if (prisma.organisation) {
      const org = await prisma.organisation.findUnique({
        where: { id: orgId },
        select: { name: true },
      });
      if (org?.name) orgName = org.name;
    }

    const emailService = new EmailService(prisma as unknown as PrismaService);
    const recipientName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ');

    await emailService.sendInviteEmail({
      to: user.email,
      recipientName: recipientName || undefined,
      orgName,
      orgId,
      role: roleName || 'Team Member',
      tempPassword,
    });
  } catch (err: any) {
    console.error(`[Invite Email] Error delivering invite to ${user.email}: ${err.message}`);
  }
}

async function sendUserAccountStatusNotification(
  prisma: OrgUsersPrisma,
  orgId: string,
  user: { email: string; firstName?: string | null; lastName?: string | null },
  status: 'activated' | 'deactivated',
) {
  try {
    const emailService = new EmailService(prisma as unknown as PrismaService);
    const recipientName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ');
    await emailService.sendUserAccountStatusEmail({
      to: user.email,
      recipientName: recipientName || undefined,
      status,
      orgId,
    });
  } catch (err: any) {
    console.error(
      `[User Account ${status}] Error delivering notification to ${user.email}: ${err.message}`,
    );
  }
}

// Shared invite mechanism — used by POST /team/invite, Org Admin and Super
// Admin user creation, and resend-invite, so password/email handling only
// lives in one place.
export async function provisionInvitedUser(
  prisma: OrgUsersPrisma,
  orgId: string,
  dto: ProvisionUserInput,
) {
  // Stored lowercase and checked case-insensitively: login matches email
  // case-insensitively, so "Foo@x.com" and "foo@x.com" must never be two users.
  const email = dto.email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictException(
      'This email is already assigned to another user.',
    );
  }

  const phoneNumber = dto.phoneNumber
    ? normalizePhoneNumber(dto.phoneNumber)
    : undefined;
  if (phoneNumber) {
    const existingByPhone = await prisma.user.findFirst({
      where: { phoneNumber },
    });
    if (existingByPhone) {
      throw new ConflictException(
        'This mobile number is already assigned to another user.',
      );
    }
  }

  const role = await prisma.role.findFirst({
    where: {
      key: dto.role,
      status: 'active',
      OR: [{ orgId: null }, { orgId }],
    },
  });
  if (!role) {
    throw new NotFoundException(`Role '${dto.role}' not found or inactive`);
  }

  // Plan user quota — the single point every "add an org user" path funnels
  // through (POST /org/users, POST /team/invite, the onboarding invite step,
  // and Super Admin POST /admin/organisations/:id/users). Enforced only when
  // the org has a subscription. The founding admin is created elsewhere, at
  // org creation, before any subscription — it is not gated here and does
  // not consume a seat; active + pending non-admin users consume seats.
  const subscription = await prisma.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
    include: { plan: true },
  });
  if (subscription) {
    const currentCount = await countBillableOrgUsers(prisma, orgId);
    assertLimit(subscription.plan, 'users', currentCount, 1);
  }

  const rawPassword = dto.password || generateTempPassword();
  const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_COST_FACTOR);
  // Organisation Admin-created users must choose their own password at first login,
  // regardless of whether the admin supplied an initial password.
  const mustChangePassword = true;

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        orgId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email,
        phoneNumber,
        passwordHash,
        // No separate approval step: approved on creation and can sign in
        // straight away, but must complete the forced change-password flow
        // before flipping to `active` (see AuthService.changePassword).
        status: 'pending',
        approvedAt: new Date(),
        mustChangePassword,
        onboardingStep: 'completed',
      },
    });

    await tx.userRole.create({
      data: { userId: created.id, roleId: role.id },
    });

    return created;
  });

  // Invited members are org members straight away (status `pending` until
  // they set their own password) — there is no separate "accept" step.
  await runTeamChatHook('user provisioned', () =>
    teamChatUserActivated(prisma, orgId, user.id),
  );

  sendInviteEmailNotification(
    prisma,
    orgId,
    { email: user.email, firstName: user.firstName, lastName: user.lastName },
    rawPassword,
    role.name,
  );
  return toSafeUser(user);
}

// Re-issues a temp password for a user who hasn't completed setup yet
// (mustChangePassword is the only signal the schema currently offers — there
// is no lastLoginAt field to check against).
export async function reissueInvite(
  prisma: OrgUsersPrisma,
  userId: string,
  orgId: string,
) {
  const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST_FACTOR);

  // Issuing a fresh temp password invalidates any earlier one (the hash is
  // overwritten) and must also end any live sessions: revoke refresh tokens
  // and stamp tokenInvalidBefore so a still-valid access token is rejected on
  // its next request (OrgApprovedGuard).
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        tokenInvalidBefore: now,
      },
    });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result;
  });

  sendInviteEmailNotification(
    prisma,
    orgId,
    { email: updated.email, firstName: updated.firstName, lastName: updated.lastName },
    tempPassword,
  );
  return toSafeUser(updated);
}

// "Resend Mail" for any Organisation Admin-created member. Never reads or
// re-sends the stored password (only its hash is kept) — instead picks the
// safest existing mechanism for the member's current state:
//
//   - not yet onboarded (mustChangePassword, or status !== 'active')
//       -> reissueInvite(): brand-new temp password, old one invalidated,
//          live sessions killed, credentials email re-sent.
//   - fully onboarded active member -> rejected; password reset remains
//     available through the self-serve forgot-password flow.
export async function resendCredentials(
  prisma: OrgUsersPrisma,
  orgId: string,
  id: string,
) {
  const user = await prisma.user.findFirst({ where: { id, orgId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  if (user.mustChangePassword || user.status !== 'active') {
    return reissueInvite(prisma, id, orgId);
  }

  throw new ConflictException(
    'Resend Mail is only available until the user completes onboarding.',
  );
}

// Org Admin approves a pending member. Idempotent. Sets `approvedAt` so the
// member may authenticate; they still land in the forced change-password flow
// until they set their own password (which flips them to `active`, see
// AuthService.changePassword). Re-approving a previously disapproved
// (`disabled`) member restores access.
export async function approveOrgUser(
  prisma: OrgUsersPrisma,
  orgId: string,
  id: string,
) {
  const user = await prisma.user.findFirst({ where: { id, orgId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  if (user.status === 'active' && user.approvedAt) {
    // Nothing to do — already a fully active member.
    return toSafeUser(user);
  }

  const nextStatus: OrgUserStatus = user.mustChangePassword
    ? 'pending'
    : 'active';

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: nextStatus,
      approvedAt: user.approvedAt ?? new Date(),
    },
  });

  if (user.status !== nextStatus || !user.approvedAt) {
    sendUserAccountStatusNotification(prisma, orgId, updated, 'activated');
  }
  // Re-approving a disabled member brings them back into General.
  await runTeamChatHook('user approved', () =>
    teamChatUserActivated(prisma, orgId, id),
  );

  return toSafeUser(updated);
}

// Org Admin disapproves / deactivates a member. Mirrors the Super Admin ->
// deactivate-Organisation security model: flip status, revoke refresh tokens,
// and stamp tokenInvalidBefore so any already-issued access token is rejected
// on its next authenticated request (OrgApprovedGuard -> USER_INACTIVE ->
// frontend force-logout). Re-uses setOrgUserStatus for the shared guards
// (blocks disabling `admin`-role members).
export async function disapproveOrgUser(
  prisma: OrgUsersPrisma,
  orgId: string,
  id: string,
) {
  return setOrgUserStatus(prisma, orgId, id, 'disabled', true);
}

// Org Admin permanently deletes a member. Refuses org-wide `admin`-role
// members (same protection as deactivate). Dependent rows are handled by the
// schema's FK actions: userRoles / sessions / call logs / activity / per-user
// permissions cascade, while assigned leads and managed projects are detached
// (ON DELETE SET NULL) so their history survives.
export async function deleteOrgUser(
  prisma: OrgUsersPrisma,
  orgId: string,
  id: string,
) {
  const user = await prisma.user.findFirst({
    where: { id, orgId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) {
    throw new NotFoundException('User not found');
  }
  if (user.userRoles.some(({ role }) => role.key === 'admin')) {
    throw new ForbiddenException('Organisation admins cannot be deleted.');
  }

  // Before the delete, while the name still exists for "<Name> left".
  await runTeamChatHook('user deleted', () =>
    teamChatUserDeactivated(prisma, orgId, id),
  );
  await prisma.user.delete({ where: { id } });
  return { success: true };
}

export interface OrgUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: AssignableRole;
  status?: OrgUserStatus;
}

// Shared by GET /org/users (Org Admin, self-scoped) and
// GET /admin/organisations/:id/users (Super Admin, any org).
export async function listOrgUsers(
  prisma: OrgUsersPrisma,
  orgId: string,
  query: OrgUsersQuery,
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const where: Prisma.UserWhereInput = { orgId };
  if (query.status) {
    where.status = query.status;
  }
  if (query.role) {
    where.userRoles = { some: { role: { key: query.role } } };
  }
  if (query.search) {
    const search = query.search;
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        userRoles: { include: { role: true } },
        teamMembers: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.userRoles[0]
        ? { key: user.userRoles[0].role.key, name: user.userRoles[0].role.name }
        : null,
      status: user.status,
      approvedAt: user.approvedAt,
      createdAt: user.createdAt,
      mustChangePassword: user.mustChangePassword,
      // Teams have no creation/membership UI yet, so this is always false in
      // practice today — computed for real (not hardcoded) so it needs no
      // reshaping once team membership ships.
      hasTeam: user.teamMembers.length > 0,
    })),
    total,
    page,
    limit,
  };
}

export async function getOrgUserById(
  prisma: OrgUsersPrisma,
  orgId: string,
  id: string,
) {
  const user = await prisma.user.findFirst({
    where: { id, orgId },
    include: {
      userRoles: { include: { role: true } },
      teamMembers: true,
    },
  });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  return {
    ...toSafeUser(user),
    role: user.userRoles[0]
      ? { key: user.userRoles[0].role.key, name: user.userRoles[0].role.name }
      : null,
    hasTeam: user.teamMembers.length > 0,
  };
}

export interface UpdateOrgUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  role?: string;
  password?: string;
}

export async function updateOrgUser(
  prisma: OrgUsersPrisma,
  orgId: string,
  id: string,
  dto: UpdateOrgUserInput,
) {
  const existing = await prisma.user.findFirst({
    where: { id, orgId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!existing) {
    throw new NotFoundException('User not found');
  }
  if (existing.userRoles.some(({ role }) => role.key === 'admin')) {
    throw new ForbiddenException('Organisation admins cannot be edited.');
  }

  // Same case-insensitive rule as provisionInvitedUser.
  const email = dto.email ? dto.email.trim().toLowerCase() : undefined;
  if (email && email !== existing.email.toLowerCase()) {
    const emailTaken = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        id: { not: id },
      },
      select: { id: true },
    });
    if (emailTaken) {
      throw new ConflictException(
        'This email is already assigned to another user.',
      );
    }
  }

  // The user's own number re-submitted (even in another format) is not a
  // change: skip the duplicate check and leave the stored value as it is.
  const phoneNumber =
    dto.phoneNumber === undefined ||
    isSamePhoneNumber(existing.phoneNumber, dto.phoneNumber)
      ? undefined
      : normalizePhoneNumber(dto.phoneNumber);
  if (phoneNumber && phoneNumber !== existing.phoneNumber) {
    const phoneTaken = await prisma.user.findFirst({
      where: { phoneNumber, id: { not: id } },
    });
    if (phoneTaken) {
      throw new ConflictException(
        'This mobile number is already assigned to another user.',
      );
    }
  }

  const passwordChanged = Boolean(dto.password);

  await prisma.$transaction(async (tx) => {
    const dataToUpdate: Prisma.UserUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      phoneNumber,
    };

    if (dto.password) {
      dataToUpdate.passwordHash = await bcrypt.hash(
        dto.password,
        BCRYPT_COST_FACTOR,
      );
      dataToUpdate.mustChangePassword = true;
      // An admin-set password must end existing sessions immediately: revoke
      // refresh tokens and stamp tokenInvalidBefore (mirrors resetPassword).
      dataToUpdate.tokenInvalidBefore = new Date();
    }

    await tx.user.update({
      where: { id },
      data: dataToUpdate,
    });

    if (dto.password) {
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    if (dto.role) {
      const role = await tx.role.findFirst({
        where: {
          key: dto.role,
          status: 'active',
          OR: [{ orgId: null }, { orgId }],
        },
      });
      if (!role) {
        throw new NotFoundException(`Role '${dto.role}' not found or inactive`);
      }
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.create({ data: { userId: id, roleId: role.id } });
    }
  });

  const result = await getOrgUserById(prisma, orgId, id);

  // Notify the user their password was changed by an admin — same secure
  // channel as a fresh invite (temp password + "set a permanent password on
  // first sign-in"). Never emails the stored hash; only the value the admin
  // just typed. Fire-and-forget, failures are logged not thrown.
  if (passwordChanged && dto.password) {
    sendInviteEmailNotification(
      prisma,
      orgId,
      {
        email: result.email,
        firstName: result.first_name,
        lastName: result.last_name,
      },
      dto.password,
      result.role?.name,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// My profile (Settings > My profile) — a member viewing / editing their OWN
// account. Only first name, last name, mobile number and password can change;
// email, country and role are read-only here. Unlike an admin resetting a
// member's password (updateOrgUser), changing your own password is not a
// temporary one: no forced change-password screen, and the session stays.
// ---------------------------------------------------------------------------

export interface UpdateOwnProfileInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  password?: string;
}

export async function getOwnProfile(
  prisma: OrgUsersPrisma,
  orgId: string,
  userId: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, orgId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      country: true,
      userRoles: { select: { role: { select: { key: true, name: true } } } },
    },
  });
  if (!user) {
    throw new NotFoundException('User not found');
  }
  const role = user.userRoles[0]?.role ?? null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    country: user.country,
    role: role ? { key: role.key, name: role.name } : null,
  };
}

export async function updateOwnProfile(
  prisma: OrgUsersPrisma,
  orgId: string,
  userId: string,
  dto: UpdateOwnProfileInput,
) {
  const existing = await prisma.user.findFirst({
    where: { id: userId, orgId },
    select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
  });
  if (!existing) {
    throw new NotFoundException('User not found');
  }

  // Same rule as updateOrgUser: the user's own number re-submitted (even in
  // another format) is not a change; a new number must not belong to anyone.
  const phoneNumber =
    dto.phoneNumber === undefined ||
    isSamePhoneNumber(existing.phoneNumber, dto.phoneNumber)
      ? undefined
      : normalizePhoneNumber(dto.phoneNumber);
  if (phoneNumber && phoneNumber !== existing.phoneNumber) {
    const phoneTaken = await prisma.user.findFirst({
      where: { phoneNumber, id: { not: userId } },
    });
    if (phoneTaken) {
      throw new ConflictException(
        'This mobile number is already assigned to another user.',
      );
    }
  }

  const password = dto.password?.trim() ? dto.password : undefined;
  await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: dto.firstName?.trim() || undefined,
      lastName: dto.lastName?.trim() || undefined,
      phoneNumber,
      ...(password
        ? { passwordHash: await bcrypt.hash(password, BCRYPT_COST_FACTOR) }
        : {}),
    },
  });

  const profile = await getOwnProfile(prisma, orgId, userId);

  // Email the new credentials so the member can sign in manually as well as
  // with Google. Fire-and-forget; a delivery failure never fails the save.
  if (password) {
    const recipientName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    new EmailService(prisma as unknown as PrismaService)
      .sendPasswordChangedEmail({
        to: profile.email,
        recipientName: recipientName || undefined,
        newPassword: password,
        orgId,
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Password Changed Email] Error delivering to ${profile.email}: ${message}`);
      });
  }

  return profile;
}

// Shared by the Org Admin's own PATCH /org/users/:id/status (which also
// forbids self-deactivation) and the Super Admin's equivalent endpoint.
export async function setOrgUserStatus(
  prisma: OrgUsersPrisma,
  orgId: string,
  id: string,
  status: OrgUserStatus,
  notifyUser = false,
) {
  const user = await prisma.user.findFirst({
    where: { id, orgId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) {
    throw new NotFoundException('User not found');
  }
  if (
    status === 'disabled' &&
    user.userRoles.some(({ role }) => role.key === 'admin')
  ) {
    throw new ConflictException('Admin users cannot be deactivated.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const result = await tx.user.update({
      where: { id },
      // Disabling must also invalidate already-issued access tokens: stamp
      // tokenInvalidBefore so OrgApprovedGuard rejects them on the next
      // request (USER_INACTIVE -> frontend force-logout).
      data:
        status === 'disabled'
          ? { status, tokenInvalidBefore: now }
          : { status },
    });
    if (status === 'disabled') {
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    return result;
  });

  if (status === 'disabled') {
    await runTeamChatHook('user disabled', () =>
      teamChatUserDeactivated(prisma, orgId, id),
    );
  } else {
    await runTeamChatHook('user enabled', () =>
      teamChatUserActivated(prisma, orgId, id),
    );
  }

  if (notifyUser && user.status !== status && (status === 'disabled' || status === 'active')) {
    sendUserAccountStatusNotification(
      prisma,
      orgId,
      updated,
      status === 'active' ? 'activated' : 'deactivated',
    );
  }

  return toSafeUser(updated);
}
