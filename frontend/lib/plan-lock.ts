/**
 * Billing v2 "choose what stays": what the plan has locked, and the words for
 * it. One place so the badges, tooltips and error messages read the same
 * everywhere. Every edit of a locked item is refused by the API with
 * `{ code: "plan_locked", lock }` (backend/src/common/utils/plan-lock.util.ts).
 */
export type PlanLockKind = "project_view_only" | "landing_page_offline" | "user_paused" | "template_paused";

export const PLAN_LOCK_COPY: Record<PlanLockKind, { badge: string; tooltip: string; error: string }> = {
  project_view_only: {
    badge: "View only",
    tooltip: "Paused because your plan's project limit is lower. Upgrade, or contact our support team to change what stays.",
    error: "This project is view-only because your plan's project limit is lower. Upgrade, or contact our support team to change what stays, to edit it again.",
  },
  landing_page_offline: {
    badge: "Offline",
    tooltip: "Offline because your plan allows fewer live pages. Upgrade, or contact our support team to change what stays.",
    error: "This landing page is offline because your plan allows fewer live pages. Upgrade, or contact our support team to change what stays, to publish it again.",
  },
  user_paused: {
    badge: "Paused",
    tooltip: "Paused because your plan's user limit is lower. Upgrade, or contact our support team to change what stays.",
    error: "This user is paused because your plan's user limit is lower. Upgrade, or contact our support team to change what stays, to bring them back.",
  },
  template_paused: {
    badge: "Paused",
    tooltip: "Paused because your plan allows fewer templates: it can't be used for new landing pages. Pages already made from it aren't affected. Upgrade, or contact our support team to change what stays.",
    error: "This template is paused because your plan allows fewer templates, so it can't be used for new landing pages. Pages already made from it aren't affected. Upgrade, or contact our support team to change what stays, to use it again.",
  },
};

const KINDS = Object.keys(PLAN_LOCK_COPY) as PlanLockKind[];

/** The friendly message for a `plan_locked` API error body, else null. */
export function planLockMessage(body: unknown): string | null {
  const b = body as { code?: unknown; lock?: unknown } | null | undefined;
  if (!b || b.code !== "plan_locked") return null;
  const kind = KINDS.find((k) => k === b.lock) ?? "project_view_only";
  return PLAN_LOCK_COPY[kind].error;
}
