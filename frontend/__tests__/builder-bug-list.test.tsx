import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { El } from "@/components/openpage/blocks/El";
import { CtaButton } from "@/components/openpage/blocks/CtaButton";
import { CustomFields } from "@/components/openpage/blocks/CustomFields";
import { ButtonBlock, HeadingBlock, TextBlock } from "@/components/openpage/blocks/core/CoreWidgets";
import { CtaBlock } from "@/components/openpage/blocks/cta/CtaBlock";
import { DividerBlock } from "@/components/openpage/blocks/divider/DividerBlock";
import { FaqBlock } from "@/components/openpage/blocks/faq/FaqBlock";
import { FeaturesBlock } from "@/components/openpage/blocks/features/FeaturesBlock";
import { FooterBlock } from "@/components/openpage/blocks/footer/FooterBlock";
import { ImageBlock } from "@/components/openpage/blocks/image/ImageBlock";
import { VideoBlock } from "@/components/openpage/blocks/video/VideoBlock";
import {
  AmenitiesBlock,
  DownloadBrochureBlock,
  LeadFormBlock,
  LocationBlock,
  ProjectBannerBlock,
  ProjectOverviewBlock,
  RePricingBlock,
  UnitConfigBlock,
  resolveMapEmbed,
} from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import { applyBlockDefaults, upgradeFooterProps } from "@/lib/openpage/block-factory";

function block(type: BlockConfig["type"], props: Record<string, unknown>, variant = "default"): BlockConfig {
  return { id: `${type}-test`, type, variant, props };
}

const el = (container: HTMLElement, name: string) => container.querySelector(`[data-el-name="${name}"]`);

describe("El on the live site", () => {
  it("runs the caller's onClick outside the builder", () => {
    const onClick = vi.fn();
    render(
      <El block={block("cta", {})} id="cta:primary" as="button" onClick={onClick}>
        Go
      </El>,
    );
    fireEvent.click(screen.getByText("Go"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("marks list items so section Type settings can skip them", () => {
    const b = block("faq", {});
    const { container } = render(
      <>
        <El block={b} id="faq:title">Title</El>
        <El block={b} id="items:it_1">Card</El>
      </>,
    );
    expect(el(container, "faq:title")).not.toHaveAttribute("data-op-item");
    expect(el(container, "items:it_1")).toHaveAttribute("data-op-item");
  });
});

describe("CTA buttons (#14, #21, #26, #29, #30)", () => {
  it("renders nothing — not even the arrow — when the text is cleared", () => {
    const { container } = render(<CtaButton block={block("cta", {})} id="cta:primary" prefix="button" label="  " href="#x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("applies its own colours, radius and URL", () => {
    const { container } = render(
      <CtaButton
        block={block("cta", { buttonColor: "#112233", buttonTextColor: "#ffffff", buttonRadius: 4 })}
        id="cta:primary"
        prefix="button"
        label="Book"
        href="https://example.com"
        target="_blank"
      />,
    );
    const link = container.querySelector("a")!;
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("op-btn");
    expect(link).toHaveStyle({ backgroundColor: "#112233", color: "#ffffff", borderRadius: "4px" });
  });
});

describe("Heading (#4)", () => {
  it("sizes the heading by the chosen tag", () => {
    const h4 = render(<HeadingBlock block={block("heading", { text: "Hi", tag: "h4" })} />);
    expect(h4.container.querySelector("h4")).toHaveClass("text-xl");
    const h1 = render(<HeadingBlock block={block("heading", { text: "Hi", tag: "h1" })} />);
    expect(h1.container.querySelector("h1")).toHaveClass("text-4xl");
  });

  it("shows values of fields added with Add Field", () => {
    const b = block("heading", { text: "Hi", subtitleLine: "Ready to move", internalThing: "x", _customFields: ["subtitleLine"] });
    render(<CustomFields block={b} />);
    expect(screen.getByText("Ready to move")).toBeInTheDocument();
    expect(screen.queryByText("x")).toBeNull();
  });
});

describe("Button (#6)", () => {
  it.each(["solid", "pill"])("shows a chosen border colour on %s", (variant) => {
    const { container } = render(<ButtonBlock block={block("button", { label: "Go", borderColor: "#ff0000" }, variant)} />);
    expect(container.querySelector("a")).toHaveStyle({ borderColor: "#ff0000", borderStyle: "solid" });
  });
});

describe("Divider (#8)", () => {
  it.each(["centered", "narrow"])("draws a visible line for %s width", (width) => {
    const { container } = render(<DividerBlock block={block("divider", { width }, "line")} />);
    expect(container.querySelector(".border-t")).toHaveClass("w-full");
  });
});

describe("Text Editor (#11)", () => {
  it("renders an image element whose source can be chosen", () => {
    const { container } = render(<TextBlock block={block("text", { body: "Copy", image: "/a.jpg", imagePosition: "left" })} />);
    expect(el(container, "text:image")?.querySelector("img")).toHaveAttribute("src", "/a.jpg");
  });
});

describe("Image grid (#15)", () => {
  it("shows the subtitle and every image", () => {
    const images = Array.from({ length: 6 }, (_, i) => ({ _id: `im${i}`, src: `/${i}.jpg` }));
    const { container } = render(<ImageBlock block={block("image", { title: "T", subtitle: "Sub", images }, "grid")} />);
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(6);
  });
});

describe("Video (#16)", () => {
  it("keeps the frame border off the text colour", () => {
    const { container } = render(
      <VideoBlock block={block("video", { url: "https://youtu.be/dQw4w9WgXcQ", borderColor: "#00ff00" }, "youtube")} />,
    );
    expect(el(container, "video:frame")).toHaveStyle({ borderColor: "#00ff00" });
  });
});

describe("Project Highlights / features (#12)", () => {
  it("makes the label, heading and each card part individually selectable", () => {
    const { container } = render(
      <FeaturesBlock block={block("features", { label: "Why us", title: "T", items: [{ _id: "a", title: "Card", description: "D" }] })} />,
    );
    for (const name of ["features:label", "features:title", "items:a", "items:a/title", "items:a/description"]) {
      expect(el(container, name), name).toBeInTheDocument();
    }
  });
});

describe("FAQ (#13)", () => {
  it("makes cards, questions and answers selectable", () => {
    const { container } = render(<FaqBlock block={block("faq", { items: [{ _id: "q1", question: "Q?", answer: "A." }] })} />);
    expect(el(container, "items:q1")).toHaveAttribute("data-op-item");
    expect(el(container, "items:q1/question")).toBeInTheDocument();
    expect(el(container, "items:q1/answer")).toBeInTheDocument();
  });
});

describe("CTA section (#14)", () => {
  const props = {
    headline: "H",
    subheadline: "S",
    badge: "New",
    buttonText: "Primary",
    secondaryButtonText: "Secondary",
    image: "/feature.jpg",
    bgImage: "/bg image.jpg",
    bgColor: "#101010",
  };
  it.each(["simple", "split", "booking", "banner", "strip", "card"])("%s renders every field", (variant) => {
    const { container } = render(<CtaBlock block={block("cta", props, variant)} />);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Secondary")).toBeInTheDocument();
    expect(container.querySelector('img[src="/feature.jpg"]')).toBeInTheDocument();
    const section = container.querySelector('[style*="background-image"]') as HTMLElement | null;
    expect(section?.style.backgroundImage).toContain("bg image.jpg");
  });
});

describe("Hero / banner (#26)", () => {
  it("makes stats selectable and gives CTAs their URL and colours", () => {
    const { container } = render(
      <ProjectBannerBlock
        block={block(
          "project-banner",
          {
            headline: "Tower",
            primaryCta: "Enquire",
            primaryCtaUrl: "https://example.com/enquire",
            primaryCtaColor: "#ff0000",
            stats: [{ _id: "s1", value: "3", label: "Towers" }],
          },
          "overlay",
        )}
      />,
    );
    expect(el(container, "stats:s1")).toHaveAttribute("data-op-item");
    expect(el(container, "stats:s1/value")).toHaveTextContent("3");
    const cta = el(container, "project-banner:primaryCta")!;
    expect(cta).toHaveAttribute("href", "https://example.com/enquire");
    expect(cta).toHaveStyle({ backgroundColor: "#ff0000" });
  });
});

describe("Project overview (#27)", () => {
  it("makes highlights and stats selectable", () => {
    const { container } = render(
      <ProjectOverviewBlock
        block={block(
          "project-overview",
          { title: "T", highlights: [{ _id: "h1", title: "Pool" }], stats: [{ _id: "s1", value: "12", label: "Acres" }], ctaText: "Go" },
          "split",
        )}
      />,
    );
    expect(el(container, "highlights:h1/title")).toHaveTextContent("Pool");
    expect(el(container, "stats:s1/label")).toHaveTextContent("Acres");
    expect(el(container, "project-overview:cta")).toBeInTheDocument();
  });
});

describe("Property listing (#29)", () => {
  it("makes cards and their button selectable and aligns the button", () => {
    const { container } = render(
      <UnitConfigBlock block={block("unit-config", { ctaAlign: "center", items: [{ _id: "u1", config: "2 BHK", area: "1,000", price: "₹1 Cr" }] }, "cards")} />,
    );
    expect(el(container, "items:u1")).toHaveAttribute("data-op-item");
    const button = el(container, "items:u1/cta")!;
    expect(button.parentElement).toHaveClass("justify-center");
  });
});

describe("Amenities (#30)", () => {
  it("shows every amenity in the mosaic, not just five", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ _id: `a${i}`, title: `Amenity ${i}` }));
    render(<AmenitiesBlock block={block("amenities", { items }, "mosaic")} />);
    for (let i = 0; i < 7; i++) expect(screen.getByText(`Amenity ${i}`)).toBeInTheDocument();
  });
});

describe("Price (#34)", () => {
  const pricing = (props: Record<string, unknown>, variant = "cards") =>
    render(<RePricingBlock block={block("re-pricing", props, variant)} />);

  it("prints the subtitle once", () => {
    pricing({ title: "Pricing", subtitle: "Limited units", startingPrice: "₹1 Cr", items: [{ _id: "c1", name: "2 BHK", price: "₹1 Cr" }] });
    expect(screen.getAllByText("Limited units")).toHaveLength(1);
  });

  it("never invents a price or label", () => {
    const { container } = pricing({ title: "Pricing", startingLabel: "", items: [] }, "simple");
    expect(container.textContent).not.toMatch(/₹|Starting from/);
  });

  it("keeps card buttons and card price colour independent of the section", () => {
    const { container } = pricing({
      ctaText: "Talk to sales",
      priceColor: "#ff0000",
      startingPrice: "₹1 Cr",
      items: [{ _id: "c1", name: "2 BHK", price: "₹2 Cr" }],
    });
    expect(el(container, "items:c1/cta")).toHaveTextContent("Enquire");
    expect(el(container, "items:c1/price")).not.toHaveStyle({ color: "#ff0000" });
    expect(el(container, "re-pricing:startingPrice")).toHaveStyle({ color: "#ff0000" });
    expect(el(container, "items:c1")).toHaveAttribute("data-op-item");
  });
});

describe("Location (#9)", () => {
  it.each(["split-map", "list", "map-only", "cards", "editorial"])("%s shows subheading, address, image and CTA", (variant) => {
    const { container } = render(
      <LocationBlock
        block={block(
          "location",
          { title: "Where", subtitle: "Sub heading", address: "MG Road", image: "/loc.jpg", ctaText: "Directions", items: [] },
          variant,
        )}
      />,
    );
    expect(screen.getByText("Sub heading")).toBeInTheDocument();
    expect(screen.getByText("MG Road")).toBeInTheDocument();
    expect(container.querySelector('img[src="/loc.jpg"]')).toBeInTheDocument();
    expect(screen.getByText("Directions")).toBeInTheDocument();
  });

  it("starts without a sample nearby card", () => {
    expect(applyBlockDefaults(block("location", {})).props.items).toEqual([]);
  });

  it("turns pasted links into embeddable maps", () => {
    expect(resolveMapEmbed('<iframe src="https://www.google.com/maps/embed?pb=abc"></iframe>').src).toBe(
      "https://www.google.com/maps/embed?pb=abc",
    );
    expect(resolveMapEmbed("https://www.google.com/maps/place/Lodhi+Garden/@28.5931,77.2197,16z").src).toBe(
      "https://www.google.com/maps?q=28.5931%2C77.2197&z=16&output=embed",
    );
    expect(resolveMapEmbed("12.97, 77.59").src).toContain("output=embed");
    const short = resolveMapEmbed("https://maps.app.goo.gl/abc123");
    expect(short.src).toBe("");
    expect(short.problem).toMatch(/Short map links/);
  });
});

describe("Lead form benefits (#18)", () => {
  it("makes each benefit a selectable item", () => {
    const { container } = render(
      <LeadFormBlock block={block("lead-form", { title: "Enquire", benefits: [{ _id: "b1", title: "Free pickup" }] }, "split")} />,
    );
    expect(el(container, "benefits:b1")).toHaveAttribute("data-op-item");
    expect(el(container, "benefits:b1/title")).toHaveTextContent("Free pickup");
  });

  it("shows each benefit's description under its title", () => {
    const { container } = render(
      <LeadFormBlock
        block={block("lead-form", { benefits: [{ _id: "b1", title: "Free pickup", description: "From any metro station" }] }, "split")}
      />,
    );
    expect(el(container, "benefits:b1/description")).toHaveTextContent("From any metro station");
  });
});

describe("Download brochure (#21)", () => {
  it("removes the button when its text is cleared", () => {
    const { container } = render(<DownloadBrochureBlock block={block("download-brochure", { title: "B", buttonText: "" }, "card")} />);
    expect(el(container, "download-brochure:button")).toBeNull();
  });
});

describe("Footer (#25)", () => {
  it("lets the tagline be emptied", () => {
    render(<FooterBlock block={block("footer", { logo: "L", tagline: "" }, "multi-column")} />);
    expect(screen.queryByText(/thoughtfully planned/)).toBeNull();
  });

  it("renders editable menu links with URLs and social logos", () => {
    const { container } = render(
      <FooterBlock
        block={block(
          "footer",
          {
            logo: "L",
            copyright: "©",
            menuLinks: [{ _id: "m1", label: "Privacy", url: "/privacy" }],
            socialLinks: [{ _id: "s1", label: "Instagram", url: "https://instagram.com/x", icon: "/ig.svg" }],
          },
          "simple",
        )}
      />,
    );
    expect(screen.getByText("Privacy").closest("a")).toHaveAttribute("href", "/privacy");
    expect(container.querySelector('a[href="https://instagram.com/x"] img')).toHaveAttribute("src", "/ig.svg");
  });

  it("upgrades legacy string lists once and never overwrites edited ones", () => {
    const upgraded = upgradeFooterProps({ links: ["Privacy Policy"], socials: ["X"], columns: [{ title: "Explore", links: ["Overview"] }] });
    expect(upgraded.menuLinks).toEqual([{ label: "Privacy Policy", url: "#privacy-policy" }]);
    expect(upgraded.socialLinks).toEqual([{ label: "X", url: "", icon: "" }]);
    expect(upgraded.linkColumns).toEqual([{ title: "Explore", links: "Overview" }]);
    expect(upgradeFooterProps({ links: ["A"], menuLinks: [] }).menuLinks).toEqual([]);
  });
});
