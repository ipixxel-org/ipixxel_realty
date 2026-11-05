"use client";

import { useState } from "react";

type Corner = "tl" | "tr" | "br" | "bl";
type Corners = Record<Corner, string>;

/** Split a CSS border-radius shorthand into its four corners (TL TR BR BL). */
function parseRadius(value?: string): Corners {
  const parts = (value || "").trim().split(/\s+/).filter(Boolean);
  const [a = "", b = a, c = a, d = b] = parts;
  return { tl: a, tr: b, br: c, bl: d };
}

/** A bare number like "12" becomes "12px"; anything else is kept as typed. */
function normalize(v: string): string {
  const t = v.trim();
  return /^-?\d*\.?\d+$/.test(t) ? `${t}px` : t;
}

function buildRadius(c: Corners, finalize = false): string | undefined {
  const vals = [c.tl, c.tr, c.br, c.bl].map((v) => (finalize ? normalize(v) : v.trim()) || "0");
  if (vals.every((v) => v === "0" || v === "0px")) return undefined;
  if (vals.every((v) => v === vals[0])) return vals[0];
  return vals.join(" ");
}

const CORNERS: { key: Corner; label: string; title: string; radiusClass: string }[] = [
  { key: "tl", label: "TL", title: "Top Left", radiusClass: "rounded-tl-[5px]" },
  { key: "tr", label: "TR", title: "Top Right", radiusClass: "rounded-tr-[5px]" },
  { key: "bl", label: "BL", title: "Bottom Left", radiusClass: "rounded-bl-[5px]" },
  { key: "br", label: "BR", title: "Bottom Right", radiusClass: "rounded-br-[5px]" },
];

interface BorderRadiusControlProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  label?: string;
  presets?: string[];
}

export function BorderRadiusControl({
  value,
  onChange,
  label = "Border Radius",
  presets,
}: BorderRadiusControlProps) {
  const corners = parseRadius(value);
  const [mode, setMode] = useState<"all" | "each">(
    new Set(Object.values(corners)).size > 1 ? "each" : "all",
  );

  const setCorner = (key: Corner, v: string, finalize = false) => {
    onChange(buildRadius({ ...corners, [key]: v }, finalize));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{label}</label>
        <div className="flex rounded-md border border-border-default bg-bg-2 p-0.5 text-[9.5px]">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`px-2 py-0.5 rounded transition-all font-medium ${
              mode === "all" ? "bg-green/15 text-green" : "text-text-3 hover:text-text-1"
            }`}
          >
            All corners
          </button>
          <button
            type="button"
            onClick={() => setMode("each")}
            className={`px-2 py-0.5 rounded transition-all font-medium ${
              mode === "each" ? "bg-green/15 text-green" : "text-text-3 hover:text-text-1"
            }`}
          >
            Each corner
          </button>
        </div>
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          {presets.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                value === r
                  ? "bg-green/15 border-green/40 text-green font-medium"
                  : "border-border-default text-text-3 hover:text-text-1 hover:bg-bg-3"
              }`}
            >
              {r.replace("px", "")}
            </button>
          ))}
        </div>
      )}

      {mode === "all" ? (
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          onBlur={(e) => e.target.value && onChange(normalize(e.target.value))}
          placeholder="e.g. 12px or 9999px"
          className="w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none hover:border-border-hover focus:border-green"
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {CORNERS.map((c) => (
            <label
              key={c.key}
              title={c.title}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-2/80 focus-within:border-green"
            >
              <span
                className={`w-3 h-3 shrink-0 border-2 border-text-3 ${c.radiusClass} ${
                  c.key === "tl" ? "border-r-0 border-b-0" : c.key === "tr" ? "border-l-0 border-b-0" : c.key === "bl" ? "border-r-0 border-t-0" : "border-l-0 border-t-0"
                }`}
              />
              <span className="text-[9px] font-semibold text-text-3 w-4">{c.label}</span>
              <input
                type="text"
                value={corners[c.key]}
                onChange={(e) => setCorner(c.key, e.target.value)}
                onBlur={(e) => setCorner(c.key, e.target.value, true)}
                placeholder="0px"
                className="min-w-0 flex-1 bg-transparent text-text-0 text-[11px] font-mono outline-none"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
