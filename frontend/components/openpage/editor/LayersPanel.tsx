"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Layout, Grid3X3, DollarSign, Megaphone, PanelBottom,
  MessageSquare, HelpCircle, Image,
  Plus, Search, Minus, Flag,
  ImageIcon, Play, GalleryHorizontalEnd,
  Building2, MapPin, Home, Trees, FileText, Download, Mail, Save, Layers,
  ChevronDown, ChevronRight, Type, Box, Code2,
  LayoutTemplate, Blocks, Globe, PanelLeftClose, X, ClipboardList,
  Sparkles, Square, SquareDashed,
  ListChecks, TriangleAlert, Crosshair, Hash, Star, BarChartHorizontal, Receipt,
  Rotate3d, PanelRightOpen, Images, Timer, Share2, PanelTop, Bookmark, Heading1,
  ChevronsRight, ListTree, LayoutGrid, Newspaper, Briefcase, MessageSquareQuote,
  GalleryHorizontal,
} from "lucide-react";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import {
  SECTION_PRESET_CATEGORIES,
  SECTION_PRESETS,
  createBlockFromPreset,
  type SectionPresetCategory,
} from "@/lib/openpage/section-presets";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import type { BlockType } from "@/components/openpage/blocks/types";
import { EMPTY_GLOBAL_WIDGETS } from "./AdvancedPanel";
import { FormBuilder } from "./FormBuilder";
import { GenerateSectionModal } from "./GenerateSectionModal";
import { NavigatorTree } from "./NavigatorTree";
import { useIsTemplateBuilder } from "@/lib/openpage/use-builder-scope";

const blockIcons: Partial<Record<BlockType, typeof Layout>> = {
  section: Square,
  div: SquareDashed,
  grid: LayoutGrid,
  "icon-list": ListChecks,
  alert: TriangleAlert,
  "animated-headline": Sparkles,
  slider: Images,
  hotspot: Crosshair,
  counter: Hash,
  "star-rating": Star,
  "progress-bar": BarChartHorizontal,
  "price-list": Receipt,
  pricing: DollarSign,
  "flip-box": Rotate3d,
  countdown: Timer,
  "off-canvas": PanelRightOpen,
  "property-carousel": GalleryHorizontal,
  "visual-journey": Images,
  "ipixxel-hero": Home,
  "ipx-overview": FileText,
  "ipx-highlights": Sparkles,
  "ipx-amenities": Trees,
  "ipx-pricing": DollarSign,
  "ipx-floorplans": LayoutGrid,
  "ipx-masterplan": Layout,
  "ipx-specs": ClipboardList,
  "ipx-gallery": Images,
  "ipx-location": MapPin,
  "ipx-about": Building2,
  "ipx-cta": Megaphone,
  "ipx-form": ClipboardList,
  "ipx-footer": PanelBottom,
  portfolio: Briefcase,
  posts: Newspaper,
  reviews: MessageSquareQuote,
  "social-icons": Share2,
  accordion: ChevronDown,
  "video-gallery": Play,
  "image-comparison": GalleryHorizontalEnd,
  "social-share": Share2,
  "popup-trigger": MessageSquare,
  "site-search": Search,
  tabs: PanelTop,
  "site-logo": Bookmark,
  "site-title": Type,
  "page-title": Heading1,
  breadcrumbs: ChevronsRight,
  "table-of-contents": ListTree,
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

// Each widget appears in exactly one group (see the picker-groups test).
// Groups whose widgets aren't available (e.g. Layout's "banner") hide
// themselves, so an empty group never shows.
export const PICKER_GROUPS: { id: string; title: string; defaultOpen: boolean; types: BlockType[] }[] = [
  {
    id: "core",
    title: "Core",
    defaultOpen: true,
    types: ["heading", "text", "button", "columns", "div", "image", "video", "icon", "icon-box", "divider", "spacer", "html-code"],
  },
  {
    id: "basic",
    title: "Basic Elements",
    defaultOpen: true,
    types: ["grid", "icon-list", "animated-headline", "alert", "accordion", "tabs", "social-icons"],
  },
  {
    id: "layout",
    title: "Layout",
    defaultOpen: false,
    // Container / Spacer / Divider live in Core.
    types: ["section", "banner"],
  },
  {
    id: "content",
    title: "Content",
    // Open by default: CTA / FAQ / Highlights live only here now.
    defaultOpen: true,
    types: ["features", "faq", "cta", "custom-section"],
  },
  {
    id: "media",
    title: "Media",
    defaultOpen: false,
    // Image / Video live in Core.
    types: ["gallery", "image-box", "slider", "video-gallery", "image-comparison", "hotspot"],
  },
  {
    id: "re",
    title: "Real Estate",
    defaultOpen: true,
    types: ["project-banner", "project-overview", "property-details", "unit-config", "amenities", "floor-plans", "location", "re-pricing", "developer", "testimonials", "visual-journey"],
  },
  {
    // Ready-made iPixxel Realty section designs (pick one from the widget's
    // Template dropdown, then override any style).
    id: "ipixxel",
    title: "iPixxel Realty",
    defaultOpen: true,
    types: [
      "ipixxel-hero", "ipx-overview", "ipx-highlights", "ipx-amenities", "ipx-pricing", "ipx-floorplans",
      "ipx-masterplan", "ipx-specs", "ipx-gallery", "ipx-location", "ipx-about", "ipx-cta", "ipx-form", "ipx-footer",
    ],
  },
  {
    id: "highlights",
    title: "Highlights & Pricing",
    defaultOpen: true,
    types: ["counter", "star-rating", "progress-bar", "price-list", "pricing", "flip-box"],
  },
  {
    id: "listings",
    title: "Listings & Social Proof",
    defaultOpen: false,
    types: ["property-carousel", "portfolio", "posts", "reviews", "property-search", "property-filters"],
  },
  {
    id: "forms",
    title: "Lead & Forms",
    defaultOpen: true,
    types: ["lead-form", "site-visit", "newsletter", "download-brochure", "off-canvas", "countdown", "social-share", "popup-trigger"],
  },
  {
    id: "chrome",
    title: "Header / Footer & Site",
    defaultOpen: false,
    types: ["navbar", "footer", "site-logo", "site-title", "page-title", "breadcrumbs", "table-of-contents", "site-search"],
  },
]

const GRID_LABELS: Partial<Record<BlockType, string>> = {
  section: "Section",
  columns: "Container",
  div: "Div",
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
  "ipixxel-hero": "Hero",
  "ipx-overview": "Overview",
  "ipx-highlights": "Highlights",
  "ipx-amenities": "Amenities",
  "ipx-pricing": "Pricing",
  "ipx-floorplans": "Floor Plans",
  "ipx-masterplan": "Master / Site Plan",
  "ipx-specs": "Specifications",
  "ipx-gallery": "Gallery",
  "ipx-location": "Location / Map",
  "ipx-about": "About Developer",
  "ipx-cta": "CTA / Banner",
  "ipx-form": "Enquiry Form",
  "ipx-footer": "Footer",
  "unit-config": "Property Listing",
  "image-box": "Property Card",
  "property-search": "Search Form",
  amenities: "Amenities",
  "floor-plans": "Floor Plan",
  gallery: "Gallery",
  testimonials: "Testimonial",
  "lead-form": "Contact Form",
  accordion: "Accordion",
  "video-gallery": "Video Gallery",
  "image-comparison": "Before / After",
  "social-share": "Social Share",
  "popup-trigger": "Popup Trigger",
  "site-search": "Site Search",
}

export const blockLabels: Partial<Record<BlockType, string>> = {
  'icon-list': 'Icon list',
  alert: 'Alert',
  'animated-headline': 'Animated headline',
  slider: 'Image carousel',
  hotspot: 'Hotspot',
  counter: 'Counter',
  'star-rating': 'Star rating',
  'progress-bar': 'Progress bar',
  'price-list': 'Price list',
  pricing: 'Price table',
  'flip-box': 'Flip box',
  countdown: 'Countdown',
  'off-canvas': 'Off-canvas',
  'property-carousel': 'Property carousel',
  'visual-journey': 'Visual Journey',
  portfolio: 'Portfolio',
  posts: 'Updates / blog',
  reviews: 'Reviews',
  'social-icons': 'Social icons',
  accordion: 'Accordion',
  'video-gallery': 'Video gallery',
  'image-comparison': 'Before / after',
  'social-share': 'Social share',
  'popup-trigger': 'Popup trigger',
  'site-search': 'Site search',
  tabs: 'Tabs',
  'site-logo': 'Site logo',
  'site-title': 'Site title',
  'page-title': 'Page title',
  breadcrumbs: 'Breadcrumbs',
  'table-of-contents': 'Table of contents',
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
  grid: "#38bdf8",
  "icon-list": "#e879f9",
  alert: "#f59e0b",
  "animated-headline": "#e879f9",
  slider: "#34d399",
  hotspot: "#34d399",
  counter: "#22d3ee",
  "star-rating": "#f59e0b",
  "progress-bar": "#34d399",
  "price-list": "#f59e0b",
  pricing: "#f59e0b",
  "flip-box": "#a78bfa",
  "off-canvas": "#f472b6",
  "property-carousel": "#22d3ee",
  "visual-journey": "#22d3ee",
  "ipixxel-hero": "#6d5dfc",
  "ipx-overview": "#6d5dfc",
  "ipx-highlights": "#6d5dfc",
  "ipx-amenities": "#6d5dfc",
  "ipx-pricing": "#6d5dfc",
  "ipx-floorplans": "#6d5dfc",
  "ipx-masterplan": "#6d5dfc",
  "ipx-specs": "#6d5dfc",
  "ipx-gallery": "#6d5dfc",
  "ipx-location": "#6d5dfc",
  "ipx-about": "#6d5dfc",
  "ipx-cta": "#6d5dfc",
  "ipx-form": "#6d5dfc",
  "ipx-footer": "#6d5dfc",
  portfolio: "#a78bfa",
  posts: "#a78bfa",
  reviews: "#34d399",
  accordion: "#a78bfa",
  "video-gallery": "#f43f5e",
  "image-comparison": "#34d399",
  "social-share": "#38bdf8",
  "popup-trigger": "#f472b6",
  "site-search": "#38bdf8",
  "site-logo": "#38bdf8",
  "site-title": "#38bdf8",
  "page-title": "#38bdf8",
  breadcrumbs: "#38bdf8",
  "table-of-contents": "#38bdf8",
  section: "#38bdf8",
  columns: "#38bdf8",
  div: "#38bdf8",
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

export function widgetColor(type: BlockType): string {
  return WIDGET_COLORS[type] ?? "#8b8b96"
}

const INPUT_CLS =
  "w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11.5px] placeholder:text-text-3 outline-none transition-[border,box-shadow,background-color] hover:border-border-hover focus:border-green focus:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"

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
      className={`flex flex-col items-center justify-center rounded-xl border border-border-default bg-bg-1 hover:border-[#6d5dfc]/40 hover:bg-[#6d5dfc]/[0.04] transition-all duration-150 cursor-grab active:cursor-grabbing select-none group/tile hover:shadow-[0_4px_12px_rgba(109,93,252,0.1)] ${compact ? "p-2 gap-1.5" : "p-2.5 gap-1.5"
        }`}
    >
      <div
        className={`rounded-lg flex items-center justify-center transition-colors bg-[#6d5dfc]/[0.08] text-[#6d5dfc] group-hover/tile:bg-[#6d5dfc]/[0.14] ${compact ? "w-8 h-8" : "w-9 h-9"
          }`}
      >
        <Icon size={compact ? 15 : 17} strokeWidth={1.9} />
      </div>
      <span className="text-[10px] leading-tight text-center line-clamp-2 w-full font-medium text-text-1 group-hover/tile:text-text-0 transition-colors">
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
          className="w-full pl-8 pr-7 py-2 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11.5px] placeholder:text-text-3 outline-none transition-all hover:border-border-hover focus:border-[#6d5dfc] focus:bg-bg-1 focus:shadow-[0_0_0_3px_rgba(109,93,252,0.12)]"
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
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-1.5 px-1 py-1.5 text-[11.5px] font-semibold text-text-0 hover:text-[#6d5dfc] transition-colors select-none"
                >
                  <span className={`transition-transform duration-200 ${isOpen ? "rotate-0 text-text-2" : "-rotate-90 text-text-3"}`}>
                    <ChevronDown size={13} />
                  </span>
                  <span>{group.title}</span>
                  <span className="ml-auto px-1.5 rounded-full text-[9.5px] font-medium bg-bg-3 text-text-2">
                    {types.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-3 gap-1.5 pt-1 pb-1">
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

function AiGeneratorPanel() {
  const openAiModal = useEditorStore((s) => s.openAiModal);
  const [sectionOpen, setSectionOpen] = useState(false);
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs">
      <div className="p-4 rounded-xl border border-[#6d5dfc]/30 bg-gradient-to-br from-[#6d5dfc]/10 via-[#ec4899]/5 to-transparent text-center space-y-2.5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#6d5dfc] to-[#ec4899] text-white flex items-center justify-center mx-auto shadow-md shadow-[#6d5dfc]/25">
          <Sparkles size={20} />
        </div>
        <div>
          <h4 className="font-semibold text-text-0 text-sm">AI Template Architect</h4>
          <p className="text-[11px] text-text-3 mt-1 leading-relaxed">
            Create high-converting real estate landing pages tailored to your project using Google Gemini.
          </p>
        </div>
        <button
          type="button"
          onClick={openAiModal}
          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#6d5dfc] to-[#ec4899] text-white text-xs font-semibold shadow-md shadow-[#6d5dfc]/20 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2"
        >
          <Sparkles size={14} />
          Launch AI Architect
        </button>
        <button
          type="button"
          onClick={() => setSectionOpen(true)}
          className="w-full py-2 px-3 rounded-xl border border-[#6d5dfc]/30 bg-bg-1/70 text-[#6d5dfc] text-[11px] font-semibold hover:bg-[#6d5dfc]/10 transition-all flex items-center justify-center gap-1.5"
        >
          <Sparkles size={13} />
          Generate a single section
        </button>
      </div>

      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-text-2 uppercase tracking-wider block">
          Capabilities
        </span>
        <div className="space-y-1.5 text-text-2 text-[11px]">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-2/50 border border-border-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6d5dfc]" />
            Generate from natural prompt or specs
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-2/50 border border-border-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ec4899]" />
            Import facts from organization projects
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-2/50 border border-border-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            Full OpenPage blocks & theme customization
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-2/50 border border-border-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Section-level AI copy & headline rewriting
          </div>
        </div>
      </div>

      <GenerateSectionModal open={sectionOpen} onClose={() => setSectionOpen(false)} />
    </div>
  );
}

type Tab = 'layers' | 'components' | 'templates' | 'globals' | 'forms' | 'ai'

const TAB_DEFS: { id: Tab; label: string; hint: string; icon: typeof Layout; color: string }[] = [
  { id: 'components', label: 'Blocks', hint: 'Drag widgets onto the canvas', icon: Blocks, color: "#38bdf8" },
  { id: 'templates', label: 'Templates', hint: 'Ready-made sections', icon: LayoutTemplate, color: "#f59e0b" },
  { id: 'ai', label: 'AI Gen', hint: 'Generate landing page with Gemini AI', icon: Sparkles, color: "#ec4899" },
  { id: 'layers', label: 'Layers', hint: 'Page structure & reorder', icon: Layers, color: "#34d399" },
  { id: 'globals', label: 'Globals', hint: 'Reusable saved widgets', icon: Globe, color: "#a78bfa" },
  { id: 'forms', label: 'Forms', hint: 'Build the forms used on this page', icon: ClipboardList, color: "#fb7185" },
]

export function LayersPanel() {
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages
    if (!pages || pages.length === 0) return s.config.blocks
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0]
    return page.blocks
  })
  const { addBlock } = useConfigStore()
  const { selectBlock, toggleLeftSidebar } = useEditorStore()
  const [showPopover, setShowPopover] = useState(false)
  // "AI Gen" tab is hidden for org admins; only Super Admin templates keep it.
  const showAiTab = useIsTemplateBuilder()
  const tabDefs = showAiTab ? TAB_DEFS : TAB_DEFS.filter((t) => t.id !== 'ai')
  const storedTab = useEditorStore((s) => s.leftTab)
  const tab: Tab = !showAiTab && storedTab === 'ai' ? 'components' : storedTab
  const setTab = useEditorStore((s) => s.setLeftTab)
  const activeDef = tabDefs.find((t) => t.id === tab) ?? tabDefs.find((t) => t.id === 'components')!

  function handleAddBlock(type: BlockType) {
    const meta = blockMetadata.find((b) => b.type === type)
    // Same factory as drag-and-drop: deep-copied defaults and one-column
    // containers, so a click and a drag create identical blocks.
    const block = createBlockFromType(type)
    if (!meta || !block) return
    addBlock(block)
    selectBlock(block.id)
    toast(`${meta.label} added`)
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden relative">
      {/* Icon nav rail */}
      <nav className="w-[60px] shrink-0 h-full bg-bg-1 border-r border-border-default flex flex-col items-center py-2.5 gap-1 z-10" aria-label="Builder tools">
        {tabDefs.map(({ id, label, icon: Icon }) => {
          const isActive = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`w-[50px] flex flex-col items-center gap-1 py-2 rounded-xl transition-colors duration-150 ${isActive ? 'bg-[#6d5dfc] text-white shadow-[0_4px_12px_rgba(109,93,252,0.3)]' : 'text-text-2 hover:text-[#6d5dfc] hover:bg-[#6d5dfc]/[0.07]'
                }`}
              title={label}
              aria-pressed={isActive}
            >
              <Icon size={17} strokeWidth={isActive ? 2.1 : 1.75} />
              <span className="text-[9px] font-semibold leading-none">
                {label}
              </span>
            </button>
          )
        })}

        <div className="flex-1" />

        <button
          type="button"
          onClick={toggleLeftSidebar}
          className="w-[50px] flex flex-col items-center gap-1 py-2 rounded-xl text-text-3 hover:text-text-1 hover:bg-bg-3 transition-colors"
          title="Collapse panel"
        >
          <PanelLeftClose size={16} />
          <span className="text-[9px] font-semibold leading-none">Hide</span>
        </button>
      </nav>

      {/* Panel content */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-bg-1">
        <div className="px-3.5 py-3 border-b border-border-default shrink-0 bg-bg-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-[#6d5dfc]/10 text-[#6d5dfc]">
              <activeDef.icon size={13} strokeWidth={2.2} />
            </div>
            <span className="text-[13px] font-semibold text-text-0">{activeDef.label}</span>
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
            <NavigatorTree />

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
        ) : tab === 'ai' ? (
          <AiGeneratorPanel />
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

function ComponentsPanel() {
  const addBlock = useConfigStore((s) => s.addBlock)
  const selectBlock = useEditorStore((s) => s.selectBlock)

  function handleAdd(type: BlockType) {
    const meta = blockMetadata.find((b) => b.type === type)
    // Same factory as drag-and-drop: deep-copied defaults and one-column
    // containers, so a click and a drag create identical blocks.
    const block = createBlockFromType(type)
    if (!meta || !block) return
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
