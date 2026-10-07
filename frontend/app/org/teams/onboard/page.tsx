"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import {
  displayName,
  useOrgRoleOptions,
  useOrgUsersList,
  useTeamsList,
} from "@/components/org/team-fields";
import { createOrgUser, getTeam, setTeamMembers } from "@/lib/api";
import {
  Field,
  FormActions,
  FormAlert,
  FormGrid,
  FormPage,
  PhoneInput,
  SelectInput,
  TextInput,
} from "@/components/forms/form-page";
import type { TeamMemberRoleValue } from "@/lib/types";
import "./onboard.css";

const PHONE_NUMBER_REGEX = /^\+?\d{1,15}$/;

function sanitizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  return digits;
}

export default function OnboardMemberPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetTeamId = searchParams.get("team");

  const { users, loading: usersLoading, error: usersError } = useOrgUsersList();
  const { teams, loading: teamsLoading, error: teamsError } = useTeamsList();
  const orgRoleOptions = useOrgRoleOptions();

  // Step 1: Person Information
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  // Step 2: Role & Placement
  const [orgRole, setOrgRole] = useState("");
  const [teamId, setTeamId] = useState(presetTeamId ?? "");
  const [reportsToId, setReportsToId] = useState("");
  const [teamRole, setTeamRole] = useState<string>("Sales Agent");

  // Step 3: Module Access
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({
    crm: true,
    calling: true,
    whatsapp: true,
    landing: false,
    reports: true,
  });

  // Step 4: Additional Options (collapsible)
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [quickHelpOpen, setQuickHelpOpen] = useState(true);

  // Stepper state
  const [activeStep, setActiveStep] = useState<number>(1);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Active steps completed calculation
  const isStep1Done = firstName.trim() !== "" && lastName.trim() !== "" && email.trim() !== "" && mobile.trim() !== "";
  const isStep2Done = orgRole !== "" && teamId !== "";
  const isStep3Done = Object.values(moduleAccess).some(Boolean);

  const completedStepsCount = [isStep1Done, isStep2Done, isStep3Done].filter(Boolean).length;
  const progressPct = completedStepsCount === 0 ? 25 : Math.round((completedStepsCount / 4) * 100);

  const teamRoleList = ["Team Lead", "Sr. Agent", "Sales Agent", "Telecaller", "Viewer"];

  // Toggle module access
  const toggleModule = (id: string) => {
    setModuleAccess((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Select all modules
  const isAllModulesSelected = Object.values(moduleAccess).every(Boolean);
  const toggleSelectAllModules = () => {
    const nextState = !isAllModulesSelected;
    setModuleAccess({
      crm: nextState,
      calling: nextState,
      whatsapp: nextState,
      landing: nextState,
      reports: nextState,
    });
  };

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
      const fullPhone = `+91${mobile.trim()}`;
      const newUser = await createOrgUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phoneNumber: fullPhone,
        role: orgRole,
      });

      if (teamId) {
        const team = await getTeam(teamId);
        // Map team role string to backend enum
        const mappedRole: TeamMemberRoleValue =
          teamRole === "Team Lead"
            ? "team_lead"
            : teamRole === "Telecaller"
            ? "telecaller"
            : "sales_agent";

        await setTeamMembers(teamId, [
          ...team.members.map((m) => ({ userId: m.id, role: m.role })),
          { userId: newUser.id, role: mappedRole },
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

  return (
    <FormPage
      eyebrow="Teams"
      title="Create / Invite Team Member"
      subtitle="Add a new member to your organisation and give them the right access to tools and projects."
      backHref="/org/teams"
      backLabel="Back to Teams"
    >
    <div className="ob-wrap">
      {/* Stepper Progress Bar */}
      <Reveal delay={2}>
        <div className="ob-stepper">
          <div
            className={`ob-step-item ${activeStep >= 1 ? "active" : ""}`}
            onClick={() => setActiveStep(1)}
          >
            <div className="ob-step-circle">1</div>
            <div className="ob-step-text">
              <span className="ob-step-title">Person Details</span>
              <span className="ob-step-sub">Basic information</span>
            </div>
          </div>

          <div
            className={`ob-step-item ${activeStep >= 2 ? "active" : ""}`}
            onClick={() => setActiveStep(2)}
          >
            <div className="ob-step-circle">2</div>
            <div className="ob-step-text">
              <span className="ob-step-title">Role &amp; Placement</span>
              <span className="ob-step-sub">Assign role and team</span>
            </div>
          </div>

          <div
            className={`ob-step-item ${activeStep >= 3 ? "active" : ""}`}
            onClick={() => setActiveStep(3)}
          >
            <div className="ob-step-circle">3</div>
            <div className="ob-step-text">
              <span className="ob-step-title">Module Access</span>
              <span className="ob-step-sub">Select tools and permissions</span>
            </div>
          </div>

          <div
            className={`ob-step-item ${activeStep >= 4 ? "active" : ""}`}
            onClick={() => setActiveStep(4)}
          >
            <div className="ob-step-circle">4</div>
            <div className="ob-step-text">
              <span className="ob-step-title">Review &amp; Invite</span>
              <span className="ob-step-sub">Confirm and send invite</span>
            </div>
          </div>
        </div>
      </Reveal>

      {submitError ? <FormAlert message={submitError} /> : null}

      {submitted && (
        <div
          className="help"
          style={{
            background: "#ecfdf5",
            color: "#059669",
            border: "1px solid #a7f3d0",
            borderRadius: "10px",
            padding: "12px 16px",
          }}
        >
          ✓ {firstName.trim()} {lastName.trim()} was successfully invited!
        </div>
      )}

      {/* 2-Column Content Grid */}
      <div className="ob-grid">
        {/* Left Form Stack */}
        <div className="ob-form-stack">
          {/* Section 1: Person Information */}
          <Reveal delay={2}>
            <div className="ob-card">
              <div className="ob-card-head">
                <div className="ob-card-head-left">
                  <div className="ob-card-icon blue">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                    </svg>
                  </div>
                  <div className="ob-card-title-group">
                    <h3 className="ob-card-title">Person Information</h3>
                    <p className="ob-card-desc">Enter the team member&apos;s basic details.</p>
                  </div>
                </div>
              </div>

              <FormGrid>
                <Field htmlFor="ob-first" label="First name *" icon="profile">
                  <TextInput
                    id="ob-first"
                    icon="profile"
                    placeholder="e.g. Karan"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </Field>
                <Field htmlFor="ob-last" label="Last name *" icon="profile">
                  <TextInput
                    id="ob-last"
                    icon="profile"
                    placeholder="e.g. Pillai"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </Field>
              </FormGrid>

              <FormGrid>
                <Field htmlFor="ob-email" label="Work email *" icon="mail">
                  <TextInput
                    id="ob-email"
                    icon="mail"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@yourcompany.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field htmlFor="ob-mobile" label="Mobile number *" icon="phone">
                  <PhoneInput
                    id="ob-mobile"
                    prefix="🇮🇳 +91"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(sanitizePhone(e.target.value))}
                  />
                </Field>
              </FormGrid>
            </div>
          </Reveal>

          {/* Section 2: Role & Placement */}
          <Reveal delay={3}>
            <div className="ob-card">
              <div className="ob-card-head">
                <div className="ob-card-head-left">
                  <div className="ob-card-icon green">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="ob-card-title-group">
                    <h3 className="ob-card-title">Role &amp; Placement</h3>
                    <p className="ob-card-desc">Assign a role, team and reporting structure.</p>
                  </div>
                </div>
              </div>

              <FormGrid>
                <Field
                  htmlFor="ob-role"
                  label="Organisation role *"
                  icon="shield"
                  hint="Controls what they can access — same roles as the Users page."
                >
                  <SelectInput id="ob-role" icon="shield" value={orgRole} onChange={(e) => setOrgRole(e.target.value)}>
                    <option value="">Select a role...</option>
                    {orgRoleOptions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field htmlFor="ob-team" label="Team *" icon="team">
                  <SelectInput
                    id="ob-team"
                    icon="team"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    disabled={teamsLoading || !!teamsError}
                  >
                    <option value="">Select team...</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </FormGrid>

              <div className="ob-fields-row">
                <Field
                  htmlFor="ob-reports"
                  label="Reports to"
                  icon="profile"
                  hint="Preview only — there's no 'reports to' field on the backend yet."
                >
                  <SelectInput
                    id="ob-reports"
                    icon="profile"
                    value={reportsToId}
                    onChange={(e) => setReportsToId(e.target.value)}
                    disabled={usersLoading || !!usersError}
                  >
                    <option value="">No one in particular</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {displayName(u)}
                      </option>
                    ))}
                  </SelectInput>
                </Field>

                <Field htmlFor="ob-team-role" label="Team role" note="(optional)" icon="tag">
                  <div className="ob-role-chips" id="ob-team-role" role="radiogroup">
                    {teamRoleList.map((role) => {
                      const isSelected = teamRole === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          className={`ob-role-chip ${isSelected ? "selected" : ""}`}
                          onClick={() => setTeamRole(role)}
                        >
                          <span className="ob-role-radio" />
                          <span>{role}</span>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            </div>
          </Reveal>

          {/* Section 3: Module Access */}
          <Reveal delay={4}>
            <div className="ob-card">
              <div className="ob-card-head">
                <div className="ob-card-head-left">
                  <div className="ob-card-icon teal">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div className="ob-card-title-group">
                    <h3 className="ob-card-title">Module Access</h3>
                    <p className="ob-card-desc">Control which modules this team member can access.</p>
                  </div>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#4b5563",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isAllModulesSelected}
                    onChange={toggleSelectAllModules}
                    style={{ accentColor: "#059669", width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span>Select All</span>
                </label>
              </div>

              {/* Module Cards Grid */}
              <div className="ob-modules-grid">
                {/* Leads CRM */}
                <div className="ob-module-card">
                  <div className="ob-mod-left">
                    <div className="ob-mod-icon" style={{ background: "#ede9fe", color: "#7c3aed" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 21v-7" />
                        <path d="M10 21v-11" />
                        <path d="M16 21v-15" />
                        <path d="M2 21h20" />
                      </svg>
                    </div>
                    <div className="ob-mod-text">
                      <h4 className="ob-mod-title">Leads (CRM)</h4>
                      <p className="ob-mod-desc">Work the sales pipeline</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`tm-switch ${moduleAccess.crm ? "checked" : ""}`}
                    onClick={() => toggleModule("crm")}
                  >
                    <span className="tm-switch-thumb" />
                  </button>
                </div>

                {/* Calling */}
                <div className="ob-module-card">
                  <div className="ob-mod-left">
                    <div className="ob-mod-icon" style={{ background: "#fce7f3", color: "#db2777" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z" />
                      </svg>
                    </div>
                    <div className="ob-mod-text">
                      <h4 className="ob-mod-title">Calling</h4>
                      <p className="ob-mod-desc">Dialer, follow-ups</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`tm-switch ${moduleAccess.calling ? "checked" : ""}`}
                    onClick={() => toggleModule("calling")}
                  >
                    <span className="tm-switch-thumb" />
                  </button>
                </div>

                {/* WhatsApp */}
                <div className="ob-module-card">
                  <div className="ob-mod-left">
                    <div className="ob-mod-icon" style={{ background: "#dcfce7", color: "#16a34a" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>
                    <div className="ob-mod-text">
                      <h4 className="ob-mod-title">WhatsApp</h4>
                      <p className="ob-mod-desc">Inbox &amp; templates</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`tm-switch ${moduleAccess.whatsapp ? "checked" : ""}`}
                    onClick={() => toggleModule("whatsapp")}
                  >
                    <span className="tm-switch-thumb" />
                  </button>
                </div>

                {/* Landing Pages */}
                <div className="ob-module-card">
                  <div className="ob-mod-left">
                    <div className="ob-mod-icon" style={{ background: "#ede9fe", color: "#7c3aed" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                    </div>
                    <div className="ob-mod-text">
                      <h4 className="ob-mod-title">Landing Pages</h4>
                      <p className="ob-mod-desc">Build &amp; publish pages</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`tm-switch ${moduleAccess.landing ? "checked" : ""}`}
                    onClick={() => toggleModule("landing")}
                  >
                    <span className="tm-switch-thumb" />
                  </button>
                </div>

                {/* Reports */}
                <div className="ob-module-card">
                  <div className="ob-mod-left">
                    <div className="ob-mod-icon" style={{ background: "#e0f2fe", color: "#0284c7" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 20V10" />
                        <path d="M12 20V4" />
                        <path d="M6 20v-6" />
                      </svg>
                    </div>
                    <div className="ob-mod-text">
                      <h4 className="ob-mod-title">Reports</h4>
                      <p className="ob-mod-desc">Analytics &amp; performance</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`tm-switch ${moduleAccess.reports ? "checked" : ""}`}
                    onClick={() => toggleModule("reports")}
                  >
                    <span className="tm-switch-thumb" />
                  </button>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Section 4: Additional Options (Collapsible) */}
          <Reveal delay={5}>
            <div className="ob-card">
              <div
                className="ob-card-head"
                style={{ cursor: "pointer" }}
                onClick={() => setAdditionalOpen((prev) => !prev)}
              >
                <div className="ob-card-head-left">
                  <div className="ob-card-icon settings">
                    <Icon name="settings" size={20} />
                  </div>
                  <div className="ob-card-title-group">
                    <h3 className="ob-card-title">Additional Options</h3>
                    <p className="ob-card-desc">Set default settings for the new team member.</p>
                  </div>
                </div>
                <div style={{ transform: additionalOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  <Icon name="chevron-down" size={16} />
                </div>
              </div>

              {additionalOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151" }}>
                    <input type="checkbox" defaultChecked style={{ accentColor: "#059669" }} />
                    <span>Send onboarding welcome email with login credentials</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151" }}>
                    <input type="checkbox" defaultChecked style={{ accentColor: "#059669" }} />
                    <span>Auto-assign default team leads pipeline</span>
                  </label>
                </div>
              )}
            </div>
          </Reveal>

          <FormActions
            cancelHref="/org/teams"
            busy={submitting}
            busyLabel="Adding…"
            submitLabel="Add & send invite"
            submitIcon="user-plus"
            onSubmit={() => void handleSubmit()}
          />
        </div>

        {/* Right Sidebar Widgets */}
        <aside className="ob-sidebar">
          {/* Card 1: Onboarding Progress */}
          <Reveal delay={2}>
            <div className="ob-progress-card">
              <div className="ob-prog-header">
                <span className="ob-prog-title">Onboarding progress</span>
                {/* Circular ring chart */}
                <div className="ob-circular-ring">
                  <svg width="44" height="44" viewBox="0 0 44 44">
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="#f3f4f6"
                      strokeWidth="3.5"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="#059669"
                      strokeWidth="3.5"
                      strokeDasharray="113"
                      strokeDashoffset={113 - (113 * progressPct) / 100}
                      strokeLinecap="round"
                      transform="rotate(-90 22 22)"
                    />
                  </svg>
                  <span className="ob-circular-pct">{progressPct}%</span>
                </div>
              </div>

              <div className="ob-prog-status">
                {completedStepsCount === 0 ? "1 of 4 steps completed" : `${completedStepsCount} of 4 steps completed`}
              </div>

              <div className="ob-prog-bar">
                <div className="ob-prog-bar-fill" style={{ width: `${progressPct}%` }} />
              </div>

              <div className="ob-prog-list">
                <div className={`ob-prog-item ${isStep1Done || completedStepsCount === 0 ? "done" : ""}`}>
                  <span className="ob-prog-item-check">✓</span>
                  <span>Person details</span>
                </div>
                <div className={`ob-prog-item ${isStep2Done ? "done" : ""}`}>
                  <span className="ob-prog-item-check">{isStep2Done ? "✓" : "○"}</span>
                  <span>Role &amp; placement</span>
                </div>
                <div className={`ob-prog-item ${isStep3Done ? "done" : ""}`}>
                  <span className="ob-prog-item-check">{isStep3Done ? "✓" : "○"}</span>
                  <span>Module access</span>
                </div>
                <div className="ob-prog-item">
                  <span className="ob-prog-item-check">○</span>
                  <span>Review &amp; invite</span>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Card 2: Notice Box */}
          <Reveal delay={3}>
            <div className="ob-notice-box">
              <div className="ob-notice-title-row">
                <span>💡</span>
                <span>Invite is sent immediately</span>
              </div>
              <p className="ob-notice-desc">
                A work email and organisation role are enough to invite someone. The checklist above helps you keep track of what to do next.
              </p>
            </div>
          </Reveal>

          {/* Card 3: Quick Help */}
          <Reveal delay={4}>
            <div className="ob-help-card">
              <div
                className="ob-help-header"
                onClick={() => setQuickHelpOpen((prev) => !prev)}
              >
                <div className="ob-help-header-left">
                  <span className="ob-help-icon">?</span>
                  <span>Quick Help</span>
                </div>
                <span style={{ transform: quickHelpOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  <Icon name="chevron-down" size={14} />
                </span>
              </div>

              {quickHelpOpen && (
                <div className="ob-help-list">
                  <div className="ob-help-item">
                    <span>What roles are available?</span>
                    <Icon name="chevron-right" size={14} />
                  </div>
                  <div className="ob-help-item">
                    <span>Can I change access later?</span>
                    <Icon name="chevron-right" size={14} />
                  </div>
                  <div className="ob-help-item">
                    <span>Will they receive an email invite?</span>
                    <Icon name="chevron-right" size={14} />
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </aside>
      </div>
    </div>
    </FormPage>
  );
}
