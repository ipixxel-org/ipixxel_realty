import { describe, expect, it, beforeEach } from "vitest";
import { useConfigStore } from "@/components/openpage/store/configStore";
import type { SiteConfig, BlockConfig } from "@/components/openpage/blocks/types";
import { deepCloneWithFreshIds } from "@/lib/openpage/block-tree";
import { elementKey } from "@/lib/openpage/element-style";
import { blockStyleTag, elementStyleTag } from "@/lib/openpage/block-style";

function hero(id: string, style?: BlockConfig["style"]): BlockConfig {
  return {
    id,
    type: "hero",
    variant: "default",
    props: {},
    style,
    elementStyles: {
      title: { typography: { color: "#111111", fontWeight: "700" } },
    },
  };
}

function site(): SiteConfig {
  return {
    name: "style independence",
    blocks: [],
    pages: [
      {
        id: "page-home",
        name: "Home",
        path: "/",
        blocks: [hero("sec-a", { backgroundColor: "#ff0000", paddingTop: "40px" }), hero("sec-b")],
      },
    ],
  };
}

function blockById(blocks: BlockConfig[], id: string): BlockConfig {
  return blocks.find((b) => b.id === id)!;
}

describe("per-section style independence", () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig(site());
  });

  it("updateBlockStyle only mutates the targeted section", () => {
    useConfigStore.getState().updateBlockStyle("sec-a", { backgroundColor: "#00ff00" });
    const blocks = useConfigStore.getState().config.pages![0].blocks;
    expect(blocks.find((b) => b.id === "sec-a")!.style!.backgroundColor).toBe("#00ff00");
    expect(blocks.find((b) => b.id === "sec-b")!.style).toBeUndefined();
  });

  it("starting a style on an unstyled section leaves other sections untouched", () => {
    useConfigStore.getState().updateBlockStyle("sec-b", { backgroundColor: "#0000ff" });
    const blocks = useConfigStore.getState().config.pages![0].blocks;
    expect(blocks.find((b) => b.id === "sec-a")!.style!.backgroundColor).toBe("#ff0000");
  });

  it("setElementStyle is scoped to one section even for a shared element id", () => {
    useConfigStore.getState().setElementStyle("sec-a", "title", { typography: { color: "#ff00ff", fontWeight: "700" } }, "desktop");
    const blocks = useConfigStore.getState().config.pages![0].blocks;
    expect(blockById(blocks, "sec-a").elementStyles!.title.typography!.color).toBe("#ff00ff");
    expect(blockById(blocks, "sec-a").elementStyles!.title.typography!.fontWeight).toBe("700");
    expect(blockById(blocks, "sec-b").elementStyles!.title.typography!.color).toBe("#111111");
    expect(blockById(blocks, "sec-b").elementStyles!.title.typography!.fontWeight).toBe("700");
  });

  it("duplicating a section does not share style or elementStyles references", () => {
    const original = hero("sec-a", { backgroundColor: "#ff0000" });
    const clone = deepCloneWithFreshIds(original);
    expect(clone.id).not.toBe(original.id);
    expect(clone.style).not.toBe(original.style);
    expect(clone.elementStyles).not.toBe(original.elementStyles);

    const cloneTitle = clone.elementStyles!.title;
    const originalTitle = original.elementStyles!.title;
    expect(cloneTitle).not.toBe(originalTitle);
    clone.style!.backgroundColor = "#00ff00";
    clone.elementStyles!.title = { typography: { color: "#0000ff" } };
    expect(original.style!.backgroundColor).toBe("#ff0000");
    expect(original.elementStyles!.title).toBe(originalTitle);
    expect(original.elementStyles!.title.typography!.color).toBe("#111111");
  });

  it("builds unique scoped selectors for identical styles on different sections", () => {
    const cssA = blockStyleTag("sec-a", { backgroundColor: "#ff0000" });
    const cssB = blockStyleTag("sec-b", { backgroundColor: "#ff0000" });
    expect(cssA).toContain('[data-block-id="sec-a"]');
    expect(cssB).toContain('[data-block-id="sec-b"]');
    expect(cssA).not.toContain('[data-block-id="sec-b"]');
    expect(cssA).not.toBe(cssB);
  });

  it("element keys are namespaced by block id so equal ids never collide", () => {
    expect(elementKey("sec-a", "title")).toBe("sec-a|title");
    expect(elementKey("sec-b", "title")).toBe("sec-b|title");
    const cssA = elementStyleTag(elementKey("sec-a", "title"), { typography: { color: "#111111" } });
    const cssB = elementStyleTag(elementKey("sec-b", "title"), { typography: { color: "#111111" } });
    expect(cssA).toContain('[data-el-id="sec-a|title"]');
    expect(cssA).not.toContain("sec-b|title");
    expect(cssA).not.toBe(cssB);
  });
});