import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { expireStaleCheckouts } from '../billing/checkout-state';

// How often the expiry sweep re-runs. The online path (org billing read /
// publish attempt) applies the lifecycle lazily anyway, so this timer is only
// a safety net that guarantees transitions eventually happen even for orgs
// nobody touches — e.g. a grace period ends on a subscription the org hasn't
// opened in days.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class SubscriptionLifecycleSweeper
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SubscriptionLifecycleSweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.runOnce();

    if (process.env.NODE_ENV === 'test') return;

    // Set the interval but don't hold the process open with it — the app's
    // HTTP server is what keeps the process alive.
    this.timer = setInterval(() => {
      this.runOnce().catch(() => undefined);
    }, SWEEP_INTERVAL_MS);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    // Billing v2: online checkouts left unpaid past their 30 minutes.
    await expireStaleCheckouts(this.prisma).catch(() => undefined);
    try {
      const summary = await applyOrgSubscriptionLifecycle(this.prisma);
      if (
        summary.newlyPastDue ||
        summary.newlyExpired ||
        summary.newlyCancelled ||
        summary.movedToFreePlan ||
        summary.scheduledPlanApplied ||
        summary.expiringNotified ||
        summary.pastDueNotified ||
        summary.expiredNotified
      ) {
        this.logger.log(
          `Subscription lifecycle sweep applied: ${JSON.stringify(summary)}`,
        );
      }
      return summary;
    } catch (err: any) {
      // The lazy calls are resilience-wrapped already; a failure here must
      // never take down the (healthy) timer, just log and retry next tick.
      this.logger.warn(`Subscription lifecycle sweep failed: ${err?.message}`);
      return null;
    }
  }
}