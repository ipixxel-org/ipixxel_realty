import type { BlockConfig, BlockStyle } from "@/components/openpage/blocks/types";

/**
 * Every font family picked in a block's (or element's) Typography settings,
 * including tablet / mobile overrides and blocks nested inside Divs/columns.
 * Used by both the builder canvas and the live page so they load the same fonts.
 */
export function blockFontFamilies(blocks: BlockConfig[] | undefined): string[] {
  const fonts = new Set<string>();
  const add = (f: unknown) => {
    if (typeof f === "string" && f.trim()) fonts.add(f.trim());
  };
  const scanStyle = (style: BlockStyle | undefined) => {
    add(style?.typography?.fontFamily);
    add(style?.responsive?.tablet?.typography?.fontFamily);
    add(style?.responsive?.mobile?.typography?.fontFamily);
  };
  const scan = (list: BlockConfig[] | undefined) => {
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (!b) continue;
      scanStyle(b.style);
      if (b.elementStyles) for (const s of Object.values(b.elementStyles)) scanStyle(s);
      if (b.type === "columns") {
        const cols = b.props?.columns as Array<{ blocks?: BlockConfig[] }> | undefined;
        if (Array.isArray(cols)) cols.forEach((c) => scan(c?.blocks));
      }
    }
  };
  scan(blocks);
  return Array.from(fonts);
}
