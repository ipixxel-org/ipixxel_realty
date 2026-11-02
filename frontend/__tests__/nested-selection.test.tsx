import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { SortableBlock } from "@/components/openpage/editor/SortableBlock";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { ElementEditorContext } from "@/components/openpage/blocks/El";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const inner: BlockConfig = { id: "inner", type: "heading", variant: "default", props: { text: "Inner" } };
const outer: BlockConfig = { id: "outer", type: "columns", variant: "1-col", props: { columns: [{ width: 100, blocks: [inner] }] } };
const site: SiteConfig = { name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [outer] }] };

function Canvas() {
  const selected = useEditorStore((s) => s.selectedBlockId);
  return (
    <DndContext>
      <SortableContext items={["outer"]}>
        <SortableBlock block={outer} isSelected={selected === "outer"} onSelect={() => useEditorStore.getState().selectBlock("outer")}>
          <ElementEditorContext.Provider value={{ blockId: "outer", isEditing: true }}>
            <RenderBlock block={outer} />
          </ElementEditorContext.Provider>
        </SortableBlock>
      </SortableContext>
    </DndContext>
  );
}

beforeEach(() => {
  // jsdom has no scrollIntoView (the canvas scrolls the selected section into view).
  Element.prototype.scrollIntoView = () => {};
  useConfigStore.getState().setConfig(site);
  useEditorStore.getState().selectBlock(null);
  useEditorStore.getState().setRightSidebarTab("properties");
});

describe("selecting a block inside a container", () => {
  it("selecting another block opens Content, but a tab chosen right after sticks", () => {
    useEditorStore.getState().setRightSidebarTab("style");
    useEditorStore.getState().selectBlock("outer");
    expect(useEditorStore.getState().rightSidebarTab).toBe("properties");
    useEditorStore.getState().selectBlock("inner");
    useEditorStore.getState().setRightSidebarTab("style");
    expect(useEditorStore.getState().rightSidebarTab).toBe("style");
    // Re-selecting the same block keeps the current tab.
    useEditorStore.getState().selectBlock("inner");
    expect(useEditorStore.getState().rightSidebarTab).toBe("style");
  });

  it("the inner block's Style button selects the inner block (not the container) and opens Style", () => {
    render(<Canvas />);
    fireEvent.click(screen.getByTitle("Style this block (width, height, spacing…)"));
    expect(useEditorStore.getState().selectedBlockId).toBe("inner");
    expect(useEditorStore.getState().rightSidebarTab).toBe("style");
  });

  it("hides the container's floating toolbar while an inner block is selected", () => {
    const { container } = render(<Canvas />);
    const outerWrapper = container.querySelector('[aria-label="columns block"]')!;
    fireEvent.mouseEnter(outerWrapper);
    expect(screen.queryByTitle("Edit Style & Box Model")).not.toBeNull();
    act(() => useEditorStore.getState().selectBlock("inner"));
    fireEvent.mouseEnter(outerWrapper);
    expect(screen.queryByTitle("Edit Style & Box Model")).toBeNull();
    act(() => useEditorStore.getState().selectBlock("outer"));
    expect(screen.queryByTitle("Edit Style & Box Model")).not.toBeNull();
  });
});
