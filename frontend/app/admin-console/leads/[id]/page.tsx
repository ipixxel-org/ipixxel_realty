"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { LeadStatusPill } from "@/components/superadmin/lead-status-pill";
import { ConvertLeadModal } from "@/components/superadmin/convert-lead-modal";
import { useToast } from "@/components/ui/toast";
import {
  addAdminLeadRemark,
  getAdminLead,
  updateAdminLeadFollowUp,
  updateAdminLeadStatus,
} from "@/lib/api";
import {
  leadDisplayEmail,
  leadDisplayName,
  leadDisplayPhone,
  leadDisplaySource,
} from "@/lib/lead-display";
import {
  ADMIN_LEAD_STATUS_META,
  ADMIN_LEAD_STATUS_ORDER,
  formatAdminLeadDate,
  timeAgo,
  toDateTimeLocal,
} from "@/lib/admin-leads";
import type { AdminLeadDetail, AdminLeadStatus } from "@/lib/types";

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f4f7fa" }}>
      <span className="muted" style={{ minWidth: 150, fontSize: 12.5 }}>
        {label}
      </span>
      <span style={{ fontSize: 13.5, wordBreak: "break-word" }}>{displayValue(value)}</span>
    </div>
  );
}

export default function AdminLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { toast } = useToast();

  const [lead, setLead] = useState<AdminLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusDraft, setStatusDraft] = useState<AdminLeadStatus>("new");
  const [statusRemark, setStatusRemark] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const [remark, setRemark] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  const [followUpAt, setFollowUpAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getAdminLead(id);
      setLead(res);
      setStatusDraft(res.status);
      setFollowUpAt(toDateTimeLocal(res.nextAction?.scheduledAt));
      setReminderAt(toDateTimeLocal(res.nextAction?.reminderAt));
      setFollowUpNote(res.nextAction?.note ?? "");
      setNotFound(false);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load lead.";
      if (/not found/i.test(message)) setNotFound(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() owns its async loading state
    void load();
  }, [load]);

  const name = lead ? leadDisplayName(lead) : "Lead";
  const phone = lead ? leadDisplayPhone(lead) : "";
  const email = lead ? leadDisplayEmail(lead) : "";
  const source = lead ? leadDisplaySource(lead) : "";

  const capturedFields = lead?.data
    ? Object.entries(lead.data)
        .filter(([key]) => !["unitId"].includes(key))
        .map(([key, value]) => ({ key, value }))
    : [];

  const hasAttribution = lead
    ? Object.values(lead.attribution).some((value) => Boolean(value))
    : false;

  async function saveStatus() {
    if (!lead) return;
    setSavingStatus(true);
    setError(null);
    try {
      const updated = await updateAdminLeadStatus(lead.id, {
        status: statusDraft,
        remark: statusRemark.trim() || undefined,
      });
      setLead(updated);
      setStatusRemark("");
      toast({ title: "Lead status updated", description: ADMIN_LEAD_STATUS_META[statusDraft].label });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update status.";
      setError(message);
      toast({ title: "Status update failed", description: message, variant: "error" });
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveRemark() {
    if (!lead || !remark.trim()) return;
    setSavingRemark(true);
    setError(null);
    try {
      const activity = await addAdminLeadRemark(lead.id, remark.trim());
      setLead((prev) =>
        prev ? { ...prev, activities: [activity, ...prev.activities] } : prev,
      );
      setRemark("");
      toast({ title: "Remark added" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not add remark.";
      setError(message);
      toast({ title: "Remark failed", description: message, variant: "error" });
    } finally {
      setSavingRemark(false);
    }
  }

  async function saveFollowUp() {
    if (!lead) return;
    if (!followUpAt) {
      setError("Choose a follow-up date and time.");
      return;
    }
    const scheduled = new Date(followUpAt);
    if (Number.isNaN(scheduled.getTime())) {
      setError("Follow-up date is invalid.");
      return;
    }
    const reminder = reminderAt ? new Date(reminderAt) : null;
    if (reminder && Number.isNaN(reminder.getTime())) {
      setError("Reminder date is invalid.");
      return;
    }

    setSavingFollowUp(true);
    setError(null);
    try {
      const res = await updateAdminLeadFollowUp(lead.id, {
        scheduledAt: scheduled.toISOString(),
        reminderAt: reminder ? reminder.toISOString() : undefined,
        note: followUpNote.trim() || undefined,
      });
      setLead((prev) =>
        prev
          ? {
              ...prev,
              nextAction: res.nextAction,
              activities: [res.activity, ...prev.activities],
            }
          : prev,
      );
      toast({ title: lead.nextAction ? "Follow-up updated" : "Follow-up scheduled" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save follow-up.";
      setError(message);
      toast({ title: "Follow-up failed", description: message, variant: "error" });
    } finally {
      setSavingFollowUp(false);
    }
  }

  if (notFound) {
    return (
      <div className="card">
        <div className="card-b">
          <p className="muted">Lead not found.</p>
          <Link href="/admin-console/leads" className="btn btn-ghost btn-sm">
            Back to Leads
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !lead) {
    return (
      <div className="card">
        <div className="card-b">
          <p className="muted">{error || "Loading lead…"}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Link href="/admin-console/leads" style={{ color: "inherit", textDecoration: "none" }}>
              <Icon name="target" size={14} /> Lead Management
            </Link>{" "}
            · {lead.formName || "Lead Forms Builder"}
          </div>
          <h1>
            {name} <LeadStatusPill status={lead.status} style={{ verticalAlign: "middle" }} />
          </h1>
          <div className="sub">
            {[phone, email].filter(Boolean).join(" · ") || "No contact details"} · Captured{" "}
            {formatAdminLeadDate(lead.createdAt)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {lead.convertedOrg ? (
            <Link
              href={`/admin-console/organisation-detail/${lead.convertedOrg.id}`}
              className="btn btn-sm"
              style={{
                background: "#ecfdf5",
                color: "#059669",
                border: "1px solid #a7f3d0",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
              }}
            >
              <Icon name="building" size={14} /> View Organisation: {lead.convertedOrg.name} ↗
            </Link>
          ) : lead.status === "converted" ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                borderColor: "#059669",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => setConvertModalOpen(true)}
            >
              <Icon name="sparkles" size={14} /> Convert to Organisation
            </button>
          ) : null}
          <Link href="/admin-console/leads" className="btn btn-ghost btn-sm">
            Back to Leads
          </Link>
          {phone ? (
            <a href={`tel:${phone}`} className="btn btn-primary btn-sm">
              <Icon name="phone" size={14} /> Call
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}`} className="btn btn-ghost btn-sm">
              <Icon name="mail" size={14} /> Email
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="form-alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {lead.convertedOrg ? (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#dcfce7",
                color: "#16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="check" size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#166534" }}>
                Lead Converted into Organisation: {lead.convertedOrg.name}
              </div>
              <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 2 }}>
                Converted {formatAdminLeadDate(lead.convertedOrg.convertedAt || lead.createdAt)}. You can manage its profile, subscriptions, and templates anytime.
              </div>
            </div>
          </div>
          <Link
            href={`/admin-console/organisation-detail/${lead.convertedOrg.id}`}
            className="btn btn-primary btn-sm"
            style={{ background: "#16a34a", borderColor: "#16a34a", whiteSpace: "nowrap" }}
          >
            Open Organisation Setup →
          </Link>
        </div>
      ) : lead.status === "converted" ? (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#dbeafe",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="sparkles" size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e40af" }}>
                Lead Ready for Organisation Conversion
              </div>
              <div style={{ fontSize: 12.5, color: "#2563eb", marginTop: 2 }}>
                This lead is marked as Completed/Converted. Convert it now to generate credentials and configure workspace.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setConvertModalOpen(true)}
          >
            Convert to Organisation →
          </button>
        </div>
      ) : null}

      <div className="grid g-2-1">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Reveal delay={1}>
            <div className="card">
              <div className="card-h">
                <span className="t">Lead overview</span>
                <span className="x">{source || "Website"}</span>
              </div>
              <div className="card-b">
                <div className="grid g2" style={{ gap: 24 }}>
                  <div>
                    <DetailRow label="Full name" value={name} />
                    <DetailRow label="Phone" value={phone || lead.details.altPhone} />
                    <DetailRow label="Email" value={email} />
                    <DetailRow label="WhatsApp" value={lead.details.whatsapp} />
                    <DetailRow label="Alternate name" value={lead.details.altName} />
                    <DetailRow label="City" value={lead.details.city} />
                  </div>
                  <div>
                    <DetailRow label="Form" value={lead.formName || "—"} />
                    <DetailRow
                      label="Embed ID"
                      value={lead.landingPageId ? lead.landingPageId.replace(/^embed_/, "") : "—"}
                    />
                    <DetailRow label="Source" value={source} />
                    <DetailRow label="Assigned to" value={lead.assignedTo?.name} />
                    <DetailRow
                      label="Created"
                      value={formatAdminLeadDate(lead.createdAt)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="card">
              <div className="card-h">
                <span className="t">Requirement &amp; preferences</span>
              </div>
              <div className="card-b">
                <div className="grid g2" style={{ gap: 24 }}>
                  <div>
                    <DetailRow
                      label="Budget"
                      value={
                        lead.details.budgetMin || lead.details.budgetMax
                          ? [lead.details.budgetMin, lead.details.budgetMax]
                              .filter((v) => v != null)
                              .map((v) => Number(v).toLocaleString("en-IN"))
                              .join(" – ")
                          : null
                      }
                    />
                    <DetailRow label="Configurations" value={lead.details.configurations} />
                    <DetailRow label="Purpose" value={lead.details.purpose} />
                    <DetailRow label="Timeline" value={lead.details.timelineToBuy} />
                    <DetailRow label="Facing" value={lead.details.facing} />
                  </div>
                  <div>
                    <DetailRow label="Financing" value={lead.details.financing} />
                    <DetailRow label="Loan status" value={lead.details.loanStatus} />
                    <DetailRow label="Preferred floor" value={lead.details.preferredFloor} />
                    <DetailRow label="Parking" value={lead.details.parking} />
                    <DetailRow label="Temperature" value={lead.details.temperature} />
                  </div>
                </div>
                <div className="divider" />
                <DetailRow label="Requirement notes" value={lead.details.requirementNotes} />
                <DetailRow label="Tags" value={lead.details.tags} />
                <DetailRow
                  label="Consent"
                  value={[
                    lead.details.consentCall ? "Call" : null,
                    lead.details.consentWhatsapp ? "WhatsApp" : null,
                    lead.details.consentEmail ? "Email" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                />
              </div>
            </div>
          </Reveal>

          <Reveal delay={3}>
            <div className="card">
              <div className="card-h">
                <span className="t">Captured form fields</span>
                <span className="x">{capturedFields.length} fields</span>
              </div>
              <div className="card-b">
                {capturedFields.length === 0 ? (
                  <p className="muted">No captured fields.</p>
                ) : (
                  <div className="grid g2" style={{ gap: 24 }}>
                    {capturedFields.map(({ key, value }) => (
                      <DetailRow key={key} label={key} value={value} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Reveal>

          {hasAttribution ? (
            <Reveal delay={4}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Attribution</span>
                </div>
                <div className="card-b">
                  <div className="grid g2" style={{ gap: 24 }}>
                    <div>
                      <DetailRow label="Campaign" value={lead.attribution.campaign} />
                      <DetailRow label="Medium" value={lead.attribution.medium} />
                      <DetailRow label="Ad set" value={lead.attribution.adSet} />
                      <DetailRow label="Ad" value={lead.attribution.ad} />
                      <DetailRow label="UTM source" value={lead.attribution.utmSource} />
                      <DetailRow label="UTM medium" value={lead.attribution.utmMedium} />
                    </div>
                    <div>
                      <DetailRow label="UTM campaign" value={lead.attribution.utmCampaign} />
                      <DetailRow label="UTM term" value={lead.attribution.utmTerm} />
                      <DetailRow label="UTM content" value={lead.attribution.utmContent} />
                      <DetailRow label="Referrer" value={lead.attribution.referrer} />
                      <DetailRow label="fbclid" value={lead.attribution.fbclid} />
                      <DetailRow label="gclid" value={lead.attribution.gclid} />
                    </div>
                  </div>
                  {lead.landingPageUrl ? (
                    <div style={{ marginTop: 12 }}>
                      <a
                        href={lead.landingPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="brand-link"
                        style={{ fontSize: 13 }}
                      >
                        <Icon name="external" size={13} /> Landing page URL
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </Reveal>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Reveal delay={1}>
            <div className="card">
              <div className="card-h">
                <span className="t">Update status</span>
                <LeadStatusPill status={lead.status} />
              </div>
              <div className="card-b">
                <div className="field">
                  <label htmlFor="lead-status">Pipeline stage</label>
                  <select
                    id="lead-status"
                    className="inp"
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value as AdminLeadStatus)}
                  >
                    {ADMIN_LEAD_STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {ADMIN_LEAD_STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="status-remark">Remark</label>
                  <textarea
                    id="status-remark"
                    className="inp"
                    rows={3}
                    maxLength={2000}
                    placeholder="Optional note for this status change"
                    value={statusRemark}
                    onChange={(e) => setStatusRemark(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={savingStatus}
                  onClick={() => void saveStatus()}
                >
                  {savingStatus ? "Saving…" : "Save status"}
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="card">
              <div className="card-h">
                <span className="t">Follow-up</span>
                {lead.nextAction ? (
                  <span className={`badge ${lead.nextAction.overdue ? "b-rose" : "b-amber"}`}>
                    {lead.nextAction.overdue ? "Overdue" : "Scheduled"}
                  </span>
                ) : (
                  <span className="badge b-gray">Not scheduled</span>
                )}
              </div>
              <div className="card-b">
                {lead.nextAction ? (
                  <div className="form-alert ok" style={{ marginBottom: 14, fontSize: 12.5 }}>
                    {formatAdminLeadDate(lead.nextAction.scheduledAt)}
                    {lead.nextAction.note ? ` · ${lead.nextAction.note}` : ""}
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="lead-follow-up">Follow-up at</label>
                  <input
                    id="lead-follow-up"
                    type="datetime-local"
                    className="inp"
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="lead-reminder">Reminder at</label>
                  <input
                    id="lead-reminder"
                    type="datetime-local"
                    className="inp"
                    value={reminderAt}
                    onChange={(e) => setReminderAt(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="lead-follow-up-note">Note</label>
                  <textarea
                    id="lead-follow-up-note"
                    className="inp"
                    rows={2}
                    maxLength={2000}
                    placeholder="What should happen on this follow-up?"
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={savingFollowUp}
                  onClick={() => void saveFollowUp()}
                >
                  {savingFollowUp ? "Saving…" : lead.nextAction ? "Update follow-up" : "Schedule follow-up"}
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={3}>
            <div className="card">
              <div className="card-h">
                <span className="t">Add remark</span>
              </div>
              <div className="card-b">
                <div className="field">
                  <textarea
                    className="inp"
                    rows={4}
                    maxLength={2000}
                    placeholder="Add a note to the activity history…"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={savingRemark || !remark.trim()}
                  onClick={() => void saveRemark()}
                >
                  {savingRemark ? "Adding…" : "Add remark"}
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={4}>
            <div className="card">
              <div className="card-h">
                <span className="t">Activity history</span>
                <span className="x">{lead.activities.length} events</span>
              </div>
              <div className="card-b">
                {lead.activities.length === 0 ? (
                  <p className="muted">No activity yet.</p>
                ) : (
                  <ul className="timeline">
                    {lead.activities.map((activity) => (
                      <li key={activity.id}>
                        <span className="td" />
                        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{activity.text}</div>
                        <div className="tt">
                          {activity.actor?.name ?? "System"} · {timeAgo(activity.createdAt)} ·{" "}
                          {formatAdminLeadDate(activity.createdAt)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Reveal>

          {lead.callLogs.length > 0 ? (
            <Reveal delay={5}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Call history</span>
                </div>
                <div className="card-b">
                  <ul className="timeline">
                    {lead.callLogs.map((call) => (
                      <li key={call.id}>
                        <span className="td" />
                        <div style={{ fontSize: 13.5 }}>
                          {call.direction === "outgoing" ? "Outgoing" : "Incoming"} ·{" "}
                          {call.outcome.replaceAll("_", " ")} · {call.durationSeconds}s
                        </div>
                        <div className="tt">
                          {call.actor?.name ?? "System"} · {formatAdminLeadDate(call.createdAt)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ) : null}
        </div>
      </div>

      <ConvertLeadModal
        isOpen={convertModalOpen}
        lead={lead}
        onClose={() => setConvertModalOpen(false)}
        onSuccess={() => void load()}
      />
    </>
  );
}
