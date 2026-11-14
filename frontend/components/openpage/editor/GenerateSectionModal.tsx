"use client";

import { useState } from "react";
import { Sparkles, Wand2, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { generateAiSection } from "@/lib/openpage/ai-service";
import type { BlockType } from "@/components/openpage/blocks/types";

const POPULAR_SECTION_TYPES: { type: BlockType; label: string; placeholder: string }[] = [
  { type: "features", label: "Highlights / Features", placeholder: "e.g. 4 architectural highlights emphasizing Italian marble, double-height ceilings, and private pool" },
  { type: "pricing", label: "Payment Plan / Pricing", placeholder: "e.g. 3-stage flexible payment plan with 10% on booking, 40% during construction, 50% on possession" },
  { type: "amenities", label: "Luxury Amenities", placeholder: "e.g. Club house amenities including infinity pool, squash court, organic cafe and spa" },
  { type: "testimonials", label: "Buyer Reviews", placeholder: "e.g. 3 glowing testimonials from NRI investors and luxury apartment buyers" },
  { type: "faq", label: "Frequently Asked Questions", placeholder: "e.g. 4 key FAQs about possession timeline, RERA approval, bank loans, and maintenance charges" },
  { type: "cta", label: "High-Urgency CTA Banner", placeholder: "e.g. Limited festive offer: Zero Stamp Duty on bookings made before Diwali with countdown" },
];

export function GenerateSectionModal({
  open,
  onClose,
  insertIndex,
}: {
  open: boolean;
  onClose: () => void;
  insertIndex?: number;
}) {
  const addBlock = useConfigStore((s) => s.addBlock);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const siteConfig = useConfigStore((s) => s.config);

  const [selectedType, setSelectedType] = useState<string>("features");
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("luxury");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const currentPlaceholder =
    POPULAR_SECTION_TYPES.find((t) => t.type === selectedType)?.placeholder ||
    "Describe the section you want to generate in detail...";

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt describing the section to generate");
      return;
    }

    setLoading(true);
    try {
      const generated = await generateAiSection({
        sectionType: selectedType,
        prompt: prompt.trim(),
        tone,
        siteContext: {
          projectName: siteConfig.property?.name || siteConfig.name,
          location: siteConfig.property?.location,
          category: siteConfig.property?.type,
        },
      });

      if (generated && generated.id) {
        addBlock(generated, insertIndex);
        selectBlock(generated.id);
        toast.success(`AI generated new ${generated.type} section!`);
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate AI section");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-bg-1 border border-border-default rounded-xl shadow-2xl flex flex-col overflow-hidden text-text-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-default flex items-center justify-between bg-bg-2/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#6d5dfc] to-[#ec4899] text-white flex items-center justify-center shadow-xs">
              <Sparkles size={14} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-0">
                AI Section Generator
              </h4>
              <p className="text-[10px] text-text-3">
                Generate and insert new tailored sections using natural language
              </p>
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
          {/* Section Type Selector */}
          <div>
            <label className="block text-[11px] font-medium text-text-2 mb-1.5">
              Select Section Purpose
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {POPULAR_SECTION_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setSelectedType(item.type)}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    selectedType === item.type
                      ? "border-[#6d5dfc] bg-[#6d5dfc]/10 text-text-0 font-medium"
                      : "border-border-default bg-bg-2/40 text-text-2 hover:bg-bg-3"
                  }`}
                >
                  <div className="text-[11px] truncate">{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-text-2">
              Prompt / Specific Details to Include
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={currentPlaceholder}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border-default bg-bg-2/50 text-text-0 placeholder:text-text-3 outline-none focus:border-[#6d5dfc] resize-none"
            />
          </div>

          {/* Tone Selector */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-text-2">Tone:</span>
            {["luxury", "urgent", "investment", "friendly"].map((t) => (
              <label
                key={t}
                className="flex items-center gap-1 text-[11px] text-text-1 capitalize cursor-pointer"
              >
                <input
                  type="radio"
                  name="gen-tone"
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
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#6d5dfc] to-[#ec4899] text-white hover:opacity-95 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                Generating Section...
              </>
            ) : (
              <>
                <Wand2 size={12} />
                Generate & Insert
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

