"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { Icon } from "@/components/icons";
import {
  getOrgReportsSummary,
  getOrgReportsLeadSources,
  getOrgReportsFunnel,
  getOrgReportsAgentPerformance,
  getOrgReportsProjectAnalytics,
  downloadOrgReportCsv,
  getAdminReportsSummary,
  getAdminReportsLeadSources,
  getAdminReportsFunnel,
  getAdminReportsAgentPerformance,
  getAdminReportsProjectAnalytics,
  downloadAdminReportCsv,
  getAdminOrganisationsList,
} from "@/lib/api";
import type {
  ReportsFilterInput,
  ReportsSummary,
  LeadSourceStat,
  FunnelStageStat,
  AgentPerformanceStat,
  ProjectAnalyticsStat,
} from "@/lib/types";

interface ReportsViewProps {
  mode?: "org" | "admin";
}

const PRESET_OPTIONS = [
  { id: "30d", label: "Last 30 Days" },
  { id: "7d", label: "Last 7 Days" },
  { id: "today", label: "Today" },
  { id: "90d", label: "Last 90 Days" },
  { id: "all", label: "All Time" },
  { id: "custom", label: "Custom Range" },
];

function formatCurrency(val: number): string {
  if (val >= 10000000) {
    return `₹${(val / 10000000).toFixed(2)} Cr`;
  }
  if (val >= 100000) {
    return `₹${(val / 100000).toFixed(2)} L`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatDurationMins(mins: number): string {
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remainingMins}m`;
  return `${mins} mins`;
}

// Render sleek SVG Sparkline graphs matching the screenshot aesthetic
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

export function ReportsView({ mode = "org" }: ReportsViewProps) {
  const [filter, setFilter] = useState<ReportsFilterInput>({
    preset: "30d",
  });
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [organisations, setOrganisations] = useState<{ id: string; name: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [sources, setSources] = useState<LeadSourceStat[]>([]);
  const [funnel, setFunnel] = useState<FunnelStageStat[]>([]);
  const [agents, setAgents] = useState<AgentPerformanceStat[]>([]);
  const [projects, setProjects] = useState<ProjectAnalyticsStat[]>([]);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);

  useEffect(() => {
    if (mode === "admin") {
      void getAdminOrganisationsList().then((orgs) => setOrganisations(orgs));
    }
  }, [mode]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activeFilter: ReportsFilterInput = {
        ...filter,
        orgId: selectedOrgId || undefined,
      };
      if (filter.preset === "custom") {
        if (customStart) activeFilter.startDate = new Date(customStart).toISOString();
        if (customEnd) activeFilter.endDate = new Date(customEnd).toISOString();
      }

      if (mode === "admin") {
        const [sumRes, srcRes, fnlRes, agtRes, prjRes] = await Promise.all([
          getAdminReportsSummary(activeFilter),
          getAdminReportsLeadSources(activeFilter),
          getAdminReportsFunnel(activeFilter),
          getAdminReportsAgentPerformance(activeFilter),
          getAdminReportsProjectAnalytics(activeFilter),
        ]);
        setSummary(sumRes);
        setSources(srcRes);
        setFunnel(fnlRes);
        setAgents(agtRes);
        setProjects(prjRes);
      } else {
        const [sumRes, srcRes, fnlRes, agtRes, prjRes] = await Promise.all([
          getOrgReportsSummary(activeFilter),
          getOrgReportsLeadSources(activeFilter),
          getOrgReportsFunnel(activeFilter),
          getOrgReportsAgentPerformance(activeFilter),
          getOrgReportsProjectAnalytics(activeFilter),
        ]);
        setSummary(sumRes);
        setSources(srcRes);
        setFunnel(fnlRes);
        setAgents(agtRes);
        setProjects(prjRes);
      }
    } catch (err: any) {
      console.error("Failed to load report data:", err);
      setError(err?.message || "Failed to load report data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [mode, filter, selectedOrgId, customStart, customEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePresetChange = (preset: string) => {
    setFilter((prev) => ({ ...prev, preset }));
    setPresetDropdownOpen(false);
  };

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    setFilter((prev) => ({ ...prev, orgId: orgId || undefined }));
  };

  const handleExport = async (type: string) => {
    setExportMenuOpen(false);
    const activeFilter: ReportsFilterInput = {
      ...filter,
      orgId: selectedOrgId || undefined,
    };
    try {
      if (mode === "admin") {
        await downloadAdminReportCsv(activeFilter, type);
      } else {
        await downloadOrgReportCsv(activeFilter, type);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      setError(err?.message || "Failed to download CSV export.");
    }
  };

  const activePresetLabel = PRESET_OPTIONS.find((p) => p.id === filter.preset)?.label || "Last 30 Days";
  const activeOrgName = organisations.find((o) => o.id === selectedOrgId)?.name;
  const totalLeadsCount = summary?.totalLeads ?? 0;

  return (
    <div>
      {/* Super Admin Scope Selector Tabs */}
      {mode === "admin" ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "12px 18px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Scope:</span>
            <div style={{ display: "flex", gap: 6, background: "#f8fafc", padding: 3, borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <button
                type="button"
                onClick={() => handleOrgChange("")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  background: !selectedOrgId ? "#0f1424" : "transparent",
                  color: !selectedOrgId ? "#fff" : "#64748b",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="globe" size={13} /> All Organisations (Platform View)
              </button>

              <button
                type="button"
                onClick={() => {
                  if (organisations.length > 0 && !selectedOrgId) {
                    handleOrgChange(organisations[0].id);
                  }
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  background: selectedOrgId ? "#0f1424" : "transparent",
                  color: selectedOrgId ? "#fff" : "#64748b",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="building" size={13} /> Specific Organisation
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Select Organisation:</span>
            <select
              value={selectedOrgId}
              onChange={(e) => handleOrgChange(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                fontSize: 12.5,
                fontWeight: 600,
                color: "#0f172a",
                background: "#fff",
                cursor: "pointer",
                minWidth: 230,
              }}
            >
              <option value="">-- All Organisations (Platform) --</option>
              {organisations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

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
            {mode === "admin"
              ? selectedOrgId
                ? `${activeOrgName || "Organisation"} Performance Dashboard`
                : "Platform Executive Dashboard"
              : "Organisation Executive Dashboard"}
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

          {/* Date Picker Dropdown Button */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setPresetDropdownOpen((v) => !v)}
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
              {activePresetLabel}
              <Icon name="chevron-down" size={12} style={{ color: "#94a3b8" }} />
            </button>

            {presetDropdownOpen ? (
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
                {PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePresetChange(opt.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: filter.preset === opt.id ? 700 : 500,
                      color: filter.preset === opt.id ? "#0f1424" : "#334155",
                      background: filter.preset === opt.id ? "rgba(21, 27, 46, 0.08)" : "transparent",
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

          {/* Export CSV Button */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                background: "#0f1424",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(21, 27, 46, 0.25)",
              }}
            >
              <Icon name="download" size={14} /> Export <Icon name="chevron-down" size={12} />
            </button>

            {exportMenuOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  width: 180,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.15)",
                  overflow: "hidden",
                  zIndex: 60,
                  padding: "4px 0",
                }}
              >
                <button
                  type="button"
                  onClick={() => void handleExport("leads")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "#1e293b",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <Icon name="target" size={14} /> Export Leads CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("agents")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "#1e293b",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <Icon name="users" size={14} /> Export Agents CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("projects")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "#1e293b",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <Icon name="building" size={14} /> Export Projects CSV
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {filter.preset === "custom" ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: "10px 16px",
            border: "1px solid #e2e8f0",
            marginBottom: 20,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Custom Dates:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: "#94a3b8" }}>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12 }}
          />
        </div>
      ) : null}

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

      {/* KPI Cards Grid (8 Cards: 2 Rows x 4 Columns) */}
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
              {loading ? "…" : totalLeadsCount}
            </div>
            <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <span>↑ 100% vs prev period</span>
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
              {loading ? "…" : formatCurrency(summary?.totalWonRevenue ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {summary?.wonCount ?? 0} closed deals
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
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "…" : formatCurrency(0)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {summary?.activePipelineCount ?? 0} in progress deals
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
              {loading ? "…" : `${(summary?.winRate ?? 0).toFixed(0)}%`}
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
              {loading ? "…" : summary?.totalCalls ?? 0}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              0% connect rate
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
              {loading ? "…" : 0}
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
              {loading ? "…" : formatDurationMins(summary?.totalTalkTimeMins ?? 0)}
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
              {loading ? "…" : 0}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Visits & Negotiations
            </div>
          </div>
        </div>
      </div>

      {/* Middle Grid Row: Lead Pipeline Stages & Project Performance */}
      <div className="kpi-split" style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20, marginBottom: 24 }}>
        {/* Lead Pipeline Stages Card */}
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
              Distribution of {totalLeadsCount} leads & closed leads
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {funnel.map((st) => {
              const maxCount = Math.max(totalLeadsCount, 1);
              const pct = Math.round((st.count / maxCount) * 100);
              return (
                <div key={st.stage} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 100, fontSize: 12, fontWeight: 600, color: "#475569" }}>
                    {st.label}
                  </div>
                  <div style={{ flex: 1, height: 10, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(pct, st.count > 0 ? 4 : 0)}%`,
                        background:
                          st.stage === "won"
                            ? "#10b981"
                            : st.stage === "lost"
                              ? "#ef4444"
                              : "linear-gradient(90deg, #6366f1, #3b82f6)",
                        borderRadius: 999,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div style={{ width: 90, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                    {st.count} leads ({pct}%)
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

          {projects.length > 0 ? (
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
                  {projects.map((p) => (
                    <tr key={p.projectId} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "10px 0", fontWeight: 700, color: "#1e293b" }}>{p.name}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 600, color: "#475569" }}>{p.totalLeads}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 700, color: "#10b981" }}>{p.wonLeadsCount}</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>{formatCurrency(p.revenueBooked)}</td>
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

      {/* Bottom Grid Row: Call Outcomes & Team Leaderboard */}
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
                {[
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
                ))}
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

          {agents.length > 0 ? (
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
                  {agents.map((agt) => (
                    <tr key={agt.agentId} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "10px 0" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{agt.name}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{agt.email}</div>
                      </td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 600, color: "#475569" }}>{agt.assignedLeads}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 700, color: "#10b981" }}>{agt.wonCount}</td>
                      <td style={{ padding: "10px 0", textAlign: "center", fontWeight: 700, color: "#0f1424" }}>{agt.conversionRate}%</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>{formatCurrency(agt.totalRevenue)}</td>
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

      {/* Footer Card: Recent Activity Feed */}
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
      </div>
    </div>
  );
}
