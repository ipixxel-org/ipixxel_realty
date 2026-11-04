import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BlockContextMenu } from "@/components/openpage/editor/BlockContextMenu";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";
import { applyCopiedStyle, copyBlockStyle } from "@/lib/openpage/copy-style";

const source: BlockConfig = {
  id: "a", type: "heading", variant: "default", props: { text: "A" },
  style: { backgroundColor: "#10b981", paddingTop: "20px", hideOnMobile: true },
  elementStyles: { "heading:title": { typography: { fontFamily: "Playfair Display", color: "#c9a24b" } } },
};
const target: BlockConfig = {
  id: "b", type: "heading", variant: "default", props: { text: "B" },
  style: { borderWidth: "2px", hideOnDesktop: true },
};
const text: BlockConfig = {
  id: "c", type: "text", variant: "default", props: { body: "C" },
  elementStyles: { "text:body": { typography: { color: "#111" } } },
};
const site: SiteConfig = { name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [source, target, text] }] };

const block = (id: string) => useConfigStore.getState().getActivePageBlocks().find((b) => b.id === id)!;
const menu = (b: BlockConfig) =>
  render(<BlockContextMenu block={b} index={0} totalBlocks={3} x={0} y={0} onClose={() => {}} />);

beforeEach(() => {
  useConfigStore.getState().setConfig(JSON.parse(JSON.stringify(site)));
  useEditorStore.setState({ clipboardStyle: null, copiedBlockStyle: null });
});

describe("right-click Copy Style / Paste Style", () => {
  it("pastes the full look onto the same widget type, keeping the target's visibility", () => {
    const m1 = menu(block("a"));
    fireEvent.click(screen.getByText("Copy Style"));
    m1.unmount();
    menu(block("b"));
    fireEvent.click(screen.getByText("Paste Style"));

    const b = block("b");
    expect(b.style).toEqual({ backgroundColor: "#10b981", paddingTop: "20px", hideOnDesktop: true });
    expect(b.elementStyles?.["heading:title"]?.typography?.fontFamily).toBe("Playfair Display");
    expect(b.props.text).toBe("B");
  });

  it("can be undone in one step", () => {
    const m1 = menu(block("a"));
    fireEvent.click(screen.getByText("Copy Style"));
    m1.unmount();
    menu(block("b"));
    fireEvent.click(screen.getByText("Paste Style"));
    useConfigStore.getState().undo();
    expect(block("b").style).toEqual({ borderWidth: "2px", hideOnDesktop: true });
    expect(block("b").elementStyles).toBeUndefined();
  });

  it("onto a different widget type only the block style is pasted", () => {
    const t = JSON.parse(JSON.stringify(text)) as BlockConfig;
    applyCopiedStyle(t, copyBlockStyle(source));
    expect(t.style?.backgroundColor).toBe("#10b981");
    expect(t.style?.hideOnMobile).toBeUndefined();
    expect(t.elementStyles).toEqual(text.elementStyles);
  });

  it("Paste Style is disabled until something is copied", () => {
    menu(block("b"));
    expect((screen.getByText("Paste Style").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a later copy from the Style tab wins over an older right-click copy", () => {
    useEditorStore.getState().setCopiedBlockStyle(copyBlockStyle(source));
    useEditorStore.getState().setClipboardStyle({ marginTop: "5px" });
    expect(useEditorStore.getState().copiedBlockStyle).toBeNull();
    menu(block("b"));
    fireEvent.click(screen.getByText("Paste Style"));
    expect(block("b").style).toEqual({ borderWidth: "2px", hideOnDesktop: true, marginTop: "5px" });
  });

  it("copying keeps a snapshot, so later edits to the source don't change it", () => {
    const copied = copyBlockStyle(source);
    (source.style as Record<string, unknown>).backgroundColor = "#000";
    expect(copied.style.backgroundColor).toBe("#10b981");
    (source.style as Record<string, unknown>).backgroundColor = "#10b981";
  });
});
