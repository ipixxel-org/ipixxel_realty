import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { AmenitiesBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";

const block = (items: unknown[]): BlockConfig => ({ id: "a", type: "amenities", variant: "featured", props: { title: "Amenities", items } });

describe("Amenities featured template", () => {
  it("shows images on the smaller cards, not just the first", () => {
    const { container } = render(
      <AmenitiesBlock
        block={block([
          { _id: "a1", title: "Toddler's Play Area", image: "https://cdn.example/1.png" },
          { _id: "a2", title: "", image: "https://cdn.example/2.png" },
          { _id: "a3", title: "Skating Area", image: "https://cdn.example/3.png" },
        ])}
      />,
    );
    expect(container.querySelector('img[src="https://cdn.example/1.png"]')).toBeTruthy();
    expect(container.querySelector('[data-el-name="items:a2/image"] img[src="https://cdn.example/2.png"]')).toBeTruthy();
    expect(container.querySelector('[data-el-name="items:a3/image"] img[src="https://cdn.example/3.png"]')).toBeTruthy();
  });

  it("shows an uploaded icon when a smaller card has no image", () => {
    const { container } = render(
      <AmenitiesBlock block={block([{ _id: "a1", title: "First" }, { _id: "a2", title: "Gym", icon: "https://cdn.example/icon.svg" }])} />,
    );
    expect(container.querySelector('[data-el-name="items:a2/icon"] img')).toBeTruthy();
  });

  it("keeps text-only cards as before", () => {
    const { container } = render(<AmenitiesBlock block={block([{ _id: "a1", title: "First" }, { _id: "a2", title: "Bouncing Den" }])} />);
    expect(container.querySelector('[data-el-name="items:a2"] img')).toBeNull();
    expect(container.textContent).toContain("Bouncing Den");
  });
});
