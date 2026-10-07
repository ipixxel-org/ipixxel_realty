"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2, SmilePlus } from "lucide-react";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import * as chatApi from "@/lib/team-chat/api";
import { useTeamChat } from "@/lib/team-chat/context";
import {
  avatarColor,
  dayLabel,
  initials,
  lastSeenLabel,
  newClientMsgId,
  sameDay,
  timeOfDay,
  typingLine,
} from "@/lib/team-chat/format";
import type {
  ChatMessage,
  MessageDeletedEvent,
  ReactionEvent,
} from "@/lib/team-chat/types";
import { Avatar, ConfirmDialog, PromptDialog, errorText } from "./chat-ui";
import { AttachmentsView } from "./attachments-view";
import { Composer, type ComposerHandle, type SentAttachment } from "./composer";
import { MembersDrawer } from "./members-drawer";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 120;

// --- message list helpers --------------------------------------------------
const byTime = (a: ChatMessage, b: ChatMessage) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Adds or replaces messages (by id, or an optimistic one by clientMsgId). */
function merge(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const out = [...list];
  for (const m of incoming) {
    const i = out.findIndex(
      (x) => x.id === m.id || (!!m.clientMsgId && !!x.status && x.clientMsgId === m.clientMsgId),
    );
    if (i >= 0) out[i] = m;
    else out.push(m);
  }
  const seen = new Set<string>();
  return out
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort(byTime);
}

const realCursor = (list: ChatMessage[], from: "first" | "last") => {
  const real = list.filter((m) => !m.status);
  const m = from === "first" ? real[0] : real[real.length - 1];
  return m?.cursor || null;
};

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type PendingScroll =
  | { type: "bottom" }
  | { type: "preserve"; height: number; top: number }
  | { type: "message"; id: string; block: ScrollLogicalPosition };

export function ThreadView({
  conversationId,
  onBack,
  onOpenConversation,
}: {
  conversationId: string;
  onBack: () => void;
  onOpenConversation: (id: string | null) => void;
}) {
  const chat = useTeamChat();
  const { user, hasPermission, isOrgAdmin } = useAuth();
  const { toast } = useToast();
  const myId = user?.id ?? "";
  const myName = useMemo(
    () => [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "You",
    [user],
  );
  const conv = chat?.conversations?.find((c) => c.id === conversationId) ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [hasMoreAfter, setHasMoreAfter] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [dividerId, setDividerId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [panel, setPanel] = useState<"none" | "search" | "members">("none");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"none" | "rename" | "leave" | "delete">("none");
  const [focusTick, setFocusTick] = useState(0);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<ComposerHandle>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<PendingScroll | null>(null);
  const unreadAtOpen = useRef(0);
  const atBottomRef = useRef(true);
  const stateRef = useRef({ hasMoreAfter, loadingOlder, loadingNewer, hasMoreBefore, messages });
  useLayoutEffect(() => {
    stateRef.current = { hasMoreAfter, loadingOlder, loadingNewer, hasMoreBefore, messages };
  });

  /** Reactions arrive in the sender's view; "mine" is recomputed here. */
  const forMe = useCallback(
    (m: ChatMessage): ChatMessage => ({
      ...m,
      reactions: m.reactions.map((r) => ({ ...r, me: r.users.some((u) => u.id === myId) })),
    }),
    [myId],
  );

  // --- initial load per conversation ---------------------------------------
  useEffect(() => {
    let cancelled = false;
    unreadAtOpen.current = chat?.conversations?.find((c) => c.id === conversationId)?.unread ?? 0;
    chatApi
      .listMessages(conversationId)
      .then((page) => {
        if (cancelled) return;
        const list = page.messages.map(forMe);
        // "New messages" divider before the first unread message.
        let remaining = unreadAtOpen.current;
        let divider: string | null = null;
        for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
          const m = list[i];
          if (m.kind === "system" || m.deletedAt || m.sender?.id === myId) continue;
          remaining -= 1;
          divider = m.id;
        }
        setDividerId(divider);
        setMessages(list);
        setHasMoreBefore(page.hasMoreBefore);
        setHasMoreAfter(page.hasMoreAfter);
        pendingScroll.current = divider ? { type: "message", id: divider, block: "start" } : { type: "bottom" };
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, "Couldn't load messages"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once per conversation (keyed by the page)
  }, [conversationId]);

  // Apply scroll intents after the DOM has the new messages.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const intent = pendingScroll.current;
    if (!el || !intent) return;
    pendingScroll.current = null;
    if (intent.type === "bottom") {
      el.scrollTop = el.scrollHeight;
    } else if (intent.type === "preserve") {
      el.scrollTop = intent.top + (el.scrollHeight - intent.height);
    } else {
      const node = el.querySelector(`[data-mid="${intent.id}"]`);
      if (node) node.scrollIntoView({ block: intent.block });
      else el.scrollTop = el.scrollHeight;
    }
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < NEAR_BOTTOM_PX;
    setAtBottom(atBottomRef.current);
  }, [messages]);

  // --- paging ---------------------------------------------------------------
  const loadOlder = useCallback(async () => {
    const s = stateRef.current;
    const cursor = realCursor(s.messages, "first");
    if (!s.hasMoreBefore || s.loadingOlder || !cursor) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.listMessages(conversationId, { before: cursor });
      const el = scrollRef.current;
      if (el) pendingScroll.current = { type: "preserve", height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => merge(prev, page.messages.map(forMe)));
      setHasMoreBefore(page.hasMoreBefore);
    } catch (err) {
      toast({ title: "Couldn't load older messages", description: errorText(err, ""), variant: "error" });
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, forMe, toast]);

  const loadNewer = useCallback(async () => {
    const s = stateRef.current;
    const cursor = realCursor(s.messages, "last");
    if (!s.hasMoreAfter || s.loadingNewer || !cursor) return;
    setLoadingNewer(true);
    try {
      const page = await chatApi.listMessages(conversationId, { after: cursor });
      setMessages((prev) => merge(prev, page.messages.map(forMe)));
      setHasMoreAfter(page.hasMoreAfter);
    } finally {
      setLoadingNewer(false);
    }
  }, [conversationId, forMe]);

  const jumpToLatest = useCallback(async () => {
    setNewCount(0);
    if (stateRef.current.hasMoreAfter) {
      const page = await chatApi.listMessages(conversationId);
      pendingScroll.current = { type: "bottom" };
      setMessages(page.messages.map(forMe));
      setHasMoreBefore(page.hasMoreBefore);
      setHasMoreAfter(false);
      return;
    }
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [conversationId, forMe]);

  const jumpTo = useCallback(
    async (messageId: string) => {
      if (stateRef.current.messages.some((m) => m.id === messageId)) {
        pendingScroll.current = { type: "message", id: messageId, block: "center" };
        setMessages((prev) => [...prev]);
      } else {
        try {
          const page = await chatApi.listMessages(conversationId, { around: messageId });
          pendingScroll.current = { type: "message", id: messageId, block: "center" };
          setMessages(page.messages.map(forMe));
          setHasMoreBefore(page.hasMoreBefore);
          setHasMoreAfter(page.hasMoreAfter);
        } catch (err) {
          toast({ title: "Couldn't open that message", description: errorText(err, ""), variant: "error" });
          return;
        }
      }
      setHighlightId(messageId);
      window.setTimeout(() => setHighlightId((h) => (h === messageId ? null : h)), 2500);
    },
    [conversationId, forMe, toast],
  );

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = dist < NEAR_BOTTOM_PX;
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom;
      setAtBottom(bottom);
    }
    if (bottom && !stateRef.current.hasMoreAfter) setNewCount(0);
    if (el.scrollTop < 200) void loadOlder();
    if (dist < 200) void loadNewer();
  };

  // --- live events ----------------------------------------------------------
  useEffect(() => {
    if (!chat) return;
    const offs = [
      chat.on<ChatMessage>("message:new", (m) => {
        if (m.conversationId !== conversationId) return;
        const mine = m.sender?.id === myId;
        if (stateRef.current.hasMoreAfter) {
          // Viewing older history: don't open a gap, just count it.
          if (!mine) setNewCount((n) => n + 1);
          return;
        }
        if (atBottomRef.current || mine) pendingScroll.current = { type: "bottom" };
        else if (m.kind !== "system") setNewCount((n) => n + 1);
        setMessages((prev) => merge(prev, [forMe(m)]));
      }),
      chat.on<ChatMessage>("message:updated", (m) => {
        if (m.conversationId !== conversationId) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? merge(prev, [forMe(m)]) : prev));
      }),
      chat.on<MessageDeletedEvent>("message:deleted", (e) => {
        if (e.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === e.id
              ? { ...m, deletedAt: e.deletedAt, body: "", attachments: [], reactions: [], mentions: [], pinnedAt: null }
              : m,
          ),
        );
      }),
      chat.on<ReactionEvent>("reaction:updated", (e) => {
        if (e.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === e.messageId
              ? { ...m, reactions: e.reactions.map((r) => ({ ...r, me: r.users.some((u) => u.id === myId) })) }
              : m,
          ),
        );
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [chat, conversationId, forMe, myId]);

  // Reconnected: fetch whatever arrived while the socket was down.
  const resync = chat?.resyncCount ?? 0;
  useEffect(() => {
    if (resync === 0) return;
    let cancelled = false;
    (async () => {
      if (stateRef.current.hasMoreAfter) return;
      for (let i = 0; i < 10 && !cancelled; i++) {
        const cursor = realCursor(stateRef.current.messages, "last");
        const page = cursor
          ? await chatApi.listMessages(conversationId, { after: cursor, limit: 100 })
          : await chatApi.listMessages(conversationId);
        if (cancelled) return;
        if (page.messages.length) {
          if (atBottomRef.current) pendingScroll.current = { type: "bottom" };
          setMessages((prev) => merge(prev, page.messages.map(forMe)));
          stateRef.current.messages = merge(stateRef.current.messages, page.messages);
        }
        if (!page.hasMoreAfter) break;
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resync, conversationId, forMe]);

  // --- mark read: conversation open + tab visible and focused ---------------
  useEffect(() => {
    const bump = () => setFocusTick((n) => n + 1);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  const unread = conv?.unread ?? 0;
  useEffect(() => {
    if (!chat || loading || unread === 0) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    const t = window.setTimeout(() => void chat.markRead(conversationId), 400);
    return () => window.clearTimeout(t);
  }, [chat, conversationId, unread, loading, focusTick]);

  // --- sending --------------------------------------------------------------
  const deliver = useCallback(
    async (optimistic: ChatMessage) => {
      try {
        const real = await chatApi.sendMessage(conversationId, {
          body: optimistic.body,
          clientMsgId: optimistic.clientMsgId as string,
          attachmentIds: optimistic.attachments.map((a) => a.id),
        });
        setMessages((prev) => merge(prev, [forMe(real)]));
        chat?.applyMessage(real);
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...m, status: "failed" } : m)));
        toast({ title: "Message not sent", description: errorText(err, "Check your connection and retry"), variant: "error" });
      }
    },
    [chat, conversationId, forMe, toast],
  );

  const send = useCallback(
    (body: string, files: SentAttachment[] = []) => {
      const clientMsgId = newClientMsgId();
      const optimistic: ChatMessage = {
        id: `pending-${clientMsgId}`,
        conversationId,
        kind: files.length ? "file" : "text",
        body,
        sender: { id: myId, name: myName },
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        forwarded: false,
        pinnedAt: null,
        pinnedBy: null,
        clientMsgId,
        parent: null,
        // Shown from their local previews until the page is reloaded.
        attachments: files.map(({ previewUrl: _preview, ...a }) => (void _preview, a)),
        mentions: [],
        reactions: [],
        cursor: "",
        status: "sending",
      };
      setDividerId(null);
      if (stateRef.current.hasMoreAfter) {
        // Jump back to the present first so the new message isn't orphaned.
        void jumpToLatest().then(() => {
          pendingScroll.current = { type: "bottom" };
          setMessages((prev) => merge(prev, [optimistic]));
        });
      } else {
        pendingScroll.current = { type: "bottom" };
        setMessages((prev) => merge(prev, [optimistic]));
      }
      void deliver(optimistic);
    },
    [conversationId, deliver, jumpToLatest, myId, myName],
  );

  const retry = (m: ChatMessage) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "sending" } : x)));
    void deliver(m);
  };

  const react = async (m: ChatMessage, emoji: string) => {
    try {
      const res = await chatApi.reactToMessage(m.id, emoji);
      setMessages((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? { ...x, reactions: res.reactions.map((r) => ({ ...r, me: r.users.some((u) => u.id === myId) })) }
            : x,
        ),
      );
    } catch (err) {
      toast({ title: "Couldn't react", description: errorText(err, ""), variant: "error" });
    }
  };

  // --- render ---------------------------------------------------------------
  if (!chat) return null;

  const removed = chat.removedReason(conversationId);
  if (!conv) {
    return (
      <section className="tch-center tch-center-empty">
        <div className="tch-thread-empty">
          {removed ? (
            <>
              <h3>
                {removed === "deleted"
                  ? "This channel was deleted"
                  : removed === "left"
                    ? "You left this channel"
                    : "You're no longer in this conversation"}
              </h3>
              <button type="button" className="tch-btn-msg" onClick={() => onOpenConversation(null)}>
                Back to chats
              </button>
            </>
          ) : chat.conversations === null ? (
            <Loader2 className="tch-spin" />
          ) : (
            <>
              <h3>Conversation not found</h3>
              <button type="button" className="tch-btn-msg" onClick={() => onOpenConversation(null)}>
                Back to chats
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  const isOrgAdminUser = isOrgAdmin();
  const canManage = conv.kind === "channel" && (conv.myRole === "admin" || hasPermission("team_chat", "edit"));
  const canRename = conv.kind === "channel" ? canManage : conv.kind === "general" && isOrgAdminUser;
  const canDelete = conv.kind === "channel" && hasPermission("team_chat", "delete");
  const canLeave = conv.kind === "channel";

  const typists = chat.typingIn(conversationId).filter((t) => t.userId !== myId);
  const peerPresence = conv.peer
    ? chat.presenceOf(conv.peer.id, { online: conv.peer.online, lastSeenAt: conv.peer.lastSeenAt })
    : null;
  const peerOnline = !!peerPresence?.online && !conv.readOnly;
  const subtitle =
    conv.kind === "dm"
      ? typists.length
        ? "typing…"
        : conv.readOnly
          ? "No longer active"
          : peerOnline
            ? "online"
            : lastSeenLabel(peerPresence?.lastSeenAt ?? null) || "Direct message conversation"
      : typists.length
        ? typingLine(typists.map((t) => t.name))
        : `${conv.memberCount} member${conv.memberCount === 1 ? "" : "s"}`;

  return (
    <section className="tch-center">
      <header className="tch-center-head">
        <button type="button" className="tch-icon-action tch-back" onClick={onBack} aria-label="Back to chats">
          <Icon name="chevron-left" size={18} />
        </button>
        <button
          type="button"
          className="tch-center-title-area"
          onClick={() => setPanel(panel === "members" ? "none" : "members")}
          title={conv.kind === "dm" ? "Contact info" : "Members"}
        >
          <div className="tch-center-channel-name">
            {conv.kind === "dm" ? (
              <Avatar id={conv.peer?.id ?? conv.id} name={conv.name} size={24} online={peerOnline} />
            ) : (
              <span className="tch-hash">#</span>
            )}
            <span>{conv.name}</span>
          </div>
          <div className={`tch-center-sub${typists.length ? " is-typing" : peerOnline ? " is-online" : ""}`}>{subtitle}</div>
        </button>

        <div className="tch-center-actions">
          <button
            type="button"
            className={`tch-icon-action${panel === "search" ? " is-on" : ""}`}
            title={conv.kind === "dm" ? "Search in conversation" : "Search in channel"}
            onClick={() => setPanel(panel === "search" ? "none" : "search")}
          >
            <Icon name="search" size={17} />
          </button>
          <button
            type="button"
            className={`tch-icon-action${panel === "members" ? " is-on" : ""}`}
            title="Members"
            onClick={() => setPanel(panel === "members" ? "none" : "members")}
          >
            <Icon name="users" size={17} />
          </button>
          {canRename || canLeave || canDelete ? (
            <div className="tch-menu-wrap">
              <button type="button" className="tch-icon-action" title="More options" onClick={() => setMenuOpen((o) => !o)}>
                <Icon name="dots" size={17} />
              </button>
              {menuOpen ? (
                <div className="tch-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                  {canRename ? (
                    <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), setDialog("rename"))}>
                      <Icon name="edit" size={14} /> Rename
                    </button>
                  ) : null}
                  {canLeave ? (
                    <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), setDialog("leave"))}>
                      <Icon name="logout" size={14} /> Leave channel
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button type="button" role="menuitem" className="is-danger" onClick={() => (setMenuOpen(false), setDialog("delete"))}>
                      <Icon name="trash" size={14} /> Delete channel
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="tch-thread-body">
        <div
          className="tch-thread-main"
          onDragEnter={(e) => {
            if (!conv.readOnly && e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragOver={(e) => {
            if (!conv.readOnly && e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            if (conv.readOnly || !e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragging(false);
            composerRef.current?.addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {dragging ? (
            <div className="tch-drop-overlay">
              <Icon name="link" size={22} />
              <span>Drop files to send</span>
            </div>
          ) : null}
          {panel === "search" ? (
            <ConversationSearch
              conversationId={conversationId}
              onClose={() => setPanel("none")}
              onJump={(id) => void jumpTo(id)}
            />
          ) : null}

          <div className="tch-msgs-area" ref={scrollRef} onScroll={onScroll}>
            {loading ? (
              <div className="tch-loading">
                <Loader2 className="tch-spin" />
              </div>
            ) : loadError ? (
              <div className="tch-loading">
                <p>{loadError}</p>
              </div>
            ) : (
              <>
                {hasMoreBefore ? (
                  <div className="tch-older">{loadingOlder ? <Loader2 size={16} className="tch-spin" /> : null}</div>
                ) : null}
                {messages.filter((m) => m.kind !== "system").length === 0 ? (
                  <div className="tch-empty-thread">
                    <p>
                      {conv.kind === "dm"
                        ? `No messages yet. Say hello to ${conv.name}!`
                        : "No messages yet. Start the conversation!"}
                    </p>
                  </div>
                ) : null}
                <MessageList
                  messages={messages}
                  myId={myId}
                  dividerId={dividerId}
                  highlightId={highlightId}
                  onRetry={retry}
                  onReact={react}
                  canReact={!conv.readOnly}
                />
                {hasMoreAfter ? (
                  <div className="tch-older">{loadingNewer ? <Loader2 size={16} className="tch-spin" /> : null}</div>
                ) : null}
              </>
            )}
          </div>

          {typists.length ? (
            <div className="tch-typing" aria-live="polite">
              <span className="tch-typing-dots">
                <i />
                <i />
                <i />
              </span>
              {conv.kind === "dm" ? `${conv.name.split(" ")[0]} is typing…` : typingLine(typists.map((t) => t.name))}
            </div>
          ) : null}

          {!atBottom || hasMoreAfter ? (
            <button type="button" className="tch-jump" onClick={() => void jumpToLatest()} aria-label="Jump to latest">
              {newCount > 0 ? <span className="tch-jump-count">{newCount}</span> : null}
              <Icon name="arrow-down" size={16} />
            </button>
          ) : null}

          {conv.readOnly ? (
            <div className="tch-readonly">
              You can&apos;t reply to this conversation — {conv.name} is no longer active.
            </div>
          ) : (
            <Composer
              key={conversationId}
              ref={composerRef}
              conversationId={conversationId}
              onSend={send}
              onTyping={(t) => chat.sendTyping(conversationId, t)}
            />
          )}
        </div>

        {panel === "members" ? (
          <MembersDrawer conversation={conv} canManage={canManage} onClose={() => setPanel("none")} onOpenConversation={onOpenConversation} />
        ) : null}
      </div>

      {dialog === "rename" ? (
        <PromptDialog
          title={conv.kind === "general" ? "Rename General" : "Rename channel"}
          label="Channel name"
          initial={conv.name}
          maxLength={80}
          confirmLabel="Save"
          onClose={() => setDialog("none")}
          onSubmit={async (name) => {
            const updated = await chatApi.renameChannel(conv.id, name);
            chat.upsertConversation(updated);
          }}
        />
      ) : null}
      {dialog === "leave" ? (
        <ConfirmDialog
          title="Leave channel?"
          message={<>You&apos;ll stop receiving messages from #{conv.name}. A channel admin can add you back.</>}
          confirmLabel="Leave"
          danger
          onClose={() => setDialog("none")}
          onConfirm={async () => {
            await chatApi.leaveChannel(conv.id);
            chat.removeConversation(conv.id);
            onOpenConversation(null);
          }}
        />
      ) : null}
      {dialog === "delete" ? (
        <ConfirmDialog
          title="Delete channel?"
          message={<>#{conv.name} and all of its messages will be deleted for everyone. This can&apos;t be undone.</>}
          confirmLabel="Delete channel"
          danger
          onClose={() => setDialog("none")}
          onConfirm={async () => {
            await chatApi.deleteChannel(conv.id);
            chat.removeConversation(conv.id);
            onOpenConversation(null);
          }}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

function MessageList({
  messages,
  myId,
  dividerId,
  highlightId,
  onRetry,
  onReact,
  canReact,
}: {
  messages: ChatMessage[];
  myId: string;
  dividerId: string | null;
  highlightId: string | null;
  onRetry: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  canReact: boolean;
}) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
        const grouped =
          !newDay &&
          !!prev &&
          prev.kind !== "system" &&
          m.kind !== "system" &&
          prev.sender?.id === m.sender?.id &&
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS &&
          m.id !== dividerId;
        return (
          <Fragment key={m.id}>
            {newDay ? <div className="tch-date-divider">{dayLabel(m.createdAt)}</div> : null}
            {m.id === dividerId ? (
              <div className="tch-new-divider">
                <span>New messages</span>
              </div>
            ) : null}
            {m.kind === "system" ? (
              <div className="tch-system" data-mid={m.id}>
                {m.body}
              </div>
            ) : (
              <MessageRow
                m={m}
                mine={m.sender?.id === myId}
                grouped={grouped}
                highlighted={m.id === highlightId}
                onRetry={onRetry}
                onReact={onReact}
                canReact={canReact && !m.status && !m.deletedAt}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** Your messages on the right, everyone else's on the left (avatar + name
 *  shown on the first of a run). Time sits inside the bubble. */
function MessageRow({
  m,
  mine,
  grouped,
  highlighted,
  onRetry,
  onReact,
  canReact,
}: {
  m: ChatMessage;
  mine: boolean;
  grouped: boolean;
  highlighted: boolean;
  onRetry: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  canReact: boolean;
}) {
  const [picker, setPicker] = useState(false);
  const deleted = !!m.deletedAt;
  const name = m.sender?.name ?? "Deleted user";
  return (
    <div
      data-mid={m.id}
      className={`tch-msg-row${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}${highlighted ? " is-highlight" : ""}${m.status === "failed" ? " is-failed" : ""}`}
      onMouseLeave={() => setPicker(false)}
    >
      {mine ? null : grouped ? (
        <div className="tch-msg-avatar-space" />
      ) : (
        <div className="tch-msg-avatar" style={{ background: avatarColor(m.sender?.id ?? m.id) }}>
          {initials(name)}
        </div>
      )}
      <div className="tch-msg-content">
        {!mine && !grouped ? (
          <div className="tch-msg-meta">
            <span className="tch-msg-sender">{name}</span>
          </div>
        ) : null}
        <div className={`tch-bubble${deleted ? " is-deleted" : ""}`}>
          {m.forwarded && !deleted ? <div className="tch-msg-forwarded">Forwarded</div> : null}
          {m.parent && !deleted ? (
            <div className="tch-quote">
              <strong>{m.parent.sender?.name ?? "Message"}</strong>
              <span>{m.parent.preview}</span>
            </div>
          ) : null}
          {deleted ? (
            <div className="tch-msg-text is-deleted">This message was deleted</div>
          ) : m.body ? (
            <div className="tch-msg-text">{linkify(m.body)}</div>
          ) : null}
          {!deleted && m.attachments.length ? <AttachmentsView attachments={m.attachments} /> : null}
          <span className="tch-bubble-time">
            {m.editedAt && !deleted ? "edited · " : ""}
            {m.status === "sending" ? "Sending…" : timeOfDay(m.createdAt)}
          </span>
        </div>
        {m.status === "failed" ? (
          <button type="button" className="tch-retry" onClick={() => onRetry(m)}>
            Not sent · Retry
          </button>
        ) : null}
        {m.reactions.length ? (
          <div className="tch-reactions">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`tch-reaction-pill${r.me ? " is-me" : ""}`}
                title={r.users.map((u) => u.name).join(", ")}
                onClick={() => canReact && onReact(m, r.emoji)}
                disabled={!canReact}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {canReact ? (
        <div className="tch-msg-tools">
          {picker ? (
            <div className="tch-quick-react">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setPicker(false);
                    onReact(m, e);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="tch-icon-action" onClick={() => setPicker(true)} title="React">
              <SmilePlus size={16} />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConversationSearch({
  conversationId,
  onClose,
  onJump,
}: {
  conversationId: string;
  onClose: () => void;
  onJump: (messageId: string) => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const [found, setFound] = useState<{ term: string; messages: ChatMessage[] } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!term) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      let messages: ChatMessage[] = [];
      try {
        messages = (await chatApi.searchMessages(conversationId, term)).messages;
      } catch {
        // Shown as "no matches".
      }
      if (mine === seq.current) setFound({ term, messages });
    }, 300);
    return () => window.clearTimeout(t);
  }, [term, conversationId]);

  const loading = !!term && found?.term !== term;
  const results = term && found?.term === term ? found.messages : term ? [] : null;

  return (
    <div className="tch-conv-search">
      <div className="tch-search-input-box">
        <Icon name="search" size={15} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" />
        {loading ? <Loader2 size={14} className="tch-spin" /> : null}
        <button type="button" className="tch-clear" onClick={onClose} aria-label="Close search">
          <Icon name="close" size={13} />
        </button>
      </div>
      {results ? (
        <ul className="tch-conv-results">
          {results.length === 0 && !loading ? (
            <li className="tch-empty-line">No messages match “{q.trim()}”</li>
          ) : (
            results.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onJump(m.id)}>
                  <span className="tch-res-top">
                    <strong>{m.sender?.name ?? "System"}</strong>
                    <small>{dayLabel(m.createdAt)} · {timeOfDay(m.createdAt)}</small>
                  </span>
                  <span className="tch-res-body">{m.body}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

