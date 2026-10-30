"use client";

import { useState } from "react";
import { formatDate, formatINR } from "@/lib/billing/pricing";
import type { PlanVersionDetail, PlanVersionHistory, PlanVersionOrg } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { BillingDialog } from "../dialog";
import { BLink, ErrorNote, Loading } from "../ui";

/**
 * Super Admin: a plan's version history. One column per version (newest
 * first): prices, every limit and feature switch, who made it and when, and
 * the organisations on it. A value that changed from the version before is
 * highlighted, with the old value as a tooltip. `onlyVersionId` shows just
 * that version (the org page's "View").
 */

type Row = { key: string; label: string; value: (v: PlanVersionDetail) => string };

const limitText = (n: number | null | undefined) => (n == null ? "Unlimited" : n.toLocaleString("en-IN"));
const orgsText = (n: number) => `${n} ${n === 1 ? "org" : "orgs"}`;

export function historyRows(h: Pick<PlanVersionHistory, "limitRows" | "featureRows">): Row[] {
  return [
    { key: "priceMonthly", label: "Monthly price", value: (v) => `${formatINR(v.priceMonthly)} + GST` },
    { key: "priceYearly", label: "Yearly price", value: (v) => `${formatINR(v.priceYearly)} + GST` },
    ...h.limitRows.map((r) => ({ key: r.key, label: r.label, value: (v: PlanVersionDetail) => limitText(v.limits[r.key]) })),
    ...h.featureRows.map((r) => ({ key: r.key, label: r.label, value: (v: PlanVersionDetail) => (v.features[r.key] ? "On" : "Off") })),
  ];
}

/** The organisations on one version, 20 at a time, each linked to its billing page. */
function VersionOrgs({ planId, version, latest }: { planId: string; version: PlanVersionDetail; latest: number }) {
  const { client } = useBillingEnv();
  const [extra, setExtra] = useState<PlanVersionOrg[]>([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const { data, error } = useBillingQuery((c) => c.listPlanVersionOrgs({ planId, versionId: version.id, page: 1, pageSize: 20 }), [planId, version.id]);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="organisations" />;
  const rows = [...data.data, ...extra];
  async function more() {
    setBusy(true);
    try {
      const next = await client.listPlanVersionOrgs({ planId, versionId: version.id, page: page + 1, pageSize: 20 });
      setExtra((x) => [...x, ...next.data]);
      setPage(page + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-testid={`version-orgs-v${version.version}`} style={{ marginTop: 12 }}>
      <b style={{ fontSize: 13 }}>Organisations on v{version.version}</b>
      {rows.length === 0 ? (
        <div className="bl-muted" style={{ marginTop: 4 }}>
          No organisations are on it.
        </div>
      ) : (
        <table className="tbl" style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Billing</th>
              <th>Moves to v{latest}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.orgId}>
                <td>
                  <BLink to="adminSubscription" params={{ orgId: o.orgId }}>
                    {o.orgName}
                  </BLink>
                </td>
                <td>{o.interval === "yearly" ? "Yearly" : "Monthly"}</td>
                <td>{version.latest ? "On the latest" : o.movesOn ? formatDate(o.movesOn) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length < data.total ? (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} disabled={busy} onClick={() => void more()}>
          {busy ? "Loading…" : `Show more (${data.total - rows.length})`}
        </button>
      ) : null}
    </div>
  );
}

function HistoryTable({ planId, onlyVersionId }: { planId: string; onlyVersionId?: string | null }) {
  const { data, error } = useBillingQuery((c) => c.getPlanVersions(planId), [planId]);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="versions" />;
  const all = data.versions;
  const shown = onlyVersionId ? all.filter((v) => v.id === onlyVersionId) : all;
  if (!shown.length) return <ErrorNote message="That version doesn't exist any more." />;
  const latest = all[0]?.version ?? 1;
  // Newest first: the version before is the next one in the list.
  const previous = (v: PlanVersionDetail) => all[all.indexOf(v) + 1];
  const rows = historyRows(data);
  const expanded = shown.find((v) => v.id === open);
  return (
    <div>
      <div className="tbl-wrap" style={{ overflowX: "auto" }}>
        <table className="tbl" data-testid="version-history">
          <thead>
            <tr>
              <th />
              {shown.map((v) => (
                <th key={v.id} data-testid={`version-head-v${v.version}`} style={{ verticalAlign: "top" }}>
                  <div className="bl-row" style={{ gap: 6 }}>
                    <b>v{v.version}</b>
                    {v.latest ? <span className="badge b-green">Latest</span> : null}
                  </div>
                  <div className="bl-muted bl-small" style={{ fontWeight: 500 }}>
                    {formatDate(v.createdAt)}
                  </div>
                  <div className="bl-muted bl-small" style={{ fontWeight: 500 }}>
                    {v.createdBy ? `by ${v.createdBy}` : "—"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="bl-muted">{r.label}</td>
                {shown.map((v) => {
                  const prev = previous(v);
                  const now = r.value(v);
                  const was = prev ? r.value(prev) : null;
                  const changed = was !== null && was !== now;
                  return (
                    <td
                      key={v.id}
                      data-testid={`cell-${r.key}-v${v.version}`}
                      data-changed={changed ? "true" : undefined}
                      title={changed ? `Was ${was} in v${prev!.version}` : undefined}
                      style={changed ? { background: "#fffbeb", color: "#92400e", fontWeight: 600 } : undefined}
                    >
                      {now}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="bl-muted">Organisations</td>
              {shown.map((v) => (
                <td key={v.id}>
                  {v.orgs > 0 ? (
                    <button
                      type="button"
                      data-testid={`version-orgs-link-v${v.version}`}
                      aria-expanded={open === v.id}
                      onClick={() => setOpen(open === v.id ? null : v.id)}
                      style={{ background: "none", border: 0, padding: 0, color: "var(--brand)", cursor: "pointer", fontWeight: 600 }}
                    >
                      {orgsText(v.orgs)}
                    </button>
                  ) : (
                    <span className="bl-muted">{orgsText(0)}</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {expanded ? <VersionOrgs planId={planId} version={expanded} latest={latest} /> : null}
    </div>
  );
}

export function PlanVersionHistoryDialog({
  open,
  onClose,
  planId,
  planName,
  onlyVersionId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
  /** Show just this version (the org page's "View"). */
  onlyVersionId?: string | null;
  title?: string;
}) {
  return (
    <BillingDialog open={open} onClose={onClose} size="lg" title={title ?? `${planName} — version history`}>
      {open ? <HistoryTable planId={planId} onlyVersionId={onlyVersionId} /> : null}
    </BillingDialog>
  );
}
