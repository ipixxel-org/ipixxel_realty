import type { LandingPageData, SectionInstance, SiteConfig } from "./types";
import { backendBaseUrl } from "../backend-url";

export interface ResolvedOrgLandingPage {
  id: string;
  slug: string;
  name: string;
  status: string;
  content?: { sections?: SectionInstance[]; config?: SiteConfig; site?: LandingPageData["openPageSite"] } | null;
  publishedAt?: string | null;
}

export interface ResolveOrgResponse {
  type: "custom";
  organisation?: {
    id: string;
    name: string;
    slug: string;
  };
  landingPage?: ResolvedOrgLandingPage | null;
}

/**
 * Server-side lookup of the organisation site served for a given host.
 * Delegates to the backend `public/site/resolve-org` endpoint and maps the
 * result onto the same LandingPageData shape the public renderer expects.
 */
export async function resolveOrgSiteHost(host: string): Promise<{ page: LandingPageData | null; resolved: ResolveOrgResponse | null }> {
  const normalized = host.trim().toLowerCase().replace(/:/g, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!normalized) return { page: null, resolved: null };
  try {
    const res = await fetch(`${backendBaseUrl()}/public/site/resolve-org/${encodeURIComponent(normalized)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { page: null, resolved: null };
    const resolved = (await res.json()) as ResolveOrgResponse;
    const lp = resolved?.landingPage;
    if (!lp) return { page: null, resolved };
    const page: LandingPageData = {
      id: lp.id,
      name: lp.name,
      slug: lp.slug,
      status: (lp.status === "published" ? "published" : "unpublished") as LandingPageData["status"],
      template: resolved.organisation?.name ?? "",
      domain: normalized,
      views: "-",
      conversions: "-",
      updated: "",
      thumbnail: "",
      sections: lp.content?.sections ?? [],
      config: lp.content?.config,
      openPageSite: lp.content?.site,
      kind: "custom",
    };
    return { page, resolved };
  } catch {
    return { page: null, resolved: null };
  }
}
