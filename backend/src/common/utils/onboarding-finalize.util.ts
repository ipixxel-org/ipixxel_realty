import type { OnboardingStep } from '@prisma/client';
import { onboardingStepIndex } from './onboarding.util';
import {
  runTeamChatHook,
  teamChatUserActivated,
  type ChatDb,
} from './team-chat-membership.util';

const BASIC_PLAN_SLUG = 'basic';

// Minimal shape needed from PrismaService/TransactionClient — kept loose so
// both can call this from a $transaction and OrgApprovedGuard can call it
// directly off the injected PrismaService.
interface FinalizePrisma {
  organisation: {
    findUnique: (args: any) => Promise<{ status: string } | null>;
    update: (args: any) => Promise<unknown>;
  };
  subscription: {
    findFirst: (args: any) => Promise<{ id: string } | null>;
    create: (args: any) => Promise<unknown>;
  };
  plan: {
    findFirst: (args: any) => Promise<{ id: string; priceMonthly: number } | null>;
  };
  user: {
    update: (args: any) => Promise<unknown>;
  };
}

/**
 * The simplified wizard only has Account and Organisation — every other
 * OnboardingStep value (business_details, subscription, templates, modules,
 * invite, connect) is a step the UI no longer renders. A user parked on one
 * of those (from before this change, or from the old atomic `signup()`
 * fallback) already has a real organisation and should be treated as done,
 * not stuck. 'organisation' itself counts too: since createOrganisationStep
 * now finalizes onboarding in the same call, nothing going forward ever
 * leaves a user parked there — only a pre-existing row would be.
 */
export function isLegacyOnboardingStep(step: OnboardingStep): boolean {
  return step !== 'completed' && onboardingStepIndex(step) >= onboardingStepIndex('organisation');
}

/** Attaches the seeded Basic plan if the org doesn't already have a usable subscription. Never throws — a missing seed just means no auto-assignment, not a broken signup. */
export async function assignBasicPlanIfMissing(
  prisma: FinalizePrisma,
  orgId: string,
): Promise<void> {
  const existing = await prisma.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
  });
  if (existing) return;

  const basic = await prisma.plan.findFirst({
    where: { slug: BASIC_PLAN_SLUG, isActive: true },
  });
  if (!basic) return;

  await prisma.subscription.create({
    data: {
      orgId,
      planId: basic.id,
      billingCycle: 'monthly',
      status: 'active',
      amount: basic.priceMonthly,
      mrr: basic.priceMonthly,
      currency: 'INR',
      renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * Self-heals a draft parked on a step the simplified wizard removed: assigns
 * Basic if the org has no subscription yet, activates the organisation if
 * it's still draft/pending, and marks onboarding completed. Idempotent —
 * safe to call on every login/resume for a user past 'account'.
 */
export async function finalizeLegacyOnboardingDraft(
  prisma: FinalizePrisma & ChatDb,
  orgId: string,
  userId: string,
): Promise<void> {
  const organisation = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!organisation) return;

  if (organisation.status === 'draft' || organisation.status === 'pending') {
    await prisma.organisation.update({ where: { id: orgId }, data: { status: 'active' } });
  }

  await assignBasicPlanIfMissing(prisma, orgId);

  await prisma.user.update({ where: { id: userId }, data: { onboardingStep: 'completed' } });

  // The org is live now — make sure its General channel exists with this
  // user in it (idempotent; a no-op on every later call).
  await runTeamChatHook('legacy onboarding finalized', () =>
    teamChatUserActivated(prisma, orgId, userId),
  );
}
