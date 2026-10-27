import { ForbiddenException } from '@nestjs/common';

/**
 * Billing v2 "choose what stays": the one error every edit of something the
 * plan has locked returns — a view-only project (and its units), an offline
 * landing page, a paused user, a paused template (new pages only). `code` is always `plan_locked`; `lock` says
 * which kind. The frontend shows its own friendly text for the code
 * (frontend/lib/plan-lock.ts).
 */
export type PlanLockKind =
  | 'project_view_only'
  | 'landing_page_offline'
  | 'user_paused'
  | 'template_paused';

const MESSAGES: Record<PlanLockKind, string> = {
  project_view_only:
    "This project is view-only because your plan's project limit is lower. Upgrade, or change what stays in Billing, to edit it again.",
  landing_page_offline:
    'This landing page is offline because your plan allows fewer live pages. Upgrade, or change what stays in Billing, to publish it again.',
  user_paused:
    "This user is paused because your plan's user limit is lower. Upgrade, or change what stays in Billing, to bring them back.",
  template_paused:
    "This template is paused because your plan allows fewer templates, so it can't be used for new landing pages. Pages already made from it aren't affected. Upgrade, or change what stays in Billing, to use it again.",
};

export function planLockedError(lock: PlanLockKind): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: 'plan_locked',
    lock,
    message: MESSAGES[lock],
  });
}
