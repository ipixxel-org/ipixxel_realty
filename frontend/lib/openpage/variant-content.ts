import type { BlockConfig } from "@/components/openpage/blocks/types";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { IPX_FIELD_VARIANTS } from "@/lib/openpage/ipixxel-blocks";

/**
 * Per-template content for widgets whose templates share prop keys.
 *
 * Several templates read the same props (logo, background image, location,
 * phone, …), so text or an image entered on one template would otherwise show
 * up on every other one. On a template switch the shared values of the old
 * template are saved under `props.variantContent[old]`, and the new template
 * gets back what was saved for it — or the widget's defaults if it was never
 * used. Rendering is untouched: templates still read plain props, so pages
 * that never switch template are exactly as before.
 */

/** Widget types that keep content per template. */
export const PER_VARIANT_CONTENT_TYPES = new Set(["ipixxel-hero"]);

/** Where the other templates' saved content lives on `block.props`. */
export const VARIANT_CONTENT_KEY = "variantContent";

/** Kept common to all templates on purpose (the section's scroll ID). */
const ALWAYS_SHARED = new Set(["anchor"]);

/** Prop keys read by more than one of `variant`'s templates, with their defaults. */
function sharedKeys(type: string, variant: string): { keys: string[]; defaults: Record<string, unknown> } {
  const meta = blockMetadata.find((b) => b.type === type);
  const all = meta?.variants ?? [];
  const defaults = (meta?.defaultProps ?? {}) as Record<string, unknown>;
  const usage = IPX_FIELD_VARIANTS[type] ?? {};
  const candidates = new Set([...Object.keys(defaults), ...Object.keys(usage)]);
  const keys = [...candidates].filter((k) => {
    if (ALWAYS_SHARED.has(k) || k === VARIANT_CONTENT_KEY) return false;
    const usedBy = usage[k] ?? all;
    return usedBy.length > 1 && usedBy.includes(variant);
  });
  return { keys, defaults };
}

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/**
 * The props after switching `block` to `next`. Returns `block.props`
 * unchanged for widgets without per-template content or a same-template pick.
 */
export function propsForVariantSwitch(block: Pick<BlockConfig, "type" | "variant" | "props">, next: string): Record<string, unknown> {
  const props = block.props as Record<string, unknown>;
  const prev = block.variant;
  if (!PER_VARIANT_CONTENT_TYPES.has(block.type) || !prev || prev === next) return props;

  const store = { ...((props[VARIANT_CONTENT_KEY] as Record<string, Record<string, unknown>> | undefined) ?? {}) };

  // Save what the old template showed.
  const { keys: prevKeys } = sharedKeys(block.type, prev);
  store[prev] = Object.fromEntries(prevKeys.filter((k) => k in props).map((k) => [k, clone(props[k])]));

  // Bring back the new template's own content, or start it from defaults.
  const { keys: nextKeys, defaults } = sharedKeys(block.type, next);
  const saved = store[next];
  const out: Record<string, unknown> = { ...props };
  for (const k of nextKeys) {
    if (saved && k in saved) out[k] = clone(saved[k]);
    else if (k in defaults) out[k] = clone(defaults[k]);
    else delete out[k];
  }
  delete store[next];
  out[VARIANT_CONTENT_KEY] = store;
  return out;
}
