import type { BlockConfig } from "@/components/openpage/blocks/types";

/** A column inside a `columns` block: `columns[].blocks` holds child widgets. */
interface ColumnList {
  width: number;
  blocks: BlockConfig[];
}

function columnListsOf(block: BlockConfig): ColumnList[] | undefined {
  const cols = block.props?.columns;
  return Array.isArray(cols) ? (cols as ColumnList[]) : undefined;
}

/**
 * Where a block lives inside the block tree. `parentList` is the live array
 * that owns it (root page blocks, or a column's `blocks`); `sectionId` /
 * `colIndex` are null when the block is a root-level section.
 */
export interface BlockLocation {
  parentList: BlockConfig[];
  index: number;
  sectionId: string | null;
  colIndex: number | null;
  depth: number;
}

/** Recursively locate a block at any depth (root, columns, nested columns). */
export function findBlockLocation(
  blocks: BlockConfig[],
  id: string,
  depth = 0,
): BlockLocation | null {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.id === id) {
      return { parentList: blocks, index: i, sectionId: null, colIndex: null, depth };
    }
    const cols = columnListsOf(block);
    if (cols) {
      for (let c = 0; c < cols.length; c++) {
        const childList = cols[c].blocks;
        const direct = childList.findIndex((x) => x.id === id);
        if (direct !== -1) {
          return { parentList: childList, index: direct, sectionId: block.id, colIndex: c, depth: depth + 1 };
        }
        const nested = findBlockLocation(childList, id, depth + 1);
        if (nested) return nested;
      }
    }
  }
  return null;
}

export function findBlock(blocks: BlockConfig[], id: string): BlockConfig | null {
  return findBlockLocation(blocks, id)?.parentList[findBlockLocation(blocks, id)!.index] ?? null;
}

/** Find the column list that `sectionId` renders, so children can be edited at any depth. */
export function findColumnList(
  blocks: BlockConfig[],
  sectionId: string,
  colIndex: number,
): { list: BlockConfig[]; section: BlockConfig } | null {
  for (const block of blocks) {
    if (block.id === sectionId) {
      const cols = columnListsOf(block);
      if (cols && cols[colIndex]) return { list: cols[colIndex].blocks, section: block };
      return null;
    }
    const cols = columnListsOf(block);
    if (cols) {
      for (const col of cols) {
        const found = findColumnList(col.blocks, sectionId, colIndex);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Locate a `columns` section block at any depth (root or nested in columns). */
export function findSectionBlock(blocks: BlockConfig[], sectionId: string): BlockConfig | null {
  for (const block of blocks) {
    if (block.id === sectionId) return block;
    const cols = columnListsOf(block);
    if (cols) {
      for (const col of cols) {
        const found = findSectionBlock(col.blocks, sectionId);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Deep-clone a block and give every descendant a fresh id (used by duplicate / copy-paste). */
export function deepCloneWithFreshIds(block: BlockConfig): BlockConfig {
  const copy = JSON.parse(JSON.stringify(block)) as BlockConfig;
  const walk = (b: BlockConfig): BlockConfig => {
    const next: BlockConfig = {
      ...b,
      id: freshId(b.type),
      props: b.props ? JSON.parse(JSON.stringify(b.props)) : {},
    };
    if (b.style) next.style = JSON.parse(JSON.stringify(b.style));
    const cols = columnListsOf(next);
    if (cols) {
      for (const col of cols) {
        col.blocks = col.blocks.map(walk);
      }
    }
    if (next.children?.length) next.children = next.children.map(walk);
    return next;
  };
  return walk(copy);
}

function freshId(type: string): string {
  const slug = type.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return `block-${slug}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Remove a block from wherever it lives (root or any column). Mutates the
 * passed arrays directly, so it is only ever called against immer drafts or
 * freshly cloned trees — never the live store state.
 */
export function extractBlock(
  blocks: BlockConfig[],
  id: string,
): { removed: BlockConfig | null } {
  const located = findBlockLocation(blocks, id);
  if (!located) return { removed: null };
  const [removed] = located.parentList.splice(located.index, 1);
  return { removed };
}

/** Ensure a `columns` block has the requested column list (mutation-safe on immer drafts). */
export function ensureColumn(block: BlockConfig, colIndex: number): BlockConfig {
  if (!block.props || typeof block.props !== "object") block.props = {};
  if (!Array.isArray(block.props.columns) || block.props.columns.length === 0) {
    block.props.columns = [
      { width: 50, blocks: [] },
      { width: 50, blocks: [] },
    ];
  }
  const cols = block.props.columns as ColumnList[];
  if (!cols[colIndex]) cols[colIndex] = { width: 50, blocks: [] };
  return block;
}

export interface InsertTarget {
  kind: "root";
  index?: number | null;
}

export interface ColumnTarget {
  kind: "column";
  sectionId: string;
  colIndex: number;
  index?: number | null;
}

export type BlockInsertTarget = InsertTarget | ColumnTarget;

/** Insert a block into the tree at the given target (used by move + copy/paste). */
export function insertBlock(
  blocks: BlockConfig[],
  target: BlockInsertTarget,
  block: BlockConfig,
): BlockConfig[] {
  if (target.kind === "root") {
    const list = blocks;
    const index = clampIndex(target.index, list.length);
    list.splice(index, 0, block);
    return blocks;
  }
  const locatedSection = findColumnList(blocks, target.sectionId, target.colIndex);
  if (!locatedSection) return blocks;
  const list = locatedSection.list;
  list.splice(clampIndex(target.index, list.length), 0, block);
  return blocks;
}

export function clampIndex(index: number | null | undefined, length: number): number {
  if (index == null) return length;
  return Math.max(0, Math.min(index, length));
}

/**
 * Pure reorder of a *group* of root-level blocks (Elementor-style multi-drag).
 *
 * `ids` may be in any order; the group keeps its existing relative order in
 * the source array. `overIndex` is an index in the ORIGINAL array pointing at
 * the block ahead of which the group should end up (pass `blocks.length` to
 * append at the end). If `overIndex` points at one of the selected blocks
 * the list is returned unchanged, because the group can't land on itself.
 *
 * Returns a new array; the input and its block objects are not mutated.
 */
export function moveBlockGroup(
  blocks: BlockConfig[],
  ids: string[],
  overIndex: number,
): BlockConfig[] {
  const selected = ids
    .map((id) => ({ id, index: blocks.findIndex((b) => b.id === id) }))
    .filter((entry) => entry.index !== -1)
    .sort((a, b) => a.index - b.index);
  if (selected.length === 0) return blocks;

  const selectedIds = new Set(selected.map((entry) => entry.id));
  const target = clampIndex(overIndex, blocks.length);
  if (target < blocks.length && selectedIds.has(blocks[target].id)) return blocks;

  const group: BlockConfig[] = selected.map((entry) => blocks[entry.index]);
  const next: BlockConfig[] = [];
  let inserted = false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (selectedIds.has(block.id)) continue;
    if (!inserted && i >= target) {
      next.push(...group);
      inserted = true;
    }
    next.push(block);
  }
  if (!inserted) next.push(...group);
  return next;
}

/** True when every id in `ids` lives at the root level of `blocks`. */
export function allAtRoot(blocks: BlockConfig[], ids: string[]): boolean {
  return ids.every((id) => blocks.some((b) => b.id === id));
}