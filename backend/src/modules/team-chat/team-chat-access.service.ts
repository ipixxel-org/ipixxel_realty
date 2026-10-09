import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TeamChannel, TeamChannelMember } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { hasOrgPermission } from '../../common/guards/permission.guard';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { dmPeerId } from './team-chat.shared';

export interface Membership {
  channel: TeamChannel;
  member: TeamChannelMember;
}

/**
 * The single gate for every Team Chat read and write. A conversation is only
 * reachable through the caller's own TeamChannelMember row, scoped by orgId:
 * a non-member — including an org admin, and including someone who knows a
 * DM's id — gets the same 404 as an id that doesn't exist, so neither a DM's
 * existence nor another org's channels leak (S1).
 */
@Injectable()
export class TeamChatAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async membership(
    orgId: string,
    userId: string,
    conversationId: string,
  ): Promise<Membership> {
    const member = await this.prisma.teamChannelMember.findFirst({
      where: { channelId: conversationId, userId, orgId, channel: { orgId } },
      include: { channel: true },
    });
    if (!member) throw new NotFoundException('Conversation not found');
    const { channel, ...row } = member;
    return { channel, member: row };
  }

  /** Membership of a group channel (not General, not a DM). */
  async channelMembership(orgId: string, userId: string, channelId: string) {
    const m = await this.membership(orgId, userId, channelId);
    if (m.channel.kind !== 'channel') {
      throw new BadRequestException(
        m.channel.kind === 'general'
          ? 'General is managed automatically'
          : 'Not available for direct messages',
      );
    }
    return m;
  }

  /**
   * A DM stops accepting new writes once the other participant is disabled
   * or deleted — it stays readable. Channels are always writable for their
   * members.
   */
  async assertWritable(channel: TeamChannel, viewerId: string) {
    if (channel.kind !== 'dm') return;
    if (!(await this.isDmPeerActive(channel, viewerId))) {
      throw new ForbiddenException(
        'This conversation is read-only — the other person is no longer active.',
      );
    }
  }

  async isDmPeerActive(
    channel: TeamChannel,
    viewerId: string,
  ): Promise<boolean> {
    const peerId = dmPeerId(channel.dmKey, viewerId);
    if (!peerId) return false;
    const peer = await this.prisma.user.findFirst({
      where: { id: peerId, orgId: channel.orgId, status: { not: 'disabled' } },
      select: { id: true },
    });
    return !!peer;
  }

  /** Rename / add / remove members: channel admin, or team_chat:edit. */
  async canManageChannel(actor: JwtPayload, m: Membership): Promise<boolean> {
    if (m.channel.kind !== 'channel') return false;
    if (m.member.role === 'admin') return true;
    return hasOrgPermission(this.prisma, actor, 'team_chat', 'edit', true);
  }

  async assertCanManageChannel(actor: JwtPayload, m: Membership) {
    if (!(await this.canManageChannel(actor, m))) {
      throw new ForbiddenException(
        'Only channel admins or users with Team Chat > Manage can do this',
      );
    }
  }

  /** The org-wide `admin` role (the only role that may rename General). */
  async isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId, user: { orgId }, role: { key: 'admin' } },
    });
    return count > 0;
  }

  /** Active (non-disabled) users of this org among `ids`; throws if any
   *  id isn't one — never silently drops a requested member. */
  async assertActiveOrgUsers(orgId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, orgId, status: { not: 'disabled' } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (users.length !== new Set(ids).size) {
      throw new BadRequestException(
        'Every member must be an active user of your organisation',
      );
    }
    return users;
  }
}
