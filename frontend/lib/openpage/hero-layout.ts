import type { CSSProperties } from "react";
import { flexLayoutStyle, readFlexLayout } from "./flex-layout";

/** Layout styles shared by generic and real-estate hero sections. */
export function heroLayoutStyle(source: unknown): CSSProperties {
  const props = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const contentWidth = props.contentWidth;
  const style: CSSProperties = {
    ...flexLayoutStyle(readFlexLayout(props)),
  };
  if (!style.gap && typeof props.gap === "string" && /^(0|\d+(\.\d+)?(px|rem|em|%|vw|vh))$/.test(props.gap.trim())) {
    style.gap = props.gap.trim();
  }

  if (contentWidth === "boxed") {
    style.width = "100%";
    style.maxWidth = "1150px";
    style.marginInline = "auto";
  }

  return style;
}
