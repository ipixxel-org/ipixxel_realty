import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { isSameOrInside } from "@/lib/openpage/block-tree";

/** The container a droppable belongs to (a column, or a widget inside a column). */
function containerIdOf(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (data.type === "column" && typeof data.sectionBlockId === "string") return data.sectionBlockId;
  if (data.type === "column-block" && data.columnId != null) return String(data.columnId);
  return null;
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
    const inColumns = pointerWithin(args).filter((c) => {
      if (String(c.id) === activeId) return false;
      const container = droppableContainers.find((d) => d.id === c.id);
      return containerIdOf(container?.data.current as Record<string, unknown> | undefined) !== null;
    });
    if (inColumns.length) {
      const area = (id: string | number) => {
        const r = args.droppableRects.get(id);
        return r ? r.width * r.height : Number.POSITIVE_INFINITY;
      };
      // Innermost (smallest) target under the pointer.
      const best = inColumns.reduce((a, b) => (area(b.id) < area(a.id) ? b : a));
      return [best];
    }
    return closestCenter(args);
  };
}
