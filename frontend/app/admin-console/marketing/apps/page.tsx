"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { PlatformBrandIcon } from "@/components/org/platform-brand-icon";
import {
  getMarketingAppsOverview,
  getMarketingConnectUrl,
  getMarketingDashboard,
  syncMarketingPlatform,
} from "@/lib/api";
import type { MarketingAppsOverview, MarketingDashboard, MarketingPlatformCard } from "@/lib/types";
import "@/app/org/org.css";

const HERO_KEYS = ["meta", "instagram", "google_sheets", "google_ads", "whatsapp"] as const;

const PLATFORM_COPY: Record<
  string,
  {
    blurb: string;
    primaryLabel: string;
    secondaryLabel: string;
    secondaryHref?: string;
    features: Array<{ icon: "sync" | "target" | "bolt" | "link"; label: string; tip: string }>;
    steps: Array<{ title: string; body: string }>;
    guideHref: string;
    setupHint: string;
  }
> = {
  meta: {
    blurb:
      "Connect official Super Admin Facebook Pages so Lead Ad submissions stream directly into Super Admin Lead Management in real time, with UTM and campaign attribution.",
    primaryLabel: "Connect with Facebook",
    secondaryLabel: "Connect with Page Token",
    secondaryHref: "/admin-console/marketing/apps/meta?token=1",
    features: [
      { icon: "sync", label: "Lead Ads Capture", tip: "Realtime + Webhook import" },
      { icon: "target", label: "Campaign Attribution", tip: "Ad / ad set / campaign tags" },
      { icon: "bolt", label: "Instant Delivery", tip: "Flows to Super Admin Leads" },
      { icon: "link", label: "UTM Tracking", tip: "First & last touch tracked" },
    ],
    steps: [
      {
        title: "Platform API Credentials",
        body: "Meta App ID and Secret configured in Admin Console > Marketing > API Credentials.",
      },
      {
        title: "Connect Facebook Page",
        body: "Click Connect with Facebook or provide a Page Access Token to authorize pages.",
      },
      {
        title: "Instant Webhook Subscription",
        body: "Page is automatically subscribed to real-time Leadgen webhooks.",
      },
      {
        title: "Direct Ingest to Super Admin Leads",
        body: "All leads from this page appear immediately in Super Admin Lead Management.",
      },
    ],
    guideHref: "/admin-console/marketing/apps/meta",
    setupHint:
      "Meta app credentials not configured yet. Configure Meta App ID & Secret in Admin Console > Marketing > API Credentials.",
  },
  instagram: {
    blurb:
      "Instagram connects through your Meta Page login. Lead ads are labelled Instagram when Meta reports the placement; leads stream directly to Super Admin Leads.",
    primaryLabel: "Connect via Meta",
    secondaryLabel: "Open details",
    secondaryHref: "/admin-console/marketing/apps/instagram",
    features: [
      { icon: "sync", label: "Shared Meta Connect", tip: "Same Page OAuth" },
      { icon: "target", label: "Lead Ads Path", tip: "Via Facebook Page" },
      { icon: "bolt", label: "Realtime Capture", tip: "Instant lead creation" },
      { icon: "link", label: "Instagram Attribution", tip: "Source tagged automatically" },
    ],
    steps: [
      {
        title: "Meta Platform Credentials",
        body: "Meta credentials configured in Admin Console > Marketing.",
      },
      {
        title: "Connect Facebook Page",
        body: "Instagram Lead Ads flow via the linked Facebook Page OAuth connection.",
      },
      {
        title: "Link Instagram Business Account",
        body: "Ensure your Instagram professional account is connected to your Facebook Page.",
      },
      {
        title: "Direct Ingest to Super Admin Leads",
        body: "Leads captured via Instagram ad placements appear in Super Admin Lead Management.",
      },
    ],
    guideHref: "/admin-console/marketing/apps/instagram",
    setupHint:
      "Meta platform credentials not configured yet. Configure Meta App ID & Secret in Admin Console > Marketing.",
  },
  whatsapp: {
    blurb:
      "WhatsApp connects through your Meta business assets for Ads attribution and lead routing directly into Super Admin Leads.",
    primaryLabel: "Connect via Meta",
    secondaryLabel: "Open details",
    secondaryHref: "/admin-console/marketing/apps/whatsapp",
    features: [
      { icon: "sync", label: "Meta Connection", tip: "Shared Page token" },
      { icon: "target", label: "Click-to-WhatsApp", tip: "Ads attribution ready" },
      { icon: "bolt", label: "Direct Routing", tip: "Leads go to Super Admin" },
      { icon: "link", label: "Activity Logging", tip: "Full event tracking" },
    ],
    steps: [
      {
        title: "Meta Platform Credentials",
        body: "Configured in Admin Console > Marketing.",
      },
      {
        title: "Authorize Assets",
        body: "Connect the Facebook Page associated with your WhatsApp business number.",
      },
      {
        title: "Ads Verification",
        body: "Campaigns driving to WhatsApp are attributed to Super Admin lead flow.",
      },
    ],
    guideHref: "/admin-console/marketing/apps/whatsapp",
    setupHint:
      "Meta credentials not configured yet. Configure Meta App ID & Secret in Admin Console > Marketing.",
  },
  google_ads: {
    blurb:
      "Connect your official Google Ads customer accounts to sync campaigns, impressions, clicks, spend, and lead form extensions into Super Admin.",
    primaryLabel: "Connect Google Ads",
    secondaryLabel: "Open details",
    secondaryHref: "/admin-console/marketing/apps/google_ads",
    features: [
      { icon: "sync", label: "Customer Accounts", tip: "OAuth sync" },
      { icon: "target", label: "Campaign Analytics", tip: "Spend, CPL, Clicks" },
      { icon: "bolt", label: "Lead Extensions", tip: "Form assets import" },
      { icon: "link", label: "GCLID Tracking", tip: "Conversion tracking" },
    ],
    steps: [
      {
        title: "Google Cloud OAuth Credentials",
        body: "Google Ads Client ID & Secret configured in Admin Console > Marketing.",
      },
      {
        title: "Authorize Google Account",
        body: "Click Connect Google Ads and grant read access to your ads customer accounts.",
      },
      {
        title: "Continuous Sync",
        body: "Hourly background sync fetches campaign performance and leads.",
      },
    ],
    guideHref: "/admin-console/marketing/apps/google_ads",
    setupHint:
      "Google Ads client credentials not configured. Configure in Admin Console > Marketing > API Credentials.",
  },
  google_sheets: {
    blurb:
      "Connect Google Sheets for Super Admin. Bi-directionally sync leads to your spreadsheets and auto-import submissions via copy-paste Google Apps Script webhooks.",
    primaryLabel: "Connect Google Drive",
    secondaryLabel: "Open details",
    secondaryHref: "/admin-console/marketing/apps/google_sheets",
    features: [
      { icon: "sync", label: "Bi-directional Sync", tip: "Leads auto-export to sheets" },
      { icon: "target", label: "Apps Script Webhook", tip: "Auto-push new sheet rows" },
      { icon: "bolt", label: "Manual Import", tip: "One-click historical sync" },
      { icon: "link", label: "Multi-Account", tip: "Connect multiple Google drives" },
    ],
    steps: [
      {
        title: "Google Drive OAuth",
        body: "Connect your official Google account to create and manage spreadsheets.",
      },
      {
        title: "Choose or Link Spreadsheet",
        body: "Create a new dedicated sheet or link an existing Google Sheet by URL.",
      },
      {
        title: "Install Apps Script Webhook",
        body: "Paste the provided script into your Google Sheet to auto-send new rows to Super Admin Leads.",
      },
    ],
    guideHref: "/admin-console/marketing/apps/google_sheets",
    setupHint:
      "Google client credentials not configured. Configure in Admin Console > Marketing > API Credentials.",
  },
};

function StatusPill({
  connected,
  configured,
  connectionCount = 0,
}: {
  connected: boolean;
  configured: boolean;
  connectionCount?: number;
}) {
  if (connected) {
    return (
      <span className="mkt-hub-status is-on">
        {connectionCount > 1
          ? `${connectionCount} Accounts Active`
          : "Connected"}
      </span>
    );
  }
  if (!configured) {
    return <span className="mkt-hub-status is-warn">Not configured</span>;
  }
  return <span className="mkt-hub-status is-off">Not connected</span>;
}

function FeatureIcon({ name }: { name: "sync" | "target" | "bolt" | "link" }) {
  const map = {
    sync: "integrations" as const,
    target: "target" as const,
    bolt: "sparkles" as const,
    link: "link" as const,
  };
  return <Icon name={map[name]} size={16} />;
}

export default function AdminMarketingAppsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<MarketingAppsOverview | null>(null);
  const [dashboard, setDashboard] = useState<MarketingDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    Promise.all([
      getMarketingAppsOverview(),
      getMarketingDashboard().catch(() => null),
    ])
      .then(([overview, dash]) => {
        setData(overview);
        setDashboard(dash);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load apps"),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  const platforms = data?.platforms ?? [];
  const byKey = new Map(platforms.map((p) => [p.key, p]));
  const ordered: MarketingPlatformCard[] = HERO_KEYS.map((key) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    return {
      key,
      name:
        key === "meta"
          ? "Facebook / Meta"
          : key === "google_ads"
            ? "Google Ads"
            : key === "whatsapp"
              ? "WhatsApp Ads"
              : key === "google_sheets"
                ? "Google Sheets"
                : "Instagram",
      description: PLATFORM_COPY[key]?.blurb ?? null,
      supportsOAuth: true,
      supportsWebhook: key === "meta" || key === "instagram",
      ready: false,
      configured: false,
      connections: [],
      connectionCount: 0,
      lastSyncAt: null,
      status: "disconnected",
    };
  }).filter((p) => byKey.has(p.key) || loading);

  async function connect(p: MarketingPlatformCard) {
    setBusyKey(p.key);
    setError("");
    try {
      const { url } = await getMarketingConnectUrl(p.key);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
      window.location.href = `/admin-console/marketing/apps/${p.key}`;
    } finally {
      setBusyKey(null);
    }
  }

  async function sync(p: MarketingPlatformCard) {
    setSyncKey(p.key);
    setError("");
    try {
      await syncMarketingPlatform(p.key);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncKey(null);
    }
  }

  const totalConnected = platforms.reduce(
    (sum, p) => sum + (p.connectionCount || p.connections?.length || 0),
    0,
  );
  const totalLeads = dashboard?.kpis?.leadsTotal ?? 0;
  const activeChannels = platforms.filter(
    (p) => (p.connectionCount || p.connections?.length || 0) > 0,
  ).length;

  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13, fontWeight: 600 }}>
            <Icon name="integrations" size={14} /> Super Admin · Marketing
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
            Connected Social Media &amp; Ad Channels
          </h1>
          <p className="muted" style={{ fontSize: 13, color: "#64748b", maxWidth: 760, marginTop: 4 }}>
            Connect official Facebook Pages, Instagram, WhatsApp, Google Ads, and Google Sheets directly for the Super Admin platform. All generated leads flow into Super Admin Lead Management with separate attribution from client organisations.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="btn btn-secondary" href="/admin-console/leads" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="target" size={15} /> Super Admin Leads
          </Link>
          <Link className="btn btn-secondary" href="/admin-console/marketing/apps/logs" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="sync" size={15} /> Integration Logs
          </Link>
          <Link className="btn btn-primary" href="/admin-console/marketing" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="key" size={15} /> API Credentials
          </Link>
        </div>
      </div>

      {error ? (
        <div className="form-alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {/* Quick Summary KPIs */}
      <Reveal>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div className="card" style={{ padding: "16px 20px" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Connected Accounts</span>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
              {totalConnected}
            </div>
            <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginTop: 2, display: "block" }}>
              Across {activeChannels} active channel{activeChannels === 1 ? "" : "s"}
            </span>
          </div>

          <div className="card" style={{ padding: "16px 20px" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Captured Social Leads</span>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
              {totalLeads}
            </div>
            <span style={{ fontSize: 12, color: "#64748b", marginTop: 2, display: "block" }}>
              In Super Admin Lead Management
            </span>
          </div>

          <div className="card" style={{ padding: "16px 20px" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Lead Flow Isolation</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#2563eb", marginTop: 8 }}>
              Super Admin Core
            </div>
            <span style={{ fontSize: 12, color: "#64748b", marginTop: 2, display: "block" }}>
              Isolated from client organisations
            </span>
          </div>
        </div>
      </Reveal>

      {/* Main Channels Grid */}
      <div className="mkt-hub-grid">
        {ordered.map((p, index) => {
          const copy = PLATFORM_COPY[p.key] ?? {
            blurb: p.description ?? "Channel integration",
            primaryLabel: "Connect",
            secondaryLabel: "Open details",
            guideHref: `/admin-console/marketing/apps/${p.key}`,
            setupHint: "Platform is available.",
            features: [],
            steps: [],
          };
          const connected =
            p.status === "connected" ||
            p.status === "tracking" ||
            (p.connections && p.connections.length > 0) ||
            Boolean(p.connectionCount && p.connectionCount > 0);
          const configured = p.configured !== false;

          return (
            <Reveal key={p.key} delay={index * 1}>
              <article className="mkt-hub-card">
                <div className="mkt-hub-card-main">
                  <div className="mkt-hub-card-head">
                    <div className="mkt-hub-brand-block">
                      <div className="mkt-hub-logo-wrap">
                        <PlatformBrandIcon platformKey={p.key} size={38} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <h3 className="mkt-hub-title">{p.name}</h3>
                          <StatusPill
                            connected={connected}
                            configured={configured}
                            connectionCount={p.connectionCount || p.connections?.length || 0}
                          />
                        </div>
                        <p className="mkt-hub-card-desc">
                          {p.description || copy.blurb}
                        </p>
                      </div>
                    </div>
                    <div className="mkt-hub-card-links">
                      <Link href={copy.guideHref}>Manage Platform</Link>
                      <Link href="/admin-console/marketing/apps/logs">Integration Logs</Link>
                    </div>
                  </div>

                  <p className="mkt-hub-card-blurb">{copy.blurb}</p>

                  {!configured ? (
                    <div
                      className="mkt-hub-alert"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Icon name="alert" size={16} style={{ color: "#d97706", flexShrink: 0 }} />
                      <span>{copy.setupHint}</span>
                    </div>
                  ) : null}

                  <div className="mkt-hub-actions">
                    {connected ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={syncKey === p.key}
                          onClick={() => void sync(p)}
                        >
                          {syncKey === p.key ? "Syncing…" : "Sync Now"}
                        </button>
                        <Link
                          className="btn btn-secondary"
                          href={`/admin-console/marketing/apps/${p.key}`}
                        >
                          {(p.connectionCount || p.connections?.length || 0) > 1
                            ? `Manage Accounts (${p.connectionCount || p.connections?.length})`
                            : "View Details"}
                        </Link>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyKey === p.key || !configured}
                          onClick={() => void connect(p)}
                        >
                          {busyKey === p.key ? "Connecting…" : copy.primaryLabel}
                        </button>
                        <Link
                          className="btn btn-secondary"
                          href={copy.secondaryHref ?? copy.guideHref}
                        >
                          {copy.secondaryLabel}
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="mkt-hub-features">
                    {copy.features.map((f) => (
                      <div key={f.label} className="mkt-hub-feature">
                        <span className="mkt-hub-feature-ico">
                          <FeatureIcon name={f.icon} />
                        </span>
                        <div>
                          <b>{f.label}</b>
                          <span>{f.tip}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <aside className="mkt-hub-howto">
                  <div className="mkt-hub-howto-title">How to Connect</div>
                  <ol className="mkt-hub-steps">
                    {copy.steps.map((s, idx) => (
                      <li key={s.title}>
                        <span className="mkt-hub-step-num">{idx + 1}</span>
                        <div>
                          <b>{s.title}</b>
                          <p>{s.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <Link className="mkt-hub-guide" href={copy.guideHref}>
                    View Configuration &amp; Accounts →
                  </Link>
                </aside>
              </article>
            </Reveal>
          );
        })}
        {!loading && ordered.length === 0 ? (
          <div className="muted">No marketing platforms available.</div>
        ) : null}
      </div>
    </>
  );
}

