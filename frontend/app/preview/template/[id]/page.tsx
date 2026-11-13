"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteRenderer } from "@/components/openpage/renderer/SiteRenderer";
import { ensureSiteForms, siteFromLandingPage } from "@/lib/openpage/content";
import { loadPublicTemplate, loadTemplate } from "@/lib/openpage/persist";
import { useAuth } from "@/lib/auth-context";
import { ensureConfig } from "@/lib/openpage/site-config";
import { applyDocumentSeo } from "@/lib/openpage/seo";
import { OpenPageTrackingScripts } from "@/components/openpage/tracking-scripts";
import { bumpTracking } from "@/lib/openpage/tracking";
import type { LandingPageData } from "@/lib/openpage/types";
import "@/app/openpage.css";

/**
 * Resolve a template for the preview link:
 * - built-in presets (tpl-*) render from local data, as before;
 * - Super Admin / platform team: admin endpoint first (can see drafts, same
 *   as before), then the public endpoint;
 * - everyone else (including logged-out visitors): public endpoint, which only
 *   serves published landing templates; signed-in org users then fall back to
 *   the previous loader so nothing they could open before stops working.
 */
async function resolveTemplate(id: string, signedIn: boolean, isPlatform: boolean): Promise<LandingPageData | null> {
  if (id.startsWith("tpl-")) return loadTemplate(id, "template");
  if (signedIn && isPlatform) {
    return (await loadTemplate(id, "template")) ?? (await loadPublicTemplate(id));
  }
  const published = await loadPublicTemplate(id);
  if (published || !signedIn) return published;
  return loadTemplate(id, "template");
}

// Template preview — resolves the template from the backend by id (admin
// endpoint for the platform team, public endpoint for everyone else), not
// from the /p/:slug route which only knows seeded/localStorage pages. Same
// render path as the org builder's /preview/:id: Canvas only, no dashboard shell.
export default function TemplatePreviewPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { accessToken, isLoading: authLoading, user } = useAuth();
  const signedIn = Boolean(accessToken);
  const isPlatform = Boolean(user?.role === "super_admin" || user?.platformUnrestricted);

  const [page, setPage] = useState<LandingPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the session check so the right endpoint is chosen once.
    if (!id || authLoading) return;
    let cancelled = false;
    resolveTemplate(id, signedIn, isPlatform)
      .then((t) => {
        if (cancelled) return;
        if (!t) {
          setError("Template not found.");
          return;
        }
        setPage(t);
        applyDocumentSeo(t);
        bumpTracking(t.id, "view");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load template.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, authLoading, signedIn, isPlatform]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f5f8", color: "var(--muted, #64748b)" }}>
        Loading preview…
      </div>
    );
  }

  if (error || !page) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f5f8", color: "var(--muted, #64748b)" }}>
        {error ?? "Template not found."}
      </div>
    );
  }

  const cfg = ensureConfig(page);
  const site = ensureSiteForms(siteFromLandingPage(page));

  return (
    <div className="ps-app" style={{ minHeight: "100vh", background: "#fff" }}>
      <SiteRenderer
        site={site}
        live
        pageId={page.id}
        projectName={page.name}
        forms={(site.forms ?? cfg.forms ?? []) as never}
      />
      <OpenPageTrackingScripts tracking={cfg.tracking} />
    </div>
  );
}
