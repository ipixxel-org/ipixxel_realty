import type { Metadata } from "next";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { fetchPublicPageBySlug, landingMetadata, requestOrigin, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPublicPageBySlug(`${slug}/thank-you`);
  if (!page) return NOT_FOUND_METADATA;
  const origin = await requestOrigin();
  return landingMetadata(page, {
    origin,
    canonical: origin ? `${origin}/p/${encodeURIComponent(slug)}/thank-you` : undefined,
  });
}

export default async function LocalPreviewThankYouPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await fetchPublicPageBySlug(`${slug}/thank-you`);
  return <LocalSitePreview slug={`${slug}/thank-you`} page={page} publicLive />;
}
