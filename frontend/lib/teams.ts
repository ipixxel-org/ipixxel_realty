// Shared Teams constants. Teams themselves, members and project
// assignments are real (wired to /org/teams). Module access below has no
// backend yet (TeamModuleAccess is intentionally untouched) — those toggles
// are preview-only until that's built.

import type { IconName } from "@/components/icons";
import type { TeamMemberRoleValue } from "@/lib/types";

// Matches the backend's TeamMemberRole enum exactly (access schema) — this
// is the canonical per-member seniority label, fully separate from the
// org-wide Role/RBAC system (OrgUserRole). "telecaller" exists
// independently in both by coincidence only; never map between them.
export const TEAM_MEMBER_ROLES: TeamMemberRoleValue[] = [
  "team_lead",
  "sr_agent",
  "sales_agent",
  "telecaller",
  "viewer",
];

export const TEAM_MEMBER_ROLE_LABEL: Record<TeamMemberRoleValue, string> = {
  team_lead: "Team Lead",
  sr_agent: "Sr. Agent",
  sales_agent: "Sales Agent",
  telecaller: "Telecaller",
  viewer: "Viewer",
};

export const ROLE_BADGE_CLASS: Record<TeamMemberRoleValue, string> = {
  team_lead: "b-violet",
  sr_agent: "b-indigo",
  sales_agent: "b-sky",
  telecaller: "b-teal",
  viewer: "b-gray",
};

export interface ModuleDef {
  key: string;
  label: string;
  icon: IconName;
  description: string;
}

/** Module access catalog — matches the org's real module set closely, but
 *  there's no backend wiring behind these toggles yet (TeamModuleAccess is
 *  out of scope). Preview-only until that's built. */
export const MODULE_DEFS: ModuleDef[] = [
  { key: "leads", label: "Leads (CRM)", icon: "crm", description: "Work the sales pipeline" },
  { key: "calling", label: "Calling", icon: "phone", description: "Dialler, dispositions, follow-ups" },
  { key: "whatsapp", label: "WhatsApp", icon: "mail", description: "Inbox & templates" },
  { key: "landing", label: "Landing Pages", icon: "landing", description: "Build & publish campaign pages" },
  { key: "reports", label: "Reports", icon: "reports", description: "Performance & source analytics" },
];

// `Team.workingHours` stays a single free-text column (e.g. "10:00 AM –
// 7:00 PM") — no schema change here. The Create/Edit forms just present it
// through two <input type="time"> pickers instead of a raw text box; these
// two helpers are the only place that round-trips between the 24-hour
// "HH:mm" values a time input needs and that display string.

function to24Hour(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const period = m[3].toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

function to12Hour(hhmm: string): string | null {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${period}`;
}

/** Display string ("10:00 AM – 7:00 PM") -> the two time inputs' values.
 *  A value that doesn't match that shape (e.g. old free-typed text from
 *  before this was a picker) comes back blank rather than guessed at. */
export function parseWorkingHours(value: string | null | undefined): { start: string; end: string } {
  const [startText, endText] = (value ?? "").split(/[–-]/).map((p) => p.trim());
  return {
    start: (startText && to24Hour(startText)) || "",
    end: (endText && to24Hour(endText)) || "",
  };
}

/** The two time inputs' values -> the display string that's actually stored. */
export function formatWorkingHours(start: string, end: string): string {
  const s = start ? to12Hour(start) : null;
  const e = end ? to12Hour(end) : null;
  if (s && e) return `${s} – ${e}`;
  return s ?? e ?? "";
}

export interface ChecklistItemDef {
  id: string;
  label: string;
  description: string;
  doneByDefault: boolean;
}

/** Local-only onboarding checklist — a workflow aid for the admin running
 *  through onboarding steps, not a persisted record. */
export const ONBOARDING_CHECKLIST: ChecklistItemDef[] = [
  { id: "invite", label: "Send email invite & set password", description: "Auto-sent to work email", doneByDefault: true },
  { id: "assign", label: "Assign to team & role", description: "Places member in pipeline routing", doneByDefault: true },
  { id: "whatsapp", label: "Add to WhatsApp Business number", description: "So they can reply in the shared inbox", doneByDefault: false },
  { id: "calling", label: "Assign calling credits & extension", description: "Dialler access + monthly minutes", doneByDefault: false },
  { id: "knowledge", label: "Share product knowledge base", description: "Project decks, price sheets, scripts", doneByDefault: false },
  { id: "starter-leads", label: "Assign 5 starter leads", description: "Warm-up leads to practise the flow", doneByDefault: false },
  { id: "training", label: "Book training call with team lead", description: "30-min CRM & process walkthrough", doneByDefault: false },
];
