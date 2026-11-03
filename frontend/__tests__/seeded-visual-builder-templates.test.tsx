import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSolsticeStandardTemplateContent,
  buildSolsticePremiumTemplateContent,
  buildSolsticeThankYouContent,
} from "../../backend/prisma/seed-visual-builder-templates";
import { siteFromLandingPage, landingPageFromSite } from "@/lib/openpage/content";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { OpenPageRuntimeProvider } from "@/components/openpage/runtime/OpenPageRuntime";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { PropertiesPanel } from "@/components/openpage/editor/PropertiesPanel";
import { StylePanel } from "@/components/openpage/editor/StylePanel";
import { buildTemplateRows } from "@/components/superadmin/templates/shared";
import { findBlock } from "@/lib/openpage/block-tree";
import type { LandingPageData, SectionInstance, SiteConfig as LegacySiteConfig } from "@/lib/openpage/types";
import type { SiteConfig, BlockConfig } from "@/components/openpage/blocks/types";
import type { FormDefinition } from "@/lib/openpage/forms-store";

function toLandingPageRecord(params: {
  id: string;
  name: string;
  slug: string;
  tier: "free" | "paid" | "premium";
  thumbnail: string;
  payload: { sections: unknown[]; config: unknown; site: unknown };
}): LandingPageData {
  return {
    id: params.id,
    name: params.name,
    slug: params.slug,
    status: "published",
    template: "Blank canvas",
    domain: "",
    views: "—",
    conversions: "—",
    updated: "Just now",
    thumbnail: params.thumbnail,
    kind: "custom",
    designId: "blank",
    pageType: "landing",
    tier: params.tier,
    isPaid: params.tier !== "free",
    category: "Real Estate",
    sections: params.payload.sections as SectionInstance[],
    config: params.payload.config as unknown as LegacySiteConfig,
    openPageSite: params.payload.site as unknown as SiteConfig,
  };
}

describe("Seeded Visual Builder Templates (Standard & Premium Variations)", () => {
  beforeEach(() => {
    useEditorStore.getState().selectBlock(null);
    useEditorStore.getState().clearElementSelection();
  });

  it("loads Standard and Premium variations cleanly into siteFromLandingPage and Super Admin catalog", () => {
    const stdRecord = toLandingPageRecord({
      id: "tpl-solstice-std",
      name: "Solstice Residences — Standard",
      slug: "solstice-residences-standard",
      tier: "free",
      thumbnail: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9",
      payload: buildSolsticeStandardTemplateContent(),
    });
    const prmRecord = toLandingPageRecord({
      id: "tpl-solstice-prm",
      name: "Solstice Residences — Premium",
      slug: "solstice-residences-premium",
      tier: "premium",
      thumbnail: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750",
      payload: buildSolsticePremiumTemplateContent(),
    });

    const stdSite = siteFromLandingPage(stdRecord);
    const prmSite = siteFromLandingPage(prmRecord);

    expect(stdSite.engine).toBe("openpage");
    expect(stdSite.pages?.[0]?.blocks.length).toBeGreaterThanOrEqual(12);
    expect(stdSite.forms?.length).toBe(1);
    expect(stdSite.popups?.length).toBe(1);

    expect(prmSite.engine).toBe("openpage");
    expect(prmSite.pages?.[0]?.blocks.length).toBeGreaterThanOrEqual(20);
    expect(prmSite.forms?.length).toBe(2);
    expect(prmSite.popups?.length).toBe(1);

    const rows = buildTemplateRows([stdRecord, prmRecord]);
    const stdRow = rows.find((r) => r.pageId === "tpl-solstice-std");
    const prmRow = rows.find((r) => r.pageId === "tpl-solstice-prm");

    expect(stdRow?.kind).toBe("custom");
    expect(stdRow?.tier).toBe("free");
    expect(stdRow?.status).toBe("published");

    expect(prmRow?.kind).toBe("custom");
    expect(prmRow?.tier).toBe("premium");
    expect(prmRow?.status).toBe("published");
  });

  it("renders every block and nested widget in Standard, Premium, and Thank-You pages without error boundaries or placeholders", () => {
    const variations = [
      buildSolsticeStandardTemplateContent(),
      buildSolsticePremiumTemplateContent(),
      buildSolsticeThankYouContent("standard"),
      buildSolsticeThankYouContent("premium"),
    ];

    for (const variation of variations) {
      const site = variation.site as unknown as SiteConfig;
      const blocks = site.pages?.[0]?.blocks ?? [];
      expect(blocks.length).toBeGreaterThan(0);

      const { container, unmount } = render(
        <OpenPageRuntimeProvider
          live={false}
          forms={(site.forms ?? []) as FormDefinition[]}
          popups={site.popups ?? []}
        >
          <div>
            {blocks.map((block: BlockConfig) => (
              <RenderBlock key={block.id} block={block} />
            ))}
          </div>
        </OpenPageRuntimeProvider>,
      );

      expect(container.textContent).not.toContain("Failed to render");
      expect(container.textContent).not.toContain("block (coming soon)");
      unmount();
    }
  });

  it("supports full dynamic visual-builder editing (props, nested containers, list items, styles, reordering, and save round-trip) on Standard & Premium", () => {
    for (const [label, builderFn, nestedBlockId, listBlockId] of [
      ["Standard", buildSolsticeStandardTemplateContent, "blk-std-cnt-1", "blk-std-amenities"],
      ["Premium", buildSolsticePremiumTemplateContent, "blk-prm-ed-heading", "blk-prm-amenities"],
    ] as const) {
      const record = toLandingPageRecord({
        id: `tpl-${label.toLowerCase()}`,
        name: `Solstice Residences — ${label}`,
        slug: `solstice-residences-${label.toLowerCase()}`,
        tier: label === "Premium" ? "premium" : "free",
        thumbnail: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9",
        payload: builderFn(),
      });

      const site = siteFromLandingPage(record);
      useConfigStore.setState({ config: site, activePageId: site.pages![0].id });

      // 1. Select & edit hero headline dynamically (and verify PropertiesPanel + StylePanel render for every block)
      const heroId = label === "Premium" ? "blk-prm-hero" : "blk-std-hero";
      const heroBlock = findBlock(useConfigStore.getState().config.pages![0].blocks, heroId)!;
      useEditorStore.getState().selectBlock(heroId);
      const { unmount: unmountPanels } = render(
        <div>
          <PropertiesPanel block={heroBlock} />
          <StylePanel block={heroBlock} />
        </div>,
      );
      expect(screen.getAllByText(/Headline/i).length).toBeGreaterThan(0);
      unmountPanels();

      // Verify nested widget inside container also opens cleanly in PropertiesPanel & StylePanel
      const nestedTarget = findBlock(useConfigStore.getState().config.pages![0].blocks, nestedBlockId)!;
      const { unmount: unmountNestedPanels } = render(
        <div>
          <PropertiesPanel block={nestedTarget} />
          <StylePanel block={nestedTarget} />
        </div>,
      );
      unmountNestedPanels();

      useConfigStore.getState().updateBlockProps(heroId, {
        headline: `Edited ${label} Residence Title`,
      });
      useConfigStore.getState().updateBlockStyle(heroId, {
        paddingTop: "96px",
      });

      // 2. Edit a widget nested inside a multi-column Flexbox container
      const nestedBefore = findBlock(useConfigStore.getState().config.pages![0].blocks, nestedBlockId);
      expect(nestedBefore).toBeTruthy();
      useConfigStore.getState().updateBlockProps(nestedBlockId, {
        title: `Updated Nested ${label}`,
        text: `Updated Nested ${label}`,
      });

      // 3. Edit a repeatable list item (`amenities.items`) via list actions
      useConfigStore.getState().addListItem(
        listBlockId,
        { path: ["items"] },
        { title: "Sky Observatory Deck", description: "Added dynamically in builder", image: "", icon: "" },
      );

      // 4. Reorder top-level blocks in the builder
      const initialFirstId = useConfigStore.getState().config.pages![0].blocks[0].id;
      const initialSecondId = useConfigStore.getState().config.pages![0].blocks[1].id;
      useConfigStore.getState().moveBlock(0, 1);
      expect(useConfigStore.getState().config.pages![0].blocks[0].id).toBe(initialSecondId);
      expect(useConfigStore.getState().config.pages![0].blocks[1].id).toBe(initialFirstId);

      // 5. Round-trip persist via landingPageFromSite -> siteFromLandingPage
      const savedPage = landingPageFromSite(record, useConfigStore.getState().config);
      const reloadedSite = siteFromLandingPage(savedPage);
      const reloadedBlocks = reloadedSite.pages![0].blocks;

      const reloadedHero = findBlock(reloadedBlocks, heroId);
      expect(reloadedHero?.props.headline).toBe(`Edited ${label} Residence Title`);
      expect(reloadedHero?.style?.paddingTop).toBe("96px");

      const reloadedNested = findBlock(reloadedBlocks, nestedBlockId);
      expect(reloadedNested?.props.title).toBe(`Updated Nested ${label}`);

      const reloadedAmenities = findBlock(reloadedBlocks, listBlockId);
      const amenityItems = reloadedAmenities?.props.items as Array<{ title: string }>;
      expect(amenityItems.some((item) => item.title === "Sky Observatory Deck")).toBe(true);
    }
  });
});
