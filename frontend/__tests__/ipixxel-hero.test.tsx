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
    const { container } = render(<RenderBlock block={make("offer-slider")} />);
    expect(screen.getByText("Book Your Dream Home")).toBeTruthy();
    expect(screen.getByText("Drive Your Dream Car")).toBeTruthy();
    expect(screen.getByText("₹20 LAKHS")).toBeTruthy();
    expect(container.textContent).toContain("₹2.40 CR*");
    expect(container.textContent).toContain("30th Sep");
    expect(screen.getByText("Get Price & Brochure")).toBeTruthy();
    // Arrows, dots and WhatsApp (falls back to the phone) show as in the design.
    expect((screen.getByLabelText("Next slide") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Go to slide 1")).toBeTruthy();
    expect(screen.getByLabelText("WhatsApp").getAttribute("href")).toBe("https://wa.me/919000000000");
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

  it("emerald slider shows the title, price row, plan, ribbon and phone", () => {
    render(<RenderBlock block={make("emerald-slider", { whatsapp: "+91 90000 11111" })} />);
    expect(screen.getByText("Emerald Heights")).toBeTruthy();
    expect(screen.getByText("3 & 4 BHK Apartments")).toBeTruthy();
    expect(screen.getByText("₹ 1.85 Cr*")).toBeTruthy();
    expect(screen.getByText("Payment Plan: 30:40:30")).toBeTruthy();
    expect(screen.getByText("Offer valid for the first 25 bookings only*")).toBeTruthy();
    expect(screen.getByText("+91 90000 00000").closest("a")?.getAttribute("href")).toBe("tel:+919000000000");
    expect(screen.getByLabelText("WhatsApp").getAttribute("href")).toBe("https://wa.me/919000011111");
    // One slide: no dots.
    expect(screen.queryByLabelText("Go to slide 1")).toBeNull();
  });

  it("emerald slider dots switch slides; text stays on the first slide only", () => {
    render(<RenderBlock block={make("emerald-slider", { image: "a.jpg", slides: [{ src: "b.jpg" }] })} />);
    fireEvent.click(screen.getByLabelText("Go to slide 2"));
    expect(screen.queryByText("Emerald Heights")).toBeNull();
    fireEvent.click(screen.getByLabelText("Go to slide 1"));
    expect(screen.getByText("Emerald Heights")).toBeTruthy();
  });

  it("switching between slider templates keeps working", () => {
    const { container, rerender } = render(<RenderBlock block={make("offer-slider")} />);
    rerender(<RenderBlock block={make("emerald-slider")} />);
    rerender(<RenderBlock block={make("offer-slider")} />);
    expect(container.querySelector("section")).toBeTruthy();
  });

  it("an uploaded WhatsApp icon replaces the built-in one; unsafe values are ignored", () => {
    const { rerender } = render(<RenderBlock block={make("offer-slider", { whatsappIcon: "https://cdn.test/whatsapp.svg" })} />);
    expect(screen.getByLabelText("WhatsApp").querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/whatsapp.svg");
    rerender(<RenderBlock block={make("offer-slider", { whatsappIcon: "javascript:alert(1)" })} />);
    expect(screen.getByLabelText("WhatsApp").querySelector("img")).toBeNull();
    expect(screen.getByLabelText("WhatsApp").querySelector("svg")).toBeTruthy();
  });

  it("WhatsApp icon size from the inspector is applied and kept within 24-120px", () => {
    const btn = () => screen.getByLabelText("WhatsApp") as HTMLElement;
    const { rerender } = render(<RenderBlock block={make("offer-slider", { whatsappSize: 80 })} />);
    expect(btn().style.width).toBe("80px");
    rerender(<RenderBlock block={make("offer-slider", { whatsappSize: "500" })} />);
    expect(btn().style.width).toBe("120px");
    rerender(<RenderBlock block={make("offer-slider", { whatsappSize: "abc" })} />);
    expect(btn().style.width).toBe("");
    rerender(<RenderBlock block={make("emerald-slider", { whatsappSize: 64, whatsapp: "+91 90000 11111" })} />);
    expect(btn().style.height).toBe("64px");
  });
});
