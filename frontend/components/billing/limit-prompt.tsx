"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AccessStatus, OrgUsage } from "@/lib/billing/types";
import { Modal } from "@/components/ui/modal";
import { planLockCopy } from "@/lib/plan-lock";

/**
 * The one place for plan-limit prompts and their "who can act" rule:
 *  - people who can manage billing (billing:edit) keep today's Upgrade /
 *    Change what stays buttons;
 *  - everyone else is told to ask their organisation admin, with an OK.
 * Limits and usage come from GET /org/billing/access, which every member can
 * read, so the prompts show before a form is filled in.
 */

/** useAuth, or null outside an AuthProvider (isolated tests, walkthroughs). useContext runs either way. */
export function useAuthOrNull(): ReturnType<typeof useAuth> | null {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export const ASK_ADMIN_UPGRADE = "Ask your organisation admin to upgrade the plan.";

/**
 * True when the viewer can pay / change the plan (billing:edit). Outside an
 * AuthProvider (isolated tests, walkthroughs) it answers true: today's buttons.
 */
export function useCanManageBilling(): boolean {
  const auth = useAuthOrNull();
  return auth ? auth.hasPermission("billing", "edit") : true;
}

/** The lock badge / tooltip / notice words for the viewer (see planLockCopy). */
export function usePlanLockCopy() {
  return planLockCopy(useCanManageBilling());
}

/** "Contact support" links only for people who can open Support. */
export function useCanContactSupport(): boolean {
  const auth = useAuthOrNull();
  return auth ? auth.hasPermission("support", "view") : true;
}

/** "Your plan allows 5 and you have 5. Ask your organisation admin to upgrade the plan." */
export function memberLimitText(limit: number | null | undefined, used: number | null | undefined): string {
  return `Your plan allows ${limit ?? 0} and you have ${used ?? 0}. ${ASK_ADMIN_UPGRADE}`;
}

/** Billing editors see `children` (today's Upgrade button / link); everyone else the ask-your-admin line. */
export function UpgradeOrAsk({ children, text = ASK_ADMIN_UPGRADE }: { children: ReactNode; text?: string }) {
  const canManage = useCanManageBilling();
  if (canManage) return <>{children}</>;
  return (
    <span className="muted" style={{ fontSize: 12.5 }} data-testid="ask-admin-upgrade">
      {text}
    </span>
  );
}

export interface LimitPrompt {
  /** "User", "Project", "Landing page"… — the title reads "{thing} limit reached". */
  thing: string;
  limit: number | null | undefined;
  used: number | null | undefined;
}

/** "{Thing} limit reached. Your plan allows {limit} and you have {used}. Ask your organisation admin…" + OK. */
export function MemberLimitDialog({ prompt, onClose }: { prompt: LimitPrompt | null; onClose: () => void }) {
  return (
    <Modal
      open={!!prompt}
      onClose={onClose}
      title={`${prompt?.thing ?? "Plan"} limit reached`}
      size="sm"
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose} data-testid="limit-prompt-ok">
          OK
        </button>
      }
    >
      <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }} data-testid="limit-prompt-text">
        {prompt ? memberLimitText(prompt.limit, prompt.used) : null}
      </div>
    </Modal>
  );
}

/** State + dialog for the member prompt: `show({ thing, limit, used })`, render `dialog`. */
export function useMemberLimitPrompt() {
  const [prompt, setPrompt] = useState<LimitPrompt | null>(null);
  return {
    show: (p: LimitPrompt) => setPrompt(p),
    dialog: <MemberLimitDialog prompt={prompt} onClose={() => setPrompt(null)} />,
  };
}

/**
 * The org's limits and usage (GET /org/billing/access — no billing permission
 * needed). `reloadKey` re-fetches (e.g. after creating or deleting something).
 * Null while loading, or when it can't be read (then no prompt shows and the
 * server stays the final check).
 */
export function useOrgUsage(reloadKey?: unknown): { usage: OrgUsage | null; planName: string | null } {
  const accessToken = useAuthOrNull()?.accessToken;
  const [access, setAccess] = useState<AccessStatus | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    apiFetch<AccessStatus>("/org/billing/access")
      .then((a) => live && setAccess(a))
      .catch(() => live && setAccess(null));
    return () => {
      live = false;
    };
  }, [accessToken, reloadKey]);
  return { usage: access?.usage ?? null, planName: access?.planName ?? null };
}

/** At (or over) a limit? Unlimited (null) never is. */
export function atLimit(used: number | null | undefined, limit: number | null | undefined): boolean {
  return limit != null && used != null && used >= limit;
}
