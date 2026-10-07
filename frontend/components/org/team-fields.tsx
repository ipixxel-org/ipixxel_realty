"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Reveal } from "@/components/superadmin/reveal";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { OrgUser, OrgUsersListResponse, ProjectListRow, ProjectsListResponse, Team } from "@/lib/types";

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
    // Same list the Users page uses (Users > View) — only roles the caller
    // may hand out, so Admin is offered to org admins only.
    apiFetch<{ key: string; name: string; assignable: boolean }[]>("/org/users/roles", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        const assignable = res.filter((r) => r.assignable);
        if (assignable.length > 0) {
          setRoles(assignable.map((r) => ({ value: r.key, label: r.name })));
        }
      })
      .catch(() => {
        // Keep the default list.
      });
  }, [accessToken]);

  return roles;
}

/** The org's real teams — used by the onboarding page's Team picker.
 *  [DISABLED-TEAMS] /org/teams is not served while Teams is switched off;
 *  only the (disabled) Teams pages still import this. Don't add new callers. */
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

/** Cross-page nav shown on every Teams / Team Chat / Onboarding screen.
 *  [DISABLED-TEAMS] Only the (disabled) Teams pages render this now. */
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
        <Link
          href="/org/teams/onboard"
          className={active === "onboarding" ? "active" : ""}
        >
          Onboarding
        </Link>
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
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onToggle: (next: boolean) => void;
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
        aria-label={typeof title === "string" ? title : undefined}
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
        return (
          <span
            key={o.id}
            className={`opt ${single ? "rad " : ""}${on ? "on" : ""}`}
            onClick={() => onToggle(o.id)}
          >
            <span className="b">{on ? (single ? "●" : "✓") : ""}</span>
            {o.label}
          </span>
        );
      })}
    </div>
  );
}
