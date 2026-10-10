import { hostname, isPlatformHost } from "@/lib/platform-hosts";
import { backendBaseUrl } from "@/lib/backend-url";

// Served at /robots.txt on every host. proxy.ts excludes robots.txt from the
// /org-site rewrite, so custom domains are proxied to the backend's per-domain
// robots and the platform host gets a sensible default.
export const dynamic = "force-dynamic";

const TXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(request: Request) {
  const host = hostname(request.headers.get("host") ?? "");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const origin = host ? `${proto}://${host}` : "";

  if (host && !isPlatformHost(host)) {
    try {
      const res = await fetch(`${backendBaseUrl()}/public/site/domain/${encodeURIComponent(host)}/robots.txt`, {
        cache: "no-store",
        headers: { Accept: "text/plain" },
      });
      if (res.ok) {
        const txt = (await res.text()).trim();
        if (txt) return new Response(txt, { headers: TXT_HEADERS });
      }
    } catch {
      // fall through to the default below
    }
    return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, { headers: TXT_HEADERS });
  }

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /org/",
    "Disallow: /org-builder",
    "Disallow: /admin-console/",
    "Disallow: /preview/",
    "Disallow: /api/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: TXT_HEADERS });
}
