"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/components/icons";
import { formPageStyles } from "@/components/forms/form-page";
import { Modal } from "@/components/ui/modal";
import {
  getSmtpConfig,
  updateSmtpConfig,
  sendSmtpTestEmail,
  getEmailLogs,
  getEmailStats,
} from "@/lib/api";
import type {
  SmtpConfig,
  UpdateSmtpConfigInput,
  EmailLogEntry,
  EmailStatsResponse,
} from "@/lib/types";

export default function SuperAdminEmailPage() {
  const [activeTab, setActiveTab] = useState<"settings" | "templates" | "logs">("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // SMTP Form State
  const [form, setForm] = useState<UpdateSmtpConfigInput>({
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    fromEmail: "",
    fromName: "iPixxel Realty",
    replyTo: "",
    isActive: true,
    inviteSubject: "You've been invited to join {orgName}",
    inviteBody: "You have been invited to join {orgName} on the iPixxel Realty platform as a {role}.",
    resetSubject: "Reset your iPixxel Realty password",
    resetBody: "We received a request to reset the password for your account. Click the button below to choose a new password.",
    accountActivatedSubject: "Your iPixxel Realty Account Has Been Activated",
    accountActivatedBody: "Your account has been activated by your Organisation Administrator.\n\nYou can now sign in to your account and access the iPixxel Realty platform.",
    accountDeactivatedSubject: "Your iPixxel Realty Account Has Been Deactivated",
    accountDeactivatedBody: "Your account has been deactivated by your Organisation Administrator.\n\nYou no longer have access to the iPixxel Realty platform.\n\nIf you believe this was done in error or you need your account reactivated, please contact your Organisation Administrator.",
  });
  const [hasPassword, setHasPassword] = useState(false);

  // Test Email State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Logs & Stats State
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [stats, setStats] = useState<EmailStatsResponse>({
    totalSent: 0,
    totalFailed: 0,
    totalDispatched: 0,
    lastDispatchedAt: null,
  });
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState("all");
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const [logsSearch, setLogsSearch] = useState("");
  const [logsPage, setLogsPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken || user?.role !== "super_admin") {
      setLoading(false);
      return;
    }
    loadData();
  }, [authLoading, accessToken, user]);

  async function loadData() {
    setLoading(true);
    try {
      const [configRes, statsRes] = await Promise.allSettled([
        getSmtpConfig(),
        getEmailStats(),
      ]);
      void loadLogs(1, logsFilter, logsSearch);

      if (configRes.status === "fulfilled" && configRes.value) {
        const c = configRes.value;
        setForm({
          host: c.host || "",
          port: c.port || 587,
          secure: Boolean(c.secure),
          user: c.user || "",
          password: c.hasPassword ? "••••••••" : "",
          fromEmail: c.fromEmail || "",
          fromName: c.fromName || "iPixxel Realty",
          replyTo: c.replyTo || "",
          isActive: c.isActive ?? true,
          inviteSubject: c.inviteSubject || "You've been invited to join {orgName}",
          inviteBody: c.inviteBody || "You have been invited to join {orgName} on the iPixxel Realty platform as a {role}.",
          resetSubject: c.resetSubject || "Reset your iPixxel Realty password",
          resetBody: c.resetBody || "We received a request to reset the password for your account. Click the button below to choose a new password.",
          accountActivatedSubject: c.accountActivatedSubject || "Your iPixxel Realty Account Has Been Activated",
          accountActivatedBody: c.accountActivatedBody || "Your account has been activated by your Organisation Administrator.\n\nYou can now sign in to your account and access the iPixxel Realty platform.",
          accountDeactivatedSubject: c.accountDeactivatedSubject || "Your iPixxel Realty Account Has Been Deactivated",
          accountDeactivatedBody: c.accountDeactivatedBody || "Your account has been deactivated by your Organisation Administrator.\n\nYou no longer have access to the iPixxel Realty platform.\n\nIf you believe this was done in error or you need your account reactivated, please contact your Organisation Administrator.",
        });
        setHasPassword(Boolean(c.hasPassword));
      }

      if (statsRes.status === "fulfilled" && statsRes.value) {
        setStats(statsRes.value);
      }
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message || "Failed to load SMTP configuration." });
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs(page = 1, status = logsFilter, search = logsSearch) {
    setLogsLoading(true);
    try {
      const res = await getEmailLogs({
        page,
        limit: 10,
        status,
        search,
      });
      setLogs(res.data);
      setLogsPage(res.page);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      console.error("Failed to load logs:", err);
      setLogs([]);
      setFeedback({ type: "error", msg: err.message || "Failed to load email logs." });
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "logs") {
      loadLogs(1, logsFilter, logsSearch);
    }
  }, [activeTab, logsFilter]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await updateSmtpConfig(form);
      setHasPassword(Boolean(updated.hasPassword));
      setFeedback({ type: "success", msg: "SMTP configuration updated successfully!" });
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message || "Failed to save SMTP settings." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTestEmail(e?: React.FormEvent) {
    e?.preventDefault();
    if (!testRecipient) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendSmtpTestEmail({ to: testRecipient.trim() });
      setTestResult({ success: true, msg: res.message });
      // Refresh stats
      const statsRes = await getEmailStats();
      setStats(statsRes);
      await loadLogs(1, logsFilter, logsSearch);
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message || "Failed to send test email." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Icon name="mail" size={14} /> System & Delivery
          </div>
          <h1>Email &amp; SMTP Management</h1>
          <div className="sub">
            Configure platform SMTP email delivery, manage credentials, verify connections, and audit transactional dispatches.
          </div>
        </div>
        <div className="actions">
          <button
            className="btn btn-ghost"
            onClick={() => {
              setTestRecipient(form.fromEmail || "");
              setTestResult(null);
              setTestModalOpen(true);
            }}
          >
            <Icon name="mail" size={14} /> Send test email
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: feedback.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            color: feedback.type === "success" ? "#065f46" : "#991b1b",
            border: `1px solid ${feedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span>{feedback.msg}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid g3" style={{ marginBottom: 22 }}>
        <div className="card">
          <div className="card-b" style={{ padding: "16px 20px" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
              Total Sent
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#10b981", marginTop: 4 }}>
              {stats.totalSent}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Successfully dispatched via SMTP
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-b" style={{ padding: "16px 20px" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
              Delivery Failures
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: stats.totalFailed > 0 ? "#ef4444" : "var(--fg-muted)", marginTop: 4 }}>
              {stats.totalFailed}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Connection or mailbox rejections
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-b" style={{ padding: "16px 20px" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
              Service Status
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span className={`badge ${form.isActive && form.host ? "b-green" : "b-amber"}`}>
                <span className="dot" style={{ background: "currentColor" }} />
                {form.isActive && form.host ? "Active & Configured" : "Inactive / Incomplete"}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {form.host ? `Host: ${form.host}:${form.port}` : "No SMTP host configured"}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs reveal in">
        <a
          className={activeTab === "settings" ? "active" : ""}
          onClick={() => setActiveTab("settings")}
          style={{ cursor: "pointer" }}
        >
          SMTP Server Configuration
        </a>
        <a
          className={activeTab === "templates" ? "active" : ""}
          onClick={() => setActiveTab("templates")}
          style={{ cursor: "pointer" }}
        >
          Message Templates
        </a>
        <a
          className={activeTab === "logs" ? "active" : ""}
          onClick={() => setActiveTab("logs")}
          style={{ cursor: "pointer" }}
        >
          Delivery Audit Logs
        </a>
      </div>

      {activeTab === "settings" ? (
        <form onSubmit={handleSave} className={formPageStyles.page}>
          <div className="card reveal in" style={{ marginBottom: 22 }}>
            <div className="card-h">
              <span className="t">SMTP Server Credentials</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Used for invites, password resets, and automated alerts
              </span>
            </div>
            <div className="card-b">
              <div className="row2">
                <div className="field">
                  <label>SMTP Host</label>
                  <input
                    className="inp inp-mono"
                    placeholder="smtp.gmail.com or smtp.sendgrid.net"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    required
                  />
                  <div className="hint">The mail server hostname provided by your email service.</div>
                </div>
                <div className="field">
                  <label>SMTP Port</label>
                  <input
                    className="inp inp-mono"
                    type="number"
                    placeholder="587"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
                    required
                  />
                  <div className="hint">Typical ports: 587 (STARTTLS), 465 (SSL), 25.</div>
                </div>
              </div>

              <div className="row2">
                <div className="field">
                  <label>SMTP Username / User</label>
                  <input
                    className="inp inp-mono"
                    placeholder="apikey or admin@yourdomain.com"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                  />
                  <div className="hint">Leave empty if authentication is not required.</div>
                </div>
                <div className="field">
                  <label>
                    SMTP Password / App Key
                    {hasPassword && <span style={{ color: "#10b981", fontSize: 11, marginLeft: 8 }}>(Saved)</span>}
                  </label>
                  <input
                    className="inp inp-mono"
                    type="password"
                    placeholder={hasPassword ? "•••••••• (enter new to update)" : "SMTP password or secret key"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <div className="hint">Will be securely stored and never exposed in cleartext.</div>
                </div>
              </div>

              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.secure}
                    onChange={(e) => setForm({ ...form, secure: e.target.checked })}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span>Enable SSL / TLS encryption (recommended for port 465; uncheck for STARTTLS on port 587)</span>
                </label>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span>Enable SMTP email delivery across the platform</span>
                </label>
              </div>
            </div>
          </div>

          <div className="card reveal in" style={{ marginBottom: 22 }}>
            <div className="card-h">
              <span className="t">Sender Identity</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Default sender name and email headers displayed to recipients
              </span>
            </div>
            <div className="card-b">
              <div className="row2">
                <div className="field">
                  <label>From Name</label>
                  <input
                    className="inp"
                    placeholder="iPixxel Realty"
                    value={form.fromName}
                    onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>From Email</label>
                  <input
                    className="inp inp-mono"
                    type="email"
                    placeholder="notifications@ipixxelrealty.com"
                    value={form.fromEmail}
                    onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Reply-To Address (Optional)</label>
                <input
                  className="inp inp-mono"
                  type="email"
                  placeholder="support@ipixxelrealty.com"
                  value={form.replyTo || ""}
                  onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
                />
                <div className="hint">Responses to automated platform emails will route to this inbox.</div>
              </div>
            </div>
          </div>
        </form>
      ) : activeTab === "templates" ? (
        <form onSubmit={handleSave} className={formPageStyles.page}>
          <div className="card reveal in" style={{ marginBottom: 22 }}>
            <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="t">User Invitation Email</span>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Sent when an Organisation Admin invites a manager or sales agent to their team
                </div>
              </div>
              <span className="badge b-indigo">template: invite</span>
            </div>
            <div className="card-b">
              <div className="field">
                <label>Email Subject Line</label>
                <input
                  className="inp"
                  placeholder="You've been invited to join {orgName}"
                  value={form.inviteSubject || ""}
                  onChange={(e) => setForm({ ...form, inviteSubject: e.target.value })}
                />
                <div className="hint">Supports dynamic tags: <code>{`{orgName}`}</code>, <code>{`{recipientName}`}</code>, <code>{`{role}`}</code></div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Email Body Message Content</label>
                <textarea
                  rows={4}
                  className="inp"
                  style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
                  placeholder="You have been invited to join {orgName} on the iPixxel Realty platform as a {role}."
                  value={form.inviteBody || ""}
                  onChange={(e) => setForm({ ...form, inviteBody: e.target.value })}
                />
                <div className="hint">
                  Available placeholders: <code>{`{recipientName}`}</code>, <code>{`{orgName}`}</code>, <code>{`{role}`}</code>, <code>{`{loginUrl}`}</code>.
                  (Credentials box &amp; login button are automatically included below the message).
                </div>
              </div>
            </div>
          </div>

          <div className="card reveal in" style={{ marginBottom: 22 }}>
            <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="t">Password Reset Email</span>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Sent when a user requests a password reset link from the login page
                </div>
              </div>
              <span className="badge b-violet">template: password_reset</span>
            </div>
            <div className="card-b">
              <div className="field">
                <label>Email Subject Line</label>
                <input
                  className="inp"
                  placeholder="Reset your iPixxel Realty password"
                  value={form.resetSubject || ""}
                  onChange={(e) => setForm({ ...form, resetSubject: e.target.value })}
                />
                <div className="hint">Supports dynamic tags: <code>{`{recipientName}`}</code></div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Email Body Message Content</label>
                <textarea
                  rows={4}
                  className="inp"
                  style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
                  placeholder="We received a request to reset the password for your account. Click the button below to choose a new password."
                  value={form.resetBody || ""}
                  onChange={(e) => setForm({ ...form, resetBody: e.target.value })}
                />
                <div className="hint">
                  Available placeholders: <code>{`{recipientName}`}</code>, <code>{`{resetUrl}`}</code>.
                  (The secure 60-minute password reset button is automatically included below the message).
                </div>
              </div>
            </div>
          </div>

          <div className="card reveal in" style={{ marginBottom: 22 }}>
            <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="t">User Account Status Emails</span>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Sent when an organisation user is activated or deactivated
                </div>
              </div>
              <span className="badge b-teal">templates: account status</span>
            </div>
            <div className="card-b">
              <div className="field">
                <label>Account Activated Subject</label>
                <input className="inp" value={form.accountActivatedSubject || ""} onChange={(e) => setForm({ ...form, accountActivatedSubject: e.target.value })} />
              </div>
              <div className="field">
                <label>Account Activated Body</label>
                <textarea rows={4} className="inp" style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} value={form.accountActivatedBody || ""} onChange={(e) => setForm({ ...form, accountActivatedBody: e.target.value })} />
                <div className="hint">Available placeholders: <code>{`{recipientName}`}</code>, <code>{`{loginUrl}`}</code>. The sign-in button is included automatically.</div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Account Deactivated Subject</label>
                <input className="inp" value={form.accountDeactivatedSubject || ""} onChange={(e) => setForm({ ...form, accountDeactivatedSubject: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Account Deactivated Body</label>
                <textarea rows={5} className="inp" style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} value={form.accountDeactivatedBody || ""} onChange={(e) => setForm({ ...form, accountDeactivatedBody: e.target.value })} />
                <div className="hint">Available placeholder: <code>{`{recipientName}`}</code>. No sign-in button is included.</div>
              </div>
            </div>
          </div>

          <div className={formPageStyles.actions}>
            <button
              type="submit"
              className={formPageStyles.btnPrimary}
              disabled={saving || loading}
            >
              <Icon name="check" size={16} />
              {saving ? "Saving templates..." : "Save Template Changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="card reveal in">
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span className="t">Recent Email Logs</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select
                value={logsFilter}
                onChange={(e) => setLogsFilter(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13 }}
              >
                <option value="all">All statuses</option>
                <option value="sent">Sent only</option>
                <option value="failed">Failed only</option>
              </select>
              <input
                className="inp"
                placeholder="Search recipient or subject..."
                value={logsSearch}
                onChange={(e) => setLogsSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadLogs(1, logsFilter, logsSearch);
                }}
                style={{ width: 220, padding: "6px 10px", fontSize: 13 }}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => loadLogs(1, logsFilter, logsSearch)}
              >
                <Icon name="refresh" size={13} /> Refresh
              </button>
            </div>
          </div>
          <div className="card-b" style={{ padding: 0 }}>
            {logsLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--fg-muted)" }}>
                Loading email audit records...
              </div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--fg-muted)" }}>
                No email records found. Send a test email or trigger an invite to populate logs.
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Recipient</th>
                      <th>Subject</th>
                      <th>Template</th>
                      <th>Timestamp</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <span className={`badge ${log.status === "sent" ? "b-green" : "b-red"}`}>
                            <span className="dot" style={{ background: "currentColor" }} />
                            {log.status === "sent" ? "Sent" : "Failed"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{log.to}</td>
                        <td>{log.subject}</td>
                        <td>
                          <span style={{ textTransform: "capitalize", fontSize: 12, padding: "2px 8px", background: "var(--bg-subtle, #f1f5f9)", borderRadius: 4 }}>
                            {log.template || "system"}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                          {new Date(log.sentAt).toLocaleString()}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {log.error ? (
                            <span style={{ color: "#ef4444", maxWidth: 240, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.error}>
                              {log.error}
                            </span>
                          ) : (
                            <span style={{ color: "#10b981" }}>Delivered</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--line)" }}>
                <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                  Page {logsPage} of {totalPages}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={logsPage <= 1}
                    onClick={() => loadLogs(logsPage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={logsPage >= totalPages}
                    onClick={() => loadLogs(logsPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={testModalOpen}
        onClose={() => {
          if (!testing) setTestModalOpen(false);
        }}
        title="Send SMTP test email"
        description="Deliver a test email to verify that your SMTP host credentials, port, and security settings are fully functional."
        closeDisabled={testing}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setTestModalOpen(false)}
              disabled={testing}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={testing || !testRecipient}
              onClick={() => void handleSendTestEmail()}
            >
              {testing ? "Dispatching..." : "Send Test Now"}
            </button>
          </>
        }
      >
                <div className="field">
                  <label>Recipient Email Address</label>
                  <input
                    className="inp inp-mono"
                    type="email"
                    placeholder="your-email@domain.com"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    required
                  />
                </div>

                {testResult && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      fontSize: 13,
                      background: testResult.success ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                      color: testResult.success ? "#065f46" : "#991b1b",
                      border: `1px solid ${testResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                    }}
                  >
                    {testResult.msg}
                  </div>
                )}
      </Modal>
    </>
  );
}
