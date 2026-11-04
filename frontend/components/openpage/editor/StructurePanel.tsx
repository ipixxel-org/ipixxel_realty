"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronsDownUp, ChevronsUpDown, GripHorizontal, Layers, X } from "lucide-react";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { NavigatorTree } from "./NavigatorTree";

const WIDTH = 300;
const MARGIN = 8;

/** Ids of every block on the page, including those nested in Divs / columns. */
export function allBlockIds(blocks: BlockConfig[] | undefined): string[] {
  const ids: string[] = [];
  const walk = (list: BlockConfig[] | undefined) => {
    for (const b of list ?? []) {
      if (!b?.id) continue;
      ids.push(b.id);
      const cols = (b.props as { columns?: Array<{ blocks?: BlockConfig[] }> } | undefined)?.columns;
      if (b.type === "columns" && Array.isArray(cols)) cols.forEach((c) => walk(c?.blocks));
    }
  };
  walk(blocks);
  return ids;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Floating "Structure" panel (like Elementor's Navigator): the page's
 * sections, Divs and widgets as a tree. Click to select, drag to reorder,
 * toggle visibility. Opened from the Structure icon in the top bar; the
 * panel itself can be dragged by its header.
 */
export function StructurePanel() {
  const open = useEditorStore((s) => s.structureOpen);
  const close = useEditorStore((s) => s.closeStructure);
  const setAll = useEditorStore((s) => s.setNavigatorExpandedAll);
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages;
    if (!pages || pages.length === 0) return s.config.blocks;
    return (pages.find((p) => p.id === s.activePageId) ?? pages[0]).blocks;
  });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the panel (unless typing in a field inside it).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape inside a filled search box clears typing first, not the panel.
      const t = e.target;
      if (t instanceof HTMLInputElement && t.value && panelRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const h = panelRef.current?.offsetHeight ?? 200;
    setPos({
      x: clamp(e.clientX - drag.current.dx, MARGIN, window.innerWidth - WIDTH - MARGIN),
      y: clamp(e.clientY - drag.current.dy, MARGIN, window.innerHeight - Math.min(h, 120) - MARGIN),
    });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const ids = allBlockIds(blocks);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Structure"
      data-op-structure-panel=""
      className="fixed z-[60] flex flex-col rounded-xl border border-border-default bg-bg-1 shadow-2xl overflow-hidden"
      style={{
        width: WIDTH,
        height: "min(560px, calc(100vh - 140px))",
        ...(pos ? { left: pos.x, top: pos.y } : { right: 380, top: 120 }),
      }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border-default bg-bg-2 cursor-move select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <GripHorizontal size={13} className="text-text-3" />
        <Layers size={13} className="text-[#6d5dfc]" />
        <span className="text-[12px] font-semibold text-text-0">Structure</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAll(ids, true)}
          className="p-1 rounded text-text-3 hover:text-text-0 hover:bg-bg-3"
          title="Expand all"
          aria-label="Expand all"
        >
          <ChevronsUpDown size={13} />
        </button>
        <button
          type="button"
          onClick={() => setAll(ids, false)}
          className="p-1 rounded text-text-3 hover:text-text-0 hover:bg-bg-3"
          title="Collapse all"
          aria-label="Collapse all"
        >
          <ChevronsDownUp size={13} />
        </button>
        <button
          type="button"
          onClick={close}
          className="p-1 rounded text-text-3 hover:text-text-0 hover:bg-bg-3"
          title="Close (Esc)"
          aria-label="Close structure"
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex flex-col flex-1 min-h-0 pt-2">
        <NavigatorTree />
      </div>
    </div>
  );
}
