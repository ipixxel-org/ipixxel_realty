"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import {
  apiFetch,
  connectMarketingCredentials,
  connectMetaWithToken,
  createOrgGoogleSheet,
  disconnectMarketingConnection,
  getMarketingConnectUrl,
  getMarketingCredentials,
  getMarketingPlatform,
  linkOrgGoogleSheet,
  syncAllOrgGoogleSheetsLeads,
  syncMarketingConnection,
  syncMarketingPlatform,
  updateAdminMarketingCredentials,
  updateMarketingConnection,
  updateMarketingCredentials,
  updateOrgGoogleSheetSettings,
} from "@/lib/api";
import type { MarketingCredentials, MarketingPlatformCard, MetaPublicConfig, Project } from "@/lib/types";
import { Modal, ModalActions } from "@/components/ui/modal";
import { MetaLeadAdsCard } from "@/components/org/meta-lead-ads-card";
import { PlatformBrandIcon } from "@/components/org/platform-brand-icon";
import "@/app/org/org.css";

type ProjectsListResponse = { data: Project[] };

function PlatformDetailInner() {
  const { platform: routeKey } = useParams<{ platform: string }>();
  const key = Array.isArray(routeKey) ? routeKey[0] : routeKey;
  const search = useSearchParams();
  const [detail, setDetail] = useState<
    (MarketingPlatformCard & {
      metaConfig?: MetaPublicConfig | null;
      oauthConfigured?: boolean;
      webhookUrl?: string | null;
    }) | null
  >(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({
    pageId: "",
    pageName: "",
    accessToken: "",
    projectId: "",
  });
  const [cred, setCred] = useState({
    externalAccountId: "",
    externalAccountName: "",
    accessToken: "",
    refreshToken: "",
    projectId: "",
  });
  const [showManual, setShowManual] = useState(false);
  const [showCred, setShowCred] = useState(false);
  const [showAppCreds, setShowAppCreds] = useState(false);
  const [savingAppCreds, setSavingAppCreds] = useState(false);
  const [appCredsFeedback, setAppCredsFeedback] = useState("");
  const [appCredsSuccess, setAppCredsSuccess] = useState("");
  const [showSecret1, setShowSecret1] = useState(false);
  const [showSecret2, setShowSecret2] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);
  const [showCredToken, setShowCredToken] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);
  const [showLinkSheetModal, setShowLinkSheetModal] = useState(false);
  const [linkSheetInput, setLinkSheetInput] = useState("");
  const [showNewSheetModal, setShowNewSheetModal] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("");
  const [syncingAllLeads, setSyncingAllLeads] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [appCreds, setAppCreds] = useState({
    metaAppId: "",
    metaAppSecret: "",
    metaWebhookVerifyToken: "",
    googleAdsClientId: "",
    googleAdsClientSecret: "",
    googleAdsDeveloperToken: "",
  });

  const openAppCredsModal = useCallback(async () => {
    setShowAppCreds(true);
    setAppCredsFeedback("");
    setAppCredsSuccess("");
    try {
      const c = await getMarketingCredentials();
      if (c) {
        setAppCreds({
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

  const saveAppCreds = async () => {
    setSavingAppCreds(true);
    setAppCredsFeedback("");
    setAppCredsSuccess("");
    try {
      await updateMarketingCredentials({
        metaAppId: appCreds.metaAppId.trim(),
        metaAppSecret: appCreds.metaAppSecret.trim(),
        metaWebhookVerifyToken: appCreds.metaWebhookVerifyToken.trim(),
        googleAdsClientId: appCreds.googleAdsClientId.trim(),
        googleAdsClientSecret: appCreds.googleAdsClientSecret.trim(),
        googleAdsDeveloperToken: appCreds.googleAdsDeveloperToken.trim(),
      });
      setAppCredsSuccess("Credentials saved to database! OAuth is now active.");
      await load();
      setTimeout(() => {
        setShowAppCreds(false);
        setAppCredsSuccess("");
      }, 1200);
    } catch (err) {
      setAppCredsFeedback(
        err instanceof Error ? err.message : "Failed to save credentials",
      );
    } finally {
      setSavingAppCreds(false);
    }
  };

  const generateRandomToken = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
    let token = "tok_";
    for (let i = 0; i < 28; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAppCreds((prev) => ({ ...prev, metaWebhookVerifyToken: token }));
  };

  const handleCopy = async (label: string, text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(label);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const [d, proj] = await Promise.all([
        getMarketingPlatform(key),
        apiFetch<ProjectsListResponse>("/org/projects?page=1&limit=100").catch(
          () => ({ data: [] as Project[] }),
        ),
      ]);
      setDetail(d);
      setProjects(proj.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform");
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (search.get("meta") === "connected" || search.get("connected") === "1") {
      if (key === "google_sheets") {
        setMessage(
          "Google Sheets & Drive connected! All incoming Lead Center leads will automatically stream into your Google Sheet.",
        );
      } else if (key === "google_ads") {
        setMessage(
          "Google Ads connected. Account is stored; campaign metrics and lead forms are not synced yet.",
        );
      } else if (key === "whatsapp") {
        setMessage(
          "WhatsApp connected via Meta. Connection is ready; dedicated WhatsApp lead ingest is not live yet.",
        );
      } else if (key === "instagram") {
        setMessage(
          "Instagram connected via Meta. Lead ads are labelled Instagram in Lead Center when Meta reports the placement; Lead Ads Testing Tool leads show as Facebook. Use Sync Now to import recent form leads.",
        );
      } else {
        setMessage(
          "Platform connected. New Facebook Lead Ads will appear in Lead Center automatically. Use Sync Now to import recent form leads.",
        );
      }
      void load();
    }
    if (
      search.get("connected") === "0" ||
      search.get("meta") === "error"
    ) {
      setError(search.get("message") || "Connection failed");
    }
    if (search.get("token") === "1") {
      if (key === "meta" || key === "instagram" || key === "whatsapp") {
        setShowManual(true);
      }
      if (key === "google_ads") {
        setShowCred(true);
      }
    }
  }, [search, load, key]);

  const isMetaFamily =
    key === "meta" || key === "instagram" || key === "whatsapp";
  const isGoogleAds = key === "google_ads";
  const isGoogleSheets = key === "google_sheets";

  async function connectOAuth() {
    if (!key) return;
    setBusy(true);
    setError("");
    try {
      const { url } = await getMarketingConnectUrl(key);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
      setBusy(false);
      setShowCred(true);
    }
  }

  async function runSync(connectionId?: string) {
    if (!key) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (connectionId) {
        const result = await syncMarketingConnection(connectionId);
        setMessage(
          result.message ||
            (isMetaFamily
              ? "Lead subscription refreshed and recent form leads imported when available."
              : isGoogleAds
                ? "Connection verified. Campaign metrics are not synced yet."
                : "Sync complete"),
        );
      } else {
        const result = await syncMarketingPlatform(key);
        if (!result.ok) {
          setMessage(`Sync finished with ${result.failed} error(s)`);
        } else if (isMetaFamily) {
          const detailMsg = result.results?.find((r) => r.message)?.message;
          setMessage(
            detailMsg ||
              `Synced ${result.synced} connection(s). Recent Lead Ad form submissions were imported into Lead Center.`,
          );
        } else if (isGoogleAds) {
          setMessage(
            `Verified ${result.synced} connection(s). Google Ads metrics and lead forms are not synced yet.`,
          );
        } else {
          setMessage(`Synced ${result.synced} connection(s)`);
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveMetaManual() {
    setBusy(true);
    setError("");
    try {
      const connected = await connectMetaWithToken({
        pageId: manual.pageId.trim(),
        pageName: manual.pageName.trim() || manual.pageId.trim(),
        accessToken: manual.accessToken.trim(),
        projectId: manual.projectId || null,
      });
      setShowManual(false);
      const count =
        typeof connected.imported === "number" ? connected.imported : 0;
      setMessage(
        count > 0
          ? `Page connected. Imported ${count} recent lead(s) into Lead Center.`
          : "Page connected with access token. Use Sync Now if you expect existing form leads.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Token connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCredentials() {
    if (!key) return;
    setBusy(true);
    setError("");
    try {
      await connectMarketingCredentials(key, {
        externalAccountId: cred.externalAccountId.trim(),
        externalAccountName:
          cred.externalAccountName.trim() || cred.externalAccountId.trim(),
        accessToken: cred.accessToken.trim(),
        refreshToken: cred.refreshToken.trim() || undefined,
        projectId: cred.projectId || null,
      });
      setShowCred(false);
      setMessage("Account connected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  const handleCreateSheet = async () => {
    setSheetBusy(true);
    setError("");
    try {
      await createOrgGoogleSheet(newSheetTitle.trim() || undefined);
      setShowNewSheetModal(false);
      setNewSheetTitle("");
      setMessage("New Google Sheet created in your Google Drive! Auto-sync is active.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Google Sheet");
    } finally {
      setSheetBusy(false);
    }
  };

  const handleLinkSheet = async () => {
    if (!linkSheetInput.trim()) return;
    setSheetBusy(true);
    setError("");
    try {
      await linkOrgGoogleSheet(linkSheetInput.trim());
      setShowLinkSheetModal(false);
      setLinkSheetInput("");
      setMessage("Google Sheet linked successfully! Auto-sync is active.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link Google Sheet");
    } finally {
      setSheetBusy(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAllLeads(true);
    setError("");
    setMessage("");
    try {
      const res = await syncAllOrgGoogleSheetsLeads();
      setMessage(res.message || `Successfully synced ${res.synced} lead(s) to Google Sheet!`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync all leads failed");
    } finally {
      setSyncingAllLeads(false);
    }
  };

  const handleToggleAutoSync = async (current: boolean) => {
    setSheetBusy(true);
    try {
      await updateOrgGoogleSheetSettings({ autoSync: !current });
      setMessage(!current ? "Auto-sync enabled. New leads will stream to sheet." : "Auto-sync paused.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update auto-sync setting");
    } finally {
      setSheetBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Icon name="integrations" size={14} /> Connected Apps
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {key ? <PlatformBrandIcon platformKey={key} size={36} /> : null}
            {detail?.name ?? key}
          </h1>
          <div className="sub">{detail?.description}</div>
        </div>
        <div className="actions">
          {(detail?.connections.length ?? 0) > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void runSync()}
            >
              {busy ? "Syncing…" : "Sync Now"}
            </button>
          ) : null}
          <Link className="btn btn-ghost" href="/org/marketing/apps">
            <Icon name="chevron-left" size={14} /> All apps
          </Link>
        </div>
      </div>

      {message ? (
        <div className="badge b-green" style={{ marginBottom: 12 }}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div>
      ) : null}

      <Reveal delay={1}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <span className="t">Connection</span>
            <span className="x">
              {detail?.status === "connected" ? (
                <span className="badge b-green">Connected</span>
              ) : (
                <span className="badge b-gray">Not connected</span>
              )}
            </span>
          </div>
          <div className="card-b">
            {isMetaFamily ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {key === "whatsapp"
                    ? "Connect via Meta Page OAuth to store this connection. Dedicated WhatsApp lead ingest is not live yet — Facebook Lead Ads remain the production capture path."
                    : key === "instagram"
                      ? "Connect via Meta Page OAuth (same as Facebook). Lead ads are labelled Instagram in Lead Center when Meta reports the placement; Lead Ads Testing Tool leads show as Facebook. Sync Now imports recent form leads."
                      : "Connect a Facebook Page so Lead Ad form submissions flow into Lead Center in realtime. Sync Now re-subscribes the Page and imports recent form leads so you can see them in Lead Center."}
                </p>
                {detail?.metaConfig && !detail.metaConfig.configured ? (
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: 10,
                      padding: "12px 16px",
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon name="alert" size={18} style={{ color: "#d97706" }} />
                      <span style={{ fontSize: 13, color: "#92400e", fontWeight: 500 }}>
                        Meta App credentials (App ID &amp; Secret) required for Facebook, Instagram, and WhatsApp. Configure them directly from the frontend.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void openAppCredsModal()}
                    >
                      <Icon name="key" size={13} /> Configure App Credentials
                    </button>
                  </div>
                ) : detail?.metaConfig?.configured ? (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 10,
                      padding: "8px 14px",
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                      fontSize: 12.5,
                      color: "#166534",
                    }}
                  >
                    <span>
                      <Icon name="check" size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                      Meta App configured (ID: <code>{detail.metaConfig.appId}</code>)
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ height: 26, fontSize: 11.5 }}
                      onClick={() => void openAppCredsModal()}
                    >
                      <Icon name="settings" size={12} /> Edit App Credentials
                    </button>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || !detail?.metaConfig?.configured}
                    onClick={() => void connectOAuth()}
                  >
                    {key === "instagram"
                      ? "Connect with Instagram (Meta)"
                      : key === "whatsapp"
                        ? "Connect via Meta"
                        : "Connect with Facebook"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void openAppCredsModal()}
                  >
                    <Icon name="key" size={13} /> App Credentials
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowManual((v) => !v)}
                  >
                    {showManual ? "Hide token form" : "Connect with Page token"}
                  </button>
                </div>
                {showManual ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="field">
                      <label>Page ID</label>
                      <input
                        className="inp"
                        value={manual.pageId}
                        onChange={(e) =>
                          setManual((m) => ({ ...m, pageId: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Page name</label>
                      <input
                        className="inp"
                        value={manual.pageName}
                        onChange={(e) =>
                          setManual((m) => ({ ...m, pageName: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Page access token</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          className="inp inp-mono"
                          type={showManualToken ? "text" : "password"}
                          placeholder="EAA..."
                          value={manual.accessToken}
                          onChange={(e) =>
                            setManual((m) => ({
                              ...m,
                              accessToken: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowManualToken((v) => !v)}
                          title={showManualToken ? "Hide token" : "Show token"}
                        >
                          <Icon name={showManualToken ? "eye-off" : "eye"} size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label>Default project (optional)</label>
                      <select
                        className="inp"
                        value={manual.projectId}
                        onChange={(e) =>
                          setManual((m) => ({
                            ...m,
                            projectId: e.target.value,
                          }))
                        }
                      >
                        <option value="">No project mapping</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={
                        busy ||
                        !manual.pageId.trim() ||
                        !manual.accessToken.trim()
                      }
                      onClick={() => void saveMetaManual()}
                    >
                      Save
                    </button>
                  </div>
                ) : null}
              </>
            ) : isGoogleAds ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Connect Google Ads via OAuth when Super Admin has configured
                  credentials, or paste a customer ID and access token below.
                  Connection is stored today; campaign metrics and Google lead
                  forms are not synced yet.
                </p>
                {!detail?.oauthConfigured && !detail?.configured ? (
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: 10,
                      padding: "12px 16px",
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon name="alert" size={18} style={{ color: "#d97706" }} />
                      <span style={{ fontSize: 13, color: "#92400e", fontWeight: 500 }}>
                        Google Cloud OAuth credentials required for Google Ads OAuth. Configure them directly from the frontend.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void openAppCredsModal()}
                    >
                      <Icon name="key" size={13} /> Configure App Credentials
                    </button>
                  </div>
                ) : detail?.oauthConfigured ? (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 10,
                      padding: "8px 14px",
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                      fontSize: 12.5,
                      color: "#166534",
                    }}
                  >
                    <span>
                      <Icon name="check" size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                      Google Ads OAuth credentials active
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ height: 26, fontSize: 11.5 }}
                      onClick={() => void openAppCredsModal()}
                    >
                      <Icon name="settings" size={12} /> Edit App Credentials
                    </button>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || !detail?.oauthConfigured}
                    onClick={() => void connectOAuth()}
                  >
                    Connect with Google
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void openAppCredsModal()}
                  >
                    <Icon name="key" size={13} /> App Credentials
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowCred((v) => !v)}
                  >
                    {showCred ? "Hide token form" : "Connect with access token"}
                  </button>
                </div>
              </>
            ) : isGoogleSheets ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Connect Google Sheets &amp; Google Drive to automatically stream all incoming Lead Center leads
                  into your spreadsheet in real time, or link any existing Google Sheet from your Drive.
                </p>
                {!detail?.oauthConfigured && !detail?.configured ? (
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: 10,
                      padding: "12px 16px",
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon name="alert" size={18} style={{ color: "#d97706" }} />
                      <span style={{ fontSize: 13, color: "#92400e", fontWeight: 500 }}>
                        Google Cloud OAuth Client ID &amp; Secret are required for Google Drive &amp; Sheets auth. Configure them directly from the frontend.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void openAppCredsModal()}
                    >
                      <Icon name="key" size={13} /> Configure App Credentials
                    </button>
                  </div>
                ) : null}

                {(detail?.connections.length ?? 0) === 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => void connectOAuth()}
                    >
                      <Icon name="link" size={13} /> Connect with Google (Sheets &amp; Drive)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void openAppCredsModal()}
                    >
                      <Icon name="key" size={13} /> App Credentials
                    </button>
                  </div>
                ) : (
                  <div>
                    {detail!.connections.map((c) => {
                      const meta = (c.metadata as any) ?? {};
                      const autoSync = meta.autoSync !== false;
                      const sheetUrl =
                        meta.spreadsheetUrl ||
                        (meta.spreadsheetId
                          ? `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`
                          : null);

                      return (
                        <div
                          key={c.id}
                          style={{
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            borderRadius: 12,
                            padding: "16px 18px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 10,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: "#166534",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <Icon name="check" size={16} />
                                Google Drive Connected
                                {meta.googleEmail ? (
                                  <span
                                    style={{
                                      fontWeight: 400,
                                      color: "#15803d",
                                      fontSize: 13,
                                    }}
                                  >
                                    ({meta.googleEmail})
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className="muted"
                                style={{ fontSize: 12.5, marginTop: 2 }}
                              >
                                Sheet Tab: <b>{meta.sheetName || "Leads"}</b>{" "}
                                &bull; Realtime Sync:{" "}
                                <span
                                  style={{
                                    color: autoSync ? "#15803d" : "#64748b",
                                    fontWeight: 600,
                                  }}
                                >
                                  {autoSync ? "Active" : "Paused"}
                                </span>
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              {sheetUrl ? (
                                <a
                                  href={sheetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-primary btn-sm"
                                  style={{ textDecoration: "none" }}
                                >
                                  <Icon name="link" size={13} /> Open in Google
                                  Sheets ↗
                                </a>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={syncingAllLeads || sheetBusy}
                                onClick={() => void handleSyncAll()}
                              >
                                <Icon
                                  name="refresh"
                                  size={13}
                                />
                                {syncingAllLeads
                                  ? "Syncing…"
                                  : "Sync All Leads to Sheet"}
                              </button>
                            </div>
                          </div>

                          <div
                            style={{
                              borderTop: "1px solid #dcfce7",
                              paddingTop: 10,
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={sheetBusy}
                              onClick={() => void handleToggleAutoSync(autoSync)}
                            >
                              <Icon
                                name={autoSync ? "alert" : "check"}
                                size={13}
                              />
                              {autoSync
                                ? "Pause Realtime Auto-Sync"
                                : "Enable Realtime Auto-Sync"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setShowNewSheetModal(true)}
                            >
                              <Icon name="modules" size={13} /> Create New Sheet
                              in Drive
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setShowLinkSheetModal(true)}
                            >
                              <Icon name="link" size={13} /> Link Another Sheet
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: "#b91c1c" }}
                              onClick={() =>
                                void disconnectMarketingConnection(c.id).then(
                                  () => load(),
                                )
                              }
                            >
                              <Icon name="trash" size={13} /> Disconnect
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                This platform is not available.
              </p>
            )}

            {showCred && isGoogleAds ? (
              <div style={{ marginTop: 14 }}>
                <div className="field">
                  <label>Account / Customer ID</label>
                  <input
                    className="inp"
                    value={cred.externalAccountId}
                    onChange={(e) =>
                      setCred((c) => ({
                        ...c,
                        externalAccountId: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Account name</label>
                  <input
                    className="inp"
                    value={cred.externalAccountName}
                    onChange={(e) =>
                      setCred((c) => ({
                        ...c,
                        externalAccountName: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Access token</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="inp inp-mono"
                      type={showCredToken ? "text" : "password"}
                      value={cred.accessToken}
                      onChange={(e) =>
                        setCred((c) => ({ ...c, accessToken: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowCredToken((v) => !v)}
                      title={showCredToken ? "Hide token" : "Show token"}
                    >
                      <Icon name={showCredToken ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Refresh token (optional)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="inp inp-mono"
                      type={showRefreshToken ? "text" : "password"}
                      value={cred.refreshToken}
                      onChange={(e) =>
                        setCred((c) => ({ ...c, refreshToken: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowRefreshToken((v) => !v)}
                      title={showRefreshToken ? "Hide token" : "Show token"}
                    >
                      <Icon name={showRefreshToken ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Default project</label>
                  <select
                    className="inp"
                    value={cred.projectId}
                    onChange={(e) =>
                      setCred((c) => ({ ...c, projectId: e.target.value }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={
                    busy ||
                    !cred.externalAccountId.trim() ||
                    !cred.accessToken.trim()
                  }
                  onClick={() => void saveCredentials()}
                >
                  Save connection
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </Reveal>

      {(detail?.connections.length ?? 0) > 0 ? (
        <Reveal delay={2}>
          <div className="card">
            <div className="card-h">
              <span className="t">Accounts</span>
            </div>
            <div className="card-b" style={{ padding: 0 }}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Default project</th>
                      <th>Last sync</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail!.connections.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <b>{c.externalAccountName}</b>
                          <div className="muted mono" style={{ fontSize: 12 }}>
                            {c.externalAccountId}
                          </div>
                        </td>
                        <td>
                          <select
                            className="inp"
                            value={c.projectId ?? ""}
                            onChange={(e) =>
                              void updateMarketingConnection(c.id, {
                                projectId: e.target.value || null,
                              }).then(() => load())
                            }
                          >
                            <option value="">Unassigned</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted">
                          {c.lastSyncAt
                            ? new Date(c.lastSyncAt).toLocaleString()
                            : "—"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => void runSync(c.id)}
                            >
                              Sync
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                void disconnectMarketingConnection(c.id).then(
                                  () => load(),
                                )
                              }
                            >
                              Disconnect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Reveal>
      ) : null}

      {isMetaFamily ? (
        <div style={{ marginTop: 18 }}>
          <MetaLeadAdsCard />
        </div>
      ) : null}

      {/* App Credentials Modal */}
      <Modal
        open={showAppCreds}
        onClose={() => setShowAppCreds(false)}
        title={
          isGoogleAds || isGoogleSheets
            ? "Configure Google Cloud OAuth Credentials"
            : "Configure Meta Platform Credentials"
        }
        description={
          isGoogleAds || isGoogleSheets
            ? "Enter your Google Cloud Console OAuth 2.0 Client credentials. Stored securely in database without .env changes."
            : "Enter credentials from developers.facebook.com for Facebook, Instagram, and WhatsApp. Stored securely in database without .env changes."
        }
        size="lg"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {appCredsSuccess ? (
            <div className="badge b-green" style={{ padding: "8px 12px", width: "100%", borderRadius: 8 }}>
              {appCredsSuccess}
            </div>
          ) : null}
          {appCredsFeedback ? (
            <div className="badge b-amber" style={{ padding: "8px 12px", width: "100%", borderRadius: 8, color: "#b91c1c" }}>
              {appCredsFeedback}
            </div>
          ) : null}

          {isMetaFamily ? (
            <>
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Meta App ID</label>
                <input
                  className="inp inp-mono"
                  placeholder="e.g. 109283746592019"
                  value={appCreds.metaAppId}
                  onChange={(e) =>
                    setAppCreds((c) => ({ ...c, metaAppId: e.target.value }))
                  }
                />
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Meta App Secret</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type={showSecret1 ? "text" : "password"}
                    className="inp inp-mono"
                    placeholder="e.g. 9f8e7d6c5b4a3..."
                    value={appCreds.metaAppSecret}
                    onChange={(e) =>
                      setAppCreds((c) => ({ ...c, metaAppSecret: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowSecret1((v) => !v)}
                  >
                    <Icon name={showSecret1 ? "eye-off" : "eye"} size={14} />
                  </button>
                </div>
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Webhook Verify Token</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type={showSecret2 ? "text" : "password"}
                    className="inp inp-mono"
                    placeholder="e.g. tok_sec_random_string"
                    value={appCreds.metaWebhookVerifyToken}
                    onChange={(e) =>
                      setAppCreds((c) => ({
                        ...c,
                        metaWebhookVerifyToken: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowSecret2((v) => !v)}
                  >
                    <Icon name={showSecret2 ? "eye-off" : "eye"} size={14} />
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

              {/* Useful Developer URLs */}
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
                      value={detail?.metaConfig?.webhookCallbackUrl || (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : "")}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void handleCopy(
                          "webhook",
                          detail?.metaConfig?.webhookCallbackUrl || (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : ""),
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
                      value={detail?.metaConfig?.oauthRedirectUri || (typeof window !== "undefined" ? `${window.location.origin}/api/org/meta/oauth/callback` : "")}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void handleCopy(
                          "redirect",
                          detail?.metaConfig?.oauthRedirectUri || (typeof window !== "undefined" ? `${window.location.origin}/api/org/meta/oauth/callback` : ""),
                        )
                      }
                    >
                      <Icon name={copiedKey === "redirect" ? "check" : "document"} size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : isGoogleAds || isGoogleSheets ? (
            <>
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Google Cloud OAuth Client ID</label>
                <input
                  className="inp inp-mono"
                  placeholder="e.g. 123456789-xxx.apps.googleusercontent.com"
                  value={appCreds.googleAdsClientId}
                  onChange={(e) =>
                    setAppCreds((c) => ({
                      ...c,
                      googleAdsClientId: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Google Cloud OAuth Client Secret</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type={showSecret1 ? "text" : "password"}
                    className="inp inp-mono"
                    placeholder="e.g. GOCSPX-..."
                    value={appCreds.googleAdsClientSecret}
                    onChange={(e) =>
                      setAppCreds((c) => ({
                        ...c,
                        googleAdsClientSecret: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowSecret1((v) => !v)}
                  >
                    <Icon name={showSecret1 ? "eye-off" : "eye"} size={14} />
                  </button>
                </div>
              </div>

              {isGoogleAds ? (
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    Developer Token <span className="hint">(Optional)</span>
                  </label>
                  <input
                    className="inp inp-mono"
                    placeholder="e.g. AbC123XyZ..."
                    value={appCreds.googleAdsDeveloperToken}
                    onChange={(e) =>
                      setAppCreds((c) => ({
                        ...c,
                        googleAdsDeveloperToken: e.target.value,
                      }))
                    }
                  />
                </div>
              ) : null}

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
          ) : null}

          <ModalActions>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={savingAppCreds}
              onClick={() => setShowAppCreds(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={savingAppCreds}
              onClick={() => void saveAppCreds()}
            >
              <Icon name={savingAppCreds ? "refresh" : "check"} size={13} />
              {savingAppCreds ? "Saving…" : "Save Credentials"}
            </button>
          </ModalActions>
        </div>
      </Modal>

      {/* Create New Sheet Modal */}
      <Modal
        open={showNewSheetModal}
        onClose={() => setShowNewSheetModal(false)}
        title="Create New Google Sheet in Drive"
        description="A new spreadsheet will be created inside your connected Google Drive account and formatted with Lead Center columns."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label style={{ fontWeight: 600, fontSize: 13 }}>Spreadsheet Title</label>
            <input
              className="inp"
              placeholder="e.g. My Organization - Leads 2026"
              value={newSheetTitle}
              onChange={(e) => setNewSheetTitle(e.target.value)}
            />
            <span className="hint">
              Leave blank to automatically use &ldquo;[Your Organization] - Leads&rdquo;.
            </span>
          </div>

          <ModalActions>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={sheetBusy}
              onClick={() => setShowNewSheetModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={sheetBusy}
              onClick={() => void handleCreateSheet()}
            >
              <Icon name={sheetBusy ? "refresh" : "modules"} size={13} />
              {sheetBusy ? "Creating in Drive…" : "Create Spreadsheet"}
            </button>
          </ModalActions>
        </div>
      </Modal>

      {/* Link Existing Sheet Modal */}
      <Modal
        open={showLinkSheetModal}
        onClose={() => setShowLinkSheetModal(false)}
        title="Link Existing Google Sheet"
        description="Paste either the full URL or the Spreadsheet ID of any existing Google Sheet that your connected Google account has access to edit."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label style={{ fontWeight: 600, fontSize: 13 }}>Google Sheet URL or ID</label>
            <input
              className="inp inp-mono"
              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit or ID"
              value={linkSheetInput}
              onChange={(e) => setLinkSheetInput(e.target.value)}
            />
            <span className="hint">
              Make sure the connected Google account has &ldquo;Editor&rdquo; permissions on this sheet.
            </span>
          </div>

          <ModalActions>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={sheetBusy}
              onClick={() => setShowLinkSheetModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={sheetBusy || !linkSheetInput.trim()}
              onClick={() => void handleLinkSheet()}
            >
              <Icon name={sheetBusy ? "refresh" : "link"} size={13} />
              {sheetBusy ? "Linking…" : "Link Spreadsheet"}
            </button>
          </ModalActions>
        </div>
      </Modal>
    </>
  );
}

export default function OrgMarketingPlatformPage() {
  return (
    <Suspense fallback={<div className="muted">Loading…</div>}>
      <PlatformDetailInner />
    </Suspense>
  );
}
