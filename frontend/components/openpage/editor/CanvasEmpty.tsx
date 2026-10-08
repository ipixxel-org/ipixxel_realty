"use client";

import { useState } from "react";
import { LayoutTemplate, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { createBlockFromType, createBlockFromPresetId } from "@/lib/openpage/block-factory";
import type { BlockConfig } from "@/components/openpage/blocks/types";

export function CanvasEmpty() {
  const [isOver, setIsOver] = useState(false);
  const draggedItem = useEditorStore((s) => s.draggedItem);
  const addBlock = useConfigStore((s) => s.addBlock);
  const selectBlock = useEditorStore((s) => s.selectBlock);

  const isDragging = Boolean(draggedItem);

  return (
    <div
      data-tour="canvas"
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
            addBlock(newBlock, 0);
            selectBlock(newBlock.id);
            toast.success(`${label} added to canvas`);
          }
        } catch (err) {
          console.error("Drop onto empty canvas failed", err);
        }
      }}
      className={`flex-1 flex flex-col items-center justify-center gap-4 text-center p-12 relative z-[1] transition-all duration-300 rounded-2xl mx-auto my-10 max-w-2xl border-2 border-dashed ${
        isOver
          ? "border-green bg-green-500/10 scale-[1.02] shadow-[0_0_30px_rgba(34,197,94,0.2)]"
          : isDragging
          ? "border-green/50 bg-green-500/5 animate-pulse"
          : "border-border-default bg-bg-2/50"
      }`}
    >
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-300 ${
          isOver
            ? "bg-green text-black scale-110 shadow-lg"
            : isDragging
            ? "bg-green-glow text-green animate-bounce"
            : "bg-bg-3 text-text-3"
        }`}
      >
        {isOver ? <Plus size={32} /> : isDragging ? <Sparkles size={28} /> : <LayoutTemplate size={28} />}
      </div>

      <div>
        <h3 className="text-base font-semibold text-text-0">
          {isOver
            ? `Drop to add ${draggedItem?.label || "block"} here`
            : isDragging
            ? `Drop ${draggedItem?.label || "block"} to start your page`
            : "Blank canvas"}
        </h3>
        <p className="text-[12px] text-text-3 max-w-[360px] leading-relaxed mt-1">
          {isDragging
            ? "Release your mouse to place this component onto the canvas"
            : "Drag and drop any block or template from the left sidebar to start building your page."}
        </p>
      </div>

      {!isDragging && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => useEditorStore.getState().openLeftTab("templates")}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-green text-bg-0 text-[12px] font-semibold hover:bg-green/90 transition-colors"
            >
              <LayoutTemplate size={14} />
              Browse section templates
            </button>
            <button
              type="button"
              onClick={() => useEditorStore.getState().openLeftTab("components")}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border-default bg-bg-2 text-text-1 text-[12px] font-semibold hover:bg-bg-3 hover:text-text-0 transition-colors"
            >
              <Plus size={14} />
              Add a block
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-3 border border-border-subtle rounded-full px-3 py-1 bg-bg-3/60">
            <span className="inline-block w-2 h-2 rounded-full bg-green animate-ping" />
            Drag widgets from the left, or press Ctrl+K to search everything
          </div>
        </div>
      )}
    </div>
  );
}
