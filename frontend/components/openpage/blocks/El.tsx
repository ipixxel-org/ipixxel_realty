"use client";

import {
  createContext,
  useContext,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useDevice } from "@/components/openpage/runtime/device";
import type { BlockConfig, ElementId } from "@/components/openpage/blocks/types";
import { elementStyleTag } from "@/lib/openpage/block-style";
import {
  elementKey,
  getElementStyle,
  isElementHidden,
  isItemElementId,
} from "@/lib/openpage/element-style";
import { useEditorStore } from "@/components/openpage/store/editorStore";

/**
 * Non-null only inside the builder canvas, where it carries the id of the block
 * currently being rendered. Public rendering has no provider, so element
 * affordances (click-to-select, hidden-item overlays) never leak onto the live
 * site and no editor state is subscribed there.
 */
export interface ElementEditorScope {
  blockId: string;
  isEditing: boolean;
}

export const ElementEditorContext = createContext<ElementEditorScope | null>(null);

export function useElementEditor(): ElementEditorScope | null {
  return useContext(ElementEditorContext);
}

const DepthContext = createContext(0);
const useElementDepth = () => useContext(DepthContext);

/**
 * A single individually-editable node inside a section — a heading, a
 * paragraph, Button 1, a card, a tab, a footer column.
 *
 * Owns three responsibilities that every section would otherwise reimplement:
 *   1. resolving the element's style for the active device,
 *   2. emitting a scoped `!important` stylesheet that beats the section's
 *      Tailwind utilities and the block's own inherited rules,
 *   3. honouring per-device and master visibility.
 */
export function El({
  block,
  id,
  as: Tag = "div",
  className,
  style,
  children,
  ...rest
}: {
  block: BlockConfig;
  id: ElementId;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "style" | "className" | "children"> &
  Record<string, unknown>) {
  const device = useDevice();
  const scope = useElementEditor();
  const editing = scope?.isEditing === true;
  const depth = useElementDepth();

  const elementStyle = getElementStyle(block, id, device);
  const hidden = isElementHidden(elementStyle, device);

  const selectElement = useEditorStore((s) => s.selectElement);
  const selectedElementId = useEditorStore((s) => s.selectedElement?.elementId ?? null);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);

  const key = elementKey(block.id, id);
  const isSelected =
    editing && selectedBlockId === block.id && selectedElementId === id;
  const css = elementStyleTag(key, elementStyle, depth);

  // On the live site a hidden element is simply absent. In the canvas it stays
  // visible (marked) so it can be selected and switched back on.
  if (hidden && !editing) return null;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (editing) {
      event.stopPropagation();
      selectElement(block.id, id);
      // Clicking a link in the builder selects it; it must not navigate away.
      if ((event.target as Element | null)?.closest?.("a[href]")) event.preventDefault();
    }
    // The caller's own handler (a CTA opening a popup, an FAQ toggle) must run
    // on the live site too, not only inside the builder.
    rest.onClick?.(event);
  };

  return (
    <DepthContext.Provider value={depth + 1}>
      <Tag
        {...rest}
        onClick={handleClick}
        className={[
          className,
          editing ? "cursor-pointer" : "",
          editing && hidden ? "opacity-35 outline outline-1 outline-dashed outline-amber-500/70 -outline-offset-1" : "",
          editing && isSelected
            ? "outline outline-2 outline-dashed outline-[#5b9cff] -outline-offset-1"
            : editing
              ? "hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#5b9cff]/50 hover:-outline-offset-1"
              : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={style}
        data-el-id={key}
        data-el-name={id}
        {...(isItemElementId(block.type, id) ? { "data-op-item": "" } : {})}
        {...(editing && hidden ? { "data-el-hidden": "true" } : {})}
        {...(editing && isSelected ? { "data-el-selected": "true" } : {})}
      >
        {css ? <style>{css}</style> : null}
        {children}
      </Tag>
    </DepthContext.Provider>
  );
}