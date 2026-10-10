import { describe, expect, it } from "vitest";
import { landingMetadata } from "@/lib/openpage/server-pages";
import type { LandingPageData, SiteConfig } from "@/lib/openpage/types";

function page(overrides: Partial<LandingPageData> = {}): LandingPageData {
  return {
    id: "p1",
    name: "Acme Tower",
    slug: "acme",
    status: "published",
    template: "EstatePro",
    domain: "",
    views: "-",
    conversions: "-",
    updated: "",
    thumbnail: "",
    sections: [],
    kind: "custom",
    pageType: "landing",
    ...overrides,
  };
}

describe("landingMetadata", () => {
  it("falls back to the route canonical and indexes by default", () => {
    const meta = landingMetadata(page(), { canonical: "https://ipixxel.ae/acme", origin: "https://ipixxel.ae" });
    expect(typeof meta.title).toBe("string");
    expect(meta.alternates?.canonical).toBe("https://ipixxel.ae/acme");
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it("honours SEO overrides, canonical and noindex", () => {
    const config = {
      seo: {
        metaTitle: "Best Tower",
        metaDescription: "A great place",
        keywords: "tower, dubai",
        index: false,
        canonical: "https://acme.com/",
        twitterCard: "summary",
      },
    } as unknown as SiteConfig;

    const meta = landingMetadata(page({ config, name: "ignored" }), { canonical: "https://fallback" });
    expect(meta.title).toBe("Best Tower");
    expect(meta.description).toBe("A great place");
    expect(meta.keywords).toEqual(["tower", "dubai"]);
    expect(meta.alternates?.canonical).toBe("https://acme.com/");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.twitter?.card).toBe("summary");
  });
});
