import type { CSSProperties } from "react";

/**
 * "Items" layout for containers and their columns (Direction, Justify
 * Content, Align Items). Values are stored as short keywords and turned into
 * CSS here; anything unknown is ignored so old or hand-edited JSON can never
 * break the layout.
 */
export const FLEX_DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;
export const FLEX_JUSTIFY = ["start", "center", "end", "space-between", "space-around", "space-evenly"] as const;
export const FLEX_ALIGN = ["start", "center", "end", "stretch"] as const;

export type FlexDirection = (typeof FLEX_DIRECTIONS)[number];
export type FlexJustify = (typeof FLEX_JUSTIFY)[number];
export type FlexAlign = (typeof FLEX_ALIGN)[number];

export interface FlexLayout {
  direction?: FlexDirection;
  justifyContent?: FlexJustify;
  alignItems?: FlexAlign;
}

function pick<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Only the valid layout values from `source` (props or a column object). */
export function readFlexLayout(source: unknown): FlexLayout {
  const s = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  return {
    direction: pick(FLEX_DIRECTIONS, s.direction),
    justifyContent: pick(FLEX_JUSTIFY, s.justifyContent),
    alignItems: pick(FLEX_ALIGN, s.alignItems),
  };
}

const CSS_POSITION: Record<string, string> = { start: "flex-start", end: "flex-end" };
const css = (v: string) => CSS_POSITION[v] ?? v;

/** True for the column / column-reverse directions (items stack vertically). */
export function isVertical(direction: FlexDirection | undefined, fallback: FlexDirection): boolean {
  return (direction ?? fallback).startsWith("column");
}

/**
 * Inline flex style for the values the user set. Unset values return nothing,
 * so the element keeps its existing classes and looks exactly as before.
 */
export function flexLayoutStyle(layout: FlexLayout): CSSProperties {
  const style: CSSProperties = {};
  if (layout.direction) style.flexDirection = layout.direction;
  if (layout.justifyContent) style.justifyContent = css(layout.justifyContent);
  if (layout.alignItems) style.alignItems = css(layout.alignItems);
  return style;
}
