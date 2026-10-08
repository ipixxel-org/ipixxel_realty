"use client";

import { useEffect, useState, useCallback, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { firstAllowedOrgPath } from "@/components/org/shell";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icons";
import type { CrmLeadStatus, OrgDashboardKpiData } from "@/lib/types";
import { useLeadStages } from "@/lib/lead-stages";

const PERIOD_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "All Time", value: "all" },
] as const;

function formatCurrency(amount: number): string {
  if (!amount || amount <= 0) return "₹0";
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0 mins";
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins % 60}m`;
  }
  return `${mins} mins`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Sparkline({ color, d }: { color: string; d: string }) {
  const reactId = useId();
  const gradientId = `spark-grad-${color.replace(/[^a-zA-Z0-9]/g, "")}-${reactId.replace(/:/g, "")}`;
  return (
    <svg width="84" height="32" viewBox="0 0 84 32" fill="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={`${d} L 84 32 L 0 32 Z`} fill={`url(#${gradientId})`} />
      <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const SPARK_PATHS = [
  "M 0 24 Q 20 18, 40 22 T 84 10",
  "M 0 28 Q 20 20, 40 26 T 84 14",
  "M 0 22 Q 20 14, 40 24 T 84 8",
  "M 0 26 Q 20 22, 40 18 T 84 12",
  "M 0 20 Q 20 26, 40 16 T 84 10",
  "M 0 24 Q 20 16, 40 20 T 84 6",
];

export default function OrgDashboardPage() {
  const { accessToken, hasPermission } = useAuth();
  const router = useRouter();
  const { label: stageLabel, color: stageColor } = useLeadStages();
  const canViewDashboard = hasPermission("dashboard", "view");
  const fallbackPath = canViewDashboard
    ? null
    : firstAllowedOrgPath(hasPermission);

  // Without Dashboard > View, /org (the default landing page) forwards to the
  // first page this user may open instead of rendering the dashboard.
  useEffect(() => {
    if (!canViewDashboard && fallbackPath) router.replace(fallbackPath);
  }, [canViewDashboard, fallbackPath, router]);

  const [periodIndex, setPeriodIndex] = useState(2); // default 30d
  const [data, setData] = useState<OrgDashboardKpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);

  const fetchDashboard = useCallback(async () => {
    if (!accessToken || !canViewDashboard) return;
    setLoading(true);
    setError(null);
    const periodValue = PERIOD_OPTIONS[periodIndex]?.value ?? "30d";
    try {
      const res = await apiFetch<OrgDashboardKpiData>(`/org/dashboard?period=${periodValue}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, canViewDashboard, periodIndex]);

  useEffect(() => {
    fetchDashboard();
    const handleSuccess = () => fetchDashboard();
    window.addEventListener("prestate:lead-success", handleSuccess);
    const interval = setInterval(fetchDashboard, 30000);
    return () => {
      window.removeEventListener("prestate:lead-success", handleSuccess);
      clearInterval(interval);
    };
  }, [fetchDashboard]);

  const roleLabel = (r: string) => {
    switch (r) {
      case "super_admin":
        return "Super Admin Overview";
      case "admin":
      case "organisation_admin":
        return "Organisation Executive Dashboard";
      case "manager":
        return "Sales Manager Dashboard";
      case "sales":
        return "Sales Representative Dashboard";
      case "telecaller":
        return "Telecaller & Call Centre Dashboard";
      default:
        return `${r.charAt(0).toUpperCase() + r.slice(1)} Dashboard`;
    }
  };

  const kpis = data?.kpis;
  const pipeline = data?.pipelineBreakdown ?? [];
  const totalPipelineLeads = pipeline.reduce((sum, p) => sum + p.count, 0);

  if (!canViewDashboard) {
    // Redirecting — or nothing is assigned yet, so explain instead of erroring.
    if (fallbackPath) return null;
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No modules assigned yet</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Your role doesn&apos;t have access to any pages. Ask your organisation admin to grant permissions.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Top Header Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#0f1424", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            ANALYTICS & KPIs
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
            {data ? roleLabel(data.role) : "Organisation Executive Dashboard"}
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 0 }}>
            Real-time business performance, lead pipeline, calls, site visits, and team revenue metrics.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Live Data Indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#10b981", fontWeight: 600, background: "rgba(16, 185, 129, 0.08)", padding: "5px 12px", borderRadius: 999 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            Data updated just now
          </div>

          {/* Period Selector Dropdown */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setPeriodDropdownOpen((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "#fff",
                fontSize: 13,
                fontWeight: 600,
                color: "#1e293b",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <Icon name="calendar" size={14} style={{ color: "#64748b" }} />
              {PERIOD_OPTIONS[periodIndex]?.label ?? "Last 30 Days"}
              <Icon name="chevron-down" size={12} style={{ color: "#94a3b8" }} />
            </button>

            {periodDropdownOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  width: 170,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.15)",
                  overflow: "hidden",
                  zIndex: 60,
                  padding: "4px 0",
                }}
              >
                {PERIOD_OPTIONS.map((opt, idx) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPeriodIndex(idx);
                      setPeriodDropdownOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: periodIndex === idx ? 700 : 500,
                      color: periodIndex === idx ? "#0f1424" : "#334155",
                      background: periodIndex === idx ? "rgba(21, 27, 46, 0.08)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            marginBottom: 20,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* 8 Primary KPI Tiles */}
      <div
        className="kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Card 1: Total Leads */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(21, 27, 46, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f1424" }}>
                <Icon name="users" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Total Leads</span>
            </div>
            <Sparkline color="#0f1424" d={SPARK_PATHS[0]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : kpis.totalLeads}
            </div>
            <div style={{ fontSize: 11, color: (kpis?.periodChangePercent ?? 0) >= 0 ? "#10b981" : "#e11d48", fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <span>{kpis ? `${kpis.periodChangePercent >= 0 ? "↑" : "↓"} ${Math.abs(kpis.periodChangePercent)}% vs prev period` : "—"}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Booked Revenue */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(16, 185, 129, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981", fontWeight: 800, fontSize: 16 }}>
                ₹
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Booked Revenue</span>
            </div>
            <Sparkline color="#10b981" d={SPARK_PATHS[1]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : formatCurrency(kpis.wonRevenue)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {kpis?.wonLeads ?? 0} closed deals
            </div>
          </div>
        </div>

        {/* Card 3: Active Pipeline */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(168, 85, 247, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#a855f7" }}>
                <Icon name="filter" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Active Pipeline</span>
            </div>
            <Sparkline color="#a855f7" d={SPARK_PATHS[2]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : formatCurrency(kpis.activePipelineRevenue)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              In progress deals
            </div>
          </div>
        </div>

        {/* Card 4: Win Rate */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(249, 115, 22, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f97316" }}>
                <Icon name="target" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Win Rate</span>
            </div>
            <Sparkline color="#f97316" d={SPARK_PATHS[3]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : `${kpis.conversionRate}%`}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Lead conversion %
            </div>
          </div>
        </div>

        {/* Card 5: Total Calls */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(244, 63, 94, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f43f5e" }}>
                <Icon name="phone" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Total Calls</span>
            </div>
            <Sparkline color="#f43f5e" d={SPARK_PATHS[4]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : kpis.totalCalls}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {kpis ? `${kpis.callConnectRate}% connect rate` : "—"}
            </div>
          </div>
        </div>

        {/* Card 6: Connected Calls */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(14, 165, 233, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
                <Icon name="phone" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Connected Calls</span>
            </div>
            <Sparkline color="#0ea5e9" d={SPARK_PATHS[5]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : kpis.connectedCalls}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Voice conversations
            </div>
          </div>
        </div>

        {/* Card 7: Total Talk Time */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(16, 185, 129, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
                <Icon name="sparkles" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Total Talk Time</span>
            </div>
            <Sparkline color="#10b981" d={SPARK_PATHS[0]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : formatDuration(kpis.totalTalkTimeSeconds)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Calling duration
            </div>
          </div>
        </div>

        {/* Card 8: Site Visits Booked */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(168, 85, 247, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#a855f7" }}>
                <Icon name="calendar" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Site Visits Booked</span>
            </div>
            <Sparkline color="#a855f7" d={SPARK_PATHS[1]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading || !kpis ? "…" : kpis.siteVisitsBooked}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Visits &amp; Negotiations
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Stage Distribution & Project Performance */}
      <div className="kpi-split" style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20, marginBottom: 24 }}>
        {/* Pipeline Stages Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: "22px 24px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="phone" size={16} style={{ color: "#0f1424" }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Lead Pipeline Stages
              </h3>
              <Icon name="info" size={14} style={{ color: "#94a3b8", cursor: "pointer" }} />
            </div>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Distribution of {totalPipelineLeads} leads &amp; closed leads
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pipeline.map((stage) => {
              const pct = totalPipelineLeads > 0 ? Math.round((stage.count / totalPipelineLeads) * 100) : 0;
              const barColor = stageColor(stage.status as CrmLeadStatus);

              return (
                <div key={stage.status} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 100, fontSize: 12, fontWeight: 600, color: "#475569" }}>
                    {stageLabel(stage.status as CrmLeadStatus)}
                  </div>
                  <div style={{ flex: 1, height: 10, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(pct, stage.count > 0 ? 4 : 0)}%`,
                        background: barColor,
                        borderRadius: 999,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div style={{ width: 90, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                    {stage.count} leads ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Performance Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: "22px 24px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="document" size={16} style={{ color: "#0f1424" }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Project Performance
              </h3>
            </div>
            <Icon name="dots" size={16} style={{ color: "#94a3b8", cursor: "pointer" }} />
          </div>

          {data && data.projectMetrics.length > 0 ? (
            <div style={{ overflowX: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#94a3b8", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <th style={{ padding: "8px 0", textAlign: "left" }}>PROJECT</th>
                    <th style={{ padding: "8px 0", textAlign: "center" }}>LEADS</th>
                    <th style={{ padding: "8px 0", textAlign: "center" }}>WON</th>
                    <th style={{ padding: "8px 0", textAlign: "right" }}>REVENUE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projectMetrics.map((p) => (
                    <tr key={p.projectId} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "10px 0", fontWeight: 700, color: "#1e293b" }}>{p.projectName}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 600, color: "#475569" }}>{p.leadsCount}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 700, color: "#10b981" }}>{p.wonCount}</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", marginBottom: 12 }}>
                <Icon name="home" size={20} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                No project activity recorded for this period.
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Projects will appear here once you start receiving leads.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call Outcomes & Team Leaderboard */}
      <div className="kpi-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Call Outcomes Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: "22px 24px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="phone" size={16} style={{ color: "#0f1424" }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Call Outcomes
              </h3>
            </div>
            <Icon name="dots" size={16} style={{ color: "#94a3b8", cursor: "pointer" }} />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#94a3b8", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ padding: "8px 0", textAlign: "left" }}>OUTCOME</th>
                  <th style={{ padding: "8px 0", textAlign: "center" }}>CALLS</th>
                  <th style={{ padding: "8px 0", textAlign: "left" }}>SHARE</th>
                  <th style={{ padding: "8px 0", textAlign: "right" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {data && data.callOutcomes.length > 0 ? (
                  data.callOutcomes.map((c) => {
                    const totalC = kpis?.totalCalls ?? 1;
                    const share = totalC > 0 ? Math.round((c.count / totalC) * 100) : 0;
                    return (
                      <tr key={c.outcome} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "8px 0", fontWeight: 600, color: "#334155" }}>{c.label}</td>
                        <td style={{ padding: "8px 0", textAlign: "center", color: "#64748b" }}>{c.count}</td>
                        <td style={{ padding: "8px 0", width: 140 }}>
                          <div style={{ height: 6, width: "100%", background: "#f1f5f9", borderRadius: 999 }}>
                            <div style={{ height: "100%", width: `${share}%`, background: "#0f1424", borderRadius: 999 }} />
                          </div>
                        </td>
                        <td style={{ padding: "8px 0", textAlign: "right", color: "#94a3b8", fontWeight: 600 }}>{share}%</td>
                      </tr>
                    );
                  })
                ) : (
                  [
                    "Connected",
                    "Booked Visit",
                    "Callback Scheduled",
                    "No Answer",
                    "Line Busy",
                    "Missed Call",
                  ].map((outcome) => (
                    <tr key={outcome} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "8px 0", fontWeight: 600, color: "#334155" }}>{outcome}</td>
                      <td style={{ padding: "8px 0", textAlign: "center", color: "#64748b" }}>0</td>
                      <td style={{ padding: "8px 0", width: 140 }}>
                        <div style={{ height: 6, width: "100%", background: "#f1f5f9", borderRadius: 999 }}>
                          <div style={{ height: "100%", width: "0%", background: "#0f1424", borderRadius: 999 }} />
                        </div>
                      </td>
                      <td style={{ padding: "8px 0", textAlign: "right", color: "#94a3b8", fontWeight: 600 }}>0%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Team Leaderboard Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: "22px 24px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="team" size={16} style={{ color: "#0f1424" }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Team Leaderboard
              </h3>
            </div>
            <Icon name="dots" size={16} style={{ color: "#94a3b8", cursor: "pointer" }} />
          </div>

          {data && data.agentLeaderboard.length > 0 ? (
            <div style={{ overflowX: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#94a3b8", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <th style={{ padding: "8px 0", textAlign: "left" }}>TEAM MEMBER</th>
                    <th style={{ padding: "8px 0", textAlign: "center" }}>LEADS</th>
                    <th style={{ padding: "8px 0", textAlign: "center" }}>WON</th>
                    <th style={{ padding: "8px 0", textAlign: "center" }}>WIN RATE</th>
                    <th style={{ padding: "8px 0", textAlign: "right" }}>REVENUE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agentLeaderboard.map((a) => (
                    <tr key={a.userId} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "10px 0" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{a.email}</div>
                      </td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 600, color: "#475569" }}>{a.leadsCount}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 700, color: "#10b981" }}>{a.wonCount}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 700, color: "#0f1424" }}>{a.conversionRate}%</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>{formatCurrency(a.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", marginBottom: 12 }}>
                <Icon name="users" size={20} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                No user metrics found for this period.
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Team performance will appear here once activity is recorded.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "20px 24px",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={16} style={{ color: "#0f1424" }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Recent Activity Feed
            </h3>
          </div>
          <Icon name="dots" size={16} style={{ color: "#94a3b8", cursor: "pointer" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!data || data.recentActivity.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, background: "#f8fafc", border: "1px solid #f1f5f9" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(14, 165, 233, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
                <Icon name="globe" size={16} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                  Lead captured from website
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  System event · Live updates active
                </div>
              </div>
            </div>
          ) : (
            data.recentActivity.map((act) => (
              <div key={act.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid #f1f5f9" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(21, 27, 46, 0.1)", color: "#0f1424", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="check" size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>{act.text}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{formatDate(act.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
