import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { publishChatMembership } from './team-chat-bus';

// ---------------------------------------------------------------------------
// Team Chat membership lifecycle — the one place that keeps the org-wide
// General channel in step with who is an active org member.
//
// "Active member" = an org user whose status is not `disabled` (a `pending`
// member — approved, still to set their own password — counts, same as the
// data migration's backfill).
//
// Called from every path where a user becomes or stops being an active org
// member (see the call sites of teamChatUserActivated/Deactivated). Every
// call is idempotent, and the `runTeamChatHook` wrapper means a chat failure
// can never fail the user operation that triggered it.
//
// The activated/deactivated hooks also tell the realtime gateway (live rail,
// member lists, system messages). Call them with the plain client, after the
// triggering change has committed — never inside a transaction.
// ---------------------------------------------------------------------------

/** PrismaService, a transaction client, or any Pick that includes these. */
export type ChatDb = Pick<
  PrismaClient,
  'user' | 'teamChannel' | 'teamChannelMember' | 'teamMessage'
>;

const logger = new Logger('TeamChatMembership');

export const GENERAL_CHANNEL_NAME = 'General';

export function chatDisplayName(u: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
}

/** The org's General channel, created on first use. Race-safe: the partial
 *  unique index `team_channels_one_general_per_org` makes a concurrent second
 *  insert fail, after which we just read the winner's row. */
export async function ensureGeneralChannel(db: ChatDb, orgId: string) {
  const existing = await db.teamChannel.findFirst({
    where: { orgId, kind: 'general' },
  });
  if (existing) return existing;
  try {
    return await db.teamChannel.create({
      data: { orgId, kind: 'general', name: GENERAL_CHANNEL_NAME },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return db.teamChannel.findFirstOrThrow({
        where: { orgId, kind: 'general' },
      });
    }
    throw err;
  }
}

/** Posts a system message ("X joined", "X pinned a message") and moves the
 *  conversation up the rail. System messages have no sender. */
export async function postSystemMessage(
  db: ChatDb,
  channel: { id: string; orgId: string },
  body: string,
) {
  const now = new Date();
  const message = await db.teamMessage.create({
    data: {
      channelId: channel.id,
      orgId: channel.orgId,
      kind: 'system',
      senderId: null,
      body,
      createdAt: now,
    },
  });
  await db.teamChannel.update({
    where: { id: channel.id },
    data: { lastMessageAt: now },
  });
  return message;
}

export interface MembershipChange {
  channelId: string;
  userId: string;
  systemMessageId: string | null;
}

/**
 * The user is now an active member of `orgId`: make sure they're in General
 * and announce it there ("<Name> joined"). No-op (returns null) if they're
 * already a member or aren't an active member of this org.
 */
export async function teamChatUserActivated(
  db: ChatDb,
  orgId: string,
  userId: string,
): Promise<MembershipChange | null> {
  const user = await db.user.findFirst({
    where: { id: userId, orgId, status: { not: 'disabled' } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!user) return null;

  const general = await ensureGeneralChannel(db, orgId);
  const existing = await db.teamChannelMember.findUnique({
    where: { channelId_userId: { channelId: general.id, userId } },
  });
  if (existing) return null;

  try {
    await db.teamChannelMember.create({
      data: { channelId: general.id, userId, orgId, role: 'member' },
    });
  } catch (err) {
    // Two activation paths raced; the other one announced the join.
    if (isUniqueViolation(err)) return null;
    throw err;
  }
  const message = await postSystemMessage(
    db,
    general,
    `${chatDisplayName(user)} joined`,
  );
  publishChatMembership([
    {
      orgId,
      channelId: general.id,
      userId,
      change: 'joined',
      systemMessageId: message.id,
    },
  ]);
  return { channelId: general.id, userId, systemMessageId: message.id };
}

/**
 * The user stopped being an active member (disabled, or about to be
 * deleted): remove them from General and every group channel with a
 * "<Name> left" message. DMs are left alone — they stay readable for the
 * other participant, who can no longer post to them (see the service's
 * read-only check). Call BEFORE deleting a user so the name is still there.
 */
export async function teamChatUserDeactivated(
  db: ChatDb,
  orgId: string,
  userId: string,
): Promise<MembershipChange[]> {
  const user = await db.user.findFirst({
    where: { id: userId, orgId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!user) return [];

  const memberships = await db.teamChannelMember.findMany({
    where: { orgId, userId, channel: { kind: { in: ['general', 'channel'] } } },
    include: { channel: { select: { id: true, orgId: true } } },
  });

  const changes: MembershipChange[] = [];
  for (const m of memberships) {
    const removed = await db.teamChannelMember.deleteMany({
      where: { channelId: m.channelId, userId },
    });
    if (removed.count === 0) continue;
    await promoteAdminIfOrphaned(db, m.channelId);
    const message = await postSystemMessage(
      db,
      m.channel,
      `${chatDisplayName(user)} left`,
    );
    changes.push({
      channelId: m.channelId,
      userId,
      systemMessageId: message.id,
    });
  }
  publishChatMembership(
    changes.map((c) => ({ ...c, orgId, change: 'left' as const })),
  );
  return changes;
}

/** A channel whose last admin left gets its longest-standing member as
 *  admin, so it never ends up unmanageable by its own members. */
export async function promoteAdminIfOrphaned(db: ChatDb, channelId: string) {
  const channel = await db.teamChannel.findUnique({
    where: { id: channelId },
    select: { kind: true },
  });
  if (channel?.kind !== 'channel') return;
  const admins = await db.teamChannelMember.count({
    where: { channelId, role: 'admin' },
  });
  if (admins > 0) return;
  const next = await db.teamChannelMember.findFirst({
    where: { channelId },
    orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
  });
  if (!next) return;
  await db.teamChannelMember.update({
    where: { channelId_userId: { channelId, userId: next.userId } },
    data: { role: 'admin' },
  });
}

/**
 * Runs a chat lifecycle hook without letting it break the caller: user
 * provisioning/approval/deletion must succeed even if chat can't be updated
 * (e.g. the API booted a moment before `prisma migrate deploy` finished).
 * The General channel self-heals on the user's next chat request.
 */
export async function runTeamChatHook<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Team chat hook "${label}" failed: ${message}`);
    return null;
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
