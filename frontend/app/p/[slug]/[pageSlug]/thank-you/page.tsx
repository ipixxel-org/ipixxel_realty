import type { Metadata } from "next";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { fetchPublicPageInOrg, landingMetadata, requestOrigin, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";
import { publicPagePath } from "@/lib/openpage/paths";

// Thank-you companion of /p/<orgSlug>/<pageSlug> — the lead form redirects
// here after a successful submit (`${pathname}/thank-you`).
type Params = Promise<{ slug: string; pageSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug: orgSlug, pageSlug } = await params;
  const page = await fetchPublicPageInOrg(orgSlug, `${pageSlug}/thank-you`);
  if (!page) return NOT_FOUND_METADATA;
  const origin = await requestOrigin();
  return landingMetadata(page, {
    origin,
    canonical: origin ? `${origin}${publicPagePath(orgSlug, pageSlug)}/thank-you` : undefined,
  });
}

export default async function OrgThankYouPage({ params }: { params: Params }) {
  const { slug: orgSlug, pageSlug } = await params;
  const page = await fetchPublicPageInOrg(orgSlug, `${pageSlug}/thank-you`);
  return <LocalSitePreview orgSlug={orgSlug} slug={`${pageSlug}/thank-you`} page={page} publicLive />;
}
