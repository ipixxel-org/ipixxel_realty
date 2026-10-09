"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Undo2, Redo2, Grid, Search, Monitor, Tablet, Smartphone } from "lucide-react";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { PageConfig } from "@/components/openpage/blocks/types";
import { SpotlightSearch } from "./SpotlightSearch";

function AddPagePopover({ onAdd, onClose }: { onAdd: (name: string, path: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('/')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    const cleanPath = path.trim() || `/${trimmed.toLowerCase().replace(/\s+/g, '-')}`
    onAdd(trimmed, cleanPath)
    onClose()
  }

  return (
    <div className="absolute top-full left-0 mt-1 bg-bg-2 border border-border-default rounded-lg p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-20 w-52">
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] text-text-3 mb-0.5">Page name</label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!path || path === '/') setPath(`/${e.target.value.toLowerCase().replace(/\s+/g, '-')}`)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
            placeholder="About"
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-3 text-text-0 text-[11.5px] outline-none focus:border-green"
          />
        </div>
        <div>
          <label className="block text-[10px] text-text-3 mb-0.5">Path</label>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
            placeholder="/about"
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-3 text-text-0 text-[11.5px] outline-none focus:border-green font-mono"
          />
        </div>
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="w-full py-1.5 rounded bg-green text-black text-[11px] font-semibold hover:bg-green-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Add Page
        </button>
      </div>
    </div>
  )
}

function PageTab({ page, isActive, onClick, onRename, onDelete, canDelete }: {
  page: PageConfig
  isActive: boolean
  onClick: () => void
  onRename: (name: string) => void
  onDelete: () => void
  canDelete: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(page.name)
  const [showContext, setShowContext] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== page.name) onRename(trimmed)
    else setName(page.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename()
          if (e.key === 'Escape') { setName(page.name); setEditing(false) }
        }}
        className="px-2 py-1 rounded text-xs bg-bg-3 border border-green outline-none w-20"
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
        onContextMenu={(e) => { e.preventDefault(); setShowContext(true) }}
        className={`px-2 py-1 rounded text-xs transition-all ${
          isActive ? 'bg-bg-3 text-text-0 font-medium' : 'text-text-2 hover:text-text-0 hover:bg-bg-2'
        }`}
        title={`${page.name} (${page.path})`}
      >
        {page.name}
      </button>
      {showContext && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowContext(false)} />
          <div className="absolute top-full left-0 mt-1 bg-bg-2 border border-border-default rounded-lg p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-20 min-w-[100px]">
            <button
              onClick={() => { setShowContext(false); setEditing(true) }}
              className="w-full text-left px-2.5 py-1.5 rounded text-[11px] text-text-1 hover:bg-bg-3 hover:text-text-0 transition-colors"
            >
              Rename
            </button>
            {canDelete && (
              <button
                onClick={() => { setShowContext(false); onDelete() }}
                className="w-full text-left px-2.5 py-1.5 rounded text-[11px] text-text-1 hover:bg-status-red/10 hover:text-status-red transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function CanvasToolbar() {
  const pages = useConfigStore((s) => s.config.pages) ?? []
  const activePageId = useConfigStore((s) => s.activePageId)
  const setActivePage = useConfigStore((s) => s.setActivePage)
  const addPage = useConfigStore((s) => s.addPage)
  const removePage = useConfigStore((s) => s.removePage)
  const renamePage = useConfigStore((s) => s.renamePage)
  const [showAddPage, setShowAddPage] = useState(false)

  const undo = useConfigStore((s) => s.undo);
  const redo = useConfigStore((s) => s.redo);
  const canUndo = useConfigStore((s) => s.canUndo());
  const canRedo = useConfigStore((s) => s.canRedo());

  const viewport = useEditorStore((s) => s.viewport);
  const setViewport = useEditorStore((s) => s.setViewport);
  const showGrid = useEditorStore((s) => s.showGrid);
  const toggleShowGrid = useEditorStore((s) => s.toggleShowGrid);
  const spotlightOpen = useEditorStore((s) => s.spotlightOpen);
  const toggleSpotlight = useEditorStore((s) => s.toggleSpotlight);

  return (
    <div className="h-11 bg-bg-1 border-b border-border-default flex items-center px-3 gap-2 justify-between">
      {/* Page tabs */}
      <div className="flex items-center gap-0.5 relative overflow-x-auto min-w-0">
        {pages.map((page) => (
          <PageTab
            key={page.id}
            page={page}
            isActive={activePageId === page.id}
            onClick={() => setActivePage(page.id)}
            onRename={(name) => renamePage(page.id, name)}
            onDelete={() => removePage(page.id)}
            canDelete={pages.length > 1}
          />
        ))}
        <div className="relative">
          <button
            onClick={() => setShowAddPage(!showAddPage)}
            className="w-6 h-6 rounded flex items-center justify-center text-text-3 hover:text-[#6d5dfc] hover:bg-bg-2 transition-all"
            title="Add page"
            aria-label="Add page"
          >
            <Plus size={12} />
          </button>
          {showAddPage && (
            <AddPagePopover
              onAdd={(name, path) => addPage(name, path)}
              onClose={() => setShowAddPage(false)}
            />
          )}
        </div>
      </div>

      {/* Right controls: Viewport, Grid, Spotlight & History */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Spotlight Search (Ctrl+K) */}
        <button
          id="op-spotlight-trigger"
          type="button"
          onClick={toggleSpotlight}
          className="px-2 py-1 rounded-md bg-bg-2 hover:bg-bg-3 border border-border-default text-text-2 hover:text-text-0 flex items-center gap-1.5 text-xs transition-colors"
          title="Spotlight Search (Ctrl+K)"
        >
          <Search size={12} className="text-text-3" />
          <span className="hidden sm:inline text-[11px]">Search...</span>
          <kbd className="hidden sm:inline text-[9px] px-1 rounded bg-bg-3 font-mono text-text-3 border border-border-subtle">
            ⌘K
          </kbd>
        </button>

        <div className="w-[1px] h-4 bg-border-subtle mx-0.5" />

        {/* Viewport switch */}
        <div className="flex items-center rounded-lg border border-border-default bg-bg-3 p-0.5">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={`p-1 rounded transition-colors ${
              viewport === "desktop"
                ? "bg-bg-1 text-[#6d5dfc] shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
                : "text-text-3 hover:text-text-1"
            }`}
            title="Desktop View"
          >
            <Monitor size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewport("tablet")}
            className={`p-1 rounded transition-colors ${
              viewport === "tablet"
                ? "bg-bg-1 text-[#6d5dfc] shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
                : "text-text-3 hover:text-text-1"
            }`}
            title="Tablet View"
          >
            <Tablet size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={`p-1 rounded transition-colors ${
              viewport === "mobile"
                ? "bg-bg-1 text-[#6d5dfc] shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
                : "text-text-3 hover:text-text-1"
            }`}
            title="Mobile View"
          >
            <Smartphone size={13} />
          </button>
        </div>

        {/* Snap Grid Toggle */}
        <button
          type="button"
          onClick={toggleShowGrid}
          className={`p-1.5 rounded-lg border transition-colors ${
            showGrid
              ? "bg-[#6d5dfc]/10 border-[#6d5dfc]/40 text-[#6d5dfc]"
              : "bg-bg-2 border-border-default text-text-3 hover:text-text-1"
          }`}
          title={showGrid ? "Hide Alignment Grid" : "Show Alignment Grid"}
        >
          <Grid size={13} />
        </button>

        <div className="w-[1px] h-4 bg-border-subtle mx-0.5" />

        {/* Undo / Redo */}
        <button
          type="button"
          disabled={!canUndo}
          onClick={undo}
          className="p-1.5 rounded-lg border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:bg-bg-3 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={13} />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={redo}
          className="p-1.5 rounded-lg border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:bg-bg-3 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={13} />
        </button>
      </div>

      {/* Spotlight Command Modal — mounted only while open so its state
          (query/selection) resets on every open */}
      {spotlightOpen && <SpotlightSearch onClose={toggleSpotlight} />}
    </div>
  );
}
