"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import {
  TeamsSubNav,
  ToggleChips,
  displayName,
  useOrgRoleOptions,
  useOrgUsersList,
  useTeamsList,
} from "@/components/org/team-fields";
import { MODULE_DEFS, ONBOARDING_CHECKLIST, TEAM_MEMBER_ROLES, TEAM_MEMBER_ROLE_LABEL } from "@/lib/teams";
import { createOrgUser, getTeam, setTeamMembers } from "@/lib/api";
import type { TeamMemberRoleValue } from "@/lib/types";

// Mobile number: digits only, an optional single leading "+", at most 15
// digits — the same rule the backend DTO enforces (see CreateOrgUserDto /
// PHONE_NUMBER_REGEX). Sanitising on every keystroke means the field can
// only ever hold an acceptable value.
const PHONE_NUMBER_REGEX = /^\+?\d{1,15}$/;

// De-emphasised as of the Team↔Project pivot — adding an existing user to a
// team now has a real path ("Add existing member" on the team's own page),
// so this "always create a brand-new user" flow is hidden rather than
// removed. Flip back to true (and restore the nav/entry-point links
// commented out alongside this — see team-fields.tsx's TeamsSubNav, and the
// Teams list/detail pages) to fully reinstate it; the rest of this file's
// logic is untouched.
const ONBOARDING_ENABLED = false;

function sanitizePhone(raw: string): string {
  const hasPlus = raw.trimStart().startsWith("+");
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  if (!digits) return hasPlus ? "+" : "";
  return `${hasPlus ? "+" : ""}${digits}`;
}

export default function OnboardMemberPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetTeamId = searchParams.get("team");

  const { users, loading: usersLoading, error: usersError } = useOrgUsersList();
  const { teams, loading: teamsLoading, error: teamsError } = useTeamsList();
  const orgRoleOptions = useOrgRoleOptions();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [teamId, setTeamId] = useState(presetTeamId ?? "");
  const [reportsToId, setReportsToId] = useState("");
  const [teamRole, setTeamRole] = useState<TeamMemberRoleValue>("sales_agent");
  const [orgRole, setOrgRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Preview only — TeamModuleAccess has no backend yet.
  const [enabledModules, setEnabledModules] = useState<Set<string>>(
    () => new Set(MODULE_DEFS.filter((m) => m.key !== "landing").map((m) => m.key)),
  );

  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of ONBOARDING_CHECKLIST) initial[item.id] = item.doneByDefault;
    return initial;
  });

  const doneCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = ONBOARDING_CHECKLIST.length;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const teamRoleOptions = useMemo(
    () => TEAM_MEMBER_ROLES.map((r) => ({ id: r, label: TEAM_MEMBER_ROLE_LABEL[r] })),
    [],
  );

  function toggleModule(key: string) {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleChecklistItem(id: string) {
    setChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function validate(): string | null {
    if (!firstName.trim() || !lastName.trim()) {
      return "First and last name are required.";
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return "Please enter a valid work email address.";
    }
    const trimmedMobile = mobile.trim();
    if (!trimmedMobile) {
      return "Mobile number is required.";
    }
    if (!PHONE_NUMBER_REGEX.test(trimmedMobile)) {
      return "Mobile number must contain digits only (max 15).";
    }
    if (trimmedMobile.replace(/\D/g, "").length < 7) {
      return "Please enter a valid mobile number.";
    }
    if (!orgRole) {
      return "Choose an organisation role — it controls what this person can access.";
    }
    return null;
  }

  async function handleSubmit() {
    const error = validate();
    if (error) {
      setSubmitError(error);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const newUser = await createOrgUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phoneNumber: mobile.trim(),
        role: orgRole,
      });

      if (teamId) {
        const team = await getTeam(teamId);
        await setTeamMembers(teamId, [
          ...team.members.map((m) => ({ userId: m.id, role: m.role })),
          { userId: newUser.id, role: teamRole },
        ]);
      }

      setSubmitted(true);
      setTimeout(() => {
        router.push(teamId ? `/org/teams/${teamId}` : "/org/teams");
      }, 900);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to add member.");
      setSubmitting(false);
    }
  }

  if (!ONBOARDING_ENABLED) {
    return (
      <>
        <div className="page-head reveal in">
          <div>
            <div className="eyebrow"><Icon name="users" size={14} /> Onboarding</div>
            <h1>Onboarding is temporarily unavailable</h1>
            <div className="sub">
              To add someone who already has an account, open a team&apos;s page and use &quot;Add existing
              member&quot;. To create a brand-new account, use Users instead.
            </div>
          </div>
          <div className="actions">
            <Link className="btn btn-primary" href="/org/teams">
              <Icon name="chevron-left" size={14} /> Back to Teams
            </Link>
          </div>
        </div>
        <TeamsSubNav active="onboarding" />
      </>
    );
  }

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="users" size={14} /> Onboarding</div>
          <h1>Onboard a team member</h1>
          <div className="sub">
            Add a person, place them in a team, set their role &amp; access, and run the onboarding checklist.
          </div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/org/teams">✕ Cancel</Link>
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
            <Icon name="check" size={14} /> {submitting ? "Adding…" : "Add & send invite"}
          </button>
        </div>
      </div>

      <TeamsSubNav active="onboarding" />

      <div className="cgrid">
        <div className="card" style={{ padding: 26 }}>
          <div className="sec">
            <div className="lbl"><Icon name="profile" size={15} /> Person</div>
            <div className="row2">
              <div className="field">
                <label>First name <span className="req">*</span></label>
                <input className="inp" placeholder="e.g. Karan" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>Last name <span className="req">*</span></label>
                <input className="inp" placeholder="e.g. Pillai" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Work email <span className="req">*</span></label>
                <input
                  className="inp"
                  type="email"
                  autoComplete="email"
                  placeholder="name@skylinedev.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Mobile <span className="req">*</span></label>
                <input
                  className="inp inp-mono"
                  type="tel"
                  inputMode="numeric"
                  maxLength={16}
                  autoComplete="tel"
                  placeholder="+919876543210"
                  value={mobile}
                  onChange={(e) => setMobile(sanitizePhone(e.target.value))}
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Organisation role <span className="req">*</span></label>
              <select value={orgRole} onChange={(e) => setOrgRole(e.target.value)}>
                <option value="">Select a role…</option>
                {orgRoleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <div className="hint">Controls what they can access — same roles as the Users page.</div>
            </div>
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="team" size={15} /> Placement</div>
            <div className="row2">
              <div className="field">
                <label>Team</label>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={teamsLoading || !!teamsError}>
                  <option value="">
                    {teamsLoading ? "Loading…" : teamsError ? "Couldn't load teams" : "No team yet"}
                  </option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {teamsError ? (
                  <div className="hint" style={{ color: "var(--rose)" }}>Couldn&apos;t load teams — {teamsError}</div>
                ) : null}
              </div>
              <div className="field">
                <label>Reports to</label>
                <select value={reportsToId} onChange={(e) => setReportsToId(e.target.value)} disabled={usersLoading || !!usersError}>
                  <option value="">{usersLoading ? "Loading…" : usersError ? "Couldn't load users" : "No one in particular"}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{displayName(u)}</option>
                  ))}
                </select>
                <div className="hint">Preview only — there&apos;s no "reports to" field on the backend yet.</div>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Team role</label>
              <ToggleChips
                options={teamRoleOptions}
                selected={new Set([teamRole])}
                onToggle={(id) => setTeamRole(id as TeamMemberRoleValue)}
                single
              />
              <div className="hint">Only applied if a team is selected above.</div>
            </div>
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="lock" size={15} /> Access (inherits team defaults)</div>
            <div className="hint" style={{ marginBottom: 10 }}>
              Preview only — module access isn&apos;t saved yet, these toggles have no effect.
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <ToggleChips
                options={MODULE_DEFS.map((m) => ({ id: m.key, label: m.label, icon: m.icon }))}
                selected={enabledModules}
                onToggle={toggleModule}
              />
            </div>
          </div>

          <div className="sec">
            <div className="lbl"><Icon name="check" size={15} /> Onboarding checklist</div>
            {ONBOARDING_CHECKLIST.map((item) => {
              const done = !!checklist[item.id];
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 11,
                    padding: "12px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div
                    onClick={() => toggleChecklistItem(item.id)}
                    role="checkbox"
                    aria-checked={done}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleChecklistItem(item.id);
                      }
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      border: `2px solid ${done ? "var(--green)" : "var(--line-2)"}`,
                      background: done ? "var(--green)" : "transparent",
                      flexShrink: 0,
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "#fff",
                      marginTop: 1,
                    }}
                  >
                    {done ? "✓" : ""}
                  </div>
                  <div>
                    <b style={{ fontSize: 13.5, textDecoration: done ? "line-through" : "none", color: done ? "var(--muted)" : "inherit" }}>
                      {item.label}
                    </b>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{item.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-h"><span className="t">Onboarding progress</span></div>
            <div className="card-b">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <b>{doneCount} of {totalCount} complete</b><span className="muted">{pct}%</span>
              </div>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                Invite is sent immediately; the rest can be completed over the first week.
              </div>
            </div>
          </div>

          <div className="help">
            <Icon name="info" size={15} /> A work email and organisation role are enough to invite someone — the checklist above is just a
            local reminder of what to do next, not something we track for you yet.
          </div>

          {submitted ? (
            <div className="help" style={{ background: "#ecfdf5", borderColor: "#a7f3d0" }}>
              <Icon name="check" size={15} /> {`${firstName.trim()} ${lastName.trim()}`.trim()} was added and an invite email is on its way.
            </div>
          ) : null}

          {submitError ? (
            <div className="help" style={{ background: "#fef2f2", borderColor: "#fecaca", color: "var(--rose)" }}>
              {submitError}
            </div>
          ) : null}

          <button type="button" className="btn btn-primary btn-block" disabled={submitting} onClick={handleSubmit}>
            <Icon name="check" size={14} /> {submitting ? "Adding…" : "Add & send invite"}
          </button>
        </div>
      </div>
    </>
  );
}
