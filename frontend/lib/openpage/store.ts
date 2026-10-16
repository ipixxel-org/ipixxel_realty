import type { LandingPageData } from "./types";
import { loadPages, loadTemplates } from "./persist";

export {
  loadTemplates,
  loadTemplate,
  createTemplate,
  saveTemplate,
  saveTemplateNow,
  deleteTemplate,
  duplicateTemplate,
  resetTemplate,
  publishLandingPage,
  unpublishLandingPage,
} from "./persist";
export type { CreateTemplateInput, Resource } from "./persist";

import { apiFetch } from "../api";
import { inferDesignId } from "./page-templates";
import { ensureConfig } from "./site-config";
import { applyLandingPagePropertyFromConfig } from "./data";

/** Fields of the backend public page payload this module reads. */
interface PublicPageResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt?: string;
  thumbnail?: string | null;
  pageType?: string;
  parentId?: string | null;
  content?: { sections?: LandingPageData["sections"]; config?: unknown; site?: LandingPageData["openPageSite"] } | null;
  organisation?: { customDomain?: string | null; slug?: string | null } | null;
  sourceTemplate?: { name?: string | null } | null;
  thankYouPage?: LandingPageData["thankYouPage"];
  parentLandingPage?: LandingPageData["parentLandingPage"];
}

function mapPublicPage(raw: PublicPageResponse): LandingPageData {
  const templateName = raw.sourceTemplate?.name ?? raw.name ?? "EstatePro Standard";
  const mapped: LandingPageData = {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    orgSlug: raw.organisation?.slug ?? undefined,
    status: raw.status as LandingPageData["status"],
    template: templateName,
    domain: raw.organisation?.customDomain ?? "",
    views: "—",
    conversions: "—",
    updated: raw.updatedAt ? new Date(raw.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Recently",
    updatedAt: raw.updatedAt,
    thumbnail: raw.thumbnail ?? "",
    sections: raw.content?.sections ?? [],
    config: raw.content?.config ? ensureConfig({ config: raw.content.config } as any) : undefined,
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

/** Client-side lookup of a page within one organisation (`/p/:orgSlug/:slug`). */
export async function findPageInOrg(orgSlug: string, slug: string): Promise<LandingPageData | undefined> {
  const org = decodeURIComponent(orgSlug).trim().toLowerCase();
  const key = decodeURIComponent(slug).trim().toLowerCase().replace(/\s+/g, "-");
  if (!org || !key) return undefined;
  try {
    const raw = await apiFetch<PublicPageResponse>(
      `/public/site/org/${encodeURIComponent(org)}/page/${encodeURIComponent(key)}`,
    );
    return raw && raw.id ? mapPublicPage(raw) : undefined;
  } catch {
    return undefined;
  }
}

export async function findPageBySlug(slug: string, pages?: LandingPageData[]): Promise<LandingPageData | undefined> {
  const rawKey = decodeURIComponent(slug).trim().toLowerCase();
  const key = rawKey.replace(/\s+/g, "-");

  try {
    const raw = await apiFetch<PublicPageResponse>(`/public/site/page/${encodeURIComponent(key)}`);
    if (raw && raw.id) {
      return mapPublicPage(raw);
    }
  } catch {
    // API 404 or network issue — continue to local fallback
  }

  const list = pages ?? (typeof window === "undefined" ? [] : loadPages());
  const local = list.find((p) => p.slug?.toLowerCase() === key || p.slug?.toLowerCase() === rawKey);
  if (local) {
    applyLandingPagePropertyFromConfig(local.config);
    return local;
  }

  return undefined;
}

export async function findPageByDomain(domain: string, pages?: LandingPageData[]): Promise<LandingPageData | undefined> {
  const list = pages ?? (typeof window === "undefined" ? [] : loadPages());
  const host = normalizeDomain(domain);
  if (!host) return undefined;
  return list.find((p) => normalizeDomain(p.domain) === host);
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function isLikelyHostname(input: string): boolean {
  const host = normalizeDomain(input);
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(host);
}
