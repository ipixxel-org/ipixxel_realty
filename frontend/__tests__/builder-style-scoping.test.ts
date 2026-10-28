import { beforeEach, describe, expect, it } from "vitest";
import { useConfigStore } from "@/components/openpage/store/configStore";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";
import {
  applyBlockBoxStyleForDevice,
  blockStyleTag,
  cssBackgroundImage,
  elementStyleTag,
  overlayLayer,
} from "@/lib/openpage/block-style";
import { isItemElementId } from "@/lib/openpage/element-style";
import { parseLinearGradient } from "@/components/openpage/editor/BackgroundControls";

/** Every `selector { decls }` rule in a generated stylesheet. */
function rules(css: string): Array<{ selector: string; body: string }> {
  return css
    .split("\n")
    .filter(Boolean)
    .map((line) => ({
      selector: line.slice(0, line.indexOf("{")).trim(),
      body: line.slice(line.indexOf("{") + 1, line.lastIndexOf("}")),
    }));
}

/** True when some rule containing `decl` matches the element with this id. */
function styled(css: string, id: string, decl: string): boolean {
  const el = document.getElementById(id)!;
  return rules(css).some((r) => r.body.includes(decl) && el.matches(r.selector));
}

const SECTION = `
  <div data-block-id="sec">
    <section id="root">
      <h2 id="heading">Heading</h2>
      <p id="subtitle">Subtitle</p>
      <div id="grid">
        <div id="card" data-op-item="" data-el-id="sec|items:it_1">
          <h3 id="card-title">Card</h3>
          <div id="card-label" class="text-text-3 uppercase"><span id="card-label-text">Label</span></div>
          <button id="card-btn">Card CTA</button>
        </div>
      </div>
      <a id="link" href="#x">Read more</a>
      <a id="cta" class="op-btn" href="#y">Enquire</a>
      <button id="btn">Book</button>
      <form id="form"><label id="form-label">Name</label><input /></form>
    </section>
  </div>`;

describe("section Type settings stay out of cards, buttons and forms", () => {
  beforeEach(() => {
    document.body.innerHTML = SECTION;
  });

  it("styles section text only", () => {
    const css = blockStyleTag("sec", { typography: { color: "#ff0000", fontFamily: "Inter" } });
    expect(styled(css, "heading", "color:#ff0000")).toBe(true);
    expect(styled(css, "subtitle", "color:#ff0000")).toBe(true);
    expect(styled(css, "link", "color:#ff0000")).toBe(true);

    for (const id of ["card", "card-title", "card-label-text", "card-btn", "cta", "btn", "form-label"]) {
      expect(styled(css, id, "color:#ff0000"), id).toBe(false);
      expect(styled(css, id, "font-family"), id).toBe(false);
    }
  });

  it("never puts typography on wrappers that cards would inherit from", () => {
    const css = blockStyleTag("sec", { typography: { color: "#ff0000" } });
    expect(styled(css, "root", "color:#ff0000")).toBe(false);
    expect(styled(css, "grid", "color:#ff0000")).toBe(false);
  });

  it("styles every card at once through the Cards target", () => {
    const css = blockStyleTag("sec", { itemTypography: { color: "#00aa00" } });
    expect(styled(css, "card", "color:#00aa00")).toBe(true);
    expect(styled(css, "card-title", "color:#00aa00")).toBe(true);
    expect(styled(css, "card-btn", "color:#00aa00")).toBe(false);
    expect(styled(css, "heading", "color:#00aa00")).toBe(false);
  });
});

describe("Style this item reaches the card's own text", () => {
  it("applies card typography to children that carry their own classes", () => {
    document.body.innerHTML = SECTION;
    const css = elementStyleTag("sec|items:it_1", {
      typography: { color: "#123456", fontSize: "20px", letterSpacing: "2px", textTransform: "none" },
    });
    for (const id of ["card-title", "card-label", "card-label-text"]) {
      expect(styled(css, id, "color:#123456"), id).toBe(true);
      expect(styled(css, id, "font-size:20px"), id).toBe(true);
      expect(styled(css, id, "letter-spacing:2px"), id).toBe(true);
      expect(styled(css, id, "text-transform:none"), id).toBe(true);
    }
    expect(styled(css, "card-btn", "color:#123456")).toBe(false);
  });
});

describe("card hover / active text colour", () => {
  it("reaches the card's title and description, above their static colour", () => {
    document.body.innerHTML = SECTION;
    const card = elementStyleTag(
      "sec|items:it_1",
      { typography: { color: "#111111" }, hover: { color: "#ff0000" }, active: { color: "#00ff00" } },
      0,
    );
    const rulesFor = (decl: string) => rules(card).filter((r) => r.body.includes(decl));
    const hover = rulesFor("color:#ff0000").find((r) => r.selector.includes(":where("))!;
    const active = rulesFor("color:#00ff00").find((r) => r.selector.includes(":where("))!;
    const base = rulesFor("color:#111111").find((r) => r.selector.includes(":where("))!;

    // The hover rule targets the card's text, not its buttons.
    const title = document.getElementById("card-title")!;
    const hoverPlain = hover.selector.replaceAll(":hover", "");
    expect(title.matches(hoverPlain)).toBe(true);
    expect(document.getElementById("card-btn")!.matches(hoverPlain)).toBe(false);
    expect(active.selector).toContain('[data-active="true"]');

    // One more attribute selector than the static rule, so hover wins.
    const attrs = (s: string) => (s.split(" :where(")[0].match(/\[data-el-id=/g) || []).length;
    expect(attrs(hover.selector)).toBeGreaterThan(attrs(base.selector));
  });
});

describe("section box styles are applied once", () => {
  it("puts transform, shadow and opacity on the wrapper only", () => {
    document.body.innerHTML = SECTION;
    const css = blockStyleTag("sec", {
      transform: "rotate(10deg)",
      boxShadow: "0 0 4px #000",
      opacity: "0.5",
      backgroundImage: "https://cdn.example.com/a.jpg",
    });
    const transformRules = rules(css).filter((r) => r.body.includes("transform:"));
    expect(transformRules).toHaveLength(1);
    expect(document.querySelector('[data-block-id="sec"]')!.matches(transformRules[0].selector)).toBe(true);
    expect(styled(css, "root", "transform:")).toBe(false);
    expect(styled(css, "root", "opacity:")).toBe(false);
    // The block root goes transparent so the wrapper's background shows once.
    expect(styled(css, "root", "background:transparent")).toBe(true);
  });

  it("keeps visual properties out of the wrapper's inline style", () => {
    const inline = applyBlockBoxStyleForDevice(
      { transform: "rotate(10deg)", backgroundColor: "#000", opacity: "0.4", paddingTop: "20px" },
      "desktop",
    );
    expect(inline).toEqual({ paddingTop: "20px" });
  });

  it("keeps the background on a sticky header root", () => {
    document.body.innerHTML = `<div data-block-id="nav"><nav id="nav-root" class="sticky top-0">Menu</nav></div>`;
    const css = blockStyleTag("nav", { backgroundColor: "#123456" });
    expect(styled(css, "nav-root", "background-color:#123456")).toBe(true);
  });

  it("does not leak a container's background into nested sections", () => {
    const css = blockStyleTag("cols", { backgroundColor: "#eee" });
    expect(css).not.toMatch(/\[data-block-id="cols"\] section/);
  });
});

describe("backgrounds", () => {
  it("passes gradients through instead of wrapping them in url()", () => {
    expect(cssBackgroundImage("linear-gradient(135deg, #111, #222)")).toBe("linear-gradient(135deg, #111, #222)");
    expect(cssBackgroundImage("url('a.jpg')")).toBe("url('a.jpg')");
    expect(cssBackgroundImage("https://x.test/a b.jpg")).toBe('url("https://x.test/a b.jpg")');
    const css = blockStyleTag("sec", { backgroundImage: "linear-gradient(90deg, red, blue)" });
    expect(css).toContain("background-image:linear-gradient(90deg, red, blue) !important");
    expect(css).not.toContain("url(linear-gradient");
  });

  it("paints the overlay above the background image", () => {
    expect(overlayLayer(undefined, "0.5")).toBeUndefined();
    expect(overlayLayer("#000000", "0.4")).toBe(
      "linear-gradient(color-mix(in srgb, #000000 40%, transparent), color-mix(in srgb, #000000 40%, transparent))",
    );
    const css = blockStyleTag("sec", {
      backgroundImage: "url('a.jpg')",
      overlayColor: "#000000",
      overlayOpacity: "0.4",
    });
    expect(css).toMatch(/background-image:linear-gradient\(color-mix\(in srgb, #000000 40%, transparent\)[^;]*\), url\('a\.jpg'\) !important/);
  });

  it("paints an overlay over a plain background colour", () => {
    const css = blockStyleTag("sec", { backgroundColor: "#ffffff", overlayColor: "red" });
    expect(css).toContain("background-color:#ffffff !important");
    expect(css).toContain("color-mix(in srgb, red 50%, transparent)");
  });

  it("reads a saved gradient back into the editor", () => {
    expect(parseLinearGradient("linear-gradient(45deg, #111111, #222222)")).toEqual({
      angle: 45,
      from: "#111111",
      to: "#222222",
    });
    expect(parseLinearGradient("linear-gradient(90deg, rgba(0, 0, 0, 0.5), #fff)")).toEqual({
      angle: 90,
      from: "rgba(0, 0, 0, 0.5)",
      to: "#fff",
    });
    expect(parseLinearGradient("url(a.jpg)")).toBeNull();
  });
});

describe("item element ids", () => {
  it("separates fixed parts from list items", () => {
    expect(isItemElementId("faq", "faq:title")).toBe(false);
    expect(isItemElementId("hero", "hero:subtitle")).toBe(false);
    expect(isItemElementId("faq", "items:it_1")).toBe(true);
    expect(isItemElementId("faq", "items:it_1/title")).toBe(true);
    expect(isItemElementId("footer", "columns:col_1/links:lnk_1")).toBe(true);
  });
});

function site(block: BlockConfig): SiteConfig {
  return { name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [block] }] };
}
const current = (): BlockConfig => useConfigStore.getState().config.pages![0].blocks[0];

describe("device-scoped style writes", () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig(
      site({
        id: "b1",
        type: "columns",
        variant: "default",
        props: {},
        style: { paddingTop: "40px", typography: { color: "#111" } },
      }),
    );
  });

  it("a mobile edit never touches desktop", () => {
    useConfigStore.getState().setBlockStyleForDevice("b1", { paddingTop: "8px" }, "mobile");
    expect(current().style!.paddingTop).toBe("40px");
    expect(current().style!.responsive!.mobile!.paddingTop).toBe("8px");
  });

  it("a desktop edit never touches mobile", () => {
    useConfigStore.getState().setBlockStyleForDevice("b1", { paddingTop: "8px" }, "mobile");
    useConfigStore.getState().setBlockStyleForDevice("b1", { paddingTop: "64px" }, "desktop");
    expect(current().style!.paddingTop).toBe("64px");
    expect(current().style!.responsive!.mobile!.paddingTop).toBe("8px");
  });

  it("a desktop element edit keeps the element's mobile overrides", () => {
    const { setElementStyle } = useConfigStore.getState();
    setElementStyle("b1", "columns:title", { typography: { fontSize: "14px" } }, "mobile");
    setElementStyle("b1", "columns:title", { typography: { fontSize: "40px" } }, "desktop");
    const el = current().elementStyles!["columns:title"];
    expect(el.typography!.fontSize).toBe("40px");
    expect(el.responsive!.mobile!.typography!.fontSize).toBe("14px");
  });

  it("Style reset keeps typography owned by the Type tab", () => {
    useConfigStore.getState().setBlockStyleForDevice("b1", { paddingTop: "8px" }, "mobile");
    useConfigStore.getState().resetBlockStyle("b1", "desktop", ["typography", "itemTypography"]);
    expect(current().style).toEqual({ typography: { color: "#111" } });
  });

  it("a device reset clears only that device", () => {
    useConfigStore.getState().setBlockStyleForDevice("b1", { paddingTop: "8px" }, "mobile");
    useConfigStore.getState().setBlockStyleForDevice("b1", { paddingTop: "16px" }, "tablet");
    useConfigStore.getState().resetBlockStyle("b1", "mobile");
    expect(current().style!.paddingTop).toBe("40px");
    expect(current().style!.responsive).toEqual({ tablet: { paddingTop: "16px" } });
  });
});
