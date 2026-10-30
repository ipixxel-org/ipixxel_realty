import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RePricingBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import { RE_PRICING_CARD_FIELDS } from "@/components/openpage/editor/field-helpers";

const block = (variant: string, card: Record<string, unknown>): BlockConfig => ({
  id: "p",
  type: "re-pricing",
  variant,
  props: { title: "PRICING", items: [{ _id: "c1", name: "2 BHK", price: "₹ 1.15 Cr*", ...card }] },
});

describe("Price card description", () => {
  it("is offered in the inspector", () => {
    expect(RE_PRICING_CARD_FIELDS.some((f) => f.key === "description")).toBe(true);
  });

  it("shows under the card and is styleable", () => {
    const { container } = render(<RePricingBlock block={block("cards", { meta: "Starting Price", description: "Size 1325 - 1350 Sq. Ft." })} />);
    expect(container.querySelector('[data-el-name="items:c1/description"]')?.textContent).toBe("Size 1325 - 1350 Sq. Ft.");
  });

  it("appears in the comparison table", () => {
    const { container } = render(<RePricingBlock block={block("comparison", { description: "Size 1325 - 1350 Sq. Ft." })} />);
    expect(container.textContent).toContain("Size 1325 - 1350 Sq. Ft.");
  });

  it("adds nothing when empty", () => {
    const { container } = render(<RePricingBlock block={block("cards", { meta: "Starting Price" })} />);
    expect(container.querySelector('[data-el-name="items:c1/description"]')).toBeNull();
  });
});
