"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PROJECT_UNIT_ACTIONS } from "@/lib/permissions";
import { apiFetch, getOrgUnits } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { formatUpdatedAt } from "@/components/org/project-form-fields";
import { Reveal } from "@/components/superadmin/reveal";
import { CountUp } from "@/components/superadmin/count-up";
import { Icon } from "@/components/icons";
import { PlanLockBadge, usePlanLocks } from "@/components/billing/locked";
import { PLAN_LOCK_COPY } from "@/lib/plan-lock";
import "@/app/org/org.css";
import type {
  OrgUnitsListResponse,
  ProjectsListResponse,
  ProjectListRow,
  UnitStatus,
} from "@/lib/types";

const LIMIT = 10;
/** Billing v2: the project filter's "View only" choice. */
const VIEW_ONLY = "__view_only__";

const STATUS_TABS: { label: string; value: UnitStatus | null }[] = [
  { label: "All", value: null },
  { label: "Available", value: "available" },
  { label: "Booked", value: "booked" },
  { label: "Held", value: "held" },
  { label: "Sold", value: "sold" },
];

const STATUS_BADGE: Record<UnitStatus, string> = {
  available: "b-green",
  booked: "b-rose",
  held: "b-amber",
  sold: "b-gray",
};
const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  booked: "Booked",
  held: "Held",
  sold: "Sold",
};

export default function AllUnitsPage() {
  const { accessToken, hasPermission } = useAuth();
  const canAddUnit = hasPermission("projects", PROJECT_UNIT_ACTIONS.add);
  // Billing v2: units of a view-only project get the badge and a filter.
  const locks = usePlanLocks();

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState(0);
  const [projectFilter, setProjectFilter] = useState("");
  const [page, setPage] = useState(1);

  const [projects, setProjects] = useState<ProjectListRow[]>([]);
  const [result, setResult] = useState<OrgUnitsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<ProjectsListResponse>("/org/projects?page=1&limit=100", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => setProjects(res.data))
      .catch(() => {
        /* projects filter just stays empty */
      });
  }, [accessToken]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [search, statusTab, projectFilter]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    getOrgUnits({
      page,
      limit: LIMIT,
      status: STATUS_TABS[statusTab].value ?? undefined,
      projectId:
        projectFilter && projectFilter !== "__standalone__" && projectFilter !== VIEW_ONLY
          ? projectFilter
          : undefined,
      standalone: projectFilter === "__standalone__" || undefined,
      viewOnly: projectFilter === VIEW_ONLY || undefined,
      search: search.trim() || undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Couldn't load units.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, page, statusTab, projectFilter, search]);

  const counts = result?.counts ?? {
    available: 0,
    booked: 0,
    held: 0,
    sold: 0,
  };
  const totalAll = counts.available + counts.booked + counts.held + counts.sold;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));


  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Icon name="building" size={14} /> Sales
          </div>
          <h1>All Units</h1>
          <div className="sub">
            Every unit across all projects in one place — status, pricing and
            availability without opening each project.
          </div>
        </div>
        <div className="actions">
          {canAddUnit ? (
            <Link
              href="/org/projects/all-units/create"
              className="btn btn-primary"
            >
              ＋ Add standalone unit
            </Link>
          ) : null}
        </div>
      </div>

      <div className="psub reveal in" data-delay="1">
        <Link href="/org/projects">All Projects</Link>
        <Link href="/org/projects/all-units" className="active">
          All Units
        </Link>
      </div>

      <div className="ustatus reveal in" data-delay="1">
        <div className="ust tot">
          <div className="n">
            <CountUp value={totalAll} />
          </div>
          <div className="l">Total units</div>
        </div>
        <div className="ust av">
          <div className="n">
            <CountUp value={counts.available} />
          </div>
          <div className="l">Available</div>
        </div>
        <div className="ust bk">
          <div className="n">
            <CountUp value={counts.booked} />
          </div>
          <div className="l">Booked</div>
        </div>
        <div className="ust hl">
          <div className="n">
            <CountUp value={counts.held} />
          </div>
          <div className="l">Held / Blocked</div>
        </div>
        <div className="ust sl">
          <div className="n">
            <CountUp value={counts.sold} />
          </div>
          <div className="l">Sold</div>
        </div>
      </div>

      <Reveal delay={1}>
        <div className="toolbar">
          <div className="tb-search search-box">
            <span className="si">
              <Icon name="search" size={14} />
            </span>
            <input
              className="inp"
              placeholder="Search unit no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="inp mw-190"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">All projects</option>
            <option value="__standalone__">Standalone (no project)</option>
            {locks.active ? <option value={VIEW_ONLY}>{PLAN_LOCK_COPY.project_view_only.badge}</option> : null}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="seg">
            {STATUS_TABS.map((t, i) => (
              <span
                key={t.label}
                className={statusTab === i ? "on" : ""}
                onClick={() => setStatusTab(i)}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </Reveal>

      {error ? (
        <Reveal delay={2}>
          <div className="form-alert mb-14">{error}</div>
        </Reveal>
      ) : null}

      <Reveal delay={2}>
        <div className="card">
          <div className="card-h">
            <span className="t">Units</span>
            <span className="x">
              {total} total · showing {rows.length}
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Project</th>
                  <th>Configuration</th>
                  <th>Area</th>
                  <th>Tower</th>
                  <th>Floor</th>
                  <th>Facing</th>
                  <th>Parking</th>
                  <th>Price</th>
                  <th>Created by</th>
                  <th>Updated by</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} className="muted">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="muted">
                      No units match this filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((u) => {
                    const ccy = u.project?.currency ?? "INR";
                    const areaUnit = u.project?.areaUnit || "sqft";
                    const psf = u.pricePerArea;
                    const detailHref = u.project
                      ? `/org/projects/${u.project.id}/units/${u.id}`
                      : `/org/units/${u.id}`;
                    return (
                      <tr key={u.id}>
                        <td>
                          <Link href={detailHref} className="brand-link mono">
                            {u.unitNo}
                          </Link>
                        </td>
                        <td>
                          {u.project ? (
                            <Link
                              href={`/org/projects/${u.project.id}/units`}
                              className="brand-link"
                            >
                              {u.project.name}
                            </Link>
                          ) : (
                            <span className="muted">Standalone</span>
                          )}
                        </td>
                        <td>{u.configuration ?? "—"}</td>
                        <td>
                          {u.area != null
                            ? `${u.area.toLocaleString("en-IN")} ${areaUnit}`
                            : "—"}
                        </td>
                        <td>{u.tower ?? "—"}</td>
                        <td>{u.floor ?? "—"}</td>
                        <td>{u.facing ?? "—"}</td>
                        <td>{u.parking ?? "—"}</td>
                        <td>
                          {u.price != null
                            ? formatMoney(u.price, ccy)
                            : psf != null
                              ? `${formatMoney(psf, ccy, 2)}/${areaUnit}`
                              : "—"}
                          {u.price != null && psf != null ? (
                            <div className="hint">
                              {formatMoney(psf, ccy, 2)}/{areaUnit}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {u.createdBy ? (
                            <>
                              <div>{u.createdBy.name}</div>
                              <div className="hint">{formatUpdatedAt(u.createdAt)}</div>
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {u.updatedBy ? (
                            <>
                              <div>{u.updatedBy.name}</div>
                              <div className="hint">{formatUpdatedAt(u.updatedAt)}</div>
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[u.status]}`}>
                            {STATUS_LABEL[u.status]}
                          </span>
                          {locks.projectViewOnly(u.project?.id) ? <PlanLockBadge kind="project_view_only" style={{ marginLeft: 4 }} /> : null}
                        </td>
                        <td>
                          <Link
                            href={detailHref}
                            className="btn btn-ghost btn-sm"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="pager">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </button>
              <span className="muted fs-12-5 self-center">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          ) : null}
        </div>
      </Reveal>
    </>
  );
}
