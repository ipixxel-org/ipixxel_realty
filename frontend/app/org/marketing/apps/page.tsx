"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { PlatformBrandIcon } from "@/components/org/platform-brand-icon";
import {
  getMarketingAppsOverview,
  getMarketingConnectUrl,
  getMarketingCredentials,
  syncMarketingPlatform,
  updateMarketingCredentials,
} from "@/lib/api";
import type { MarketingAppsOverview, MarketingPlatformCard } from "@/lib/types";
import { Modal, ModalActions } from "@/components/ui/modal";
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
        title: "Create Meta App",
        body: "Create an app in Meta Developers console with Facebook Login and Webhooks products.",
      },
      {
        title: "Add Required Permissions",
        body: "Lead Ads needs Page list, metadata, engagement, and leads retrieval permissions.",
      },
      {
        title: "Save App Credentials",
        body: "Save your Meta App ID, App Secret, and Verify Token directly using the App Credentials modal.",
      },
      {
        title: "Connect in your dashboard",
        body: "Click Connect with Facebook. Authorised Pages are linked for Lead Ads. Sync Now imports recent form leads into Lead Center.",
      },
    ],
    guideHref: "/org/marketing/apps/meta",
    setupHint:
      "Meta App credentials (App ID & Secret) are required to connect Facebook, Instagram, and WhatsApp. Configure them directly from the frontend.",
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
        title: "Configure Meta App",
        body: "Meta App ID & Secret saved directly from frontend.",
      },
      {
        title: "Connect Facebook Page",
        body: "Instagram Lead Ads require a linked Facebook Page.",
      },
      {
        title: "Link Instagram account",
        body: "Ensure the Page is linked to your Instagram professional account.",
      },
      {
        title: "Connect here",
        body: "Use Connect with Instagram — OAuth reuses the Meta Graph flow. Leads appear as Instagram in Lead Center when Meta reports the placement; Lead Ads Testing Tool leads show as Facebook.",
      },
    ],
    guideHref: "/org/marketing/apps/instagram",
    setupHint:
      "Meta App credentials required before connecting Instagram. Configure them directly from the frontend.",
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
        title: "Meta App ready",
        body: "Use Meta app credentials configured directly from the frontend.",
      },
      {
        title: "Connect Page",
        body: "WhatsApp Ads connection rides on the connected Facebook Page.",
      },
      {
        title: "Enable WhatsApp product",
        body: "Confirm WhatsApp is set up on the Meta Business account when you run WhatsApp Ads.",
      },
      {
        title: "Connect here",
        body: "Click Connect via Meta. Expect connection status only — WhatsApp-labelled CRM leads are not live yet.",
      },
    ],
    guideHref: "/org/marketing/apps/whatsapp",
    setupHint:
      "Meta App credentials required before connecting WhatsApp. Configure them directly from the frontend.",
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
        title: "Create Google Cloud OAuth client",
        body: "Enable Google Ads API and create OAuth 2.0 client credentials.",
      },
      {
        title: "Platform Setup",
        body: "Client ID and Secret saved directly from frontend into database.",
      },
      {
        title: "Authorize account",
        body: "Click Connect with Google and approve Ads access for your account.",
      },
      {
        title: "After connect",
        body: "Connection is stored. Sync Now verifies health; campaign metrics and Google lead forms are not imported yet.",
      },
    ],
    guideHref: "/org/marketing/apps/google_ads",
    setupHint:
      "Google Cloud OAuth credentials required before connecting Google Ads. Configure them directly from the frontend.",
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
      "Google Cloud OAuth credentials (Client ID & Secret) are required. Configure them directly from the frontend.",
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
  const [data, setData] = useState<MarketingAppsOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState<string | null>(null);

  // App Credentials Modal State
  const [showCredsModal, setShowCredsModal] = useState(false);
  const [credsTab, setCredsTab] = useState<"meta" | "google">("meta");
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsFeedback, setCredsFeedback] = useState("");
  const [credsSuccess, setCredsSuccess] = useState("");
  const [showSecretMeta, setShowSecretMeta] = useState(false);
  const [showSecretToken, setShowSecretToken] = useState(false);
  const [showSecretGoogle, setShowSecretGoogle] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [creds, setCreds] = useState({
    metaAppId: "",
    metaAppSecret: "",
    metaWebhookVerifyToken: "",
    googleAdsClientId: "",
    googleAdsClientSecret: "",
    googleAdsDeveloperToken: "",
  });

  const openCredsModal = useCallback(async (tab: "meta" | "google" = "meta") => {
    setCredsTab(tab);
    setShowCredsModal(true);
    setCredsFeedback("");
    setCredsSuccess("");
    try {
      const c = await getMarketingCredentials();
      if (c) {
        setCreds({
          metaAppId: c.metaAppId ?? "",
          metaAppSecret: c.metaAppSecret ?? "",
          metaWebhookVerifyToken: c.metaWebhookVerifyToken ?? "",
          googleAdsClientId: c.googleAdsClientId ?? "",
          googleAdsClientSecret: c.googleAdsClientSecret ?? "",
          googleAdsDeveloperToken: c.googleAdsDeveloperToken ?? "",
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSaveCreds = async () => {
    setSavingCreds(true);
    setCredsFeedback("");
    setCredsSuccess("");
    try {
      await updateMarketingCredentials({
        metaAppId: creds.metaAppId.trim(),
        metaAppSecret: creds.metaAppSecret.trim(),
        metaWebhookVerifyToken: creds.metaWebhookVerifyToken.trim(),
        googleAdsClientId: creds.googleAdsClientId.trim(),
        googleAdsClientSecret: creds.googleAdsClientSecret.trim(),
        googleAdsDeveloperToken: creds.googleAdsDeveloperToken.trim(),
      });
      setCredsSuccess("Credentials saved directly to database without .env!");
      reload();
      setTimeout(() => {
        setShowCredsModal(false);
        setCredsSuccess("");
      }, 1200);
    } catch (err) {
      setCredsFeedback(
        err instanceof Error ? err.message : "Failed to save credentials",
      );
    } finally {
      setSavingCreds(false);
    }
  };

  const generateRandomToken = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
    let token = "tok_";
    for (let i = 0; i < 28; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreds((prev) => ({ ...prev, metaWebhookVerifyToken: token }));
  };

  const handleCopy = async (label: string, text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(label);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

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
            Connect ad platforms so Facebook Lead Ads flow into Lead Center.
            Instagram and WhatsApp share Meta login; Google Ads connect is ready
            with metrics sync still upcoming.
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void openCredsModal()}
          >
            <Icon name="key" size={14} /> Configure App Credentials
          </button>
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
              Facebook Lead Ads are live into CRM with attribution. Instagram and
              WhatsApp connect via the same Meta login; Google Ads stores the
              account for the next metrics phase.
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
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        <span>{copy.setupHint}</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            void openCredsModal(
                              p.key === "google_ads" ? "google" : "meta",
                            )
                          }
                        >
                          <Icon name="key" size={12} /> Configure Credentials
                        </button>
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
                          {!configured ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() =>
                                void openCredsModal(
                                  p.key === "google_ads" ? "google" : "meta",
                                )
                              }
                            >
                              <Icon name="key" size={13} /> Configure Credentials
                            </button>
                          ) : null}
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

      {/* App Credentials Modal */}
      <Modal
        open={showCredsModal}
        onClose={() => setShowCredsModal(false)}
        title="Configure Marketing Platform Credentials"
        description="Save Meta (Facebook, Instagram, WhatsApp) and Google Cloud credentials directly to database without .env changes."
        size="lg"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tab selector */}
          <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #e2e8f0", paddingBottom: 10 }}>
            <button
              type="button"
              className={`btn btn-sm ${credsTab === "meta" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCredsTab("meta")}
            >
              <PlatformBrandIcon platformKey="meta" size={16} /> Meta (Facebook, Insta, WhatsApp)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${credsTab === "google" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCredsTab("google")}
            >
              <PlatformBrandIcon platformKey="google_ads" size={16} /> Google Ads
            </button>
          </div>

          {credsSuccess ? (
            <div className="badge b-green" style={{ padding: "8px 12px", width: "100%", borderRadius: 8 }}>
              {credsSuccess}
            </div>
          ) : null}
          {credsFeedback ? (
            <div className="badge b-amber" style={{ padding: "8px 12px", width: "100%", borderRadius: 8, color: "#b91c1c" }}>
              {credsFeedback}
            </div>
          ) : null}

          {credsTab === "meta" ? (
            <>
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Meta App ID</label>
                <input
                  className="inp inp-mono"
                  placeholder="e.g. 109283746592019"
                  value={creds.metaAppId}
                  onChange={(e) =>
                    setCreds((c) => ({ ...c, metaAppId: e.target.value }))
                  }
                />
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Meta App Secret</label>
                <div style={{ display: "flex", gap: 6 }}>
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
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowSecretMeta((v) => !v)}
                  >
                    <Icon name={showSecretMeta ? "eye-off" : "eye"} size={14} />
                  </button>
                </div>
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Webhook Verify Token</label>
                <div style={{ display: "flex", gap: 6 }}>
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
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowSecretToken((v) => !v)}
                  >
                    <Icon name={showSecretToken ? "eye-off" : "eye"} size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={generateRandomToken}
                    title="Generate Random Token"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>
                  Developer Portal Setup URLs
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 3 }}>
                    Webhook Callback URL (Meta App → Webhooks → Page)
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="inp inp-mono"
                      readOnly
                      style={{ fontSize: 12, height: 32, background: "#fff" }}
                      value={typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : ""}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void handleCopy(
                          "webhook",
                          typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : "",
                        )
                      }
                    >
                      <Icon name={copiedKey === "webhook" ? "check" : "document"} size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 3 }}>
                    OAuth Redirect URI (Meta App → Facebook Login for Business)
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="inp inp-mono"
                      readOnly
                      style={{ fontSize: 12, height: 32, background: "#fff" }}
                      value={typeof window !== "undefined" ? `${window.location.origin}/api/org/meta/oauth/callback` : ""}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void handleCopy(
                          "redirect",
                          typeof window !== "undefined" ? `${window.location.origin}/api/org/meta/oauth/callback` : "",
                        )
                      }
                    >
                      <Icon name={copiedKey === "redirect" ? "check" : "document"} size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Google Ads Client ID</label>
                <input
                  className="inp inp-mono"
                  placeholder="e.g. 123456789-xxx.apps.googleusercontent.com"
                  value={creds.googleAdsClientId}
                  onChange={(e) =>
                    setCreds((c) => ({
                      ...c,
                      googleAdsClientId: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Google Ads Client Secret</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type={showSecretGoogle ? "text" : "password"}
                    className="inp inp-mono"
                    placeholder="e.g. GOCSPX-..."
                    value={creds.googleAdsClientSecret}
                    onChange={(e) =>
                      setCreds((c) => ({
                        ...c,
                        googleAdsClientSecret: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowSecretGoogle((v) => !v)}
                  >
                    <Icon name={showSecretGoogle ? "eye-off" : "eye"} size={14} />
                  </button>
                </div>
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>
                  Developer Token <span className="hint">(Optional)</span>
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

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>
                  Google Cloud Console Authorized Redirect URI
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="inp inp-mono"
                    readOnly
                    style={{ fontSize: 12, height: 32, background: "#fff" }}
                    value={typeof window !== "undefined" ? `${window.location.origin}/api/org/marketing/oauth/google/callback` : ""}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      void handleCopy(
                        "google_redirect",
                        typeof window !== "undefined" ? `${window.location.origin}/api/org/marketing/oauth/google/callback` : "",
                      )
                    }
                  >
                    <Icon name={copiedKey === "google_redirect" ? "check" : "document"} size={13} />
                  </button>
                </div>
              </div>
            </>
          )}

          <ModalActions>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={savingCreds}
              onClick={() => setShowCredsModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={savingCreds}
              onClick={() => void handleSaveCreds()}
            >
              <Icon name={savingCreds ? "refresh" : "check"} size={13} />
              {savingCreds ? "Saving…" : "Save Credentials"}
            </button>
          </ModalActions>
        </div>
      </Modal>
    </>
  );
}
