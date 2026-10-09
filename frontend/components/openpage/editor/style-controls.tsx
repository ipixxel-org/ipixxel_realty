"use client";

import { useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Baseline,
  CaseSensitive,
  Italic,
  Sliders,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";
import type { BlockInteractionState, BlockTypography } from "@/components/openpage/blocks/types";
import { googleFontOptions } from "@/lib/openpage/theme-presets";
import { ColorInput, Section } from "./shared-components";

const INPUT_CLS =
  "w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none transition-all hover:border-border-hover focus:border-green focus:bg-bg-2 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]";

const LABEL_CLS = "block text-[10px] font-semibold uppercase tracking-wider text-text-3";

/* -------------------------------------------------------------------------- */
/*                              Shared primitives                              */
/* -------------------------------------------------------------------------- */

export function AlignButtons({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
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

export function DimensionField({
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
      <label className={`${LABEL_CLS} truncate whitespace-nowrap`} title={label}>
        {label}
      </label>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_CLS} min-w-0`}
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

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono = true,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className={LABEL_CLS}>{label}</label>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? INPUT_CLS : INPUT_CLS.replace(" font-mono", "")}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label className={LABEL_CLS}>{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SegmentedField({
  label,
  value,
  onChange,
  options,
  columns,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; icon?: React.ComponentType<{ size?: number }> }>;
  columns?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className={LABEL_CLS}>{label}</label>
      <div
        className="grid gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = value === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              title={o.label}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                active
                  ? "bg-green/15 text-green font-semibold border border-green/30 shadow-sm"
                  : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
              }`}
            >
              {Icon ? <Icon size={12} /> : null}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between p-2 rounded-lg border border-border-default bg-bg-2/50 hover:bg-bg-3 cursor-pointer transition-colors">
      <span className="flex flex-col">
        <span className="text-[11px] text-text-1">{label}</span>
        {hint ? <span className="text-[9.5px] text-text-3">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-border-default bg-bg-2 accent-green cursor-pointer"
      />
    </label>
  );
}

export function SpacingControl({
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
            className={INPUT_CLS}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { key: "top", Icon: ArrowUp, letter: "T" },
              { key: "right", Icon: ArrowRight, letter: "R" },
              { key: "bottom", Icon: ArrowDown, letter: "B" },
              { key: "left", Icon: ArrowLeft, letter: "L" },
            ] as const
          ).map(({ key, Icon, letter }) => (
            <div
              key={key}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-2/60"
            >
              <Icon size={11} className="text-text-3 shrink-0" />
              <span className="text-[10px] text-text-3 w-3 shrink-0">{letter}</span>
              <input
                type="text"
                value={({ top, right, bottom, left })[key] || ""}
                onChange={(e) =>
                  onChange({ top, right, bottom, left, [key]: e.target.value })
                }
                placeholder="0px"
                className="w-full min-w-0 bg-transparent text-text-0 text-[11px] font-mono outline-none"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 pt-0.5 overflow-x-auto scrollbar-none">
        {quickPresets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ top: p, right: p === "auto" ? p : undefined, bottom: p, left: p === "auto" ? p : undefined })}
            className="text-[9px] px-1.5 py-0.5 rounded border border-border-subtle bg-bg-2/40 text-text-3 hover:text-text-1 hover:border-border-hover transition-all shrink-0"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: string) => void;
  display?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{label}</label>
        <span className="text-[10px] font-mono text-text-2">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-green cursor-pointer"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Reusable typography controls                        */
/* -------------------------------------------------------------------------- */

const QUICK_SIZES = [
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

const FONT_WEIGHTS = [
  { label: "300", name: "Light", value: "300" },
  { label: "400", name: "Regular", value: "400" },
  { label: "500", name: "Medium", value: "500" },
  { label: "600", name: "Semi", value: "600" },
  { label: "700", name: "Bold", value: "700" },
  { label: "900", name: "Black", value: "900" },
];

function numeric(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value ? Number.parseFloat(value) : fallback;
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * The full typography set every editable element shares: font family, size,
 * weight, style, line height, letter spacing, transform, alignment and colour.
 */
export function TypographyControls({
  value,
  onChange,
  previewText = "Modern Real Estate Architecture & Design",
  showFontSize = true,
}: {
  value: BlockTypography;
  onChange: (partial: Partial<BlockTypography>) => void;
  previewText?: string;
  showFontSize?: boolean;
}) {
  const sliderSize = numeric(value.fontSize, 16, 8, 72);
  const sliderLineHeight = numeric(value.lineHeight, 1.5, 0.8, 3);

  return (
    <div className="space-y-3">
      {/* Font family + preview */}
      <div className="space-y-2.5">
        <label className={LABEL_CLS}>Font Family</label>
        <select
          value={value.fontFamily || ""}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11.5px] outline-none hover:border-border-hover focus:border-green cursor-pointer font-medium"
        >
          <option value="">Inherit from theme</option>
          {googleFontOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <div
          className="p-2.5 rounded-lg border border-border-subtle bg-bg-2/50 text-center overflow-hidden"
          style={{
            fontFamily: value.fontFamily ? `"${value.fontFamily}", sans-serif` : undefined,
            fontWeight: value.fontWeight as React.CSSProperties["fontWeight"],
            fontStyle: value.fontStyle as React.CSSProperties["fontStyle"],
            color: value.color || "#ffffff",
            letterSpacing: value.letterSpacing,
            textTransform: value.textTransform as React.CSSProperties["textTransform"],
          }}
        >
          <p className="text-[14px] leading-snug font-semibold truncate">
            {value.fontFamily || "Sample Heading"}
          </p>
          <p className="text-[11px] opacity-70 truncate mt-0.5">{previewText}</p>
        </div>
      </div>

      {/* Size */}
      {showFontSize && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={LABEL_CLS}>Font Size</label>
            <input
              type="text"
              value={value.fontSize || ""}
              onChange={(e) => onChange({ fontSize: e.target.value })}
              placeholder="16px"
              className="w-16 px-1.5 py-0.5 rounded border border-border-default bg-bg-2 text-right text-[11px] font-mono text-text-0 outline-none focus:border-green"
            />
          </div>
          <input
            type="range"
            min="8"
            max="72"
            step="1"
            value={sliderSize}
            onChange={(e) => onChange({ fontSize: `${e.target.value}px` })}
            className="w-full accent-green cursor-pointer mb-2"
          />
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {QUICK_SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange({ fontSize: s.value })}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition-all shrink-0 ${
                  value.fontSize === s.value
                    ? "bg-green/15 border-green/40 text-green font-semibold shadow-sm"
                    : "border-border-default text-text-3 hover:text-text-1 hover:bg-bg-3"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Weight + style */}
      <div className="space-y-3">
        <div>
          <label className={`${LABEL_CLS} mb-1.5`}>Font Weight</label>
          <div className="grid grid-cols-6 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2">
            {FONT_WEIGHTS.map((w) => {
              const active = value.fontWeight === w.value;
              return (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => onChange({ fontWeight: w.value })}
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

        <div>
          <label className={`${LABEL_CLS} mb-1.5`}>Font Style</label>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-border-default bg-bg-2">
            {[
              { id: "normal", label: "Normal" },
              { id: "italic", label: "Italic" },
              { id: "oblique", label: "Oblique" },
            ].map((o) => {
              const active = (value.fontStyle || "normal") === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onChange({ fontStyle: o.id })}
                  className={`flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-medium transition-all ${
                    active
                      ? "bg-green/15 text-green border border-green/30 shadow-sm"
                      : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
                  }`}
                >
                  {o.id !== "normal" ? <Italic size={11} /> : null}
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Colour + alignment */}
      <div className="space-y-3">
        <ColorInput label="Text Color" value={value.color} onChange={(v) => onChange({ color: v })} />
        <div>
          <label className={`${LABEL_CLS} mb-1.5`}>Text Alignment</label>
          <AlignButtons value={value.textAlign} onChange={(v) => onChange({ textAlign: v })} />
        </div>
      </div>

      {/* Rhythm */}
      <div className="space-y-3">
        <SliderField
          label="Line Height"
          value={sliderLineHeight}
          min={0.8}
          max={3}
          step={0.05}
          display={value.lineHeight || "1.5"}
          onChange={(v) => onChange({ lineHeight: v })}
        />
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={LABEL_CLS}>Letter Spacing</label>
            <input
              type="text"
              value={value.letterSpacing || ""}
              onChange={(e) => onChange({ letterSpacing: e.target.value })}
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
                onClick={() => onChange({ letterSpacing: s.value })}
                className={`text-[9px] px-2 py-1 rounded border transition-all flex-1 text-center ${
                  value.letterSpacing === s.value
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

      {/* Transform + decoration */}
      <div className="space-y-3">
        <SegmentedField
          label="Text Transform"
          value={value.textTransform || "none"}
          onChange={(v) => onChange({ textTransform: v })}
          options={[
            { value: "none", label: "None" },
            { value: "uppercase", label: "UPPER" },
            { value: "lowercase", label: "lower" },
            { value: "capitalize", label: "Capital" },
          ]}
        />
        <SegmentedField
          label="Text Decoration"
          value={value.textDecoration || "none"}
          onChange={(v) => onChange({ textDecoration: v })}
          options={[
            { value: "none", label: "None" },
            { value: "underline", label: "Underline", icon: Underline },
            { value: "line-through", label: "Strike", icon: Strikethrough },
          ]}
        />
      </div>
    </div>
  );
}

/** Pre-grouped typography sections for panels that want the accordion layout. */
export function TypographySections({
  value,
  onChange,
  previewText,
}: {
  value: BlockTypography;
  onChange: (partial: Partial<BlockTypography>) => void;
  previewText?: string;
}) {
  return (
    <>
      <Section title="Typography" icon={<Type size={12} />}>
        <TypographyControls value={value} onChange={onChange} previewText={previewText} />
      </Section>
      <Section title="Alignment & Rhythm" defaultOpen={false} icon={<Baseline size={12} />}>
        <TypographyControls
          value={value}
          onChange={onChange}
          previewText={previewText}
          showFontSize={false}
        />
      </Section>
      <Section title="Transform" defaultOpen={false} icon={<CaseSensitive size={12} />}>
        <TypographyControls
          value={value}
          onChange={onChange}
          previewText={previewText}
          showFontSize={false}
        />
      </Section>
    </>
  );
}

/** Hover / active colour pair used by buttons, cards, menu items and links. */
export function InteractionColorControls({
  label,
  value,
  onChange,
  fields = ["color", "backgroundColor", "borderColor"],
}: {
  label: string;
  value?: BlockInteractionState;
  onChange: (partial: BlockInteractionState) => void;
  fields?: Array<keyof BlockInteractionState>;
}) {
  const LABELS: Record<string, string> = {
    color: "Text Color",
    backgroundColor: "Background Color",
    borderColor: "Border Color",
    boxShadow: "Shadow",
    opacity: "Opacity",
    transform: "Transform",
    textDecoration: "Decoration",
  };

  return (
    <Section title={label} defaultOpen={false} icon={<Sliders size={12} />}>
      <div className="space-y-3">
        {fields.includes("color") ? (
          <ColorInput label={LABELS.color} value={value?.color} onChange={(v) => onChange({ color: v })} />
        ) : null}
        {fields.includes("backgroundColor") ? (
          <ColorInput
            label={LABELS.backgroundColor}
            value={value?.backgroundColor}
            onChange={(v) => onChange({ backgroundColor: v })}
          />
        ) : null}
        {fields.includes("borderColor") ? (
          <ColorInput
            label={LABELS.borderColor}
            value={value?.borderColor}
            onChange={(v) => onChange({ borderColor: v })}
          />
        ) : null}
      </div>
    </Section>
  );
}

export { INPUT_CLS, LABEL_CLS };