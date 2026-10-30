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
  it.each(["simple", "multi-column", "minimal", "premium", "contact"])("%s", (variant) => {
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
