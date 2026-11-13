import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig, BlockType } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { PICKER_GROUPS } from "@/components/openpage/editor/LayersPanel";
import { ELEMENT_ITEM_FIELDS, ELEMENT_ITEM_TEMPLATES } from "@/components/openpage/editor/element-fields";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { IPX_WIDGETS } from "@/lib/openpage/ipixxel-blocks";

const make = (type: string, variant?: string, props: Record<string, unknown> = {}): BlockConfig => {
  const block = createBlockFromType(type as BlockType)!;
  return { ...block, variant: variant ?? block.variant, props: { ...block.props, ...props } };
};

/** True when React's error boundary replaced the widget (render crash). */
function crashed(container: HTMLElement): boolean {
  return /something went wrong|failed to render/i.test(container.textContent ?? "") || !container.querySelector("section");
}

describe("iPixxel Realty section widgets", () => {
  it("are all offered in the iPixxel Realty group, after the Hero", () => {
    const group = PICKER_GROUPS.find((g) => g.id === "ipixxel")!;
    expect(group.types[0]).toBe("ipixxel-hero");
    for (const w of IPX_WIDGETS) expect(group.types).toContain(w.type);
  });

  it("are registered in the block catalogue with their templates", () => {
    for (const w of IPX_WIDGETS) {
      const meta = blockMetadata.find((b) => b.type === w.type);
      expect(meta?.variants, w.type).toEqual(w.variants);
    }
  });

  it("every list prop has inspector fields and an empty-item template", () => {
    for (const w of IPX_WIDGETS) {
      for (const key of Object.keys(w.itemFields)) {
        expect(ELEMENT_ITEM_FIELDS[`${w.type}.${key}`], `${w.type}.${key}`).toBeTruthy();
        expect(ELEMENT_ITEM_TEMPLATES[w.type]?.[key], `${w.type}.${key} template`).toBeTruthy();
      }
    }
  });

  for (const w of IPX_WIDGETS) {
    for (const v of w.variants) {
      it(`${w.type} / ${v} renders its default content`, () => {
        const { container } = render(<RenderBlock block={make(w.type, v)} />);
        expect(crashed(container), `${w.type}/${v}`).toBe(false);
        const title = String(w.defaultProps.title ?? "");
        // These designs have no visible title (offer ribbon / band, logo-led stats, disclaimer band).
        const noTitle = ["burgundy-offers", "eldeco-stats", "eldeco-footer", "emerald-offer", "modern-columns"];
        if (title && !noTitle.includes(v)) {
          expect(container.textContent).toContain(title);
        }
      });
    }

    it(`${w.type} survives empty props and an unknown template`, () => {
      const block = createBlockFromType(w.type as BlockType)!;
      const { container } = render(<RenderBlock block={{ ...block, variant: "nope", props: {} }} />);
      expect(crashed(container)).toBe(false);
    });
  }

  it("gallery tabs switch between Exterior and Interior images", () => {
    render(
      <RenderBlock
        block={make("ipx-gallery", "eldeco-grid", {
          images: [
            { src: "", category: "Exterior", caption: "Tower view" },
            { src: "", category: "Interior", caption: "Living room" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Tower view")).toBeTruthy();
    expect(screen.queryByText("Living room")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Interior" }));
    expect(screen.getByText("Living room")).toBeTruthy();
    expect(screen.queryByText("Tower view")).toBeNull();
  });

  it("floor plan tabs switch the plan and its price", () => {
    render(<RenderBlock block={make("ipx-floorplans", "tarc-details")} />);
    expect(screen.getByText("₹ 2.4 Cr*")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 BHK" }));
    expect(screen.getByText("₹ 3.9 Cr*")).toBeTruthy();
  });

  it("location map only embeds https Google Maps, never other schemes", () => {
    const { container, rerender } = render(<RenderBlock block={make("ipx-location", "tarc-map", { mapEmbed: "Sector 63A, Gurugram" })} />);
    expect(container.querySelector("iframe")?.getAttribute("src")).toMatch(/^https:\/\/www\.google\.com\/maps\?q=/);
    rerender(<RenderBlock block={make("ipx-location", "tarc-map", { mapEmbed: "data:text/html,<script>alert(1)</script>" })} />);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("a button colour from the inspector wins over the template colour", () => {
    render(<RenderBlock block={make("ipx-cta", "burgundy-cta", { buttonColor: "#112233" })} />);
    const btn = screen.getByText("Book Private Preview").closest("a, button") as HTMLElement;
    expect(btn.style.backgroundColor).toBe("rgb(17, 34, 51)");
  });

  it("buttons and texts disappear when cleared", () => {
    const { container } = render(<RenderBlock block={make("ipx-cta", "burgundy-cta", { buttonText: "", eyebrow: "" })} />);
    expect(container.querySelector("a, button")).toBeNull();
    expect(container.textContent).not.toContain("The Time Is Now");
  });

  it("footer link only uses safe URLs", () => {
    const { container } = render(<RenderBlock block={make("ipx-footer", "tarc-footer", { linkUrl: "javascript:alert(1)" })} />);
    const link = screen.getByText("Disclaimer & Privacy Policy");
    expect(link.getAttribute("href")).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
  });

  it("switching template on a live widget keeps React happy (hook order)", () => {
    const { container, rerender } = render(<RenderBlock block={make("ipx-floorplans", "tarc-details")} />);
    for (const v of ["emerald-tabs", "burgundy-tabs", "emerald-tabs", "tarc-details"]) {
      rerender(<RenderBlock block={make("ipx-floorplans", v)} />);
      expect(crashed(container), v).toBe(false);
    }
  });

  it("modern floor plan cards show the starting price and areas", () => {
    const { container } = render(<RenderBlock block={make("ipx-floorplans", "modern-cards")} />);
    expect(screen.getByText("₹ 3.9 Cr*")).toBeTruthy();
    expect(screen.getAllByText("Starting Price").length).toBe(2);
    expect(container.textContent).toContain("194 sq.m. / 2,087 sq.ft. (Approx.)");
    expect(screen.getAllByText("Carpet Area").length).toBe(2);
    expect(screen.getAllByText("1 Sq M - 10.764 Sq Ft").length).toBe(2);
  });

  it("modern floor plan cards hide price and areas when empty", () => {
    const plans = [{ title: "2 BHK", image: "", price: "", specs: "", text: "Compact homes." }];
    const { container } = render(<RenderBlock block={make("ipx-floorplans", "modern-cards", { plans })} />);
    expect(container.textContent).toContain("Compact homes.");
    expect(container.textContent).not.toContain("Starting Price");
  });

  it("emerald floor plan tabs switch the plan", () => {
    render(<RenderBlock block={make("ipx-floorplans", "emerald-tabs")} />);
    const tab = screen.getByRole("tab", { name: "4 BHK" });
    expect(tab.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
  });

  it("emerald offer band shows the offer and price", () => {
    const { container } = render(<RenderBlock block={make("ipx-highlights", "emerald-offer")} />);
    expect(container.textContent).toContain("Free Club Membership");
    expect(container.textContent).toContain("30:40:30");
    expect(container.textContent).toContain("₹ 1.85 Cr*");
  });

  it("emerald location puts the first place above the map and splits the rest", () => {
    const { container } = render(<RenderBlock block={make("ipx-location", "emerald-map")} />);
    expect(container.querySelectorAll("li")).toHaveLength(7);
    expect(container.textContent).toContain("City Hospital");
  });

  it("emerald specifications list each point", () => {
    const { container } = render(<RenderBlock block={make("ipx-specs", "emerald-specs", { items: [{ title: "Kitchen", text: "RO unit\nGranite top" }] })} />);
    expect(screen.getByText("Granite top")).toBeTruthy();
    expect(container.textContent).toContain("Project Specifications");
  });

  it("emerald footer expands the disclaimer and keeps the link safe", () => {
    render(<RenderBlock block={make("ipx-footer", "emerald-footer", { linkUrl: "javascript:alert(1)" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Read more" }));
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
    expect(screen.getByText("Disclaimer & Privacy Policy").getAttribute("href")).toBeNull();
  });

  it("emerald price rows button colour comes from the inspector", () => {
    const { container } = render(<RenderBlock block={make("ipx-pricing", "emerald-rows", { cardButtonColor: "#112233" })} />);
    const section = container.querySelector("section") as HTMLElement;
    expect(section.style.getPropertyValue("--ipx-btn-bg")).toBe("#112233");
  });

  it("dark templates set white as the section text colour", () => {
    const { container } = render(<RenderBlock block={make("ipx-about", "emerald-about")} />);
    expect((container.querySelector("section") as HTMLElement).style.color).toBe("rgb(255, 255, 255)");
  });

  it("modern landscape tabs switch between categories", () => {
    render(
      <RenderBlock
        block={make("ipx-gallery", "modern-tabs", {
          images: [
            { src: "", category: "Temperate", caption: "Temperate Enclave", text: "Leisure and wellness" },
            { src: "", category: "Tropical", caption: "Tropical Court", text: "Palms and pools" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Temperate Enclave")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Tropical" }));
    expect(screen.getByText("Tropical Court")).toBeTruthy();
    expect(screen.queryByText("Temperate Enclave")).toBeNull();
  });

  it("modern footer columns keep only safe links", () => {
    const { container } = render(
      <RenderBlock
        block={make("ipx-footer", "modern-columns", {
          columns: [{ title: "Contact", links: "Call | tel:+911234\nBad | javascript:alert(1)\n# Projects\nSite | https://example.com" }],
          bottomLinks: "Privacy | /privacy",
        })}
      />,
    );
    expect(container.innerHTML).not.toContain("javascript:");
    expect(screen.getByText("Call").getAttribute("href")).toBe("tel:+911234");
    expect(screen.getByText("Bad").getAttribute("href")).toBeNull();
    expect(screen.getByText("Site").getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Projects").tagName).toBe("LI");
    expect(screen.getByText("Privacy").getAttribute("href")).toBe("/privacy");
  });

  it("emerald form uses an uploaded background image; unsafe values are ignored", () => {
    const { container, rerender } = render(<RenderBlock block={make("ipx-form", "emerald-form", { bgImage: "https://cdn.test/tower.jpg" })} />);
    expect(container.querySelector('img[src="https://cdn.test/tower.jpg"]')).toBeTruthy();
    rerender(<RenderBlock block={make("ipx-form", "emerald-form", { bgImage: "javascript:alert(1)" })} />);
    expect(container.innerHTML).not.toContain("javascript:");
    expect(container.querySelector("img")).toBeNull();
  });

  it("emerald overview shows an uploaded image at its own height (no crop)", () => {
    const { container } = render(<RenderBlock block={make("ipx-overview", "emerald-overview", { image: "https://cdn.test/poster.jpg" })} />);
    const img = container.querySelector('img[src="https://cdn.test/poster.jpg"]') as HTMLElement;
    expect(img.className).toContain("h-auto");
    expect(img.parentElement?.className).not.toContain("aspect-");
  });

  it("emerald highlights and offer band accept a background image", () => {
    for (const v of ["emerald-list", "emerald-offer"]) {
      const { container, unmount } = render(<RenderBlock block={make("ipx-highlights", v, { bgImage: "https://cdn.test/leaves.jpg" })} />);
      expect(container.querySelector('img[src="https://cdn.test/leaves.jpg"]'), v).toBeTruthy();
      unmount();
    }
  });

  it("emerald key highlights puts the second title line below the title", () => {
    render(<RenderBlock block={make("ipx-highlights", "emerald-list", { title: "Highlights", titleAccent: "Second Line" })} />);
    const accent = screen.getByText("Second Line");
    // Own sub-heading below the title row; the rule stays beside the title.
    expect(accent.tagName).toBe("H3");
    expect(screen.getByText("Highlights").closest("h2")?.textContent).toBe("Highlights");
  });

  it("modern overview shows its stats card", () => {
    const { container } = render(<RenderBlock block={make("ipx-overview", "modern-overview")} />);
    expect(container.textContent).toContain("48");
    expect(container.textContent).toContain("Towers");
  });
});
