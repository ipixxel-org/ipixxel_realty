import { describe, expect, it, beforeEach } from "vitest";
import { resolveSiteTheme, siteThemeCSS } from "@/lib/openpage/theme-presets";
import { applyBlockStyle, blockStyleTag } from "@/lib/openpage/block-style";
import { useConfigStore } from "@/components/openpage/store/configStore";
import type { SiteConfig, BlockConfig } from "@/components/openpage/blocks/types";

function hero(id: string): BlockConfig {
  return { id, type: "hero", variant: "default", props: {} };
}

function site(): SiteConfig {
  return {
    name: "dynamic theme",
    blocks: [],
    pages: [{ id: "page-home", name: "Home", path: "/", blocks: [hero("sec-a"), hero("sec-b")] }],
    settings: {
      theme: { primary: "#ff5733", containerWidth: 1000 },
      typography: { bodyFont: "Inter", headingFont: "Space Grotesk" },
      business: {},
      socialLinks: [],
      page: {},
    },
  };
}

describe("dynamic site theme", () => {
  it("merges Page Settings branding and typography over the base theme", () => {
    const resolved = resolveSiteTheme({
      theme: { fontSans: "Manrope" },
      settings: { theme: { primary: "#ff5733" }, typography: { bodyFont: "Inter", headingFont: "Space Grotesk" } },
    });
    expect(resolved.accent).toBe("#ff5733");
    expect(resolved.fontSans).toBe("Inter");
    expect(resolved.fontDisplay).toBe("Space Grotesk");
    expect(resolved.bg1).toBe(resolved.bg1);
  });

  it("keeps base fonts when no typography override is set", () => {
    const resolved = resolveSiteTheme({ theme: { fontSans: "Manrope", fontDisplay: "Outfit" } });
    expect(resolved.fontSans).toBe("Manrope");
    expect(resolved.fontDisplay).toBe("Outfit");
  });

  it("exposes css vars including colour and container width", () => {
    const vars = siteThemeCSS({
      settings: { theme: { primary: "#ff5733", containerWidth: 1000 } },
    });
    expect(vars["--color-cta"]).toBe("#ff5733");
    expect(vars["--color-green"]).toBe("#ff5733");
    expect(vars["--op-container"]).toBe("1000px");
  });
});

describe("var() colours stay dynamic", () => {
  it("applyBlockStyle carries var() colours through unchanged", () => {
    const css = applyBlockStyle({ backgroundColor: "var(--color-cta)" });
    expect(css.backgroundColor).toBe("var(--color-cta)");
  });

  it("blockStyleTag emits var() colours scoped to the block", () => {
    const tag = blockStyleTag("sec-a", { backgroundColor: "var(--color-cta)" });
    expect(tag).toContain('[data-block-id="sec-a"]');
    expect(tag).toContain("background-color:var(--color-cta) !important");
  });
});

describe("padding and margin edits work properly", () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig(site());
  });

  it("persists every side and does not clobber siblings on later edits", () => {
    useConfigStore.getState().updateBlockStyle("sec-a", {
      marginTop: "10px",
      marginRight: "20px",
      paddingBottom: "30px",
    });
    useConfigStore.getState().updateBlockStyle("sec-a", { paddingLeft: "5px" });

    const blocks = useConfigStore.getState().config.pages![0].blocks;
    const style = blocks.find((b) => b.id === "sec-a")!.style!;
    expect(style.marginTop).toBe("10px");
    expect(style.marginRight).toBe("20px");
    expect(style.paddingBottom).toBe("30px");
    expect(style.paddingLeft).toBe("5px");
  });

  it("device overrides never leak into the desktop style", () => {
    useConfigStore.getState().updateBlockStyle("sec-a", { paddingTop: "40px" });
    useConfigStore.getState().updateBlockStyle("sec-a", {
      responsive: { mobile: { paddingTop: "8px" } },
    });

    const blocks = useConfigStore.getState().config.pages![0].blocks;
    const style = blocks.find((b) => b.id === "sec-a")!.style!;
    expect(style.paddingTop).toBe("40px");
    expect(style.responsive!.mobile!.paddingTop).toBe("8px");
    expect(style.responsive!.mobile!.paddingTop).not.toBe(style.paddingTop);
  });

  it("spacing edits on one section never touch its neighbours", () => {
    useConfigStore.getState().updateBlockStyle("sec-a", { marginTop: "24px", paddingTop: "12px" });

    const blocks = useConfigStore.getState().config.pages![0].blocks;
    const a = blocks.find((b) => b.id === "sec-a")!.style!;
    const b = blocks.find((b) => b.id === "sec-b")!.style;
    expect(a.marginTop).toBe("24px");
    expect(a.paddingTop).toBe("12px");
    expect(b).toBeUndefined();
  });
});