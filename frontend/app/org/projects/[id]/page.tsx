"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PROJECT_LEAD_ACTION } from "@/lib/permissions";
import { apiFetch, createCrmLead, getCrmLeads, getProjectLandingPages, getProjectSalesAgents } from "@/lib/api";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { normalizeSpecifications, specificationRows } from "@/lib/specifications";
import { roleField, templateTraits } from "@/lib/field-template";
import { Reveal } from "@/components/superadmin/reveal";
import { CountUp } from "@/components/superadmin/count-up";
import { Icon } from "@/components/icons";
import { ProjectPageHead } from "@/components/org/project-tabs";
import { ProjectAccessBadge } from "@/components/billing/locked";
import "@/app/org/org.css";
import type { LandingPageRow, LandingPageStatus, ProjectDetail, ProjectSalesAgent } from "@/lib/types";

const LANDING_PAGE_STATUS_BADGE: Record<LandingPageStatus, string> = {
  draft: "b-gray",
  pending_approval: "b-amber",
  approved: "b-teal",
  rejected: "b-rose",
  published: "b-green",
  unpublished: "b-gray",
};

const LANDING_PAGE_STATUS_LABEL: Record<LandingPageStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  unpublished: "Unpublished",
};

/**
 * Direct Lead Entry — the manual walk-in form on this page.
 *
 * The Lead's `source` column is free text, but `leadDisplaySource` only maps a
 * fixed vocabulary (SOURCE_PLACE in lib/lead-display) and that vocabulary is
 * entirely about *where on a website* a lead came from — page form, popup,
 * hero, floor plan, brochure gate, project widget — plus "crm" for anything
 * entered by hand. It has no manual-channel words at all: no walk-in, no
 * referral, no channel partner.
 *
 * So every lead from this form stores `source: "crm"`, which maps cleanly to
 * "CRM" and reads consistently beside every other lead. The business channel
 * the user picked is kept in `data` instead, where the lead detail page lists
 * it with the rest of the captured fields — nothing is lost, and nothing is
 * written that the display layer would render raw.
 */
const LEAD_SOURCE = "crm";

/** The channel this walk-in came through. Stored in `data`, not `source`. */
const ENQUIRY_CHANNELS = [
  "Walk-in / Site visit",
  "Direct referral",
  "Channel partner",
  "Phone enquiry",
  "Meta ad",
  "Google search",
];

/** Budget bands offered by the form. Stored as the free-text string the CRM already uses. */
const BUDGET_BANDS = [
  "Under ₹50 L",
  "₹50 L – ₹1 Cr",
  "₹1 Cr – ₹2.5 Cr",
  "₹2.5 Cr+",
];

function managerInitials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export default function OrgProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { accessToken, hasPermission } = useAuth();
  // Projects > Edit shows the Edit button; Projects > Add lead shows the
  // Direct Lead Entry form (the lead is created for this project).
  const canEdit = hasPermission("projects", "edit");
  const canCreateLead = hasPermission("projects", PROJECT_LEAD_ACTION);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [salesAgents, setSalesAgents] = useState<ProjectSalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [projectLandingPages, setProjectLandingPages] = useState<LandingPageRow[]>([]);
  const [landingPagesLoading, setLandingPagesLoading] = useState(true);
  const [leadCount, setLeadCount] = useState(0);

  // Direct Lead Entry form.
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadConfig, setLeadConfig] = useState("");
  const [leadBudget, setLeadBudget] = useState("");
  const [leadChannel, setLeadChannel] = useState(ENQUIRY_CHANNELS[0]);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadToast, setLeadToast] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !id) return;
    setLoading(true);
    setNotFound(false);
    apiFetch<ProjectDetail>(`/org/projects/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(setProject)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [accessToken, id]);

  useEffect(() => {
    if (!accessToken || !id) return;
    getProjectSalesAgents(id)
      .then(setSalesAgents)
      .catch(() => setSalesAgents([]));
  }, [accessToken, id]);

  useEffect(() => {
    if (!id) return;
    getCrmLeads({ projectId: id, limit: 1 })
      .then((res) => setLeadCount(res.total ?? res.data.length))
      .catch(() => setLeadCount(0));
  }, [id]);

  useEffect(() => {
    if (!accessToken || !id) return;
    setLandingPagesLoading(true);
    getProjectLandingPages(id)
      .then(setProjectLandingPages)
      .catch(() => setProjectLandingPages([]))
      .finally(() => setLandingPagesLoading(false));
  }, [accessToken, id]);

  /**
   * Create the lead through the CRM's own manual endpoint — the same call the
   * Add-lead modal makes. Round-robin assignment, the "Lead created in CRM"
   * activity event and the `new` status default all come from that service;
   * nothing is reimplemented here.
   *
   * The `data` keys match what `normalizeLeadData` (server) and
   * lib/lead-display (client) both look for, so the lead lands fully populated
   * in Lead Center rather than as a bare name.
   */
  async function submitLead() {
    const name = leadName.trim();
    const phone = leadPhone.trim();
    // Client-side check for fast feedback; the server is still authoritative
    // (it requires at least one of name / phone / email and re-validates).
    if (!name || !phone) {
      setLeadToast(null);
      setLeadError("Enter the customer's name and phone number.");
      return;
    }
    setLeadSaving(true);
    setLeadError(null);
    setLeadToast(null);
    try {
      await createCrmLead({
        projectId: id,
        formName: "Direct lead entry",
        source: LEAD_SOURCE,
        data: {
          // Name and phone under both spellings the key lists accept.
          fullName: name,
          name,
          phone,
          phoneNumber: phone,
          // Configuration reads as the lead's interest — an INTEREST_KEYS
          // match, and what leadDisplaySource appends after the project.
          ...(leadConfig ? { interestedIn: leadConfig, bhk: leadConfig } : {}),
          ...(leadBudget ? { budget: leadBudget } : {}),
          // Denormalised alongside projectId, matching existing lead rows.
          ...(project ? { project: project.name } : {}),
          "Enquiry channel": leadChannel,
        },
      });
      setLeadName("");
      setLeadPhone("");
      setLeadConfig("");
      setLeadBudget("");
      setLeadChannel(ENQUIRY_CHANNELS[0]);
      setLeadCount((n) => n + 1);
      setLeadToast(`Lead created for ${name}. It's in Lead Center now.`);
      setTimeout(() => setLeadToast(null), 4000);
    } catch (err) {
      // Surfaced inline rather than hidden — a 403 from a missing crm:add
      // permission should be readable, not a silently dead button.
      setLeadError(err instanceof Error ? err.message : "Couldn't create the lead.");
    } finally {
      setLeadSaving(false);
    }
  }

  if (notFound) {
    return (
      <>
        <ProjectPageHead active="overview" />
        <div className="card"><div className="card-b"><p className="muted">Project not found.</p><Link href="/org/projects" className="btn btn-ghost btn-sm">← Back to projects</Link></div></div>
      </>
    );
  }

  if (loading || !project) {
    return (
      <>
        <ProjectPageHead active="overview" />
        <div className="card"><div className="card-b"><p className="muted">Loading…</p></div></div>
      </>
    );
  }

  const priceRange = formatMoneyRange(
    project.priceMin,
    project.priceMax,
    project.currency,
  );

  // Piece A/C preference blobs — loosely typed, may be null or partial.
  // Specifications are user-labelled rows now; normalizeSpecifications also
  // reads the original fixed-key shape, so projects created before that
  // rework still render their finishes.
  const spec = normalizeSpecifications(project.specifications);
  const specRows = specificationRows(project.specifications);

  const mkt = (project.marketing ?? {}) as {
    adSources?: string[];
    monthlyBudget?: number | null;
    targetCpl?: number | null;
    leadGoal?: number | null;
    landingPageChoice?: string;
    landingPageId?: string;
    landingPageSlug?: string;
    landingPageStatus?: string;
    aiCallingEnabled?: boolean;
    whatsappWelcomeEnabled?: boolean;
    roundRobinEnabled?: boolean;
    aiKnowledgeBaseEnabled?: boolean;
  };
  const hasMarketing = project.marketing != null;
  const onOff = (v: boolean | undefined) => (
    <span className={`badge ${v ? "b-green" : "b-gray"}`}>{v ? "On" : "Off"}</span>
  );

  // A labelled free-text block (landmarks, spec notes) — separated from the
  // chips/tiles above it so it doesn't read as stray grey text.
  const noteBlock = (label: string, text: string, divided: boolean) => (
    <div style={divided ? { marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" } : undefined}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
        {label}
      </div>
      <p style={{ whiteSpace: "pre-line", margin: 0, fontSize: 13, lineHeight: 1.6 }}>{text}</p>
    </div>
  );

  // Configurations = planned mix (UnitType names) ∪ what's actually on units
  // (project.configurations, from the server's live groupBy). The wizard
  // never writes a planned mix, so a wizard project relies on the latter.
  const configLabels = [
    ...new Set([
      ...project.unitTypes.map((u) => u.name),
      ...project.configurations.map((c) => c.label),
    ]),
  ];
  const configuration = configLabels.length > 0 ? configLabels.join(", ") : "—";

  // Any inventory at all — a planned mix, or real units.
  const hasInventory =
    project.unitTypes.length > 0 || project.rollup.unitsCreated > 0;

  const totalLeads = leadCount;

  // Which structural rows exist is derived from the unit template's role
  // fields. No. of towers/blocks, floors/structure, area range and total
  // land area are ordinary default project fields now — rendered generically
  // via customRows below, not hardcoded here.
  const traits = templateTraits(project.unitFieldTemplate ?? []);
  const customRows = (project.projectFieldTemplate ?? []).map((f) => {
    const v = project.customFields?.[f.key];
    const shown =
      v === undefined || v === null || v === ""
        ? "—"
        : typeof v === "boolean"
          ? v ? "Yes" : "No"
          : f.unit ? `${v} ${f.unit}` : String(v);
    return { k: f.label, v: shown };
  });

  const specs: { k: string; v: string; mono?: boolean }[] = [
    { k: "Location", v: project.location || "—" },
    ...(traits.configurations ? [{ k: "Unit configurations", v: configuration }] : []),
    { k: "Price range", v: priceRange },
    ...customRows,
    // Planned figure when a planned mix exists, otherwise the real created
    // count. "—" only when there's no inventory of either kind.
    {
      k: "Total units",
      v: !hasInventory
        ? "—"
        : String(
          project.rollup.totalUnitsPlanned || project.rollup.unitsCreated,
        ),
    },
    {
      k: "Available",
      v: !hasInventory ? "—" : String(project.rollup.unitsAvailable),
    },
    { k: "Expected possession", v: project.possession || "—" },
    { k: "RERA registration no.", v: project.reraId || "—" },
  ];

  return (
    <>
      <ProjectPageHead
        active="overview"
        project={{
          name: project.name,
          status: project.status,
          location: project.location,
          reraId: project.reraId,
          manager: project.manager?.name ?? null,
        }}
        actions={
          canEdit ? (
            <Link href={`/org/projects/${id}/edit`} className="btn btn-ghost">
              <Icon name="edit" size={13} /> Edit
            </Link>
          ) : null
        }
      />

      <div className="grid g-2-1">
        <div className="col gap-18">
          <Reveal delay={1}>
            <div className="media h-280" style={{ position: "relative", overflow: "hidden", borderRadius: "14px" }}>
              {project.coverImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={project.coverImageUrl}
                  alt={`${project.name} cover`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", background: "linear-gradient(135deg, #1e293b, #0f172a)", color: "#fff" }}>
                  <Icon name="camera" size={40} />
                  <span className="cap" style={{ marginTop: 8, fontSize: 16, fontWeight: 700 }}>{project.name}</span>
                </div>
              )}
              <div style={{ position: "absolute", bottom: 12, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={`badge ${project.status === "active" ? "b-green" : "b-gray"}`} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                  {project.status === "active" ? "● Active Project" : "○ Inactive"}
                </span>
                {/* Billing v2: "View only" when the org's plan no longer covers this project (renders nothing otherwise). */}
                <ProjectAccessBadge projectId={project.id} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }} />
                {project.reraId ? (
                  <span className="badge b-violet" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)", fontFamily: "monospace" }}>
                    RERA: {project.reraId}
                  </span>
                ) : null}
              </div>
            </div>
          </Reveal>

          {project.galleryUrls.length > 0 ? (
            <Reveal delay={2}>
              <div className="gallery">
                {project.galleryUrls.map((url) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={url} src={url} alt="" className="thumb media" style={{ objectFit: "cover" }} />
                ))}
              </div>
            </Reveal>
          ) : null}

          {/* Dynamic Inventory & Availability Performance Widget */}
          <Reveal delay={2}>
            <div className="card">
              <div className="card-h">
                <span className="t" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="reports" size={15} /> Inventory &amp; Availability Metrics
                </span>
                <Link className="x brand-link" href={`/org/projects/${id}/units`}>Manage Unit Inventory →</Link>
              </div>
              <div className="card-b col gap-16">
                {/* 4 Key Inventory Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-2, #f8fafc)", border: "1px solid var(--line)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--muted, #64748b)", fontWeight: 600 }}>Total Units</div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                      {project.rollup.totalUnitsPlanned || project.rollup.unitsCreated || "—"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {project.rollup.unitsCreated} configured
                    </div>
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--green, #10b981)", fontWeight: 600 }}>Available</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green, #10b981)", marginTop: 4 }}>
                      {project.rollup.unitsAvailable}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Ready for booking</div>
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--indigo, #6366f1)", fontWeight: 600 }}>Booked / Sold</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--indigo, #6366f1)", marginTop: 4 }}>
                      {project.rollup.unitsBooked}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Confirmed sales</div>
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--amber, #f59e0b)", fontWeight: 600 }}>Blocked / Held</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--amber, #f59e0b)", marginTop: 4 }}>
                      {project.rollup.unitsHeld}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Under token / token lock</div>
                  </div>
                </div>

                {/* Multi-segment Progress Bar */}
                <div>
                  {(() => {
                    const total = project.rollup.unitsCreated > 0 ? project.rollup.unitsCreated : project.rollup.totalUnitsPlanned;
                    const soldPct = total > 0 ? Math.round((project.rollup.unitsBooked / total) * 100) : 0;
                    const heldPct = total > 0 ? Math.round((project.rollup.unitsHeld / total) * 100) : 0;
                    const availPct = Math.max(0, 100 - soldPct - heldPct);
                    return (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                          <span>
                            <strong>{soldPct}%</strong> Sold · <strong>{heldPct}%</strong> Held · <strong>{availPct}%</strong> Available
                          </span>
                          <span style={{ color: "var(--muted)" }}>Total Capacity: {total} Units</span>
                        </div>
                        <div style={{ height: 10, borderRadius: 5, background: "var(--surface-2, #e2e8f0)", overflow: "hidden", display: "flex" }}>
                          <div style={{ width: `${soldPct}%`, background: "var(--indigo, #6366f1)", transition: "width 0.4s" }} title={`Sold: ${soldPct}%`} />
                          <div style={{ width: `${heldPct}%`, background: "var(--amber, #f59e0b)", transition: "width 0.4s" }} title={`Held: ${heldPct}%`} />
                          <div style={{ width: `${availPct}%`, background: "var(--green, #10b981)", transition: "width 0.4s" }} title={`Available: ${availPct}%`} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Project Details & Dimensions Widget */}
          <Reveal delay={2}>
            <div className="card">
              <div className="card-h">
                <span className="t">Overview &amp; Physical Specifications</span>
              </div>
              <div className="card-b">
                <div className="spec-grid">
                  {specs.map((s) => (
                    <div className="sp" key={s.k}>
                      <div className="k">{s.k}</div>
                      <div className={`v${s.mono ? " mono" : ""}`}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Configurations & Floor Plan Breakdown Widget — the `tower` layout's */}
          {traits.configurations ? (
            <Reveal delay={3}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Configurations</span>
                  <Link className="x brand-link" href={`/org/projects/${id}/units`}>Manage inventory →</Link>
                </div>
                <div className="card-b">
                  {configLabels.length === 0 ? (
                    <p className="muted">No configurations yet — add units, or a planned mix, from the Units tab.</p>
                  ) : (
                    <div className="grid g3">
                      {configLabels.map((label) => {
                        const ut = project.unitTypes.find((u) => u.name === label);
                        const act = project.configurations.find((c) => c.label === label);
                        const available = act?.available ?? ut?.availableUnits ?? 0;
                        return (
                          <Link key={label} href={`/org/projects/${id}/units`} className="utype-card">
                            <div className="cover media plan">
                              <Icon name="camera" size={18} />
                              <span className="cap">{label}</span>
                            </div>
                            <div className="info">
                              <b>{label}</b>
                              <div className="muted fs-12-5">
                                {(() => {
                                  const areaField = roleField(project.unitFieldTemplate ?? [], "area");
                                  const priceField = roleField(project.unitFieldTemplate ?? [], "price");
                                  const area = areaField ? ut?.fieldDefaults?.[areaField.key] : null;
                                  const price = priceField ? ut?.fieldDefaults?.[priceField.key] : null;
                                  return [area != null ? `${area} ${project.areaUnit}` : null, price != null ? formatMoney(Number(price), project.currency) : null].filter(Boolean).join(" · ") || (ut ? "—" : "Derived from units");
                                })()}
                              </div>
                              <span className={`badge ${available > 0 ? "b-green" : "b-amber"} mt-8`}>
                                {available} available
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          ) : null}

          {/* Pricing, Commercials & Inclusions Widget */}
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h">
                <span className="t">Commercials, Pricing &amp; Schemes</span>
              </div>
              <div className="card-b col gap-14">
                <div className="spec-grid">
                  <div className="sp">
                    <div className="k">Price range</div>
                    <div className="v">{priceRange}</div>
                  </div>
                  <div className="sp">
                    <div className="k">Price per sqft</div>
                    <div className="v">{project.baseRate ? `${formatMoney(project.baseRate, project.currency)}/sqft` : "—"}</div>
                  </div>
                  <div className="sp">
                    <div className="k">Booking amount</div>
                    <div className="v">{project.bookingAmount ? formatMoney(project.bookingAmount, project.currency) : "—"}</div>
                  </div>
                  <div className="sp">
                    <div className="k">Payment plan</div>
                    <div className="v">{project.paymentPlan || "Standard Milestone"}</div>
                  </div>
                </div>

                {project.priceIncludes && project.priceIncludes.length > 0 ? (
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
                      Price inclusions
                    </div>
                    <div className="row wrap gap-8">
                      {project.priceIncludes.map((inc) => (
                        <span className="chip" key={inc} style={{ background: "rgba(99, 102, 241, 0.08)", borderColor: "rgba(99, 102, 241, 0.2)", color: "var(--indigo, #0f1424)" }}>
                          <Icon name="check" size={11} /> {inc}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {project.offers ? (
                  noteBlock("Current offers / schemes", project.offers, true)
                ) : null}
              </div>
            </div>
          </Reveal>

          {/* Location & Connectivity Hub Widget */}
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h"><span className="t">Location &amp; Connectivity Hub</span></div>
              <div className="card-b col gap-12">
                {project.addressLine || project.locality || project.city ? (
                  <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.5 }}>
                    {[project.addressLine, project.locality, project.city, project.pincode].filter(Boolean).join(", ")}
                  </div>
                ) : null}

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
                    Nearby connectivity
                  </div>
                  <div className="row wrap gap-8">
                    {project.connectivity.length === 0 ? (
                      <span className="muted fs-13">No connectivity details entered.</span>
                    ) : (
                      project.connectivity.map((c) => (
                        <span className="chip" key={c}>{c}</span>
                      ))
                    )}
                  </div>
                </div>

                {project.landmarks
                  ? noteBlock("Key landmarks", project.landmarks, true)
                  : null}
              </div>
            </div>
          </Reveal>

          {/* Amenities Widget */}
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h"><span className="t">Amenities &amp; Lifestyle Features</span></div>
              <div className="card-b row wrap gap-8">
                {project.amenities.length === 0 ? (
                  <span className="muted">None added.</span>
                ) : (
                  project.amenities.map((a) => (
                    <span className="chip" key={a.name}><Icon name="sparkles" size={11} /> {a.name}</span>
                  ))
                )}
              </div>
            </div>
          </Reveal>

          {/* Specifications Widget */}
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h"><span className="t">Construction Finishes &amp; Specifications</span></div>
              <div className="card-b">
                {specRows.length === 0 && !spec.notes ? (
                  <span className="muted">None added.</span>
                ) : (
                  <>
                    {specRows.length > 0 ? (
                      <div className="spec-grid">
                        {specRows.map(([k, v]) => (
                          <div className="sp" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
                        ))}
                      </div>
                    ) : null}
                    {spec.notes
                      ? noteBlock("Additional notes", spec.notes, specRows.length > 0)
                      : null}
                  </>
                )}
              </div>
            </div>
          </Reveal>

          {/* Project-level floor / site plan. Distinct from a unit type's own
              floor plan, which is shown on the Units tab. */}
          {project.floorPlanUrls?.length ? (
            <Reveal delay={3}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Project Floor &amp; Site Plan</span>
                  <span className="x muted">{project.floorPlanUrls.length} plan{project.floorPlanUrls.length > 1 ? "s" : ""}</span>
                </div>
                <div className="card-b">
                  <div className="gallery">
                    {project.floorPlanUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Project floor plan" className="thumb media" style={{ objectFit: "contain", background: "var(--surface-2)" }} />
                      </a>
                    ))}
                  </div>
                  <div className="hint mt-8">The plan for the development as a whole. Individual configurations have their own floor plans.</div>
                </div>
              </div>
            </Reveal>
          ) : null}

          {/* Marketing & Automation Widget */}
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h"><span className="t">Marketing &amp; Lead Automation</span></div>
              <div className="card-b">
                {!hasMarketing ? (
                  <span className="muted">Not configured.</span>
                ) : (
                  <div className="spec-grid">
                    {/* Intentionally hidden: ad-source settings are not implemented yet and may return later. */}
                    {/* <div className="sp"><div className="k">Ad sources</div><div className="v">{mkt.adSources?.length ? mkt.adSources.join(", ") : "—"}</div></div> */}
                    {/* Intentionally hidden: ad budget / CPL / lead-goal targets have no ad-platform
                        integration behind them — same reasoning as Ad sources above. */}
                    {/* <div className="sp"><div className="k">Monthly ad budget</div><div className="v">{formatMoney(mkt.monthlyBudget ?? null, project.currency)}</div></div> */}
                    {/* <div className="sp"><div className="k">Target CPL</div><div className="v">{formatMoney(mkt.targetCpl ?? null, project.currency)}</div></div> */}
                    {/* <div className="sp"><div className="k">Monthly lead goal</div><div className="v">{mkt.leadGoal ? `${mkt.leadGoal} leads` : "—"}</div></div> */}
                    {/* Intentionally hidden: landing page selection here is deferred — see the
                        Website & Landing Page widget elsewhere on this page instead. */}
                    {/* <div className="sp"><div className="k">Landing page</div><div className="v">{mkt.landingPageChoice || "—"}</div></div> */}
                    {/* Intentionally hidden: the backing AI voice calling feature is not implemented yet and may return later. */}
                    {/* <div className="sp"><div className="k">AI voice calling</div><div className="v">{onOff(mkt.aiCallingEnabled)}</div></div> */}
                    {/* Intentionally hidden: the backing WhatsApp auto-welcome feature is not implemented yet and may return later. */}
                    {/* <div className="sp"><div className="k">WhatsApp auto-welcome</div><div className="v">{onOff(mkt.whatsappWelcomeEnabled)}</div></div> */}
                    <div className="sp"><div className="k">Round-robin assignment</div><div className="v">{onOff(mkt.roundRobinEnabled)}</div></div>
                    {/* Intentionally hidden: the backing AI knowledge-base feature is not implemented yet and may return later. */}
                    {/* <div className="sp"><div className="k">AI knowledge base</div><div className="v">{onOff(mkt.aiKnowledgeBaseEnabled)}</div></div> */}
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Right Column / Side Widgets */}
        <div className="col gap-18">
          {/* Landing pages bound to this project — a project can have more than
              one, so this lists them rather than assuming a single page. */}
          <Reveal delay={1}>
            <div className="card">
              <div className="card-h">
                <span className="t" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="globe" size={14} /> Landing pages
                </span>
              </div>
              <div className="card-b col gap-10">
                {landingPagesLoading ? (
                  <span className="muted fs-13">Loading…</span>
                ) : projectLandingPages.length === 0 ? (
                  <p className="muted fs-13" style={{ margin: 0 }}>
                    No landing pages yet for this project. Create one from Landing Pages and bind it here.
                  </p>
                ) : (
                  projectLandingPages.map((lp) => (
                    <div
                      key={lp.id}
                      className="row between"
                      style={{ alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lp.name}
                        </div>
                        <div className="muted fs-12">/p/{lp.slug}</div>
                      </div>
                      <span className={`badge ${LANDING_PAGE_STATUS_BADGE[lp.status]}`} style={{ flexShrink: 0 }}>
                        {LANDING_PAGE_STATUS_LABEL[lp.status]}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delay={1}>
            <div className="card">
              <div className="card-h"><span className="t">Direct Lead Entry</span></div>
              <div className="card-b">
                {canCreateLead ? (
                <>
                <div className="field">
                  <label>Full name <span className="req">*</span></label>
                  <input
                    className="inp"
                    placeholder="Customer name"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    disabled={leadSaving}
                  />
                </div>
                <div className="field">
                  <label>Phone <span className="req">*</span></label>
                  <input
                    className="inp"
                    placeholder="+91 "
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    disabled={leadSaving}
                  />
                </div>
                <div className="row2">
                  <div className="field">
                    <label>Configuration</label>
                    {/* This project's configurations — the planned mix plus any
                        already on its units — not the whole org catalog. */}
                    <select
                      className="inp"
                      value={leadConfig}
                      onChange={(e) => setLeadConfig(e.target.value)}
                      disabled={leadSaving}
                    >
                      <option value="">Select</option>
                      {configLabels.map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Budget</label>
                    <select
                      className="inp"
                      value={leadBudget}
                      onChange={(e) => setLeadBudget(e.target.value)}
                      disabled={leadSaving}
                    >
                      <option value="">Select range</option>
                      {BUDGET_BANDS.map((band) => (
                        <option key={band} value={band}>{band}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Source</label>
                  <select
                    className="inp"
                    value={leadChannel}
                    onChange={(e) => setLeadChannel(e.target.value)}
                    disabled={leadSaving}
                  >
                    {ENQUIRY_CHANNELS.map((channel) => (
                      <option key={channel} value={channel}>{channel}</option>
                    ))}
                  </select>
                </div>
                {leadError ? (
                  <div className="help err mb-8" role="alert"><Icon name="alert" size={13} /> {leadError}</div>
                ) : null}
                {leadToast ? (
                  <div className="help mb-8" role="status">
                    <Icon name="check" size={13} /> {leadToast}{" "}
                    <Link className="brand-link" href={`/org/projects/${id}/leads`}>View leads →</Link>
                  </div>
                ) : null}
                <button
                  className="btn btn-primary btn-block"
                  type="button"
                  onClick={() => void submitLead()}
                  disabled={leadSaving}
                >
                  {leadSaving ? "Creating lead…" : "Submit & Create Lead →"}
                </button>
                </>
                ) : (
                  <div className="muted" style={{ fontSize: 13 }}>
                    You don&apos;t have permission to create leads.
                  </div>
                )}
                {project.brochureUrl ? (
                  <a href={project.brochureUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-block mt-8"><Icon name="download" size={13} /> Download Brochure</a>
                ) : null}
                {project.reraCertificateUrl ? (
                  <a href={project.reraCertificateUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-block mt-8"><Icon name="shield" size={13} /> RERA Certificate</a>
                ) : null}
              </div>
            </div>
          </Reveal>

          {/* Assigned Sales Team Widget */}
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h"><span className="t">Assigned Project Team</span></div>
              <div className="card-b col gap-12">
                {project.manager ? (
                  <div className="u" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="av" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--indigo, #0f1424)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
                      {managerInitials(project.manager.name)}
                    </span>
                    <div>
                      <span className="nm" style={{ fontWeight: 600 }}>{project.manager.name}</span>
                      <br />
                      <span className="sm" style={{ fontSize: 11.5, color: "var(--muted)" }}>Project manager</span>
                    </div>
                  </div>
                ) : (
                  <span className="muted fs-13">No project manager assigned.</span>
                )}
                {salesAgents.map((a) => (
                  <div className="u" key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="av" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface-2, #f1f5f9)", color: "var(--fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
                      {managerInitials(a.name)}
                    </span>
                    <div>
                      <span className="nm" style={{ fontWeight: 600 }}>{a.name}</span>
                      <br />
                      <span className="sm" style={{ fontSize: 11.5, color: "var(--muted)" }}>Sales agent</span>
                    </div>
                  </div>
                ))}
                {salesAgents.length === 0 ? (
                  <span className="muted fs-12-5">No sales agents assigned to this project.</span>
                ) : null}
              </div>
            </div>
          </Reveal>

          {/* Intentionally hidden: booking approval and telecaller visibility are
              not implemented yet and may return later. "Published to website"
              is covered by the real Website & Landing Page card above (which
              reads the same field meaningfully) — showing it again here, next
              to two dead fields, made it look like another decorative toggle. */}
          {/*
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h"><span className="t">Governance &amp; Access</span></div>
              <div className="card-b">
                <div className="spec-grid">
                  <div className="sp"><div className="k">Booking approval</div><div className="v">{onOff(project.requireBookingApproval)}</div></div>
                  <div className="sp"><div className="k">Visible to telecallers</div><div className="v">{onOff(project.visibleToTelecallers)}</div></div>
                  <div className="sp"><div className="k">Published to website</div><div className="v">{onOff(project.publishedToWebsite)}</div></div>
                </div>
              </div>
            </div>
          </Reveal>
          */}
        </div>
      </div>
    </>
  );
}
