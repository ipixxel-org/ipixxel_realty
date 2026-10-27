import type { PrismaClient } from '@prisma/client';
import { usageOverLimits } from '../../common/utils/plan-quota.util';
import { savedChoiceFor } from '../../common/utils/retention.util';
import { billingError, usageConflictMessage } from './billing-checkout.service';
import type { UsageConflictV2 } from './billing.types';

/**
 * "Choose what stays" is part of every plan change where the org is over the
 * target plan's limits. Every time, the org picks one of two options
 * (whatStaysChoice): 'default' ("Keep the default picks") or 'saved' ("I'll
 * choose what stays", which needs a saved choice that fits). They can change
 * it until the change is decided or takes effect; after that only Super Admin
 * can — for an open request, or the one that put the org on its current plan
 * (admin endpoints in BillingRetentionService).
 */

export type WhatStaysChoice = 'default' | 'saved';

/** The option the org picked; `acceptDefaultPicks: true` (older clients) means 'default'. */
export function pickedWhatStays(dto: {
  whatStaysChoice?: WhatStaysChoice;
  acceptDefaultPicks?: boolean;
}): WhatStaysChoice | undefined {
  return (
    dto.whatStaysChoice ?? (dto.acceptDefaultPicks ? 'default' : undefined)
  );
}

export const WHAT_STAYS_LOCKED_MESSAGE =
  'To change what stays, contact our support team.';

type Db = Parameters<typeof usageOverLimits>[0] &
  Parameters<typeof savedChoiceFor>[0];

/**
 * What the org is over on `target` that "choose what stays" fixes (null when
 * nothing), and whether their saved choice for it fits. A choice saved before
 * templates could be paused has no template picks (null): the default picks
 * apply to those, and they fit.
 */
export async function whatStaysConflict(
  db: Db,
  orgId: string,
  target: { id: string; limits: unknown },
): Promise<UsageConflictV2 | null> {
  const over = (await usageOverLimits(db, orgId, target)).filter(
    (o) => o.fixable,
  );
  if (!over.length) return null;
  const saved = await savedChoiceFor(db, orgId, target.id);
  const items = over.map((o) => ({
    key: o.key as UsageConflictV2['items'][number]['key'],
    limit: o.limit,
    used: o.used,
  }));
  const choicesFit =
    !!saved && items.every((i) => (saved[i.key]?.length ?? 0) <= i.limit);
  return { items, choicesFit };
}

/**
 * Refuse a plan change the org is over on until they've picked an option:
 * nothing picked, or 'saved' without a saved choice that fits →
 * choose_what_stays. Returns the conflict (null when nothing is over).
 */
export async function assertWhatStaysConfirmed(
  db: Db,
  orgId: string,
  target: { id: string; name: string; limits: unknown },
  choice: WhatStaysChoice | undefined,
): Promise<UsageConflictV2 | null> {
  const conflict = await whatStaysConflict(db, orgId, target);
  if (conflict) refuseUnlessPicked(target.name, conflict, choice);
  return conflict;
}

/** The same check when the conflict is already worked out (checkout preview). */
export function refuseUnlessPicked(
  planName: string,
  conflict: UsageConflictV2,
  choice: WhatStaysChoice | undefined,
): void {
  if (!choice) {
    throw billingError(
      'choose_what_stays',
      usageConflictMessage(planName, conflict),
    );
  }
  if (choice === 'saved' && !conflict.choicesFit) {
    throw billingError(
      'choose_what_stays',
      `Save your choice of what stays on ${planName} first, or keep the default picks.`,
    );
  }
}

/**
 * "Keep the default picks" means the defaults apply even when an earlier
 * choice was saved for that plan: drop it (whatStays.choice is then
 * 'default'). Call once the change is accepted.
 */
export async function applyWhatStaysChoice(
  db: Pick<PrismaClient, 'retentionChoice'>,
  orgId: string,
  targetPlanId: string,
  choice: WhatStaysChoice | undefined,
): Promise<void> {
  if (choice !== 'default') return;
  await db.retentionChoice.deleteMany({
    where: { organisationId: orgId, targetPlanId },
  });
}

export {
  OPEN_REQUEST_STATUSES,
  APPLIED_REQUEST_STATUSES,
  WHAT_STAYS_OLD_REQUEST_MESSAGE,
  adminCanEditWhatStays,
  currentPlanRequestId,
} from '../../common/utils/what-stays-rows.util';
import { OPEN_REQUEST_STATUSES } from '../../common/utils/what-stays-rows.util';

/**
 * Whether the org may no longer change what stays for `targetPlanId`:
 * - for a given request: once it's no longer pending / scheduled;
 * - otherwise: when the org is already on that plan (the change took
 *   effect — swapping what's paused on the current plan is Super Admin only).
 * Before a change is sent, while it's pending or scheduled, and in grace
 * before falling back to Basic, it's editable.
 */
export async function whatStaysLockedForOrg(
  db: Pick<PrismaClient, 'subscription' | 'packageChangeRequest'>,
  orgId: string,
  targetPlanId: string,
  requestId?: string,
): Promise<boolean> {
  if (requestId) {
    const request = await db.packageChangeRequest.findFirst({
      where: { id: requestId, orgId },
      select: { status: true },
    });
    if (!request) {
      throw billingError('request_not_found', 'That request was not found.');
    }
    return !(OPEN_REQUEST_STATUSES as readonly string[]).includes(
      request.status,
    );
  }
  const sub = await db.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
    select: { planId: true },
  });
  return sub?.planId === targetPlanId;
}
