import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { FooterBlock } from "@/components/openpage/blocks/footer/FooterBlock";

const FULL = {
  logo: "Radhey Skye",
  tagline: "TG RERA: P01100006237",
  address: "Disclaimer: The content provided on this website",
  phone: "+91 90000 00000",
  email: "sales@example.com",
  copyright: "© 2026 Radhey Constructions",
};
const footer = (props: Record<string, unknown>, variant: string): BlockConfig => ({ id: "f", type: "footer", variant, props });
const el = (c: HTMLElement, name: string) => c.querySelector(`[data-el-name="${name}"]`);

describe("Footer shows every filled field in every template", () => {
  it.each(["simple", "multi-column", "minimal", "premium", "contact", "disclaimer"])("%s", (variant) => {
    const { container } = render(<FooterBlock block={footer(FULL, variant)} />);
    expect(container.textContent).toContain(FULL.logo);
    expect(container.textContent).toContain(FULL.tagline);
    expect(container.textContent).toContain(FULL.address);
    expect(container.textContent).toContain(FULL.phone);
    expect(container.textContent).toContain(FULL.email);
    expect(container.textContent).toContain(FULL.copyright);
  });

  it.each(["simple", "minimal"])("%s shows no sample tagline or empty contact rows when nothing is set", (variant) => {
    const { container } = render(<FooterBlock block={footer({ copyright: "© X" }, variant)} />);
    expect(container.textContent).not.toMatch(/thoughtfully planned/);
    expect(el(container, "footer:address")).toBeNull();
    expect(el(container, "footer:phone")).toBeNull();
    expect(el(container, "footer:email")).toBeNull();
  });

  it("minimal only shows the logo when one is set", () => {
    const { container } = render(<FooterBlock block={footer({ copyright: "© X" }, "minimal")} />);
    expect(el(container, "footer:brand")).toBeNull();
    const withLogo = render(<FooterBlock block={footer({ logo: "Brand" }, "minimal")} />);
    expect(el(withLogo.container, "footer:brand")).toHaveTextContent("Brand");
  });
});

describe("Disclaimer footer", () => {
  it("shows phone, QR, RERA, disclaimer and the links | credit line", () => {
    const { container } = render(
      <FooterBlock
        block={footer(
          {
            phone: "+91 9595300100",
            qrImage: "https://example.com/qr.png",
            reraText: "Project Rera No. PM1260002502428",
            disclaimer: "This is only for information purposes.",
            menuLinks: [{ _id: "l1", label: "Disclaimer & Privacy Policy", url: "#privacy" }],
            copyright: "Crafted By GTF Technologies",
          },
          "disclaimer",
        )}
      />,
    );
    expect(el(container, "footer:phone")).toHaveTextContent("+91 9595300100");
    expect(el(container, "footer:phone")?.getAttribute("href")).toBe("tel:+919595300100");
    expect(el(container, "footer:qr")).not.toBeNull();
    expect(el(container, "footer:rera")).toHaveTextContent("PM1260002502428");
    expect(el(container, "footer:disclaimer")).toHaveTextContent("information purposes");
    expect(container.textContent).toContain("Disclaimer & Privacy Policy|Crafted By GTF Technologies");
  });

  it("side logos only render once an image is set", () => {
    const { container } = render(<FooterBlock block={footer({}, "disclaimer")} />);
    expect(el(container, "footer:leftLogo")).toBeNull();
    expect(el(container, "footer:rightLogo")).toBeNull();
    const withLogos = render(
      <FooterBlock block={footer({ leftLogoImage: "https://example.com/l.png", rightLogoImage: "https://example.com/r.png" }, "disclaimer")} />,
    );
    expect(el(withLogos.container, "footer:leftLogo")).not.toBeNull();
    expect(el(withLogos.container, "footer:rightLogo")).not.toBeNull();
  });

  it("clearing RERA and disclaimer hides them", () => {
    const { container } = render(<FooterBlock block={footer({ reraText: "", disclaimer: "" }, "disclaimer")} />);
    expect(el(container, "footer:rera")).toBeNull();
    expect(el(container, "footer:disclaimer")).toBeNull();
  });
});
