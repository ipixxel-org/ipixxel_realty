"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Icon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { searchChat } from "@/lib/team-chat/api";
import { avatarColor, initials } from "@/lib/team-chat/format";
import type { ChatUserResult } from "@/lib/team-chat/types";

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** The original round initials avatar, plus a green dot when online. */
export function Avatar({
  id,
  name,
  size = 28,
  online,
}: {
  id: string;
  name: string;
  size?: number;
  online?: boolean;
}) {
  return (
    <span
      className="tch-avatar-circle tch-avatar-rel"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: avatarColor(id) }}
      aria-hidden
    >
      {initials(name)}
      {online ? <span className="tch-online-dot" /> : null}
    </span>
  );
}

/**
 * Renders into document.body, so position:fixed overlays cover the viewport.
 * Inside the page, an animated ancestor of the org layout becomes the
 * containing block and shifts them (same fix as components/org/team-fields).
 * The wrapper re-declares `.org` so its CSS variables and `.org .tch-*`
 * styles still apply; `.org`'s page min-height and background are undone.
 */
export function OrgPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="org tch-portal" style={{ minHeight: 0, background: "transparent" }}>
      {children}
    </div>,
    document.body,
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <OrgPortal>
      <div className="tch-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`tch-modal${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
          <div className="tch-modal-head">
            <h3>{title}</h3>
            <button type="button" className="tch-icon-action" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="tch-modal-body">{children}</div>
          {footer ? <div className="tch-modal-foot">{footer}</div> : null}
        </div>
      </div>
    </OrgPortal>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  requireText,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** The confirm button stays disabled until this exact text is typed. */
  requireText?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const confirmed = !requireText || typed.trim() === requireText.trim();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="tch-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`tch-btn ${danger ? "is-danger" : "is-primary"}`}
            disabled={busy || !confirmed}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                setError(errorText(err, "Something went wrong"));
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 size={16} className="tch-spin" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="tch-modal-text">{message}</p>
      {requireText ? (
        <label className="tch-field">
          <span>
            Type <strong>{requireText}</strong> to confirm
          </span>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
      ) : null}
      {error ? <p className="tch-form-error">{error}</p> : null}
    </Modal>
  );
}

export function PromptDialog({
  title,
  label,
  initial,
  maxLength,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial: string;
  maxLength: number;
  confirmLabel: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="tch-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="tch-btn is-primary" onClick={submit} disabled={busy || !value.trim()}>
            {busy ? <Loader2 size={16} className="tch-spin" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <label className="tch-field">
        <span>{label}</span>
        <input
          autoFocus
          value={value}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </label>
      {error ? <p className="tch-form-error">{error}</p> : null}
    </Modal>
  );
}

/** Debounced people search (only users who can use Team Chat come back). */
export function UserPicker({
  excludeIds,
  onPick,
  placeholder = "Search people by name or email",
  autoFocus,
}: {
  excludeIds: Set<string>;
  onPick: (u: ChatUserResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const [found, setFound] = useState<{ term: string; users: ChatUserResult[] } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!term) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      let users: ChatUserResult[] = [];
      try {
        users = (await searchChat(term)).users;
      } catch {
        // Shown as "no matches".
      }
      if (mine === seq.current) setFound({ term, users });
    }, 250);
    return () => window.clearTimeout(t);
  }, [term]);

  const results = term && found?.term === term ? found.users : term ? [] : null;
  const loading = !!term && found?.term !== term;
  const visible = (results ?? []).filter((u) => !excludeIds.has(u.id));
  return (
    <div className="tch-picker">
      <div className="tch-picker-input">
        <Icon name="search" size={15} />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
        {loading ? <Loader2 size={14} className="tch-spin" /> : null}
      </div>
      {results !== null ? (
        <ul className="tch-picker-list">
          {visible.length === 0 && !loading ? (
            <li className="tch-empty-line">No people match “{q.trim()}”</li>
          ) : (
            visible.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="tch-picker-item"
                  onClick={() => {
                    onPick(u);
                    setQ("");
                  }}
                >
                  <Avatar id={u.id} name={u.name} size={28} />
                  <span className="tch-picker-name">
                    {u.name}
                    <small>{u.email}</small>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
