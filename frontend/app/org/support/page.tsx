"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SUPPORT_ACTIONS } from "@/lib/permissions";
import {
  createSupportTicket,
  createSupportUploadUrl,
  getSupportTickets,
} from "@/lib/api";
import { Reveal } from "@/components/superadmin/reveal";
import { ReasonInfoPopover } from "@/components/superadmin/reason-info-popover";
import { Icon } from "@/components/icons";
import {
  Field,
  FormAlert,
  FormGrid,
  SelectInput,
  TextArea,
  TextInput,
  formPageStyles,
} from "@/components/forms/form-page";
import { LIST_PAGE_SIZE, ListPager } from "@/components/ui/list-pager";
import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketSummary,
} from "@/lib/types";

const CATEGORIES: SupportTicketCategory[] = [
  "Billing",
  "Calling",
  "WhatsApp",
  "Leads",
  "Projects",
  "Other",
];

const PRIORITIES: { value: SupportTicketPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const PRIORITY_BADGE: Record<SupportTicketPriority, string> = {
  normal: "b-gray",
  high: "b-rose",
  urgent: "b-rose",
};

const STATUS_BADGE: Record<string, string> = {
  open: "b-amber",
  ongoing: "b-sky",
  on_hold: "b-violet",
  resolved: "b-green",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  ongoing: "In Progress",
  on_hold: "On Hold",
  resolved: "Resolved",
};

// TODO: only used by the commented-out Quick help card — re-enable with it.
// const QUICK_HELP = [
//   { icon: "🚀", label: "Getting started" },
//   { icon: "📱", label: "Connecting Meta leads" },
//   { icon: "📞", label: "Setting up AI calling" },
//   { icon: "💬", label: "WhatsApp templates" },
//   { icon: "🔀", label: "Distributing leads" },
// ];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

async function uploadSupportFile(file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await createSupportUploadUrl({
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
  return publicUrl;
}

export default function OrgSupportPage() {
  const { accessToken, hasPermission } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Support pills — enforced for the org admin too (set by Super Admin).
  const canView = hasPermission("support", "view");
  const canAdd = hasPermission("support", SUPPORT_ACTIONS.raiseTicket);

  useEffect(() => {
    if (accessToken && !canView) {
      router.replace("/org");
    }
  }, [accessToken, canView, router]);

  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("Billing");
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [message, setMessage] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    getSupportTickets({ page, limit: LIST_PAGE_SIZE })
      .then((res) => {
        if (res.data.length === 0 && page > 1 && res.total > 0) {
          setPage(Math.ceil(res.total / LIST_PAGE_SIZE));
          return;
        }
        setTickets(res.data);
        setTotal(res.total);
        setLoadError(null);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Couldn't load tickets."),
      )
      .finally(() => setLoading(false));
  }, [accessToken, reloadTick, page]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setFormError(null);
    setUploading(true);
    try {
      const urls: string[] = [];
      const names: string[] = [];
      for (const file of Array.from(files).slice(0, 10 - attachmentUrls.length)) {
        urls.push(await uploadSupportFile(file));
        names.push(file.name);
      }
      setAttachmentUrls((prev) => [...prev, ...urls]);
      setAttachmentNames((prev) => [...prev, ...names]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Attachment upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(index: number) {
    setAttachmentUrls((prev) => prev.filter((_, i) => i !== index));
    setAttachmentNames((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitTicket() {
    if (!subject.trim() || !message.trim()) {
      setFormError("Subject and message are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createSupportTicket({
        subject: subject.trim(),
        category,
        priority,
        message: message.trim(),
        attachmentUrls: attachmentUrls.length ? attachmentUrls : undefined,
      });
      setSubject("");
      setCategory("Billing");
      setPriority("normal");
      setMessage("");
      setAttachmentUrls([]);
      setAttachmentNames([]);
      setPage(1);
      setReloadTick((t) => t + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to submit ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Icon name="flag" size={14} /> More
          </div>
          <h1>Support &amp; Help</h1>
          <div className="sub">Get help or reach the iPixxel team.</div>
        </div>
      </div>

      {/* TODO: was className="grid g-2-1" (2:1 with the sidebar below) — restore when the sidebar is re-enabled. */}
      <div className="grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {canAdd ? (
            <Reveal delay={1}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Contact support</span>
                  <span className="x">Typical reply within 4 hrs</span>
                </div>
                <div className="card-b">
                  <div className={formPageStyles.page}>
                  <FormAlert message={formError} />
                  <Field htmlFor="st-subject" label="Subject" icon="document">
                    <TextInput
                      id="st-subject"
                      icon="document"
                      placeholder="Briefly, what do you need help with?"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </Field>
                  <FormGrid>
                    <Field htmlFor="st-category" label="Category" icon="tag">
                      <SelectInput
                        id="st-category"
                        icon="tag"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field htmlFor="st-priority" label="Priority" icon="flag">
                      <SelectInput
                        id="st-priority"
                        icon="flag"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </SelectInput>
                    </Field>
                  </FormGrid>
                  <Field htmlFor="st-message" label="Message" icon="mail">
                    <TextArea
                      id="st-message"
                      rows={5}
                      placeholder="Describe the issue, include project or lead IDs if relevant…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>
                  <div className="field">
                    <label>Attachments</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => void handleFiles(e.target.files)}
                    />
                    <div
                      style={{
                        border: "1.5px dashed var(--line-2)",
                        borderRadius: 12,
                        padding: 24,
                        textAlign: "center",
                        color: "var(--muted)",
                        background: "var(--surface-2)",
                        cursor: uploading ? "wait" : "pointer",
                      }}
                      onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                      <Icon name="upload" size={16} />{" "}
                      {uploading ? (
                        "Uploading…"
                      ) : (
                        <>
                          Drag files here or{" "}
                          <span style={{ color: "var(--brand)", fontWeight: 600 }}>browse</span>
                        </>
                      )}
                      <div style={{ fontSize: 12, marginTop: 4 }}>PNG, JPG, PDF up to 10 MB</div>
                    </div>
                    {attachmentNames.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                        {attachmentNames.map((name, i) => (
                          <span key={`${name}-${i}`} className="chip">
                            {name}
                            <button
                              type="button"
                              className="x-btn"
                              aria-label={`Remove ${name}`}
                              onClick={() => removeAttachment(i)}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className={formPageStyles.actions}>
                    <button
                      className={formPageStyles.btnPrimary}
                      type="button"
                      disabled={submitting || uploading}
                      onClick={() => void submitTicket()}
                    >
                      <Icon name="check" size={16} />
                      {submitting ? "Submitting…" : "Submit ticket"}
                    </button>
                  </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ) : null}

          <Reveal delay={2}>
            <div className="card">
              <div className="card-h">
                <span className="t">Recent tickets</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Subject</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadError ? (
                      <tr>
                        <td colSpan={6} className="muted">{loadError}</td>
                      </tr>
                    ) : !loading && tickets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No tickets yet — raise one above if you need a hand.
                        </td>
                      </tr>
                    ) : (
                      tickets.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                              {t.hasUnread ? (
                                <span
                                  className="dot"
                                  title="New activity"
                                  style={{ background: "var(--rose)", flexShrink: 0 }}
                                />
                              ) : null}
                              <Link href={`/org/support/${t.id}`} className="mono brand-link">
                                #{t.code}
                              </Link>
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/org/support/${t.id}`}
                              style={{ color: "inherit", fontWeight: t.hasUnread ? 700 : 400 }}
                            >
                              {t.subject}
                            </Link>
                          </td>
                          <td>{t.category}</td>
                          <td>
                            <span className={`badge ${PRIORITY_BADGE[t.priority]}`}>
                              {t.priority === "normal" ? "Normal" : t.priority === "high" ? "High" : "Urgent"}
                            </span>
                          </td>
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span className={`badge ${STATUS_BADGE[t.status]}`}>
                                {STATUS_LABEL[t.status]}
                              </span>
                              {t.status === "on_hold" && t.holdReason ? (
                                <ReasonInfoPopover reason={t.holdReason} label="On-hold reason" />
                              ) : null}
                            </span>
                          </td>
                          <td className="muted">{timeAgo(t.updatedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <ListPager page={page} total={total} loading={loading} onPageChange={setPage} noun="tickets" />
            </div>
          </Reveal>
        </div>

        {/* TODO: static sidebar — Quick help (links go to "#"), Documentation (button has no handler) and Chat on WhatsApp (hardcoded number). Re-enable together with the "g-2-1" grid class above.
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Reveal delay={1}>
            <div className="card">
              <div className="card-h"><span className="t">Quick help</span></div>
              <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {QUICK_HELP.map((item) => (
                  <a
                    key={item.label}
                    href="#"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "11px 12px",
                      borderRadius: 10,
                    }}
                  >
                    <b>{item.icon} {item.label}</b>
                    <span className="muted">→</span>
                  </a>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="card">
              <div className="card-h"><span className="t">Documentation</span></div>
              <div className="card-b">
                <p className="muted" style={{ marginBottom: 14 }}>
                  Browse guides, API references and video walkthroughs for the whole platform.
                </p>
                <button className="btn btn-ghost btn-block" type="button">
                  📚 Open documentation
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={3}>
            <div
              className="card"
              style={{
                background: "linear-gradient(150deg,#16a34a,#0d9488)",
                border: "none",
                color: "#fff",
              }}
            >
              <div className="card-b">
                <div style={{ fontSize: 26 }}>💬</div>
                <h3 style={{ color: "#fff", margin: "10px 0 6px" }}>Chat on WhatsApp</h3>
                <p style={{ color: "rgba(255,255,255,.85)", marginBottom: 16 }}>
                  Talk to the iPixxel support team directly. Fast answers for urgent issues.
                </p>
                <div
                  className="mono"
                  style={{
                    background: "rgba(255,255,255,.15)",
                    borderColor: "rgba(255,255,255,.25)",
                    color: "#fff",
                    display: "inline-block",
                    marginBottom: 16,
                  }}
                >
                  +91 91520 40080
                </div>
                <a
                  href="https://wa.me/919152040080"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-block"
                  style={{ background: "#fff", color: "var(--green)" }}
                >
                  Start chat →
                </a>
              </div>
            </div>
          </Reveal>
        </div>
        */}
      </div>
    </>
  );
}
