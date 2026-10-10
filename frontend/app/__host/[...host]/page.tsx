import type { Metadata } from "next";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { resolveOrgSiteHost } from "@/lib/openpage/resolve-host";
import { landingMetadata, requestOrigin, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";

export async function generateMetadata({ params }: { params: Promise<{ host: string[] }> }): Promise<Metadata> {
  const { host } = await params;
  const hostString = host.join(".");
  const { page } = await resolveOrgSiteHost(hostString);
  if (!page) return NOT_FOUND_METADATA;
  const origin = await requestOrigin();
  return landingMetadata(page, { origin, canonical: `https://${hostString}/` });
}

export default async function DomainPreviewPage({ params }: { params: Promise<{ host: string[] }> }) {
  const { host } = await params;
  const hostString = host.join(".");
  const { page } = await resolveOrgSiteHost(hostString);
  // Explicit hostname preview (used by the builder for a page's assigned
  // domain). The live subdomain is served via /org-site instead.
  return <LocalSitePreview host={hostString} page={page} publicLive />;
}
