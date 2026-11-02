import { describe, expect, it } from "vitest";
import { resolveSiteTheme, sitePageBackground } from "@/lib/openpage/theme-presets";

describe("page background (builder, preview and live use the same colour)", () => {
  it("uses the theme's page colour, not the light surface colour", () => {
    // This template: bg0 white, bg1 light blue (#EEF3F9) -> white.
    expect(sitePageBackground({ theme: { bg0: "#FFFFFF", bg1: "#EEF3F9" } } as never)).toBe("#FFFFFF");
  });

  it("is white by default", () => {
    expect(sitePageBackground({} as never).toLowerCase()).toBe("#ffffff");
  });

  it("a Branding Background colour wins", () => {
    expect(sitePageBackground({ theme: { bg0: "#FFFFFF" }, settings: { theme: { bg: "#FAF5EE" } } } as never)).toBe("#FAF5EE");
  });

  it("matches the theme colours the rest of the page uses", () => {
    // The app already turns dark theme presets into a light page.
    const site = { theme: { bg0: "#0a1628", bg1: "#101e32" } };
    expect(sitePageBackground(site as never)).toBe(resolveSiteTheme(site as never).bg0);
    const light = { theme: { bg0: "#FAF8F5", bg1: "#F2EFE8" } };
    expect(sitePageBackground(light as never)).toBe("#FAF8F5");
  });
});
