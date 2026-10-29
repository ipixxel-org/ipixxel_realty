import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { CtaButton } from "@/components/openpage/blocks/CtaButton";
import { siteBrandAttrs, siteThemeCSS } from "@/lib/openpage/theme-presets";

const block: BlockConfig = { id: "cta-test", type: "cta", variant: "default", props: {} };

describe("Branding button defaults", () => {
  it("switches on only for colours the user set", () => {
    expect(siteBrandAttrs({})).toEqual({});
    expect(siteBrandAttrs({ settings: { theme: { primary: "  " } } })).toEqual({});
    expect(siteBrandAttrs({ settings: { theme: { ctaButtonColor: "#f00" } } })).toEqual({ "data-op-brand-cta": "" });
    expect(siteBrandAttrs({ settings: { theme: { primary: "#123456" } } })).toEqual({
      "data-op-brand-cta": "",
      "data-op-brand-primary": "",
    });
    expect(siteThemeCSS({ settings: { theme: { primary: "#123456" } } })["--op-brand-primary"]).toBe("#123456");
    expect(siteThemeCSS({})["--op-brand-primary"]).toBeUndefined();
    // Filled (bg-green) buttons read --op-brand-cta: CTA colour, else Primary, else unset.
    expect(siteThemeCSS({ settings: { theme: { primary: "#fb60ca" } } })["--op-brand-cta"]).toBe("#fb60ca");
    expect(siteThemeCSS({ settings: { theme: { primary: "#fb60ca", ctaButtonColor: "#111111" } } })["--op-brand-cta"]).toBe("#111111");
    expect(siteThemeCSS({})["--op-brand-cta"]).toBeUndefined();
  });

  it("marks secondary buttons by default and lets a block opt out", () => {
    const { container, rerender } = render(
      <CtaButton block={block} id="cta:secondary" prefix="secondaryButton" label="More" href="#a" />,
    );
    expect(container.querySelector('[data-op-cta="secondary"]')).toBeTruthy();
    rerender(<CtaButton block={block} id="cta:secondary" prefix="secondaryButton" label="More" href="#a" brand={null} />);
    expect(container.querySelector("[data-op-cta]")).toBeNull();
    rerender(<CtaButton block={block} id="cta:primary" prefix="button" label="Go" href="#a" />);
    expect(container.querySelector("[data-op-cta]")).toBeNull();
  });

  it("keeps a block's own colour inline so it overrides Branding", () => {
    const own: BlockConfig = { ...block, props: { secondaryButtonColor: "#00ff00" } };
    const { container } = render(
      <CtaButton block={own} id="cta:secondary" prefix="secondaryButton" label="More" href="#a" />,
    );
    const el = container.querySelector<HTMLElement>('[data-op-cta="secondary"]');
    expect(el?.style.backgroundColor).toBe("rgb(0, 255, 0)");
  });
});
