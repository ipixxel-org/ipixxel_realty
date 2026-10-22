import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconBoxBlock } from "@/components/openpage/blocks/core/CoreWidgets";
import { GalleryBlock } from "@/components/openpage/blocks/gallery/GalleryBlock";
import { HeroBlock } from "@/components/openpage/blocks/hero/HeroBlock";
import { NavbarBlock } from "@/components/openpage/blocks/navbar/NavbarBlock";
import { PricingBlock } from "@/components/openpage/blocks/pricing/PricingBlock";
import { AmenitiesBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { createBlockFromType } from "@/lib/openpage/block-factory";

function block(type: BlockConfig["type"], props: Record<string, unknown>, variant = "default"): BlockConfig {
  return { id: `${type}-test`, type, variant, props };
}

describe("builder component controls", () => {
  it("resizes a logo independently by width and height", () => {
    const { container } = render(
      <NavbarBlock
        block={block("navbar", {
          logo: "Brand",
          logoImage: "/brand.svg",
          logoWidth: 180,
          logoHeight: 42,
          ctaText: "",
        })}
      />,
    );
    const image = container.querySelector("img");
    expect(image).toHaveStyle({ width: "180px", height: "42px" });
  });

  it("applies hero heading and subtitle typography independently", () => {
    const { container } = render(
      <HeroBlock
        block={{
          ...block("hero", { headline: "Find a home", subheadline: "Explore the collection" }),
          elementStyles: {
            "hero:title": { typography: { fontSize: "48px", fontWeight: "900", color: "#123456" } },
            "hero:subtitle": { typography: { fontSize: "18px", color: "#654321" } },
          },
        }}
      />,
    );

    expect(container.querySelector('[data-el-name="hero:title"]')).toBeInTheDocument();
    expect(container.querySelector('[data-el-name="hero:subtitle"]')).toBeInTheDocument();
    expect(container.innerHTML).toContain("font-size:48px !important");
    expect(container.innerHTML).toContain("font-weight:900 !important");
    expect(container.innerHTML).toContain("font-size:18px !important");
    expect(container.innerHTML).toContain("color:#654321 !important");
  });

  it("renders multiple icon boxes with per-item background colors", () => {
    const { container } = render(
      <IconBoxBlock
        block={block("icon-box", {
          items: [
            { _id: "pool", title: "Pool", description: "Swimming", iconBg: "#123456" },
            { _id: "gym", title: "Gym", description: "Fitness", iconBg: "#abcdef" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Pool")).toBeInTheDocument();
    expect(screen.getByText("Gym")).toBeInTheDocument();
    expect(container.querySelector('[data-el-name="items:pool/icon"]')).toHaveStyle({
      backgroundColor: "#123456",
    });
    expect(container.querySelector('[data-el-name="items:gym/icon"]')).toHaveStyle({
      backgroundColor: "#abcdef",
    });
  });

  it("applies a price color only to the price element", () => {
    const { container } = render(
      <PricingBlock
        block={block(
          "pricing",
          {
            title: "Plans",
            subtitle: "Choose a plan",
            priceColor: "#123456",
            tiers: [
              {
                _id: "basic",
                name: "Basic",
                price: "$10",
                period: "/month",
                description: "Starter",
                features: [],
                cta: "Choose",
              },
            ],
          },
          "simple",
        )}
      />,
    );
    expect(container.querySelector('[data-el-name="tiers:basic/price"]')).toHaveStyle({
      color: "#123456",
    });
    expect(screen.getByText("Choose a plan")).not.toHaveStyle({ color: "#123456" });
  });

  it("keeps an emptied gallery empty", () => {
    const { container } = render(
      <GalleryBlock block={block("gallery", { title: "Gallery", images: [] })} />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText("Gallery")).toBeInTheDocument();
  });

  it("renders an editable amenities subtitle", () => {
    render(
      <AmenitiesBlock
        block={block("amenities", {
          title: "Amenities",
          subtitle: "Thoughtfully designed shared spaces",
          items: [],
        })}
      />,
    );
    expect(screen.getByText("Thoughtfully designed shared spaces")).toBeInTheDocument();
  });

  it("starts a new columns/container block as one full-width column", () => {
    const columns = createBlockFromType("columns");
    expect(columns?.props.columns).toEqual([{ width: 100, blocks: [] }]);
  });
});
