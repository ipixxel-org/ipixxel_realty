"use client";

import { useState } from "react";
import { ChevronDown, X, Pipette } from "lucide-react";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { resolveSiteTheme } from "@/lib/openpage/theme-presets";

export function Section({
  title,
  icon,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border-default/80 bg-bg-2/30 backdrop-blur-sm overflow-hidden shadow-sm transition-all hover:border-border-default">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-semibold tracking-wide text-text-1 hover:text-text-0 bg-bg-2/40 hover:bg-bg-3/70 transition-all select-none"
      >
        <span className="flex items-center gap-2">
          {icon && <span className="text-text-3">{icon}</span>}
          <span className={`uppercase text-[10px] tracking-wider font-bold ${open ? "text-text-0" : "text-text-2"}`}>
            {title}
          </span>
          {badge !== undefined && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-medium bg-bg-3 border border-border-default text-text-3">
              {badge}
            </span>
          )}
        </span>
        <span
          className={`w-4 h-4 flex items-center justify-center rounded-md border transition-all ${
            open ? "border-green/30 text-green bg-green/10 rotate-0" : "border-border-subtle text-text-3 -rotate-90"
          }`}
        >
          <ChevronDown size={11} className="transition-transform duration-200" />
        </span>
      </button>
      {open && <div className="p-3 border-t border-border-subtle/80 space-y-3">{children}</div>}
    </div>
  );
}

const PRESET_SWATCHES = [
  { label: "Transparent", value: "transparent", bg: "transparent" },
  { label: "White", value: "#ffffff", bg: "#ffffff" },
  { label: "Slate Light", value: "#f1f5f9", bg: "#f1f5f9" },
  { label: "Slate Muted", value: "#94a3b8", bg: "#94a3b8" },
  { label: "Zinc Dark", value: "#18181b", bg: "#18181b" },
  { label: "Pitch Black", value: "#09090b", bg: "#09090b" },
  { label: "Emerald", value: "#10b981", bg: "#10b981" },
  { label: "Cyan", value: "#06b6d4", bg: "#06b6d4" },
  { label: "Blue", value: "#3b82f6", bg: "#3b82f6" },
  { label: "Indigo", value: "#6366f1", bg: "#6366f1" },
  { label: "Purple", value: "#a855f7", bg: "#a855f7" },
  { label: "Rose", value: "#f43f5e", bg: "#f43f5e" },
  { label: "Amber", value: "#f59e0b", bg: "#f59e0b" },
];

export function ColorInput({
  label,
  value,
  onChange,
  showPresets = true,
  showThemeColors = true,
}: {
  label?: string;
  value?: string;
  onChange: (v: string) => void;
  showPresets?: boolean;
  showThemeColors?: boolean;
}) {
  const site = useConfigStore((s) => s.config);
  const theme = resolveSiteTheme(site);
  const themeSwatches = [
    { label: "Accent", cssVar: "var(--color-cta)", color: theme.ctaButtonColor || theme.accent },
    { label: "Text", cssVar: "var(--color-text-0)", color: theme.text0 },
    { label: "Muted", cssVar: "var(--color-text-2)", color: theme.text2 },
    { label: "Background", cssVar: "var(--color-bg-1)", color: theme.bg1 },
    { label: "Surface", cssVar: "var(--color-bg-2)", color: theme.bg2 },
    { label: "Border", cssVar: "var(--color-border-default)", color: theme.borderDefault },
  ];
  const resolveVar = (v: string): string => {
    const match = /^var\((--[^)]+)\)$/.exec(v.trim());
    if (!match) return v;
    const swatch = themeSwatches.find((s) => s.cssVar === match[1]);
    return swatch?.color ?? "#18181b";
  };

  const isTransparent = !value || value === "transparent" || value === "" || value === "var(--color-bg-transparent)";
  const displayColor = isTransparent ? "#18181b" : resolveVar(value);
  const hexValue = value && value.startsWith("#") && (value.length === 7 || value.length === 9)
    ? value.slice(0, 7)
    : "#000000";

  const hasHeader = Boolean(label || (value && value !== "transparent"));

  return (
    <div className="space-y-1.5">
      {hasHeader && (
        <div className="flex items-center justify-between">
          {label ? (
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{label}</label>
          ) : (
            <span />
          )}
          {value && value !== "transparent" && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[9.5px] text-text-3 hover:text-status-red flex items-center gap-0.5 transition-colors"
              title="Reset color"
            >
              <X size={10} />
              <span>Reset</span>
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Swatch with hidden color input */}
        <div className="relative group/swatch shrink-0">
          <input
            type="color"
            value={hexValue}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            title={label ? `Pick ${label}` : "Pick color"}
          />
          <div
            className="w-8 h-8 rounded-lg border border-border-default shadow-sm flex items-center justify-center overflow-hidden transition-all group-hover/swatch:border-green group-hover/swatch:scale-105"
            style={{
              backgroundImage: isTransparent
                ? "linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)"
                : undefined,
              backgroundSize: isTransparent ? "8px 8px" : undefined,
              backgroundPosition: isTransparent ? "0 0, 0 4px, 4px -4px, -4px 0px" : undefined,
              backgroundColor: displayColor,
            }}
          >
            {isTransparent ? (
              <span className="text-[8px] font-bold text-text-3 uppercase">none</span>
            ) : (
              <Pipette size={11} className="text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] opacity-0 group-hover/swatch:opacity-100 transition-opacity" />
            )}
          </div>
        </div>

        {/* Text Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="transparent / #ffffff / var(--color-cta)"
            className="w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none transition-all hover:border-border-hover focus:border-green focus:bg-bg-2 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"
          />
        </div>
      </div>

      {/* Theme-color swatches: writes var() so the color follows the site's
          branding and updates live when Page Settings changes. */}
      {showThemeColors && (
        <div className="space-y-1">
          <span className="block text-[9px] font-semibold uppercase tracking-wider text-text-3/80">Theme</span>
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {themeSwatches.map((s) => {
              const isSelected = value === s.cssVar;
              return (
                <button
                  key={s.cssVar}
                  type="button"
                  onClick={() => onChange(s.cssVar)}
                  title={`${s.label} (${s.cssVar})`}
                  className={`w-4 h-4 rounded-full shrink-0 border transition-all ${
                    isSelected
                      ? "border-green scale-110 shadow-[0_0_6px_rgba(34,197,94,0.5)] ring-1 ring-green"
                      : "border-border-default hover:scale-110 hover:border-white/60"
                  }`}
                  style={{ backgroundColor: s.color }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Color Swatches */}
      {showPresets && (
        <div className="flex items-center gap-1 pt-1 overflow-x-auto pb-0.5 scrollbar-none">
          {PRESET_SWATCHES.map((s) => {
            const isSelected = value === s.value || (!value && s.value === "transparent");
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange(s.value)}
                title={s.label}
                className={`w-4 h-4 rounded-full shrink-0 border transition-all ${
                  isSelected
                    ? "border-green scale-110 shadow-[0_0_6px_rgba(34,197,94,0.5)] ring-1 ring-green"
                    : "border-border-default hover:scale-110 hover:border-white/60"
                }`}
                style={{
                  backgroundColor: s.bg,
                  backgroundImage: s.value === "transparent"
                    ? "linear-gradient(45deg, #52525b 25%, transparent 25%), linear-gradient(-45deg, #52525b 25%, transparent 25%)"
                    : undefined,
                  backgroundSize: s.value === "transparent" ? "4px 4px" : undefined,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
