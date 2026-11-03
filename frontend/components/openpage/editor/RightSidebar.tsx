"use client";

import { useState } from "react";
import { MousePointer2, SlidersHorizontal, PanelRightClose, AlignLeft, Palette, Type, Settings2, Sparkles } from "lucide-react";
import { useEditorStore, type RightSidebarTab } from "@/components/openpage/store/editorStore";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { isDivBlock } from "@/lib/openpage/block-factory";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { findBlock, findBlockLocation } from "@/lib/openpage/block-tree";
import { PropertiesPanel } from './PropertiesPanel'
import { StylePanel } from './StylePanel'
import { TypographyPanel } from './TypographyPanel'
import { AdvancedPanel } from './AdvancedPanel'
import { ElementStylePanel } from './ElementStylePanel'
import { SectionAiAssistant } from './SectionAiAssistant'

const ELEMENTOR_TABS: { id: 'properties' | 'style' | 'advanced'; label: string; icon: typeof AlignLeft; color: string }[] = [
  { id: 'properties', label: 'Content', icon: AlignLeft, color: "#38bdf8" },
  { id: 'style', label: 'Style', icon: Palette, color: "#e879f9" },
  { id: 'advanced', label: 'Advanced', icon: Settings2, color: "#a78bfa" },
]

function blockLabel(block: BlockConfig): string {
  const type = isDivBlock(block) ? "div" : block.type
  return blockMetadata.find((b) => b.type === type)?.label ?? type
}

export function RightSidebar() {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)
  const rightSidebarTab = useEditorStore((s) => s.rightSidebarTab)
  const setRightSidebarTab = useEditorStore((s) => s.setRightSidebarTab)
  const toggleRightSidebar = useEditorStore((s) => s.toggleRightSidebar)
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages
    if (!pages || pages.length === 0) return s.config.blocks
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0]
    return page.blocks
  })
  const selectedBlock = selectedBlockId ? findBlock(blocks, selectedBlockId) : undefined
  const selectedLoc = selectedBlockId ? findBlockLocation(blocks, selectedBlockId) : undefined

  const selectedElement = useEditorStore((s) => s.selectedElement)
  const selectedElementId = selectedElement?.elementId ?? null
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)
  const [styleMode, setStyleMode] = useState<'design' | 'typography'>('design')

  // Switching blocks lands on Content: handled by editorStore.selectBlock, so
  // "select this block and open Style" (toolbar buttons) is not overridden.

  return (
    <div data-tour="inspector" className="hidden md:flex w-[300px] h-full min-h-0 bg-bg-1 border-l border-border-default flex-col shrink-0 overflow-hidden">
      {/* Inspector header */}
      <div className="h-12 px-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-[#6d5dfc] flex items-center gap-1.5 shrink-0">
            <SlidersHorizontal size={14} />
            Inspector
          </span>
          {selectedBlock && (
            <>
              <span className="text-text-3">/</span>
              <span className="text-[12px] font-medium text-text-1 truncate">{blockLabel(selectedBlock)}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={toggleRightSidebar}
          className="p-1.5 rounded text-text-3 hover:text-text-1 hover:bg-bg-3 transition-colors"
          title="Collapse panel"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      {selectedBlock && (
        <div className="px-3 pb-2.5">
          <button
            type="button"
            onClick={() => setAiAssistantOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-gradient-to-r from-[#6d5dfc]/10 to-[#ec4899]/10 hover:from-[#6d5dfc]/20 hover:to-[#ec4899]/20 border border-[#6d5dfc]/30 text-[#6d5dfc] text-[11px] font-semibold transition-all shadow-2xs"
          >
            <Sparkles size={12} className="text-[#ec4899]" />
            AI Copilot (Rewrite / Tone)
          </button>
        </div>
      )}

      {selectedBlock && (
        <SectionAiAssistant
          block={selectedBlock}
          open={aiAssistantOpen}
          onClose={() => setAiAssistantOpen(false)}
        />
      )}

      {/* Elementor 3-Tab Header (Content | Style | Advanced) */}
      <div className="px-3 pb-2.5 border-b border-border-default shrink-0 space-y-2">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-bg-3" role="tablist" aria-label="Elementor sections">
          {ELEMENTOR_TABS.map(({ id, label, icon: Icon, color }) => {
            const isActive =
              id === 'style'
                ? rightSidebarTab === 'style' || rightSidebarTab === 'typography' || rightSidebarTab === 'element'
                : rightSidebarTab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (id === 'style') {
                    if (selectedElementId) {
                      setRightSidebarTab('element')
                    } else if (styleMode === 'typography') {
                      setRightSidebarTab('typography')
                    } else {
                      setRightSidebarTab('style')
                    }
                  } else {
                    setRightSidebarTab(id)
                  }
                }}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-bg-1 text-text-0 shadow-[0_1px_4px_rgba(0,0,0,0.12)]'
                    : 'text-text-3 hover:text-text-1 hover:bg-bg-2'
                }`}
                title={label}
              >
                <Icon size={13} style={{ color: isActive ? color : undefined }} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        {/* Element Selection Pill */}
        {selectedElementId && (
          <div className="flex items-center justify-between px-2.5 py-1 rounded-md bg-[#22d3ee]/10 border border-[#22d3ee]/30 text-[11px]">
            <div className="flex items-center gap-1 text-[#22d3ee] font-medium truncate">
              <MousePointer2 size={11} className="shrink-0" />
              <span className="truncate">Element: <code>{selectedElementId}</code></span>
            </div>
            <button
              type="button"
              onClick={() => useEditorStore.getState().selectBlock(selectedBlockId)}
              className="text-text-3 hover:text-text-1 text-[10px] ml-2 hover:underline"
              title="Return to section styles"
            >
              ✕ Section
            </button>
          </div>
        )}

        {/* Style Sub-Tabs (Design & Box Model vs Typography) */}
        {(rightSidebarTab === 'style' || rightSidebarTab === 'typography') && !selectedElementId && (
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-bg-2 border border-border-default">
            <button
              type="button"
              onClick={() => {
                setStyleMode('design')
                setRightSidebarTab('style')
              }}
              className={`py-1 text-[10.5px] font-medium rounded flex items-center justify-center gap-1 transition-all ${
                styleMode === 'design' && rightSidebarTab === 'style'
                  ? 'bg-bg-1 text-[#e879f9] font-semibold shadow-xs'
                  : 'text-text-3 hover:text-text-1'
              }`}
            >
              <Palette size={11} />
              Design &amp; Spacing
            </button>
            <button
              type="button"
              onClick={() => {
                setStyleMode('typography')
                setRightSidebarTab('typography')
              }}
              className={`py-1 text-[10.5px] font-medium rounded flex items-center justify-center gap-1 transition-all ${
                styleMode === 'typography' || rightSidebarTab === 'typography'
                  ? 'bg-bg-1 text-[#f59e0b] font-semibold shadow-xs'
                  : 'text-text-3 hover:text-text-1'
              }`}
            >
              <Type size={11} />
              Typography
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {!selectedBlock ? (
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#6d5dfc]/10 flex items-center justify-center">
              <MousePointer2 size={18} className="text-[#6d5dfc]" />
            </div>
            <div>
              <p className="text-text-1 text-[12px] font-medium">Click a block to edit</p>
              <p className="text-text-3 text-[11px] mt-1">Select any block on the canvas to edit its content, style and layout here</p>
            </div>
          </div>
        ) : rightSidebarTab === 'style' ? (
          <StylePanel block={selectedBlock} />
        ) : rightSidebarTab === 'typography' ? (
          <TypographyPanel block={selectedBlock} />
        ) : rightSidebarTab === 'element' ? (
          selectedElementId ? (
            <ElementStylePanel block={selectedBlock} elementId={selectedElementId} />
          ) : (
            <StylePanel block={selectedBlock} />
          )
        ) : rightSidebarTab === 'advanced' ? (
          <AdvancedPanel block={selectedBlock} />
        ) : (
          <>
            <PropertiesPanel block={selectedBlock} />
            <div className="mt-auto px-3.5 py-2.5 font-mono text-[10.5px] text-text-3 break-all border-t border-border-subtle">
              {selectedLoc?.sectionId
                ? `columns[${selectedLoc.colIndex ?? 0}].blocks[${selectedLoc.index}]`
                : `config.blocks[${selectedLoc?.index ?? blocks.indexOf(selectedBlock)}]`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}