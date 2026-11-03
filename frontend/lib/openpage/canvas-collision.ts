import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { isSameOrInside } from "@/lib/openpage/block-tree";

/** The container a droppable belongs to (a column, or a widget inside a column). */
function containerIdOf(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (data.type === "column" && typeof data.sectionBlockId === "string") return data.sectionBlockId;
  if (data.type === "column-slot" && typeof data.sectionBlockId === "string") return data.sectionBlockId;
  if (data.type === "column-block" && data.columnId != null) return String(data.columnId);
  return null;
}

/** Insertion gaps between root sections / widgets. They win over the block beside them. */
function isInsertionSlot(data: Record<string, unknown> | undefined): boolean {
  return data?.type === "canvas-slot" || data?.type === "column-slot";
}

/**
 * Canvas drop detection. When the pointer is over a Container / Div column
 * (or a widget inside one), that column wins — the innermost one when they
 * are nested — so a dragged section or widget can be dropped into it.
 * Columns that belong to the dragged block itself are skipped (a block can't
 * go inside itself). Everywhere else the normal closest-centre reorder is used.
 */
export function canvasCollision(getBlocks: () => BlockConfig[]): CollisionDetection {
  return (rawArgs) => {
    const activeId = String(rawArgs.active.id);
    const blocks = getBlocks();
    // Targets inside the dragged block itself are never valid.
    const droppableContainers = rawArgs.droppableContainers.filter((d) => {
      const sectionId = containerIdOf(d.data.current as Record<string, unknown> | undefined);
      return sectionId === null || !isSameOrInside(blocks, activeId, sectionId);
    });
    const args = { ...rawArgs, droppableContainers };
    const pointerHits = pointerWithin(args);
    const dataOf = (id: string | number) =>
      droppableContainers.find((d) => d.id === id)?.data.current as Record<string, unknown> | undefined;
    const area = (id: string | number) => {
      const r = args.droppableRects.get(id);
      return r ? r.width * r.height : Number.POSITIVE_INFINITY;
    };
    const underPointer = pointerHits.filter((c) => String(c.id) !== activeId);
    // An insertion gap under the pointer is more precise than the block or
    // column surrounding it, so it always wins.
    const slots = underPointer.filter((c) => isInsertionSlot(dataOf(c.id)));
    if (slots.length) return [slots.reduce((a, b) => (area(b.id) < area(a.id) ? b : a))];
    const inColumns = underPointer.filter((c) => containerIdOf(dataOf(c.id)) !== null);
    if (inColumns.length) {
      // Innermost (smallest) target under the pointer.
      const best = inColumns.reduce((a, b) => (area(b.id) < area(a.id) ? b : a));
      return [best];
    }
    return closestCenter(args);
  };
}
