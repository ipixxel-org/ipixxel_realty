import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { blockStyleTag } from "@/lib/openpage/block-style";

const css = (block: BlockConfig) =>
  Array.from(render(<RenderBlock block={block} />).container.querySelectorAll("style"))
    .map((s) => s.textContent)
    .join("\n");

describe("Style padding on small widgets replaces their built-in spacing", () => {
  it("padding 0 on a Heading removes its own spacing on every set side", () => {
    const out = css({ id: "h", type: "heading", variant: "default", props: { text: "configuration" }, style: { paddingTop: "0", paddingRight: "0", paddingBottom: "0", paddingLeft: "0" } });
    for (const side of ["top", "right", "bottom", "left"]) expect(out).toContain(`padding-${side}:0 !important`);
  });

  it("only the sides that are set change", () => {
    const out = css({ id: "t", type: "text", variant: "default", props: { body: "x" }, style: { paddingTop: "8px" } });
    expect(out).toContain("padding-top:0 !important");
    expect(out).not.toContain("padding-left:0");
  });

  it("no padding set: nothing changes", () => {
    expect(css({ id: "b", type: "button", variant: "solid", props: {}, style: { backgroundColor: "#fff" } })).not.toContain("padding-");
  });

  it("big sections keep their built-in spacing", () => {
    expect(css({ id: "a", type: "amenities", variant: "grid", props: { items: [] }, style: { paddingTop: "0" } })).not.toContain("padding-top:0");
    expect(blockStyleTag("x", { paddingTop: "0" })).not.toContain("padding-top:0");
  });
});
