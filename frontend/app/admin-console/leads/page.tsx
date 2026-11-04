"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Reveal } from "@/components/superadmin/reveal";
import { CountUp } from "@/components/superadmin/count-up";
import { Icon } from "@/components/icons";
import { LeadStatusPill } from "@/components/superadmin/lead-status-pill";
import { ConvertLeadModal } from "@/components/superadmin/convert-lead-modal";
import { LIST_PAGE_SIZE, ListPager } from "@/components/ui/list-pager";
import { getAdminLeads, getAdminLeadsMeta } from "@/lib/api";
import {
  leadDisplayEmail,
  leadDisplayName,
  leadDisplayPhone,
  leadDisplaySource,
} from "@/lib/lead-display";
import {
  ADMIN_LEAD_STATUS_META,
  ADMIN_LEAD_STATUS_ORDER,
  adminLeadStatusTint,
  formatAdminLeadDate,
} from "@/lib/admin-leads";
import type {
  AdminLead,
  AdminLeadStatus,
  AdminLeadsMeta,
} from "@/lib/types";

const EMPTY_STATUS_COUNTS = Object.fromEntries(
  ADMIN_LEAD_STATUS_ORDER.map((status) => [status, 0]),
) as Record<AdminLeadStatus, number>;

function sourceBadgeClass(source: string | null): string {
  switch ((source || "").toLowerCase()) {
    case "meta":
    case "facebook":
      return "b-indigo";
    case "google":
    case "google_ads":
      return "b-sky";
    case "whatsapp":
      return "b-green";
    default:
      return "b-amber";
  }
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<AdminLead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [andStats, setStats] = useState({
    total: 0,
    unassigned: 0,
    followUpsDue: 0,
    today: 0,
    conversionRate: 0,
    byStatus: EMPTY_STATUS_COUNTS,
  });
  const [meta, setMeta] = useState<AdminLeadsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AdminLeadStatus>("");
  const [formFilter, setFormFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [convertModalLead, setConvertModalLead] = useState<AdminLead | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    getAdminLeadsMeta()
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch(() => {
        if (!cancelled) {
          setMeta({ organisations: [], projects: [], sources: [], statuses: [...ADMIN_LEAD_STATUS_ORDER] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminLeads({
        page,
        limit: LIST_PAGE_SIZE,
        search: search || undefined,
        status: statusFilter || undefined,
        formName: formFilter || undefined,
        source: sourceFilter || undefined,
        sortBy: sortBy as "createdAt" | "status" | "source" | "formName",
        sortDir,
      });
      setLeads(res.data);
      setTotal(res.total);
      setStats(res.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    search,
    statusFilter,
    formFilter,
    sourceFilter,
    sortBy,
    sortDir,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() owns its async loading state
    void load();
  }, [load]);

  const statTiles = useMemo(
    () => [
      { label: "Total leads", value: andStats.total, ic: "ic-indigo", icon: "users" },
      { label: "New", value: andStats.byStatus.new, ic: "ic-sky", icon: "sparkles" },
      { label: "Follow-ups due", value: andStats.followUpsDue, ic: "ic-amber", icon: "clock" },
      { label: "Conversion rate", value: andStats.conversionRate, suffix: "%", ic: "ic-green", icon: "trending" },
    ],
    [andStats],
  );

  const activeStatusCount = statusFilter ? andStats.byStatus[statusFilter] : andStats.total;

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Icon name="target" size={13} /> Lead Management
          </div>
          <h1>Super Admin Leads</h1>
          <div className="sub">
            Leads captured directly through your Lead Forms builder and embed widgets. Update stages, add remarks and schedule follow-ups from one place.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="badge b-green">{andStats.today} captured today</span>
          {andStats.unassigned > 0 ? (
            <span className="badge b-amber">{andStats.unassigned} unassigned</span>
          ) : null}
        </div>
      </div>

      <Reveal delay={1} className="grid g4">
        {statTiles.map((s) => (
          <div key={s.label} className="stat">
            <div className="top">
              <span className="label">{s.label}</span>
              <span className={`ic ${s.ic}`}>
                <Icon name={s.icon as never} size={18} />
              </span>
            </div>
            <div className="value">
              {leads === null && loading ? (
                "—"
              ) : (
                <>
                  <CountUp value={s.value} />
                  {s.suffix}
                </>
              )}
            </div>
          </div>
        ))}
      </Reveal>

      <Reveal delay={2}>
        <div className="card" style={{ marginTop: 18, marginBottom: 18 }}>
          <div className="card-h">
            <span className="t">Pipeline</span>
            <span className="x">{activeStatusCount.toLocaleString()} in view</span>
          </div>
          <div className="card-b" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setStatusFilter("");
                setPage(1);
              }}
              style={{
                border: statusFilter === "" ? "1px solid #2563eb" : undefined,
                background: statusFilter === "" ? "#eff6ff" : undefined,
                color: statusFilter === "" ? "#1d4ed8" : undefined,
              }}
            >
              All
              <span className="muted" style={{ marginLeft: 6 }}>
                {andStats.total}
              </span>
            </button>
            {ADMIN_LEAD_STATUS_ORDER.map((status) => {
              const stage = ADMIN_LEAD_STATUS_META[status];
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setStatusFilter(active ? "" : status);
                    setPage(1);
                  }}
                  style={{
                    border: `1px solid ${active ? stage.color : "transparent"}`,
                    background: active ? adminLeadStatusTint(stage.color) : "#f8fafc",
                    color: active ? stage.color : "#475569",
                  }}
                >
                  {stage.label}
                  <span style={{ marginLeft: 6, opacity: 0.75 }}>
                    {andStats.byStatus[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Reveal>

      <Reveal delay={2}>
        <div className="card">
          <div className="card-h">
            <span className="t">Leads</span>
            <span className="x">
              {loading ? "Loading…" : `${total.toLocaleString()} matching lead${total === 1 ? "" : "s"}`}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              padding: "14px 16px",
              borderBottom: "1px solid #eef2f6",
            }}
          >
            <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--faint)",
                }}
              />
              <input
                className="inp"
                placeholder="Search name, phone, email, city…"
                style={{ paddingLeft: 36 }}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select
              className="inp"
              style={{ width: "auto", minWidth: 170 }}
              value={formFilter}
              onChange={(e) => {
                setFormFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Lead Forms</option>
              {(meta?.forms ?? []).map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              className="inp"
              style={{ width: "auto", minWidth: 140 }}
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sources</option>
              {(meta?.sources ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="inp"
              style={{ width: "auto", minWidth: 150 }}
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [nextBy, nextDir] = e.target.value.split(":");
                setSortBy(nextBy);
                setSortDir(nextDir as "asc" | "desc");
                setPage(1);
              }}
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="status:asc">Status A–Z</option>
              <option value="source:asc">Source A–Z</option>
              <option value="formName:asc">Form A–Z</option>
            </select>
            {(search || statusFilter || formFilter || sourceFilter) ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStatusFilter("");
                  setFormFilter("");
                  setSourceFilter("");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="form-alert" style={{ margin: 16 }}>
              {error}
            </div>
          ) : null}

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Form</th>
                  <th>Embed ID</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Next follow-up</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && !leads ? (
                  <tr>
                    <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>
                      Loading leads…
                    </td>
                  </tr>
                ) : !leads?.length ? (
                  <tr>
                    <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>
                      No leads match these filters.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => {
                    const name = leadDisplayName(lead);
                    const phone = leadDisplayPhone(lead);
                    const email = leadDisplayEmail(lead);
                    const source = leadDisplaySource(lead);
                    return (
                      <tr key={lead.id}>
                        <td>
                          <Link
                            href={`/admin-console/leads/${lead.id}`}
                            style={{ fontWeight: 600, color: "var(--ink)" }}
                          >
                            {name}
                          </Link>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {[phone, email].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                            {lead.formName || "—"}
                          </span>
                        </td>
                        <td>
                          {lead.landingPageId ? (
                            <code style={{ fontSize: 11, color: "var(--faint)" }}>
                              {lead.landingPageId.replace(/^embed_/, "")}
                            </code>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${sourceBadgeClass(source)}`}>
                            {source || "Website"}
                          </span>
                        </td>
                        <td>
                          <LeadStatusPill status={lead.status} />
                        </td>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                          {lead.nextAction ? (
                            <span style={{ color: lead.nextAction.overdue ? "var(--rose)" : undefined }}>
                              {formatAdminLeadDate(lead.nextAction.scheduledAt)}
                            </span>
                          ) : (
                            <span className="muted">Not scheduled</span>
                          )}
                        </td>
                        <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                          {formatAdminLeadDate(lead.createdAt)}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                            {lead.convertedOrg ? (
                              <Link
                                href={`/admin-console/organisation-detail/${lead.convertedOrg.id}`}
                                className="btn btn-sm"
                                style={{
                                  background: "#ecfdf5",
                                  color: "#059669",
                                  border: "1px solid #a7f3d0",
                                  fontWeight: 600,
                                  fontSize: 12,
                                  padding: "4px 8px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  textDecoration: "none",
                                }}
                                title={`Converted into ${lead.convertedOrg.name}`}
                              >
                                <Icon name="building" size={13} /> {lead.convertedOrg.name} ↗
                              </Link>
                            ) : lead.status === "converted" ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{
                                  background: "linear-gradient(135deg, #10b981, #059669)",
                                  borderColor: "#059669",
                                  fontSize: 12,
                                  padding: "4px 10px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                                onClick={() => setConvertModalLead(lead)}
                              >
                                <Icon name="sparkles" size={13} /> Convert to Org
                              </button>
                            ) : null}
                            <Link
                              href={`/admin-console/leads/${lead.id}`}
                              className="btn btn-ghost btn-sm"
                            >
                              Manage
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <ListPager
            page={page}
            total={total}
            pageSize={LIST_PAGE_SIZE}
            onPageChange={setPage}
            loading={loading}
            noun="leads"
          />
        </div>
      </Reveal>

      <ConvertLeadModal
        isOpen={Boolean(convertModalLead)}
        lead={convertModalLead}
        onClose={() => setConvertModalLead(null)}
        onSuccess={() => void loadLeads()}
      />
    </>
  );
}
