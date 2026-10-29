"use client";

import { Fragment, useCallback, useState, useRef, type CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BlockConfig, BlockType } from "../types";
import { RenderBlock } from "../registry";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { createBlockFromType, createBlockFromPresetId } from "@/lib/openpage/block-factory";
import { resolveBlockStyleForDevice, isHiddenOnViewport } from "@/lib/openpage/block-style";
import { Plus, GripVertical, Type, Image as ImageIcon, Sparkles, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { ColumnResizer } from "./ColumnResizer";

interface ColumnsProps {
  columns?: Array<{ width: number; mobileWidth?: number; blocks: BlockConfig[] }>;
  gap?: string;
}

/** Phone-width flex-basis: the column's own mobile width, else full width. */
export function mobileColumnBasis(mobileWidth: number | undefined, gap: string): string {
  if (typeof mobileWidth !== "number" || !Number.isFinite(mobileWidth) || mobileWidth >= 100) return "100%";
  return `calc(${Math.max(10, mobileWidth)}% - ${gap})`;
}

type DropPayload =
  | { kind: "block"; type: string; label?: string }
  | { kind: "preset"; presetId: string; label?: string }
  | { kind: "global"; globalWidgetId: string; name?: string };

function buildBlockFromPayload(payload: DropPayload): { block: BlockConfig | null; label: string } {
  if (payload.kind === "block") {
    return { block: createBlockFromType(payload.type as BlockType), label: payload.label || payload.type };
  }
  if (payload.kind === "preset") {
    return { block: createBlockFromPresetId(payload.presetId), label: payload.label || "Section" };
  }
  const gw = useConfigStore.getState().config.globalWidgets?.find((w) => w.id === payload.globalWidgetId);
  if (gw) {
    return { block: { ...JSON.parse(JSON.stringify(gw.block)), id: `block-${Date.now()}` }, label: gw.name };
  }
  return { block: null, label: "Block" };
}

function ColumnBlock({
  block,
  columnId,
  colIndex,
}: {
  block: BlockConfig;
  columnId: string;
  colIndex: number;
}) {
  const { selectedBlockId, selectBlock } = useEditorStore();
  const { removeBlockFromColumn, duplicateBlockInColumn } = useConfigStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, data: { type: "column-block", columnId, colIndex } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const isSelected = selectedBlockId === block.id;
  const device = useEditorStore((s) => s.viewport);
  const isHidden = isHiddenOnViewport(resolveBlockStyleForDevice(block.style, device), device);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        selectBlock(block.id);
      }}
      className={`relative group/colblock my-1.5 rounded transition-all ${
        isSelected
          ? "outline outline-2 outline-dashed outline-blue-400"
          : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-400/50"
      }`}
    >
      {isHidden && (
        <span className="absolute top-1 left-1 z-10 text-[9px] font-semibold uppercase tracking-wider text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
          <EyeOff size={10} />
          Hidden on {device}
        </span>
      )}
      <div
        className={`absolute -top-6 right-0 z-20 flex items-center rounded overflow-hidden text-[9px] bg-blue-500 shadow-sm ${
          isSelected ? "opacity-100" : "opacity-0 group-hover/colblock:opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="px-1.5 py-0.5 text-white/90 hover:bg-blue-600 cursor-grab active:cursor-grabbing flex items-center gap-0.5"
          title="Drag to reorder"
        >
          <GripVertical size={11} />
        </button>
        <button
          type="button"
          onClick={() => duplicateBlockInColumn(columnId, colIndex, block.id)}
          className="px-1.5 py-0.5 text-white/90 hover:bg-blue-600"
          title="Duplicate"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={() => removeBlockFromColumn(columnId, colIndex, block.id)}
          className="px-1.5 py-0.5 text-white/90 hover:bg-red-500"
          title="Remove"
        >
          ✕
        </button>
      </div>
      <RenderBlock block={block} />
    </div>
  );
}

function ColumnDropSlot({
  sectionBlockId,
  colIndex,
  index,
}: {
  sectionBlockId: string;
  colIndex: number;
  index: number;
}) {
  const [isOver, setIsOver] = useState(false);
  const draggedItem = useEditorStore((s) => s.draggedItem);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const addBlockToColumn = useConfigStore((s) => s.addBlockToColumn);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (!isOver) setIsOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        useEditorStore.getState().setDraggedItem(null);
        const raw = e.dataTransfer.getData("application/x-openpage-drag") || e.dataTransfer.getData("text/plain");
        if (!raw) return;
        try {
          const payload = JSON.parse(raw) as DropPayload;
          const { block, label } = buildBlockFromPayload(payload);
          if (block) {
            addBlockToColumn(sectionBlockId, colIndex, block, index);
            selectBlock(block.id);
            toast.success(`${label} inserted in Column ${colIndex + 1}`);
          }
        } catch (err) {
          console.error("Drop into column slot failed", err);
        }
      }}
      className={`transition-all duration-200 relative flex items-center justify-center select-none rounded ${
        isOver
          ? "h-10 my-1 bg-green-500/15 border border-dashed border-green scale-[1.01] shadow-[0_0_16px_rgba(34,197,94,0.25)] z-30"
          : draggedItem
          ? "h-6 my-1 bg-green-500/5 border border-dashed border-green/40 hover:border-green hover:bg-green-500/15 z-20"
          : "h-1.5 hover:h-6 hover:bg-green-500/10 hover:border hover:border-dashed hover:border-green/40 rounded z-10 transition-all"
      }`}
    >
      {isOver && (
        <span className="text-[10px] font-semibold text-green pointer-events-none">
          Drop {draggedItem?.label || "widget"} here
        </span>
      )}
    </div>
  );
}

function DroppableColumn({
  sectionBlockId,
  colIndex,
  col,
  gap,
}: {
  sectionBlockId: string;
  colIndex: number;
  col: { width: number; mobileWidth?: number; blocks: BlockConfig[] };
  gap: string;
}) {
  const { addBlockToColumn } = useConfigStore();
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const draggedItem = useEditorStore((s) => s.draggedItem);
  const [isOver, setIsOver] = useState(false);

  const { setNodeRef, isOver: dndIsOver } = useDroppable({
    id: `column-${sectionBlockId}-${colIndex}`,
    data: { type: "column", sectionBlockId, colIndex },
  });

  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
    },
    [setNodeRef],
  );

  const realBlocks = (col.blocks || []).filter((b) => !b.id.includes("placeholder"));
  const isOnlyPlaceholder = realBlocks.length === 0;
  const isHighlight = isOver || dndIsOver || Boolean(draggedItem);

  const handleDropData = (rawData: string | null) => {
    if (!rawData) return;
    try {
      const payload = JSON.parse(rawData) as DropPayload;
      const { block: newBlock, label } = buildBlockFromPayload(payload);
      if (newBlock) {
        addBlockToColumn(sectionBlockId, colIndex, newBlock);
        selectBlock(newBlock.id);
        toast.success(`${label} added to Column ${colIndex + 1}`);
      }
    } catch (err) {
      console.error("Drop into column failed", err);
    }
  };

  return (
    <div
      ref={combinedRef}
      // Phone-width containers (< @md, 448px) use the column's mobile width
      // (default 100%: one per row); wider ones use its desktop width. The
      // two are stored separately, so neither overwrites the other.
      className="min-w-0 relative flex flex-col justify-start grow-0 shrink-0 basis-[var(--op-col-basis-sm)] @md:basis-[var(--op-col-basis)]"
      style={
        {
          "--op-col-basis": `calc(${col.width}% - ${gap})`,
          "--op-col-basis-sm": mobileColumnBasis(col.mobileWidth, gap),
        } as CSSProperties
      }
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (!isOver) setIsOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        useEditorStore.getState().setDraggedItem(null);
        const raw = e.dataTransfer.getData("application/x-openpage-drag") || e.dataTransfer.getData("text/plain");
        handleDropData(raw);
      }}
    >
      {isOnlyPlaceholder ? (
        <div
          className={`flex flex-col items-center justify-center p-6 min-h-[180px] rounded-xl border-2 border-dashed transition-all duration-200 select-none ${
            isOver
              ? "border-green bg-green-500/15 scale-[1.01] shadow-[0_0_24px_rgba(34,197,94,0.3)]"
              : isHighlight
              ? "border-green/50 bg-green-500/5"
              : "border-border-default hover:border-border-hover bg-bg-2/40"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 transition-transform duration-200 ${
              isOver
                ? "bg-green text-black scale-110 shadow-md"
                : isHighlight
                ? "bg-green-glow text-green animate-bounce"
                : "bg-bg-3 text-text-3"
            }`}
          >
            {isOver ? <Plus size={20} className="stroke-[2.5]" /> : isHighlight ? <Sparkles size={18} /> : <Plus size={18} />}
          </div>

          <div className={`text-[12px] font-semibold text-center ${isOver ? "text-green font-bold" : "text-text-0"}`}>
            {isOver
              ? `Drop ${draggedItem?.label || "widget"} here`
              : `Column ${colIndex + 1}`}
          </div>

          <p className="text-[10px] text-text-3 text-center mt-0.5 max-w-[200px] leading-snug">
            {isOver
              ? "Release mouse to place inside this column"
              : "Drag & drop a widget from the left sidebar"}
          </p>

          {!draggedItem && (
            <div className="mt-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const b = createBlockFromType("heading");
                  if (b) {
                    addBlockToColumn(sectionBlockId, colIndex, b);
                    selectBlock(b.id);
                  }
                }}
                className="px-2 py-1 rounded bg-bg-3 hover:bg-bg-4 text-[10px] text-text-1 hover:text-text-0 transition-colors flex items-center gap-1 border border-border-default shadow-xs"
              >
                <Type size={10} /> Heading
              </button>
              <button
                type="button"
                onClick={() => {
                  const b = createBlockFromType("text");
                  if (b) {
                    addBlockToColumn(sectionBlockId, colIndex, b);
                    selectBlock(b.id);
                  }
                }}
                className="px-2 py-1 rounded bg-bg-3 hover:bg-bg-4 text-[10px] text-text-1 hover:text-text-0 transition-colors flex items-center gap-1 border border-border-default shadow-xs"
              >
                <Type size={10} /> Text
              </button>
              <button
                type="button"
                onClick={() => {
                  const b = createBlockFromType("image");
                  if (b) {
                    addBlockToColumn(sectionBlockId, colIndex, b);
                    selectBlock(b.id);
                  }
                }}
                className="px-2 py-1 rounded bg-bg-3 hover:bg-bg-4 text-[10px] text-text-1 hover:text-text-0 transition-colors flex items-center gap-1 border border-border-default shadow-xs"
              >
                <ImageIcon size={10} /> Image
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <SortableContext items={realBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {realBlocks.map((childBlock, i) => (
              <Fragment key={childBlock.id}>
                <ColumnDropSlot
                  sectionBlockId={sectionBlockId}
                  colIndex={colIndex}
                  index={i}
                />
                <ColumnBlock
                  block={childBlock}
                  columnId={sectionBlockId}
                  colIndex={colIndex}
                />
              </Fragment>
            ))}
          </SortableContext>

          <ColumnDropSlot
            sectionBlockId={sectionBlockId}
            colIndex={colIndex}
            index={realBlocks.length}
          />

          <button
            type="button"
            onClick={() => {
              const block = createBlockFromType("heading");
              if (block) {
                addBlockToColumn(sectionBlockId, colIndex, block);
                selectBlock(block.id);
              }
            }}
            className={`w-full mt-2 py-2 rounded-lg border-2 border-dashed text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
              isOver
                ? "border-green bg-green-500/15 text-green scale-[1.01]"
                : isHighlight
                ? "border-green/50 bg-green-500/5 text-green/90"
                : "border-border-default text-text-3 hover:border-green/40 hover:text-text-1 hover:bg-bg-3"
            }`}
          >
            <Plus size={12} className={isOver ? "stroke-[2.5]" : ""} />
            <span>{isOver ? `Drop ${draggedItem?.label || "widget"} here` : "Drop or add widget"}</span>
          </button>
        </>
      )}
    </div>
  );
}

export function ColumnsBlock({ block }: { block: BlockConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p = block.props as ColumnsProps;
  const gap = p.gap || "24px";

  const columns =
    p.columns && p.columns.length > 0
      ? p.columns
      : [
          { width: 50, blocks: [] },
          { width: 50, blocks: [] },
        ];

  return (
    <div className="px-6 py-6">
      <div
        ref={containerRef}
        className="max-w-6xl mx-auto flex flex-wrap items-stretch"
        style={{ gap }}
      >
        {columns.map((col, i) => (
          <Fragment key={i}>
            <DroppableColumn
              sectionBlockId={block.id}
              colIndex={i}
              col={col}
              gap={gap}
            />
            {i < columns.length - 1 && (
              // No resize handles while stacked: widths apply to every device.
              <div className="hidden @md:contents">
                <ColumnResizer
                  sectionBlockId={block.id}
                  leftIndex={i}
                  leftWidth={col.width}
                  rightWidth={columns[i + 1]?.width ?? 50}
                  containerRef={containerRef}
                />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
