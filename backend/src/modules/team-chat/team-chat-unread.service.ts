import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface UnreadRow {
  userId: string;
  channelId: string;
  unread: number;
}

/**
 * Unread counts: messages after a member's read pointer, not system
 * messages, not deleted, not their own (B5). Before the first read the
 * pointer is the join time, so history from before joining never counts.
 */
@Injectable()
export class TeamChatUnreadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Per conversation for several users in one query (live unread pushes). */
  forUsers(
    orgId: string,
    userIds: string[],
    channelIds?: string[],
  ): Promise<UnreadRow[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    const scope = channelIds
      ? Prisma.sql`AND m."channel_id" = ANY(${channelIds}::text[])`
      : Prisma.empty;
    return this.prisma.$queryRaw<UnreadRow[]>`
      SELECT m."user_id" AS "userId", m."channel_id" AS "channelId",
             COUNT(msg."id")::int AS "unread"
      FROM "access"."team_channel_members" m
      JOIN "access"."team_messages" msg ON msg."channel_id" = m."channel_id"
      WHERE m."user_id" = ANY(${userIds}::text[])
        AND m."org_id" = ${orgId}
        ${scope}
        AND msg."kind" <> 'system'
        AND msg."deleted_at" IS NULL
        AND msg."sender_id" IS DISTINCT FROM m."user_id"
        AND (msg."created_at", msg."id") >
            (COALESCE(m."last_read_at", m."joined_at"), COALESCE(m."last_read_message_id", ''))
      GROUP BY m."user_id", m."channel_id"`;
  }

  /** One user's unread per conversation. */
  async forUser(orgId: string, userId: string, channelIds?: string[]) {
    const rows = await this.forUsers(orgId, [userId], channelIds);
    return rows.map(({ channelId, unread }) => ({ channelId, unread }));
  }

  /** A user's unread in one conversation plus their total. */
  async summary(orgId: string, userId: string, conversationId: string) {
    const rows = await this.forUser(orgId, userId);
    return {
      conversationId,
      unread: rows.find((r) => r.channelId === conversationId)?.unread ?? 0,
      totalUnread: rows.reduce((sum, r) => sum + r.unread, 0),
    };
  }
}
