import { describe, expect, it } from "vitest";
import { parseNavLines, serializeNavLines } from "@/lib/openpage/nav-lines";

describe("nav-lines", () => {
  it("round-trips the default menu unchanged", () => {
    const v = "Overview\nResidences\nLifestyle\nAmenities\nLocation\nGallery";
    expect(serializeNavLines(parseNavLines(v))).toBe(v);
  });

  it("shows section IDs with # and keeps URLs as typed", () => {
    const items = parseNavLines("Plans | floor-plans\nSite | https://example.com | new\nAbout | /about\nG | #gallery");
    expect(items).toEqual([
      { label: "Plans", href: "#floor-plans", newTab: false },
      { label: "Site", href: "https://example.com", newTab: true },
      { label: "About", href: "/about", newTab: false },
      { label: "G", href: "#gallery", newTab: false },
    ]);
  });

  it("writes the new-tab flag, drops empty labels and strips pipes", () => {
    const s = serializeNavLines([
      { label: "", href: "#x", newTab: false },
      { label: "A|B", href: "https://x.com/|y", newTab: true },
      { label: "C", href: "#c", newTab: false },
      { label: "D", href: "", newTab: true },
    ]);
    expect(s).toBe("AB | https://x.com/y | new\nC | #c\nD |  | new");
  });
});
