"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Reveal } from "@/components/superadmin/reveal";
import { CountUp } from "@/components/superadmin/count-up";
import { Icon } from "@/components/icons";
import { Seg } from "@/components/superadmin/seg";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  MemberPicker,
  RowActionMenu,
  RowActionItem,
  SwitchRow,
  TeamsSubNav,
  initialsFor,
  useOrgProjectsList,
  useOrgStandaloneUnitsList,
  useOrgUsersList,
  useSingleTeamMembership,
} from "@/components/org/team-fields";
import { MODULE_DEFS, ROLE_BADGE_CLASS, TEAM_MEMBER_ROLE_LABEL } from "@/lib/teams";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { ApiError, deleteTeam, getTeam, setTeamMembers, setTeamProjects, setTeamUnits, updateTeam } from "@/lib/api";
import type { TeamDetail } from "@/lib/types";

const TABS = ["Members", "Access & permissions", "Performance", "Activity"] as const;

const DEFAULT_MODULE_ACCESS: Record<string, boolean> = {
  leads: true,
  calling: true,
  whatsapp: true,
  landing: false,
  reports: true,
};

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const teamId = params?.id as string;

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tabIndex, setTabIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(() => {
    setLoading(true);
    getTeam(teamId)
      .then((t) => {
        setTeam(t);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "not_found"
            : err instanceof Error
              ? err.message
              : "Failed to load team.",
        );
      })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const { projects, loading: projectsLoading, error: projectsError } = useOrgProjectsList();
  const { units, loading: unitsLoading, error: unitsError } = useOrgStandaloneUnitsList();

  // --- Access tab: module access + lead-routing are preview-only (no
  // backend). Project access is real.
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>(DEFAULT_MODULE_ACCESS);
  const [autoAssign, setAutoAssign] = useState(true);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (team) setSelectedProjectIds(new Set(team.projects.map((p) => p.id)));
  }, [team?.id]);

  async function toggleProject(id: string) {
    if (!team || savingProjectId) return;
    const next = new Set(selectedProjectIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProjectIds(next);
    setSavingProjectId(id);
    try {
      const rows = await setTeamProjects(team.id, [...next]);
      setTeam((prev) => (prev ? { ...prev, projects: rows, projectCount: rows.length } : prev));
      notify("Project access updated.");
    } catch (err) {
      setSelectedProjectIds(new Set(team.projects.map((project) => project.id)));
      notify(err instanceof Error ? err.message : "Failed to update project access.");
    } finally {
      setSavingProjectId(null);
    }
  }

  // --- Access tab: standalone unit access. Same idempotent-replace shape
  // as project access — a project-bound unit is never offered here, since
  // it inherits its team via the project's own access (see TeamUnit).
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);

  useEffect(() => {
    if (team) setSelectedUnitIds(new Set(team.units.map((u) => u.id)));
  }, [team?.id]);

  async function toggleUnit(id: string) {
    if (!team || savingUnitId) return;
    const next = new Set(selectedUnitIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUnitIds(next);
    setSavingUnitId(id);
    try {
      const rows = await setTeamUnits(team.id, [...next]);
      setTeam((prev) => (prev ? { ...prev, units: rows, unitCount: rows.length } : prev));
      notify("Unit access updated.");
    } catch (err) {
      setSelectedUnitIds(new Set(team.units.map((unit) => unit.id)));
      notify(err instanceof Error ? err.message : "Failed to update unit access.");
    } finally {
      setSavingUnitId(null);
    }
  }

  // --- Members tab: real remove ---
  const [memberBusy, setMemberBusy] = useState<string | null>(null);

  async function removeMember(userId: string) {
    if (!team) return;
    setMemberBusy(userId);
    try {
      const next = team.members.filter((m) => m.id !== userId).map((m) => ({ userId: m.id, role: m.role }));
      const rows = await setTeamMembers(team.id, next);
      // The backend clears teamLeadId if the removed member was the lead
      // (see OrgTeamsService.setMembers) — mirror that locally so the UI
      // doesn't keep showing a lead who's no longer on the team.
      setTeam((prev) =>
        prev
          ? {
              ...prev,
              members: rows,
              memberCount: rows.length,
              teamLead: prev.teamLead?.id === userId ? null : prev.teamLead,
            }
          : prev,
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to remove member.");
    } finally {
      setMemberBusy(null);
    }
  }

  // --- Members tab: add existing org users. Reuses the same picker/rule as
  // Create team (MemberPicker) — never a second implementation. The list
  // excludes anyone already on this team, and setTeamMembers is a full
  // replace (see backend OrgTeamsService.setMembers), so the current
  // roster is always sent back alongside the newly picked ids.
  const { users: allOrgUsers, loading: allUsersLoading, error: allUsersError } = useOrgUsersList();
  const singleTeamMembership = useSingleTeamMembership();
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [newMemberIds, setNewMemberIds] = useState<Set<string>>(new Set());
  const [addingMembers, setAddingMembers] = useState(false);
  const [addMembersError, setAddMembersError] = useState<string | null>(null);

  useEffect(() => {
    setAddPanelOpen(false);
    setNewMemberIds(new Set());
    setAddMembersError(null);
  }, [teamId]);

  const addableUsers = useMemo(() => {
    if (!team) return allOrgUsers;
    const existingIds = new Set(team.members.map((m) => m.id));
    return allOrgUsers.filter(
      (u) => !existingIds.has(u.id) && u.role?.key !== "admin" && u.role?.key !== "super_admin",
    );
  }, [allOrgUsers, team]);

  function toggleNewMember(id: string) {
    setNewMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function closeAddPanel() {
    setAddPanelOpen(false);
    setNewMemberIds(new Set());
    setAddMembersError(null);
  }

  async function addExistingMembers() {
    if (!team || newMemberIds.size === 0) return;
    setAddingMembers(true);
    setAddMembersError(null);
    try {
      const next = [
        ...team.members.map((m) => ({ userId: m.id, role: m.role })),
        ...[...newMemberIds].map((userId) => ({ userId, role: "sales_agent" as const })),
      ];
      const rows = await setTeamMembers(team.id, next);
      const added = newMemberIds.size;
      setTeam((prev) => (prev ? { ...prev, members: rows, memberCount: rows.length } : prev));
      closeAddPanel();
      notify(`Added ${added} member${added === 1 ? "" : "s"}.`);
    } catch (err) {
      setAddMembersError(err instanceof Error ? err.message : "Failed to add members.");
    } finally {
      setAddingMembers(false);
    }
  }

  // --- Status toggle (Quick actions) — activating is harmless and applies
  // immediately; deactivating hides the team from active-team views, so it
  // confirms first, same as delete.
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  async function applyStatus(next: "active" | "inactive") {
    if (!team) return;
    setStatusBusy(true);
    try {
      const updated = await updateTeam(team.id, { status: next });
      setTeam((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setStatusBusy(false);
      setConfirmDeactivate(false);
    }
  }

  function toggleStatus() {
    if (!team) return;
    if (team.status === "active") {
      setConfirmDeactivate(true);
    } else {
      applyStatus("active");
    }
  }

  // --- Delete team ---
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!team) return;
    setDeleting(true);
    try {
      await deleteTeam(team.id);
      router.push("/org/teams");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete team.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loadError === "not_found") {
    return (
      <>
        <div className="page-head reveal in">
          <div>
            <div className="eyebrow"><Icon name="team" size={14} /> Teams · Detail</div>
            <h1>Team not found</h1>
            <div className="sub">This team doesn&apos;t exist — it may have been renamed or removed.</div>
          </div>
          <div className="actions">
            <Link className="btn btn-ghost" href="/org/teams"><Icon name="chevron-left" size={14} /> Back to Teams</Link>
          </div>
        </div>
      </>
    );
  }

  if (loading && !team) {
    return (
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="team" size={14} /> Teams · Detail</div>
          <h1>Loading…</h1>
        </div>
      </div>
    );
  }

  if (loadError || !team) {
    return (
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="team" size={14} /> Teams · Detail</div>
          <h1>Couldn&apos;t load this team</h1>
          <div className="sub" style={{ color: "var(--rose)" }}>{loadError}</div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/org/teams"><Icon name="chevron-left" size={14} /> Back</Link>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Link href="/org/teams" style={{ color: "inherit", textDecoration: "none" }}>
              <Icon name="team" size={14} /> Teams
            </Link> · Detail
          </div>
          <h1>
            {team.name}{" "}
            <span className={`badge ${team.status === "active" ? "b-green" : "b-gray"}`}>
              <span className="dot" style={{ background: team.status === "active" ? "var(--green)" : "var(--faint)" }} />
              {team.status === "active" ? "Active" : "Inactive"}
            </span>
          </h1>
          <div className="sub">
            Team lead: {team.teamLead ? team.teamLead.name : "Not assigned"}
            {" · Project manager: "}{team.projectManager ? team.projectManager.name : "Not assigned"}
            {team.region ? ` · Region: ${team.region}` : ""} · Created{" "}
            {new Date(team.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} ·{" "}
            {team.memberPreviews.length} members
          </div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/org/teams"><Icon name="chevron-left" size={14} /> Back</Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setTabIndex(0);
              setAddPanelOpen(true);
            }}
          >
            <Icon name="users" size={15} /> Add existing member
          </button>
          {/* Onboarding entry point hidden as of the Team↔Project pivot —
              "Add existing member" above covers the common case. Commented
              out, not deleted; /org/teams/onboard still works directly.
          <Link className="btn btn-ghost" href={`/org/teams/onboard?team=${team.id}`}><Icon name="plus" size={15} /> Onboard new member</Link>
          */}
          <Link className="btn btn-primary" href={`/org/teams/${team.id}/edit`}>
            <Icon name="edit" size={14} /> Edit team
          </Link>
        </div>
      </div>

      <TeamsSubNav active="teams" />

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <Reveal delay={1}>
          <div className="stat">
            <div className="top"><span className="label">Members</span><span className="ic ic-indigo"><Icon name="users" size={17} /></span></div>
            <div className="value"><CountUp value={team.memberCount} /></div>
            <div className="delta">on this team</div>
          </div>
        </Reveal>
        <Reveal delay={2}>
          <div className="stat">
            <div className="top"><span className="label">Active leads</span><span className="ic ic-amber"><Icon name="target" size={17} /></span></div>
            <div className="value"><CountUp value={team.activeLeads} /></div>
            <div className="delta">assigned to this team</div>
          </div>
        </Reveal>
        <Reveal delay={3}>
          <div className="stat">
            <div className="top"><span className="label">Conversion</span><span className="ic ic-violet"><Icon name="sparkles" size={17} /></span></div>
            <div className="value"><CountUp value={team.conversionPct} suf="%" /></div>
            <div className="delta">won ÷ decided</div>
          </div>
        </Reveal>
        <Reveal delay={4}>
          <div className="stat">
            <div className="top"><span className="label">Projects</span><span className="ic ic-sky"><Icon name="building" size={17} /></span></div>
            <div className="value"><CountUp value={team.projectCount} /></div>
            <div className="delta">assigned to this team</div>
          </div>
        </Reveal>
      </div>

      <div className="cgrid">
        <Reveal delay={2}>
          <div className="card"><div className="card-b">
            <div style={{ marginBottom: 18 }}>
              <Seg options={[...TABS]} value={tabIndex} onChange={setTabIndex} />
            </div>

            {tabIndex === 0 ? (
              <div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>Member</th><th>Role</th><th>Leads</th><th>Conv.</th><th>Joined</th><th></th></tr>
                    </thead>
                    <tbody>
                      {team.members.length === 0 ? (
                        <tr><td colSpan={6} className="muted">No members yet.</td></tr>
                      ) : (
                        team.members.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <div className="u">
                                <span className="av">{initialsFor(m.name)}</span>
                                <span>
                                  <span className="nm">{m.name}</span>
                                  <br />
                                  <span className="sm muted">{m.email}</span>
                                </span>
                              </div>
                            </td>
                            <td>
                              {/* Org role (real access) and team role (seniority label
                                  on this team) are two separate things — show both
                                  rather than one standing in for the other. */}
                              <div>{m.orgRole?.name ?? "No org role"}</div>
                              <span className={`badge ${ROLE_BADGE_CLASS[m.role]}`} style={{ marginTop: 3, display: "inline-block" }}>
                                {TEAM_MEMBER_ROLE_LABEL[m.role]}
                              </span>
                            </td>
                            <td>{m.activeLeads}</td>
                            <td>{m.conversionPct}%</td>
                            <td className="muted">
                              {new Date(m.joinedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <RowActionMenu label={memberBusy === m.id ? "…" : "⋯"} disabled={memberBusy === m.id}>
                                <RowActionItem onClick={() => router.push(`/org/leads?assignedTo=${m.id}`)}>
                                  View leads
                                </RowActionItem>
                                <RowActionItem danger icon={<Icon name="trash" size={14} />} onClick={() => removeMember(m.id)}>
                                  Remove from team
                                </RowActionItem>
                              </RowActionMenu>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setAddPanelOpen((v) => !v)}>
                    {addPanelOpen ? "✕ Close" : "＋ Add existing member"}
                  </button>
                  {/* Onboarding entry point hidden — commented out, not
                      deleted; /org/teams/onboard still works directly.
                  <Link className="btn btn-ghost btn-sm" href={`/org/teams/onboard?team=${team.id}`}>
                    Onboard a brand-new member
                  </Link>
                  */}
                </div>

                {addPanelOpen ? (
                  <div className="card" style={{ marginTop: 14, background: "var(--surface-2)", boxShadow: "none" }}>
                    <div className="card-b">
                      <div className="field" style={{ marginBottom: 10 }}>
                        <label>Pick existing org users to add</label>
                        <MemberPicker
                          users={addableUsers}
                          usersLoading={allUsersLoading}
                          usersError={allUsersError}
                          selected={newMemberIds}
                          onToggle={toggleNewMember}
                          currentTeamName={team.name}
                          singleTeamMembership={singleTeamMembership}
                        />
                      </div>
                      {addMembersError ? (
                        <div className="hint" style={{ color: "var(--rose)", marginBottom: 10 }}>{addMembersError}</div>
                      ) : null}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={newMemberIds.size === 0 || addingMembers}
                          onClick={addExistingMembers}
                        >
                          {addingMembers
                            ? "Adding…"
                            : `Add ${newMemberIds.size} member${newMemberIds.size === 1 ? "" : "s"}`}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={addingMembers} onClick={closeAddPanel}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tabIndex === 1 ? (
              <div>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6 }}>
                  Module access
                </div>
                <div className="hint" style={{ marginBottom: 10 }}>
                  Preview only — module access isn&apos;t saved yet, these toggles have no effect.
                </div>
                {MODULE_DEFS.map((mod) => (
                  <SwitchRow
                    key={mod.key}
                    title={<><Icon name={mod.icon} size={14} /> {mod.label}</>}
                    ariaLabel={mod.label}
                    description={mod.description}
                    checked={!!moduleAccess[mod.key]}
                    onToggle={(next) => setModuleAccess((prev) => ({ ...prev, [mod.key]: next }))}
                  />
                ))}

                <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", margin: "18px 0 6px" }}>
                  Project access
                </div>
                <div className="hint" style={{ marginBottom: 10 }}>Toggle access to update it immediately.</div>
                {projectsError ? (
                  <div className="hint" style={{ color: "var(--rose)" }}>
                    Couldn&apos;t load projects — {projectsError}
                  </div>
                ) : projectsLoading ? (
                  <div className="hint">Loading projects…</div>
                ) : projects.length === 0 ? (
                  <div className="hint">No projects yet — create one in Projects first.</div>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Project</th><th>Status</th><th>Location</th><th>Price range</th><th>Units</th><th>Access</th></tr></thead>
                      <tbody>
                        {projects.map((p) => (
                          <tr key={p.id}>
                            <td><Link href={`/org/projects/${p.id}`} className="brand-link">{p.name}</Link></td>
                            <td><span className={`badge ${p.status === "active" ? "b-green" : "b-gray"}`}>{p.status === "active" ? "Active" : "Inactive"}</span></td>
                            <td>{p.location ?? "—"}</td>
                            <td>{formatMoneyRange(p.priceMin, p.priceMax, p.currency)}</td>
                            <td>{p.unitCount} unit{p.unitCount === 1 ? "" : "s"} · {p.unitTypeCount} type{p.unitTypeCount === 1 ? "" : "s"}</td>
                            <td><div className={`switch ${selectedProjectIds.has(p.id) ? "on" : ""}`} role="switch" aria-checked={selectedProjectIds.has(p.id)} tabIndex={0} onClick={() => toggleProject(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleProject(p.id); }} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", margin: "18px 0 6px" }}>
                  Unit access
                </div>
                <div className="hint" style={{ marginBottom: 10 }}>
                  Standalone units only — a unit that belongs to a project follows that project&apos;s access instead.
                </div>
                {unitsError ? (
                  <div className="hint" style={{ color: "var(--rose)" }}>
                    Couldn&apos;t load units — {unitsError}
                  </div>
                ) : unitsLoading ? (
                  <div className="hint">Loading units…</div>
                ) : units.length === 0 ? (
                  <div className="hint">No standalone units yet — create one in All Units first.</div>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Unit</th><th>Status</th><th>Configuration</th><th>Carpet</th><th>Price</th><th>Access</th></tr></thead>
                      <tbody>
                        {units.map((u) => (
                          <tr key={u.id}>
                            <td><Link href={`/org/units/${u.id}`} className="brand-link mono">{u.unitNo}</Link></td>
                            <td><span className={`badge ${u.status === "available" ? "b-green" : "b-gray"}`}>{u.status}</span></td>
                            <td>{u.configuration ?? "—"}</td>
                            <td>{u.carpetSqft != null ? `${u.carpetSqft.toLocaleString("en-IN")} sqft` : "—"}</td>
                            <td>{formatMoney(u.price, "INR")}</td>
                            <td><div className={`switch ${selectedUnitIds.has(u.id) ? "on" : ""}`} role="switch" aria-checked={selectedUnitIds.has(u.id)} tabIndex={0} onClick={() => toggleUnit(u.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleUnit(u.id); }} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", margin: "18px 0 6px" }}>
                  Lead routing
                </div>
                <div className="hint" style={{ marginBottom: 10 }}>
                  Preview only — there&apos;s no lead-routing backend yet, this toggle has no effect.
                </div>
                <SwitchRow
                  title="Auto-assign new leads (round-robin)"
                  description="Distribute leads for granted projects evenly across members"
                  checked={autoAssign}
                  onToggle={setAutoAssign}
                />
              </div>
            ) : null}

            {tabIndex === 2 ? (
              <div className="hint">
                Performance tracking isn&apos;t available yet — there&apos;s no link between teams and leads/site
                visits in the backend.
              </div>
            ) : null}

            {tabIndex === 3 ? (
              <div className="hint">No activity feed yet.</div>
            ) : null}
          </div></div>
        </Reveal>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Reveal delay={3}>
            <div className="card">
              <div className="card-h"><span className="t">Team lead</span></div>
              <div className="card-b" style={{ textAlign: "center" }}>
                {team.teamLead ? (
                  <>
                    <span className="av" style={{ width: 56, height: 56, fontSize: 18, borderRadius: 16, margin: "0 auto 8px", display: "inline-flex" }}>
                      {initialsFor(team.teamLead.name)}
                    </span>
                    <div style={{ fontWeight: 700 }}>{team.teamLead.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{team.teamLead.email}</div>
                  </>
                ) : (
                  <>
                    <div className="muted" style={{ marginBottom: 10 }}>No lead assigned</div>
                    <Link className="btn btn-ghost btn-sm" href={`/org/teams/${team.id}/edit`}>Assign a lead</Link>
                  </>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delay={4}>
            <div className="card">
              <div className="card-h"><span className="t">Project manager</span></div>
              <div className="card-b" style={{ textAlign: "center" }}>
                {team.projectManager ? (
                  <>
                    <span className="av" style={{ width: 56, height: 56, fontSize: 18, borderRadius: 16, margin: "0 auto 8px", display: "inline-flex" }}>
                      {initialsFor(team.projectManager.name)}
                    </span>
                    <div style={{ fontWeight: 700 }}>{team.projectManager.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{team.projectManager.email}</div>
                  </>
                ) : (
                  <>
                    <div className="muted" style={{ marginBottom: 10 }}>No project manager assigned</div>
                    <Link className="btn btn-ghost btn-sm" href={`/org/teams/${team.id}/edit`}>Assign a manager</Link>
                  </>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delay={4}>
            <div className="card">
              <div className="card-h"><span className="t">Quick actions</span></div>
              <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    setTabIndex(0);
                    setAddPanelOpen(true);
                  }}
                >
                  <Icon name="users" size={14} /> Add existing member
                </button>
                {/* Onboarding entry point hidden — commented out, not
                    deleted; /org/teams/onboard still works directly.
                <Link className="btn btn-soft btn-block" href={`/org/teams/onboard?team=${team.id}`}>
                  <Icon name="plus" size={14} /> Onboard a brand-new member
                </Link>
                */}
                <Link className="btn btn-soft btn-block" href={`/org/team-chat?team=${team.id}`}>
                  <Icon name="mail" size={14} /> Open team chat
                </Link>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => notify("Exporting reports isn't available yet.")}>
                  <Icon name="download" size={14} /> Export report
                </button>
                <button type="button" className="btn btn-ghost btn-block" disabled={statusBusy} onClick={toggleStatus}>
                  <Icon name={team.status === "active" ? "alert" : "check"} size={14} />{" "}
                  {statusBusy ? "Updating…" : team.status === "active" ? "Deactivate team" : "Activate team"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  style={{ color: "var(--rose)" }}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon name="trash" size={14} /> Delete team
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={5}>
            <div className="card">
              <div className="card-h"><span className="t">Info</span></div>
              <div className="card-b" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Region</span><b>{team.region ?? "—"}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Created</span>
                  <b>{new Date(team.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Working hours</span><b>{team.workingHours ?? "—"}</b></div>
                {team.description ? (
                  <div>
                    <span className="muted">Description</span>
                    <div style={{ marginTop: 4 }}>{team.description}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <ConfirmModal
        open={confirmDeactivate}
        title={`Deactivate "${team.name}"?`}
        message="This hides the team from active-team views. Members and project assignments stay intact and you can reactivate it any time."
        confirmLabel="Deactivate team"
        destructive
        busy={statusBusy}
        onConfirm={() => applyStatus("inactive")}
        onClose={() => !statusBusy && setConfirmDeactivate(false)}
      />

      <ConfirmModal
        open={confirmDelete}
        title={`Delete "${team.name}"?`}
        message="This permanently removes the team, its member list and project assignments. This can't be undone."
        confirmLabel="Delete team"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
      />

      {toast ? (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}>
          <div className="card" style={{ padding: "12px 16px", boxShadow: "var(--sh-lg)" }}>{toast}</div>
        </div>
      ) : null}
    </>
  );
}
