"use client";

import { Fragment, useCallback, useState, useRef, type CSSProperties, type ElementType } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BlockConfig } from "../types";
import { RenderBlock } from "../registry";
import { BlockContextMenu } from "@/components/openpage/editor/BlockContextMenu";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { createBlockFromType, isDivBlock } from "@/lib/openpage/block-factory";
import { resolveBlockStyleForDevice, isHiddenOnViewport } from "@/lib/openpage/block-style";
import { Plus, GripVertical, Type, Image as ImageIcon, Sparkles, EyeOff, ClipboardPaste, Pencil, Palette } from "lucide-react";
import { pasteClipboardBlock } from "@/lib/openpage/block-clipboard";
import { toast } from "sonner";
import { ColumnResizer } from "./ColumnResizer";
import { useElementEditor } from "../El";
import { readDropPayload, readDraggedBlockId, buildBlockFromPayload, type DropPayload } from "@/lib/openpage/drag-payload";
import { isSameOrInside } from "@/lib/openpage/block-tree";
import {
  flexLayoutStyle,
  isBlockDisplay,
  isGridDisplay,
  itemsInFlexRow,
  readFlexLayout,
  stacksItems,
  type FlexLayout,
} from "@/lib/openpage/flex-layout";
import { columnStyleCss, hasColumnBackground, readColumnStyle } from "@/lib/openpage/column-style";

/** One column ("div"): its width plus the optional layout of its widgets. */
type ColumnData = { width: number; mobileWidth?: number; blocks: BlockConfig[] } & FlexLayout;

interface ColumnsProps extends FlexLayout {
  /** "boxed" (default) or "full" (edge to edge). */
  contentWidth?: string;
  columns?: ColumnData[];
  gap?: string;
  htmlTag?: "div" | "section" | "article" | "main" | "aside" | "header" | "footer" | "nav";
}

/** Phone-width flex-basis: the column's own mobile width, else full width. */
export function mobileColumnBasis(mobileWidth: number | undefined, gap: string): string {
  if (typeof mobileWidth !== "number" || !Number.isFinite(mobileWidth) || mobileWidth >= 100) return "100%";
  return `calc(${Math.max(10, mobileWidth)}% - ${gap})`;
}

function ColumnBlock({
  block,
  columnId,
  colIndex,
  index = 0,
  total = 1,
}: {
  block: BlockConfig;
  columnId: string;
  colIndex: number;
  index?: number;
  total?: number;
}) {
  // Right-click menu for this widget (not the Div / Container around it).
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { selectedBlockId, selectBlock, setRightSidebarTab } = useEditorStore();
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
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        selectBlock(block.id);
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`relative min-w-0 group/colblock my-1.5 rounded transition-all ${isSelected
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
        className={`absolute -top-6 right-0 z-20 flex items-center rounded overflow-hidden text-[9px] bg-blue-500 shadow-sm ${isSelected ? "opacity-100" : "opacity-0 group-hover/colblock:opacity-100"
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
        {/* Edit this inner block (not the outer container). */}
        <button
          type="button"
          onClick={() => {
            selectBlock(block.id);
            setRightSidebarTab("properties");
          }}
          className="px-1.5 py-0.5 text-white/90 hover:bg-blue-600 flex items-center"
          title="Edit content of this block"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={() => {
            selectBlock(block.id);
            setRightSidebarTab("style");
          }}
          className="px-1.5 py-0.5 text-white/90 hover:bg-blue-600 flex items-center"
          title="Style this block (width, height, spacing…)"
        >
          <Palette size={11} />
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
      {menu && (
        <BlockContextMenu
          block={block}
          index={index}
          totalBlocks={total}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          column={{ sectionId: columnId, colIndex }}
        />
      )}
    </div>
  );
}

function ColumnDropSlot({
  sectionBlockId,
  colIndex,
  index,
  horizontal = false,
  fullRow = false,
}: {
  sectionBlockId: string;
  colIndex: number;
  index: number;
  /** The column lays its widgets out in a row: the slot is a thin vertical bar. */
  horizontal?: boolean;
  /** Grid layout: the slot spans a whole row instead of taking a grid cell. */
  fullRow?: boolean;
}) {
  const [isOver, setIsOver] = useState(false);
  const draggedItem = useEditorStore((s) => s.draggedItem);
  const canvasDragging = useEditorStore((s) => s.isDragging);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const addBlockToColumn = useConfigStore((s) => s.addBlockToColumn);
  const { setNodeRef } = useDroppable({
    id: `column-slot-${sectionBlockId}-${colIndex}-${index}`,
    data: { type: "column-slot", sectionBlockId, colIndex, index },
  });
  const isDragging = Boolean(draggedItem) || canvasDragging;

  return (
    <div
      ref={setNodeRef}
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

        // 1. Check if an existing block from the Navigator was dragged
        const existingId = readDraggedBlockId(e.dataTransfer);
        if (existingId) {
          const source = useConfigStore.getState().getActivePageBlocks();
          if (isSameOrInside(source, existingId, sectionBlockId)) {
            toast.error("Cannot move a container into itself");
            return;
          }
          useConfigStore.getState().moveBlockTo(existingId, {
            kind: "column",
            sectionId: sectionBlockId,
            colIndex,
            index,
          });
          selectBlock(existingId);
          toast.success(`Moved into Column ${colIndex + 1}`);
          return;
        }

        // 2. Only Blocks-panel widgets; a dragged image / link / text is ignored.
        const payload = readDropPayload(e.dataTransfer);
        if (!payload) return;
        try {
          const globalWidgets = useConfigStore.getState().config.globalWidgets;
          const { block, label } = buildBlockFromPayload(payload, globalWidgets);
          if (block) {
            addBlockToColumn(sectionBlockId, colIndex, block, index);
            selectBlock(block.id);
            toast.success(`${label} inserted in Column ${colIndex + 1}`);
          }
        } catch (err) {
          console.error("Drop into column slot failed", err);
        }
      }}
      style={fullRow ? { gridColumn: "1 / -1" } : undefined}
      className={`transition-all duration-200 relative flex items-center justify-center select-none rounded ${horizontal
          ? isOver
            ? "w-10 self-stretch mx-1 shrink-0 bg-green-500/15 border border-dashed border-green z-30"
            : isDragging
              ? "w-6 self-stretch mx-1 shrink-0 bg-green-500/5 border border-dashed border-green/40 hover:border-green hover:bg-green-500/15 z-20"
              : "w-1.5 self-stretch shrink-0 hover:w-6 hover:bg-green-500/10 hover:border hover:border-dashed hover:border-green/40 z-10"
          : isOver
            ? "h-10 my-1 bg-green-500/15 border border-dashed border-green scale-[1.01] shadow-[0_0_16px_rgba(34,197,94,0.25)] z-30"
            : isDragging
              ? "h-6 my-1 bg-green-500/5 border border-dashed border-green/40 hover:border-green hover:bg-green-500/15 z-20"
              : "h-1.5 hover:h-6 hover:bg-green-500/10 hover:border hover:border-dashed hover:border-green/40 rounded z-10 transition-all"
        }`}
    >
      {isOver && !horizontal && (
        <span className="text-[10px] font-semibold text-green pointer-events-none">
          Drop {draggedItem?.label || "widget"} here
        </span>
      )}
    </div>
  );
}

/**
 * A column's box: its width per device. Shared by the builder column and the
 * live-page column so both lay out identically.
 */
function columnBox(col: ColumnData, gap: string, stacked: boolean): { className: string; style: CSSProperties } {
  // Phone-width containers (< @md, 448px) use the column's mobile width
  // (default 100%: one per row); wider ones use its desktop width. The two are
  // stored separately, so neither overwrites the other. In a vertical
  // container the columns stack, so the same widths are used as their width
  // (aligned by the container's Align Items).
  return {
    className: stacked
      ? "min-w-0 max-w-full relative flex flex-col justify-start grow-0 shrink-0 basis-auto w-[var(--op-col-w-sm)] @md:w-[var(--op-col-w)]"
      : "min-w-0 relative flex flex-col justify-start grow-0 shrink-0 basis-[var(--op-col-basis-sm)] @md:basis-[var(--op-col-basis)]",
    style: {
      // The column's own background / padding / radius (nothing when unset).
      ...columnStyleCss(col),
      ...((stacked
        ? { "--op-col-w": `${col.width}%`, "--op-col-w-sm": `${col.mobileWidth ?? 100}%` }
        : {
          "--op-col-basis": `calc(${col.width}% - ${gap})`,
          "--op-col-basis-sm": mobileColumnBasis(col.mobileWidth, gap),
        }) as Record<string, string> as CSSProperties),
    },
  };
}

/** The box around a column's widgets, laid out by the column's Items settings. */
function itemsBox(col: ColumnData): { className: string; style: CSSProperties | undefined; inRow: boolean; grid: boolean } {
  const layout = readFlexLayout(col);
  const inRow = itemsInFlexRow(layout, "column");
  const style = flexLayoutStyle(layout);
  return {
    // With a Justify Content set it fills the column's height so vertical
    // alignment has room.
    className: `flex ${layout.justifyContent ? "flex-1" : ""} ${inRow ? "flex-row flex-wrap" : "flex-col"}`,
    style: Object.keys(style).length ? style : undefined,
    inRow,
    grid: isGridDisplay(layout.display),
  };
}

/**
 * A column on the published page / preview: only its widgets. None of the
 * builder's drop zones, placeholders, toolbars or "Drop or add widget".
 */
function StaticColumn({ col, gap, stacked, emptyHeight }: { col: ColumnData; gap: string; stacked: boolean; emptyHeight?: string }) {
  const blocks = (col.blocks || []).filter((b) => !b.id.includes("placeholder"));
  const box = columnBox(col, gap, stacked);
  const items = itemsBox(col);
  // An empty column with its own background keeps the builder's placeholder
  // height, so its colour / image stays visible on the live page.
  const minHeight =
    emptyHeight ??
    (!blocks.length && hasColumnBackground(col) && !readColumnStyle(col).minHeight ? EMPTY_COLUMN_HEIGHT : undefined);
  return (
    <div className={box.className} style={minHeight ? { ...box.style, minHeight } : box.style}>
      {blocks.length ? (
        <div data-op-col-items="" className={items.className} style={items.style}>
          {blocks.map((child) => (
            // Same spacing as in the builder, so the page looks the same.
            <div key={child.id} className="relative min-w-0 my-1.5">
              <RenderBlock block={child} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DroppableColumn({
  sectionBlockId,
  colIndex,
  col,
  gap,
  stacked = false,
}: {
  sectionBlockId: string;
  colIndex: number;
  col: ColumnData;
  gap: string;
  /** The container's direction is vertical: columns use their width, not a flex-basis. */
  stacked?: boolean;
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
  const hasCopiedBlock = useEditorStore((s) => Boolean(s.clipboardBlock));
  // The column's own "Items" layout for its widgets. Default: stacked
  // top-to-bottom at full width, exactly as before.
  const box = columnBox(col, gap, stacked);
  const items = itemsBox(col);
  const itemsInRow = items.inRow;
  const isOnlyPlaceholder = realBlocks.length === 0;
  const isHighlight = isOver || dndIsOver || Boolean(draggedItem);
  // With its own background the empty placeholder is see-through, so the
  // colour / image shows while editing.
  const ownBackground = hasColumnBackground(col);

  const handleDropData = (payload: DropPayload | null) => {
    if (!payload) return;
    try {
      const globalWidgets = useConfigStore.getState().config.globalWidgets;
      const { block: newBlock, label } = buildBlockFromPayload(payload, globalWidgets);
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
      className={box.className}
      style={box.style}
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

        // 1. Check if an existing block from the Navigator was dragged
        const existingId = readDraggedBlockId(e.dataTransfer);
        if (existingId) {
          const source = useConfigStore.getState().getActivePageBlocks();
          if (isSameOrInside(source, existingId, sectionBlockId)) {
            toast.error("Cannot move a container into itself");
            return;
          }
          useConfigStore.getState().moveBlockTo(existingId, {
            kind: "column",
            sectionId: sectionBlockId,
            colIndex,
            index: undefined,
          });
          selectBlock(existingId);
          toast.success(`Moved into Column ${colIndex + 1}`);
          return;
        }

        // 2. Only Blocks-panel widgets; a dragged image / link / text is ignored.
        handleDropData(readDropPayload(e.dataTransfer));
      }}
    >
      {isOnlyPlaceholder ? (
        <div
          className={`flex flex-col items-center justify-center p-6 min-h-[180px] rounded-xl border-2 border-dashed transition-all duration-200 select-none ${isOver
              ? "border-green bg-green-500/15 scale-[1.01] shadow-[0_0_24px_rgba(34,197,94,0.3)]"
              : isHighlight
                ? "border-green/50 bg-green-500/5"
                : ownBackground
                  ? "border-border-default hover:border-border-hover bg-transparent"
                  : "border-border-default hover:border-border-hover bg-bg-2/40"
            }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 transition-transform duration-200 ${isOver
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
              {hasCopiedBlock ? (
                <button
                  type="button"
                  onClick={() => {
                    if (pasteClipboardBlock("inside", sectionBlockId, colIndex)) toast.success(`Pasted into Column ${colIndex + 1}`);
                  }}
                  className="px-2 py-1 rounded bg-bg-3 hover:bg-bg-4 text-[10px] text-text-1 hover:text-text-0 transition-colors flex items-center gap-1 border border-border-default shadow-xs"
                  title="Paste the copied block here"
                >
                  <ClipboardPaste size={10} /> Paste
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* The widgets, laid out by the column's Items settings. */}
          <div data-op-col-items="" className={items.className} style={items.style}>
            <SortableContext items={realBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {realBlocks.map((childBlock, i) => (
                <Fragment key={childBlock.id}>
                  {/* In a grid a slot would take a cell, so only the final
                      full-row slot is shown (widgets still reorder by drag). */}
                  {!items.grid && (
                    <ColumnDropSlot
                      sectionBlockId={sectionBlockId}
                      colIndex={colIndex}
                      index={i}
                      horizontal={itemsInRow}
                    />
                  )}
                  <ColumnBlock
                    block={childBlock}
                    columnId={sectionBlockId}
                    colIndex={colIndex}
                    index={i}
                    total={realBlocks.length}
                  />
                </Fragment>
              ))}
            </SortableContext>

            <ColumnDropSlot
              sectionBlockId={sectionBlockId}
              colIndex={colIndex}
              index={realBlocks.length}
              horizontal={itemsInRow}
              fullRow={items.grid}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const block = createBlockFromType("heading");
              if (block) {
                addBlockToColumn(sectionBlockId, colIndex, block);
                selectBlock(block.id);
              }
            }}
            className={`w-full mt-2 py-2 rounded-lg border-2 border-dashed text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${isOver
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

/** Height of an empty column in the builder (its "Column 1" placeholder). */
export const EMPTY_COLUMN_HEIGHT = "180px";

const filled = (v: unknown) =>
  typeof v === "string" ? !["", "none", "transparent"].includes(v.trim().toLowerCase()) : false;

/**
 * True when a container has no widgets in any column, has a background
 * (colour or image, any device) and no height set by the user. Such a box
 * would otherwise collapse to 0px on the live page and its background vanish.
 * Empty containers without a background keep collapsing, as before.
 */
export function keepsEmptyHeight(block: BlockConfig, columns: ColumnData[]): boolean {
  const empty = columns.every((c) => !(c.blocks || []).some((b) => !b.id.includes("placeholder")));
  if (!empty) return false;
  const s = block.style;
  if (!s) return false;
  const layers = [s, s.responsive?.tablet, s.responsive?.mobile];
  const hasBackground = layers.some(
    (l) => l && (filled(l.backgroundColor) || filled(l.backgroundImage) || filled(l.sectionBackground)),
  );
  const hasHeight = layers.some((l) => l && (filled(l.minHeight) || filled(l.height)));
  return hasBackground && !hasHeight;
}

export function ColumnsBlock({ block }: { block: BlockConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p = block.props as ColumnsProps;
  const gap = p.gap || "24px";
  // The container's "Items" layout for its columns. Unset values keep the
  // original row / start / stretch layout.
  const layout = readFlexLayout(p);
  // Vertical flex and Block / Inline Block stack the columns.
  const stacked = stacksItems(layout, "row");
  // Drag-to-resize handles only make sense for a normal left-to-right flex
  // row (in a grid they would take a cell; in Block they would stack).
  const showResizers =
    !isGridDisplay(layout.display) && !isBlockDisplay(layout.display) && (!layout.direction || layout.direction === "row");
  // Only the builder canvas provides an editor scope. The published page and
  // preview get plain columns with no editing controls.
  const editing = useElementEditor()?.isEditing === true;

  const columns =
    p.columns && p.columns.length > 0
      ? p.columns
      : [
        { width: 50, blocks: [] },
        { width: 50, blocks: [] },
      ];

  // A Div is a plain box: no outer padding and no max width, so it fits
  // wherever it is placed (spacing comes from its Style tab).
  const div = isDivBlock(block);
  // Content Width: "boxed" (default) centres the content at max ~1150px with
  // side padding; "full" runs it edge to edge with no side padding.
  const fullWidth = p.contentWidth === "full";
  const outerCls = div ? "" : fullWidth ? "py-6" : "px-6 py-6";
  const innerCls = div || fullWidth ? "w-full" : "max-w-6xl mx-auto";
  // An empty container with a background keeps the builder's placeholder
  // height when live, so its colour / image is visible like in the builder.
  const keepEmptyHeight = !editing && keepsEmptyHeight(block, columns);
  const validTags = new Set(["div", "section", "article", "main", "aside", "header", "footer", "nav"]);
  const TagName: ElementType = p.htmlTag && validTags.has(p.htmlTag) ? p.htmlTag : "div";

  return (
    <TagName className={outerCls} data-op-div={div ? "" : undefined} data-op-width={fullWidth ? "full" : undefined}>
      <div
        ref={containerRef}
        className={`${innerCls} flex flex-wrap items-stretch`}
        style={{ gap, ...flexLayoutStyle(layout) }}
        data-op-container=""
      >
        {columns.map((col, i) => (
          <Fragment key={i}>
            {!editing ? (
              <StaticColumn col={col} gap={gap} stacked={stacked} emptyHeight={keepEmptyHeight ? EMPTY_COLUMN_HEIGHT : undefined} />
            ) : (
              <DroppableColumn
                sectionBlockId={block.id}
                colIndex={i}
                col={col}
                gap={gap}
                stacked={stacked}
              />
            )}
            {editing && showResizers && i < columns.length - 1 && (
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
    </TagName>
  );
}
