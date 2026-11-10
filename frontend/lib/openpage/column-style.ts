import type { CSSProperties } from "react";
import { cssBackgroundImage, overlayLayer } from "./block-style";

/**
 * A single column's own look inside a Div / Container: background colour or
 * image, an optional overlay, padding and rounded corners. Stored on the
 * column itself (props.columns[i]), so it never touches the outer Div's style.
 * Columns without these keys render exactly as before.
 */
export const COLUMN_STYLE_KEYS = [
  "bgColor",
  "bgImage",
  "bgSize",
  "bgPosition",
  "bgRepeat",
  "bgOverlay",
  "bgOverlayOpacity",
  "padding",
  "borderRadius",
  "minHeight",
] as const;

export type ColumnStyleKey = (typeof COLUMN_STYLE_KEYS)[number];
export type ColumnStyle = Partial<Record<ColumnStyleKey, string>>;

const clean = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t && !["none", "transparent"].includes(t.toLowerCase()) ? t : undefined;
};

/** Bare numbers become px ("20" → "20px", "10 20" → "10px 20px"). */
const length = (v: string) => v.split(/\s+/).map((p) => (/^-?\d+(\.\d+)?$/.test(p) ? `${p}px` : p)).join(" ");

/** The stored style values of a column (only the ones that are set). */
export function readColumnStyle(source: unknown): ColumnStyle {
  const s = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const out: ColumnStyle = {};
  for (const key of COLUMN_STYLE_KEYS) {
    const v = clean(s[key]);
    if (v) out[key] = v;
  }
  return out;
}

/** True when the column has its own background (colour or image). */
export function hasColumnBackground(source: unknown): boolean {
  const s = readColumnStyle(source);
  return Boolean(s.bgColor || s.bgImage || s.bgOverlay);
}

/** CSS for a column box. Empty object when nothing is set. */
export function columnStyleCss(source: unknown): CSSProperties {
  const s = readColumnStyle(source);
  const css: CSSProperties = {};
  // Same layering as a block's own background: overlay tint on top, then the
  // image / gradient, then the colour underneath.
  const layers: string[] = [];
  const overlay = overlayLayer(s.bgOverlay, s.bgOverlayOpacity);
  if (overlay) layers.push(overlay);
  if (s.bgImage) layers.push(cssBackgroundImage(s.bgImage));
  if (s.bgColor) css.backgroundColor = s.bgColor;
  if (layers.length) {
    css.backgroundImage = layers.join(", ");
    css.backgroundSize = s.bgSize || "cover";
    css.backgroundPosition = s.bgPosition || "center";
    css.backgroundRepeat = s.bgRepeat || "no-repeat";
  }
  if (s.padding) css.padding = length(s.padding);
  // No overflow:hidden, so the builder's widget toolbars are not clipped.
  if (s.borderRadius) css.borderRadius = length(s.borderRadius);
  if (s.minHeight) css.minHeight = length(s.minHeight);
  return css;
}
