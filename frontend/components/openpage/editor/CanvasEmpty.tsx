"use client";

import { useState } from "react";
import { LayoutTemplate, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { readDropPayload, readDraggedBlockId, buildBlockFromPayload } from "@/lib/openpage/drag-payload";

export function CanvasEmpty() {
  const [isOver, setIsOver] = useState(false);
  const draggedItem = useEditorStore((s) => s.draggedItem);
  const addBlock = useConfigStore((s) => s.addBlock);
  const moveBlockTo = useConfigStore((s) => s.moveBlockTo);
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

        // 1. Check if an existing block from the Navigator was dragged
        const existingId = readDraggedBlockId(e.dataTransfer);
        if (existingId) {
          moveBlockTo(existingId, { kind: "root", index: 0 });
          selectBlock(existingId);
          toast.success("Section moved to canvas");
          return;
        }

        // 2. Otherwise check for a widget, preset or global payload from the Blocks panel
        const payload = readDropPayload(e.dataTransfer);
        if (!payload) return;
        try {
          const globalWidgets = useConfigStore.getState().config.globalWidgets;
          const { block: newBlock, label } = buildBlockFromPayload(payload, globalWidgets);
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
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => useEditorStore.getState().openLeftTab("components")}
            className="px-3.5 py-1.5 rounded-lg bg-green text-black font-semibold text-[12px] hover:bg-green-hover transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} /> Add block
          </button>
          <button
            type="button"
            onClick={() => useEditorStore.getState().openLeftTab("templates")}
            className="px-3.5 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 font-medium text-[12px] hover:border-border-hover transition-colors flex items-center gap-1.5"
          >
            <LayoutTemplate size={14} /> Browse templates
          </button>
        </div>
      )}
    </div>
  );
}
