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

/**
 * A `background-image` value from whatever the inspector stored: a bare URL, an
 * already-formed `url(...)`, or a gradient. Gradients must pass through as-is —
 * wrapping them in `url()` produces invalid CSS and the background vanishes.
 */
export function cssBackgroundImage(value: string): string {
  const v = value.trim();
  if (v === "none" || /^(url|(repeating-)?(linear|radial|conic)-gradient|image-set|var)\(/i.test(v)) return v;
  return `url("${v.replace(/"/g, '\\"')}")`;
}

/**
 * The background overlay as a flat gradient layer. Stacked above the background
 * image (and the background colour beneath it), it tints the section's
 * background without covering its content. Opacity defaults to 50%, matching
 * the inspector slider's initial position.
 */
export function overlayLayer(color?: string, opacity?: string): string | undefined {
  if (!color || !color.trim()) return undefined;
  const parsed = opacity === undefined || opacity === "" ? 0.5 : Number.parseFloat(opacity);
  const pct = Number.isFinite(parsed) ? Math.round(Math.min(Math.max(parsed, 0), 1) * 100) : 50;
  const tint = `color-mix(in srgb, ${color.trim()} ${pct}%, transparent)`;
  return `linear-gradient(${tint}, ${tint})`;
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
  if (style.backgroundImage) s.backgroundImage = cssBackgroundImage(style.backgroundImage);
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
 * Inline style for a block's wrapper: only its box (spacing, size, position,
 * stacking, visibility). Everything visual is emitted once by
 * {@link blockStyleTag}, so nothing is painted or transformed twice.
 */
export function applyBlockBoxStyleForDevice(
  style: BlockStyle | undefined,
  device: Device,
): CSSProperties {
  const resolved = resolveBlockStyleForDevice(style, device);
  if (!resolved) return {};
  const s: CSSProperties = {};
  if (resolved.marginTop) s.marginTop = formatUnit(resolved.marginTop);
  if (resolved.marginBottom) s.marginBottom = formatUnit(resolved.marginBottom);
  if (resolved.marginLeft) s.marginLeft = formatUnit(resolved.marginLeft);
  if (resolved.marginRight) s.marginRight = formatUnit(resolved.marginRight);
  if (resolved.paddingTop) s.paddingTop = formatUnit(resolved.paddingTop);
  if (resolved.paddingBottom) s.paddingBottom = formatUnit(resolved.paddingBottom);
  if (resolved.paddingLeft) s.paddingLeft = formatUnit(resolved.paddingLeft);
  if (resolved.paddingRight) s.paddingRight = formatUnit(resolved.paddingRight);
  if (resolved.width) s.width = formatUnit(resolved.width);
  if (resolved.maxWidth) s.maxWidth = formatUnit(resolved.maxWidth);
  if (resolved.minWidth) s.minWidth = formatUnit(resolved.minWidth);
  if (resolved.minHeight) s.minHeight = formatUnit(resolved.minHeight);
  if (resolved.height) s.height = formatUnit(resolved.height);
  if (resolved.maxHeight) s.maxHeight = formatUnit(resolved.maxHeight);
  if (resolved.position) s.position = resolved.position as CSSProperties["position"];
  if (resolved.top) s.top = formatUnit(resolved.top);
  if (resolved.right) s.right = formatUnit(resolved.right);
  if (resolved.bottom) s.bottom = formatUnit(resolved.bottom);
  if (resolved.left) s.left = formatUnit(resolved.left);
  if (resolved.zIndex) s.zIndex = Number.parseInt(resolved.zIndex, 10);
  if (resolved.overflow) s.overflow = resolved.overflow as CSSProperties["overflow"];
  if (resolved.alignment) s.textAlign = resolved.alignment as CSSProperties["textAlign"];
  if (resolved.sectionPadding) s.padding = resolved.sectionPadding;
  if (resolved.sectionMaxWidth) s.maxWidth = resolved.sectionMaxWidth;
  if (resolved.sectionAlignment) s.textAlign = resolved.sectionAlignment as CSSProperties["textAlign"];
  // Legacy section-level props, kept inline exactly as older documents expect.
  if (resolved.sectionBackground) s.background = resolved.sectionBackground;
  if (resolved.sectionBorderWidth) s.borderWidth = resolved.sectionBorderWidth;
  if (resolved.sectionBorderColor) s.borderColor = resolved.sectionBorderColor;
  if (resolved.sectionBorderRadius) s.borderRadius = resolved.sectionBorderRadius;
  if (resolved.hidden || isHiddenOnViewport(resolved, device)) s.display = "none";
  return s;
}

/** Text-bearing tags the section-wide Type settings apply to. */
const SECTION_TEXT_TAGS = "h1,h2,h3,h4,h5,h6,p,span,li,a,strong,em,small,blockquote,figcaption,dt,dd,td,th";

/**
 * What section-wide Type settings must never reach. List items (cards, rows,
 * FAQ entries), self-contained panels marked `data-op-panel` (an enquiry card
 * beside a hero), buttons and forms each have their own styling controls, so a
 * section colour or font change must not repaint them — nor any wrapper that
 * contains one, since its colour would be inherited. Wrapped in `:where()` so
 * the exclusion adds no specificity and element styles keep winning.
 */
const SECTION_TYPE_EXCLUDE =
  ":not(:where([data-op-item], [data-op-item] *, [data-op-panel], [data-op-panel] *, button, button *, " +
  ".op-btn, .op-btn *, .op-navbar-cta, .op-navbar-cta *, form, form *, :has([data-op-item], [data-op-panel], form)))";

/** Buttons and forms inside a card keep their own styling too. */
const ITEM_TYPE_EXCLUDE = ":not(:where(button, button *, .op-btn, .op-btn *, form, form *))";

/**
 * Scoped `!important` stylesheet so user styles actually beat the block's own
 * utility classes. Each kind of property lands on exactly one target:
 *   - the wrapper (`[data-block-id]`) paints the background, overlay, border,
 *     shadow and transform once, so they are never doubled (a rotated section
 *     used to render as two overlapping rotated cards);
 *   - the block's root element is made transparent so its own default surface
 *     does not cover that background, and receives the flex layout;
 *   - section typography lands on text tags outside cards, buttons and forms;
 *   - card typography (`itemTypography`) lands on every card at once, below
 *     any card's own element style.
 */
export function blockStyleTag(blockId: string, style?: BlockStyle): string {
  if (!style) return "";
  const root = `[data-block-id="${blockId}"]`;
  const child = `${root} > :not(style)`;
  const wrapperRules: string[] = [];
  const childRules: string[] = [];

  const layers: string[] = [];
  const overlay = overlayLayer(style.overlayColor, style.overlayOpacity);
  if (overlay) layers.push(overlay);
  if (style.backgroundImage) layers.push(cssBackgroundImage(style.backgroundImage));
  if (style.backgroundColor || layers.length) {
    if (style.backgroundColor) wrapperRules.push(`background-color:${style.backgroundColor} !important`);
    if (layers.length) wrapperRules.push(`background-image:${layers.join(", ")} !important`);
    wrapperRules.push(`background-size:${style.backgroundSize || "cover"} !important`);
    wrapperRules.push(`background-position:${style.backgroundPosition || "center"} !important`);
    wrapperRules.push(`background-repeat:${style.backgroundRepeat || "no-repeat"} !important`);
    childRules.push("background:transparent !important");
  }
  if (style.borderColor) wrapperRules.push(`border-color:${style.borderColor} !important`);
  if (style.borderWidth) wrapperRules.push(`border-width:${formatUnit(style.borderWidth)} !important`);
  if (style.borderStyle) wrapperRules.push(`border-style:${style.borderStyle} !important`);
  if (style.borderWidth && !style.borderStyle) wrapperRules.push("border-style:solid !important");
  if (style.borderRadius) {
    wrapperRules.push(`border-radius:${formatUnit(style.borderRadius)} !important`);
    childRules.push(`border-radius:${formatUnit(style.borderRadius)} !important`);
  }
  if (style.boxShadow) wrapperRules.push(`box-shadow:${style.boxShadow} !important`);
  if (style.opacity) wrapperRules.push(`opacity:${style.opacity} !important`);
  if (style.transform) wrapperRules.push(`transform:${style.transform} !important`);
  if (style.filter) wrapperRules.push(`filter:${style.filter} !important`);
  if (style.transition) wrapperRules.push(`transition:${style.transition} !important`);
  if (style.cursor) wrapperRules.push(`cursor:${style.cursor} !important`);

  if (style.display) childRules.push(`display:${style.display} !important`);
  if (style.flexDirection) childRules.push(`flex-direction:${style.flexDirection} !important`);
  if (style.flexWrap) childRules.push(`flex-wrap:${style.flexWrap} !important`);
  if (style.flex) childRules.push(`flex:${style.flex} !important`);
  if (style.justifyContent) childRules.push(`justify-content:${style.justifyContent} !important`);
  if (style.alignItems) childRules.push(`align-items:${style.alignItems} !important`);
  if (style.alignSelf) childRules.push(`align-self:${style.alignSelf} !important`);
  if (style.alignContent) childRules.push(`align-content:${style.alignContent} !important`);
  if (style.gap) childRules.push(`gap:${formatUnit(style.gap)} !important`);
  if (style.rowGap) childRules.push(`row-gap:${formatUnit(style.rowGap)} !important`);
  if (style.columnGap) childRules.push(`column-gap:${formatUnit(style.columnGap)} !important`);
  if (style.objectFit) childRules.push(`object-fit:${style.objectFit} !important`);
  if (style.objectPosition) childRules.push(`object-position:${style.objectPosition} !important`);
  if (style.aspectRatio) childRules.push(`aspect-ratio:${style.aspectRatio} !important`);

  const parts: string[] = [];
  if (wrapperRules.length) parts.push(`${root} { ${wrapperRules.join("; ")}; }`);
  if (childRules.length) parts.push(`${child} { ${childRules.join("; ")}; }`);
  // A sticky/fixed root (a sticky header) leaves the wrapper while scrolling,
  // so it must carry the section background itself.
  const travelling = wrapperRules.filter((d) => d.startsWith("background"));
  if (travelling.length) parts.push(`${root} > :is(.sticky, .fixed) { ${travelling.join("; ")}; }`);

  const textRules = typographyDecls(style.typography);
  if (textRules.length) {
    parts.push(`${root} :is(${SECTION_TEXT_TAGS})${SECTION_TYPE_EXCLUDE} { ${textRules.join("; ")}; }`);
  }
  const itemRules = typographyDecls(style.itemTypography);
  if (itemRules.length) {
    parts.push(
      `:where(${root}) :is([data-op-item], [data-op-item] :is(${SECTION_TEXT_TAGS}))${ITEM_TYPE_EXCLUDE} { ${itemRules.join("; ")}; }`,
    );
  }
  if (style.hover) {
    const hv = stateDecls(style.hover);
    if (hv.length) parts.push(`${root}:hover { ${hv.join("; ")}; }`);
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
      const v = prop === "background-image" ? cssBackgroundImage(value) : value;
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
  // Element rules must outrank block typography selectors such as
  // `[data-block-id="..."] h1`, including for root-level elements.
  return `${Array.from({ length: Math.max(2, depth + 1) }, () => base).join("")}`;
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

  // A card's text lives in children that carry their own colour and size
  // classes, so typography set on the card ("Style this item") must reach them
  // directly rather than rely on inheritance. `:where()` keeps this below any
  // styled child element, which is one attribute selector more specific.
  // Image elements wrap their <img>, so fit/position must reach the media
  // itself; with an aspect ratio the media fills the ratio box.
  const media: string[] = [];
  if (style.objectFit) media.push(`object-fit:${style.objectFit} !important`);
  if (style.objectPosition) media.push(`object-position:${style.objectPosition} !important`);
  if (style.aspectRatio) media.push("width:100% !important", "height:100% !important");
  if (media.length) parts.push(`${sel} > :where(img, video, iframe) { ${media.join("; ")}; }`);

  // Buttons and forms *inside* the element keep their own styling; the
  // element itself may be a button (a clickable card) and still styles its text.
  const inner = typographyDecls(style.typography);
  if (inner.length) {
    const own = `${base} :is(button, .op-btn, form)`;
    parts.push(
      `${sel} :where(${SECTION_TEXT_TAGS}, div, label):not(:where(${own}, ${own} *)) { ${inner.join("; ")}; }`,
    );
  }

  // Hover / active. Text colour must also reach the element's own text
  // children (a card's title and description carry their own colour classes
  // and may have a static colour pushed onto them above), so the state rule
  // gets one extra attribute selector to outrank those static colours —
  // including a child element's own colour.
  const own = `${base} :is(button, .op-btn, form)`;
  const states: Array<[BlockInteractionState | undefined, string[]]> = [
    [style.hover, [":hover"]],
    [style.active, [":active", '[data-active="true"]']],
  ];
  for (const [state, pseudos] of states) {
    const decls = stateDecls(state);
    if (!decls.length) continue;
    parts.push(`${pseudos.map((ps) => `${sel}${ps}`).join(", ")} { ${decls.join("; ")}; }`);
    const text = stateTextDecls(state);
    if (text.length) {
      const strong = `${base}${sel}`;
      const targets = pseudos
        .map((ps) => `${strong}${ps} :where(${SECTION_TEXT_TAGS}, div, label):not(:where(${own}, ${own} *))`)
        .join(", ");
      parts.push(`${targets} { ${text.join("; ")}; }`);
    }
  }
  return parts.join("\n");
}

/** The part of an interaction state that is about text, for descendants. */
function stateTextDecls(state?: BlockInteractionState): string[] {
  if (!state) return [];
  const out: string[] = [];
  if (state.color) out.push(`color:${state.color} !important`);
  if (state.textDecoration) out.push(`text-decoration:${state.textDecoration} !important`);
  return out;
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
