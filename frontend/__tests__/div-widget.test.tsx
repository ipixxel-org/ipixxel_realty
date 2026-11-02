import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { createBlockFromType, isDivBlock } from "@/lib/openpage/block-factory";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { ColumnsBlock } from "@/components/openpage/blocks/columns/ColumnsBlock";
import type { BlockConfig } from "@/components/openpage/blocks/types";

const renderBlock = (block: BlockConfig) =>
  render(
    <DndContext>
      <ColumnsBlock block={block} />
    </DndContext>,
  );

describe("Div widget", () => {
  it("is a one-column Container marked as a Div", () => {
    const block = createBlockFromType("div")!;
    expect(block.type).toBe("columns");
    expect(block.id).toMatch(/^block-div-/);
    expect(block.props).toMatchObject({ kind: "div", gap: "16px", columns: [{ width: 100, blocks: [] }] });
    expect(isDivBlock(block)).toBe(true);
    expect(blockMetadata.find((b) => b.type === "div")?.label).toBe("Div");
  });

  it("Containers and Sections are not Divs", () => {
    expect(isDivBlock(createBlockFromType("columns"))).toBe(false);
    expect(isDivBlock(createBlockFromType("section"))).toBe(false);
  });

  it("renders without the Container's padding and max width", () => {
    const div = renderBlock(createBlockFromType("div")!);
    const box = div.container.querySelector<HTMLElement>("[data-op-container]")!;
    expect(box.className).toContain("w-full");
    expect(box.className).not.toContain("max-w-6xl");
    expect(box.parentElement!.className).not.toContain("px-6");
  });

  it("keeps every Container feature: columns and Items layout", () => {
    const block = { ...createBlockFromType("div")!, props: { kind: "div", direction: "column", alignItems: "center", columns: [{ width: 50, blocks: [] }, { width: 50, blocks: [] }] } };
    const { container } = renderBlock(block);
    const box = container.querySelector<HTMLElement>("[data-op-container]")!;
    expect(box.style.flexDirection).toBe("column");
    expect(box.style.alignItems).toBe("center");
    expect(box.children.length).toBeGreaterThanOrEqual(2);
  });

  it("a regular Container still looks the same", () => {
    const { container } = renderBlock(createBlockFromType("columns")!);
    const box = container.querySelector<HTMLElement>("[data-op-container]")!;
    expect(box.className).toContain("max-w-6xl");
    expect(box.parentElement!.className).toContain("px-6");
  });
});
