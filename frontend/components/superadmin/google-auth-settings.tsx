"use client";

import { useEffect, useState } from "react";
import { getAdminMarketingCredentials, updateAdminMarketingCredentials } from "@/lib/api";
import { GoogleIcon } from "@/components/auth/google-sign-in-button";
import { Icon } from "@/components/icons";
import { formPageStyles } from "@/components/forms/form-page";
import type { MarketingCredentials } from "@/lib/types";

export function GoogleAuthSettings() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    getAdminMarketingCredentials()
      .then((c: MarketingCredentials) => {
        setClientId(c.googleClientId || c.googleAdsClientId || "");
        setClientSecret(c.googleClientSecret || c.googleAdsClientSecret || "");
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await updateAdminMarketingCredentials({
        googleClientId: clientId.trim(),
        googleClientSecret: clientSecret.trim(),
        // Also keep googleAds in sync if not distinct
        googleAdsClientId: clientId.trim(),
        googleAdsClientSecret: clientSecret.trim(),
      });
      setClientId(res.googleClientId || res.googleAdsClientId || "");
      setClientSecret(res.googleClientSecret || res.googleAdsClientSecret || "");
      setStatus({
        tone: "ok",
        text: "Google OAuth credentials saved to database! Login & registration with Google are now live without server restart.",
      });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const originUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const callbackUrl = `${originUrl}/auth/google/callback`;
  const isConfigured = Boolean(clientId.trim() && clientSecret.trim());

  return (
    <div className="card reveal in" style={{ marginBottom: 24 }}>
      <div className="card-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GoogleIcon size={20} />
          <span className="t" style={{ fontSize: 16 }}>Google Authentication (SSO &amp; Organisation Sign-Up)</span>
        </div>
        <span
          className="chip"
          style={
            isConfigured
              ? { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }
              : { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }
          }
        >
          {loading ? "Loading…" : isConfigured ? "Active • Configured in DB" : "Setup Required"}
        </span>
      </div>

      <div className={`card-b ${formPageStyles.page}`} style={{ display: "grid", gap: 18 }}>
        <p className="muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.55 }}>
          Allow users and organisation admins to sign in and register with their verified Google account.
          When signing up with Google, users skip email OTP verification automatically.
          <br />
          <strong style={{ color: "#334155" }}>
            Managed directly here in your Super Admin console — no environment variables (.env) or server restart required.
          </strong>
        </p>

        <div className="row2" style={{ gap: 16 }}>
          <div className="field">
            <label style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>Google Client ID</span>
              <span className="hint">From Google Cloud Console</span>
            </label>
            <input
              className="inp inp-mono"
              placeholder="e.g. 123456789-xxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={loading || saving}
            />
          </div>

          <div className="field">
            <label style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>Google Client Secret</span>
              <span className="hint">OAuth 2.0 Client Secret</span>
            </label>
            <div style={{ position: "relative", display: "flex" }}>
              <input
                type={showSecret ? "text" : "password"}
                className="inp inp-mono"
                placeholder="e.g. GOCSPX-..."
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={loading || saving}
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                title={showSecret ? "Hide secret" : "Show secret"}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#64748b",
                  padding: 4,
                  display: "flex",
                }}
              >
                <Icon name={showSecret ? "eye-off" : "eye"} size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* OAuth Setup Instructions */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>
            Google Cloud Console OAuth Configuration
          </div>
          <div style={{ color: "#64748b", marginBottom: 12 }}>
            In your{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#2563eb", textDecoration: "underline", fontWeight: 500 }}
            >
              Google Cloud Console → APIs &amp; Services → Credentials
            </a>
            , edit your OAuth 2.0 Web Client and add these URLs:
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "#475569", textTransform: "uppercase" }}>
                Authorized JavaScript origins:
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                <code
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "4px 8px",
                    flex: 1,
                    fontSize: 12.5,
                  }}
                >
                  {originUrl}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopy(originUrl, "origin")}
                  style={{ whiteSpace: "nowrap" }}
                >
                  <Icon name={copiedKey === "origin" ? "check" : "copy"} size={13} />
                  <span>{copiedKey === "origin" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "#475569", textTransform: "uppercase" }}>
                Authorized redirect URIs:
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                <code
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "4px 8px",
                    flex: 1,
                    fontSize: 12.5,
                  }}
                >
                  {callbackUrl}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopy(callbackUrl, "callback")}
                  style={{ whiteSpace: "nowrap" }}
                >
                  <Icon name={copiedKey === "callback" ? "check" : "copy"} size={13} />
                  <span>{copiedKey === "callback" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {status && (
          <div
            role="status"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: status.tone === "ok" ? "#ecfdf5" : "#fef2f2",
              color: status.tone === "ok" ? "#065f46" : "#991b1b",
              border: `1px solid ${status.tone === "ok" ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {status.text}
          </div>
        )}

        <div className={formPageStyles.actions}>
          <button
            type="button"
            className={formPageStyles.btnPrimary}
            onClick={save}
            disabled={loading || saving}
          >
            <Icon name="check" size={16} />
            {saving ? "Saving to Database…" : "Save Google OAuth"}
          </button>
        </div>
      </div>
    </div>
  );
}
