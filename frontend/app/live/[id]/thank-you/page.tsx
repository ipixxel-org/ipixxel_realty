import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchPublicPagePath, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";
import { publicPagePath } from "@/lib/openpage/paths";

// /live/:landingPageId/thank-you — the thank-you companion of a landing page,
// opened by the parent page's id (see /live/:id).
export const metadata: Metadata = NOT_FOUND_METADATA;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LiveThankYouRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const path = await fetchPublicPagePath(id);
  if (!path) notFound();
  redirect(`${publicPagePath(path.orgSlug, path.slug)}/thank-you`);
}
