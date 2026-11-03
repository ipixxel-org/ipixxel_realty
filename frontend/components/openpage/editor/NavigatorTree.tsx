"use client";

import { useMemo, useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { BlockConfig, BlockType } from "@/components/openpage/blocks/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { createBlockFromType, isDivBlock } from "@/lib/openpage/block-factory";
import { findBlockLocation, isSameOrInside } from "@/lib/openpage/block-tree";

const INPUT_CLS =
  "w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11.5px] placeholder:text-text-3 outline-none hover:border-border-hover focus:border-green";

function childrenOf(block: BlockConfig): BlockConfig[] {
  const cols = block.props?.columns;
  if (!Array.isArray(cols)) return [];
  return (cols as Array<{ blocks?: BlockConfig[] }>).flatMap((col) => (Array.isArray(col.blocks) ? col.blocks : []));
}

function isContainer(block: BlockConfig): boolean {
  return Array.isArray(block.props?.columns);
}

function labelFor(block: BlockConfig): string {
  const custom = block.props?.__label;
  if (typeof custom === "string" && custom.trim()) return custom;
  const type = isDivBlock(block) ? "div" : block.type;
  return blockMetadata.find((b) => b.type === type)?.label ?? block.type;
}

function iconElement(block: BlockConfig) {
  if (isContainer(block)) return <Box size={12} className="shrink-0 text-[#6d5dfc]" />;
  const type = block.type as BlockType;
  if (["heading", "text", "button", "tabs"].includes(type)) {
    return <Type size={12} className="shrink-0 text-[#6d5dfc]" />;
  }
  if (["image", "gallery", "image-box", "project-banner"].includes(type)) {
    return <ImageIcon size={12} className="shrink-0 text-[#6d5dfc]" />;
  }
  return <Layers size={12} className="shrink-0 text-[#6d5dfc]" />;
}

function nodeMatches(block: BlockConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${labelFor(block)} ${block.type}`.toLowerCase().includes(q);
}

function subtreeMatches(block: BlockConfig, query: string): boolean {
  if (nodeMatches(block, query)) return true;
  return childrenOf(block).some((child) => subtreeMatches(child, query));
}

function TreeNode({
  block,
  depth,
  query,
}: {
  block: BlockConfig;
  depth: number;
  query: string;
}) {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const navigatorExpanded = useEditorStore((s) => s.navigatorExpanded);
  const toggleNavigatorExpand = useEditorStore((s) => s.toggleNavigatorExpand);
  const duplicateBlock = useConfigStore((s) => s.duplicateBlock);
  const removeBlock = useConfigStore((s) => s.removeBlock);
  const updateBlockStyle = useConfigStore((s) => s.updateBlockStyle);
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps);
  const moveBlockTo = useConfigStore((s) => s.moveBlockTo);
  const addBlockToColumn = useConfigStore((s) => s.addBlockToColumn);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(labelFor(block));
  const [dropInside, setDropInside] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const children = childrenOf(block);
  const filtered = query ? children.filter((child) => subtreeMatches(child, query)) : children;
  const expanded = query ? true : navigatorExpanded[block.id] !== false;
  const hidden = !!block.style?.hideOnDesktop || !!block.style?.hideOnTablet || !!block.style?.hideOnMobile;
  const selected = selectedBlockId === block.id;

  const commitRename = () => {
    setRenaming(false);
    const next = draft.trim();
    updateBlockProps(block.id, { __label: next || undefined });
  };

  const resolveTargetAfter = (target: BlockConfig) => {
    const source = useConfigStore.getState().getActivePageBlocks();
    const loc = findBlockLocation(source, target.id);
    if (!loc) return null;
    if (loc.sectionId == null) return { kind: "root" as const, index: loc.index + 1 };
    return {
      kind: "column" as const,
      sectionId: loc.sectionId,
      colIndex: loc.colIndex ?? 0,
      index: loc.index + 1,
    };
  };

  const handleDropAfter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = event.dataTransfer.getData("application/x-openpage-block-id");
    if (!dragged || dragged === block.id) return;
    const source = useConfigStore.getState().getActivePageBlocks();
    if (isSameOrInside(source, dragged, block.id)) return;
    const target = resolveTargetAfter(block);
    if (target) moveBlockTo(dragged, target);
  };

  const handleDropInside = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDropInside(false);
    const dragged = event.dataTransfer.getData("application/x-openpage-block-id");
    if (dragged) {
      if (dragged === block.id) return;
      const source = useConfigStore.getState().getActivePageBlocks();
      if (isSameOrInside(source, dragged, block.id)) return;
      moveBlockTo(dragged, { kind: "column", sectionId: block.id, colIndex: 0, index: undefined });
      return;
    }
    const payload = event.dataTransfer.getData("application/x-openpage-drag");
    if (!payload) return;
    try {
      const parsed = JSON.parse(payload) as { kind?: string; type?: BlockType };
      if (parsed.kind !== "block" || !parsed.type) return;
      const created = createBlockFromType(parsed.type);
      if (!created) return;
      addBlockToColumn(block.id, 0, created);
      selectBlock(created.id);
    } catch {
      return;
    }
  };

  return (
    <li>
      <div
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-openpage-block-id", block.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropAfter}
        onClick={() => selectBlock(block.id)}
        onDoubleClick={() => {
          setDraft(labelFor(block));
          setRenaming(true);
          setTimeout(() => inputRef.current?.select(), 0);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          selectBlock(block.id);
        }}
        className={`group relative flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 cursor-pointer select-none transition-colors border ${
          selected
            ? "bg-green/10 text-green border-green/40"
            : "border-transparent text-text-1 hover:bg-bg-3/80 hover:text-text-0"
        } ${hidden ? "opacity-40" : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleNavigatorExpand(block.id);
          }}
          className={`w-4 h-4 shrink-0 flex items-center justify-center rounded text-text-3 hover:text-text-0 ${children.length ? "" : "invisible"}`}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <GripVertical size={11} className="shrink-0 text-text-3 opacity-0 group-hover:opacity-100 cursor-grab" />
        {iconElement(block)}

        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraft(labelFor(block));
                setRenaming(false);
              }
            }}
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-green bg-bg-2 text-[11.5px] text-text-0 outline-none"
            aria-label="Rename element"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-[11.5px] font-medium" title={labelFor(block)}>
            {labelFor(block)}
          </span>
        )}

        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(labelFor(block));
              setRenaming(true);
              setTimeout(() => inputRef.current?.select(), 0);
            }}
            className="w-[18px] h-[18px] rounded flex items-center justify-center text-text-3 hover:bg-bg-4 hover:text-text-0"
            title="Rename"
            aria-label="Rename"
          >
            <Pencil size={9} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updateBlockStyle(block.id, { hideOnDesktop: !block.style?.hideOnDesktop });
            }}
            className="w-[18px] h-[18px] rounded flex items-center justify-center text-text-3 hover:bg-bg-4 hover:text-text-0"
            title={hidden ? "Show" : "Hide"}
            aria-label={hidden ? "Show" : "Hide"}
          >
            {hidden ? <EyeOff size={9} /> : <Eye size={9} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              duplicateBlock(block.id);
            }}
            className="w-[18px] h-[18px] rounded flex items-center justify-center text-text-3 hover:bg-bg-4 hover:text-text-0"
            title="Duplicate"
            aria-label="Duplicate"
          >
            <Copy size={9} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (selectedBlockId === block.id) selectBlock(null);
              removeBlock(block.id);
            }}
            className="w-[18px] h-[18px] rounded flex items-center justify-center text-text-3 hover:bg-status-red/10 hover:text-status-red"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 size={9} />
          </button>
        </span>
      </div>

      {expanded && filtered.length > 0 ? (
        <ul className="border-l border-border-default/60" style={{ marginLeft: 12 + depth * 14 }}>
          {filtered.map((child) => (
            <TreeNode key={child.id} block={child} depth={depth + 1} query={query} />
          ))}
        </ul>
      ) : null}

      {expanded && isContainer(block) ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropInside(true);
          }}
          onDragLeave={() => setDropInside(false)}
          onDrop={handleDropInside}
          className={`mx-2 my-0.5 rounded border border-dashed text-[9.5px] text-center transition-colors ${
            dropInside ? "border-green bg-green/10 text-green py-1.5" : "border-transparent text-text-3/70 py-0.5 hover:border-border-hover"
          }`}
          style={{ marginLeft: 20 + depth * 14 }}
        >
          Drop inside
        </div>
      ) : null}
    </li>
  );
}

export function NavigatorTree() {
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages;
    if (!pages || pages.length === 0) return s.config.blocks;
    return (pages.find((p) => p.id === s.activePageId) ?? pages[0]).blocks;
  });
  const addBlock = useConfigStore((s) => s.addBlock);
  const moveBlockTo = useConfigStore((s) => s.moveBlockTo);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const [query, setQuery] = useState("");
  const [rootDrop, setRootDrop] = useState(false);

  const filtered = useMemo(
    () => (query.trim() ? blocks.filter((b) => subtreeMatches(b, query)) : blocks),
    [blocks, query],
  );

  const handleRootDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setRootDrop(false);
    const dragged = event.dataTransfer.getData("application/x-openpage-block-id");
    if (dragged) {
      moveBlockTo(dragged, { kind: "root", index: undefined });
      return;
    }
    const payload = event.dataTransfer.getData("application/x-openpage-drag");
    if (!payload) return;
    try {
      const parsed = JSON.parse(payload) as { kind?: string; type?: BlockType };
      if (parsed.kind !== "block" || !parsed.type) return;
      const created = createBlockFromType(parsed.type);
      if (!created) return;
      addBlock(created);
      selectBlock(created.id);
    } catch {
      return;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="px-2 pt-1 pb-2 shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search elements…"
            className={`${INPUT_CLS} pl-7 pr-7`}
            aria-label="Search elements"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-0"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <Layers size={18} className="text-text-3 mx-auto mb-2" />
            <p className="text-[11px] text-text-2 font-medium">
              {query ? "No matching elements" : "Canvas is empty"}
            </p>
            <p className="text-[10px] text-text-3 mt-0.5">
              {query ? "Try a different search" : "Add a block or template to start"}
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((block) => (
              <TreeNode key={block.id} block={block} depth={0} query={query} />
            ))}
          </ul>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setRootDrop(true);
          }}
          onDragLeave={() => setRootDrop(false)}
          onDrop={handleRootDrop}
          className={`mt-2 rounded-lg border border-dashed text-[10px] text-center transition-colors ${
            rootDrop ? "border-green bg-green/10 text-green py-2" : "border-border-default text-text-3 py-1.5 hover:border-border-hover"
          }`}
        >
          <Plus size={10} className="inline mr-1" />
          Drop at end of page
        </div>
      </div>
    </div>
  );
}
