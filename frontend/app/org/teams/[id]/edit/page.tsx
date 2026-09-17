"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { SwitchRow, TeamsSubNav, displayName, useOrgManagersList, useOrgUsersList } from "@/components/org/team-fields";
import { TEAM_MEMBER_ROLE_LABEL, formatWorkingHours, parseWorkingHours } from "@/lib/teams";
import { ApiError, getTeam, updateTeam } from "@/lib/api";
import type { TeamDetail, TeamStatus } from "@/lib/types";

export default function EditTeamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const teamId = params?.id as string;

  // Only used to know each existing member's org-wide role, so the Team
  // Lead options below can exclude org admins — this page has no member
  // picker of its own (membership stays managed from the detail page).
  const { users, loading: usersLoading } = useOrgUsersList();
  const { managers, loading: managersLoading, error: managersError } = useOrgManagersList();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<TeamStatus>("active");
  const [leadId, setLeadId] = useState("");
  const [projectManagerId, setProjectManagerId] = useState("");
  const [region, setRegion] = useState("");
  // 24-hour "HH:mm" values, as <input type="time"> needs — parsed from /
  // formatted back into the single free-text workingHours string this team
  // actually stores (see lib/teams.ts).
  const [workingHoursStart, setWorkingHoursStart] = useState("");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    getTeam(teamId)
      .then((t) => {
        setTeam(t);
        setName(t.name);
        setStatus(t.status);
        setLeadId(t.teamLead?.id ?? "");
        setProjectManagerId(t.projectManager?.id ?? "");
        setRegion(t.region ?? "");
        const { start, end } = parseWorkingHours(t.workingHours);
        setWorkingHoursStart(start);
        setWorkingHoursEnd(end);
        setDescription(t.description ?? "");
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

  // Team lead can only be one of this team's current members — never an
  // org admin, even if one was added as a plain member.
  const teamLeadOptions = useMemo(() => {
    if (!team) return [];
    const roleKeyByUserId = new Map(users.map((u) => [u.id, u.role?.key]));
    return team.members.filter((m) => roleKeyByUserId.get(m.id) !== "admin");
  }, [team, users]);

  // If the saved lead falls out of that list (removed as a member, or an
  // admin who's no longer eligible), clear the selection — but only once
  // the org users fetch (used for the admin-role check) has actually
  // resolved, so a valid lead isn't cleared mid-load.
  useEffect(() => {
    if (!team || usersLoading) return;
    if (leadId && !teamLeadOptions.some((m) => m.id === leadId)) {
      setLeadId("");
    }
  }, [team, usersLoading, leadId, teamLeadOptions]);

  async function handleSubmit() {
    if (!name.trim()) {
      setSubmitError("Team name is required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateTeam(teamId, {
        name: name.trim(),
        status,
        teamLeadId: leadId || null,
        projectManagerId: projectManagerId || null,
        region: region.trim() || null,
        workingHours: formatWorkingHours(workingHoursStart, workingHoursEnd) || null,
        description: description.trim() || null,
      });
      router.push(`/org/teams/${teamId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save changes.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="team" size={14} /> Teams · Edit</div>
          <h1>Loading…</h1>
        </div>
      </div>
    );
  }

  if (loadError || !team) {
    return (
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="team" size={14} /> Teams · Edit</div>
          <h1>{loadError === "not_found" ? "Team not found" : "Couldn't load this team"}</h1>
          {loadError && loadError !== "not_found" ? (
            <div className="sub" style={{ color: "var(--rose)" }}>{loadError}</div>
          ) : null}
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/org/teams"><Icon name="chevron-left" size={14} /> Back to Teams</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Link href={`/org/teams/${teamId}`} style={{ color: "inherit", textDecoration: "none" }}>
              <Icon name="team" size={14} /> {team.name}
            </Link> · Edit
          </div>
          <h1>Edit team</h1>
          <div className="sub">Update the team&apos;s basic details.</div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href={`/org/teams/${teamId}`}>✕ Cancel</Link>
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
            <Icon name="check" size={14} /> {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <TeamsSubNav active="teams" />

      <div className="cgrid">
        <div className="card" style={{ padding: 26 }}>
          <div className="sec">
            <div className="lbl"><Icon name="flag" size={15} /> Basics</div>
            <SwitchRow
              title="Active"
              description={status === "active" ? "Team is active." : "Team is inactive — hidden from active-team views."}
              checked={status === "active"}
              onToggle={(on) => setStatus(on ? "active" : "inactive")}
            />
            <div className="field" style={{ marginTop: 14 }}>
              <label>Team name <span className="req">*</span></label>
              <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="row2">
              <div className="field">
                <label>Team lead</label>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={usersLoading}>
                  <option value="">
                    {usersLoading
                      ? "Loading…"
                      : teamLeadOptions.length === 0
                        ? "No eligible members yet"
                        : "No lead assigned"}
                  </option>
                  {teamLeadOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {TEAM_MEMBER_ROLE_LABEL[m.role]}</option>
                  ))}
                </select>
                <div className="hint">
                  Chosen from this team&apos;s members — org admins aren&apos;t eligible. Add or remove members from
                  the team page.
                </div>
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
                  {team.projectManager && !managers.some((u) => u.id === team.projectManager!.id) ? (
                    <option value={team.projectManager.id}>{team.projectManager.name} (current)</option>
                  ) : null}
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
            </div>
            <div className="row2">
              <div className="field">
                <label>Region / branch</label>
                <input className="inp" value={region} onChange={(e) => setRegion(e.target.value)} />
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
              <textarea className="inp" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-h"><span className="t">This team</span></div>
            <div className="card-b" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Members</span><b>{team.memberCount}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Projects</span><b>{team.projectCount}</b></div>
            </div>
          </div>
          <div className="help">
            <Icon name="info" size={15} /> Members and project access are managed from the team page, not here.
          </div>
          {submitError ? (
            <div className="help" style={{ background: "#fef2f2", borderColor: "#fecaca", color: "var(--rose)" }}>
              {submitError}
            </div>
          ) : null}
          <button type="button" className="btn btn-primary btn-block" disabled={submitting} onClick={handleSubmit}>
            <Icon name="check" size={14} /> {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}
