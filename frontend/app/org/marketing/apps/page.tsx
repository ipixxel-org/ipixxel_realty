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
  syncMarketingPlatform,
} from "@/lib/api";
import type { MarketingAppsOverview, MarketingPlatformCard } from "@/lib/types";
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
      "Connect your Facebook Page so Lead Ad form submissions flow into Lead Center in realtime, with campaign and UTM attribution.",
    primaryLabel: "Connect with Facebook",
    secondaryLabel: "Connect with Page Token",
    secondaryHref: "/org/marketing/apps/meta?token=1",
    features: [
      { icon: "sync", label: "Lead Ads Capture", tip: "Realtime + Sync import" },
      { icon: "target", label: "Campaign Names", tip: "Ad / ad set / campaign" },
      { icon: "bolt", label: "Webhook Sync", tip: "New leads instantly" },
      { icon: "link", label: "UTM Attribution", tip: "First & last touch" },
    ],
    steps: [
      {
        title: "Platform Setup by Administrator",
        body: "Meta App and Webhooks are configured globally by the Super Administrator in Admin Console.",
      },
      {
        title: "Connect Facebook Page",
        body: "Click Connect with Facebook. Authorize the Facebook Pages you want to capture leads from.",
      },
      {
        title: "Assign Projects",
        body: "Map your connected pages and forms to CRM projects for lead assignment.",
      },
      {
        title: "Realtime Lead Streaming",
        body: "Form submissions stream immediately into Lead Center with campaign and UTM attribution.",
      },
    ],
    guideHref: "/org/marketing/apps/meta",
    setupHint:
      "Meta integration has not been enabled by your platform administrator yet. Please contact your Super Administrator to configure Meta platform credentials.",
  },
  instagram: {
    blurb:
      "Instagram connects through the same Meta Page login as Facebook. Lead ads are labelled Instagram when Meta reports the placement; Lead Ads Testing Tool leads show as Facebook.",
    primaryLabel: "Connect with Instagram (Meta)",
    secondaryLabel: "Open details",
    secondaryHref: "/org/marketing/apps/instagram",
    features: [
      { icon: "sync", label: "Shared Meta Connect", tip: "Same Page OAuth" },
      { icon: "target", label: "Lead Ads Path", tip: "Via Facebook Page" },
      { icon: "bolt", label: "Realtime Capture", tip: "When forms fire" },
      { icon: "link", label: "Attribution today", tip: "Shows as Instagram" },
    ],
    steps: [
      {
        title: "Platform Setup by Administrator",
        body: "Meta credentials configured globally by Super Administrator in Admin Console.",
      },
      {
        title: "Connect Facebook Page",
        body: "Instagram Lead Ads flow via the linked Facebook Page OAuth connection.",
      },
      {
        title: "Link Instagram Account",
        body: "Ensure your Instagram business account is connected to your Facebook Page.",
      },
      {
        title: "Capture & Attribution",
        body: "Leads captured via Instagram ad placements appear with Instagram attribution in Lead Center.",
      },
    ],
    guideHref: "/org/marketing/apps/instagram",
    setupHint:
      "Meta integration has not been enabled by your platform administrator yet. Please contact your Super Administrator to configure Meta platform credentials.",
  },
  whatsapp: {
    blurb:
      "WhatsApp connects through the same Meta Page login. This stores the connection for Ads attribution readiness — dedicated WhatsApp lead ingest is not live yet.",
    primaryLabel: "Connect via Meta",
    secondaryLabel: "Open details",
    secondaryHref: "/org/marketing/apps/whatsapp",
    features: [
      { icon: "sync", label: "Meta Connection", tip: "Shared Page token" },
      { icon: "target", label: "Ads Ready", tip: "Connection scaffolding" },
      { icon: "bolt", label: "Not messaging", tip: "No inbox in this module" },
      { icon: "link", label: "Lead ingest", tip: "Coming in a later phase" },
    ],
    steps: [
      {
        title: "Platform Setup by Administrator",
        body: "Meta platform credentials configured globally in Admin Console.",
      },
      {
        title: "Connect Page",
        body: "WhatsApp Ads connection rides on the connected Facebook Page.",
      },
      {
        title: "Enable WhatsApp Business",
        body: "Confirm WhatsApp is linked to your Meta Business account for Click-to-WhatsApp Ads.",
      },
      {
        title: "Attribution Ready",
        body: "Status is stored for WhatsApp advertising attribution.",
      },
    ],
    guideHref: "/org/marketing/apps/whatsapp",
    setupHint:
      "Meta integration has not been enabled by your platform administrator yet. Please contact your Super Administrator to configure Meta platform credentials.",
  },
  google_ads: {
    blurb:
      "Connect Google Ads to store your account securely. Lead forms and campaign spend sync are not live yet — connection prepares the next phase.",
    primaryLabel: "Connect with Google",
    secondaryLabel: "Connect with access token",
    secondaryHref: "/org/marketing/apps/google_ads?token=1",
    features: [
      { icon: "sync", label: "OAuth Connect", tip: "Account linked" },
      { icon: "target", label: "Metrics Sync", tip: "Coming later" },
      { icon: "bolt", label: "Lead Forms", tip: "Coming later" },
      { icon: "link", label: "Website gclid", tip: "Captured on web forms" },
    ],
    steps: [
      {
        title: "Platform Setup by Administrator",
        body: "Google OAuth credentials configured globally by Super Administrator in Admin Console.",
      },
      {
        title: "Authorize Account",
        body: "Click Connect with Google and approve access for your Google Ads account.",
      },
      {
        title: "Account Linked",
        body: "Account connection is stored securely in Lead Center.",
      },
      {
        title: "Attribution Ready",
        body: "Prepares campaign tracking and click ID (GCLID) attribution.",
      },
    ],
    guideHref: "/org/marketing/apps/google_ads",
    setupHint:
      "Google Ads OAuth has not been enabled by your platform administrator yet. Please contact your Super Administrator to configure Google credentials.",
  },
  google_sheets: {
    blurb:
      "Automatically stream and sync all incoming Lead Center leads directly into a Google Sheet in your organization's Google Drive.",
    primaryLabel: "Connect Google Sheets & Drive",
    secondaryLabel: "Open Google Sheet settings",
    secondaryHref: "/org/marketing/apps/google_sheets",
    features: [
      { icon: "bolt", label: "Realtime Sync", tip: "Appends leads instantly" },
      { icon: "sync", label: "Google Drive OAuth", tip: "Per-org authorization" },
      { icon: "target", label: "Custom Sheets", tip: "Create new or link existing" },
      { icon: "link", label: "One-Click Export", tip: "Backfill all CRM leads" },
    ],
    steps: [
      {
        title: "Connect Google Account",
        body: "Authorize Google Sheets & Google Drive for your organization via OAuth.",
      },
      {
        title: "Auto-Created in Drive",
        body: "A spreadsheet is automatically created in your Google Drive with formatted lead columns.",
      },
      {
        title: "Realtime Lead Streaming",
        body: "Every new lead captured from landing pages, Facebook, Instagram, WhatsApp, or manual CRM entry appends as a new row.",
      },
      {
        title: "Backfill Anytime",
        body: "Click 'Sync All Leads to Sheet' at any time to export all historical CRM leads into the spreadsheet.",
      },
    ],
    guideHref: "/org/marketing/apps/google_sheets",
    setupHint:
      "Google OAuth has not been configured by your platform administrator yet. Please contact your Super Administrator to configure Google Cloud OAuth credentials.",
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

export default function OrgMarketingAppsPage() {
  const { user } = useAuth();
  const isSuperAdmin =
    user?.role === "super_admin" || Boolean(user?.platformUnrestricted);

  const [data, setData] = useState<MarketingAppsOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    getMarketingAppsOverview()
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load apps"),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      window.location.href = `/org/marketing/apps/${p.key}`;
    } finally {
      setBusyKey(null);
    }
  }

  async function sync(p: MarketingPlatformCard) {
    setSyncKey(p.key);
    setError("");
    try {
      const result = await syncMarketingPlatform(p.key);
      if (!result.ok && result.failed > 0) {
        setError(
          `Sync finished with ${result.failed} error(s). Check Integration Logs.`,
        );
      }
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncKey(null);
    }
  }

  return (
    <>
      <div className="page-head mkt-hub-head">
        <div>
          <div className="eyebrow">
            <Icon name="integrations" size={14} /> Marketing
          </div>
          <h1>Connected Apps</h1>
          <div className="sub">
            Connect ad platforms and spreadsheets to capture leads into Lead Center.
            Facebook, Instagram, WhatsApp, Google Ads, and Google Sheets manage their own dedicated accounts and attribution.
          </div>
        </div>
        <div className="actions">
          {isSuperAdmin && (
            <Link
              className="btn btn-secondary"
              href="/admin-console/marketing?tab=settings"
            >
              <Icon name="key" size={14} /> Configure App Credentials
            </Link>
          )}
          <Link className="btn btn-ghost" href="/org/marketing/apps/logs">
            <Icon name="document" size={14} /> View Integration Logs
          </Link>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ color: "#b91c1c", marginBottom: 14 }}>
          <div className="card-b">{error}</div>
        </div>
      ) : null}

      <Reveal delay={1}>
        <div className="mkt-hub-hero">
          <div className="mkt-hub-orbit" aria-hidden>
            <span className="mkt-hub-orbit-ring" />
            <span className="mkt-hub-orbit-ring r2" />
            <div className="mkt-hub-orbit-core">
              <Icon name="integrations" size={22} />
            </div>
            {HERO_KEYS.map((key, i) => (
              <div
                key={key}
                className={`mkt-hub-orbit-node n${i + 1}`}
                title={key}
              >
                <PlatformBrandIcon platformKey={key} size={36} />
              </div>
            ))}
          </div>
          <div className="mkt-hub-hero-card">
            <div className="mkt-hub-hero-card-top">
              <span className="mkt-hub-hero-badge">Integration Hub</span>
              <div className="mkt-hub-mini-chart" aria-hidden>
                <i style={{ height: "38%" }} />
                <i style={{ height: "62%" }} />
                <i style={{ height: "48%" }} />
                <i style={{ height: "78%" }} />
                <i style={{ height: "55%" }} />
              </div>
            </div>
            <h2>Connected Apps for Lead Capture</h2>
            <p>
              Connect your marketing channels to stream leads into CRM with clean attribution.
              Each platform operates independently with dedicated account connections.
            </p>
            <div className="mkt-hub-hero-stats">
              <div>
                <b>{loading ? "…" : data?.kpis.connectedApps ?? 0}</b>
                <span>Connected</span>
              </div>
              <div>
                <b>{loading ? "…" : data?.kpis.totalLeads ?? 0}</b>
                <span>Leads</span>
              </div>
              <div>
                <b>
                  {loading
                    ? "…"
                    : `₹${Math.round(data?.kpis.spend ?? 0).toLocaleString("en-IN")}`}
                </b>
                <span>Spend</span>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="mkt-hub-list">
        {ordered.map((p, i) => {
            const copy = PLATFORM_COPY[p.key];
            if (!copy) return null;
            const connected = p.status === "connected";
            const configured = Boolean(p.configured);
            return (
              <Reveal key={p.key} delay={Math.min(i + 2, 6)}>
                <article className="card mkt-hub-card">
                  <div className="mkt-hub-card-main">
                    <div className="mkt-hub-card-top">
                      <div className="mkt-hub-card-brand">
                        <PlatformBrandIcon platformKey={p.key} size={48} />
                        <div>
                          <div className="mkt-hub-card-name-row">
                            <h3>{p.name}</h3>
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
                        <Link href={copy.guideHref}>View Documentation</Link>
                        <Link href="/org/marketing/apps/logs">Need Help?</Link>
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
                            className="btn btn-ghost"
                            href={`/org/marketing/apps/${p.key}`}
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
                            className="btn btn-ghost"
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
                      View Step by Step Guide →
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

