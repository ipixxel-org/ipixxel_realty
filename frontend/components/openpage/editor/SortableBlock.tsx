"use client";

import { type ReactNode, useRef, useEffect, useMemo, useState } from "react";
import { GripVertical, EyeOff } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig } from "../blocks/types";
import { isDivBlock } from "@/lib/openpage/block-factory";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { findBlock, isSameOrInside } from "@/lib/openpage/block-tree";
import { isHiddenOnViewport, resolveBlockStyleForDevice } from "@/lib/openpage/block-style";
import { readDropPayload, readDraggedBlockId, buildBlockFromPayload } from "@/lib/openpage/drag-payload";
import { FloatingBlockToolbar } from "./FloatingBlockToolbar";
import { BlockContextMenu } from "./BlockContextMenu";
import { InlineTextEditor } from "./InlineTextEditor";

const blockLabels: Record<string, string> = {
  navbar: "Header",
  footer: "Footer",
  "project-banner": "Hero",
  "ipixxel-hero": "Hero",
  "property-details": "Highlights",
  "project-overview": "About",
  "unit-config": "Unit types",
  amenities: "Amenities",
  gallery: "Gallery",
  location: "Location",
  "floor-plans": "Floor plans",
  "re-pricing": "Pricing",
  features: "Highlights",
  testimonials: "Testimonials",
  faq: "FAQ",
  "lead-form": "Enquiry form",
  "download-brochure": "Brochure",
  cta: "CTA",
  image: "Image",
  video: "Video",
  banner: "Banner",
  divider: "Divider",
  developer: "Developer",
  offers: "Offers",
  "custom-section": "Custom",
  heading: "Heading",
  text: "Text",
  button: "Button",
  icon: "Icon",
  "icon-box": "Icon box",
  "image-box": "Image box",
  columns: "Columns",
  spacer: "Spacer",
  "html-code": "HTML",
  "property-search": "Search",
  "property-filters": "Filters",
  "emi-calculator": "EMI calc",
  "payment-plan": "Payment plan",
  team: "Sales team",
  "social-icons": "Social icons",
  tabs: "Tabs",
  countdown: "Countdown",
  logocloud: "Logos",
  newsletter: "Newsletter",
  contact: "Contact",
  "construction-status": "Construction",
  "project-highlights": "Highlights",
  stats: "Stats",
};

interface Props {
  block: BlockConfig;
  isSelected: boolean;
  /** True when the block is part of the current multi-selection. */
  isMultiSelected?: boolean;
  /** Freeze DnD transforms (used while dragging a multi-selection group). */
  frozen?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

export function SortableBlock({ block, isSelected, isMultiSelected = false, frozen = false, onSelect, children }: Props) {
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages;
    if (!pages || pages.length === 0) return s.config.blocks;
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0];
    return page.blocks;
  });
  const { viewport, selectedBlockId, selectMultipleBlocks, toggleBlockSelection } = useEditorStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  // A block nested inside this one (e.g. a header inside a Container) is
  // selected: this section's toolbar must step aside, or its Edit / Style
  // buttons would silently re-select the outer container.
  const nestedSelected = useMemo(
    () => Boolean(selectedBlockId && selectedBlockId !== block.id && findBlock([block], selectedBlockId)),
    [block, selectedBlockId],
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: frozen ? undefined : CSS.Transform.toString(transform),
    transition: frozen ? undefined : transition,
    opacity: frozen ? 1 : isSortableDragging ? 0.4 : 1,
  };

  const index = blocks.findIndex((b) => b.id === block.id);
  const totalBlocks = blocks.length;

  useEffect(() => {
    if (isSelected && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);

  const isHidden = useMemo(
    () => isHiddenOnViewport(resolveBlockStyleForDevice(block.style, viewport), viewport),
    [block.style, viewport]
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  if (isHidden) {
    return (
      <div
        ref={(el) => {
          setNodeRef(el);
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey && selectedBlockId) {
            const anchor = blocks.findIndex((b) => b.id === selectedBlockId);
            if (anchor !== -1) {
              e.preventDefault();
              const from = Math.min(anchor, index);
              const to = Math.max(anchor, index);
              selectMultipleBlocks(blocks.slice(from, to + 1).map((b) => b.id));
              return;
            }
          }
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleBlockSelection(block.id);
            return;
          }
          onSelect();
        }}
        onContextMenu={handleContextMenu}
        className="relative border border-dashed border-yellow-500/50 bg-yellow-500/5 p-2 group cursor-pointer"
      >
        <span className="absolute top-1 left-1 text-[9px] font-semibold uppercase tracking-wider text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
          <EyeOff size={10} />
          Hidden on {viewport}
        </span>
        <div className="opacity-30 pointer-events-none">{children}</div>
        {contextMenu && (
          <BlockContextMenu
            block={block}
            index={index}
            totalBlocks={totalBlocks}
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Animation classes if set on block
  const animationName = block.animation || (block.style as Record<string, unknown> | undefined)?.animation;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (e.shiftKey && selectedBlockId) {
          const anchor = blocks.findIndex((b) => b.id === selectedBlockId);
          if (anchor !== -1) {
            e.preventDefault();
            const from = Math.min(anchor, index);
            const to = Math.max(anchor, index);
            selectMultipleBlocks(blocks.slice(from, to + 1).map((b) => b.id));
            return;
          }
        }
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          toggleBlockSelection(block.id);
          return;
        }
        onSelect();
      }}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative cursor-pointer border-b border-border-subtle group transition-[opacity,transform] duration-200 ${
        isSortableDragging
          ? "border-2 border-dashed border-[#5b9cff] bg-[#5b9cff]/10 z-50 rounded-lg"
          : isSelected
          ? "outline outline-2 outline-dashed outline-[#5b9cff] -outline-offset-1 z-30"
          : isMultiSelected
          ? "outline outline-2 outline-dashed outline-[#5b9cff]/60 -outline-offset-1 z-20"
          : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#5b9cff]/50 hover:-outline-offset-1"
      } ${animationName ? `op-animate-${animationName}` : ""}`}
      role="button"
      aria-label={`${block.type} block${isMultiSelected ? ", selected" : ""}`}
      aria-pressed={isMultiSelected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onDragOver={(e) => {
        if (
          !e.dataTransfer.types.includes("application/x-openpage-drag") &&
          !e.dataTransfer.types.includes("application/x-openpage-block-id") &&
          !e.dataTransfer.types.includes("text/plain")
        ) {
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        if (e.defaultPrevented) return;

        const existingId = readDraggedBlockId(e.dataTransfer);
        if (existingId) {
          e.preventDefault();
          useEditorStore.getState().setDraggedItem(null);
          if (existingId === block.id) return;
          const source = useConfigStore.getState().getActivePageBlocks();
          if (isSameOrInside(source, existingId, block.id)) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const targetIndex = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
          useConfigStore.getState().moveBlockTo(existingId, { kind: "root", index: targetIndex });
          useEditorStore.getState().selectBlock(existingId);
          toast.success("Section moved");
          return;
        }

        const payload = readDropPayload(e.dataTransfer);
        if (payload) {
          e.preventDefault();
          useEditorStore.getState().setDraggedItem(null);
          const globalWidgets = useConfigStore.getState().config.globalWidgets;
          const { block: newBlock, label } = buildBlockFromPayload(payload, globalWidgets);
          if (newBlock) {
            const rect = e.currentTarget.getBoundingClientRect();
            const targetIndex = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
            useConfigStore.getState().addBlock(newBlock, targetIndex);
            useEditorStore.getState().selectBlock(newBlock.id);
            toast.success(`${label} inserted`);
          }
        }
      }}
    >
      {/* Corner Label */}
      <div
        {...attributes}
        {...listeners}
        title="Drag to reorder section"
        className={`absolute top-0 left-0 z-20 text-[10px] font-medium tracking-wide text-white bg-[#5b9cff] hover:bg-[#4a8beb] px-2 py-0.5 rounded-br flex items-center gap-1 cursor-grab active:cursor-grabbing select-none shadow-sm transition-opacity ${
          isSelected || isHovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <GripVertical size={11} className="shrink-0" />
        <span>{isDivBlock(block) ? "Div" : blockLabels[block.type] || blockMetadata.find((m) => m.type === block.type)?.label || block.type}</span>
      </div>

      {/* Floating Toolbar (Elementor Pro style) */}
      {(isSelected || (isHovered && !nestedSelected)) && (
        <FloatingBlockToolbar
          block={block}
          index={index}
          totalBlocks={totalBlocks}
          isSelected={isSelected}
          onSelect={onSelect}
          dragAttributes={attributes}
          dragListeners={listeners}
          onOpenContextMenu={(e) => handleContextMenu(e)}
        />
      )}

      {/* Right-click Context Menu */}
      {contextMenu && (
        <BlockContextMenu
          block={block}
          index={index}
          totalBlocks={totalBlocks}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Inline Text Direct Editing */}
      <InlineTextEditor block={block} isSelected={isSelected}>
        <div>{children}</div>
      </InlineTextEditor>
    </div>
  );
}
