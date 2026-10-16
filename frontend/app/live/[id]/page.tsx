import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchPublicPagePath, NOT_FOUND_METADATA } from "@/lib/openpage/server-pages";
import { publicPagePath } from "@/lib/openpage/paths";

// /live/:pageId — opens a landing page's public URL from admin screens, which
// know the page id but not the organisation slug. Resolves the current
// /p/:orgSlug/:slug at click time, so it stays right after a slug change.
export const metadata: Metadata = NOT_FOUND_METADATA;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LivePageRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const path = await fetchPublicPagePath(id);
  if (!path) notFound();
  redirect(publicPagePath(path.orgSlug, path.slug));
}
