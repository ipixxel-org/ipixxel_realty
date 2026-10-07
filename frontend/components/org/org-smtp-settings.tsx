"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { formPageStyles } from "@/components/forms/form-page";
import {
  getOrgEmailLogs,
  getOrgEmailStats,
  getOrgSmtpConfig,
  sendOrgSmtpTestEmail,
  updateOrgSmtpConfig,
} from "@/lib/api";
import type {
  EmailLogEntry,
  EmailStatsResponse,
  UpdateSmtpConfigInput,
} from "@/lib/types";

export function OrgSmtpSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [platformConfigured, setPlatformConfigured] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [stats, setStats] = useState<EmailStatsResponse>({
    totalSent: 0,
    totalFailed: 0,
    totalDispatched: 0,
    lastDispatchedAt: null,
  });
  const [form, setForm] = useState<UpdateSmtpConfigInput>({
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    fromEmail: "",
    fromName: "",
    replyTo: "",
    isActive: true,
  });

  const patch = (p: Partial<UpdateSmtpConfigInput>) => setForm((f) => ({ ...f, ...p }));

  async function load() {
    setLoading(true);
    try {
      const [config, statsRes, logsRes] = await Promise.all([
        getOrgSmtpConfig(),
        getOrgEmailStats(),
        getOrgEmailLogs({ page: 1, limit: 8 }),
      ]);
      setForm({
        host: config.host || "",
        port: config.port || 587,
        secure: Boolean(config.secure),
        user: config.user || "",
        password: config.hasPassword ? "••••••••" : "",
        fromEmail: config.fromEmail || "",
        fromName: config.fromName || "",
        replyTo: config.replyTo || "",
        isActive: config.isActive ?? true,
      });
      setHasPassword(Boolean(config.hasPassword));
      setUsingFallback(Boolean(config.usingPlatformFallback));
      setPlatformConfigured(Boolean(config.platformConfigured));
      setStats(statsRes);
      setLogs(logsRes.data);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : "Could not load SMTP settings.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await updateOrgSmtpConfig(form);
      setHasPassword(Boolean(updated.hasPassword));
      setUsingFallback(false);
      setFeedback({ type: "success", msg: "Organisation SMTP saved. Invites and notifications will send from this server." });
      const statsRes = await getOrgEmailStats();
      setStats(statsRes);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : "Failed to save SMTP settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testTo.trim()) return;
    setTesting(true);
    setFeedback(null);
    try {
      const res = await sendOrgSmtpTestEmail({ to: testTo.trim() });
      setFeedback({ type: "success", msg: res.message });
      const [statsRes, logsRes] = await Promise.all([
        getOrgEmailStats(),
        getOrgEmailLogs({ page: 1, limit: 8 }),
      ]);
      setStats(statsRes);
      setLogs(logsRes.data);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : "Test email failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading SMTP settings…</p>;
  }

  return (
    <>
      {usingFallback && platformConfigured ? (
        <div className="swrow" style={{ marginBottom: 16, alignItems: "flex-start" }}>
          <div className="tx">
            <b>Using platform mail</b>
            <div className="muted">
              This organisation has no SMTP yet. Invites and password emails use the Super Admin mailer until you save your own host below.
            </div>
          </div>
        </div>
      ) : null}
      {usingFallback && !platformConfigured ? (
        <div className="swrow" style={{ marginBottom: 16, alignItems: "flex-start" }}>
          <div className="tx">
            <b>No mail server configured</b>
            <div className="muted">Add your SMTP host so this organisation can send invites and notifications.</div>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`badge ${feedback.type === "success" ? "b-green" : "b-rose"}`}
          style={{ display: "inline-flex", marginBottom: 12, padding: "8px 10px" }}
        >
          {feedback.msg}
        </div>
      ) : null}

      <div className={formPageStyles.page}>
      <form onSubmit={handleSave}>
        <div className="row2">
          <div className="field">
            <label>SMTP host</label>
            <input className="inp inp-mono" value={form.host} onChange={(e) => patch({ host: e.target.value })} placeholder="smtp.gmail.com" required />
          </div>
          <div className="field">
            <label>Port</label>
            <input
              className="inp"
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => patch({ port: Number(e.target.value) || 587 })}
            />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>Username</label>
            <input className="inp" value={form.user ?? ""} onChange={(e) => patch({ user: e.target.value })} placeholder="mailbox@yourdomain.com" />
          </div>
          <div className="field">
            <label>Password {hasPassword ? <span className="muted">(saved)</span> : null}</label>
            <input
              className="inp"
              type="password"
              value={form.password ?? ""}
              onChange={(e) => patch({ password: e.target.value })}
              placeholder={hasPassword ? "••••••••" : "App password or SMTP key"}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>From name</label>
            <input className="inp" value={form.fromName} onChange={(e) => patch({ fromName: e.target.value })} required />
          </div>
          <div className="field">
            <label>From address</label>
            <input className="inp inp-mono" type="email" value={form.fromEmail} onChange={(e) => patch({ fromEmail: e.target.value })} required />
          </div>
        </div>
        <div className="field">
          <label>Reply-to (optional)</label>
          <input className="inp inp-mono" type="email" value={form.replyTo ?? ""} onChange={(e) => patch({ replyTo: e.target.value })} />
        </div>
        <div className="swrow">
          <div className="tx">
            <b>Use SSL / TLS (secure)</b>
            <div className="muted">Turn on for port 465. Port 587 usually stays off (STARTTLS).</div>
          </div>
          <div
            className={`switch${form.secure ? " on" : ""}`}
            role="switch"
            aria-checked={form.secure}
            onClick={() => patch({ secure: !form.secure })}
          />
        </div>
        <div className="swrow" style={{ borderBottom: 0 }}>
          <div className="tx">
            <b>Enable this SMTP</b>
            <div className="muted">When off, organisation mail falls back to the platform mailer if one exists.</div>
          </div>
          <div
            className={`switch${form.isActive !== false ? " on" : ""}`}
            role="switch"
            aria-checked={form.isActive !== false}
            onClick={() => patch({ isActive: form.isActive === false })}
          />
        </div>
        <div className={formPageStyles.actions}>
          <button type="submit" className={formPageStyles.btnPrimary} disabled={saving}>
            <Icon name="check" size={16} />
            {saving ? "Saving…" : "Save SMTP"}
          </button>
        </div>
      </form>

      <form onSubmit={handleTest} style={{ marginTop: 22 }}>
        <div className="field">
          <label>Send a test email</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="inp"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@company.com"
              required
            />
            <button type="submit" className={formPageStyles.btn} disabled={testing || !form.host}>
              <Icon name="mail" size={16} />
              {testing ? "Sending…" : "Send test"}
            </button>
          </div>
        </div>
      </form>
      </div>

      <div className="row2" style={{ marginTop: 8 }}>
        <div className="field">
          <label>Sent</label>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{stats.totalSent}</div>
        </div>
        <div className="field">
          <label>Failed</label>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{stats.totalFailed}</div>
        </div>
      </div>

      <div className="tbl-wrap" style={{ marginTop: 8 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>To</th>
              <th>Subject</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">No organisation emails yet.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="mono">{log.to}</td>
                  <td>{log.subject}</td>
                  <td>
                    <span className={`badge ${log.status === "sent" ? "b-green" : "b-rose"}`}>{log.status}</span>
                    {log.error ? <div className="muted">{log.error}</div> : null}
                  </td>
                  <td className="muted">{new Date(log.sentAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
