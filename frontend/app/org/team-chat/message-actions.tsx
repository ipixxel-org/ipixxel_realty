"use client";

import dynamic from "next/dynamic";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type TouchEvent,
} from "react";
import { Copy, CornerUpLeft, Forward, Loader2, Pin, PinOff, Plus, SmilePlus } from "lucide-react";
import { Icon } from "@/components/icons";
import { useTeamChat } from "@/lib/team-chat/context";
import { previewOf } from "@/lib/team-chat/format";
import type { ChatMessage, ChatUserRef } from "@/lib/team-chat/types";
import { Avatar, Modal, OrgPortal, errorText } from "./chat-ui";

const EmojiPicker = dynamic(() => import("./emoji-popover"), {
  ssr: false,
  loading: () => <div className="tch-emoji-pop is-loading">Loading…</div>,
});

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const MAX_FORWARD_TARGETS = 20;
const LONG_PRESS_MS = 450;

// --- which actions a message offers ------------------------------------------

export type MessageAction = "reply" | "forward" | "copy" | "pin" | "unpin" | "edit" | "delete";

export interface ActionPolicy {
  myId: string;
  /** A DM whose other participant is no longer active. */
  readOnly: boolean;
  isDm: boolean;
  /** team_chat:delete — deleting other people's messages in channels. */
  canDeleteOthers: boolean;
}

export function messageActions(m: ChatMessage, p: ActionPolicy): MessageAction[] {
  if (m.kind === "system" || m.status || m.deletedAt) return [];
  const mine = m.sender?.id === p.myId;
  const out: MessageAction[] = [];
  if (!p.readOnly) out.push("reply");
  out.push("forward");
  if (m.body.trim()) out.push("copy");
  if (!p.readOnly) out.push(m.pinnedAt ? "unpin" : "pin");
  // Forwarded copies are yours on paper, but the words are someone else's.
  if (mine && m.kind === "text" && !m.forwarded && !p.readOnly) out.push("edit");
  if (mine || (!p.isDm && p.canDeleteOthers)) out.push("delete");
  return out;
}

const ACTION_LABEL: Record<MessageAction, string> = {
  reply: "Reply",
  forward: "Forward",
  copy: "Copy text",
  pin: "Pin",
  unpin: "Unpin",
  edit: "Edit",
  delete: "Delete",
};

function ActionIcon({ action }: { action: MessageAction }) {
  switch (action) {
    case "reply":
      return <CornerUpLeft size={14} />;
    case "forward":
      return <Forward size={14} />;
    case "copy":
      return <Copy size={14} />;
    case "pin":
      return <Pin size={14} />;
    case "unpin":
      return <PinOff size={14} />;
    case "edit":
      return <Icon name="edit" size={14} />;
    case "delete":
      return <Icon name="trash" size={14} />;
  }
}

// --- floating popovers (fixed, so the scrolling thread can't clip them) -------

function floatAt(anchor: DOMRect, width: number, height: number, alignRight: boolean): CSSProperties {
  const gap = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = anchor.bottom + gap + height <= vh || anchor.top - gap - height < 0;
  const top = below ? Math.min(anchor.bottom + gap, vh - height - gap) : anchor.top - gap - height;
  const left = alignRight ? anchor.right - width : anchor.left;
  return {
    position: "fixed",
    top: Math.max(gap, top),
    left: Math.max(gap, Math.min(left, vw - width - gap)),
    zIndex: 60,
  };
}

/** Closes on an outside click, Escape, or when the thread scrolls. */
function useDismiss(open: boolean, refs: RefObject<HTMLElement | null>[], onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => refs.some((r) => r.current?.contains(t as Node));
    const onDown = (e: MouseEvent) => !inside(e.target) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => !inside(e.target) && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [open, onClose]);
}

/**
 * Desktop hover tools beside a bubble: the quick reaction bar (6 emoji and
 * "+" for the full picker) and the "more" menu with the message actions.
 */
export function MessageTools({
  canReact,
  actions,
  mine,
  onReact,
  onAction,
}: {
  canReact: boolean;
  actions: MessageAction[];
  mine: boolean;
  onReact: (emoji: string) => void;
  onAction: (action: MessageAction) => void;
}) {
  const [open, setOpen] = useState<"none" | "react" | "emoji" | "menu">("none");
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen("none"), []);
  useDismiss(open !== "none", [wrapRef, popRef], close);

  if (!canReact && actions.length === 0) return null;

  const toggle = (which: "react" | "menu", el: HTMLElement) => {
    setAnchor(el.getBoundingClientRect());
    setOpen((o) => (o === which ? "none" : which));
  };

  const menuHeight = actions.length * 34 + 12;
  return (
    <div className={`tch-msg-tools${open !== "none" ? " is-open" : ""}`} ref={wrapRef}>
      {canReact ? (
        <button
          type="button"
          className="tch-icon-action"
          title="React"
          aria-label="React"
          onClick={(e) => toggle("react", e.currentTarget)}
        >
          <SmilePlus size={16} />
        </button>
      ) : null}
      {actions.length ? (
        <button
          type="button"
          className="tch-icon-action"
          title="More actions"
          aria-label="More actions"
          aria-haspopup="menu"
          onClick={(e) => toggle("menu", e.currentTarget)}
        >
          <Icon name="more-vertical" size={16} />
        </button>
      ) : null}

      {open !== "none" && anchor ? (
        <OrgPortal>
          <div
            ref={popRef}
            className="tch-float"
            style={floatAt(
              anchor,
              open === "emoji" ? 320 : open === "react" ? 260 : 190,
              open === "emoji" ? 380 : open === "react" ? 44 : menuHeight,
              // Open into the free space beside the bubble, not over it.
              mine,
            )}
          >
            {open === "react" ? (
              <QuickReactBar
                onPick={(e) => {
                  close();
                  onReact(e);
                }}
                onMore={() => setOpen("emoji")}
              />
            ) : open === "emoji" ? (
              <div className="tch-float-emoji">
                <EmojiPicker
                  onPick={(e) => {
                    close();
                    onReact(e);
                  }}
                  onClose={close}
                />
              </div>
            ) : (
              <div className="tch-menu tch-msg-menu" role="menu">
                {actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="menuitem"
                    className={a === "delete" ? "is-danger" : undefined}
                    onClick={() => {
                      close();
                      onAction(a);
                    }}
                  >
                    <ActionIcon action={a} /> {ACTION_LABEL[a]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </OrgPortal>
      ) : null}
    </div>
  );
}

function QuickReactBar({ onPick, onMore }: { onPick: (emoji: string) => void; onMore: () => void }) {
  return (
    <div className="tch-quick-react">
      {QUICK_REACTIONS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} aria-label={`React ${e}`}>
          {e}
        </button>
      ))}
      <button type="button" className="tch-quick-more" onClick={onMore} title="More emoji" aria-label="More emoji">
        <Plus size={16} />
      </button>
    </div>
  );
}

// --- mobile: long-press opens an action sheet ---------------------------------

/** Touch long-press. Movement (a scroll) cancels it. */
export function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  if (!enabled) return {};
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      cancel();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        navigator.vibrate?.(10);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      const s = start.current;
      if (s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}

export function MessageActionSheet({
  message,
  canReact,
  actions,
  onReact,
  onAction,
  onClose,
}: {
  message: ChatMessage;
  canReact: boolean;
  actions: MessageAction[];
  onReact: (emoji: string) => void;
  onAction: (action: MessageAction) => void;
  onClose: () => void;
}) {
  const [emoji, setEmoji] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <OrgPortal>
      <div className="tch-modal-backdrop tch-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="tch-sheet" role="dialog" aria-modal="true" aria-label="Message actions">
          <div className="tch-sheet-preview">
            <strong>{message.sender?.name ?? "Message"}</strong>
            <span>{previewOf(message)}</span>
          </div>
          {canReact && !emoji ? (
            <QuickReactBar
              onPick={(e) => {
                onClose();
                onReact(e);
              }}
              onMore={() => setEmoji(true)}
            />
          ) : null}
          {emoji ? (
            <div className="tch-sheet-emoji">
              <EmojiPicker
                onPick={(e) => {
                  onClose();
                  onReact(e);
                }}
                onClose={() => setEmoji(false)}
              />
            </div>
          ) : (
            <div className="tch-sheet-actions">
              {actions.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={a === "delete" ? "is-danger" : undefined}
                  onClick={() => {
                    onClose();
                    onAction(a);
                  }}
                >
                  <ActionIcon action={a} /> {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </OrgPortal>
  );
}

// --- message text: links and @mentions ----------------------------------------

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
function linkify(text: string, keyPrefix: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={`${keyPrefix}-${i}`} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
    ),
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Body text with clickable links and the message's @mentions highlighted. */
export function MessageText({ body, mentions, myId }: { body: string; mentions: ChatUserRef[]; myId: string }) {
  const names = [...new Set(mentions.map((u) => u.name).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return <>{linkify(body, "t")}</>;
  const re = new RegExp(`(@(?:${names.map(escapeRe).join("|")}))`, "g");
  return (
    <>
      {body.split(re).map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{linkify(part, String(i))}</Fragment>;
        const isMe = mentions.some((u) => u.id === myId && `@${u.name}` === part);
        return (
          <span key={i} className={`mention tch-mention${isMe ? " is-me" : ""}`}>
            {part}
          </span>
        );
      })}
    </>
  );
}

// --- pinned messages bar --------------------------------------------------------

/** One pinned message at a time; clicking jumps to it and moves to the next. */
export function PinnedBar({
  pins,
  onJump,
  onUnpin,
}: {
  pins: ChatMessage[];
  onJump: (messageId: string) => void;
  onUnpin: ((m: ChatMessage) => void) | null;
}) {
  const [index, setIndex] = useState(0);
  if (pins.length === 0) return null;
  const i = index % pins.length;
  const current = pins[i];
  return (
    <div className="tch-pinbar">
      {pins.length > 1 ? (
        <span className="tch-pinbar-steps" aria-hidden>
          {pins.map((p, k) => (
            <i key={p.id} className={k === i ? "is-on" : undefined} />
          ))}
        </span>
      ) : null}
      <button
        type="button"
        className="tch-pinbar-main"
        onClick={() => {
          onJump(current.id);
          setIndex((i + 1) % pins.length);
        }}
        title="Go to pinned message"
      >
        <Pin size={14} className="tch-pinbar-icon" />
        <span className="tch-pinbar-text">
          <strong>
            Pinned message{pins.length > 1 ? ` ${i + 1} of ${pins.length}` : ""}
          </strong>
          <span>
            {current.sender?.name ? `${current.sender.name}: ` : ""}
            {previewOf(current)}
          </span>
        </span>
      </button>
      {onUnpin ? (
        <button type="button" className="tch-icon-action" title="Unpin" aria-label="Unpin" onClick={() => onUnpin(current)}>
          <PinOff size={15} />
        </button>
      ) : null}
    </div>
  );
}

// --- forward picker ---------------------------------------------------------------

export function ForwardDialog({
  message,
  onForward,
  onClose,
}: {
  message: ChatMessage;
  onForward: (conversationIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const chat = useTeamChat();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const term = q.trim().toLowerCase();
  const options = (chat?.conversations ?? []).filter(
    (c) => !c.readOnly && (!term || c.name.toLowerCase().includes(term)),
  );

  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_FORWARD_TARGETS ? p : [...p, id],
    );

  const submit = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onForward(picked);
      onClose();
    } catch (err) {
      setError(errorText(err, "Couldn't forward the message"));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Forward message"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="tch-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="tch-btn is-primary" onClick={() => void submit()} disabled={busy || !picked.length}>
            {busy ? <Loader2 size={16} className="tch-spin" /> : null}
            Forward{picked.length ? ` (${picked.length})` : ""}
          </button>
        </>
      }
    >
      <div className="tch-quote tch-forward-preview">
        <strong>{message.sender?.name ?? "Message"}</strong>
        <span>{previewOf(message)}</span>
      </div>
      <div className="tch-picker">
        <div className="tch-picker-input">
          <Icon name="search" size={15} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels and people" />
        </div>
        <ul className="tch-picker-list tch-forward-list">
          {options.length === 0 ? (
            <li className="tch-empty-line">{term ? `No conversations match “${q.trim()}”` : "No conversations"}</li>
          ) : (
            options.map((c) => {
              const on = picked.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`tch-picker-item${on ? " is-picked" : ""}`}
                    onClick={() => toggle(c.id)}
                    aria-pressed={on}
                  >
                    {c.kind === "dm" ? (
                      <Avatar id={c.peer?.id ?? c.id} name={c.name} size={28} />
                    ) : (
                      <span className="tch-forward-hash">#</span>
                    )}
                    <span className="tch-picker-name">{c.name}</span>
                    <span className={`tch-check${on ? " is-on" : ""}`}>{on ? <Icon name="check" size={13} /> : null}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
      {picked.length >= MAX_FORWARD_TARGETS ? (
        <p className="tch-form-hint">You can forward to up to {MAX_FORWARD_TARGETS} conversations at once.</p>
      ) : null}
      {error ? <p className="tch-form-error">{error}</p> : null}
    </Modal>
  );
}
