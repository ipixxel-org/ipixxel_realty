"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { StatusNoteModal } from "@/components/org/lead-status-select";
import { LEAD_STAGE_ORDER, useLeadStages } from "@/lib/lead-stages";
import { useAuth } from "@/lib/auth-context";
import { isOrgAdmin } from "@/lib/session";
import { isValidLoosePhone, LOOSE_PHONE_MESSAGE } from "@/lib/phone";
import {
  apiFetch,
  assignCrmLead,
  getCrmAssignableUsers,
  getCrmLead,
  getOrgCatalogOptions,
  updateCrmLead,
} from "@/lib/api";
import type {
  CrmLead,
  CrmLeadStatus,
  OrgCatalogCategory,
  OrgCatalogOption,
  ProjectsListResponse,
  UpdateLeadInput,
} from "@/lib/types";
import "@/app/org/org.css";
import {
  FormActions,
  FormAlert,
  FormPage,
  formPageStyles,
} from "@/components/forms/form-page";
import "./lead-edit.css";

const SOURCES = ["Meta Lead Ad", "Google Ads", "Website form", "Portal (99acres)", "Walk-in", "Referral"];

// Lead-only lists (tags + Purpose/Financing/Loan status/Timeline/Preferred
// floor) are managed under Settings → CRM & Leads. Configuration, Facing and
// Parking are shared org-wide lists managed under Project Catalogs.
const LEAD_CATALOG_HREF = "/org/settings?section=crm";
const PROJECT_CATALOG_HREF = "/org/settings?section=catalogs";

function dataField(data: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!data) return "";
  for (const key of keys) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const PHONE_MAX_DIGITS = 15;
function sanitizePhoneInput(raw: string): string {
  const hasLeadingPlus = /^\s*\+/.test(raw);
  let digits = 0;
  let body = "";
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      if (digits >= PHONE_MAX_DIGITS) continue;
      digits += 1;
      body += ch;
    } else if (ch === " " || ch === "-" || ch === "(" || ch === ")") {
      body += ch;
    }
  }
  return (hasLeadingPlus ? "+" : "") + body;
}

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  altName: string;
  altPhone: string;
  whatsapp: string;
  city: string;
  tags: string[];
  configurations: string[];
  budgetMin: string;
  budgetMax: string;
  purpose: string;
  financing: string;
  loanStatus: string;
  timelineToBuy: string;
  preferredFloor: string;
  facing: string;
  parking: string;
  requirementNotes: string;
  projectId: string;
  source: string;
  campaign: string;
  landingPageUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  temperature: string;
  assignedToId: string;
  consentWhatsapp: boolean;
  consentCall: boolean;
  consentEmail: boolean;
}

function toForm(lead: CrmLead): FormState {
  const data = lead.data as Record<string, unknown>;
  return {
    fullName: dataField(data, "fullName", "Full Name", "Full name", "name", "Name"),
    phone: sanitizePhoneInput(dataField(data, "phone", "Phone", "phoneNumber", "Phone number", "Mobile")),
    email: dataField(data, "email", "Email", "Email address"),
    altName: lead.altName ?? "",
    altPhone: sanitizePhoneInput(lead.altPhone ?? ""),
    whatsapp: sanitizePhoneInput(lead.whatsapp ?? ""),
    city: lead.city || dataField(data, "city", "City", "location", "Location"),
    tags: lead.tags ?? [],
    configurations: lead.configurations ?? [],
    budgetMin: lead.budgetMin != null ? String(lead.budgetMin) : "",
    budgetMax: lead.budgetMax != null ? String(lead.budgetMax) : "",
    purpose: lead.purpose ?? "",
    financing: lead.financing ?? "",
    loanStatus: lead.loanStatus ?? "",
    timelineToBuy: lead.timelineToBuy ?? "",
    preferredFloor: lead.preferredFloor ?? "",
    facing: lead.facing ?? "",
    parking: lead.parking ?? "",
    requirementNotes: lead.requirementNotes || dataField(data, "requirementNotes", "notes", "Notes") || "",
    projectId: lead.projectId ?? "",
    source: lead.source ?? "",
    campaign: lead.campaign || dataField(data, "campaign", "Campaign") || "",
    landingPageUrl: dataField(data, "landingPageUrl", "url"),
    utmSource: lead.utmSource || dataField(data, "utmSource", "utm_source") || "",
    utmMedium: lead.utmMedium || dataField(data, "utmMedium", "utm_medium") || "",
    utmCampaign: lead.utmCampaign || dataField(data, "utmCampaign", "utm_campaign") || "",
    temperature: lead.temperature ?? "",
    assignedToId: lead.assignedTo?.id ?? "",
    consentWhatsapp: lead.consentWhatsapp ?? false,
    consentCall: lead.consentCall ?? false,
    consentEmail: lead.consentEmail ?? false,
  };
}

/** Chip-style multi-select dropdown over an org catalog list (tags, configurations). */
function CatalogMultiSelect({
  values,
  options,
  disabled,
  placeholder,
  onToggle,
}: {
  values: string[];
  options: string[];
  disabled?: boolean;
  placeholder: string;
  onToggle: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="led-tags-field" ref={ref}>
      <div
        className="led-tags-box"
        style={disabled ? { cursor: "not-allowed", opacity: 0.7 } : undefined}
        onClick={() => !disabled && options.length > 0 && setOpen(!open)}
      >
        {values.length === 0 ? (
          <span style={{ color: "#94a3b8", fontSize: 13 }}>{placeholder}</span>
        ) : (
          values.map((v) => (
            <span key={v} className="led-tag-chip led-tag-general">
              {v}
              <span
                className="led-tag-x"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(v);
                }}
              >
                ✕
              </span>
            </span>
          ))
        )}
        <span style={{ marginLeft: "auto", color: "#64748b", display: "inline-flex" }}>
          <Icon name="chevron-down" size={13} />
        </span>
      </div>

      {open ? (
        <div className="led-tags-dropdown">
          {options.map((opt) => {
            const isSelected = values.includes(opt);
            return (
              <div
                key={opt}
                className={`led-tags-dropdown-item ${isSelected ? "selected" : ""}`}
                onClick={() => onToggle(opt)}
              >
                <span>{opt}</span>
                {isSelected ? <Icon name="check" size={14} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Load-error / empty-catalog hint under a catalog-backed field, linking to Settings. */
function CatalogHint({
  loaded,
  error,
  empty,
  emptyText,
  settingsHref,
}: {
  loaded: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  settingsHref: string;
}) {
  if (error) {
    return <span style={{ fontSize: 11.5, color: "#ef4444" }}>{error}</span>;
  }
  if (!loaded || !empty) return null;
  return (
    <span style={{ fontSize: 11.5, color: "#64748b" }}>
      {emptyText}{" "}
      <Link className="brand-link" href={settingsHref}>
        Add them in Settings →
      </Link>
    </span>
  );
}

/** Rupee amount → integer; "" / unparseable → null. */
function parseRupees(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export default function OrgLeadEditPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const router = useRouter();
  const { user, isLoading: authLoading, hasPermission } = useAuth();
  const canEditLead = hasPermission("crm", "edit") || isOrgAdmin();

  const [lead, setLead] = useState<CrmLead | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  // Target of a pending pipeline status change — every change needs a note.
  const [pendingStatus, setPendingStatus] = useState<CrmLeadStatus | null>(null);
  const { label: stageLabel } = useLeadStages();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  // Org option lists. Configuration reads `unit_type`, Facing/Parking read the
  // shared `facing` / `parking` catalogs (same value sets as units); Tags and
  // Purpose/Financing/Loan status/Timeline/Preferred floor read their own
  // lead-only `lead_*` catalogs. One fetch, filtered per category.
  const [catalog, setCatalog] = useState<OrgCatalogOption[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  const toggleInList = (key: "tags" | "configurations", value: string) =>
    setForm((f) =>
      f
        ? {
            ...f,
            [key]: f[key].includes(value)
              ? f[key].filter((v) => v !== value)
              : [...f[key], value],
          }
        : f,
    );

  useEffect(() => {
    if (!id || authLoading || !user) return;
    getCrmLead(id)
      .then((result) => {
        setLead(result);
        setForm(toForm(result));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load lead."))
      .finally(() => setLoading(false));
  }, [id, authLoading, user]);

  useEffect(() => {
    if (!canEditLead) return;
    apiFetch<ProjectsListResponse>("/org/projects?page=1&limit=100")
      .then((res) => setProjects(res.data.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]));
    getCrmAssignableUsers()
      .then((res) => setAssignees(res.data.map((a) => ({ id: a.id, name: a.name }))))
      .catch(() => setAssignees([]));
    getOrgCatalogOptions()
      .then((rows) => setCatalog(rows))
      .catch((e) => setCatalogError(e instanceof Error ? e.message : "Failed to load option lists."));
  }, [canEditLead]);

  /** Sorted option list for one catalog category ([] until the fetch lands). */
  const catOptions = useMemo(() => {
    const byCat = (cat: OrgCatalogCategory): OrgCatalogOption[] =>
      (catalog ?? [])
        .filter((o) => o.category === cat)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    return byCat;
  }, [catalog]);

  // Tag chips: the org's `lead_tag` catalog, plus any tag already on this lead
  // that has since left the catalog (so an edit never silently drops it).
  const tagOptions = useMemo(() => {
    if (!form) return [] as string[];
    const fromCatalog = catOptions("lead_tag").map((o) => o.label);
    return [...fromCatalog, ...form.tags.filter((t) => !fromCatalog.includes(t))];
  }, [catOptions, form]);

  const configLabels = useMemo(() => {
    if (!form) return [] as string[];
    const fromCatalog = catOptions("unit_type").map((o) => o.label);
    // Keep any already-saved configuration that has since left the catalog.
    return [...fromCatalog, ...form.configurations.filter((c) => !fromCatalog.includes(c))];
  }, [catOptions, form]);

  // Client-side phone check — UX only; UpdateLeadDto re-validates on the server.
  const phoneErrors = useMemo(() => {
    const check = (v: string) =>
      v.trim() && !isValidLoosePhone(v) ? LOOSE_PHONE_MESSAGE : "";
    return form
      ? { phone: check(form.phone), altPhone: check(form.altPhone), whatsapp: check(form.whatsapp) }
      : { phone: "", altPhone: "", whatsapp: "" };
  }, [form]);
  const hasPhoneError = Boolean(phoneErrors.phone || phoneErrors.altPhone || phoneErrors.whatsapp);

  async function save() {
    if (!lead || !form || saving) return;
    if (hasPhoneError) {
      setSaveError("Fix the highlighted phone number(s) before saving.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const payload: UpdateLeadInput = {
        contact: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
        },
        altName: form.altName.trim() || null,
        altPhone: form.altPhone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        city: form.city.trim() || null,
        tags: form.tags,
        configurations: form.configurations,
        budgetMin: parseRupees(form.budgetMin),
        budgetMax: parseRupees(form.budgetMax),
        purpose: form.purpose || null,
        financing: form.financing || null,
        loanStatus: form.loanStatus || null,
        timelineToBuy: form.timelineToBuy || null,
        preferredFloor: form.preferredFloor || null,
        facing: form.facing || null,
        parking: form.parking || null,
        requirementNotes: form.requirementNotes.trim() || null,
        projectId: form.projectId || null,
        source: form.source.trim() || null,
        campaign: form.campaign.trim() || null,
        utmSource: form.utmSource.trim() || null,
        utmMedium: form.utmMedium.trim() || null,
        utmCampaign: form.utmCampaign.trim() || null,
        temperature: form.temperature || null,
        assignedToId: form.assignedToId || null,
        consentWhatsapp: form.consentWhatsapp,
        consentCall: form.consentCall,
        consentEmail: form.consentEmail,
      };
      await updateCrmLead(lead.id, payload);
      router.push(`/org/leads/${lead.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.");
      setSaving(false);
    }
  }

  async function confirmStatus(status: CrmLeadStatus, note: string) {
    if (!lead) return;
    await assignCrmLead(lead.id, {
      assignedToId: lead.assignedTo?.id ?? null,
      status,
      note,
    });
    // Only refresh the pipeline-status display — keep the user's in-progress
    // form edits intact (status is a separate, immediate action).
    setLead((current) => (current ? { ...current, status } : current));
  }

  const catalogLoaded = catalog !== null;


  function formatInr(val: string): string {
    const digits = val.replace(/[^\d]/g, "");
    if (!digits) return "";
    const n = Number(digits);
    if (isNaN(n)) return val;
    return n.toLocaleString("en-IN");
  }

  if (loading || authLoading) {
    return (
      <div className="empty" style={{ padding: 60, textAlign: "center" }}>
        Loading lead details…
      </div>
    );
  }
  if (loadError || !lead || !form) {
    return (
      <div className="empty" style={{ padding: 60, textAlign: "center" }}>
        {loadError || "Lead not found."}
      </div>
    );
  }
  if (!canEditLead) {
    return (
      <div className="empty" style={{ padding: 60, textAlign: "center" }}>
        You do not have permission to edit this lead.
      </div>
    );
  }

  // Used only by the commented-out Owner / Agent field below.
  // const assignedUser = assignees.find((a) => a.id === form.assignedToId) ?? (lead.assignedTo ? { id: lead.assignedTo.id, name: lead.assignedTo.name } : { id: "", name: "Unassigned" });

  const timelineItems = (lead.activities && lead.activities.length > 0)
    ? lead.activities.slice(0, 3).map((act) => ({
        id: act.id,
        text: act.text,
        time: new Date(act.createdAt).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        color: act.type === "status_updated" ? "green" : act.type === "note_added" ? "amber" : "blue",
      }))
    : [];

  const renderDropdown = (
    label: string,
    key: "purpose" | "financing" | "loanStatus" | "timelineToBuy" | "preferredFloor" | "facing" | "parking",
    catName: OrgCatalogCategory,
    required = false,
  ) => {
    // Options come only from the org's catalog (Settings); a saved value that
    // has since left the catalog is kept so an edit never silently drops it.
    const options = catOptions(catName).map((o) => o.label);
    const currentVal = form[key];
    const allOptions = currentVal && !options.includes(currentVal) ? [currentVal, ...options] : options;
    // Shared lists (facing / parking) live under Project Catalogs; the
    // lead-only ones under CRM & Leads.
    const settingsHref = catName.startsWith("lead_") ? LEAD_CATALOG_HREF : PROJECT_CATALOG_HREF;

    return (
      <div className="field">
        <label>
          {label} {required ? <span className="req">*</span> : null}
        </label>
        <select
          className="inp"
          value={currentVal}
          disabled={!catalogLoaded}
          onChange={(e) => set(key, e.target.value)}
        >
          <option value="">
            {!catalogLoaded ? "Loading…" : `Select ${label.toLowerCase()}`}
          </option>
          {allOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <CatalogHint
          loaded={catalogLoaded}
          error={catalogError}
          empty={options.length === 0}
          emptyText={`No ${label.toLowerCase()} options yet.`}
          settingsHref={settingsHref}
        />
      </div>
    );
  };

  return (
    <FormPage
      eyebrow="Lead Center"
      title="Edit lead"
      subtitle="Update contact, requirement, source and assignment details."
      backHref={`/org/leads/${lead.id}`}
      backLabel="Back to lead"
    >
    <div className="led-container">
      <FormAlert message={saveError} />

      {/* 3. Main 2-Column Grid */}
      <div className="led-layout">
        {/* LEFT COLUMN: Main Form */}
        <div className="led-main-col">
          {/* Card 1: Contact Information */}
          <div className="led-card">
            <div className="led-card-head">
              <div className="led-icon-bubble led-icon-blue">
                <Icon name="users" size={18} />
              </div>
              <div>
                <h3 className="led-card-title">Contact Information</h3>
                <div className="led-card-sub">Basic details of the lead</div>
              </div>
            </div>

            {/* Row 1: Full name & Alternate name */}
            <div className="led-grid-2">
              <div className="field">
                <label>
                  Full name <span className="req">*</span>
                </label>
                <input
                  className="inp"
                  value={form.fullName}
                  placeholder="e.g. Vikram Rao"
                  onChange={(e) => set("fullName", e.target.value)}
                />
              </div>
              <div className="field">
                <label>Alternate name / Co-applicant</label>
                <input
                  className="inp"
                  value={form.altName}
                  placeholder="e.g. Spouse name"
                  onChange={(e) => set("altName", e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: Phone, Alternate phone, WhatsApp */}
            <div className="led-grid-3">
              <div className="field">
                <label>
                  Phone <span className="req">*</span>
                </label>
                <div className={formPageStyles.control} data-invalid={phoneErrors.phone ? true : undefined}>
                  <span className={formPageStyles.prefix}>🇮🇳 +91</span>
                  <input
                    className={formPageStyles.input}
                    value={form.phone}
                    inputMode="tel"
                    placeholder="98765 43102"
                    onChange={(e) => set("phone", sanitizePhoneInput(e.target.value))}
                  />
                </div>
                {phoneErrors.phone ? (
                  <div className="error" role="alert">{phoneErrors.phone}</div>
                ) : null}
              </div>

              <div className="field">
                <label>Alternate phone</label>
                <div className={formPageStyles.control} data-invalid={phoneErrors.altPhone ? true : undefined}>
                  <span className={formPageStyles.prefix}>🇮🇳 +91</span>
                  <input
                    className={formPageStyles.input}
                    value={form.altPhone}
                    inputMode="tel"
                    placeholder="Enter alternate phone"
                    onChange={(e) => set("altPhone", sanitizePhoneInput(e.target.value))}
                  />
                </div>
                {phoneErrors.altPhone ? (
                  <div className="error" role="alert">{phoneErrors.altPhone}</div>
                ) : null}
              </div>

              <div className="field">
                <label>WhatsApp</label>
                <div className={formPageStyles.control} data-invalid={phoneErrors.whatsapp ? true : undefined}>
                  <span className={formPageStyles.prefix}>🇮🇳 +91</span>
                  <input
                    className={formPageStyles.input}
                    value={form.whatsapp}
                    inputMode="tel"
                    placeholder="98284 55127"
                    onChange={(e) => set("whatsapp", sanitizePhoneInput(e.target.value))}
                  />
                </div>
                {phoneErrors.whatsapp ? (
                  <div className="error" role="alert">{phoneErrors.whatsapp}</div>
                ) : null}
              </div>
            </div>

            {/* Row 3: Email, City/Location, Tags */}
            <div className="led-grid-3">
              <div className="field">
                <label>Email</label>
                <input
                  className="inp"
                  type="email"
                  value={form.email}
                  placeholder="vikram.rao@example.com"
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>

              <div className="field">
                <label>City / Location</label>
                <input
                  className="inp"
                  value={form.city}
                  placeholder="Bangalore, Karnataka"
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>

              <div className="field">
                <label>Tags</label>
                <CatalogMultiSelect
                  values={form.tags}
                  options={tagOptions}
                  disabled={!catalogLoaded}
                  placeholder={catalogLoaded ? "Select tags…" : "Loading tags…"}
                  onToggle={(tag) => toggleInList("tags", tag)}
                />
                <CatalogHint
                  loaded={catalogLoaded}
                  error={catalogError}
                  empty={catOptions("lead_tag").length === 0}
                  emptyText="No lead tags yet."
                  settingsHref={LEAD_CATALOG_HREF}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Requirement Details */}
          <div className="led-card">
            <div className="led-card-head">
              <div className="led-icon-bubble led-icon-purple">
                <Icon name="document" size={18} />
              </div>
              <div>
                <h3 className="led-card-title">Requirement Details</h3>
                <div className="led-card-sub">Configuration and requirement information</div>
              </div>
            </div>

            {/* Configuration (org unit_type catalog, multi-select) */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Configuration</label>
              <CatalogMultiSelect
                values={form.configurations}
                options={configLabels}
                disabled={!catalogLoaded}
                placeholder={catalogLoaded ? "Select configurations…" : "Loading configurations…"}
                onToggle={(cfg) => toggleInList("configurations", cfg)}
              />
              <CatalogHint
                loaded={catalogLoaded}
                error={catalogError}
                empty={catOptions("unit_type").length === 0}
                emptyText="No configurations in your catalog."
                settingsHref={PROJECT_CATALOG_HREF}
              />
            </div>

            {/* Row 1: Budget Min, Budget Max, Purpose */}
            <div className="led-grid-3">
              <div className="field">
                <label>
                  Budget (Min) <span className="req">*</span>
                </label>
                <div className={formPageStyles.control}>
                  <span className={formPageStyles.prefix}>₹</span>
                  <input
                    className={formPageStyles.input}
                    inputMode="numeric"
                    value={formatInr(form.budgetMin)}
                    placeholder="14,00,000"
                    onChange={(e) => set("budgetMin", e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>
              </div>

              <div className="field">
                <label>
                  Budget (Max) <span className="req">*</span>
                </label>
                <div className={formPageStyles.control}>
                  <span className={formPageStyles.prefix}>₹</span>
                  <input
                    className={formPageStyles.input}
                    inputMode="numeric"
                    value={formatInr(form.budgetMax)}
                    placeholder="18,00,000"
                    onChange={(e) => set("budgetMax", e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>
              </div>

              {renderDropdown("Purpose", "purpose", "lead_purpose")}
            </div>

            {/* Row 2: Financing, Loan status, Timeline */}
            <div className="led-grid-3">
              {renderDropdown("Financing", "financing", "lead_financing")}
              {renderDropdown("Loan status", "loanStatus", "lead_loan_status")}
              {renderDropdown("Timeline to buy", "timelineToBuy", "lead_timeline_to_buy")}
            </div>

            {/* Row 3: Preferred floor, Facing, Parking */}
            <div className="led-grid-3">
              {renderDropdown("Preferred floor", "preferredFloor", "lead_preferred_floor")}
              {renderDropdown("Facing", "facing", "facing")}
              {renderDropdown("Parking", "parking", "parking")}
            </div>

            {/* Row 4: Requirement notes */}
            <div className="field">
              <label>Requirement notes</label>
              <input
                className="inp"
                value={form.requirementNotes}
                placeholder="Enter any specific requirements, preferences, or additional notes..."
                onChange={(e) => set("requirementNotes", e.target.value)}
              />
            </div>
          </div>

          {/* Card 3: Source & Project */}
          <div className="led-card">
            <div className="led-card-head">
              <div className="led-icon-bubble led-icon-sky">
                <Icon name="link" size={18} />
              </div>
              <div>
                <h3 className="led-card-title">Source &amp; Project</h3>
                <div className="led-card-sub">Where this lead came from and related project details</div>
              </div>
            </div>

            {/* Row 1: Project of interest, Lead source, Campaign / Medium */}
            <div className="led-grid-3">
              <div className="field">
                <label>Project of interest</label>
                <select
                  className="inp"
                  value={form.projectId}
                  onChange={(e) => set("projectId", e.target.value)}
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {form.projectId && !projects.some((p) => p.id === form.projectId) && lead.project ? (
                    <option value={form.projectId}>{lead.project.name}</option>
                  ) : null}
                </select>
              </div>

              <div className="field">
                <label>Lead source</label>
                <select
                  className="inp"
                  value={form.source}
                  onChange={(e) => set("source", e.target.value)}
                >
                  <option value="">Select source</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {form.source && !SOURCES.includes(form.source) ? (
                    <option value={form.source}>{form.source}</option>
                  ) : null}
                </select>
              </div>

              <div className="field">
                <label>Campaign / Medium</label>
                <input
                  className="inp"
                  value={form.campaign}
                  placeholder="e.g. Google Ads, Facebook"
                  onChange={(e) => set("campaign", e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: Landing page URL, UTM Source, UTM Campaign, UTM Medium */}
            <div className="led-grid-4">
              <div className="field">
                <label>Landing page URL</label>
                <input
                  className="inp"
                  value={form.landingPageUrl}
                  placeholder="https://example.com/landing-page"
                  onChange={(e) => set("landingPageUrl", e.target.value)}
                />
              </div>

              <div className="field">
                <label>UTM Source</label>
                <input
                  className="inp"
                  value={form.utmSource}
                  placeholder="e.g. google"
                  onChange={(e) => set("utmSource", e.target.value)}
                />
              </div>

              <div className="field">
                <label>UTM Campaign</label>
                <input
                  className="inp"
                  value={form.utmCampaign}
                  placeholder="e.g. summer_sale"
                  onChange={(e) => set("utmCampaign", e.target.value)}
                />
              </div>

              <div className="field">
                <label>UTM Medium</label>
                <input
                  className="inp"
                  value={form.utmMedium}
                  placeholder="e.g. cpc"
                  onChange={(e) => set("utmMedium", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Sidebar Cards */}
        <div className="led-side-col">
          {/* Card 1: Lead Status & Score */}
          <div className="led-card">
            <div className="led-card-head">
              <div className="led-icon-bubble led-icon-coral">
                <Icon name="target" size={18} />
              </div>
              <div>
                <h3 className="led-card-title">Lead Status &amp; Score</h3>
                <div className="led-card-sub">Current lead health</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Pipeline status */}
              <div className="field">
                <label>Pipeline status</label>
                <select
                  className="inp"
                  value={lead.status}
                  onChange={(e) => {
                    const st = e.target.value as CrmLeadStatus;
                    if (st !== lead.status) setPendingStatus(st);
                  }}
                >
                  {LEAD_STAGE_ORDER.map((st) => (
                    <option key={st} value={st}>
                      {stageLabel(st)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lead score progress bar — hidden for now: the score is a hardcoded placeholder.
              <div>
                <div className="led-score-row">
                  <span>Lead score</span>
                  <span className="led-score-val">75 / 100</span>
                </div>
                <div className="led-progress-track">
                  <div className="led-progress-fill" style={{ width: "75%" }} />
                </div>
              </div>
              */}

              {/* Temperature */}
              <div className="field">
                <label>Temperature</label>
                <div className="led-temp-group">
                  {[
                    { val: "hot", label: "🔥 Hot" },
                    { val: "warm", label: "☀️ Warm" },
                    { val: "cold", label: "❄️ Cold" },
                  ].map((t) => {
                    const isActive = form.temperature === t.val;
                    return (
                      <button
                        key={t.val}
                        type="button"
                        className={`led-temp-btn ${isActive ? "active" : ""}`}
                        onClick={() => set("temperature", t.val)}
                      >
                        {t.label}
                        {isActive ? <span className="led-temp-check">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lead source */}
              <div className="field">
                <label>Lead source</label>
                <select
                  className="inp"
                  value={form.source}
                  onChange={(e) => set("source", e.target.value)}
                >
                  <option value="">Select source</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {form.source && !SOURCES.includes(form.source) ? (
                    <option value={form.source}>{form.source}</option>
                  ) : null}
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Assignment — hidden for now. Owner / Agent is a read-only pill (the
              assignee can't be changed here) and Team is on hold until team management ships.
          <div className="led-card">
            <div className="led-card-head">
              <div className="led-icon-bubble led-icon-blue">
                <Icon name="users" size={18} />
              </div>
              <div>
                <h3 className="led-card-title">Assignment</h3>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field">
                <label>Owner / Agent</label>
                <div className="led-agent-pill">
                  <div className="led-agent-avatar">
                    {assignedUser.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0].toUpperCase())
                      .join("") || "?"}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a", flex: 1 }}>
                    {assignedUser.name}
                  </span>
                </div>
              </div>

              <div className="field">
                <label>Team</label>
                <select className="inp" value="Sales Team" disabled>
                  <option value="Sales Team">Sales Team</option>
                </select>
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                  Teams with this feature will activate once team management ships.
                </div>
              </div>
            </div>
          </div>
          */}

          {/* Card 3: Activity & Timeline */}
          <div className="led-card">
            <div className="led-card-head">
              <div className="led-icon-bubble led-icon-purple">
                <Icon name="activity" size={18} />
              </div>
              <div>
                <h3 className="led-card-title">Activity &amp; Timeline</h3>
              </div>
            </div>

            <div className="led-timeline-list">
              {timelineItems.length === 0 ? (
                <span style={{ fontSize: 13, color: "#94a3b8" }}>No activity yet.</span>
              ) : null}
              {timelineItems.map((item) => (
                <div key={item.id} className="led-timeline-item">
                  <div className="led-timeline-left">
                    <span
                      className={`led-timeline-dot ${
                        item.color === "green"
                          ? "led-dot-green"
                          : item.color === "amber"
                          ? "led-dot-amber"
                          : "led-dot-blue"
                      }`}
                    />
                    <span className="led-timeline-text">{item.text}</span>
                  </div>
                  <span className="led-timeline-time">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <FormActions
        cancelHref={`/org/leads/${lead.id}`}
        busy={saving}
        submitDisabled={hasPhoneError}
        busyLabel="Saving…"
        submitLabel="Save changes"
        submitIcon="check"
        onSubmit={() => void save()}
      />

      {/* Status Note Modal — a note is required for every pipeline status change */}
      <StatusNoteModal
        open={pendingStatus !== null}
        fromStatus={lead.status}
        toStatus={pendingStatus}
        onClose={() => setPendingStatus(null)}
        onConfirm={confirmStatus}
      />
    </div>
    </FormPage>
  );
}
