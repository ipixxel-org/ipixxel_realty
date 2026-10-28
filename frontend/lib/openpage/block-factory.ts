import type { BlockType, BlockConfig } from "@/components/openpage/blocks/types";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { SECTION_PRESETS, createBlockFromPreset } from "@/lib/openpage/section-presets";

export interface DragItemPayload {
  kind: "block" | "preset" | "global";
  type?: BlockType;
  presetId?: string;
  globalWidgetId?: string;
  label?: string;
}

export function createBlockFromType(type: BlockType): BlockConfig | null {
  const meta = blockMetadata.find((b) => b.type === type);
  let props = meta?.defaultProps
    ? JSON.parse(JSON.stringify(meta.defaultProps))
    : {};
  if (type === "footer") props = upgradeFooterProps(props);

  // Special container defaults
  if (type === "columns" && (!props.columns || !props.columns.length)) {
    props.columns = [{ width: 100, blocks: [] }];
  }

  return {
    id: `block-${type}-${Date.now().toString(36)}`,
    type,
    variant: meta?.variants?.[0] || "default",
    props,
  };
}

export function createBlockFromPresetId(presetId: string): BlockConfig | null {
  const preset = SECTION_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return createBlockFromPreset(preset);
}

/**
 * Fill in any props an externally-produced block (e.g. AI-generated) omitted by
 * merging the type's defaultProps underneath. Existing props always win, so a
 * deliberately empty array stays empty — only absent keys get defaults. Recurses
 * into column containers so nested blocks are covered too. Keeps renderers that
 * iterate props (e.g. footer `links`) from crashing on undefined.
 */
function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Footers used to store links, socials and link columns as bare strings with
 * no URL and no editor. Seed the editable lists (`menuLinks`, `socialLinks`,
 * `linkColumns`) from them once. A list the user already has — even an empty
 * one they cleared — is never touched, and the legacy keys stay as they were
 * for older consumers such as the HTML export.
 */
export function upgradeFooterProps(props: Record<string, unknown>): Record<string, unknown> {
  const out = { ...props };
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : []);
  if (!Array.isArray(out.menuLinks)) {
    out.menuLinks = strings(out.links).map((label) => ({ label, url: `#${slug(label)}` }));
  }
  if (!Array.isArray(out.socialLinks)) {
    out.socialLinks = strings(out.socials).map((label) => ({ label, url: "", icon: "" }));
  }
  if (!Array.isArray(out.linkColumns) && Array.isArray(out.columns)) {
    out.linkColumns = (out.columns as Array<{ title?: unknown; links?: unknown }>)
      .filter((c) => c && typeof c === "object")
      .map((c) => ({ title: typeof c.title === "string" ? c.title : "", links: strings(c.links).join("\n") }));
  }
  return out;
}

export function applyBlockDefaults(block: BlockConfig): BlockConfig {
  const meta = blockMetadata.find((b) => b.type === block.type);
  let props: Record<string, unknown> = {
    ...(meta?.defaultProps ?? {}),
    ...((block.props as Record<string, unknown>) ?? {}),
  };
  if (block.type === "footer") {
    props = upgradeFooterProps(props);
    // Footer link columns are not layout columns; leave them out of the
    // container handling below (which would add a `blocks` array to each).
    return { ...block, props };
  }
  if (Array.isArray(props.columns)) {
    props.columns = (props.columns as Array<{ blocks?: BlockConfig[] }>).map(
      (col) => ({
        ...col,
        blocks: Array.isArray(col?.blocks)
          ? col.blocks.map(applyBlockDefaults)
          : [],
      }),
    );
  }
  return { ...block, props };
}

export function applyBlocksDefaults(blocks: BlockConfig[]): BlockConfig[] {
  return (blocks ?? []).map(applyBlockDefaults);
}
