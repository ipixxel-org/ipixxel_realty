import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const fetchPublicPageBySlug = vi.fn();
vi.mock("@/lib/openpage/server-pages", () => ({
  fetchPublicPageBySlug: (slug: string) => fetchPublicPageBySlug(slug),
}));

import { livePagePath, publicPagePath, withQuery } from "@/lib/openpage/paths";
import { resolveLegacyPublicPage } from "@/lib/openpage/legacy-public-route";

describe("public page URLs", () => {
  it("scopes the public URL to the organisation", () => {
    expect(publicPagePath("zen-homes", "aurelia-reserve")).toBe("/p/zen-homes/aurelia-reserve");
    expect(publicPagePath("a b", "c/d")).toBe("/p/a%20b/c%2Fd");
  });

  it("opens live pages by id", () => {
    expect(livePagePath("3f2b8c1e-0000-4000-8000-000000000001")).toBe(
      "/live/3f2b8c1e-0000-4000-8000-000000000001",
    );
  });

  it("keeps query strings (UTM tags) across redirects", () => {
    expect(withQuery("/p/acme/x", { utm_source: "fb", tag: ["a", "b"], empty: undefined })).toBe(
      "/p/acme/x?utm_source=fb&tag=a&tag=b",
    );
    expect(withQuery("/p/acme/x", {})).toBe("/p/acme/x");
  });
});

describe("legacy public routes", () => {
  beforeEach(() => {
    redirect.mockClear();
    fetchPublicPageBySlug.mockReset();
  });

  it("redirects /p/:slug to the organisation-scoped URL, keeping UTM tags", async () => {
    fetchPublicPageBySlug.mockResolvedValue({ id: "p1", slug: "aurelia-reserve", orgSlug: "zen-homes" });

    await expect(
      resolveLegacyPublicPage("aurelia-reserve", { searchParams: { utm_source: "ads" } }),
    ).rejects.toThrow("NEXT_REDIRECT:/p/zen-homes/aurelia-reserve?utm_source=ads");
  });

  it("redirects the thank-you companion to the org-scoped thank-you URL", async () => {
    fetchPublicPageBySlug.mockResolvedValue({
      id: "ty1",
      slug: "aurelia-reserve-thank-you",
      orgSlug: "zen-homes",
    });

    await expect(resolveLegacyPublicPage("aurelia-reserve", { thankYou: true })).rejects.toThrow(
      "NEXT_REDIRECT:/p/zen-homes/aurelia-reserve/thank-you",
    );
    expect(fetchPublicPageBySlug).toHaveBeenCalledWith("aurelia-reserve/thank-you");
  });

  it("returns the page unchanged when there is nothing to redirect to", async () => {
    fetchPublicPageBySlug.mockResolvedValueOnce(null);
    await expect(resolveLegacyPublicPage("missing")).resolves.toBeNull();

    const orphan = { id: "p2", slug: "x" };
    fetchPublicPageBySlug.mockResolvedValueOnce(orphan);
    await expect(resolveLegacyPublicPage("x")).resolves.toBe(orphan);
    expect(redirect).not.toHaveBeenCalled();
  });
});
