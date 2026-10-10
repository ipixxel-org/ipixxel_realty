"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  Copy,
  GripVertical,
  Palette,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { ITEM_ID_KEY, type BlockConfig } from "@/components/openpage/blocks/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { ancestorItemIds, listElementId, resolveList, subElementId, type ListRef } from "@/lib/openpage/element-style";
import { findBlock } from "@/lib/openpage/block-tree";
import { ItemFields, itemDisplayName, type ItemFieldDef } from "./field-helpers";

/** Stable empty reference so the store selector never returns a fresh array. */
const EMPTY_ITEMS: Array<Record<string, unknown>> = [];

interface SubElementDef {
  key: string;
  label: string;
}

/** dnd-kit needs a single flat id per row; scope it by list and ancestors. */
function sortableId(list: ListRef, itemId: string): string {
  const scope = `${list.path.join(".")}-${ancestorItemIds(list).join(".") || "root"}`;
  return `${scope}-${itemId}`;
}

function ListRow({
  block,
  list,
  item,
  index,
  total,
  fields,
  subElements,
  isSelected,
  onToggle,
}: {
  block: BlockConfig;
  list: ListRef;
  item: Record<string, unknown>;
  index: number;
  total: number;
  fields?: ItemFieldDef[];
  subElements?: SubElementDef[];
  isSelected: boolean;
  onToggle: () => void;
}) {
  const updateListItem = useConfigStore((s) => s.updateListItem);
  const duplicateListItem = useConfigStore((s) => s.duplicateListItem);
  const removeListItem = useConfigStore((s) => s.removeListItem);
  const setListItemHidden = useConfigStore((s) => s.setListItemHidden);
  const selectElement = useEditorStore((s) => s.selectElement);

  const rawId = item[ITEM_ID_KEY];
  const itemId = rawId ? String(rawId) : `idx_${index}`;
  const elementId = listElementId(list, itemId);
  const hidden = item.hidden === true;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId(list, itemId),
  });

  const displayName = itemDisplayName(item);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`rounded-lg border transition-colors ${
        isSelected
          ? "border-sky-500/60 bg-sky-500/5"
          : "border-border-default bg-bg-2 hover:border-border-hover"
      } ${hidden ? "opacity-60" : ""}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 text-text-3 hover:text-text-1 cursor-grab active:cursor-grabbing shrink-0"
          title="Drag to reorder"
        >
          <GripVertical size={12} />
        </button>

        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <span className="text-[10px] font-semibold text-text-3 shrink-0">
            {index + 1}/{total}
          </span>
          <span className="text-[11px] text-text-1 truncate">
            {displayName || <span className="text-text-3 italic">Untitled</span>}
          </span>
          <ChevronDown
            size={12}
            className={`text-text-3 shrink-0 transition-transform ${isSelected ? "rotate-180" : ""}`}
          />
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !hidden;
            setListItemHidden(block.id, list, itemId, next);
            toast.success(next ? "Item hidden" : "Item shown");
          }}
          className={`p-1 shrink-0 transition-colors ${hidden ? "text-amber-500" : "text-text-3 hover:text-text-1"}`}
          title={hidden ? "Show item" : "Hide item"}
        >
          {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>

        <button
          type="button"
          onClick={() => {
            const newId = duplicateListItem(block.id, list, itemId);
            if (newId) toast.success("Item duplicated");
          }}
          className="p-1 text-text-3 hover:text-text-1 transition-colors shrink-0"
          title="Duplicate"
        >
          <Copy size={12} />
        </button>

        <button
          type="button"
          onClick={() => {
            removeListItem(block.id, list, rawId ? String(rawId) : "", index);
            if (useEditorStore.getState().selectedElement?.elementId === elementId) {
              useEditorStore.getState().clearElementSelection();
            }
            toast.success("Item removed");
          }}
          className="p-1 text-text-3 hover:text-status-red transition-colors shrink-0"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Expanded body */}
      {isSelected ? (
        <div className="px-2 pb-2 space-y-2 border-t border-border-subtle pt-2">
          <ItemFields
            item={item}
            fields={fields}
            onChange={(key, value) => updateListItem(block.id, list, itemId, { [key]: value })}
          />

          {/* Styling entry points for this item and its children. */}
          <div className="flex flex-wrap gap-1 pt-1 border-t border-border-subtle">
            <button
              type="button"
              onClick={() => selectElement(block.id, elementId)}
              className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-default bg-bg-3 text-[10px] text-text-1 hover:border-sky-500/50 hover:text-sky-400 transition-colors"
            >
              <Palette size={10} />
              Style this item
            </button>
            {(subElements ?? []).map((sub) => (
              <button
                key={sub.key}
                type="button"
                onClick={() => selectElement(block.id, subElementId(elementId, sub.key))}
                className="px-1.5 py-1 rounded border border-border-default bg-bg-3 text-[10px] text-text-3 hover:border-sky-500/50 hover:text-sky-400 transition-colors"
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dynamic list manager shared by every section: add, duplicate, delete,
 * hide/show, drag-and-drop reorder, inline content editing, and a styling
 * hand-off for each item (and its named children) into the element panel.
 */
export function ElementListEditor({
  block,
  list,
  label,
  addLabel = "Add item",
  template,
  fields,
  subElements,
  sortable = true,
}: {
  block: BlockConfig;
  /** Which dynamic list this editor manages, e.g. `{ path: ["columns"] }`. */
  list: ListRef;
  label: string;
  addLabel?: string;
  template?: Record<string, unknown>;
  fields?: ItemFieldDef[];
  subElements?: SubElementDef[];
  sortable?: boolean;
}) {
  const blockId = block.id;
  const items = useConfigStore((s) => {
    const pages = s.config.pages;
    if (!pages || pages.length === 0) return EMPTY_ITEMS;
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0];
    const target = findBlock(page?.blocks ?? [], blockId);
    // Returns the live array so the reference stays stable between renders.
    return resolveList(target?.props as Record<string, unknown> | undefined, list) ?? EMPTY_ITEMS;
  });
  const addListItem = useConfigStore((s) => s.addListItem);
  const moveListItem = useConfigStore((s) => s.moveListItem);

  const [expanded, setExpanded] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Stable dnd-kit ids mapped back to item ids, so drag handling never has to
  // parse an id to recover which item moved.
  const sortableIds = useMemo(
    () => items.map((i, idx) => sortableId(list, String(i[ITEM_ID_KEY] ?? `idx_${idx}`))),
    [items, list],
  );

  const itemIdBySortableId = useMemo(
    () => new Map(sortableIds.map((sid, i) => [sid, String(items[i][ITEM_ID_KEY] ?? `idx_${i}`)])),
    [sortableIds, items],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i, idx) => itemIdBySortableId.get(String(active.id)) === String(i[ITEM_ID_KEY] ?? `idx_${idx}`));
    const to = items.findIndex((i, idx) => itemIdBySortableId.get(String(over.id)) === String(i[ITEM_ID_KEY] ?? `idx_${idx}`));
    if (from === -1 || to === -1) return;
    moveListItem(block.id, list, from, to);
  };

  const rows = items.map((item, index) => {
    const rawId = item[ITEM_ID_KEY];
    const itemId = rawId ? String(rawId) : `idx_${index}`;
    return (
      <ListRow
        key={rawId ? String(rawId) : `row_${index}`}
        block={block}
        list={list}
        item={item}
        index={index}
        total={items.length}
        fields={fields}
        subElements={subElements}
        isSelected={expanded === itemId}
        onToggle={() => setExpanded((prev) => (prev === itemId ? null : itemId))}
      />
    );
  });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
          {label}
          <span className="ml-1.5 text-text-3 normal-case font-normal">({items.length})</span>
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-[10.5px] text-text-3 px-2 py-3 rounded-lg border border-dashed border-border-default text-center">
          No items yet.
        </p>
      ) : null}

      {sortable ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">{rows}</div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-1.5">{rows}</div>
      )}

      <button
        type="button"
        onClick={() => {
          addListItem(block.id, list, template);
          toast.success(`${label}: item added`);
        }}
        className="w-full py-1.5 rounded-lg border border-dashed border-green/40 text-[10.5px] text-green hover:bg-green/5 hover:border-green transition-colors flex items-center justify-center gap-1"
      >
        <Plus size={11} className="stroke-[2.5]" />
        {addLabel}
      </button>
    </div>
  );
}