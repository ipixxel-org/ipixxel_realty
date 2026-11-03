import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { ColumnsBlock } from "@/components/openpage/blocks/columns/ColumnsBlock";
import { FlexItemsControls } from "@/components/openpage/editor/FlexItemsControls";
import { flexLayoutStyle, normalizeLayoutValue, readFlexLayout } from "@/lib/openpage/flex-layout";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const heading = (id: string): BlockConfig => ({ id, type: "heading", variant: "default", props: { text: id } });
const columnsBlock = (props: Record<string, unknown>): BlockConfig => ({ id: "c1", type: "columns", variant: "default", props });
const renderColumns = (block: BlockConfig) =>
  render(
    <DndContext>
      <ColumnsBlock block={block} />
    </DndContext>,
  ).container;

describe("Display and the other layout values", () => {
  it("reads only valid values", () => {
    expect(
      readFlexLayout({ display: "inline-flex", wrap: "nowrap", alignContent: "center", gridColumns: "4", gridRows: 2, itemsGap: "20" }),
    ).toMatchObject({ display: "inline-flex", wrap: "nowrap", alignContent: "center", gridColumns: 4, gridRows: 2, itemsGap: "20px" });
    const bad = readFlexLayout({ display: "table", wrap: "x", gridColumns: 40, itemsGap: "red; color:red" });
    expect(bad.display).toBeUndefined();
    expect(bad.wrap).toBeUndefined();
    expect(bad.gridColumns).toBeUndefined();
    expect(bad.itemsGap).toBeUndefined();
  });

  it("turns each display into CSS", () => {
    expect(flexLayoutStyle(readFlexLayout({ display: "inline-flex", direction: "row", wrap: "nowrap" }))).toEqual({
      display: "inline-flex",
      flexDirection: "row",
      flexWrap: "nowrap",
    });
    expect(flexLayoutStyle(readFlexLayout({ display: "grid", gridColumns: 2, gridRows: 3, itemsGap: "8px" }))).toEqual({
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "repeat(3, auto)",
      gap: "8px",
    });
    // Grid with no columns chosen uses 3.
    expect(flexLayoutStyle(readFlexLayout({ display: "inline-grid" })).gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    // Block ignores the flex-only settings.
    expect(flexLayoutStyle(readFlexLayout({ display: "block", direction: "row", justifyContent: "center" }))).toEqual({ display: "block" });
  });

  it("cleans values before they are stored", () => {
    expect(normalizeLayoutValue("gridColumns", "5")).toBe(5);
    expect(normalizeLayoutValue("gridColumns", "abc")).toBeUndefined();
    expect(normalizeLayoutValue("itemsGap", "1.5rem")).toBe("1.5rem");
    expect(normalizeLayoutValue("display", "")).toBeUndefined();
  });
});

describe("Display on the page", () => {
  it("a column's widgets use its Display, Grid and Gap", () => {
    const c = renderColumns(
      columnsBlock({ columns: [{ width: 100, display: "grid", gridColumns: 2, itemsGap: "12px", blocks: [heading("a"), heading("b")] }] }),
    );
    const items = c.querySelector<HTMLElement>("[data-op-col-items]")!;
    expect(items.style.display).toBe("grid");
    expect(items.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(items.style.gap).toBe("12px");
  });

  it("the container's Display applies to its columns", () => {
    const c = renderColumns(columnsBlock({ display: "inline-flex", columns: [{ width: 50, blocks: [] }, { width: 50, blocks: [] }] }));
    expect(c.querySelector<HTMLElement>("[data-op-container]")!.style.display).toBe("inline-flex");
  });

  it("Block display stacks the columns at their widths", () => {
    const c = renderColumns(columnsBlock({ display: "block", columns: [{ width: 40, blocks: [] }] }));
    const row = c.querySelector<HTMLElement>("[data-op-container]")!;
    expect(row.style.display).toBe("block");
    expect((row.firstElementChild as HTMLElement).style.getPropertyValue("--op-col-w")).toBe("40%");
  });
});

describe("Display in the inspector", () => {
  it("offers every display and clears back to Flex", () => {
    const onChange = vi.fn();
    render(<FlexItemsControls value={{}} defaultDirection="column" onChange={onChange} />);
    const select = screen.getByLabelText("Display") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Flex",
      "Inline Flex",
      "Grid",
      "Inline Grid",
      "Block",
      "Inline Block",
    ]);
    fireEvent.change(select, { target: { value: "inline-flex" } });
    expect(onChange).toHaveBeenLastCalledWith({ display: "inline-flex" });
    fireEvent.change(select, { target: { value: "flex" } });
    expect(onChange).toHaveBeenLastCalledWith({ display: undefined });
  });

  it("shows grid columns / rows for Grid and hides Direction", () => {
    const onChange = vi.fn();
    render(<FlexItemsControls value={{ display: "grid" }} defaultDirection="column" showGap onChange={onChange} />);
    expect(screen.queryByRole("radiogroup", { name: "Direction" })).toBeNull();
    const cols = screen.getByLabelText("Columns");
    fireEvent.change(cols, { target: { value: "4" } });
    fireEvent.blur(cols);
    expect(onChange).toHaveBeenLastCalledWith({ gridColumns: 4 });
    const gap = screen.getByLabelText("Gap");
    fireEvent.change(gap, { target: { value: "bogus" } });
    fireEvent.blur(gap);
    // Invalid text is not saved.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("Block hides the flex-only controls", () => {
    render(<FlexItemsControls value={{ display: "block" }} defaultDirection="column" onChange={() => {}} />);
    expect(screen.queryByRole("radiogroup", { name: "Justify Content" })).toBeNull();
    expect(screen.getByText(/items stack one under another/)).toBeTruthy();
  });
});

describe("column layout in the store", () => {
  beforeEach(() => {
    const site: SiteConfig = {
      name: "s",
      blocks: [],
      pages: [{ id: "p", name: "Home", path: "/", blocks: [columnsBlock({ kind: "div", columns: [{ width: 100, blocks: [] }] })] }],
    };
    useConfigStore.getState().setConfig(site);
  });

  it("stores the new keys and drops invalid ones", () => {
    useConfigStore.getState().updateColumnLayout("c1", 0, { display: "grid", gridColumns: "2", itemsGap: "nope" });
    const col = (useConfigStore.getState().config.pages![0].blocks[0].props.columns as Array<Record<string, unknown>>)[0];
    expect(col).toMatchObject({ width: 100, display: "grid", gridColumns: 2 });
    expect(col).not.toHaveProperty("itemsGap");
  });
});
