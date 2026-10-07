import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import { PrismaService } from '../../database/prisma.service';
import { TeamChatUnreadService } from './team-chat-unread.service';
import {
  MESSAGE_INCLUDE,
  serializeMessage,
  type SerializedMessage,
} from './team-chat.shared';

export const userRoom = (userId: string) => `user:${userId}`;
export const convRoom = (conversationId: string) => `conv:${conversationId}`;
export const orgRoom = (orgId: string) => `org:${orgId}`;

/** Why a conversation disappeared from someone's rail. */
export type RemovedReason = 'deleted' | 'removed' | 'left';

/**
 * Server -> client Team Chat events. Services call these only AFTER their
 * transaction has committed, so a client never sees something it can't then
 * fetch. Every call is a no-op until the gateway has attached its namespace
 * (and in unit/integration tests, which never attach one).
 *
 * Rooms: `user:<id>` (all of a user's sockets), `conv:<id>` (sockets of the
 * conversation's members — joined at connect and kept in step here) and
 * `org:<id>` (presence). Message payloads are the sender's view; clients work
 * out "my reaction" from the reaction's user list.
 */
@Injectable()
export class TeamChatRealtimeService {
  private readonly logger = new Logger('TeamChatRealtime');
  private ns: Namespace | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly unread: TeamChatUnreadService,
  ) {}

  attach(ns: Namespace) {
    this.ns = ns;
  }

  // --- messages ------------------------------------------------------------

  messageNew(orgId: string, message: SerializedMessage) {
    this.safe('message:new', async (ns) => {
      ns.to(convRoom(message.conversationId)).emit('message:new', message);
      if (message.kind !== 'system') {
        await this.pushUnreadToMembers(orgId, message.conversationId);
      }
    });
  }

  /** Loads and broadcasts messages created inside a transaction (system
   *  messages, forwards). */
  messagesNewById(orgId: string, messageIds: Array<string | null | undefined>) {
    const ids = messageIds.filter((id): id is string => !!id);
    if (!ids.length) return;
    this.safe('message:new', async () => {
      const rows = await this.prisma.teamMessage.findMany({
        where: { id: { in: ids } },
        include: MESSAGE_INCLUDE,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      for (const row of rows) {
        this.messageNew(orgId, serializeMessage(row, row.senderId ?? ''));
      }
    });
  }

  messageUpdated(message: SerializedMessage) {
    this.safe('message:updated', (ns) => {
      ns.to(convRoom(message.conversationId)).emit('message:updated', message);
    });
  }

  messageDeleted(
    orgId: string,
    message: SerializedMessage,
    wasPinned: boolean,
  ) {
    this.safe('message:deleted', async (ns) => {
      ns.to(convRoom(message.conversationId)).emit('message:deleted', {
        id: message.id,
        conversationId: message.conversationId,
        deletedAt: message.deletedAt,
      });
      if (wasPinned) this.pinsUpdated(message.conversationId);
      // A deleted unread message no longer counts.
      await this.pushUnreadToMembers(orgId, message.conversationId);
    });
  }

  pinsUpdated(conversationId: string) {
    this.safe('pins:updated', (ns) => {
      ns.to(convRoom(conversationId)).emit('pins:updated', { conversationId });
    });
  }

  reactionUpdated(
    conversationId: string,
    messageId: string,
    reactions: unknown[],
  ) {
    this.safe('reaction:updated', (ns) => {
      ns.to(convRoom(conversationId)).emit('reaction:updated', {
        conversationId,
        messageId,
        reactions,
      });
    });
  }

  // --- conversations & members --------------------------------------------

  /** New members (or a brand-new conversation): their sockets join the room
   *  and their rail learns about it. */
  conversationCreated(conversationId: string, userIds: string[]) {
    this.safe('conversation:created', (ns) => {
      for (const userId of userIds) {
        ns.in(userRoom(userId)).socketsJoin(convRoom(conversationId));
        ns.to(userRoom(userId)).emit('conversation:created', {
          conversationId,
        });
      }
    });
  }

  /** Name / member count changed — members refetch the rail entry. */
  conversationUpdated(conversationId: string) {
    this.safe('conversation:updated', (ns) => {
      ns.to(convRoom(conversationId)).emit('conversation:updated', {
        conversationId,
      });
    });
  }

  /** Users who lost the conversation: their sockets leave the room at once
   *  (no further events reach them) and their rail drops it. */
  conversationRemoved(
    conversationId: string,
    userIds: string[],
    reason: RemovedReason,
  ) {
    this.safe('conversation:removed', async (ns) => {
      for (const userId of userIds) {
        ns.in(userRoom(userId)).socketsLeave(convRoom(conversationId));
        ns.to(userRoom(userId)).emit('conversation:removed', {
          conversationId,
          reason,
        });
      }
      // Their total unread may have dropped.
      const orgId = await this.orgOf(userIds[0]);
      if (orgId) await this.pushUnread(orgId, userIds);
    });
  }

  membersUpdated(conversationId: string) {
    this.safe('members:updated', (ns) => {
      ns.to(convRoom(conversationId)).emit('members:updated', {
        conversationId,
      });
    });
  }

  // --- unread & presence ---------------------------------------------------

  /** unread:update to each connected user (best-effort, like every push). */
  unreadChanged(orgId: string, userIds: string[], conversationId?: string) {
    this.safe('unread:update', () =>
      this.pushUnread(orgId, userIds, conversationId),
    );
  }

  /** unread:update to each connected user: per-conversation counts for the
   *  given conversation (or all of theirs) plus their total. */
  private async pushUnread(
    orgId: string,
    userIds: string[],
    conversationId?: string,
  ) {
    const ns = this.ns;
    if (!ns) return;
    const online = userIds.filter(
      (id) => (ns.adapter.rooms.get(userRoom(id))?.size ?? 0) > 0,
    );
    if (!online.length) return;
    const rows = await this.unread.forUsers(orgId, online);
    for (const userId of online) {
      const mine = rows.filter((r) => r.userId === userId);
      const counts: Record<string, number> = {};
      for (const r of mine) counts[r.channelId] = r.unread;
      if (conversationId && !(conversationId in counts)) {
        counts[conversationId] = 0;
      }
      ns.to(userRoom(userId)).emit('unread:update', {
        conversationId: conversationId ?? null,
        unread: conversationId ? counts[conversationId] : null,
        conversations: counts,
        totalUnread: mine.reduce((sum, r) => sum + r.unread, 0),
      });
    }
  }

  presence(
    orgId: string,
    userId: string,
    online: boolean,
    lastSeenAt: Date | null,
  ) {
    this.safe('presence:update', (ns) => {
      ns.to(orgRoom(orgId)).emit('presence:update', {
        userId,
        online,
        lastSeenAt,
      });
    });
  }

  // -------------------------------------------------------------------------

  private async pushUnreadToMembers(orgId: string, conversationId: string) {
    const members = await this.prisma.teamChannelMember.findMany({
      where: { channelId: conversationId },
      select: { userId: true },
    });
    await this.pushUnread(
      orgId,
      members.map((m) => m.userId),
      conversationId,
    );
  }

  private async orgOf(userId: string | undefined) {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    return user?.orgId ?? null;
  }

  /** Realtime is best-effort: a failed push must never fail (or delay) the
   *  REST request that triggered it — clients resync on reconnect. */
  private safe(label: string, fn: (ns: Namespace) => unknown) {
    const ns = this.ns;
    if (!ns) return;
    void Promise.resolve()
      .then(() => fn(ns))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`${label} failed: ${message}`);
      });
  }
}
