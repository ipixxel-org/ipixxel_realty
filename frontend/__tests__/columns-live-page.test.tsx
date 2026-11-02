import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { ElementEditorContext } from "@/components/openpage/blocks/El";
import type { BlockConfig } from "@/components/openpage/blocks/types";

const heading: BlockConfig = { id: "h", type: "heading", variant: "default", props: { text: "Hello" } };
const container: BlockConfig = {
  id: "c",
  type: "columns",
  variant: "2-col",
  props: { columns: [{ width: 50, blocks: [heading] }, { width: 50, blocks: [] }] },
};
const EDITOR_TEXT = /Drop or add widget|Drag & drop a widget|Column 2/;

describe("Container on the published page / preview", () => {
  it("shows only its widgets: no drop zones, placeholders or toolbars", () => {
    const { container: page } = render(<RenderBlock block={container} />);
    expect(page.textContent).toContain("Hello");
    expect(page.textContent).not.toMatch(EDITOR_TEXT);
    expect(page.querySelector("button")).toBeNull();
    expect(page.querySelector('[title="Drag to reorder"]')).toBeNull();
    // The empty column still keeps its width.
    expect(page.querySelector("[data-op-container]")!.children).toHaveLength(2);
  });

  it("still shows the editing controls in the builder", () => {
    const { container: canvas } = render(
      <ElementEditorContext.Provider value={{ blockId: "c", isEditing: true }}>
        <DndContext>
          <RenderBlock block={container} />
        </DndContext>
      </ElementEditorContext.Provider>,
    );
    expect(canvas.textContent).toMatch(/Drop or add widget/);
    expect(canvas.textContent).toMatch(/Column 2/);
  });

  it("keeps the same column layout as the builder", () => {
    const live = render(<RenderBlock block={container} />).container;
    const builder = render(
      <ElementEditorContext.Provider value={{ blockId: "c", isEditing: true }}>
        <DndContext>
          <RenderBlock block={container} />
        </DndContext>
      </ElementEditorContext.Provider>,
    ).container;
    const col = (c: HTMLElement) => c.querySelector("[data-op-container]")!.firstElementChild as HTMLElement;
    expect(col(live).className).toBe(col(builder).className);
    expect(col(live).getAttribute("style")).toBe(col(builder).getAttribute("style"));
  });
});
