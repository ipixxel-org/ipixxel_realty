"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import {
  exportAdminAuditLogs,
  getAdminAuditLogs,
  getAdminAuditLogsMeta,
} from "@/lib/api";
import type {
  AdminAuditLogActor,
  AdminAuditLogEntry,
  AdminAuditLogsMeta,
  AdminAuditLogsParams,
} from "@/lib/types";

const PAGE_SIZE = 10;

const AV_TONES = [
  "linear-gradient(135deg, #6366f1 0%, #0f1424 100%)",
  "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
  "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  "linear-gradient(135deg, #ec4899 0%, #db2777 100%)",
  "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function formatDateTime(value: string): { dateStr: string; timeStr: string; relative: string } {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { dateStr: value, timeStr: "", relative: "" };

  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  const dateStr = `${day} ${months[d.getMonth()]} ${yyyy}`;
  const timeStr = `${hh}:${mm}`;

  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative = "";
  if (diffMin < 1) relative = "Just now";
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffHours < 24) relative = `${diffHours}h ago`;
  else relative = `${diffDays}d ago`;

  return { dateStr, timeStr, relative };
}

function actorInitials(actor: AdminAuditLogActor | null): { initials: string; bg: string } {
  if (actor) {
    const first = actor.firstName?.[0] ?? "";
    const last = actor.lastName?.[0] ?? "";
    const initials = (first + last) || actor.email.slice(0, 2).toUpperCase();
    return {
      initials: initials.toUpperCase(),
      bg: AV_TONES[hashString(actor.email || actor.id) % AV_TONES.length],
    };
  }
  return { initials: "SYS", bg: "linear-gradient(135deg, #64748b 0%, #475569 100%)" };
}

function actionBadgeStyle(action: string): { bg: string; color: string; border: string; label: string } {
  const act = action.toLowerCase();
  if (act.includes("create") || act.includes("add") || act.includes("register") || act.includes("publish")) {
    return { bg: "rgba(16, 185, 129, 0.1)", color: "#059669", border: "rgba(16, 185, 129, 0.25)", label: action };
  }
  if (act.includes("update") || act.includes("edit") || act.includes("change") || act.includes("patch") || act.includes("renew")) {
    return { bg: "rgba(21, 27, 46, 0.1)", color: "#0f1424", border: "rgba(21, 27, 46, 0.25)", label: action };
  }
  if (act.includes("delete") || act.includes("remove") || act.includes("cancel") || act.includes("revoke") || act.includes("reject")) {
    return { bg: "rgba(239, 68, 68, 0.1)", color: "#dc2626", border: "rgba(239, 68, 68, 0.25)", label: action };
  }
  if (act.includes("login") || act.includes("auth") || act.includes("verify") || act.includes("approve")) {
    return { bg: "rgba(245, 158, 11, 0.1)", color: "#d97706", border: "rgba(245, 158, 11, 0.25)", label: action };
  }
  if (act.includes("export") || act.includes("download") || act.includes("view")) {
    return { bg: "rgba(14, 165, 233, 0.1)", color: "#0284c7", border: "rgba(14, 165, 233, 0.25)", label: action };
  }
  return { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1", label: action };
}

function displayModuleKey(moduleKey: string | null): string {
  if (!moduleKey) return "System Core";
  const name = moduleKey.replace(/^admin_/, "").replace(/_/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename: string, rows: AdminAuditLogEntry[]) {
  const header = [
    "Timestamp",
    "Actor",
    "Actor email",
    "Organisation",
    "Module",
    "Action",
    "Entity",
    "Entity ID",
    "Metadata",
  ];
  const lines = rows.map((r) => [
    r.createdAt,
    r.actor
      ? [r.actor.firstName, r.actor.lastName].filter(Boolean).join(" ")
      : "System",
    r.actor?.email ?? "",
    r.organisation?.name ?? "",
    r.moduleKey ?? "",
    r.action,
    r.entity ?? "",
    r.entityId ?? "",
    r.metadata === null || r.metadata === undefined ? "" : JSON.stringify(r.metadata),
  ]);
  const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SuperAdminAuditLogsPage() {
  const [rows, setRows] = useState<AdminAuditLogEntry[]>([]);
  const [meta, setMeta] = useState<AdminAuditLogsMeta | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inspector modal state
  const [inspectEntry, setInspectEntry] = useState<AdminAuditLogEntry | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    getAdminAuditLogsMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const params: AdminAuditLogsParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      actorId: actorId || undefined,
      action: action || undefined,
      moduleKey: moduleKey || undefined,
      orgId: orgId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [page, search, actorId, action, moduleKey, orgId, dateFrom, dateTo],
  );

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    getAdminAuditLogs(params)
      .then((res) => {
        setRows(res.data ?? []);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load audit logs."),
      )
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void fetchList();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchList]);

  const hasFilters =
    Boolean(search) ||
    Boolean(actorId) ||
    Boolean(action) ||
    Boolean(moduleKey) ||
    Boolean(orgId) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setActorId("");
    setAction("");
    setModuleKey("");
    setOrgId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await exportAdminAuditLogs(params);
      downloadCsv(res.filename || "audit-logs.csv", res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyMetadataJson = (json: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 40 }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 999,
                background: "rgba(21, 27, 46, 0.08)",
                color: "#0f1424",
                fontSize: 12,
                fontWeight: 700,
                border: "1px solid rgba(21, 27, 46, 0.15)",
              }}
            >
              <Icon name="shield" size={14} /> Security &amp; Compliance Audit
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                borderRadius: 999,
                background: "rgba(16, 185, 129, 0.08)",
                color: "#059669",
                fontSize: 11.5,
                fontWeight: 700,
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 8px #10b981",
                }}
              />
              Live Activity Stream
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Platform Audit Logs
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#64748b" }}>
            Real-time security trail and administrative activity dispatches across all tenant organisations.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void fetchList()}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#334155",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <Icon name="refresh" size={15} className={loading ? "spin" : ""} />
            Refresh Stream
          </button>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #0f1424 0%, #0f1424 100%)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(21, 27, 46, 0.3)",
            }}
          >
            <Icon name="download" size={15} />
            {exporting ? "Generating CSV…" : "Export Audit Trail"}
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: "16px 20px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(21, 27, 46, 0.08)",
              color: "#0f1424",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="shield" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Total Logged Events
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
              {total.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: "16px 20px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(14, 165, 233, 0.08)",
              color: "#0ea5e9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="users" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Active Admin Actors
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
              {meta?.actors?.length ?? "—"}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: "16px 20px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(16, 185, 129, 0.08)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="puzzle" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Monitored Modules
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
              {meta?.modules?.length ?? "—"}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: "16px 20px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(245, 158, 11, 0.08)",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="building" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Organisations Tracked
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
              {meta?.organisations?.length ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Control Box */}
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 18,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", gridColumn: "span 2" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
              <Icon name="search" size={16} />
            </span>
            <input
              type="text"
              placeholder="Search actions, entities, actor names, orgs, IDs…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px 9px 38px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                fontSize: 13,
                outline: "none",
                background: "#f8fafc",
                fontWeight: 500,
              }}
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}
              >
                ×
              </button>
            ) : null}
          </div>

          {/* Actor Select */}
          <select
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, background: "#f8fafc", color: "#1e293b", fontWeight: 500 }}
          >
            <option value="">All Actors &amp; Admins</option>
            {(meta?.actors ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.email}
              </option>
            ))}
          </select>

          {/* Action Select */}
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, background: "#f8fafc", color: "#1e293b", fontWeight: 500 }}
          >
            <option value="">All Action Types</option>
            {(meta?.actions ?? []).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          {/* Module Select */}
          <select
            value={moduleKey}
            onChange={(e) => {
              setModuleKey(e.target.value);
              setPage(1);
            }}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, background: "#f8fafc", color: "#1e293b", fontWeight: 500 }}
          >
            <option value="">All Modules</option>
            {(meta?.modules ?? []).map((m) => (
              <option key={m.key} value={m.key}>
                {displayModuleKey(m.key)}
              </option>
            ))}
          </select>

          {/* Org Select */}
          <select
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              setPage(1);
            }}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, background: "#f8fafc", color: "#1e293b", fontWeight: 500 }}
          >
            <option value="">All Organisations</option>
            {(meta?.organisations ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          {/* Date From */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", padding: "4px 8px", borderRadius: 10, border: "1px solid #cbd5e1" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>FROM</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              style={{ border: "none", background: "none", fontSize: 12.5, color: "#1e293b", outline: "none", flex: 1 }}
            />
          </div>

          {/* Date To */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", padding: "4px 8px", borderRadius: 10, border: "1px solid #cbd5e1" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>TO</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              style={{ border: "none", background: "none", fontSize: 12.5, color: "#1e293b", outline: "none", flex: 1 }}
            />
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasFilters ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px dashed #e2e8f0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Active Filters:</span>
            {search ? (
              <span style={{ background: "rgba(21, 27, 46, 0.08)", color: "#0f1424", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                Search: "{search}"
                <button type="button" onClick={() => { setSearchInput(""); setSearch(""); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#0f1424", fontWeight: 700 }}>×</button>
              </span>
            ) : null}
            {actorId ? (
              <span style={{ background: "rgba(14, 165, 233, 0.08)", color: "#0284c7", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                Actor Selected
                <button type="button" onClick={() => setActorId("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#0284c7", fontWeight: 700 }}>×</button>
              </span>
            ) : null}
            {action ? (
              <span style={{ background: "rgba(16, 185, 129, 0.08)", color: "#059669", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                Action: {action}
                <button type="button" onClick={() => setAction("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#059669", fontWeight: 700 }}>×</button>
              </span>
            ) : null}
            {moduleKey ? (
              <span style={{ background: "rgba(139, 92, 246, 0.08)", color: "#7c3aed", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                Module: {displayModuleKey(moduleKey)}
                <button type="button" onClick={() => setModuleKey("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#7c3aed", fontWeight: 700 }}>×</button>
              </span>
            ) : null}

            <button
              type="button"
              onClick={clearFilters}
              style={{ padding: "3px 10px", borderRadius: 20, border: "1px solid #cbd5e1", background: "#fff", fontSize: 12, fontWeight: 600, color: "#ef4444", cursor: "pointer", marginLeft: "auto" }}
            >
              Clear All Filters
            </button>
          </div>
        ) : null}
      </div>

      {/* Error alert */}
      {error ? (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#dc2626",
            padding: "12px 16px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="alert" size={16} /> {error}
        </div>
      ) : null}

      {/* Audit Log Table Card */}
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.03)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #f1f5f9",
            background: "#f8fafc",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>Event Activity Log</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", background: "#e2e8f0", padding: "2px 8px", borderRadius: 999 }}>
              {loading ? "Refreshing…" : `${total.toLocaleString()} records`}
            </span>
          </div>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Showing Page {page} of {totalPages}</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "12px 18px", width: 170 }}>Timestamp</th>
                <th style={{ padding: "12px 18px" }}>Actor / User</th>
                <th style={{ padding: "12px 18px" }}>Organisation</th>
                <th style={{ padding: "12px 18px" }}>Module</th>
                <th style={{ padding: "12px 18px" }}>Action</th>
                <th style={{ padding: "12px 18px" }}>Target Entity</th>
                <th style={{ padding: "12px 18px", textAlign: "right" }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td colSpan={7} style={{ padding: "16px 18px", textAlign: "center", color: "#94a3b8" }}>
                      Loading platform audit stream…
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f1f5f9", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="shield" size={24} />
                      </div>
                      <span style={{ fontWeight: 700, color: "#334155", fontSize: 15 }}>No Audit Log Entries Found</span>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>Try clearing filters or search query to view all platform events.</span>
                      {hasFilters ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          style={{ marginTop: 6, padding: "7px 16px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#0f1424", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                        >
                          Reset Filters
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const av = actorInitials(r.actor);
                  const badge = actionBadgeStyle(r.actionLabel || r.action);
                  const dt = formatDateTime(r.createdAt);

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Timestamp */}
                      <td style={{ padding: "14px 18px", whiteSpace: "nowrap" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{dt.dateStr}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          <span>{dt.timeStr}</span>
                          <span>•</span>
                          <span style={{ color: "#0f1424", fontWeight: 600 }}>{dt.relative}</span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              background: av.bg,
                              color: "#fff",
                              fontWeight: 800,
                              fontSize: 11.5,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                              flexShrink: 0,
                            }}
                          >
                            {av.initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>
                              {r.actor
                                ? [r.actor.firstName, r.actor.lastName].filter(Boolean).join(" ") || r.actor.email
                                : "System Automation"}
                            </div>
                            {r.actor?.email ? (
                              <div style={{ fontSize: 11.5, color: "#64748b" }}>{r.actor.email}</div>
                            ) : (
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>Automated Background Service</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Organisation */}
                      <td style={{ padding: "14px 18px" }}>
                        {r.organisation?.name ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 8, background: "#f1f5f9", border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600, color: "#334155" }}>
                            <Icon name="building" size={13} style={{ color: "#64748b" }} />
                            {r.organisation.name}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>Global Platform</span>
                        )}
                      </td>

                      {/* Module */}
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: 6,
                            background: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "#475569",
                          }}
                        >
                          {displayModuleKey(r.moduleKey)}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 20,
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            fontSize: 11.5,
                            fontWeight: 700,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Target Entity */}
                      <td style={{ padding: "14px 18px" }}>
                        {r.entity ? (
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 12.5, color: "#0f172a" }}>{r.entity}</span>
                            {r.entityId ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, color: "#64748b", fontFamily: "monospace" }}>
                                  {r.entityId.length > 18 ? `${r.entityId.slice(0, 18)}…` : r.entityId}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(r.entityId!, r.id)}
                                  style={{ border: "none", background: "none", cursor: "pointer", color: copiedId === r.id ? "#10b981" : "#94a3b8", fontSize: 10 }}
                                  title="Copy Entity ID"
                                >
                                  {copiedId === r.id ? "✓" : "📋"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>

                      {/* Inspect Button */}
                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => setInspectEntry(r)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: "1px solid #cbd5e1",
                            background: "#fff",
                            color: "#0f1424",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                          }}
                        >
                          <Icon name="eye" size={13} /> Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 ? (
          <div
            style={{
              padding: "14px 20px",
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 600 }}>
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} events
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: page <= 1 ? "#f1f5f9" : "#fff",
                  color: page <= 1 ? "#94a3b8" : "#334155",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                <Icon name="chevron-left" size={14} /> Previous
              </button>

              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", padding: "0 8px" }}>
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: page >= totalPages ? "#f1f5f9" : "#fff",
                  color: page >= totalPages ? "#94a3b8" : "#334155",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Inspector Modal */}
      <Modal
        open={!!inspectEntry}
        onClose={() => setInspectEntry(null)}
        title="Audit Event Inspection Payload"
        description="Detailed record metadata, target references and raw payload."
        size="lg"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => inspectEntry?.metadata && copyMetadataJson(inspectEntry.metadata)}
              disabled={!inspectEntry?.metadata}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {copiedJson ? "✓ Copied Payload JSON" : "📋 Copy Raw JSON"}
            </button>

            <button
              type="button"
              onClick={() => setInspectEntry(null)}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: "#0f1424",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Close Inspector
            </button>
          </div>
        }
      >
        {inspectEntry ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
            {/* Top Summary Box */}
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                  {inspectEntry.actionLabel || inspectEntry.action}
                </span>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 20,
                    fontSize: 11.5,
                    fontWeight: 700,
                    ...actionBadgeStyle(inspectEntry.action),
                  }}
                >
                  {inspectEntry.action}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Event ID:</span>{" "}
                  <code style={{ fontSize: 11, background: "#fff", padding: "2px 6px", borderRadius: 4, border: "1px solid #cbd5e1" }}>
                    {inspectEntry.id}
                  </code>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Timestamp:</span>{" "}
                  <span style={{ fontWeight: 700, color: "#1e293b" }}>{inspectEntry.createdAt}</span>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Module Category:</span>{" "}
                  <span style={{ fontWeight: 700, color: "#475569" }}>{displayModuleKey(inspectEntry.moduleKey)}</span>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Target Entity:</span>{" "}
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{inspectEntry.entity || "N/A"}</span>
                </div>
              </div>
            </div>

            {/* Actor & Org Side by Side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Actor Box */}
              <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>
                  Actor Information
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
                  {inspectEntry.actor
                    ? [inspectEntry.actor.firstName, inspectEntry.actor.lastName].filter(Boolean).join(" ") || inspectEntry.actor.email
                    : "System Automation"}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {inspectEntry.actor?.email || "Automated Platform Process"}
                </div>
                {inspectEntry.actor?.id ? (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontFamily: "monospace" }}>
                    User ID: {inspectEntry.actor.id}
                  </div>
                ) : null}
              </div>

              {/* Org Box */}
              <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>
                  Organisation Context
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
                  {inspectEntry.organisation?.name || "Global Platform Scope"}
                </div>
                {inspectEntry.organisation?.id ? (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontFamily: "monospace" }}>
                    Org ID: {inspectEntry.organisation.id}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>System-wide event</div>
                )}
              </div>
            </div>

            {/* Metadata JSON Code Box */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
                  Event Metadata Payload ({inspectEntry.metadata ? "JSON" : "Empty"})
                </span>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  borderRadius: 10,
                  background: "#0f172a",
                  color: "#38bdf8",
                  fontSize: 12,
                  fontFamily: "monospace",
                  lineHeight: 1.5,
                  overflowX: "auto",
                  maxHeight: 280,
                  border: "1px solid #1e293b",
                }}
              >
                {inspectEntry.metadata && Object.keys(inspectEntry.metadata as object).length > 0
                  ? JSON.stringify(inspectEntry.metadata, null, 2)
                  : "// No extra metadata parameters attached to this audit event."}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}