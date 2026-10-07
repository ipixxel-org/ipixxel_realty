"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/** One message carries at most this many files (the API's limit). */
export const MAX_FILES_PER_MESSAGE = 10;

export interface PresignResult {
  attachmentId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
  maxBytes: number;
}

export function presignAttachment(input: {
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationSec?: number;
}): Promise<PresignResult> {
  return apiFetch("/org/team-chat/attachments/presign", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelAttachment(id: string): Promise<unknown> {
  return apiFetch(`/org/team-chat/attachments/${id}`, { method: "DELETE" });
}

export class UploadAborted extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadAborted";
  }
}

/**
 * PUTs the file straight to storage with progress (fetch can't report upload
 * progress, XHR can). Resolves when stored; rejects with UploadAborted when
 * `signal` fires.
 */
export function putWithProgress(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(xhr.status === 413 ? "File too large" : `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.onabort = () => reject(new UploadAborted());
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export type MediaKind = "image" | "video" | "file";

/** Shown inline only for types that can't carry script (SVG is a file). */
export function mediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

/** Width/height (and duration for video) so the bubble can reserve space. */
export function probeMedia(
  file: File,
  previewUrl: string,
): Promise<{ width?: number; height?: number; durationSec?: number }> {
  const kind = mediaKind(file.type);
  if (kind === "file") return Promise.resolve({});
  return new Promise((resolve) => {
    const done = (v: { width?: number; height?: number; durationSec?: number }) => {
      window.clearTimeout(timer);
      resolve(v);
    };
    const timer = window.setTimeout(() => resolve({}), 4000);
    if (kind === "image") {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
      img.onerror = () => done({});
      img.src = previewUrl;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        done({
          width: v.videoWidth || undefined,
          height: v.videoHeight || undefined,
          durationSec: Number.isFinite(v.duration) ? Math.round(v.duration) : undefined,
        });
      v.onerror = () => done({});
      v.src = previewUrl;
    }
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// --- signed download links ---------------------------------------------------
// Short-lived, so they're cached until shortly before expiry. Files you just
// sent use their local preview until the page is reloaded.

const localPreviews = new Map<string, string>();
const cache = new Map<string, { url: string; until: number }>();
const pending = new Map<string, Promise<string>>();

export function rememberLocalPreview(attachmentId: string, objectUrl: string) {
  localPreviews.set(attachmentId, objectUrl);
}

export function attachmentUrl(id: string): Promise<string> {
  const local = localPreviews.get(id);
  if (local) return Promise.resolve(local);
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const p = apiFetch<{ url: string; expiresIn: number }>(`/org/team-chat/attachments/${id}/url`)
    .then((r) => {
      cache.set(id, { url: r.url, until: Date.now() + Math.max(10, r.expiresIn - 30) * 1000 });
      return r.url;
    })
    .finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

/** A signed URL for showing an attachment inline (null while loading or on error). */
export function useAttachmentUrl(id: string, enabled = true): string | null {
  const [state, setState] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    attachmentUrl(id)
      .then((url) => alive && setState({ id, url }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return state?.id === id ? state.url : null;
}
