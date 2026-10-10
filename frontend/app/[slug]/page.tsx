import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { fetchPublicPageBySlug, landingMetadata, requestOrigin, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";

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
  "embed",
  "api",
  "privacy",
]);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug.toLowerCase())) return NOT_FOUND_METADATA;
  const page = await fetchPublicPageBySlug(slug);
  if (!page) return NOT_FOUND_METADATA;
  const origin = await requestOrigin();
  return landingMetadata(page, { origin, canonical: origin ? `${origin}/${encodeURIComponent(slug)}` : undefined });
}

export default async function DirectSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    notFound();
  }
  const page = await fetchPublicPageBySlug(slug);
  return <LocalSitePreview slug={slug} page={page} publicLive />;
}
