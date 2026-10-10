"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  Palette,
  X,
} from "lucide-react";
import { useConfigStore } from "@/components/openpage/store/configStore";
import type { BlockConfig } from "../blocks/types";

interface InlineTextEditorProps {
  block: BlockConfig;
  children: React.ReactNode;
  isSelected: boolean;
}

export function InlineTextEditor({
  block,
  children,
  isSelected,
}: InlineTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const [propKey, setPropKey] = useState<string | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Find matching prop in block.props
  const findPropKey = useCallback(
    (text: string): string | null => {
      const trimmed = text.trim();
      if (!trimmed || !block.props) return null;

      // 1. Direct match
      for (const [key, val] of Object.entries(block.props)) {
        if (typeof val === "string" && (val.trim() === trimmed || val.includes(trimmed) || trimmed.includes(val.trim()))) {
          return key;
        }
      }

      // 2. Nested match (e.g. items in array)
      for (const [key, val] of Object.entries(block.props)) {
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            const item = val[i];
            if (typeof item === "object" && item !== null) {
              for (const [subKey, subVal] of Object.entries(item)) {
                if (typeof subVal === "string" && (subVal.trim() === trimmed || subVal.includes(trimmed))) {
                  return `${key}.${i}.${subKey}`;
                }
              }
            }
          }
        }
      }

      return null;
    },
    [block.props]
  );

  const commitEdit = useCallback(() => {
    if (!activeElement) return;

    const newText = activeElement.innerText || activeElement.textContent || "";
    activeElement.contentEditable = "false";
    activeElement.removeAttribute("data-inline-editing");

    if (propKey) {
      if (propKey.includes(".")) {
        const parts = propKey.split(".");
        const arrayKey = parts[0];
        const arrayIdx = parseInt(parts[1], 10);
        const subKey = parts[2];

        const currentArray = (block.props[arrayKey] as Array<Record<string, unknown>>) || [];
        const nextArray = [...currentArray];
        if (nextArray[arrayIdx]) {
          nextArray[arrayIdx] = {
            ...nextArray[arrayIdx],
            [subKey]: newText,
          };
          useConfigStore.getState().updateBlockProps(block.id, {
            [arrayKey]: nextArray,
          });
        }
      } else {
        useConfigStore.getState().updateBlockProps(block.id, {
          [propKey]: newText,
        });
      }
    }

    setActiveElement(null);
    setPropKey(null);
    setToolbarPos(null);
    setShowColorPicker(false);
  }, [activeElement, block.id, block.props, propKey]);

  // Double-clicking should not automatically add or replace text
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Keyboard events when editing
  useEffect(() => {
    if (!activeElement) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Enter" && !e.shiftKey) {
        // For headings or buttons, Enter commits
        if (["H1", "H2", "H3", "H4", "H5", "H6", "BUTTON", "A"].includes(activeElement?.tagName || "")) {
          e.preventDefault();
          commitEdit();
        }
      }
    }

    function handleOutsideClick(e: MouseEvent) {
      if (
        activeElement &&
        !activeElement.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest(".op-inline-toolbar")
      ) {
        commitEdit();
      }
    }

    activeElement.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      activeElement.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [activeElement, commitEdit]);

  const exec = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      className="relative"
    >
      {children}

      {/* Floating Inline Formatting Bar */}
      {activeElement && toolbarPos && (
        <div
          style={{ left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px` }}
          className="op-inline-toolbar fixed z-50 flex items-center bg-[#181c24] text-white border border-blue-500/60 rounded-lg shadow-2xl px-1.5 py-1 gap-0.5 backdrop-blur-md animate-in fade-in select-none text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec("bold");
            }}
            className="p-1 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Bold (Ctrl+B)"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec("italic");
            }}
            className="p-1 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Italic (Ctrl+I)"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec("underline");
            }}
            className="p-1 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Underline (Ctrl+U)"
          >
            <Underline size={13} />
          </button>

          <div className="w-[1px] h-3.5 bg-white/20 mx-0.5" />

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyLeft");
            }}
            className="p-1 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Align Left"
          >
            <AlignLeft size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyCenter");
            }}
            className="p-1 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Align Center"
          >
            <AlignCenter size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyRight");
            }}
            className="p-1 text-text-2 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Align Right"
          >
            <AlignRight size={13} />
          </button>

          <div className="w-[1px] h-3.5 bg-white/20 mx-0.5" />

          {/* Color palette */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setShowColorPicker(!showColorPicker);
              }}
              className="p-1 text-text-2 hover:text-amber-300 hover:bg-white/10 rounded transition-colors"
              title="Text Color"
            >
              <Palette size={13} />
            </button>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 bg-bg-2 border border-border-default rounded-md p-1.5 shadow-2xl flex gap-1 z-50">
                {["#ffffff", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      exec("foreColor", color);
                      setShowColorPicker(false);
                    }}
                    style={{ backgroundColor: color }}
                    className="w-4 h-4 rounded-full border border-white/20 hover:scale-125 transition-transform"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-3.5 bg-white/20 mx-0.5" />

          {/* Commit / Save */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              commitEdit();
            }}
            className="p-1 text-green-400 hover:text-white hover:bg-green-500/30 rounded transition-colors flex items-center gap-1 font-semibold text-[10px]"
            title="Done (Esc / Enter)"
          >
            <Check size={13} />
            <span>Done</span>
          </button>
        </div>
      )}
    </div>
  );
}
