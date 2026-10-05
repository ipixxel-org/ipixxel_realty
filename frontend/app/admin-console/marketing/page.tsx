"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/components/icons";
import { Modal, ModalActions } from "@/components/ui/modal";
import { PlatformBrandIcon } from "@/components/org/platform-brand-icon";
import {
  createAdminMarketingPlatform,
  deleteAdminMarketingPlatform,
  getAdminMarketingCredentials,
  getAdminMarketingPlatforms,
  getAdminMarketingSyncLogs,
  getAdminMetaConfig,
  updateAdminMarketingCredentials,
  updateAdminMarketingPlatform,
} from "@/lib/api";
import type {
  MarketingCredentials,
  MarketingPlatformAdmin,
  MarketingSyncLog,
  MetaPublicConfig,
} from "@/lib/types";

type Tab = "platforms" | "meta" | "logs" | "settings";

const TABS: Array<{ id: Tab; label: string; icon: "modules" | "link" | "sync" | "key" }> = [
  { id: "platforms", label: "Platforms", icon: "modules" },
  { id: "meta", label: "Meta App & Webhooks", icon: "link" },
  { id: "logs", label: "Sync & Event Logs", icon: "sync" },
  { id: "settings", label: "API Credentials", icon: "key" },
];

/** The 4 officially supported lead capture channels */
const REQUIRED_PLATFORM_KEYS = ["meta", "instagram", "whatsapp", "google_ads"] as const;

interface PlatformMeta {
  protocol: string;
  role: string;
  capabilities: string[];
  configTab: "meta" | "settings";
}

const PLATFORM_DETAILS: Record<string, PlatformMeta> = {
  meta: {
    protocol: "Meta Graph API v20.0",
    role: "Facebook Lead Ads capture submissions in real time with campaign, ad set, and UTM attribution.",
    capabilities: ["OAuth 2.0", "Webhook Realtime", "Instant Forms", "UTM Attribution"],
    configTab: "meta",
  },
  instagram: {
    protocol: "Meta Graph API v20.0",
    role: "Instagram Lead Ads flow via the linked Meta Page OAuth with placement attribution.",
    capabilities: ["OAuth 2.0", "Shared Meta Token", "Lead Placement", "Realtime Webhook"],
    configTab: "meta",
  },
  whatsapp: {
    protocol: "Meta Cloud API / Business",
    role: "Click-to-WhatsApp and WhatsApp Ads linked via Meta Business account for lead tagging.",
    capabilities: ["OAuth 2.0", "Meta Page Link", "Click-to-WhatsApp", "Attribution Ready"],
    configTab: "meta",
  },
  google_ads: {
    protocol: "Google Ads API v17",
    role: "Google Ads account connection for click ID (GCLID) parameter tracking and campaign metrics.",
    capabilities: ["OAuth 2.0", "GCLID Tracking", "Lead Forms Ready", "Spend Sync"],
    configTab: "settings",
  },
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatRelativeTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

export default function SuperAdminMarketingPage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("platforms");
  const [platforms, setPlatforms] = useState<MarketingPlatformAdmin[]>([]);
  const [logs, setLogs] = useState<MarketingSyncLog[]>([]);
  const [meta, setMeta] = useState<MetaPublicConfig | null>(null);
  const [creds, setCreds] = useState<MarketingCredentials>({
    metaAppId: "",
    metaAppSecret: "",
    metaWebhookVerifyToken: "",
    googleClientId: "",
    googleClientSecret: "",
    googleAdsClientId: "",
    googleAdsClientSecret: "",
    googleAdsDeveloperToken: "",
    metaConfigured: false,
    googleAuthConfigured: false,
    googleAdsConfigured: false,
  });
  const [initialCreds, setInitialCreds] = useState<MarketingCredentials | null>(null);
  const [savingCreds, setSavingCreds] = useState(false);
  const [showSecretMeta, setShowSecretMeta] = useState(false);
  const [showSecretToken, setShowSecretToken] = useState(false);
  const [showSecretGoogle, setShowSecretGoogle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [logPlatformFilter, setLogPlatformFilter] = useState("all");
  const [logStatusFilter, setLogStatusFilter] = useState("all");

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ key: "", name: "", description: "" });

  const [editing, setEditing] = useState<MarketingPlatformAdmin | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, m, c] = await Promise.all([
        getAdminMarketingPlatforms(),
        getAdminMarketingSyncLogs({ limit: 60 }),
        getAdminMetaConfig(),
        getAdminMarketingCredentials().catch(() => null),
      ]);
      setPlatforms(p);
      setLogs(s);
      setMeta(m);
      if (c) {
        setCreds(c);
        setInitialCreds(c);
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to load marketing platforms");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaveCredentials = useCallback(
    async (partial?: Partial<MarketingCredentials>) => {
      setSavingCreds(true);
      setFeedback(null);
      setOkMsg(null);
      try {
        const payload: Partial<MarketingCredentials> = {
          metaAppId: (partial?.metaAppId !== undefined ? partial.metaAppId : creds.metaAppId).trim(),
          metaAppSecret: (partial?.metaAppSecret !== undefined ? partial.metaAppSecret : creds.metaAppSecret).trim(),
          metaWebhookVerifyToken: (partial?.metaWebhookVerifyToken !== undefined ? partial.metaWebhookVerifyToken : creds.metaWebhookVerifyToken).trim(),
          googleClientId: (partial?.googleClientId !== undefined ? partial.googleClientId : (creds.googleClientId || creds.googleAdsClientId || "")).trim(),
          googleClientSecret: (partial?.googleClientSecret !== undefined ? partial.googleClientSecret : (creds.googleClientSecret || creds.googleAdsClientSecret || "")).trim(),
          googleAdsClientId: (partial?.googleAdsClientId !== undefined ? partial.googleAdsClientId : (creds.googleAdsClientId || creds.googleClientId || "")).trim(),
          googleAdsClientSecret: (partial?.googleAdsClientSecret !== undefined ? partial.googleAdsClientSecret : (creds.googleAdsClientSecret || creds.googleClientSecret || "")).trim(),
          googleAdsDeveloperToken: (partial?.googleAdsDeveloperToken !== undefined ? partial.googleAdsDeveloperToken : creds.googleAdsDeveloperToken).trim(),
        };
        const updated = await updateAdminMarketingCredentials(payload);
        setCreds(updated);
        setInitialCreds(updated);
        const freshMeta = await getAdminMetaConfig();
        setMeta(freshMeta);
        setOkMsg("Marketing API credentials saved to database and live server runtime!");
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "Failed to save marketing credentials");
      } finally {
        setSavingCreds(false);
      }
    },
    [creds],
  );

  const generateRandomVerifyToken = useCallback(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
    let token = "tok_";
    for (let i = 0; i < 28; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreds((prev) => ({ ...prev, metaWebhookVerifyToken: token }));
    setOkMsg("Generated random webhook verify token. Click 'Save Credentials' to apply.");
  }, []);

  const reloadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const s = await getAdminMarketingSyncLogs({
        limit: 60,
        platformKey: logPlatformFilter !== "all" ? logPlatformFilter : undefined,
        status: logStatusFilter !== "all" ? logStatusFilter : undefined,
      });
      setLogs(s);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to reload logs");
    } finally {
      setLogsLoading(false);
    }
  }, [logPlatformFilter, logStatusFilter]);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken || user?.role !== "super_admin") {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, accessToken, user, load]);

  const handleCopy = async (key: string, text?: string | null) => {
    if (!text) return;
    const success = await copyText(text);
    if (success) {
      setCopiedKey(key);
      setOkMsg(`Copied ${key}`);
      setTimeout(() => setCopiedKey(null), 2500);
    } else {
      setFeedback("Failed to copy to clipboard");
    }
  };

  const filteredPlatforms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return platforms.filter((p) => {
      if (statusFilter === "active" && !p.enabled) return false;
      if (statusFilter === "disabled" && p.enabled) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [platforms, query, statusFilter]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logPlatformFilter !== "all" && log.platformKey !== logPlatformFilter) return false;
      if (logStatusFilter !== "all" && log.status !== logStatusFilter) return false;
      return true;
    });
  }, [logs, logPlatformFilter, logStatusFilter]);

  async function togglePlatform(row: MarketingPlatformAdmin) {
    setSavingId(row.id);
    setFeedback(null);
    const nextState = !row.enabled;
    // Optimistic UI update
    setPlatforms((prev) =>
      prev.map((p) => (p.id === row.id ? { ...p, enabled: nextState } : p)),
    );
    try {
      const updated = await updateAdminMarketingPlatform(row.id, {
        enabled: nextState,
      });
      setPlatforms((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
      setOkMsg(`${row.name} ${nextState ? "enabled" : "disabled"}`);
    } catch (err) {
      // Revert on error
      setPlatforms((prev) =>
        prev.map((p) => (p.id === row.id ? { ...p, enabled: row.enabled } : p)),
      );
      setFeedback(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function addPlatform() {
    setAdding(true);
    setFeedback(null);
    try {
      const created = await createAdminMarketingPlatform({
        key: draft.key.trim().toLowerCase(),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        enabled: true,
      });
      setPlatforms((prev) =>
        [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setDraft({ key: "", name: "", description: "" });
      setShowAdd(false);
      setOkMsg(`Platform "${created.name}" created successfully`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Create failed");
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSavingId(editing.id);
    try {
      const updated = await updateAdminMarketingPlatform(editing.id, {
        name: editDraft.name.trim(),
        description: editDraft.description.trim() || null,
      });
      setPlatforms((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
      setEditing(null);
      setOkMsg(`Updated "${updated.name}"`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function removePlatform(row: MarketingPlatformAdmin) {
    if (!window.confirm(`Delete custom platform "${row.name}"?`)) return;
    setSavingId(row.id);
    setFeedback(null);
    try {
      await deleteAdminMarketingPlatform(row.id);
      setPlatforms((prev) => prev.filter((p) => p.id !== row.id));
      setOkMsg("Platform deleted");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  const enabledCount = platforms.filter((p) => p.enabled).length;

  return (
    <>
      {/* Hero Banner */}
      <div className="mkt-admin-hero reveal in">
        <div>
          <div className="mkt-admin-hero-eyebrow">
            <i /> Lead Ingestion Engine
          </div>
          <h1>Marketing Platforms</h1>
          <div className="sub">
            Configure the 4 core ad platforms (Meta, Instagram, WhatsApp, and Google Ads),
            manage OAuth credentials, and inspect real-time webhook telemetry.
          </div>
        </div>

        {/* 4-Platform Orbital Showcase */}
        <div className="mkt-admin-hero-art" aria-hidden>
          <div className="mkt-admin-hero-hub" title="Marketing Hub">
            <Icon name="server" size={22} />
          </div>
          <div className="mkt-admin-hero-orbit">
            {REQUIRED_PLATFORM_KEYS.map((k) => (
              <span key={k} className="mkt-admin-hero-plat" title={k}>
                <PlatformBrandIcon platformKey={k} size={28} />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="mkt-admin-kpi-grid reveal in">
        <div className="mkt-admin-kpi-card">
          <div className="mkt-admin-kpi-icon blue">
            <Icon name="modules" size={20} />
          </div>
          <div className="mkt-admin-kpi-body">
            <span className="mkt-admin-kpi-val">{platforms.length} Channels</span>
            <span className="mkt-admin-kpi-lbl">Core Lead Capture Platforms</span>
          </div>
        </div>

        <div className="mkt-admin-kpi-card">
          <div className="mkt-admin-kpi-icon green">
            <Icon name="check" size={20} />
          </div>
          <div className="mkt-admin-kpi-body">
            <span className="mkt-admin-kpi-val">
              {enabledCount} / {platforms.length} Active
            </span>
            <span className="mkt-admin-kpi-lbl">Enabled for Organisations</span>
          </div>
        </div>

        <div className="mkt-admin-kpi-card">
          <div className="mkt-admin-kpi-icon purple">
            <Icon name="link" size={20} />
          </div>
          <div className="mkt-admin-kpi-body">
            <span className="mkt-admin-kpi-val">
              {meta?.configured ? "Meta Connected" : "Action Needed"}
            </span>
            <span className="mkt-admin-kpi-lbl">Facebook / Instagram / WhatsApp</span>
          </div>
        </div>

        <div className="mkt-admin-kpi-card">
          <div className="mkt-admin-kpi-icon amber">
            <Icon name="activity" size={20} />
          </div>
          <div className="mkt-admin-kpi-body">
            <span className="mkt-admin-kpi-val">{logs.length} Events</span>
            <span className="mkt-admin-kpi-lbl">Recent Telemetry & Sync Logs</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mkt-admin-tabs-wrap reveal in">
        <div className="mkt-admin-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`mkt-admin-tab${tab === t.id ? " on" : ""}`}
              onClick={() => {
                setTab(t.id);
                setFeedback(null);
                setOkMsg(null);
              }}
            >
              <Icon name={t.icon === "modules" ? "modules" : t.icon === "link" ? "link" : t.icon === "sync" ? "refresh" : "key"} size={15} />
              {t.label}
              {t.id === "platforms" && (
                <span className="mkt-admin-tab-chip">{platforms.length}</span>
              )}
              {t.id === "logs" && logs.length > 0 && (
                <span className="mkt-admin-tab-chip">{logs.length}</span>
              )}
            </button>
          ))}
        </div>

        <Link
          className="mkt-admin-attribution-link"
          href="/admin-console/attribution"
          title="Configure Lead Center column mapping and UTM labels"
        >
          <Icon name="target" size={14} /> Lead Attribution Settings →
        </Link>
      </div>

      {/* Feedback Banners */}
      {feedback ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#fecdd3", background: "#fff1f2", color: "#991b1b" }}>
          <div className="card-b" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
            <Icon name="alert" size={16} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{feedback}</span>
          </div>
        </div>
      ) : null}
      {okMsg ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" }}>
          <div className="card-b" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
            <Icon name="check" size={16} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{okMsg}</span>
          </div>
        </div>
      ) : null}

      {/* TAB 1: PLATFORMS */}
      {tab === "platforms" ? (
        <div className="card reveal in">
          <div className="mkt-admin-table-head">
            <span className="t">
              <Icon name="shield" size={18} /> Supported Marketing Channels
              <span className="badge b-green">{enabledCount} Active</span>
            </span>

            <div className="mkt-admin-tools">
              {/* Filter Pills */}
              <div className="mkt-admin-filter-group">
                <button
                  type="button"
                  className={`mkt-admin-filter-btn${statusFilter === "all" ? " on" : ""}`}
                  onClick={() => setStatusFilter("all")}
                >
                  All ({platforms.length})
                </button>
                <button
                  type="button"
                  className={`mkt-admin-filter-btn${statusFilter === "active" ? " on" : ""}`}
                  onClick={() => setStatusFilter("active")}
                >
                  Active ({enabledCount})
                </button>
                <button
                  type="button"
                  className={`mkt-admin-filter-btn${statusFilter === "disabled" ? " on" : ""}`}
                  onClick={() => setStatusFilter("disabled")}
                >
                  Disabled ({platforms.length - enabledCount})
                </button>
              </div>

              {/* Search */}
              <div className="mkt-admin-search">
                <Icon name="search" size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search platform..."
                />
              </div>

              {/* Layout Switcher */}
              <div className="mkt-admin-filter-group" title="Switch layout">
                <button
                  type="button"
                  className={`mkt-admin-filter-btn${viewMode === "grid" ? " on" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Grid layout"
                  aria-label="Grid layout"
                >
                  <Icon name="modules" size={13} />
                </button>
                <button
                  type="button"
                  className={`mkt-admin-filter-btn${viewMode === "table" ? " on" : ""}`}
                  onClick={() => setViewMode("table")}
                  title="Table layout"
                  aria-label="Table layout"
                >
                  <Icon name="document" size={13} />
                </button>
              </div>

              {/* Optional Add Platform */}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setShowAdd(true);
                  setOkMsg(null);
                }}
              >
                <Icon name="plus" size={14} /> Add Custom
              </button>
            </div>
          </div>

          {/* View Content */}
          {viewMode === "grid" ? (
            <div className="card-b" style={{ padding: 20 }}>
              {loading ? (
                <div className="mkt-admin-empty-state">
                  <div className="spinner" />
                  <span>Loading marketing platforms…</span>
                </div>
              ) : filteredPlatforms.length === 0 ? (
                <div className="mkt-admin-empty-state">
                  <Icon name="search" size={28} />
                  <p style={{ margin: 0 }}>No platforms found matching your search.</p>
                </div>
              ) : (
                <div className="mkt-admin-integrations-grid">
                  {filteredPlatforms.map((p) => {
                    const metaInfo = PLATFORM_DETAILS[p.key];
                    const isEnabled = p.enabled;
                    return (
                      <div
                        key={p.id}
                        className={`mkt-admin-int-card ${isEnabled ? "active" : "disabled"}`}
                      >
                        {/* Top: Brand info + Status Toggle */}
                        <div className="mkt-admin-int-top">
                          <div className="mkt-admin-int-identity">
                            <div className="mkt-admin-plat-icon-wrap">
                              <PlatformBrandIcon platformKey={p.key} size={26} />
                            </div>
                            <div className="mkt-admin-int-titles">
                              <div className="mkt-admin-int-name-row">
                                <h4 className="mkt-admin-int-name">{p.name}</h4>
                                <span className={`mkt-admin-status ${isEnabled ? "active" : "disabled"}`}>
                                  <i /> {isEnabled ? "Active" : "Disabled"}
                                </span>
                              </div>
                              <div className="mkt-admin-plat-meta">
                                <span className="mkt-admin-key">{p.key}</span>
                                <span className="mkt-admin-protocol">
                                  {metaInfo?.protocol || "REST / Webhook"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mkt-admin-int-toggle-wrap">
                            <button
                              type="button"
                              className={`switch${isEnabled ? " on" : ""}`}
                              disabled={savingId === p.id}
                              aria-label={isEnabled ? "Disable platform" : "Enable platform"}
                              onClick={() => void togglePlatform(p)}
                              style={{ cursor: savingId === p.id ? "wait" : "pointer" }}
                            />
                          </div>
                        </div>

                        {/* Description */}
                        <p className="mkt-admin-int-desc">
                          {p.description || metaInfo?.role || "Lead capture and sync integration channel"}
                        </p>

                        {/* Capabilities */}
                        <div className="mkt-admin-caps">
                          {(metaInfo?.capabilities || ["OAuth 2.0", "Lead Sync"]).map((cap) => (
                            <span key={cap} className="mkt-admin-cap-pill">
                              {cap}
                            </span>
                          ))}
                        </div>

                        {/* Footer & Actions */}
                        <div className="mkt-admin-int-footer">
                          <span className="mkt-admin-int-provider">
                            {p.key === "google_ads"
                              ? "Google Cloud Platform"
                              : REQUIRED_PLATFORM_KEYS.includes(p.key as (typeof REQUIRED_PLATFORM_KEYS)[number])
                              ? "Meta Graph Family"
                              : "Custom Webhook"}
                          </span>

                          <div className="mkt-admin-actions">
                            {metaInfo?.configTab && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setTab(metaInfo.configTab)}
                              >
                                <Icon name="key" size={12} /> Credentials
                              </button>
                            )}

                            <button
                              type="button"
                              className="mkt-admin-action-btn"
                              title="Edit display name & description"
                              disabled={savingId === p.id}
                              onClick={() => {
                                setEditing(p);
                                setEditDraft({
                                  name: p.name,
                                  description: p.description ?? "",
                                });
                              }}
                            >
                              <Icon name="edit" size={13} />
                            </button>

                            {!REQUIRED_PLATFORM_KEYS.includes(p.key as (typeof REQUIRED_PLATFORM_KEYS)[number]) && (
                              <button
                                type="button"
                                className="mkt-admin-action-btn danger"
                                title="Delete custom platform"
                                disabled={savingId === p.id}
                                onClick={() => void removePlatform(p)}
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Table View */
            <div className="card-b" style={{ padding: 0 }}>
              <div className="tbl-wrap">
                <table className="mkt-admin-tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>#</th>
                      <th style={{ minWidth: 220 }}>Platform</th>
                      <th>Capabilities</th>
                      <th style={{ minWidth: 260 }}>Integration Role</th>
                      <th style={{ width: 120 }}>Status</th>
                      <th style={{ width: 160, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlatforms.map((p, idx) => {
                      const metaInfo = PLATFORM_DETAILS[p.key];
                      return (
                        <tr key={p.id}>
                          <td className="muted" style={{ fontSize: 12 }}>
                            {idx + 1}
                          </td>
                          <td>
                            <div className="mkt-admin-plat-cell">
                              <div className="mkt-admin-plat-icon-wrap">
                                <PlatformBrandIcon platformKey={p.key} size={26} />
                              </div>
                              <div className="mkt-admin-plat-info">
                                <span className="mkt-admin-plat-name">{p.name}</span>
                                <div className="mkt-admin-plat-meta">
                                  <span className="mkt-admin-key">{p.key}</span>
                                  <span className="mkt-admin-protocol">
                                    {metaInfo?.protocol || "REST / Webhook"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="mkt-admin-caps">
                              {(metaInfo?.capabilities || ["OAuth 2.0", "Lead Sync"]).map(
                                (cap) => (
                                  <span key={cap} className="mkt-admin-cap-pill">
                                    {cap}
                                  </span>
                                ),
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
                              {p.description || metaInfo?.role || "Lead capture channel"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`switch${p.enabled ? " on" : ""}`}
                              disabled={savingId === p.id}
                              aria-label={p.enabled ? "Disable platform" : "Enable platform"}
                              onClick={() => void togglePlatform(p)}
                              style={{ cursor: savingId === p.id ? "wait" : "pointer" }}
                            />
                          </td>
                          <td>
                            <div className="mkt-admin-actions">
                              {metaInfo?.configTab ? (
                                <button
                                  type="button"
                                  className="mkt-admin-action-btn"
                                  title={`Configure ${p.name}`}
                                  onClick={() => setTab(metaInfo.configTab)}
                                >
                                  <Icon name="settings" size={13} /> Config
                                </button>
                              ) : null}

                              <button
                                type="button"
                                className="mkt-admin-action-btn"
                                title="Edit display name & description"
                                disabled={savingId === p.id}
                                onClick={() => {
                                  setEditing(p);
                                  setEditDraft({
                                    name: p.name,
                                    description: p.description ?? "",
                                  });
                                }}
                              >
                                <Icon name="edit" size={13} />
                              </button>

                              {!REQUIRED_PLATFORM_KEYS.includes(p.key as (typeof REQUIRED_PLATFORM_KEYS)[number]) && (
                                <button
                                  type="button"
                                  className="mkt-admin-action-btn danger"
                                  title="Delete custom platform"
                                  disabled={savingId === p.id}
                                  onClick={() => void removePlatform(p)}
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {loading ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                          Loading platforms…
                        </td>
                      </tr>
                    ) : null}
                    {!loading && filteredPlatforms.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
                          No platforms found matching your search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* TAB 2: META APP & WEBHOOKS */}
      {tab === "meta" ? (
        <div className="card reveal in">
          {/* Status Banner */}
          <div
            className={`mkt-admin-meta-banner ${meta?.configured ? "ready" : "needs-config"}`}
          >
            <div className="mkt-admin-meta-banner-content">
              <PlatformBrandIcon platformKey="meta" size={36} />
              <div className="mkt-admin-meta-banner-text">
                <h3>
                  {meta?.configured
                    ? "Meta Graph App Configured & Operational"
                    : "Meta Credentials Setup Required"}
                </h3>
                <p>
                  Shared Meta App powers Lead Ads capture for Facebook, Instagram,
                  and WhatsApp. Configured directly from the frontend.
                </p>
              </div>
            </div>

            <span className={`mkt-admin-status ${meta?.configured ? "active" : "disabled"}`}>
              <i /> {meta?.configured ? "Verified Active" : "Setup Required (Enter Below)"}
            </span>
          </div>

          <div className="card-b" style={{ paddingTop: 0 }}>
            {/* Meta Credentials Input Form directly in Tab 2 */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: "20px 22px",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Meta Application Credentials
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Enter credentials from your Meta Developers App. Stored in database without .env changes.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={savingCreds}
                  onClick={() => void handleSaveCredentials()}
                >
                  <Icon name={savingCreds ? "refresh" : "check"} size={14} />
                  {savingCreds ? "Saving…" : "Save Meta Credentials"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 16,
                }}
              >
                <div className="mkt-admin-cred-field">
                  <label>
                    Meta App ID
                    <span className="hint">Required for OAuth dialog</span>
                  </label>
                  <input
                    className="inp inp-mono"
                    placeholder="e.g. 109283746592019"
                    value={creds.metaAppId}
                    onChange={(e) =>
                      setCreds((c) => ({ ...c, metaAppId: e.target.value }))
                    }
                  />
                </div>

                <div className="mkt-admin-cred-field">
                  <label>
                    Meta App Secret
                    <span className="hint">Signs webhooks (HMAC SHA256)</span>
                  </label>
                  <div className="mkt-admin-input-group">
                    <input
                      type={showSecretMeta ? "text" : "password"}
                      className="inp inp-mono"
                      placeholder="e.g. 9f8e7d6c5b4a3..."
                      value={creds.metaAppSecret}
                      onChange={(e) =>
                        setCreds((c) => ({ ...c, metaAppSecret: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="mkt-admin-input-btn"
                      onClick={() => setShowSecretMeta((v) => !v)}
                      title={showSecretMeta ? "Hide Secret" : "Show Secret"}
                    >
                      <Icon name={showSecretMeta ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                </div>

                <div className="mkt-admin-cred-field">
                  <label>
                    Webhook Verify Token
                    <span className="hint">Handshake verification</span>
                  </label>
                  <div className="mkt-admin-input-group">
                    <input
                      type={showSecretToken ? "text" : "password"}
                      className="inp inp-mono"
                      placeholder="e.g. tok_sec_random_key"
                      value={creds.metaWebhookVerifyToken}
                      onChange={(e) =>
                        setCreds((c) => ({
                          ...c,
                          metaWebhookVerifyToken: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="mkt-admin-input-btn"
                      onClick={() => setShowSecretToken((v) => !v)}
                      title={showSecretToken ? "Hide Token" : "Show Token"}
                    >
                      <Icon name={showSecretToken ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11.5, padding: "2px 8px", height: "auto" }}
                      onClick={generateRandomVerifyToken}
                    >
                      <Icon name="sparkles" size={12} /> Generate Random Token
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoints Copy Cards */}
            <div className="mkt-admin-meta-cards">
              <div className="mkt-admin-copy-card">
                <label>Webhook Callback URL</label>
                <div className="mkt-admin-copy-field">
                  <input
                    className="inp inp-mono"
                    readOnly
                    value={meta?.webhookCallbackUrl || "—"}
                  />
                  {meta?.webhookCallbackUrl && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void handleCopy("Webhook URL", meta?.webhookCallbackUrl)
                      }
                      title="Copy Webhook URL"
                    >
                      <Icon
                        name={copiedKey === "Webhook URL" ? "check" : "document"}
                        size={14}
                      />
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Paste into Meta App → Webhooks → Page subscription
                </span>
              </div>

              <div className="mkt-admin-copy-card">
                <label>OAuth Redirect URI</label>
                <div className="mkt-admin-copy-field">
                  <input
                    className="inp inp-mono"
                    readOnly
                    value={meta?.oauthRedirectUri || "—"}
                  />
                  {meta?.oauthRedirectUri && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void handleCopy("Redirect URI", meta?.oauthRedirectUri)
                      }
                      title="Copy OAuth Redirect URI"
                    >
                      <Icon
                        name={copiedKey === "Redirect URI" ? "check" : "document"}
                        size={14}
                      />
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Add to Meta App → Facebook Login for Business → Valid OAuth Redirect URIs
                </span>
              </div>

              <div className="mkt-admin-copy-card">
                <label>Active Verify Token</label>
                <div className="mkt-admin-copy-field">
                  <input
                    className="inp inp-mono"
                    readOnly
                    value={creds.metaWebhookVerifyToken || "—"}
                  />
                  {creds.metaWebhookVerifyToken && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void handleCopy("Verify Token", creds.metaWebhookVerifyToken)
                      }
                      title="Copy Verify Token"
                    >
                      <Icon
                        name={copiedKey === "Verify Token" ? "check" : "document"}
                        size={14}
                      />
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Paste as Verify Token when subscribing Page webhook
                </span>
              </div>
            </div>

            {/* Step-by-Step Developer Checklist */}
            <div className="mkt-admin-steps-card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                <Icon name="sparkles" size={18} /> Meta Developer Portal Setup
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>
                Follow these 4 steps in the Meta Developers console to complete the lead ads bridge:
              </p>

              <div className="mkt-admin-steps-grid">
                <div className="mkt-admin-step-box">
                  <span className="mkt-admin-step-num">1</span>
                  <span className="mkt-admin-step-title">Create App</span>
                  <span className="mkt-admin-step-desc">
                    In developers.facebook.com, create a Business App type and configure App ID & Secret.
                  </span>
                </div>

                <div className="mkt-admin-step-box">
                  <span className="mkt-admin-step-num">2</span>
                  <span className="mkt-admin-step-title">Add Products</span>
                  <span className="mkt-admin-step-desc">
                    Add <b>Webhooks</b> and <b>Facebook Login for Business</b> to your application products.
                  </span>
                </div>

                <div className="mkt-admin-step-box">
                  <span className="mkt-admin-step-num">3</span>
                  <span className="mkt-admin-step-title">Permissions</span>
                  <span className="mkt-admin-step-desc">
                    Request <code>leads_retrieval</code>, <code>pages_show_list</code>, and <code>pages_manage_ads</code>.
                  </span>
                </div>

                <div className="mkt-admin-step-box">
                  <span className="mkt-admin-step-num">4</span>
                  <span className="mkt-admin-step-title">Subscribe Webhook</span>
                  <span className="mkt-admin-step-desc">
                    Subscribe the Webhook to <b>Page</b> object and check the <code>leadgen</code> event field.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 3: SYNC LOGS */}
      {tab === "logs" ? (
        <div className="card reveal in">
          <div className="mkt-admin-table-head">
            <span className="t">
              <Icon name="activity" size={18} /> API & Webhook Telemetry
              <span className="badge b-blue">{filteredLogs.length} events</span>
            </span>

            <div className="mkt-admin-tools">
              {/* Platform dropdown filter */}
              <select
                className="inp"
                style={{ padding: "6px 10px", fontSize: 12.5 }}
                value={logPlatformFilter}
                onChange={(e) => setLogPlatformFilter(e.target.value)}
              >
                <option value="all">All Channels</option>
                <option value="meta">Facebook / Meta</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp Ads</option>
                <option value="google_ads">Google Ads</option>
              </select>

              {/* Status dropdown filter */}
              <select
                className="inp"
                style={{ padding: "6px 10px", fontSize: 12.5 }}
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void reloadLogs()}
                disabled={logsLoading}
              >
                <Icon name="refresh" size={13} /> {logsLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="card-b" style={{ padding: 0 }}>
            <div className="tbl-wrap">
              <table className="mkt-admin-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Timestamp</th>
                    <th style={{ width: 180 }}>Platform</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th>Message & Ingest Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                        <span title={new Date(log.createdAt).toLocaleString()}>
                          {formatRelativeTime(log.createdAt)}
                        </span>
                      </td>
                      <td>
                        <div className="mkt-admin-plat-cell">
                          <PlatformBrandIcon platformKey={log.platformKey} size={22} />
                          <span className="mkt-admin-key">{log.platformKey}</span>
                        </div>
                      </td>
                      <td>
                        {log.status === "success" ? (
                          <span className="mkt-admin-status active">
                            <i /> success
                          </span>
                        ) : (
                          <span className="mkt-admin-status disabled" style={{ background: "#fef2f2", color: "#dc2626" }}>
                            <i style={{ background: "#dc2626" }} /> failed
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: "#334155" }}>
                        {log.message || "Webhook lead event received and processed"}
                      </td>
                    </tr>
                  ))}

                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                        <Icon name="activity" size={24} style={{ opacity: 0.5, marginBottom: 8 }} />
                        <div>No sync or webhook events found for this filter.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 4: API CREDENTIALS */}
      {tab === "settings" ? (
        <div className="card reveal in">
          <div className="mkt-admin-table-head">
            <span className="t">
              <Icon name="key" size={18} /> Marketing API Credentials &amp; Platform Settings
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Stored securely in database. Updates apply dynamically without requiring .env or server restart.
            </span>
          </div>

          <div className="card-b">
            <div className="mkt-admin-creds-grid">
              {/* Meta Credentials Box */}
              <div className="mkt-admin-cred-box">
                <div className="mkt-admin-cred-head">
                  <div className="mkt-admin-cred-title">
                    <PlatformBrandIcon platformKey="meta" size={26} />
                    <span>Meta Graph Platform</span>
                  </div>
                  {creds.metaAppId && creds.metaAppSecret ? (
                    <span className="badge b-green">Active • Configured</span>
                  ) : (
                    <span className="badge b-amber">Setup Required</span>
                  )}
                </div>

                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Powers OAuth authentication, Lead Ads webhook subscriptions, and cryptographic signature verification across <b>Facebook, Instagram, and WhatsApp</b>.
                </p>

                <div className="mkt-admin-cred-form">
                  <div className="mkt-admin-cred-field">
                    <label>
                      Meta App ID
                      <span className="hint">From Meta Developer Console</span>
                    </label>
                    <input
                      className="inp inp-mono"
                      placeholder="e.g. 109283746592019"
                      value={creds.metaAppId}
                      onChange={(e) =>
                        setCreds((c) => ({ ...c, metaAppId: e.target.value }))
                      }
                    />
                  </div>

                  <div className="mkt-admin-cred-field">
                    <label>
                      Meta App Secret
                      <span className="hint">Used for webhook signature check</span>
                    </label>
                    <div className="mkt-admin-input-group">
                      <input
                        type={showSecretMeta ? "text" : "password"}
                        className="inp inp-mono"
                        placeholder="e.g. 9f8e7d6c5b4a3..."
                        value={creds.metaAppSecret}
                        onChange={(e) =>
                          setCreds((c) => ({ ...c, metaAppSecret: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="mkt-admin-input-btn"
                        onClick={() => setShowSecretMeta((v) => !v)}
                        title={showSecretMeta ? "Hide Secret" : "Show Secret"}
                      >
                        <Icon name={showSecretMeta ? "eye-off" : "eye"} size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mkt-admin-cred-field">
                    <label>
                      Webhook Verify Token
                      <span className="hint">Secret handshake verification token</span>
                    </label>
                    <div className="mkt-admin-input-group">
                      <input
                        type={showSecretToken ? "text" : "password"}
                        className="inp inp-mono"
                        placeholder="e.g. tok_sec_random_string"
                        value={creds.metaWebhookVerifyToken}
                        onChange={(e) =>
                          setCreds((c) => ({
                            ...c,
                            metaWebhookVerifyToken: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="mkt-admin-input-btn"
                        onClick={() => setShowSecretToken((v) => !v)}
                        title={showSecretToken ? "Hide Token" : "Show Token"}
                      >
                        <Icon name={showSecretToken ? "eye-off" : "eye"} size={14} />
                      </button>
                    </div>
                    <div style={{ paddingTop: 2 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11.5, padding: "2px 8px", height: "auto" }}
                        onClick={generateRandomVerifyToken}
                      >
                        <Icon name="sparkles" size={12} /> Generate Random Token
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "auto", paddingTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setTab("meta")}
                  >
                    View Webhook &amp; Callback URLs →
                  </button>
                </div>
              </div>

              {/* Google Ads Credentials Box */}
              <div className="mkt-admin-cred-box">
                <div className="mkt-admin-cred-head">
                  <div className="mkt-admin-cred-title">
                    <PlatformBrandIcon platformKey="google_ads" size={26} />
                    <span>Google OAuth (Sign-In &amp; Google Ads)</span>
                  </div>
                  {(creds.googleClientId || creds.googleAdsClientId) && (creds.googleClientSecret || creds.googleAdsClientSecret) ? (
                    <span className="badge b-green">Active • Configured</span>
                  ) : (
                    <span className="badge b-amber">Setup Required</span>
                  )}
                </div>

                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Google Cloud OAuth 2.0 client credentials enabling organisation admins to sign up &amp; log in with Google, plus Google Ads attribution. Managed directly here — no .env required.
                </p>

                <div className="mkt-admin-cred-form">
                  <div className="mkt-admin-cred-field">
                    <label>
                      Google Client ID
                      <span className="hint">From Google Cloud Console</span>
                    </label>
                    <input
                      className="inp inp-mono"
                      placeholder="e.g. 123456789-xxx.apps.googleusercontent.com"
                      value={creds.googleClientId || creds.googleAdsClientId || ""}
                      onChange={(e) =>
                        setCreds((c) => ({
                          ...c,
                          googleClientId: e.target.value,
                          googleAdsClientId: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="mkt-admin-cred-field">
                    <label>
                      Google Client Secret
                      <span className="hint">OAuth 2.0 Client Secret</span>
                    </label>
                    <div className="mkt-admin-input-group">
                      <input
                        type={showSecretGoogle ? "text" : "password"}
                        className="inp inp-mono"
                        placeholder="e.g. GOCSPX-..."
                        value={creds.googleClientSecret || creds.googleAdsClientSecret || ""}
                        onChange={(e) =>
                          setCreds((c) => ({
                            ...c,
                            googleClientSecret: e.target.value,
                            googleAdsClientSecret: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="mkt-admin-input-btn"
                        onClick={() => setShowSecretGoogle((v) => !v)}
                        title={showSecretGoogle ? "Hide Secret" : "Show Secret"}
                      >
                        <Icon name={showSecretGoogle ? "eye-off" : "eye"} size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mkt-admin-cred-field">
                    <label>
                      Developer Token <span className="hint">(Optional)</span>
                      <span className="hint">For Google Ads API spend/metrics</span>
                    </label>
                    <input
                      className="inp inp-mono"
                      placeholder="e.g. AbC123XyZ..."
                      value={creds.googleAdsDeveloperToken}
                      onChange={(e) =>
                        setCreds((c) => ({
                          ...c,
                          googleAdsDeveloperToken: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div style={{ marginTop: 6, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 12, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontWeight: 600, color: "#334155", marginBottom: 4 }}>Authorized Redirect URI:</div>
                    <code style={{ fontSize: 11.5, wordBreak: "break-all", color: "#2563eb" }}>
                      {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/auth/google/callback
                    </code>
                  </div>
                </div>

                <div style={{ marginTop: "auto", paddingTop: 12 }}>
                  <Link
                    href="/admin-console/attribution"
                    className="btn btn-secondary btn-sm"
                  >
                    <Icon name="target" size={13} /> GCLID &amp; UTM Tracking Rules →
                  </Link>
                </div>
              </div>
            </div>

            {/* Save Action Bar */}
            <div className="mkt-admin-save-bar">
              <div className="mkt-admin-save-bar-info">
                <Icon name="shield" size={18} />
                <span>
                  <b>Frontend-Driven Configuration:</b> All credentials are saved directly to the database and synced to the runtime engine in real time.
                </span>
              </div>

              <div className="mkt-admin-save-bar-actions">
                {initialCreds && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={savingCreds}
                    onClick={() => {
                      setCreds(initialCreds);
                      setOkMsg("Reset form to saved credentials");
                    }}
                  >
                    Reset Changes
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingCreds}
                  onClick={() => void handleSaveCredentials()}
                >
                  <Icon name={savingCreds ? "refresh" : "check"} size={15} />
                  {savingCreds ? "Saving Credentials…" : "Save API Credentials"}
                </button>
              </div>
            </div>

            {/* Architecture Explainer */}
            <div style={{ marginTop: 20, padding: "16px 20px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                Multi-Tenant Connection Model
              </div>
              <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                Super Admin sets platform-level credentials for Meta and Google Cloud right here from the frontend. Each organisation
                subsequently connects its specific Facebook Page, Instagram Professional account, or Google Ads account
                under <b>Marketing → Connected Apps</b>. Ingested form submissions are automatically attributed
                and displayed in their CRM Lead Center.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Platform Modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? "Platform"}`}
        description="Update display name and description for this marketing platform."
        size="md"
        footer={
          <ModalActions>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(savingId) || !editDraft.name.trim()}
              onClick={() => void saveEdit()}
            >
              {savingId === editing?.id ? "Saving…" : "Save Changes"}
            </button>
          </ModalActions>
        }
      >
        {editing ? (
          <div className="mkt-admin-modal-body">
            <div className="field">
              <label>Platform Key</label>
              <input className="inp inp-mono" readOnly value={editing.key} />
              <span className="muted" style={{ fontSize: 11.5 }}>
                Unique system key (immutable)
              </span>
            </div>

            <div className="field">
              <label>Display Name</label>
              <input
                className="inp"
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Platform display name"
              />
            </div>

            <div className="field">
              <label>Description</label>
              <textarea
                className="inp"
                rows={3}
                value={editDraft.description}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, description: e.target.value }))
                }
                placeholder="Short description of this platform integration"
              />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Add Custom Platform Modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Custom Marketing Platform"
        description="Register a new lead attribution platform key in the system."
        size="md"
        footer={
          <ModalActions>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={adding || !draft.key.trim() || !draft.name.trim()}
              onClick={() => void addPlatform()}
            >
              {adding ? "Saving…" : "Add Platform"}
            </button>
          </ModalActions>
        }
      >
        <div className="mkt-admin-modal-body">
          <div className="field">
            <label>Platform Key</label>
            <input
              className="inp inp-mono"
              placeholder="e.g. youtube_ads"
              value={draft.key}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                }))
              }
            />
            <span className="muted" style={{ fontSize: 11.5 }}>
              Lowercase identifier (letters, numbers, underscore)
            </span>
          </div>

          <div className="field">
            <label>Display Name</label>
            <input
              className="inp"
              placeholder="e.g. YouTube Ads"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              className="inp"
              rows={3}
              placeholder="Description of the ad placement or lead generation flow"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
