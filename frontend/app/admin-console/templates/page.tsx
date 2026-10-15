"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  Crown,
  Edit2,
  ExternalLink,
  Eye,
  Filter,
  FolderPlus,
  Grid,
  Layers,
  LayoutTemplate,
  List,
  Monitor,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tablet,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { CountUp } from "@/components/superadmin/count-up";
import { Reveal } from "@/components/superadmin/reveal";
import {
  ACCESS_TIERS,
  accessTierOptionLabel,
  buildTemplateRows,
  deriveStats,
  matchesFilter,
  TEMPLATE_FILTERS,
  TemplateCover,
  type TemplateFilter,
  type TemplateRow,
  TierBadge,
  tierStyle,
  StatusBadge,
  manageHref,
  templateAllowsPlan,
} from "@/components/superadmin/templates/shared";
import { TemplateCard } from "@/components/superadmin/templates/template-card";
import { PlanFilterDropdown } from "@/components/superadmin/templates/plan-filter-dropdown";
import { CreateTemplateModal } from "@/components/superadmin/templates/create-template-modal";
import { TemplateCategoriesModal } from "@/components/superadmin/templates/template-categories-modal";
import { buildTemplateSections } from "@/lib/openpage/data";
import {
  deleteTemplate,
  duplicateTemplate,
  ensurePresetTemplates,
  loadTemplates,
  resetTemplate,
  saveTemplate,
  loadTemplateCategories,
  type TemplateCategory,
} from "@/lib/openpage/persist";
import { builderPath, templatePreviewPath } from "@/lib/openpage/paths";
import { defaultSiteConfig, seedConfigFor } from "@/lib/openpage/site-config";
import { inferDesignId } from "@/lib/openpage/page-templates";
import { buildRealEstateTemplate, openPageTemplateIdForDesign } from "@/lib/openpage/re-templates";
import type { LandingPageData } from "@/lib/openpage/types";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SceneImage } from "@/components/openpage/art";
import { apiFetch } from "@/lib/api";
import { ListPager, usePagedRows } from "@/components/ui/list-pager";
import type { Plan } from "@/lib/types";

function TemplateThumb({
  thumbnail,
  accent,
}: {
  thumbnail: string;
  accent?: string;
}) {
  const real = thumbnail.startsWith("/") || thumbnail.startsWith("http");
  if (real) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnail}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
      />
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", background: accent || "#1e293b", position: "relative" }}>
      <SceneImage art={thumbnail || "hero"} />
    </div>
  );
}

function goToBuilder(pageId: string) {
  window.location.assign(builderPath(pageId));
}

const PLAN_BADGE_CLASSES = ["b-green", "b-indigo", "b-violet", "b-amber"];

const TEMPLATES_PATH = "/admin-console/templates";

export default function SuperAdminTemplatesPage() {
  const router = useRouter();
  const [pages, setPages] = useState<LandingPageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // View modes: "grid" (spacious) | "compact" | "table"
  const [viewMode, setViewMode] = useState<"grid" | "compact" | "table">("grid");

  // Filters
  const [filterIndex, setFilterIndex] = useState(0);
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Categories
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  // Delete / Reset Confirm
  const [deleteFor, setDeleteFor] = useState<TemplateRow | null>(null);

  // Create-template popup — null when closed; designId/name pre-fill it for
  // "Edit" on a predefined design that has no saved page yet.
  const [createFor, setCreateFor] = useState<{ designId?: string; name?: string } | null>(null);
  // Manage-categories popup. Category edits can rename or unassign
  // templates, so the gallery reloads once when the popup closes.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoriesChanged, setCategoriesChanged] = useState(false);

  // Quick Device Preview Modal
  const [previewRow, setPreviewRow] = useState<TemplateRow | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  const reloadCategories = useCallback(() => {
    loadTemplateCategories().then(setCategories).catch(() => { });
  }, []);

  const reloadTemplates = useCallback(() => {
    setLoading(true);
    ensurePresetTemplates()
      .then(setPages)
      .catch(() =>
        loadTemplates()
          .then(setPages)
          .catch(() => setPages([])),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reloadCategories();
    reloadTemplates();
    apiFetch<Plan[]>("/admin/plans")
      .then((p) => {
        setPlans(p);
      })
      .catch(() => setPlans([]));
    try {
      const flash = window.sessionStorage.getItem("template_flash");
      if (flash) {
        window.sessionStorage.removeItem("template_flash");
        setToast(flash);
        window.setTimeout(() => setToast(null), 3200);
      }
    } catch {
      // ignore
    }
  }, [reloadCategories, reloadTemplates]);

  // Old /templates/new and /templates/categories URLs redirect here with
  // ?create / ?categories — open the matching popup, then tidy the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsCreate = params.has("create");
    const wantsCategories = params.has("categories");
    if (!wantsCreate && !wantsCategories) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL on mount */
    if (wantsCreate) {
      setCreateFor({
        designId: params.get("design") || undefined,
        name: params.get("name") || undefined,
      });
    } else {
      setCategoriesOpen(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    router.replace(TEMPLATES_PATH);
  }, [router]);

  const closeCategories = useCallback(() => {
    setCategoriesOpen(false);
    if (categoriesChanged) {
      setCategoriesChanged(false);
      reloadTemplates();
    }
  }, [categoriesChanged, reloadTemplates]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Template CRUD actions
  const duplicateRow = useCallback(
    async (row: TemplateRow) => {
      if (!row.pageId) return;
      const copy = await duplicateTemplate(row.pageId);
      setPages((prev) => [copy, ...prev]);
      notify("Template duplicated");
      goToBuilder(copy.id);
    },
    [notify],
  );

  const setStatus = useCallback(
    async (pageId: string, status: LandingPageData["status"]) => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;
      const updated = await saveTemplate({ ...page, status });
      setPages((prev) => prev.map((p) => (p.id === pageId ? updated : p)));
      notify(status === "published" ? "Published" : "Unpublished");
    },
    [pages, notify],
  );

  const deleteRow = useCallback(
    async (row: TemplateRow) => {
      const pageId = row.pageId;
      if (!pageId) return;
      await deleteTemplate(pageId);
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      notify("Template deleted");
      setDeleteFor(null);
    },
    [notify],
  );

  const resetRow = useCallback(
    async (row: TemplateRow) => {
      const pageId = row.pageId;
      if (!pageId) return;
      const design = row.designId ?? inferDesignId(row.name);
      const updated = await resetTemplate(pageId, {
        sections: buildTemplateSections(design),
        config: seedConfigFor({
          id: pageId,
          name: row.name,
          slug: "",
          status: "draft",
          template: row.name,
          domain: "",
          views: "—",
          conversions: "—",
          updated: "",
          thumbnail: "",
          sections: [],
          designId: design,
          kind: "preset",
        }),
        openPageSite: buildRealEstateTemplate(openPageTemplateIdForDesign(design), row.name),
      });
      setPages((prev) => prev.map((p) => (p.id === pageId ? updated : p)));
      notify("Predefined template reset");
      setDeleteFor(null);
    },
    [notify],
  );

  const rows = useMemo(() => buildTemplateRows(pages), [pages]);
  const stats = useMemo(() => deriveStats(rows), [rows]);

  // Subscription plans, cheapest first; inactive plans last.
  const sortedPlans = useMemo(
    () =>
      [...plans].sort(
        (a, b) =>
          Number(b.isActive !== false) - Number(a.isActive !== false) ||
          (a.priceMonthly ?? 0) - (b.priceMonthly ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [plans],
  );

  const filter = TEMPLATE_FILTERS[filterIndex] ?? "All";

  // Templates available to each subscription plan (explicit grants, else tier).
  const planCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of plans) map[p.id] = rows.filter((r) => templateAllowsPlan(r, p)).length;
    return map;
  }, [rows, plans]);
  const selectedPlan = planFilter === "all" ? null : (plans.find((p) => p.id === planFilter) ?? null);

  // Visible rows after all filters
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesFilter(r, filter) &&
          (!selectedPlan || templateAllowsPlan(r, selectedPlan)) &&
          (categoryFilter === "all" || r.category === categoryFilter || r.categoryId === categoryFilter) &&
          (!search ||
            r.name.toLowerCase().includes(search) ||
            r.source.toLowerCase().includes(search) ||
            r.description.toLowerCase().includes(search)),
      ),
    [rows, filter, selectedPlan, categoryFilter, search],
  );
  // 10 per page; the counters, plan and category chips still use every row.
  const paged = usePagedRows(visible, `${filterIndex}|${planFilter}|${categoryFilter}|${search}`);

  // Category counts
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const cat = r.category || "Unassigned";
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 60 }}>
      {/* Studio Header */}
      <div
        className="reveal in"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 800,
              color: "var(--brand, #0f1424)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            <LayoutTemplate size={13} />
            <span>TEMPLATE STUDIO &amp; TAXONOMY</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#10b981",
                display: "inline-block",
                marginLeft: 4,
              }}
            />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            Template Management
          </h1>
          <div className="sub" style={{ marginTop: 4, maxWidth: 680, fontSize: 13.5, color: "var(--muted)" }}>
            Govern, preview, and categorize landing page designs across Free Plan, Paid, and Premium tiers.
          </div>
        </div>

        {/* Global Header Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={reloadTemplates}
            title="Refresh templates"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10 }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCategoriesOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10 }}
          >
            <Settings2 size={14} /> Categories ({categories.length})
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreateFor({})}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10, fontWeight: 700 }}
          >
            <Plus size={16} /> Create Template
          </button>
        </div>
      </div>

      {/* Metric Counters Banner */}
      <Reveal delay={1}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {/* Card: Total */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Total Templates</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                <CountUp value={stats.total} />
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--brand-050)",
                color: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LayoutTemplate size={18} />
            </div>
          </div>

          {/* Cards: one per subscription plan — templates available to it */}
          {sortedPlans.map((p, i) => {
            const active = planFilter === p.id;
            return (
              <div
                key={p.id}
                role="button"
                title={`Show templates available on ${p.name}`}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${active ? "var(--brand)" : "var(--line-2)"}`,
                  borderRadius: 14,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  opacity: p.isActive === false ? 0.7 : 1,
                }}
                onClick={() => setPlanFilter(active ? "all" : p.id)}
              >
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>
                    {p.name}
                    {p.isActive === false ? " (Inactive)" : ""}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                    <CountUp value={planCounts[p.id] ?? 0} />
                  </div>
                </div>
                <span className={`badge ${PLAN_BADGE_CLASSES[i % PLAN_BADGE_CLASSES.length]}`} style={{ fontWeight: 700 }}>
                  {p.priceMonthly ? `₹${p.priceMonthly.toLocaleString()}/mo` : "Free"}
                </span>
              </div>
            );
          })}

          {/* Card: Categories */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
            onClick={() => setCategoriesOpen(true)}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Taxonomy</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                <CountUp value={categories.length} />
              </div>
            </div>
            <span className="badge b-gray" style={{ fontWeight: 600 }}>
              Categories
            </span>
          </div>
        </div>
      </Reveal>

      {/* Floating & Sticky Control Toolbar */}
      <div
        style={{
          position: "sticky",
          top: 12,
          zIndex: 30,
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid var(--line-2)",
          borderRadius: 16,
          padding: "12px 16px",
          boxShadow: "0 10px 28px -10px rgba(14, 21, 37, 0.08), 0 2px 6px rgba(14, 21, 37, 0.03)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Toolbar Top Row: Search & Tier Pills & Views */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {/* Search Input */}
          <div
            style={{
              position: "relative",
              minWidth: 240,
              maxWidth: 320,
              flex: 1,
            }}
          >
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              className="inp"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search templates, styles, tags…"
              style={{
                paddingLeft: 36,
                paddingRight: searchInput ? 32 : 12,
                height: 38,
                borderRadius: 10,
                fontSize: 13,
                width: "100%",
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--muted)",
                  padding: 2,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Subscription Plan Filter — every plan created in Subscriptions */}
          <PlanFilterDropdown
            plans={plans}
            value={selectedPlan ? planFilter : "all"}
            onChange={setPlanFilter}
            counts={planCounts}
            totalCount={stats.total}
          />

          {/* Kind Filter Pills */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--surface-2, #f8fafc)",
              padding: 3,
              borderRadius: 10,
              border: "1px solid var(--line-2)",
            }}
          >
            {TEMPLATE_FILTERS.map((label, idx) => {
              const active = filterIndex === idx;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setFilterIndex(idx)}
                  style={{
                    border: "none",
                    background: active ? "var(--surface)" : "transparent",
                    color: active ? "var(--ink)" : "var(--muted)",
                    fontWeight: active ? 700 : 500,
                    fontSize: 12.5,
                    padding: "6px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    boxShadow: active ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--surface-2, #f8fafc)",
              padding: 3,
              borderRadius: 10,
              border: "1px solid var(--line-2)",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Spacious Grid View"
              style={{
                border: "none",
                background: viewMode === "grid" ? "var(--surface)" : "transparent",
                color: viewMode === "grid" ? "var(--ink)" : "var(--muted)",
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
                boxShadow: viewMode === "grid" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Grid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("compact")}
              title="Compact Grid View"
              style={{
                border: "none",
                background: viewMode === "compact" ? "var(--surface)" : "transparent",
                color: viewMode === "compact" ? "var(--ink)" : "var(--muted)",
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
                boxShadow: viewMode === "compact" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <LayoutTemplate size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Data Table View"
              style={{
                border: "none",
                background: viewMode === "table" ? "var(--surface)" : "transparent",
                color: viewMode === "table" ? "var(--ink)" : "var(--muted)",
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
                boxShadow: viewMode === "table" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Toolbar Row 2: Sticky Category Chips Ribbon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
            scrollbarWidth: "none",
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
            Categories:
          </span>

          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            style={{
              flexShrink: 0,
              border: "none",
              background: categoryFilter === "all" ? "var(--ink)" : "var(--surface)",
              color: categoryFilter === "all" ? "#ffffff" : "var(--ink)",
              fontSize: 12,
              fontWeight: categoryFilter === "all" ? 700 : 500,
              padding: "4px 12px",
              borderRadius: 999,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: categoryFilter === "all" ? "var(--ink)" : "var(--line-2)",
            }}
          >
            All Categories ({rows.length})
          </button>

          {categories.map((c) => {
            const count = categoryCounts[c.name] ?? 0;
            const active = categoryFilter === c.name || categoryFilter === c.id;

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(active ? "all" : c.name)}
                style={{
                  flexShrink: 0,
                  border: "1px solid",
                  borderColor: active ? "var(--brand)" : "var(--line-2)",
                  background: active ? "var(--brand-050)" : "var(--surface)",
                  color: active ? "var(--brand)" : "var(--ink)",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  padding: "4px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{c.name}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 999,
                    background: active ? "var(--brand)" : "var(--line-2)",
                    color: active ? "#ffffff" : "var(--muted)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setCategoriesOpen(true)}
            style={{
              flexShrink: 0,
              border: "1px dashed var(--line-2)",
              background: "transparent",
              color: "var(--muted)",
              fontSize: 11.5,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Plus size={12} /> Add Category
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <div>Loading template gallery…</div>
        </div>
      ) : visible.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--line-2)",
            borderRadius: 18,
            padding: "48px 24px",
            textAlign: "center",
            maxWidth: 500,
            margin: "40px auto",
          }}
        >
          <LayoutTemplate size={40} style={{ color: "var(--muted)", margin: "0 auto 16px" }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No templates found</h3>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
            No templates match the selected plan, category, or search filters.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearchInput("");
                setPlanFilter("all");
                setCategoryFilter("all");
                setFilterIndex(0);
              }}
            >
              Reset filters
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCreateFor({})}
            >
              <Plus size={14} /> Create template
            </button>
          </div>
        </div>
      ) : viewMode === "table" ? (
        /* Dense Data Table View */
        <div className="card" style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Preview</th>
                  <th>Template Name</th>
                  <th>Category</th>
                  <th>Plan Access</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <div
                        style={{
                          width: 52,
                          height: 34,
                          borderRadius: 6,
                          overflow: "hidden",
                          background: r.accent,
                          position: "relative",
                        }}
                      >
                        <TemplateThumb thumbnail={r.thumbnail || "hero"} accent={r.accent} />
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => goToBuilder(r.pageId || r.designId)}
                        style={{
                          border: "none",
                          background: "transparent",
                          fontWeight: 700,
                          fontSize: 14,
                          color: "var(--ink)",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        {r.name}
                      </button>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.description}</div>
                    </td>
                    <td>
                      {r.category ? (
                        <span className="badge b-gray" style={{ fontWeight: 600 }}>
                          {r.category}
                        </span>
                      ) : (
                        <span style={{ color: "var(--faint)", fontSize: 12 }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <TierBadge tier={r.tier} plans={plans} allowedPlanIds={r.allowedPlanIds ?? []} />
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.source}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn btn-soft btn-sm"
                          onClick={() => goToBuilder(r.pageId || r.designId)}
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setPreviewRow(r)}
                        >
                          <Eye size={12} /> Preview
                        </button>
                        {r.pageId && (
                          <Link href={manageHref(r.pageId)} className="btn btn-ghost btn-sm" title="Settings">
                            <Settings2 size={12} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Visual Card Showcase Grid */
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              viewMode === "compact"
                ? "repeat(auto-fill, minmax(260px, 1fr))"
                : "repeat(auto-fill, minmax(320px, 1fr))",
            gap: viewMode === "compact" ? 16 : 22,
          }}
        >
          {paged.pageRows.map((r, i) => (
            <TemplateCard
              key={r.key}
              row={r}
              plans={plans}
              delay={i % 9}
              onEdit={() => {
                if (r.pageId) {
                  goToBuilder(r.pageId);
                } else {
                  // Unsaved predefined design — create it first, pre-filled.
                  setCreateFor({ designId: r.designId, name: r.name });
                }
              }}
              onPreview={() => window.open(templatePreviewPath(r.pageId || r.designId), "_blank")}
              onQuickPreview={() => setPreviewRow(r)}
              onDuplicate={() => duplicateRow(r)}
              onPublish={r.pageId && r.status !== "published" ? () => setStatus(r.pageId!, "published") : undefined}
              onUnpublish={r.pageId && r.status === "published" ? () => setStatus(r.pageId!, "draft") : undefined}
              onRemove={r.pageId ? () => setDeleteFor(r) : undefined}
            />
          ))}
        </div>
      )}
      {!loading ? (
        <ListPager page={paged.page} total={paged.total} onPageChange={paged.setPage} noun="templates" />
      ) : null}

      {/* Interactive Responsive Device Preview Modal */}
      {previewRow && (
        <Modal
          open={!!previewRow}
          onClose={() => setPreviewRow(null)}
          title={previewRow.name}
          headerActions={
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <TierBadge tier={previewRow.tier} plans={plans} allowedPlanIds={previewRow.allowedPlanIds ?? []} />
              {previewRow.category && (
                <span className="badge b-gray" style={{ fontWeight: 600 }}>
                  {previewRow.category}
                </span>
              )}
            </div>
          }
          footer={
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "space-between" }}>
              {/* Device switcher */}
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--surface-2, #f8fafc)",
                  borderRadius: 8,
                  padding: 2,
                  border: "1px solid var(--line-2)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  title="Desktop View (100%)"
                  style={{
                    border: "none",
                    background: previewDevice === "desktop" ? "var(--surface)" : "transparent",
                    color: previewDevice === "desktop" ? "var(--brand)" : "var(--muted)",
                    padding: "5px 9px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <Monitor size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("tablet")}
                  title="Tablet View (768px)"
                  style={{
                    border: "none",
                    background: previewDevice === "tablet" ? "var(--surface)" : "transparent",
                    color: previewDevice === "tablet" ? "var(--brand)" : "var(--muted)",
                    padding: "5px 9px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <Tablet size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  title="Mobile View (375px)"
                  style={{
                    border: "none",
                    background: previewDevice === "mobile" ? "var(--surface)" : "transparent",
                    color: previewDevice === "mobile" ? "var(--brand)" : "var(--muted)",
                    padding: "5px 9px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <Smartphone size={15} />
                </button>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => window.open(templatePreviewPath(previewRow.pageId || previewRow.designId), "_blank")}
              >
                <ExternalLink size={13} /> Fullscreen
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const target = previewRow.pageId || previewRow.designId;
                  setPreviewRow(null);
                  goToBuilder(target);
                }}
              >
                <Edit2 size={13} /> Open in Builder
              </button>
            </div>
          }
        >
          <div
            style={{
              background: "#0f172a",
              borderRadius: 14,
              padding: previewDevice === "desktop" ? "8px" : "24px 12px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 520,
              maxHeight: "75vh",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width:
                  previewDevice === "desktop"
                    ? "100%"
                    : previewDevice === "tablet"
                      ? 768
                      : 375,
                height: 520,
                background: "#ffffff",
                borderRadius: previewDevice === "desktop" ? 8 : 16,
                overflow: "hidden",
                boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
                transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                border: previewDevice !== "desktop" ? "8px solid #334155" : "none",
              }}
            >
              <iframe
                src={templatePreviewPath(previewRow.pageId || previewRow.designId)}
                title={previewRow.name}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
              />
            </div>
          </div>
        </Modal>
      )}

      {createFor ? (
        <CreateTemplateModal
          onClose={() => setCreateFor(null)}
          categories={categories}
          plans={plans}
          initialDesignId={createFor.designId}
          initialName={createFor.name}
        />
      ) : null}

      <TemplateCategoriesModal
        open={categoriesOpen}
        onClose={closeCategories}
        categories={categories}
        rows={rows}
        onCategoriesChanged={() => {
          setCategoriesChanged(true);
          reloadCategories();
        }}
        notify={notify}
      />

      {/* Delete / Reset Confirmation Modal */}
      <ConfirmModal
        open={!!deleteFor}
        title={deleteFor?.kind === "preset" ? "Reset predefined template?" : "Delete template?"}
        message={
          deleteFor?.kind === "preset"
            ? `Are you sure you want to reset "${deleteFor?.name}" to its original design? Any custom builder edits will be reverted.`
            : `Are you sure you want to delete "${deleteFor?.name}"? Any landing pages currently using this template will retain their static content.`
        }
        confirmLabel={deleteFor?.kind === "preset" ? "Reset to original" : "Delete template"}
        destructive={deleteFor?.kind !== "preset"}
        onConfirm={() => {
          if (deleteFor?.kind === "preset") {
            resetRow(deleteFor);
          } else if (deleteFor) {
            deleteRow(deleteFor);
          }
        }}
        onClose={() => setDeleteFor(null)}
      />

      {/* Toast Notification */}
      {toast ? (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}>
          <div
            style={{
              background: "#0e1525",
              color: "#fff",
              padding: "10px 18px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} style={{ color: "#10b981" }} />
            <span>{toast}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}