import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { resolveLegacyPublicPage } from "@/lib/openpage/legacy-public-route";

const RESERVED_SLUGS = new Set([
  "login",
  "register",
  "org",
  "admin",
  "admin-console",
  "admin-login",
  "change-password",
  "forgot-password",
  "org-site",
  "preview",
  "p",
  "live",
  "embed",
  "api",
  "privacy",
]);

// Legacy /:slug — redirects to the organisation-scoped /p/:orgSlug/:slug.
// The canonical org-scoped URL carries the indexable metadata.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function DirectSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    notFound();
  }
  const page = await resolveLegacyPublicPage(slug, { searchParams: await searchParams });
  return <LocalSitePreview slug={slug} page={page} publicLive />;
}
