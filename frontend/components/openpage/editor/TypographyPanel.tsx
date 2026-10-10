"use client";

import { useState } from "react";
import {
  Type,
  Copy,
  Clipboard,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Sliders,
  CaseSensitive,
  Underline,
  Strikethrough,
  Baseline,
} from "lucide-react";
import { toast } from "sonner";
import type { BlockConfig, BlockTypography } from "@/components/openpage/blocks/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { googleFontOptions } from "@/lib/openpage/theme-presets";
import { Section, ColorInput } from "./shared-components";

const quickSizes = [
  { label: "XS", value: "12px" },
  { label: "SM", value: "14px" },
  { label: "MD", value: "16px" },
  { label: "LG", value: "18px" },
  { label: "XL", value: "20px" },
  { label: "2XL", value: "24px" },
  { label: "3XL", value: "30px" },
  { label: "4XL", value: "36px" },
  { label: "5XL", value: "48px" },
];

const fontWeightPills = [
  { label: "300", name: "Light", value: "300" },
  { label: "400", name: "Regular", value: "400" },
  { label: "500", name: "Medium", value: "500" },
  { label: "600", name: "Semi", value: "600" },
  { label: "700", name: "Bold", value: "700" },
  { label: "900", name: "Black", value: "900" },
];

export function TypographyPanel({ block }: { block: BlockConfig }) {
  const [target, setTarget] = useState<'all' | 'heading' | 'subtitle' | 'body'>('all');
  const updateBlockStyle = useConfigStore((s) => s.updateBlockStyle);
  const setElementStyle = useConfigStore((s) => s.setElementStyle);
  const device = useEditorStore((s) => s.viewport);

  const targetElementId =
    target === 'heading' ? `${block.type}:title` :
    target === 'subtitle' ? `${block.type}:subtitle` :
    target === 'body' ? `${block.type}:body` : null;

  const currentElementStyle = targetElementId ? block.elementStyles?.[targetElementId]?.typography : undefined;
  const typography = (target !== 'all' && currentElementStyle) ? currentElementStyle : (block.style?.typography || {});

  const setTypo = (partial: Partial<BlockTypography>) => {
    if (target === 'all') {
      updateBlockStyle(block.id, {
        typography: { ...typography, ...partial },
      });
    } else if (targetElementId) {
      setElementStyle(block.id, targetElementId, {
        typography: { ...(currentElementStyle || {}), ...partial },
      }, device);
    }
  };

  const rawSize = typography.fontSize ? Number.parseInt(typography.fontSize, 10) : 16;
  const sliderSize = Number.isNaN(rawSize) ? 16 : Math.min(Math.max(rawSize, 8), 72);

  const rawLineHeight = typography.lineHeight ? Number.parseFloat(typography.lineHeight) : 1.5;
  const sliderLineHeight = Number.isNaN(rawLineHeight) ? 1.5 : Math.min(Math.max(rawLineHeight, 0.8), 3);

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header bar */}
      <div className="px-3 pt-3 pb-2.5 border-b border-border-default shrink-0 bg-bg-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Type size={12} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-0">Typography</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                useEditorStore.getState().setClipboardStyle({ typography });
                toast.success("Typography copied");
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:border-border-hover transition-colors"
              title="Copy typography"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                const pasted = useEditorStore.getState().clipboardStyle?.typography;
                if (pasted) {
                  setTypo(pasted);
                  toast.success("Typography applied");
                } else {
                  toast.error("No typography in clipboard");
                }
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:border-border-hover transition-colors"
              title="Paste typography"
            >
              <Clipboard size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (target === 'all') {
                  updateBlockStyle(block.id, { typography: undefined });
                } else if (targetElementId) {
                  setElementStyle(block.id, targetElementId, { typography: undefined }, device);
                }
                toast.success("Typography reset");
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-status-red hover:border-status-red/40 transition-colors"
              title="Reset typography"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Target Selector */}
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2 text-center">
          {[
            { id: "all", label: "All" },
            { id: "heading", label: "Heading" },
            { id: "subtitle", label: "Subtitle" },
            { id: "body", label: "Body" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTarget(t.id as 'all' | 'heading' | 'subtitle' | 'body')}
              className={`py-1 rounded text-[10px] font-medium transition-colors ${
                target === t.id
                  ? "bg-green/15 text-green font-semibold shadow-sm"
                  : "text-text-3 hover:text-text-1 hover:bg-bg-3"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>



      {/* Controls */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {/* Font Family */}
        <Section title="Font Family" icon={<Type size={12} />}>
          <div className="space-y-2.5">
            <select
              value={typography.fontFamily || ""}
              onChange={(e) => setTypo({ fontFamily: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11.5px] outline-none hover:border-border-hover focus:border-green cursor-pointer font-medium"
            >
              <option value="">Inherit from theme</option>
              {googleFontOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            {/* Live preview banner */}
            <div
              className="p-2.5 rounded-lg border border-border-subtle bg-bg-2/50 text-center overflow-hidden"
              style={{
                fontFamily: typography.fontFamily ? `"${typography.fontFamily}", sans-serif` : undefined,
                fontWeight: typography.fontWeight as React.CSSProperties["fontWeight"],
                color: typography.color || "#ffffff",
                letterSpacing: typography.letterSpacing,
                textTransform: typography.textTransform as React.CSSProperties["textTransform"],
              }}
            >
              <p className="text-[14px] leading-snug font-semibold truncate">
                {typography.fontFamily || "Sample Heading"}
              </p>
              <p className="text-[11px] opacity-70 truncate mt-0.5">
                Modern Real Estate Architecture & Design
              </p>
            </div>
          </div>
        </Section>

        {/* Size & Weight */}
        <Section title="Size & Weight" icon={<Sliders size={12} />}>
          <div className="space-y-3">
            {/* Font Size */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Font Size</label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={typography.fontSize || ""}
                    onChange={(e) => setTypo({ fontSize: e.target.value })}
                    placeholder="16px"
                    className="w-16 px-1.5 py-0.5 rounded border border-border-default bg-bg-2 text-right text-[11px] font-mono text-text-0 outline-none focus:border-green"
                  />
                </div>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="10"
                max="64"
                step="1"
                value={sliderSize}
                onChange={(e) => setTypo({ fontSize: `${e.target.value}px` })}
                className="w-full accent-green cursor-pointer mb-2"
              />

              {/* Quick Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                {quickSizes.map((s) => {
                  const active = typography.fontSize === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setTypo({ fontSize: s.value })}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-all shrink-0 ${
                        active
                          ? "bg-green/15 border-green/40 text-green font-semibold shadow-sm"
                          : "border-border-default text-text-3 hover:text-text-1 hover:bg-bg-3"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Weight */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">
                Font Weight
              </label>
              <div className="grid grid-cols-6 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2">
                {fontWeightPills.map((w) => {
                  const active = typography.fontWeight === w.value;
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => setTypo({ fontWeight: w.value })}
                      title={`${w.name} (${w.value})`}
                      className={`py-1 text-center rounded text-[9.5px] transition-all font-semibold ${
                        active
                          ? "bg-green/15 text-green border border-green/30 shadow-sm"
                          : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        {/* Color & Alignment */}
        <Section title="Color & Alignment" icon={<Baseline size={12} />}>
          <div className="space-y-3">
            <ColorInput
              label="Text Color"
              value={typography.color}
              onChange={(v) => setTypo({ color: v })}
            />

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">
                Text Alignment
              </label>
              <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2">
                {[
                  { id: "left", icon: AlignLeft, label: "Left" },
                  { id: "center", icon: CenterIcon, label: "Center" },
                  { id: "right", icon: AlignRight, label: "Right" },
                  { id: "justify", icon: AlignJustify, label: "Justify" },
                ].map(({ id, icon: Icon, label }) => {
                  const active = typography.textAlign === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTypo({ textAlign: id })}
                      title={label}
                      className={`flex items-center justify-center py-1.5 rounded-md text-[11px] transition-all ${
                        active
                          ? "bg-green/15 text-green font-semibold border border-green/30 shadow-sm"
                          : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
                      }`}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        {/* Spacing & Line Height */}
        <Section title="Spacing & Rhythm" defaultOpen={false} icon={<Sliders size={12} />}>
          <div className="space-y-3">
            {/* Line Height */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Line Height</label>
                <span className="text-[10px] font-mono text-text-2">
                  {typography.lineHeight || "1.5"}
                </span>
              </div>
              <input
                type="range"
                min="0.9"
                max="2.5"
                step="0.05"
                value={sliderLineHeight}
                onChange={(e) => setTypo({ lineHeight: e.target.value })}
                className="w-full accent-green cursor-pointer"
              />
            </div>

            {/* Letter Spacing */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Letter Spacing</label>
                <input
                  type="text"
                  value={typography.letterSpacing || ""}
                  onChange={(e) => setTypo({ letterSpacing: e.target.value })}
                  placeholder="0px"
                  className="w-16 px-1.5 py-0.5 rounded border border-border-default bg-bg-2 text-right text-[11px] font-mono text-text-0 outline-none focus:border-green"
                />
              </div>
              <div className="flex items-center gap-1">
                {[
                  { label: "Tight", value: "-0.5px" },
                  { label: "Normal", value: "0px" },
                  { label: "Wide", value: "1px" },
                  { label: "Wider", value: "2px" },
                ].map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setTypo({ letterSpacing: s.value })}
                    className={`text-[9px] px-2 py-1 rounded border transition-all flex-1 text-center ${
                      typography.letterSpacing === s.value
                        ? "bg-green/15 border-green/40 text-green font-semibold"
                        : "border-border-default text-text-3 hover:text-text-1 hover:bg-bg-3"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Transform & Decoration */}
        <Section title="Transform & Style" defaultOpen={false} icon={<CaseSensitive size={12} />}>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">
                Text Transform
              </label>
              <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2">
                {[
                  { id: "none", label: "None" },
                  { id: "uppercase", label: "UPPER" },
                  { id: "lowercase", label: "lower" },
                  { id: "capitalize", label: "Capital" },
                ].map(({ id, label }) => {
                  const active = (typography.textTransform || "none") === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTypo({ textTransform: id })}
                      className={`py-1 text-center rounded text-[10px] transition-all font-medium ${
                        active
                          ? "bg-green/15 text-green border border-green/30 font-semibold"
                          : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">
                Text Decoration
              </label>
              <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2">
                {[
                  { id: "none", label: "None", icon: null },
                  { id: "underline", label: "Underline", icon: Underline },
                  { id: "line-through", label: "Strike", icon: Strikethrough },
                ].map(({ id, label, icon: Icon }) => {
                  const active = (typography.textDecoration || "none") === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTypo({ textDecoration: id })}
                      className={`flex items-center justify-center gap-1 py-1 text-center rounded text-[10px] transition-all font-medium ${
                        active
                          ? "bg-green/15 text-green border border-green/30 font-semibold"
                          : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
                      }`}
                    >
                      {Icon && <Icon size={11} />}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function CenterIcon(props: { size?: number }) {
  return <AlignCenter size={props.size ?? 14} />;
}
