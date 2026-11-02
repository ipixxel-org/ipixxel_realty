import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { ColumnsBlock } from "@/components/openpage/blocks/columns/ColumnsBlock";
import { FlexItemsControls } from "@/components/openpage/editor/FlexItemsControls";
import { flexLayoutStyle, readFlexLayout } from "@/lib/openpage/flex-layout";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const heading = (id: string): BlockConfig => ({ id, type: "heading", variant: "default", props: { text: id } });
const columnsBlock = (props: Record<string, unknown>): BlockConfig => ({ id: "c1", type: "columns", variant: "default", props });
const site = (block: BlockConfig): SiteConfig => ({ name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [block] }] });
const cols = () => useConfigStore.getState().config.pages![0].blocks[0].props.columns as Array<Record<string, unknown>>;
const renderColumns = (block: BlockConfig) =>
  render(
    <DndContext>
      <ColumnsBlock block={block} />
    </DndContext>,
  );

describe("flex layout values", () => {
  it("keeps only valid values and maps start/end to CSS", () => {
    const layout = readFlexLayout({ direction: "column", justifyContent: "end", alignItems: "bogus" });
    expect(layout).toEqual({ direction: "column", justifyContent: "end", alignItems: undefined });
    expect(flexLayoutStyle(layout)).toEqual({ flexDirection: "column", justifyContent: "flex-end" });
    expect(flexLayoutStyle(readFlexLayout(undefined))).toEqual({});
  });
});

describe("Container Items (columns block)", () => {
  it("looks exactly as before when nothing is set", () => {
    const { container } = renderColumns(columnsBlock({ columns: [{ width: 50, blocks: [heading("a")] }, { width: 50, blocks: [] }] }));
    const row = container.querySelector<HTMLElement>("[data-op-container]")!;
    expect(row.style.flexDirection).toBe("");
    expect(row.style.justifyContent).toBe("");
    const items = container.querySelector<HTMLElement>("[data-op-col-items]")!;
    expect(items.className).toContain("flex-col");
    expect(items.getAttribute("style")).toBeNull();
  });

  it("applies the container's direction, justify and align to its columns", () => {
    const { container } = renderColumns(
      columnsBlock({ direction: "column", justifyContent: "center", alignItems: "center", columns: [{ width: 40, blocks: [] }] }),
    );
    const row = container.querySelector<HTMLElement>("[data-op-container]")!;
    expect(row.style.flexDirection).toBe("column");
    expect(row.style.justifyContent).toBe("center");
    expect(row.style.alignItems).toBe("center");
    // Stacked columns keep their width instead of a row flex-basis.
    expect((row.firstElementChild as HTMLElement).style.getPropertyValue("--op-col-w")).toBe("40%");
  });

  it("applies a column's own Items layout to its widgets", () => {
    const { container } = renderColumns(
      columnsBlock({ columns: [{ width: 100, direction: "row", justifyContent: "space-between", alignItems: "end", blocks: [heading("a"), heading("b")] }] }),
    );
    const items = container.querySelector<HTMLElement>("[data-op-col-items]")!;
    expect(items.style.flexDirection).toBe("row");
    expect(items.style.justifyContent).toBe("space-between");
    expect(items.style.alignItems).toBe("flex-end");
    expect(items.className).toContain("flex-wrap");
  });
});

describe("column layout in the store", () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig(site(columnsBlock({ columns: [{ width: 50, blocks: [] }, { width: 50, blocks: [] }] })));
  });

  it("sets and clears a column's layout without touching its width", () => {
    useConfigStore.getState().updateColumnLayout("c1", 1, { direction: "row", alignItems: "center" });
    expect(cols()[1]).toMatchObject({ width: 50, direction: "row", alignItems: "center" });
    useConfigStore.getState().updateColumnLayout("c1", 1, { direction: undefined });
    expect(cols()[1].direction).toBeUndefined();
    expect(cols()[1].alignItems).toBe("center");
    expect(cols()[0]).not.toHaveProperty("direction");
    expect(cols()[0]).not.toHaveProperty("alignItems");
  });
});

describe("Items controls", () => {
  it("picks a value, and picking the default clears it", () => {
    const onChange = vi.fn();
    render(<FlexItemsControls value={{}} defaultDirection="row" onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Column (top to bottom)"));
    expect(onChange).toHaveBeenLastCalledWith({ direction: "column" });
    fireEvent.click(screen.getByTitle("Row (left to right)"));
    expect(onChange).toHaveBeenLastCalledWith({ direction: undefined });
    fireEvent.click(screen.getByTitle("Space between"));
    expect(onChange).toHaveBeenLastCalledWith({ justifyContent: "space-between" });
  });
});

describe("Container Content Width", () => {
  it("is boxed by default (unchanged): side padding and max width", () => {
    const { container } = renderColumns(columnsBlock({ columns: [{ width: 100, blocks: [] }] }));
    const box = container.querySelector<HTMLElement>("[data-op-container]")!;
    expect(box.className).toContain("max-w-6xl");
    expect(box.parentElement!.className).toContain("px-6");
  });

  it("full width runs edge to edge with no side padding", () => {
    const { container } = renderColumns(columnsBlock({ contentWidth: "full", columns: [{ width: 100, blocks: [] }] }));
    const box = container.querySelector<HTMLElement>("[data-op-container]")!;
    expect(box.className).toContain("w-full");
    expect(box.className).not.toContain("max-w-6xl");
    expect(box.parentElement!.className).not.toContain("px-6");
    expect(box.parentElement!.className).toContain("py-6");
  });
});
