"use client";

import { useEffect, useRef, useState } from "react";
import { X, Clock, RotateCcw, Server, Loader2 } from "lucide-react";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { apiFetch } from "@/lib/api";
import type { Resource } from "@/lib/openpage/persist";

interface ServerRevision {
  id: string;
  createdAt: string;
  label: string;
}

interface RestoreResponse {
  content?: { sections?: unknown; config?: unknown; engine?: string; site?: unknown };
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function revisionTimeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? "" : timeAgo(ts);
}

export function VersionHistory({
  pageId,
  resource = "landing-page",
}: {
  pageId?: string;
  resource?: Resource;
}) {
  const { historyOpen, toggleHistory } = useEditorStore();
  const undoStack = useConfigStore((s) => s.undoStack);
  const panelRef = useRef<HTMLDivElement>(null);

  const [serverRevs, setServerRevs] = useState<ServerRevision[] | null>(null);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const entries = [...undoStack].reverse();
  const hasServer = resource === "landing-page" && Boolean(pageId);
  const loadingRevs = hasServer && !serverRevs && !revisionError;

  // Close on Escape
  useEffect(() => {
    if (!historyOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        toggleHistory();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [historyOpen, toggleHistory]);

  // Close on click outside
  useEffect(() => {
    if (!historyOpen) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        toggleHistory();
      }
    }
    // Delay to avoid catching the toggle button click itself
    const id = setTimeout(() => window.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [historyOpen, toggleHistory]);

  // Fetch saved versions each time the panel opens (all setState calls sit
  // inside promise callbacks so a slow/failing fetch can't cascade renders).
  useEffect(() => {
    if (!historyOpen || !pageId || resource !== "landing-page") return;
    void (async () => {
      const base = `/org/landing-pages/${encodeURIComponent(pageId)}/revisions`;
      try {
        const rows = await apiFetch<ServerRevision[]>(base);
        setServerRevs(rows);
        setRevisionError(null);
      } catch (err) {
        setRevisionError(err instanceof Error ? err.message : "Couldn't load saved versions");
      }
    })();
  }, [historyOpen, pageId, resource]);

  async function restoreRevision(rev: ServerRevision) {
    if (!pageId || restoringId) return;
    const ok = window.confirm(
      "Restore this saved version? Your current content will be replaced with this snapshot.",
    );
    if (!ok) return;
    setRestoringId(rev.id);
    try {
      const base = `/org/landing-pages/${encodeURIComponent(pageId)}/revisions`;
      const updated = await apiFetch<RestoreResponse>(
        `${base}/${encodeURIComponent(rev.id)}/restore`,
        { method: "POST" },
      );
      if (updated?.content) {
        window.dispatchEvent(
          new CustomEvent("op:restore-revision", { detail: { content: updated.content } }),
        );
      }
      const rows = await apiFetch<ServerRevision[]>(base);
      setServerRevs(rows);
      setRevisionError(null);
    } catch (err) {
      setRevisionError(err instanceof Error ? err.message : "Couldn't restore this version");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div
      ref={panelRef}
      className={`absolute top-0 right-0 bottom-0 w-80 bg-bg-1 border-l border-border-default z-50 flex flex-col transition-transform duration-250 ease-in-out ${
        historyOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border-default flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-text-2" />
          <h3 className="text-sm font-semibold">Version History</h3>
          <span className="text-[10px] text-text-3">
            ({entries.length + (serverRevs?.length ?? 0)})
          </span>
        </div>
        <button
          onClick={toggleHistory}
          className="w-7 h-7 rounded flex items-center justify-center text-text-3 hover:text-text-0 hover:bg-bg-3 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Current state */}
        <div className="p-3 rounded-lg bg-green-glow mb-1">
          <div className="flex items-center gap-1.5 text-[11px] text-text-2 mb-1">
            <span>Current</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-green-glow text-green">
              latest
            </span>
          </div>
          <div className="text-[12.5px] text-text-1">Current state</div>
        </div>

        {/* Server-saved versions (org landing pages) */}
        {hasServer && (
          <>
            <div className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[10px] uppercase tracking-wide text-text-3">
              <Server size={11} />
              <span>Saved versions</span>
            </div>

            {loadingRevs && (
              <div className="flex items-center gap-2 p-3 text-[11px] text-text-3">
                <Loader2 size={12} className="animate-spin" />
                Loading saved versions…
              </div>
            )}

            {revisionError && (
              <div className="p-3 mb-1 text-[11px] text-red-400 bg-red-500/10 rounded-lg">
                {revisionError}
              </div>
            )}

            {!loadingRevs && !revisionError && (serverRevs?.length ?? 0) === 0 && (
              <div className="p-3 mb-1 text-[11px] text-text-3 rounded-lg border border-border-subtle">
                Saved versions appear here once your page has been saved.
              </div>
            )}

            {!loadingRevs &&
              serverRevs?.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3 rounded-lg mb-0.5 border border-border-subtle transition-colors group"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-text-2 mb-1">
                    <span>{revisionTimeAgo(rev.createdAt) || "saved"}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-status-blue/10 text-status-blue">
                      autosave
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[12.5px] text-text-1">Saved version</div>
                    <button
                      type="button"
                      disabled={restoringId !== null}
                      onClick={() => void restoreRevision(rev)}
                      className="flex items-center gap-1 text-[11px] px-1.5 py-1 rounded-md text-text-2 hover:text-text-0 hover:bg-bg-3 disabled:opacity-40 transition-colors"
                    >
                      {restoringId === rev.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RotateCcw size={12} />
                      )}
                      Restore
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}

        {/* Session history — local undo snapshots, this tab only */}
        {entries.length > 0 && (
          <div className="px-1 pt-2 pb-1 text-[10px] uppercase tracking-wide text-text-3">
            This session
          </div>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            onClick={() => {
              for (let n = 0; n <= i; n++) useConfigStore.getState().undo();
            }}
            className="p-3 rounded-lg cursor-pointer transition-colors mb-0.5 hover:bg-bg-3 group"
          >
            <div className="flex items-center gap-1.5 text-[11px] text-text-2 mb-1">
              <span>{timeAgo(entry.timestamp)}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-status-blue/10 text-status-blue">
                manual
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] text-text-1">{entry.label}</div>
              <RotateCcw size={12} className="text-text-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}

        {entries.length === 0 && (!hasServer || (serverRevs?.length ?? 0) === 0) && (
          <div className="p-4 text-center text-[11px] text-text-3">
            No history yet. Make some changes to see history.
          </div>
        )}
      </div>
    </div>
  );
}