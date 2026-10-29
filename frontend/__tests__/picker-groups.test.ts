import { describe, expect, it } from "vitest";
import { PICKER_GROUPS } from "@/components/openpage/editor/LayersPanel";

describe("Blocks panel groups", () => {
  it("lists every widget in exactly one group", () => {
    const all = PICKER_GROUPS.flatMap((g) => g.types);
    const repeated = all.filter((t, i) => all.indexOf(t) !== i);
    expect(repeated).toEqual([]);
  });

  it("still offers every widget it offered before de-duplication", () => {
    const offered = new Set(PICKER_GROUPS.flatMap((g) => g.types));
    for (const type of [
      "heading", "text", "button", "columns", "image", "video", "icon", "icon-box", "divider", "spacer",
      "location", "html-code", "banner", "features", "faq", "cta", "custom-section", "gallery", "image-box",
      "project-banner", "project-overview", "property-details", "unit-config", "amenities", "floor-plans",
      "re-pricing", "developer", "testimonials", "lead-form", "download-brochure", "site-visit", "newsletter",
      "navbar", "footer",
    ]) {
      expect(offered.has(type as never), type).toBe(true);
    }
  });
});
