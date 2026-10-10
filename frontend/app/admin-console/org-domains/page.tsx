"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icons";
import {
  adminDeleteOrgDomainRequest,
  getOrgDomainRequests,
  getPlatformConfig,
  reviewOrgDomainRequest,
  updatePlatformConfig,
  verifyOrgDomainRequest,
} from "@/lib/api";
import type {
  AdminOrgDomainRequest,
  DnsRecordSpec,
  PlatformConfig,
} from "@/lib/types";

const EMPTY_CONFIG: PlatformConfig = {
  id: null,
  subdomainMode: "production",
  subdomainBase: "",
  dnsMode: "a",
  infraIp: "",
  infraIpv6: "",
  infraCname: "",
  infraNs1: "",
  infraNs2: "",
  billingExpiryNotifyDays: 3,
  billingGracePeriodDays: 7,
  billingExpiryBehavior: "restrict",
  billingExpiryMessage: "",
  updatedAt: null,
};

const STATUS_STYLES: Record<string, { label: string; cls: string; dot: string }> = {
  pending: { label: "Pending", cls: "b-amber", dot: "#f59e0b" },
  changes_requested: { label: "Changes Requested", cls: "b-amber", dot: "#f97316" },
  approved: { label: "Approved (DNS Req)", cls: "b-blue", dot: "#3b82f6" },
  connected: { label: "Live", cls: "b-green", dot: "#10b981" },
  rejected: { label: "Rejected", cls: "b-rose", dot: "#f43f5e" },
  suspended: { label: "Suspended", cls: "b-rose", dot: "#ef4444" },
};

function DnsRecordTable({ records }: { records?: DnsRecordSpec[] | null }) {
  if (!records || records.length === 0) return null;
  return (
    <div className="tbl-wrap" style={{ marginTop: 8, fontSize: 12 }}>
      <table className="tbl tbl-sm">
        <thead>
          <tr>
            <th>Type</th>
            <th>Host</th>
            <th>Value</th>
            <th>TTL</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td>
                <span className="badge b-indigo">{r.type}</span>
              </td>
              <td style={{ fontFamily: "monospace" }}>{r.host}</td>
              <td style={{ fontFamily: "monospace" }}>{r.value}</td>
              <td className="muted">{r.ttl}</td>
              <td className="muted sm">{r.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line-2)",
        borderRadius: 14,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div
        style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          fontFamily: "monospace",
          color: accent ?? "var(--ink)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          className="muted"
          style={{ fontSize: 11.5, marginTop: 4, wordBreak: "break-word" }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export default function SuperAdminOrgDomainsPage() {
  const [rows, setRows] = useState<AdminOrgDomainRequest[]>([]);
  const [baseDomain, setBaseDomain] = useState("");
  const [wildcard, setWildcard] = useState<DnsRecordSpec[]>([]);
  const [dnsMode, setDnsMode] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  const [config, setConfig] = useState<PlatformConfig>(EMPTY_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const [res, cfg] = await Promise.all([
        getOrgDomainRequests({ limit: 100 }),
        getPlatformConfig(),
      ]);
      const items = res.rows ?? res.data ?? [];
      setRows(items);
      setBaseDomain(res.baseDomain ?? "");
      setWildcard(res.dnsInstructions ?? []);
      setDnsMode(res.dnsMode ?? "");
      setConfig({
        ...EMPTY_CONFIG,
        ...cfg,
        subdomainBase: cfg.subdomainBase ?? "",
        infraIp: cfg.infraIp ?? "",
        infraIpv6: cfg.infraIpv6 ?? "",
        infraCname: cfg.infraCname ?? "",
        infraNs1: cfg.infraNs1 ?? "",
        infraNs2: cfg.infraNs2 ?? "",
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load domain requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const [verifyModalData, setVerifyModalData] = useState<any | null>(null);
  const [feedbackPrompt, setFeedbackPrompt] = useState<{
    id: string;
    action: "reject" | "request_changes" | "suspend";
    domain: string;
  } | null>(null);
  const [feedbackInput, setFeedbackInput] = useState("");

  const stats = useMemo(() => {
    const s = {
      total: rows.length,
      pending: 0,
      approved: 0,
      dnsPending: 0,
      sslIssues: 0,
      live: 0,
      suspended: 0,
      rejected: 0,
    };
    for (const r of rows) {
      if (r.status === "pending") s.pending++;
      else if (r.status === "approved") s.approved++;
      else if (r.status === "rejected") s.rejected++;
      else if (r.status === "connected") s.live++;

      if (
        (r.status === "approved" || r.status === "connected") &&
        r.dnsStatus !== "verified"
      ) {
        s.dnsPending++;
      }
      if (
        r.sslStatus === "failed" ||
        (r.status === "connected" && r.sslStatus !== "active")
      ) {
        s.sslIssues++;
      }
      if (r.isSuspended || r.status === "suspended") {
        s.suspended++;
      }
    }
    return s;
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        let matchesStatus = true;
        if (filter === "pending") matchesStatus = r.status === "pending";
        else if (filter === "approved") matchesStatus = r.status === "approved";
        else if (filter === "live")
          matchesStatus = r.status === "connected" && !r.isSuspended;
        else if (filter === "dns_pending")
          matchesStatus =
            (r.status === "approved" || r.status === "connected") &&
            r.dnsStatus !== "verified";
        else if (filter === "ssl_issues")
          matchesStatus =
            r.sslStatus === "failed" ||
            (r.status === "connected" && r.sslStatus !== "active");
        else if (filter === "suspended")
          matchesStatus = Boolean(r.isSuspended || r.status === "suspended");
        else if (filter === "rejected") matchesStatus = r.status === "rejected";

        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          (r.organisation?.name && r.organisation.name.toLowerCase().includes(q)) ||
          (r.organisation?.slug && r.organisation.slug.toLowerCase().includes(q)) ||
          (r.customDomain && r.customDomain.toLowerCase().includes(q)) ||
          (r.landingPage?.name && r.landingPage.name.toLowerCase().includes(q));
        return matchesStatus && matchesSearch;
      }),
    [rows, filter, search],
  );

  async function review(
    id: string,
    action: "approve" | "reject" | "request_changes" | "suspend" | "reactivate",
    customReason?: string,
  ) {
    const text = (customReason ?? reason[id] ?? "").trim();
    if (action === "reject" && !text) {
      setMsg("Enter a rejection reason first.");
      return;
    }
    if (action === "request_changes" && !text) {
      setMsg("Enter requested changes feedback first.");
      return;
    }
    try {
      await reviewOrgDomainRequest(id, {
        action,
        reason: action === "reject" || action === "suspend" ? text : undefined,
        feedback: action === "request_changes" ? text : undefined,
      });
      setMsg(
        action === "approve"
          ? "Domain request approved (DNS configuration required)."
          : action === "reject"
          ? "Domain request rejected."
          : action === "request_changes"
          ? "Changes requested from organisation."
          : action === "suspend"
          ? "Domain suspended."
          : "Domain reactivated.",
      );
      setFeedbackPrompt(null);
      setFeedbackInput("");
      void fetchAll();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Review action failed.");
    }
  }

  async function handleVerify(id: string) {
    try {
      setMsg("Running live DNS and SSL diagnostics...");
      const res = await verifyOrgDomainRequest(id);
      setVerifyModalData(res);
      void fetchAll();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Verification check failed.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to permanently delete this domain request?"))
      return;
    try {
      await adminDeleteOrgDomainRequest(id);
      setMsg("Domain request deleted.");
      void fetchAll();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to delete domain request.");
    }
  }

  async function saveConfig() {
    setConfigSaving(true);
    setMsg(null);
    try {
      const saved = await updatePlatformConfig({
        subdomainMode: config.subdomainMode as "localhost" | "production",
        subdomainBase: config.subdomainBase || undefined,
        dnsMode: config.dnsMode as "a" | "cname" | "ns",
        infraIp: config.infraIp || undefined,
        infraIpv6: config.infraIpv6 || undefined,
        infraCname: config.infraCname || undefined,
        infraNs1: config.infraNs1 || undefined,
        infraNs2: config.infraNs2 || undefined,
      });
      setConfig((prev) => {
        const next = { ...prev, ...saved };
        return {
          ...next,
          subdomainBase: next.subdomainBase ?? "",
          infraIp: next.infraIp ?? "",
          infraIpv6: next.infraIpv6 ?? "",
          infraCname: next.infraCname ?? "",
          infraNs1: next.infraNs1 ?? "",
          infraNs2: next.infraNs2 ?? "",
        };
      });
      setConfigOpen(false);
      setMsg("Platform DNS settings saved and applied.");
      void fetchAll();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <>
      {/* 1. Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 13,
          color: "#64748b",
          marginBottom: 16,
        }}
      >
        <Icon name="home" size={14} />
        <span>Platform</span>
        <span style={{ color: "#94a3b8" }}>›</span>
        <span style={{ color: "#0f172a", fontWeight: 600 }}>Domains</span>
      </div>

      {/* 2. Hero Header Banner */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef2f6",
          borderRadius: 18,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)",
              border: "1px solid #c7d2fe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4f46e5",
              flexShrink: 0,
            }}
          >
            <Icon name="globe" size={26} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#0f172a",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Organisation Domain Requests
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                color: "#64748b",
                fontSize: 13.5,
                maxWidth: 680,
                lineHeight: 1.45,
              }}
            >
              Review and approve organisation custom domain requests. Once approved, organisations can map their domains directly to published landing pages.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void fetchAll()}
            disabled={loading}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "#334155",
              cursor: "pointer",
            }}
          >
            <Icon name="refresh" size={15} />
            <span>Refresh</span>
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setConfigOpen(true)}
            style={{
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              border: "none",
              borderRadius: 10,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              boxShadow: "0 2px 6px rgba(37,99,235,0.25)",
              cursor: "pointer",
            }}
          >
            <Icon name="globe" size={15} />
            <span>Configure Platform Domains</span>
          </button>
        </div>
      </div>

      {msg ? (
        <div
          className="card"
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            background: "#eff6ff",
            color: "#1d4ed8",
            border: "1px solid #bfdbfe",
            borderRadius: 12,
            fontWeight: 500,
          }}
        >
          {msg}
        </div>
      ) : null}

      {/* 3. Stat Cards Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {/* Card 1: Platform Origin */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #eef2f6",
            borderRadius: 16,
            padding: "16px 18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "#eff6ff",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="server" size={20} />
            </div>
            <button
              onClick={() => setConfigOpen(true)}
              title="Configure"
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: 2,
              }}
            >
              <Icon name="settings" size={15} />
            </button>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
            Platform origin
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "#0f172a",
              fontFamily: "monospace",
              letterSpacing: "-0.02em",
              margin: "3px 0 2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {config.infraIp || config.infraCname || "Not configured"}
          </div>
          <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}>
            DNS mode: {dnsMode ? dnsMode.toUpperCase() : "A"} record
          </div>
        </div>

        {/* Card 2: Total Requests */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #eef2f6",
            borderRadius: 16,
            padding: "16px 18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#eff6ff",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <Icon name="modules" size={20} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
            Total requests
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              margin: "2px 0 2px",
            }}
          >
            {stats.total}
          </div>
          <div style={{ fontSize: 11.5, color: "#10b981", fontWeight: 600 }}>
            ↑ 12% from last month
          </div>
        </div>

        {/* Card 3: Pending Review */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #eef2f6",
            borderRadius: 16,
            padding: "16px 18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#fef3c7",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <Icon name="clock" size={20} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
            Pending review
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: stats.pending ? "#f59e0b" : "#0f172a",
              letterSpacing: "-0.02em",
              margin: "2px 0 2px",
            }}
          >
            {stats.pending}
          </div>
          <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}>
            {stats.pending > 0 ? "Awaiting review" : "Up to date"}
          </div>
        </div>

        {/* Card 4: Approved */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #eef2f6",
            borderRadius: 16,
            padding: "16px 18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#dcfce7",
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <Icon name="check" size={20} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
            Approved
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              margin: "2px 0 2px",
            }}
          >
            {stats.approved}
          </div>
          <div style={{ fontSize: 11.5, color: "#10b981", fontWeight: 600 }}>
            ↑ 20% from last month
          </div>
        </div>

        {/* Card 5: Rejected */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #eef2f6",
            borderRadius: 16,
            padding: "16px 18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#ffe4e6",
              color: "#e11d48",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <Icon name="close" size={20} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
            Rejected
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: stats.rejected ? "#f43f5e" : "#0f172a",
              letterSpacing: "-0.02em",
              margin: "2px 0 2px",
            }}
          >
            {stats.rejected}
          </div>
          <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}>
            {stats.rejected > 0
              ? `${stats.rejected} rejected requests`
              : "No rejected requests"}
          </div>
        </div>
      </div>

      {/* 4. Filter & Search Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Status Pills */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {[
            { key: "all", label: `All statuses (${stats.total})` },
            { key: "pending", label: `Pending (${stats.pending})` },
            { key: "approved", label: `Approved (${stats.approved})` },
            { key: "rejected", label: `Rejected (${stats.rejected})` },
          ].map((t) => {
            const active = filter === t.key || (!filter && t.key === "all");
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key === "all" ? "" : t.key)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: active ? "1px solid #2563eb" : "1px solid #e2e8f0",
                  background: active ? "#2563eb" : "#ffffff",
                  color: active ? "#ffffff" : "#475569",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {t.label}
              </button>
            );
          })}


        </div>

        {/* Right Search & Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <div style={{ position: "relative", width: 280 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
                display: "flex",
                pointerEvents: "none",
              }}
            >
              <Icon name="search" size={14} />
            </span>
            <input
              className="inp"
              placeholder="Search by organisation, domain, or landing page..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                paddingLeft: 34,
                paddingRight: 12,
                height: 38,
                fontSize: 13,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
              }}
            />
          </div>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{
              height: 38,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              fontSize: 13,
              color: "#475569",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
          </select>
        </div>
      </div>

      {/* 5. Domain Requests Catalogue Card & Table */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef2f6",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        }}
      >
        {/* Card Header */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "#ede9fe",
                color: "#7c3aed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="globe" size={16} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              Domain Requests
            </span>
          </div>
          <span style={{ fontSize: 12.5, color: "#64748b", fontWeight: 500 }}>
            {loading
              ? "Loading..."
              : `Showing 1 - ${Math.min(visible.length, pageSize)} of ${rows.length} ${
                  rows.length === 1 ? "request" : "requests"
                }`}
          </span>
        </div>

        {/* Table */}
        <div className="tbl-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table className="tbl" style={{ width: "100%" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th
                  style={{
                    width: 44,
                    padding: "12px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  ORGANISATION
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  CUSTOM DOMAIN
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  LANDING PAGE
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  STATUS
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  REQUESTED
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    textAlign: "right",
                  }}
                >
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "40px 20px",
                      color: "#64748b",
                      fontSize: 13.5,
                    }}
                  >
                    No domain requests found{filter ? ` with status "${filter}"` : ""}.
                  </td>
                </tr>
              ) : (
                visible.slice(0, pageSize).map((r, idx) => {
                  const st = STATUS_STYLES[r.status] ?? {
                    label: r.status,
                    cls: "b-gray",
                    dot: "#64748b",
                  };
                  const initial = (r.organisation?.name || "O").charAt(0).toUpperCase();
                  const avatarColor =
                    ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"][
                      Math.abs(r.organisation?.name?.charCodeAt(0) ?? 0) % 5
                    ];

                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: 500,
                        }}
                      >
                        {idx + 1}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: avatarColor,
                              color: "#ffffff",
                              fontWeight: 800,
                              fontSize: 14,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {initial}
                          </div>
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 13.5,
                                color: "#0f172a",
                              }}
                            >
                              {r.organisation?.name ?? "—"}
                            </div>
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>
                              {r.organisation?.slug ?? ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 13.5,
                          color: "#0f172a",
                        }}
                      >
                        <div>{r.customDomain || "—"}</div>
                        {r.dnsInstructions && r.dnsInstructions.length > 0 ? (
                          <details style={{ marginTop: 4, fontSize: 11 }}>
                            <summary
                              className="muted"
                              style={{ cursor: "pointer" }}
                            >
                              DNS records
                            </summary>
                            <DnsRecordTable records={r.dnsInstructions} />
                          </details>
                        ) : null}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 13,
                          color: "#334155",
                        }}
                      >
                        {r.landingPage?.name ? (
                          <span style={{ fontWeight: 600, color: "#4338ca" }}>
                            {r.landingPage.name}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "3px 10px",
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 600,
                            background:
                              r.status === "approved" || r.status === "connected"
                                ? "#ecfdf5"
                                : r.status === "pending"
                                ? "#fffbeb"
                                : "#fef2f2",
                            color:
                              r.status === "approved" || r.status === "connected"
                                ? "#10b981"
                                : r.status === "pending"
                                ? "#f59e0b"
                                : "#f43f5e",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "currentColor",
                            }}
                          />
                          {st.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 12.5,
                          color: "#64748b",
                        }}
                      >
                        {new Date(r.requestedAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            gap: 6,
                            alignItems: "center",
                            justifyContent: "flex-end",
                            flexWrap: "wrap",
                          }}
                        >
                          {r.status === "pending" ? (
                            <>
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => void review(r.id, "approve")}
                                style={{
                                  background: "#10b981",
                                  color: "#fff",
                                  border: "none",
                                  padding: "5px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => {
                                  setFeedbackPrompt({
                                    id: r.id,
                                    action: "request_changes",
                                    domain: r.customDomain || "Domain",
                                  });
                                  setFeedbackInput("");
                                }}
                                style={{
                                  background: "#fef3c7",
                                  color: "#b45309",
                                  border: "1px solid #fde68a",
                                  padding: "5px 10px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Request Changes
                              </button>
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => {
                                  setFeedbackPrompt({
                                    id: r.id,
                                    action: "reject",
                                    domain: r.customDomain || "Domain",
                                  });
                                  setFeedbackInput("");
                                }}
                                style={{
                                  background: "#fff1f2",
                                  color: "#e11d48",
                                  border: "1px solid #fecdd3",
                                  padding: "5px 10px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => void handleVerify(r.id)}
                                title="Run live DNS & SSL resolution test"
                                style={{
                                  background: "#f8fafc",
                                  color: "#0f172a",
                                  border: "1px solid #cbd5e1",
                                  padding: "5px 10px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                }}
                              >
                                🔍 Diagnostics
                              </button>
                              {r.isSuspended || r.status === "suspended" ? (
                                <button
                                  className="btn btn-sm"
                                  type="button"
                                  onClick={() => void review(r.id, "reactivate")}
                                  style={{
                                    background: "#ecfdf5",
                                    color: "#059669",
                                    border: "1px solid #a7f3d0",
                                    padding: "5px 10px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Reactivate
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm"
                                  type="button"
                                  onClick={() => {
                                    setFeedbackPrompt({
                                      id: r.id,
                                      action: "suspend",
                                      domain: r.customDomain || "Domain",
                                    });
                                    setFeedbackInput("");
                                  }}
                                  style={{
                                    background: "#fff7ed",
                                    color: "#c2410c",
                                    border: "1px solid #ffedd5",
                                    padding: "5px 10px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Suspend
                                </button>
                              )}
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => void handleDelete(r.id)}
                                title="Delete domain record"
                                style={{
                                  background: "transparent",
                                  color: "#94a3b8",
                                  border: "none",
                                  padding: "5px 8px",
                                  cursor: "pointer",
                                  fontSize: 14,
                                }}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configure platform domains — popup */}
      <Modal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Configure platform DNS & origin"
        description="Configure your server IP address or CNAME target so organisation custom domains can be verified and routed correctly."
        size="lg"
      >
        <div className="row2">
          <div className="field">
            <label>DNS mode for custom domains</label>
            <select
              className="inp"
              value={config.dnsMode}
              onChange={(e) =>
                setConfig((p) => ({ ...p, dnsMode: e.target.value }))
              }
            >
              <option value="a">A record → server IP (AWS EC2 / VPS)</option>
              <option value="cname">CNAME → target host</option>
              <option value="ns">Nameservers</option>
            </select>
          </div>
          <div className="field" style={{ alignSelf: "flex-end" }}>
            <div className="hint" style={{ marginBottom: 0 }}>
              Live server target:{" "}
              <b style={{ fontFamily: "monospace" }}>
                {config.infraIp || config.infraCname || "not set"}
              </b>
            </div>
          </div>
        </div>
        <div className="row2">
          {config.dnsMode === "a" ? (
            <>
              <div className="field">
                <label>Origin IPv4 (VPS / server IP address)</label>
                <input
                  className="inp inp-mono"
                  placeholder="e.g. 187.126.119.156"
                  value={config.infraIp ?? ""}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, infraIp: e.target.value }))
                  }
                />
                <div className="hint" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Must be numeric IPv4 (e.g. 187.126.119.156), not a domain name.
                </div>
              </div>
              <div className="field">
                <label>Origin IPv6 (optional)</label>
                <input
                  className="inp inp-mono"
                  placeholder="::"
                  value={config.infraIpv6 ?? ""}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, infraIpv6: e.target.value }))
                  }
                />
              </div>
            </>
          ) : config.dnsMode === "cname" ? (
            <div className="field">
              <label>CNAME target</label>
              <input
                className="inp inp-mono"
                placeholder="cname.example.com"
                value={config.infraCname ?? ""}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, infraCname: e.target.value }))
                }
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label>Primary nameserver</label>
                <input
                  className="inp inp-mono"
                  value={config.infraNs1 ?? ""}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, infraNs1: e.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>Secondary nameserver</label>
                <input
                  className="inp inp-mono"
                  value={config.infraNs2 ?? ""}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, infraNs2: e.target.value }))
                  }
                />
              </div>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 16,
            borderTop: "1px solid var(--line-2)",
            paddingTop: 14,
          }}
        >
          <div className="card-h" style={{ padding: 0, border: "none" }}>
            <span className="t" style={{ fontSize: 13 }}>
              Custom domain DNS target instructions
            </span>
          </div>
          {wildcard.length > 0 ? (
            <>
              <DnsRecordTable records={wildcard} />
              <div className="hint" style={{ marginTop: 8 }}>
                Organisations connecting custom domains will be instructed to create these records in their registrar DNS zone pointing to your origin server.
              </div>
            </>
          ) : (
            <div className="hint" style={{ marginTop: 8 }}>
              {config.dnsMode === "a" && !config.infraIp
                ? "Enter the server IPv4 above to see the exact DNS records organisations will need to configure."
                : "Save settings to see the exact DNS instructions."}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
            paddingTop: 14,
            borderTop: "1px solid var(--line-2)",
          }}
        >
          <button
            className="btn btn-ghost"
            onClick={() => setConfigOpen(false)}
            disabled={configSaving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void saveConfig()}
            disabled={configSaving}
          >
            {configSaving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </Modal>

      {/* Feedback / Reason / Suspend Modal */}
      <Modal
        open={Boolean(feedbackPrompt)}
        onClose={() => {
          setFeedbackPrompt(null);
          setFeedbackInput("");
        }}
        title={
          feedbackPrompt?.action === "reject"
            ? `Reject Domain: ${feedbackPrompt?.domain}`
            : feedbackPrompt?.action === "request_changes"
            ? `Request Changes: ${feedbackPrompt?.domain}`
            : `Suspend Custom Domain: ${feedbackPrompt?.domain}`
        }
        description={
          feedbackPrompt?.action === "reject"
            ? "Enter the mandatory rejection reason. This will be visible to the organisation so they can make required corrections."
            : feedbackPrompt?.action === "request_changes"
            ? "Enter specific guidance or changes required from the organisation before their custom domain can be approved."
            : "Enter an optional suspension reason. When suspended, traffic to this domain is stopped immediately."
        }
        size="md"
      >
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>
            {feedbackPrompt?.action === "reject"
              ? "Rejection Reason *"
              : feedbackPrompt?.action === "request_changes"
              ? "Requested Changes / Guidance *"
              : "Suspension Reason (optional)"}
          </label>
          <textarea
            className="inp"
            rows={4}
            placeholder={
              feedbackPrompt?.action === "reject"
                ? "e.g. Inappropriate hostname, copyright violation, or duplicate request..."
                : feedbackPrompt?.action === "request_changes"
                ? "e.g. Please select the correct project landing page or verify apex hostname spelling..."
                : "e.g. Temporary suspension due to administrative review..."
            }
            value={feedbackInput}
            onChange={(e) => setFeedbackInput(e.target.value)}
            style={{ width: "100%", padding: 10, fontSize: 13, borderRadius: 8 }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
            paddingTop: 14,
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setFeedbackPrompt(null);
              setFeedbackInput("");
            }}
          >
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            disabled={
              (feedbackPrompt?.action === "reject" || feedbackPrompt?.action === "request_changes") &&
              !feedbackInput.trim()
            }
            onClick={() => {
              if (feedbackPrompt) {
                void review(feedbackPrompt.id, feedbackPrompt.action, feedbackInput);
              }
            }}
            style={{
              background:
                feedbackPrompt?.action === "reject"
                  ? "#e11d48"
                  : feedbackPrompt?.action === "request_changes"
                  ? "#d97706"
                  : "#ea580c",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {feedbackPrompt?.action === "reject"
              ? "Confirm Rejection"
              : feedbackPrompt?.action === "request_changes"
              ? "Send Requested Changes"
              : "Suspend Domain"}
          </button>
        </div>
      </Modal>

      {/* Verify Diagnostics Modal */}
      <Modal
        open={Boolean(verifyModalData)}
        onClose={() => setVerifyModalData(null)}
        title={`DNS & SSL Diagnostics — ${verifyModalData?.customDomain || ""}`}
        description="Live server-side DNS resolution checks, TXT ownership token verification, and SSL handshake results."
        size="lg"
      >
        {verifyModalData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", marginBottom: 8 }}>
                  DNS Verification
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: verifyModalData.dns?.allPassed ? "#10b981" : "#f59e0b",
                    }}
                  />
                  <strong style={{ fontSize: 14, color: verifyModalData.dns?.allPassed ? "#059669" : "#b45309" }}>
                    {verifyModalData.dns?.allPassed ? "All DNS Checks Passed" : "DNS Incomplete / Pending"}
                  </strong>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                  <div>
                    <b>Expected IP:</b> {verifyModalData.expectedIp || "Not configured"}
                  </div>
                  <div>
                    <b>Detected IPs:</b>{" "}
                    {verifyModalData.dns?.detectedIps?.length > 0
                      ? verifyModalData.dns.detectedIps.join(", ")
                      : "None detected"}
                  </div>
                  <div>
                    <b>IP Match:</b> {verifyModalData.dns?.ipMatch ? "✓ Yes" : "✗ No"}
                  </div>
                  <div>
                    <b>Ownership Token Match:</b> {verifyModalData.dns?.tokenMatch ? "✓ Yes" : "✗ Pending"}
                  </div>
                </div>
              </div>

              <div style={{ padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", marginBottom: 8 }}>
                  SSL / HTTPS Certificate
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: verifyModalData.ssl?.valid ? "#10b981" : "#f59e0b",
                    }}
                  />
                  <strong style={{ fontSize: 14, color: verifyModalData.ssl?.valid ? "#059669" : "#b45309" }}>
                    {verifyModalData.ssl?.valid
                      ? "Active & Valid"
                      : verifyModalData.ssl?.status || "Pending Provisioning"}
                  </strong>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                  <div>
                    <b>Certificate Issuer:</b> {verifyModalData.ssl?.issuer || "Pending / N/A"}
                  </div>
                  <div>
                    <b>Valid Until:</b>{" "}
                    {verifyModalData.ssl?.validTo
                      ? new Date(verifyModalData.ssl.validTo).toLocaleString()
                      : "Pending"}
                  </div>
                  {verifyModalData.ssl?.error && (
                    <div style={{ color: "#e11d48", marginTop: 4 }}>
                      <b>Error:</b> {verifyModalData.ssl.error}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {verifyModalData.dns?.errors && verifyModalData.dns.errors.length > 0 && (
              <div style={{ padding: 12, background: "#fff1f2", borderRadius: 8, border: "1px solid #fecdd3", fontSize: 12, color: "#be123c" }}>
                <strong>Diagnostics Notes:</strong>
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  {verifyModalData.dns.errors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setVerifyModalData(null)}
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}