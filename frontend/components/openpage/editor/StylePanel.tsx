"use client";

import { useState } from "react";
import {
  Copy,
  Clipboard,
  Trash2,
  Monitor,
  Tablet,
  Smartphone,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Maximize2,
  Box,
  Sparkles,
  Sliders,
  Eye,
  Code,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Maximize,
} from "lucide-react";
import { toast } from "sonner";
import type { BlockConfig, BlockStyle } from "@/components/openpage/blocks/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { resolveBlockStyleForDevice } from "@/lib/openpage/block-style";
import { Section, ColorInput } from "./shared-components";
import { BoxModelWidget } from "./BoxModelWidget";
import { BackgroundControls } from "./BackgroundControls";
import { EffectsControls } from "./EffectsControls";

function AlignButtons({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const options = [
    { id: "left", icon: AlignLeft, label: "Left" },
    { id: "center", icon: AlignCenter, label: "Center" },
    { id: "right", icon: AlignRight, label: "Right" },
    { id: "justify", icon: AlignJustify, label: "Justify" },
  ];

  return (
    <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2">
      {options.map(({ id, icon: Icon, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            title={label}
            className={`flex items-center justify-center py-1.5 rounded-md text-[11px] transition-all ${
              active
                ? "bg-green/15 text-green font-semibold shadow-sm border border-green/30"
                : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

function DimensionField({
  label,
  value,
  onChange,
  presets,
  placeholder = "auto",
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  presets?: string[];
  placeholder?: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <label
        className="block truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-text-3"
        title={label}
      >
        {label}
      </label>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none transition-all hover:border-border-hover focus:border-green focus:bg-bg-2 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"
      />
      {presets && (
        <div className="flex flex-wrap items-center gap-1">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`text-[9.5px] leading-none px-1.5 py-1 rounded-md border whitespace-nowrap transition-all ${
                value === p
                  ? "bg-green/15 border-green/40 text-green font-medium"
                  : "border-border-default text-text-3 hover:text-text-1 hover:bg-bg-3"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SpacingControl({
  title,
  top,
  right,
  bottom,
  left,
  onChange,
}: {
  title: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  onChange: (values: { top?: string; right?: string; bottom?: string; left?: string }) => void;
}) {
  const [mode, setMode] = useState<"individual" | "unified">("individual");
  const quickPresets = ["0px", "16px", "24px", "48px", "80px", "auto"];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{title}</span>
        <button
          type="button"
          onClick={() => setMode(mode === "individual" ? "unified" : "individual")}
          className="text-[9.5px] text-text-3 hover:text-green transition-colors font-medium"
        >
          {mode === "individual" ? "Switch to Unified" : "Switch to 4-Way"}
        </button>
      </div>

      {mode === "unified" ? (
        <div className="space-y-1.5">
          <input
            type="text"
            value={top || ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ top: v, right: v, bottom: v, left: v });
            }}
            placeholder="e.g. 24px or auto"
            className="w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none transition-all hover:border-border-hover focus:border-green focus:bg-bg-2 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-2/60">
            <ArrowUp size={11} className="text-text-3 shrink-0" />
            <span className="text-[10px] text-text-3 w-3">T</span>
            <input
              type="text"
              value={top || ""}
              onChange={(e) => onChange({ top: e.target.value, right, bottom, left })}
              placeholder="0px"
              className="w-full bg-transparent text-text-0 text-[11px] font-mono outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-2/60">
            <ArrowRight size={11} className="text-text-3 shrink-0" />
            <span className="text-[10px] text-text-3 w-3">R</span>
            <input
              type="text"
              value={right || ""}
              onChange={(e) => onChange({ top, right: e.target.value, bottom, left })}
              placeholder="auto"
              className="w-full bg-transparent text-text-0 text-[11px] font-mono outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-2/60">
            <ArrowDown size={11} className="text-text-3 shrink-0" />
            <span className="text-[10px] text-text-3 w-3">B</span>
            <input
              type="text"
              value={bottom || ""}
              onChange={(e) => onChange({ top, right, bottom: e.target.value, left })}
              placeholder="0px"
              className="w-full bg-transparent text-text-0 text-[11px] font-mono outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-2/60">
            <ArrowLeft size={11} className="text-text-3 shrink-0" />
            <span className="text-[10px] text-text-3 w-3">L</span>
            <input
              type="text"
              value={left || ""}
              onChange={(e) => onChange({ top, right, bottom, left: e.target.value })}
              placeholder="auto"
              className="w-full bg-transparent text-text-0 text-[11px] font-mono outline-none"
            />
          </div>
        </div>
      )}

      {/* Quick Presets */}
      <div className="flex items-center gap-1 pt-0.5 overflow-x-auto scrollbar-none">
        {quickPresets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ top: p, right: p === "auto" ? p : undefined, bottom: p, left: p === "auto" ? p : undefined })}
            className="text-[9px] px-1.5 py-0.5 rounded border border-border-subtle bg-bg-2/40 text-text-3 hover:text-text-1 hover:border-border-hover transition-all"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StylePanel({ block }: { block: BlockConfig }) {
  const updateBlockStyle = useConfigStore((s) => s.updateBlockStyle);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const style = block.style || {};
  const effectiveStyle = resolveBlockStyleForDevice(style, device) || {};

  const set = (partial: Partial<BlockStyle>) => {
    if (device === "desktop") {
      updateBlockStyle(block.id, partial);
      return;
    }
    const responsive = { ...(style.responsive || {}) };
    const overrides = { ...(responsive[device] || {}) };
    Object.assign(overrides, partial);
    responsive[device] = overrides;
    updateBlockStyle(block.id, { responsive });
  };

  const devices = [
    { value: "desktop" as const, icon: <Monitor size={12} />, label: "Desktop" },
    { value: "tablet" as const, icon: <Tablet size={12} />, label: "Tablet" },
    { value: "mobile" as const, icon: <Smartphone size={12} />, label: "Mobile" },
  ];

  const radiusPresets = [
    { label: "0", value: "0px" },
    { label: "4px", value: "4px" },
    { label: "8px", value: "8px" },
    { label: "16px", value: "16px" },
    { label: "24px", value: "24px" },
    { label: "Full", value: "9999px" },
  ];

  const shadowPresets = [
    { label: "None", value: "none" },
    { label: "Soft", value: "0 2px 8px rgba(0,0,0,0.08)" },
    { label: "Medium", value: "0 8px 24px rgba(0,0,0,0.15)" },
    { label: "Dark Glow", value: "0 10px 30px rgba(0,0,0,0.5)" },
  ];

  return (
    <div className="flex flex-col h-full select-none">
      {/* Top action header: Device switch & Actions */}
      <div className="px-3 pt-3 pb-2.5 border-b border-border-default shrink-0 space-y-2.5 bg-bg-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
              <Palette size={12} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-0">Style & Layout</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                useEditorStore.getState().setClipboardStyle(style);
                toast.success("Style copied to clipboard");
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:border-border-hover transition-colors"
              title="Copy all styles"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                const pasted = useEditorStore.getState().clipboardStyle;
                if (pasted) {
                  set(pasted);
                  toast.success("Style applied from clipboard");
                } else {
                  toast.error("No style in clipboard");
                }
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:border-border-hover transition-colors"
              title="Paste styles"
            >
              <Clipboard size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                updateBlockStyle(block.id, {});
                toast.success("Styles reset");
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-status-red hover:border-status-red/40 transition-colors"
              title="Reset all styles"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Device Switcher */}
        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-border-subtle bg-bg-2">
          {devices.map(({ value, icon, label }) => {
            const active = device === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setDevice(value)}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10.5px] font-semibold transition-all ${
                  active
                    ? "bg-green/15 text-green shadow-sm border border-green/30"
                    : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
                }`}
              >
                {icon}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable controls */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {/* Layout */}
        <Section title="Layout & Alignment" icon={<Box size={12} />}>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">
                Block Alignment
              </label>
              <AlignButtons value={effectiveStyle.alignment} onChange={(v) => set({ alignment: v })} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <DimensionField
                label="Width"
                value={effectiveStyle.width}
                onChange={(v) => set({ width: v })}
                presets={["100%", "auto"]}
              />
              <DimensionField
                label="Max Width"
                value={effectiveStyle.maxWidth}
                onChange={(v) => set({ maxWidth: v })}
                presets={["1200px", "100%"]}
              />
            </div>

            <DimensionField
              label="Min Height"
              value={effectiveStyle.minHeight}
              onChange={(v) => set({ minHeight: v })}
              presets={["auto", "400px", "100vh"]}
            />
          </div>
        </Section>

        {/* Spacing (Elementor Pro Visual Box Model) */}
        <Section title="Spacing (Box Model)" icon={<Maximize2 size={12} />}>
          <BoxModelWidget
            marginTop={effectiveStyle.marginTop}
            marginRight={effectiveStyle.marginRight}
            marginBottom={effectiveStyle.marginBottom}
            marginLeft={effectiveStyle.marginLeft}
            paddingTop={effectiveStyle.paddingTop}
            paddingRight={effectiveStyle.paddingRight}
            paddingBottom={effectiveStyle.paddingBottom}
            paddingLeft={effectiveStyle.paddingLeft}
            onChangeMargin={(m) =>
              set({
                marginTop: m.top,
                marginRight: m.right,
                marginBottom: m.bottom,
                marginLeft: m.left,
              })
            }
            onChangePadding={(p) =>
              set({
                paddingTop: p.top,
                paddingRight: p.right,
                paddingBottom: p.bottom,
                paddingLeft: p.left,
              })
            }
          />
        </Section>

        {/* Background System */}
        <Section title="Background" icon={<Palette size={12} />}>
          <BackgroundControls
            backgroundColor={effectiveStyle.backgroundColor}
            backgroundImage={effectiveStyle.backgroundImage}
            backgroundSize={effectiveStyle.backgroundSize}
            backgroundPosition={effectiveStyle.backgroundPosition}
            backgroundRepeat={effectiveStyle.backgroundRepeat}
            overlayColor={effectiveStyle.overlayColor}
            overlayOpacity={effectiveStyle.overlayOpacity}
            onChange={(updates) => set(updates)}
          />
        </Section>

        {/* Borders, Shadows & Transforms */}
        <Section title="Borders, Shadows & Transforms" defaultOpen={false} icon={<Layers size={12} />}>
          <EffectsControls
            borderWidth={effectiveStyle.borderWidth}
            borderStyle={effectiveStyle.borderStyle}
            borderColor={effectiveStyle.borderColor}
            borderRadius={effectiveStyle.borderRadius}
            boxShadow={effectiveStyle.boxShadow}
            transform={effectiveStyle.transform}
            filter={effectiveStyle.filter}
            opacity={effectiveStyle.opacity}
            onChange={(updates) => set(updates)}
          />
        </Section>

        {/* Effects */}
        <Section title="Effects & Visibility" defaultOpen={false} icon={<Sparkles size={12} />}>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Opacity</label>
                <span className="text-[10px] font-mono text-text-2">
                  {effectiveStyle.opacity ? `${Math.round(Number.parseFloat(effectiveStyle.opacity) * 100)}%` : "100%"}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={effectiveStyle.opacity || "1"}
                onChange={(e) => set({ opacity: e.target.value })}
                className="w-full accent-green cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-1">
                  Overflow
                </label>
                <select
                  value={effectiveStyle.overflow || ""}
                  onChange={(e) => set({ overflow: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green"
                >
                  <option value="">Visible</option>
                  <option value="hidden">Hidden</option>
                  <option value="auto">Auto</option>
                  <option value="scroll">Scroll</option>
                </select>
              </div>

              <DimensionField
                label="Z-Index"
                value={effectiveStyle.zIndex ? String(effectiveStyle.zIndex) : ""}
                onChange={(v) => set({ zIndex: v })}
                presets={["0", "10", "50"]}
                placeholder="auto"
              />
            </div>
          </div>
        </Section>

        {/* Responsive Hide */}
        <Section title="Device Visibility" defaultOpen={false} icon={<Eye size={12} />}>
          <div className="space-y-2">
            {[
              { key: "hideOnDesktop" as const, label: "Hide on Desktop", icon: Monitor },
              { key: "hideOnTablet" as const, label: "Hide on Tablet", icon: Tablet },
              { key: "hideOnMobile" as const, label: "Hide on Mobile", icon: Smartphone },
            ].map(({ key, label, icon: Icon }) => (
              <label
                key={key}
                className="flex items-center justify-between p-2 rounded-lg border border-border-default bg-bg-2/50 hover:bg-bg-3 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2 text-[11px] text-text-1">
                  <Icon size={13} className="text-text-3" />
                  {label}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(style[key])}
                  onChange={(e) => set({ [key]: e.target.checked })}
                  className="w-4 h-4 rounded border-border-default bg-bg-2 accent-green cursor-pointer"
                />
              </label>
            ))}
          </div>
        </Section>

        {/* Custom CSS */}
        <Section title="Custom Scoped CSS" defaultOpen={false} icon={<Code size={12} />}>
          <div className="space-y-1.5">
            <p className="text-[10px] text-text-3">
              Applies directly to this block. Example: <code className="text-green font-mono">h2 &#123; letter-spacing: 2px; &#125;</code>
            </p>
            <textarea
              value={effectiveStyle.customCss || ""}
              onChange={(e) => set({ customCss: e.target.value })}
              rows={4}
              placeholder="& { filter: drop-shadow(0 20px 13px rgba(0,0,0,0.03)); }"
              className="w-full px-2.5 py-2 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11px] font-mono outline-none focus:border-green resize-y"
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
