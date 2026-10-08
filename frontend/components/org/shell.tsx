"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LeadStagesProvider } from "@/lib/lead-stages";
import { dashboardPathFor } from "@/lib/mock/sessions";
import { Icon, type IconName } from "@/components/icons";
import { BuildingLogoIcon } from "@/components/brand-logo";
import {
  getOrgBilling,
  getOrgNotifications,
  getOrgUnreadNotifications,
  markAllOrgNotificationsRead,
  markOrgNotificationRead,
} from "@/lib/api";
import type { OrgBillingSummary, OrgNotification, PermissionAction } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { SETTINGS_ACTIONS } from "@/lib/permissions";
import { TEAM_CHAT_OPEN_EVENT, TeamChatProvider, useTeamChat } from "@/lib/team-chat/context";
import { isChatHost } from "@/lib/team-chat/socket";
import {
  applyThemeVariables,
  resetThemeVariables,
  ORG_THEME_CHANGE_EVENT,
} from "@/components/global-theme-provider";

type NavItem = {
  href: string;
  icon: IconName;
  label: string;
  tip: string;
};

type NavGroup = {
  grp: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    grp: "Overview",
    items: [{ href: "/org", icon: "dashboard", label: "Dashboard", tip: "Dashboard" }],
  },
  {
    grp: "Sales",
    items: [
      { href: "/org/leads", icon: "target", label: "Lead Center", tip: "Lead Center" },
      { href: "/org/projects", icon: "building", label: "Projects", tip: "Projects" },
      // TODO: Sales Agents module hidden from the sidebar (not needed for now) — uncomment to bring it back.
      // { href: "/org/sales-agents", icon: "users", label: "Sales Agents", tip: "Sales Agents" },
      { href: "/org/reports", icon: "reports", label: "Reports & Analytics", tip: "Reports & Analytics" },
    ],
  },
  {
    grp: "Marketing",
    items: [
      { href: "/org/marketing", icon: "trending", label: "Marketing Dashboard", tip: "Marketing Dashboard" },
      { href: "/org/marketing/apps", icon: "integrations", label: "Connected Apps", tip: "Connected Apps" },
      { href: "/org/marketing/campaigns", icon: "flag", label: "Campaigns", tip: "Campaigns" },
      { href: "/org/marketing/sources", icon: "target", label: "Lead Sources", tip: "Lead Sources" },
      { href: "/org/marketing/utm", icon: "link", label: "UTM Tracking", tip: "UTM Tracking" },
    ],
  },
  // Calling and WhatsApp are switched off (their routes render <ComingSoon/>).
  // {
  //   grp: "Communication",
  //   items: [
  //     { href: "/org/calling", icon: "phone", label: "Calling", tip: "Calling" }, // [DISABLED-CALLING]
  //     { href: "/org/whatsapp", icon: "mail", label: "WhatsApp", tip: "WhatsApp" }, // [DISABLED-WHATSAPP]
  //   ],
  // },
  {
    grp: "Website",
    items: [
      { href: "/org/landing-pages", icon: "document", label: "Landing Pages", tip: "Landing Pages" },
      { href: "/org/templates", icon: "puzzle", label: "Templates", tip: "Templates" },
      { href: "/org/forms", icon: "document", label: "Lead Forms", tip: "Lead Forms" },
      { href: "/org/media", icon: "document", label: "Media Library", tip: "Central Media & Assets Repository" },
    ],
  },
  {
    grp: "Team",
    items: [
      // { href: "/org/teams", icon: "team", label: "Teams", tip: "Teams" }, // [DISABLED-TEAMS]
      { href: "/org/team-chat", icon: "mail", label: "Team Chat", tip: "Team Chat" },
      { href: "/org/users", icon: "profile", label: "Users", tip: "Users" },
      { href: "/org/roles-permissions", icon: "lock", label: "Roles & Permissions", tip: "Roles & Permissions" },
    ],
  },
  {
    grp: "System",
    items: [
      { href: "/org/settings", icon: "settings", label: "Settings", tip: "Organisation Settings" },
      { href: "/org/support", icon: "flag", label: "Support & Help", tip: "Support & Help" },
    ],
  },
];

type PermissionCheck = (module: string, action: PermissionAction) => boolean;

/** Whether a sidebar entry is visible to the current user. */
export function isOrgNavItemAllowed(
  href: string,
  hasPermission: PermissionCheck,
): boolean {
  if (href === "/org") return hasPermission("dashboard", "view");
  if (href.startsWith("/org/leads")) return hasPermission("crm", "view");
  if (href.startsWith("/org/projects")) return hasPermission("projects", "view");
  // if (href.startsWith("/org/calling")) return hasPermission("calling", "view"); // [DISABLED-CALLING]
  // if (href.startsWith("/org/whatsapp")) return hasPermission("whatsapp", "view"); // [DISABLED-WHATSAPP]
  if (href.startsWith("/org/landing-pages")) return hasPermission("landing_pages", "view");
  if (href.startsWith("/org/templates")) return hasPermission("templates", "view");
  if (href.startsWith("/org/media")) return hasPermission("websites", "view");
  if (href.startsWith("/org/forms")) return hasPermission("forms", "view");
  // Sales Agents is hidden and no longer a permission module — kept only so
  // the commented-out nav item above still resolves if it is restored.
  if (href.startsWith("/org/sales-agents")) return hasPermission("sales_agents", "view");
  if (href.startsWith("/org/reports")) return hasPermission("crm", "view") || hasPermission("dashboard", "view");
  if (href.startsWith("/org/marketing") || href.startsWith("/org/integrations")) {
    return hasPermission("crm", "view") || hasPermission("integrations", "view");
  }
  // if (href.startsWith("/org/teams")) return hasPermission("teams", "view"); // [DISABLED-TEAMS]
  // Team Chat has its own `team_chat` module (added to the catalog in the
  // chat rebuild). Until then the key is unknown, which org admins pass
  // (unrestricted) and every other role fails.
  if (href.startsWith("/org/team-chat")) return hasPermission("team_chat", "view");
  if (href.startsWith("/org/users")) return hasPermission("users", "view");
  if (href.startsWith("/org/roles-permissions")) return hasPermission("roles_permissions", "view");
  if (href.startsWith("/org/settings")) return hasPermission("settings", "view");
  if (href.startsWith("/org/support")) return hasPermission("support", "view");
  return false;
}

/** First sidebar page (other than the Dashboard) the user may open, if any. */
export function firstAllowedOrgPath(
  hasPermission: PermissionCheck,
): string | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href !== "/org" && isOrgNavItemAllowed(item.href, hasPermission)) {
        return item.href;
      }
    }
  }
  return null;
}

const CRUMB_MAP: Record<string, string> = {
  "/org": "Dashboard",
  "/org/leads": "Lead Center",
  "/org/marketing": "Marketing Dashboard",
  "/org/marketing/apps": "Connected Apps",
  "/org/marketing/apps/logs": "Integration Logs",
  "/org/marketing/campaigns": "Campaigns",
  "/org/marketing/sources": "Lead Sources",
  "/org/marketing/utm": "UTM Tracking",
  "/org/projects": "Projects",
  "/org/calling": "Calling",
  "/org/calling/ai-agents": "AI Agents",
  "/org/calling/campaigns": "Campaigns",
  "/org/calling/call-logs": "Call Logs",
  "/org/calling/voice-lab": "Voice Lab",
  "/org/calling/automations": "Automations",
  "/org/calling/queue": "Call Queue",
  "/org/calling/numbers": "Numbers",
  "/org/calling/settings": "Calling Settings",
  "/org/whatsapp": "WhatsApp",
  "/org/whatsapp/ai-agents": "WhatsApp AI Agents",
  "/org/whatsapp/inbox": "WhatsApp Inbox",
  "/org/whatsapp/automations": "WhatsApp Automations",
  "/org/whatsapp/settings": "WhatsApp Settings",
  "/org/websites": "Websites",
  "/org/landing-pages": "Landing Pages",
  "/org/forms": "Lead Forms",
  "/org/media": "Media Library",
  "/org/templates": "Templates",
  "/org/integrations": "Integrations",
  "/org/sales-agents": "Sales Agents",
  "/org/reports": "Reports & Analytics",
  "/org/teams": "Teams",
  "/org/team-chat": "Team Chat",
  "/org/users": "Users",
  "/org/roles-permissions": "Roles & Permissions",
  "/org/publish-approvals": "Publish & Approvals",
  "/org/settings": "Organisation Settings",
  "/org/profile": "My Profile",
  "/org/support": "Support & Help",
};

// Accent dot colour per notification type, same palette the mock data used.
const NOTIFICATION_ACCENT: Record<string, string> = {
  support_ticket_created: "#0f1424",
  support_ticket_message: "#0f1424",
  support_ticket_status_changed: "#10b981",
  team_chat_mention: "#059669",
};

function relativeNotificationTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function initials(firstName: string | null, lastName: string | null): string {
  const parts = [firstName, lastName].filter(Boolean) as string[];
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// ---------------------------------------------------------------------------
// Subscription expiry popup — the persistent, dismissible banner org members
// see while their subscription is past_due / expired / cancelled / paused.
// It mirrors the backend lifecycle (which the billing read applies lazily),
// so the banner appears the moment a status transitions even before the
// hourly sweep fires. Dismissal is per-key for the session; if the state
// changes (key changes) or the page reloads, the banner comes back.
// ---------------------------------------------------------------------------

type ExpiryBanner = {
  key: string;
  tone: "rose" | "amber";
  title: string;
  body: string;
};

function expiryBannerFromBilling(billing: OrgBillingSummary | null): ExpiryBanner | null {
  const sub = billing?.subscription;
  if (!sub) return null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  if (sub.status === "expired") {
    return {
      key: "expired",
      tone: "rose",
      title: "Your subscription has expired",
      body: "Publishing is paused. Renew to keep your landing pages and features running.",
    };
  }
  if (sub.status === "past_due") {
    return {
      key: `past_due:${sub.graceEndsAt ?? "open"}`,
      tone: "amber",
      title: "Your subscription is past due",
      body: sub.graceEndsAt
        ? `Your term has ended — renew by ${fmt(sub.graceEndsAt)} to avoid any interruption.`
        : "Renew within the grace period to avoid any interruption.",
    };
  }
  if (sub.status === "cancelled" || sub.status === "paused") {
    return {
      key: sub.status,
      tone: "rose",
      title: sub.status === "cancelled" ? "Your subscription is cancelled" : "Your subscription is paused",
      body: "Choose a plan or renew from Org Settings → Billing to keep using the platform.",
    };
  }
  return null;
}

/** Live Team Chat unread total on the sidebar item (every org page). */
function TeamChatNavBadge() {
  const total = useTeamChat()?.totalUnread ?? 0;
  if (total <= 0) return null;
  return (
    <span className="tc-nav-badge" aria-label={`${total} unread chat messages`}>
      {total > 99 ? "99+" : total}
    </span>
  );
}

export function OrgAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, accessToken, isLoading: authLoading, logout, hasPermission } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken || !user) {
      router.replace("/login");
      return;
    }
    if (user.onboarding_step !== "completed") {
      // Same explicit signal /login sets before sending an incomplete
      // account to /register (see login/page.tsx) — this is a real,
      // already-authenticated session landing here on its own (e.g. a
      // bookmarked /org URL), so the wizard's "Welcome back" resume dialog
      // is the right call, not a bug.
      try {
        window.sessionStorage.setItem("register_resume_intent", "1");
      } catch {
        // best-effort — worst case the wizard falls back to a blank form.
      }
      router.replace("/register");
      return;
    }
    if (user.must_change_password) {
      router.replace("/change-password");
      return;
    }
    if (user.role !== "organisation_admin" && user.role !== "team_member") {
      router.replace(dashboardPathFor(user.role));
    }
  }, [authLoading, accessToken, user, router]);

  useEffect(() => {
    const orgContainer = document.querySelector(".org") as HTMLElement | null;
    const orgBrand = user?.organisation?.brand_colour;
    if (orgBrand && /^#[0-9a-fA-F]{3,8}$/.test(orgBrand)) {
      applyThemeVariables(orgBrand, undefined, orgContainer);
    } else if (orgContainer) {
      resetThemeVariables(orgContainer);
    }

    const handleOrgThemeChange = (e: Event) => {
      const custom = e as CustomEvent<{ brandColour?: string }>;
      const color = custom.detail?.brandColour;
      if (color && /^#[0-9a-fA-F]{3,8}$/.test(color)) {
        applyThemeVariables(color, undefined, orgContainer);
      } else if (orgContainer) {
        resetThemeVariables(orgContainer);
      }
    };

    window.addEventListener(ORG_THEME_CHANGE_EVENT, handleOrgThemeChange);
    return () => {
      window.removeEventListener(ORG_THEME_CHANGE_EVENT, handleOrgThemeChange);
    };
  }, [user?.organisation?.brand_colour]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
      router.push("/login");
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
    (/^\/org\/projects\/(?!add-new-project$)[^/]+/.test(pathname)
      ? "Projects · Detail"
      : CRUMB_MAP[
      Object.keys(CRUMB_MAP)
        .filter((base) => pathname.startsWith(`${base}/`))
        .sort((a, b) => b.length - a.length)[0]
      ]) ??
    "Dashboard";

  const [rawNotifications, setRawNotifications] = useState<OrgNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [expiryBanner, setExpiryBanner] = useState<ExpiryBanner | null>(null);
  const { toast } = useToast();
  // Notification ids already flashed (or seen on the first poll after
  // mount, which seeds this without flashing the org's whole history).
  const seenNotificationIdsRef = useRef<Set<string> | null>(null);

  const pollNotifications = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [count, recent] = await Promise.all([
        getOrgUnreadNotifications(),
        getOrgNotifications({ limit: 10 }),
      ]);
      setUnreadNotificationCount(count.count);

      if (seenNotificationIdsRef.current === null) {
        seenNotificationIdsRef.current = new Set(recent.data.map((n) => n.id));
        return;
      }
      const seen = seenNotificationIdsRef.current;
      for (const n of recent.data) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        // Flash message — no page refresh, just the newly-arrived chat/ticket
        // event surfacing without opening the bell.
        toast({ title: n.title, description: n.body ?? undefined, variant: "info" });
      }
    } catch {
      // Best-effort — the bell badge simply stays at its last known value.
    }
  }, [accessToken, toast]);

  // Keeps the subscription-expiry popup in sync with the backend.
  const dismissedExpiryRef = useRef<Set<string>>(new Set());
  const [currentPlanName, setCurrentPlanName] = useState<string | null>(null);

  const pollBilling = useCallback(async () => {
    if (!accessToken) return;
    try {
      const billing = await getOrgBilling();
      const next = expiryBannerFromBilling(billing);
      setExpiryBanner((current) => {
        const candidateKey = next ? next.key : null;
        if (current?.key === candidateKey) return current;
        if (candidateKey && dismissedExpiryRef.current.has(candidateKey)) return null;
        return next;
      });
      setCurrentPlanName(billing.plan?.name ?? null);
    } catch {
      // The billing module is permission-gated — non-admins simply don't get
      // the banner or the sidebar plan name; their bell notifications still
      // surface the popup.
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void pollNotifications();
    void pollBilling();
    const id = window.setInterval(() => {
      void pollNotifications();
      void pollBilling();
    }, 30000);
    return () => window.clearInterval(id);
  }, [accessToken, pollNotifications, pollBilling]);

  useEffect(() => {
    if (!notificationOpen || !accessToken) return;
    void getOrgNotifications({ limit: 20 })
      .then((res) => setRawNotifications(res.data))
      .catch(() => undefined);
  }, [notificationOpen, accessToken]);

  const notifications = rawNotifications.map((n) => ({
    id: n.id,
    title: n.title,
    meta: n.body ?? "",
    time: relativeNotificationTime(n.createdAt),
    unread: !n.readAt,
    accent: NOTIFICATION_ACCENT[n.type] ?? "#0f1424",
    entityId: n.entityId,
    type: n.type,
  }));

  async function handleNotificationClick(item: (typeof notifications)[number]) {
    if (item.unread) {
      await markOrgNotificationRead(item.id).catch(() => undefined);
      setUnreadNotificationCount((count) => Math.max(0, count - 1));
      setRawNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
    }
    setNotificationOpen(false);
    if (item.type.startsWith("support_ticket")) {
      router.push(item.entityId ? `/org/support/${item.entityId}` : "/org/support");
    } else if (item.type === "team_chat_mention") {
      if (item.entityId && pathname.startsWith("/org/team-chat")) {
        // Already on Team Chat: switch conversations without a navigation.
        window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT, { detail: item.entityId }));
      } else {
        router.push(item.entityId ? `/org/team-chat?c=${item.entityId}` : "/org/team-chat");
      }
    }
  }

  async function handleMarkAllRead() {
    await markAllOrgNotificationsRead().catch(() => undefined);
    setUnreadNotificationCount(0);
    setRawNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
  }

  useEffect(() => {
    if (!profileMenuOpen && !notificationOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest("[data-profile-menu]") &&
        !target.closest("[data-notification-menu]")
      ) {
        setProfileMenuOpen(false);
        setNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [profileMenuOpen, notificationOpen]);

  if (
    authLoading ||
    !accessToken ||
    !user ||
    (user.role !== "organisation_admin" && user.role !== "team_member")
  ) {
    return null;
  }

  const userName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
  const avatarInitials = initials(user.first_name, user.last_name);

  return (
    <TeamChatProvider enabled={hasPermission("team_chat", "view") && isChatHost()}>
    <div className={appClass}>
      <aside className="sidebar">
        <div className="s-top">
          <div className="s-logo-wrap" aria-hidden>
            <BuildingLogoIcon size={34} />
          </div>
          <div className="s-name">
            iPixxel Realty<small>{user.roleLabel || "Organisation Admin"}</small>
          </div>
        </div>
        <Link href="/org/settings" className="s-plan" title="Current subscription plan">
          <div className="s-plan-inner">
            <Icon name="crown" size={13} className="s-plan-ic" />
            <span>
              Current Plan: <strong>{currentPlanName || "Starter"}</strong>
            </span>
          </div>
          <Icon name="chevron-right" size={12} className="s-plan-arrow" />
        </Link>
        <nav>
          <ul className="nav">
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) =>
                isOrgNavItemAllowed(item.href, hasPermission),
              );

              if (visibleItems.length === 0) return null;

              return (
                <ul className="nav-group" key={group.grp}>
                  <li className="grp">{group.grp}</li>
                  {visibleItems.map((item) => {
                    const matches =
                      pathname === item.href ||
                      (item.href !== "/org" && pathname.startsWith(`${item.href}/`));
                    const longerMatch = matches
                      ? NAV_GROUPS.some((g) =>
                          g.items.some(
                            (other) =>
                              other.href !== item.href &&
                              other.href.length > item.href.length &&
                              (pathname === other.href ||
                                pathname.startsWith(`${other.href}/`)),
                          ),
                        )
                      : false;
                    const isActive = matches && !longerMatch;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          data-tip={item.tip}
                          className={isActive ? "active" : ""}
                        >
                          <span className="ic"><Icon name={item.icon} size={16} /></span>
                          <span className="lbl">{item.label}</span>
                          {item.href === "/org/team-chat" ? <TeamChatNavBadge /> : null}
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
              <b>{userName}</b>
              <span>{user?.roleLabel || "Organisation Admin"}</span>
            </div>
            <button
              type="button"
              onClick={() => router.push("/org/settings")}
              className="side-arrow-btn"
              title="Organisation settings & profile"
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
            <span className="tb-chip">Organisation</span>
            <div className="crumbs">
              <span className="crumbs-eyebrow">Workspace</span>
              <b>{crumb}</b>
            </div>
          </div>

          <div className="tb-right" style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <div style={{ position: "relative" }} data-notification-menu>
              <button
                type="button"
                className="icon-btn"
                aria-label="Notifications"
                onClick={() => {
                  setNotificationOpen((value) => !value);
                  setProfileMenuOpen(false);
                }}
                style={{ position: "relative" }}
              >
                <Icon name="bell" size={14} />
                {unreadNotificationCount > 0 ? (
                  <span className="count">{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>
                ) : null}
              </button>

              {notificationOpen ? (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 12px)",
                    width: 340,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.98)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
                    overflow: "hidden",
                    zIndex: 60,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 16px 12px",
                      borderBottom: "1px solid rgba(148, 163, 184, 0.15)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Notifications
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                        {unreadNotificationCount} unread
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleMarkAllRead()}
                      disabled={unreadNotificationCount === 0}
                      style={{
                        border: "none",
                        background: "rgba(21, 27, 46, 0.08)",
                        color: "#0f1424",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontWeight: 600,
                        cursor: unreadNotificationCount === 0 ? "default" : "pointer",
                        opacity: unreadNotificationCount === 0 ? 0.5 : 1,
                      }}
                    >
                      Mark all read
                    </button>
                  </div>

                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: "24px 16px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
                        No notifications yet.
                      </div>
                    ) : null}
                    {notifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => void handleNotificationClick(item)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: "14px 16px",
                          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
                          background: item.unread ? "rgba(21, 27, 46, 0.02)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            marginTop: 7,
                            background: item.accent,
                            boxShadow: `0 0 0 4px ${item.accent}22`,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{item.meta}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", paddingTop: 3 }}>
                          {item.time}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ position: "relative" }} data-profile-menu>
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((value) => !value);
                  setNotificationOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px 6px 6px",
                  borderRadius: 14,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(255, 255, 255, 0.7)",
                  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
                  cursor: "pointer",
                }}
              >
                <div className="tb-avatar" style={{ width: 36, height: 36, fontSize: 12 }}>
                  {avatarInitials}
                </div>
                <div className="tb-profile-text" style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, textAlign: "left" }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: "#0f172a" }}>{userName}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{user.roleLabel}</span>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="chevron-down" size={12} />
                </span>
              </button>

              {profileMenuOpen ? (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 12px)",
                    width: 220,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.98)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
                    overflow: "hidden",
                    zIndex: 60,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 14px 12px",
                      borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
                    }}
                  >
                    <div className="tb-avatar" style={{ width: 34, height: 34, fontSize: 11 }}>
                      {avatarInitials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{userName}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{user.email}</div>
                    </div>
                  </div>

                  {/* My profile page — needs the Settings "My profile: View" pill. */}
                  {hasPermission("settings", SETTINGS_ACTIONS.viewMyProfile) ? (
                  <Link
                    href="/org/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "12px 14px",
                      fontSize: 14,
                      color: "#0f172a",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
                      <Icon name="profile" size={14} />
                    </span>
                    My Profile
                  </Link>
                  ) : null}

                  {/* Same gate as the sidebar's Settings item. */}
                  {hasPermission("settings", "view") ? (
                  <Link
                    href="/org/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "12px 14px",
                      fontSize: 14,
                      color: "#0f172a",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
                      <Icon name="settings" size={14} />
                    </span>
                    Settings
                  </Link>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      void handleSignOut();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "12px 14px",
                      fontSize: 14,
                      color: "#ef4444",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="logout" size={14} />
                    </span>
                    {isSigningOut ? "Logging out..." : "Logout"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {expiryBanner ? (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "16px 24px 0",
              padding: "12px 16px",
              borderRadius: 14,
              border: `1px solid ${expiryBanner.tone === "rose" ? "rgba(244, 63, 94, 0.25)" : "rgba(245, 158, 11, 0.3)"
                }`,
              background:
                expiryBanner.tone === "rose"
                  ? "rgba(244, 63, 94, 0.07)"
                  : "rgba(245, 158, 11, 0.07)",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                flex: "0 0 auto",
                background: expiryBanner.tone === "rose" ? "#f43f5e" : "#f59e0b",
                boxShadow: `0 0 0 4px ${expiryBanner.tone === "rose" ? "#f43f5e" : "#f59e0b"}22`,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>{expiryBanner.title}</div>
              <div style={{ fontSize: 12.5, color: "#475569", marginTop: 2 }}>{expiryBanner.body}</div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/org/settings?section=billing")}
              style={{
                flex: "0 0 auto",
                border: "none",
                borderRadius: 10,
                padding: "8px 14px",
                background: "#0f1424",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Renew now
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                dismissedExpiryRef.current.add(expiryBanner.key);
                setExpiryBanner(null);
              }}
              style={{
                flex: "0 0 auto",
                border: "none",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 16,
                lineHeight: 1,
                cursor: "pointer",
                padding: 6,
              }}
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="page">
          <LeadStagesProvider>{children}</LeadStagesProvider>
        </div>

        {hasPermission("support", "view") ? (
          <Link
            href="/org/support"
            style={{
              position: "fixed",
              right: 24,
              bottom: 24,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 18px",
              borderRadius: 999,
              background: "linear-gradient(135deg, var(--secondary, #2a3348) 0%, var(--primary, #0f1424) 100%)",
              color: "#fff",
              textDecoration: "none",
              boxShadow: "var(--sh-glow, 0 18px 40px rgba(21, 27, 46, 0.32))",
              fontSize: 13,
              fontWeight: 700,
              zIndex: 30,
            }}
          >
            <Icon name="flag" size={15} />
            Support
          </Link>
        ) : null}
      </main>
    </div>
    </TeamChatProvider>
  );
}