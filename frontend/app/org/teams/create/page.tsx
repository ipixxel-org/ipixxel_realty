"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import {
  MemberPicker,
  SwitchRow,
  TeamsSubNav,
  displayName,
  isEligibleTeamMember,
  useOrgManagersList,
  useOrgProjectsList,
  useOrgStandaloneUnitsList,
  useOrgUsersList,
  useSingleTeamMembership,
} from "@/components/org/team-fields";
import { MODULE_DEFS, formatWorkingHours } from "@/lib/teams";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { createTeam, setTeamMembers, setTeamProjects, setTeamUnits, updateTeam } from "@/lib/api";

export default function CreateTeamPage() {
  const router = useRouter();
  const { users, loading: usersLoading, error: usersError } = useOrgUsersList();
  const { managers, loading: managersLoading, error: managersError } = useOrgManagersList();
  const { projects, loading: projectsLoading, error: projectsError } = useOrgProjectsList();
  const { units, loading: unitsLoading, error: unitsError } = useOrgStandaloneUnitsList();
  const singleTeamMembership = useSingleTeamMembership();

  const [name, setName] = useState("");
  const [leadId, setLeadId] = useState("");
  const [projectManagerId, setProjectManagerId] = useState("");
  const [region, setRegion] = useState("");
  // 24-hour "HH:mm" values, as <input type="time"> needs — formatted into
  // the single free-text workingHours string on submit (see lib/teams.ts).
  const [workingHoursStart, setWorkingHoursStart] = useState("10:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("19:00");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  // Preview only — TeamModuleAccess has no backend yet, so these toggles
  // aren't sent anywhere on submit.
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({
    leads: true,
    calling: true,
    whatsapp: true,
    landing: false,
    reports: true,
  });
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());
  const [unitIds, setUnitIds] = useState<Set<string>>(new Set());
  const [autoAssign, setAutoAssign] = useState(true);
  const [createChatChannel, setCreateChatChannel] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Admins/super admins already have full org-wide access and are never
  // eligible to be added as a team member (enforced server-side too — see
  // OrgTeamsService.setMembers). Managers stay eligible.
  const eligibleUsers = useMemo(() => users.filter(isEligibleTeamMember), [users]);

  // Team lead can only be nominated from the members already picked above.
  const teamLeadOptions = useMemo(
    () => eligibleUsers.filter((u) => memberIds.has(u.id)),
    [eligibleUsers, memberIds],
  );

  // If the currently-picked lead falls out of that list (deselected as a
  // member, or was never eligible), clear the selection rather than let a
  // stale id sit in state — the server would reject it anyway.
  useEffect(() => {
    if (leadId && !teamLeadOptions.some((u) => u.id === leadId)) {
      setLeadId("");
    }
  }, [leadId, teamLeadOptions]);

  const modulesEnabled = Object.values(moduleAccess).filter(Boolean).length;

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleProject(id: string) {
    setProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleUnit(id: string) {
    setUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setSubmitError("Team name is required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // teamLeadId can't be sent at creation — the server rejects it until
      // the team actually has members (see OrgTeamsService.create). So:
      // create the team, add members, *then* set the lead.
      const team = await createTeam({
        name: name.trim(),
        projectManagerId: projectManagerId || undefined,
        region: region.trim() || undefined,
        workingHours: formatWorkingHours(workingHoursStart, workingHoursEnd) || undefined,
        description: description.trim() || undefined,
      });

      // Members added here have no per-member role picker (that's the
      // onboarding flow's job) — default everyone to Sales Agent; roles can
      // be changed individually from the team detail page later.
      if (memberIds.size > 0) {
        await setTeamMembers(
          team.id,
          [...memberIds].map((userId) => ({ userId, role: "sales_agent" as const })),
        );
      }
      if (leadId) {
        await updateTeam(team.id, { teamLeadId: leadId });
      }
      if (projectIds.size > 0) {
        await setTeamProjects(team.id, [...projectIds]);
      }
      if (unitIds.size > 0) {
        await setTeamUnits(team.id, [...unitIds]);
      }

      router.push(`/org/teams/${team.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create team.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Link href="/org/teams" style={{ color: "inherit", textDecoration: "none" }}>
              <Icon name="team" size={14} /> Teams
            </Link> · Create
          </div>
          <h1>Create a team</h1>
          <div className="sub">
            Name the team, choose its members, nominate a lead from among them, and grant project access.
          </div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/org/teams">✕ Cancel</Link>
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
            <Icon name="check" size={14} /> {submitting ? "Creating…" : "Create team"}
          </button>
        </div>
      </div>

      <TeamsSubNav active="teams" />

      <div className="cgrid">
        <div className="card" style={{ padding: 26 }}>
          <div className="sec">
            <div className="lbl"><Icon name="flag" size={15} /> Basics</div>
            <div className="field">
              <label>Team name <span className="req">*</span></label>
              <input className="inp" placeholder="e.g. Sales Team West" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Project manager</label>
              <select
                value={projectManagerId}
                onChange={(e) => setProjectManagerId(e.target.value)}
                disabled={managersLoading || !!managersError}
              >
                <option value="">
                  {managersLoading ? "Loading…" : managersError ? "Couldn't load managers" : "No project manager assigned"}
                </option>
                {managers.map((u) => (
                  <option key={u.id} value={u.id}>{displayName(u)}</option>
                ))}
              </select>
              {managersError ? (
                <div className="hint" style={{ color: "var(--rose)" }}>Couldn&apos;t load managers — {managersError}</div>
              ) : (
                <div className="hint">Only users with the Manager role can be picked here.</div>
              )}
            </div>
            <div className="row2">
              <div className="field">
                <label>Region / branch</label>
                <input className="inp" placeholder="Ahmedabad West" value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
              <div className="field">
                <label>Working hours</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="time"
                    className="inp"
                    value={workingHoursStart}
                    onChange={(e) => setWorkingHoursStart(e.target.value)}
                  />
                  <span className="muted">–</span>
                  <input
                    type="time"
                    className="inp"
                    value={workingHoursEnd}
                    onChange={(e) => setWorkingHoursEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Description</label>
              <textarea className="inp" rows={2} placeholder="What this team handles…" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="users" size={15} /> Members</div>
            <div className="field">
              <label>Add members</label>
              <MemberPicker
                users={eligibleUsers}
                usersLoading={usersLoading}
                usersError={usersError}
                selected={memberIds}
                onToggle={toggleMember}
                singleTeamMembership={singleTeamMembership}
              />
              <div className="hint">
                Added as Sales Agent by default — change a member&apos;s role from the team page, or onboard
                someone directly with a specific role from the Onboarding tab.
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Team lead</label>
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={usersLoading || !!usersError}>
                <option value="">
                  {teamLeadOptions.length === 0 ? "Pick members above first" : "No lead assigned"}
                </option>
                {teamLeadOptions.map((u) => (
                  <option key={u.id} value={u.id}>{displayName(u)}</option>
                ))}
              </select>
              {usersError ? (
                <div className="hint" style={{ color: "var(--rose)" }}>Couldn&apos;t load org users — {usersError}</div>
              ) : (
                <div className="hint">Chosen from the members added above — org admins aren&apos;t eligible.</div>
              )}
            </div>
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="lock" size={15} /> Module access</div>
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
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="building" size={15} /> Project access</div>
            <div className="hint" style={{ marginBottom: 10 }}>
              Toggle the projects this team should access. Selections are saved when you create the team.
            </div>
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
                  <thead>
                    <tr><th>Project</th><th>Status</th><th>Location</th><th>Price range</th><th>Units</th><th>Access</th></tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td><span className={`badge ${p.status === "active" ? "b-green" : "b-gray"}`}>{p.status === "active" ? "Active" : "Inactive"}</span></td>
                        <td>{p.location ?? "—"}</td>
                        <td>{formatMoneyRange(p.priceMin, p.priceMax, p.currency)}</td>
                        <td>{p.unitCount} unit{p.unitCount === 1 ? "" : "s"} · {p.unitTypeCount} type{p.unitTypeCount === 1 ? "" : "s"}</td>
                        <td>
                          <div
                            className={`switch ${projectIds.has(p.id) ? "on" : ""}`}
                            role="switch"
                            aria-checked={projectIds.has(p.id)}
                            tabIndex={0}
                            onClick={() => toggleProject(p.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") toggleProject(p.id);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="home" size={15} /> Unit access</div>
            <div className="hint" style={{ marginBottom: 10 }}>
              Standalone units only — a unit that belongs to a project follows that project&apos;s access instead. Selections are saved when you create the team.
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
                  <thead>
                    <tr><th>Unit</th><th>Status</th><th>Configuration</th><th>Carpet</th><th>Price</th><th>Access</th></tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id}>
                        <td className="mono">{u.unitNo}</td>
                        <td><span className={`badge ${u.status === "available" ? "b-green" : "b-gray"}`}>{u.status}</span></td>
                        <td>{u.configuration ?? "—"}</td>
                        <td>{u.carpetSqft != null ? `${u.carpetSqft.toLocaleString("en-IN")} sqft` : "—"}</td>
                        <td>{formatMoney(u.price, "INR")}</td>
                        <td>
                          <div
                            className={`switch ${unitIds.has(u.id) ? "on" : ""}`}
                            role="switch"
                            aria-checked={unitIds.has(u.id)}
                            tabIndex={0}
                            onClick={() => toggleUnit(u.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") toggleUnit(u.id);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="refresh" size={15} /> Lead routing</div>
            <div className="hint" style={{ marginBottom: 10 }}>
              Preview only — there&apos;s no lead-routing or Team Chat backend yet, these toggles have no effect.
            </div>
            <SwitchRow
              title="Auto-assign new leads"
              description="Round-robin across members"
              checked={autoAssign}
              onToggle={setAutoAssign}
            />
            <SwitchRow
              title="Create internal chat channel"
              description={`Opens #${slugify(name) || "team-name"} in Team Chat`}
              checked={createChatChannel}
              onToggle={setCreateChatChannel}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-h"><span className="t">Summary</span></div>
            <div className="card-b" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Members</span><b>{memberIds.size} selected</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Modules (preview)</span><b>{modulesEnabled} enabled</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Projects</span><b>{projectIds.size}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Standalone units</span><b>{unitIds.size}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Chat channel (preview)</span><b>{createChatChannel ? "Yes" : "No"}</b></div>
            </div>
          </div>
          {submitError ? (
            <div className="help" style={{ background: "#fef2f2", borderColor: "#fecaca", color: "var(--rose)" }}>
              {submitError}
            </div>
          ) : null}
          <button type="button" className="btn btn-primary btn-block" disabled={submitting} onClick={handleSubmit}>
            <Icon name="check" size={14} /> {submitting ? "Creating…" : "Create team"}
          </button>
        </div>
      </div>
    </>
  );
}

function slugify(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
