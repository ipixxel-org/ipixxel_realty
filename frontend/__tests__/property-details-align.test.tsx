import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { PropertyDetailsBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";

const items = [
  { _id: "a", label: "Configuration", value: "2,3,3.5 BHK" },
  { _id: "b", label: "Sizes", value: "1325 - 2610" },
  { _id: "c", label: "Starting Price", value: "₹ 1.15 Cr*" },
  { _id: "d", label: "Tower", value: "7" },
];
const block = (props: Record<string, unknown>): BlockConfig => ({ id: "pd", type: "property-details", variant: "grid", props: { items, ...props } });
const row = (c: HTMLElement) => c.querySelector('[data-el-name="property-details:cardsRow"]') as HTMLElement | null;

describe("Property Details card row", () => {
  it("is a selectable element so Layout & Flex can move the cards", () => {
    const { container } = render(<PropertyDetailsBlock block={block({})} />);
    expect(row(container)).toBeTruthy();
    expect(row(container)!.className).toContain("flex-wrap");
  });

  it("keeps the old left alignment by default", () => {
    const { container } = render(<PropertyDetailsBlock block={block({})} />);
    expect(row(container)!.className).toContain("justify-start");
  });

  it("centres or right-aligns cards from Card alignment", () => {
    const centre = render(<PropertyDetailsBlock block={block({ cardsAlign: "center" })} />);
    expect(row(centre.container)!.className).toContain("justify-center");
    centre.unmount();
    const right = render(<PropertyDetailsBlock block={block({ cardsAlign: "right" })} />);
    expect(row(right.container)!.className).toContain("justify-end");
  });

  it("keeps each card at the old column width", () => {
    const { container } = render(<PropertyDetailsBlock block={block({})} />);
    const card = container.querySelector('[data-el-name="items:a"]') as HTMLElement;
    expect(card.className).toContain("@2xl:basis-[calc(20%-0.8rem)]");
  });
});
