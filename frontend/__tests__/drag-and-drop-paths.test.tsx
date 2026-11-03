import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { Canvas } from "@/components/openpage/editor/Canvas";
import { CanvasEmpty } from "@/components/openpage/editor/CanvasEmpty";
import { NavigatorTree } from "@/components/openpage/editor/NavigatorTree";
import { ColumnsBlock } from "@/components/openpage/blocks/columns/ColumnsBlock";
import { ElementEditorContext } from "@/components/openpage/blocks/El";
import {
  OPENPAGE_DRAG_MIME,
  OPENPAGE_BLOCK_ID_MIME,
} from "@/lib/openpage/drag-payload";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const mockDataTransfer = (values: Record<string, string>) => ({
  getData: (type: string) => values[type] ?? "",
  setData: () => {},
  types: Object.keys(values),
  dropEffect: "copy",
  effectAllowed: "all",
});

describe("Drag-and-Drop Subsystem: Comprehensive Paths", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {};
    if (!("fonts" in document)) {
      Object.defineProperty(document, "fonts", {
        value: {
          load: () => Promise.resolve([]),
          add: () => {},
          has: () => false,
        },
        writable: true,
        configurable: true,
      });
    }
    useEditorStore.getState().selectBlock(null);
    useEditorStore.setState({ navigatorExpanded: {}, draggedItem: null, isDragging: false });
  });

  describe("1. Picker -> Canvas & Columns Drop Paths", () => {
    it("drops a widget from the picker onto CanvasEmpty", () => {
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [] }] };
      useConfigStore.getState().setConfig(site);

      render(<CanvasEmpty />);
      const emptyZone = screen.getByText("Blank canvas").closest("div[data-tour='canvas']")!;

      const payload = JSON.stringify({ kind: "block", type: "heading", label: "Heading Widget" });
      fireEvent.drop(emptyZone, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
          "text/plain": payload,
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("heading");
      expect(useEditorStore.getState().selectedBlockId).toBe(blocks[0].id);
    });

    it("drops a preset section from the picker onto CanvasEmpty", () => {
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [] }] };
      useConfigStore.getState().setConfig(site);

      render(<CanvasEmpty />);
      const emptyZone = screen.getByText("Blank canvas").closest("div[data-tour='canvas']")!;

      const payload = JSON.stringify({ kind: "preset", presetId: "hero-overlay", label: "Hero Overlay" });
      fireEvent.drop(emptyZone, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("project-banner");
    });

    it("drops a global widget from the picker onto CanvasEmpty", () => {
      const globalBlock: BlockConfig = { id: "gw-src", type: "cta", variant: "default", props: { title: "Global CTA" } };
      const site: SiteConfig = {
        name: "test",
        blocks: [],
        globalWidgets: [{ id: "gw-1", name: "My CTA", block: globalBlock, createdAt: 1700000000 }],
        pages: [{ id: "p1", name: "Home", path: "/", blocks: [] }],
      };
      useConfigStore.getState().setConfig(site);

      render(<CanvasEmpty />);
      const emptyZone = screen.getByText("Blank canvas").closest("div[data-tour='canvas']")!;

      const payload = JSON.stringify({ kind: "global", globalWidgetId: "gw-1", label: "My CTA" });
      fireEvent.drop(emptyZone, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("cta");
      expect(blocks[0].id).not.toBe("gw-src"); // cloned with fresh ID
    });

    it("drops a widget from the picker into an empty column", () => {
      const colBlock: BlockConfig = {
        id: "c1",
        type: "columns",
        variant: "2-col",
        props: {
          columns: [
            { width: 50, blocks: [] },
            { width: 50, blocks: [] },
          ],
        },
      };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [colBlock] }] };
      useConfigStore.getState().setConfig(site);

      const { container } = render(
        <ElementEditorContext.Provider value={{ blockId: "c1", isEditing: true }}>
          <DndContext>
            <ColumnsBlock block={colBlock} />
          </DndContext>
        </ElementEditorContext.Provider>
      );

      // In a 2-col layout with resizers, the columns are child 0 and child 2
      const containerDiv = container.querySelector("[data-op-container]")!;
      const col2 = containerDiv.children[2];

      const payload = JSON.stringify({ kind: "block", type: "text", label: "Text Block" });
      fireEvent.drop(col2, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const pageBlocks = useConfigStore.getState().getActivePageBlocks();
      const cols = pageBlocks[0].props.columns as Array<{ blocks: BlockConfig[] }>;
      expect(cols[0].blocks).toHaveLength(0);
      expect(cols[1].blocks).toHaveLength(1);
      expect(cols[1].blocks[0].type).toBe("text");
    });

    it("drops a widget from the picker into an intermediate ColumnDropSlot", () => {
      const heading: BlockConfig = { id: "h1", type: "heading", variant: "default", props: {} };
      const button: BlockConfig = { id: "b1", type: "button", variant: "default", props: {} };
      const colBlock: BlockConfig = {
        id: "c1",
        type: "columns",
        variant: "1-col",
        props: {
          columns: [{ width: 100, blocks: [heading, button] }],
        },
      };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [colBlock] }] };
      useConfigStore.getState().setConfig(site);

      const { container } = render(
        <ElementEditorContext.Provider value={{ blockId: "c1", isEditing: true }}>
          <DndContext>
            <ColumnsBlock block={colBlock} />
          </DndContext>
        </ElementEditorContext.Provider>
      );

      // Find the ColumnDropSlot at index 1 (between heading and button)
      const slots = container.querySelectorAll("[data-op-col-items] > div");
      // Children alternate: Slot 0, Block 0, Slot 1, Block 1, Slot 2
      const slotBetween = slots[2];

      const payload = JSON.stringify({ kind: "block", type: "image", label: "Image Block" });
      fireEvent.drop(slotBetween, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const pageBlocks = useConfigStore.getState().getActivePageBlocks();
      const cols = pageBlocks[0].props.columns as Array<{ blocks: BlockConfig[] }>;
      expect(cols[0].blocks).toHaveLength(3);
      expect(cols[0].blocks[0].type).toBe("heading");
      expect(cols[0].blocks[1].type).toBe("image");
      expect(cols[0].blocks[2].type).toBe("button");
    });
  });

  describe("2. Picker -> Navigator Tree Drop Paths", () => {
    it("drops a widget from picker onto a row in Navigator (insert after target)", () => {
      const blockA: BlockConfig = { id: "a", type: "heading", variant: "default", props: {} };
      const blockB: BlockConfig = { id: "b", type: "text", variant: "default", props: {} };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [blockA, blockB] }] };
      useConfigStore.getState().setConfig(site);

      render(<NavigatorTree />);
      const rowA = screen.getByText("Heading").closest("li")!.querySelector("div")!;

      // Simulate dragging over bottom half of Row A -> pos = after
      fireEvent.dragOver(rowA, { clientY: 100 });

      const payload = JSON.stringify({ kind: "block", type: "button", label: "Button Widget" });
      fireEvent.drop(rowA, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(3);
      expect(blocks[0].id).toBe("a");
      expect(blocks[1].type).toBe("button");
      expect(blocks[2].id).toBe("b");
    });

    it("drops a preset from picker into a multi-column container Drop inside in Navigator", () => {
      const containerBlock: BlockConfig = {
        id: "cont",
        type: "columns",
        variant: "2-col",
        props: {
          columns: [
            { width: 50, blocks: [] },
            { width: 50, blocks: [] },
          ],
        },
      };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [containerBlock] }] };
      useConfigStore.getState().setConfig(site);

      render(<NavigatorTree />);

      // Should show individual drop zones for Column 1 and Column 2
      const dropCol2 = screen.getByText("Drop inside Column 2");
      expect(dropCol2).toBeTruthy();

      const payload = JSON.stringify({ kind: "block", type: "heading", label: "Column 2 Heading" });
      fireEvent.drop(dropCol2, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      const cols = blocks[0].props.columns as Array<{ blocks: BlockConfig[] }>;
      expect(cols[0].blocks).toHaveLength(0);
      expect(cols[1].blocks).toHaveLength(1);
      expect(cols[1].blocks[0].type).toBe("heading");
    });

    it("drops a widget from picker onto Navigator Drop at end of page", () => {
      const blockA: BlockConfig = { id: "a", type: "heading", variant: "default", props: {} };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [blockA] }] };
      useConfigStore.getState().setConfig(site);

      render(<NavigatorTree />);
      const endDrop = screen.getByText("Drop at end of page");

      const payload = JSON.stringify({ kind: "block", type: "footer", label: "Footer" });
      fireEvent.drop(endDrop, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(2);
      expect(blocks[0].id).toBe("a");
      expect(blocks[1].type).toBe("footer");
    });
  });

  describe("3. Navigator -> Canvas / Columns Drop Paths", () => {
    it("drops an existing block from Navigator onto CanvasEmpty", () => {
      const blockA: BlockConfig = { id: "a", type: "heading", variant: "default", props: {} };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [blockA] }] };
      useConfigStore.getState().setConfig(site);

      render(<CanvasEmpty />);
      const emptyZone = screen.getByText("Blank canvas").closest("div[data-tour='canvas']")!;

      fireEvent.drop(emptyZone, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_BLOCK_ID_MIME]: "a",
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe("a");
      expect(useEditorStore.getState().selectedBlockId).toBe("a");
    });

    it("drops an existing block from Navigator into a DroppableColumn on Canvas", () => {
      const rootItem: BlockConfig = { id: "r1", type: "button", variant: "default", props: {} };
      const colBlock: BlockConfig = {
        id: "c1",
        type: "columns",
        variant: "2-col",
        props: {
          columns: [
            { width: 50, blocks: [] },
            { width: 50, blocks: [] },
          ],
        },
      };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [rootItem, colBlock] }] };
      useConfigStore.getState().setConfig(site);

      const { container } = render(
        <ElementEditorContext.Provider value={{ blockId: "c1", isEditing: true }}>
          <DndContext>
            <ColumnsBlock block={colBlock} />
          </DndContext>
        </ElementEditorContext.Provider>
      );

      const columns = container.querySelectorAll("[data-op-container] > div");
      fireEvent.drop(columns[0], {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_BLOCK_ID_MIME]: "r1",
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(1); // rootItem was moved from root into column
      expect(blocks[0].id).toBe("c1");
      const cols = blocks[0].props.columns as Array<{ blocks: BlockConfig[] }>;
      expect(cols[0].blocks).toHaveLength(1);
      expect(cols[0].blocks[0].id).toBe("r1");
    });

    it("prevents dropping a container into one of its own columns from Navigator", () => {
      const colBlock: BlockConfig = {
        id: "c1",
        type: "columns",
        variant: "1-col",
        props: {
          columns: [{ width: 100, blocks: [] }],
        },
      };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [colBlock] }] };
      useConfigStore.getState().setConfig(site);

      const { container } = render(
        <ElementEditorContext.Provider value={{ blockId: "c1", isEditing: true }}>
          <DndContext>
            <ColumnsBlock block={colBlock} />
          </DndContext>
        </ElementEditorContext.Provider>
      );

      const column = container.querySelector("[data-op-container] > div")!;
      fireEvent.drop(column, {
        dataTransfer: mockDataTransfer({
          [OPENPAGE_BLOCK_ID_MIME]: "c1",
        }),
      });

      // c1 should still remain at root, NOT swallowed into itself
      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe("c1");
      const cols = blocks[0].props.columns as Array<{ blocks: BlockConfig[] }>;
      expect(cols[0].blocks).toHaveLength(0);
    });

    it("sets draggedItem in editorStore when dragging from NavigatorTree", () => {
      const blockA: BlockConfig = { id: "a", type: "heading", variant: "default", props: {} };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [blockA] }] };
      useConfigStore.getState().setConfig(site);

      render(<NavigatorTree />);
      const row = screen.getByText("Heading").closest("li")!.querySelector("div")!;

      fireEvent.dragStart(row, { dataTransfer: mockDataTransfer({}) });
      expect(useEditorStore.getState().draggedItem).toMatchObject({
        kind: "block",
        type: "heading",
      });

      fireEvent.dragEnd(row);
      expect(useEditorStore.getState().draggedItem).toBeNull();
    });
  });

  describe("4. Canvas -> Canvas & Inter-Column DnD Paths", () => {
    it("moves a column block between Column 1 and Column 2 of the SAME container (Gap C fix)", () => {
      const item1: BlockConfig = { id: "item-1", type: "heading", variant: "default", props: {} };
      const item2: BlockConfig = { id: "item-2", type: "text", variant: "default", props: {} };
      const containerBlock: BlockConfig = {
        id: "cont-1",
        type: "columns",
        variant: "2-col",
        props: {
          columns: [
            { width: 50, blocks: [item1] },
            { width: 50, blocks: [item2] },
          ],
        },
      };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [containerBlock] }] };
      useConfigStore.getState().setConfig(site);

      // Verify moveBlockTo between columns in same section works directly
      useConfigStore.getState().moveBlockTo("item-1", {
        kind: "column",
        sectionId: "cont-1",
        colIndex: 1,
        index: 0,
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      const cols = blocks[0].props.columns as Array<{ blocks: BlockConfig[] }>;
      expect(cols[0].blocks).toHaveLength(0);
      expect(cols[1].blocks).toHaveLength(2);
      expect(cols[1].blocks[0].id).toBe("item-1");
      expect(cols[1].blocks[1].id).toBe("item-2");
    });

    it("moves a group of root blocks into a column preserving relative order", () => {
      const b1: BlockConfig = { id: "b1", type: "heading", variant: "default", props: {} };
      const b2: BlockConfig = { id: "b2", type: "button", variant: "default", props: {} };
      const cont: BlockConfig = {
        id: "cont",
        type: "columns",
        variant: "1-col",
        props: {
          columns: [{ width: 100, blocks: [] }],
        },
      };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [b1, b2, cont] }] };
      useConfigStore.getState().setConfig(site);

      // Move group [b1, b2] into cont column 0
      useConfigStore.getState().moveBlockTo("b1", { kind: "column", sectionId: "cont", colIndex: 0, index: 0 });
      useConfigStore.getState().moveBlockTo("b2", { kind: "column", sectionId: "cont", colIndex: 0, index: 1 });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks[0].id).toBe("cont");
      const cols = blocks[0].props.columns as Array<{ blocks: BlockConfig[] }>;
      expect(cols[0].blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    });

    it("drops directly onto a SortableBlock to insert before/after on Canvas", () => {
      const b1: BlockConfig = { id: "sec-1", type: "heading", variant: "default", props: {} };
      const b2: BlockConfig = { id: "sec-2", type: "footer", variant: "default", props: {} };
      const site: SiteConfig = { name: "test", blocks: [], pages: [{ id: "p1", name: "Home", path: "/", blocks: [b1, b2] }] };
      useConfigStore.getState().setConfig(site);

      render(<Canvas />);
      const sec1 = screen.getByRole("button", { name: /^heading block/i });

      // Drop on top half (clientY = -10 < 0) -> index = 0 (before sec-1)
      const payload = JSON.stringify({ kind: "block", type: "navbar", label: "Navbar" });
      fireEvent.drop(sec1, {
        clientY: -10,
        dataTransfer: mockDataTransfer({
          [OPENPAGE_DRAG_MIME]: payload,
        }),
      });

      const blocks = useConfigStore.getState().getActivePageBlocks();
      expect(blocks).toHaveLength(3);
      expect(blocks[0].id).toBe("sec-1");
      expect(blocks[1].type).toBe("navbar");
      expect(blocks[2].id).toBe("sec-2");
    });
  });
});
