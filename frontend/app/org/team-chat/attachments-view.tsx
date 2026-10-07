"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Play } from "lucide-react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import type { ChatAttachment } from "@/lib/team-chat/types";
import {
  attachmentUrl,
  formatBytes,
  formatDuration,
  mediaKind,
  useAttachmentUrl,
} from "@/lib/team-chat/uploads";

// The viewer (and its CSS) loads only when someone opens a photo or video.
const MediaLightbox = dynamic(() => import("./media-lightbox"), { ssr: false });

const MAX_TILES = 4;

/** Photos and videos as a grid (click to view full screen), other files as cards. */
export function AttachmentsView({ attachments }: { attachments: ChatAttachment[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const media = attachments.filter((a) => mediaKind(a.mimeType) !== "file");
  const files = attachments.filter((a) => mediaKind(a.mimeType) === "file");
  const shown = media.slice(0, MAX_TILES);
  const extra = media.length - shown.length;

  return (
    <>
      {media.length ? (
        <div className={`tch-media-grid is-${Math.min(media.length, MAX_TILES)}`}>
          {shown.map((a, i) => (
            <MediaTile
              key={a.id}
              a={a}
              single={media.length === 1}
              more={i === shown.length - 1 && extra > 0 ? extra : 0}
              onOpen={() => setOpenAt(i)}
            />
          ))}
        </div>
      ) : null}
      {files.map((a) => (
        <FileCard key={a.id} a={a} />
      ))}
      {openAt !== null ? <MediaLightbox items={media} index={openAt} onClose={() => setOpenAt(null)} /> : null}
    </>
  );
}

function MediaTile({
  a,
  single,
  more,
  onOpen,
}: {
  a: ChatAttachment;
  single: boolean;
  more: number;
  onOpen: () => void;
}) {
  const url = useAttachmentUrl(a.id);
  const kind = mediaKind(a.mimeType);
  // Reserve the right shape before the image arrives so the thread doesn't jump.
  const ratio = single && a.width && a.height ? `${a.width} / ${a.height}` : undefined;
  return (
    <button
      type="button"
      className={`tch-media-tile${single ? " is-single" : ""}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
      onClick={onOpen}
      title={a.fileName}
    >
      {url ? (
        kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
          <img src={url} alt={a.fileName} loading="lazy" />
        ) : (
          <video src={url} preload="metadata" muted playsInline />
        )
      ) : (
        <span className="tch-media-loading" />
      )}
      {kind === "video" ? (
        <span className="tch-media-play">
          <Play size={18} fill="currentColor" />
          {a.durationSec ? <em>{formatDuration(a.durationSec)}</em> : null}
        </span>
      ) : null}
      {more ? <span className="tch-media-more">+{more}</span> : null}
    </button>
  );
}

function FileCard({ a }: { a: ChatAttachment }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      window.open(await attachmentUrl(a.id), "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Couldn't open the file", description: "It may have been removed.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };
  const ext = a.fileName.includes(".") ? a.fileName.split(".").pop()?.slice(0, 4).toUpperCase() : "";
  return (
    <button type="button" className="tch-file-card" onClick={() => void open()} disabled={busy}>
      <div className="tch-file-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      </div>
      <div className="tch-file-details">
        <span className="tch-file-name">{a.fileName}</span>
        <span className="tch-file-size">
          {[ext, formatBytes(a.sizeBytes)].filter(Boolean).join(" · ")}
        </span>
      </div>
      <span className="tch-file-dl">
        <Icon name="download" size={16} />
      </span>
    </button>
  );
}
