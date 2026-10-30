import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { LocationBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";

const block = (variant: string, props: Record<string, unknown>): BlockConfig => ({
  id: "l",
  type: "location",
  variant,
  props: { title: "LAYOUT PLAN & FLOOR PLANS", items: [], ...props },
});

describe("Location second button", () => {
  it("shows both buttons side by side in every template", () => {
    for (const variant of ["split-map", "list", "map-only", "cards", "editorial"]) {
      const { container, unmount } = render(
        <LocationBlock block={block(variant, { ctaText: "Site Plan", secondaryCtaText: "Floor Plan", secondaryCtaUrl: "#floor-plans" })} />,
      );
      expect(container.querySelector('[data-el-name="location:cta"]')?.textContent, variant).toContain("Site Plan");
      const second = container.querySelector('[data-el-name="location:secondaryCta"]');
      expect(second?.textContent, variant).toContain("Floor Plan");
      expect(second?.getAttribute("href"), variant).toBe("#floor-plans");
      unmount();
    }
  });

  it("applies the second button's own colours", () => {
    const { container } = render(
      <LocationBlock block={block("list", { secondaryCtaText: "Floor Plan", secondaryCtaColor: "#1c407f", secondaryCtaTextColor: "#ffffff" })} />,
    );
    const el = container.querySelector<HTMLElement>('[data-el-name="location:secondaryCta"]')!;
    expect(el.style.backgroundColor).toBe("rgb(28, 64, 127)");
    expect(el.style.color).toBe("rgb(255, 255, 255)");
  });

  it("shows only the second button when the first has no text, and nothing when both are empty", () => {
    const only = render(<LocationBlock block={block("list", { secondaryCtaText: "Floor Plan" })} />);
    expect(only.container.querySelector('[data-el-name="location:cta"]')).toBeNull();
    expect(only.container.querySelector('[data-el-name="location:secondaryCta"]')).toBeTruthy();
    only.unmount();
    const none = render(<LocationBlock block={block("list", {})} />);
    expect(none.container.querySelector('[data-el-name="location:secondaryCta"]')).toBeNull();
  });
});
