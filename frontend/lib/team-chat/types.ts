// Team Chat API shapes (backend: src/modules/team-chat). Dates arrive as ISO
// strings.

export type ConversationKind = "general" | "channel" | "dm";
export type MemberRole = "admin" | "member";

export interface ChatUserRef {
  id: string;
  name: string;
}

export interface ChatPeer {
  id: string;
  name: string;
  email: string;
  active: boolean;
  online: boolean;
  lastSeenAt: string | null;
}

export interface ChatLastMessage {
  id: string;
  kind: ChatMessageKind;
  preview: string;
  sender: ChatUserRef | null;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  kind: ConversationKind;
  name: string;
  myRole: MemberRole;
  memberCount: number;
  /** DMs only: the other participant (null once they're deleted). */
  peer?: ChatPeer | null;
  /** A DM whose other participant is no longer active. */
  readOnly: boolean;
  unread: number;
  lastMessage: ChatLastMessage | null;
  lastMessageAt: string;
  createdAt: string;
}

export type ChatMessageKind = "text" | "file" | "system";

export interface ChatReaction {
  emoji: string;
  count: number;
  me: boolean;
  users: ChatUserRef[];
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  kind: ChatMessageKind;
  body: string;
  sender: ChatUserRef | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  forwarded: boolean;
  pinnedAt: string | null;
  pinnedBy: ChatUserRef | null;
  clientMsgId: string | null;
  parent: {
    id: string;
    sender: ChatUserRef | null;
    preview: string;
    deleted: boolean;
  } | null;
  attachments: ChatAttachment[];
  mentions: ChatUserRef[];
  reactions: ChatReaction[];
  cursor: string;
  /** Client only: an optimistic message still on its way, or failed. */
  status?: "sending" | "failed";
}

export interface MessagePage {
  messages: ChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestCursor: string | null;
  newestCursor: string | null;
}

export interface ChatMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  active: boolean;
  online: boolean;
  joinedAt: string;
  lastSeenAt: string | null;
}

export interface ChatUserResult {
  id: string;
  name: string;
  email: string;
  dmConversationId: string | null;
}

export interface ChatSearchResult {
  conversations: ChatConversation[];
  users: ChatUserResult[];
}

export interface UnreadSummary {
  conversationId: string;
  unread: number;
  totalUnread: number;
}

// --- socket payloads -------------------------------------------------------

export interface UnreadUpdateEvent {
  conversationId: string | null;
  unread: number | null;
  conversations: Record<string, number>;
  totalUnread: number;
}

export interface PresenceEvent {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  name: string;
  typing: boolean;
}

export interface ReactionEvent {
  conversationId: string;
  messageId: string;
  reactions: ChatReaction[];
}

export interface MessageDeletedEvent {
  id: string;
  conversationId: string;
  deletedAt: string;
}
