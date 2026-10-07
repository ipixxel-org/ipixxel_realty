"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import { ApiError } from "@/lib/api";
import * as chatApi from "./api";
import { previewOf } from "./format";
import { createChatSocket, type ChatConnectionStatus } from "./socket";
import type {
  ChatConversation,
  ChatMessage,
  MessageDeletedEvent,
  PresenceEvent,
  TypingEvent,
  UnreadUpdateEvent,
} from "./types";

/** How long a "typing" signal lasts without a refresh from the typist. */
const TYPING_TTL_MS = 6000;

export interface PresenceState {
  online: boolean;
  lastSeenAt: string | null;
}

type Handler = (payload: never) => void;

interface TeamChatContextValue {
  enabled: boolean;
  status: ChatConnectionStatus | "idle";
  /** null until the first load. */
  conversations: ChatConversation[] | null;
  railError: string | null;
  totalUnread: number;
  /** Bumped on every reconnect, so open views refetch what they missed. */
  resyncCount: number;
  reloadRail: () => Promise<void>;
  upsertConversation: (c: ChatConversation) => void;
  removeConversation: (id: string) => void;
  refreshConversation: (id: string) => Promise<ChatConversation | null>;
  markRead: (conversationId: string, messageId?: string) => Promise<void>;
  /** Moves a conversation up the rail with this message as its preview. */
  applyMessage: (m: ChatMessage) => void;
  presenceOf: (userId: string, fallback?: PresenceState) => PresenceState;
  typingIn: (conversationId: string) => { userId: string; name: string }[];
  sendTyping: (conversationId: string, typing: boolean) => void;
  /** Subscribe to a raw socket event; returns an unsubscribe function. */
  on: <T>(event: string, handler: (payload: T) => void) => () => void;
  /** Removed conversations (by id) and why — so an open thread can explain. */
  removedReason: (id: string) => string | null;
}

const TeamChatContext = createContext<TeamChatContextValue | null>(null);

export function useTeamChat(): TeamChatContextValue | null {
  return useContext(TeamChatContext);
}

function sortRail(list: ChatConversation[]): ChatConversation[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime() ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Mounted once by the org shell. Opens the Team Chat socket (only for users
 * with team_chat:view), keeps the conversation rail, the total unread badge,
 * presence and typing state live, and re-syncs after every reconnect.
 */
export function TeamChatProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<ChatConnectionStatus | "idle">("idle");
  const [conversations, setConversations] = useState<ChatConversation[] | null>(null);
  const [railError, setRailError] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [resyncCount, setResyncCount] = useState(0);
  const [presence, setPresence] = useState<Record<string, PresenceState>>({});
  const [typing, setTyping] = useState<
    Record<string, Record<string, { name: string; at: number }>>
  >({});
  const [removed, setRemoved] = useState<Record<string, string>>({});

  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(new Map<string, Set<Handler>>());
  const convsRef = useRef<ChatConversation[] | null>(null);
  useEffect(() => {
    convsRef.current = conversations;
  }, [conversations]);

  const upsertConversation = useCallback((c: ChatConversation) => {
    setConversations((prev) => sortRail([...(prev ?? []).filter((x) => x.id !== c.id), c]));
    if (c.peer) {
      const peer = c.peer;
      setPresence((p) =>
        p[peer.id] ? p : { ...p, [peer.id]: { online: peer.online, lastSeenAt: peer.lastSeenAt } },
      );
    }
  }, []);

  const removeConversation = useCallback((id: string) => {
    setConversations((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }, []);

  const reloadRail = useCallback(async () => {
    try {
      const res = await chatApi.listConversations();
      setConversations(sortRail(res.conversations));
      setTotalUnread(res.totalUnread);
      setRailError(null);
      const next: Record<string, PresenceState> = {};
      for (const c of res.conversations) {
        if (c.peer) next[c.peer.id] = { online: c.peer.online, lastSeenAt: c.peer.lastSeenAt };
      }
      setPresence((p) => ({ ...p, ...next }));
    } catch (err) {
      setRailError(err instanceof ApiError ? err.message : "Couldn't load conversations");
      if (err instanceof ApiError && err.status === 403) setStatus("no-access");
    }
  }, []);

  const refreshConversation = useCallback(
    async (id: string) => {
      try {
        const c = await chatApi.getConversation(id);
        upsertConversation(c);
        return c;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) removeConversation(id);
        return null;
      }
    },
    [removeConversation, upsertConversation],
  );

  const applyUnread = useCallback((counts: Record<string, number>, total: number) => {
    setTotalUnread(total);
    setConversations((prev) =>
      prev
        ? prev.map((c) => (c.id in counts && c.unread !== counts[c.id] ? { ...c, unread: counts[c.id] } : c))
        : prev,
    );
  }, []);

  const markRead = useCallback(
    async (conversationId: string, messageId?: string) => {
      try {
        const s = await chatApi.markRead(conversationId, messageId);
        applyUnread({ [s.conversationId]: s.unread }, s.totalUnread);
      } catch {
        // Best-effort; the next unread:update corrects the badge.
      }
    },
    [applyUnread],
  );

  const applyMessage = useCallback(
    (m: ChatMessage) => {
      const known = convsRef.current?.some((c) => c.id === m.conversationId);
      if (!known) {
        void refreshConversation(m.conversationId);
        return;
      }
      setConversations((prev) =>
        prev
          ? sortRail(
              prev.map((c) =>
                c.id === m.conversationId &&
                new Date(m.createdAt).getTime() >= new Date(c.lastMessageAt).getTime()
                  ? {
                      ...c,
                      lastMessageAt: m.createdAt,
                      lastMessage: {
                        id: m.id,
                        kind: m.kind,
                        preview: previewOf(m),
                        sender: m.sender,
                        createdAt: m.createdAt,
                      },
                    }
                  : c,
              ),
            )
          : prev,
      );
    },
    [refreshConversation],
  );

  const on = useCallback(<T,>(event: string, handler: (payload: T) => void) => {
    const map = handlersRef.current;
    const set = map.get(event) ?? new Set<Handler>();
    set.add(handler as Handler);
    map.set(event, set);
    return () => {
      set.delete(handler as Handler);
    };
  }, []);

  const dispatch = useCallback((event: string, payload: unknown) => {
    handlersRef.current.get(event)?.forEach((h) => (h as (p: unknown) => void)(payload));
  }, []);

  // --- socket lifecycle ----------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    // State is only set once the request resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadRail();
    const { socket, close } = createChatSocket({
      onStatus: setStatus,
      onResync: () => {
        void reloadRail();
        setResyncCount((n) => n + 1);
      },
    });
    socketRef.current = socket;

    socket.on("message:new", (m: ChatMessage) => {
      applyMessage(m);
      if (m.sender) {
        const senderId = m.sender.id;
        setTyping((t) => {
          if (!t[m.conversationId]?.[senderId]) return t;
          const rest = { ...t[m.conversationId] };
          delete rest[senderId];
          return { ...t, [m.conversationId]: rest };
        });
      }
      dispatch("message:new", m);
    });

    socket.on("message:updated", (m: ChatMessage) => dispatch("message:updated", m));

    socket.on("message:deleted", (e: MessageDeletedEvent) => {
      setConversations((prev) =>
        prev
          ? prev.map((c) =>
              c.id === e.conversationId && c.lastMessage?.id === e.id
                ? { ...c, lastMessage: { ...c.lastMessage, preview: "This message was deleted" } }
                : c,
            )
          : prev,
      );
      dispatch("message:deleted", e);
    });

    for (const event of ["pins:updated", "reaction:updated", "members:updated"]) {
      socket.on(event, (p: unknown) => dispatch(event, p));
    }

    socket.on("conversation:created", (p: { conversationId: string }) => {
      setRemoved((r) => {
        if (!(p.conversationId in r)) return r;
        const rest = { ...r };
        delete rest[p.conversationId];
        return rest;
      });
      void refreshConversation(p.conversationId);
      dispatch("conversation:created", p);
    });
    socket.on("conversation:updated", (p: { conversationId: string }) => {
      void refreshConversation(p.conversationId);
      dispatch("conversation:updated", p);
    });
    socket.on("conversation:removed", (p: { conversationId: string; reason: string }) => {
      removeConversation(p.conversationId);
      setRemoved((r) => ({ ...r, [p.conversationId]: p.reason }));
      dispatch("conversation:removed", p);
    });

    socket.on("unread:update", (e: UnreadUpdateEvent) => applyUnread(e.conversations, e.totalUnread));

    socket.on("presence:update", (e: PresenceEvent) => {
      setPresence((p) => ({ ...p, [e.userId]: { online: e.online, lastSeenAt: e.lastSeenAt } }));
      dispatch("presence:update", e);
    });

    socket.on("typing:update", (e: TypingEvent) => {
      setTyping((t) => {
        const conv = { ...(t[e.conversationId] ?? {}) };
        if (e.typing) conv[e.userId] = { name: e.name, at: Date.now() };
        else delete conv[e.userId];
        return { ...t, [e.conversationId]: conv };
      });
    });

    return () => {
      socketRef.current = null;
      close();
    };
  }, [enabled, reloadRail, refreshConversation, removeConversation, applyUnread, applyMessage, dispatch]);

  // Expire stale typing signals (a typist who closed the tab mid-sentence).
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS;
      setTyping((t) => {
        let changed = false;
        const next: typeof t = {};
        for (const [conv, users] of Object.entries(t)) {
          const kept = Object.fromEntries(Object.entries(users).filter(([, v]) => v.at >= cutoff));
          if (Object.keys(kept).length !== Object.keys(users).length) changed = true;
          next[conv] = kept;
        }
        return changed ? next : t;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const presenceOf = useCallback(
    (userId: string, fallback?: PresenceState) =>
      presence[userId] ?? fallback ?? { online: false, lastSeenAt: null },
    [presence],
  );

  const typingIn = useCallback(
    (conversationId: string) =>
      Object.entries(typing[conversationId] ?? {}).map(([userId, v]) => ({ userId, name: v.name })),
    [typing],
  );

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit(isTyping ? "typing:start" : "typing:stop", { conversationId });
  }, []);

  const removedReason = useCallback((id: string) => removed[id] ?? null, [removed]);

  const value = useMemo<TeamChatContextValue>(
    () => ({
      enabled,
      status: enabled ? status : "idle",
      conversations,
      railError,
      totalUnread,
      resyncCount,
      reloadRail,
      upsertConversation,
      removeConversation,
      refreshConversation,
      markRead,
      applyMessage,
      presenceOf,
      typingIn,
      sendTyping,
      on,
      removedReason,
    }),
    [
      enabled,
      status,
      conversations,
      railError,
      totalUnread,
      resyncCount,
      reloadRail,
      upsertConversation,
      removeConversation,
      refreshConversation,
      markRead,
      applyMessage,
      presenceOf,
      typingIn,
      sendTyping,
      on,
      removedReason,
    ],
  );

  return <TeamChatContext.Provider value={value}>{children}</TeamChatContext.Provider>;
}
