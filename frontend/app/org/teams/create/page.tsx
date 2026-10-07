"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import {
  displayName,
  initialsFor,
  useOrgProjectsList,
  useOrgUsersList,
} from "@/components/org/team-fields";
import { createTeam, setTeamMembers, setTeamProjects } from "@/lib/api";
import {
  Field,
  FormActions,
  FormAlert,
  FormGrid,
  FormPage,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/forms/form-page";
import "../teams.css";

interface ModuleConfig {
  id: string;
  name: string;
  desc: string;
  bgColor: string;
  textColor: string;
  icon: "crm" | "phone" | "whatsapp" | "landing" | "reports";
  enabled: boolean;
}

export default function CreateTeamPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { users, loading: usersLoading, error: usersError } = useOrgUsersList();
  const { projects, loading: projectsLoading, error: projectsError } = useOrgProjectsList();

  // Basic Information
  const [name, setName] = useState("");
  const [leadId, setLeadId] = useState("");
  const [region, setRegion] = useState("");
  const [workingHours, setWorkingHours] = useState("10:00 AM – 7:00 PM");
  const [description, setDescription] = useState("");

  // Stepper active tab
  const [activeStep, setActiveStep] = useState<
    "details" | "members" | "modules" | "projects" | "review"
  >("details");

  // Team Members
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  // Automatically add current user as initial member if list is empty
  useEffect(() => {
    if (currentUser?.id && memberIds.size === 0 && users.length > 0) {
      const match = users.find((u) => u.id === currentUser.id);
      if (match) {
        setMemberIds(new Set([match.id]));
      } else if (users.length > 0) {
        // Fallback to first user
        setMemberIds(new Set([users[0].id]));
      }
    }
  }, [currentUser, users]);

  // Module Access
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({
    crm: true,
    calling: true,
    whatsapp: true,
    landing: false,
    reports: true,
  });

  const modulesList: ModuleConfig[] = [
    {
      id: "crm",
      name: "Leads (CRM)",
      desc: "Work the sales pipeline",
      bgColor: "#dbeafe",
      textColor: "#2563eb",
      icon: "crm",
      enabled: moduleAccess.crm,
    },
    {
      id: "calling",
      name: "Calling",
      desc: "Dialer, follow-ups",
      bgColor: "#fce7f3",
      textColor: "#db2777",
      icon: "phone",
      enabled: moduleAccess.calling,
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      desc: "Inbox & templates",
      bgColor: "#dcfce7",
      textColor: "#16a34a",
      icon: "whatsapp",
      enabled: moduleAccess.whatsapp,
    },
    {
      id: "landing",
      name: "Landing Pages",
      desc: "Build & publish campaign pages",
      bgColor: "#ede9fe",
      textColor: "#7c3aed",
      icon: "landing",
      enabled: moduleAccess.landing,
    },
    {
      id: "reports",
      name: "Reports",
      desc: "Performance & analytics",
      bgColor: "#e0f2fe",
      textColor: "#0284c7",
      icon: "reports",
      enabled: moduleAccess.reports,
    },
  ];

  const enabledModulesCount = Object.values(moduleAccess).filter(Boolean).length;

  // Project Access
  const [projectAccessType, setProjectAccessType] = useState<"all" | "selected" | "none">("all");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  // Form submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removeMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedUsers = useMemo(() => {
    return users.filter((u) => memberIds.has(u.id));
  }, [users, memberIds]);

  const availableUsers = useMemo(() => {
    return users.filter((u) => {
      const nameMatch = displayName(u).toLowerCase().includes(memberSearch.toLowerCase());
      return nameMatch;
    });
  }, [users, memberSearch]);

  async function handleSubmit() {
    if (!name.trim()) {
      setSubmitError("Team name is required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      const team = await createTeam({
        name: name.trim(),
        teamLeadId: leadId || undefined,
        region: region.trim() || undefined,
        workingHours: workingHours.trim() || undefined,
        description: description.trim() || undefined,
      });

      if (memberIds.size > 0) {
        await setTeamMembers(
          team.id,
          [...memberIds].map((userId) => ({ userId, role: "sales_agent" as const })),
        );
      }

      if (projectAccessType === "selected" && selectedProjectIds.size > 0) {
        await setTeamProjects(team.id, [...selectedProjectIds]);
      } else if (projectAccessType === "all" && projects.length > 0) {
        await setTeamProjects(
          team.id,
          projects.map((p) => p.id),
        );
      }

      router.push(`/org/teams/${team.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create team.");
      setSubmitting(false);
    }
  }

  return (
    <FormPage
      eyebrow="Teams"
      title="Create a team"
      subtitle="Name the team, set its lead, choose members, and grant project access."
      backHref="/org/teams"
      backLabel="Back to Teams"
    >
    <div className="tm-create-wrap">
      {/* Stepper Tabs Bar */}
      <Reveal delay={2}>
        <div className="tm-stepper-tabs">
          <button
            type="button"
            className={`tm-stepper-item ${activeStep === "details" ? "active" : ""}`}
            onClick={() => setActiveStep("details")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            Team Details
          </button>
          <button
            type="button"
            className={`tm-stepper-item ${activeStep === "members" ? "active" : ""}`}
            onClick={() => setActiveStep("members")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Members
          </button>
          <button
            type="button"
            className={`tm-stepper-item ${activeStep === "modules" ? "active" : ""}`}
            onClick={() => setActiveStep("modules")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Module Access
          </button>
          <button
            type="button"
            className={`tm-stepper-item ${activeStep === "projects" ? "active" : ""}`}
            onClick={() => setActiveStep("projects")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Project Access
          </button>
          <button
            type="button"
            className={`tm-stepper-item ${activeStep === "review" ? "active" : ""}`}
            onClick={() => setActiveStep("review")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            Review
          </button>
        </div>
      </Reveal>

      {submitError ? <FormAlert message={submitError} /> : null}

      {/* Section 1: Basic Information */}
      <Reveal delay={2}>
        <div className="tm-section-card">
          <div className="tm-sec-head">
            <div className="tm-sec-head-left">
              <div className="tm-sec-icon green">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 21h18" />
                  <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                  <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
                </svg>
              </div>
              <div className="tm-sec-title-group">
                <h3 className="tm-sec-title">Basic Information</h3>
                <p className="tm-sec-desc">Set the core details for your team.</p>
              </div>
            </div>
          </div>

          <FormGrid>
            <Field htmlFor="tc-name" label="Team name *" icon="team">
              <TextInput
                id="tc-name"
                icon="team"
                placeholder="e.g. Sales Team West"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field htmlFor="tc-lead" label="Team lead" icon="profile">
              <SelectInput
                id="tc-lead"
                icon="profile"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                disabled={usersLoading || !!usersError}
              >
                <option value="">
                  {usersLoading ? "Loading users…" : "No lead assigned"}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {displayName(u)}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </FormGrid>

          <FormGrid>
            <Field htmlFor="tc-region" label="Region / Branch" icon="pin">
              <TextInput
                id="tc-region"
                icon="pin"
                placeholder="Ahmedabad West"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </Field>
            <Field htmlFor="tc-hours" label="Working hours" icon="clock">
              <SelectInput
                id="tc-hours"
                icon="clock"
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
              >
                <option value="10:00 AM – 7:00 PM">10:00 AM – 7:00 PM</option>
                <option value="9:00 AM – 6:00 PM">9:00 AM – 6:00 PM</option>
                <option value="8:00 AM – 5:00 PM">8:00 AM – 5:00 PM</option>
                <option value="11:00 AM – 8:00 PM">11:00 AM – 8:00 PM</option>
                <option value="24/7 Support">24/7 Support</option>
              </SelectInput>
            </Field>
          </FormGrid>

          <Field
            htmlFor="tc-desc"
            label="Description"
            icon="document"
            hint={`${description.length}/300 characters`}
          >
            <TextArea
              id="tc-desc"
              placeholder="What this team handles..."
              maxLength={300}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Reveal>

      {/* Section 2: Team Members */}
      <Reveal delay={3}>
        <div className="tm-section-card">
          <div className="tm-sec-head">
            <div className="tm-sec-head-left">
              <div className="tm-sec-icon blue">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="tm-sec-title-group">
                <h3 className="tm-sec-title">Team Members</h3>
                <p className="tm-sec-desc">
                  Add team members to this team. You can also assign them specific roles.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="tm-btn-add-member"
              onClick={() => setShowMemberPicker((prev) => !prev)}
            >
              <Icon name="plus" size={14} />
              <span>Add members</span>
            </button>
          </div>

          {/* Selected Members Chips */}
          <div className="tm-members-list">
            {selectedUsers.length > 0 ? (
              selectedUsers.map((u) => (
                <div className="tm-member-tag" key={u.id}>
                  <div className="tm-avatar-badge">{initialsFor(displayName(u))}</div>
                  <span>{displayName(u)}</span>
                  <button
                    type="button"
                    className="tm-tag-remove"
                    title={`Remove ${displayName(u)}`}
                    onClick={() => removeMember(u.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))
            ) : (
              <span style={{ fontSize: 13, color: "#9ca3af" }}>
                No members added yet. Click &quot;+ Add members&quot; to choose members.
              </span>
            )}
          </div>

          {/* Member Picker Dropdown / Box */}
          {showMemberPicker && (
            <div className="tm-picker-box">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="search" size={14} />
                <input
                  type="text"
                  placeholder="Filter members..."
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 13,
                    width: "100%",
                  }}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              <div className="tm-picker-chips">
                {availableUsers.map((u) => {
                  const isSelected = memberIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`tm-picker-chip ${isSelected ? "selected" : ""}`}
                      onClick={() => toggleMember(u.id)}
                    >
                      <div
                        className="tm-avatar-badge"
                        style={{ width: 20, height: 20, fontSize: 9 }}
                      >
                        {initialsFor(displayName(u))}
                      </div>
                      <span>{displayName(u)}</span>
                      {isSelected ? " ✓" : " +"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Reveal>

      {/* Section 3: Module Access */}
      <Reveal delay={4}>
        <div className="tm-section-card">
          <div className="tm-sec-head">
            <div className="tm-sec-head-left">
              <div className="tm-sec-icon purple">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <div className="tm-sec-title-group">
                <h3 className="tm-sec-title">Module Access</h3>
                <p className="tm-sec-desc">Select which modules this team can access.</p>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>
              {enabledModulesCount} of 6 enabled
            </div>
          </div>

          {/* Module Cards Grid */}
          <div className="tm-modules-grid">
            {modulesList.map((mod) => (
              <div className="tm-module-card" key={mod.id}>
                <div className="tm-mod-left">
                  <div
                    className="tm-mod-icon"
                    style={{ background: mod.bgColor, color: mod.textColor }}
                  >
                    {mod.icon === "crm" && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 21v-7" />
                        <path d="M10 21v-11" />
                        <path d="M16 21v-15" />
                        <path d="M2 21h20" />
                      </svg>
                    )}
                    {mod.icon === "phone" && (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z" />
                      </svg>
                    )}
                    {mod.icon === "whatsapp" && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    )}
                    {mod.icon === "landing" && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                    )}
                    {mod.icon === "reports" && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 20V10" />
                        <path d="M12 20V4" />
                        <path d="M6 20v-6" />
                      </svg>
                    )}
                  </div>
                  <div className="tm-mod-text">
                    <h4 className="tm-mod-title">{mod.name}</h4>
                    <p className="tm-mod-desc">{mod.desc}</p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`tm-switch ${mod.enabled ? "checked" : ""}`}
                  role="switch"
                  aria-checked={mod.enabled}
                  onClick={() =>
                    setModuleAccess((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))
                  }
                >
                  <span className="tm-switch-thumb" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Section 4: Project Access */}
      <Reveal delay={5}>
        <div className="tm-section-card">
          <div className="tm-sec-head">
            <div className="tm-sec-head-left">
              <div className="tm-sec-icon orange">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="tm-sec-title-group">
                <h3 className="tm-sec-title">Project Access</h3>
                <p className="tm-sec-desc">Choose which projects this team can access.</p>
              </div>
            </div>

            {/* Radio Pills Group */}
            <div className="tm-radio-group">
              <button
                type="button"
                className={`tm-radio-item ${projectAccessType === "all" ? "active" : ""}`}
                onClick={() => setProjectAccessType("all")}
              >
                <span className="tm-radio-circle" />
                <span>All Projects</span>
              </button>
              <button
                type="button"
                className={`tm-radio-item ${projectAccessType === "selected" ? "active" : ""}`}
                onClick={() => setProjectAccessType("selected")}
              >
                <span className="tm-radio-circle" />
                <span>Selected Projects</span>
              </button>
              <button
                type="button"
                className={`tm-radio-item ${projectAccessType === "none" ? "active" : ""}`}
                onClick={() => setProjectAccessType("none")}
              >
                <span className="tm-radio-circle" />
                <span>No Project Access</span>
              </button>
            </div>
          </div>

          {/* Conditional Notice / Selection Content */}
          {projectAccessType === "all" && (
            <div className="tm-alert-notice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>This team will have access to all current and future projects.</span>
            </div>
          )}

          {projectAccessType === "selected" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Select projects to grant access:
              </div>
              <div className="tm-picker-chips">
                {projects.map((proj) => {
                  const isSelected = selectedProjectIds.has(proj.id);
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      className={`tm-picker-chip ${isSelected ? "selected" : ""}`}
                      onClick={() => toggleProject(proj.id)}
                    >
                      <span>{proj.name}</span>
                      {isSelected ? " ✓" : " +"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {projectAccessType === "none" && (
            <div
              className="tm-alert-notice"
              style={{ background: "#f3f4f6", borderColor: "#e5e7eb", color: "#4b5563" }}
            >
              <Icon name="info" size={16} />
              <span>Members will not have access to any projects by default.</span>
            </div>
          )}
        </div>
      </Reveal>

      <FormActions
        cancelHref="/org/teams"
        busy={submitting}
        busyLabel="Creating…"
        submitLabel="Create team"
        submitIcon="check"
        onSubmit={() => void handleSubmit()}
      />
    </div>
    </FormPage>
  );
}
