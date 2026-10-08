"use client";

import { create } from "zustand";
import type { BlockStyle, BlockType, BlockConfig } from "@/components/openpage/blocks/types";

export type Viewport = 'desktop' | 'tablet' | 'mobile'

export type RightSidebarTab = 'properties' | 'style' | 'typography' | 'advanced' | 'element'

/** Tabs of the left builder rail — shared so shortcuts and the command palette can drive it. */
export type LeftTab = 'templates' | 'components' | 'globals' | 'layers' | 'forms'

/** The individually-editable node currently being styled, if any. */
export interface SelectedElement {
  blockId: string
  elementId: string
}

export interface DraggedItemInfo {
  kind: 'block' | 'preset' | 'global'
  type?: BlockType
  presetId?: string
  globalWidgetId?: string
  label?: string
}

interface EditorState {
  selectedBlockId: string | null
  selectedBlockIds: string[]
  selectedElement: SelectedElement | null
  viewport: Viewport
  jsonDrawerOpen: boolean
  historyOpen: boolean
  shortcutsModalOpen: boolean
  previewMode: boolean
  activeProjectId: string | null
  rightSidebarTab: RightSidebarTab
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  clipboardStyle: Partial<BlockStyle> | null
  clipboardProps: Record<string, unknown> | null
  clipboardBlock: BlockConfig | null
  navigatorExpanded: Record<string, boolean>
  insertIndex: number | null
  isDragging: boolean
  draggedItem: DraggedItemInfo | null
  leftTab: LeftTab
  isGenerating: boolean
  generationPrompt: string | null
  generationError: string | null
  showGrid: boolean
  spotlightOpen: boolean
  toggleShowGrid: () => void
  toggleSpotlight: () => void
  selectBlock: (id: string | null) => void
  selectElement: (blockId: string, elementId: string) => void
  clearElementSelection: () => void
  toggleBlockSelection: (id: string) => void
  selectMultipleBlocks: (ids: string[]) => void
  clearSelection: () => void
  setViewport: (vp: Viewport) => void
  toggleJsonDrawer: () => void
  toggleHistory: () => void
  toggleShortcutsModal: () => void
  togglePreview: () => void
  setActiveProject: (id: string | null) => void
  setRightSidebarTab: (tab: RightSidebarTab) => void
  setLeftTab: (tab: LeftTab) => void
  openLeftTab: (tab: LeftTab) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  openLeftSidebar: () => void
  openRightSidebar: () => void
  setClipboardStyle: (style: Partial<BlockStyle> | null) => void
  setClipboardProps: (props: Record<string, unknown> | null) => void
  setClipboardBlock: (block: BlockConfig | null) => void
  toggleNavigatorExpand: (id: string) => void
  setInsertIndex: (index: number | null) => void
  setIsDragging: (dragging: boolean) => void
  setDraggedItem: (item: DraggedItemInfo | null) => void
  setGenerating: (prompt: string | null) => void
  setGenerationError: (err: string | null) => void
  clearGeneration: () => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  selectedBlockId: null,
  selectedBlockIds: [],
  selectedElement: null,
  viewport: 'desktop',
  jsonDrawerOpen: false,
  historyOpen: false,
  shortcutsModalOpen: false,
  previewMode: false,
  activeProjectId: null,
  rightSidebarTab: 'properties',
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  clipboardStyle: null,
  clipboardProps: null,
  clipboardBlock: null,
  navigatorExpanded: {},
  insertIndex: null,
  isDragging: false,
  draggedItem: null,
  leftTab: 'components',
  isGenerating: false,
  generationPrompt: null,
  generationError: null,
  selectBlock: (id) => set({ selectedBlockId: id, selectedBlockIds: id ? [id] : [], selectedElement: null }),
  selectElement: (blockId, elementId) =>
    set({ selectedBlockId: blockId, selectedBlockIds: [blockId], selectedElement: { blockId, elementId }, rightSidebarTab: 'element' }),
  clearElementSelection: () => set({ selectedElement: null }),
  toggleBlockSelection: (id) => set((s) => {
    const ids = s.selectedBlockIds.includes(id)
      ? s.selectedBlockIds.filter((i) => i !== id)
      : [...s.selectedBlockIds, id]
    return { selectedBlockIds: ids, selectedBlockId: ids.length === 1 ? ids[0] : ids.length === 0 ? null : s.selectedBlockId }
  }),
  selectMultipleBlocks: (ids) => set({ selectedBlockIds: ids, selectedBlockId: ids.length === 1 ? ids[0] : null, selectedElement: null }),
  clearSelection: () => set({ selectedBlockId: null, selectedBlockIds: [], selectedElement: null }),
  setViewport: (vp) => set({ viewport: vp }),
  toggleJsonDrawer: () => set((s) => ({ jsonDrawerOpen: !s.jsonDrawerOpen })),
  toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),
  toggleShortcutsModal: () => set((s) => ({ shortcutsModalOpen: !s.shortcutsModalOpen })),
  togglePreview: () => set((s) => ({ previewMode: !s.previewMode, ...(!s.previewMode ? { selectedBlockId: null, selectedBlockIds: [], selectedElement: null } : {}) })),
  setActiveProject: (id) => set({ activeProjectId: id }),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  openLeftSidebar: () => set({ leftSidebarOpen: true }),
  openRightSidebar: () => set({ rightSidebarOpen: true }),
  setClipboardStyle: (style) => set({ clipboardStyle: style }),
  setClipboardProps: (props) => set({ clipboardProps: props }),
  setClipboardBlock: (block) => set({ clipboardBlock: block }),
  toggleNavigatorExpand: (id) => set((s) => ({
    navigatorExpanded: { ...s.navigatorExpanded, [id]: !s.navigatorExpanded[id] },
  })),
  setInsertIndex: (index) => set({ insertIndex: index }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),
  setDraggedItem: (item) => set({ draggedItem: item }),
  setLeftTab: (tab) => set({ leftTab: tab }),
  openLeftTab: (tab) => set({ leftTab: tab, leftSidebarOpen: true }),
  setGenerating: (prompt) => set({ isGenerating: !!prompt, generationPrompt: prompt, generationError: null }),
  setGenerationError: (err) => set({ generationError: err }),
  clearGeneration: () => set({ isGenerating: false, generationPrompt: null }),
  showGrid: false,
  spotlightOpen: false,
  toggleShowGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSpotlight: () => set((s) => ({ spotlightOpen: !s.spotlightOpen })),
}))
