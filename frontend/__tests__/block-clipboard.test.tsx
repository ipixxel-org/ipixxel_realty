import { beforeEach, describe, expect, it } from "vitest";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { copyBlockToClipboard, pasteClipboardBlock } from "@/lib/openpage/block-clipboard";
import { isSameOrInside, pasteTargetAfter } from "@/lib/openpage/block-tree";
import { canvasCollision } from "@/lib/openpage/canvas-collision";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const heading = (id: string): BlockConfig => ({ id, type: "heading", variant: "default", props: { text: id } });
const container = (id: string, children: BlockConfig[] = []): BlockConfig => ({
  id,
  type: "columns",
  variant: "1-col",
  props: { columns: [{ width: 100, blocks: children }] },
});
const pageBlocks = () => useConfigStore.getState().config.pages![0].blocks;
const colBlocks = (b: BlockConfig) => (b.props.columns as Array<{ blocks: BlockConfig[] }>)[0].blocks;

beforeEach(() => {
  const site: SiteConfig = {
    name: "s",
    blocks: [],
    pages: [{ id: "p", name: "Home", path: "/", blocks: [heading("h1"), container("c1", [heading("inner")]), container("c2")] }],
  };
  useConfigStore.getState().setConfig(site);
  useEditorStore.getState().setClipboardBlock(null);
  useEditorStore.getState().selectBlock(null);
});

describe("copy / paste blocks", () => {
  it("pastes a copy below the selected block with fresh ids", () => {
    expect(copyBlockToClipboard("h1")).toBe(true);
    const id = pasteClipboardBlock("after", "h1")!;
    expect(pageBlocks().map((b) => b.type)).toEqual(["heading", "heading", "columns", "columns"]);
    expect(id).not.toBe("h1");
    expect(pageBlocks()[1].id).toBe(id);
  });

  it("copies and pastes a widget inside a container, next to it", () => {
    copyBlockToClipboard("inner");
    pasteClipboardBlock("after", "inner");
    expect(colBlocks(pageBlocks()[1])).toHaveLength(2);
  });

  it("pastes into an empty container (Paste Inside)", () => {
    copyBlockToClipboard("h1");
    pasteClipboardBlock("inside", "c2", 0);
    expect(colBlocks(pageBlocks()[2])).toHaveLength(1);
    expect(colBlocks(pageBlocks()[2])[0].type).toBe("heading");
  });

  it("does nothing without a copied block, and pastes at the end with no selection", () => {
    expect(pasteClipboardBlock("after", "h1")).toBeNull();
    copyBlockToClipboard("h1");
    expect(pasteTargetAfter(pageBlocks(), null)).toEqual({ kind: "root", index: undefined });
  });
});

describe("moving blocks into containers", () => {
  it("moves a section into a container", () => {
    useConfigStore.getState().moveBlockTo("h1", { kind: "column", sectionId: "c2", colIndex: 0 });
    expect(pageBlocks().map((b) => b.id)).toEqual(["c1", "c2"]);
    expect(colBlocks(pageBlocks()[1])[0].id).toBe("h1");
  });

  it("never moves a container into itself (it used to disappear)", () => {
    useConfigStore.getState().moveBlockTo("c1", { kind: "column", sectionId: "c1", colIndex: 0 });
    expect(pageBlocks().map((b) => b.id)).toEqual(["h1", "c1", "c2"]);
    expect(isSameOrInside(pageBlocks(), "c1", "inner")).toBe(true);
    expect(isSameOrInside(pageBlocks(), "c2", "inner")).toBe(false);
  });

  it("ignores a column that does not exist", () => {
    useConfigStore.getState().moveBlockTo("h1", { kind: "column", sectionId: "c2", colIndex: 5 });
    expect(pageBlocks().map((b) => b.id)).toEqual(["h1", "c1", "c2"]);
  });
});

describe("canvas drop detection", () => {
  const rect = (top: number, height: number) => ({ top, left: 0, width: 1000, height, bottom: top + height, right: 1000 });
  const droppable = (id: string, data: Record<string, unknown>) => ({ id, key: id, data: { current: data }, disabled: false, node: { current: null }, rect: { current: null } });

  it("prefers the container column under the pointer over a top-level reorder", () => {
    const blocks = pageBlocks();
    const detect = canvasCollision(() => blocks);
    const droppableContainers = [droppable("c2", { sortable: {} }), droppable("column-c2-0", { type: "column", sectionBlockId: "c2", colIndex: 0 })];
    const droppableRects = new Map<string, ReturnType<typeof rect>>([["c2", rect(0, 400)], ["column-c2-0", rect(20, 300)]]);
    const result = detect({
      active: { id: "h1", data: { current: {} }, rect: { current: { initial: null, translated: null } } },
      collisionRect: rect(100, 50),
      droppableRects,
      droppableContainers,
      pointerCoordinates: { x: 500, y: 150 },
    } as never);
    expect(result[0].id).toBe("column-c2-0");
  });

  it("skips the dragged container's own columns", () => {
    const blocks = pageBlocks();
    const detect = canvasCollision(() => blocks);
    const droppableContainers = [droppable("c1", { sortable: {} }), droppable("column-c1-0", { type: "column", sectionBlockId: "c1", colIndex: 0 })];
    const droppableRects = new Map<string, ReturnType<typeof rect>>([["c1", rect(0, 400)], ["column-c1-0", rect(20, 300)]]);
    const result = detect({
      active: { id: "c1", data: { current: {} }, rect: { current: { initial: null, translated: null } } },
      collisionRect: rect(100, 50),
      droppableRects,
      droppableContainers,
      pointerCoordinates: { x: 500, y: 150 },
    } as never);
    expect(result.map((r) => r.id)).not.toContain("column-c1-0");
  });
});
