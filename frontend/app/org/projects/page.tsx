"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useProjectTypes } from "@/lib/use-project-types";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { Reveal } from "@/components/superadmin/reveal";
import { CountUp } from "@/components/superadmin/count-up";
import { Icon } from "@/components/icons";
import "@/app/org/org.css";
import type { OrgBillingSummary, ProjectsListResponse, ProjectStatus } from "@/lib/types";

const LIMIT = 10;

const STATUS_TABS = ["All", "Active", "Inactive"] as const;
const STATUS_FOR_TAB: (ProjectStatus | undefined)[] = [
  undefined,
  "active",
  "inactive",
];

function managerInitials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #5eead4, #0d9488)",
  "linear-gradient(135deg, #c7d2fe, #818cf8)",
  "linear-gradient(135deg, #fbbf24, #f97316)",
  "linear-gradient(135deg, #f0abfc, #a855f7)",
  "linear-gradient(135deg, #fda4af, #e11d48)",
];

function getCoverGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
}

export default function OrgProjectsPage() {
  const { accessToken, hasPermission } = useAuth();
  // Projects > New project — enforced for the org admin too.
  const canCreate = hasPermission("projects", "add");
  const projectTypes = useProjectTypes(!!accessToken);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tabIndex, setTabIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");

  const [result, setResult] = useState<ProjectsListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [counts, setCounts] = useState<{
    total: number;
    active: number;
    inactive: number;
  } | null>(null);

  // Plan project quota — checked here so the wizard can't be entered at all
  // when the org is already at its limit. The server stays authoritative at
  // create time; this is purely UX.
  const [projectQuota, setProjectQuota] = useState<{
    used: number;
    limit: number | null;
    planName: string | null;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!accessToken) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    Promise.all([
      apiFetch<ProjectsListResponse>("/org/projects?limit=1", { headers }),
      apiFetch<ProjectsListResponse>("/org/projects?limit=1&status=active", { headers }),
      apiFetch<ProjectsListResponse>("/org/projects?limit=1&status=inactive", { headers }),
    ])
      .then(([all, active, inactive]) =>
        setCounts({ total: all.total, active: active.total, inactive: inactive.total })
      )
      .catch(() => setCounts(null));

    apiFetch<OrgBillingSummary>("/org/billing", { headers })
      .then((b) =>
        setProjectQuota({
          used: b.usage.projectsUsed,
          limit: b.usage.projectsLimit,
          planName: b.plan?.name ?? null,
        }),
      )
      .catch(() => setProjectQuota(null));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set("search", search);
    const status = STATUS_FOR_TAB[tabIndex];
    if (status) params.set("status", status);

    apiFetch<ProjectsListResponse>(`/org/projects?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(setResult)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load projects."))
      .finally(() => setLoading(false));
  }, [accessToken, page, search, tabIndex]);

  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to = Math.min(page * LIMIT, total);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const isFiltered = Boolean(search || STATUS_FOR_TAB[tabIndex]);
  const atProjectLimit =
    projectQuota != null &&
    projectQuota.limit != null &&
    projectQuota.used >= projectQuota.limit;

  const SparklineWave = ({ color }: { color: string }) => (
    <svg
      viewBox="0 0 120 40"
      fill="none"
      preserveAspectRatio="none"
      style={{ position: "absolute", right: 0, bottom: 0, width: "52%", height: 38, pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d="M0 34 C25 32, 40 37, 60 25 C80 13, 95 20, 110 8 C115 4, 118 6, 120 3 L120 40 L0 40 Z"
        fill={`url(#spark-${color.replace('#', '')})`}
      />
      <path
        d="M0 34 C25 32, 40 37, 60 25 C80 13, 95 20, 110 8 C115 4, 118 6, 120 3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <>
      {/* Page Header */}
      <div className="page-head reveal in" style={{ marginBottom: 20, borderBottom: "none", paddingBottom: 0 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#0066f5", fontWeight: 700, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            <Icon name="activity" size={13} /> SALES
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Projects</h1>
          <div className="sub" style={{ color: "#64748b", fontSize: 13.5, marginTop: 4, maxWidth: 740, lineHeight: 1.5 }}>
            Manage every development — inventory, availability, pricing, ad spend and leads. Built for developers, brokers &amp; channel partners.
          </div>
        </div>
        <div className="actions">
          {!canCreate ? null : atProjectLimit ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled
              title="You've reached your plan's project limit"
              style={{ opacity: 0.45, cursor: "not-allowed", pointerEvents: "none", background: "#0066f5" }}
            >
              <Icon name="plus" size={14} /> New project
            </button>
          ) : (
            <Link
              href="/org/projects/add-new-project"
              className="btn btn-primary"
              style={{
                background: "#0066f5",
                borderRadius: 9,
                padding: "9px 18px",
                fontWeight: 600,
                fontSize: 13.5,
                boxShadow: "0 4px 14px rgba(0, 102, 245, 0.35)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="plus" size={14} /> New project
            </Link>
          )}
        </div>
      </div>

      {atProjectLimit ? (
        <div
          className="card reveal in"
          style={{ marginBottom: 16, borderColor: "var(--amber, #f59e0b)", padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
        >
          <Icon name="alert" size={20} />
          <div style={{ flex: 1, minWidth: 220, fontSize: 13.5 }}>
            Your{projectQuota?.planName ? ` ${projectQuota.planName}` : ""} plan allows{" "}
            <b>{projectQuota?.limit}</b> project{projectQuota?.limit === 1 ? "" : "s"} and you have{" "}
            <b>{projectQuota?.used}</b>. Upgrade your plan to add more.
          </div>
          <Link href="/org/settings?section=billing" className="btn btn-soft btn-sm">Upgrade plan</Link>
        </div>
      ) : null}

      {/* KPI Cards Row (4 Cards) */}
      <div className="grid g4 reveal in mb-6" style={{ gap: 16 }}>
        {/* Card 1: Active Projects */}
        <Reveal delay={1}>
          <div
            className="stat"
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: "18px 20px",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ecfdf5", border: "1px solid #d1fae5", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981", flexShrink: 0 }}>
                  <Icon name="building" size={17} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b" }}>Active Projects</span>
              </div>
              <Icon name="chevron-right" size={14} style={{ color: "#94a3b8" }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              <CountUp value={counts?.active ?? 0} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11.5, fontWeight: 600, color: "#10b981" }}>
              <span>↗</span> 0% from last month
            </div>
            <SparklineWave color="#10b981" />
          </div>
        </Reveal>

        {/* Card 2: Total Projects */}
        <Reveal delay={2}>
          <div
            className="stat"
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: "18px 20px",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eff6ff", border: "1px solid #dbeafe", display: "flex", alignItems: "center", justifyContent: "center", color: "#0066f5", flexShrink: 0 }}>
                  <Icon name="modules" size={17} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b" }}>Total Projects</span>
              </div>
              <Icon name="chevron-right" size={14} style={{ color: "#94a3b8" }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              <CountUp value={counts?.total ?? 0} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11.5, fontWeight: 600, color: "#10b981" }}>
              <span>↗</span> 0% from last month
            </div>
            <SparklineWave color="#0066f5" />
          </div>
        </Reveal>

        {/* Card 3: Inactive */}
        <Reveal delay={3}>
          <div
            className="stat"
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: "18px 20px",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fffbeb", border: "1px solid #fef3c7", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b", flexShrink: 0 }}>
                  <Icon name="pause" size={17} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b" }}>Inactive</span>
              </div>
              <Icon name="chevron-right" size={14} style={{ color: "#94a3b8" }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              <CountUp value={counts?.inactive ?? 0} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11.5, fontWeight: 600, color: "#10b981" }}>
              <span>↗</span> 0% from last month
            </div>
            <SparklineWave color="#f59e0b" />
          </div>
        </Reveal>

        {/* Card 4: Unit Types */}
        <Reveal delay={4}>
          <div
            className="stat"
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: "18px 20px",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#faf5ff", border: "1px solid #f3e8ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#8b5cf6", flexShrink: 0 }}>
                  <Icon name="document" size={17} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b" }}>Unit Types</span>
              </div>
              <Icon name="chevron-right" size={14} style={{ color: "#94a3b8" }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              <CountUp value={rows.reduce((s, r) => s + r.unitTypeCount, 0)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11.5, fontWeight: 600, color: "#10b981" }}>
              <span>↗</span> 0% from last month
            </div>
            <SparklineWave color="#8b5cf6" />
          </div>
        </Reveal>
      </div>

      {/* Tabs Row */}
      <div style={{ display: "flex", gap: 24, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        <Link
          href="/org/projects"
          style={{
            padding: "10px 4px",
            fontSize: 14,
            fontWeight: 600,
            color: "#0066f5",
            borderBottom: "2px solid #0066f5",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          All Projects
        </Link>
        <Link
          href="/org/projects/all-units"
          style={{
            padding: "10px 4px",
            fontSize: 14,
            fontWeight: 500,
            color: "#64748b",
            borderBottom: "2px solid transparent",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            transition: "color 0.15s",
          }}
        >
          All Units
        </Link>
      </div>

      {/* Toolbar / Filters */}
      <Reveal delay={1}>
        <div
          className="proj-toolbar"
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "nowrap",
            marginBottom: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
            overflowX: "auto",
          }}
        >
          {/* Search Box */}
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", display: "flex" }}>
              <Icon name="search" size={15} />
            </span>
            <input
              style={{
                width: "100%",
                height: 38,
                paddingLeft: 36,
                paddingRight: 12,
                borderRadius: 9,
                border: "1px solid #e2e8f0",
                fontSize: 13,
                outline: "none",
                background: "#f8fafc",
                transition: "all 0.15s",
              }}
              placeholder="Search projects by name, location or type…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* Status Dropdown */}
          <select
            value={tabIndex}
            onChange={(e) => { setTabIndex(Number(e.target.value)); setPage(1); }}
            style={{
              width: "auto",
              minWidth: 125,
              height: 38,
              padding: "0 12px",
              borderRadius: 9,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              fontWeight: 500,
              background: "#fff",
              color: "#334155",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <option value={0}>All Statuses</option>
            <option value={1}>Active</option>
            <option value={2}>Inactive</option>
          </select>

          {/* Location Dropdown */}
          <select
            style={{
              width: "auto",
              minWidth: 135,
              height: 38,
              padding: "0 12px",
              borderRadius: 9,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              fontWeight: 500,
              background: "#fff",
              color: "#334155",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <option value="">All Locations</option>
            {Array.from(new Set(rows.map((r) => r.location).filter((loc): loc is string => Boolean(loc)))).map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>

          {/* Types Dropdown */}
          <select
            style={{
              width: "auto",
              minWidth: 125,
              height: 38,
              padding: "0 12px",
              borderRadius: 9,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              fontWeight: 500,
              background: "#fff",
              color: "#334155",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <option value="">All Types</option>
            {projectTypes.options?.map((t) => (
              <option key={t.id} value={t.label}>{t.label}</option>
            ))}
          </select>

          {/* View Toggle */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#f1f5f9",
              borderRadius: 9,
              padding: 3,
              gap: 2,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              style={{
                border: "none",
                background: view === "grid" ? "#fff" : "transparent",
                color: view === "grid" ? "#0066f5" : "#64748b",
                fontWeight: view === "grid" ? 600 : 500,
                borderRadius: 7,
                padding: "6px 12px",
                fontSize: 12.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                cursor: "pointer",
                boxShadow: view === "grid" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s",
              }}
            >
              <Icon name="modules" size={13} /> Grid
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              style={{
                border: "none",
                background: view === "list" ? "#fff" : "transparent",
                color: view === "list" ? "#0066f5" : "#64748b",
                fontWeight: view === "list" ? 600 : 500,
                borderRadius: 7,
                padding: "6px 12px",
                fontSize: 12.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                cursor: "pointer",
                boxShadow: view === "list" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s",
              }}
            >
              <Icon name="menu" size={13} /> List
            </button>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            title="Refresh list"
            onClick={() => setPage(1)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </Reveal>

      {/* Main View Area */}
      {view === "grid" ? (
        <Reveal delay={2}>
          {loadError ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}><p className="muted">{loadError}</p></div>
          ) : loading ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}><p className="muted">Loading projects…</p></div>
          ) : rows.length === 0 ? (
            /* Modern Empty State Container matching Image 3 */
            <div
              style={{
                border: "1.5px dashed #cbd5e1",
                borderRadius: 16,
                padding: "60px 24px",
                textAlign: "center",
                background: "#fcfdfe",
                marginBottom: 20,
              }}
            >
              {/* Modern City / Buildings Vector Illustration */}
              <svg width="220" height="120" viewBox="0 0 220 120" fill="none" style={{ margin: "0 auto 16px", display: "block" }}>
                <ellipse cx="110" cy="112" rx="90" ry="8" fill="#f1f5f9" />
                <circle cx="85" cy="55" r="40" fill="#eff6ff" opacity="0.7" />
                <circle cx="135" cy="50" r="35" fill="#f0fdf4" opacity="0.7" />
                {/* Tree Left */}
                <circle cx="48" cy="92" r="14" fill="#a7f3d0" />
                <rect x="46" y="92" width="4" height="20" rx="2" fill="#059669" />
                {/* Building Left */}
                <rect x="62" y="52" width="34" height="60" rx="3" fill="#cbd5e1" />
                <rect x="68" y="60" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="78" y="60" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="68" y="72" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="78" y="72" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="68" y="84" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="78" y="84" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="68" y="96" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="78" y="96" width="6" height="6" rx="1" fill="#ffffff" />
                {/* Center Tower (Tallest) */}
                <rect x="94" y="28" width="44" height="84" rx="4" fill="#334155" />
                <rect x="100" y="36" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="112" y="36" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="124" y="36" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="100" y="47" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="112" y="47" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="124" y="47" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="100" y="58" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="112" y="58" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="124" y="58" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="100" y="69" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="112" y="69" width="8" height="6" rx="1" fill="#67e8f9" />
                <rect x="124" y="69" width="8" height="6" rx="1" fill="#67e8f9" />
                {/* Building Right */}
                <rect x="136" y="46" width="30" height="66" rx="3" fill="#94a3b8" />
                <rect x="142" y="54" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="152" y="54" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="142" y="66" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="152" y="66" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="142" y="78" width="6" height="6" rx="1" fill="#ffffff" />
                <rect x="152" y="78" width="6" height="6" rx="1" fill="#ffffff" />
                {/* Tree Right */}
                <circle cx="178" cy="90" r="16" fill="#6ee7b7" />
                <rect x="176" y="90" width="4" height="22" rx="2" fill="#047857" />
                {/* Front Blue Plus Circle Badge */}
                <circle cx="116" cy="95" r="17" fill="#0066f5" filter="drop-shadow(0 4px 10px rgba(0,102,245,0.4))" />
                <path d="M116 88V102M109 95H123" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>No projects yet</h3>
              <p style={{ color: "#64748b", fontSize: 13.5, margin: "0 auto 20px", maxWidth: 460, lineHeight: 1.5 }}>
                {isFiltered
                  ? "No projects match the selected filters. Try resetting the filters."
                  : "Create your first project to manage inventory, capture leads and publish landing pages."}
              </p>
              {isFiltered ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setSearchInput(""); setTabIndex(0); }}
                  style={{ borderRadius: 9, padding: "9px 18px" }}
                >
                  Clear filters
                </button>
              ) : canCreate ? (
                <Link
                  href="/org/projects/add-new-project"
                  className="btn btn-primary"
                  style={{
                    background: "#0066f5",
                    padding: "10px 22px",
                    borderRadius: 9,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    boxShadow: "0 4px 14px rgba(0, 102, 245, 0.35)",
                  }}
                >
                  <Icon name="plus" size={14} /> Create your first project
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="pgrid">
              {rows.map((p) => (
                <Link key={p.id} href={`/org/projects/${p.id}`} className="pcard">
                  <div className="cover" style={{ background: getCoverGradient(p.id) }}>
                    <Icon name="building" size={22} />
                    <span className="tag">{[p.location, p.reraId].filter(Boolean).join(" · ") || "Project"}</span>
                    <span className="st">
                      <span className={`badge ${p.status === "active" ? "b-green" : "b-gray"}`}>{p.status === "active" ? "Active" : "Inactive"}</span>
                    </span>
                  </div>
                  <div className="pb">
                    <div>
                      <h3>{p.name}</h3>
                      <div className="loc"><Icon name="pin" size={12} /> {[p.location, p.reraId].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div className="pmeta">
                      <div><span className="k">Type</span><b>{p.projectType || "—"}</b></div>
                      <div><span className="k">Starting</span><b>{formatMoney(p.priceMin, p.currency)}</b></div>
                      <div><span className="k">Units</span><b>{p.unitCount}</b></div>
                      <div><span className="k">Landing pages</span><b>{p.landingPageCount}</b></div>
                      <div><span className="k">Manager</span>                      <b><span className="u"><span className="av xs">{managerInitials(p.manager?.name)}</span></span></b></div>
                    </div>
                    <div className="row gap-8">
                      <span className="btn btn-soft btn-sm" style={{ color: "#0066f5", background: "#eff6ff" }}>Open</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Reveal>
      ) : (
        <Reveal delay={2}>
          <div className="card">
            <div className="card-h">
              <span className="t">All projects</span>
              <span className="x muted">{loading ? "Loading…" : `Showing ${from}–${to} of ${total}`}</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Type</th>
                    <th>Manager</th>
                    <th>Status</th>
                    <th>Price range</th>
                    <th>Unit types</th>
                    <th>Landing pages</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loadError ? (
                    <tr><td colSpan={8} className="muted">{loadError}</td></tr>
                  ) : !loading && rows.length === 0 ? (
                    <tr><td colSpan={8} className="muted">{isFiltered ? "No projects match this filter." : "No projects yet."}</td></tr>
                  ) : (
                    rows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/org/projects/${p.id}`} className="brand-link" style={{ color: "#0066f5" }}>{p.name}</Link>
                          <div className="sm muted">{[p.location, p.reraId ? `RERA ${p.reraId}` : null].filter(Boolean).join(" · ") || "—"}</div>
                        </td>
                        <td>{p.projectType || "—"}</td>
                        <td>
                          <div className="u">
                            <span className="av">{managerInitials(p.manager?.name)}</span>
                            <span className="nm">{p.manager?.name ?? "Unassigned"}</span>
                          </div>
                        </td>
                        <td>
                          {p.status === "active" ? (
                            <span className="badge b-green">Active</span>
                          ) : (
                            <span className="badge b-gray">Inactive</span>
                          )}
                        </td>
                        <td>{formatMoneyRange(p.priceMin, p.priceMax, p.currency)}</td>
                        <td>{p.unitTypeCount}</td>
                        <td>{p.landingPageCount}</td>
                        <td><Link href={`/org/projects/${p.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div className="pager">
                <button className="btn btn-ghost btn-sm" type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
                <span className="muted fs-12-5 self-center">Page {page} of {totalPages}</span>
                <button className="btn btn-ghost btn-sm" type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next →</button>
              </div>
            ) : null}
          </div>
        </Reveal>
      )}

      {/* Tip Banner Callout at the bottom */}
      <div
        style={{
          background: "#eff6ff",
          border: "1px solid #dbeafe",
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 20,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", color: "#0066f5", flexShrink: 0 }}>
            <Icon name="sparkles" size={15} />
          </div>
          <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>
            Create projects to manage property inventory, build landing pages and start capturing leads.
          </span>
        </div>
        <Link
          href="/org/templates"
          style={{
            color: "#0066f5",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Learn more <Icon name="external" size={13} />
        </Link>
      </div>
    </>
  );
}

