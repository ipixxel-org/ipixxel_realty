"use client";

import { useEffect, useState, useRef } from "react";
import {
  Sparkles as SparklesIcon,
  X as XIcon,
  Building2 as Building2Icon,
  Palette as PaletteIcon,
  CheckCircle2 as CheckCircle2Icon,
  RefreshCw as RefreshCwIcon,
  Layers as LayersIcon,
  ArrowRight as ArrowRightIcon,
  Check as CheckIcon,
  Zap as ZapIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import {
  generateAiTemplate,
  getAiStatus,
  type GenerateAiTemplateParams,
} from "@/lib/openpage/ai-service";
import { apiFetch } from "@/lib/api";
import { applyBlocksDefaults } from "@/lib/openpage/block-factory";
import type { SiteConfig } from "@/components/openpage/blocks/types";

interface ProjectOption {
  id: string;
  name: string;
  location?: string;
  startingPrice?: string;
}

const QUICK_PROMPTS = [
  {
    tag: "🌊 Seafront Luxury",
    text: "Ultra-luxury seafront penthouse with private elevator foyer, infinity pool, 3 & 4 BHK sky villas, and VIP enquiry form",
  },
  {
    tag: "🌿 Gated Villas",
    text: "Exclusive gated villa sanctuary with 50,000 sq.ft. clubhouse, tennis court, 80% open greens and private plunge pools",
  },
  {
    tag: "🏙 High-Rise Homes",
    text: "Modern 2 & 3 BHK high-rise family apartments 5 mins from metro station, smart amenities and flexible payment plans",
  },
  {
    tag: "🏬 Commercial Hub",
    text: "Grade-A commercial office suites and flagship retail boulevard with flexible floorplates and EV charging infrastructure",
  },
  {
    tag: "⛳ Golf Residences",
    text: "Prestige golf estate residences overlooking an 18-hole championship course, royal clubhouse and bespoke concierge service",
  },
];

const STYLE_PRESETS = [
  { id: "modern", name: "Modern Royal", primary: "#6d5dfc", accent: "#c5a075", desc: "Royal purple & champagne gold" },
  { id: "ivory", name: "Ivory Luxury", primary: "#c5a075", accent: "#1a1612", desc: "Warm architectural beige & bronze" },
  { id: "vista", name: "Emerald Estate", primary: "#059669", accent: "#d97706", desc: "Lush botanical greens & gold" },
  { id: "midnight", name: "Midnight Luxe", primary: "#38bdf8", accent: "#090d16", desc: "Sleek dark obsidian & cyan" },
  { id: "crimson", name: "Vista Crimson", primary: "#e11d2e", accent: "#0f172a", desc: "High-contrast dynamic red" },
];

const DEFAULT_SECTIONS = [
  { id: "navbar", label: "Navigation Header", defaultChecked: true },
  { id: "project-banner", label: "Hero Banner with CTAs", defaultChecked: true },
  { id: "project-overview", label: "Project Philosophy & Overview", defaultChecked: true },
  { id: "property-details", label: "Specifications & Metrics", defaultChecked: true },
  { id: "amenities", label: "Clubhouse Amenities Grid", defaultChecked: true },
  { id: "floor-plans", label: "Floor Plans & Masterplans", defaultChecked: true },
  { id: "re-pricing", label: "Starting Pricing & Offers", defaultChecked: true },
  { id: "location", label: "Location & Travel Times", defaultChecked: true },
  { id: "developer", label: "Builder Profile & Credentials", defaultChecked: true },
  { id: "testimonials", label: "Resident Testimonials", defaultChecked: true },
  { id: "faq", label: "Buyer FAQ Accordion", defaultChecked: true },
  { id: "cta", label: "Urgent Conversion Banner", defaultChecked: true },
  { id: "lead-form", label: "Lead Capture & Enquiry Form", defaultChecked: true },
  { id: "footer", label: "Footer & Legal Compliance", defaultChecked: true },
];

export function AiTemplateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const currentConfig = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const selectBlock = useEditorStore((s) => s.selectBlock);

  const [prompt, setPrompt] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("Luxury");
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PRESETS[0]);
  const [customStyleActive, setCustomStyleActive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>(
    DEFAULT_SECTIONS.filter((s) => s.defaultChecked).map((s) => s.id),
  );

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSite, setGeneratedSite] = useState<SiteConfig | null>(null);

  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    model: string;
    provider?: string;
  }>({
    configured: true,
    model: "",
    provider: "",
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    getAiStatus()
      .then((status) => {
        // Show the exact model id the backend will call — never a guessed label.
        if (status) setAiStatus(status);
      })
      .catch(() => {});

    apiFetch<{ data?: ProjectOption[]; items?: ProjectOption[] }>("/org/projects?limit=50")
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data || res.items || [];
        setProjects(list);
      })
      .catch(() => {});

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 150);
  }, [open]);

  // Pre-fill on project selection
  const handleSelectProject = (projId: string) => {
    setSelectedProjectId(projId);
    const proj = projects.find((p) => p.id === projId);
    if (proj) {
      if (!templateName) setTemplateName(proj.name);
      setPrompt(
        `High-converting luxury landing page for ${proj.name} at ${proj.location || "prime location"}. Showcase architectural highlights, configurations, world-class amenities, transparent pricing and lead capture form.`
      );
    }
  };

  const toggleSection = (id: string) => {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    const finalPrompt = prompt.trim() || QUICK_PROMPTS[0].text;
    setIsGenerating(true);
    setGeneratedSite(null);

    const payload: GenerateAiTemplateParams = {
      mode: selectedProjectId ? "project" : "prompt",
      prompt: finalPrompt,
      templateName: templateName.trim() || currentConfig.name || "AI Luxury Showcase",
      category,
      projectId: selectedProjectId || undefined,
      designStyle: customStyleActive ? selectedStyle.name : undefined,
      primaryColor: customStyleActive ? selectedStyle.primary : undefined,
      accentColor: customStyleActive ? selectedStyle.accent : undefined,
      selectedSections: customStyleActive ? selectedSections : undefined,
    };

    try {
      const site = await generateAiTemplate(payload);
      setGeneratedSite(site);
      toast.success("AI landing page generated successfully!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate AI template");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToCanvas = () => {
    if (!generatedSite) return;
    const site: SiteConfig = {
      ...generatedSite,
      blocks: applyBlocksDefaults(generatedSite.blocks ?? []),
    };
    setConfig(site);
    if (site.blocks?.[0]?.id) {
      selectBlock(site.blocks[0].id);
    }
    toast.success("Page applied to OpenPage visual canvas!");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#141822] border border-white/10 rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#6d5dfc] via-[#8b5cf6] to-[#ec4899] text-white flex items-center justify-center shadow-lg shadow-[#6d5dfc]/30">
              <SparklesIcon size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  AI Page Generator
                </h3>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#6d5dfc]/20 text-[#a594fd] border border-[#6d5dfc]/30 flex items-center gap-1">
                  <ZapIcon size={10} className="text-[#a594fd]" />
                  {aiStatus.model || "Google Gemini"}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Type your requirements in plain English. AI writes copy, picks colors, and builds your page.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!generatedSite ? (
            <>
              {/* Main Prompt Box */}
              <div className="space-y-2">
                <div className="relative rounded-xl border border-white/15 bg-white/[0.04] p-3.5 focus-within:border-[#6d5dfc] focus-within:ring-2 focus-within:ring-[#6d5dfc]/20 transition-all">
                  <textarea
                    ref={textareaRef}
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        handleGenerate();
                      }
                    }}
                    placeholder="Describe your ideal landing page... (e.g. Ultra-luxury seafront residential tower with 3 & 4 BHK sky villas, infinity pool, floor plans, starting ₹2.5 Cr and VIP booking form)"
                    className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none leading-relaxed resize-none"
                  />

                  {/* Bottom bar inside prompt container */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-1 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <span>Tip: Press</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-zinc-300">
                        Ctrl + Enter
                      </kbd>
                      <span>to generate</span>
                    </span>

                    {prompt.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPrompt("")}
                        className="text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick 1-Click Prompt Chips */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-zinc-400">
                    Or pick an instant concept:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map((qp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPrompt(qp.text)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-[#6d5dfc]/20 hover:text-[#a594fd] hover:border-[#6d5dfc]/40 border border-white/10 text-zinc-300 transition-all"
                      >
                        {qp.tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optional Project Connection */}
              {projects.length > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-2 text-xs text-zinc-300">
                    <Building2Icon size={14} className="text-[#6d5dfc]" />
                    <span>Link with CRM Project:</span>
                  </div>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => handleSelectProject(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-white/10 bg-[#1a1e2b] text-white outline-none focus:border-[#6d5dfc] max-w-[240px]"
                  >
                    <option value="">None (Standalone Page)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.location ? `(${p.location})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Advanced Options Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                >
                  <SlidersHorizontalIcon size={13} className="text-[#6d5dfc]" />
                  <span>Customize colors, title & sections (Optional)</span>
                  {showAdvanced ? (
                    <ChevronUpIcon size={13} />
                  ) : (
                    <ChevronDownIcon size={13} />
                  )}
                </button>

                {showAdvanced && (
                  <div className="mt-2.5 p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Template Name & Category */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Template / Project Name
                        </label>
                        <input
                          type="text"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder="e.g. Skyline Residences"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-white/10 bg-[#1a1e2b] text-white outline-none focus:border-[#6d5dfc]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Property Category
                        </label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-white/10 bg-[#1a1e2b] text-white outline-none focus:border-[#6d5dfc]"
                        >
                          <option value="Luxury">Luxury Residence</option>
                          <option value="Residential">Residential High-Rise</option>
                          <option value="Commercial">Commercial & Retail</option>
                          <option value="Villa">Gated Villa Community</option>
                          <option value="Plot">Plotted Development</option>
                        </select>
                      </div>
                    </div>

                    {/* Color Palette Presets */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-medium text-zinc-400">
                          Color Palette & Aesthetic
                        </label>
                        <button
                          type="button"
                          onClick={() => setCustomStyleActive(!customStyleActive)}
                          className="text-[10px] text-[#a594fd] hover:underline"
                        >
                          {customStyleActive ? "Let AI choose colors" : "Lock palette"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {STYLE_PRESETS.map((p) => {
                          const active = customStyleActive && selectedStyle.id === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedStyle(p);
                                setCustomStyleActive(true);
                              }}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                active
                                  ? "border-[#6d5dfc] bg-[#6d5dfc]/15 ring-1 ring-[#6d5dfc]"
                                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-black/20"
                                  style={{ backgroundColor: p.primary }}
                                />
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-black/20"
                                  style={{ backgroundColor: p.accent }}
                                />
                              </div>
                              <div className="text-[10.5px] font-semibold text-white truncate">
                                {p.name}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sections Checklist */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-medium text-zinc-400">
                          Sections to Include ({selectedSections.length})
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSections(DEFAULT_SECTIONS.map((s) => s.id))
                            }
                            className="text-[10px] text-[#a594fd] hover:underline"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedSections([])}
                            className="text-[10px] text-zinc-500 hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {DEFAULT_SECTIONS.map((s) => {
                          const checked = selectedSections.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                toggleSection(s.id);
                                setCustomStyleActive(true);
                              }}
                              className={`flex items-center gap-1.5 p-1.5 rounded-md text-left text-[11px] transition-all border ${
                                checked
                                  ? "bg-white/[0.06] border-[#6d5dfc]/40 text-white"
                                  : "bg-transparent border-white/5 text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              <div
                                className={`w-3 h-3 rounded flex items-center justify-center border text-[8px] ${
                                  checked
                                    ? "bg-[#6d5dfc] border-[#6d5dfc] text-white"
                                    : "border-white/20"
                                }`}
                              >
                                {checked && <CheckIcon size={9} strokeWidth={3} />}
                              </div>
                              <span className="truncate">{s.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Generated Review Card */
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2Icon size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Page Generated Successfully!
                  </h4>
                  <p className="text-xs text-zinc-300">
                    {generatedSite.blocks?.length || 0} OpenPage sections assembled with live copy, design tokens, and CRM-ready lead capture.
                  </p>
                </div>
              </div>

              {/* Quick Summary Pill */}
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl border border-white/10 bg-white/[0.03] text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 block">Template Name</span>
                  <span className="font-semibold text-white truncate block">
                    {generatedSite.name}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Accent Color</span>
                  <span className="font-semibold text-white flex items-center gap-1.5 mt-0.5">
                    <span
                      className="w-3 h-3 rounded-full border border-black/20"
                      style={{ backgroundColor: generatedSite.theme?.accent }}
                    />
                    {generatedSite.theme?.accent}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Sections Built</span>
                  <span className="font-semibold text-emerald-400">
                    {generatedSite.blocks?.length || 0} OpenPage Modules
                  </span>
                </div>
              </div>

              {/* Section Preview Scroll */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-300">
                  Generated Sections:
                </span>
                <div className="divide-y divide-white/5 border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden max-h-48 overflow-y-auto">
                  {generatedSite.blocks?.map((block, i) => (
                    <div
                      key={block.id || i}
                      className="p-2.5 flex items-center justify-between text-xs hover:bg-white/[0.03]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500 w-4">
                          {(i + 1).toString().padStart(2, "0")}
                        </span>
                        <div className="w-5 h-5 rounded bg-[#6d5dfc]/20 text-[#a594fd] flex items-center justify-center text-[10px]">
                          <LayersIcon size={11} />
                        </div>
                        <div>
                          <span className="font-medium text-white capitalize">
                            {(block.props?.title as string) ||
                              (block.props?.headline as string) ||
                              (block.props?.logo as string) ||
                              block.type}
                          </span>
                          <span className="text-[10px] text-zinc-500 ml-2">
                            ({block.type})
                          </span>
                        </div>
                      </div>
                      <span className="text-[9.5px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
                        Editable
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          {!generatedSite ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#6d5dfc] via-[#7c3aed] to-[#ec4899] text-white shadow-lg shadow-[#6d5dfc]/30 hover:opacity-95 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <RefreshCwIcon size={14} className="animate-spin" />
                    Generating with AI…
                  </>
                ) : (
                  <>
                    <SparklesIcon size={14} />
                    Generate with AI
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setGeneratedSite(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5"
              >
                <RefreshCwIcon size={13} />
                Try Another Prompt
              </button>
              <button
                type="button"
                onClick={handleApplyToCanvas}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 active:scale-98 transition-all flex items-center gap-2"
              >
                <CheckIcon size={14} strokeWidth={2.5} />
                Apply to Canvas & Start Visual Editing
                <ArrowRightIcon size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
