"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, Eye, LayoutTemplate, Pencil, X } from "lucide-react";
import { Reveal } from "@/components/superadmin/reveal";
import { formPageStyles } from "@/components/forms/form-page";
import {
  ACCESS_TIERS,
  accessTierOptionLabel,
  effectivePlanIds,
  getTemplatePlanOptions,
  StatusBadge,
  TemplateCover,
  TierBadge,
  manageHref,
  statusStyle,
} from "@/components/superadmin/templates/shared";
import {
  loadTemplate,
  duplicateTemplate,
  saveTemplate,
  createTemplate,
  loadTemplateCategories,
  type TemplateCategory,
} from "@/lib/openpage/persist";
import { builderPath, templatePreviewPath } from "@/lib/openpage/paths";
import { ensureConfig } from "@/lib/openpage/site-config";
import type { LandingPageData } from "@/lib/openpage/types";
import { apiFetch } from "@/lib/api";
import type { Plan } from "@/lib/types";

type Tab = "overview" | "settings" | "preview";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "settings", label: "Settings" },
  { key: "preview", label: "Preview" },
];

const STATUS_OPTIONS: LandingPageData["status"][] = ["draft", "published", "unpublished"];

export default function SuperAdminTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [template, setTemplate] = useState<LandingPageData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  // Editable draft
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<LandingPageData["status"]>("draft");
  const [domain, setDomain] = useState("");
  const [tier, setTier] = useState<"free" | "paid" | "premium">("free");
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    loadTemplateCategories().then(setCategories).catch(() => {});
    apiFetch<Plan[]>("/admin/plans")
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (!params.id) return;
    loadTemplate(params.id).then((t) => {
      /* eslint-disable react-hooks/set-state-in-effect */
      setTemplate(t);
      setLoaded(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    });
  }, [params.id]);

  useEffect(() => {
    if (!template) return;
    // Seed the editable draft from the loaded template.
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(template.name);
    setSlug(template.slug);
    setStatus(template.status);
    setDomain(template.domain);
    setTier(template.tier ?? (template.isPaid ? "paid" : "free"));
    setCategoryId(template.categoryId ?? "");

    // Seed with the plans that can use this template today — explicit grants,
    // or (for templates never given any) whatever the tier unlocks.
    setSelectedPlanIds(effectivePlanIds(templateAccess(template), plans));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [template, plans]);

  function notify(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 3000);
  }

  if (loaded && !template) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--faint)" }}>
          <LayoutTemplate size={40} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Template not found</div>
        <div className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
          It may have been deleted or reset. Head back to Template Management.
        </div>
        <Link href="/admin-console/templates" className="btn btn-primary">
          ← Back to templates
        </Link>
      </div>
    );
  }

  if (!template) return null;

  const cfg = ensureConfig(template);
  const initialPlanIds = effectivePlanIds(templateAccess(template), plans);
  const noPlanSelected = plans.length > 0 && selectedPlanIds.length === 0;
  const planIdsDirty = JSON.stringify([...selectedPlanIds].sort()) !== JSON.stringify([...initialPlanIds].sort());
  const dirty =
    name !== template.name ||
    slug !== template.slug ||
    status !== template.status ||
    domain !== template.domain ||
    tier !== (template.tier ?? (template.isPaid ? "paid" : "free")) ||
    categoryId !== (template.categoryId ?? "") ||
    planIdsDirty;

  function computeTierFromPlanIds(planIds: string[], allPlans: Plan[]): "free" | "paid" | "premium" {
    if (planIds.length === 0) return "free";
    const selected = allPlans.filter((p) => planIds.includes(p.id));
    const hasFree = selected.some(
      (p) => (p.priceMonthly ?? 0) === 0 || p.slug === "basic" || p.slug === "free"
    );
    if (hasFree) return "free";
    const isOnlyTopTier = selected.every(
      (p) => (p.priceMonthly ?? 0) >= 10000 || /ultra|premium|enterprise/i.test(p.slug)
    );
    if (isOnlyTopTier && selected.length > 0) return "premium";
    return "paid";
  }

  async function save() {
    if (!template) return;
    const cleanSlug =
      slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || template.slug;

    // Only persist ids of plans that still exist. An empty list would fall back
    // to tier access (i.e. everyone), so the Save button blocks that case. If
    // plans failed to load, leave plan access untouched.
    const planIds = selectedPlanIds.filter((id) => plans.some((p) => p.id === id));
    const calculatedTier = plans.length > 0 ? computeTierFromPlanIds(planIds, plans) : tier;
    const currentCfg = ensureConfig(template);
    const updatedConfig = plans.length > 0 ? { ...currentCfg, allowedPlanIds: planIds } : currentCfg;

    const payload = {
      ...template,
      designId: template.designId || template.id,
      name: name.trim() || template.name,
      slug: cleanSlug,
      status,
      domain: domain.trim(),
      tier: calculatedTier,
      categoryId: categoryId || null,
      isPaid: calculatedTier !== "free",
      config: updatedConfig,
    };

    let updated;
    try {
      if (template.id.startsWith("tpl-")) {
        updated = await createTemplate({
          ...payload,
          designId: template.designId || template.id,
          config: payload.config ?? ensureConfig(template),
        });
      } else {
        updated = await saveTemplate(payload);
      }
    } catch (err) {
      notify(err instanceof Error && err.message ? `Could not save: ${err.message}` : "Could not save template settings");
      return;
    }

    setTemplate(updated);
    setSlug(cleanSlug);
    notify("Template settings saved");
    try {
      window.sessionStorage.setItem("template_flash", "Template settings saved");
    } catch {
      // best-effort flash for the templates list
    }
    window.setTimeout(() => {
      router.push("/admin-console/templates");
    }, 600);
  }

  async function duplicate() {
    if (!template || duplicating) return;
    setDuplicating(true);
    try {
      const copy = await duplicateTemplate(template.id);
      router.push(manageHref(copy.id));
    } finally {
      setDuplicating(false);
    }
  }

  const previewHref = templatePreviewPath(template.id);

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Link href="/admin-console/templates" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--brand)" }}>
              <ArrowLeft size={13} /> Template Management
            </Link>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {template.name}
            <StatusBadge status={template.status} />
          </h1>
          <div className="sub">
            {template.kind === "preset" ? "Predefined template" : "Custom template"} · {template.template}
          </div>
        </div>
        <div className="actions">
          <a className="btn btn-ghost" href={previewHref} target="_blank" rel="noreferrer">
            <Eye size={15} /> Preview
          </a>
          <button type="button" className="btn btn-ghost" disabled={duplicating} onClick={() => void duplicate()}>
            <Copy size={15} /> {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
          <a className="btn btn-primary" href={builderPath(template.id)}>
            <Pencil size={15} /> Edit in builder
          </a>
        </div>
      </div>

      <div className="tabs reveal in">
        {TABS.map((t) => (
          <a key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)} role="button">
            {t.label}
          </a>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid g-2-1">
          <Reveal>
            <div className="card">
              <div className="card-h">
                <span className="t">Preview</span>
                <span className="badge b-indigo">{template.kind === "preset" ? "Predefined" : "Custom"}</span>
              </div>
              <div className="card-b">
                <TemplateCover thumbnail={template.thumbnail} accent={cfg.brand.primary} height={320} radius="14px" />
              </div>
            </div>
          </Reveal>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Reveal delay={1}>
              <div className="card">
                <div className="card-h">
                  <span className="t">About</span>
                </div>
                <div className="card-b" style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: 13 }}>Plan access</span>
                    <TierBadge tier={template.tier} plans={plans} allowedPlanIds={templateAccess(template).allowedPlanIds} />
                  </div>
                  <MetaRow label="Category" value={template.category || "Unassigned"} />
                  <MetaRow label="Base design" value={template.template} />
                  <MetaRow label="URL slug" value={`/${template.slug}`} mono />
                  <MetaRow label="Domain" value={template.domain || "Not connected"} mono={!!template.domain} />
                  <MetaRow label="Sections" value={`${template.sections.length}`} />
                  <MetaRow label="Last updated" value={template.updated} />
                </div>
              </div>
            </Reveal>

            <Reveal delay={2}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Brand</span>
                </div>
                <div className="card-b" style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: cfg.brand.primary, border: "1px solid var(--line-2)" }} />
                    <span style={{ fontSize: 13 }}>Primary</span>
                    <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto", fontFamily: "var(--font-mono), monospace" }}>{cfg.brand.primary}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: cfg.brand.accent, border: "1px solid var(--line-2)" }} />
                    <span style={{ fontSize: 13 }}>Accent</span>
                    <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto", fontFamily: "var(--font-mono), monospace" }}>{cfg.brand.accent}</span>
                  </div>
                  <MetaRow label="Heading font" value={cfg.brand.headingFont} />
                  <MetaRow label="Body font" value={cfg.brand.bodyFont} />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <Reveal>
          <div className="grid g-2-1">
            <div className="card">
              <div className="card-h">
                <span className="t">Template details</span>
              </div>
              <div className={`card-b ${formPageStyles.page}`}>
                <div className="field">
                  <label>Template name</label>
                  <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label>URL slug</label>
                  <input className="inp" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-template" />
                  <div className="hint">Public URL slug — used when a domain is mapped to this template.</div>
                </div>
                <div className="row2">
                  <div className="field">
                    <label>Status</label>
                    <select className="inp" value={status} onChange={(e) => setStatus(e.target.value as LandingPageData["status"])}>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {statusStyle(s).label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Custom domain</label>
                    <input className="inp" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. homes.example.com" />
                  </div>
                </div>
                <div className="field">
                  <label>Template Category</label>
                  <select
                    className="inp"
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                    }}
                  >
                    <option value="">Unassigned</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="hint">Categorizes template in library for users.</div>
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                      Subscription Plan Access
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--brand, #4f46e5)",
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => setSelectedPlanIds(plans.map((p) => p.id))}
                      >
                        Select all
                      </button>
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>•</span>
                      <button
                        type="button"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--muted)",
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => setSelectedPlanIds([])}
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
                    Check each subscription plan that is granted access to use this template:
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 8,
                      padding: "2px 0",
                    }}
                  >
                    {plans.map((p) => {
                      const isChecked = selectedPlanIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: `1.5px solid ${isChecked ? "var(--brand, #4f46e5)" : "#e2e8f0"}`,
                            background: isChecked ? "rgba(79, 70, 229, 0.05)" : "#fff",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPlanIds((prev) => [...prev, p.id]);
                              } else {
                                setSelectedPlanIds((prev) => prev.filter((id) => id !== p.id));
                              }
                            }}
                            style={{ width: 16, height: 16, accentColor: "var(--brand, #4f46e5)", cursor: "pointer" }}
                          />
                          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: 12.5,
                                fontWeight: isChecked ? 700 : 500,
                                color: isChecked ? "#0f172a" : "#334155",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {p.name}
                            </span>
                            <span style={{ fontSize: 11, color: "#64748b" }}>
                              {p.priceMonthly ? `₹${p.priceMonthly.toLocaleString()}/mo` : "Free Plan"}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {noPlanSelected ? (
                    <div className="hint" style={{ marginTop: 8, color: "var(--red, #dc2626)" }}>
                      Select at least one subscription plan.
                    </div>
                  ) : (
                    <div className="hint" style={{ marginTop: 8 }}>
                      Workspaces on selected plans will be able to browse and build landing pages with this template.
                    </div>
                  )}
                </div>
                <div className={formPageStyles.actions}>
                  <button type="button" className={formPageStyles.btn} disabled={!dirty} onClick={() => {
                    setName(template.name);
                    setSlug(template.slug);
                    setStatus(template.status);
                    setDomain(template.domain);
                    setTier(template.tier ?? (template.isPaid ? "paid" : "free"));
                    setCategoryId(template.categoryId ?? "");
                    setSelectedPlanIds(initialPlanIds);
                  }}>
                    Reset
                  </button>
                  <button type="button" className={formPageStyles.btnPrimary} disabled={!dirty || noPlanSelected} onClick={() => void save()}>
                    <CheckCircle2 size={16} />
                    Save changes
                  </button>
                </div>
              </div>
            </div>

            <div className="card" style={{ alignSelf: "start" }}>
              <div className="card-h">
                <span className="t">Sections</span>
                <span className="badge b-gray">{template.sections.length}</span>
              </div>
              <div className="card-b" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {template.sections.length === 0 ? (
                  <span className="muted" style={{ fontSize: 13 }}>No sections yet.</span>
                ) : (
                  template.sections.map((s) => (
                    <span key={s.id} className="badge b-indigo" style={{ fontWeight: 600 }}>
                      {s.label}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </Reveal>
      ) : null}

      {tab === "preview" ? (
        <Reveal>
          <div className="card">
            <div className="card-h">
              <span className="t">Live preview</span>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="btn btn-ghost btn-sm" href={previewHref} target="_blank" rel="noreferrer">
                  Open in new tab ↗
                </a>
                <a className="btn btn-primary btn-sm" href={builderPath(template.id)}>
                  Edit in builder
                </a>
              </div>
            </div>
            <div className="card-b">
              <TemplateCover thumbnail={template.thumbnail} accent={cfg.brand.primary} height={420} radius="14px" />
            </div>
          </div>
        </Reveal>
      ) : null}

      {toast ? (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", boxShadow: "var(--sh-lg)" }}>
            <CheckCircle2 size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{toast}</span>
            <button type="button" onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "inline-flex" }}>
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function templateAccess(t: LandingPageData) {
  return {
    tier: t.tier ?? (t.isPaid ? ("paid" as const) : ("free" as const)),
    allowedPlanIds: t.allowedPlanIds?.length ? t.allowedPlanIds : (t.config?.allowedPlanIds ?? []),
  };
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="muted" style={{ fontSize: 12.5, minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, marginLeft: "auto", textAlign: "right", fontFamily: mono ? "var(--font-mono), monospace" : "inherit", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
