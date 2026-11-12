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
        // These designs have no visible title (offer ribbon, logo-led stats, disclaimer band).
        const noTitle = ["burgundy-offers", "eldeco-stats", "eldeco-footer"];
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
});
