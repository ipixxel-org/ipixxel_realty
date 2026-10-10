import type { Metadata } from "next";
import { headers } from "next/headers";
import { LocalSitePreview } from "@/components/openpage/live-site";
import { resolveOrgSiteHost } from "@/lib/openpage/resolve-host";
import { landingMetadata, requestOrigin, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";

function currentHost(h: Awaited<ReturnType<typeof headers>>): string {
  return (h.get("host") ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = currentHost(h);
  const { page } = await resolveOrgSiteHost(host);
  if (!page) return NOT_FOUND_METADATA;
  const origin = await requestOrigin();
  return landingMetadata(page, { origin, canonical: origin ? `${origin}/` : undefined });
}

export default async function HostSitePage() {
  const h = await headers();
  const host = currentHost(h);
  const { page } = await resolveOrgSiteHost(host);
  // Renders the published site for the visited host. Falls back to the local
  // preview store when the backend has no published site for it.
  return <LocalSitePreview host={host} page={page} publicLive />;
}
