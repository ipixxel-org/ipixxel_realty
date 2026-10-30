import {
  ITEM_ID_KEY,
  type BlockConfig,
  type BlockStyle,
  type ElementId,
} from "@/components/openpage/blocks/types";
import { resolveBlockStyleForDevice } from "@/lib/openpage/block-style";
import type { Device } from "@/lib/openpage/types";

/**
 * Stable identity for anything individually editable inside a section.
 *
 * Styles are addressed by these ids rather than by array index so that
 * reordering, duplicating or deleting a sibling never shifts styles onto the
 * wrong element.
 */
export function newElementId(prefix = "el"): ElementId {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Read the stable id of a list item, if one has been assigned. */
export function readItemId(item: unknown): ElementId | undefined {
  if (!isRecord(item)) return undefined;
  const id = item[ITEM_ID_KEY];
  return typeof id === "string" && id ? id : undefined;
}

/**
 * Build the namespaced element id for a list item: `items:el_abc`. The prop key
 * is included so two lists on the same block can never collide. Nested lists
 * (a footer's links inside one of its columns) extend the path further.
 */
export function itemElementId(
  listKey: string,
  item: unknown,
  parentPath = "",
): ElementId {
  const id = readItemId(item);
  return `${parentPath}${listKey}:${id ?? "unassigned"}`;
}

/** A dynamic list addressed by a chain of prop keys, optionally inside a parent item. */
export interface ListRef {
  /** `["columns"]` is a root list; `["columns","links"]` is a list nested in each column. */
  path: string[];
  /** Ancestor item ids, one for each list level above the target list. */
  parentItemIds?: string[];
  /** Convenience for the common two-level case; equivalent to `parentItemIds: [id]`. */
  parentItemId?: string;
}

export function ancestorItemIds(ref: ListRef): string[] {
  // An explicitly supplied chain always wins, even when empty.
  if (ref.parentItemIds) return ref.parentItemIds;
  return ref.parentItemId ? [ref.parentItemId] : [];
}

/**
 * The single source of truth for a list item's element id. Every producer
 * (renderers, the list editor, style pruning) must agree, otherwise styles
 * would be written under one key and read under another.
 *
 *   root    `["columns"]`              -> `columns:it_abc`
 *   nested  `["columns","links"]` + Y  -> `columns:it_Y/links:it_abc`
 *   deeper  `["a","b","c"]` + A,B      -> `a:it_A/b:it_B/c:it_abc`
 */
export function listElementId(ref: ListRef, itemId: string): ElementId {
  const ancestors = ancestorItemIds(ref);
  let base = "";
  for (let i = 0; i < ancestors.length; i++) {
    const key = ref.path[i];
    if (!key) return itemId;
    base += `${key}:${ancestors[i]}/`;
  }
  const key = ref.path.slice(ancestors.length).join(":");
  return key ? `${base}${key}:${itemId}` : itemId;
}

/** Element id for a scalar child of a list item, e.g. a card's title. */
export function subElementId(parentElementId: ElementId, subKey: string): ElementId {
  return `${parentElementId}/${subKey}`;
}

/** Find a list item by its stable `_id`, tolerating malformed entries. */
export function itemAt(list: unknown, itemId: string | undefined): Record<string, unknown> | undefined {
  if (!itemId || !Array.isArray(list)) return undefined;
  return (list as Array<Record<string, unknown>>).find(
    (entry) => isRecord(entry) && entry[ITEM_ID_KEY] === itemId,
  );
}

/**
 * Walk a `ListRef` down to the array it addresses, descending through each
 * ancestor item. `["columns","links"]` + column `Y` resolves to
 * `props.columns.find(c => c._id === Y).links`. Returns the live array.
 */
export function resolveList(
  props: Record<string, unknown> | undefined,
  ref: ListRef,
): Array<Record<string, unknown>> | undefined {
  if (!props) return undefined;
  const { path } = ref;
  const ancestors = ancestorItemIds(ref);
  if (!path.length || ancestors.length >= path.length) return undefined;

  let container: unknown = props;
  for (let i = 0; i < path.length; i++) {
    if (!isRecord(container)) return undefined;
    const list = container[path[i]];
    if (!Array.isArray(list)) return undefined;
    if (i === path.length - 1) return list as Array<Record<string, unknown>>;
    container = itemAt(list, ancestors[i]);
    if (!container) return undefined;
  }
  return undefined;
}

/**
 * True when an element id addresses a list item (a card, a row, an FAQ entry)
 * or one of its children, rather than a fixed part of the section.
 *
 * Fixed parts are always namespaced by the block type (`faq:title`, see
 * `part()` in the renderers); list ids start with their prop key
 * (`items:it_abc`, `items:it_abc/title`). Section-wide Type settings use this
 * to leave cards alone, since each card has its own styling controls.
 */
export function isItemElementId(blockType: string, elementId: ElementId): boolean {
  const head = elementId.split(":", 1)[0];
  return elementId.includes(":") && head !== blockType;
}

/** The DOM/CSS key for an element inside a block. */
export function elementKey(blockId: string, elementId: ElementId): string {
  return `${blockId}|${elementId}`;
}

/** Resolve an element's style for the active device, honouring overrides. */
export function getElementStyle(
  block: BlockConfig,
  elementId: ElementId,
  device: Device,
): BlockStyle | undefined {
  const raw = block.elementStyles?.[elementId];
  if (!raw) return undefined;
  return resolveBlockStyleForDevice(raw, device);
}

export function isElementHidden(style: BlockStyle | undefined, device: Device): boolean {
  if (!style) return false;
  if (style.hidden) return true;
  if (device === "desktop" && style.hideOnDesktop) return true;
  if (device === "tablet" && style.hideOnTablet) return true;
  if (device === "mobile" && style.hideOnMobile) return true;
  return false;
}

/**
 * Ensure every object inside every array of a value carries an `_id`.
 * Recurses so nested lists (a footer's columns each containing links, a tab
 * group, a form's fields) are covered too.
 */
function ensureIdsDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (isRecord(entry)) {
        const next = ensureIdsDeep(entry) as Record<string, unknown>;
        if (typeof next[ITEM_ID_KEY] !== "string" || !next[ITEM_ID_KEY]) {
          next[ITEM_ID_KEY] = newElementId("it");
        }
        return next;
      }
      return entry;
    });
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === ITEM_ID_KEY) {
        // Carry an existing stable id through untouched. Minting a new one here
        // would reshuffle every `elementStyles` key on each document load.
        if (typeof entry === "string" && entry) out[ITEM_ID_KEY] = entry;
        continue;
      }
      out[key] = ensureIdsDeep(entry);
    }
    return out;
  }
  return value;
}

/** True when a prop value looks like a dynamic list (array of objects). */
export function isDynamicList(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => isRecord(entry));
}

/**
 * Lists the inspector edits as objects, with the field a plain-text entry
 * belongs in. AI-generated or imported pages sometimes store these as bare
 * strings, which the list editor would split into one box per character and
 * the renderer would show as an empty card.
 */
const TEXT_ITEM_FIELD: Record<string, string> = {
  "project-overview.highlights": "title",
  "project-highlights.items": "title",
  "features.items": "title",
  "amenities.items": "title",
  "icon-box.items": "title",
  "location.items": "title",
  "testimonials.items": "quote",
  "faq.items": "question",
};

/** Turn plain-text entries of a known object list into `{ [field]: text }`. */
function textItemsToObjects(type: string, key: string, list: unknown[]): unknown[] {
  const field = TEXT_ITEM_FIELD[`${type}.${key}`];
  if (!field || !list.some((entry) => typeof entry === "string")) return list;
  return list
    .filter((entry) => typeof entry !== "string" || entry.trim())
    .map((entry) => (typeof entry === "string" ? { [field]: entry.trim() } : entry));
}

/**
 * Backfill `_id` on all dynamic list items in a block, and upgrade plain-text
 * entries of known object lists (see TEXT_ITEM_FIELD). Idempotent, so it is
 * safe to run on every document load.
 */
export function migrateBlockListIds(block: BlockConfig): BlockConfig {
  let changed = false;
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(block.props ?? {})) {
    if (!Array.isArray(value)) {
      props[key] = value;
      continue;
    }
    const next = ensureIdsDeep(textItemsToObjects(block.type, key, value));
    if (JSON.stringify(next) !== JSON.stringify(value)) changed = true;
    props[key] = next;
  }
  return changed ? { ...block, props } : block;
}

/** Walk every block in a block tree (including columns) and backfill list ids. */
export function migrateBlocksListIds(blocks: BlockConfig[]): BlockConfig[] {
  return blocks.map((block) => {
    const withProps = migrateBlockListIds(block);
    if (!Array.isArray(withProps.props.columns)) return withProps;
    const columns = withProps.props.columns as Array<Record<string, unknown>>;
    return {
      ...withProps,
      props: {
        ...withProps.props,
        columns: columns.map((col) => ({
          ...col,
          blocks: Array.isArray(col.blocks) ? migrateBlocksListIds(col.blocks as BlockConfig[]) : col.blocks,
        })),
      },
    };
  });
}

/**
 * Drop `elementStyles` entries whose element no longer exists. Called after
 * destructive list edits so deleted cards do not leak orphan styles into saved
 * documents forever.
 */
export function pruneElementStyles(
  block: BlockConfig,
  liveElementIds: Set<ElementId>,
): BlockConfig {
  if (!block.elementStyles) return block;
  const next: Record<string, BlockStyle> = {};
  let changed = false;
  for (const [id, style] of Object.entries(block.elementStyles)) {
    if (liveElementIds.has(id)) next[id] = style;
    else changed = true;
  }
  return changed ? { ...block, elementStyles: next } : block;
}

/** Recursively collect the element ids a value currently addresses. */
function collectIdsForValue(value: unknown, path: string, out: Set<ElementId>): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const itemId = readItemId(entry);
    if (!itemId) continue;
    const itemPath = `${path}${itemId}/`;
    out.add(`${path}${itemId}`);
    for (const [nestedKey, nestedValue] of Object.entries(entry)) {
      if (Array.isArray(nestedValue)) collectIdsForValue(nestedValue, `${itemPath}${nestedKey}:`, out);
    }
  }
}

/** Collect every element id a block currently addresses. */
export function collectElementIds(block: BlockConfig): Set<ElementId> {
  const ids = new Set<ElementId>();
  for (const [key, value] of Object.entries(block.props ?? {})) {
    if (!Array.isArray(value)) continue;
    collectIdsForValue(value, `${key}:`, ids);
  }
  return ids;
}