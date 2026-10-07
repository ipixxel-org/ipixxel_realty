import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { chatDisplayName } from '../../common/utils/team-chat-membership.util';

export const CONVERSATION_KINDS = ['general', 'channel', 'dm'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const MAX_PINS_PER_CONVERSATION = 3;
export const DEFAULT_PAGE_SIZE = 50;

export const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

export type UserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export const userRef = (u: UserRow) => ({ id: u.id, name: chatDisplayName(u) });

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const ATTACHMENT_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  durationSec: true,
} as const;

export const MESSAGE_INCLUDE = {
  sender: { select: USER_SELECT },
  pinnedBy: { select: USER_SELECT },
  parent: {
    select: {
      id: true,
      kind: true,
      body: true,
      deletedAt: true,
      sender: { select: USER_SELECT },
      attachments: {
        select: { fileName: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  },
  attachments: { select: ATTACHMENT_SELECT, orderBy: { createdAt: 'asc' } },
  mentions: { select: { user: { select: USER_SELECT } } },
  reactions: {
    select: { emoji: true, user: { select: USER_SELECT } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TeamMessageInclude;

export type MessageRow = Prisma.TeamMessageGetPayload<{
  include: typeof MESSAGE_INCLUDE;
}>;

/** Newest-first or oldest-first on the (createdAt, id) cursor (B7). */
export const ORDER_ASC: Prisma.TeamMessageOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];
export const ORDER_DESC: Prisma.TeamMessageOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

export function messagePreview(m: {
  kind: string;
  body: string;
  deletedAt: Date | null;
  attachments?: { fileName: string }[];
}): string {
  if (m.deletedAt) return 'This message was deleted';
  const body = m.body.trim();
  if (body) return body.length > 120 ? `${body.slice(0, 120)}…` : body;
  const file = m.attachments?.[0]?.fileName;
  return file ? `📎 ${file}` : '📎 Attachment';
}

export function aggregateReactions(
  rows: { emoji: string; user: UserRow }[],
  viewerId: string,
) {
  const byEmoji = new Map<
    string,
    {
      emoji: string;
      count: number;
      me: boolean;
      users: { id: string; name: string }[];
    }
  >();
  for (const r of rows) {
    const entry = byEmoji.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      me: false,
      users: [],
    };
    entry.count += 1;
    entry.me ||= r.user.id === viewerId;
    entry.users.push(userRef(r.user));
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.values()];
}

export function serializeMessage(m: MessageRow, viewerId: string) {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    conversationId: m.channelId,
    kind: m.kind,
    body: deleted ? '' : m.body,
    sender: m.sender ? userRef(m.sender) : null,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    forwarded: m.forwarded,
    pinnedAt: m.pinnedAt,
    pinnedBy: m.pinnedBy ? userRef(m.pinnedBy) : null,
    // The sender matches it to their optimistic bubble. Socket broadcasts
    // carry the sender's view, so other members may see it too: it is a
    // random client-generated id, not a secret.
    clientMsgId: m.clientMsgId,
    parent: m.parent
      ? {
          id: m.parent.id,
          sender: m.parent.sender ? userRef(m.parent.sender) : null,
          preview: messagePreview(m.parent),
          deleted: !!m.parent.deletedAt,
        }
      : null,
    attachments: deleted ? [] : m.attachments,
    mentions: deleted ? [] : m.mentions.map((x) => userRef(x.user)),
    reactions: deleted ? [] : aggregateReactions(m.reactions, viewerId),
    cursor: encodeCursor(m),
  };
}

export type SerializedMessage = ReturnType<typeof serializeMessage>;

// ---------------------------------------------------------------------------
// Cursor: opaque base64url of "<ISO createdAt>|<id>"
// ---------------------------------------------------------------------------

export interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(m: { createdAt: Date; id: string }): string {
  return Buffer.from(`${m.createdAt.toISOString()}|${m.id}`).toString(
    'base64url',
  );
}

export function decodeCursor(raw: string): Cursor {
  try {
    const [iso, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) throw new Error('bad');
    return { createdAt, id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

/** Prisma filter for rows strictly before / after a cursor on (createdAt, id). */
export function cursorWhere(
  c: Cursor,
  direction: 'before' | 'after',
): Prisma.TeamMessageWhereInput {
  const op = direction === 'before' ? 'lt' : 'gt';
  return {
    OR: [
      { createdAt: { [op]: c.createdAt } },
      { createdAt: c.createdAt, id: { [op]: c.id } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** "a:b" with the ids sorted — the DM's identity (unique per org). */
export function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function dmPeerId(
  dmKey: string | null,
  viewerId: string,
): string | null {
  if (!dmKey) return null;
  const [a, b] = dmKey.split(':');
  if (a === viewerId) return b ?? null;
  if (b === viewerId) return a ?? null;
  return null;
}

/** A single emoji (incl. ZWJ sequences, skin tones, flags, keycaps). */
const EMOJI_RE =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|️|‍|⃣)*$/u;

export function assertEmoji(value: string): string {
  const emoji = value.trim();
  if (!EMOJI_RE.test(emoji)) {
    throw new BadRequestException('Reaction must be a single emoji');
  }
  return emoji;
}
