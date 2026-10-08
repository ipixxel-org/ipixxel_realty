import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TeamChannel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { hasOrgPermission } from '../../common/guards/permission.guard';
import {
  chatDisplayName,
  isUniqueViolation,
  postSystemMessage,
} from '../../common/utils/team-chat-membership.util';
import { TeamChatAccessService } from './team-chat-access.service';
import { TeamChatRealtimeService } from './team-chat-realtime.service';
import { TeamChatUnreadService } from './team-chat-unread.service';
import {
  EditMessageDto,
  ListMessagesQueryDto,
  MarkReadDto,
  SearchMessagesQueryDto,
  SendMessageDto,
} from './dto/team-chat.dto';
import {
  aggregateReactions,
  assertEmoji,
  cursorWhere,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  MAX_PINS_PER_CONVERSATION,
  MESSAGE_INCLUDE,
  messagePreview,
  ORDER_ASC,
  ORDER_DESC,
  serializeMessage,
  USER_SELECT,
  type MessageRow,
} from './team-chat.shared';

@Injectable()
export class TeamChatMessagesService {
  private readonly logger = new Logger('TeamChatMessages');

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TeamChatAccessService,
    private readonly unread: TeamChatUnreadService,
    private readonly realtime: TeamChatRealtimeService,
  ) {}

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  /**
   * Cursor paging on (createdAt, id) (B7). Returns messages oldest-first.
   *   ?before=<cursor>  older history (infinite scroll up)
   *   ?after=<cursor>   catch-up after a reconnect
   *   ?around=<id>      a page centred on one message (jump-to)
   *   (none)            the latest page
   * Fetching never marks anything read (B6) — that's POST .../read.
   */
  async list(
    actor: JwtPayload,
    conversationId: string,
    q: ListMessagesQueryDto,
  ) {
    const orgId = actor.orgId as string;
    await this.access.membership(orgId, actor.sub, conversationId);
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const base: Prisma.TeamMessageWhereInput = {
      channelId: conversationId,
      orgId,
    };

    if ([q.before, q.after, q.around].filter(Boolean).length > 1) {
      throw new BadRequestException('Use only one of before, after or around');
    }

    if (q.after) {
      const rows = await this.prisma.teamMessage.findMany({
        where: { ...base, ...cursorWhere(decodeCursor(q.after), 'after') },
        orderBy: ORDER_ASC,
        take: limit + 1,
        include: MESSAGE_INCLUDE,
      });
      const page = rows.slice(0, limit);
      return this.page(page, actor.sub, {
        hasMoreBefore: true,
        hasMoreAfter: rows.length > limit,
      });
    }

    if (q.around) {
      const target = await this.prisma.teamMessage.findFirst({
        where: { ...base, id: q.around },
        select: { id: true, createdAt: true },
      });
      if (!target) throw new NotFoundException('Message not found');
      const half = Math.max(1, Math.floor(limit / 2));
      const [older, newer] = await Promise.all([
        this.prisma.teamMessage.findMany({
          where: { ...base, ...cursorWhere(target, 'before') },
          orderBy: ORDER_DESC,
          take: half + 1,
          include: MESSAGE_INCLUDE,
        }),
        this.prisma.teamMessage.findMany({
          // (createdAt, id) >= target: the target itself plus what follows.
          where: {
            ...base,
            OR: [
              { createdAt: { gt: target.createdAt } },
              { createdAt: target.createdAt, id: { gte: target.id } },
            ],
          },
          orderBy: ORDER_ASC,
          take: half + 2,
          include: MESSAGE_INCLUDE,
        }),
      ]);
      const before = older.slice(0, half).reverse();
      const after = newer.slice(0, half + 1);
      return this.page([...before, ...after], actor.sub, {
        hasMoreBefore: older.length > half,
        hasMoreAfter: newer.length > half + 1,
      });
    }

    const rows = await this.prisma.teamMessage.findMany({
      where: q.before
        ? { ...base, ...cursorWhere(decodeCursor(q.before), 'before') }
        : base,
      orderBy: ORDER_DESC,
      take: limit + 1,
      include: MESSAGE_INCLUDE,
    });
    const page = rows.slice(0, limit).reverse();
    return this.page(page, actor.sub, {
      hasMoreBefore: rows.length > limit,
      hasMoreAfter: false,
    });
  }

  private page(
    rows: MessageRow[],
    viewerId: string,
    more: { hasMoreBefore: boolean; hasMoreAfter: boolean },
  ) {
    return {
      messages: rows.map((m) => serializeMessage(m, viewerId)),
      ...more,
      oldestCursor: rows.length ? encodeCursor(rows[0]) : null,
      newestCursor: rows.length ? encodeCursor(rows[rows.length - 1]) : null,
    };
  }

  async pins(actor: JwtPayload, conversationId: string) {
    await this.access.membership(
      actor.orgId as string,
      actor.sub,
      conversationId,
    );
    const rows = await this.prisma.teamMessage.findMany({
      where: {
        channelId: conversationId,
        pinnedAt: { not: null },
        deletedAt: null,
      },
      orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
      take: MAX_PINS_PER_CONVERSATION,
      include: MESSAGE_INCLUDE,
    });
    return rows.map((m) => serializeMessage(m, actor.sub));
  }

  async search(
    actor: JwtPayload,
    conversationId: string,
    q: SearchMessagesQueryDto,
  ) {
    const orgId = actor.orgId as string;
    await this.access.membership(orgId, actor.sub, conversationId);
    const text = q.q.trim();
    if (!text) return { messages: [], nextCursor: null };
    const limit = q.limit ?? 20;
    const rows = await this.prisma.teamMessage.findMany({
      where: {
        channelId: conversationId,
        orgId,
        kind: { not: 'system' },
        deletedAt: null,
        body: { contains: text, mode: 'insensitive' },
        ...(q.before ? cursorWhere(decodeCursor(q.before), 'before') : {}),
      },
      orderBy: ORDER_DESC,
      take: limit + 1,
      include: MESSAGE_INCLUDE,
    });
    const page = rows.slice(0, limit);
    return {
      messages: page.map((m) => serializeMessage(m, actor.sub)),
      nextCursor:
        rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  async send(actor: JwtPayload, conversationId: string, dto: SendMessageDto) {
    const orgId = actor.orgId as string;
    const { channel } = await this.access.membership(
      orgId,
      actor.sub,
      conversationId,
    );

    // Idempotent retry (B8): same sender + clientMsgId -> the original row.
    const replay = await this.findByClientMsgId(
      conversationId,
      dto.clientMsgId,
      actor.sub,
    );
    if (replay) return replay;

    await this.access.assertWritable(channel, actor.sub);
    const body = (dto.body ?? '').trim();
    const attachmentIds = dto.attachmentIds ?? [];
    if (!body && attachmentIds.length === 0) {
      throw new BadRequestException('Message is empty'); // B9
    }
    if (dto.parentId)
      await this.assertReplyTarget(conversationId, dto.parentId);
    const mentionIds = await this.validMentions(
      conversationId,
      dto.mentionUserIds,
      actor.sub,
    );

    try {
      const message = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const created = await tx.teamMessage.create({
          data: {
            channelId: conversationId,
            orgId,
            kind: attachmentIds.length ? 'file' : 'text',
            senderId: actor.sub,
            body,
            parentId: dto.parentId ?? null,
            clientMsgId: dto.clientMsgId,
            createdAt: now,
          },
        });
        if (attachmentIds.length) {
          const linked = await tx.teamMessageAttachment.updateMany({
            where: {
              id: { in: attachmentIds },
              orgId,
              uploadedById: actor.sub,
              messageId: null,
            },
            data: { messageId: created.id },
          });
          if (linked.count !== attachmentIds.length) {
            throw new BadRequestException(
              'Attachments must be your own, unsent uploads',
            );
          }
        }
        if (mentionIds.length) {
          await tx.teamMessageMention.createMany({
            data: mentionIds.map((userId) => ({
              messageId: created.id,
              userId,
              orgId,
            })),
            skipDuplicates: true,
          });
        }
        await tx.teamChannel.update({
          where: { id: conversationId },
          data: { lastMessageAt: now },
        });
        // Your own message is read by definition.
        await tx.teamChannelMember.update({
          where: {
            channelId_userId: { channelId: conversationId, userId: actor.sub },
          },
          data: { lastReadAt: now, lastReadMessageId: created.id },
        });
        return tx.teamMessage.findUniqueOrThrow({
          where: { id: created.id },
          include: MESSAGE_INCLUDE,
        });
      });
      const serialized = serializeMessage(message, actor.sub);
      this.realtime.messageNew(orgId, serialized);
      await this.notifyMentions(channel, actor.sub, body, mentionIds);
      return serialized;
    } catch (err) {
      // Two concurrent sends with the same clientMsgId: the loser returns
      // the winner's row.
      if (isUniqueViolation(err)) {
        const winner = await this.findByClientMsgId(
          conversationId,
          dto.clientMsgId,
          actor.sub,
        );
        if (winner) return winner;
        throw new ConflictException('clientMsgId already used');
      }
      throw err;
    }
  }

  private async findByClientMsgId(
    channelId: string,
    clientMsgId: string,
    senderId: string,
  ) {
    const existing = await this.prisma.teamMessage.findUnique({
      where: { channelId_clientMsgId: { channelId, clientMsgId } },
      include: MESSAGE_INCLUDE,
    });
    if (!existing) return null;
    if (existing.senderId !== senderId) {
      throw new ConflictException('clientMsgId already used');
    }
    return serializeMessage(existing, senderId);
  }

  private async assertReplyTarget(channelId: string, parentId: string) {
    const parent = await this.prisma.teamMessage.findFirst({
      where: { id: parentId, channelId },
      select: { kind: true },
    });
    if (!parent || parent.kind === 'system') {
      throw new BadRequestException(
        'You can only reply to a message in this conversation',
      );
    }
  }

  /** Mentions must be members of the conversation (self-mentions dropped). */
  private async validMentions(
    channelId: string,
    ids: string[] | undefined,
    selfId: string,
  ) {
    const wanted = (ids ?? []).filter((id) => id !== selfId);
    if (wanted.length === 0) return [];
    const members = await this.prisma.teamChannelMember.findMany({
      where: { channelId, userId: { in: wanted } },
      select: { userId: true },
    });
    if (members.length !== wanted.length) {
      throw new BadRequestException(
        'You can only mention members of this conversation',
      );
    }
    return wanted;
  }

  /**
   * A bell notification (GET /org/notifications) for each mentioned member
   * who is still active. Runs after the message has committed and is
   * best-effort: a failure here never fails the send or edit.
   */
  private async notifyMentions(
    channel: TeamChannel,
    senderId: string,
    body: string,
    userIds: string[],
  ) {
    if (userIds.length === 0) return;
    try {
      const [sender, recipients] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: USER_SELECT,
        }),
        this.prisma.user.findMany({
          where: {
            id: { in: userIds },
            orgId: channel.orgId,
            status: { not: 'disabled' },
          },
          select: { id: true },
        }),
      ]);
      if (recipients.length === 0) return;
      const who = sender ? chatDisplayName(sender) : 'Someone';
      const where =
        channel.kind === 'dm' ? 'a direct message' : `#${channel.name}`;
      await this.prisma.notification.createMany({
        data: recipients.map((r) => ({
          orgId: channel.orgId,
          recipientId: r.id,
          type: 'team_chat_mention' as const,
          title: `${who} mentioned you in ${where}`,
          body: messagePreview({ kind: 'text', body, deletedAt: null }),
          entity: 'TeamChannel',
          entityId: channel.id,
        })),
      });
    } catch (err) {
      this.logger.warn(
        `Mention notifications failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Edit / delete
  // -------------------------------------------------------------------------

  async edit(actor: JwtPayload, messageId: string, dto: EditMessageDto) {
    const { message, channel } = await this.loadForWrite(actor, messageId);
    if (message.senderId !== actor.sub) {
      throw new ForbiddenException('You can only edit your own messages');
    }
    if (message.kind !== 'text' || message.deletedAt) {
      throw new BadRequestException('Only text messages can be edited');
    }
    // A forwarded copy is stored as the forwarder's, but the words are
    // someone else's.
    if (message.forwarded) {
      throw new BadRequestException('Forwarded messages cannot be edited');
    }
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Message is empty');
    const mentionIds =
      dto.mentionUserIds !== undefined
        ? await this.validMentions(channel.id, dto.mentionUserIds, actor.sub)
        : null;
    // Only people this edit newly mentions get a notification.
    const alreadyMentioned = new Set(
      mentionIds
        ? (
            await this.prisma.teamMessageMention.findMany({
              where: { messageId },
              select: { userId: true },
            })
          ).map((x) => x.userId)
        : [],
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (mentionIds) {
        await tx.teamMessageMention.deleteMany({ where: { messageId } });
        if (mentionIds.length) {
          await tx.teamMessageMention.createMany({
            data: mentionIds.map((userId) => ({
              messageId,
              userId,
              orgId: channel.orgId,
            })),
          });
        }
      }
      return tx.teamMessage.update({
        where: { id: messageId },
        data: { body, editedAt: new Date() },
        include: MESSAGE_INCLUDE,
      });
    });
    const serialized = serializeMessage(updated, actor.sub);
    this.realtime.messageUpdated(serialized);
    if (mentionIds) {
      await this.notifyMentions(
        channel,
        actor.sub,
        body,
        mentionIds.filter((id) => !alreadyMentioned.has(id)),
      );
    }
    return serialized;
  }

  /**
   * Soft delete: own message anywhere; someone else's only in a channel
   * (never a DM) and only with team_chat:delete. Body is cleared, pin,
   * reactions and mentions removed; attachment rows stay but are hidden.
   */
  async remove(actor: JwtPayload, messageId: string) {
    const { message, channel } = await this.loadForWrite(actor, messageId, {
      allowReadOnly: true,
    });
    if (message.kind === 'system') {
      throw new BadRequestException('System messages cannot be deleted');
    }
    if (message.deletedAt) return this.reload(messageId, actor.sub);
    if (message.senderId !== actor.sub) {
      const allowed =
        channel.kind !== 'dm' &&
        (await hasOrgPermission(this.prisma, actor, 'team_chat', 'delete'));
      if (!allowed) {
        throw new ForbiddenException('You can only delete your own messages');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMessageReaction.deleteMany({ where: { messageId } });
      await tx.teamMessageMention.deleteMany({ where: { messageId } });
      await tx.teamMessage.update({
        where: { id: messageId },
        data: {
          body: '',
          deletedAt: new Date(),
          pinnedAt: null,
          pinnedById: null,
        },
      });
    });
    const deleted = await this.reload(messageId, actor.sub);
    this.realtime.messageDeleted(channel.orgId, deleted, !!message.pinnedAt);
    return deleted;
  }

  // -------------------------------------------------------------------------
  // Pins
  // -------------------------------------------------------------------------

  async pin(actor: JwtPayload, messageId: string) {
    const { message, channel } = await this.loadForWrite(actor, messageId);
    if (message.kind === 'system' || message.deletedAt) {
      throw new BadRequestException('This message cannot be pinned');
    }
    if (message.pinnedAt) return this.reload(messageId, actor.sub);

    const pinned = await this.prisma.teamMessage.count({
      where: {
        channelId: channel.id,
        pinnedAt: { not: null },
        deletedAt: null,
      },
    });
    if (pinned >= MAX_PINS_PER_CONVERSATION) {
      throw new ConflictException(
        `You can pin up to ${MAX_PINS_PER_CONVERSATION} messages — unpin one first`,
      );
    }
    const me = await this.me(actor);
    const system = await this.prisma.$transaction(async (tx) => {
      await tx.teamMessage.update({
        where: { id: messageId },
        data: { pinnedAt: new Date(), pinnedById: actor.sub },
      });
      return postSystemMessage(
        tx,
        channel,
        `${chatDisplayName(me)} pinned a message`,
      );
    });
    const result = await this.reload(messageId, actor.sub);
    this.realtime.messageUpdated(result);
    this.realtime.pinsUpdated(channel.id);
    this.realtime.messagesNewById(channel.orgId, [system.id]);
    return result;
  }

  async unpin(actor: JwtPayload, messageId: string) {
    const { message } = await this.loadForWrite(actor, messageId);
    if (!message.pinnedAt) return this.reload(messageId, actor.sub);
    await this.prisma.teamMessage.update({
      where: { id: messageId },
      data: { pinnedAt: null, pinnedById: null },
    });
    const unpinned = await this.reload(messageId, actor.sub);
    this.realtime.messageUpdated(unpinned);
    this.realtime.pinsUpdated(message.channelId);
    return unpinned;
  }

  // -------------------------------------------------------------------------
  // Forward
  // -------------------------------------------------------------------------

  /** Copies into each target (caller must be a member of the source and of
   *  every target). Attachments re-reference the same stored objects. */
  async forward(
    actor: JwtPayload,
    messageId: string,
    conversationIds: string[],
  ) {
    const orgId = actor.orgId as string;
    const source = await this.prisma.teamMessage.findFirst({
      where: { id: messageId, orgId },
      include: { attachments: true },
    });
    if (!source) throw new NotFoundException('Message not found');
    await this.access.membership(orgId, actor.sub, source.channelId);
    if (source.kind === 'system' || source.deletedAt) {
      throw new BadRequestException('This message cannot be forwarded');
    }
    if (conversationIds.length === 0) {
      throw new BadRequestException('Pick at least one conversation');
    }
    const targets = await Promise.all(
      conversationIds.map((id) => this.access.membership(orgId, actor.sub, id)),
    );
    for (const t of targets)
      await this.access.assertWritable(t.channel, actor.sub);

    const createdIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const { channel } of targets) {
        const now = new Date();
        const copy = await tx.teamMessage.create({
          data: {
            channelId: channel.id,
            orgId,
            kind: source.kind,
            senderId: actor.sub,
            body: source.body,
            forwarded: true,
            createdAt: now,
          },
        });
        if (source.attachments.length) {
          await tx.teamMessageAttachment.createMany({
            data: source.attachments.map((a) => ({
              messageId: copy.id,
              orgId,
              uploadedById: actor.sub,
              storageKey: a.storageKey,
              fileName: a.fileName,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              width: a.width,
              height: a.height,
              durationSec: a.durationSec,
            })),
          });
        }
        await tx.teamChannel.update({
          where: { id: channel.id },
          data: { lastMessageAt: now },
        });
        await tx.teamChannelMember.update({
          where: {
            channelId_userId: { channelId: channel.id, userId: actor.sub },
          },
          data: { lastReadAt: now, lastReadMessageId: copy.id },
        });
        ids.push(copy.id);
      }
      return ids;
    });
    const rows = await this.prisma.teamMessage.findMany({
      where: { id: { in: createdIds } },
      include: MESSAGE_INCLUDE,
    });
    const messages = rows.map((m) => serializeMessage(m, actor.sub));
    for (const m of messages) this.realtime.messageNew(orgId, m);
    return { messages };
  }

  // -------------------------------------------------------------------------
  // Read state
  // -------------------------------------------------------------------------

  /** Explicit mark-read up to a message (or the latest). The pointer only
   *  moves forward. */
  async markRead(actor: JwtPayload, conversationId: string, dto: MarkReadDto) {
    const orgId = actor.orgId as string;
    const { member } = await this.access.membership(
      orgId,
      actor.sub,
      conversationId,
    );
    const target = await this.prisma.teamMessage.findFirst({
      where: dto.messageId
        ? { id: dto.messageId, channelId: conversationId }
        : { channelId: conversationId },
      orderBy: ORDER_DESC,
      select: { id: true, createdAt: true },
    });
    if (dto.messageId && !target)
      throw new NotFoundException('Message not found');

    if (target) {
      const current = member.lastReadAt
        ? { createdAt: member.lastReadAt, id: member.lastReadMessageId ?? '' }
        : null;
      const newer =
        !current ||
        target.createdAt > current.createdAt ||
        (target.createdAt.getTime() === current.createdAt.getTime() &&
          target.id > current.id);
      if (newer) {
        await this.prisma.teamChannelMember.update({
          where: {
            channelId_userId: { channelId: conversationId, userId: actor.sub },
          },
          data: { lastReadAt: target.createdAt, lastReadMessageId: target.id },
        });
      }
    }
    // The user's other tabs/devices clear their badges too.
    this.realtime.unreadChanged(orgId, [actor.sub], conversationId);
    return this.unread.summary(orgId, actor.sub, conversationId);
  }

  // -------------------------------------------------------------------------
  // Reactions (one per user per message)
  // -------------------------------------------------------------------------

  /** Sets the caller's reaction. The same emoji again removes it (toggle);
   *  a different one replaces it. */
  async react(actor: JwtPayload, messageId: string, rawEmoji: string) {
    const emoji = assertEmoji(rawEmoji);
    const { message } = await this.loadForWrite(actor, messageId);
    this.assertReactable(message);
    const existing = await this.prisma.teamMessageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: actor.sub } },
    });
    if (existing?.emoji === emoji) {
      await this.prisma.teamMessageReaction.delete({
        where: { id: existing.id },
      });
    } else {
      await this.prisma.teamMessageReaction.upsert({
        where: { messageId_userId: { messageId, userId: actor.sub } },
        create: { messageId, userId: actor.sub, orgId: message.orgId, emoji },
        update: { emoji, createdAt: new Date() },
      });
    }
    return this.reactionsChanged(message.channelId, messageId, actor.sub);
  }

  async unreact(actor: JwtPayload, messageId: string) {
    const { message } = await this.loadForWrite(actor, messageId);
    this.assertReactable(message);
    await this.prisma.teamMessageReaction.deleteMany({
      where: { messageId, userId: actor.sub },
    });
    return this.reactionsChanged(message.channelId, messageId, actor.sub);
  }

  private assertReactable(message: { kind: string; deletedAt: Date | null }) {
    if (message.kind === 'system' || message.deletedAt) {
      throw new BadRequestException('You cannot react to this message');
    }
  }

  private async reactionsChanged(
    conversationId: string,
    messageId: string,
    viewerId: string,
  ) {
    const rows = await this.prisma.teamMessageReaction.findMany({
      where: { messageId },
      select: { emoji: true, user: { select: USER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    const reactions = aggregateReactions(rows, viewerId);
    this.realtime.reactionUpdated(conversationId, messageId, reactions);
    return { messageId, reactions };
  }

  // -------------------------------------------------------------------------

  /** The message plus the caller's membership of its conversation; refuses
   *  writes to a read-only DM unless `allowReadOnly`. */
  private async loadForWrite(
    actor: JwtPayload,
    messageId: string,
    opts: { allowReadOnly?: boolean } = {},
  ) {
    const orgId = actor.orgId as string;
    const message = await this.prisma.teamMessage.findFirst({
      where: { id: messageId, orgId },
    });
    if (!message) throw new NotFoundException('Message not found');
    // Same 404 for "not a member" as for "no such message".
    let channel: TeamChannel;
    try {
      ({ channel } = await this.access.membership(
        orgId,
        actor.sub,
        message.channelId,
      ));
    } catch {
      throw new NotFoundException('Message not found');
    }
    if (!opts.allowReadOnly)
      await this.access.assertWritable(channel, actor.sub);
    return { message, channel };
  }

  private async reload(messageId: string, viewerId: string) {
    const row = await this.prisma.teamMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    return serializeMessage(row, viewerId);
  }

  private me(actor: JwtPayload) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: actor.sub },
      select: USER_SELECT,
    });
  }
}
