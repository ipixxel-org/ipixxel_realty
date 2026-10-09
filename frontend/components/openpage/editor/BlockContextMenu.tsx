"use client";

import { useEffect, useRef } from "react";
import {
  Pencil,
  Copy,
  Clipboard,
  Trash2,
  ChevronUp,
  ChevronDown,
  EyeOff,
  Globe,
  Sliders,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig } from "../blocks/types";
import { blockMetadata } from "@/lib/openpage/block-metadata";

interface BlockContextMenuProps {
  block: BlockConfig;
  index: number;
  totalBlocks: number;
  x: number;
  y: number;
  onClose: () => void;
}

export function BlockContextMenu({
  block,
  index,
  totalBlocks,
  x,
  y,
  onClose,
}: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    duplicateBlock,
    removeBlock,
    moveBlock,
    updateBlockStyle,
    addGlobalWidget,
  } = useConfigStore();
  const {
    setRightSidebarTab,
    selectBlock,
    viewport,
    setClipboardStyle,
    clipboardStyle,
    setClipboardBlock,
  } = useEditorStore();

  const isFirst = index === 0;
  const isLast = index === totalBlocks - 1;
  const hideKey =
    viewport === "tablet"
      ? "hideOnTablet"
      : viewport === "mobile"
      ? "hideOnMobile"
      : "hideOnDesktop";

  const meta = blockMetadata.find((b) => b.type === block.type);
  const blockLabel = meta?.label || block.type;

  // Close on outside click or escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust menu position so it doesn't overflow viewport edges
  const menuWidth = 210;
  const menuHeight = 320;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 10);

  return (
    <div
      ref={menuRef}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed z-50 w-52 bg-bg-1 border border-border-default rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.14)] py-1.5 text-xs text-text-1 backdrop-blur-lg select-none animate-in fade-in duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[10px] font-bold text-text-3 uppercase tracking-wider border-b border-border-subtle flex items-center justify-between">
        <span>{blockLabel}</span>
        <span className="text-text-3 font-normal">#{index + 1}</span>
      </div>

      {/* Edit content */}
      <button
        type="button"
        onClick={() => {
          selectBlock(block.id);
          setRightSidebarTab("properties");
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-3 hover:text-text-0 transition-colors"
      >
        <Pencil size={13} className="text-blue-400" />
        <span>Edit Content</span>
      </button>

      {/* Edit style */}
      <button
        type="button"
        onClick={() => {
          selectBlock(block.id);
          setRightSidebarTab("style");
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-3 hover:text-text-0 transition-colors"
      >
        <Sliders size={13} className="text-pink-400" />
        <span>Edit Style</span>
      </button>

      <div className="h-[1px] bg-border-subtle my-1" />

      {/* Duplicate */}
      <button
        type="button"
        onClick={() => {
          duplicateBlock(block.id);
          toast.success("Section duplicated");
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-bg-3 hover:text-text-0 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Copy size={13} className="text-emerald-400" />
          <span>Duplicate</span>
        </div>
        <kbd className="text-[9px] text-text-3 font-mono">Ctrl+D</kbd>
      </button>

      {/* Copy Block */}
      <button
        type="button"
        onClick={() => {
          setClipboardBlock(JSON.parse(JSON.stringify(block)));
          toast.success("Section copied to clipboard");
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-3 hover:text-text-0 transition-colors"
      >
        <Clipboard size={13} className="text-purple-400" />
        <span>Copy Section</span>
      </button>

      {/* Copy Style */}
      <button
        type="button"
        onClick={() => {
          if (block.style) {
            setClipboardStyle(JSON.parse(JSON.stringify(block.style)));
            toast.success("Style copied");
          } else {
            toast.info("No custom style on this block");
          }
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-3 hover:text-text-0 transition-colors"
      >
        <Sparkles size={13} className="text-amber-400" />
        <span>Copy Style</span>
      </button>

      {/* Paste Style */}
      <button
        type="button"
        disabled={!clipboardStyle}
        onClick={() => {
          if (clipboardStyle) {
            updateBlockStyle(block.id, clipboardStyle);
            toast.success("Style applied to section");
          }
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-3 hover:text-text-0 disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <Clipboard size={13} className="text-cyan-400" />
        <span>Paste Style</span>
      </button>

      {/* Save as Global Widget */}
      <button
        type="button"
        onClick={() => {
          addGlobalWidget({
            id: `gw-${Date.now()}`,
            name: `${blockLabel} Global`,
            block: JSON.parse(JSON.stringify(block)),
            createdAt: Date.now(),
          });
          toast.success("Saved as Global Widget");
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-3 hover:text-text-0 transition-colors"
      >
        <Globe size={13} className="text-indigo-400" />
        <span>Save as Global Widget</span>
      </button>

      <div className="h-[1px] bg-border-subtle my-1" />

      {/* Move Up */}
      <button
        type="button"
        disabled={isFirst}
        onClick={() => {
          if (!isFirst) {
            moveBlock(index, index - 1);
            toast.success("Moved up");
          }
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-bg-3 hover:text-text-0 disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ChevronUp size={13} />
          <span>Move Up</span>
        </div>
        <kbd className="text-[9px] text-text-3 font-mono">Alt+↑</kbd>
      </button>

      {/* Move Down */}
      <button
        type="button"
        disabled={isLast}
        onClick={() => {
          if (!isLast) {
            moveBlock(index, index + 1);
            toast.success("Moved down");
          }
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-bg-3 hover:text-text-0 disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ChevronDown size={13} />
          <span>Move Down</span>
        </div>
        <kbd className="text-[9px] text-text-3 font-mono">Alt+↓</kbd>
      </button>

      {/* Hide on Current Device */}
      <button
        type="button"
        onClick={() => {
          const isCurrentlyHidden = Boolean(block.style?.[hideKey]);
          updateBlockStyle(block.id, { [hideKey]: !isCurrentlyHidden });
          toast.info(
            isCurrentlyHidden ? `Shown on ${viewport}` : `Hidden on ${viewport}`
          );
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-3 hover:text-text-0 transition-colors"
      >
        <EyeOff size={13} className="text-amber-400" />
        <span>Hide on {viewport}</span>
      </button>

      <div className="h-[1px] bg-border-subtle my-1" />

      {/* Delete */}
      <button
        type="button"
        onClick={() => {
          removeBlock(block.id);
          toast("Section deleted", {
            action: {
              label: "Undo",
              onClick: () => {
                useConfigStore.getState().undo();
                toast("Section restored");
              },
            },
            duration: 3500,
          });
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Trash2 size={13} />
          <span>Delete</span>
        </div>
        <kbd className="text-[9px] text-red-400/60 font-mono">Del</kbd>
      </button>
    </div>
  );
}
