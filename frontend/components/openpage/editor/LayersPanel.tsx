"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Layout, Grid3X3, DollarSign, Megaphone, PanelBottom,
  MessageSquare, HelpCircle, Image,
  Copy, Trash2, GripVertical, Plus, Search, Minus, Flag,
  ImageIcon, Play, GalleryHorizontalEnd, Eye, EyeOff,
  Building2, MapPin, Home, Trees, FileText, Download, Mail, Save, Layers,
  ChevronDown, ChevronRight, Type, Box, Code2,
  LayoutTemplate, Blocks, Globe, PanelLeftClose, X, ClipboardList,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import {
  SECTION_PRESET_CATEGORIES,
  SECTION_PRESETS,
  createBlockFromPreset,
  type SectionPresetCategory,
} from "@/lib/openpage/section-presets";
import type { BlockType, BlockConfig } from "@/components/openpage/blocks/types";
import { EMPTY_GLOBAL_WIDGETS } from "./AdvancedPanel";
import { FormBuilder } from "./FormBuilder";

const blockIcons: Partial<Record<BlockType, typeof Layout>> = {
  navbar: Layout,
  footer: PanelBottom,
  "project-banner": Home,
  "property-details": Grid3X3,
  "project-overview": FileText,
  "unit-config": Building2,
  amenities: Trees,
  gallery: GalleryHorizontalEnd,
  location: MapPin,
  "floor-plans": Image,
  "re-pricing": DollarSign,
  features: Grid3X3,
  testimonials: MessageSquare,
  faq: HelpCircle,
  "lead-form": Mail,
  "download-brochure": Download,
  "site-visit": Home,
  contact: Mail,
  newsletter: Mail,
  cta: Megaphone,
  image: ImageIcon,
  video: Play,
  banner: Flag,
  divider: Minus,
  developer: Building2,
  offers: Flag,
  "custom-section": FileText,
  heading: Type,
  text: Type,
  button: Megaphone,
  icon: Flag,
  "icon-box": Grid3X3,
  "image-box": ImageIcon,
  columns: Box,
  spacer: Minus,
  "html-code": Code2,
  "property-search": Search,
  "property-filters": Grid3X3,
  "emi-calculator": DollarSign,
  "payment-plan": DollarSign,
  team: Building2,
}

const PICKER_GROUPS: { id: string; title: string; defaultOpen: boolean; types: BlockType[] }[] = [
  {
    id: "core",
    title: "Core",
    defaultOpen: true,
    types: ["columns", "heading", "text", "image", "video", "button", "icon", "icon-box", "divider", "spacer", "location", "html-code"],
  },
  {
    id: "re",
    title: "Real Estate",
    defaultOpen: true,
    types: ["project-banner", "project-overview", "property-details", "unit-config", "amenities", "floor-plans", "gallery", "location", "re-pricing", "developer", "testimonials", "lead-form", "download-brochure", "site-visit", "contact", "newsletter", "cta"],
  },
  {
    id: "layout",
    title: "Layout",
    defaultOpen: false,
    types: ["columns", "spacer", "divider", "banner"],
  },
  {
    id: "content",
    title: "Content",
    defaultOpen: false,
    types: ["heading", "text", "features", "faq", "cta", "custom-section"],
  },
  {
    id: "media",
    title: "Media",
    defaultOpen: false,
    types: ["image", "video", "gallery", "image-box"],
  },
  {
    id: "forms",
    title: "Lead & Forms",
    defaultOpen: true,
    types: ["lead-form", "site-visit", "contact", "newsletter", "download-brochure", "cta", "button"],
  },
  {
    id: "chrome",
    title: "Header / Footer",
    defaultOpen: false,
    types: ["navbar", "footer"],
  },
]

const GRID_LABELS: Partial<Record<BlockType, string>> = {
  columns: "Container",
  heading: "Heading",
  text: "Text Editor",
  image: "Image",
  video: "Video",
  button: "Button",
  icon: "Icon",
  "icon-box": "Icon Box",
  divider: "Divider",
  spacer: "Spacer",
  location: "Google Maps",
  "html-code": "HTML",
  "project-banner": "Hero / Banner",
  "unit-config": "Property Listing",
  "image-box": "Property Card",
  "property-search": "Search Form",
  amenities: "Amenities",
  "floor-plans": "Floor Plan",
  gallery: "Gallery",
  testimonials: "Testimonial",
  "lead-form": "Contact Form",
}

const blockLabels: Partial<Record<BlockType, string>> = {
  navbar: 'Header',
  footer: 'Footer',
  'project-banner': 'Hero',
  'property-details': 'Highlights',
  'project-overview': 'About',
  'unit-config': 'Unit types',
  amenities: 'Amenities',
  gallery: 'Gallery',
  location: 'Location',
  'floor-plans': 'Floor plans',
  're-pricing': 'Pricing',
  features: 'Why choose us',
  testimonials: 'Testimonials',
  faq: 'FAQ',
  'lead-form': 'Enquiry form',
  'download-brochure': 'Brochure',
  cta: 'Final CTA',
  image: 'Image',
  video: 'Video',
  banner: 'Announcement',
  divider: 'Divider',
  developer: 'Developer',
  offers: 'Offers',
  'custom-section': 'Custom',
  heading: 'Heading',
  text: 'Text',
  button: 'Button',
  icon: 'Icon',
  'icon-box': 'Icon box',
  'image-box': 'Image box',
  columns: 'Columns',
  spacer: 'Spacer',
  'html-code': 'HTML',
  'property-search': 'Search',
  'property-filters': 'Filters',
  'emi-calculator': 'EMI calculator',
  'payment-plan': 'Payment plan',
  team: 'Sales team',
}

// Per-widget accent colors used for the sidebar icons + chips. Kept as raw
// hex so the soft alpha backgrounds can be derived inline (e.g. color+"14").
const WIDGET_COLORS: Partial<Record<BlockType, string>> = {
  columns: "#38bdf8",
  navbar: "#38bdf8",
  footer: "#38bdf8",
  divider: "#94a3b8",
  spacer: "#94a3b8",
  "html-code": "#94a3b8",
  "custom-section": "#94a3b8",
  heading: "#e879f9",
  text: "#e879f9",
  button: "#f43f5e",
  icon: "#fb923c",
  "icon-box": "#fb923c",
  image: "#34d399",
  "image-box": "#a78bfa",
  video: "#f43f5e",
  gallery: "#34d399",
  banner: "#f59e0b",
  "project-banner": "#22d3ee",
  "project-overview": "#22d3ee",
  "property-details": "#22d3ee",
  "unit-config": "#22d3ee",
  "property-search": "#22d3ee",
  "property-filters": "#22d3ee",
  amenities: "#34d399",
  "floor-plans": "#34d399",
  location: "#34d399",
  "google-maps": "#34d399",
  "re-pricing": "#f59e0b",
  "emi-calculator": "#f59e0b",
  "payment-plan": "#f59e0b",
  developer: "#a78bfa",
  team: "#a78bfa",
  "lead-form": "#f472b6",
  contact: "#f472b6",
  newsletter: "#f472b6",
  "site-visit": "#f472b6",
  "download-brochure": "#f472b6",
  features: "#22d3ee",
  testimonials: "#34d399",
  faq: "#22d3ee",
  cta: "#f59e0b",
  offers: "#fb923c",
  stats: "#22d3ee",
  logocloud: "#94a3b8",
  tabs: "#a78bfa",
  countdown: "#f43f5e",
  "social-icons": "#38bdf8",
  anchor: "#94a3b8",
  "construction-status": "#34d399",
  "project-highlights": "#22d3ee",
}

function widgetColor(type: BlockType): string {
  return WIDGET_COLORS[type] ?? "#8b8b96"
}

const INPUT_CLS =
  "w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11.5px] placeholder:text-text-3 outline-none transition-[border,box-shadow,background-color] hover:border-border-hover focus:border-green focus:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"

function SortableLayer({ block, isSelected, onSelect, onDuplicate, onRemove, onHide, isHidden }: {
  block: BlockConfig
  isSelected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onRemove: () => void
  onHide: () => void
  isHidden: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const Icon = blockIcons[block.type] || Layout
  const layerLabel = blockLabels[block.type] || block.type

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group px-2.5 py-2 my-1 rounded-xl text-[12px] flex items-center gap-2 transition-all cursor-pointer select-none relative border ${
        isSelected
          ? 'bg-green/10 text-green border-green/40 shadow-sm'
          : 'border-border-subtle/60 bg-bg-2/40 text-text-1 hover:bg-bg-3/80 hover:text-text-0 hover:border-border-hover'
      } ${isHidden ? 'opacity-40' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-text-3 cursor-grab active:cursor-grabbing shrink-0"
        aria-label={`Drag to reorder ${layerLabel}`}
      >
        <GripVertical size={11} />
      </div>

      <div
        className={`w-[22px] h-[22px] rounded flex items-center justify-center text-[10px] shrink-0 border transition-colors ${
          isSelected ? 'border-green/30 bg-green-glow' : 'bg-bg-3'
        }`}
        style={{ color: widgetColor(block.type), borderColor: `${widgetColor(block.type)}${isSelected ? "66" : "40"}`, backgroundColor: `${widgetColor(block.type)}${isSelected ? "1f" : "14"}` }}
      >
        <Icon size={11} strokeWidth={2} />
      </div>

      <span className="font-medium flex-1 truncate">{layerLabel}</span>

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onHide() }}
          className="w-[20px] h-[20px] rounded flex items-center justify-center text-text-3 hover:bg-bg-4 hover:text-text-0 transition-all"
          title={isHidden ? 'Show' : 'Hide'}
        >
          {isHidden ? <EyeOff size={10} /> : <Eye size={10} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate() }}
          className="w-[20px] h-[20px] rounded flex items-center justify-center text-text-3 hover:bg-bg-4 hover:text-text-0 transition-all"
          title="Duplicate"
        >
          <Copy size={10} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="w-[20px] h-[20px] rounded flex items-center justify-center text-text-3 hover:bg-status-red/10 hover:text-status-red transition-all"
          title="Delete"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

function widgetLabel(type: BlockType) {
  const meta = blockMetadata.find((b) => b.type === type)
  return GRID_LABELS[type] || meta?.label || type
}

function WidgetTile({
  type,
  onAdd,
  compact = false,
}: {
  type: BlockType
  onAdd: (type: BlockType) => void
  compact?: boolean
}) {
  const setDraggedItem = useEditorStore((s) => s.setDraggedItem)
  const meta = blockMetadata.find((b) => b.type === type)
  if (!meta) return null
  const Icon = blockIcons[type] || Layout
  const label = widgetLabel(type)
  const color = widgetColor(type)

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        const payload = { kind: "block", type, label }
        const str = JSON.stringify(payload)
        e.dataTransfer.setData("application/x-openpage-drag", str)
        e.dataTransfer.setData("text/plain", str)
        e.dataTransfer.effectAllowed = "copy"
        setDraggedItem({ kind: "block", type, label })
      }}
      onDragEnd={() => {
        setDraggedItem(null)
      }}
      onClick={() => onAdd(type)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAdd(type)
        }
      }}
      title={`${label} (click to add, or drag to column/canvas)`}
      className={`flex flex-col items-center justify-center rounded-xl border border-border-default/60 bg-bg-2/50 hover:bg-bg-3/90 hover:border-border-hover transition-all duration-150 cursor-grab active:cursor-grabbing select-none group/tile shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
        compact ? "p-2 gap-1.5" : "p-2.5 gap-2"
      }`}
    >
      <div
        className={`rounded-lg border flex items-center justify-center transition-all group-hover/tile:scale-110 ${
          compact ? "w-8 h-8" : "w-10 h-10"
        }`}
        style={{
          color,
          borderColor: `${color}40`,
          backgroundColor: `${color}18`,
          boxShadow: `0 2px 8px ${color}15`,
        }}
      >
        <Icon size={compact ? 15 : 18} strokeWidth={2} className="transition-transform duration-200 group-hover/tile:drop-shadow-[0_0_8px_currentColor]" />
      </div>
      <span className="text-[10px] leading-tight text-center line-clamp-2 w-full font-medium text-text-2 group-hover/tile:text-text-0 transition-colors">
        {label}
      </span>
    </div>
  )
}

function BlockPicker({
  onAdd,
  compact = false,
  autoFocus = false,
  onKeyDown,
}: {
  onAdd: (type: BlockType) => void
  compact?: boolean
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  const [search, setSearch] = useState("")
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PICKER_GROUPS.map((g) => [g.id, g.defaultOpen])),
  )
  const q = search.trim().toLowerCase()

  function typeMatches(type: BlockType) {
    const meta = blockMetadata.find((b) => b.type === type)
    if (!meta) return false
    if (!q) return true
    return (
      widgetLabel(type).toLowerCase().includes(q) ||
      meta.label.toLowerCase().includes(q) ||
      meta.category.toLowerCase().includes(q)
    )
  }

  const searchTypes = [...new Set(PICKER_GROUPS.flatMap((g) => g.types))].filter(typeMatches)

  return (
    <>
      <div className="relative mb-2 shrink-0">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          autoFocus={autoFocus}
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-border-default/80 bg-bg-2/80 text-text-0 text-[11.5px] placeholder:text-text-3 outline-none transition-all hover:border-border-hover focus:border-green focus:bg-bg-2 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-1 p-0.5"
            title="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className={compact ? "" : "flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5 space-y-2.5"}>
        {q ? (
          searchTypes.length === 0 ? (
            <div className="px-2 py-6 text-center text-[11px] text-text-3 flex flex-col items-center justify-center gap-2">
              <Search size={18} className="text-text-3/60" />
              <span>No components match &ldquo;{search}&rdquo;</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {searchTypes.map((type) => (
                <WidgetTile key={type} type={type} onAdd={onAdd} compact={compact} />
              ))}
            </div>
          )
        ) : (
          PICKER_GROUPS.map((group) => {
            const types = group.types.filter((type) => blockMetadata.some((b) => b.type === type))
            if (types.length === 0) return null
            const isOpen = openGroups[group.id] !== false
            return (
              <div key={group.id} className="rounded-xl border border-border-subtle/80 bg-bg-2/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !isOpen }))}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-text-2 hover:text-text-0 hover:bg-bg-2/50 transition-colors select-none"
                >
                  <span className="flex items-center gap-1.5">
                    <span>{group.title}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-normal bg-bg-3 border border-border-default/80 text-text-3">
                      {types.length}
                    </span>
                  </span>
                  <span className={`transition-transform duration-200 ${isOpen ? "rotate-0 text-text-2" : "-rotate-90 text-text-3"}`}>
                    <ChevronDown size={12} />
                  </span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-3 gap-1.5 p-2 pt-0.5 border-t border-border-subtle/50">
                    {types.map((type) => (
                      <WidgetTile key={`${group.id}-${type}`} type={type} onAdd={onAdd} compact={compact} />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

function AddComponentPopover({ onAdd, onClose }: { onAdd: (type: BlockType) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-[52px] left-2 right-2 bg-bg-2 border border-border-default rounded-lg p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-10 max-h-[320px] overflow-y-auto">
      <BlockPicker
        autoFocus
        compact
        onAdd={(type) => { onAdd(type); onClose() }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
    </div>
  )
}

function GlobalWidgetsPanel() {
  const globalWidgets = useConfigStore((s) => s.config.globalWidgets ?? EMPTY_GLOBAL_WIDGETS)
  const insertGlobalWidget = useConfigStore((s) => s.insertGlobalWidget)

  if (globalWidgets.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <Save size={20} className="text-text-3 mx-auto mb-2" />
        <p className="text-[11px] text-text-3">No global widgets yet</p>
        <p className="text-[10px] text-text-3 mt-1">Save a block as a global widget from the Advanced tab</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2">
      {globalWidgets.map((gw) => (
        <div
          key={gw.id}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(e) => {
            const payload = { kind: "global", globalWidgetId: gw.id, label: gw.name }
            const str = JSON.stringify(payload)
            e.dataTransfer.setData("application/x-openpage-drag", str)
            e.dataTransfer.setData("text/plain", str)
            e.dataTransfer.effectAllowed = "copy"
            useEditorStore.getState().setDraggedItem({ kind: "global", globalWidgetId: gw.id, label: gw.name })
          }}
          onDragEnd={() => {
            useEditorStore.getState().setDraggedItem(null)
          }}
          onClick={() => {
            insertGlobalWidget(gw.id)
            toast(`Inserted "${gw.name}"`)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              insertGlobalWidget(gw.id)
            }
          }}
          title={`${gw.name} (click to add, or drag to column/canvas)`}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[11px] text-text-1 hover:bg-bg-3 hover:text-text-0 transition-colors text-left group cursor-grab active:cursor-grabbing select-none"
        >
          <div className="w-[22px] h-[22px] rounded border flex items-center justify-center text-[10px] shrink-0" style={{ color: "#a78bfa", borderColor: "#a78bfa40", backgroundColor: "#a78bfa14" }}>
            <Layers size={11} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{gw.name}</div>
            <div className="text-[9px] text-text-3">{gw.block.type}</div>
          </div>
          <Plus size={11} className="text-text-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  )
}

type Tab = 'layers' | 'components' | 'templates' | 'globals' | 'forms'

const TAB_DEFS: { id: Tab; label: string; hint: string; icon: typeof Layout; color: string }[] = [
  { id: 'templates', label: 'Templates', hint: 'Ready-made sections', icon: LayoutTemplate, color: "#f59e0b" },
  { id: 'components', label: 'Blocks', hint: 'Drag widgets onto the canvas', icon: Blocks, color: "#38bdf8" },
  { id: 'globals', label: 'Globals', hint: 'Reusable saved widgets', icon: Globe, color: "#a78bfa" },
  { id: 'layers', label: 'Layers', hint: 'Page structure & reorder', icon: Layers, color: "#34d399" },
  { id: 'forms', label: 'Forms', hint: 'Build the forms used on this page', icon: ClipboardList, color: "#fb7185" },
]

export function LayersPanel() {
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages
    if (!pages || pages.length === 0) return s.config.blocks
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0]
    return page.blocks
  })
  const { duplicateBlock, removeBlock, moveBlock, addBlock, updateBlockStyle } = useConfigStore()
  const { selectedBlockId, selectBlock, toggleLeftSidebar } = useEditorStore()
  const [showPopover, setShowPopover] = useState(false)
  const tab = useEditorStore((s) => s.leftTab)
  const setTab = useEditorStore((s) => s.setLeftTab)
  const activeDef = TAB_DEFS.find((t) => t.id === tab) ?? TAB_DEFS[1]

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex((b) => b.id === active.id)
    const newIndex = blocks.findIndex((b) => b.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      moveBlock(oldIndex, newIndex)
    }
  }

  function handleAddBlock(type: BlockType) {
    const meta = blockMetadata.find((b) => b.type === type)
    if (!meta) return
    const block: BlockConfig = {
      id: `block-${Date.now()}`,
      type,
      variant: meta.variants[0],
      props: { ...meta.defaultProps },
    }
    addBlock(block)
    selectBlock(block.id)
    toast(`${meta.label} added`)
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden relative">
      {/* Icon nav rail */}
      <nav className="w-[56px] shrink-0 h-full bg-[#0c0c10] border-r border-border-default/80 flex flex-col items-center py-2 gap-1.5 z-10" aria-label="Builder tools">
        {TAB_DEFS.map(({ id, label, icon: Icon, color }) => {
          const isActive = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`relative w-[46px] flex flex-col items-center gap-1.5 py-2.5 rounded-xl group transition-all duration-150 ${
                isActive ? 'bg-bg-2/90 shadow-sm border border-border-subtle' : 'text-text-3 hover:text-text-1 hover:bg-bg-2/50 border border-transparent'
              }`}
              title={label}
            >
              {isActive && (
                <span className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-[3.5px] h-5 rounded-r shadow-[0_0_8px_currentColor]" style={{ backgroundColor: color, color }} />
              )}
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  isActive ? "" : "group-hover:scale-105"
                }`}
                style={isActive ? { backgroundColor: `${color}1a`, color } : undefined}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  style={{ color: isActive ? color : undefined }}
                  className={isActive ? 'drop-shadow-[0_0_8px_currentColor]' : 'group-hover:text-text-1'}
                />
              </div>
              <span className={`text-[8px] font-bold uppercase tracking-wider ${isActive ? '' : 'text-text-3'}`} style={isActive ? { color } : undefined}>
                {label}
              </span>
            </button>
          )
        })}

        <div className="flex-1" />

        <button
          type="button"
          onClick={toggleLeftSidebar}
          className="w-full flex flex-col items-center gap-1 py-2.5 rounded-lg text-text-3 hover:text-text-1 hover:bg-bg-3 transition-colors"
          title="Collapse panel"
        >
          <PanelLeftClose size={16} />
          <span className="text-[8.5px] font-semibold uppercase tracking-wide">Hide</span>
        </button>
      </nav>

      {/* Panel content */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="px-3.5 py-3 border-b border-border-default shrink-0 bg-bg-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: `${activeDef.color}18`, color: activeDef.color }}>
              <activeDef.icon size={12} strokeWidth={2.2} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-0">{activeDef.label}</span>
            <span className="flex-1" />
            {tab === 'layers' && (
              <span className="text-[9.5px] font-semibold text-text-2 bg-bg-3 border border-border-default/80 rounded-full px-2 py-0.5">
                {blocks.length} section{blocks.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="text-[10px] text-text-3 mt-1 leading-normal">{activeDef.hint}</div>
        </div>

        {tab === 'layers' ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {blocks.length === 0 ? (
                    <div className="px-2 py-6 text-center">
                      <Layers size={18} className="text-text-3 mx-auto mb-2" />
                      <p className="text-[11px] text-text-2 font-medium">Canvas is empty</p>
                      <p className="text-[10px] text-text-3 mt-0.5 mb-2.5">Add a block or template to start</p>
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setTab('templates')}
                          className="w-full py-1.5 rounded-lg bg-green/15 border border-green/30 text-green text-[11px] font-semibold hover:bg-green/20 transition-colors"
                        >
                          Browse templates
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab('components')}
                          className="w-full py-1.5 rounded-lg border border-border-default text-text-2 text-[11px] font-semibold hover:bg-bg-3 hover:text-text-0 transition-colors"
                        >
                          Add a block
                        </button>
                      </div>
                    </div>
                  ) : (
                    blocks.map((block) => (
                      <SortableLayer
                        key={block.id}
                        block={block}
                        isSelected={selectedBlockId === block.id}
                        onSelect={() => selectBlock(block.id)}
                        onDuplicate={() => { duplicateBlock(block.id); toast('Block duplicated') }}
                        onRemove={() => {
                          if (selectedBlockId === block.id) selectBlock(null)
                          removeBlock(block.id)
                          toast('Block removed', {
                            action: {
                              label: 'Undo',
                              onClick: () => {
                                useConfigStore.getState().undo()
                                toast('Block restored')
                              },
                            },
                            duration: 3000,
                          })
                        }}
                        onHide={() => {
                          const key = `hideOn${viewportKey()}`
                          updateBlockStyle(block.id, { [key]: !(block.style?.[key as keyof typeof block.style]) })
                        }}
                        isHidden={!!block.style?.hideOnDesktop || !!block.style?.hideOnTablet || !!block.style?.hideOnMobile}
                      />
                    ))
                  )}
                </SortableContext>
              </DndContext>
            </div>

            <div className="p-2 border-t border-border-subtle relative">
              <button
                onClick={() => setShowPopover(!showPopover)}
                className="w-full py-2 rounded-lg border border-dashed border-border-default text-text-2 text-xs flex items-center justify-center gap-1.5 transition-all hover:border-green hover:text-green hover:bg-green-glow2"
              >
                <Plus size={13} />
                Add Component
              </button>
              {showPopover && (
                <AddComponentPopover onAdd={handleAddBlock} onClose={() => setShowPopover(false)} />
              )}
            </div>
          </>
        ) : tab === 'components' ? (
          <ComponentsPanel />
        ) : tab === 'templates' ? (
          <SectionTemplatesPanel />
        ) : tab === 'forms' ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <FormBuilder onClose={() => setTab('components')} />
          </div>
        ) : (
          <GlobalWidgetsPanel />
        )}
      </div>
    </div>
  )
}

function viewportKey() {
  const vp = useEditorStore.getState().viewport
  return vp.charAt(0).toUpperCase() + vp.slice(1) as 'Desktop' | 'Tablet' | 'Mobile'
}

function ComponentsPanel() {
  const addBlock = useConfigStore((s) => s.addBlock)
  const selectBlock = useEditorStore((s) => s.selectBlock)

  function handleAdd(type: BlockType) {
    const meta = blockMetadata.find((b) => b.type === type)
    if (!meta) return
    const block: BlockConfig = {
      id: `block-${Date.now()}`,
      type,
      variant: meta.variants[0],
      props: { ...meta.defaultProps },
    }
    addBlock(block)
    selectBlock(block.id)
    toast(`${meta.label} added`)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 pb-2 pt-1">
      <BlockPicker onAdd={handleAdd} />
    </div>
  )
}

function SectionTemplatesPanel() {
  const addBlock = useConfigStore((s) => s.addBlock)
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const [openCat, setOpenCat] = useState<SectionPresetCategory | null>('Lead Forms')
  const [query, setQuery] = useState('')

  function handleAdd(presetId: string) {
    const preset = SECTION_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const block = createBlockFromPreset(preset)
    addBlock(block)
    selectBlock(block.id)
    toast(`${preset.name} added`)
  }

  const q = query.trim().toLowerCase()

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="px-2 pt-2 pb-1 shrink-0">
        <p className="text-[10px] text-text-3 mb-2 px-0.5">
          Ready-to-use real estate sections. Edit content, images, forms and shortcodes in Properties.
        </p>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className={`${INPUT_CLS} pl-7`}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-3 space-y-1">
        {SECTION_PRESET_CATEGORIES.map((cat) => {
          const presets = SECTION_PRESETS.filter(
            (p) =>
              p.category === cat &&
              (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || cat.toLowerCase().includes(q))
          )
          if (!presets.length) return null
          const isOpen = q ? true : openCat === cat
          return (
            <div key={cat} className="rounded-md border border-border-subtle overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenCat(isOpen && !q ? null : cat)}
                className="w-full flex items-center justify-between px-2.5 py-2 bg-bg-2 text-[11px] font-semibold text-text-1 hover:bg-bg-3"
              >
                <span>{cat}</span>
                <span className="flex items-center gap-1.5 text-text-3 font-normal">
                  {presets.length}
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              </button>
              {isOpen ? (
                <div className="p-1.5 space-y-1 bg-bg-1">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        const payload = { kind: "preset", presetId: preset.id, label: preset.name }
                        const str = JSON.stringify(payload)
                        e.dataTransfer.setData("application/x-openpage-drag", str)
                        e.dataTransfer.setData("text/plain", str)
                        e.dataTransfer.effectAllowed = "copy"
                        useEditorStore.getState().setDraggedItem({ kind: "preset", presetId: preset.id, label: preset.name })
                      }}
                      onDragEnd={() => {
                        useEditorStore.getState().setDraggedItem(null)
                      }}
                      onClick={() => handleAdd(preset.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleAdd(preset.id)
                        }
                      }}
                      title={`${preset.name} (click to add, or drag to column/canvas)`}
                      className="w-full text-left rounded-md border border-border-default px-2.5 py-2 hover:border-green hover:bg-green-glow2 transition-colors group cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11.5px] font-medium text-text-0 group-hover:text-green">{preset.name}</div>
                          <div className="text-[10px] text-text-3 mt-0.5 leading-snug">{preset.description}</div>
                        </div>
                        <Plus size={12} className="shrink-0 mt-0.5 text-text-3 group-hover:text-green" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
