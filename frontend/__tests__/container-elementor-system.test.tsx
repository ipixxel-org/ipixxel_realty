import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { applyBlockStyle } from "@/lib/openpage/block-style";
import { ColumnsBlock } from "@/components/openpage/blocks/columns/ColumnsBlock";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { CanvasToolbar } from "@/components/openpage/editor/CanvasToolbar";
import { StylePanel } from "@/components/openpage/editor/StylePanel";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

describe("Elementor-Like Container & Layout Controls", () => {
  beforeEach(() => {
    useEditorStore.getState().selectBlock(null);
  });

  it("applies advanced flex layout and position styles to CSSProperties", () => {
    const css = applyBlockStyle({
      position: "absolute",
      top: "10px",
      right: "20px",
      bottom: "30px",
      left: "40px",
      flexGrow: 2,
      flexShrink: 0,
      flexBasis: "250px",
      order: 3,
      alignSelf: "flex-end",
    });

    expect(css.position).toBe("absolute");
    expect(css.top).toBe("10px");
    expect(css.right).toBe("20px");
    expect(css.bottom).toBe("30px");
    expect(css.left).toBe("40px");
    expect(css.flexGrow).toBe(2);
    expect(css.flexShrink).toBe(0);
    expect(css.flexBasis).toBe("250px");
    expect(css.order).toBe(3);
    expect(css.alignSelf).toBe("flex-end");
  });

  it("renders semantic container HTML tag dynamically", () => {
    const block: BlockConfig = {
      id: "cont-1",
      type: "columns",
      variant: "1-col",
      props: {
        htmlTag: "section",
        columns: [{ width: 100, blocks: [] }],
      },
    };

    const { container } = render(<ColumnsBlock block={block} />);
    const sectionEl = container.querySelector("section");
    expect(sectionEl).toBeTruthy();
    expect(sectionEl?.getAttribute("data-op-div")).toBeNull();
  });

  it("renders article or nav tag when specified on container", () => {
    const block: BlockConfig = {
      id: "cont-article",
      type: "columns",
      variant: "1-col",
      props: {
        htmlTag: "article",
        columns: [{ width: 100, blocks: [] }],
      },
    };

    const { container } = render(<ColumnsBlock block={block} />);
    expect(container.querySelector("article")).toBeTruthy();
  });

  it("safely merges child widgets into adjacent column when a column is removed", () => {
    const childWidget1: BlockConfig = { id: "child-1", type: "heading", variant: "default", props: { text: "Heading 1" } };
    const childWidget2: BlockConfig = { id: "child-2", type: "text", variant: "default", props: { body: "Paragraph 2" } };

    const site: SiteConfig = {
      name: "Test Site",
      blocks: [
        {
          id: "col-sec",
          type: "columns",
          variant: "2-col",
          props: {
            columns: [
              { width: 50, blocks: [childWidget1] },
              { width: 50, blocks: [childWidget2] },
            ],
          },
        },
      ],
      pages: [
        {
          id: "page-1",
          name: "Home",
          path: "/",
          blocks: [
            {
              id: "col-sec",
              type: "columns",
              variant: "2-col",
              props: {
                columns: [
                  { width: 50, blocks: [childWidget1] },
                  { width: 50, blocks: [childWidget2] },
                ],
              },
            },
          ],
        },
      ],
    };

    useConfigStore.setState({ config: site, activePageId: "page-1" });

    // Remove column 1 (which contains childWidget2)
    useConfigStore.getState().removeColumn("col-sec", 1);

    const updatedBlocks = useConfigStore.getState().config.pages![0].blocks;
    const container = updatedBlocks[0];
    const remainingCols = container.props.columns as Array<{ width: number; blocks: BlockConfig[] }>;

    expect(remainingCols.length).toBe(1);
    expect(remainingCols[0].width).toBe(100);
    // Both children are preserved in column 0!
    expect(remainingCols[0].blocks.map((b) => b.id)).toEqual(["child-1", "child-2"]);
  });

  it("renders CanvasToolbar with Navigator, Finder, Grid, History, and Undo/Redo buttons", () => {
    const site: SiteConfig = {
      name: "Test Site",
      pages: [{ id: "p1", name: "Home", path: "/", blocks: [] }],
      blocks: [],
    };
    useConfigStore.setState({ config: site, activePageId: "p1" });

    render(<CanvasToolbar />);

    expect(screen.getByTitle("Element Hierarchy & Navigator")).toBeTruthy();
    expect(screen.getByTitle("Finder / Command Palette (Ctrl+K)")).toBeTruthy();
    expect(screen.getByTitle("Toggle alignment grid")).toBeTruthy();
    expect(screen.getByTitle("Revision History")).toBeTruthy();
    expect(screen.getByTitle("Undo (Ctrl+Z)")).toBeTruthy();
    expect(screen.getByTitle("Redo (Ctrl+Y)")).toBeTruthy();

    // Clicking Navigator opens layers tab
    fireEvent.click(screen.getByTitle("Element Hierarchy & Navigator"));
    expect(useEditorStore.getState().leftTab).toBe("layers");
    expect(useEditorStore.getState().leftSidebarOpen).toBe(true);

    // Clicking Toggle alignment grid toggles showGrid
    const initialGrid = useEditorStore.getState().showGrid;
    fireEvent.click(screen.getByTitle("Toggle alignment grid"));
    expect(useEditorStore.getState().showGrid).toBe(!initialGrid);
  });

  it("renders Position and Flex Item controls in StylePanel", () => {
    const block: BlockConfig = {
      id: "styled-block",
      type: "button",
      variant: "default",
      props: { label: "Click" },
      style: {
        position: "relative",
        top: "5px",
        flexGrow: 1,
        alignSelf: "center",
      },
    };

    render(<StylePanel block={block} />);

    expect(screen.getByText("Position")).toBeTruthy();
    expect(screen.getByText("Flex / Grid Item")).toBeTruthy();
    expect(screen.getByText("Align Self")).toBeTruthy();
    expect(screen.getByText("Order")).toBeTruthy();
    expect(screen.getByText("Grow")).toBeTruthy();
    expect(screen.getByText("Shrink")).toBeTruthy();
    expect(screen.getByText("Basis")).toBeTruthy();
  });
});
