"use client";

import { create } from 'zustand'
import { produce } from 'immer'
import type { BlockConfig, BlockStyle, SiteConfig, ThemeConfig, PageConfig, GlobalWidget } from "@/components/openpage/blocks/types";
import {
  findBlockLocation,
  findColumnList,
  findSectionBlock,
  deepCloneWithFreshIds,
  ensureColumn,
  insertBlock,
  extractBlock,
  clampIndex,
  moveBlockGroup,
  type BlockInsertTarget,
} from "@/lib/openpage/block-tree";
import { ITEM_ID_KEY } from "@/components/openpage/blocks/types";
import type { Device } from "@/lib/openpage/types";
import { newElementId, migrateBlocksListIds, ancestorItemIds, itemAt, listElementId, resolveList, type ListRef } from "@/lib/openpage/element-style";

export type { ListRef };

function ensurePages(config: SiteConfig): PageConfig[] {
  if (config.pages && config.pages.length > 0) return config.pages
  return [{ id: 'page-home', name: 'Home', path: '/', blocks: config.blocks }]
}

function getPageBlocks(config: SiteConfig, pageId: string): BlockConfig[] {
  const pages = ensurePages(config)
  const page = pages.find((p) => p.id === pageId)
  return page?.blocks ?? pages[0]?.blocks ?? []
}

interface UndoEntry {
  pages?: PageConfig[]
  blocks: BlockConfig[]
  theme?: Partial<ThemeConfig>
  globalWidgets?: GlobalWidget[]
  forms?: SiteConfig["forms"]
  label: string
  timestamp: number
}

interface ConfigState {
  config: SiteConfig
  activePageId: string
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  setConfig: (config: SiteConfig) => void
  setActivePage: (id: string) => void
  getActivePageBlocks: () => BlockConfig[]
  updateBlock: (id: string, updates: Partial<BlockConfig>) => void
  updateBlockProps: (id: string, props: Record<string, unknown>) => void
  updateBlockStyle: (id: string, style: Partial<BlockStyle>) => void
  /* ---- Per-element styling (ElementStyleMap) ---- */
  setElementStyle: (blockId: string, elementId: string, style: Partial<BlockStyle>, device: Device) => void
  resetElementStyle: (blockId: string, elementId: string, device?: Device) => void
  clearElementSelectionStyle: (blockId: string, elementIds: string[]) => void
  /* ---- Dynamic list operations ---- */
  updateListItem: (blockId: string, ref: ListRef, itemId: string, patch: Record<string, unknown>) => void
  addListItem: (blockId: string, ref: ListRef, template?: Record<string, unknown>, index?: number) => string | null
  duplicateListItem: (blockId: string, ref: ListRef, itemId: string) => string | null
  removeListItem: (blockId: string, ref: ListRef, itemId: string, itemIndex?: number) => void
  moveListItem: (blockId: string, ref: ListRef, from: number, to: number) => void
  setListItemHidden: (blockId: string, ref: ListRef, itemId: string, hidden: boolean) => void
  /** Look up the live list for a {@link ListRef} without mutating anything. */
  readList: (blockId: string, ref: ListRef) => Array<Record<string, unknown>>
  addBlock: (block: BlockConfig, index?: number) => void
  removeBlock: (id: string) => void
  duplicateBlock: (id: string) => void
  moveBlock: (fromIndex: number, toIndex: number) => void
  moveBlockToIndex: (blockId: string, toIndex: number) => void
  /** Elementor-style group move: relocate all root-level `ids` together in one undo entry. */
  moveBlocks: (ids: string[], toIndex: number) => void
  addBlockToColumn: (sectionBlockId: string, colIndex: number, block: BlockConfig, index?: number) => void
  removeBlockFromColumn: (sectionBlockId: string, colIndex: number, blockId: string) => void
  moveBlockInColumn: (sectionBlockId: string, colIndex: number, fromIndex: number, toIndex: number) => void
  duplicateBlockInColumn: (sectionBlockId: string, colIndex: number, blockId: string) => void
  updateColumnWidth: (sectionBlockId: string, colIndex: number, width: number) => void
  addColumn: (sectionBlockId: string) => void
  removeColumn: (sectionBlockId: string, colIndex: number) => void
  addPage: (name: string, path: string) => string
  removePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  setTheme: (theme: Partial<ThemeConfig>) => void
  updateTheme: (partial: Partial<ThemeConfig>) => void
  previewTheme: (partial: Partial<ThemeConfig>) => void
  patchSite: (partial: Partial<SiteConfig>) => void
  addGlobalWidget: (widget: GlobalWidget) => void
  removeGlobalWidget: (id: string) => void
  updateGlobalWidget: (id: string, updates: Partial<GlobalWidget>) => void
  insertGlobalWidget: (globalWidgetId: string, index?: number) => void
  duplicateBlocks: (ids: string[]) => void
  removeBlocks: (ids: string[]) => void
  /** Move a block between any two containers (root ↔ column) with a single undo entry. */
  moveBlockTo: (blockId: string, target: BlockInsertTarget) => void
  /** Copy a block (deep, fresh ids) and insert it next to the source */
  copyBlockNextTo: (blockId: string) => string | null
  /** Insert a deep-cloned block at an exact target */
  pasteBlockAt: (target: BlockInsertTarget, block: BlockConfig) => string
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

const defaultBlocks: BlockConfig[] = [
  {
    id: 'block-navbar',
    type: 'navbar',
    variant: 'default',
    props: {
      logo: 'Acme Inc',
      ctaText: 'Get Started',
      ctaId: 'enquire',
      menuItems: [
        { label: 'Features', id: 'features' },
        { label: 'Pricing', id: 'pricing' },
        { label: 'About', id: 'about' },
        { label: 'Contact', id: 'enquire' },
      ],
      links: ['Features', 'Pricing', 'About', 'Contact'],
    },
  },
  {
    id: 'block-hero',
    type: 'hero',
    variant: 'centered',
    props: {
      badge: 'Now in Beta',
      headline: 'Build websites with JSON',
      subheadline: 'The visual editor that agents and humans both understand. Structured config, beautiful output.',
      primaryCta: 'Start Building',
      secondaryCta: 'View Demo',
    },
  },
  {
    id: 'block-features',
    type: 'features',
    variant: 'grid',
    props: {
      label: 'Features',
      title: 'Everything you need',
      subtitle: 'Powerful building blocks for your next website',
      items: [
        { icon: 'Blocks', title: 'Visual Editor', description: 'Drag and drop blocks to build your layout' },
        { icon: 'Code', title: 'JSON Config', description: 'Every change is a clean JSON mutation' },
        { icon: 'Bot', title: 'Agent Ready', description: 'AI agents can read and write your config' },
      ],
    },
  },
  {
    id: 'block-cta',
    type: 'cta',
    variant: 'simple',
    props: {
      headline: 'Ready to get started?',
      subheadline: 'Create your first site in minutes.',
      buttonText: 'Start Free',
    },
  },
  {
    id: 'block-footer',
    type: 'footer',
    variant: 'simple',
    props: {
      logo: 'OpenPage',
      copyright: '2026 OpenPage. All rights reserved.',
      links: ['Privacy', 'Terms', 'Contact'],
    },
  },
]

export const defaultConfig: SiteConfig = {
  engine: 'openpage',
  name: 'My Website',
  pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: defaultBlocks }],
  blocks: defaultBlocks,
  globalWidgets: [],
}

function snapshot(state: ConfigState): { pages?: PageConfig[]; blocks: BlockConfig[]; theme?: Partial<ThemeConfig>; globalWidgets?: GlobalWidget[]; forms?: SiteConfig["forms"] } {
  return {
    pages: state.config.pages ? JSON.parse(JSON.stringify(state.config.pages)) : undefined,
    blocks: JSON.parse(JSON.stringify(state.config.blocks)),
    theme: state.config.theme ? JSON.parse(JSON.stringify(state.config.theme)) : undefined,
    globalWidgets: state.config.globalWidgets ? JSON.parse(JSON.stringify(state.config.globalWidgets)) : undefined,
    forms: state.config.forms ? JSON.parse(JSON.stringify(state.config.forms)) : undefined,
  }
}

const MAX_UNDO = 100

function pushUndo(state: ConfigState, label: string): Partial<ConfigState> {
  const snap = snapshot(state)
  return {
    undoStack: [...state.undoStack, { ...snap, label, timestamp: Date.now() }].slice(-MAX_UNDO),
    redoStack: [],
  }
}

function withPages(config: SiteConfig): SiteConfig {
  const pages = ensurePages(config)
  return { ...config, pages }
}

/* -------------------------------------------------------------------------- */
/*            Dynamic list addressing (shared by list mutations)              */
/* -------------------------------------------------------------------------- */

/** Resolve the array a {@link ListRef} points at inside a mutable props object. */
const resolveListRef = resolveList;

/** Assign a fresh `_id` to a list item, and to any lists nested inside it. */
function withFreshItemId<T extends Record<string, unknown>>(item: T): T {
  const next: Record<string, unknown> = { ...item, [ITEM_ID_KEY]: newElementId("it") };
  for (const [key, value] of Object.entries(next)) {
    if (key === ITEM_ID_KEY || !Array.isArray(value)) continue;
    next[key] = (value as Array<Record<string, unknown>>).map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry) ? withFreshItemId(entry) : entry,
    );
  }
  return next as T;
}

/**
 * Shape for a newly added item: mirror the most recent existing item so the
 * form shows the same fields, but with blank content.
 */
function lastItemTemplate(
  list: Array<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const source = list[list.length - 1] ?? list[0]
  if (!source) return undefined
  const template: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === ITEM_ID_KEY) continue
    if (Array.isArray(value)) {
      // Nested lists stay empty; the editor offers explicit "add" affordances.
      template[key] = []
    } else if (value === null) {
      template[key] = ""
    } else {
      template[key] = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? ""
        : value
    }
  }
  return template
}

/** Drop element styles belonging to a deleted list item (and its children). */
function pruneStylesForBlock(block: BlockConfig, ref: ListRef, itemId: string): void {
  if (!block.elementStyles) return
  const elementId = listElementId(ref, itemId)
  const next: Record<string, BlockStyle> = {}
  for (const [id, style] of Object.entries(block.elementStyles)) {
    if (id === elementId || id.startsWith(`${elementId}/`)) continue
    next[id] = style
  }
  block.elementStyles = next
}

function mutateActivePageBlocks(
  config: SiteConfig,
  activePageId: string,
  mutator: (blocks: BlockConfig[]) => BlockConfig[],
): SiteConfig {
  const pages = ensurePages(config)
  const newPages = pages.map((p) =>
    p.id === activePageId ? { ...p, blocks: mutator([...p.blocks]) } : p,
  )
  const activeBlocks = newPages.find((p) => p.id === activePageId)?.blocks ?? []
  return { ...config, pages: newPages, blocks: activeBlocks }
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
      config: defaultConfig,
      activePageId: 'page-home',
      undoStack: [],
      redoStack: [],

      setConfig: (config) => {
        // Backfill stable ids so every dynamic list item can own its styles.
        const pages = ensurePages(config).map((page) => ({
          ...page,
          blocks: migrateBlocksListIds(page.blocks),
        }))
        set({ config: { ...config, pages }, activePageId: pages[0]?.id ?? 'page-home', undoStack: [], redoStack: [] })
      },

      setActivePage: (id) => set({ activePageId: id }),

      getActivePageBlocks: () => {
        const state = get()
        return getPageBlocks(state.config, state.activePageId)
      },

      updateBlock: (id, updates) =>
        set((state) => ({
          ...pushUndo(state, 'Update block'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, id)
            const block = located ? located.parentList[located.index] : undefined
            if (block) Object.assign(block, updates)
            draft.blocks = page.blocks
          }),
        })),

      updateBlockProps: (id, props) =>
        set((state) => ({
          ...pushUndo(state, 'Update properties'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, id)
            const block = located ? located.parentList[located.index] : undefined
            if (block) Object.assign(block.props, props)
            draft.blocks = page.blocks
          }),
        })),

      updateBlockStyle: (id, style) =>
        set((state) => ({
          ...pushUndo(state, 'Update style'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, id)
            const block = located ? located.parentList[located.index] : undefined
            if (block) {
              if (!block.style) block.style = {}
              Object.assign(block.style, style)
            }
            draft.blocks = page.blocks
          }),
        })),

      /* ------------------------------------------------------------------ */
      /*                Per-element styling (ElementStyleMap)                */
      /* ------------------------------------------------------------------ */

      setElementStyle: (blockId, elementId, style, device) =>
        set((state) => ({
          ...pushUndo(state, 'Update element style'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block) return

            // Desktop owns the style root; tablet/mobile are overrides that are
            // merged at render time, so editing one never leaks into another.
            const container: BlockStyle =
              device === "desktop"
                ? (block.elementStyles?.[elementId] ?? ({} as BlockStyle))
                : { ...(block.elementStyles?.[elementId] ?? ({} as BlockStyle)) };

            if (device === "desktop") {
              Object.assign(container, style)
              delete container.responsive
            } else {
              const responsive = { ...(container.responsive || {}) }
              const overrides: Partial<BlockStyle> = { ...(responsive[device] || {}) }
              for (const [key, value] of Object.entries(style)) {
                if (value === undefined) delete (overrides as Record<string, unknown>)[key]
                else (overrides as Record<string, unknown>)[key] = value
              }
              responsive[device] = overrides
              container.responsive = responsive
            }

            block.elementStyles = { ...(block.elementStyles || {}), [elementId]: container }
            draft.blocks = page.blocks
          }),
        })),

      resetElementStyle: (blockId, elementId, device) =>
        set((state) => ({
          ...pushUndo(state, 'Reset element style'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block?.elementStyles?.[elementId]) return

            if (!device || device === "desktop") {
              delete block.elementStyles[elementId]
            } else {
              const container = { ...block.elementStyles[elementId] }
              const responsive = { ...(container.responsive || {}) }
              delete responsive[device]
              if (Object.keys(responsive).length) container.responsive = responsive
              else delete container.responsive
              if (Object.keys(container).length) block.elementStyles[elementId] = container
              else delete block.elementStyles[elementId]
            }
            draft.blocks = page.blocks
          }),
        })),

      clearElementSelectionStyle: (blockId, elementIds) =>
        set((state) => ({
          ...pushUndo(state, 'Reset element styles'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block?.elementStyles) return
            const next = { ...block.elementStyles }
            for (const id of elementIds) delete next[id]
            block.elementStyles = next
            draft.blocks = page.blocks
          }),
        })),

      /* ------------------------------------------------------------------ */
      /*                     Dynamic list operations                          */
      /* ------------------------------------------------------------------ */

      updateListItem: (blockId, ref, itemId, patch) =>
        set((state) => ({
          ...pushUndo(state, 'Update item'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block) return
            const list = resolveListRef(block.props as Record<string, unknown>, ref)
            const item = itemAt(list, itemId)
            if (!item) return
            for (const [key, value] of Object.entries(patch)) {
              if (value === undefined) delete item[key]
              else item[key] = value
            }
            draft.blocks = page.blocks
          }),
        })),

      addListItem: (blockId, ref, template, index) => {
        const newId = newElementId("it")
        set((state) => ({
          ...pushUndo(state, 'Add item'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block) return
            const props = block.props as Record<string, unknown>
            let list = resolveListRef(props, ref)

            if (!list) {
              // First item: create the missing list at the requested location by
              // walking down through the ancestor items, creating keys as needed.
              const ancestors = ancestorItemIds(ref);
              let container: Record<string, unknown> = props;
              for (let i = 0; i < ancestors.length && i < ref.path.length - 1; i++) {
                const parentList = container[ref.path[i]];
                if (!Array.isArray(parentList)) return;
                const parent = itemAt(parentList, ancestors[i]);
                if (!parent) return;
                container = parent;
              }
              const key = ref.path[ref.path.length - 1];
              if (!key) return;
              container[key] = [];
              list = container[key] as Array<Record<string, unknown>>;
            }

            const source = template ?? lastItemTemplate(list)
            const item = withFreshItemId({ ...(source as Record<string, unknown>), [ITEM_ID_KEY]: newId })
            const at = index === undefined ? list.length : clampIndex(index, list.length)
            list.splice(at, 0, item)
            draft.blocks = page.blocks
          }),
        }))
        return newId
      },

      duplicateListItem: (blockId, ref, itemId) => {
        const newId = newElementId("it")
        set((state) => ({
          ...pushUndo(state, 'Duplicate item'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block) return
            const list = resolveListRef(block.props as Record<string, unknown>, ref)
            if (!list) return
            const index = list.findIndex((entry) => entry[ITEM_ID_KEY] === itemId)
            if (index === -1) return
            const clone = withFreshItemId(list[index])
            list.splice(index + 1, 0, clone)
            draft.blocks = page.blocks
          }),
        }))
        return newId
      },

      removeListItem: (blockId, ref, itemId, itemIndex?: number) =>
        set((state) => ({
          ...pushUndo(state, 'Remove item'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block) return
            const list = resolveListRef(block.props as Record<string, unknown>, ref)
            if (!list) return
            let index = -1
            if (itemId) {
              index = list.findIndex((entry) => entry[ITEM_ID_KEY] === itemId)
            }
            if (index === -1 && typeof itemIndex === 'number' && itemIndex >= 0 && itemIndex < list.length) {
              index = itemIndex
            }
            if (index === -1) return
            list.splice(index, 1)
            pruneStylesForBlock(block, ref, itemId)
            draft.blocks = page.blocks
          }),
        })),

      moveListItem: (blockId, ref, from, to) =>
        set((state) => ({
          ...pushUndo(state, 'Reorder items'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block) return
            const list = resolveListRef(block.props as Record<string, unknown>, ref)
            if (!list) return
            const target = clampIndex(to, list.length)
            if (from === target || from < 0 || from >= list.length) return
            const [moved] = list.splice(from, 1)
            list.splice(target, 0, moved)
            draft.blocks = page.blocks
          }),
        })),

      setListItemHidden: (blockId, ref, itemId, hidden) =>
        set((state) => ({
          ...pushUndo(state, hidden ? 'Hide item' : 'Show item'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const located = findBlockLocation(page.blocks, blockId)
            const block = located ? located.parentList[located.index] : undefined
            if (!block) return
            const list = resolveListRef(block.props as Record<string, unknown>, ref)
            const item = itemAt(list, itemId)
            if (!item) return
            if (hidden) item.hidden = true
            else delete item.hidden
            const elementId = listElementId(ref, itemId)
            const existing = block.elementStyles?.[elementId]
            if (existing) {
              const next = { ...block.elementStyles }
              if (hidden) next[elementId] = { ...existing, hidden: true }
              else {
                const { hidden: _hidden, ...rest } = existing;
                void _hidden;
                if (Object.keys(rest).length) next[elementId] = rest
                else delete next[elementId]
              }
              block.elementStyles = next
            }
            draft.blocks = page.blocks
          }),
        })),

      readList: (blockId, ref) => {
        const blocks = getPageBlocks(get().config, get().activePageId)
        const located = findBlockLocation(blocks, blockId)
        const block = located ? located.parentList[located.index] : undefined
        if (!block) return []
        return resolveListRef(block.props as Record<string, unknown>, ref) ?? []
      },

      addBlock: (block, index) =>
        set((state) => ({
          ...pushUndo(state, 'Add block'),
          config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (blocks) => {
            if (index !== undefined) {
              blocks.splice(index, 0, block)
            } else {
              blocks.push(block)
            }
            return blocks
          }),
        })),

      removeBlock: (id) =>
        set((state) => ({
          ...pushUndo(state, 'Remove block'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            extractBlock(page.blocks, id)
            draft.blocks = page.blocks
          }),
        })),

      duplicateBlock: (id) =>
        set((state) => {
          const blocks = getPageBlocks(state.config, state.activePageId)
          const located = findBlockLocation(blocks, id)
          if (!located) return state
          const clone = deepCloneWithFreshIds(located.parentList[located.index])
          return {
            ...pushUndo(state, 'Duplicate block'),
            config: produce(withPages(state.config), (draft) => {
              const page = draft.pages!.find((p) => p.id === state.activePageId)
              if (!page) return
              const loc = findBlockLocation(page.blocks, id)
              if (loc) loc.parentList.splice(loc.index + 1, 0, clone)
              draft.blocks = page.blocks
            }),
          }
        }),

      duplicateBlocks: (ids) =>
        set((state) => {
          const blocks = getPageBlocks(state.config, state.activePageId)
          const clones: BlockConfig[] = []
          for (const id of ids) {
            const original = blocks.find((b) => b.id === id)
            if (original) {
              clones.push({
                ...JSON.parse(JSON.stringify(original)),
                id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              })
            }
          }
          if (clones.length === 0) return state
          return {
            ...pushUndo(state, 'Duplicate blocks'),
            config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (b) => {
              let insertIdx = b.length
              for (const id of ids) {
                const idx = b.findIndex((bl) => bl.id === id)
                if (idx > insertIdx) insertIdx = idx
              }
              b.splice(insertIdx + 1, 0, ...clones)
              return b
            }),
          }
        }),

      removeBlocks: (ids) =>
        set((state) => ({
          ...pushUndo(state, 'Remove blocks'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            for (const id of ids) {
              extractBlock(page.blocks, id)
            }
            draft.blocks = page.blocks
          }),
        })),

      moveBlock: (fromIndex, toIndex) =>
        set((state) => ({
          ...pushUndo(state, 'Move block'),
          config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (blocks) => {
            const [moved] = blocks.splice(fromIndex, 1)
            blocks.splice(toIndex, 0, moved)
            return blocks
          }),
        })),

      moveBlockToIndex: (blockId, toIndex) =>
        set((state) => {
          const blocks = getPageBlocks(state.config, state.activePageId)
          const fromIndex = blocks.findIndex((b) => b.id === blockId)
          if (fromIndex === -1 || fromIndex === toIndex) return state
          return {
            ...pushUndo(state, 'Move block'),
            config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (b) => {
              const [moved] = b.splice(fromIndex, 1)
              b.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved)
              return b
            }),
          }
        }),

      moveBlocks: (ids, toIndex) =>
        set((state) => {
          const source = getPageBlocks(state.config, state.activePageId)
          const next = moveBlockGroup(source, ids, toIndex)
          if (next === source) return state
          return {
            ...pushUndo(state, 'Move blocks'),
            config: mutateActivePageBlocks(withPages(state.config), state.activePageId, () => next),
          }
        }),

      addBlockToColumn: (sectionBlockId, colIndex, block, index) =>
        set((state) => ({
          ...pushUndo(state, 'Add block to column'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const section = findSectionBlock(page.blocks, sectionBlockId)
            if (!section || section.type !== 'columns') return
            ensureColumn(section, colIndex)
            const cols = section.props.columns as Array<{ width: number; blocks: BlockConfig[] }>
            const clean = cols[colIndex].blocks.filter((b) => !b.id.includes('placeholder'))
            clean.splice(clampIndex(index, clean.length), 0, block)
            cols[colIndex].blocks = clean
            draft.blocks = page.blocks
          }),
        })),

      removeBlockFromColumn: (sectionBlockId, colIndex, blockId) =>
        set((state) => ({
          ...pushUndo(state, 'Remove block from column'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const col = findColumnList(page.blocks, sectionBlockId, colIndex)
            if (!col) return
            col.list.splice(col.list.findIndex((b) => b.id === blockId), 1)
            draft.blocks = page.blocks
          }),
        })),

      moveBlockInColumn: (sectionBlockId, colIndex, fromIndex, toIndex) =>
        set((state) => ({
          ...pushUndo(state, 'Move block in column'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const col = findColumnList(page.blocks, sectionBlockId, colIndex)
            if (!col) return
            const colBlocks = col.list
            const [moved] = colBlocks.splice(fromIndex, 1)
            colBlocks.splice(toIndex, 0, moved)
            draft.blocks = page.blocks
          }),
        })),

      duplicateBlockInColumn: (sectionBlockId, colIndex, blockId) =>
        set((state) => {
          const blocks = getPageBlocks(state.config, state.activePageId)
          const located = findBlockLocation(blocks, blockId)
          if (!located) return state
          const clone = deepCloneWithFreshIds(located.parentList[located.index])
          return {
            ...pushUndo(state, 'Duplicate block in column'),
            config: produce(withPages(state.config), (draft) => {
              const page = draft.pages!.find((p) => p.id === state.activePageId)
              if (!page) return
              const col = findColumnList(page.blocks, sectionBlockId, colIndex)
              if (!col) return
              const idx = col.list.findIndex((b) => b.id === blockId)
              if (idx !== -1) col.list.splice(idx + 1, 0, clone)
              draft.blocks = page.blocks
            }),
          }
        }),

      updateColumnWidth: (sectionBlockId, colIndex, width) =>
        set((state) => ({
          ...pushUndo(state, 'Update column width'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const section = findSectionBlock(page.blocks, sectionBlockId)
            if (!section || section.type !== 'columns') return
            const cols = section.props.columns as Array<{ width: number; blocks: BlockConfig[] }> | undefined
            if (!cols || !cols[colIndex]) return
            cols[colIndex].width = width
            draft.blocks = page.blocks
          }),
        })),

      addColumn: (sectionBlockId) =>
        set((state) => ({
          ...pushUndo(state, 'Add column'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const section = findSectionBlock(page.blocks, sectionBlockId)
            if (!section || section.type !== 'columns') return
            const cols = section.props.columns as Array<{ width: number; blocks: BlockConfig[] }> | undefined
            if (!cols) return
            const newWidth = Math.floor(100 / (cols.length + 1))
            cols.forEach((c) => { c.width = newWidth })
            cols.push({ width: newWidth, blocks: [] })
            draft.blocks = page.blocks
          }),
        })),

      removeColumn: (sectionBlockId, colIndex) =>
        set((state) => ({
          ...pushUndo(state, 'Remove column'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const section = findSectionBlock(page.blocks, sectionBlockId)
            if (!section || section.type !== 'columns') return
            const cols = section.props.columns as Array<{ width: number; blocks: BlockConfig[] }> | undefined
            if (!cols || cols.length <= 1) return
            cols.splice(colIndex, 1)
            const newWidth = Math.floor(100 / cols.length)
            cols.forEach((c) => { c.width = newWidth })
            draft.blocks = page.blocks
          }),
        })),

      addPage: (name, path) => {
        const id = `page-${Date.now()}`
        set((state) => ({
          ...pushUndo(state, 'Add page'),
          config: produce(withPages(state.config), (draft) => {
            draft.pages!.push({ id, name, path, blocks: [] })
          }),
          activePageId: id,
        }))
        return id
      },

      removePage: (id) =>
        set((state) => {
          const pages = ensurePages(state.config)
          if (pages.length <= 1) return state
          const newPages = pages.filter((p) => p.id !== id)
          const newActiveId = state.activePageId === id ? newPages[0].id : state.activePageId
          return {
            ...pushUndo(state, 'Remove page'),
            config: { ...state.config, pages: newPages, blocks: newPages[0].blocks },
            activePageId: newActiveId,
          }
        }),

      renamePage: (id, name) =>
        set((state) => ({
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === id)
            if (page) page.name = name
          }),
        })),

      setTheme: (theme) =>
        set((state) => ({
          ...pushUndo(state, 'Change theme'),
          config: { ...state.config, theme },
        })),

      updateTheme: (partial) =>
        set((state) => ({
          ...pushUndo(state, 'Update theme'),
          config: { ...state.config, theme: { ...state.config.theme, ...partial } },
        })),

      previewTheme: (partial) =>
        set((state) => ({
          config: { ...state.config, theme: { ...state.config.theme, ...partial } },
        })),

      patchSite: (partial) =>
        set((state) => ({
          ...pushUndo(state, 'Update site'),
          config: { ...state.config, ...partial, pages: partial.pages ?? state.config.pages, blocks: partial.blocks ?? state.config.blocks },
        })),

      addGlobalWidget: (widget) =>
        set((state) => ({
          ...pushUndo(state, 'Add global widget'),
          config: {
            ...state.config,
            globalWidgets: [...(state.config.globalWidgets ?? []), widget],
          },
        })),

      removeGlobalWidget: (id) =>
        set((state) => ({
          ...pushUndo(state, 'Remove global widget'),
          config: {
            ...state.config,
            globalWidgets: (state.config.globalWidgets ?? []).filter((w) => w.id !== id),
          },
        })),

      updateGlobalWidget: (id, updates) =>
        set((state) => ({
          ...pushUndo(state, 'Update global widget'),
          config: produce(state.config, (draft) => {
            const widget = draft.globalWidgets?.find((w) => w.id === id)
            if (widget) Object.assign(widget, updates)
          }),
        })),

      insertGlobalWidget: (globalWidgetId, index) =>
        set((state) => {
          const gw = (state.config.globalWidgets ?? []).find((w) => w.id === globalWidgetId)
          if (!gw) return state
          const clone: BlockConfig = {
            ...JSON.parse(JSON.stringify(gw.block)),
            id: `block-${Date.now()}`,
            globalWidgetId,
          }
          return {
            ...pushUndo(state, 'Insert global widget'),
            config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (blocks) => {
              if (index !== undefined) {
                blocks.splice(index, 0, clone)
              } else {
                blocks.push(clone)
              }
              return blocks
            }),
          }
        }),

      moveBlockTo: (blockId, target) =>
        set((state) => {
          const source = state.config.pages
            ? getPageBlocks(state.config, state.activePageId)
            : state.config.blocks
          const located = findBlockLocation(source, blockId)
          if (!located) return state

          const sameListMove =
            target.kind === "column"
              ? located.sectionId === target.sectionId && located.colIndex === target.colIndex
              : located.sectionId === null

          let index = target.index
          if (index != null && sameListMove && located.index < index) {
            index = Math.max(0, index - 1)
          }
          if (sameListMove && index === located.index) return state

          return {
            ...pushUndo(state, `Move ${located.parentList[located.index].type}`),
            config: produce(withPages(state.config), (draft) => {
              const page = draft.pages!.find((p) => p.id === state.activePageId)
              if (!page) return
              const { removed } = extractBlock(page.blocks, blockId)
              if (!removed) return
              insertBlock(page.blocks, { ...target, index }, removed)
              draft.blocks = page.blocks
            }),
          }
        }),

      copyBlockNextTo: (blockId) => {
        const state = get()
        const source = getPageBlocks(state.config, state.activePageId)
        const located = findBlockLocation(source, blockId)
        if (!located) return null
        const clone = deepCloneWithFreshIds(located.parentList[located.index])
        set({
          ...pushUndo(state, 'Copy block'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const loc = findBlockLocation(page.blocks, blockId)
            if (loc) loc.parentList.splice(loc.index + 1, 0, clone)
            draft.blocks = page.blocks
          }),
        })
        return clone.id
      },

      pasteBlockAt: (target, block) => {
        const state = get()
        const clone = deepCloneWithFreshIds(block)
        set({
          ...pushUndo(state, 'Paste block'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            insertBlock(page.blocks, target, clone)
            draft.blocks = page.blocks
          }),
        })
        return clone.id
      },

      undo: () =>
        set((state) => {
          if (state.undoStack.length === 0) return state
          const prev = state.undoStack[state.undoStack.length - 1]
          const snap = snapshot(state)
          return {
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, { ...snap, label: prev.label, timestamp: Date.now() }],
            config: { ...state.config, pages: prev.pages, blocks: prev.blocks, theme: prev.theme, globalWidgets: prev.globalWidgets, forms: prev.forms },
          }
        }),

      redo: () =>
        set((state) => {
          if (state.redoStack.length === 0) return state
          const next = state.redoStack[state.redoStack.length - 1]
          const snap = snapshot(state)
          return {
            redoStack: state.redoStack.slice(0, -1),
            undoStack: [...state.undoStack, { ...snap, label: next.label, timestamp: Date.now() }],
            config: { ...state.config, pages: next.pages, blocks: next.blocks, theme: next.theme, globalWidgets: next.globalWidgets, forms: next.forms },
          }
        }),

      canUndo: () => get().undoStack.length > 0,
      canRedo: () => get().redoStack.length > 0,
}))
