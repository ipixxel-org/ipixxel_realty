import { describe, expect, it } from "vitest";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { blockMetadata } from "@/lib/openpage/block-metadata";

describe("Section widget", () => {
  it("creates a single full-width container block", () => {
    const block = createBlockFromType("section")!;
    expect(block.type).toBe("columns");
    expect(block.id).toMatch(/^block-section-/);
    expect(block.props.columns).toEqual([{ width: 100, blocks: [] }]);
  });

  it("is listed in the Blocks panel metadata", () => {
    expect(blockMetadata.find((b) => b.type === "section")?.label).toBe("Section");
  });

  it("Container also starts as one column, and blocks never share default lists", () => {
    expect(createBlockFromType("columns")!.props.columns).toEqual([{ width: 100, blocks: [] }]);
    const a = createBlockFromType("faq")!;
    const b = createBlockFromType("faq")!;
    if (Array.isArray(a.props.items)) expect(a.props.items).not.toBe(b.props.items);
  });
});
