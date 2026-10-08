"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PROJECT_UNIT_ACTIONS } from "@/lib/permissions";
import {
  apiFetch,
  createStandaloneUnit,
  getOrgCatalogOptions,
  getSalesAgentCandidates,
} from "@/lib/api";
import { parseAmount, parseDecimal } from "@/lib/parse";
import { formatMoney } from "@/lib/money";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import {
  ConfigurationSelect,
  NoManagersNote,
  UnitMediaFields,
  areaPricePerAreaLabel,
  UnitAttributeSelect,
} from "@/components/org/project-form-fields";
import { FormActions, FormAlert, FormPage } from "@/components/forms/form-page";
import "@/app/org/org.css";
import type {
  CreateUnitInput,
  CrmAssignableUser,
  OrgCatalogOption,
  OrgUser,
  OrgUsersListResponse,
  ProjectsListResponse,
  ProjectListRow,
  UnitStatus,
} from "@/lib/types";

const STATUSES: { value: UnitStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "held", label: "Held / Blocked" },
  { value: "booked", label: "Booked" },
  { value: "sold", label: "Sold" },
];
const STATUS_BADGE: Record<UnitStatus, string> = {
  available: "b-green",
  booked: "b-rose",
  held: "b-amber",
  sold: "b-gray",
};

function userLabel(u: OrgUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
}

/**
 * "Add a unit" — standalone (resale / broker) listings only. A project-bound
 * unit's fields are entirely driven by that project's own template (which
 * varies per project type — configuration, floor, group and area are each
 * only present if the project's template has the matching role field), so
 * that form lives on the project's own Units page rather than being
 * duplicated here. Picking "Inside a project" just links there.
 */
export default function UnitCreatePage() {
  const router = useRouter();
  const { accessToken, hasPermission } = useAuth();
  const canAddUnit = hasPermission("projects", PROJECT_UNIT_ACTIONS.add);
  useEffect(() => {
    if (accessToken && !canAddUnit) router.replace("/org/projects/all-units");
  }, [accessToken, canAddUnit, router]);

  // Standalone only for now — the "Inside a project" picker is commented out below.
  const [mode] = useState<"project" | "standalone">("standalone");
  const [projects, setProjects] = useState<ProjectListRow[]>([]);
  const [projectId, setProjectId] = useState("");
  // The org's unit-type catalog (Settings → Project Catalogs) — the sole
  // source for a standalone unit's "Configuration".
  const [catalog, setCatalog] = useState<OrgCatalogOption[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [configuration, setConfiguration] = useState("");
  const [variantLabel, setVariantLabel] = useState("");
  const [unitNo, setUnitNo] = useState("");
  const [area, setArea] = useState("");
  const [facing, setFacing] = useState("");
  const [parking, setParking] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<UnitStatus>("available");
  const [floorPlanUrl, setFloorPlanUrl] = useState("");
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [addressLine, setAddressLine] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [notes, setNotes] = useState("");

  // Standalone-only assignment. Same eligibility rule as a project's Team &
  // access section.
  const [managerId, setManagerId] = useState("");
  const [managers, setManagers] = useState<OrgUser[]>([]);
  const [managersLoaded, setManagersLoaded] = useState(false);
  const [agentAssign, setAgentAssign] = useState<string[]>([]);
  const [salesAgentCandidates, setSalesAgentCandidates] = useState<
    CrmAssignableUser[]
  >([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    apiFetch<ProjectsListResponse>("/org/projects?page=1&limit=100", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (!cancelled) setProjects(res.data);
      })
      .catch(() => {
        if (!cancelled)
          setError("Couldn't load your projects. Reload and try again.");
      });
    getOrgCatalogOptions()
      .then((rows) => {
        if (cancelled) return;
        setCatalog(
          [...rows].sort(
            (a, b) =>
              a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
          ),
        );
        setCatalogError(null);
      })
      .catch((e) => {
        if (!cancelled)
          setCatalogError(
            e instanceof Error
              ? e.message
              : "Couldn't load configuration options.",
          );
      });
    apiFetch<OrgUsersListResponse>(
      "/org/users?role=manager&limit=100&status=active",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
      .then((res) => {
        if (cancelled) return;
        setManagers(res.data);
        setManagersLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setManagers([]);
      });
    getSalesAgentCandidates()
      .then((res) => {
        if (!cancelled) setSalesAgentCandidates(res.data);
      })
      .catch(() => {
        if (!cancelled) setSalesAgentCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const standalone = mode === "standalone";
  const currency = "INR";
  const facingOptions = (catalog ?? []).filter((option) => option.category === "facing");
  const parkingOptions = (catalog ?? []).filter((option) => option.category === "parking");
  const variantOptions = (catalog ?? []).filter((option) => option.category === "unit_variant");
  const configurationOptions = (catalog ?? []).filter((option) => option.category === "unit_type");

  const pricePerArea = areaPricePerAreaLabel(parseAmount(price), parseDecimal(area), "sqft", currency);

  const canSave =
    standalone &&
    !saving &&
    configuration !== "" &&
    unitNo.trim() !== "";

  async function submit() {
    if (!accessToken || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const body: CreateUnitInput = {
        configuration,
        variantLabel: variantLabel.trim() || undefined,
        unitNo: unitNo.trim(),
        area: parseDecimal(area),
        facing: facing.trim() || undefined,
        parking: parking.trim() || undefined,
        price: parseAmount(price),
        status,
        floorPlanUrl: floorPlanUrl || undefined,
        galleryUrls: galleryUrls.length ? galleryUrls : undefined,
        addressLine: addressLine.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        notes: notes.trim() || undefined,
        managerId: managerId || undefined,
        salesAgentIds: agentAssign.length ? agentAssign : undefined,
      };
      const created = await createStandaloneUnit(body);
      router.push(`/org/units/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save unit.");
      setSaving(false);
    }
  }

  return (
    <FormPage
      eyebrow="Units · Add"
      title="Add a unit"
      subtitle="Add a standalone resale / broker listing with no project."
      backHref="/org/projects/all-units"
      backLabel="Back to Units"
    >
      <FormAlert message={error} />

      <Reveal delay={1}>
        <div className="cgrid">
          <div className="card pad-26">
            {/* "Inside a project" is hidden for now — project units are added
                from the project's own Units page. Kept for when it returns.
            <div className="sec">
              <div className="lbl"><Icon name="properties" size={15} /> How do you want to add this unit?</div>
              <div className="mode">
                <div
                  className={`modecard ${mode === "project" ? "on" : ""}`}
                  onClick={() => setMode("project")}
                >
                  <div className="ic"><Icon name="building" size={24} /></div>
                  <b>Inside a project</b>
                  <small>Attach to an existing development.</small>
                </div>
                <div
                  className={`modecard ${mode === "standalone" ? "on" : ""}`}
                  onClick={() => setMode("standalone")}
                >
                  <div className="ic"><Icon name="home" size={24} /></div>
                  <b>Standalone unit</b>
                  <small>Resale / broker listing — no project needed.</small>
                </div>
              </div>
            </div>
            */}

            {!standalone ? (
              <div className="sec nb">
                <div className="lbl"><Icon name="map" size={15} /> Which project?</div>
                <div className="field">
                  <label>Project</label>
                  <select
                    className="inp"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">Select a project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProject ? (
                  <div className="form-alert mb-0" style={{ marginTop: 10 }}>
                    A project unit&apos;s fields come from &ldquo;{selectedProject.name}&rdquo;&apos;s own template — add it from the project&apos;s Units page.{" "}
                    <Link className="brand-link" href={`/org/projects/${selectedProject.id}/units?new=1`}>
                      Go to Units →
                    </Link>
                  </div>
                ) : (
                  <div className="hint">Pick a project to go straight to its Units page.</div>
                )}
              </div>
            ) : (
              <>
                <div className="sec">
                  <div className="lbl"><Icon name="home" size={15} /> Unit details</div>
                  <div className="grid g3">
                    <div className="field">
                      <label>
                        Unit number <span className="req">*</span>
                      </label>
                      <input
                        className="inp"
                        placeholder="B-1204"
                        value={unitNo}
                        onChange={(e) => setUnitNo(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>
                        Configuration <span className="req">*</span>
                      </label>
                      <ConfigurationSelect
                        catalog={configurationOptions}
                        error={catalogError}
                        value={configuration}
                        onChange={setConfiguration}
                      />
                    </div>
                    <div className="field">
                      <label>Unit variant</label>
                      <UnitAttributeSelect
                        options={variantOptions}
                        loaded={catalog !== null}
                        error={catalogError}
                        value={variantLabel}
                        onChange={setVariantLabel}
                        placeholder="None"
                        emptyHint="No unit variants configured yet."
                      />
                      <div className="hint">Optional — e.g. Type A, Corner.</div>
                    </div>
                  </div>
                  <div className="grid g3">
                    <div className="field">
                      <label>Area (sqft)</label>
                      <input
                        className="inp"
                        type="number"
                        min={0}
                        placeholder="1450"
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Facing</label>
                      <UnitAttributeSelect
                        options={facingOptions}
                        loaded={catalog !== null}
                        error={catalogError}
                        value={facing}
                        onChange={setFacing}
                        placeholder="Select…"
                        emptyHint="No facing options configured yet."
                      />
                    </div>
                    <div className="field">
                      <label>Parking</label>
                      <UnitAttributeSelect
                        options={parkingOptions}
                        loaded={catalog !== null}
                        error={catalogError}
                        value={parking}
                        onChange={setParking}
                        emptyHint="No parking options configured yet."
                      />
                    </div>
                  </div>
                </div>

                <div className="sec">
                  <div className="lbl"><Icon name="billing" size={15} /> Pricing &amp; status</div>
                  <div className="grid g3">
                    <div className="field">
                      <label>Price</label>
                      <input
                        className="inp"
                        type="number"
                        min={0}
                        placeholder="16500000"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Price / sqft</label>
                      <input className="inp" placeholder="—" disabled value={pricePerArea} />
                    </div>
                    <div className="field">
                      <label>Status</label>
                      <select
                        className="inp"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as UnitStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="sec">
                  <div className="lbl"><Icon name="users" size={15} /> Team &amp; access</div>
                  <div className="grid g2">
                    <div className="field">
                      <label>Manager</label>
                      {managersLoaded && managers.length === 0 ? (
                        <NoManagersNote noun="unit" />
                      ) : (
                        <select
                          className="inp"
                          value={managerId}
                          onChange={(e) => setManagerId(e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {managers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {userLabel(u)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="field mb-0">
                    <label>Assign sales agents</label>
                    {salesAgentCandidates.length === 0 ? (
                      <div className="hint">No assignable users in your organisation yet — add them under Users.</div>
                    ) : (
                      <div className="opts">
                        {salesAgentCandidates.map((u) => {
                          const on = agentAssign.includes(u.id);
                          return (
                            <span
                              key={u.id}
                              className={`opt ${on ? "on" : ""}`}
                              onClick={() =>
                                setAgentAssign((prev) =>
                                  on ? prev.filter((x) => x !== u.id) : [...prev, u.id],
                                )
                              }
                            >
                              <span className="b">{on ? <Icon name="check" size={11} /> : ""}</span>{u.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="hint">
                      Controls whose All Units list this shows up in — org admins always see every unit.
                    </div>
                  </div>
                </div>

                <div className="sec">
                  <div className="lbl"><Icon name="document" size={15} /> Media &amp; documents</div>
                  <UnitMediaFields
                    floorPlanUrl={floorPlanUrl}
                    galleryUrls={galleryUrls}
                    onFloorPlanChange={setFloorPlanUrl}
                    onGalleryChange={setGalleryUrls}
                  />
                </div>

                <div className="sec nb">
                  <div className="lbl">
                    <Icon name="document" size={15} /> Listing details
                  </div>
                  <div className="grid g2">
                    <div className="field">
                      <label>Location / address</label>
                      <input
                        className="inp"
                        placeholder="SG Highway, Ahmedabad"
                        value={addressLine}
                        onChange={(e) => setAddressLine(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Owner / seller name</label>
                      <input
                        className="inp"
                        placeholder="Resale owner"
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field mb-0">
                    <label>Notes</label>
                    <textarea
                      className="inp"
                      rows={2}
                      placeholder="Ready to move, semi-furnished, negotiable…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {standalone ? (
            <div className="col gap-18">
              <div className="card">
                <div className="card-h">
                  <span className="t">Preview</span>
                </div>
                <div className="card-b">
                  <div className="ph-box"><Icon name="properties" size={28} /></div>
                  <div className="row between">
                    <b>{unitNo || "New unit"}</b>
                    <span className={`badge ${STATUS_BADGE[status]}`}>
                      {STATUSES.find((s) => s.value === status)?.label}
                    </span>
                  </div>
                  <div className="muted fs-12-5 mt-4">
                    Standalone unit
                    {configuration ? ` · ${configuration}` : ""}
                    {variantLabel ? ` · ${variantLabel}` : ""}
                    <br />
                    {[
                      facing || null,
                      area ? `${Number(area).toLocaleString("en-IN")} sqft` : null,
                      pricePerArea || null,
                      price ? formatMoney(parseAmount(price), currency) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Fill the form to preview."}
                  </div>
                </div>
              </div>
              <div className="help">
                <Icon name="info" size={15} /> Configuration comes from your{" "}
                <Link className="brand-link" href="/org/settings?section=catalogs">
                  Project Catalogs
                </Link>
                .
              </div>
            </div>
          ) : null}
        </div>
      </Reveal>

      {standalone ? (
        <FormActions
          cancelHref="/org/projects/all-units"
          busy={saving}
          submitDisabled={!canSave}
          busyLabel="Saving…"
          submitLabel="Save unit"
          submitIcon="check"
          onSubmit={() => void submit()}
        />
      ) : null}
    </FormPage>
  );
}
