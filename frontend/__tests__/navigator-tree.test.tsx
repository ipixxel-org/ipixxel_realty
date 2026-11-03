import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { NavigatorTree } from "@/components/openpage/editor/NavigatorTree";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const inner: BlockConfig = { id: "inner", type: "heading", variant: "default", props: { text: "Inner" } };
const outer: BlockConfig = {
  id: "outer",
  type: "columns",
  variant: "1-col",
  props: { columns: [{ width: 100, blocks: [inner] }] },
};
const rootText: BlockConfig = { id: "root", type: "text", variant: "default", props: { text: "Intro copy" } };
const site: SiteConfig = {
  name: "s",
  blocks: [],
  pages: [{ id: "p", name: "Home", path: "/", blocks: [outer, rootText] }],
};

beforeEach(() => {
  useConfigStore.getState().setConfig(site);
  useEditorStore.getState().selectBlock(null);
  useEditorStore.setState({ navigatorExpanded: {} });
});

describe("navigator tree", () => {
  it("shows nested blocks under their container", () => {
    render(<NavigatorTree />);
    expect(screen.getByText("Container / Columns")).toBeTruthy();
    expect(screen.getByText("Heading")).toBeTruthy();
    expect(screen.getByText("Text Editor")).toBeTruthy();
  });

  it("selects a block when its row is clicked", () => {
    render(<NavigatorTree />);
    fireEvent.click(screen.getByText("Heading"));
    expect(useEditorStore.getState().selectedBlockId).toBe("inner");
  });

  it("filters the tree by search", () => {
    render(<NavigatorTree />);
    fireEvent.change(screen.getByLabelText("Search elements"), { target: { value: "Heading" } });
    expect(screen.queryByText("Text Editor")).toBeNull();
    expect(screen.getByText("Heading")).toBeTruthy();
    // A matching child keeps its ancestors visible.
    expect(screen.getByText("Container / Columns")).toBeTruthy();
  });

  it("renames a block and stores the custom label", () => {
    render(<NavigatorTree />);
    fireEvent.doubleClick(screen.getByText("Text Editor"));
    const input = screen.getByLabelText("Rename element");
    fireEvent.change(input, { target: { value: "Intro" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useConfigStore.getState().getActivePageBlocks()[1].props.__label).toBe("Intro");
    expect(screen.getByText("Intro")).toBeTruthy();
  });

  it("deletes a block from the row actions", () => {
    render(<NavigatorTree />);
    const row = screen.getByText("Text Editor").parentElement!;
    fireEvent.click(within(row).getByLabelText("Delete"));
    expect(useConfigStore.getState().getActivePageBlocks().map((b) => b.id)).toEqual(["outer"]);
  });
});
