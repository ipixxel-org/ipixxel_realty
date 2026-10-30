import { Check, ChevronRight, MapPin } from "lucide-react";

/** Bullet choices shared by list sections (Project Highlights, Location). */
export const BULLET_STYLES = ["arrow", "check", "dot", "number", "pin", "none"] as const;
export type BulletStyle = (typeof BULLET_STYLES)[number];

export function isBulletStyle(value: unknown): value is BulletStyle {
  return typeof value === "string" && (BULLET_STYLES as readonly string[]).includes(value);
}

/**
 * One list bullet. `index` is used by the "number" style. Colours follow the
 * theme (arrow / dot / number use the text colour, check / pin the accent);
 * wrap it in an `El` to make it styleable.
 */
export function Bullet({ style, index, size = 14 }: { style: BulletStyle; index: number; size?: number }) {
  switch (style) {
    case "arrow":
      return <ChevronRight size={size} strokeWidth={3} className="text-text-0 shrink-0" aria-hidden />;
    case "check":
      return <Check size={size} strokeWidth={3} className="text-green shrink-0" aria-hidden />;
    case "dot":
      return <span className="block w-1.5 h-1.5 rounded-full bg-text-0 shrink-0" aria-hidden />;
    case "number":
      return (
        <span className="text-[11px] font-semibold text-text-0 tabular-nums shrink-0" aria-hidden>
          {index + 1}.
        </span>
      );
    case "pin":
      return <MapPin size={size} className="text-green shrink-0" aria-hidden />;
    default:
      return null;
  }
}
