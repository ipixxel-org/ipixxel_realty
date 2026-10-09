"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { PermissionAction, SessionUser } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icons";
import { BuildingLogoIcon } from "@/components/brand-logo";
import { INTEGRATIONS, INTEGRATIONS_HREF } from "@/lib/integrations";
import { NotificationsBell } from "./notifications-bell";

type NavItem = {
  href: string;
  icon: string;
  label: string;
  tip: string;
  badge?: string;
  activeMatch?: string[];
};

type NavGroup = {
  grp: string;
  items: NavItem[];
};

type AdminNavUser = SessionUser | null | undefined;

export const NAV_MODULE: Record<string, string> = {
  "/admin-console": "admin_dashboard",
  "/admin-console/organisations": "admin_organisations",
  "/admin-console/roles": "admin_org_roles",
  "/admin-console/admins": "admin_platform_team",
  "/admin-console/templates": "admin_templates",
  "/admin-console/forms": "admin_templates",
  "/admin-console/leads": "admin_leads",
  "/admin-console/org-domains": "admin_domains",
  "/admin-console/subscriptions": "admin_subscriptions",
  // "/admin-console/integrations" has no single module — see canAccessAdminNavItem.
  "/admin-console/marketing": "admin_settings",
  "/admin-console/attribution": "admin_settings",
  "/admin-console/audit-logs": "admin_audit_logs",
  "/admin-console/settings": "admin_settings",
  "/admin-console/support": "admin_support",
  "/admin-console/media": "admin_templates",
  "/admin-console/reports": "admin_dashboard",
};

export const NAV_GROUPS: NavGroup[] = [
  {
    grp: "Overview",
    items: [
      { href: "/admin-console", icon: "dashboard", label: "Dashboard", tip: "Dashboard", activeMatch: ["/admin-console"] },
    ],
  },
  {
    grp: "Organisations",
    items: [
      {
        href: "/admin-console/organisations",
        icon: "building",
        label: "Organisations",
        tip: "Organisations",
        activeMatch: ["/admin-console/organisations", "/admin-console/organisation-detail"],
      },
      { href: "/admin-console/org-domains", icon: "globe", label: "Domains", tip: "Organisation custom domain requests", activeMatch: ["/admin-console/org-domains"] },
      { href: "/admin-console/roles", icon: "lock", label: "Organisation roles", tip: "Default roles and permissions for organisations", activeMatch: ["/admin-console/roles"] },
    ],
  },
  {
    grp: "Platform",
    items: [
      { href: "/admin-console/admins", icon: "users", label: "Platform Team", tip: "Console users and platform roles", activeMatch: ["/admin-console/admins", "/admin-console/platform-roles"] },
    ],
  },
  {
    grp: "Product",
    items: [
      {
        href: "/admin-console/templates",
        icon: "puzzle",
        label: "Templates",
        tip: "Template Management",
        activeMatch: ["/admin-console/templates", "/admin-console/template-detail"],
      },
      {
        href: "/admin-console/forms",
        icon: "document",
        label: "Form Builder",
        tip: "Create and manage forms",
        activeMatch: ["/admin-console/forms"],
      },
      {
        href: "/admin-console/leads",
        icon: "users",
        label: "All Leads",
        tip: "Leads across all organisations",
        activeMatch: ["/admin-console/leads"],
      },
      { href: "/admin-console/subscriptions", icon: "billing", label: "Subscriptions", tip: "Plans and subscriptions", activeMatch: ["/admin-console/subscriptions"] },
      {
        href: "/admin-console/media",
        icon: "document",
        label: "Media Library",
        tip: "Global Media Assets across all Organisations",
        activeMatch: ["/admin-console/media"],
      },
      {
        href: "/admin-console/reports",
        icon: "reports",
        label: "Reports & Analytics",
        tip: "Platform reports & analytics dashboard",
        activeMatch: ["/admin-console/reports"],
      },
    ],
  },
  {
    grp: "Marketing",
    items: [
      {
        href: "/admin-console/marketing",
        icon: "trending",
        label: "Marketing Platforms",
        tip: "Enable ad platforms, Meta App & sync logs",
        activeMatch: ["/admin-console/marketing"],
      },
      {
        href: "/admin-console/attribution",
        icon: "target",
        label: "Lead Attribution",
        tip: "Organisation Labels for lead Source column",
        activeMatch: ["/admin-console/attribution"],
      },
    ],
  },
  {
    grp: "System",
    items: [
      { href: INTEGRATIONS_HREF, icon: "integrations", label: "Integrations", tip: "Email, social login and payment integrations", activeMatch: [INTEGRATIONS_HREF] },
      { href: "/admin-console/audit-logs", icon: "shield", label: "Audit Logs", tip: "Audit Logs", activeMatch: ["/admin-console/audit-logs"] },
      { href: "/admin-console/support", icon: "flag", label: "Support Management", tip: "Every organisation's support tickets", activeMatch: ["/admin-console/support"] },
      { href: "/admin-console/settings", icon: "settings", label: "Settings", tip: "Settings", activeMatch: ["/admin-console/settings"] },
    ],
  },
];

/**
 * Single source of truth for "can this platform console user see this nav
 * item" — shared by the sidebar filter and by pages that must redirect away
 * when the signed-in user lacks view access (e.g. the dashboard landing page).
 */
/** Full Super Admin / unrestricted platform users bypass per-module checks. */
export function isUnrestrictedPlatformUser(user: AdminNavUser): boolean {
  return Boolean(
    user &&
      !user.org_id &&
      (user.platformUnrestricted ||
        user.roleKeys?.includes("super_admin") ||
        // Stale session before refreshPermissions: treat console Super Admin as full access.
        (user.role === "super_admin" &&
          (!user.permissions || Object.keys(user.permissions).length === 0))),
  );
}

export function canAccessAdminNavItem(
  item: NavItem,
  user: AdminNavUser,
  hasPermission: (module: string, action: PermissionAction) => boolean,
): boolean {
  // Full Super Admin / unrestricted platform users see every item.
  if (isUnrestrictedPlatformUser(user)) {
    return true;
  }
  // Integrations groups pages gated by different modules (SMTP → admin_email,
  // Social Login → admin_settings); show it if any live integration is viewable.
  if (item.href === INTEGRATIONS_HREF) {
    return INTEGRATIONS.some((it) => !it.comingSoon && hasPermission(it.permission, "view"));
  }
  // Form Builder shares Templates access — never hide it when Templates is visible.
  if (item.href === "/admin-console/forms") {
    return hasPermission("admin_templates", "view");
  }
  if (item.href === "/admin-console/subscriptions") {
    return hasPermission("admin_subscriptions", "view");
  }
  const moduleKey = NAV_MODULE[item.href];
  if (!moduleKey) return true;
  return hasPermission(moduleKey, "view");
}

/** First nav route (in display order) the signed-in user is allowed to see. */
export function firstAccessibleAdminHref(
  user: AdminNavUser,
  hasPermission: (module: string, action: PermissionAction) => boolean,
): string | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (canAccessAdminNavItem(item, user, hasPermission)) return item.href;
    }
  }
  return null;
}

const CRUMB_MAP: Record<string, string> = {
  "/admin-console": "Dashboard",
  "/admin-console/organisations": "Organisations",
  "/admin-console/roles": "Organisation roles",
  "/admin-console/organisation-detail": "Organisation",
  "/admin-console/admins": "Platform Team",
  "/admin-console/templates": "Templates",
  "/admin-console/forms": "Form Builder",
  "/admin-console/leads": "All Leads",
  "/admin-console/template-detail": "Template",
  "/org-builder": "Builder",
  "/admin-console/org-domains": "Domains",
  "/admin-console/subscriptions": "Subscriptions",
  "/admin-console/integrations": "Integrations",
  "/admin-console/marketing": "Marketing",
  "/admin-console/attribution": "Lead Attribution",
  "/admin-console/audit-logs": "Audit Logs",
  "/admin-console/settings": "Settings",
  "/admin-console/reports": "Reports & Analytics",
  "/admin-console/support": "Support Management",
};

export function SuperAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, accessToken, isLoading: authLoading, hasPermission } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingOrgsBadge, setPendingOrgsBadge] = useState<number | null>(null);

  const adminName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email : "Super Admin";
  const avatarInitials = user?.first_name
    ? `${user.first_name[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase()
    : "SA";

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken || user?.role !== "super_admin") {
      router.replace("/admin-login");
      return;
    }
    // First-login credentials — the forced password change (shared flow with
    // Org users) must complete before the console is usable. The backend
    // blocks every /admin/* call until then; this keeps the UI in step.
    if (user.must_change_password) {
      router.replace("/change-password");
    }
  }, [authLoading, accessToken, user?.role, user?.must_change_password, router]);

  useEffect(() => {
    if (!accessToken || user?.role !== "super_admin") return;
    let cancelled = false;
    apiFetch<{ pending?: number }>("/admin/organisations/summary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .catch(() => null)
      .then((orgSummary) => {
        if (cancelled) return;
        setPendingOrgsBadge(orgSummary?.pending ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.id, user?.role]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
      router.push("/admin-login");
      router.refresh();
    }
  }

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 820) {
      setDrawerOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  };

  const appClass = [
    "app",
    collapsed ? "collapsed" : "",
    drawerOpen ? "drawer-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const crumb =
    CRUMB_MAP[pathname] ??
    CRUMB_MAP[
      Object.keys(CRUMB_MAP)
        .filter((base) => pathname.startsWith(`${base}/`))
        .sort((a, b) => b.length - a.length)[0]
    ] ??
    "Dashboard";

  return (
    <div className={appClass}>
      <aside className="sidebar">
        <div className="s-top">
          <div className="s-logo-wrap" aria-hidden>
            <BuildingLogoIcon size={34} />
          </div>
          <div className="s-name">
            iPixxel Realty<small>Super Admin</small>
          </div>
        </div>
        <Link href="/admin-console/subscriptions" className="s-plan" title="Platform Console">
          <div className="s-plan-inner">
            <Icon name="crown" size={13} className="s-plan-ic" />
            <span>
              Console: <strong>Platform Core</strong>
            </span>
          </div>
          <Icon name="chevron-right" size={12} className="s-plan-arrow" />
        </Link>
        <nav>
          <ul className="nav">
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) =>
                canAccessAdminNavItem(item, user, hasPermission),
              );
              if (items.length === 0) return null;
              return (
              <ul className="nav-group" key={group.grp}>
                <li className="grp">{group.grp}</li>
                {items.map((item) => {
                  const isActive =
                    item.activeMatch?.some((base) => {
                      if (base === "/admin-console") {
                        return pathname === "/admin-console";
                      }
                      return pathname === base || pathname.startsWith(`${base}/`);
                    }) ?? false;
                  const badge =
                    item.href === "/admin-console/organisations"
                      ? (pendingOrgsBadge && pendingOrgsBadge > 0 ? `${pendingOrgsBadge} pending` : undefined)
                      : item.badge;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        data-tip={item.tip}
                        className={isActive ? "active" : ""}
                      >
                        <span className="ic"><Icon name={item.icon as any} size={16} /></span>
                        <span className="lbl">{item.label}</span>
                        {badge ? <span className="badge-n">{badge}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              );
            })}
          </ul>
        </nav>
        <div className="s-foot">
          <div className="side-user">
            <div className="av">{avatarInitials}</div>
            <div className="meta">
              <b>{adminName}</b>
              <span>Super Administrator</span>
            </div>
            <button
              type="button"
              onClick={() => router.push("/admin-console/settings")}
              className="side-arrow-btn"
              title="Console Settings"
              aria-label="Settings"
            >
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setDrawerOpen(false)} />
      <main className="main">
        <header className="topbar">
          <div className="tb-left">
            <button className="burger" onClick={toggleSidebar} aria-label="Toggle menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <span className="tb-chip">Platform</span>
            <div className="crumbs">
              <span className="crumbs-eyebrow">Super Admin</span>
              <b>{crumb}</b>
            </div>
          </div>
          <div className="tb-right" style={{ position: "relative", marginLeft: "auto" }}>
            <NotificationsBell accessToken={accessToken} />
            <Link href="/admin-console/integrations/smtp" className="icon-btn" title="Email & SMTP Settings">
              <Icon name="mail" size={15} />
            </Link>
            <Link href="/admin-console/settings" className="icon-btn" title="Platform Settings">
              <Icon name="settings" size={15} />
            </Link>
            <div style={{ position: "relative" }}>
              <div
                className="tb-avatar"
                title={adminName}
                onClick={() => setProfileOpen((v) => !v)}
              >
                {avatarInitials}
              </div>

              {profileOpen && (
                <div
                  className="tb-profile-menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    width: 230,
                    background: "var(--surface, #ffffff)",
                    borderRadius: 14,
                    border: "1px solid var(--line, #e2e8f0)",
                    boxShadow: "0 20px 40px rgba(15,23,42,0.15)",
                    zIndex: 100,
                    padding: "8px 0",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line, #e2e8f0)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink, #0f172a)" }}>
                      {adminName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted, #64748b)", marginTop: 2 }}>
                      {user?.email || "admin@ipixxelrealty.com"}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span className="badge b-indigo" style={{ fontSize: 10 }}>Super Admin</span>
                    </div>
                  </div>

                  <Link
                    href="/admin-console/settings"
                    onClick={() => setProfileOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 16px",
                      fontSize: 13,
                      color: "var(--ink, #0f172a)",
                      textDecoration: "none",
                    }}
                  >
                    <Icon name="settings" size={14} /> Platform Settings
                  </Link>

                  <Link
                    href="/admin-console/integrations/smtp"
                    onClick={() => setProfileOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 16px",
                      fontSize: 13,
                      color: "var(--ink, #0f172a)",
                      textDecoration: "none",
                    }}
                  >
                    <Icon name="mail" size={14} /> Email &amp; SMTP
                  </Link>

                  <Link
                    href="/admin-console/audit-logs"
                    onClick={() => setProfileOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 16px",
                      fontSize: 13,
                      color: "var(--ink, #0f172a)",
                      textDecoration: "none",
                    }}
                  >
                    <Icon name="shield" size={14} /> Audit Trail
                  </Link>

                  <div style={{ height: 1, background: "var(--line, #e2e8f0)", margin: "6px 0" }} />

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      void handleSignOut();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "9px 16px",
                      fontSize: 13,
                      color: "#ef4444",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <Icon name="logout" size={14} />
                    {isSigningOut ? "Signing out..." : "Sign Out"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
