"use client";

import { useEffect, useState, useCallback, type ChangeEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, cancelPackageChangeRequest, changePlan, addCommonProjectTypes, createOrgCatalogOption, createOrgProjectType, deleteOrgCatalogOption, deleteOrgProjectType, getInvoices, getOrgCatalogOptions, getOrgProjectTypes, updateOrgProjectType, getOrgDomainInfo, getOrgLeadStageDisplays, getOrgPackageChangeRequest, getPlans, renewSubscription, requestCustomDomain, assignCustomDomain, deleteCustomDomain, submitPackageChangeRequest, updateOrgLeadStageDisplay } from "@/lib/api";
import type { BillingRenewResult, ChangePlanResult, CrmLeadStatus, InvoiceRow, OrgBillingSummary, OrgCatalogCategory, OrgCatalogOption, OrgDomainInfo, OrgIndustry, OrgProjectType, PackageChangeRequestRow, Plan, SafeOrganisation, UpdateOrganisationSettingsInput } from "@/lib/types";
import { DEFAULT_LEAD_STAGES, LEAD_STAGE_ORDER, useLeadStages } from "@/lib/lead-stages";
import type { IconName } from "@/components/icons";
import { Icon } from "@/components/icons";
import { OrgSmtpSettings } from "@/components/org/org-smtp-settings";
import { MetaLeadAdsCard } from "@/components/org/meta-lead-ads-card";
import { SETTINGS_ACTIONS } from "@/lib/permissions";
import { FieldRolesPanel, TypedFieldEditor } from "@/components/org/typed-field-editor";
import { FIELD_ROLES, fieldsToRows, groupNoun, roleBaselineOf, rowsToFields, templateTraits, validateFieldRows, type FieldRole, type FieldRow } from "@/lib/field-template";
import { FormActions, FormAlert, FormModal, FormSection } from "@/components/forms/form-page";
import { ConfirmModal } from "@/components/ui/confirm-modal";

import { COUNTRY_META, COUNTRIES, CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/countries";
import { ORG_THEME_CHANGE_EVENT } from "@/components/global-theme-provider";

const ORG_COLOR_PRESETS = [
  { hex: "#0f1424", label: "Sapphire Navy" },
  { hex: "#2563eb", label: "Royal Blue" },
  { hex: "#059669", label: "Emerald Green" },
  { hex: "#0d9488", label: "Modern Teal" },
  { hex: "#4f46e5", label: "Indigo" },
  { hex: "#7c3aed", label: "Royal Purple" },
  { hex: "#e11d48", label: "Crimson Rose" },
  { hex: "#d97706", label: "Amber Gold" },
];

const LANGUAGES = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi", label: "Hindi" },
  { value: "gu", label: "Gujarati" },
  { value: "ar", label: "Arabic" },
];

// Matches the registration wizard's ORG_TYPES exactly (Organisation.industry
// enum) — the wizard's "What describes you best?" step and this dropdown
// edit the same field, so the option set has to stay in sync.
const INDUSTRY_OPTIONS: { value: OrgIndustry; label: string }[] = [
  { value: "developer", label: "Real Estate — Developer" },
  { value: "broker", label: "Real Estate — Broker / Agency" },
  { value: "channel", label: "Channel Partner" },
  { value: "mixed", label: "Mixed" },
];


const SUBSCRIPTION_STATUS_BADGE: Record<string, string> = {
  active: "b-green", trial: "b-amber", past_due: "b-rose", paused: "b-gray", cancelled: "b-gray", expired: "b-rose",
};
const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: "Active", trial: "Trial", past_due: "Past due", paused: "Paused", cancelled: "Cancelled", expired: "Expired",
};
const INVOICE_STATUS_BADGE: Record<string, string> = { paid: "b-green", pending: "b-amber" };
const INVOICE_STATUS_LABEL: Record<string, string> = { paid: "Paid", pending: "Pending" };

const PLAN_LIMIT_ROWS: { key: "templates" | "projects" | "users" | "landingPages" | "landingPagesCreate"; label: string }[] = [
  { key: "templates", label: "Templates" },
  { key: "projects", label: "Projects" },
  { key: "users", label: "Users" },
  { key: "landingPages", label: "Landing pages" },
  { key: "landingPagesCreate", label: "Created landing pages" },
];

// A <fieldset disabled> greys out every control inside a section the user
// can view but not change; this resets the fieldset's default box styling.
const READ_ONLY_FIELDSET: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0 };

const NAV_GROUPS = [
  {
    grp: "ORGANISATION", items: [
      { s: "general", icon: "building" as IconName, t: "General" },
      { s: "branding", icon: "sparkles" as IconName, t: "Branding" },
      // Hidden for now — uncomment to bring Localization back.
      // { s: "localization", icon: "globe" as IconName, t: "Localization" },
      { s: "domain", icon: "globe" as IconName, t: "Domain" },
    ]
  },
  {
    grp: "SALES", items: [
      { s: "crm", icon: "crm" as IconName, t: "CRM & Leads" },
      { s: "pipeline", icon: "modules" as IconName, t: "Pipeline & Sources" },
      { s: "catalogs", icon: "properties" as IconName, t: "Project Catalogs" },
    ]
  },
  {
    grp: "MARKETING", items: [
      { s: "marketing", icon: "trending" as IconName, t: "Marketing Hub" },
    ]
  },
  {
    grp: "COMMUNICATION", items: [
      { s: "email", icon: "mail" as IconName, t: "Email & SMTP" },
      // Hidden for now — uncomment to bring WhatsApp Settings back.
      // { s: "whatsapp", icon: "phone" as IconName, t: "WhatsApp Settings" },
    ]
  },
  {
    grp: "ACCOUNT", items: [
      { s: "billing", icon: "billing" as IconName, t: "Billing & Subscription" },
      // Hidden for now — uncomment to bring Team Preferences back.
      // { s: "team-prefs", icon: "users" as IconName, t: "Team Preferences" },
    ]
  },
] as const;

// Sections whose nav items are commented out above — a direct
// `?section=` link to one falls back to the first visible section.
const HIDDEN_SECTIONS: ReadonlySet<string> = new Set(["localization", "whatsapp", "comms", "team-prefs"]);

const SECTION_META: Record<string, { icon: IconName; title: string; sub: string }> = {
  general: { icon: "building", title: "General Information", sub: "Update your organisation's basic details and contact information." },
  branding: { icon: "sparkles", title: "Logo & identity", sub: "Shown across the app, landing pages & emails" },
  // localization: { icon: "globe", title: "Formats & language", sub: "Regional preferences for your workspace" },
  domain: { icon: "globe", title: "Landing Page Domains", sub: "Configure custom domains for each landing page" },
  crm: { icon: "crm", title: "CRM & leads", sub: "How leads are captured and handled" },
  marketing: { icon: "trending", title: "Marketing Hub", sub: "Ad platforms, UTM tracking and lead attribution" },
  fields: { icon: "puzzle", title: "Custom attributes", sub: "Add your own fields to leads, contacts, projects & bookings" },
  pipeline: { icon: "modules", title: "Pipeline & sources", sub: "Stages, lost reasons and lead sources" },
  catalogs: { icon: "properties", title: "Project catalogs", sub: "Your own option lists, and how unit pricing is measured" },
  scoring: { icon: "star", title: "Scoring & assignment", sub: "Lead scores and distribution rules" },
  automation: { icon: "link", title: "Automation & SLA", sub: "Trigger workflows and response targets" },
  comms: { icon: "phone", title: "Calling & WhatsApp", sub: "Dialler, AI voice and WhatsApp Business" },
  // whatsapp: { icon: "phone", title: "WhatsApp Settings", sub: "WhatsApp Business setup and automated messaging" },
  email: { icon: "mail", title: "Email & SMTP", sub: "Organisation mail server for invites, resets and notifications" },
  notifications: { icon: "bell", title: "Notifications", sub: "Channels per event type" },
  data: { icon: "document", title: "Data & import", sub: "Move data in and out of the platform" },
  api: { icon: "key", title: "API & webhooks", sub: "Programmatic access and event delivery" },
  audit: { icon: "shield", title: "Audit log", sub: "Recent admin & security events" },
  billing: { icon: "billing", title: "Billing & Subscription", sub: "Subscription, plans and invoices" },
  // "team-prefs": { icon: "users", title: "Team Preferences", sub: "Default roles, invitations and team configuration" },
  security: { icon: "lock", title: "Security", sub: "Sign-in policy and danger zone" },
};

function Toggle({ on = false }: { on?: boolean }) {
  const [s, setS] = useState(on);
  return <div className={`switch${s ? " on" : ""}`} onClick={() => setS((v) => !v)} />;
}

interface GeneralBrandingForm {
  name: string; legalName: string; industry: OrgIndustry | "";
  supportEmail: string; supportPhone: string;
  city: string; country: string; addressLine1: string; addressLine2: string; state: string; postalCode: string;
  timezone: string; currency: string; defaultLanguage: string; brandColour: string;
  logoUrl: string; faviconUrl: string;
}

function formToOrg(org: SafeOrganisation): GeneralBrandingForm {
  return {
    name: org.name, legalName: org.legal_name ?? "", industry: org.industry ?? "",
    supportEmail: org.support_email ?? "", supportPhone: org.support_phone ?? "",
    city: org.city, country: org.country ?? "", addressLine1: org.address_line1 ?? "", addressLine2: org.address_line2 ?? "",
    state: org.state ?? "", postalCode: org.postal_code ?? "", timezone: org.timezone, currency: org.currency,
    defaultLanguage: org.default_language, brandColour: org.brand_colour ?? "#0f1424",
    logoUrl: org.logo_url ?? "", faviconUrl: org.favicon_url ?? "",
  };
}

// Image field with inline preview + upload + remove — org logo & favicon
// in the branding section. `value` is the stored public URL ("" = none).
function AssetField({
  value,
  uploading,
  accept,
  uploadedLabel,
  onPick,
  onRemove,
}: {
  value: string;
  uploading: boolean;
  accept: string;
  uploadedLabel: string;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPick(file);
  };
  return value ? (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", border: "1px solid var(--line-2)", borderRadius: 11, background: "var(--surface)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} alt="Preview" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--surface)", flexShrink: 0 }} />
      <span className="muted" style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {uploading ? "Uploading…" : uploadedLabel}
      </span>
      <label style={{ flexShrink: 0, cursor: "pointer", color: "var(--brand)", fontWeight: 600, fontSize: 12.5 }}>
        <input type="file" accept={accept} style={{ display: "none" }} onChange={onChange} />
        Replace
      </label>
      <button
        type="button"
        aria-label="Remove"
        title="Remove"
        onClick={onRemove}
        style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--muted)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  ) : (
    <label className="drop" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
      <input type="file" accept={accept} style={{ display: "none" }} onChange={onChange} />
      {uploading ? "Uploading…" : <><Icon name="upload" size={16} /> Upload · <span style={{ color: "var(--brand)", fontWeight: 600 }}>browse</span></>}
    </label>
  );
}

function formatMoney(amount: number, currency: string) {
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Usage-against-limit bar for the Billing card. `limit === null` = unlimited. */
function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const atLimit = limit != null && used >= limit;
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
        <span>{used} of {limit ?? "unlimited"} used</span>
        {atLimit ? <span style={{ color: "var(--rose)", fontWeight: 700 }}>Limit reached</span> : null}
      </div>
      {limit != null ? (
        <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%`, background: atLimit ? "var(--rose)" : "var(--brand)", borderRadius: 999 }} />
        </div>
      ) : <div className="muted" style={{ fontSize: 12 }}>Unlimited on this plan.</div>}
    </div>
  );
}

/**
 * Subscription health banner for the Billing card — the persistent, in-context
 * reminder that pairs with the expiry popup in the org shell. `expired` blocks
 * publishing; `past_due` is inside the grace window (still usable); active/trial
 * shows a "renewing soon" hint inside the configured notify window.
 */
function SubscriptionHealthBanner({
  status,
  renewsAt,
  graceEndsAt,
  renewing,
  onRenew,
}: {
  status: string;
  renewsAt: string | null;
  graceEndsAt: string | null;
  renewing: boolean;
  onRenew: () => void;
}) {
  const tone =
    status === "expired" || status === "cancelled" || status === "paused"
      ? "rose"
      : status === "past_due"
        ? "amber"
        : status === "active" || status === "trial"
          ? "info"
          : "gray";
  const title =
    status === "expired"
      ? "Your subscription has expired"
      : status === "cancelled"
        ? "Your subscription is cancelled"
        : status === "paused"
          ? "Your subscription is paused"
          : status === "past_due"
            ? "Your subscription is past due"
            : status === "trial"
              ? `Trial ${renewsAt ? `ends ${formatDate(renewsAt)}` : "ending soon"}`
              : `Renews ${renewsAt ? formatDate(renewsAt) : "soon"}`;

  const body =
    status === "expired"
      ? "Publishing is paused. Renew to restore your live pages and features."
      : status === "cancelled" || status === "paused"
        ? "This subscription is not active. Choose a plan or renew to continue."
        : status === "past_due" && graceEndsAt
          ? `Your term has ended — you're within the ${formatDate(graceEndsAt)} grace period. Renew before it ends to keep everything running.`
          : status === "past_due"
            ? "Your term has ended. Renew within the grace period to avoid interruption."
            : null;

  const canRenew = status !== "active";

  return (
    <div
      className={`sub-health sub-health--${tone}`}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "11px 13px",
        borderRadius: 11, border: "1px solid", flexWrap: "wrap",
        ...(tone === "rose" && { borderColor: "rgba(244,63,94,.28)", background: "rgba(244,63,94,.07)" }),
        ...(tone === "amber" && { borderColor: "rgba(245,158,11,.28)", background: "rgba(245,158,11,.07)" }),
        ...(tone === "info" && { borderColor: "rgba(21, 27, 46,.22)", background: "rgba(21, 27, 46,.05)" }),
        ...(tone === "gray" && { borderColor: "var(--line-2)", background: "var(--surface)" }),
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <b style={{ fontSize: 13 }}>{title}</b>
        {body ? <div className="muted" style={{ fontSize: 12.5 }}>{body}</div> : null}
        {!body && renewsAt && status !== "trial" ? (
          <div className="muted" style={{ fontSize: 12.5 }}>Keep a valid payment method on file so billing never lapses.</div>
        ) : null}
      </div>
      {canRenew ? (
        <button className="btn btn-primary" onClick={onRenew} disabled={renewing}>
          {renewing ? "Renewing…" : "Renew now"}
        </button>
      ) : null}
    </div>
  );
}

function PlanLimitsList({ limits, features }: { limits: { templates: number | null; projects: number | null; users: number | null; landingPages: number | null; landingPagesCreate?: number | null } | null; features?: string[] | null }) {
  const rows = PLAN_LIMIT_ROWS.map((r) => ({
    ...r,
    count: limits?.[r.key] == null ? "Unlimited" : String(limits[r.key]),
  }));
  return (
    <ul className="plan-limits-list">
      {rows.map((r) => (
        <li key={r.key}>
          <Icon name="check" size={14} />
          <span><b>{r.count}</b> {r.label}</span>
        </li>
      ))}
      {(features || []).map((feat, idx) => (
        <li key={idx}>
          <Icon name="check" size={14} />
          <span>{feat}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHead({ section }: { section: string }) {
  const meta = SECTION_META[section];
  if (!meta) return null;
  return (
    <div className="os-sec-head">
      <span className="os-sec-ic"><Icon name={meta.icon} size={20} /></span>
      <div>
        <h2>{meta.title}</h2>
        <p>{meta.sub}</p>
      </div>
    </div>
  );
}

function Card({
  icon, title, sub, action, children,
}: { icon: IconName; title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="os-card-top">
        <span className="os-card-ic"><Icon name={icon} size={18} /></span>
        <div className="os-card-htext">
          <div className="os-card-t">{title}</div>
          {sub ? <div className="os-card-x">{sub}</div> : null}
        </div>
        {action ? <div className="os-card-action">{action}</div> : null}
      </div>
      <div className="card-b">{children}</div>
    </div>
  );
}

const DOMAIN_STATUS_BADGE: Record<string, string> = {
  none: "b-gray", pending: "b-amber", approved: "b-blue", active: "b-green", rejected: "b-rose", connected: "b-green",
};
const DOMAIN_STATUS_LABEL: Record<string, string> = {
  none: "Not set", pending: "Pending approval", approved: "Approved", active: "Active", rejected: "Rejected", connected: "Connected",
};

function DomainSection({ canRequest }: { canRequest: boolean }) {
  const [info, setInfo] = useState<OrgDomainInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customDomain, setCustomDomain] = useState("");
  const [landingPageId, setLandingPageId] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  // Assignment & action states
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [showDnsId, setShowDnsId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  function copyDns(val: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(val);
      setCopiedText(val);
      setTimeout(() => setCopiedText(null), 2500);
    }
  }

  async function load() {
    setBusy(true);
    try {
      const data = await getOrgDomainInfo();
      setInfo(data);
      setLandingPageId((prev) => prev || data.landingPages?.[0]?.id || "");
      // Prepopulate assign selection map with current assignments
      const map: Record<string, string> = {};
      for (const r of data.requests ?? []) {
        if (r.kind === "custom_domain") {
          map[r.id] = r.landingPageId ?? "";
        }
      }
      setAssignSelection(map);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load domain settings");
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customDomain.trim()) return;
    setSending(true);
    setSent(null);
    setError(null);
    try {
      await requestCustomDomain({
        domain: customDomain.trim(),
        landingPageId: landingPageId || undefined,
      });
      setCustomDomain("");
      setSent("Custom domain request submitted for review by Super Admin.");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not submit custom domain request");
    } finally {
      setSending(false);
    }
  }

  async function handleAssign(domainRequestId: string) {
    const targetPageId = assignSelection[domainRequestId] || null;
    setActionBusy(true);
    setError(null);
    try {
      await assignCustomDomain({
        domainRequestId,
        landingPageId: targetPageId,
      });
      setSent("Domain assignment updated successfully.");
      setAssigningId(null);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not update domain assignment");
    } finally {
      setActionBusy(false);
    }
  }

  function handleDelete(domainRequestId: string) {
    setDeleteTargetId(domainRequestId);
  }

  async function confirmDelete() {
    const domainRequestId = deleteTargetId;
    if (!domainRequestId) return;
    setActionBusy(true);
    setError(null);
    try {
      await deleteCustomDomain(domainRequestId);
      setSent("Domain removed successfully.");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not remove domain");
    } finally {
      setActionBusy(false);
      setDeleteTargetId(null);
    }
  }

  const badge = (status: string) => (
    <span className={`badge ${DOMAIN_STATUS_BADGE[status] ?? "b-gray"}`}>{DOMAIN_STATUS_LABEL[status] ?? status}</span>
  );

  const customRequests = (info?.requests ?? []).filter((r) => r.kind === "custom_domain");
  const approvedOrConnected = customRequests.filter((r) => r.status === "approved" || r.status === "connected");
  const pendingRequests = customRequests.filter((r) => r.status === "pending");
  const rejectedRequests = customRequests.filter((r) => r.status === "rejected");

  return (
    <>
      {/* Landing Page Custom Domains Card */}
      <Card icon="globe" title="Landing Page Custom Domains" sub="Configure and assign distinct domains to each of your landing pages">
        <div className="card-b" style={{ padding: 16 }}>
          {loading ? (
            <div className="muted">Loading domains…</div>
          ) : !info ? (
            <div className="muted">{error ?? "Custom domain settings unavailable."}</div>
          ) : (
            <>
              {/* Flow explanation banner */}
              <div
                style={{
                  background: "var(--surface-2, #f8fafc)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  marginBottom: 20,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--ink-2)",
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🌐</span> Domain Configuration Workflow
                </div>
                <span>
                  <b>1. Request:</b> Enter your custom domain below (e.g. <code>homes.mybrand.com</code>) and select a landing page.
                  <br />
                  <b>2. Superadmin Approval:</b> The Super Admin approves the domain request.
                  <br />
                  <b>3. Assign &amp; Switch:</b> Once approved, you can freely assign, switch, or unassign this domain to any landing page.
                </span>
              </div>

              {/* Approved & Connected Domains Section */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Approved &amp; Active Domains</span>
                  <span className="badge b-gray" style={{ fontSize: 11 }}>{approvedOrConnected.length}</span>
                </div>

                {approvedOrConnected.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13, padding: "12px 0" }}>
                    No approved custom domains yet. Submit a request below to get started.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {approvedOrConnected.map((req) => {
                      const isEditing = assigningId === req.id;
                      const assignedPage = info.landingPages.find((p) => p.id === req.landingPageId);

                      return (
                        <div
                          key={req.id}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--line-2)",
                            borderRadius: 12,
                            padding: "14px 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", fontFamily: "monospace" }}>
                                  {req.customDomain}
                                </span>
                                {badge(req.status)}
                              </div>
                              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                Serves:{" "}
                                {assignedPage ? (
                                  <b style={{ color: "var(--brand)" }}>{assignedPage.name} (/{assignedPage.slug})</b>
                                ) : (
                                  <span style={{ color: "var(--amber, #f59e0b)" }}>Unassigned (Not pointing to any page)</span>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button
                                type="button"
                                className="btn btn-soft btn-sm"
                                onClick={() => setShowDnsId(showDnsId === req.id ? null : req.id)}
                                title="View DNS records to point your domain"
                                style={{ display: "flex", alignItems: "center", gap: 5 }}
                              >
                                <span>🌐</span>
                                {showDnsId === req.id ? "Hide DNS" : "DNS Setup"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-soft btn-sm"
                                onClick={() => setAssigningId(isEditing ? null : req.id)}
                                disabled={actionBusy}
                              >
                                {isEditing ? "Close" : "Assign / Switch Page"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleDelete(req.id)}
                                disabled={actionBusy}
                                style={{ color: "var(--rose)" }}
                                title="Remove domain"
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          {/* Inline Assignment Form */}
                          {isEditing && (
                            <div
                              style={{
                                background: "var(--surface-2, #f8fafc)",
                                border: "1px solid var(--line-2)",
                                borderRadius: 8,
                                padding: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                                marginTop: 4,
                              }}
                            >
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
                                Select Landing Page for <code>{req.customDomain}</code>:
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <select
                                  className="inp"
                                  style={{ flex: 1, minWidth: 200 }}
                                  value={assignSelection[req.id] ?? ""}
                                  onChange={(e) =>
                                    setAssignSelection((prev) => ({
                                      ...prev,
                                      [req.id]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">-- No Landing Page (Unassigned) --</option>
                                  {info.landingPages.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} (/{p.slug}) {p.status === "published" ? "✓ Published" : `— ${p.status}`}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleAssign(req.id)}
                                  disabled={actionBusy}
                                  style={{ fontWeight: 700 }}
                                >
                                  {actionBusy ? "Saving…" : "Save Assignment"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setAssigningId(null)}
                                  disabled={actionBusy}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* DNS Instructions Panel */}
                          {showDnsId === req.id && (() => {
                            const platformOrigin = info.platformOrigin || "3.108.68.137";
                            const dnsRecords = req.dnsInstructions && req.dnsInstructions.length > 0
                              ? req.dnsInstructions
                              : [
                                {
                                  type: "A",
                                  host: "@",
                                  value: platformOrigin,
                                  ttl: "Auto",
                                  purpose: "Website origin (IPv4)",
                                },
                                {
                                  type: "CNAME",
                                  host: "www",
                                  value: req.customDomain ?? "@",
                                  ttl: "Auto",
                                  purpose: "WWW alias redirect",
                                },
                              ];

                            return (
                              <div
                                style={{
                                  background: "var(--surface-2, #f8fafc)",
                                  border: "1px solid var(--line-2)",
                                  borderRadius: 10,
                                  padding: 14,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 12,
                                  marginTop: 4,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                                      DNS Configuration for <code style={{ color: "var(--brand)" }}>{req.customDomain}</code>
                                    </div>
                                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                                      Add the following records at your domain registrar (GoDaddy, Namecheap, Cloudflare, Route 53, etc.):
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 11, background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>
                                    Server IP: {platformOrigin}
                                  </div>
                                </div>

                                <div style={{ overflowX: "auto" }}>
                                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr style={{ borderBottom: "1px solid var(--line-2)", color: "var(--ink-2)", textAlign: "left" }}>
                                        <th style={{ padding: "6px 8px" }}>Type</th>
                                        <th style={{ padding: "6px 8px" }}>Host / Name</th>
                                        <th style={{ padding: "6px 8px" }}>Points To / Value</th>
                                        <th style={{ padding: "6px 8px" }}>TTL</th>
                                        <th style={{ padding: "6px 8px" }}>Purpose</th>
                                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dnsRecords.map((r, idx) => (
                                        <tr key={idx} style={{ borderBottom: "1px solid var(--line-2)" }}>
                                          <td style={{ padding: "8px" }}>
                                            <span className="badge b-blue" style={{ fontWeight: 700, fontSize: 11 }}>
                                              {r.type}
                                            </span>
                                          </td>
                                          <td style={{ padding: "8px", fontFamily: "monospace", fontWeight: 600 }}>
                                            {r.host}
                                          </td>
                                          <td style={{ padding: "8px", fontFamily: "monospace", color: "var(--brand)", fontWeight: 700 }}>
                                            {r.value}
                                          </td>
                                          <td style={{ padding: "8px", color: "var(--ink-2)" }}>
                                            {r.ttl || "Auto"}
                                          </td>
                                          <td style={{ padding: "8px", color: "var(--ink-2)" }}>
                                            {r.purpose}
                                          </td>
                                          <td style={{ padding: "8px", textAlign: "right" }}>
                                            <button
                                              type="button"
                                              className="btn btn-ghost btn-xs"
                                              onClick={() => copyDns(r.value)}
                                              style={{ fontSize: 11, padding: "2px 8px" }}
                                            >
                                              {copiedText === r.value ? "✓ Copied!" : "Copy Value"}
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                <div
                                  style={{
                                    fontSize: 11.5,
                                    lineHeight: 1.5,
                                    color: "var(--ink-2)",
                                    background: "rgba(59, 130, 246, 0.05)",
                                    border: "1px solid rgba(59, 130, 246, 0.15)",
                                    borderRadius: 6,
                                    padding: "8px 12px",
                                  }}
                                >
                                  💡 <b>Next Steps:</b>
                                  <ol style={{ margin: "4px 0 0 16px", padding: 0 }}>
                                    <li>Add the <b>A record</b> (Host: <code>@</code>, Value: <code>{platformOrigin}</code>) at your domain registrar.</li>
                                    <li>Add the <b>CNAME record</b> (Host: <code>www</code>, Value: <code>{req.customDomain}</code>) so www redirects properly.</li>
                                    <li>DNS propagation typically takes <b>5 to 60 minutes</b> (up to 24 hours depending on TTL).</li>
                                    <li>Ensure the landing page above is in <b>Published</b> status so visitors can view it immediately.</li>
                                  </ol>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pending Superadmin Approval Requests */}
              {pendingRequests.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Pending Super Admin Review</span>
                    <span className="badge b-amber" style={{ fontSize: 11 }}>{pendingRequests.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        style={{
                          background: "var(--surface)",
                          border: "1px dashed var(--line-2)",
                          borderRadius: 10,
                          padding: "10px 14px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>
                            {req.customDomain}
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            Requested {new Date(req.requestedAt).toLocaleDateString()}
                            {req.landingPage?.name ? ` for page: ${req.landingPage.name}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {badge(req.status)}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDelete(req.id)}
                            disabled={actionBusy}
                            style={{ color: "var(--rose)", fontSize: 11.5 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejected Requests */}
              {rejectedRequests.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--rose)", marginBottom: 6 }}>
                    Rejected Requests
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {rejectedRequests.map((req) => (
                      <div
                        key={req.id}
                        style={{
                          background: "var(--rose-050, #fff1f2)",
                          border: "1px solid var(--rose)",
                          borderRadius: 8,
                          padding: "8px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12.5,
                        }}
                      >
                        <div>
                          <b style={{ fontFamily: "monospace" }}>{req.customDomain}</b>: {req.rejectionReason ?? "Rejected by Super Admin"}
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(req.id)}
                          style={{ fontSize: 11.5 }}
                        >
                          Dismiss
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request New Domain Form */}
              <div
                style={{
                  background: "var(--surface-2, #f8fafc)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 14,
                  padding: 16,
                  marginTop: 10,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 4 }}>
                  Request a New Custom Domain
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                  Submit a domain name for Super Admin approval. You can link it to a specific landing page now, or assign it anytime after approval.
                </div>

                <fieldset disabled={!canRequest} style={READ_ONLY_FIELDSET}>
                  <form onSubmit={handleRequest} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Landing page to serve</label>
                        <select
                          className="inp"
                          value={landingPageId}
                          onChange={(e) => setLandingPageId(e.target.value)}
                        >
                          <option value="">-- Assign later (after approval) --</option>
                          {info.landingPages.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (/{p.slug}) {p.status === "published" ? "✓" : `— ${p.status}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Custom domain</label>
                        <input
                          className="inp"
                          placeholder="e.g. luxuryvillas.ae"
                          value={customDomain}
                          onChange={(e) => setCustomDomain(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={sending || !customDomain.trim()}
                        style={{ fontWeight: 700 }}
                      >
                        {sending ? "Submitting…" : "Submit Domain Request"}
                      </button>
                    </div>
                  </form>
                </fieldset>

                {sent && <div className="muted" style={{ color: "var(--green)", marginTop: 10, fontWeight: 600 }}>{sent}</div>}
                {error && <div className="muted" style={{ color: "var(--rose)", marginTop: 10 }}>{error}</div>}
              </div>
            </>
          )}
        </div>
      </Card>

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Remove domain request?"
        message="This domain request will be removed. You can submit it again later."
        confirmLabel="Remove"
        destructive
        busy={actionBusy}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTargetId(null)}
      />
    </>
  );
}

// The project-wizard catalogs, in the order they appear in the wizard. Each
// maps to one OrgCatalogCategory; the section renders one card per row.
type CatalogGroup = {
  category: OrgCatalogCategory;
  title: string;
  sub: string;
  placeholder: string;
};
// These lists are org-wide vocabularies, not project-only: Configurations,
// Facing and Parking also drive the lead requirement form. Titles/copy are
// kept generic for that reason (the enum values stay `unit_type` / `facing` /
// `parking`).
const CATALOG_GROUPS: CatalogGroup[] = [
  { category: "unit_type", title: "Configuration for standalone units", sub: "Configuration labels for standalone units and lead requirements — e.g. 2 BHK, 3 BHK, Penthouse, Villa, Plot", placeholder: "Add a configuration…" },
  { category: "connectivity", title: "Connectivity & landmarks", sub: "Nearby categories — e.g. Metro / transit, Schools, Hospitals, Airport", placeholder: "Add a connectivity category…" },
  { category: "amenity", title: "Amenities", sub: "Lifestyle features — e.g. Clubhouse, Gymnasium, Swimming pool", placeholder: "Add an amenity…" },
  { category: "price_includes", title: "Price includes", sub: "What the quoted price covers — e.g. Floor rise, 1 covered parking, Club membership, GST", placeholder: "Add a price inclusion…" },
  { category: "payment_plan", title: "Payment plans", sub: "Plan types buyers can pick — e.g. Construction-linked, Down payment, Flexi (20:80), Subvention", placeholder: "Add a payment plan…" },
  { category: "facing", title: "Facing", sub: "Directions or views — e.g. East, North, Garden, Sea", placeholder: "Add a facing option…" },
  { category: "parking", title: "Parking", sub: "Parking choices — e.g. 1 covered, 2 covered, Open", placeholder: "Add a parking option…" },
  { category: "unit_variant", title: "Unit variants", sub: "Optional variant label within a configuration — e.g. Type A, Type B, Corner", placeholder: "Add a unit variant…" },
];

// Lead-only option lists, shown inside the CRM & Leads settings section. The
// lead form's Configuration / Facing / Parking are NOT here — they read the
// shared Project Catalogs lists above (a lead's facing preference is the same
// value set as a unit's, so it's one list with one home).
const LEAD_CATALOG_GROUPS: CatalogGroup[] = [
  { category: "lead_tag", title: "Lead tags", sub: "Reusable labels agents apply to a lead — e.g. Hot, NRI, Investor, Ready buyer, Price-sensitive, VIP", placeholder: "Add a tag…" },
  { category: "lead_purpose", title: "Purpose", sub: "Why the lead is buying — e.g. End use (self), Investment, Rental income", placeholder: "Add a purpose…" },
  { category: "lead_financing", title: "Financing", sub: "How the purchase is funded — e.g. Home loan, Self-funded, Loan + self", placeholder: "Add a financing option…" },
  { category: "lead_loan_status", title: "Loan status", sub: "Where the loan stands — e.g. Not started, Pre-approved, Applied, Sanctioned", placeholder: "Add a loan status…" },
  { category: "lead_timeline_to_buy", title: "Timeline to buy", sub: "How soon the lead intends to purchase — e.g. Immediate, 1–2 months, 3–6 months", placeholder: "Add a timeline…" },
  { category: "lead_preferred_floor", title: "Preferred floor", sub: "Floor preference — e.g. Any, Low, Mid, High (10th+)", placeholder: "Add a floor preference…" },
];

function CatalogSection({
  groups = CATALOG_GROUPS,
  heading,
  canAdd,
  canDelete,
}: {
  groups?: CatalogGroup[];
  /** Projects > New project adds options; Projects > Delete removes them. */
  canAdd: boolean;
  canDelete: boolean;
  /** Optional intro shown above the cards, to set them apart from other
   *  content in a shared section (e.g. the CRM & Leads toggles). */
  heading?: { title: string; sub: string };
}) {
  const [options, setOptions] = useState<OrgCatalogOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Whichever category or option id is mid-request, so its control can show
  // a pending state without a page-wide spinner.
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    getOrgCatalogOptions()
      .then((rows) => setOptions(rows))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load catalogs."));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function addOption(category: OrgCatalogCategory) {
    const label = (drafts[category] ?? "").trim();
    if (!label) return;
    setBusy(category); setRowError(null);
    try {
      const created = await createOrgCatalogOption({ category, label });
      setOptions((prev) => (prev ? [...prev, created] : [created]));
      setDrafts((d) => ({ ...d, [category]: "" }));
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Could not add that option.");
    } finally {
      setBusy(null);
    }
  }

  async function removeOption(id: string) {
    setBusy(id); setRowError(null);
    try {
      await deleteOrgCatalogOption(id);
      setOptions((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Could not remove that option.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {heading ? (
        <div style={{ margin: "26px 0 12px", borderTop: "1px solid var(--line)", paddingTop: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{heading.title}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{heading.sub}</div>
        </div>
      ) : null}
      {loadError ? <div className="form-alert">{loadError}</div> : null}
      {rowError ? <div className="form-alert">{rowError}</div> : null}
      {groups.map((g) => {
        const rows = (options ?? [])
          .filter((o) => o.category === g.category)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
        const draft = drafts[g.category] ?? "";
        return (
          <Card key={g.category} icon="properties" title={g.title} sub={g.sub}>
            {options === null ? (
              <p className="muted" style={{ margin: 0 }}>Loading…</p>
            ) : (
              <>
                <div className="pill-list">
                  {rows.length === 0 ? (
                    <span className="muted" style={{ fontSize: 12.5 }}>No options yet — add the first one below.</span>
                  ) : rows.map((o) => (
                    <span key={o.id} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {o.label}
                      {canDelete ? (
                        <span
                          className="x"
                          style={{ cursor: busy ? "wait" : "pointer", opacity: busy === o.id ? 0.4 : 1 }}
                          onClick={() => { if (!busy) void removeOption(o.id); }}
                        >×</span>
                      ) : null}
                    </span>
                  ))}
                </div>
                {canAdd ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); void addOption(g.category); }}
                    style={{ display: "flex", gap: 8, marginTop: 12, maxWidth: 440 }}
                  >
                    <input
                      className="inp"
                      placeholder={g.placeholder}
                      value={draft}
                      maxLength={120}
                      onChange={(e) => setDrafts((d) => ({ ...d, [g.category]: e.target.value }))}
                    />
                    <button className="btn btn-primary btn-sm" type="submit" disabled={busy === g.category || !draft.trim()}>
                      {busy === g.category ? "Adding…" : "+ Add"}
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </Card>
        );
      })}
    </>
  );
}

/**
 * Project types — each an org-owned entry with two typed field templates
 * (project summary fields, per-unit fields). There is no fixed layout: which
 * inventory controls a project has (grouping, floors, configurations, price)
 * is derived from which role fields the unit template carries. Where an org
 * defines what "Plots" or "Farmhouses" means, with no code change.
 */
function ProjectTypesSection({
  canAdd,
  canEdit,
  canDelete,
}: {
  /** Projects > New project / Edit / Delete. */
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [types, setTypes] = useState<OrgProjectType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OrgProjectType | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    getOrgProjectTypes()
      .then(setTypes)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load project types."));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function addCommon() {
    setBusy("common"); setError(null);
    try {
      const res = await addCommonProjectTypes();
      setTypes(res.types);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the common project types.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: OrgProjectType) {
    setBusy(t.id); setError(null);
    try {
      await deleteOrgProjectType(t.id);
      setTypes((prev) => (prev ? prev.filter((x) => x.id !== t.id) : prev));
      if (editing === t.id) setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that project type.");
    } finally {
      setBusy(null);
    }
  }

  function saved(t: OrgProjectType) {
    setTypes((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
    });
    setEditing(null);
  }

  return (
    <>
      <Card
        icon="properties"
        title="Project types"
        sub="Each type sets how a project's inventory is structured and which extra fields it captures — e.g. Apartments, Villas, Plots, Farmhouses"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {canAdd ? (
              <>
                <button className="btn btn-ghost btn-sm" type="button" disabled={busy === "common"} onClick={() => void addCommon()}>
                  {busy === "common" ? "Adding…" : "Add common types"}
                </button>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setEditing("new")} disabled={editing === "new"}>
                  + New type
                </button>
              </>
            ) : null}
          </div>
        }
      >
        {loadError ? <div className="form-alert">{loadError}</div> : null}
        {error ? <div className="form-alert">{error}</div> : null}
        {types === null && !loadError ? <p className="muted" style={{ margin: 0 }}>Loading…</p> : null}
        {types && types.length === 0 && editing !== "new" ? (
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            No project types yet. Add the common ones with one click (Apartment, Plot, Villa), or create your own.
          </div>
        ) : null}
        {editing === "new" ? (
          <ProjectTypeEditor initial={null} onSaved={saved} onCancel={() => setEditing(null)} />
        ) : null}
        {(types ?? []).map((t) => {
          const traits = templateTraits(t.unitFields);
          const badges = [
            traits.grouped ? groupNoun(t.unitFields) ?? "Grouped" : null,
            traits.floors ? "Floors" : null,
            traits.configurations ? "Configurations" : null,
            traits.priced ? "Priced" : null,
          ].filter((b): b is string => !!b);
          return (
            <div key={t.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ fontSize: 14 }}>{t.name}</b>
                {badges.length ? badges.map((b) => <span key={b} className="badge b-blue">{b}</span>) : <span className="badge">Flat list</span>}
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {t.projectFields.length} project field{t.projectFields.length === 1 ? "" : "s"} · {t.unitFields.length} unit field{t.unitFields.length === 1 ? "" : "s"}
                  {t.inUse > 0 ? ` · used by ${t.inUse} project${t.inUse === 1 ? "" : "s"}` : ""}
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {canEdit ? (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                      {editing === t.id ? "Close" : "Edit"}
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button className="btn btn-ghost btn-sm" type="button" disabled={busy === t.id} onClick={() => setPendingDelete(t)}>Delete</button>
                  ) : null}
                </span>
              </div>
              {editing === t.id ? (
                <ProjectTypeEditor initial={t} onSaved={saved} onCancel={() => setEditing(null)} />
              ) : null}
            </div>
          );
        })}
      </Card>
      <ConfirmModal
        open={!!pendingDelete}
        title={`Delete "${pendingDelete?.name ?? ""}"?`}
        message={
          pendingDelete
            ? `This project type will be permanently deleted. This can't be undone.${pendingDelete.inUse > 0
              ? ` The ${pendingDelete.inUse} project(s) already using it keep their own copy and are not affected.`
              : ""
            }`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={busy === pendingDelete?.id}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await remove(pendingDelete);
          setPendingDelete(null);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}

function ProjectTypeEditor({
  initial, onSaved, onCancel,
}: {
  initial: OrgProjectType | null;
  onSaved: (t: OrgProjectType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [projectRows, setProjectRows] = useState<FieldRow[]>(() => fieldsToRows(initial?.projectFields));
  const [unitRows, setUnitRows] = useState<FieldRow[]>(() => fieldsToRows(initial?.unitFields));
  // What this type originally had a field for, frozen at the moment this
  // editor opened — see FieldRolesPanel. A brand-new type (`initial` null)
  // has no prior state to compare against, so nothing would ever read as
  // "missing" and there'd be no way left to set up a role at all once it's
  // saved — treat creation as recovering from a blank slate instead: seed
  // every role as "expected", so all five strips are available to wire up
  // right away, and whichever ones are actually left unassigned at save time
  // go quiet for good on every future edit (the type's own saved state
  // becomes the new baseline then, same as any existing type).
  const [unitRoleBaseline] = useState<Set<FieldRole>>(() =>
    initial ? roleBaselineOf(initial.unitFields) : new Set(FIELD_ROLES),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameLocked = (initial?.inUse ?? 0) > 0;

  async function save() {
    setError(null);
    if (!name.trim()) { setError("Give the project type a name."); return; }
    const invalid = validateFieldRows(projectRows, "Project fields") ?? validateFieldRows(unitRows, "Unit fields");
    if (invalid) { setError(invalid); return; }
    const body = {
      name: name.trim(),
      projectFields: rowsToFields(projectRows),
      unitFields: rowsToFields(unitRows),
    };
    setSaving(true);
    try {
      const saved = initial
        ? await updateOrgProjectType(initial.id, body)
        : await createOrgProjectType(body);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the project type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, margin: "12px 0" }}>
      {error ? <div className="form-alert">{error}</div> : null}
      <div className="field">
        <label>Name</label>
        <input className="inp" value={name} maxLength={120} disabled={nameLocked} placeholder="e.g. Farmhouses" onChange={(e) => setName(e.target.value)} />
        {nameLocked ? <div className="hint">In use by {initial?.inUse} project(s), so it can&apos;t be renamed.</div> : null}
      </div>

      <div className="field">
        <label>Project fields</label>
        <div className="hint" style={{ marginBottom: 8 }}>Summary details captured once per project — e.g. Number of plots, Total land.</div>
        <TypedFieldEditor rows={projectRows} onChange={setProjectRows} emptyText="No project fields — add one if this type needs any." roles={false} />
      </div>

      <div className="field">
        <label>Unit fields</label>
        <div className="hint" style={{ marginBottom: 8 }}>
          Details captured on every unit — e.g. Bedrooms, Floor, Configuration, Price. Editing this later never
          changes units that already exist.
        </div>
        <FieldRolesPanel rows={unitRows} baseline={unitRoleBaseline} onChange={setUnitRows} />
        <TypedFieldEditor rows={unitRows} onChange={setUnitRows} emptyText="No unit fields — add one if units of this type need any." />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn btn-primary btn-sm" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create type"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

type StageDraft = { label: string; color: string };

/**
 * Pipeline stages — the seven fixed CRM stages, whose DISPLAY label and colour
 * an org can customise. The stages themselves can't be added, removed, or
 * reordered here; only label + colour are editable. Saving pushes the change
 * into the shared LeadStages store so every screen updates without a reload.
 */
function PipelineStagesCard({ canEdit }: { canEdit: boolean }) {
  const { applyServer } = useLeadStages();
  const [drafts, setDrafts] = useState<Record<CrmLeadStatus, StageDraft> | null>(null);
  const [initial, setInitial] = useState<Record<CrmLeadStatus, StageDraft> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  useEffect(() => {
    getOrgLeadStageDisplays()
      .then((rows) => {
        const byStatus = new Map(rows.map((r) => [r.status, r]));
        const next = {} as Record<CrmLeadStatus, StageDraft>;
        for (const status of LEAD_STAGE_ORDER) {
          const row = byStatus.get(status);
          next[status] = {
            label: row?.label ?? DEFAULT_LEAD_STAGES[status].label,
            color: (row?.color ?? DEFAULT_LEAD_STAGES[status].color).toLowerCase(),
          };
        }
        setDrafts(next);
        setInitial(next);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load pipeline stages."));
  }, []);

  function edit(status: CrmLeadStatus, patch: Partial<StageDraft>) {
    setSavedAt(false);
    setDrafts((d) => (d ? { ...d, [status]: { ...d[status], ...patch } } : d));
  }

  function resetRow(status: CrmLeadStatus) {
    edit(status, {
      label: DEFAULT_LEAD_STAGES[status].label,
      color: DEFAULT_LEAD_STAGES[status].color.toLowerCase(),
    });
  }

  const dirty = Boolean(
    drafts &&
    initial &&
    LEAD_STAGE_ORDER.some(
      (s) =>
        drafts[s].label.trim() !== initial[s].label ||
        drafts[s].color !== initial[s].color,
    ),
  );
  const hasEmptyLabel = Boolean(
    drafts && LEAD_STAGE_ORDER.some((s) => !drafts[s].label.trim()),
  );

  async function save() {
    if (!drafts || !initial || saving || !dirty) return;
    if (hasEmptyLabel) {
      setSaveError("Every stage needs a label.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const changed = LEAD_STAGE_ORDER.filter(
        (s) =>
          drafts[s].label.trim() !== initial[s].label ||
          drafts[s].color !== initial[s].color,
      );
      for (const status of changed) {
        await updateOrgLeadStageDisplay(status, {
          label: drafts[status].label.trim(),
          color: drafts[status].color,
        });
      }
      // Re-pull the authoritative merged list and share it app-wide.
      const fresh = await getOrgLeadStageDisplays();
      applyServer(fresh);
      const byStatus = new Map(fresh.map((r) => [r.status, r]));
      const next = {} as Record<CrmLeadStatus, StageDraft>;
      for (const status of LEAD_STAGE_ORDER) {
        const row = byStatus.get(status);
        next[status] = {
          label: row?.label ?? DEFAULT_LEAD_STAGES[status].label,
          color: (row?.color ?? DEFAULT_LEAD_STAGES[status].color).toLowerCase(),
        };
      }
      setDrafts(next);
      setInitial(next);
      setSavedAt(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the pipeline stages.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      icon="modules"
      title="Pipeline stages"
      sub="Rename a stage or change its colour. The seven stages are fixed — only the label and colour shown across the app change."
    >
      <fieldset disabled={!canEdit} style={READ_ONLY_FIELDSET}>
        {loadError ? <div className="form-alert">{loadError}</div> : null}
        {saveError ? <div className="form-alert">{saveError}</div> : null}
        {drafts === null ? (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        ) : (
          <>
            <div id="stageList">
              {LEAD_STAGE_ORDER.map((status) => {
                const isDefault =
                  drafts[status].label.trim() === DEFAULT_LEAD_STAGES[status].label &&
                  drafts[status].color === DEFAULT_LEAD_STAGES[status].color.toLowerCase();
                return (
                  <div className="stage" key={status}>
                    <span className="grip" aria-hidden>⠿</span>
                    <input
                      type="color"
                      className="colorpick"
                      value={drafts[status].color}
                      onChange={(e) => edit(status, { color: e.target.value.toLowerCase() })}
                      aria-label={`${DEFAULT_LEAD_STAGES[status].label} colour`}
                    />
                    <input
                      value={drafts[status].label}
                      maxLength={40}
                      onChange={(e) => edit(status, { label: e.target.value })}
                      aria-label={`${DEFAULT_LEAD_STAGES[status].label} label`}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={isDefault}
                      onClick={() => resetRow(status)}
                      title="Reset to default label and colour"
                    >
                      Reset
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={!dirty || saving || hasEmptyLabel}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {savedAt ? <span className="hint" style={{ margin: 0 }}><b>Saved.</b></span> : null}
            </div>
          </>
        )}
      </fieldset>
    </Card>
  );
}

export default function OrgSettingsPage() {
  const { accessToken, updateOrganisation, hasPermission } = useAuth();
  const router = useRouter();
  // Settings pills (enforced for the org admin too); the Domain, Billing, CRM
  // option lists and Project Catalogs sections follow their own modules.
  const canViewSettings = hasPermission("settings", "view");
  const canEditProfile = hasPermission("settings", SETTINGS_ACTIONS.editProfile);
  const canEditEmail = hasPermission("settings", SETTINGS_ACTIONS.editEmail);
  const canEditPipeline = hasPermission("settings", SETTINGS_ACTIONS.editPipeline);
  const canViewDomain = hasPermission("domains", "view");
  const canRequestDomain = hasPermission("domains", "add");
  const canViewBilling = hasPermission("billing", "view");
  const canEditBilling = hasPermission("billing", "edit");
  const canViewProjects = hasPermission("projects", "view");
  const canAddProjectConfig = hasPermission("projects", "add");
  const canEditProjectConfig = hasPermission("projects", "edit");
  const canDeleteProjectConfig = hasPermission("projects", "delete");
  const sectionAllowed = (s: string) => {
    if (s === "domain") return canViewDomain;
    if (s === "billing") return canViewBilling;
    if (s === "crm" || s === "catalogs") return canViewProjects;
    if (s === "marketing") {
      return hasPermission("crm", "view") || hasPermission("integrations", "view") || canViewSettings;
    }
    return canViewSettings;
  };
  useEffect(() => {
    if (accessToken && !canViewSettings) router.replace("/org");
  }, [accessToken, canViewSettings, router]);
  const [section, setSection] = useState("general");
  const [org, setOrg] = useState<SafeOrganisation | null>(null);
  const [form, setForm] = useState<GeneralBrandingForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [billing, setBilling] = useState<OrgBillingSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [plansCycle, setPlansCycle] = useState<"monthly" | "yearly">("monthly");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeOk, setChangeOk] = useState<string | null>(null);
  const [renewLoading, setRenewLoading] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewOk, setRenewOk] = useState<string | null>(null);

  const [pendingChangeRequest, setPendingChangeRequest] = useState<PackageChangeRequestRow | null>(null);
  const [latestRejectedChangeRequest, setLatestRejectedChangeRequest] = useState<PackageChangeRequestRow | null>(null);
  const [requestModalPlan, setRequestModalPlan] = useState<Plan | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [cancelingRequest, setCancelingRequest] = useState(false);
  const PLAN_CHANGE_ERROR = "We couldn't switch plans right now. Please review your current usage and try again with a suitable plan.";

  const loadPendingRequest = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await getOrgPackageChangeRequest();
      setPendingChangeRequest(res.pendingRequest);
      setLatestRejectedChangeRequest(
        res.history.find((request) => request.status === "rejected") ?? null,
      );
    } catch {
      // ignore
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPendingRequest();
  }, [loadPendingRequest]);

  async function handleSubmitPackageChangeRequest() {
    if (!requestModalPlan) return;
    setSubmittingRequest(true);
    setChangeError(null);
    setChangeOk(null);
    try {
      const req = await submitPackageChangeRequest({
        targetPlanId: requestModalPlan.id,
        billingCycle: plansCycle,
      });
      setPendingChangeRequest(req);
      setRequestModalPlan(null);
      setChangeOk(`Package change request to "${requestModalPlan.name}" submitted successfully. Awaiting Super Admin approval.`);
    } catch (err) {
      const current = await getOrgPackageChangeRequest().catch(() => null);
      if (current?.pendingRequest) {
        setPendingChangeRequest(current.pendingRequest);
        setRequestModalPlan(null);
        setChangeOk("A package change request is already pending Super Admin approval.");
        return;
      }
      setChangeError(PLAN_CHANGE_ERROR);
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function handleCancelPackageChangeRequest() {
    if (!pendingChangeRequest) return;
    setCancelingRequest(true);
    setChangeError(null);
    setChangeOk(null);
    try {
      await cancelPackageChangeRequest(pendingChangeRequest.id);
      setPendingChangeRequest(null);
      setChangeOk("Package change request cancelled successfully.");
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : "Failed to cancel request.");
    } finally {
      setCancelingRequest(false);
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!accessToken) return;
    setLoading(true);
    apiFetch<SafeOrganisation>("/org/settings", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => { setOrg(res); setForm(formToOrg(res)); })
      .catch((err) => setSaveError(err instanceof Error ? err.message : "Failed to load settings."))
      .finally(() => setLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !canViewBilling) return;
    apiFetch<OrgBillingSummary>("/org/billing", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(setBilling).catch((err) => setBillingError(err instanceof Error ? err.message : "Failed to load billing."))
      .finally(() => setBillingLoading(false));
  }, [accessToken, canViewBilling]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!accessToken || !canViewBilling) return;
    setPlansLoading(true); setInvoicesLoading(true);
    Promise.all([getPlans(), getInvoices()])
      .then(([p, inv]) => { setPlans(p); setInvoices(inv); })
      .catch(() => { })
      .finally(() => { setPlansLoading(false); setInvoicesLoading(false); });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [accessToken, canViewBilling]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const wanted = new URLSearchParams(window.location.search).get("section");
    const valid: string[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.s));
    if (wanted && valid.includes(wanted)) setSection(wanted);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function markDirty() { setDirty(true); setSaved(false); }

  function updateForm(patch: Partial<GeneralBrandingForm>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev)); markDirty();
  }

  // Logo + favicon share one presigned-upload flow against the org-scoped
  // endpoint (key is scoped to the caller's org server-side). The URL lands
  // in the form and is persisted on the next "Save changes".
  async function handleAssetUpload(kind: "logo" | "favicon", file: File) {
    if (!accessToken) return;
    const setBusy = kind === "logo" ? setLogoUploading : setFaviconUploading;
    const key: "logoUrl" | "faviconUrl" = kind === "logo" ? "logoUrl" : "faviconUrl";
    setSaveError(null);
    setBusy(true);
    try {
      const { uploadUrl, publicUrl } = await apiFetch<{ uploadUrl: string; publicUrl: string }>(
        `/org/settings/${kind}-upload-url`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
        },
      );
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      updateForm({ [key]: publicUrl });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Upload failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleCountryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const country = e.target.value;
    const meta = COUNTRY_META[country];
    if (meta) {
      updateForm({ country, currency: meta.currency, timezone: meta.timezone });
    } else {
      updateForm({ country });
    }
  }

  async function handleSave() {
    if (!form || !accessToken) return;
    setSaveError(null); setSaving(true);
    try {
      const body: UpdateOrganisationSettingsInput = {
        name: form.name, city: form.city, country: form.country, addressLine1: form.addressLine1,
        addressLine2: form.addressLine2, state: form.state, postalCode: form.postalCode,
        timezone: form.timezone, currency: form.currency,
        defaultLanguage: form.defaultLanguage, brandColour: form.brandColour,
        logoUrl: form.logoUrl, faviconUrl: form.faviconUrl,
        legalName: form.legalName || undefined,
        industry: form.industry || undefined,
        supportEmail: form.supportEmail || undefined,
        supportPhone: form.supportPhone || undefined,
      };
      const updated = await apiFetch<SafeOrganisation>("/org/settings", {
        method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body),
      });
      setOrg(updated); setForm(formToOrg(updated)); setSaved(true); setDirty(false);
      updateOrganisation(updated);
      window.dispatchEvent(new CustomEvent(ORG_THEME_CHANGE_EVENT, { detail: { brandColour: updated.brand_colour } }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally { setSaving(false); }
  }

  function handleDiscard() {
    if (!org) return;
    setForm(formToOrg(org)); setDirty(false); setSaved(false); setSaveError(null);
    window.dispatchEvent(new CustomEvent(ORG_THEME_CHANGE_EVENT, { detail: { brandColour: org.brand_colour } }));
  }

  async function handleChangePlan(planId: string, cycle: "monthly" | "yearly" = plansCycle) {
    if (!accessToken) return;
    setChangeError(null); setChangeOk(null); setChangeLoading(true);
    try {
      const res: ChangePlanResult = await changePlan({ planId, billingCycle: cycle });
      setChangeOk(`Switched to the ${res.planName} plan (${cycle === "yearly" ? "billed yearly" : "billed monthly"}).`);
      const b = await apiFetch<OrgBillingSummary>("/org/billing", { headers: { Authorization: `Bearer ${accessToken}` } });
      setBilling(b); if (b.subscription) setPlansCycle(b.subscription.billingCycle);
    } catch { setChangeError(PLAN_CHANGE_ERROR); }
    finally { setChangeLoading(false); }
  }

  async function handleRenew() {
    if (!accessToken) return;
    setRenewError(null); setRenewOk(null); setRenewLoading(true);
    try {
      const res: BillingRenewResult = await renewSubscription();
      const b = await apiFetch<OrgBillingSummary>("/org/billing", { headers: { Authorization: `Bearer ${accessToken}` } });
      setBilling(b);
      setRenewOk(`${res.status === "active" ? "Subscription renewed" : "Subscription updated"} — renews on ${res.renewsAt ? formatDate(res.renewsAt) : "your plan's term"}.`);
    } catch (err) { setRenewError(err instanceof Error ? err.message : "Failed to renew subscription."); }
    finally { setRenewLoading(false); }
  }

  if (loading || !org || !form) {
    return <div className="card"><div className="card-b"><p className="muted">Loading settings…</p></div></div>;
  }

  const q = navQuery.trim().toLowerCase();
  const filteredGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => sectionAllowed(it.s) && (q ? it.t.toLowerCase().includes(q) : true)),
  })).filter((g) => g.items.length > 0);

  const activeSection = sectionAllowed(section) && !HIDDEN_SECTIONS.has(section)
    ? section
    : NAV_GROUPS.flatMap((g) => g.items.map((i) => i.s as string)).find(sectionAllowed) ?? section;

  const saveButton = !canEditProfile ? null : (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {dirty ? (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 46, padding: "0 22px", borderRadius: 12, fontSize: 14.5 }}
          onClick={handleDiscard}
          disabled={saving}
        >
          Discard
        </button>
      ) : null}
      <button
        type="button"
        className="set-save-btn"
        onClick={() => void handleSave()}
        disabled={saving}
      >
        <Icon name="check" size={16} />
        <span>{saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}</span>
      </button>
    </div>
  );

  return (
    <>
      {requestModalPlan ? (
        <FormModal
          open
          onClose={() => {
            if (!submittingRequest) setRequestModalPlan(null);
          }}
          title="Request package change"
          description="Review package change details before submitting for Super Admin approval."
          busy={submittingRequest}
          size="lg"
          onSubmit={() => void handleSubmitPackageChangeRequest()}
        >
          <div>
            <FormAlert message={changeError} />

            <FormSection title="Summary" />
            <div style={{ padding: 16, background: "var(--surface-2, #f8fafc)", borderRadius: 12, fontSize: 14, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <span className="muted">Current Package:</span>
                <strong>{billing?.plan?.name ?? "Current Plan"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <span className="muted">New Requested Package:</span>
                <strong style={{ color: "var(--brand)" }}>{requestModalPlan.name} ({plansCycle})</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span className="muted">Price Difference:</span>
                <strong>
                  {formatMoney(
                    (plansCycle === "yearly" ? requestModalPlan.priceYearly : requestModalPlan.priceMonthly) -
                    (billing?.plan ? (plansCycle === "yearly" ? billing.plan.priceYearly : billing.plan.priceMonthly) : 0),
                    billing?.subscription?.currency ?? "INR"
                  )} / {plansCycle === "yearly" ? "year" : "month"}
                </strong>
              </div>
            </div>

            <FormSection title="Key feature & limit changes" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 20 }}>
              <div style={{ border: "1px solid var(--line-2, #e2e8f0)", borderRadius: 12, padding: 16 }}>
                <span className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", fontWeight: 600 }}>Current ({billing?.plan?.name}):</span>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                  <li>Projects: {billing?.plan?.limits?.projects ?? "Unlimited"}</li>
                  <li>Users: {billing?.plan?.limits?.users ?? "Unlimited"}</li>
                  <li>Templates: {billing?.plan?.limits?.templates ?? "Unlimited"}</li>
                  <li>Published Landing Pages: {billing?.plan?.limits?.landingPages ?? "Unlimited"}</li>
                  <li>Created Landing Pages: {billing?.plan?.limits?.landingPagesCreate ?? "Unlimited"}</li>
                </ul>
              </div>
              <div style={{ border: "1px solid var(--line-2, #e2e8f0)", borderRadius: 12, padding: 16 }}>
                <span className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", fontWeight: 600 }}>New ({requestModalPlan.name}):</span>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--brand)" }}>
                  <li>Projects: {requestModalPlan.limits?.projects ?? "Unlimited"}</li>
                  <li>Users: {requestModalPlan.limits?.users ?? "Unlimited"}</li>
                  <li>Templates: {requestModalPlan.limits?.templates ?? "Unlimited"}</li>
                  <li>Published Landing Pages: {requestModalPlan.limits?.landingPages ?? "Unlimited"}</li>
                  <li>Created Landing Pages: {requestModalPlan.limits?.landingPagesCreate ?? "Unlimited"}</li>
                </ul>
              </div>
            </div>

            <div style={{ padding: "12px 16px", background: "rgba(21, 27, 46, 0.06)", border: "1px solid rgba(21, 27, 46, 0.2)", borderRadius: 10, fontSize: 13, color: "var(--ink)", marginBottom: 8 }}>
              <Icon name="info" size={14} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--brand)" }} />
              This request will be submitted for <strong>Super Admin approval</strong>. Your organisation will continue using your current active package until approved.
            </div>

            <FormActions
              onCancel={() => {
                if (!submittingRequest) setRequestModalPlan(null);
              }}
              busy={submittingRequest}
              busyLabel="Submitting Request…"
              submitLabel="Confirm Change Request"
            />
          </div>
        </FormModal>
      ) : null}
    <div className="os-page">
      <div className="set-header reveal in">
        <div className="set-header-left">
          <div className="set-header-badge">
            <Icon name="settings" size={26} />
          </div>
          <div className="set-header-htext">
            <div className="set-header-eyebrow">ORGANISATION SETTINGS</div>
            <h1 className="set-header-title">Organisation Settings</h1>
            <div className="set-header-sub">Manage your organisation details, domain, localization, and system configurations.</div>
          </div>
        </div>
      </div>
      {saveError ? <div className="form-alert">{saveError}</div> : null}

      <div className="os-grid">
        <aside className="os-nav">
          <div className="os-nav-search">
            <Icon name="search" size={15} />
            <input
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder="Search settings…"
              aria-label="Search settings"
            />
          </div>
          <div className="os-nav-groups">
            {filteredGroups.length === 0 ? (
              <div className="os-nav-empty">No settings match “{navQuery}”.</div>
            ) : filteredGroups.map((g) => (
              <div className="os-nav-group" key={g.grp}>
                <div className="os-nav-group-title">{g.grp}</div>
                {g.items.map((it) => (
                  <button
                    key={it.s}
                    className={`os-nav-item${activeSection === it.s ? " on" : ""}`}
                    onClick={() => setSection(it.s)}
                  >
                    <span className="os-nav-ic"><Icon name={it.icon} size={16} /></span>
                    <span className="os-nav-label">{it.t}</span>
                    <span className="os-nav-arrow"><Icon name="chevron-right" size={14} /></span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <div className="os-content">
          <fieldset disabled={!canEditProfile} style={READ_ONLY_FIELDSET}>
            {/* GENERAL */}
            <div className={`os-section${activeSection === "general" ? " on" : ""}`}>
              <Card
                icon="building"
                title="General Information"
                sub="Update your organisation's basic details and contact information."
                action={saveButton}
              >
                <div className="set-form-grid">
                  <div className="set-row-2">
                    <div className="set-field">
                      <label>Organisation name <span className="set-req">*</span></label>
                      <div className="set-input-box">
                        <span className="set-field-ic"><Icon name="building" size={16} /></span>
                        <input
                          className="inp"
                          value={form.name}
                          onChange={(e) => updateForm({ name: e.target.value })}
                          placeholder="Miraclecare"
                        />
                      </div>
                    </div>
                    <div className="set-field">
                      <label>Legal / registered name</label>
                      <div className="set-input-box">
                        <span className="set-field-ic"><Icon name="document" size={16} /></span>
                        <input
                          className="inp"
                          value={form.legalName}
                          onChange={(e) => updateForm({ legalName: e.target.value })}
                          placeholder="Skyline Developers Pvt. Ltd."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="set-field">
                    <label>Industry <span className="set-req">*</span></label>
                    <div className="set-input-box">
                      <span className="set-field-ic"><Icon name="tag" size={16} /></span>
                      <select
                        className="inp"
                        value={form.industry}
                        onChange={(e) => updateForm({ industry: e.target.value as OrgIndustry })}
                      >
                        <option value="">Select industry…</option>
                        {INDUSTRY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="set-row-2">
                    <div className="set-field">
                      <label>Support email <span className="set-req">*</span></label>
                      <div className="set-input-box">
                        <span className="set-field-ic"><Icon name="mail" size={16} /></span>
                        <input
                          className="inp"
                          type="email"
                          value={form.supportEmail}
                          onChange={(e) => updateForm({ supportEmail: e.target.value })}
                          placeholder="care@skylinedev.in"
                        />
                      </div>
                    </div>
                    <div className="set-field">
                      <label>Support phone</label>
                      <div className="set-phone-group">
                        <span className="set-phone-ic"><Icon name="phone" size={15} /></span>
                        <span className="set-phone-flag" title="India">
                          🇮🇳 <Icon name="chevron-down" size={12} style={{ color: "#94a3b8" }} />
                        </span>
                        <input
                          className="set-phone-input"
                          value={form.supportPhone}
                          onChange={(e) => updateForm({ supportPhone: e.target.value })}
                          placeholder="+91 79000 12345"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="set-row-2">
                    <div className="set-field">
                      <label>Country <span className="set-req">*</span></label>
                      <div className="set-input-box">
                        <span className="set-field-ic"><Icon name="globe" size={16} /></span>
                        <select className="inp" value={form.country} onChange={handleCountryChange}>
                          <option value="">Select country…</option>
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      {form.country && COUNTRY_META[form.country] ? (
                        <div className="set-country-hint">
                          <span className="set-country-check"><Icon name="check" size={13} /></span>
                          <span>Auto-set from {form.country}: Currency <b>{COUNTRY_META[form.country].currency}</b> · Timezone <b>{COUNTRY_META[form.country].timezone}</b></span>
                        </div>
                      ) : null}
                    </div>
                    <div className="set-field">
                      <label>City <span className="set-req">*</span></label>
                      <div className="set-input-box">
                        <span className="set-field-ic"><Icon name="pin" size={16} /></span>
                        <input
                          className="inp"
                          value={form.city}
                          onChange={(e) => updateForm({ city: e.target.value })}
                          placeholder="Bengaluru"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="set-row-2">
                    <div className="set-field">
                      <label>State</label>
                      <div className="set-input-box">
                        <span className="set-field-ic"><Icon name="building" size={16} /></span>
                        <input
                          className="inp"
                          value={form.state}
                          onChange={(e) => updateForm({ state: e.target.value })}
                          placeholder="Karnataka"
                        />
                      </div>
                    </div>
                    <div className="set-field">
                      <label>Postal code</label>
                      <div className="set-input-box">
                        <span className="set-field-ic"><Icon name="mail" size={16} /></span>
                        <input
                          className="inp inp-mono"
                          value={form.postalCode}
                          onChange={(e) => updateForm({ postalCode: e.target.value })}
                          placeholder="560001"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="set-field">
                    <label>Registered address</label>
                    <div className="set-input-box set-is-textarea">
                      <span className="set-field-ic"><Icon name="pin" size={16} /></span>
                      <textarea
                        className="inp"
                        rows={2}
                        value={form.addressLine1}
                        onChange={(e) => updateForm({ addressLine1: e.target.value })}
                        placeholder="123, Prestige Tech Park, Outer Ring Road, Bengaluru, Karnataka – 560001, India"
                      />
                    </div>
                  </div>

                  <div className="set-field" style={{ marginBottom: 0 }}>
                    <label>Address line 2</label>
                    <div className="set-input-box">
                      <span className="set-field-ic"><Icon name="pin" size={16} /></span>
                      <input
                        className="inp"
                        value={form.addressLine2}
                        onChange={(e) => updateForm({ addressLine2: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* BRANDING */}
            <div className={`os-section${activeSection === "branding" ? " on" : ""}`}>
              <SectionHead section="branding" />
              <Card icon="sparkles" title="Logo & identity" sub="Shown across the app, landing pages & emails">
                <div className="row2">
                  <div className="field">
                    <label>Logo</label>
                    <AssetField
                      value={form.logoUrl}
                      uploading={logoUploading}
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      uploadedLabel="Logo uploaded"
                      onPick={(file) => void handleAssetUpload("logo", file)}
                      onRemove={() => updateForm({ logoUrl: "" })}
                    />
                  </div>
                  <div className="field">
                    <label>Favicon</label>
                    <AssetField
                      value={form.faviconUrl}
                      uploading={faviconUploading}
                      accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
                      uploadedLabel="Favicon uploaded"
                      onPick={(file) => void handleAssetUpload("favicon", file)}
                      onRemove={() => updateForm({ faviconUrl: "" })}
                    />
                  </div>
                </div>
                <div className="field"><label>Brand colour</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <input
                      type="color"
                      className="colorpick"
                      value={/^#[0-9a-f]{6}$/i.test(form.brandColour) ? form.brandColour : "#0f1424"}
                      onChange={(e) => {
                        const color = e.target.value;
                        updateForm({ brandColour: color });
                        window.dispatchEvent(new CustomEvent(ORG_THEME_CHANGE_EVENT, { detail: { brandColour: color } }));
                      }}
                      aria-label="Pick a brand colour"
                    />
                    <input
                      type="text"
                      className="inp"
                      style={{ width: 110, fontFamily: "monospace", textTransform: "uppercase", padding: "6px 10px" }}
                      value={form.brandColour}
                      onChange={(e) => {
                        const color = e.target.value;
                        updateForm({ brandColour: color });
                        if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
                          window.dispatchEvent(new CustomEvent(ORG_THEME_CHANGE_EVENT, { detail: { brandColour: color } }));
                        }
                      }}
                      placeholder="#0F1424"
                    />
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginLeft: 4 }}>
                      {ORG_COLOR_PRESETS.map((p) => {
                        const isSel = form.brandColour.toLowerCase() === p.hex.toLowerCase();
                        return (
                          <button
                            key={p.hex}
                            type="button"
                            onClick={() => {
                              updateForm({ brandColour: p.hex });
                              window.dispatchEvent(new CustomEvent(ORG_THEME_CHANGE_EVENT, { detail: { brandColour: p.hex } }));
                            }}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: p.hex,
                              border: isSel ? "2px solid #fff" : "1px solid rgba(0,0,0,0.15)",
                              outline: isSel ? `2px solid ${p.hex}` : "none",
                              cursor: "pointer",
                              padding: 0,
                              boxShadow: isSel ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
                            }}
                            title={p.label}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* TODO: Email sender name — disabled "coming soon" input.
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Email sender name</label>
                <input className="inp" value="" disabled placeholder="Coming soon — part of the Email module" />
              </div>
              */}
              </Card>
            </div>

            {/* LOCALIZATION */}
            <div className={`os-section${activeSection === "localization" ? " on" : ""}`}>
              <SectionHead section="localization" />
              <Card icon="globe" title="Formats & language" sub="Regional preferences">
                <div className="row3">
                  <div className="field"><label>Timezone</label><select className="inp" value={form.timezone} onChange={(e) => updateForm({ timezone: e.target.value })}>{!TIMEZONE_OPTIONS.some((t) => t.value === form.timezone) && form.timezone ? <option value={form.timezone}>{form.timezone}</option> : null}{TIMEZONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  <div className="field"><label>Currency</label><select className="inp" value={form.currency} onChange={(e) => updateForm({ currency: e.target.value })}>{!CURRENCY_OPTIONS.some((c) => c.value === form.currency) && form.currency ? <option value={form.currency}>{form.currency}</option> : null}{CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                  <div className="field"><label>Language</label><select className="inp" value={form.defaultLanguage} onChange={(e) => updateForm({ defaultLanguage: e.target.value })}>{!LANGUAGES.some((l) => l.value === form.defaultLanguage) && form.defaultLanguage ? <option value={form.defaultLanguage}>{form.defaultLanguage}</option> : null}{LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
                </div>
                {/* TODO: Number/Date/Time format & Week starts — disabled "coming soon" selects.
              <div className="row3">
                <div className="field"><label>Number format</label><select className="inp" value="" disabled><option value="">Coming soon</option></select></div>
                <div className="field"><label>Date format</label><select className="inp" value="" disabled><option value="">Coming soon</option></select></div>
                <div className="field"><label>Time format</label><select className="inp" value="" disabled><option value="">Coming soon</option></select></div>
              </div>
              <div className="field" style={{ marginBottom: 0, maxWidth: "calc(33.33% - 8px)" }}>
                <label>Week starts</label><select className="inp" value="" disabled><option value="">Coming soon</option></select>
              </div>
              */}
              </Card>
            </div>

          </fieldset>

          {/* DOMAIN */}
          <div className={`os-section${activeSection === "domain" ? " on" : ""}`}>
            <SectionHead section="domain" />
            {canViewDomain ? <DomainSection canRequest={canRequestDomain} /> : null}
          </div>

          {/* CRM */}
          <div className={`os-section${activeSection === "crm" ? " on" : ""}`}>
            <SectionHead section="crm" />
            {/* TODO: static Lead capture & Required fields cards — toggles/pills not persisted.
            <Card icon="crm" title="Lead capture & behaviour" sub="How leads are created and handled">
              <div className="card-b" style={{ padding: 0 }}>
                {[
                  ["Auto-create lead on form submit", "Every website / landing-page submission becomes a lead.", true],
                  ["Capture UTM & ad attribution", "Store source, campaign, ad set and UTM on each lead.", true],
                  ["Require phone number", "Reject leads without a valid phone.", true],
                  ["Merge duplicate leads", "Detect duplicates by phone / email and merge automatically.", true],
                  ["Recycle idle leads", "Return leads with no activity for 7+ days to the pool.", false],
                ].map(([t, d, on]) => (
                  <div className="swrow" key={t as string}>
                    <div className="tx"><b>{t as string}</b><div className="muted">{d as string}</div></div>
                    <Toggle on={on as boolean} />
                  </div>
                ))}
              </div>
            </Card>
            <Card icon="puzzle" title="Required fields" sub="Fields an agent must fill before saving">
              <div className="pill-list">
                {["Name", "Phone", "Project", "Budget", "Source"].map((p) => <span key={p} className="pill">{p}<span className="x">×</span></span>)}
                <span className="pill" style={{ cursor: "pointer", color: "var(--brand)" }}>+ Add field</span>
              </div>
            </Card>
            */}
            {canViewProjects ? (
              <CatalogSection
                groups={LEAD_CATALOG_GROUPS}
                canAdd={canAddProjectConfig}
                canDelete={canDeleteProjectConfig}
                heading={{
                  title: "Lead option lists",
                  sub: "Tags and the Requirement-section dropdown choices on the lead edit page. Each list starts empty — build it from your own options. (Configuration, Facing and Parking are shared lists — manage those under Project Catalogs.)",
                }}
              />
            ) : null}
          </div>

          {/* MARKETING */}
          <div className={`os-section${activeSection === "marketing" ? " on" : ""}`}>
            <SectionHead section="marketing" />
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-h">
                <span className="t">Marketing workspace</span>
              </div>
              <div className="card-b">
                <p className="muted" style={{ marginTop: 0 }}>
                  Manage ad platforms, campaigns, sources and UTM tracking from the
                  Marketing section in the sidebar.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  {[
                    ["/org/marketing", "Marketing Dashboard", "KPIs, charts and campaign performance"],
                    ["/org/marketing/apps", "Connected Apps", "Meta, Google Ads, LinkedIn, Website"],
                    ["/org/marketing/campaigns", "Campaigns", "Synced campaign performance"],
                    ["/org/marketing/sources", "Lead Sources", "Where leads originated"],
                    ["/org/marketing/utm", "UTM Tracking", "Website attribution parameters"],
                  ].map(([href, title, sub]) => (
                    <a
                      key={href}
                      href={href}
                      className="card"
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        padding: "12px 14px",
                        border: "1px solid var(--border, #e2e8f0)",
                        borderRadius: 10,
                        display: "block",
                      }}
                    >
                      <strong style={{ fontSize: 13 }}>{title}</strong>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {sub}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <MetaLeadAdsCard />
          </div>

          {/* FIELDS */}
          {/* TODO: static Custom Attributes — hardcoded sample attributes, Edit/Add not wired.
          <div className={`os-section${activeSection === "fields" ? " on" : ""}`}>
            <SectionHead section="fields" />
            <Card icon="puzzle" title="Custom attributes" sub="Add your own fields to leads, contacts, projects & bookings">
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Label</th><th>API key</th><th>Type</th><th>Entity</th><th>Required</th><th /></tr></thead>
                <tbody>
                  {[
                    ["Preferred floor", "preferred_floor", "Dropdown", "Lead", false],
                    ["Loan status", "loan_status", "Dropdown", "Lead", true],
                    ["Possession timeline", "possession_timeline", "Dropdown", "Lead", false],
                    ["Co-applicant name", "co_applicant", "Text", "Lead", false],
                    ["Carpet area (sqft)", "carpet_area", "Number", "Project unit", true],
                  ].map((r) => (
                    <tr key={r[1] as string}>
                      <td>{r[0] as string}</td><td><span className="mono">{r[1] as string}</span></td><td>{r[2] as string}</td><td>{r[3] as string}</td>
                      <td>{r[4] ? <span className="badge b-green">Yes</span> : <span className="badge b-gray">No</span>}</td>
                      <td><button className="btn btn-ghost btn-sm">Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>+ Add attribute</button>
            </Card>
          </div>
          */}

          {/* PIPELINE */}
          <div className={`os-section${activeSection === "pipeline" ? " on" : ""}`}>
            <SectionHead section="pipeline" />
            <PipelineStagesCard canEdit={canEditPipeline} />
            {/* TODO: static Lost reasons & Lead sources cards — fixed pills, add/remove not wired.
            <Card icon="modules" title="Lost reasons" sub="Why deals are marked lost">
              <div className="pill-list">
                {["Budget mismatch", "Bought elsewhere", "Not responding", "Location not suitable", "Just browsing"].map((p) => <span key={p} className="pill">{p}<span className="x">×</span></span>)}
                <span className="pill" style={{ cursor: "pointer", color: "var(--brand)" }}>+ Add</span>
              </div>
            </Card>
            <Card icon="modules" title="Lead sources" sub="Channels leads can come from">
              <div className="pill-list">
                {["Meta Ads", "Google Ads", "Website", "99acres", "MagicBricks", "Walk-in", "Referral", "Channel partner"].map((p) => <span key={p} className="pill">{p}<span className="x">×</span></span>)}
                <span className="pill" style={{ cursor: "pointer", color: "var(--brand)" }}>+ Add source</span>
              </div>
            </Card>
            */}
          </div>

          {/* CATALOGS */}
          <div className={`os-section${activeSection === "catalogs" ? " on" : ""}`}>
            <SectionHead section="catalogs" />
            {canViewProjects ? (
              <>
                <ProjectTypesSection
                  canAdd={canAddProjectConfig}
                  canEdit={canEditProjectConfig}
                  canDelete={canDeleteProjectConfig}
                />
                <CatalogSection canAdd={canAddProjectConfig} canDelete={canDeleteProjectConfig} />
              </>
            ) : null}
          </div>

          {/* SCORING */}
          {/* TODO: static Scoring & Assignment — hardcoded scoring rules & assignment settings, not persisted.
          <div className={`os-section${activeSection === "scoring" ? " on" : ""}`}>
            <SectionHead section="scoring" />
            <Card icon="star" title="Lead scoring" sub="Points that make a lead Hot / Warm / Cold">
              <div className="card-b" style={{ padding: 0 }}>
                {[["Budget matches project", "+30"], ["Responded within 1 hour", "+20"], ["Booked a site visit", "+25"], ["Loan pre-approved", "+15"], ["No activity 7 days", "-20"]].map(([t, v]) => (
                  <div className="swrow" key={t as string}><div className="tx"><b>{t as string}</b><div className="muted">{v as string} points</div></div><input className="inp" style={{ width: 80 }} defaultValue={v as string} /></div>
                ))}
                <div className="row3" style={{ marginTop: 16, padding: "4px 0 0" }}>
                  <div className="field"><label><Icon name="flame" size={14} style={{ verticalAlign: "-2px", marginRight: 3 }} /> Hot ≥</label><input className="inp" defaultValue="75" /></div>
                  <div className="field"><label><Icon name="sun" size={14} style={{ verticalAlign: "-2px", marginRight: 3 }} /> Warm ≥</label><input className="inp" defaultValue="45" /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label><Icon name="snowflake" size={14} style={{ verticalAlign: "-2px", marginRight: 3 }} /> Cold below</label><input className="inp" defaultValue="45" /></div>
                </div>
              </div>
            </Card>
            <Card icon="modules" title="Assignment rules" sub="How new leads are distributed">
              <div className="field" style={{ marginBottom: 16 }}><label>Method</label><select className="inp"><option>Round-robin within team</option><option>Load-balanced (fewest open leads)</option><option>By project owner</option><option>Manual</option></select></div>
              <div className="swrow"><div className="tx"><b>Skip offline agents</b><div className="muted">Only assign to agents who are online.</div></div><Toggle on /></div>
              <div className="swrow" style={{ borderBottom: 0 }}><div className="tx"><b>Cap leads per agent/day</b></div><input className="inp" style={{ width: 80 }} defaultValue="25" /></div>
            </Card>
          </div>
          */}

          {/* AUTOMATION */}
          {/* TODO: static Automation & SLA — hardcoded toggles & SLA target, not persisted.
          <div className={`os-section${activeSection === "automation" ? " on" : ""}`}>
            <SectionHead section="automation" />
            <Card icon="link" title="Response SLA" sub="Targets & escalation">
              <div className="card-b" style={{ padding: 0 }}>
                <div className="swrow"><div className="tx"><b>First-response target</b></div><select className="inp" style={{ width: "auto" }}><option>5 min</option><option>15 min</option><option>30 min</option><option>1 hour</option></select></div>
                <div className="swrow"><div className="tx"><b>Escalate breaches to manager</b><div className="muted">Alert the team lead when SLA is missed.</div></div><Toggle on /></div>
                <div className="swrow" style={{ borderBottom: 0 }}><div className="tx"><b>AI call new leads instantly</b><div className="muted">Auto-dial and qualify within 60 seconds.</div></div><Toggle on /></div>
              </div>
            </Card>
            <Card icon="link" title="Automations" sub="Trigger-based workflows">
              <div className="card-b" style={{ padding: 0 }}>
                {[["WhatsApp welcome on new lead", "Send brochure + booking link automatically.", true], ["Follow-up reminder", "Nudge agent if a lead sits in Follow-up for 2 days.", true], ["Site-visit reminder", "WhatsApp the buyer 24h before a booked visit.", true], ["Re-engage cold leads", "Drip campaign to leads cold for 14 days.", false]].map(([t, d, on]) => (
                  <div className="swrow" key={t as string}><div className="tx"><b>{t as string}</b><div className="muted">{d as string}</div></div><Toggle on={on as boolean} /></div>
                ))}
              </div>
            </Card>
          </div>
          */}

          {/* WHATSAPP */}
          <div className={`os-section${activeSection === "whatsapp" || activeSection === "comms" ? " on" : ""}`}>
            <SectionHead section="whatsapp" />
            <Card icon="phone" title="WhatsApp Business" sub="Shared business number, templates & automation">
              <div className="set-row-2">
                <div className="set-field">
                  <label>Business WhatsApp number</label>
                  <div className="set-phone-group">
                    <span className="set-phone-ic"><Icon name="phone" size={15} /></span>
                    <span className="set-phone-flag">🇮🇳 <Icon name="chevron-down" size={12} style={{ color: "#94a3b8" }} /></span>
                    <input className="set-phone-input" defaultValue="+91 79000 12345" />
                  </div>
                </div>
                <div className="set-field">
                  <label>Display name</label>
                  <div className="set-input-box">
                    <span className="set-field-ic"><Icon name="building" size={16} /></span>
                    <input className="inp" defaultValue={form.name || "Skyline Developers"} />
                  </div>
                </div>
              </div>
              <div className="swrow" style={{ marginTop: 16 }}>
                <div className="tx"><b>Auto-assign chats to lead owner</b><div className="muted">Route incoming messages automatically to the assigned sales agent</div></div>
                <Toggle on />
              </div>
              <div className="swrow" style={{ borderBottom: 0 }}>
                <div className="tx"><b>Send read receipts &amp; delivery status</b><div className="muted">Track whether leads read outbound WhatsApp campaigns</div></div>
                <Toggle on />
              </div>
            </Card>
          </div>

          {/* EMAIL */}
          <div className={`os-section${activeSection === "email" ? " on" : ""}`}>
            <SectionHead section="email" />
            <Card icon="mail" title="Organisation SMTP" sub="Used for team invites, password resets and notifications from this workspace">
              <fieldset disabled={!canEditEmail} style={READ_ONLY_FIELDSET}>
                <OrgSmtpSettings />
              </fieldset>
            </Card>
          </div>

          {/* NOTIFICATIONS */}
          {/* TODO: static Notifications — hardcoded event/channel toggles, not persisted.
          <div className={`os-section${activeSection === "notifications" ? " on" : ""}`}>
            <SectionHead section="notifications" />
            <Card icon="bell" title="Notifications" sub="Channels per event type">
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Event</th><th>Email</th><th>WhatsApp</th><th>In-app</th></tr></thead>
                <tbody>
                  {[["New lead assigned", true, true, true], ["Lead tagged to me", false, true, true], ["Follow-up due", true, false, true], ["Site visit booked", true, true, true], ["Deal won", true, false, true], ["SLA breach", true, false, true], ["Daily summary", true, false, false], ["Weekly report", true, false, false]].map(([t, e, w, a]) => (
                    <tr key={t as string}>
                      <td>{t as string}</td>
                      <td><Toggle on={e as boolean} /></td><td><Toggle on={w as boolean} /></td><td><Toggle on={a as boolean} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Card>
          </div>
          */}

          {/* DATA */}
          {/* TODO: static Data & Import — import drop zone & export buttons have no handlers.
          <div className={`os-section${activeSection === "data" ? " on" : ""}`}>
            <SectionHead section="data" />
            <Card icon="document" title="Import & export" sub="Move data in and out">
              <div className="row2">
                <div className="field"><label>Import leads</label><div className="drop"><Icon name="download" size={16} /> Upload CSV / Excel · <span style={{ color: "var(--brand)", fontWeight: 600 }}>browse</span></div></div>
                <div className="field"><label>Export</label><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button className="btn btn-ghost btn-block"><Icon name="download" size={14} /> Export all leads (CSV)</button>
                  <button className="btn btn-ghost btn-block"><Icon name="download" size={14} /> Export projects &amp; units</button>
                  <button className="btn btn-ghost btn-block"><Icon name="download" size={14} /> Export full backup</button>
                </div></div>
              </div>
            </Card>
          </div>
          */}

          {/* API */}
          {/* TODO: static API & Webhooks — placeholder "coming soon" copy only.
          <div className={`os-section${activeSection === "api" ? " on" : ""}`}>
            <SectionHead section="api" />
            <Card icon="key" title="API keys" sub="Programmatic access">
              <p className="muted" style={{ margin: 0 }}>
                API access isn&apos;t available yet — no keys exist on any organisation. Coming soon.
              </p>
            </Card>
            <Card icon="link" title="Webhooks" sub="POST events to your endpoints">
              <p className="muted" style={{ margin: 0 }}>
                Webhook delivery isn&apos;t available yet. Coming soon.
              </p>
            </Card>
          </div>
          */}

          {/* AUDIT */}
          {/* TODO: static Audit Log — hardcoded sample rows, not loaded from the API.
          <div className={`os-section${activeSection === "audit" ? " on" : ""}`}>
            <SectionHead section="audit" />
            <Card icon="shield" title="Audit log" sub="Recent admin & security events">
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Event</th><th>User</th><th>IP</th><th>When</th></tr></thead>
                <tbody>
                  {[["Custom attribute added", "Rohan Shah", "103.21.x.x", "2 min ago"], ["User invited — Nisha Iyer", "Rohan Shah", "103.21.x.x", "1 hr ago"], ["Pipeline stage renamed", "Priya Nair", "49.36.x.x", "3 hrs ago"], ["API key generated", "Rohan Shah", "103.21.x.x", "Yesterday"], ["2FA enabled org-wide", "Rohan Shah", "103.21.x.x", "2 days ago"]].map((r, i) => (
                    <tr key={i}><td>{r[0] as string}</td><td>{r[1] as string}</td><td className="mono">{r[2] as string}</td><td className="muted">{r[3] as string}</td></tr>
                  ))}
                </tbody>
              </table></div>
            </Card>
          </div>
          */}

          {/* BILLING */}
          <div className={`os-section${activeSection === "billing" ? " on" : ""}`}>
            <SectionHead section="billing" />

            {/* Success / Alert Banner */}
            {changeOk ? (
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "var(--green-050)", border: "1px solid rgba(22, 163, 74, 0.3)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, fontSize: 13.5, fontWeight: 600 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--green)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✓</span>
                  <span>{changeOk}</span>
                </div>
                <button type="button" onClick={() => setChangeOk(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", fontSize: 16 }}>✕</button>
              </div>
            ) : null}

            {pendingChangeRequest ? (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  background: "rgba(245, 158, 11, 0.08)",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <b style={{ color: "#b45309", fontSize: 14 }}>Package Change Pending Approval</b>
                    <span className="badge b-amber">Pending Approval</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                    Request to switch to <strong>{pendingChangeRequest.targetPlan?.name ?? "Selected Package"}</strong> ({pendingChangeRequest.billingCycle === "yearly" ? "Billed yearly" : "Billed monthly"}) submitted on {formatDate(pendingChangeRequest.createdAt)}.
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Your organisation will continue using the active <strong>{billing?.plan?.name ?? "current"}</strong> plan until a Super Admin approves your request.
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--rose)", borderColor: "rgba(244,63,94,0.3)" }}
                  disabled={cancelingRequest || !canEditBilling}
                  onClick={() => void handleCancelPackageChangeRequest()}
                >
                  {cancelingRequest ? "Cancelling…" : "Cancel Request"}
                </button>
              </div>
            ) : null}
            {latestRejectedChangeRequest && !pendingChangeRequest ? (
              <div
                role="status"
                style={{
                  padding: "16px",
                  borderRadius: 12,
                  border: "1px solid rgba(244, 63, 94, 0.28)",
                  background: "rgba(244, 63, 94, 0.07)",
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <b style={{ color: "#be123c", fontSize: 14 }}>Package Change Request Rejected</b>
                  <span className="badge b-rose">Rejected</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  Your request to switch to <strong>{latestRejectedChangeRequest.targetPlan?.name ?? "the selected package"}</strong> was rejected
                  {latestRejectedChangeRequest.reviewedAt ? ` on ${formatDate(latestRejectedChangeRequest.reviewedAt)}` : ""}.
                </div>
                {latestRejectedChangeRequest.rejectionReason ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(255, 255, 255, 0.72)",
                      color: "var(--ink)",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>Reason:</strong> {latestRejectedChangeRequest.rejectionReason}
                  </div>
                ) : null}
              </div>
            ) : null}
            {changeError ? <div className="form-alert" style={{ marginBottom: 16 }}>{changeError}</div> : null}
            {renewOk ? <div className="form-alert ok" style={{ marginBottom: 16 }}>{renewOk}</div> : null}
            {renewError ? <div className="form-alert" style={{ marginBottom: 16 }}>{renewError}</div> : null}

            {/* Current Plan Card */}
            <Card icon="billing" title="Current Plan" sub="Here's your active plan and usage summary.">
              <div className="card-b" style={{ padding: 0 }}>
                {billingLoading ? (
                  <p className="muted" style={{ padding: "4px 0 16px" }}>Loading billing details…</p>
                ) : billingError ? (
                  <p className="muted" style={{ padding: "4px 0 16px" }}>{billingError}</p>
                ) : !billing?.plan || !billing.subscription ? (
                  <div style={{ padding: "16px 0" }}>
                    <p className="muted" style={{ marginTop: 0 }}>No active subscription on this organisation yet.</p>
                    <p className="muted" style={{ fontSize: 12.5 }}>Pick a plan below to get started.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, padding: "12px 16px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--amber-050)", color: "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                        👑
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{billing.plan.name}</h3>
                          <span className={`badge ${SUBSCRIPTION_STATUS_BADGE[billing.subscription.status] ?? "b-green"}`}>
                            {SUBSCRIPTION_STATUS_LABEL[billing.subscription.status] ?? "Active"}
                          </span>
                        </div>
                        {billing.subscription.renewsAt ? (
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            🗓 Renews on <b>{formatDate(billing.subscription.renewsAt)}</b>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)" }}>
                      <div style={{ fontSize: 18, color: "var(--brand)" }}>📅</div>
                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: "var(--muted)" }}>Next billing date</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{billing.subscription.renewsAt ? formatDate(billing.subscription.renewsAt) : "Auto-renew"}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>Keep a valid payment method on file to avoid service interruptions.</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--brand)" }}>
                          {formatMoney(billing.subscription.billingCycle === "yearly" ? billing.plan.priceYearly : billing.plan.priceMonthly, billing.subscription.currency)}
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}> / {billing.subscription.billingCycle === "yearly" ? "year" : "month"}</span>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => void handleRenew()} disabled={renewLoading || !canEditBilling}>
                        {renewLoading ? "Renewing…" : "Manage Subscription"}
                      </button>
                    </div>
                    <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                      <span className="chip">{billing.plan.limits?.landingPagesCreate ?? "Unlimited"} Created landing pages</span>
                      <span className="chip">{billing.plan.limits?.landingPages ?? "Unlimited"} Published landing pages</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Usage Overview Card */}
            <Card
              icon="reports"
              title="Usage Overview"
              sub="Track your plan limits and usage."
              action={<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--green)", fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)" }} /> Updated just now</div>}
            >
              {billing?.usage ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                  {/* Projects */}
                  <div style={{ padding: 16, border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-050)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="properties" size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Projects</div>
                        <div className="muted" style={{ fontSize: 12 }}>{billing.usage.projectsUsed} of {billing.usage.projectsLimit ?? "unlimited"} used</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginTop: 12 }}>
                      <div style={{ height: "100%", width: `${billing.usage.projectsLimit ? Math.min(100, (billing.usage.projectsUsed / billing.usage.projectsLimit) * 100) : 0}%`, background: "var(--brand)", borderRadius: 999 }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>
                      {billing.usage.projectsLimit ? `${Math.round((billing.usage.projectsUsed / billing.usage.projectsLimit) * 100)}%` : "0%"}
                    </div>
                  </div>

                  {/* Users */}
                  <div style={{ padding: 16, border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-050)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="crm" size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Users</div>
                        <div className="muted" style={{ fontSize: 12 }}>{billing.usage.usersUsed} of {billing.usage.usersLimit ?? "unlimited"} used</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginTop: 12 }}>
                      <div style={{ height: "100%", width: `${billing.usage.usersLimit ? Math.min(100, (billing.usage.usersUsed / billing.usage.usersLimit) * 100) : 10}%`, background: "var(--brand)", borderRadius: 999 }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>
                      {billing.usage.usersLimit ? `${Math.round((billing.usage.usersUsed / billing.usage.usersLimit) * 100)}%` : "10%"}
                    </div>
                  </div>

                  {/* Templates */}
                  <div style={{ padding: 16, border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-050)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="document" size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Templates</div>
                        <div className="muted" style={{ fontSize: 12 }}>{billing.usage.templatesUsed} of {billing.usage.templatesLimit ?? "unlimited"} used</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginTop: 12 }}>
                      <div style={{ height: "100%", width: `${billing.usage.templatesLimit ? Math.min(100, (billing.usage.templatesUsed / billing.usage.templatesLimit) * 100) : 50}%`, background: "var(--brand)", borderRadius: 999 }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>
                      {billing.usage.templatesLimit ? `${Math.round((billing.usage.templatesUsed / billing.usage.templatesLimit) * 100)}%` : "50%"}
                    </div>
                  </div>

                  {/* Landing Pages */}
                  <div style={{ padding: 16, border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-050)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="globe" size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Landing Pages</div>
                        <div className="muted" style={{ fontSize: 12 }}>{billing.usage.landingPagesUsed} of {billing.usage.landingPagesLimit ?? "unlimited"} used</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginTop: 12 }}>
                      <div style={{ height: "100%", width: "100%", background: "var(--brand)", borderRadius: 999 }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: "var(--brand)", marginTop: 4 }}>
                      ∞
                    </div>
                  </div>

                  {/* Created Landing Pages */}
                  <div style={{ padding: 16, border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-050)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="landing" size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Created Landing Pages</div>
                        <div className="muted" style={{ fontSize: 12 }}>{billing.usage.landingPagesCreateUsed ?? 0} of {billing.usage.landingPagesCreateLimit ?? "unlimited"} created</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginTop: 12 }}>
                      <div style={{ height: "100%", width: `${billing.usage.landingPagesCreateLimit ? Math.min(100, ((billing.usage.landingPagesCreateUsed ?? 0) / billing.usage.landingPagesCreateLimit) * 100) : 0}%`, background: "var(--brand)", borderRadius: 999 }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>
                      {billing.usage.landingPagesCreateLimit ? `${Math.round(((billing.usage.landingPagesCreateUsed ?? 0) / billing.usage.landingPagesCreateLimit) * 100)}%` : "0%"}
                    </div>
                  </div>
                </div>
              ) : <p className="muted">Loading usage statistics…</p>}
            </Card>

            {/* Plans & Packages */}
            <Card
              icon="sparkles"
              title="Plans & Packages"
              sub="Choose the plan that fits your needs"
              action={(
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="seg">
                    <span className={plansCycle === "monthly" ? "on" : ""} onClick={() => setPlansCycle("monthly")}>Monthly</span>
                    <span className={plansCycle === "yearly" ? "on" : ""} onClick={() => setPlansCycle("yearly")}>Yearly</span>
                  </div>
                  <span style={{ background: "var(--green-050)", color: "var(--green)", padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>Save up to 20%</span>
                </div>
              )}
            >
              {plansLoading ? <p className="muted">Loading plans…</p> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20 }}>
                  {plans.map((p) => {
                    const isCurrent = billing?.plan?.id === p.id;
                    const isPendingTarget = pendingChangeRequest?.targetPlanId === p.id;
                    const price = plansCycle === "yearly" ? p.priceYearly : p.priceMonthly;
                    const iconSymbol = p.name.toLowerCase().includes("starter") ? "🚀" : p.name.toLowerCase().includes("pro max") ? "⚡" : "👑";
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: 24,
                          borderRadius: 16,
                          border: isCurrent ? "2px solid var(--brand)" : "1px solid var(--line-2)",
                          background: "var(--surface)",
                          position: "relative",
                          display: "flex",
                          flexDirection: "column",
                          boxShadow: isCurrent ? "0 8px 30px -10px rgba(21, 27, 46, 0.25)" : "none",
                        }}
                      >
                        {isCurrent ? (
                          <span style={{ position: "absolute", top: 16, right: 16, background: "var(--brand)", color: "#fff", padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            Current Plan
                          </span>
                        ) : p.isPopular ? (
                          <span style={{ position: "absolute", top: 16, right: 16, background: "var(--amber-050)", color: "var(--amber)", padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            Most popular
                          </span>
                        ) : null}

                        <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--brand-050)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>
                          {iconSymbol}
                        </div>

                        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>{p.name}</h3>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                          <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--display)" }}>{formatMoney(price, billing?.subscription?.currency ?? "INR")}</span>
                          <span className="muted" style={{ fontSize: 12.5 }}> / {plansCycle === "yearly" ? "month" : "month"}</span>
                        </div>
                        {p.description ? <p className="muted" style={{ fontSize: 12.5, marginBottom: 18, minHeight: 36 }}>{p.description}</p> : <div style={{ minHeight: 18, marginBottom: 18 }} />}

                        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, flex: 1, marginBottom: 20 }}>
                          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                            {[
                              { key: "templates", label: "Templates" },
                              { key: "projects", label: "Projects" },
                              { key: "users", label: "Users" },
                              { key: "landingPagesCreate", label: "Created landing pages" },
                              { key: "landingPages", label: "Published landing pages" },
                            ].map((limit) => (
                              <li key={limit.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink-2)" }}>
                                <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
                                <span><b>{p.limits?.[limit.key as keyof typeof p.limits] ?? "Unlimited"}</b> {limit.label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <button
                          className={`btn ${isCurrent ? "" : isPendingTarget ? "btn-ghost" : "btn-primary"}`}
                          disabled={isCurrent || !!pendingChangeRequest || !canEditBilling}
                          title={canEditBilling ? undefined : "You don't have permission to change the plan"}
                          onClick={() => setRequestModalPlan(p)}
                          style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: 10,
                            fontWeight: 600,
                            ...(isCurrent && { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--line)", cursor: "default" }),
                          }}
                        >
                          {isCurrent
                            ? "✓ Current Plan"
                            : isPendingTarget
                              ? "Request Pending"
                              : `Switch to ${p.name}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Invoices Card */}
            <Card
              icon="document"
              title="Invoices"
              sub="View and download your billing history"
              action={<span style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, cursor: "pointer" }}>View All Invoices →</span>}
            >
              {invoicesLoading ? <p className="muted">Loading invoices…</p> : invoices.length === 0 ? <p className="muted" style={{ marginTop: 0 }}>No invoices yet.</p> : (
                <div className="inv-table">
                  <div className="inv-row inv-head"><span>Invoice</span><span>Date</span><span>Plan</span><span>Amount</span><span>Status</span><span /></div>
                  {invoices.map((inv) => (
                    <div className="inv-row" key={inv.id}>
                      <span className="mono">{inv.number}</span><span>{formatDate(inv.issuedAt)}</span><span>{inv.planName}</span>
                      <span>{formatMoney(inv.amount, inv.currency)}</span>
                      <span><span className={`badge ${INVOICE_STATUS_BADGE[inv.status] ?? "b-amber"}`}>{INVOICE_STATUS_LABEL[inv.status] ?? inv.status}</span></span>
                      <span>{/* TODO: invoice download not implemented yet. <button className="btn btn-ghost btn-sm" disabled style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>⬇ Download</button> */}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* TEAM PREFERENCES */}
          <div className={`os-section${activeSection === "team-prefs" ? " on" : ""}`}>
            <SectionHead section="team-prefs" />
            <Card icon="users" title="Team Preferences" sub="Default member permissions, invitations & workspace collaboration">
              <div className="set-row-2">
                <div className="set-field">
                  <label>Default role for invited members</label>
                  <div className="set-input-box">
                    <span className="set-field-ic"><Icon name="users" size={16} /></span>
                    <select className="inp" defaultValue="agent">
                      <option value="agent">Agent / Sales Executive</option>
                      <option value="manager">Team Manager</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                </div>
                <div className="set-field">
                  <label>Default lead distribution mode</label>
                  <div className="set-input-box">
                    <span className="set-field-ic"><Icon name="modules" size={16} /></span>
                    <select className="inp" defaultValue="round-robin">
                      <option value="round-robin">Round-Robin Assignment</option>
                      <option value="manual">Manual Manager Assignment</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="swrow" style={{ marginTop: 16 }}>
                <div className="tx"><b>Allow agents to create landing pages</b><div className="muted">Permit sales agents to draft their own promotional landing pages</div></div>
                <Toggle on />
              </div>
              <div className="swrow" style={{ borderBottom: 0 }}>
                <div className="tx"><b>Team Chat notifications</b><div className="muted">Send in-app and email badges for team chat messages and mentions</div></div>
                <Toggle on />
              </div>
            </Card>
          </div>

          {/* SECURITY */}
          {/* TODO: static Security section — sign-in policy toggles & danger-zone buttons are not persisted/wired.
          <div className={`os-section${activeSection === "security" ? " on" : ""}`}>
            <SectionHead section="security" />
            <Card icon="lock" title="Sign-in policy" sub="Access & authentication">
              <div className="card-b" style={{ padding: 0 }}>
                {[["Two-factor authentication", "Require 2FA for all admins.", true], ["Strong password policy", "Min 12 chars, mixed case, number & symbol.", true], ["Restrict to office IPs", "Block sign-in from unknown networks.", false], ["Single sign-on (Google)", "Allow SSO via Google Workspace.", false]].map(([t, d, on]) => (
                  <div className="swrow" key={t as string}><div className="tx"><b>{t as string}</b><div className="muted">{d as string}</div></div><Toggle on={on as boolean} /></div>
                ))}
                <div className="swrow" style={{ borderBottom: 0 }}><div className="tx"><b>Session timeout</b></div><select className="inp" style={{ width: "auto" }}><option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>8 hours</option></select></div>
              </div>
            </Card>
            <Card icon="alert" title="Danger zone" sub="Irreversible actions">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="btn btn-ghost btn-block" style={{ justifyContent: "flex-start" }}>Sign out all sessions</button>
                <button className="btn btn-danger btn-block" style={{ justifyContent: "flex-start" }}>Deactivate organisation</button>
              </div>
            </Card>
          </div>
          */}

          {dirty ? (
            <div className="os-savebar">
              <div className="os-savebar-l">
                <span className="os-save-dot" />
                <div>
                  <b>You have unsaved changes</b>
                  <div>Review and save to apply them.</div>
                </div>
              </div>
              {saveButton}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </>
  );
}
