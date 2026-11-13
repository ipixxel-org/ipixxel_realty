import { describe, expect, it } from "vitest";
import { parseLinkLines, serializeLinkLines } from "@/lib/openpage/link-lines";
import { parseLinks } from "@/components/openpage/blocks/ipixxel/IpxModernBlocks";

describe("footer link lines", () => {
  it("round-trips existing footer text unchanged", () => {
    const existing = [
      "+91 90000 00000 | tel:+919000000000\n# About Us\nOur Story\nCareers",
      "Overview | #overview\nAmenities | #amenities",
      "Disclaimer\nPrivacy Policy\nTerms of Use",
    ];
    for (const v of existing) expect(serializeLinkLines(parseLinkLines(v))).toBe(v);
  });

  it("parses headings, links and target flags", () => {
    expect(parseLinkLines("# About\nBlog | https://x.com | new\nHome | / | same\nText")).toEqual([
      { heading: true, label: "About", href: "", target: "auto" },
      { heading: false, label: "Blog", href: "https://x.com", target: "_blank" },
      { heading: false, label: "Home", href: "/", target: "_self" },
      { heading: false, label: "Text", href: "", target: "auto" },
    ]);
  });

  it("strips pipes from labels and drops empty rows", () => {
    expect(
      serializeLinkLines([
        { heading: false, label: "A|B", href: "#x", target: "_blank" },
        { heading: false, label: "", href: "#y", target: "auto" },
      ]),
    ).toBe("AB | #x | new");
  });

  it("renderer reads the target flag, old lines unchanged", () => {
    expect(parseLinks("Blog | https://x.com | same\nMap | #map | new\nOld | https://y.com")).toEqual([
      { label: "Blog", href: "https://x.com", heading: false, newTab: false },
      { label: "Map", href: "#map", heading: false, newTab: true },
      { label: "Old", href: "https://y.com", heading: false },
    ]);
  });
});
