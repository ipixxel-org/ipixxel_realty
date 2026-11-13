import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import type { BlockConfig, BlockType } from "@/components/openpage/blocks/types";
import { PropertiesPanel } from "@/components/openpage/editor/PropertiesPanel";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { IPX_FIELD_VARIANTS, IPX_INSPECTOR_FIELDS } from "@/lib/openpage/ipixxel-blocks";
import { IpixxelHeroBlock } from "@/components/openpage/blocks/ipixxel/IpixxelHeroBlock";
import { IpxHighlightsBlock, IpxOverviewBlock } from "@/components/openpage/blocks/ipixxel/IpxStoryBlocks";
import { IpxAmenitiesBlock, IpxFloorPlansBlock, IpxGalleryBlock, IpxMasterPlanBlock } from "@/components/openpage/blocks/ipixxel/IpxShowcaseBlocks";
import { IpxAboutBlock, IpxLocationBlock, IpxPricingBlock } from "@/components/openpage/blocks/ipixxel/IpxDetailBlocks";
import { IpxCtaBlock, IpxFooterBlock, IpxFormBlock } from "@/components/openpage/blocks/ipixxel/IpxActionBlocks";
import { IpxSpecsBlock } from "@/components/openpage/blocks/ipixxel/IpxEmeraldBlocks";

const RENDERERS: Record<string, ComponentType<{ block: BlockConfig }>> = {
  "ipixxel-hero": IpixxelHeroBlock,
  "ipx-overview": IpxOverviewBlock,
  "ipx-highlights": IpxHighlightsBlock,
  "ipx-amenities": IpxAmenitiesBlock,
  "ipx-pricing": IpxPricingBlock,
  "ipx-floorplans": IpxFloorPlansBlock,
  "ipx-masterplan": IpxMasterPlanBlock,
  "ipx-specs": IpxSpecsBlock,
  "ipx-gallery": IpxGalleryBlock,
  "ipx-location": IpxLocationBlock,
  "ipx-about": IpxAboutBlock,
  "ipx-cta": IpxCtaBlock,
  "ipx-form": IpxFormBlock,
  "ipx-footer": IpxFooterBlock,
};

const heroBlock = (variant: string): BlockConfig => ({ ...createBlockFromType("ipixxel-hero")!, id: "hero-1", variant });

/** Same props with every empty image / text filled, so optional parts render too. */
function filled(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...props, slides: [{ src: "https://x.test/b.jpg" }], whatsapp: "+91 90000 11111" };
  for (const [k, v] of Object.entries(props)) {
    if (v === "") out[k] = /image|logo|src|qr|badge/i.test(k) ? "https://x.test/a.jpg" : "Sample";
  }
  return out;
}

describe("iPixxel inspector shows only the chosen template's fields", () => {
  it("offer slider hero hides the other templates' fields", () => {
    render(<PropertiesPanel block={heroBlock("offer-slider")} />);
    expect(screen.getByText("Logo tagline")).toBeTruthy();
    expect(screen.getByText("Benefit text")).toBeTruthy();
    expect(screen.queryByText("Brand name")).toBeNull(); // template 1
    expect(screen.queryByText("Left stat label")).toBeNull(); // template 2
    expect(screen.queryByText("Offer ribbon")).toBeNull(); // template 4
    expect(screen.queryByText(/Enquire tab \(template 2\)/i)).toBeNull();
    expect(screen.queryByText(/Grand band \(template 1\)/i)).toBeNull();
  });

  it("skyline hero shows its own fields instead", () => {
    render(<PropertiesPanel block={heroBlock("skyline")} />);
    expect(screen.getByText("Left stat label")).toBeTruthy();
    expect(screen.queryByText("Benefit text")).toBeNull();
    expect(screen.queryByText("Logo tagline")).toBeNull();
  });

  it("hidden fields do not leak into Additional Properties", () => {
    render(<PropertiesPanel block={heroBlock("grand-band")} />);
    expect(screen.queryByText(/Additional Properties/i)).toBeNull();
  });

  it("an unknown template falls back to the first template's fields", () => {
    render(<PropertiesPanel block={heroBlock("nope")} />);
    expect(screen.getByText("Brand name")).toBeTruthy();
  });

  it("every mapped key is a real field and every template name is real", () => {
    for (const [type, map] of Object.entries(IPX_FIELD_VARIANTS)) {
      const meta = blockMetadata.find((b) => b.type === type)!;
      const keys =
        type === "ipixxel-hero"
          ? null // hero fields live in PropertiesPanel; checked by the render tests above
          : new Set(IPX_INSPECTOR_FIELDS[type].sections.flatMap((s) => s.fields.map((f) => f.key)));
      for (const [key, variants] of Object.entries(map)) {
        if (keys) expect(keys.has(key), `${type}.${key}`).toBe(true);
        expect(variants.length, `${type}.${key}`).toBeGreaterThan(0);
        for (const v of variants) expect(meta.variants, `${type}.${key} → ${v}`).toContain(v);
      }
    }
  });

  it("no template reads a field that is hidden for it", () => {
    for (const [type, Renderer] of Object.entries(RENDERERS)) {
      const meta = blockMetadata.find((b) => b.type === type)!;
      const map = IPX_FIELD_VARIANTS[type] ?? {};
      for (const variant of meta.variants) {
        const base = createBlockFromType(type as BlockType)!;
        for (const props of [base.props, filled(base.props)]) {
          const read = new Set<string>();
          const proxy = new Proxy(props, {
            get(target, key) {
              if (typeof key === "string") read.add(key);
              return (target as Record<string, unknown>)[key as string];
            },
          });
          render(<Renderer block={{ ...base, variant, props: proxy }} />);
          cleanup();
          for (const key of read) {
            if (map[key]) expect(map[key], `${type} / ${variant} reads "${key}"`).toContain(variant);
          }
        }
      }
    }
  });
});
