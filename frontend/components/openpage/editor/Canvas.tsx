"use client";

import { useMemo, useCallback, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { CanvasEmpty } from "./CanvasEmpty";
import { SortableBlock } from "./SortableBlock";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { resolveTheme, themeToCSS } from "@/lib/openpage/theme-presets";
import { useGoogleFonts } from "@/lib/openpage/useGoogleFonts";
import { createBlockFromType, createBlockFromPresetId } from "@/lib/openpage/block-factory";
import { findBlock } from "@/lib/openpage/block-tree";
import type { BlockConfig, BlockStyle } from "@/components/openpage/blocks/types";
import { ElementEditorContext } from "@/components/openpage/blocks/El";
import { DeviceProvider } from "@/components/openpage/runtime/device";

const VIEWPORT_WIDTHS = { desktop: 880, tablet: 768, mobile: 375 } as const;

function CanvasDropZone({
  index,
  isFirst,
  isLast,
}: {
  index: number;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const [isOver, setIsOver] = useState(false);
  const draggedItem = useEditorStore((s) => s.draggedItem);
  const addBlock = useConfigStore((s) => s.addBlock);
  const selectBlock = useEditorStore((s) => s.selectBlock);

  const isDragging = Boolean(draggedItem);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        useEditorStore.getState().setDraggedItem(null);
        const raw = e.dataTransfer.getData("application/x-openpage-drag");
        if (!raw) return;
        try {
          const payload = JSON.parse(raw);
          let newBlock: BlockConfig | null = null;
          let label = "Block";
          if (payload.kind === "block") {
            newBlock = createBlockFromType(payload.type);
            label = payload.label || payload.type;
          } else if (payload.kind === "preset") {
            newBlock = createBlockFromPresetId(payload.presetId);
            label = payload.label || "Section";
          } else if (payload.kind === "global") {
            const gw = useConfigStore.getState().config.globalWidgets?.find((w) => w.id === payload.globalWidgetId);
            if (gw) {
              newBlock = { ...JSON.parse(JSON.stringify(gw.block)), id: `block-${Date.now()}` };
              label = gw.name;
            }
          }
          if (newBlock) {
            addBlock(newBlock, index);
            selectBlock(newBlock.id);
            toast.success(`${label} inserted`);
          }
        } catch (err) {
          console.error("Drop in canvas failed", err);
        }
      }}
      className={`transition-all duration-200 relative flex items-center justify-center select-none ${
        isOver
          ? "h-12 my-1 bg-green-500/15 border-2 border-dashed border-green rounded-xl scale-[1.01] shadow-[0_0_20px_rgba(34,197,94,0.25)] z-30"
          : isDragging
          ? "h-8 my-1 bg-green-500/5 border border-dashed border-green/40 hover:border-green hover:bg-green-500/15 rounded-lg z-20"
          : "h-2 opacity-0 hover:opacity-100 hover:h-8 hover:bg-green-500/10 hover:border hover:border-dashed hover:border-green/40 rounded z-10"
      }`}
    >
      {(isOver || isDragging) && (
        <div
          className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide pointer-events-none transition-all ${
            isOver ? "text-green scale-105" : "text-green/80"
          }`}
        >
          <Plus size={13} className={isOver ? "stroke-[2.5]" : ""} />
          <span>
            {isOver
              ? `Drop to insert ${draggedItem?.label || "block"} here`
              : isFirst
              ? "Drop here (Top)"
              : isLast
              ? "Drop here (Bottom)"
              : "Drop here"}
          </span>
        </div>
      )}
    </div>
  );
}

export function Canvas() {
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages;
    if (!pages || pages.length === 0) return s.config.blocks;
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0];
    return page.blocks;
  });
  const theme = useConfigStore((s) => s.config.theme);
  const moveBlock = useConfigStore((s) => s.moveBlock);
  const moveBlockInColumn = useConfigStore((s) => s.moveBlockInColumn);
  const moveBlockTo = useConfigStore((s) => s.moveBlockTo);
  const { selectedBlockId, selectBlock, viewport, setIsDragging, showGrid } = useEditorStore();

  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  const cssVars = useMemo(() => themeToCSS(resolved), [resolved]);

  const blockFonts = useMemo(() => {
    const fonts = new Set<string>();
    function scanStyles(style: BlockStyle | undefined) {
      if (style?.typography?.fontFamily) fonts.add(style.typography.fontFamily);
      if (style?.responsive?.tablet?.typography?.fontFamily) fonts.add(style.responsive.tablet.typography.fontFamily);
      if (style?.responsive?.mobile?.typography?.fontFamily) fonts.add(style.responsive.mobile.typography.fontFamily);
    }
    function scan(list: BlockConfig[]) {
      for (const b of list) {
        scanStyles(b.style);
        // Element-level styles can introduce fonts the block style never used.
        if (b.elementStyles) {
          for (const style of Object.values(b.elementStyles)) scanStyles(style);
        }
        if (b.type === "columns") {
          const cols = b.props.columns as Array<{ blocks?: BlockConfig[] }> | undefined;
          cols?.forEach((c) => c.blocks && scan(c.blocks));
        }
      }
    }
    scan(blocks);
    return Array.from(fonts);
  }, [blocks]);

  useGoogleFonts([resolved.fontSans, resolved.fontDisplay, resolved.fontMono, ...blockFonts]);

  const pxWidth = VIEWPORT_WIDTHS[viewport];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeBlock = useMemo(() => (activeId ? findBlock(blocks, activeId) : undefined), [blocks, activeId]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setIsDragging(true);
  }, [setIsDragging]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setIsDragging(false);
    if (!over || active.id === over.id) return;

    const activeData = active.data?.current as Record<string, unknown> | undefined;
    const overData = over.data?.current as Record<string, unknown> | undefined;

    const getColumnBlocks = (sectionId: string | unknown, colIdx: unknown): BlockConfig[] | undefined => {
      const sectionBlock = blocks.find((b) => b.id === String(sectionId));
      if (!sectionBlock || sectionBlock.type !== "columns") return undefined;
      const cols = sectionBlock.props.columns as Array<{ width: number; blocks: BlockConfig[] }> | undefined;
      return cols?.[colIdx as number]?.blocks;
    };

    // ---- Blocks that live inside a column ----
    if (activeData?.type === "column-block") {
      const activeSecId = String(activeData.columnId);
      const activeColIdx = activeData.colIndex as number;

      // 1) Reorder within the same column
      if (
        overData?.type === "column-block" &&
        overData.columnId === activeSecId &&
        overData.colIndex === activeColIdx
      ) {
        const colBlocks = getColumnBlocks(activeSecId, activeColIdx);
        if (colBlocks) {
          const oldIndex = colBlocks.findIndex((b) => b.id === active.id);
          const newIndex = colBlocks.findIndex((b) => b.id === over.id);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            moveBlockInColumn(activeSecId, activeColIdx, oldIndex, newIndex);
            return;
          }
        }
      }

      if (!findBlock(blocks, String(active.id))) return;

      // 2) Move into a different column (at exact position or the end)
      if (overData?.type === "column-block" && overData.columnId !== activeSecId) {
        const targetBlocks = getColumnBlocks(overData.columnId, overData.colIndex);
        const overIndex = targetBlocks?.findIndex((b) => b.id === over.id) ?? -1;
        moveBlockTo(String(active.id), {
          kind: "column",
          sectionId: String(overData.columnId),
          colIndex: overData.colIndex as number,
          index: overIndex >= 0 ? overIndex : undefined,
        });
        return;
      }
      if (overData?.type === "column") {
        moveBlockTo(String(active.id), {
          kind: "column",
          sectionId: String(overData.sectionBlockId),
          colIndex: overData.colIndex as number,
        });
        return;
      }

      // 3) Move up out of the column to the root level
      const rootOverIndex = blocks.findIndex((b) => b.id === over.id);
      if (rootOverIndex !== -1) {
        moveBlockTo(String(active.id), { kind: "root", index: rootOverIndex });
      }
      return;
    }

    // ---- Root-level blocks being dropped into a column ----
    if (overData?.type === "column" || overData?.type === "column-block") {
      const targetSectionId = overData.type === "column"
        ? overData.sectionBlockId
        : overData.columnId;
      const targetColIndex = overData.colIndex as number;
      let targetIndex: number | undefined;
      if (overData.type === "column-block") {
        const targetBlocks = getColumnBlocks(targetSectionId, targetColIndex);
        const idx = targetBlocks?.findIndex((b) => b.id === over.id) ?? -1;
        if (idx >= 0) targetIndex = idx;
      }
      moveBlockTo(String(active.id), {
        kind: "column",
        sectionId: String(targetSectionId),
        colIndex: targetColIndex,
        index: targetIndex,
      });
      return;
    }

    // ---- Root-level reorder ----
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      moveBlock(oldIndex, newIndex);
    }
  }, [blocks, moveBlock, moveBlockInColumn, moveBlockTo, setIsDragging]);

  if (blocks.length === 0) {
    return <CanvasEmpty />;
  }

  const canvasContent = (
    <DeviceProvider device={viewport}>
      <div
        className="@container border rounded-xl min-h-[400px] relative z-[1] overflow-visible pt-4 pb-8 transition-all duration-300"
        style={{
          width: `${pxWidth}px`,
          maxWidth: `${pxWidth}px`,
          ...cssVars,
          color: (cssVars as Record<string, string>)["--op-text"] || "var(--color-text-0)",
          backgroundColor: (cssVars as Record<string, string>)["--op-bg"] || "#ffffff",
          borderColor: "var(--color-border-default)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06)",
        } as React.CSSProperties}
        onClick={(e) => {
          if (e.target === e.currentTarget) selectBlock(null);
        }}
        role="region"
        aria-label={`Site preview, ${blocks.length} blocks, ${viewport} viewport`}
      >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setIsDragging(false);
        }}
      >
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <CanvasDropZone index={0} isFirst />
          {blocks.map((block, idx) => (
            <div key={block.id} className="relative">
              <SortableBlock
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => selectBlock(block.id)}
              >
                <ElementEditorContext.Provider value={{ blockId: block.id, isEditing: true }}>
                  <RenderBlock block={block} />
                </ElementEditorContext.Provider>
              </SortableBlock>
              <CanvasDropZone index={idx + 1} isLast={idx === blocks.length - 1} />
            </div>
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeBlock ? (
            <div className="opacity-95 border-2 border-[#5b9cff] shadow-2xl rounded-xl overflow-hidden pointer-events-none bg-bg-1 scale-[0.99] max-w-4xl">
              <div className="bg-[#5b9cff] text-white text-[10px] font-semibold px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
                <GripVertical size={12} />
                <span>Moving section: {activeBlock.type}</span>
              </div>
              <div className="pointer-events-none opacity-80 max-h-[260px] overflow-hidden">
                <ElementEditorContext.Provider value={{ blockId: activeBlock.id, isEditing: false }}>
                  <RenderBlock block={activeBlock} />
                </ElementEditorContext.Provider>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      </div>
    </DeviceProvider>
  );

  return (
    <div className="ps-builder-canvas flex-1 flex items-start justify-center p-6 overflow-auto relative">
      <div
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-bg-5) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      {showGrid && (
        <>
          {/* Alignment Grid Overlay */}
          <div
            className="absolute inset-0 z-10 pointer-events-none opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(59, 130, 246, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(59, 130, 246, 0.25) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          {/* Top Ruler Indicator */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-bg-2/90 border-b border-border-default z-20 flex items-center px-6 text-[9px] font-mono text-text-3 select-none justify-between">
            <span>0px</span>
            <span>200px</span>
            <span>400px</span>
            <span>600px</span>
            <span>800px</span>
            <span>1000px</span>
            <span>1200px</span>
          </div>
        </>
      )}

      {viewport === "tablet" ? (
        <div className="relative z-[1]">
          <div
            className="border-[12px] border-bg-4 rounded-2xl bg-bg-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
            style={{ width: `${pxWidth + 24}px` }}
          >
            <div className="rounded-lg overflow-hidden">
              {canvasContent}
            </div>
          </div>
        </div>
      ) : viewport === "mobile" ? (
        <div className="relative z-[1]">
          <div
            className="border-[10px] border-bg-4 rounded-[2rem] bg-bg-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
            style={{ width: `${pxWidth + 20}px` }}
          >
            <div className="flex justify-center -mt-[4px] mb-1">
              <div className="w-24 h-5 bg-bg-4 rounded-b-xl" />
            </div>
            <div className="rounded-xl overflow-hidden">
              {canvasContent}
            </div>
            <div className="flex justify-center mt-2 pb-1">
              <div className="w-28 h-1 bg-bg-5 rounded-full" />
            </div>
          </div>
        </div>
      ) : (
        canvasContent
      )}
    </div>
  );
}
