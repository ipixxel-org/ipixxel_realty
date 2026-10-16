/** Builder against a Super Admin Template — the org-builder route with the
 *  `scope` param, which makes the studio pick `resource: "template"`. */
export function builderPath(pageId: string, returnUrl?: string): string {
  const base = `/org-builder?scope=template&id=${encodeURIComponent(pageId)}`;
  return returnUrl ? `${base}&returnUrl=${encodeURIComponent(returnUrl)}` : base;
}

/** Same builder, opened against an org's own LandingPage instead of a Template.
 *  A top-level sibling route (/org-builder), not nested under /org/ —
 *  app/org/layout.tsx wraps every child in OrgAdminShell, which the
 *  full-screen builder must never render inside. */
export function orgBuilderPath(pageId: string, returnUrl?: string): string {
  const base = `/org-builder?id=${encodeURIComponent(pageId)}`;
  return returnUrl ? `${base}&returnUrl=${encodeURIComponent(returnUrl)}` : base;
}

/**
 * Canonical public URL for an org landing page. Page slugs are only unique
 * within an organisation, so the org slug is part of every public link.
 */
export function publicPagePath(orgSlug: string, slug: string): string {
  return `/p/${encodeURIComponent(orgSlug)}/${encodeURIComponent(slug)}`;
}

/**
 * Opens a landing page's live URL by id — /live/:id redirects to
 * publicPagePath() for that page. Use from admin screens, which know the page
 * id but not the organisation slug.
 */
export function livePagePath(pageId: string): string {
  return `/live/${encodeURIComponent(pageId)}`;
}

/** Keeps a request's query string (e.g. UTM tags) across a redirect. */
export function withQuery(
  path: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (typeof value === "string") qs.append(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

export function localPreviewPath(page: { slug: string }): string {
  return `/p/${encodeURIComponent(page.slug)}`;
}

/** Backend-backed preview for a Super Admin Template, keyed by id — mirrors
 *  the org builder's /preview/:id. Unlike localPreviewPath (/p/:slug), this
 *  resolves the template straight from the API, so it works for templates
 *  that only exist in the database (every real one). */
export function templatePreviewPath(templateId: string): string {
  return `/preview/template/${encodeURIComponent(templateId)}`;
}

export function localDomainPreviewPath(domain: string): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  return host ? `/__host/${host}` : "";
}
