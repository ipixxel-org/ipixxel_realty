import { hostname, isPlatformHost } from "@/lib/platform-hosts";
import { backendBaseUrl } from "@/lib/backend-url";
import { publicPagePath } from "@/lib/openpage/paths";

// Served at /sitemap.xml on every host. proxy.ts deliberately excludes
// sitemap.xml from the /org-site rewrite so this route handles both:
//  - platform hosts (ipixxel.ae): one <url> per published /:slug page
//  - custom domains: proxied to the backend's per-domain sitemap
export const dynamic = "force-dynamic";

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
};

interface SitemapEntry {
  loc: string;
  lastmod?: string | null;
  changefreq?: string;
  priority?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderUrlset(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const parts = [`<loc>${escapeXml(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`<lastmod>${escapeXml(e.lastmod)}</lastmod>`);
      if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
      if (e.priority) parts.push(`<priority>${e.priority}</priority>`);
      return `  <url>${parts.join("")}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

export async function GET(request: Request) {
  const host = hostname(request.headers.get("host") ?? "");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const origin = host ? `${proto}://${host}` : "";

  if (host && !isPlatformHost(host)) {
    // Custom domain: the backend already knows the org + its published pages.
    try {
      const res = await fetch(`${backendBaseUrl()}/public/site/domain/${encodeURIComponent(host)}/sitemap.xml`, {
        cache: "no-store",
        headers: { Accept: "application/xml" },
      });
      if (res.ok) {
        const xml = (await res.text()).trim();
        if (xml.startsWith("<?xml")) return new Response(xml, { headers: XML_HEADERS });
      }
    } catch {
      // fall through to the minimal sitemap below
    }
    return new Response(renderUrlset([{ loc: `${origin}/`, changefreq: "weekly", priority: "1.0" }]), {
      headers: XML_HEADERS,
    });
  }

  // Platform host: aggregate every published landing page.
  let pages: Array<{ slug?: string; orgSlug?: string | null; updatedAt?: string | null }> = [];
  try {
    const res = await fetch(`${backendBaseUrl()}/public/site/published-pages`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) pages = (await res.json()) as typeof pages;
  } catch {
    // backend unreachable — still return the homepage entry
  }

  const entries: SitemapEntry[] = [
    { loc: `${origin}/`, changefreq: "weekly", priority: "1.0" },
    ...pages
      // Canonical org-scoped URL — page slugs are only unique per organisation.
      .filter((p) => p.slug && p.orgSlug)
      .map((p) => ({
        loc: `${origin}${publicPagePath(p.orgSlug as string, p.slug as string)}`,
        lastmod: p.updatedAt ?? undefined,
        changefreq: "weekly",
        priority: "0.8",
      })),
  ];
  return new Response(renderUrlset(entries), { headers: XML_HEADERS });
}
