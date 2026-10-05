"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Icon, type IconName } from "@/components/icons";
import { PlatformBrandIcon } from "@/components/org/platform-brand-icon";
import {
  createAdminAttributionLabel,
  deleteAdminAttributionLabel,
  getAdminAttributionLabels,
  getAdminMetaConfig,
  updateAdminAttributionLabel,
} from "@/lib/api";
import type { AttributionLabel, MetaPublicConfig } from "@/lib/types";

const LABEL_ICONS: Record<string, IconName> = {
  platform: "link",
  source: "globe",
  medium: "modules",
  campaign: "flag",
  campaign_id: "document",
  ad_set: "modules",
  ad: "sparkles",
  ad_id: "key",
  keyword: "key",
  content: "document",
  utm_source: "globe",
  utm_medium: "modules",
  utm_campaign: "flag",
  utm_term: "key",
  utm_content: "document",
  landing_page: "landing",
  landing_page_url: "link",
  referrer: "external",
  fbclid: "link",
  gclid: "link",
  first_touch_source: "target",
  last_touch_source: "target",
};

function iconFor(key: string): IconName {
  if (LABEL_ICONS[key]) return LABEL_ICONS[key];
  if (key.includes("campaign")) return "flag";
  if (key.includes("source") || key.includes("utm")) return "globe";
  if (key.includes("id")) return "key";
  return "tag";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SuperAdminAttributionPage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const [labels, setLabels] = useState<AttributionLabel[]>([]);
  const [meta, setMeta] = useState<MetaPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ key: "", label: "" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [labelRows, metaCfg] = await Promise.all([
        getAdminAttributionLabels(),
        getAdminMetaConfig(),
      ]);
      setLabels(labelRows);
      setMeta(metaCfg);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken || user?.role !== "super_admin") {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, accessToken, user, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter(
      (l) =>
        l.label.toLowerCase().includes(q) || l.key.toLowerCase().includes(q),
    );
  }, [labels, query]);

  async function toggle(label: AttributionLabel) {
    setSavingId(label.id);
    setFeedback(null);
    try {
      const updated = await updateAdminAttributionLabel(label.id, {
        enabled: !label.enabled,
      });
      setLabels((prev) =>
        prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function saveRename(label: AttributionLabel) {
    const trimmed = editLabel.trim();
    if (!trimmed || trimmed === label.label) {
      setEditingId(null);
      return;
    }
    setSavingId(label.id);
    try {
      const updated = await updateAdminAttributionLabel(label.id, {
        label: trimmed,
      });
      setLabels((prev) =>
        prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
      );
      setEditingId(null);
      setOkMsg("Label updated");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(label: AttributionLabel) {
    if (!window.confirm(`Delete label “${label.label}”?`)) return;
    setSavingId(label.id);
    try {
      await deleteAdminAttributionLabel(label.id);
      setLabels((prev) => prev.filter((row) => row.id !== label.id));
      setOkMsg("Label deleted");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  async function addLabel() {
    setAdding(true);
    setFeedback(null);
    try {
      const created = await createAdminAttributionLabel({
        key: draft.key.trim().toLowerCase(),
        label: draft.label.trim(),
        enabled: true,
      });
      setLabels((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
      setDraft({ key: "", label: "" });
      setShowAdd(false);
      setOkMsg("Label added");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Create failed");
    } finally {
      setAdding(false);
    }
  }

  async function onCopy(value: string, name: string) {
    const ok = await copyText(value);
    setOkMsg(ok ? `${name} copied` : "Could not copy");
  }

  return (
    <>
      <div className="page-head attr-hero reveal in">
        <div>
          <div className="eyebrow">
            <Icon name="target" size={14} /> Marketing
          </div>
          <h1>Lead Attribution</h1>
          <div className="sub">
            Enable Organisation Labels for Lead Center, and review Facebook Lead
            Ads platform configuration.
          </div>
        </div>
        <div className="attr-hero-art" aria-hidden>
          <div className="attr-hero-hub">
            <Icon name="server" size={22} />
          </div>
          <div className="attr-hero-orbit">
            {["meta", "instagram", "google_ads", "linkedin", "tiktok", "website"].map(
              (k) => (
                <span key={k} className="attr-hero-plat">
                  <PlatformBrandIcon platformKey={k} size={28} />
                </span>
              ),
            )}
          </div>
          <div className="attr-hero-card">
            <b>Track Leads From All Platforms</b>
            <span className="attr-hero-bars" />
          </div>
        </div>
      </div>

      {feedback ? (
        <div className="card attr-alert" style={{ color: "#b91c1c" }}>
          <div className="card-b">{feedback}</div>
        </div>
      ) : null}
      {okMsg ? (
        <div className="card attr-alert" style={{ color: "#15803d" }}>
          <div className="card-b">{okMsg}</div>
        </div>
      ) : null}

      <div className="card attr-meta-card reveal in">
        <div className="attr-meta-head">
          <div className="attr-meta-title">
            <PlatformBrandIcon platformKey="meta" size={36} />
            <div>
              <div className="attr-meta-name">Facebook Lead Ads (platform)</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Platform Meta App used by every organisation’s Connected Apps.
              </div>
            </div>
          </div>
          {meta?.configured ? (
            <span className="badge b-green attr-live-badge">
              <i /> Active
            </span>
          ) : (
            <span className="badge b-amber">Setup required</span>
          )}
        </div>

        <p className="muted attr-meta-help">
          Configure Meta App ID, App Secret, and Webhook Verify Token in Marketing
          Settings. Orgs can then connect their Facebook Pages from Marketing → Connected Apps.
        </p>

        <div className="attr-meta-fields">
          <div className="field">
            <label>App ID</label>
            <div className="attr-copy-field">
              <input
                className="inp inp-mono"
                readOnly
                value={meta?.appId || "—"}
              />
              {meta?.appId ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm attr-copy-btn"
                  onClick={() => void onCopy(meta.appId!, "App ID")}
                  title="Copy"
                >
                  <Icon name="document" size={14} />
                </button>
              ) : null}
            </div>
          </div>
          <div className="field">
            <label>Webhook callback</label>
            <div className="attr-copy-field">
              <input
                className="inp inp-mono"
                readOnly
                value={meta?.webhookCallbackUrl || ""}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm attr-copy-btn"
                onClick={() =>
                  void onCopy(meta?.webhookCallbackUrl || "", "Webhook URL")
                }
                title="Copy"
              >
                <Icon name="document" size={14} />
              </button>
            </div>
          </div>
          <div className="field">
            <label>OAuth redirect</label>
            <div className="attr-copy-field">
              <input
                className="inp inp-mono"
                readOnly
                value={meta?.oauthRedirectUri || ""}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm attr-copy-btn"
                onClick={() =>
                  void onCopy(meta?.oauthRedirectUri || "", "OAuth redirect")
                }
                title="Copy"
              >
                <Icon name="document" size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="attr-meta-foot">
          <span className="attr-env-note">
            {meta?.configured
              ? "Configured via Marketing Settings in database"
              : "Setup required — configure Meta credentials in Marketing Settings"}
          </span>
          <a className="btn btn-primary btn-sm" href="/admin-console/marketing?tab=settings">
            <Icon name="settings" size={14} /> Open Marketing Settings
          </a>
        </div>
      </div>

      <div className="card reveal in">
        <div className="card-h attr-labels-head">
          <span className="t" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="shield" size={16} /> Organisation Labels
          </span>
          <div className="attr-labels-tools">
            <div className="attr-search">
              <Icon name="search" size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search labels..."
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setShowAdd(true);
                setOkMsg(null);
                setFeedback(null);
              }}
            >
              <Icon name="plus" size={14} /> Add Label
            </button>
          </div>
        </div>

        {showAdd ? (
          <div className="attr-add-row">
            <div className="field">
              <label>Key</label>
              <input
                className="inp inp-mono"
                placeholder="e.g. ad_id"
                value={draft.key}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                  }))
                }
              />
            </div>
            <div className="field">
              <label>Label</label>
              <input
                className="inp"
                placeholder="Display name"
                value={draft.label}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, label: e.target.value }))
                }
              />
            </div>
            <div className="attr-add-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={adding || !draft.key.trim() || !draft.label.trim()}
                onClick={() => void addLabel()}
              >
                {adding ? "Saving…" : "Save Label"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="card-b" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table className="tbl attr-labels-tbl">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Label</th>
                  <th>Key</th>
                  <th>Status</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((label, idx) => (
                  <tr key={label.id}>
                    <td className="muted">{idx + 1}</td>
                    <td>
                      <div className="attr-label-cell">
                        <span className="attr-label-ico">
                          <Icon name={iconFor(label.key)} size={14} />
                        </span>
                        {editingId === label.id ? (
                          <input
                            className="inp"
                            value={editLabel}
                            autoFocus
                            disabled={savingId === label.id}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onBlur={() => void saveRename(label)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveRename(label);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            style={{ maxWidth: 200 }}
                          />
                        ) : (
                          <b>{label.label}</b>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="attr-key-pill">{label.key}</span>
                    </td>
                    <td>
                      {label.enabled !== false ? (
                        <span className="badge b-green">Enabled</span>
                      ) : (
                        <span className="badge b-gray">Disabled</span>
                      )}
                    </td>
                    <td>
                      <div className="attr-row-actions">
                        <button
                          type="button"
                          className={`switch${label.enabled !== false ? " on" : ""}`}
                          disabled={savingId === label.id}
                          aria-label={
                            label.enabled !== false ? "Disable" : "Enable"
                          }
                          onClick={() => void toggle(label)}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm attr-icon-btn"
                          title="Edit"
                          disabled={savingId === label.id}
                          onClick={() => {
                            setEditingId(label.id);
                            setEditLabel(label.label);
                          }}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm attr-icon-btn is-danger"
                          title="Delete"
                          disabled={savingId === label.id}
                          onClick={() => void remove(label)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {loading ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Loading…
                    </td>
                  </tr>
                ) : null}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No attribution labels found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
