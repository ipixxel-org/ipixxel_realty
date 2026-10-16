import type { Metadata } from "next";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { resolveLegacyPublicPage } from "@/lib/openpage/legacy-public-route";

// Legacy /p/:slug — redirects to the organisation-scoped /p/:orgSlug/:slug.
// The canonical org-scoped URL carries the indexable metadata.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function LegacyPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const page = await resolveLegacyPublicPage(slug, { searchParams: await searchParams });
  return <LocalSitePreview slug={slug} page={page} publicLive />;
}
