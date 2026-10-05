import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../email/email.service';
import { frontendBaseUrl } from '../../common/utils/app-url.util';
import { generateTempPassword } from '../../common/utils/tokens.util';
import {
  isSamePhoneNumber,
  normalizePhoneNumber,
} from '../../common/utils/phone.util';
import { CreatePlatformMemberDto } from './dto/create-platform-member.dto';
import { UpdatePlatformMemberDto } from './dto/update-platform-member.dto';
import { ListPlatformMembersQueryDto } from './dto/list-platform-members-query.dto';

const BCRYPT_COST = 12;

@Injectable()
export class AdminPlatformTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async listAssignableRoles() {
    return this.prisma.role.findMany({
      where: { orgId: null, scope: 'platform', status: 'active' },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, name: true, description: true, scope: true },
    });
  }

  /**
   * Without `page`: the full member array (legacy shape — Support's assignee
   * picker uses it). With `page`: `{ data, total, page, limit }`, searched and
   * paginated in the database.
   */
  async list(query: ListPlatformMembersQueryDto = {}) {
    const where: Prisma.UserWhereInput = {
      orgId: null,
      userRoles: { some: { role: { scope: 'platform' } } },
    };

    const search = query.search?.trim();
    if (search) {
      const contains = { contains: search, mode: 'insensitive' as const };
      const or: Prisma.UserWhereInput[] = [
        { firstName: contains },
        { lastName: contains },
        { email: contains },
        {
          userRoles: { some: { role: { scope: 'platform', name: contains } } },
        },
      ];
      // "shubham dev" → first name + last name.
      const [first, ...rest] = search.split(/\s+/);
      if (rest.length > 0) {
        or.push({
          firstName: { contains: first, mode: 'insensitive' },
          lastName: { contains: rest.join(' '), mode: 'insensitive' },
        });
      }
      where.AND = [{ OR: or }];
    }

    const include = {
      userRoles: {
        include: { role: { select: { key: true, name: true, scope: true } } },
      },
    } satisfies Prisma.UserInclude;
    // `id` tiebreak keeps page boundaries stable for equal timestamps.
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      { createdAt: 'asc' },
      { id: 'asc' },
    ];

    if (query.page === undefined) {
      const users = await this.prisma.user.findMany({
        where,
        orderBy,
        include,
      });
      return users.map((user) => this.toMember(user));
    }

    const limit = query.limit ?? 10;
    const page = query.page;
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        include,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: users.map((user) => this.toMember(user)),
      total,
      page,
      limit,
    };
  }

  /** One platform team member, for the edit page. 404s for org users. */
  async get(id: string) {
    await this.requireMember(id);
    return this.getById(id);
  }

  async create(dto: CreatePlatformMemberDto, actorUserId?: string) {
    // Members are created by a Super Admin and get one of the custom platform
    // roles — the console never mints another Super Admin (the UI hides it too).
    if (dto.role === 'super_admin') {
      throw new BadRequestException(
        'Super Admin accounts cannot be created from Platform Team. Choose another platform role.',
      );
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('This email is already assigned to another user.');
    }

    const phoneNumber = dto.phoneNumber
      ? normalizePhoneNumber(dto.phoneNumber)
      : undefined;
    if (phoneNumber) {
      const existingByPhone = await this.prisma.user.findFirst({
        where: { phoneNumber },
      });
      if (existingByPhone) {
        throw new ConflictException(
          'This mobile number is already assigned to another user.',
        );
      }
    }

    const roleIds = await this.resolvePlatformRoleIds(dto.role);
    const rawPassword = dto.password || generateTempPassword();
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_COST);
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          orgId: null,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          phoneNumber,
          passwordHash,
          status: 'active',
          approvedAt: now,
          emailVerifiedAt: now,
          // Credentials go out by email — the member must set their own
          // password on first login before the console is reachable (enforced
          // server-side in SuperAdminGuard, mirrors the Org Admin-created
          // user flow in provisionInvitedUser). Cleared by
          // AuthService.changePassword once they choose a new password.
          mustChangePassword: true,
          onboardingStep: 'completed',
        },
      });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: created.id, roleId })),
      });
      await tx.auditLog.create({
        data: {
          orgId: null,
          actorId: actorUserId ?? null,
          moduleKey: 'admin_platform_team',
          action: 'platform_member_created',
          entity: 'PlatformTeamMember',
          entityId: created.id,
          metadata: {
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            email,
            role: dto.role,
          } as any,
        },
      });
      return created;
    });

    const role = await this.prisma.role.findFirst({
      where: { orgId: null, key: dto.role },
    });

    await this.email
      .sendInviteEmail({
        to: user.email,
        recipientName: `${dto.firstName} ${dto.lastName}`.trim(),
        orgName: 'iPixxel Realty',
        role: role?.name ?? 'Super Admin',
        tempPassword: rawPassword,
        loginUrl: `${frontendBaseUrl()}/admin-login`,
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Platform Team] Invite email failed for ${user.email}: ${message}`);
      });

    return this.getById(user.id);
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdatePlatformMemberDto,
    actorRoles: string[] = [],
  ) {
    const member = await this.requireMember(id);

    // A Super Admin account (profile fields or status) can only be touched by
    // another Super Admin — never by a lesser platform team member, even one
    // holding the `edit` permission on this module. Checked here rather than
    // only in the UI so a direct API call can't bypass it.
    if (await this.hasRole(id, 'super_admin')) {
      if (!actorRoles.includes('super_admin')) {
        throw new ForbiddenException('Only a Super Admin can edit a Super Admin account');
      }
    }

    if (dto.status === 'disabled' && id === actorUserId) {
      throw new ForbiddenException('You cannot disable your own account');
    }
    if (dto.status === 'disabled') {
      await this.assertNotLastSuperAdmin(id);
    }

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException('This email is already assigned to another user.');
      }
    }

    // The member's own number re-submitted (even in another format) is not a
    // change: skip the duplicate check and leave the stored value as it is.
    const phoneChanged =
      dto.phoneNumber !== undefined &&
      !isSamePhoneNumber(member.phoneNumber, dto.phoneNumber);
    let phoneNumber: string | undefined;
    if (phoneChanged && dto.phoneNumber !== undefined) {
      phoneNumber = dto.phoneNumber
        ? normalizePhoneNumber(dto.phoneNumber)
        : undefined;
      if (phoneNumber) {
        const clash = await this.prisma.user.findFirst({
          where: { phoneNumber, NOT: { id } },
        });
        if (clash) {
          throw new ConflictException(
            'This mobile number is already assigned to another user.',
          );
        }
      }
    }

    let passwordHash: string | undefined;
    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    }

    // Disabling a member must also end any live session immediately: stamp
    // tokenInvalidBefore so a still-valid access token is rejected on its next
    // request (SuperAdminGuard -> USER_INACTIVE -> frontend force-logout) and
    // revoke refresh tokens so it cannot be silently renewed. Re-enabling
    // deliberately does NOT clear the stamp — a disabled member's old session
    // stays dead and they must sign in again. Mirrors setOrgUserStatus.
    const disabling = dto.status === 'disabled';
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
          ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(phoneChanged ? { phoneNumber: phoneNumber ?? null } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          // An admin-set password is temporary, exactly like the one sent at
          // creation: the member must choose their own at next login
          // (enforced in SuperAdminGuard; cleared by AuthService.changePassword).
          // Mirrors updateOrgUser for org users.
          ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
          ...(passwordHash || disabling ? { tokenInvalidBefore: now } : {}),
        },
      });

      if (passwordHash || disabling) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      if (dto.role) {
        const roleIds = await this.resolvePlatformRoleIds(dto.role);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }
    });

    // Notify the member when a Super Admin flips their access on or off —
    // reuses the existing account activated / deactivated email templates
    // (platform-level config, resolved with orgId null). Fire-and-forget:
    // a delivery failure must not fail the status change.
    if (dto.status && dto.status !== member.status) {
      const recipientName =
        [member.firstName, member.lastName].filter(Boolean).join(' ') || undefined;
      void this.email
        .sendUserAccountStatusEmail({
          to: member.email,
          recipientName,
          status: dto.status === 'active' ? 'activated' : 'deactivated',
          orgId: null,
          loginUrl: `${frontendBaseUrl()}/admin-login`,
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[Platform Team] Account ${dto.status} email failed for ${member.email}: ${message}`,
          );
        });
    }

    const updated = await this.getById(id);

    // Email the new temporary password to the member — same template and
    // channel as the creation invite (and as the org Users edit flow). Sent to
    // the saved (possibly just-changed) address, only ever with the value the
    // admin typed. Fire-and-forget: a delivery failure must not fail the save.
    if (dto.password) {
      const recipientName =
        [updated.firstName, updated.lastName].filter(Boolean).join(' ') || updated.email;
      void this.email
        .sendInviteEmail({
          to: updated.email,
          recipientName,
          orgName: 'iPixxel Realty',
          role: updated.role?.name ?? 'Platform Team',
          tempPassword: dto.password,
          loginUrl: `${frontendBaseUrl()}/admin-login`,
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[Platform Team] Password-change email failed for ${updated.email}: ${message}`,
          );
        });
    }

    return updated;
  }

  async remove(id: string, actorUserId: string) {
    if (id === actorUserId) {
      throw new ForbiddenException('You cannot remove your own account');
    }
    await this.requireMember(id);
    // Super Admin accounts can never be deleted from the console, by anyone —
    // there is no "last one" carve-out here (that check still applies to
    // disabling, below). This mirrors the UI, which never renders a Delete
    // button for a Super Admin row.
    if (await this.hasRole(id, 'super_admin')) {
      throw new ForbiddenException('Super Admin accounts cannot be deleted');
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  private async getById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, orgId: null },
      include: {
        userRoles: {
          include: { role: { select: { key: true, name: true, scope: true } } },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Platform team member not found');
    }
    return this.toMember(user);
  }

  private async requireMember(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        orgId: null,
        userRoles: { some: { role: { scope: 'platform' } } },
      },
    });
    if (!user) {
      throw new NotFoundException('Platform team member not found');
    }
    return user;
  }

  private async resolvePlatformRoleIds(roleKey: string): Promise<string[]> {
    const selected = await this.prisma.role.findFirst({
      where: { orgId: null, key: roleKey, scope: 'platform', status: 'active' },
    });
    if (!selected) {
      throw new BadRequestException(
        `Role '${roleKey}' is not an assignable Super Admin / platform role`,
      );
    }

    const ids = [selected.id];
    return ids;
  }

  private async hasRole(userId: string, roleKey: string): Promise<boolean> {
    const row = await this.prisma.userRole.findFirst({
      where: { userId, role: { key: roleKey } },
    });
    return !!row;
  }

  private async assertNotLastSuperAdmin(userId: string) {
    if (!(await this.hasRole(userId, 'super_admin'))) return;

    const remaining = await this.prisma.user.count({
      where: {
        orgId: null,
        status: { not: 'disabled' },
        id: { not: userId },
        userRoles: { some: { role: { key: 'super_admin' } } },
      },
    });
    if (remaining < 1) {
      throw new BadRequestException(
        'Cannot remove or disable the last Super Admin on the platform team',
      );
    }
  }

  private toMember(user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string | null;
    status: string;
    createdAt: Date;
    userRoles: {
      role: { key: string; name: string; scope: string };
    }[];
  }) {
    const roles = user.userRoles
      .map((ur) => ur.role)
      .filter((r) => r.scope === 'platform');
    const assigned =
      roles.find((r) => r.key !== 'super_admin') ??
      roles.find((r) => r.key === 'super_admin') ??
      roles[0] ??
      null;

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      status: user.status,
      createdAt: user.createdAt,
      role: assigned,
      roles,
    };
  }
}
