import type { Metadata } from "next";
import type { LandingPageData, SiteConfig } from "./types";
import { ensureConfig } from "./site-config";
import { applyLandingPagePropertyFromConfig } from "./data";
import { inferDesignId } from "./page-templates";
import { backendBaseUrl } from "../backend-url";

// Server-only helpers for public landing routes. These intentionally do NOT use
// `apiFetch` (browser-oriented: relative URL + localStorage tokens). Server
// code must talk to the backend directly via an absolute URL, mirroring
// `resolve-host.ts`.

/** Shape returned by the backend `public/site/page/:slug` endpoint (partial). */
interface RawPublicPage {
  id: string;
  name?: string;
  slug?: string;
  status?: string;
  updatedAt?: string;
  thumbnail?: string | null;
  parentId?: string | null;
  pageType?: string;
  content?: {
    sections?: LandingPageData["sections"];
    config?: SiteConfig;
    site?: LandingPageData["openPageSite"];
  } | null;
  organisation?: { customDomain?: string | null } | null;
  sourceTemplate?: { name?: string | null } | null;
  thankYouPage?: LandingPageData["thankYouPage"];
  parentLandingPage?: LandingPageData["parentLandingPage"];
}

/**
 * Server-side lookup of a published landing page by slug. Mirrors the mapping
 * in `store.findPageBySlug` so the server-rendered HTML matches the client
 * render exactly (same config hydration, design id, page type).
 */
export async function fetchPublicPageBySlug(rawSlug: string): Promise<LandingPageData | null> {
  const rawKey = decodeURIComponent(rawSlug ?? "").trim().toLowerCase();
  const key = rawKey.replace(/\s+/g, "-");
  if (!key) return null;
  try {
    const res = await fetch(`${backendBaseUrl()}/public/site/page/${encodeURIComponent(key)}?track=0`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawPublicPage;
    if (!raw || !raw.id) return null;
    const templateName = raw.sourceTemplate?.name ?? raw.name ?? "EstatePro Standard";
    const mapped: LandingPageData = {
      id: raw.id,
      name: raw.name ?? "Landing page",
      slug: raw.slug ?? key,
      status: (raw.status ?? "published") as LandingPageData["status"],
      template: templateName,
      domain: raw.organisation?.customDomain ?? "",
      views: "—",
      conversions: "—",
      updated: "",
      updatedAt: raw.updatedAt,
      thumbnail: raw.thumbnail ?? "",
      sections: raw.content?.sections ?? [],
      config: raw.content?.config ? ensureConfig({ config: raw.content.config } as unknown as LandingPageData) : undefined,
      openPageSite: raw.content?.site,
      kind: "custom",
      designId: inferDesignId(templateName),
      pageType: raw.pageType === "thank_you" ? "thank-you" : "landing",
      parentPageId: raw.parentId ?? undefined,
      thankYouPage: raw.thankYouPage ?? null,
      parentLandingPage: raw.parentLandingPage ?? null,
      isPaid: false,
      category: null,
    };
    applyLandingPagePropertyFromConfig(mapped.config);
    return mapped;
  } catch {
    return null;
  }
}

/** Request origin (protocol + host) from the incoming headers, server-side. */
export async function requestOrigin(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = (h.get("host") ?? "").trim().toLowerCase();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return host ? `${proto}://${host}` : "";
}

/**
 * Build Next.js `Metadata` for a landing page so the crawl-critical tags
 * (title, description, robots, canonical, OpenGraph, Twitter) are rendered in
 * the server HTML instead of only being injected client-side.
 */
export function landingMetadata(
  page: LandingPageData,
  options: { canonical?: string; origin?: string } = {},
): Metadata {
  const cfg = ensureConfig(page);
  const seo = cfg.seo;
  const title = seo.metaTitle || page.name;
  const description = seo.metaDescription || undefined;
  const explicitRobots = seo.robots?.trim();
  const noindex = seo.index === false || /noindex/i.test(explicitRobots ?? "");
  const image = seo.ogImage || seo.twitterImage || undefined;
  const canonical = (seo.canonical?.trim() || options.canonical || "").trim() || undefined;

  return {
    title,
    description,
    keywords: seo.keywords
      ? seo.keywords.split(",").map((k) => k.trim()).filter(Boolean)
      : undefined,
    robots: explicitRobots
      ? explicitRobots
      : { index: !noindex, follow: !noindex },
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title: seo.ogTitle || title,
      description: seo.ogDescription || description,
      url: canonical,
      siteName: cfg.brand?.name || undefined,
      images: image ? [{ url: image }] : undefined,
      type: "website",
    },
    twitter: {
      card: seo.twitterCard ?? (image ? "summary_large_image" : "summary"),
      title: seo.twitterTitle || seo.ogTitle || title,
      description: seo.twitterDescription || seo.ogDescription || description,
      images: image ? [image] : undefined,
    },
    icons: cfg.page?.favicon ? { icon: cfg.page.favicon } : undefined,
  };
}

/** Metadata for a route whose page could not be resolved server-side. */
export const NOT_FOUND_METADATA: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};
