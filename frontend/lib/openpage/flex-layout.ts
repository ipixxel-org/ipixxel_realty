import type { CSSProperties } from "react";

/**
 * "Items" layout for containers, Divs and their columns (Elementor-style:
 * Display, Direction, Justify Content, Align Items, Wrap, Align Content, Grid
 * columns / rows and Gap). Values are stored as short keywords and turned into
 * CSS here; anything unknown is ignored so old or hand-edited JSON can never
 * break the layout.
 */
export const FLEX_DISPLAYS = ["flex", "inline-flex", "grid", "inline-grid", "block", "inline-block"] as const;
export const FLEX_DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;
export const FLEX_JUSTIFY = ["start", "center", "end", "space-between", "space-around", "space-evenly"] as const;
export const FLEX_ALIGN = ["start", "center", "end", "stretch"] as const;
export const FLEX_WRAP = ["wrap", "nowrap", "wrap-reverse"] as const;
export const FLEX_ALIGN_CONTENT = ["start", "center", "end", "space-between", "space-around", "space-evenly", "stretch"] as const;

export type FlexDisplay = (typeof FLEX_DISPLAYS)[number];
export type FlexDirection = (typeof FLEX_DIRECTIONS)[number];
export type FlexJustify = (typeof FLEX_JUSTIFY)[number];
export type FlexAlign = (typeof FLEX_ALIGN)[number];
export type FlexWrap = (typeof FLEX_WRAP)[number];
export type FlexAlignContent = (typeof FLEX_ALIGN_CONTENT)[number];

export interface FlexLayout {
  display?: FlexDisplay;
  direction?: FlexDirection;
  justifyContent?: FlexJustify;
  alignItems?: FlexAlign;
  wrap?: FlexWrap;
  alignContent?: FlexAlignContent;
  /** Grid only: number of columns / rows (1–12). */
  gridColumns?: number;
  gridRows?: number;
  /** Space between the items, e.g. "16px". */
  itemsGap?: string;
}

/** Every stored layout key (used by the store and the inspector). */
export const FLEX_LAYOUT_KEYS = [
  "display",
  "direction",
  "justifyContent",
  "alignItems",
  "wrap",
  "alignContent",
  "gridColumns",
  "gridRows",
  "itemsGap",
] as const;
export type FlexLayoutKey = (typeof FLEX_LAYOUT_KEYS)[number];
export type FlexLayoutPatch = Partial<Record<FlexLayoutKey, string | number | undefined>>;

/** Grid columns used when Display is Grid and none are chosen. */
export const DEFAULT_GRID_COLUMNS = 3;

function pick<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : undefined;
}

function count(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

const LENGTH = /^(0|\d+(\.\d+)?(px|rem|em|%|vw|vh))$/;
function length(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return `${value}px`;
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return `${v}px`;
  return LENGTH.test(v) ? v : undefined;
}

/** Only the valid layout values from `source` (props or a column object). */
export function readFlexLayout(source: unknown): FlexLayout {
  const s = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const layout: FlexLayout = {
    direction: pick(FLEX_DIRECTIONS, s.direction),
    justifyContent: pick(FLEX_JUSTIFY, s.justifyContent),
    alignItems: pick(FLEX_ALIGN, s.alignItems),
  };
  // Newer keys are only added when set, so older layouts compare unchanged.
  const display = pick(FLEX_DISPLAYS, s.display);
  if (display) layout.display = display;
  const wrap = pick(FLEX_WRAP, s.wrap);
  if (wrap) layout.wrap = wrap;
  const alignContent = pick(FLEX_ALIGN_CONTENT, s.alignContent);
  if (alignContent) layout.alignContent = alignContent;
  const gridColumns = count(s.gridColumns);
  if (gridColumns) layout.gridColumns = gridColumns;
  const gridRows = count(s.gridRows);
  if (gridRows) layout.gridRows = gridRows;
  const itemsGap = length(s.itemsGap);
  if (itemsGap) layout.itemsGap = itemsGap;
  return layout;
}

/** Clean a value from the inspector before it is stored (undefined = clear). */
export function normalizeLayoutValue(key: FlexLayoutKey, value: unknown): string | number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const read = readFlexLayout({ [key]: value }) as Record<string, string | number | undefined>;
  return read[key];
}

const CSS_POSITION: Record<string, string> = { start: "flex-start", end: "flex-end" };
const css = (v: string) => CSS_POSITION[v] ?? v;

/** True for the column / column-reverse directions (items stack vertically). */
export function isVertical(direction: FlexDirection | undefined, fallback: FlexDirection): boolean {
  return (direction ?? fallback).startsWith("column");
}

export const isGridDisplay = (d: FlexDisplay | undefined) => d === "grid" || d === "inline-grid";
export const isBlockDisplay = (d: FlexDisplay | undefined) => d === "block" || d === "inline-block";

/** Items stack one under another (vertical flex, or Block / Inline Block). */
export function stacksItems(layout: FlexLayout, fallback: FlexDirection): boolean {
  if (isGridDisplay(layout.display)) return false;
  return isBlockDisplay(layout.display) || isVertical(layout.direction, fallback);
}

/** Items sit side by side in a flex row. */
export function itemsInFlexRow(layout: FlexLayout, fallback: FlexDirection): boolean {
  return !isGridDisplay(layout.display) && !isBlockDisplay(layout.display) && !isVertical(layout.direction, fallback);
}

/**
 * Inline style for the values the user set. Unset values return nothing,
 * so the element keeps its existing classes and looks exactly as before.
 */
export function flexLayoutStyle(layout: FlexLayout): CSSProperties {
  const style: CSSProperties = {};
  if (layout.display) style.display = layout.display;
  const grid = isGridDisplay(layout.display);
  const block = isBlockDisplay(layout.display);
  if (layout.direction && !grid && !block) style.flexDirection = layout.direction;
  if (layout.justifyContent && !block) style.justifyContent = css(layout.justifyContent);
  if (layout.alignItems && !block) style.alignItems = css(layout.alignItems);
  if (layout.wrap && !grid && !block) style.flexWrap = layout.wrap;
  if (layout.alignContent && !block) style.alignContent = css(layout.alignContent);
  if (grid) {
    style.gridTemplateColumns = `repeat(${layout.gridColumns ?? DEFAULT_GRID_COLUMNS}, minmax(0, 1fr))`;
    if (layout.gridRows) style.gridTemplateRows = `repeat(${layout.gridRows}, auto)`;
  }
  if (layout.itemsGap) style.gap = layout.itemsGap;
  return style;
}
