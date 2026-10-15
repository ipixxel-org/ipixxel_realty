"use client";

import { useState, useRef, useEffect } from "react";
import {
  GripVertical,
  Pencil,
  Plus,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Palette,
  MoreVertical,
  Layers,
  Sparkles,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig } from "../blocks/types";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { SectionAiAssistant } from "./SectionAiAssistant";

interface FloatingBlockToolbarProps {
  block: BlockConfig;
  index: number;
  totalBlocks: number;
  isSelected: boolean;
  onSelect: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  onOpenContextMenu?: (e: React.MouseEvent) => void;
}

export function FloatingBlockToolbar({
  block,
  index,
  totalBlocks,
  isSelected,
  onSelect,
  dragAttributes,
  dragListeners,
  onOpenContextMenu,
}: FloatingBlockToolbarProps) {
  const { duplicateBlock, removeBlock, moveBlock, updateBlockStyle, addBlock } = useConfigStore();
  const { selectedBlockId, selectBlock, setRightSidebarTab, viewport } = useEditorStore();
  const [showVariantMenu, setShowVariantMenu] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const isFirst = index === 0;
  const isLast = index === totalBlocks - 1;
  const hideKey = viewport === "tablet" ? "hideOnTablet" : viewport === "mobile" ? "hideOnMobile" : "hideOnDesktop";
  const isCurrentHidden = Boolean(block.style?.[hideKey]);

  const meta = blockMetadata.find((b) => b.type === block.type);
  const blockLabel = meta?.label || block.type;
  const variants = meta?.variants || [];

  return (
    <>
      <div
        className="absolute -top-10 left-1/2 -translate-x-1/2 z-40 flex items-center bg-[#1e222d] border border-blue-500/40 text-white rounded-lg shadow-xl shadow-black/40 backdrop-blur-md px-1 py-0.5 select-none transition-all duration-150 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Drag handle pill */}
      <div
        {...dragAttributes}
        {...dragListeners}
        title="Drag to reorder section"
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-300 hover:text-white bg-blue-500/20 hover:bg-blue-500/40 rounded-md cursor-grab active:cursor-grabbing transition-colors mr-1"
      >
        <GripVertical size={13} className="shrink-0" />
        <span className="capitalize">{blockLabel}</span>
      </div>

      {/* Variant selector if multiple variants exist */}
      {variants.length > 1 && (
        <div className="relative mr-1">
          <button
            type="button"
            onClick={() => setShowVariantMenu(!showVariantMenu)}
            className="px-2 py-1 text-[10px] font-medium text-text-2 hover:text-white bg-white/5 hover:bg-white/10 rounded flex items-center gap-1 transition-colors"
            title="Switch Variant"
          >
            <Sparkles size={11} className="text-amber-400" />
            <span className="capitalize">{block.variant || "default"}</span>
          </button>
          {showVariantMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowVariantMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-bg-2 border border-border-default rounded-md shadow-2xl py-1 z-40 min-w-[120px]">
                {variants.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      useConfigStore.getState().updateBlock(block.id, { variant: v });
                      setShowVariantMenu(false);
                      toast.success(`Variant changed to ${v}`);
                    }}
                    className={`w-full text-left px-2.5 py-1 text-[11px] transition-colors ${
                      block.variant === v
                        ? "bg-blue-500/20 text-blue-400 font-semibold"
                        : "text-text-1 hover:bg-bg-3 hover:text-white"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Move Up */}
      <button
        type="button"
        disabled={isFirst}
        onClick={() => {
          if (!isFirst) {
            moveBlock(index, index - 1);
            toast.success("Moved up");
          }
        }}
        className="p-1.5 text-text-2 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Move Up"
      >
        <ChevronUp size={13} />
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
        }}
        className="p-1.5 text-text-2 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Move Down"
      >
        <ChevronDown size={13} />
      </button>

      <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

      {/* Edit Content */}
      <button
        type="button"
        onClick={() => {
          onSelect();
          setRightSidebarTab("properties");
        }}
        className="p-1.5 text-text-2 hover:text-cyan-300 hover:bg-cyan-500/20 rounded transition-colors"
        title="Edit Content"
      >
        <Pencil size={13} />
      </button>

      {/* Edit Style */}
      <button
        type="button"
        onClick={() => {
          onSelect();
          setRightSidebarTab("style");
        }}
        className="p-1.5 text-text-2 hover:text-pink-300 hover:bg-pink-500/20 rounded transition-colors"
        title="Edit Style & Box Model"
      >
        <Palette size={13} />
      </button>

      {/* AI Assistant */}
      <button
        type="button"
        onClick={() => {
          onSelect();
          setShowAiModal(true);
        }}
        className="p-1.5 text-purple-300 hover:text-white hover:bg-purple-500/30 rounded transition-colors"
        title="AI Assistant (Rewrite / Tone / Regenerate)"
      >
        <Sparkles size={13} className="text-purple-400" />
      </button>

      {/* Add Section Below */}
      <button
        type="button"
        onClick={() => {
          const colMeta = blockMetadata.find((b) => b.type === "columns");
          if (!colMeta) return;
          addBlock(
            {
              id: `block-${Date.now()}`,
              type: "columns",
              variant: colMeta.variants[0],
              props: { ...colMeta.defaultProps },
            },
            index + 1
          );
          toast.success("New section added below");
        }}
        className="p-1.5 text-text-2 hover:text-green-300 hover:bg-green-500/20 rounded transition-colors"
        title="Add Section Below"
      >
        <Plus size={13} />
      </button>

      {/* Duplicate */}
      <button
        type="button"
        onClick={() => {
          duplicateBlock(block.id);
          toast.success("Section duplicated");
        }}
        className="p-1.5 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
        title="Duplicate Section"
      >
        <Copy size={13} />
      </button>

      {/* Hide on Current Device */}
      <button
        type="button"
        onClick={() => {
          updateBlockStyle(block.id, { [hideKey]: !isCurrentHidden });
          toast.info(isCurrentHidden ? `Shown on ${viewport}` : `Hidden on ${viewport}`);
        }}
        className={`p-1.5 rounded transition-colors ${
          isCurrentHidden
            ? "text-amber-400 bg-amber-500/20"
            : "text-text-2 hover:text-white hover:bg-white/10"
        }`}
        title={isCurrentHidden ? `Show on ${viewport}` : `Hide on ${viewport}`}
      >
        {isCurrentHidden ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={() => {
          if (selectedBlockId === block.id) selectBlock(null);
          removeBlock(block.id);
          toast("Section removed", {
            action: {
              label: "Undo",
              onClick: () => {
                useConfigStore.getState().undo();
                toast("Section restored");
              },
            },
            duration: 3500,
          });
        }}
        className="p-1.5 text-text-2 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
        title="Delete Section"
      >
        <Trash2 size={13} />
      </button>

      {/* Context Menu Trigger */}
      {onOpenContextMenu && (
        <button
          type="button"
          onClick={onOpenContextMenu}
          className="p-1.5 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
          title="More Options"
        >
          <MoreVertical size={13} />
        </button>
      )}
      </div>
      <SectionAiAssistant
        block={block}
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
      />
    </>
  );
}
