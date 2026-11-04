import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { formatUnit, blockStyleTag, elementStyleTag } from "@/lib/openpage/block-style";
import { ColumnsBlock } from "@/components/openpage/blocks/columns/ColumnsBlock";
import { ElementEditorContext } from "@/components/openpage/blocks/El";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";
import { DndContext } from "@dnd-kit/core";
import type { ContextType } from "react";

describe("border radius", () => {
  it("unlinked corners get units", () => {
    expect(formatUnit("20 0 20 0")).toBe("20px 0px 20px 0px");
    expect(formatUnit("20px 10")).toBe("20px 10px");
    expect(formatUnit("50%")).toBe("50%");
    expect(formatUnit("20")).toBe("20px");
  });

  it("leaves other values as they are", () => {
    expect(formatUnit("calc(100% - 20px)")).toBe("calc(100% - 20px)");
    expect(formatUnit("auto")).toBe("auto");
    expect(formatUnit("1 2 3 4 5")).toBe("1 2 3 4 5");
  });

  it("image / video widgets clip the picture to the corners; others don't clip", () => {
    expect(blockStyleTag("i", { borderRadius: "16" }, false, true)).toContain("overflow:hidden !important");
    expect(blockStyleTag("h", { borderRadius: "16" }, false, false)).not.toContain("overflow:hidden");
    expect(blockStyleTag("i", { backgroundColor: "#fff" }, false, true)).not.toContain("overflow:hidden");
  });

  it("a rounded image element rounds the picture inside", () => {
    expect(elementStyleTag("b|image:media", { borderRadius: "12px" })).toContain("> :where(img, video, iframe) { border-radius:inherit !important");
  });
});

const heading: BlockConfig = {
  id: "h1", type: "heading", variant: "default", props: { text: "Inner" },
  style: { backgroundColor: "#10b981" },
};
const heading2: BlockConfig = { id: "h2", type: "heading", variant: "default", props: { text: "Other" } };
const div: BlockConfig = {
  id: "d1", type: "columns", variant: "1-col",
  props: { kind: "div", columns: [{ width: 100, blocks: [heading, heading2] }] },
};
const site: SiteConfig = { name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [div] }] };
const editor = { isEditing: true } as unknown as ContextType<typeof ElementEditorContext>;
const find = (id: string) =>
  (useConfigStore.getState().getActivePageBlocks()[0].props.columns as Array<{ blocks: BlockConfig[] }>)[0].blocks.find((b) => b.id === id)!;
const renderDiv = () =>
  render(
    <DndContext>
      <ElementEditorContext.Provider value={editor}>
        <ColumnsBlock block={useConfigStore.getState().getActivePageBlocks()[0]} />
      </ElementEditorContext.Provider>
    </DndContext>,
  );

describe("right-click on a widget inside a Div", () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig(JSON.parse(JSON.stringify(site)));
    useEditorStore.setState({ clipboardStyle: null, copiedBlockStyle: null, selectedBlockId: null });
  });

  it("opens that widget's menu, and copy / paste style works between nested widgets", () => {
    const view = renderDiv();
    fireEvent.contextMenu(screen.getByText("Inner"));
    expect(useEditorStore.getState().selectedBlockId).toBe("h1");
    expect(screen.getByText("Heading")).toBeTruthy(); // menu title = the widget, not the Div
    fireEvent.click(screen.getByText("Copy Style"));
    view.unmount();

    renderDiv();
    fireEvent.contextMenu(screen.getByText("Other"));
    fireEvent.click(screen.getByText("Paste Style"));
    expect(find("h2").style?.backgroundColor).toBe("#10b981");
  });

  it("Move Down moves the widget inside its Div", () => {
    renderDiv();
    fireEvent.contextMenu(screen.getByText("Inner"));
    fireEvent.click(screen.getByText("Move Down"));
    const ids = (useConfigStore.getState().getActivePageBlocks()[0].props.columns as Array<{ blocks: BlockConfig[] }>)[0].blocks.map((b) => b.id);
    expect(ids).toEqual(["h2", "h1"]);
  });
});
