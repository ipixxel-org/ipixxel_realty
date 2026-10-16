import type { Metadata } from "next";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { fetchPublicPageInOrg, landingMetadata, requestOrigin, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";
import { publicPagePath } from "@/lib/openpage/paths";

// Canonical public landing page: /p/<orgSlug>/<pageSlug>. Page slugs are only
// unique within an organisation, so the org slug is what makes the URL point
// at exactly one page. (The first segment is named `slug` because Next.js
// needs one name per dynamic level — here it holds the organisation slug.)
type Params = Promise<{ slug: string; pageSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug: orgSlug, pageSlug } = await params;
  const page = await fetchPublicPageInOrg(orgSlug, pageSlug);
  if (!page) return NOT_FOUND_METADATA;
  const origin = await requestOrigin();
  return landingMetadata(page, {
    origin,
    canonical: origin ? `${origin}${publicPagePath(orgSlug, pageSlug)}` : undefined,
  });
}

export default async function OrgLandingPage({ params }: { params: Params }) {
  const { slug: orgSlug, pageSlug } = await params;
  const page = await fetchPublicPageInOrg(orgSlug, pageSlug);
  return <LocalSitePreview orgSlug={orgSlug} slug={pageSlug} page={page} publicLive />;
}
