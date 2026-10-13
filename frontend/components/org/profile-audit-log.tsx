"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icons";
import { industryShortLabel } from "@/lib/org-profile";

// Audit trail of organisation profile ("General" details) changes. The backend
// writes one entry per save that actually changes something — from the Org
// Admin (Settings → General) or a Super Admin (Organisations → Edit) — listing
// each changed field. Read-only.

interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

interface ProfileHistoryEntry {
  id: string;
  changes: FieldChange[];
  changedBy: "org_admin" | "super_admin" | null;
  changedAt: string;
  actor: { name: string | null; email: string } | null;
}

const PAGE_SIZE = 10;

const CHANGED_BY_LABEL: Record<string, string> = {
  org_admin: "Organisation admin",
  super_admin: "Super admin",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Organisation name",
  legalName: "Legal name",
  industry: "Industry",
  supportEmail: "Support email",
  supportPhone: "Support phone",
  country: "Country",
  city: "City",
  state: "State",
  postalCode: "Postal code",
  addressLine1: "Registered address",
  addressLine2: "Address line 2",
  timezone: "Timezone",
  currency: "Currency",
  defaultLanguage: "Default language",
  website: "Website",
  logoUrl: "Logo",
  faviconUrl: "Favicon",
  brandColour: "Brand colour",
  reraLicenseNo: "RERA licence no.",
  gstin: "GSTIN",
};

// Images are stored as long URLs — show what happened, not the URL.
const IMAGE_FIELDS = new Set(["logoUrl", "faviconUrl"]);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayValue(field: string, value: string | null): string {
  if (!value) return "Not set";
  if (field === "industry") return industryShortLabel(value) ?? value;
  return value;
}

function ChangeLine({ c }: { c: FieldChange }) {
  const label = FIELD_LABEL[c.field] ?? c.field;
  if (IMAGE_FIELDS.has(c.field)) {
    const what = !c.from ? "added" : !c.to ? "removed" : "updated";
    return (
      <div>
        <b>{label}</b> <span className="muted">{what}</span>
      </div>
    );
  }
  return (
    <div style={{ wordBreak: "break-word" }}>
      <b>{label}:</b> <span className="muted">{displayValue(c.field, c.from)}</span>
      {" → "}
      <span style={{ fontWeight: 600 }}>{displayValue(c.field, c.to)}</span>
    </div>
  );
}

export function ProfileAuditLog({
  endpoint,
  reloadKey,
}: {
  /** e.g. "/org/settings/profile-history" or "/admin/organisations/:id/profile-history" */
  endpoint: string;
  /** Change to refetch (e.g. after a successful save). */
  reloadKey?: unknown;
}) {
  const [entries, setEntries] = useState<ProfileHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ProfileHistoryEntry[]>(endpoint)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows ?? []);
        setError(null);
        setPage(1);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audit logs.");
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, reloadKey]);

  const total = entries?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = useMemo(
    () => (entries ?? []).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [entries, currentPage],
  );

  const pagerBtn = (disabled: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: disabled ? "#f1f5f9" : "#fff",
    color: disabled ? "#94a3b8" : "#334155",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontWeight: 700, fontSize: 15 }}>
        <Icon name="clock" size={16} /> Audit logs
      </div>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>
        Every change to these organisation details, by the organisation admin or a super admin.
      </p>

      {error ? (
        <div className="muted" style={{ fontSize: 13 }}>{error}</div>
      ) : entries === null ? (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No changes recorded yet.</div>
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Changes</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 13, verticalAlign: "top" }}>{formatDateTime(e.changedAt)}</td>
                    <td style={{ fontSize: 13, verticalAlign: "top" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        {e.changes.length > 0 ? (
                          e.changes.map((c, i) => <ChangeLine key={`${c.field}-${i}`} c={c} />)
                        ) : (
                          <span className="muted">Details updated</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, verticalAlign: "top" }}>
                      <div>{e.actor?.name || e.actor?.email || "—"}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {[e.changedBy ? CHANGED_BY_LABEL[e.changedBy] : null, e.actor?.name ? e.actor.email : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — only when there is more than one page */}
          {totalPages > 1 ? (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 600 }}>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total} changes
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  style={pagerBtn(currentPage <= 1)}
                >
                  <Icon name="chevron-left" size={14} /> Previous
                </button>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", padding: "0 8px" }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  style={pagerBtn(currentPage >= totalPages)}
                >
                  Next <Icon name="chevron-right" size={14} />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
