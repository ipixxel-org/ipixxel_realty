import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";

const div = (style: BlockConfig["style"], blocks: BlockConfig[] = []): BlockConfig => ({
  id: "d1", type: "columns", variant: "1-col", style,
  props: { kind: "div", gap: "16px", columns: [{ width: 100, blocks }] },
});
const column = (block: BlockConfig) =>
  render(<RenderBlock block={block} />).container.querySelector("[data-op-container] > div") as HTMLElement;

describe("empty Div on the live page", () => {
  it("keeps its height when it has a background colour, so the colour shows", () => {
    expect(column(div({ backgroundColor: "#10b981" })).style.minHeight).toBe("180px");
  });

  it("keeps collapsing when it has no background", () => {
    expect(column(div({ paddingTop: "4px" })).style.minHeight).toBe("");
    expect(column(div({ backgroundColor: "transparent" })).style.minHeight).toBe("");
  });

  it("uses the user's own height when one is set", () => {
    expect(column(div({ backgroundColor: "#10b981", minHeight: "60px" })).style.minHeight).toBe("");
  });

  it("is unchanged once it has widgets", () => {
    const text: BlockConfig = { id: "t1", type: "text", variant: "default", props: { body: "x" } };
    expect(column(div({ backgroundColor: "#10b981" }, [text])).style.minHeight).toBe("");
  });
});
