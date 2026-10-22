// Shared by the Subscriptions studio and its create / edit / assign / change
// pages.

export const SUBS_PATH = "/admin-console/subscriptions";
export const SUBS_FLASH_KEY = "adminSubscriptions.flash";

/** Studio tab indexes the pages send the list back to (see visibleTabs). */
export const PLANS_TAB = "1";
export const ORG_SUBS_TAB = "2";

export type LimitKey = "projects" | "users" | "templates" | "landingPages" | "landingPagesCreate";

export const LIMIT_ROWS: { key: LimitKey; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "users", label: "Users" },
  { key: "templates", label: "Templates" },
  { key: "landingPagesCreate", label: "Created Landing Pages (Drafts + Live)" },
  { key: "landingPages", label: "Maximum Published Landing Pages" },
];

/* ------------------------------------------------- Tab and list state in the URL */

/**
 * The Subscriptions studio keeps its tab (and each list's filters, search and
 * page) in the URL — /admin-console/subscriptions?tab=package-requests&status=pending —
 * so reloading, the browser back button and an org page's Back link all land
 * on the same tab and filter. Index = the tab's index in visibleTabs.
 */
export const TAB_SLUGS = ["overview", "plans", "org-subscriptions", "package-requests", "payments", "expiry"] as const;
export type TabSlug = (typeof TAB_SLUGS)[number];

export function tabSlug(index: number): TabSlug | null {
  return TAB_SLUGS[index] ?? null;
}

export function tabIndex(slug: string | null | undefined): number | null {
  const i = TAB_SLUGS.indexOf(slug as TabSlug);
  return i < 0 ? null : i;
}

export const REQUEST_STATUS_FILTERS = ["pending", "all", "approved", "rejected"] as const;

export type ListQuery = Record<string, string | number | null | undefined>;

/** `?a=1&b=2` from the set values (empty / null / page 1 left out), or "". */
export function listQueryString(params: ListQuery): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || (k === "page" && Number(v) <= 1)) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Point the current history entry at the list state (no navigation, no new entry). */
export function replaceListQuery(params: ListQuery): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `${SUBS_PATH}${listQueryString(params)}`);
}

export function readListQuery(): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}
