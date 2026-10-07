import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type TeamChannel,
  type TeamChannelMember,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  chatDisplayName,
  isUniqueViolation,
  postSystemMessage,
  promoteAdminIfOrphaned,
  teamChatUserActivated,
} from '../../common/utils/team-chat-membership.util';
import { TeamChatAccessService } from './team-chat-access.service';
import {
  AddMembersDto,
  CreateChannelDto,
  CreateDmDto,
  RenameChannelDto,
} from './dto/team-chat.dto';
import {
  dmKeyFor,
  dmPeerId,
  messagePreview,
  USER_SELECT,
  type UserRow,
} from './team-chat.shared';

type MemberWithChannel = TeamChannelMember & { channel: TeamChannel };

/**
 * Conversations: the rail, channels, DMs, members, search. orgId and userId
 * always come from the JWT; every conversation is reached through the
 * caller's own membership (TeamChatAccessService).
 */
@Injectable()
export class TeamChatConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TeamChatAccessService,
  ) {}

  // -------------------------------------------------------------------------
  // Rail
  // -------------------------------------------------------------------------

  async list(actor: JwtPayload) {
    const orgId = actor.orgId as string;
    // Self-heal: General exists and the caller is in it, even if some
    // lifecycle path was missed (or ran before the migration).
    await teamChatUserActivated(this.prisma, orgId, actor.sub);

    const memberships = await this.prisma.teamChannelMember.findMany({
      where: { orgId, userId: actor.sub, channel: { orgId } },
      include: { channel: true },
    });
    const conversations = await this.buildRail(orgId, actor.sub, memberships);
    return {
      conversations,
      totalUnread: conversations.reduce((sum, c) => sum + c.unread, 0),
    };
  }

  async getOne(actor: JwtPayload, conversationId: string) {
    const m = await this.access.membership(
      actor.orgId as string,
      actor.sub,
      conversationId,
    );
    return this.railEntry(actor, m.channel.id);
  }

  /** One rail entry, for create/rename responses and the thread header. */
  async railEntry(actor: JwtPayload, channelId: string) {
    const member = await this.prisma.teamChannelMember.findFirst({
      where: { channelId, userId: actor.sub, orgId: actor.orgId as string },
      include: { channel: true },
    });
    if (!member) throw new NotFoundException('Conversation not found');
    const [entry] = await this.buildRail(actor.orgId as string, actor.sub, [
      member,
    ]);
    return entry;
  }

  /**
   * Builds rail entries with a fixed number of queries regardless of how many
   * conversations there are (P1): unread counts and last-message ids are one
   * aggregate SQL query each, everything else is a batched findMany.
   */
  private async buildRail(
    orgId: string,
    viewerId: string,
    memberships: MemberWithChannel[],
  ) {
    if (memberships.length === 0) return [];
    const channelIds = memberships.map((m) => m.channelId);

    const [unreadRows, lastIdRows, memberCounts] = await Promise.all([
      this.unreadRows(orgId, viewerId, channelIds),
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON ("channel_id") "id"
        FROM "access"."team_messages"
        WHERE "channel_id" = ANY(${channelIds}::text[])
        ORDER BY "channel_id", "created_at" DESC, "id" DESC`,
      this.prisma.teamChannelMember.groupBy({
        by: ['channelId'],
        where: { channelId: { in: channelIds } },
        _count: { _all: true },
      }),
    ]);

    const peerIds = memberships
      .filter((m) => m.channel.kind === 'dm')
      .map((m) => dmPeerId(m.channel.dmKey, viewerId))
      .filter((id): id is string => !!id);

    const [lastMessages, peers, presence] = await Promise.all([
      this.prisma.teamMessage.findMany({
        where: { id: { in: lastIdRows.map((r) => r.id) } },
        select: {
          id: true,
          channelId: true,
          kind: true,
          body: true,
          deletedAt: true,
          createdAt: true,
          sender: { select: USER_SELECT },
          attachments: {
            select: { fileName: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      }),
      this.prisma.user.findMany({
        where: { id: { in: peerIds }, orgId },
        select: { ...USER_SELECT, status: true },
      }),
      this.prisma.teamChatPresence.findMany({
        where: { userId: { in: peerIds }, orgId },
      }),
    ]);

    const unreadBy = new Map(unreadRows.map((r) => [r.channelId, r.unread]));
    const lastBy = new Map(lastMessages.map((m) => [m.channelId, m]));
    const countBy = new Map(
      memberCounts.map((r) => [r.channelId, r._count._all]),
    );
    const peerBy = new Map(peers.map((p) => [p.id, p]));
    const seenBy = new Map(presence.map((p) => [p.userId, p.lastSeenAt]));

    const entries = memberships.map(({ channel, role }) => {
      const last = lastBy.get(channel.id);
      const peerId =
        channel.kind === 'dm' ? dmPeerId(channel.dmKey, viewerId) : null;
      const peer = peerId ? peerBy.get(peerId) : undefined;
      const peerActive = !!peer && peer.status !== 'disabled';
      return {
        id: channel.id,
        kind: channel.kind,
        name:
          channel.kind === 'dm'
            ? peer
              ? chatDisplayName(peer)
              : 'Deleted user'
            : channel.name,
        myRole: role,
        memberCount: countBy.get(channel.id) ?? 0,
        peer:
          channel.kind === 'dm'
            ? peer
              ? {
                  id: peer.id,
                  name: chatDisplayName(peer),
                  email: peer.email,
                  active: peerActive,
                  lastSeenAt: seenBy.get(peer.id) ?? null,
                }
              : null
            : undefined,
        readOnly: channel.kind === 'dm' && !peerActive,
        unread: unreadBy.get(channel.id) ?? 0,
        lastMessage: last
          ? {
              id: last.id,
              kind: last.kind,
              preview: messagePreview(last),
              sender: last.sender
                ? { id: last.sender.id, name: chatDisplayName(last.sender) }
                : null,
              createdAt: last.createdAt,
            }
          : null,
        lastMessageAt: channel.lastMessageAt ?? channel.createdAt,
        createdAt: channel.createdAt,
      };
    });

    return entries.sort(
      (a, b) =>
        b.lastMessageAt.getTime() - a.lastMessageAt.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /**
   * Unread per conversation: messages after the read pointer, not system
   * messages, not deleted, not the viewer's own (B5). Before the first read
   * the pointer is the join time, so history from before joining never
   * counts.
   */
  unreadRows(orgId: string, viewerId: string, channelIds?: string[]) {
    const scope = channelIds
      ? Prisma.sql`AND m."channel_id" = ANY(${channelIds}::text[])`
      : Prisma.empty;
    return this.prisma.$queryRaw<{ channelId: string; unread: number }[]>`
      SELECT m."channel_id" AS "channelId", COUNT(msg."id")::int AS "unread"
      FROM "access"."team_channel_members" m
      JOIN "access"."team_messages" msg ON msg."channel_id" = m."channel_id"
      WHERE m."user_id" = ${viewerId}
        AND m."org_id" = ${orgId}
        ${scope}
        AND msg."kind" <> 'system'
        AND msg."deleted_at" IS NULL
        AND msg."sender_id" IS DISTINCT FROM ${viewerId}
        AND (msg."created_at", msg."id") >
            (COALESCE(m."last_read_at", m."joined_at"), COALESCE(m."last_read_message_id", ''))
      GROUP BY m."channel_id"`;
  }

  async totalUnread(orgId: string, viewerId: string): Promise<number> {
    const rows = await this.unreadRows(orgId, viewerId);
    return rows.reduce((sum, r) => sum + r.unread, 0);
  }

  // -------------------------------------------------------------------------
  // Channels
  // -------------------------------------------------------------------------

  async createChannel(actor: JwtPayload, dto: CreateChannelDto) {
    const orgId = actor.orgId as string;
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Channel name is required');

    const others = (dto.memberIds ?? []).filter((id) => id !== actor.sub);
    await this.access.assertActiveOrgUsers(orgId, others);
    const creator = await this.creator(actor);

    const channel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.teamChannel.create({
        data: {
          orgId,
          kind: 'channel',
          name,
          createdById: actor.sub,
          members: {
            create: [
              { userId: actor.sub, orgId, role: 'admin' },
              ...others.map((userId) => ({ userId, orgId, role: 'member' })),
            ],
          },
        },
      });
      await postSystemMessage(
        tx,
        created,
        `${chatDisplayName(creator)} created the channel`,
      );
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actor.sub,
          action: 'team_chat_channel_created',
          entity: 'TeamChannel',
          entityId: created.id,
          metadata: { name, memberCount: others.length + 1 },
        },
      });
      return created;
    });
    return this.railEntry(actor, channel.id);
  }

  async renameChannel(
    actor: JwtPayload,
    channelId: string,
    dto: RenameChannelDto,
  ) {
    const orgId = actor.orgId as string;
    const m = await this.access.membership(orgId, actor.sub, channelId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Channel name is required');

    if (m.channel.kind === 'dm') {
      throw new BadRequestException('Direct messages cannot be renamed');
    }
    if (m.channel.kind === 'general') {
      if (!(await this.access.isOrgAdmin(actor.sub, orgId))) {
        throw new ForbiddenException(
          'Only organisation admins can rename General',
        );
      }
    } else {
      await this.access.assertCanManageChannel(actor, m);
    }
    if (name === m.channel.name) return this.railEntry(actor, channelId);

    const creator = await this.creator(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.teamChannel.update({ where: { id: channelId }, data: { name } });
      await postSystemMessage(
        tx,
        m.channel,
        `${chatDisplayName(creator)} renamed the channel to "${name}"`,
      );
    });
    return this.railEntry(actor, channelId);
  }

  /** Hard delete of a group channel and its history (team_chat:delete,
   *  checked by the guard). General and DMs can never be deleted. */
  async deleteChannel(actor: JwtPayload, channelId: string) {
    const orgId = actor.orgId as string;
    const m = await this.access.membership(orgId, actor.sub, channelId);
    if (m.channel.kind !== 'channel') {
      throw new BadRequestException(
        m.channel.kind === 'general'
          ? 'General cannot be deleted'
          : 'Direct messages cannot be deleted',
      );
    }
    const memberIds = (
      await this.prisma.teamChannelMember.findMany({
        where: { channelId },
        select: { userId: true },
      })
    ).map((r) => r.userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.teamChannel.delete({ where: { id: channelId } });
      await tx.auditLog.create({
        data: {
          orgId,
          actorId: actor.sub,
          action: 'team_chat_channel_deleted',
          entity: 'TeamChannel',
          entityId: channelId,
          metadata: { name: m.channel.name },
        },
      });
    });
    return { id: channelId, deleted: true, memberIds };
  }

  async addMembers(actor: JwtPayload, channelId: string, dto: AddMembersDto) {
    const orgId = actor.orgId as string;
    const m = await this.access.channelMembership(orgId, actor.sub, channelId);
    await this.access.assertCanManageChannel(actor, m);
    const users = await this.access.assertActiveOrgUsers(orgId, dto.userIds);

    const existing = new Set(
      (
        await this.prisma.teamChannelMember.findMany({
          where: { channelId, userId: { in: dto.userIds } },
          select: { userId: true },
        })
      ).map((r) => r.userId),
    );
    const added = users.filter((u) => !existing.has(u.id));
    if (added.length > 0) {
      const creator = await this.creator(actor);
      await this.prisma.$transaction(async (tx) => {
        await tx.teamChannelMember.createMany({
          data: added.map((u) => ({
            channelId,
            userId: u.id,
            orgId,
            role: 'member',
          })),
          skipDuplicates: true,
        });
        await postSystemMessage(
          tx,
          m.channel,
          `${chatDisplayName(creator)} added ${joinNames(added)}`,
        );
      });
    }
    return {
      added: added.map((u) => u.id),
      members: await this.members(actor, channelId),
    };
  }

  async removeMember(actor: JwtPayload, channelId: string, userId: string) {
    const orgId = actor.orgId as string;
    const m = await this.access.channelMembership(orgId, actor.sub, channelId);
    if (userId === actor.sub) {
      throw new BadRequestException('Use "Leave" to remove yourself');
    }
    await this.access.assertCanManageChannel(actor, m);

    const target = await this.prisma.teamChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      include: { user: { select: USER_SELECT } },
    });
    if (!target)
      throw new NotFoundException('That user is not in this channel');

    const creator = await this.creator(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.teamChannelMember.delete({
        where: { channelId_userId: { channelId, userId } },
      });
      await promoteAdminIfOrphaned(tx, channelId);
      await postSystemMessage(
        tx,
        m.channel,
        `${chatDisplayName(creator)} removed ${chatDisplayName(target.user)}`,
      );
    });
    return { removed: userId, members: await this.members(actor, channelId) };
  }

  async leave(actor: JwtPayload, channelId: string) {
    const orgId = actor.orgId as string;
    const m = await this.access.membership(orgId, actor.sub, channelId);
    if (m.channel.kind !== 'channel') {
      throw new BadRequestException(
        m.channel.kind === 'general'
          ? 'You cannot leave General'
          : 'You cannot leave a direct message',
      );
    }
    const me = await this.creator(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.teamChannelMember.delete({
        where: { channelId_userId: { channelId, userId: actor.sub } },
      });
      await promoteAdminIfOrphaned(tx, channelId);
      await postSystemMessage(tx, m.channel, `${chatDisplayName(me)} left`);
    });
    return { id: channelId, left: true };
  }

  async members(actor: JwtPayload, conversationId: string) {
    const orgId = actor.orgId as string;
    await this.access.membership(orgId, actor.sub, conversationId);
    const rows = await this.prisma.teamChannelMember.findMany({
      where: { channelId: conversationId, orgId },
      include: {
        user: {
          select: { ...USER_SELECT, status: true, teamChatPresence: true },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.user.id,
      name: chatDisplayName(r.user),
      email: r.user.email,
      role: r.role,
      active: r.user.status !== 'disabled',
      joinedAt: r.joinedAt,
      lastSeenAt: r.user.teamChatPresence?.lastSeenAt ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // DMs
  // -------------------------------------------------------------------------

  /** Find-or-create by dmKey; the unique (orgId, dmKey) index makes a
   *  duplicate impossible even when both people start the DM at once. */
  async openDm(actor: JwtPayload, dto: CreateDmDto) {
    const orgId = actor.orgId as string;
    if (dto.userId === actor.sub) {
      throw new BadRequestException('You cannot message yourself');
    }
    await this.access.assertActiveOrgUsers(orgId, [dto.userId]);
    const dmKey = dmKeyFor(actor.sub, dto.userId);

    let channel = await this.prisma.teamChannel.findUnique({
      where: { orgId_dmKey: { orgId, dmKey } },
    });
    if (!channel) {
      try {
        channel = await this.prisma.teamChannel.create({
          data: {
            orgId,
            kind: 'dm',
            name: '',
            dmKey,
            createdById: actor.sub,
            members: {
              create: [
                { userId: actor.sub, orgId },
                { userId: dto.userId, orgId },
              ],
            },
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        channel = await this.prisma.teamChannel.findUniqueOrThrow({
          where: { orgId_dmKey: { orgId, dmKey } },
        });
      }
    }
    // Pre-rebuild DMs may lack a participant's row; both always belong.
    await this.prisma.teamChannelMember.createMany({
      data: [
        { channelId: channel.id, userId: actor.sub, orgId },
        { channelId: channel.id, userId: dto.userId, orgId },
      ],
      skipDuplicates: true,
    });
    return this.railEntry(actor, channel.id);
  }

  // -------------------------------------------------------------------------
  // Search (rail search box)
  // -------------------------------------------------------------------------

  async search(actor: JwtPayload, q: string) {
    const orgId = actor.orgId as string;
    const needle = q.trim().toLowerCase();
    if (!needle) return { conversations: [], users: [] };

    const { conversations } = await this.list(actor);
    const matches = conversations.filter((c) =>
      [c.name, c.peer?.email ?? ''].some((s) =>
        s.toLowerCase().includes(needle),
      ),
    );

    const tokens = needle.split(/\s+/).filter(Boolean).slice(0, 5);
    const users = await this.prisma.user.findMany({
      where: {
        orgId,
        id: { not: actor.sub },
        status: { not: 'disabled' },
        AND: tokens.map((t) => ({
          OR: [
            { firstName: { contains: t, mode: 'insensitive' as const } },
            { lastName: { contains: t, mode: 'insensitive' as const } },
            { email: { contains: t, mode: 'insensitive' as const } },
          ],
        })),
      },
      select: USER_SELECT,
      orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
      take: 20,
    });
    const dmByPeer = new Map(
      conversations.filter((c) => c.peer).map((c) => [c.peer!.id, c.id]),
    );
    return {
      conversations: matches.slice(0, 20),
      users: users.map((u) => ({
        id: u.id,
        name: chatDisplayName(u),
        email: u.email,
        dmConversationId: dmByPeer.get(u.id) ?? null,
      })),
    };
  }

  // -------------------------------------------------------------------------

  private async creator(actor: JwtPayload): Promise<UserRow> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: actor.sub },
      select: USER_SELECT,
    });
  }
}

function joinNames(users: UserRow[]): string {
  const names = users.map(chatDisplayName);
  if (names.length <= 3) {
    return names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0];
  }
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}
