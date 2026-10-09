"use client";

import { useEffect } from "react";
import { MousePointer2, SlidersHorizontal, PanelRightClose, AlignLeft, Palette, Type, Settings2 } from "lucide-react";
import { useEditorStore, type RightSidebarTab } from "@/components/openpage/store/editorStore";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { findBlock, findBlockLocation } from "@/lib/openpage/block-tree";
import { PropertiesPanel } from './PropertiesPanel'
import { StylePanel } from './StylePanel'
import { TypographyPanel } from './TypographyPanel'
import { AdvancedPanel } from './AdvancedPanel'
import { ElementStylePanel } from './ElementStylePanel'

const tabs: { id: RightSidebarTab; label: string; icon: typeof AlignLeft; color: string }[] = [
  { id: 'properties', label: 'Content', icon: AlignLeft, color: "#38bdf8" },
  { id: 'style', label: 'Style', icon: Palette, color: "#e879f9" },
  { id: 'typography', label: 'Type', icon: Type, color: "#f59e0b" },
  { id: 'element', label: 'Element', icon: MousePointer2, color: "#22d3ee" },
  { id: 'advanced', label: 'More', icon: Settings2, color: "#a78bfa" },
]

function blockLabel(type: string): string {
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

  // Switching blocks should land on Content, but keep the Element tab while the
  // user is working inside an element of the block they just selected.
  useEffect(() => {
    if (selectedElementId) return
    if (selectedBlock) setRightSidebarTab('properties')
  }, [selectedBlock?.id, selectedElementId]) // eslint-disable-line react-hooks/exhaustive-deps

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
              <span className="text-[12px] font-medium text-text-1 truncate">{blockLabel(selectedBlock.type)}</span>
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

      {/* Icon tabs */}
      <div className="px-3 pb-3 border-b border-border-default shrink-0">
        <div className="grid grid-cols-5 gap-0.5 p-0.5 rounded-lg bg-bg-3" role="tablist" aria-label="Inspector sections">
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = rightSidebarTab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setRightSidebarTab(id)}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors duration-150 ${
                  isActive ? 'bg-bg-1 text-[#6d5dfc] shadow-[0_1px_3px_rgba(15,23,42,0.1)]' : 'text-text-2 hover:text-text-0'
                }`}
                title={label}
              >
                <Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="text-[10px] font-semibold leading-none">{label}</span>
              </button>
            )
          })}
        </div>
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
            <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#6d5dfc]/10 flex items-center justify-center">
                <MousePointer2 size={18} className="text-[#6d5dfc]" />
              </div>
              <div>
                <p className="text-text-1 text-[12px] font-medium">No element selected</p>
                <p className="text-text-3 text-[11px] mt-1">
                  Click any element on the canvas — a heading, paragraph, button, image or list card — to style it
                  independently of the section.
                </p>
              </div>
            </div>
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