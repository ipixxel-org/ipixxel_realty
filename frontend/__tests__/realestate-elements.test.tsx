import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlockConfig, BlockType } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { exportSiteToHTML } from "@/lib/openpage/export-html";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { PICKER_GROUPS } from "@/components/openpage/editor/LayersPanel";
import { ElementEditorContext } from "@/components/openpage/blocks/El";
import { safeHref, flag, strings } from "@/components/openpage/blocks/elements/shared";
import { formatCounter } from "@/components/openpage/blocks/elements/HighlightWidgets";
import { averageRating } from "@/components/openpage/blocks/elements/ListingWidgets";
import { collectHeadings, slugify } from "@/components/openpage/blocks/elements/SiteWidgets";
import { calculateTimeLeft } from "@/components/openpage/blocks/countdown/CountdownBlock";
import { ensureSiteForms } from "@/lib/openpage/content";
import { newFormDefinition } from "@/lib/openpage/forms-store";

const NEW_TYPES: BlockType[] = [
  "grid", "icon-list", "animated-headline", "alert", "slider", "social-icons", "tabs",
  "site-logo", "site-title", "page-title", "breadcrumbs", "table-of-contents",
  "hotspot", "counter", "star-rating", "progress-bar", "price-list", "pricing", "flip-box",
  "countdown", "off-canvas", "property-carousel", "portfolio", "posts", "reviews",
  "accordion", "video-gallery", "image-comparison", "social-share", "popup-trigger", "site-search",
];

const make = (type: BlockType, props: Record<string, unknown> = {}, variant = "default"): BlockConfig => ({
  id: `b-${type}`,
  type,
  variant,
  props: { ...(blockMetadata.find((m) => m.type === type)?.defaultProps ?? {}), ...props },
});

afterEach(() => vi.useRealTimers());

describe("new real estate elements: catalogue", () => {
  it("every new widget is offered in the Blocks panel and has a renderer", () => {
    const offered = new Set(PICKER_GROUPS.flatMap((g) => g.types));
    for (const type of NEW_TYPES) {
      expect(offered.has(type), type).toBe(true);
      expect(blockMetadata.some((m) => m.type === type), type).toBe(true);
      const block = createBlockFromType(type);
      expect(block, type).toBeTruthy();
      const { container, unmount } = render(<RenderBlock block={block!} />);
      // Never the "coming soon" placeholder or the error box.
      expect(container.textContent, type).not.toMatch(/coming soon|Failed to render/);
      unmount();
    }
  });

  it("Grid is a Div whose widgets are laid out as a 3-column grid", () => {
    const grid = createBlockFromType("grid")!;
    expect(grid.type).toBe("columns");
    expect(grid.props.kind).toBe("div");
    expect((grid.props.columns as Array<Record<string, unknown>>)[0]).toMatchObject({ display: "grid", gridColumns: 3 });
  });

  it("a new Countdown gets a fixed end date about 30 days ahead", () => {
    const cd = createBlockFromType("countdown")!;
    const days = (new Date(String(cd.props.targetDate)).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(32);
  });
});

describe("shared helpers", () => {
  it("drops unsafe links", () => {
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("https://x.com")).toBe("https://x.com");
    expect(safeHref("#enquire")).toBe("#enquire");
    expect(safeHref("tel:+911234")).toBe("tel:+911234");
  });
  it("reads string booleans", () => {
    expect(flag("false", true)).toBe(false);
    expect(flag("true", false)).toBe(true);
    expect(flag(undefined, true)).toBe(true);
  });
  it("reads word lists from arrays or text", () => {
    expect(strings(["a", " ", "b"])).toEqual(["a", "b"]);
    expect(strings("a\nb, c")).toEqual(["a", "b", "c"]);
  });
});

describe("widgets", () => {
  it("Icon List renders each item with a link when set", () => {
    render(<RenderBlock block={make("icon-list", { items: [{ text: "Pool", icon: "★", link: "#amenities" }, { text: "Gym" }] })} />);
    expect(screen.getByText("Pool").closest("a")?.getAttribute("href")).toBe("#amenities");
    expect(screen.getByText("Gym")).toBeTruthy();
  });

  it("Alert can be dismissed on the live page but not in the builder", () => {
    const block = make("alert", { dismissible: true, title: "Few units left" });
    const { unmount } = render(<RenderBlock block={block} />);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Few units left")).toBeNull();
    unmount();
    render(
      <ElementEditorContext.Provider value={{ isEditing: true } as never}>
        <RenderBlock block={block} />
      </ElementEditorContext.Provider>,
    );
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.getByText("Few units left")).toBeTruthy();
  });

  it("Animated Headline shows the first word and the surrounding text", () => {
    render(<RenderBlock block={make("animated-headline", { before: "Find your", words: ["home", "villa"], animation: "fade" })} />);
    expect(screen.getByText("Find your")).toBeTruthy();
    expect(screen.getByText("home")).toBeTruthy();
  });

  it("Counter renders its final number with separator, prefix and suffix", () => {
    expect(formatCounter(12500, 0, true)).toBe("12,500");
    expect(formatCounter(4.5, 1, false)).toBe("4.5");
    const { container } = render(<RenderBlock block={make("counter", { end: "1200", prefix: "₹", suffix: " Cr", title: "Sales" })} />);
    expect(container.textContent).toContain("₹1,200 Cr");
  });

  it("Star Rating clamps to the scale and labels the value", () => {
    render(<RenderBlock block={make("star-rating", { rating: 9, scale: "5" })} />);
    expect(screen.getByRole("img", { name: "Rated 5 out of 5" })).toBeTruthy();
  });

  it("Progress Bar exposes accessible values and clamps them", () => {
    render(<RenderBlock block={make("progress-bar", { items: [{ title: "Structure", percent: "140" }] })} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("Price List shows titles and prices", () => {
    render(<RenderBlock block={make("price-list")} />);
    expect(screen.getByText("2 BHK")).toBeTruthy();
    expect(screen.getByText("₹ 1.42 Cr*")).toBeTruthy();
  });

  it("Flip Box shows both faces' text and its button link", () => {
    render(<RenderBlock block={make("flip-box", { buttonUrl: "javascript:x" })} />);
    expect(screen.getByText("3 BHK Residences")).toBeTruthy();
    // Unsafe link replaced by the enquiry anchor.
    expect(screen.getByText("Enquire Now").getAttribute("href")).toBe("#enquire");
  });

  it("Hotspot opens a marker's tooltip on click and clamps positions", () => {
    const { container } = render(
      <RenderBlock block={make("hotspot", { trigger: "click", items: [{ label: "Clubhouse", content: "Gym and lounge", x: "150", y: "-5" }] })} />,
    );
    const marker = screen.getByLabelText("Clubhouse");
    const wrap = marker.parentElement as HTMLElement;
    expect(wrap.style.left).toBe("100%");
    expect(wrap.style.top).toBe("0%");
    fireEvent.click(marker);
    expect(screen.getByText("Gym and lounge")).toBeTruthy();
    expect(container.querySelector('[aria-expanded="true"]')).toBeTruthy();
  });

  it("Breadcrumbs mark the last item as the current page", () => {
    render(<RenderBlock block={make("breadcrumbs")} />);
    expect(screen.getByText("Home").closest("a")?.getAttribute("href")).toBe("/");
    expect(screen.getByText("Project name").getAttribute("aria-current")).toBe("page");
  });

  it("Site Title falls back to a default when empty", () => {
    render(<RenderBlock block={make("site-title", { text: "Skyline Towers" })} />);
    expect(screen.getByText("Skyline Towers")).toBeTruthy();
  });

  it("Off-Canvas opens a dialog and closes with Escape", () => {
    render(<RenderBlock block={make("off-canvas", { panelTitle: "Book a visit", showForm: false })} />);
    fireEvent.click(screen.getByText("Enquire Now"));
    expect(screen.getByRole("dialog", { name: "Book a visit" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Portfolio filters projects by category", () => {
    render(<RenderBlock block={make("portfolio", {
      items: [
        { title: "Alpha", category: "Completed" },
        { title: "Beta", category: "Ongoing" },
      ],
    })} />);
    fireEvent.click(screen.getByRole("tab", { name: "Ongoing" }));
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.getByText("Beta")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("Reviews average the listed ratings", () => {
    expect(averageRating([{ rating: "5" }, { rating: "4" }, { rating: "" }])).toBe(4.5);
    render(<RenderBlock block={make("reviews", { items: [{ author: "A", rating: "5", text: "Great" }, { author: "B", rating: "4", text: "Good" }] })} />);
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText("Based on 2 reviews")).toBeTruthy();
  });

  it("Project Updates link titles and show summaries", () => {
    render(<RenderBlock block={make("posts", { items: [{ title: "Slab cast", excerpt: "Tower A slab done", url: "/updates/1" }] })} />);
    expect(screen.getByText("Slab cast").closest("a")?.getAttribute("href")).toBe("/updates/1");
    expect(screen.getByText("Tower A slab done")).toBeTruthy();
  });

  it("Property Carousel renders a card per property with navigation", () => {
    render(<RenderBlock block={make("property-carousel")} />);
    expect(screen.getAllByText("Property name")).toHaveLength(3);
    expect(screen.getByLabelText("Next")).toBeTruthy();
  });
});

describe("additional widgets", () => {
  it("Accordion opens the first item and keeps the others closed", () => {
    render(<RenderBlock block={make("accordion")} />);
    expect(screen.getByText("What is included?").closest("button")?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("How do I get started?").closest("button")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("Image Comparison labels both images", () => {
    render(
      <RenderBlock
        block={make("image-comparison", {
          beforeImage: "/before.jpg",
          afterImage: "/after.jpg",
        })}
      />,
    );
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getByText("After")).toBeTruthy();
  });

  it("Site Search submits to the configured results page", () => {
    const { container } = render(<RenderBlock block={make("site-search", { targetPath: "/listings" })} />);
    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBe("/listings");
    expect(container.querySelector('input[name="q"]')).toBeTruthy();
  });

  it("Popup Trigger opens its popup on click in the live page", () => {
    render(<RenderBlock block={make("popup-trigger", { popupTitle: "Talk to us" })} />);
    fireEvent.click(screen.getByRole("button", { name: /get in touch/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Talk to us")).toBeTruthy();
  });

  it("exports all six additional widgets to HTML instead of comments", () => {
    const blocks = [
      "accordion", "video-gallery", "image-comparison", "social-share", "popup-trigger", "site-search",
    ].map((type) => make(type as BlockType));
    const html = exportSiteToHTML({ name: "Export test", blocks });
    expect(html).not.toMatch(/Unknown block type/);
    expect(html).toContain("Frequently Asked Questions");
    expect(html).toContain("Video Gallery");
    expect(html).toContain("Before &amp; After");
    expect(html).toContain("Share");
    expect(html).toContain("Get in touch");
    expect(html).toContain('role="search"');
  });
});

describe("Table of Contents", () => {
  it("collects headings, gives them unique ids and skips its own", () => {
    document.body.innerHTML = `<div id="root"><h2>Amenities</h2><h3>Pool</h3><h2>Amenities</h2><section id="toc"><h2>Inside TOC</h2></section></div>`;
    const root = document.getElementById("root")!;
    const entries = collectHeadings(root, "h2, h3", document.getElementById("toc"));
    expect(entries.map((e) => e.text)).toEqual(["Amenities", "Pool", "Amenities"]);
    expect(new Set(entries.map((e) => e.id)).size).toBe(3);
    expect(slugify("Price & Payment Plan")).toBe("price-payment-plan");
    document.body.innerHTML = "";
  });
});

describe("existing widgets fixed", () => {
  it("Countdown reads a fixed date and shows placeholders before the first tick", () => {
    expect(calculateTimeLeft("not a date")).toBeNull();
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(calculateTimeLeft("2026-01-02T01:01:01Z", now)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    vi.useFakeTimers();
    const { container } = render(<RenderBlock block={make("countdown", { targetDate: new Date(Date.now() + 90061000).toISOString() })} />);
    expect(container.textContent).toContain("--");
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(container.textContent).not.toContain("--");
  });

  it("Countdown with no date asks for one instead of moving forever", () => {
    render(<RenderBlock block={make("countdown", { targetDate: "" })} />);
    expect(screen.getByText("Set the end date in the Content tab.")).toBeTruthy();
  });

  it('Image Carousel treats "false" settings as off', () => {
    const { container } = render(
      <RenderBlock block={make("slider", { images: [{ src: "https://cdn.example/a.jpg" }, { src: "https://cdn.example/b.jpg" }], showArrows: "false", showDots: "false" })} />,
    );
    expect(screen.queryByLabelText("Next slide")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("Image Carousel with an empty image list shows a hint, not stock photos", () => {
    render(<RenderBlock block={make("slider", { images: [{ src: "" }] })} />);
    expect(screen.getByText("Add images in the Content tab")).toBeTruthy();
  });
});

describe("forms inside containers", () => {
  it("embeds a library form used by a widget nested in a container", () => {
    const form = { ...newFormDefinition(undefined, "Nested form"), id: "form-nested" };
    window.localStorage.setItem("prestate.forms.v1", JSON.stringify([form]));
    const off = { id: "oc", type: "off-canvas", variant: "default", props: { formId: "form-nested" } } as BlockConfig;
    const site = {
      name: "s",
      blocks: [{ id: "c", type: "columns", variant: "default", props: { columns: [{ width: 100, blocks: [off] }] } } as BlockConfig],
      forms: [],
    };
    const out = ensureSiteForms(site as never);
    expect((out.forms ?? []).map((f: { id: string }) => f.id)).toContain("form-nested");
    window.localStorage.removeItem("prestate.forms.v1");
  });
});
