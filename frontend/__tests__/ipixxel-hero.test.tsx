import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { ElementEditorContext } from "@/components/openpage/blocks/El";
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

  it("skyline menu icon opens the menu items and closes after a pick", () => {
    render(<RenderBlock block={make("skyline", { skylineMenu: "Overview\nFloor Plans | floor-plans\nSite | https://example.com | new" })} />);
    expect(screen.queryByText("Floor Plans")).toBeNull();
    fireEvent.click(screen.getByLabelText("Menu"));
    expect(screen.getByText("Overview").getAttribute("href")).toBe("#overview");
    expect(screen.getByText("Floor Plans").getAttribute("href")).toBe("#floor-plans");
    expect(screen.getByText("Site").getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByText("Floor Plans"));
    expect(screen.queryByText("Floor Plans")).toBeNull();
  });

  it("skyline menu icon without menu items keeps the single-section jump", () => {
    render(<RenderBlock block={make("skyline")} />);
    fireEvent.click(screen.getByLabelText("Menu"));
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.getByLabelText("Menu").getAttribute("aria-expanded")).toBeNull();
  });

  it("skyline header is sticky by default (matching the ticked checkbox) and not when unticked", () => {
    const on = render(<RenderBlock block={make("skyline")} />);
    expect(on.container.querySelector("[data-sticky-header]")).not.toBeNull();
    on.unmount();
    const { container } = render(<RenderBlock block={make("skyline", { stickyHeader: false })} />);
    expect(container.querySelector("[data-sticky-header]")).toBeNull();
    expect(container.querySelector("section")?.className).toContain("overflow-hidden");
  });

  const scrolledUp = (section: Element, by: number) => {
    section.getBoundingClientRect = () => ({ top: -by, bottom: 600 - by, left: 0, right: 0, width: 0, height: 600, x: 0, y: -by, toJSON: () => ({}) });
    act(() => {
      fireEvent.resize(window);
    });
  };
  /** The pinned header on the live page: a real fixed bar in a body-level holder. */
  const pinnedBar = () => document.querySelector("[data-ipx-sticky-host] [data-sticky-header='stuck']") as HTMLElement | null;

  it("skyline sticky header pins the logo and menu once the hero scrolls up", async () => {
    const { container, unmount } = render(<RenderBlock block={make("skyline", { stickyHeader: true, stickyHeaderBg: "#112233" })} />);
    const section = container.querySelector("section")!;
    const holder = container.querySelector("[data-sticky-header]") as HTMLElement;
    expect(holder.getAttribute("data-sticky-header")).toBe("top");
    expect(holder.contains(screen.getByLabelText("Menu"))).toBe(true);
    scrolledUp(section, 300);
    await waitFor(() => expect(pinnedBar()).not.toBeNull());
    const bar = pinnedBar()!;
    const host = bar.parentElement!;
    // Native fixed positioning: no per-scroll shifting, so nothing jitters.
    expect(host.style.position).toBe("fixed");
    expect(bar.style.transform).toBe("");
    expect(bar.style.backgroundColor).toBe("rgb(17, 34, 51)");
    expect(bar.contains(screen.getByLabelText("Menu"))).toBe(true);
    unmount();
    expect(document.querySelector("[data-ipx-sticky-host]")).toBeNull();
  });

  it("sticky header follows the scroll by shifting while editing in the builder", async () => {
    const { container } = render(
      <ElementEditorContext.Provider value={{ blockId: "x", isEditing: true }}>
        <RenderBlock block={make("skyline", { stickyHeader: true })} />
      </ElementEditorContext.Provider>,
    );
    const holder = container.querySelector("[data-sticky-header]") as HTMLElement;
    scrolledUp(container.querySelector("section")!, 300);
    await waitFor(() => expect(holder.getAttribute("data-sticky-header")).toBe("stuck"));
    expect(holder.style.transform).toBe("translateY(300px)");
    expect(document.querySelector("[data-ipx-sticky-host]")).toBeNull();
  });

  it.each(["offer-slider", "emerald-slider", "modern-form"])("%s header is sticky by default and not when unticked", (variant) => {
    const on = render(<RenderBlock block={make(variant)} />);
    expect(on.container.querySelector("[data-sticky-header]")).not.toBeNull();
    on.unmount();
    const { container } = render(<RenderBlock block={make(variant, { stickyHeader: false })} />);
    expect(container.querySelector("[data-sticky-header]")).toBeNull();
  });

  it.each(["offer-slider", "emerald-slider", "modern-form"])("%s sticky header pins once the hero scrolls up", async (variant) => {
    const { container, unmount } = render(<RenderBlock block={make(variant, { stickyHeader: true })} />);
    const holder = container.querySelector("[data-sticky-header]") as HTMLElement;
    expect(holder.getAttribute("data-sticky-header")).toBe("top");
    scrolledUp(container.querySelector("section")!, 200);
    await waitFor(() => expect(pinnedBar()).not.toBeNull());
    expect(pinnedBar()!.parentElement!.style.position).toBe("fixed");
    expect(pinnedBar()!.style.transform).toBe("");
    // Scrolling back to the top puts the header back in the hero.
    scrolledUp(container.querySelector("section")!, 0);
    await waitFor(() => expect(container.querySelector("[data-sticky-header='top']")).not.toBeNull());
    expect(pinnedBar()).toBeNull();
    unmount();
  });

  describe("offer slider sticky call / WhatsApp", () => {
    const floatHost = () => document.querySelector("[data-ipx-float-host]") as HTMLElement | null;
    const setWidth = (w: number) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
    };

    it("is off by default: the buttons stay in the hero while scrolling", async () => {
      const { container, unmount } = render(<RenderBlock block={make("offer-slider")} />);
      scrolledUp(container.querySelector("section")!, 300);
      expect(floatHost()).toBeNull();
      expect(container.contains(screen.getByLabelText("WhatsApp"))).toBe(true);
      unmount();
    });

    it("mobile only: pins on a phone width, stays put on desktop", async () => {
      const prev = window.innerWidth;
      try {
        setWidth(390);
        const { container, unmount } = render(<RenderBlock block={make("offer-slider", { stickyFloatingMobile: true })} />);
        const section = container.querySelector("section")!;
        scrolledUp(section, 300);
        await waitFor(() => expect(floatHost()?.contains(screen.getByLabelText("WhatsApp"))).toBe(true));
        expect(floatHost()!.contains(screen.getByLabelText("Call"))).toBe(true);
        expect(floatHost()!.style.position).toBe("fixed");
        // Back at the top they return to the hero.
        scrolledUp(section, 0);
        await waitFor(() => expect(container.contains(screen.getByLabelText("WhatsApp"))).toBe(true));
        // Desktop width: not pinned.
        setWidth(1280);
        scrolledUp(section, 300);
        await act(async () => {
          await new Promise((r) => setTimeout(r, 50));
        });
        expect(container.contains(screen.getByLabelText("WhatsApp"))).toBe(true);
        unmount();
        expect(floatHost()).toBeNull();
      } finally {
        setWidth(prev);
      }
    });

    it("desktop only: pins on a desktop width", async () => {
      const prev = window.innerWidth;
      try {
        setWidth(1280);
        const { container, unmount } = render(<RenderBlock block={make("offer-slider", { stickyFloatingDesktop: true })} />);
        scrolledUp(container.querySelector("section")!, 300);
        await waitFor(() => expect(floatHost()?.contains(screen.getByLabelText("Call"))).toBe(true));
        unmount();
      } finally {
        setWidth(prev);
      }
    });

    it("emerald slider: WhatsApp pins when ticked, stays in the hero when not", async () => {
      const prev = window.innerWidth;
      try {
        setWidth(390);
        const off = render(<RenderBlock block={make("emerald-slider", { whatsapp: "+91 90000 11111" })} />);
        scrolledUp(off.container.querySelector("section")!, 300);
        expect(floatHost()).toBeNull();
        off.unmount();
        const { container, unmount } = render(
          <RenderBlock block={make("emerald-slider", { whatsapp: "+91 90000 11111", stickyFloatingMobile: true })} />,
        );
        scrolledUp(container.querySelector("section")!, 300);
        await waitFor(() => expect(floatHost()?.contains(screen.getByLabelText("WhatsApp"))).toBe(true));
        unmount();
        expect(floatHost()).toBeNull();
      } finally {
        setWidth(prev);
      }
    });

    it("does not pin in the builder", async () => {
      const { container } = render(
        <ElementEditorContext.Provider value={{ blockId: "x", isEditing: true }}>
          <RenderBlock block={make("offer-slider", { stickyFloatingMobile: true, stickyFloatingDesktop: true })} />
        </ElementEditorContext.Provider>,
      );
      scrolledUp(container.querySelector("section")!, 300);
      expect(floatHost()).toBeNull();
      expect(container.contains(screen.getByLabelText("WhatsApp"))).toBe(true);
    });
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

  it("templates read the same props when rendered directly (no switch involved)", () => {
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

  it("emerald slider also takes an uploaded WhatsApp icon", () => {
    render(<RenderBlock block={make("emerald-slider", { whatsapp: "+91 90000 11111", whatsappIcon: "https://cdn.test/wa.svg" })} />);
    expect(screen.getByLabelText("WhatsApp").querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/wa.svg");
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

  it("modern hero shows the menu, title, buttons and form card; menu links stay safe", () => {
    const { container } = render(
      <RenderBlock block={make("modern-form", { modernNav: "Overview\nPlans | floor-plans\nBad | javascript:alert(1)\nSite | https://example.com" })} />,
    );
    expect(container.textContent).toContain("Life, considered");
    expect(screen.getByText("Get price & availability")).toBeTruthy();
    expect(screen.getByText("The Residences, Sector 150")).toBeTruthy();
    expect(screen.getByText("Overview").getAttribute("href")).toBe("#overview");
    expect(screen.getByText("Plans").getAttribute("href")).toBe("#floor-plans");
    expect(screen.getByText("Bad").getAttribute("href")).toBeNull();
    expect(screen.getByText("Site").getAttribute("href")).toBe("https://example.com");
    expect(container.innerHTML).not.toContain("javascript:");
  });

  it("modern hero menu links open in a new tab only when flagged", () => {
    render(<RenderBlock block={make("modern-form", { modernNav: "Same | https://a.com\nFresh | https://b.com | new\nAuto | | new" })} />);
    expect(screen.getByText("Same").getAttribute("target")).toBeNull();
    expect(screen.getByText("Fresh").getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Fresh").getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Auto").getAttribute("href")).toBe("#auto");
    expect(screen.getByText("Auto").getAttribute("target")).toBe("_blank");
  });

  it("modern hero: phones / tablets get a hamburger menu holding only the links", () => {
    const { container } = render(<RenderBlock block={make("modern-form", { modernNav: "Overview\nGallery", modernNavCta: "Get Price" })} />);
    // Links are desktop-only; the button is hidden on phones (shown from tablets, beside the hamburger).
    expect(container.querySelector("nav[aria-label='Main']")!.className).toContain("hidden @5xl:flex");
    const buttonWrap = screen.getByText("Get Price").closest("a,button")!.parentElement!;
    expect(buttonWrap.className).toBe("hidden @3xl:inline-flex");
    const toggle = screen.getByLabelText("Open menu");
    expect(buttonWrap.parentElement!.contains(toggle)).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(screen.getByLabelText("Close menu").getAttribute("aria-expanded")).toBe("true");
    expect(panel.textContent).toContain("Overview");
    expect(panel.textContent).toContain("Gallery");
    expect(panel.textContent).not.toContain("Get Price");

    // Choosing a link closes the menu and highlights that link everywhere.
    const gallery = Array.from(panel.querySelectorAll("a")).find((a) => a.textContent === "Gallery")!;
    fireEvent.click(gallery);
    expect(screen.queryByLabelText("Close menu")).toBeNull();
    const desktopGallery = container.querySelectorAll("nav[aria-label='Main'] a")[1];
    expect(desktopGallery.getAttribute("aria-current")).toBe("location");
    expect(desktopGallery.className).toContain("bg-[#0b0b0b]");
    fireEvent.click(screen.getByLabelText("Open menu"));
    const again = Array.from(document.getElementById(toggle.getAttribute("aria-controls")!)!.querySelectorAll("a")).find((a) => a.textContent === "Gallery")!;
    expect(again.getAttribute("aria-current")).toBe("location");

    // Escape closes it.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByLabelText("Close menu")).toBeNull();
  });

  it("modern hero keeps the plain button (no hamburger) when there are no menu links", () => {
    render(<RenderBlock block={make("modern-form", { modernNav: "", modernNavCta: "Get Price" })} />);
    expect(screen.queryByLabelText("Open menu")).toBeNull();
    expect(screen.getByText("Get Price").closest("a,button")!.parentElement!.className).toBe("inline-flex");
  });
});
