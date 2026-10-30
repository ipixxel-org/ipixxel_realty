import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { FeaturesBlock } from "@/components/openpage/blocks/features/FeaturesBlock";
import { LocationBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";

const features = (props: Record<string, unknown>): BlockConfig => ({
  id: "f",
  type: "features",
  variant: "list",
  props: {
    title: "HIGHLIGHTS",
    items: [
      { _id: "a", title: "360° development of your child", description: "" },
      { _id: "b", title: "4-Side Ventilated Homes", description: "" },
    ],
    ...props,
  },
});
const location = (props: Record<string, unknown>): BlockConfig => ({
  id: "l",
  type: "location",
  variant: "list",
  props: { title: "Location Advantage", items: [{ _id: "s1", title: "Gaudium School", meta: "Opp. Radhey Skye" }], ...props },
});

describe("Project Highlights list bullets", () => {
  it("keeps the icon boxes by default", () => {
    const { container } = render(<FeaturesBlock block={features({})} />);
    expect(container.querySelector('[data-el-name="items:a/icon"]')).toBeTruthy();
    expect(container.querySelector("ul")).toBeNull();
  });

  it("renders a compact arrow list when Arrow is chosen", () => {
    const { container } = render(<FeaturesBlock block={features({ bulletStyle: "arrow" })} />);
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelector('[data-el-name="items:a/bullet"] svg')).toBeTruthy();
    expect(container.querySelector('[data-el-name="items:a/icon"]')).toBeNull();
    expect(container.textContent).toContain("4-Side Ventilated Homes");
  });

  it("numbers items and supports no bullet", () => {
    const numbered = render(<FeaturesBlock block={features({ bulletStyle: "number" })} />);
    expect(numbered.container.textContent).toContain("2.");
    numbered.unmount();
    const none = render(<FeaturesBlock block={features({ bulletStyle: "none" })} />);
    expect(none.container.querySelector('[data-el-name="items:a/bullet"]')).toBeNull();
  });

  it("ignores an unknown bullet value (falls back to icon boxes)", () => {
    const { container } = render(<FeaturesBlock block={features({ bulletStyle: "zigzag" })} />);
    expect(container.querySelector('[data-el-name="items:a/icon"]')).toBeTruthy();
  });
});

describe("Location nearby bullets", () => {
  it("keeps the location pin by default", () => {
    const { container } = render(<LocationBlock block={location({})} />);
    expect(container.querySelector(".lucide-map-pin")).toBeTruthy();
  });

  it("can be overridden with an arrow", () => {
    const { container } = render(<LocationBlock block={location({ bulletStyle: "arrow" })} />);
    expect(container.querySelector('[data-el-name="items:s1/title"] .lucide-chevron-right')).toBeTruthy();
  });
});
