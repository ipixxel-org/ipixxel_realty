"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SwitchRow, displayName, useOrgUsersList } from "@/components/org/team-fields";
import {
  Field,
  FormActions,
  FormAlert,
  FormGrid,
  FormNote,
  FormPage,
  SelectInput,
  TextArea,
  TextInput,
  formPageStyles,
} from "@/components/forms/form-page";
import { ApiError, getTeam, updateTeam } from "@/lib/api";
import type { TeamDetail, TeamStatus } from "@/lib/types";

export default function EditTeamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const teamId = params?.id as string;

  const { users, loading: usersLoading, error: usersError } = useOrgUsersList();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<TeamStatus>("active");
  const [leadId, setLeadId] = useState("");
  const [region, setRegion] = useState("");
  const [workingHours, setWorkingHours] = useState("");
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
        setRegion(t.region ?? "");
        setWorkingHours(t.workingHours ?? "");
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
        region: region.trim() || null,
        workingHours: workingHours.trim() || null,
        description: description.trim() || null,
      });
      router.push(`/org/teams/${teamId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save changes.");
      setSubmitting(false);
    }
  }

  const detailHref = `/org/teams/${teamId}`;

  if (loading) {
    return (
      <FormPage eyebrow="Teams · Edit" title="Edit team" subtitle="Loading…" backHref="/org/teams" backLabel="Back to Teams">
        <div className="muted">Loading…</div>
      </FormPage>
    );
  }

  if (loadError || !team) {
    return (
      <FormPage
        eyebrow="Teams · Edit"
        title={loadError === "not_found" ? "Team not found" : "Couldn't load this team"}
        subtitle={loadError && loadError !== "not_found" ? loadError : "This team may have been removed."}
        backHref="/org/teams"
        backLabel="Back to Teams"
      >
        <span />
      </FormPage>
    );
  }

  return (
    <FormPage
      eyebrow={`Teams · ${team.name}`}
      title="Edit team"
      subtitle="Update the team's basic details. Members and project access are managed from the team page."
      backHref={detailHref}
      backLabel="Back to team"
    >
      <form
        className={formPageStyles.panel}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) void handleSubmit();
        }}
      >
        <FormAlert message={submitError} />

        <div className="field">
          <SwitchRow
            title="Active"
            description={status === "active" ? "Team is active." : "Team is inactive — hidden from active-team views."}
            checked={status === "active"}
            onToggle={(on) => setStatus(on ? "active" : "inactive")}
          />
        </div>

        <FormGrid>
          <Field htmlFor="te-name" label="Team name *" icon="team">
            <TextInput
              id="te-name"
              icon="team"
              placeholder="Enter team name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            htmlFor="te-lead"
            label="Team lead"
            icon="profile"
            error={usersError ? `Couldn't load org users — ${usersError}` : undefined}
          >
            <SelectInput
              id="te-lead"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              disabled={usersLoading || !!usersError}
              invalid={!!usersError}
            >
              <option value="">
                {usersLoading ? "Loading…" : usersError ? "Couldn't load users" : "No lead assigned"}
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{displayName(u)}</option>
              ))}
            </SelectInput>
          </Field>
        </FormGrid>

        <FormGrid>
          <Field htmlFor="te-region" label="Region / branch" icon="pin">
            <TextInput id="te-region" icon="pin" placeholder="e.g. Mumbai West" value={region} onChange={(e) => setRegion(e.target.value)} />
          </Field>
          <Field htmlFor="te-hours" label="Working hours" icon="clock">
            <TextInput id="te-hours" icon="clock" placeholder="e.g. 10:00 AM – 7:00 PM" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          </Field>
        </FormGrid>

        <Field htmlFor="te-desc" label="Description" icon="document">
          <TextArea id="te-desc" rows={3} placeholder="What does this team do?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div style={{ marginBottom: 20 }}>
        <FormNote title={`${team.memberCount} members · ${team.projectCount} projects`}>
          Members and project access are managed from the team page, not here.
        </FormNote>
        </div>

        <FormActions
          cancelHref={detailHref}
          busy={submitting}
          busyLabel="Saving…"
          submitLabel="Save changes"
          submitIcon="check"
        />
      </form>
    </FormPage>
  );
}
