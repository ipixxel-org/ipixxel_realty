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
  const props = meta?.defaultProps
    ? JSON.parse(JSON.stringify(meta.defaultProps))
    : {};

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
export function applyBlockDefaults(block: BlockConfig): BlockConfig {
  const meta = blockMetadata.find((b) => b.type === block.type);
  const props: Record<string, unknown> = {
    ...(meta?.defaultProps ?? {}),
    ...((block.props as Record<string, unknown>) ?? {}),
  };
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
