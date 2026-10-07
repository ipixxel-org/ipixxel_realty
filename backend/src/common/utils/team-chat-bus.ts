import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// In-process signals from the rest of the API to the Team Chat socket
// gateway, so modules that change users, roles or permissions don't need to
// import the chat module. Single API instance, so a plain EventEmitter is
// enough (no Redis). Publish only AFTER the change is committed.
// ---------------------------------------------------------------------------

/** Whose chat access may have changed. Empty = everyone (e.g. a system-wide
 *  role default was edited); orgId only = everyone in that org. */
export interface ChatAccessScope {
  orgId?: string;
  userId?: string;
}

/** A user was added to / removed from a conversation by a lifecycle hook
 *  (joined or left General and group channels). */
export interface ChatMembershipEvent {
  orgId: string;
  channelId: string;
  userId: string;
  change: 'joined' | 'left';
  systemMessageId: string | null;
}

const bus = new EventEmitter();
bus.setMaxListeners(20);

export function publishChatAccessChanged(scope: ChatAccessScope = {}): void {
  bus.emit('access', scope);
}

export function publishChatMembership(events: ChatMembershipEvent[]): void {
  if (events.length) bus.emit('membership', events);
}

export function onChatAccessChanged(
  fn: (scope: ChatAccessScope) => void,
): () => void {
  bus.on('access', fn);
  return () => bus.off('access', fn);
}

export function onChatMembership(
  fn: (events: ChatMembershipEvent[]) => void,
): () => void {
  bus.on('membership', fn);
  return () => bus.off('membership', fn);
}
