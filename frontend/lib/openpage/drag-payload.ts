import { createBlockFromType, createBlockFromPresetId } from "@/lib/openpage/block-factory";
import type { BlockConfig, BlockType } from "@/components/openpage/blocks/types";

/** MIME type the Blocks panel writes when a widget, section or global widget is dragged. */
export const OPENPAGE_DRAG_MIME = "application/x-openpage-drag";

/** MIME type used when an existing block in the tree (e.g. from Navigator) is dragged. */
export const OPENPAGE_BLOCK_ID_MIME = "application/x-openpage-block-id";

export type DropPayload =
  | { kind: "block"; type: string; label?: string }
  | { kind: "preset"; presetId: string; label?: string }
  | { kind: "global"; globalWidgetId: string; name?: string; label?: string };

/** A valid builder drag payload from a raw string, or null for anything else. */
export function parseDropPayload(raw: string | null | undefined): DropPayload | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const text = (v: unknown) => typeof v === "string" && v.length > 0;
  if (p.kind === "block" && text(p.type)) return p as DropPayload;
  if (p.kind === "preset" && text(p.presetId)) return p as DropPayload;
  if (p.kind === "global" && text(p.globalWidgetId)) return p as DropPayload;
  return null;
}

/**
 * The builder payload of a drop, or null when the drop is something else.
 * Dragging an image, link or selected text on the page makes the browser
 * carry a plain URL / text (e.g. "https://…"); that is not a widget and is
 * ignored instead of being parsed as JSON and throwing.
 */
export function readDropPayload(dataTransfer: Pick<DataTransfer, "getData"> | null | undefined): DropPayload | null {
  if (!dataTransfer) return null;
  // Some browsers hide custom MIME types on drop, so the Blocks panel also
  // writes text/plain; both are checked.
  return parseDropPayload(dataTransfer.getData(OPENPAGE_DRAG_MIME)) ?? parseDropPayload(dataTransfer.getData("text/plain"));
}

/** Read an existing block id carried by a drag (e.g. from the Navigator tree). */
export function readDraggedBlockId(dataTransfer: Pick<DataTransfer, "getData"> | null | undefined): string | null {
  if (!dataTransfer) return null;
  const id = dataTransfer.getData(OPENPAGE_BLOCK_ID_MIME);
  if (id && typeof id === "string" && id.trim().length > 0) return id.trim();
  return null;
}

/** Build a new block from a parsed drop payload (block, preset, or global). */
export function buildBlockFromPayload(
  payload: DropPayload,
  globalWidgets?: Array<{ id: string; name: string; block: BlockConfig }>,
): { block: BlockConfig | null; label: string } {
  if (payload.kind === "block") {
    return {
      block: createBlockFromType(payload.type as BlockType),
      label: payload.label || payload.type,
    };
  }
  if (payload.kind === "preset") {
    return {
      block: createBlockFromPresetId(payload.presetId),
      label: payload.label || "Section",
    };
  }
  if (payload.kind === "global") {
    const gw = globalWidgets?.find((w) => w.id === payload.globalWidgetId);
    if (gw) {
      return {
        block: { ...JSON.parse(JSON.stringify(gw.block)), id: `block-${Date.now()}` },
        label: gw.name || payload.label || "Global Widget",
      };
    }
  }
  return { block: null, label: "Block" };
}
