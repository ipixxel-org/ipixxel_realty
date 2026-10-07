import { apiFetch } from "@/lib/api";
import type {
  ChatConversation,
  ChatMember,
  ChatMessage,
  ChatReaction,
  ChatSearchResult,
  MessagePage,
  UnreadSummary,
} from "./types";

const BASE = "/org/team-chat";

const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(`${BASE}${path}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export function listConversations(): Promise<{
  conversations: ChatConversation[];
  totalUnread: number;
}> {
  return apiFetch(`${BASE}/conversations`);
}

export function getConversation(id: string): Promise<ChatConversation> {
  return apiFetch(`${BASE}/conversations/${id}`);
}

export function listMembers(id: string): Promise<ChatMember[]> {
  return apiFetch(`${BASE}/conversations/${id}/members`);
}

export function createChannel(input: {
  name: string;
  memberIds: string[];
}): Promise<ChatConversation> {
  return post("/channels", input);
}

export function renameChannel(id: string, name: string): Promise<ChatConversation> {
  return apiFetch(`${BASE}/channels/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteChannel(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiFetch(`${BASE}/channels/${id}`, { method: "DELETE" });
}

export function addMembers(
  id: string,
  userIds: string[],
): Promise<{ added: string[]; members: ChatMember[] }> {
  return post(`/channels/${id}/members`, { userIds });
}

export function removeMember(
  id: string,
  userId: string,
): Promise<{ removed: string; members: ChatMember[] }> {
  return apiFetch(`${BASE}/channels/${id}/members/${userId}`, { method: "DELETE" });
}

export function leaveChannel(id: string): Promise<{ id: string; left: boolean }> {
  return post(`/channels/${id}/leave`);
}

export function openDm(userId: string): Promise<ChatConversation> {
  return post("/dms", { userId });
}

export function searchChat(q: string): Promise<ChatSearchResult> {
  return apiFetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
}

export function listMessages(
  id: string,
  params: { before?: string; after?: string; around?: string; limit?: number } = {},
): Promise<MessagePage> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch(`${BASE}/conversations/${id}/messages${suffix}`);
}

export function searchMessages(
  id: string,
  q: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> {
  const qs = new URLSearchParams({ q });
  if (before) qs.set("before", before);
  return apiFetch(`${BASE}/conversations/${id}/messages/search?${qs}`);
}

export function sendMessage(
  id: string,
  input: { body: string; clientMsgId: string; parentId?: string },
): Promise<ChatMessage> {
  return post(`/conversations/${id}/messages`, input);
}

export function markRead(id: string, messageId?: string): Promise<UnreadSummary> {
  return post(`/conversations/${id}/read`, messageId ? { messageId } : {});
}

export function reactToMessage(
  messageId: string,
  emoji: string,
): Promise<{ messageId: string; reactions: ChatReaction[] }> {
  return apiFetch(`${BASE}/messages/${messageId}/reaction`, {
    method: "PUT",
    body: JSON.stringify({ emoji }),
  });
}
