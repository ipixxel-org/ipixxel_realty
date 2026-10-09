import type { Metadata } from "next";
// TODO: re-enable with the General / Integrations / Security sections once they are made dynamic.
// import { Reveal } from "@/components/superadmin/reveal";
// import { Switch } from "@/components/superadmin/switch";
import { BillingExpirySettings } from "@/components/superadmin/billing-expiry-settings";
import { GlobalBrandingSettings } from "@/components/superadmin/global-branding-settings";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Settings · iPixxel Realty Super Admin",
};

export default function SuperAdminSettingsPage() {
  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="settings" size={14} /> System</div>
          <h1>Platform Settings</h1>
          <div className="sub">Configure global platform theme branding, integrations and system policies.</div>
        </div>
      </div>

      <h2 style={{ margin: "16px 0 6px" }}>Global Theme &amp; Branding</h2>
      <div className="sub muted reveal" style={{ marginBottom: 16 }}>
        Configure the primary and secondary colors used across all platform applications, portals, and templates.
      </div>
      <GlobalBrandingSettings />

      <h2 style={{ margin: "24px 0 6px" }}>Subscription Expiry &amp; Lifecycle</h2>
      <div className="sub muted reveal" style={{ marginBottom: 16 }}>
        Configure grace periods and automated expiration rules for organisations.
      </div>
      <div style={{ marginBottom: 24 }}>
        <BillingExpirySettings />
      </div>

      {/* TODO: static tabs — commented out until tab switching is implemented.
      <div className="tabs reveal in">
        <a className="active">General</a>
        <a>Branding</a>
        <a>Integrations</a>
        <a>Security</a>
        <a>Billing</a>
      </div>
      */}

      {/* TODO: static General card — commented out until these fields are loaded/saved via the API.
      <div className="card reveal" style={{ marginBottom: 22 }}>
        <div className="card-h">
          <span className="t">General</span>
        </div>
        <div className="card-b">
          <div className="row2">
            <div className="field">
              <label>Platform name</label>
              <input className="inp" defaultValue="iPixxel Realty" />
            </div>
            <div className="field">
              <label>Support email</label>
              <input className="inp" defaultValue="support@ipixxelrealty.com" />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Default currency</label>
              <select defaultValue="INR">
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Timezone</label>
              <select defaultValue="Asia/Kolkata">
                {TIMEZONE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Platform tagline</label>
            <input className="inp" defaultValue="Websites & landing pages for modern real-estate teams" />
            <div className="hint">Shown on org sign-up and public template gallery.</div>
          </div>
        </div>
      </div>
      */}

      {/* TODO: static Integrations grid — commented out until connection status/toggles are backed by the API.
      <h2 style={{ margin: "28px 0 6px" }}>Integrations</h2>
      <div className="sub muted reveal" style={{ marginBottom: 16 }}>
        Connect the third-party services powering payments, messaging and analytics.
      </div>

      <div className="grid g3" style={{ marginBottom: 28 }}>
        {INTEGRATIONS.map((it, i) => (
          <Reveal key={it.name} delay={i + 1}>
            <div className="card hover" style={it.name === "SMTP Email" ? { border: "1px solid var(--brand, #6366f1)" } : undefined}>
              <div className="card-b">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <span
                    className={`ic ${it.ic}`}
                    style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}
                  >
                    {it.emoji}
                  </span>
                  {it.name === "SMTP Email" ? (
                    <a href="/admin-console/integrations/smtp" className="btn btn-ghost btn-sm" style={{ padding: "4px 10px", fontSize: 12 }}>
                      Configure →
                    </a>
                  ) : (
                    <Switch defaultOn={it.on} />
                  )}
                </div>
                <h3 style={{ margin: "14px 0 4px" }}>{it.name}</h3>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {it.desc}
                </div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className={`badge ${it.badge}`}>
                    <span className="dot" style={{ background: "currentColor" }} />
                    {it.badgeTxt}
                  </span>
                  {it.name === "SMTP Email" && (
                    <a href="/admin-console/integrations/smtp" style={{ fontSize: 12, color: "var(--brand, #6366f1)", fontWeight: 600, textDecoration: "none" }}>
                      Manage SMTP
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      */}

      {/* TODO: static Security section — commented out until these policies are persisted and enforced.
      <h2 style={{ margin: "8px 0 6px" }}>Security</h2>
      <div className="card reveal">
        <div className="card-b" style={{ padding: "6px 20px" }}>
          {SECURITY.map((s, i) => (
            <div
              key={s.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                padding: "16px 0",
                borderBottom: i < SECURITY.length - 1 ? "1px solid var(--line)" : undefined,
              }}
            >
              <div>
                <b style={{ fontSize: 14 }}>{s.name}</b>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {s.desc}
                </div>
              </div>
              <Switch defaultOn={s.on} />
            </div>
          ))}
        </div>
      </div>
      */}
    </>
  );
}
