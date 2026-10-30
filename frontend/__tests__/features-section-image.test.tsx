import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { FeaturesBlock } from "@/components/openpage/blocks/features/FeaturesBlock";

const items = [{ _id: "f1", title: "Over 2,00,000 sq. ft. of Kid-Centric Amenities", description: "" }];
const block = (variant: string, props: Record<string, unknown>): BlockConfig => ({
  id: "f",
  type: "features",
  variant,
  props: { title: "HIGHLIGHTS", items, ...props },
});
const IMG = "https://cdn.example/highlights.jpg";

describe("Project Highlights (features) section image and button", () => {
  it("shows the uploaded section image in every template", () => {
    for (const variant of ["grid", "list", "alternating"]) {
      const { container, unmount } = render(<FeaturesBlock block={block(variant, { image: IMG })} />);
      expect(container.querySelector(`[data-el-name="features:image"] img[src="${IMG}"]`), variant).toBeTruthy();
      unmount();
    }
  });

  it("puts the image beside the list in the list template", () => {
    const { container } = render(<FeaturesBlock block={block("list", { image: IMG })} />);
    expect(container.innerHTML).toContain("@lg:grid-cols-2");
  });

  it("shows a card's own image in the alternating template", () => {
    const { container } = render(
      <FeaturesBlock block={block("alternating", { items: [{ _id: "f1", title: "T", description: "", image: "https://cdn.example/item.jpg" }] })} />,
    );
    expect(container.querySelector('img[src="https://cdn.example/item.jpg"]')).toBeTruthy();
  });

  it("applies the Section ID and draws the button", () => {
    const { container } = render(<FeaturesBlock block={block("grid", { anchor: "highlights", ctaText: "Click Here" })} />);
    expect(container.querySelector("section#highlights")).toBeTruthy();
    expect(container.textContent).toContain("Click Here");
  });

  it("falls back to Button Text, but a cleared Button text hides the button", () => {
    const legacy = render(<FeaturesBlock block={block("grid", { buttonText: "Click Here" })} />);
    expect(legacy.container.textContent).toContain("Click Here");
    legacy.unmount();
    const cleared = render(<FeaturesBlock block={block("grid", { ctaText: "", buttonText: "Click Here" })} />);
    expect(cleared.container.textContent).not.toContain("Click Here");
  });

  it("looks unchanged without image, anchor or button", () => {
    const { container } = render(<FeaturesBlock block={block("grid", {})} />);
    expect(container.querySelector('[data-el-name="features:image"]')).toBeNull();
    expect(container.querySelector("section")?.getAttribute("id")).toBeNull();
  });
});
