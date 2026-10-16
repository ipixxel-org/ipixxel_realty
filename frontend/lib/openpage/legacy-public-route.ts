import { redirect } from "next/navigation";
import { fetchPublicPageBySlug } from "./server-pages";
import { publicPagePath, withQuery } from "./paths";
import type { LandingPageData } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Old public URLs (/p/:slug, /:slug and their /thank-you companions) carry
 * only the page slug, which is unique per organisation, not platform-wide.
 * Resolve them once and redirect to the organisation-scoped canonical URL
 * (/p/:orgSlug/:slug) so every page is reached through an unambiguous link.
 * Query strings (UTM tags, etc.) are kept. Returns the page when no
 * redirect is possible (no org slug) so the caller can still render it.
 */
export async function resolveLegacyPublicPage(
  slug: string,
  options: { thankYou?: boolean; searchParams?: SearchParams } = {},
): Promise<LandingPageData | null> {
  const lookup = options.thankYou ? `${slug}/thank-you` : slug;
  const page = await fetchPublicPageBySlug(lookup);
  if (page?.orgSlug) {
    const target = publicPagePath(page.orgSlug, slug) + (options.thankYou ? "/thank-you" : "");
    // Temporary (307): a slug shared by several orgs may resolve differently later.
    redirect(withQuery(target, options.searchParams));
  }
  return page;
}
