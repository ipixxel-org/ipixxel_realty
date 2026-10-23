"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BillingClient } from "@/lib/billing/client";
import type { BillingOverview } from "@/lib/billing/types";
import "./billing.css";

/* ------------------------------------------------------------------ Routes */

export type BillingRoute =
  | "overview"
  | "plans"
  | "checkout"
  | "checkoutSuccess"
  | "checkoutFailure"
  | "downgrade"
  | "cancel"
  | "invoices"
  | "chooseWhatStays"
  | "adminCoupons"
  | "adminCouponNew"
  | "adminCoupon"
  | "adminCouponEdit"
  | "adminSubscriptions"
  | "adminSubscription"
  | "adminPlanEdit"
  | "coupons"
  /** Settings → General: the org profile that billing details come from. */
  | "generalSettings"
  /** Settings → Billing → Requests (plan change requests, manual mode). */
  | "requests";

export type RouteParams = Record<string, string | number | null | undefined>;

const ORG = "/org/settings/billing";

function query(params: RouteParams, skip: string[] = []): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "" && !skip.includes(k)) q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Real app URLs for every billing screen. */
export function billingHref(to: BillingRoute, params: RouteParams = {}): string {
  switch (to) {
    case "overview":
      return "/org/settings?section=billing";
    case "generalSettings":
      return "/org/settings?section=general";
    case "plans":
      return `${ORG}/plans${query(params)}`;
    case "checkout":
      return `${ORG}/checkout${query(params)}`;
    case "checkoutSuccess":
      return `${ORG}/checkout/success${query(params)}`;
    case "checkoutFailure":
      return `${ORG}/checkout/failure${query(params)}`;
    case "downgrade":
      return `${ORG}/downgrade${query(params)}`;
    case "cancel":
      return `${ORG}/cancel`;
    case "invoices":
      return `${ORG}/invoices`;
    case "chooseWhatStays":
      return `${ORG}/choose-what-stays${query(params)}`;
    case "adminCoupons":
      return "/admin-console/coupons";
    case "adminCouponNew":
      return "/admin-console/coupons/new";
    case "adminCoupon":
      return `/admin-console/coupons/${encodeURIComponent(String(params.code))}`;
    case "adminCouponEdit":
      return `/admin-console/coupons/${encodeURIComponent(String(params.code))}/edit`;
    case "adminSubscriptions":
      // tab / status / q / page: the Subscriptions studio restores them (Back from an org page).
      return `/admin-console/subscriptions${query(params)}`;
    case "adminSubscription":
      // from / status / … say which list opened it (for Back); _hash scrolls to a section.
      return `/admin-console/subscriptions/org/${encodeURIComponent(String(params.orgId))}${query(params, ["orgId", "_hash"])}${params._hash ? `#${params._hash}` : ""}`;
    case "adminPlanEdit":
      return `/admin-console/subscriptions/plans/${encodeURIComponent(String(params.id))}/edit`;
    case "coupons":
      return `${ORG}/coupons`;
    case "requests":
      return `${ORG}/requests`;
  }
}

export interface BillingNav {
  href(to: BillingRoute, params?: RouteParams): string;
  go(to: BillingRoute, params?: RouteParams): void;
  /** Presentation pages intercept navigation (e.g. jump to the next step). */
  intercept?: (to: BillingRoute, params?: RouteParams) => boolean;
}

/* ----------------------------------------------------- Client + presentation */

interface BillingEnv {
  client: BillingClient;
  nav: BillingNav;
  /** Whether the viewer may change billing (billing:edit / admin_subscriptions:edit). */
  canEdit: boolean;
  /** Whether the viewer may edit Settings → General (where billing details live). */
  canEditOrgProfile: boolean;
  /** Draw dialogs inside the surrounding frame instead of over the page (walkthroughs). */
  inlineDialogs: boolean;
}

const EnvContext = createContext<BillingEnv | null>(null);

function useRouterNav(): BillingNav {
  const router = useRouter();
  return useMemo(
    () => ({
      href: billingHref,
      go: (to, params) => router.push(billingHref(to, params)),
    }),
    [router],
  );
}

export function BillingEnvProvider({
  client,
  canEdit = true,
  canEditOrgProfile = true,
  inlineDialogs = false,
  onNavigate,
  children,
}: {
  client: BillingClient;
  canEdit?: boolean;
  canEditOrgProfile?: boolean;
  inlineDialogs?: boolean;
  /** Return true to swallow a navigation (presentation pages). */
  onNavigate?: (to: BillingRoute, params?: RouteParams) => boolean;
  children: ReactNode;
}) {
  const routerNav = useRouterNav();
  const nav = useMemo<BillingNav>(
    () =>
      onNavigate
        ? {
            href: billingHref,
            intercept: onNavigate,
            go: (to, params) => {
              if (!onNavigate(to, params)) routerNav.go(to, params);
            },
          }
        : routerNav,
    [onNavigate, routerNav],
  );
  const value = useMemo(
    () => ({ client, nav, canEdit, canEditOrgProfile, inlineDialogs }),
    [client, nav, canEdit, canEditOrgProfile, inlineDialogs],
  );
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
}

export function useBillingEnv(): BillingEnv {
  const ctx = useContext(EnvContext);
  if (!ctx) throw new Error("Billing components must be inside <BillingEnvProvider>");
  return ctx;
}

/* ------------------------------------------------------------ Org overview */

interface OrgBillingValue {
  overview: BillingOverview | null;
  error: string | null;
  refresh(): Promise<void>;
  setOverview(o: BillingOverview): void;
}

const OverviewContext = createContext<OrgBillingValue | null>(null);

/** Loads the org's billing overview once and shares it (banners + billing pages stay in step). */
export function OrgBillingProvider({ initial, children }: { initial?: BillingOverview; children: ReactNode }) {
  const { client } = useBillingEnv();
  const [overview, setOverview] = useState<BillingOverview | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOverview(await client.getBillingOverview());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load billing.");
    }
  }, [client]);

  useEffect(() => {
    if (initial) return;
    let live = true;
    client
      .getBillingOverview()
      .then((o) => live && setOverview(o))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load billing."));
    return () => {
      live = false;
    };
  }, [client, initial]);

  const value = useMemo(() => ({ overview, error, refresh, setOverview }), [overview, error, refresh]);
  return <OverviewContext.Provider value={value}>{children}</OverviewContext.Provider>;
}

export function useOrgBilling(): OrgBillingValue {
  const ctx = useContext(OverviewContext);
  if (!ctx) throw new Error("useOrgBilling must be inside <OrgBillingProvider>");
  return ctx;
}

/** Same as useOrgBilling but null outside a provider (banners in the shell with the flag off). */
export function useOptionalOrgBilling(): OrgBillingValue | null {
  return useContext(OverviewContext);
}

/** Load any async billing data with the active client. */
export function useBillingQuery<T>(load: (client: BillingClient) => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload(): void } {
  const { client } = useBillingEnv();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load(client)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Something went wrong."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass their own deps
  }, [client, tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

/** Null when billing v2 isn't mounted (flag off) — for hooks used inside existing pages. */
export function useOptionalBillingEnv(): BillingEnv | null {
  return useContext(EnvContext);
}
