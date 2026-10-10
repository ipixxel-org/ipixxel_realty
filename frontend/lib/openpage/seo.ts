import type { LandingPageData, SiteConfig } from "./types";
import { ensureConfig } from "./site-config";

export function suggestedCanonical(page: LandingPageData): string {
  const host = page.domain.trim();
  if (host) return `https://${host.replace(/^https?:\/\//, "")}`;
  // Per-individual landing page: landing pages (kind custom) are previewed via /preview/:id, not /p/:slug
  const isLandingPage = page.kind === "custom" || page.pageType === "landing" && page.id.includes("-");
  if (isLandingPage && page.id) {
    if (typeof window !== "undefined") return `${window.location.origin}/preview/${encodeURIComponent(page.id)}`;
    return `/preview/${encodeURIComponent(page.id)}`;
  }
  if (typeof window !== "undefined") return `${window.location.origin}/p/${page.slug}`;
  return `/p/${page.slug}`;
}

export function buildJsonLd(page: LandingPageData, cfg: SiteConfig): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: cfg.seo.ogTitle || cfg.brand.name || page.name,
    url: cfg.seo.canonical || suggestedCanonical(page),
    description: cfg.seo.ogDescription || cfg.seo.metaDescription,
    image: cfg.seo.ogImage || undefined,
    telephone: cfg.brand.phone || undefined,
    email: cfg.brand.email || undefined,
    brand: cfg.brand.name || undefined,
  };
}

export function jsonLdValid(data: Record<string, unknown>): boolean {
  return Boolean(data.name && data.url && data.description);
}

const MANAGED = "data-openpage-seo";

// Reuse the server-rendered tag (Next.js `generateMetadata`) when present so
// these routes don't end up with duplicate description / robots / canonical /
// OpenGraph / Twitter tags. `adopted` tracks a tag we took over from the SSR
// head: leaving one of those alone (rather than removing it) keeps the
// server-rendered value when the client has nothing better to say.
function upsertMeta(attr: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`meta[${attr}="${key}"][${MANAGED}]`) as HTMLMetaElement | null;
  let adopted = false;
  if (!el) {
    const existing = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
    if (existing) {
      existing.setAttribute(MANAGED, "true");
      el = existing;
      adopted = true;
    }
  }
  if (!content) {
    if (el && !adopted) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED, "true");
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`link[rel="${rel}"][${MANAGED}]`) as HTMLLinkElement | null;
  let adopted = false;
  if (!el) {
    const existing = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (existing) {
      existing.setAttribute(MANAGED, "true");
      el = existing;
      adopted = true;
    }
  }
  if (!href) {
    if (el && !adopted) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    el.setAttribute(MANAGED, "true");
    document.head.appendChild(el);
  }
  el.href = href;
}

export function applyDocumentSeo(page: LandingPageData) {
  if (typeof document === "undefined") return;
  const cfg = ensureConfig(page);
  document.title = cfg.seo.metaTitle || page.name;
  document.documentElement.lang = cfg.page.language || "en";
  upsertMeta("name", "description", cfg.seo.metaDescription);
  upsertMeta("name", "keywords", cfg.seo.keywords);
  const robots =
    cfg.seo.robots?.trim() ||
    (cfg.seo.index ? "index,follow" : "noindex,nofollow");
  upsertMeta("name", "robots", robots);
  upsertMeta("property", "og:title", cfg.seo.ogTitle || cfg.seo.metaTitle);
  upsertMeta("property", "og:description", cfg.seo.ogDescription || cfg.seo.metaDescription);
  upsertMeta("property", "og:image", cfg.seo.ogImage);
  upsertMeta("property", "og:url", cfg.seo.canonical);
  upsertMeta("name", "twitter:card", cfg.seo.twitterCard ?? (cfg.seo.ogImage ? "summary_large_image" : "summary"));
  upsertMeta("name", "twitter:title", cfg.seo.twitterTitle || cfg.seo.ogTitle || cfg.seo.metaTitle);
  upsertMeta("name", "twitter:description", cfg.seo.twitterDescription || cfg.seo.ogDescription || cfg.seo.metaDescription);
  upsertMeta("name", "twitter:image", cfg.seo.twitterImage || cfg.seo.ogImage);
  upsertLink("canonical", cfg.seo.canonical);
  upsertLink("icon", cfg.page.favicon);

  const schema =
    typeof cfg.seo.schema === "string" && cfg.seo.schema.trim()
      ? parseJsonLd(cfg.seo.schema) ?? buildJsonLd(page, cfg)
      : buildJsonLd(page, cfg);

  let script = document.head.querySelector(`script[type="application/ld+json"][${MANAGED}]`) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(MANAGED, "true");
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema);
}

function parseJsonLd(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
