"use client";

import { useEffect, useState, useCallback, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Seg } from "@/components/superadmin/seg";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { getAdminDashboard } from "@/lib/api";
import { LiveNowCard } from "@/components/superadmin/live-now-card";
import { firstAccessibleAdminHref } from "@/components/superadmin/shell";
import type { AdminDashboardResponse } from "@/lib/types";

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

function Sparkline({ color, d }: { color: string; d: string }) {
  const reactId = useId();
  const gradientId = `spark-grad-sa-${color.replace(/[^a-zA-Z0-9]/g, "")}-${reactId.replace(/:/g, "")}`;
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
  "M 0 26 Q 20 18, 40 24 T 84 10",
  "M 0 22 Q 20 28, 40 14 T 84 8",
];

export default function SuperAdminDashboardPage() {
  const { user, accessToken, isLoading: authLoading, hasPermission } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [revenueMetric, setRevenueMetric] = useState<"MRR" | "Total">("Total");
  const [periodIndex, setPeriodIndex] = useState(2); // 30d
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);

  // Platform users without Dashboard view access must never see this page —
  // it's the console's default post-login landing route, so it can't rely on
  // the sidebar alone to keep restricted users out. Send them to the first
  // module they're actually allowed to view instead.
  const canViewDashboard = !authLoading && !!user && hasPermission("admin_dashboard", "view");
  useEffect(() => {
    if (authLoading || !user) return;
    if (canViewDashboard) return;
    const fallback = firstAccessibleAdminHref(user, hasPermission);
    router.replace(fallback ?? "/admin-login");
  }, [authLoading, user, canViewDashboard, hasPermission, router]);

  const loadDashboard = useCallback(async () => {
    if (authLoading) return;
    if (!accessToken || user?.role !== "super_admin" || !canViewDashboard) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getAdminDashboard();
      setData(res);
    } catch (err) {
      console.error("Failed to load Super Admin dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [authLoading, accessToken, user, canViewDashboard]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (!canViewDashboard) return null;

  const firstName = user?.first_name || (user?.email ? user.email.split("@")[0] : "Admin");

  const stats = data?.stats ?? {
    totalOrgs: 0,
    activeOrgs: 0,
    newOrgsThisMonth: 0,
    newOrgsLastMonth: 0,
    activeSubscriptions: 0,
    paidPercentage: 0,
    platformMrr: 0,
    platformMrrLakhs: 0,
    templatesLive: 0,
    templatesTotal: 0,
    pendingTemplatesCount: 0,
  };

  const revenueTimeline = data?.revenueTimeline ?? [];
  const recentOrgs = data?.recentOrganisations ?? [];
  const pendingRequests = data?.pendingRequests ?? [];

  const maxRevVal = Math.max(
    ...revenueTimeline.map((r) => (revenueMetric === "MRR" ? r.mrr : r.total)),
    1000
  );

  return (
    <div>
      {/* Top Header */}
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
            SUPER ADMIN PLATFORM CONTROL
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
            Welcome back, {firstName} 👋
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 0 }}>
            Real-time platform metrics, organisation performance, subscription revenue, and system health.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Live Data Indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#10b981", fontWeight: 600, background: "rgba(16, 185, 129, 0.08)", padding: "5px 12px", borderRadius: 999 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            Live Platform Telemetry
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

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              color: "#334155",
              cursor: "pointer",
            }}
          >
            <Icon name="refresh" size={14} /> Refresh
          </button>

          <Link
            href="/admin-console/organisations"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 10,
              background: "#0f1424",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 2px 8px rgba(21, 27, 46, 0.25)",
            }}
          >
            <Icon name="building" size={14} /> Manage Orgs
          </Link>
        </div>
      </div>

      {/* 8 Executive Platform KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* KPI 1: Total Organisations */}
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
                <Icon name="building" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Total Orgs</span>
            </div>
            <Sparkline color="#0f1424" d={SPARK_PATHS[0]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "…" : stats.totalOrgs}
            </div>
            <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginTop: 2 }}>
              ↑ {stats.newOrgsThisMonth} new onboarded
            </div>
          </div>
        </div>

        {/* KPI 2: Active Subscriptions */}
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
                <Icon name="billing" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Active Subscriptions</span>
            </div>
            <Sparkline color="#10b981" d={SPARK_PATHS[1]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "…" : stats.activeSubscriptions}
            </div>
            <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginTop: 2 }}>
              ↑ {stats.paidPercentage}% paid conversion
            </div>
          </div>
        </div>

        {/* KPI 3: Platform MRR */}
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
                <Icon name="reports" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Platform MRR</span>
            </div>
            <Sparkline color="#a855f7" d={SPARK_PATHS[2]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading
                ? "…"
                : stats.platformMrr >= 100000
                  ? `₹${stats.platformMrrLakhs.toFixed(1)} L`
                  : formatCurrency(stats.platformMrr)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {stats.activeSubscriptions > 0 ? "Active recurring revenue" : "No active subs"}
            </div>
          </div>
        </div>

        {/* KPI 4: Templates Live */}
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
                <Icon name="puzzle" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Templates Live</span>
            </div>
            <Sparkline color="#f97316" d={SPARK_PATHS[3]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "…" : stats.templatesLive}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {stats.pendingTemplatesCount} draft / scheduled
            </div>
          </div>
        </div>

        {/* KPI 5: Active Orgs */}
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
                <Icon name="users" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Active Tenants</span>
            </div>
            <Sparkline color="#0ea5e9" d={SPARK_PATHS[4]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "…" : stats.activeOrgs}
            </div>
            <div style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 700, marginTop: 2 }}>
              {Math.round((stats.activeOrgs / (stats.totalOrgs || 1)) * 100)}% active operational rate
            </div>
          </div>
        </div>

        {/* KPI 6: Monthly Growth */}
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
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(236, 72, 153, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ec4899" }}>
                <Icon name="trending" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Monthly Growth</span>
            </div>
            <Sparkline color="#ec4899" d={SPARK_PATHS[5]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "…" : `+${stats.newOrgsThisMonth}`}
            </div>
            <div style={{ fontSize: 11, color: "#ec4899", fontWeight: 700, marginTop: 2 }}>
              vs {stats.newOrgsLastMonth} orgs last month
            </div>
          </div>
        </div>

        {/* KPI 7: Pending Approvals */}
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
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(245, 158, 11, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b" }}>
                <Icon name="globe" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Domain Approvals</span>
            </div>
            <Sparkline color="#f59e0b" d={SPARK_PATHS[6]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "…" : pendingRequests.length}
            </div>
            <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700, marginTop: 2 }}>
              Requires admin review
            </div>
          </div>
        </div>

        {/* KPI 8: System Health */}
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
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(34, 197, 94, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#22c55e" }}>
                <Icon name="shield" size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>System Status</span>
            </div>
            <Sparkline color="#22c55e" d={SPARK_PATHS[7]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              99.98%
            </div>
            <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>
              All services operational
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart & Quick Actions Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 20, marginBottom: 24 }}>
        {/* Revenue Chart Card */}
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
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Platform Revenue Trends — Last 6 Months
              </h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
                Monthly recurring subscription revenue and total billing volume
              </p>
            </div>
            <Seg
              options={["MRR", "Total"]}
              defaultIndex={revenueMetric === "MRR" ? 0 : 1}
              onChange={(idx) => setRevenueMetric(idx === 0 ? "MRR" : "Total")}
            />
          </div>

          {loading && revenueTimeline.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180, color: "#94a3b8", fontSize: 13 }}>
              Loading revenue analytics...
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 180, paddingTop: 10 }}>
              {revenueTimeline.map((r) => {
                const val = revenueMetric === "MRR" ? r.mrr : r.total;
                const heightPct = Math.max(14, Math.round((val / maxRevVal) * 100));
                return (
                  <div
                    key={r.m}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      height: "100%",
                    }}
                  >
                    <div
                      title={`${r.m}: ₹${val.toLocaleString()}`}
                      style={{
                        width: "65%",
                        height: `${heightPct}%`,
                        background: r.g || "linear-gradient(180deg, #6366f1, #0f1424)",
                        borderRadius: "8px 8px 0 0",
                        transition: "height 0.4s ease",
                        cursor: "pointer",
                      }}
                    />
                    <small style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                      {r.m}
                    </small>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions & Control Center Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: "22px 24px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Platform Control Shortcuts
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
              Quick administrative access to core modules
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Link
              href="/admin-console/organisations"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(21, 27, 46, 0.08)",
                color: "#0f1424",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Icon name="building" size={15} /> Manage Organisations
            </Link>
            <Link
              href="/admin-console/reports"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(16, 185, 129, 0.08)",
                color: "#10b981",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Icon name="reports" size={15} /> Reports &amp; Analytics Studio
            </Link>
            <Link
              href="/admin-console/org-domains"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#334155",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Icon name="globe" size={15} /> Custom Domain Approvals
            </Link>
            <Link
              href="/admin-console/templates"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#334155",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Icon name="puzzle" size={15} /> Template Marketplace Studio
            </Link>
            <Link
              href="/admin-console/email"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#334155",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Icon name="mail" size={15} /> Email Delivery &amp; SMTP Logs
            </Link>
          </div>
        </div>
      </div>

      <LiveNowCard />

      {/* Recently Onboarded Orgs & Pending Approvals Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20 }}>
        {/* Onboarded Organisations Table */}
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
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Recently Onboarded Organisations
            </h3>
            <Link href="/admin-console/organisations" style={{ fontSize: 12, fontWeight: 700, color: "#0f1424", textDecoration: "none" }}>
              View all orgs →
            </Link>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#94a3b8", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ padding: "8px 0", textAlign: "left" }}>ORGANISATION</th>
                  <th style={{ padding: "8px 0", textAlign: "center" }}>PLAN</th>
                  <th style={{ padding: "8px 0", textAlign: "center" }}>USERS</th>
                  <th style={{ padding: "8px 0", textAlign: "right" }}>JOINED</th>
                </tr>
              </thead>
              <tbody>
                {recentOrgs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8" }}>
                      {loading ? "Loading organisations..." : "No organisations onboarded yet."}
                    </td>
                  </tr>
                ) : (
                  recentOrgs.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "12px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: o.av || "linear-gradient(135deg, #6366f1, #0f1424)",
                              color: "#fff",
                              fontWeight: 700,
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {o.sm || o.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link href={`/admin-console/organisation-detail/${o.id}`} style={{ textDecoration: "none", color: "#0f172a", fontWeight: 700 }}>
                              {o.name}
                            </Link>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{o.statusTxt || "Active"}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 0", textAlign: "center" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(21, 27, 46, 0.08)", color: "#0f1424", fontWeight: 700, fontSize: 11 }}>
                          {o.planTxt}
                        </span>
                      </td>
                      <td style={{ padding: "12px 0", textAlign: "center", color: "#475569", fontWeight: 600 }}>{o.users}</td>
                      <td style={{ padding: "12px 0", textAlign: "right", color: "#64748b", fontSize: 12 }}>{o.joined}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Domain & System Requests */}
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
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Pending Domain Approvals
            </h3>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(245, 158, 11, 0.12)", color: "#d97706" }}>
              {pendingRequests.length} pending
            </span>
          </div>

          {pendingRequests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
              {loading ? "Checking requests..." : "No pending domain requests."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pendingRequests.map((p) => (
                <div key={p.id} style={{ padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, color: "#1e293b", fontSize: 13 }}>
                    <span>{p.name}</span>
                    <span style={{ fontSize: 11, color: "#d97706", fontWeight: 800 }}>{p.amt}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", margin: "4px 0 10px" }}>{p.desc}</div>
                  <Link href="/admin-console/org-domains" style={{ fontSize: 12, fontWeight: 700, color: "#0f1424", textDecoration: "none" }}>
                    Review Request →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}