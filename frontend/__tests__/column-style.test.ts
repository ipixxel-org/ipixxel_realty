import { describe, expect, it } from "vitest";
import { columnStyleCss, hasColumnBackground, readColumnStyle } from "@/lib/openpage/column-style";

describe("column style", () => {
  it("adds nothing for an old column without style keys", () => {
    expect(columnStyleCss({ width: 50, blocks: [] })).toEqual({});
    expect(hasColumnBackground({ width: 50, blocks: [] })).toBe(false);
  });

  it("builds a background image with defaults and px lengths", () => {
    const css = columnStyleCss({ bgImage: "https://x.test/a.jpg", padding: "20", borderRadius: "12" });
    expect(css.backgroundImage).toBe('url("https://x.test/a.jpg")');
    expect(css.backgroundSize).toBe("cover");
    expect(css.backgroundPosition).toBe("center");
    expect(css.backgroundRepeat).toBe("no-repeat");
    expect(css.padding).toBe("20px");
    expect(css.borderRadius).toBe("12px");
  });

  it("paints the overlay (colour + opacity) over the image", () => {
    const css = columnStyleCss({ bgImage: "url('a.jpg')", bgOverlay: "#000000", bgOverlayOpacity: "0.4" });
    const tint = "color-mix(in srgb, #000000 40%, transparent)";
    expect(css.backgroundImage).toBe(`linear-gradient(${tint}, ${tint}), url('a.jpg')`);
  });

  it("an overlay on a colour-only column still shows", () => {
    const css = columnStyleCss({ bgColor: "#fff", bgOverlay: "#000" });
    expect(css.backgroundColor).toBe("#fff");
    expect(css.backgroundImage).toContain("color-mix(in srgb, #000 50%, transparent)");
  });

  it("ignores empty / none / transparent values", () => {
    expect(readColumnStyle({ bgColor: "transparent", bgImage: "none", padding: " " })).toEqual({});
  });
});
