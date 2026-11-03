import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { ProjectBannerBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import { DeviceProvider } from "@/components/openpage/runtime/device";

const VARIANTS = ["split-form", "overlay", "centered", "stats", "editorial", "framed", "asymmetric", "info-bar", "framed-center", "split-curve", "unknown-default"];
const hero = (variant: string, style?: Record<string, unknown>): BlockConfig =>
  ({ id: "hero", type: "project-banner", variant, props: { headline: "Project", image: "https://cdn.example/hero.jpg" }, style } as BlockConfig);
const renderOn = (block: BlockConfig, device: "desktop" | "mobile" = "desktop") =>
  render(
    <DeviceProvider device={device}>
      <ProjectBannerBlock block={block} />
    </DeviceProvider>,
  ).container;
// The old built-in overlays: full-cover dark / light tint layers.
const builtInOverlay = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("div.absolute.inset-0")).some((el) =>
    /(^|\s)(bg-black\/\d+|bg-gradient-to-[a-z]+ from-(black|white)\/\d+)/.test(el.className),
  );

describe("Hero / Banner background overlay", () => {
  it.each(VARIANTS)("%s: no overlay by default", (variant) => {
    const c = renderOn(hero(variant));
    expect(c.querySelector('img[src="https://cdn.example/hero.jpg"]')).toBeTruthy();
    expect(builtInOverlay(c)).toBe(false);
    expect(c.querySelector("[data-op-overlay]")).toBeNull();
  });

  it.each(VARIANTS)("%s: the Style overlay is drawn above the image", (variant) => {
    const c = renderOn(hero(variant, { overlayColor: "#000000", overlayOpacity: "0.4" }));
    const overlay = c.querySelector<HTMLElement>("[data-op-overlay]");
    expect(overlay).toBeTruthy();
    // jsdom may print the colour as rgb(0, 0, 0).
    const css = overlay!.getAttribute("style")!.replace("rgb(0, 0, 0)", "#000000");
    expect(css).toContain("color-mix(in srgb, #000000 40%, transparent)");
    // It comes after the image, so it paints on top of it.
    const img = c.querySelector("img")!;
    expect(img.compareDocumentPosition(overlay!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses the device's own overlay setting", () => {
    const block = hero("overlay", { responsive: { mobile: { overlayColor: "#112233", overlayOpacity: "0.6" } } });
    expect(renderOn(block, "desktop").querySelector("[data-op-overlay]")).toBeNull();
    expect(renderOn(block, "mobile").querySelector("[data-op-overlay]")).toBeTruthy();
  });
});

describe("Hero / Banner with a Style background image (no Cover image)", () => {
  const styled = (variant: string, style: Record<string, unknown>): BlockConfig =>
    ({ id: "hero", type: "project-banner", variant, props: { headline: "Project", image: "" }, style } as BlockConfig);
  const placeholderLayer = (c: HTMLElement) =>
    Array.from(c.querySelectorAll("div.absolute.inset-0")).some((el) => /bg-gradient-to-br/.test(el.className));

  it.each(VARIANTS)("%s: no placeholder film over the Style background", (variant) => {
    const c = renderOn(styled(variant, { backgroundImage: "url('https://cdn.example/bg.png')" }));
    expect(placeholderLayer(c)).toBe(false);
  });

  it.each(VARIANTS)("%s: the Style overlay is not drawn twice", (variant) => {
    const c = renderOn(styled(variant, { backgroundImage: "url('https://cdn.example/bg.png')", overlayColor: "#000", overlayOpacity: "0.4" }));
    expect(c.querySelector("[data-op-overlay]")).toBeNull();
  });

  it("a Style background colour is not hidden either", () => {
    expect(placeholderLayer(renderOn(styled("overlay", { backgroundColor: "#123456" })))).toBe(false);
  });

  it("with no image at all the placeholder still shows (unchanged)", () => {
    expect(placeholderLayer(renderOn(styled("overlay", {})))).toBe(true);
  });
});

describe("Hero / Banner content width (overlay template)", () => {
  it("keeps the text in a centred box of that width", () => {
    const c = renderOn({ id: "hero", type: "project-banner", variant: "overlay", props: { headline: "Hyderabad", image: "https://cdn.example/hero.jpg", contentWidth: "1200px" } } as BlockConfig);
    const box = c.querySelector<HTMLElement>("[data-op-hero-content]");
    expect(box?.style.maxWidth).toBe("1200px");
    expect(box?.textContent).toContain("Hyderabad");
  });

  it("is unchanged when empty or invalid", () => {
    for (const contentWidth of ["", "wide; color:red"]) {
      const c = renderOn({ id: "hero", type: "project-banner", variant: "overlay", props: { headline: "H", image: "", contentWidth } } as BlockConfig);
      expect(c.querySelector("[data-op-hero-content]")).toBeNull();
    }
  });
});
