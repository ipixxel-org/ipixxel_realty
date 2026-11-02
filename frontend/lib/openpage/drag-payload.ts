/** MIME type the Blocks panel writes when a widget, section or global widget is dragged. */
export const OPENPAGE_DRAG_MIME = "application/x-openpage-drag";

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
