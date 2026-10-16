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
  organisation?: { customDomain?: string | null; slug?: string | null } | null;
  sourceTemplate?: { name?: string | null } | null;
  thankYouPage?: LandingPageData["thankYouPage"];
  parentLandingPage?: LandingPageData["parentLandingPage"];
}

/** Normalise a slug the same way the backend resolver does. */
function slugKey(rawSlug: string): string {
  const rawKey = decodeURIComponent(rawSlug ?? "").trim().toLowerCase();
  return rawKey.replace(/\s+/g, "-");
}

/**
 * Maps the backend's public page payload onto LandingPageData. Mirrors the
 * mapping in `store.findPageBySlug` so the server-rendered HTML matches the
 * client render exactly (same config hydration, design id, page type).
 */
function mapPublicPage(raw: RawPublicPage, key: string): LandingPageData {
  const templateName = raw.sourceTemplate?.name ?? raw.name ?? "EstatePro Standard";
  const mapped: LandingPageData = {
    id: raw.id,
    name: raw.name ?? "Landing page",
    slug: raw.slug ?? key,
    orgSlug: raw.organisation?.slug ?? undefined,
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
}

async function fetchPublicPage(path: string, key: string): Promise<LandingPageData | null> {
  try {
    const res = await fetch(`${backendBaseUrl()}${path}?track=0`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawPublicPage;
    if (!raw || !raw.id) return null;
    return mapPublicPage(raw, key);
  } catch {
    return null;
  }
}

/**
 * Legacy lookup by page slug alone (`/p/:slug`, `/:slug`). Page slugs are
 * only unique per organisation, so this may match several orgs — the
 * backend returns the most recently published. Callers redirect to the
 * organisation-scoped URL; new links never use this.
 */
export async function fetchPublicPageBySlug(rawSlug: string): Promise<LandingPageData | null> {
  const key = slugKey(rawSlug);
  if (!key) return null;
  return fetchPublicPage(`/public/site/page/${encodeURIComponent(key)}`, key);
}

/** Server-side lookup of a page within one organisation (`/p/:orgSlug/:slug`). */
export async function fetchPublicPageInOrg(
  rawOrgSlug: string,
  rawSlug: string,
): Promise<LandingPageData | null> {
  const org = slugKey(rawOrgSlug);
  const key = slugKey(rawSlug);
  if (!org || !key) return null;
  return fetchPublicPage(
    `/public/site/org/${encodeURIComponent(org)}/page/${encodeURIComponent(key)}`,
    key,
  );
}

/** Org slug + page slug for a page id (no content) — backs /live/:id. */
export async function fetchPublicPagePath(
  id: string,
): Promise<{ orgSlug: string; slug: string; pageType: string } | null> {
  try {
    const res = await fetch(`${backendBaseUrl()}/public/site/page-path/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { orgSlug?: unknown; slug?: unknown; pageType?: unknown };
    if (typeof data?.orgSlug !== "string" || typeof data?.slug !== "string") return null;
    return {
      orgSlug: data.orgSlug,
      slug: data.slug,
      pageType: typeof data.pageType === "string" ? data.pageType : "landing",
    };
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
