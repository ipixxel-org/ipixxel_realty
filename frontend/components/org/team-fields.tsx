"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon, type IconName } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getOrgUnits } from "@/lib/api";
import type { OrgUnitRow, OrgUser, OrgUsersListResponse, ProjectListRow, ProjectsListResponse, SafeOrganisation, Team } from "@/lib/types";

/** Org users, fetched from the real `/org/users` endpoint — Teams has no
 *  user data of its own, so pickers (team lead, members, reports-to) use
 *  whoever already exists in the organisation. */
export function useOrgUsersList() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;
    apiFetch<OrgUsersListResponse>("/org/users?limit=100", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (mounted) {
          setUsers(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load org users.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  return { users, loading, error };
}

/** Org users holding the `manager` role — the candidate list for any
 *  "Project manager" picker (Team's new projectManagerId field here; the
 *  project wizard/edit pages use the same `/org/users?role=manager` query
 *  inline today — not touched by this hook, which only serves Teams). The
 *  role filter is UI convenience only; the actual role requirement is
 *  enforced server-side. */
export function useOrgManagersList() {
  const { accessToken } = useAuth();
  const [managers, setManagers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;
    apiFetch<OrgUsersListResponse>("/org/users?role=manager&limit=100&status=active", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (mounted) {
          setManagers(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load managers.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  return { managers, loading, error };
}

/** Org Settings → Teams "one team per member". Governs whether a member
 *  picker (Create team, or Team detail's "add existing members") blocks
 *  picking someone already on a different team — the "Already in…" badge
 *  itself is shown regardless of this setting. */
export function useSingleTeamMembership() {
  const { accessToken } = useAuth();
  const [singleTeamMembership, setSingleTeamMembership] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<SafeOrganisation>("/org/settings", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((o) => setSingleTeamMembership(o.single_team_membership))
      .catch(() => {});
  }, [accessToken]);

  return singleTeamMembership;
}

/** The org's real projects — used for Project/template access pickers.
 *  Grants themselves are mocked (no Team backend), but the project list
 *  itself is not. */
export function useOrgProjectsList() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<ProjectListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;
    apiFetch<ProjectsListResponse>("/org/projects?limit=100", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (mounted) {
          setProjects(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load projects.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  return { projects, loading, error };
}

/** The org's standalone units (Unit.projectId is null) — the candidate list
 *  for a Team's unit-access picker. A project-bound unit is never offered
 *  here: it inherits its team via the project's own TeamProject assignment
 *  (see TeamUnit's schema comment) instead of a second, possibly-conflicting
 *  direct link. */
export function useOrgStandaloneUnitsList() {
  const { accessToken } = useAuth();
  const [units, setUnits] = useState<OrgUnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;
    getOrgUnits({ standalone: true, limit: 100 })
      .then((res) => {
        if (mounted) {
          setUnits(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load units.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  return { units, loading, error };
}

// Org admins and super admins already have full org-wide access — team
// membership would grant them nothing, so they're never eligible to be
// added as a team member (Managers remain eligible: a manager can
// legitimately be on a team, and Team Leader is chosen from members).
// Enforced server-side too (see OrgTeamsService.setMembers) — this is UI
// convenience, not the source of truth.
const INELIGIBLE_MEMBER_ROLE_KEYS = new Set(['admin', 'super_admin']);

export function isEligibleTeamMember(u: OrgUser): boolean {
  return !u.role || !INELIGIBLE_MEMBER_ROLE_KEYS.has(u.role.key);
}

export function displayName(u: OrgUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
}

const DEFAULT_ORG_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales", label: "Sales" },
  { value: "telecaller", label: "Telecaller" },
];

/** The org's real, org-wide RBAC roles (admin/manager/sales/telecaller, or
 *  any custom roles the org has created) — same source the Users page uses
 *  for its role picker. Completely separate from TeamMemberRole. */
export function useOrgRoleOptions() {
  const { accessToken } = useAuth();
  const [roles, setRoles] = useState(DEFAULT_ORG_ROLE_OPTIONS);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ roles: { key: string; name: string }[] }>("/org/permissions/modules", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (res.roles && res.roles.length > 0) {
          setRoles(res.roles.map((r) => ({ value: r.key, label: r.name })));
        }
      })
      .catch(() => {
        // Keep the default list.
      });
  }, [accessToken]);

  return roles;
}

/** The org's real teams — used by the onboarding page's Team picker. */
export function useTeamsList() {
  const { accessToken } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;
    apiFetch<Team[]>("/org/teams", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (mounted) {
          setTeams(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load teams.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  return { teams, loading, error };
}

const AV_MODIFIERS = ["", "a2", "a3", "a4", "a5"];

export function avClass(seed: string): string {
  const n = seed.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return AV_MODIFIERS[n % AV_MODIFIERS.length];
}

/** Overlapping avatar stack with a "+N" overflow bubble — team cards show
 *  every member without listing each one by name. */
export function AvatarStack({
  people,
  max = 4,
}: {
  people: { id: string; name: string }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  // Only avatars with another avatar/bubble to their right overlap — the
  // trailing one never gets a negative margin, so the parent's `gap` (not
  // cancelled out) leaves real space before whatever follows the stack.
  return (
    <div style={{ display: "flex" }}>
      {shown.map((p, i) => (
        <span
          key={p.id}
          className={`av ${avClass(p.id)}`}
          style={{
            marginRight: i === shown.length - 1 && overflow <= 0 ? 0 : -10,
            boxShadow: "0 0 0 2px var(--surface)",
          }}
          title={p.name}
        >
          {initialsFor(p.name)}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="av" style={{ boxShadow: "0 0 0 2px var(--surface)" }}>
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

/** Cross-page nav shown on every Teams / Team Chat / Onboarding screen. */
export function TeamsSubNav({
  active,
}: {
  active: "teams" | "chat" | "onboarding";
}) {
  return (
    <Reveal delay={1}>
      <div className="tabs">
        <Link href="/org/teams" className={active === "teams" ? "active" : ""}>
          Teams
        </Link>
        <Link
          href="/org/team-chat"
          className={active === "chat" ? "active" : ""}
        >
          Team Chat
        </Link>
        {/* Onboarding tab hidden as of the Team↔Project pivot — "Add
            existing member" on a team's own page covers the common case.
            Commented out, not deleted; /org/teams/onboard still works
            directly, including its own TeamsSubNav render with
            active="onboarding" (which now shows no tab highlighted).
        <Link
          href="/org/teams/onboard"
          className={active === "onboarding" ? "active" : ""}
        >
          Onboarding
        </Link>
        */}
      </div>
    </Reveal>
  );
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A single toggle row with a title/description — module access, project
 *  access, and lead-routing rows all share this shape. */
export function SwitchRow({
  title,
  description,
  checked,
  onToggle,
  ariaLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onToggle: (next: boolean) => void;
  /** Required when `title` isn't a plain string (e.g. an icon + label
   *  fragment) — otherwise the switch loses its accessible name. */
  ariaLabel?: string;
}) {
  return (
    <div className="swrow">
      <div className="tx">
        <b>{title}</b>
        {description ? <div className="muted">{description}</div> : null}
      </div>
      <div
        className={`switch${checked ? " on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        tabIndex={0}
        onClick={() => onToggle(!checked)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(!checked);
          }
        }}
      />
    </div>
  );
}

/** A "⋯" trigger that opens a small action menu, rendered through a portal
 *  so it's never clipped by a scrollable ancestor (e.g. `.tbl-wrap`'s
 *  `overflow-x: auto`, which clips ordinary absolutely-positioned popovers). */
export function RowActionMenu({
  label = "⋯",
  disabled,
  children,
}: {
  label?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 190) });
    };
    updatePos();

    // `mousedown` fires before `click` — closing on mousedown for a click
    // that landed *inside the portaled menu itself* would unmount the menu
    // (and its buttons) before that same click's `click` handler ever gets
    // to run on them. Only outside-the-menu clicks may close it here; the
    // menu items close it themselves via their own onClick.
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{ outline: "none" }}
      >
        {label}
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            // `.org`'s CSS variables (--surface, --line, --sh-lg, ...) are
            // declared on the `.org` class, not `:root` — a plain portal
            // into document.body sits outside that scope and every var()
            // below silently resolves to nothing. Re-declaring the class
            // here is what actually paints the card look.
            <div
              ref={menuRef}
              className="org"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                // `.org` itself sets `min-height: 100vh` (meant for the page
                // shell) — without this override that would leak onto the
                // popover and blow it up to full viewport height.
                minHeight: 0,
                minWidth: 190,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                boxShadow: "var(--sh-lg)",
                padding: 6,
                zIndex: 1000,
              }}
              onClick={() => setOpen(false)}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function RowActionItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "9px 10px",
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: danger ? "var(--rose)" : "var(--ink)",
        fontSize: 13.5,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {icon}
      {children}
    </button>
  );
}

export interface ChipOption {
  id: string;
  label: string;
  /** Shown before the label — e.g. the module's own icon in the Module
   *  access list. Optional; chips with no natural icon (org users,
   *  projects) simply omit it. */
  icon?: IconName;
  /** Muted secondary text shown right after the label (e.g. an org role name) —
   *  informational only, distinct from `badge` below which flags a conflict. */
  subLabel?: string;
  /** Small secondary label shown next to this option (e.g. "Already in Sales West"). */
  badge?: string;
  /** Blocks selecting this option (an already-selected one can still be toggled off). */
  disabled?: boolean;
}

/** Generic chip multi/single-select — mirrors the org catalog's
 *  CatalogOptions look (`.opts`/`.opt`) for pickers backed by real data
 *  (org users, projects) rather than a catalog.
 *
 *  `loading`/`error` are surfaced as their own states rather than folded
 *  into `emptyLabel` — a failed fetch must never render indistinguishably
 *  from a genuine "nothing here yet" empty org. */
export function ToggleChips({
  options,
  selected,
  onToggle,
  single = false,
  loading = false,
  error = null,
  loadingLabel = "Loading…",
  emptyLabel = "Nothing to choose from yet.",
}: {
  options: ChipOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  single?: boolean;
  loading?: boolean;
  error?: string | null;
  loadingLabel?: string;
  emptyLabel?: string;
}) {
  if (error) {
    return (
      <div className="hint" style={{ color: "var(--rose)" }}>
        Couldn&apos;t load this list — {error}
      </div>
    );
  }
  if (loading) {
    return <div className="hint">{loadingLabel}</div>;
  }
  if (options.length === 0) {
    return <div className="hint">{emptyLabel}</div>;
  }
  return (
    <div className="opts" data-single={single || undefined}>
      {options.map((o) => {
        const on = selected.has(o.id);
        const blocked = !on && o.disabled;
        return (
          <span
            key={o.id}
            className={`opt ${single ? "rad " : ""}${on ? "on" : ""}`}
            onClick={() => {
              if (blocked) return;
              onToggle(o.id);
            }}
            style={blocked ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
            title={blocked ? "Already on another team — remove them from it first." : undefined}
          >
            <span className="b">{on ? (single ? "●" : "✓") : ""}</span>
            {o.icon ? <Icon name={o.icon} size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> : null}
            {o.label}
            {o.subLabel ? (
              <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                {o.subLabel}
              </span>
            ) : null}
            {o.badge ? (
              <span
                className="badge b-amber"
                style={{ marginLeft: 6, fontSize: 10.5, verticalAlign: 1 }}
              >
                {o.badge}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** The one existing-org-user member picker — org users as chips, with the
 *  "Already in {team}" badge and (when the org's single-team-membership
 *  setting is on) disabled-until-removed for anyone on a *different* team.
 *  Used by Create team and by Team detail's "Add existing members" panel —
 *  don't build a second version of this list; extend this one. */
export function MemberPicker({
  users,
  usersLoading,
  usersError,
  selected,
  onToggle,
  currentTeamName,
  singleTeamMembership,
}: {
  users: OrgUser[];
  usersLoading: boolean;
  usersError: string | null;
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** This team's own name — excluded from a member's badge/disabled state
   *  so "already on this team" (which is fine) never reads as a conflict. */
  currentTeamName?: string;
  singleTeamMembership: boolean;
}) {
  const options = useMemo(
    () =>
      users
        .filter((u) => u.role?.key !== "admin" && u.role?.key !== "super_admin")
        .map((u) => {
        const otherTeams = currentTeamName ? u.teams.filter((t) => t !== currentTeamName) : u.teams;
        return {
          id: u.id,
          label: displayName(u),
          subLabel: u.role?.name ?? "No role",
          badge: otherTeams.length > 0 ? `Already in ${otherTeams.join(", ")}` : undefined,
          disabled: singleTeamMembership && otherTeams.length > 0,
        };
        }),
    [users, currentTeamName, singleTeamMembership],
  );

  return (
    <ToggleChips
      options={options}
      selected={selected}
      onToggle={onToggle}
      loading={usersLoading}
      error={usersError}
      loadingLabel="Loading org users…"
      emptyLabel="No org users yet — add users in Users first."
    />
  );
}
