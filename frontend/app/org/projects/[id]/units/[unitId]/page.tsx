"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PROJECT_UNIT_ACTIONS } from "@/lib/permissions";
import { apiFetch } from "@/lib/api";
import { currencyPrefix, formatMoney } from "@/lib/money";
import { customValueText, nonRoleFields, roleField, templateTraits } from "@/lib/field-template";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { ProjectTabs } from "@/components/org/project-tabs";
import { PlanLockNotice, useProjectViewOnly } from "@/components/billing/locked";
import { PLAN_LOCK_COPY } from "@/lib/plan-lock";
import { formatPossession } from "@/components/org/project-form-fields";
import "@/app/org/org.css";
import type { ProjectDetail, Unit, UnitStatus } from "@/lib/types";

const STATUS_BADGE: Record<UnitStatus, string> = {
  available: "b-green",
  booked: "b-rose",
  held: "b-amber",
  sold: "b-gray",
};

const STATUS_DOT: Record<UnitStatus, string> = {
  available: "var(--green)",
  booked: "var(--rose)",
  held: "var(--amber)",
  sold: "var(--slate, #64748b)",
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  booked: "Booked",
  held: "Held",
  sold: "Sold",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrgProjectUnitDetailPage() {
  const params = useParams<{ id: string; unitId: string }>();
  const id = params?.id ?? "";
  const unitId = params?.unitId ?? "";
  const { accessToken, hasPermission } = useAuth();
  // Edit and the status actions (Book / Hold / Mark as sold) = Edit unit.
  // Billing v2: a view-only project's units can't be booked, held or edited.
  const viewOnly = useProjectViewOnly(id);
  const canEditUnit = hasPermission("projects", PROJECT_UNIT_ACTIONS.edit) && !viewOnly;
  const statusTitle = viewOnly
    ? PLAN_LOCK_COPY.project_view_only.tooltip
    : canEditUnit
      ? undefined
      : "You don't have permission to change unit status";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<UnitStatus | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !id || !unitId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [proj, unitRow] = await Promise.all([
        apiFetch<ProjectDetail>(`/org/projects/${id}`, { headers }),
        apiFetch<Unit>(`/org/projects/${id}/units/${unitId}`, { headers }),
      ]);
      setProject(proj);
      setUnit(unitRow);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken, id, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(next: UnitStatus) {
    if (!accessToken || !unit || next === unit.status) return;
    setBusyAction(next);
    setError(null);
    try {
      await apiFetch(`/org/projects/${id}/units/${unit.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: next }),
      });
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update unit status.");
    } finally {
      setBusyAction(null);
    }
  }

  if (notFound) {
    return (
      <>
        <ProjectTabs active="units" />
        <div className="card">
          <div className="card-b">
            <p className="muted">Unit not found.</p>
            <Link
              href={`/org/projects/${id}/units`}
              className="btn btn-ghost btn-sm"
            >
              ← Back to units
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (loading && !project) {
    return (
      <>
        <ProjectTabs active="units" />
        <div className="card">
          <div className="card-b">
            <p className="muted">Loading…</p>
          </div>
        </div>
      </>
    );
  }

  // Planned mix defaults are only a display fallback when the unit itself is blank.
  const plannedType =
    project?.unitTypes.find((ut) => ut.name === unit?.configuration) ?? null;

  // The project's structure decides which facts a unit has. `tower` shows
  // exactly what it always did; other layouts show their single area, their
  // group (in the project's own word) and the project's unit field template.
  const traits = templateTraits(project?.unitFieldTemplate ?? []);
  const groupWord = roleField(project?.unitFieldTemplate ?? [], "group")?.label ?? "Group";
  const areaField = roleField(project?.unitFieldTemplate ?? [], "area");
  const priceField = roleField(project?.unitFieldTemplate ?? [], "price");
  const effectivePrice = unit?.price ?? (priceField && plannedType?.fieldDefaults?.[priceField.key] != null ? Number(plannedType.fieldDefaults[priceField.key]) : null);
  const effectiveArea = unit?.area ?? (areaField && plannedType?.fieldDefaults?.[areaField.key] != null ? Number(plannedType.fieldDefaults[areaField.key]) : null);
  const customRows = nonRoleFields(project?.unitFieldTemplate ?? []).map((f) => ({
    k: f.label,
    v: customValueText(f, unit?.customFields?.[f.key]),
  }));
  const perArea = effectivePrice && effectiveArea
    ? `${currencyPrefix(project?.currency ?? "INR").trim()}${(effectivePrice / effectiveArea).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${project?.areaUnit ?? "sqft"}`
    : "";
  const areaText = effectiveArea != null ? `${effectiveArea.toLocaleString("en-IN")} ${project?.areaUnit ?? "sqft"}` : "—";

  const subParts = (traits.configurations
    ? [
        unit?.configuration ?? null,
        unit?.variantLabel ?? null,
        traits.grouped ? unit?.tower ?? null : null,
        unit?.floor != null ? `Floor ${unit.floor}` : null,
        effectiveArea != null ? `${effectiveArea.toLocaleString("en-IN")} ${project?.areaUnit ?? "sqft"}` : null,
        unit?.facing != null ? `${unit.facing} facing` : null,
      ]
    : [
        project?.projectType ?? null,
        unit?.variantLabel ?? null,
        traits.grouped && unit?.tower ? `${groupWord} ${unit.tower}` : null,
        unit?.area != null ? `${unit.area.toLocaleString("en-IN")} sqft` : null,
        unit?.facing != null ? `${unit.facing} facing` : null,
      ]
  ).filter(Boolean) as string[];

  const specs: { k: string; v: string }[] = [
    ...(traits.configurations ? [{ k: "Configuration", v: unit?.configuration ?? "—" }] : []),
    { k: "Unit type", v: unit?.variantLabel ?? "—" },
    ...(traits.configurations
      ? [
          { k: areaField?.label ?? "Area", v: areaText },
        ]
      : [{ k: "Area", v: areaText }]),
    ...(traits.floors
      ? [
          {
            k: "Floor",
            v: unit?.floor != null ? `Floor ${unit.floor}` : "—",
          },
        ]
      : []),
    ...customRows,
    { k: "Facing", v: unit?.facing ?? "—" },
    { k: "Parking", v: unit?.parking ?? "—" },
    {
      k: `${currencyPrefix(project?.currency ?? "INR").trim()} / ${project?.areaUnit ?? "sqft"}`,
      v: perArea || "—",
    },
    ...(traits.grouped ? [{ k: traits.configurations ? "Tower" : groupWord, v: unit?.tower ?? "—" }] : []),
    // Units have no possession date of their own — this is the project's,
    // labelled so nobody reads it as unit-specific.
    { k: "Possession (project)", v: formatPossession(project?.possession) },
  ];

  const kvRows: { k: string; v: string }[] = [
    { k: "Base price", v: effectivePrice != null ? formatMoney(effectivePrice, project?.currency ?? "INR") : "—" },
    { k: "Status", v: unit ? STATUS_LABEL[unit.status] : "—" },
    ...(traits.grouped ? [{ k: traits.configurations ? "Tower" : groupWord, v: unit?.tower ?? "—" }] : []),
    ...(traits.floors ? [{ k: "Floor", v: unit?.floor != null ? String(unit.floor) : "—" }] : []),
    { k: "Possession (project)", v: formatPossession(project?.possession) },
    { k: "RERA", v: project?.reraId ?? "—" },
    // Who touched this unit — the client asked to see both, particularly for
    // price changes. Null on rows written before the columns existed.
    {
      k: "Created by",
      v: unit?.createdBy ? `${unit.createdBy.name} · ${formatDate(unit.createdAt)}` : "—",
    },
    {
      k: "Last updated by",
      v: unit?.updatedBy ? `${unit.updatedBy.name} · ${formatDate(unit.updatedAt)}` : "—",
    },
  ];

  const timeline = unit
    ? [
        {
          title: unit.configuration || "Unit",
          text: `Created — added to ${project?.name ?? "project"} sales inventory.`,
          date: formatDate(unit.createdAt),
        },
        {
          title: STATUS_LABEL[unit.status],
          text: `Currently marked ${STATUS_LABEL[unit.status].toLowerCase()} in the availability grid.`,
          date: STATUS_LABEL[unit.status] === "Available" ? "Now" : formatDate(unit.updatedAt),
        },
        {
          title: "Last updated",
          text: "Latest change recorded on this unit.",
          date: formatDate(unit.updatedAt),
        },
      ]
    : [];

  return (
    <>
      <Reveal delay={0}>
        <div className="page-head reveal in">
          <div>
            <div className="eyebrow">
              <Link href={`/org/projects/${id}/units`}><Icon name="home" size={12} /> Units</Link> ·{" "}
              <Link href={`/org/projects/${id}`}>
                {project?.name ?? "Project"}
              </Link>
            </div>
            <h1>
              {unit ? `Unit ${unit.unitNo}` : "Unit"}{" "}
              {unit ? (
                <span className={`badge ${STATUS_BADGE[unit.status]}`}>
                  <span className="dot" style={{ background: STATUS_DOT[unit.status] }} />
                  {STATUS_LABEL[unit.status]}
                </span>
              ) : null}
            </h1>
            <div className="sub">
              {subParts.length > 0 ? subParts.join(" · ") : "Unit workspace"}
            </div>
          </div>
          <div className="actions">
            <Link href={`/org/projects/${id}/units`} className="btn btn-ghost">
              ← Back
            </Link>
            {canEditUnit ? (
              <Link
                href={`/org/projects/${id}/units?edit=${unitId}&from=unit`}
                className="btn btn-ghost"
              >
                <Icon name="edit" size={13} /> Edit
              </Link>
            ) : null}
          </div>
        </div>
      </Reveal>

      <ProjectTabs active="units" />
      {viewOnly ? <PlanLockNotice kind="project_view_only" /> : null}

      {error ? (
        <Reveal delay={1}>
          <div className="form-alert mb-16">{error}</div>
        </Reveal>
      ) : null}

      {saved ? (
        <Reveal delay={1}>
          <div className="form-alert ok mb-16"><Icon name="check" size={13} /> Status updated.</div>
        </Reveal>
      ) : null}

      {unit ? (
        <div className="ugrid reveal in" data-delay="1">
          <div className="col gap-18">
            <Reveal delay={1}>
              <div className="media h-280">
                <Icon name="camera" size={28} />
                <span className="cap">
                  {project?.name ?? ""} · {unit.unitNo}
                </span>
              </div>
            </Reveal>

            <Reveal delay={2}>
              <div className="gallery">
                <div className="thumb media plan">
                  <Icon name="camera" size={20} />
                </div>
                <div className="thumb media">
                  <Icon name="camera" size={20} />
                </div>
                <div className="thumb media g2v">
                  <Icon name="camera" size={20} />
                </div>
                <div className="thumb media g3v">
                  <Icon name="camera" size={20} />
                </div>
              </div>
            </Reveal>

            <Reveal delay={2}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Specifications</span>
                </div>
                <div className="card-b">
                  <div className="unit-spec-grid">
                    {specs.map((s) => (
                      <div className="sp" key={s.k}>
                        <div className="k">{s.k}</div>
                        <div className="v">{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={3}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Status history</span>
                </div>
                <div className="card-b">
                  <ul className="timeline">
                    {timeline.map((t) => (
                      <li key={t.title}>
                        <span className="td" />
                        <b>{t.title}</b> — {t.text}
                        <div className="tt">{t.date}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="col gap-18">
            <Reveal delay={1}>
              <div className="card">
                <div className="card-b">
                  <div className="pricebox">
                    <div className="muted fs-12">Price</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>
                      {effectivePrice != null ? formatMoney(effectivePrice, project?.currency ?? "INR") : "—"}
                    </div>
                    <div className="muted fs-12-5">
                      {perArea || `Price per ${project?.areaUnit ?? "sqft"}`} · all-inclusive
                    </div>
                  </div>
                  <div className="kv mt-16">
                    {kvRows.map((r) => (
                      <div className="row" key={r.k}>
                        <span className="k">{r.k}</span>
                        <span className="v">{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={2}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Interested leads</span>
                </div>
                <div className="card-b">
                  <p className="muted fs-12-5">
                    No interested leads linked to this unit yet.
                  </p>
                  <Link
                    href={`/org/projects/${id}/leads`}
                    className="mt-8 btn btn-ghost btn-block"
                  >
                    Open project leads →
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal delay={3}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Actions</span>
                </div>
                <div className="card-b col gap-8">
                  <button
                    className="btn btn-primary btn-block"
                    type="button"
                    disabled={!canEditUnit || busyAction !== null || unit.status === "booked"}
                    title={statusTitle}
                    onClick={() => void changeStatus("booked")}
                  >
                    {busyAction === "booked" ? "Saving…" : <><Icon name="check" size={13} /> Book unit</>}
                  </button>
                  <button
                    className="btn btn-soft btn-block"
                    type="button"
                    disabled={!canEditUnit || busyAction !== null || unit.status === "held"}
                    title={statusTitle}
                    onClick={() => void changeStatus("held")}
                  >
                    {busyAction === "held" ? "Saving…" : <><Icon name="lock" size={13} /> Hold (48h)</>}
                  </button>
                  <button
                    className="btn btn-ghost btn-block"
                    type="button"
                    disabled={!canEditUnit || busyAction !== null || unit.status === "sold"}
                    title={statusTitle}
                    onClick={() => void changeStatus("sold")}
                  >
                    {busyAction === "sold" ? "Saving…" : <><Icon name="flag" size={13} /> Mark as sold</>}
                  </button>
                  <button className="btn btn-ghost btn-block" type="button" disabled>
                    <Icon name="link" size={13} /> Send unit details
                  </button>
                  <button
                    className="btn btn-ghost btn-block"
                    type="button"
                    disabled
                    title="Floor plan upload is coming soon"
                  >
                    <Icon name="document" size={13} /> Download floor plan
                  </button>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      ) : null}
    </>
  );
}