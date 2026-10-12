"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icons";
import { industryShortLabel } from "@/lib/org-profile";
import type { OrgIndustry } from "@/lib/types";

// Audit trail of Organisation.industry ("role" chosen at signup) changes,
// written by the backend whenever the Org Admin (Settings → General) or a
// Super Admin (Organisations → Edit) changes it. Read-only.

interface IndustryHistoryEntry {
  id: string;
  from: OrgIndustry | null;
  to: OrgIndustry | null;
  changedBy: "org_admin" | "super_admin" | null;
  changedAt: string;
  actor: { name: string | null; email: string } | null;
}

const CHANGED_BY_LABEL: Record<string, string> = {
  org_admin: "Organisation admin",
  super_admin: "Super admin",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IndustryHistory({
  endpoint,
  reloadKey,
  currentIndustry,
}: {
  /** e.g. "/org/settings/industry-history" or "/admin/organisations/:id/industry-history" */
  endpoint: string;
  /** Change to refetch (e.g. after a successful save). */
  reloadKey?: unknown;
  /** Shown when there are no changes yet — the value picked at signup. */
  currentIndustry?: OrgIndustry | null;
}) {
  const [entries, setEntries] = useState<IndustryHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<IndustryHistoryEntry[]>(endpoint)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load history.");
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, reloadKey]);

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontWeight: 700, fontSize: 15 }}>
        <Icon name="clock" size={16} /> Industry change history
      </div>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>
        Every change to the organisation&apos;s industry, by the organisation admin or a super admin.
      </p>

      {error ? (
        <div className="muted" style={{ fontSize: 13 }}>{error}</div>
      ) : entries === null ? (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          No changes yet.
          {currentIndustry ? (
            <> Selected during onboarding: <b>{industryShortLabel(currentIndustry)}</b>.</>
          ) : null}
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Change</th>
                <th>Changed by</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{formatDateTime(e.changedAt)}</td>
                  <td style={{ fontSize: 13 }}>
                    <span className="muted">{industryShortLabel(e.from) ?? "Not set"}</span>
                    {" → "}
                    <b>{industryShortLabel(e.to) ?? "Not set"}</b>
                  </td>
                  <td style={{ fontSize: 13 }}>
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
      )}
    </div>
  );
}
