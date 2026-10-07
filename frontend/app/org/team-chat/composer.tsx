"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { AlertCircle, FileText, Play, RotateCcw, X } from "lucide-react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import type { ChatAttachment } from "@/lib/team-chat/types";
import {
  MAX_FILES_PER_MESSAGE,
  UploadAborted,
  cancelAttachment,
  formatBytes,
  mediaKind,
  presignAttachment,
  probeMedia,
  putWithProgress,
  rememberLocalPreview,
  type MediaKind,
} from "@/lib/team-chat/uploads";
import { errorText } from "./chat-ui";

// Emoji data is large; it loads the first time the picker is opened.
const EmojiPicker = dynamic(() => import("./emoji-popover"), {
  ssr: false,
  loading: () => <div className="tch-emoji-pop is-loading">Loading…</div>,
});

const TYPING_REFRESH_MS = 3000;

// --- drafts (per conversation, per browser) -------------------------------
const drafts = new Map<string, string>();
const draftKey = (id: string) => `tc.draft.${id}`;
function readDraft(id: string): string {
  if (drafts.has(id)) return drafts.get(id) ?? "";
  try {
    return window.localStorage.getItem(draftKey(id)) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(id: string, text: string) {
  drafts.set(id, text);
  try {
    if (text) window.localStorage.setItem(draftKey(id), text);
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    // Storage unavailable (private mode): the in-memory copy still works.
  }
}

interface PendingFile {
  key: string;
  file: File;
  kind: MediaKind;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  attachment?: ChatAttachment;
  abort: AbortController;
}

/** Stops an upload, frees its preview and deletes it if it was stored. */
function discard(it: PendingFile) {
  it.abort.abort();
  if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
  if (it.attachment) void cancelAttachment(it.attachment.id).catch(() => undefined);
}

/** What the thread needs to show a just-sent file before it's re-fetched. */
export type SentAttachment = ChatAttachment & { previewUrl: string | null };

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
}

export function Composer({
  ref,
  conversationId,
  onSend,
  onTyping,
}: {
  ref?: Ref<ComposerHandle>;
  conversationId: string;
  onSend: (body: string, attachments: SentAttachment[]) => void;
  onTyping: (typing: boolean) => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState(() => readDraft(conversationId));
  const [items, setItems] = useState<PendingFile[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingSentAt = useRef(0);
  const onTypingRef = useRef(onTyping);
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    onTypingRef.current = onTyping;
    itemsRef.current = items;
  });

  const resize = () => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  useLayoutEffect(resize, []);
  useEffect(() => {
    textRef.current?.focus();
  }, []);

  const stopTyping = useCallback(() => {
    if (typingSentAt.current) {
      typingSentAt.current = 0;
      onTypingRef.current(false);
    }
  }, []);
  // Leaving the conversation ends "typing" and drops unsent uploads.
  useEffect(
    () => () => {
      stopTyping();
      for (const it of itemsRef.current) discard(it);
    },
    [stopTyping],
  );

  const patch = (key: string, p: Partial<PendingFile>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  // --- uploads ---------------------------------------------------------------
  const upload = async (it: PendingFile) => {
    try {
      const meta = it.previewUrl ? await probeMedia(it.file, it.previewUrl) : {};
      const pre = await presignAttachment({
        fileName: it.file.name || "file",
        mimeType: it.file.type || "",
        size: it.file.size,
        ...meta,
      });
      if (it.abort.signal.aborted) {
        void cancelAttachment(pre.attachmentId).catch(() => undefined);
        return;
      }
      await putWithProgress(pre.uploadUrl, it.file, pre.headers, (p) => patch(it.key, { progress: p }), it.abort.signal);
      patch(it.key, {
        status: "done",
        progress: 1,
        attachment: {
          id: pre.attachmentId,
          fileName: it.file.name || "file",
          mimeType: pre.headers["Content-Type"] || it.file.type || "application/octet-stream",
          sizeBytes: it.file.size,
          width: meta.width ?? null,
          height: meta.height ?? null,
          durationSec: meta.durationSec ?? null,
        },
      });
    } catch (err) {
      if (err instanceof UploadAborted) return;
      patch(it.key, { status: "error", error: errorText(err, err instanceof Error ? err.message : "Upload failed") });
    }
  };

  const addFiles = (files: File[]) => {
    const room = MAX_FILES_PER_MESSAGE - itemsRef.current.length;
    if (files.length > room) {
      toast({
        title: `Up to ${MAX_FILES_PER_MESSAGE} files per message`,
        description: room > 0 ? `Only the first ${room} were added.` : "Send these first, then add more.",
        variant: "warning",
      });
    }
    const added = files.slice(0, Math.max(0, room)).map<PendingFile>((file) => {
      const kind = mediaKind(file.type);
      return {
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        kind,
        previewUrl: kind === "file" ? null : URL.createObjectURL(file),
        progress: 0,
        status: "uploading",
        abort: new AbortController(),
      };
    });
    if (!added.length) return;
    setItems((list) => [...list, ...added]);
    added.forEach((it) => void upload(it));
    textRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({ addFiles }));

  const remove = (it: PendingFile) => {
    discard(it);
    setItems((list) => list.filter((x) => x.key !== it.key));
  };

  const retry = (it: PendingFile) => {
    const fresh: PendingFile = { ...it, status: "uploading", progress: 0, error: undefined, abort: new AbortController() };
    setItems((list) => list.map((x) => (x.key === it.key ? fresh : x)));
    void upload(fresh);
  };

  // --- text --------------------------------------------------------------------
  const change = (value: string) => {
    setText(value);
    writeDraft(conversationId, value);
    if (!value.trim()) return stopTyping();
    const now = Date.now();
    if (now - typingSentAt.current > TYPING_REFRESH_MS) {
      typingSentAt.current = now;
      onTypingRef.current(true);
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    change(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
      resize();
    });
  };

  const uploading = items.some((it) => it.status === "uploading");
  const ready = items.filter((it) => it.status === "done" && it.attachment);
  const canSend = !uploading && (!!text.trim() || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    const sent: SentAttachment[] = ready.map((it) => {
      const a = it.attachment as ChatAttachment;
      if (it.previewUrl) rememberLocalPreview(a.id, it.previewUrl);
      return { ...a, previewUrl: it.previewUrl };
    });
    onSend(text.trim(), sent);
    // Sent files keep their previews (the bubble uses them); failed ones stay.
    setItems((list) => list.filter((it) => it.status === "error"));
    setText("");
    writeDraft(conversationId, "");
    stopTyping();
    setEmojiOpen(false);
    requestAnimationFrame(resize);
  };

  return (
    <div className="tch-composer-wrap">
      {items.length ? (
        <div className="tch-tray" aria-label="Files to send">
          {items.map((it) => (
            <div key={it.key} className={`tch-tray-item is-${it.status}`} title={it.error ?? it.file.name}>
              {it.kind === "image" && it.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={it.previewUrl} alt="" />
              ) : it.kind === "video" && it.previewUrl ? (
                <>
                  <video src={it.previewUrl} muted preload="metadata" />
                  <span className="tch-tray-play">
                    <Play size={14} fill="currentColor" />
                  </span>
                </>
              ) : (
                <div className="tch-tray-file">
                  <FileText size={20} />
                  <span>{it.file.name}</span>
                  <small>{formatBytes(it.file.size)}</small>
                </div>
              )}
              {it.status === "uploading" ? (
                <div className="tch-tray-progress">
                  <span style={{ width: `${Math.round(it.progress * 100)}%` }} />
                </div>
              ) : null}
              {it.status === "error" ? (
                <button type="button" className="tch-tray-error" onClick={() => retry(it)} title={`${it.error} — click to retry`}>
                  <AlertCircle size={14} />
                  <RotateCcw size={13} />
                </button>
              ) : null}
              <button
                type="button"
                className="tch-tray-remove"
                onClick={() => remove(it)}
                aria-label={it.status === "uploading" ? `Cancel ${it.file.name}` : `Remove ${it.file.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {items.some((it) => it.status === "error") ? (
        <div className="tch-tray-msg">
          {items.find((it) => it.status === "error")?.error} — retry or remove the file.
        </div>
      ) : null}

      <div className="tch-composer">
        <button type="button" className="tch-composer-attach" title="Attach files" onClick={() => fileRef.current?.click()}>
          <Icon name="link" size={18} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <textarea
          ref={textRef}
          rows={1}
          className="tch-composer-input"
          value={text}
          placeholder={items.length ? "Add a caption..." : "Type a message..."}
          maxLength={5000}
          onChange={(e) => {
            change(e.target.value);
            resize();
          }}
          onBlur={stopTyping}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files ?? []);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Message"
        />
        <div className="tch-emoji-wrap">
          <button type="button" className="tch-composer-emoji" title="Emoji" onClick={() => setEmojiOpen((o) => !o)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          {emojiOpen ? <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} /> : null}
        </div>
        <button
          type="button"
          className="tch-composer-send"
          title={uploading ? "Waiting for uploads to finish" : "Send message"}
          onClick={submit}
          disabled={!canSend}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
