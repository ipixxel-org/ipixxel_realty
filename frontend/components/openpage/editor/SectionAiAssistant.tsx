"use client";

import { useState } from "react";
import { Sparkles, Wand2, X, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import {
  editAiComponent,
  regenerateAiSection,
  type RegenerateSectionParams,
} from "@/lib/openpage/ai-service";
import type { BlockConfig } from "@/components/openpage/blocks/types";

export function SectionAiAssistant({
  block,
  open,
  onClose,
}: {
  block: BlockConfig;
  open: boolean;
  onClose: () => void;
}) {
  const updateBlock = useConfigStore((s) => s.updateBlock);
  const siteConfig = useConfigStore((s) => s.config);
  const selectedElement = useEditorStore((s) => s.selectedElement);

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [tone, setTone] = useState("luxury");

  // Element deep-selection (canvas click on a heading, CTA, list item...) lets
  // the AI edit just that node instead of rewriting the whole section.
  const targetElementId =
    selectedElement && selectedElement.blockId === block?.id
      ? selectedElement.elementId
      : undefined;

  if (!open || !block) return null;

  const context = {
    projectName: siteConfig.property?.name || siteConfig.name,
    location: siteConfig.property?.location,
    category: siteConfig.property?.type,
  };

  const persist = (updated: BlockConfig) => {
    updateBlock(block.id, {
      props: updated.props ?? block.props,
      style: updated.style ?? block.style,
      elementStyles: updated.elementStyles ?? block.elementStyles,
    });
  };

  const handleExecute = async (actionToRun?: RegenerateSectionParams["action"]) => {
    const action = actionToRun || "rewrite";
    setLoading(true);

    try {
      const updated = await regenerateAiSection({
        action,
        block,
        tone,
        prompt: prompt.trim() || undefined,
        siteContext: context,
      });

      if (updated && updated.props) {
        updateBlock(block.id, {
          props: { ...block.props, ...updated.props },
          style: { ...block.style, ...updated.style },
        });
        toast.success(`Section updated via AI!`);
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update section");
    } finally {
      setLoading(false);
    }
  };

  // Natural-language, element-scoped edit (Builder.io-style "edit with AI").
  const handleCustomEdit = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the change you want first");
      return;
    }
    setLoading(true);
    try {
      const updated = await editAiComponent({
        block,
        prompt: prompt.trim(),
        elementId: targetElementId,
        action: "edit",
        tone,
        siteContext: context,
      });
      if (updated && typeof updated === "object") {
        persist(updated);
        toast.success(
          targetElementId
            ? `Element "${targetElementId}" updated via AI`
            : "Component updated via AI",
        );
        setPrompt("");
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply AI edit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-bg-1 border border-border-default rounded-xl shadow-2xl flex flex-col overflow-hidden text-text-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-default flex items-center justify-between bg-bg-2/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#6d5dfc] to-[#ec4899] text-white flex items-center justify-center shadow-xs">
              <Sparkles size={14} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-0">
                AI Section Copilot · <span className="capitalize text-[#6d5dfc]">{block.type}</span>
              </h4>
              <p className="text-[10px] text-text-3">Rewrite copy, change tone or enhance conversion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-text-3 hover:text-text-0 hover:bg-bg-3"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 text-xs">
          {targetElementId && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#22d3ee]/10 border border-[#22d3ee]/30 text-[11px] text-[#0e7490]">
              <span className="font-semibold">Target element:</span>
              <code className="font-mono">{targetElementId}</code>
            </div>
          )}

          {/* Quick Action Buttons */}
          <div>
            <label className="block text-[11px] font-medium text-text-2 mb-2">
              Instant AI Transformations
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "improve-headline", label: "Catchier Headline", desc: "Punchy & high-impact" },
                { id: "rewrite", label: "Polished Luxury Copy", desc: "Refined & evocative" },
                { id: "shorten", label: "Make Concise", desc: "Crisp & scannable" },
                { id: "improve-cta", label: "Boost CTA Appeal", desc: "Urgent & action-driven" },
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => handleExecute(act.id as RegenerateSectionParams["action"])}
                  disabled={loading}
                  className="p-2.5 rounded-lg border border-border-default bg-bg-2/40 hover:border-[#6d5dfc]/50 hover:bg-[#6d5dfc]/5 text-left transition-all group disabled:opacity-50"
                >
                  <div className="font-semibold text-text-0 group-hover:text-[#6d5dfc] flex items-center gap-1.5">
                    <Zap size={11} className="text-[#6d5dfc]" />
                    {act.label}
                  </div>
                  <div className="text-[9.5px] text-text-3 mt-0.5">{act.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Instruction */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-text-2">
              Or Custom Direction / Fact to Include
            </label>
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Emphasize private sea-facing sundecks and German fittings..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-border-default bg-bg-2/50 text-text-0 placeholder:text-text-3 outline-none focus:border-[#6d5dfc] resize-none"
            />
          </div>

          {/* Tone Selector */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-text-2">Tone:</span>
            {["luxury", "urgent", "corporate", "friendly"].map((t) => (
              <label key={t} className="flex items-center gap-1 text-[11px] text-text-1 capitalize cursor-pointer">
                <input
                  type="radio"
                  name="tone"
                  value={t}
                  checked={tone === t}
                  onChange={() => setTone(t)}
                  className="text-[#6d5dfc]"
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border-default bg-bg-2/40 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-text-2 hover:bg-bg-3"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCustomEdit}
              disabled={loading || !prompt.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#6d5dfc] to-[#ec4899] text-white hover:opacity-95 shadow-sm flex items-center gap-1.5 disabled:opacity-40"
              title="Apply your instruction to the selected element or section"
            >
              {loading ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              Apply Instruction
            </button>
            <button
              type="button"
              onClick={() => handleExecute()}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#6d5dfc] text-white hover:bg-[#5b4be0] shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Wand2 size={12} />
                  Regenerate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
