"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { PLAN_LOCK_COPY, type PlanLockKind } from "@/lib/plan-lock";
import type { AccessStatus, BillingPlan } from "@/lib/billing/types";
import { useOptionalBillingEnv, useOptionalOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { Banner, BLink } from "./ui";

/* ------------------------------------------------------------ Access status */

const AccessContext = createContext<AccessStatus | null>(null);

/** Fetches what's paused / view-only / offline; re-fetches whenever the overview changes. */
export function BillingAccessProvider({ children }: { children: ReactNode }) {
  const env = useOptionalBillingEnv();
  const overview = useOptionalOrgBilling()?.overview;
  const [access, setAccess] = useState<AccessStatus | null>(null);
  useEffect(() => {
    if (!env) return;
    let live = true;
    env.client
      .getAccessStatus()
      .then((a) => live && setAccess(a))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [env, overview]);
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

/** null when billing v2 is off or still loading — callers then behave exactly as before. */
export function useBillingAccess(): AccessStatus | null {
  return useContext(AccessContext);
}

/**
 * What the plan has locked, by id. `active` is false (and nothing is locked)
 * when billing v2 is off or still loading.
 */
export function usePlanLocks() {
  const access = useBillingAccess();
  return useMemo(
    () => ({
      active: !!access,
      projectViewOnly: (id: string | null | undefined) => !!id && !!access?.viewOnlyProjectIds.includes(id),
      pageOffline: (id: string | null | undefined) => !!id && !!access?.offlineLandingPageIds.includes(id),
      userPaused: (id: string | null | undefined) => !!id && !!access?.pausedUserIds.includes(id),
    }),
    [access],
  );
}

/** True when billing v2 has made this project view-only (then hide every edit action). */
export function useProjectViewOnly(projectId: string | null | undefined): boolean {
  return usePlanLocks().projectViewOnly(projectId);
}

/* -------------------------------------------------------------- Lock badge */

const LOCK_ICON: Record<PlanLockKind, IconName> = {
  project_view_only: "eye",
  landing_page_offline: "globe",
  user_paused: "pause",
};

/**
 * The one badge for anything the plan has locked — the same words, colour and
 * tooltip on every list, grid and detail page.
 */
export function PlanLockBadge({ kind, style }: { kind: PlanLockKind; style?: React.CSSProperties }) {
  const copy = PLAN_LOCK_COPY[kind];
  return (
    <span className="badge b-amber" style={{ display: "inline-flex", alignItems: "center", gap: 4, ...style }} title={copy.tooltip} data-plan-lock={kind}>
      <Icon name={LOCK_ICON[kind]} size={12} /> {copy.badge}
    </span>
  );
}

/** "This project is view-only…" with the ways out, for a locked project's pages. */
export function PlanLockNotice({ kind }: { kind: PlanLockKind }) {
  return (
    <div className="form-alert" role="status" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <Icon name="lock" size={15} />
      <span style={{ flex: 1, minWidth: 220 }}>{PLAN_LOCK_COPY[kind].error}</span>
      <Link href="/org/settings/billing/plans" className="btn btn-primary btn-sm">
        Upgrade
      </Link>
      <Link href="/org/settings/billing/choose-what-stays" className="btn btn-ghost btn-sm">
        Change what stays
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ Login */

/**
 * Shown on the login screen when sign-in is refused because the user is paused.
 * Wired to the API error `{ code: "account_paused", orgName, ownerName, planName, planUserLimit }`.
 */
export function PausedAccountNotice({ orgName, ownerName, planName, userLimit }: { orgName: string; ownerName: string; planName: string; userLimit: number }) {
  return (
    <div className="form-alert" role="alert" style={{ lineHeight: 1.5, marginBottom: 14 }}>
      <b>Your account is paused.</b> {orgName} is on the free {planName} plan, which allows {userLimit} users. Ask {ownerName} (owner) to buy a plan again or to add you
      in “Choose what stays”. Your data is safe.
    </div>
  );
}

/* ---------------------------------------------------------------- Projects */

export function ViewOnlyBadge({ style }: { style?: React.CSSProperties }) {
  return <PlanLockBadge kind="project_view_only" style={style} />;
}

/** Renders the View only badge if billing v2 says this project is view-only. */
export function ProjectAccessBadge({ projectId, style }: { projectId: string; style?: React.CSSProperties }) {
  const access = useBillingAccess();
  return access?.viewOnlyProjectIds.includes(projectId) ? <ViewOnlyBadge style={style} /> : null;
}

/* ----------------------------------------------------------- Landing pages */

export function OfflineBadge() {
  return <PlanLockBadge kind="landing_page_offline" />;
}

export function LandingPageAccessBadge({ landingPageId }: { landingPageId: string }) {
  const access = useBillingAccess();
  return access?.offlineLandingPageIds.includes(landingPageId) ? <OfflineBadge /> : null;
}

/* ------------------------------------------------------------------- Users */

export function PausedUserBadge() {
  return <PlanLockBadge kind="user_paused" />;
}

export function UserAccessBadge({ userId }: { userId: string }) {
  return usePlanLocks().userPaused(userId) ? <PausedUserBadge /> : null;
}

/** What a visitor sees on an offline landing page. */
export function OfflinePagePreview({ orgName }: { orgName: string }) {
  return (
    <div style={{ border: "1px dashed var(--line-2)", borderRadius: 12, padding: 24, textAlign: "center", background: "var(--surface-2)" }}>
      <Icon name="globe" size={28} style={{ color: "var(--faint)" }} />
      <div style={{ fontWeight: 700, marginTop: 8 }}>This page isn&apos;t available right now</div>
      <div className="bl-muted">Please check back later, or contact {orgName} directly.</div>
    </div>
  );
}

/* --------------------------------------------------------------- Team chat */

export function TeamChatReadOnlyNotice({ planName }: { planName: string }) {
  return (
    <Banner
      tone="amber"
      icon="lock"
      title={`Team chat isn't included in ${planName}`}
      actions={
        <BLink to="plans" className="btn btn-primary btn-sm">
          Upgrade to chat
        </BLink>
      }
    >
      Your chat history stays here to read. Upgrade to send messages again.
    </Banner>
  );
}

/* ----------------------------------------------------------- Limit reached */

export function LimitReachedDialog({
  open,
  onClose,
  used,
  limit,
  planName,
  nextPlan,
}: {
  open: boolean;
  onClose: () => void;
  used: number;
  limit: number;
  planName: string;
  nextPlan: Pick<BillingPlan, "id" | "name" | "limits"> | null;
}) {
  return (
    <BillingDialog
      open={open}
      onClose={onClose}
      title="Upgrade to add more users"
      footer={
        <DialogActions>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Not now
          </button>
          {nextPlan ? (
            <BLink to="checkout" params={{ plan: nextPlan.id, interval: "monthly" }} className="btn btn-primary btn-sm">
              Upgrade to {nextPlan.name}
            </BLink>
          ) : (
            <BLink to="plans" className="btn btn-primary btn-sm">
              See plans
            </BLink>
          )}
        </DialogActions>
      }
    >
      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
        {planName} allows <b>{limit} users</b> and you have <b>{used}</b>.{" "}
        {nextPlan ? `${nextPlan.name} gives you ${nextPlan.limits.users} users.` : "You're on our largest plan — remove someone to free a seat, or talk to us about a custom plan."}
      </div>
    </BillingDialog>
  );
}

export function LeadsKeepComingNote() {
  return (
    <Banner tone="green" icon="check" title="Leads always keep coming in">
      Paused users, view-only projects and offline pages never stop new leads. Forms and ad connections keep sending every lead to your CRM on every plan.
    </Banner>
  );
}

/**
 * For the Users page: with billing v2 on, "Create user" at the seat limit
 * opens the upgrade dialog instead of navigating. Inactive (null access)
 * when billing v2 is off, so the page keeps its current behaviour.
 */
export function useSeatLimitGate(used: number) {
  const env = useOptionalBillingEnv();
  const access = useBillingAccess();
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!env) return;
    let live = true;
    env.client
      .listPlans()
      .then((p) => live && setPlans(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [env]);
  const current = plans?.find((p) => p.id === access?.planId);
  const next = current ? (plans ?? []).filter((p) => p.rank > current.rank).sort((a, b) => a.rank - b.rank)[0] ?? null : null;
  return {
    active: !!access,
    atLimit: !!access && access.limits.users !== null && used >= access.limits.users,
    open: () => setOpen(true),
    dialog: access ? (
      <LimitReachedDialog open={open} onClose={() => setOpen(false)} used={used} limit={access.limits.users ?? 0} planName={access.planName} nextPlan={next} />
    ) : null,
  };
}

/** Wraps the team-chat composer: the read-only notice replaces it when the plan has no team chat. */
export function TeamChatComposerGate({ children }: { children: ReactNode }) {
  const access = useBillingAccess();
  if (access && !access.modules.teamChat) return <TeamChatReadOnlyNotice planName={access.planName} />;
  return <>{children}</>;
}
