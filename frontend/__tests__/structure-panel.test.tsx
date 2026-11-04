import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StructurePanel, allBlockIds } from "@/components/openpage/editor/StructurePanel";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const inner: BlockConfig = { id: "inner", type: "heading", variant: "default", props: { text: "Inner" } };
const outer: BlockConfig = { id: "outer", type: "columns", variant: "1-col", props: { columns: [{ width: 100, blocks: [inner] }] } };
const site: SiteConfig = { name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [outer] }] };

beforeEach(() => {
  useConfigStore.getState().setConfig(site);
  useEditorStore.setState({ navigatorExpanded: {}, structureOpen: false, selectedBlockId: null });
});

describe("Structure panel", () => {
  it("is hidden until opened, then shows the page tree", () => {
    const { rerender } = render(<StructurePanel />);
    expect(screen.queryByRole("dialog", { name: "Structure" })).toBeNull();
    useEditorStore.getState().toggleStructure();
    rerender(<StructurePanel />);
    expect(screen.getByRole("dialog", { name: "Structure" })).toBeTruthy();
    expect(screen.getByText("Heading")).toBeTruthy();
  });

  it("clicking a row selects that widget", () => {
    useEditorStore.setState({ structureOpen: true });
    render(<StructurePanel />);
    fireEvent.click(screen.getByText("Heading"));
    expect(useEditorStore.getState().selectedBlockId).toBe("inner");
  });

  it("collapse all hides nested widgets, expand all shows them", () => {
    useEditorStore.setState({ structureOpen: true });
    render(<StructurePanel />);
    fireEvent.click(screen.getByLabelText("Collapse all"));
    expect(screen.queryByText("Heading")).toBeNull();
    fireEvent.click(screen.getByLabelText("Expand all"));
    expect(screen.getByText("Heading")).toBeTruthy();
  });

  it("close button and Escape close it", () => {
    useEditorStore.setState({ structureOpen: true });
    const { rerender } = render(<StructurePanel />);
    fireEvent.click(screen.getByLabelText("Close structure"));
    expect(useEditorStore.getState().structureOpen).toBe(false);
    useEditorStore.setState({ structureOpen: true });
    rerender(<StructurePanel />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useEditorStore.getState().structureOpen).toBe(false);
  });

  it("first click on a row's arrow collapses it", () => {
    useEditorStore.getState().toggleNavigatorExpand("outer");
    expect(useEditorStore.getState().navigatorExpanded.outer).toBe(false);
    useEditorStore.getState().toggleNavigatorExpand("outer");
    expect(useEditorStore.getState().navigatorExpanded.outer).toBe(true);
  });

  it("collects nested ids", () => {
    expect(allBlockIds([outer])).toEqual(["outer", "inner"]);
  });
});
