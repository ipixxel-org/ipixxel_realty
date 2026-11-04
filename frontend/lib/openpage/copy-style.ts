import type { BlockConfig, BlockStyle, BlockType, ElementStyleMap } from "@/components/openpage/blocks/types";

/** A block's full look, as copied by "Copy Style". */
export interface CopiedBlockStyle {
  type: BlockType;
  style: BlockStyle;
  elementStyles: ElementStyleMap;
}

/**
 * Per-block switches that are not part of the look. Paste Style never copies
 * them, so pasting can't hide the target or change its visibility.
 */
const KEEP_ON_TARGET = ["hideOnDesktop", "hideOnTablet", "hideOnMobile", "hidden"] as const;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? {})) as T;

export function copyBlockStyle(block: BlockConfig): CopiedBlockStyle {
  return {
    type: block.type,
    style: clone(block.style ?? {}),
    elementStyles: clone(block.elementStyles ?? {}),
  };
}

/** True when a copied style holds anything to paste. */
export function hasCopiedStyle(c: CopiedBlockStyle): boolean {
  return Object.keys(c.style).length > 0 || Object.keys(c.elementStyles).length > 0;
}

/**
 * Apply a copied style to `target` in place (Elementor-like): the target's
 * style is replaced by the copied one, so it looks the same, while its
 * visibility switches stay. Element styles (title, button, …) are only copied
 * between blocks of the same type, where the same parts exist.
 */
export function applyCopiedStyle(target: BlockConfig, copied: CopiedBlockStyle): void {
  const next = clone(copied.style);
  for (const key of KEEP_ON_TARGET) {
    delete next[key];
    const own = target.style?.[key];
    if (own !== undefined) (next as Record<string, unknown>)[key] = own;
  }
  // Visibility overrides per device stay with the target too.
  const own = target.style?.responsive;
  for (const device of ["tablet", "mobile"] as const) {
    const src = next.responsive?.[device];
    if (src) for (const key of KEEP_ON_TARGET) delete (src as Record<string, unknown>)[key];
    const keep = own?.[device];
    if (!keep) continue;
    for (const key of KEEP_ON_TARGET) {
      if (keep[key] === undefined) continue;
      next.responsive = { ...(next.responsive ?? {}) };
      next.responsive[device] = { ...(next.responsive[device] ?? {}), [key]: keep[key] };
    }
  }
  if (Object.keys(next).length) target.style = next;
  else delete target.style;

  if (copied.type === target.type) {
    const elements = clone(copied.elementStyles);
    if (Object.keys(elements).length) target.elementStyles = elements;
    else delete target.elementStyles;
  }
}
