import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { PICKER_GROUPS } from "@/components/openpage/editor/LayersPanel";

const make = (variant?: string, props: Record<string, unknown> = {}): BlockConfig => {
  const block = createBlockFromType("ipixxel-hero")!;
  return { ...block, variant: variant ?? block.variant, props: { ...block.props, ...props } };
};

describe("iPixxel Realty → Hero widget", () => {
  it("has its own iPixxel Realty group in the Blocks panel", () => {
    const group = PICKER_GROUPS.find((g) => g.id === "ipixxel");
    expect(group?.title).toBe("iPixxel Realty");
    expect(group?.types[0]).toBe("ipixxel-hero");
  });

  it("starts on the first template", () => {
    expect(createBlockFromType("ipixxel-hero")!.variant).toBe("grand-band");
  });

  it("grand band shows the brand lock-up, tagline, price band and offer card", () => {
    render(<RenderBlock block={make("grand-band")} />);
    expect(screen.getByText("AURUM")).toBeTruthy();
    expect(screen.getByText("VISTA")).toBeTruthy();
    expect(screen.getByText("Terraces to Forever Greens")).toBeTruthy();
    expect(screen.getByText("3 & 4 BR Oxy-rich Residences Starting ₹ 2.37 Cr*")).toBeTruthy();
    expect(screen.getByText("30:40:30*")).toBeTruthy();
  });

  it("skyline shows the title, both stats, location, gallery and the enquire tab", () => {
    render(<RenderBlock block={make("skyline")} />);
    expect(screen.getByText("Four-side Open Residences")).toBeTruthy();
    expect(screen.getByText("4BHK")).toBeTruthy();
    expect(screen.getByText("₹ 9.7 Cr*")).toBeTruthy();
    expect(screen.getByText("Sector 150, Noida")).toBeTruthy();
    expect(screen.getByText("Gallery")).toBeTruthy();
    expect(screen.getByText("Enquire Now")).toBeTruthy();
    expect(screen.getByText("Call Now").closest("a")?.getAttribute("href")).toBe("tel:+919000000000");
  });

  it("offer slider shows the offer stack, price band and header button", () => {
    render(<RenderBlock block={make("offer-slider")} />);
    expect(screen.getByText("Book Your Dream Home")).toBeTruthy();
    expect(screen.getByText("Drive Your Dream Car")).toBeTruthy();
    expect(screen.getByText("₹20 LAKHS")).toBeTruthy();
    expect(screen.getByText("₹2.40 CR*")).toBeTruthy();
    expect(screen.getByText("Get Price & Brochure")).toBeTruthy();
    // One slide: no arrows.
    expect(screen.queryByLabelText("Next slide")).toBeNull();
  });

  it("offer slider arrows move between slides; offer text stays on the first slide only", () => {
    render(<RenderBlock block={make("offer-slider", { image: "a.jpg", slides: [{ src: "b.jpg" }, { src: "c.jpg" }] })} />);
    expect(screen.getByText("Book Your Dream Home")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(screen.queryByText("Book Your Dream Home")).toBeNull();
    fireEvent.click(screen.getByLabelText("Previous slide"));
    expect(screen.getByText("Book Your Dream Home")).toBeTruthy();
  });

  it("switching template keeps the user's shared content", () => {
    const props = { location: "Golf Course Road, Gurugram" };
    const { rerender } = render(<RenderBlock block={make("grand-band", props)} />);
    expect(screen.getByText("Golf Course Road, Gurugram")).toBeTruthy();
    rerender(<RenderBlock block={make("skyline", props)} />);
    expect(screen.getByText("Golf Course Road, Gurugram")).toBeTruthy();
  });

  it("a button colour from the inspector wins over the template accent", () => {
    render(<RenderBlock block={make("skyline", { primaryCtaColor: "#112233" })} />);
    const tab = screen.getByText("Enquire Now").closest("button, a") as HTMLElement;
    expect(tab.style.backgroundColor).toBe("rgb(17, 34, 51)");
  });

  it("an unknown template or empty props falls back safely instead of crashing", () => {
    const block = createBlockFromType("ipixxel-hero")!;
    const { container } = render(<RenderBlock block={{ ...block, variant: "nope", props: {} }} />);
    expect(container.querySelector("section")).toBeTruthy();
  });
});
