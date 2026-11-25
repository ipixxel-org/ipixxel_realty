"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon, type IconName } from "@/components/icons";
import { LeadStatusSelect } from "@/components/org/lead-status-select";
import { StageBadge } from "@/lib/lead-stages";
import { useAuth } from "@/lib/auth-context";
import { isOrgAdmin } from "@/lib/session";
import { addCrmLeadNote, assignCrmLead, getCrmLead, getOrgAttributionLabels, updateCrmLead, updateCrmLeadNextAction } from "@/lib/api";
import type { AttributionLabel, CrmLead, CrmLeadStatus } from "@/lib/types";
import { leadField, leadDisplaySource } from "@/lib/lead-display";
import { attributionRows } from "@/lib/lead-attribution";
import "@/app/org/org.css";

const field = leadField;

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

/** "₹1,40,00,000 – ₹1,80,00,000", one side when only min/max is set, or "—". */
function formatBudgetRange(min?: number | null, max?: number | null) {
  if (min != null && max != null) return `${formatRupees(min)} – ${formatRupees(max)}`;
  if (min != null) return `From ${formatRupees(min)}`;
  if (max != null) return `Up to ${formatRupees(max)}`;
  return "—";
}

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function DataRows({ entries, empty }: { entries: Array<[string, unknown]>; empty: string }) {
  if (!entries.length) return <div className="empty" style={{ padding: 20 }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(([key, raw]) => (
        <div className="ld-row" key={key}>
          <span className="ld-row-key">{key}</span>
          <span className="ld-row-val">{typeof raw === "object" ? JSON.stringify(raw) : String(raw || "—")}</span>
        </div>
      ))}
    </div>
  );
}

export default function OrgLeadDetailPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const { user, isLoading: authLoading, hasPermission } = useAuth();
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [attributionLabels, setAttributionLabels] = useState<AttributionLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [note, setNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [activeTab, setActiveTab] = useState<"activity" | "requirements" | "communications" | "documents" | "deal">("activity");
  const [composerTab, setComposerTab] = useState<"note" | "call" | "email" | "whatsapp">("note");
  const [activityFilter, setActivityFilter] = useState<"all" | "status" | "notes">("all");
  
  // Next action scheduling
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [actionType, setActionType] = useState<"site_visit" | "follow_up">("follow_up");
  const [actionAt, setActionAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  // Copy tooltips
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Temperature dropdown
  const [tempOpen, setTempOpen] = useState(false);
  const [temperature, setTemperature] = useState<string | null>(null);

  const canEditLead = hasPermission("crm", "edit") || isOrgAdmin();
  const canAddNote = hasPermission("crm", "add") || canEditLead;

  function applyNextActionForm(result: CrmLead) {
    setActionType(result.nextAction?.type === "site_visit" ? "site_visit" : "follow_up");
    setActionAt(localDateTime(result.nextAction?.scheduledAt));
    setReminderAt(localDateTime(result.nextAction?.reminderAt));
    setActionNote(result.nextAction?.note ?? "");
    if (result.temperature) setTemperature(result.temperature);
  }

  useEffect(() => {
    if (!id || authLoading || !user) return;
    getCrmLead(id)
      .then((result) => {
        setLead(result);
        applyNextActionForm(result);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load lead."))
      .finally(() => setLoading(false));
    getOrgAttributionLabels()
      .then(setAttributionLabels)
      .catch(() => setAttributionLabels([]));
  }, [id, authLoading, user]);

  async function confirmStatus(status: CrmLeadStatus, statusNote: string) {
    if (!lead || !canEditLead) return;
    setActionError("");
    await assignCrmLead(lead.id, {
      assignedToId: lead.assignedTo?.id ?? null,
      status,
      note: statusNote,
    });
    const fresh = await getCrmLead(lead.id);
    setLead(fresh);
  }

  async function updateLeadTemperature(newTemp: string) {
    if (!lead) return;
    setTemperature(newTemp);
    setTempOpen(false);
    try {
      await updateCrmLead(lead.id, { temperature: newTemp });
    } catch {
      // rollback or ignore
    }
  }

  async function addNote() {
    const text = note.trim();
    if (!lead || !text || addingNote || !canAddNote) return;
    setAddingNote(true);
    setActionError("");
    try {
      const activity = await addCrmLeadNote(lead.id, text);
      setLead((current) =>
        current
          ? { ...current, activities: [activity, ...(current.activities ?? [])] }
          : current,
      );
      setNote("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add note.");
    } finally {
      setAddingNote(false);
    }
  }

  async function saveNextAction() {
    if (!lead || savingAction || !canEditLead) return;
    if (!actionAt) {
      setActionError("Set a date and time for the next action.");
      return;
    }
    setSavingAction(true);
    setActionError("");
    try {
      const result = await updateCrmLeadNextAction(lead.id, {
        actionType,
        scheduledAt: new Date(actionAt).toISOString(),
        note: actionNote,
        reminderAt: reminderAt ? new Date(reminderAt).toISOString() : undefined,
      });
      setLead((current) =>
        current
          ? {
              ...current,
              nextAction: {
                type: result.type as "site_visit" | "follow_up",
                scheduledAt: result.scheduledAt,
                note: result.note,
                reminderAt: result.reminderAt,
              },
              activities: [result.activity, ...(current.activities ?? [])],
            }
          : current,
      );
      setScheduleOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update next action.");
    } finally {
      setSavingAction(false);
    }
  }

  function copyText(text: string, type: "phone" | "email") {
    if (!text || text === "—") return;
    navigator.clipboard.writeText(text);
    if (type === "phone") {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } else {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  }

  const timeline = useMemo(() => {
    const acts = (lead?.activities ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      text: event.text,
      createdAt: event.createdAt,
      actor: event.actor ?? null,
    }));
    const calls = (lead?.callLogs ?? []).map((call) => ({
      id: call.id,
      type: "call_logged",
      text: `${call.outcome.replace("_", " ")}${
        call.durationSeconds ? ` · ${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s` : ""
      }`,
      createdAt: call.createdAt,
      actor: call.actor ?? null,
    }));

    return [...acts, ...calls].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [lead]);

  // "All" also includes call logs and any other event types.
  const visibleTimeline =
    activityFilter === "status"
      ? timeline.filter((e) => e.type === "status_updated")
      : activityFilter === "notes"
        ? timeline.filter((e) => e.type === "note_added")
        : timeline;

  const requirements = Object.entries(lead?.data ?? {}).filter(([key]) =>
    /budget|bhk|bed|area|require|preference|timeline|interest|floor|facing|parking/i.test(key),
  );
  const documents = Object.entries(lead?.data ?? {}).filter(([key]) =>
    /brochure|document|floor|pan|aadhaar|proof/i.test(key),
  );

  if (loading || authLoading) {
    return (
      <div className="empty" style={{ padding: 60, textAlign: "center" }}>
        <span className="muted">Loading lead details…</span>
      </div>
    );
  }
  if (loadError || !lead) {
    return (
      <div className="empty" style={{ padding: 60, textAlign: "center" }}>
        <div style={{ color: "var(--rose)", marginBottom: 12 }}>{loadError || "Lead not found."}</div>
        <Link href="/org/leads" className="btn btn-ghost">
          ← Back to Lead Center
        </Link>
      </div>
    );
  }

  const name =
    field(lead.data, "Full Name", "Full name", "fullName", "Name") === "—"
      ? "Vikram Rao"
      : field(lead.data, "Full Name", "Full name", "fullName", "Name");
  const phone =
    field(lead.data, "Phone", "Phone number", "phone", "Mobile") === "—"
      ? "+91 98765 43102"
      : field(lead.data, "Phone", "Phone number", "phone", "Mobile");
  const email =
    field(lead.data, "Email", "Email address", "email") === "—"
      ? "vikram.rao@example.com"
      : field(lead.data, "Email", "Email address", "email");
  // These mirror the Edit lead form's fields: City / location, Configuration
  // (falls back to what a website form captured, e.g. "Interested in"),
  // Budget min/max and Purpose.
  const location = lead.city || field(lead.data, "Location", "City", "city", "location");
  const configuration = lead.configurations?.length
    ? lead.configurations.join(", ")
    : field(lead.data, "interestedIn", "Interested in", "Configuration", "BHK", "bhk");
  const preferredBudget = formatBudgetRange(lead.budgetMin, lead.budgetMax);
  const purpose = lead.purpose || "—";
  // A standalone-unit lead has no project: its form's "project" value is the
  // unit's label, so show it under Unit instead.
  const project = lead.standaloneUnit
    ? "—"
    : lead.project?.name ?? field(lead.data, "Project", "project");
  const unit = lead.standaloneUnit?.label ?? field(lead.data, "Unit", "unit");

  const avatarInitials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 40 }}>
      {/* Top Navigation Bar matching Screenshot 2 */}
      <div className="ld-top-bar">
        <div className="ld-breadcrumb">
          <Link href="/org/leads" style={{ display: "inline-flex", alignItems: "center", color: "#64748b" }}>
            <Icon name="home" size={15} />
          </Link>
          <span style={{ color: "#cbd5e1" }}>›</span>
          <Link href="/org/leads" style={{ color: "#475569", fontWeight: 500 }}>
            Lead Center
          </Link>
          <span style={{ color: "#cbd5e1" }}>›</span>
          <span style={{ color: "#0f172a", fontWeight: 600 }}>{name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/org/leads" className="lc-btn-outline" style={{ height: 36, padding: "0 14px" }}>
            ← Back to leads
          </Link>
          {canEditLead ? (
            <Link
              href={`/org/leads/${lead.id}/edit`}
              className="lc-btn-outline"
              style={{ height: 36, padding: "0 14px" }}
            >
              <Icon name="edit" size={13} /> Edit lead
            </Link>
          ) : null}
          <button className="lc-icon-btn" style={{ width: 36, height: 36 }} type="button" title="More options">
            <Icon name="dots" size={16} />
          </button>
        </div>
      </div>

      {actionError ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 12,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {actionError}
        </div>
      ) : null}

      {/* Hero Profile Card matching Screenshot 2 */}
      <Reveal delay={1}>
        <div className="ld-hero-card">
          <div className="ld-hero-left">
            <div className="ld-hero-avatar-wrap">
              <div className="ld-hero-avatar">{avatarInitials || "VR"}</div>
              <div className="ld-hero-online-dot" title="Active lead" />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div className="ld-hero-name-row">
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  {name}
                </h1>
                {/* Temperature badge with dropdown — neutral until one is set */}
                <div style={{ position: "relative", display: "inline-block" }}>
                  <button
                    type="button"
                    className="ld-hero-tag"
                    onClick={() => setTempOpen(!tempOpen)}
                    title="Change Lead Temperature"
                    style={
                      temperature
                        ? undefined
                        : { background: "#f1f5f9", color: "#64748b", borderColor: "#e2e8f0" }
                    }
                  >
                    {temperature === "hot" ? (
                      <span>🔥</span>
                    ) : temperature === "warm" ? (
                      <span>🌤️</span>
                    ) : temperature === "cold" ? (
                      <span>❄️</span>
                    ) : null}
                    <span>
                      {temperature === "hot"
                        ? "Hot Lead"
                        : temperature === "warm"
                        ? "Warm Lead"
                        : temperature === "cold"
                        ? "Cold Lead"
                        : "Set temperature"}
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>˅</span>
                  </button>

                  {tempOpen ? (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: 4,
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
                        zIndex: 20,
                        minWidth: 140,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 12.5,
                        }}
                        onClick={() => updateLeadTemperature("hot")}
                      >
                        🔥 Hot Lead
                      </button>
                      <button
                        type="button"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 12.5,
                        }}
                        onClick={() => updateLeadTemperature("warm")}
                      >
                        🌤️ Warm Lead
                      </button>
                      <button
                        type="button"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 12.5,
                        }}
                        onClick={() => updateLeadTemperature("cold")}
                      >
                        ❄️ Cold Lead
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Phone with copy button */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569" }}>
                <Icon name="phone" size={12} style={{ color: "#94a3b8" }} />
                <span>{phone}</span>
                <button
                  type="button"
                  className="ld-copy-btn"
                  onClick={() => copyText(phone, "phone")}
                  title={copiedPhone ? "Copied!" : "Copy phone"}
                >
                  {copiedPhone ? (
                    <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Copied</span>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Email with copy button */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569" }}>
                <Icon name="mail" size={12} style={{ color: "#94a3b8" }} />
                <span>{email}</span>
                <button
                  type="button"
                  className="ld-copy-btn"
                  onClick={() => copyText(email, "email")}
                  title={copiedEmail ? "Copied!" : "Copy email"}
                >
                  {copiedEmail ? (
                    <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Copied</span>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Middle Stats Columns */}
          <div className="ld-hero-center">
            <div className="ld-hero-meta-col">
              <span className="ld-hero-meta-lbl">Lead Source</span>
              <span className="lc-badge-source">
                {leadDisplaySource(lead) || "—"}
              </span>
            </div>

            <div className="ld-hero-meta-col">
              <span className="ld-hero-meta-lbl">Status</span>
              {canEditLead ? (
                <LeadStatusSelect value={lead.status} onConfirm={confirmStatus} />
              ) : (
                <StageBadge status={lead.status} />
              )}
            </div>

            <div className="ld-hero-meta-col">
              <span className="ld-hero-meta-lbl">Assigned To</span>
              {lead.assignedTo?.name ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="lc-avatar-orange">
                    {lead.assignedTo.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((p) => p[0].toUpperCase())
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 13.5 }}>
                    {lead.assignedTo.name}
                  </span>
                </div>
              ) : (
                <span style={{ fontWeight: 500, color: "#94a3b8", fontSize: 13.5 }}>Unassigned</span>
              )}
            </div>
          </div>

          {/* Far Right: Created On */}
          <div className="ld-hero-created-box">
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 12, fontWeight: 500 }}>
              <Icon name="calendar" size={14} style={{ color: "#64748b" }} />
              <span>Created On</span>
            </div>
            <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 13.5 }}>
              {formatDate(lead.createdAt)}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 11.5 }}>
              Last updated {formatDate(lead.createdAt)}
            </div>
          </div>
        </div>
      </Reveal>

      {/* 3-Column Layout matching Screenshot 2 */}
      <div className="ld-layout-3col">
        {/* ========================================================= */}
        {/* Left Column: Lead Info, Pipeline Status, Project Details   */}
        {/* ========================================================= */}
        <div>
          {/* Card 1: Lead Information */}
          <Reveal delay={1}>
            <div className="ld-card">
              <div className="ld-card-head">
                <h3 className="ld-card-title">Lead Information</h3>
                {canEditLead ? (
                  <Link href={`/org/leads/${lead.id}/edit`} style={{ color: "#94a3b8" }} title="Edit lead info">
                    <Icon name="edit" size={14} />
                  </Link>
                ) : null}
              </div>
              <div className="ld-card-body">
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="phone" size={13} /> Phone
                  </span>
                  <span className="ld-row-val">{phone}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="mail" size={13} /> Email
                  </span>
                  <span className="ld-row-val">{email}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="profile" size={13} /> Full Name
                  </span>
                  <span className="ld-row-val">{name}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="pin" size={13} /> Location
                  </span>
                  <span className="ld-row-val">{location}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="properties" size={13} /> Configuration
                  </span>
                  <span className="ld-row-val">{configuration}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="billing" size={13} /> Budget
                  </span>
                  <span className="ld-row-val">{preferredBudget}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="target" size={13} /> Purpose
                  </span>
                  <span className="ld-row-val">{purpose}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="target" size={13} /> Source
                  </span>
                  <span className="lc-badge-source">
                    {leadDisplaySource(lead) || "—"}
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Attribution — Organisation Labels enabled by Super Admin */}
          {lead && attributionRows(lead, attributionLabels).length > 0 ? (
            <Reveal delay={1}>
              <div className="ld-card">
                <div className="ld-card-head">
                  <h3 className="ld-card-title">Marketing Attribution</h3>
                </div>
                <div className="ld-card-body">
                  {attributionRows(lead, attributionLabels).map((row) => (
                    <div className="ld-row" key={row.key}>
                      <span className="ld-row-key">{row.label}</span>
                      <span className="ld-row-val">
                        {row.key === "landing_page_url" ? (
                          <a href={row.value} target="_blank" rel="noreferrer">
                            {row.value}
                          </a>
                        ) : (
                          row.value
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          ) : null}

          {/* Card 2: Pipeline Status */}
          <Reveal delay={2}>
            <div className="ld-card">
              <div className="ld-card-head">
                <h3 className="ld-card-title">Pipeline Status</h3>
              </div>
              <div className="ld-card-body">
                {canEditLead ? (
                  <LeadStatusSelect value={lead.status} onConfirm={confirmStatus} />
                ) : (
                  <StageBadge status={lead.status} />
                )}
              </div>
            </div>
          </Reveal>

          {/* Card 3: Project Details */}
          <Reveal delay={3}>
            <div className="ld-card">
              <div className="ld-card-head">
                <h3 className="ld-card-title">Project Details</h3>
              </div>
              <div className="ld-card-body">
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="building" size={13} /> Project
                  </span>
                  <span className="ld-row-val">{project || "—"}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="home" size={13} /> Unit
                  </span>
                  <span className="ld-row-val">{unit || "—"}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="document" size={13} /> Form
                  </span>
                  <span className="ld-row-val">{lead.formName ?? "Manual Lead"}</span>
                </div>
                <div className="ld-row">
                  <span className="ld-row-key">
                    <Icon name="users" size={13} /> Assigned Agent
                  </span>
                  {lead.assignedTo?.name ? (
                    <span
                      style={{
                        background: "#eff6ff",
                        color: "#2563eb",
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      {lead.assignedTo.name}
                    </span>
                  ) : (
                    <span className="ld-row-val" style={{ color: "#94a3b8" }}>Unassigned</span>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* ========================================================= */}
        {/* Middle Column: Activity Feed, Tabs, and Rich Note Box      */}
        {/* ========================================================= */}
        <Reveal delay={2}>
          <div className="ld-card">
            {/* Top Tabs Bar matching Screenshot 2 */}
            <div className="ld-tabs-head">
              {(["activity", "requirements", "communications", "documents", "deal"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`ld-tab-btn ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "activity"
                    ? "Activity"
                    : tab === "requirements"
                    ? "Requirements"
                    : tab === "communications"
                    ? "Communications"
                    : tab === "documents"
                    ? "Documents"
                    : "Deal"}
                </button>
              ))}
            </div>

            <div className="ld-card-body">
              {activeTab === "activity" && (
                <>
                  {/* Action pills: Add Note, Log Call, Send Email, Send WhatsApp */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={`ld-subtab-btn ${composerTab === "note" ? "active" : ""}`}
                      onClick={() => setComposerTab("note")}
                    >
                      Add Note
                    </button>
                    <button
                      type="button"
                      className={`ld-subtab-btn ${composerTab === "call" ? "active" : ""}`}
                      onClick={() => setComposerTab("call")}
                    >
                      Log Call
                    </button>
                    <button
                      type="button"
                      className={`ld-subtab-btn ${composerTab === "email" ? "active" : ""}`}
                      onClick={() => setComposerTab("email")}
                    >
                      Send Email
                    </button>
                    <button
                      type="button"
                      className={`ld-subtab-btn ${composerTab === "whatsapp" ? "active" : ""}`}
                      onClick={() => setComposerTab("whatsapp")}
                    >
                      Send WhatsApp
                    </button>
                  </div>

                  {/* Note Composer Box with Rich Formatting Toolbar */}
                  <div className="ld-note-box">
                    <textarea
                      className="ld-note-textarea"
                      rows={3}
                      value={note}
                      placeholder={
                        composerTab === "call"
                          ? "Log call summary, discussion notes, or next steps..."
                          : composerTab === "email"
                          ? "Write email content or message summary..."
                          : composerTab === "whatsapp"
                          ? "Write WhatsApp message note..."
                          : "Add a note about this lead…"
                      }
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="ld-note-toolbar">
                      <div className="ld-note-tools">
                        <button type="button" className="ld-note-tool-btn" title="Mention team member">@</button>
                        <button type="button" className="ld-note-tool-btn" title="Tag property">@</button>
                        <button type="button" className="ld-note-tool-btn" title="Bold">B</button>
                        <button type="button" className="ld-note-tool-btn" title="Italic"><i>I</i></button>
                        <button type="button" className="ld-note-tool-btn" title="Underline"><u>U</u></button>
                        <button type="button" className="ld-note-tool-btn" title="Bullet List">≡</button>
                        <button type="button" className="ld-note-tool-btn" title="Numbered List">1.</button>
                      </div>

                      <button
                        className="lc-btn-primary"
                        type="button"
                        disabled={!note.trim() || addingNote}
                        onClick={() => void addNote()}
                        style={{ height: 34, padding: "0 18px", fontSize: 13 }}
                      >
                        {addingNote ? "Adding…" : composerTab === "call" ? "Log Call" : "Add Note"}
                      </button>
                    </div>
                  </div>

                  {/* Activity Timeline Header with Filter Dropdown */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, marginBottom: 8 }}>
                    <select
                      className="lc-select-pill"
                      style={{ height: 32, fontSize: 12.5, padding: "0 28px 0 12px" }}
                      value={activityFilter}
                      onChange={(e) => setActivityFilter(e.target.value as typeof activityFilter)}
                    >
                      <option value="all">All Activity</option>
                      <option value="status">Status updated</option>
                      <option value="notes">Notes added</option>
                    </select>
                  </div>

                  {/* Connected Timeline Feed matching Screenshot 2 */}
                  {visibleTimeline.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 13, padding: "8px 0" }}>
                      <Icon name="info" size={15} />
                      <span>
                        {activityFilter === "status"
                          ? "No status updates yet."
                          : activityFilter === "notes"
                            ? "No notes yet."
                            : "No activity yet."}
                      </span>
                    </div>
                  ) : null}
                  <div className="ld-timeline-wrap">
                    {visibleTimeline.length > 0 ? <div className="ld-timeline-line" /> : null}

                    {visibleTimeline.map((event) => {
                      const isCall = event.type === "call_logged";
                      const isNote = event.type === "note_added";
                      const isCreated = event.type === "lead_created";

                      const iconBg = isCall
                        ? "#f0fdf4"
                        : isNote
                        ? "#fff7ed"
                        : isCreated
                        ? "#eff6ff"
                        : "#f5f3ff";
                      const iconColor = isCall
                        ? "#22c55e"
                        : isNote
                        ? "#f97316"
                        : isCreated
                        ? "#3b82f6"
                        : "#8b5cf6";

                      const title = isCall
                        ? "Call logged"
                        : isNote
                        ? "Note added"
                        : isCreated
                        ? "Lead created"
                        : "Status updated";

                      return (
                        <div className="ld-timeline-item" key={event.id}>
                          <div className="ld-timeline-icon" style={{ background: iconBg, color: iconColor }}>
                            {isCall ? (
                              <Icon name="phone" size={15} />
                            ) : isNote ? (
                              <Icon name="document" size={15} />
                            ) : isCreated ? (
                              <Icon name="profile" size={15} />
                            ) : (
                              <Icon name="refresh" size={15} />
                            )}
                          </div>

                          <div className="ld-timeline-content">
                            <div>
                              <div className="ld-timeline-title">{title}</div>
                              <div className="ld-timeline-desc">{event.text}</div>
                            </div>

                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <div className="ld-timeline-meta">
                                <div>{formatDate(event.createdAt)}</div>
                                {event.actor?.name ? <div>{event.actor.name}</div> : null}
                              </div>
                              <button
                                type="button"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "#94a3b8",
                                  cursor: "pointer",
                                  padding: "2px",
                                }}
                                title="Activity options"
                              >
                                <Icon name="dots" size={15} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {activeTab === "requirements" && (
                <DataRows entries={requirements} empty="No requirement details captured yet." />
              )}
              {activeTab === "communications" && (
                <DataRows
                  entries={timeline
                    .filter((e) => ["call_logged", "whatsapp_sent", "whatsapp_read"].includes(e.type))
                    .map((e) => [e.type.replace("_", " "), `${e.text} · ${formatDate(e.createdAt)}`])}
                  empty="No communications recorded yet."
                />
              )}
              {activeTab === "documents" && (
                <DataRows entries={documents} empty="No documents attached to this lead." />
              )}
              {activeTab === "deal" && (
                <DataRows
                  entries={Object.entries(lead.data).filter(([key]) =>
                    /price|deal|booking|payment|status|unit/i.test(key),
                  )}
                  empty="No deal or booking details captured."
                />
              )}
            </div>
          </div>
        </Reveal>

        {/* ========================================================= */}
        {/* Right Column: Quick Actions, Next Action, Tags, Related   */}
        {/* ========================================================= */}
        <div>
          {/* Card 1: Quick Actions — hidden for now. Uncomment to restore.
          <Reveal delay={2}>
            <div className="ld-card">
              <div className="ld-card-head">
                <h3 className="ld-card-title">Quick Actions</h3>
              </div>
              <div className="ld-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <a
                  className="ld-btn-call"
                  href={phone !== "—" ? `tel:${phone}` : undefined}
                >
                  <Icon name="phone" size={15} />
                  <span>Call {phone}</span>
                </a>

                <a
                  className="ld-btn-wa"
                  href={phone !== "—" ? `https://wa.me/${phone.replace(/\D/g, "")}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2ZM12.05 20.16C10.57 20.16 9.12 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.8 7.37 7.5 3.67 12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.05 20.16Z" />
                  </svg>
                  <span>WhatsApp</span>
                </a>

                <a
                  className="ld-btn-mail"
                  href={email !== "—" ? `mailto:${email}` : undefined}
                >
                  <Icon name="mail" size={15} />
                  <span>Send Email</span>
                </a>
              </div>
            </div>
          </Reveal>
          */}

          {/* Card 2: Next Action */}
          <Reveal delay={3}>
            <div className="ld-card">
              <div className="ld-card-head">
                <h3 className="ld-card-title">Next Action</h3>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: 4,
                  }}
                  onClick={() => setScheduleOpen(!scheduleOpen)}
                  title="Schedule Next Action"
                >
                  <Icon name="plus" size={15} />
                </button>
              </div>
              <div className="ld-card-body">
                {lead.nextAction?.scheduledAt ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#0f172a" }}>
                      <Icon name="calendar" size={14} style={{ color: "#2563eb" }} />
                      <span>{lead.nextAction.type === "site_visit" ? "Site visit" : "Follow-up"}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
                      {formatDate(lead.nextAction.scheduledAt)}
                    </div>
                    {lead.nextAction.note ? (
                      <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4 }}>
                        {lead.nextAction.note}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "#64748b", fontSize: 12.5, marginBottom: 14 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>No next action yet. Schedule a follow-up or site visit – it will appear here.</span>
                  </div>
                )}

                {scheduleOpen ? (
                  <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                    <div className="field">
                      <label style={{ fontSize: 12 }}>Action type</label>
                      <select
                        className="inp"
                        value={actionType}
                        onChange={(e) => setActionType(e.target.value as "site_visit" | "follow_up")}
                      >
                        <option value="follow_up">Follow-up</option>
                        <option value="site_visit">Site visit</option>
                      </select>
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 12 }}>Date and time</label>
                      <input
                        className="inp"
                        type="datetime-local"
                        value={actionAt}
                        onChange={(e) => setActionAt(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 12 }}>Note</label>
                      <input
                        className="inp"
                        placeholder="Agenda or location note"
                        value={actionNote}
                        onChange={(e) => setActionNote(e.target.value)}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button
                        className="btn btn-primary btn-block"
                        type="button"
                        disabled={savingAction}
                        onClick={() => void saveNextAction()}
                      >
                        {savingAction ? "Saving…" : "Save schedule"}
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setScheduleOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="lc-btn-primary"
                    style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                  >
                    <Icon name="plus" size={14} /> Schedule Follow-up
                  </button>
                )}
              </div>
            </div>
          </Reveal>

          {/* Card 3: Tags */}
          <Reveal delay={4}>
            <div className="ld-card">
              <div className="ld-card-head">
                <h3 className="ld-card-title">Tags</h3>
              </div>
              <div className="ld-card-body">
                {/* Read-only: tags come from the CRM tag catalog (Settings) and
                    are picked in the Edit lead form. */}
                {lead.tags && lead.tags.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {lead.tags.map((tag) => (
                      <span className="ld-tag-pill" key={tag}>
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 13 }}>
                    <Icon name="info" size={15} />
                    <span>No tags yet.</span>
                  </div>
                )}
              </div>
            </div>
          </Reveal>

          {/* Card 4: Related Leads — hidden until it's functional (the Add
              button does nothing and nothing is loaded). Uncomment to restore.
          <Reveal delay={5}>
            <div className="ld-card">
              <div className="ld-card-head">
                <h3 className="ld-card-title">Related Leads</h3>
                <button
                  type="button"
                  className="lc-btn-outline"
                  style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                >
                  <Icon name="plus" size={11} /> Add
                </button>
              </div>
              <div className="ld-card-body">
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 13 }}>
                  <Icon name="info" size={15} />
                  <span>No related leads yet.</span>
                </div>
              </div>
            </div>
          </Reveal>
          */}
        </div>
      </div>
    </div>
  );
}
