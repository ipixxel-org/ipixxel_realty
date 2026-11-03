"use client";

import { useEffect, useMemo, useState } from "react";
import type { SiteConfig } from "@/components/openpage/blocks/types";
import { SiteRenderer } from "@/components/openpage/renderer/SiteRenderer";
import type { SiteConfig as LegacySiteConfig } from "@/lib/openpage/types";
import type { FormDefinition } from "@/lib/openpage/forms-store";
import { findFormByEmbedId, loadFormLibrary } from "@/lib/openpage/forms-store";
import { formDefFromRecord } from "@/lib/openpage/forms-backend";
import { getPublicFormByEmbed } from "@/lib/api";
import { loadPages } from "@/lib/openpage/persist";
import { ensureConfig } from "@/lib/openpage/site-config";

/** Normalise a legacy per-page form into a full FormDefinition so the OpenPage
 *  lead-form block can resolve it by id. */
function withEmbedId(form: LegacySiteConfig["form"], embedId: string): FormDefinition {
  const now = new Date().toISOString();
  const raw = form as FormDefinition;
  return {
    ...raw,
    id: raw.id || embedId,
    pageId: raw.pageId || "",
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}

export default function EmbedFormPage({ params }: { params: Promise<{ embedId: string }> }) {
  const [embedId, setEmbedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormDefinition | null>(null);

  useEffect(() => {
    void params.then((p) => setEmbedId(p.embedId));
  }, [params]);

  useEffect(() => {
    if (!embedId) return;
    let cancelled = false;

    // The backend row is the source of truth for saved Form Builder forms, so
    // try it first — localStorage may be empty in a visitor's browser.
    void getPublicFormByEmbed(embedId)
      .then((rec) => {
        if (!cancelled) setForm(formDefFromRecord(rec));
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to the local forms library (reusable forms), then page
        // configs (per-template form).
        const lib = loadFormLibrary();
        const fromLib = findFormByEmbedId(embedId, lib);
        if (fromLib) {
          setForm(fromLib);
          return;
        }
        const pages = loadPages();
        for (const pg of pages) {
          const cfg = ensureConfig(pg);
          const f = cfg.form;
          if (f.embed?.id === embedId || pg.slug === embedId) {
            setForm(withEmbedId(f, embedId));
            return;
          }
        }
        // Fallback: first page's form
        const fallback = pages[0] ? ensureConfig(pages[0]).form : null;
        setForm(fallback ? withEmbedId(fallback, embedId) : null);
      });

    return () => {
      cancelled = true;
    };
  }, [embedId]);

  const site = useMemo<SiteConfig | null>(() => {
    if (!form) return null;
    return {
      engine: "openpage",
      name: form.name || "Enquiry",
      pages: [
        {
          id: "page-embed",
          name: form.name || "Enquiry",
          path: "/",
          blocks: [
            {
              id: "embed_lead_form",
              type: "lead-form",
              variant: "card",
              props: {
                formId: form.id,
                title: form.name || "Enquiry",
                subtitle: form.description || "",
              },
            },
          ],
        },
      ],
      blocks: [],
      forms: [form],
    };
  }, [form]);

  if (!embedId)
    return <div style={{ padding: 40, fontFamily: "Inter, sans-serif", color: "#64748b" }}>Loading embed…</div>;
  if (!form || !site)
    return (
      <div style={{ padding: 40, fontFamily: "Inter, sans-serif", color: "#64748b" }}>
        Form not found for “{embedId}”. Save the form in the builder to generate its latest version — the embed always
        loads the current config.
      </div>
    );

  // Render just the lead-form as a standalone page — no header/footer chrome.
  // SiteRenderer with a single lead-form block keeps all the validation / PDF /
  // thank-you logic consolidated in the OpenPage lead-form block (and its
  // DynamicLeadForm), so embeds match the editor exactly.
  return (
    <div style={{ minHeight: "auto", background: "#fff", padding: 0 }}>
      <style>{`body{margin:0;padding:0}`}</style>
      <SiteRenderer site={site} live pageId={`embed_${embedId}`} projectName={form.name} />
      <div
        style={{
          textAlign: "center",
          padding: "10px 12px",
          fontSize: 11,
          color: "#94a3b8",
          fontFamily: "Inter, sans-serif",
          borderTop: "1px solid #f1f5f9",
        }}
      >
        Powered by OpenPage · Form <code>{embedId}</code> · always shows the latest saved version
      </div>
    </div>
  );
}