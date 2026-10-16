import type { Metadata } from "next";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { resolveLegacyPublicPage } from "@/lib/openpage/legacy-public-route";

// Legacy /:slug/thank-you — redirects to /p/:orgSlug/:slug/thank-you.
// The canonical org-scoped URL carries the indexable metadata.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function DirectSlugThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const page = await resolveLegacyPublicPage(slug, { thankYou: true, searchParams: await searchParams });
  return <LocalSitePreview slug={`${slug}/thank-you`} page={page} publicLive />;
}
