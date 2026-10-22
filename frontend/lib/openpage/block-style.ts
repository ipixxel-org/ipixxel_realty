import type { CSSProperties } from "react";
import type {
  BlockConfig,
  BlockInteractionState,
  BlockStyle,
  BlockTypography,
} from "@/components/openpage/blocks/types";
import type { Device } from "@/lib/openpage/types";

/** Merge the device-specific value overrides over the desktop style. */
export function resolveBlockStyleForDevice(
  style: BlockStyle | undefined,
  device: Device,
): BlockStyle | undefined {
  if (!style || device === "desktop") return style;
  const overrides = style.responsive?.[device];
  if (!overrides) return style;
  const resolved: BlockStyle = { ...style };
  delete resolved.responsive;
  Object.assign(resolved, overrides);
  resolved.responsive = style.responsive;
  return resolved;
}

export function formatUnit(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }
  return trimmed;
}

/** Convert persisted BlockStyle into CSS for editor canvas and live pages. */
export function applyBlockStyle(style?: BlockStyle): CSSProperties {
  if (!style) return {};
  const s: CSSProperties = {};

  if (style.marginTop) s.marginTop = formatUnit(style.marginTop);
  if (style.marginBottom) s.marginBottom = formatUnit(style.marginBottom);
  if (style.marginLeft) s.marginLeft = formatUnit(style.marginLeft);
  if (style.marginRight) s.marginRight = formatUnit(style.marginRight);
  if (style.paddingTop) s.paddingTop = formatUnit(style.paddingTop);
  if (style.paddingBottom) s.paddingBottom = formatUnit(style.paddingBottom);
  if (style.paddingLeft) s.paddingLeft = formatUnit(style.paddingLeft);
  if (style.paddingRight) s.paddingRight = formatUnit(style.paddingRight);
  if (style.width) s.width = formatUnit(style.width);
  if (style.maxWidth) s.maxWidth = formatUnit(style.maxWidth);
  if (style.minHeight) s.minHeight = formatUnit(style.minHeight);
  if (style.alignment) s.textAlign = style.alignment as CSSProperties["textAlign"];
  if (style.backgroundColor) s.backgroundColor = style.backgroundColor;
  if (style.backgroundImage) {
    s.backgroundImage = style.backgroundImage.startsWith("url(")
      ? style.backgroundImage
      : `url(${style.backgroundImage})`;
  }
  if (style.backgroundSize) s.backgroundSize = style.backgroundSize;
  if (style.backgroundPosition) s.backgroundPosition = style.backgroundPosition;
  if (style.backgroundRepeat) s.backgroundRepeat = style.backgroundRepeat as CSSProperties["backgroundRepeat"];
  if (style.borderWidth) s.borderWidth = formatUnit(style.borderWidth);
  if (style.borderStyle) s.borderStyle = style.borderStyle as CSSProperties["borderStyle"];
  if (style.borderColor) s.borderColor = style.borderColor;
  if (style.borderRadius) s.borderRadius = formatUnit(style.borderRadius);
  if (style.boxShadow) s.boxShadow = style.boxShadow;
  if (style.opacity) s.opacity = Number.parseFloat(style.opacity);
  if (style.overflow) s.overflow = style.overflow as CSSProperties["overflow"];
  if (style.zIndex) s.zIndex = Number.parseInt(style.zIndex, 10);

  /* Layout */
  if (style.display) s.display = style.display as CSSProperties["display"];
  if (style.flexDirection) s.flexDirection = style.flexDirection as CSSProperties["flexDirection"];
  if (style.flexWrap) s.flexWrap = style.flexWrap as CSSProperties["flexWrap"];
  if (style.flex) s.flex = style.flex;
  if (style.justifyContent) s.justifyContent = style.justifyContent as CSSProperties["justifyContent"];
  if (style.alignItems) s.alignItems = style.alignItems as CSSProperties["alignItems"];
  if (style.alignSelf) s.alignSelf = style.alignSelf as CSSProperties["alignSelf"];
  if (style.alignContent) s.alignContent = style.alignContent as CSSProperties["alignContent"];
  if (style.gap) s.gap = formatUnit(style.gap);
  if (style.rowGap) s.rowGap = formatUnit(style.rowGap);
  if (style.columnGap) s.columnGap = formatUnit(style.columnGap);
  if (style.height) s.height = formatUnit(style.height);
  if (style.minWidth) s.minWidth = formatUnit(style.minWidth);
  if (style.maxHeight) s.maxHeight = formatUnit(style.maxHeight);
  if (style.position) s.position = style.position as CSSProperties["position"];
  if (style.top) s.top = formatUnit(style.top);
  if (style.right) s.right = formatUnit(style.right);
  if (style.bottom) s.bottom = formatUnit(style.bottom);
  if (style.left) s.left = formatUnit(style.left);
  if (style.objectFit) s.objectFit = style.objectFit as CSSProperties["objectFit"];
  if (style.objectPosition) s.objectPosition = style.objectPosition;
  if (style.aspectRatio) s.aspectRatio = style.aspectRatio;
  if (style.transform) s.transform = style.transform;
  if (style.filter) s.filter = style.filter;
  if (style.transition) s.transition = style.transition;
  if (style.cursor) s.cursor = style.cursor;
  if (style.hidden) s.display = "none";

  if (style.sectionPadding) s.padding = style.sectionPadding;
  if (style.sectionMaxWidth) s.maxWidth = style.sectionMaxWidth;
  if (style.sectionAlignment) s.textAlign = style.sectionAlignment as CSSProperties["textAlign"];
  if (style.sectionBackground) s.background = style.sectionBackground;
  if (style.sectionBorderWidth) s.borderWidth = style.sectionBorderWidth;
  if (style.sectionBorderColor) s.borderColor = style.sectionBorderColor;
  if (style.sectionBorderRadius) s.borderRadius = style.sectionBorderRadius;

  const typo = style.typography;
  if (typo?.fontFamily) s.fontFamily = `"${typo.fontFamily}", sans-serif`;
  if (typo?.fontSize) s.fontSize = formatUnit(typo.fontSize);
  if (typo?.fontWeight) s.fontWeight = typo.fontWeight as CSSProperties["fontWeight"];
  if (typo?.fontStyle) s.fontStyle = typo.fontStyle as CSSProperties["fontStyle"];
  if (typo?.lineHeight) s.lineHeight = typo.lineHeight;
  if (typo?.letterSpacing) s.letterSpacing = formatUnit(typo.letterSpacing);
  if (typo?.wordSpacing) s.wordSpacing = formatUnit(typo.wordSpacing);
  if (typo?.textTransform) s.textTransform = typo.textTransform as CSSProperties["textTransform"];
  if (typo?.textDecoration) s.textDecoration = typo.textDecoration as CSSProperties["textDecoration"];
  if (typo?.color) s.color = typo.color;
  if (typo?.textAlign) s.textAlign = typo.textAlign as CSSProperties["textAlign"];

  return s;
}

const DURATION_MS: Record<string, string> = {
  fast: "200ms",
  normal: "400ms",
  slow: "600ms",
  slower: "800ms",
  slowest: "1200ms",
};

export function blockAnimationClass(block: BlockConfig): string {
  if (!block.animation) return "";
  return `op-block-anim op-block-anim--${block.animation}`;
}

export function blockAnimationStyle(block: BlockConfig): CSSProperties {
  if (!block.animation) return {};
  const duration = DURATION_MS[block.animationDuration || "normal"] || block.animationDuration || "400ms";
  const delay = block.animationDelay ? `${block.animationDelay}ms` : undefined;
  return {
    animationDuration: duration,
    animationDelay: delay,
    animationFillMode: "both",
  };
}

export function blockResponsiveHideClass(style?: BlockStyle): string {
  if (!style) return "";
  const parts: string[] = [];
  if (style.hideOnDesktop) parts.push("op-hide-desktop");
  if (style.hideOnTablet) parts.push("op-hide-tablet");
  if (style.hideOnMobile) parts.push("op-hide-mobile");
  return parts.join(" ");
}

export function isHiddenOnViewport(
  style: BlockStyle | undefined,
  viewport: "desktop" | "tablet" | "mobile",
): boolean {
  if (!style) return false;
  if (viewport === "desktop" && style.hideOnDesktop) return true;
  if (viewport === "tablet" && style.hideOnTablet) return true;
  if (viewport === "mobile" && style.hideOnMobile) return true;
  return false;
}

/** Full device-aware render: resolved values + visibility for the active device. */
export function applyBlockStyleForDevice(
  style: BlockStyle | undefined,
  device: Device,
): CSSProperties {
  const resolved = resolveBlockStyleForDevice(style, device);
  const css = applyBlockStyle(resolved);
  if (isHiddenOnViewport(resolved, device)) {
    css.display = "none";
  }
  return css;
}

/**
 * Scoped `!important` stylesheet so user styles actually beat the block's own
 * utility classes. Without this, `font-size`/`color` on the section wrapper are
 * only inherited and get overridden by inner classes (e.g. `text-3xl`), and a
 * `background-color` is hidden whenever the block root paints its own surface.
 * Rules:
 *   - `> *`  = the block's root element receives the user background.
 *   - text element selector receives the user typography.
 */
export function blockStyleTag(blockId: string, style?: BlockStyle): string {
  if (!style) return "";
  const rootRules: string[] = [];
  const textRules: string[] = [];

  if (style.backgroundColor) {
    rootRules.push(`background-color:${style.backgroundColor} !important`);
    rootRules.push(`background:${style.backgroundColor} !important`);
  }
  if (style.backgroundImage) {
    rootRules.push(
      `background-image:${style.backgroundImage.startsWith("url(") ? style.backgroundImage : `url(${style.backgroundImage})`} !important`,
    );
  }
  if (style.backgroundSize) rootRules.push(`background-size:${style.backgroundSize} !important`);
  if (style.backgroundPosition) rootRules.push(`background-position:${style.backgroundPosition} !important`);
  if (style.backgroundRepeat) rootRules.push(`background-repeat:${style.backgroundRepeat} !important`);
  if (style.borderColor) rootRules.push(`border-color:${style.borderColor} !important`);
  if (style.borderWidth) rootRules.push(`border-width:${formatUnit(style.borderWidth)} !important`);
  if (style.borderStyle) rootRules.push(`border-style:${style.borderStyle} !important`);
  if (style.borderRadius) rootRules.push(`border-radius:${formatUnit(style.borderRadius)} !important`);
  if (style.boxShadow) rootRules.push(`box-shadow:${style.boxShadow} !important`);
  if (style.opacity) rootRules.push(`opacity:${style.opacity} !important`);

  if (style.display) rootRules.push(`display:${style.display} !important`);
  if (style.flexDirection) rootRules.push(`flex-direction:${style.flexDirection} !important`);
  if (style.flexWrap) rootRules.push(`flex-wrap:${style.flexWrap} !important`);
  if (style.flex) rootRules.push(`flex:${style.flex} !important`);
  if (style.justifyContent) rootRules.push(`justify-content:${style.justifyContent} !important`);
  if (style.alignItems) rootRules.push(`align-items:${style.alignItems} !important`);
  if (style.alignSelf) rootRules.push(`align-self:${style.alignSelf} !important`);
  if (style.alignContent) rootRules.push(`align-content:${style.alignContent} !important`);
  if (style.gap) rootRules.push(`gap:${formatUnit(style.gap)} !important`);
  if (style.rowGap) rootRules.push(`row-gap:${formatUnit(style.rowGap)} !important`);
  if (style.columnGap) rootRules.push(`column-gap:${formatUnit(style.columnGap)} !important`);
  if (style.height) rootRules.push(`height:${formatUnit(style.height)} !important`);
  if (style.minWidth) rootRules.push(`min-width:${formatUnit(style.minWidth)} !important`);
  if (style.maxHeight) rootRules.push(`max-height:${formatUnit(style.maxHeight)} !important`);
  if (style.position) rootRules.push(`position:${style.position} !important`);
  if (style.top) rootRules.push(`top:${formatUnit(style.top)} !important`);
  if (style.right) rootRules.push(`right:${formatUnit(style.right)} !important`);
  if (style.bottom) rootRules.push(`bottom:${formatUnit(style.bottom)} !important`);
  if (style.left) rootRules.push(`left:${formatUnit(style.left)} !important`);
  if (style.objectFit) rootRules.push(`object-fit:${style.objectFit} !important`);
  if (style.objectPosition) rootRules.push(`object-position:${style.objectPosition} !important`);
  if (style.aspectRatio) rootRules.push(`aspect-ratio:${style.aspectRatio} !important`);
  if (style.transform) rootRules.push(`transform:${style.transform} !important`);
  if (style.filter) rootRules.push(`filter:${style.filter} !important`);
  if (style.transition) rootRules.push(`transition:${style.transition} !important`);
  if (style.cursor) rootRules.push(`cursor:${style.cursor} !important`);

  const t = style.typography;
  if (t?.color) {
    textRules.push(`color:${t.color} !important`);
    rootRules.push(`color:${t.color} !important`);
  }
  if (t?.fontSize && t.fontSize.trim()) {
    const fs = formatUnit(t.fontSize);
    textRules.push(`font-size:${fs} !important`);
  }
  if (t?.fontFamily) {
    const ff = `"${t.fontFamily}", -apple-system, system-ui, sans-serif`;
    textRules.push(`font-family:${ff} !important`);
    rootRules.push(`font-family:${ff} !important`);
  }
  if (t?.fontWeight) {
    textRules.push(`font-weight:${t.fontWeight} !important`);
    rootRules.push(`font-weight:${t.fontWeight} !important`);
  }
  if (t?.fontStyle) {
    textRules.push(`font-style:${t.fontStyle} !important`);
    rootRules.push(`font-style:${t.fontStyle} !important`);
  }
  if (t?.lineHeight) textRules.push(`line-height:${t.lineHeight} !important`);
  if (t?.letterSpacing) textRules.push(`letter-spacing:${formatUnit(t.letterSpacing)} !important`);
  if (t?.wordSpacing) textRules.push(`word-spacing:${formatUnit(t.wordSpacing)} !important`);
  if (t?.textTransform) textRules.push(`text-transform:${t.textTransform} !important`);
  if (t?.textDecoration) textRules.push(`text-decoration:${t.textDecoration} !important`);
  if (t?.textAlign) {
    textRules.push(`text-align:${t.textAlign} !important`);
    rootRules.push(`text-align:${t.textAlign} !important`);
  }

  const parts: string[] = [];
  if (rootRules.length) {
    parts.push(
      `[data-block-id="${blockId}"], [data-block-id="${blockId}"] > *, [data-block-id="${blockId}"] section { ${rootRules.join("; ")}; }`
    );
  }
  if (textRules.length) {
    const textSelectors = [
      `[data-block-id="${blockId}"]`,
      `[data-block-id="${blockId}"] h1`,
      `[data-block-id="${blockId}"] h2`,
      `[data-block-id="${blockId}"] h3`,
      `[data-block-id="${blockId}"] h4`,
      `[data-block-id="${blockId}"] h5`,
      `[data-block-id="${blockId}"] h6`,
      `[data-block-id="${blockId}"] p`,
      `[data-block-id="${blockId}"] span`,
      `[data-block-id="${blockId}"] li`,
      `[data-block-id="${blockId}"] label`,
      `[data-block-id="${blockId}"] a:not(.op-navbar-cta)`,
      `[data-block-id="${blockId}"] button:not(.op-navbar-cta)`,
      `[data-block-id="${blockId}"] strong`,
      `[data-block-id="${blockId}"] em`,
      `[data-block-id="${blockId}"] small`,
    ].join(", ");
    parts.push(`${textSelectors} { ${textRules.join("; ")}; }`);
  }
  if (style.hover) {
    const hv = stateDecls(style.hover);
    if (hv.length) {
      const hoverSel = [
        `[data-block-id="${blockId}"]`,
        `[data-block-id="${blockId}"] > *`,
        `[data-block-id="${blockId}"] section`,
      ].join(", ");
      parts.push(`${hoverSel}:hover { ${hv.join("; ")}; }`);
    }
  }
  return parts.join("\n");
}

/* -------------------------------------------------------------------------- */
/*                     Shared declaration builders                            */
/* -------------------------------------------------------------------------- */

/** Declarations for an interaction state (hover / active). */
export function stateDecls(state?: BlockInteractionState): string[] {
  if (!state) return [];
  const out: string[] = [];
  if (state.color) out.push(`color:${state.color} !important`);
  if (state.backgroundColor) out.push(`background-color:${state.backgroundColor} !important`);
  if (state.borderColor) out.push(`border-color:${state.borderColor} !important`);
  if (state.boxShadow) out.push(`box-shadow:${state.boxShadow} !important`);
  if (state.opacity) out.push(`opacity:${state.opacity} !important`);
  if (state.transform) out.push(`transform:${state.transform} !important`);
  if (state.textDecoration) out.push(`text-decoration:${state.textDecoration} !important`);
  return out;
}

/** Typography declarations shared by block and element scopes. */
function typographyDecls(t?: BlockTypography, withRoot = false): string[] {
  if (!t) return [];
  const out: string[] = [];
  if (t.color) out.push(`color:${t.color} !important`);
  if (t.fontSize && t.fontSize.trim()) out.push(`font-size:${formatUnit(t.fontSize)} !important`);
  if (t.fontFamily) out.push(`font-family:"${t.fontFamily}", -apple-system, system-ui, sans-serif !important`);
  if (t.fontWeight) out.push(`font-weight:${t.fontWeight} !important`);
  if (t.fontStyle) out.push(`font-style:${t.fontStyle} !important`);
  if (t.lineHeight) out.push(`line-height:${t.lineHeight} !important`);
  if (t.letterSpacing) out.push(`letter-spacing:${formatUnit(t.letterSpacing)} !important`);
  if (t.wordSpacing) out.push(`word-spacing:${formatUnit(t.wordSpacing)} !important`);
  if (t.textTransform) out.push(`text-transform:${t.textTransform} !important`);
  if (t.textDecoration) out.push(`text-decoration:${t.textDecoration} !important`);
  if (t.textAlign) out.push(`text-align:${t.textAlign} !important`);
  void withRoot;
  return out;
}

const FLEX_PROPS: Array<[keyof BlockStyle, string]> = [
  ["display", "display"],
  ["flexDirection", "flex-direction"],
  ["flexWrap", "flex-wrap"],
  ["flex", "flex"],
  ["justifyContent", "justify-content"],
  ["alignItems", "align-items"],
  ["alignSelf", "align-self"],
  ["alignContent", "align-content"],
  ["objectFit", "object-fit"],
  ["objectPosition", "object-position"],
  ["position", "position"],
  ["transform", "transform"],
  ["filter", "filter"],
  ["transition", "transition"],
  ["cursor", "cursor"],
];

const LENGTH_PROPS: Array<[keyof BlockStyle, string]> = [
  ["width", "width"],
  ["height", "height"],
  ["minWidth", "min-width"],
  ["minHeight", "min-height"],
  ["maxWidth", "max-width"],
  ["maxHeight", "max-height"],
  ["gap", "gap"],
  ["rowGap", "row-gap"],
  ["columnGap", "column-gap"],
  ["marginTop", "margin-top"],
  ["marginBottom", "margin-bottom"],
  ["marginLeft", "margin-left"],
  ["marginRight", "margin-right"],
  ["paddingTop", "padding-top"],
  ["paddingBottom", "padding-bottom"],
  ["paddingLeft", "padding-left"],
  ["paddingRight", "padding-right"],
  ["top", "top"],
  ["right", "right"],
  ["bottom", "bottom"],
  ["left", "left"],
  ["borderRadius", "border-radius"],
  ["borderWidth", "border-width"],
];

const PLAIN_PROPS: Array<[keyof BlockStyle, string]> = [
  ["backgroundColor", "background-color"],
  ["backgroundImage", "background-image"],
  ["backgroundSize", "background-size"],
  ["backgroundPosition", "background-position"],
  ["backgroundRepeat", "background-repeat"],
  ["borderColor", "border-color"],
  ["borderStyle", "border-style"],
  ["boxShadow", "box-shadow"],
  ["opacity", "opacity"],
  ["overflow", "overflow"],
  ["zIndex", "z-index"],
  ["aspectRatio", "aspect-ratio"],
];

/**
 * Every declaration for a style object, used by the element scope. Background
 * images accept either a raw URL or an already-formed `url(...)` value.
 */
function allDecls(style: BlockStyle): string[] {
  const out: string[] = [];
  for (const [key, prop] of FLEX_PROPS) {
    const value = style[key];
    if (typeof value === "string" && value) out.push(`${prop}:${value} !important`);
  }
  for (const [key, prop] of LENGTH_PROPS) {
    const value = style[key];
    if (typeof value === "string" && value) out.push(`${prop}:${formatUnit(value)} !important`);
  }
  for (const [key, prop] of PLAIN_PROPS) {
    const value = style[key];
    if (typeof value === "string" && value) {
      const v = prop === "background-image" && !value.startsWith("url(") ? `url(${value})` : value;
      out.push(`${prop}:${v} !important`);
    }
  }
  if (style.alignment) out.push(`text-align:${style.alignment} !important`);
  out.push(...typographyDecls(style.typography));
  return out;
}

/**
 * Repeat the attribute selector so deeper elements always outrank the
 * block-level `!important` rules and their own ancestors, independent of the
 * order in which the `<style>` tags happen to appear in the DOM.
 */
function specificity(base: string, depth: number): string {
  return `${Array.from({ length: Math.max(1, depth) }, () => base).join("")}`;
}

/**
 * Element-scoped stylesheet. Element rules must use `!important` (like block
 * rules) because both compete with the section's Tailwind utility classes.
 */
export function elementStyleTag(
  key: string,
  style: BlockStyle | undefined,
  depth = 1,
): string {
  if (!style) return "";
  const base = `[data-el-id="${key}"]`;
  const sel = specificity(base, depth + 1);
  const parts: string[] = [];

  const decls = allDecls(style);
  if (style.hidden) decls.push("display:none !important");
  if (decls.length) parts.push(`${sel} { ${decls.join("; ")}; }`);

  if (style.hover) {
    const hv = stateDecls(style.hover);
    if (hv.length) parts.push(`${sel}:hover { ${hv.join("; ")}; }`);
  }
  if (style.active) {
    const ac = stateDecls(style.active);
    if (ac.length) parts.push(`${sel}:active, ${sel}[data-active="true"] { ${ac.join("; ")}; }`);
  }
  return parts.join("\n");
}

/** Deep-replace {{var}} tokens in any JSON-like value. */
export function applyVarsDeep(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, key: string) =>
      vars[key] != null && vars[key] !== "" ? vars[key] : `{{${key}}}`,
    );
  }
  if (Array.isArray(value)) return value.map((item) => applyVarsDeep(item, vars));
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      next[k] = applyVarsDeep(v, vars);
    }
    return next;
  }
  return value;
}
