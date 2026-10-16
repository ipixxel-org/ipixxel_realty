import { Injectable } from '@nestjs/common';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { RazorpaySettingsService } from '../payments/razorpay-settings.service';
import type { ManualReason, PaymentMode } from './billing.types';

export interface BillingMode {
  mode: PaymentMode;
  /** Why it's manual; null when online. */
  reason: ManualReason | null;
}

/**
 * Pure decision, unit-tested on every combination:
 *  - switch off                                  → manual / switched_off
 *  - switch on, Razorpay turned off in console   → manual / gateway_disabled
 *  - switch on, no usable keys                   → manual / keys_missing
 *  - switch on, usable keys                      → online
 */
export function decideBillingMode(input: {
  enabled: boolean;
  razorpayConfigured: boolean;
  razorpayActive: boolean;
}): BillingMode {
  if (!input.enabled) return { mode: 'manual', reason: 'switched_off' };
  if (!input.razorpayActive)
    return { mode: 'manual', reason: 'gateway_disabled' };
  if (!input.razorpayConfigured)
    return { mode: 'manual', reason: 'keys_missing' };
  return { mode: 'online', reason: null };
}

/**
 * Online plan payments need BOTH the Super Admin switch
 * (platform_configs.online_payments_enabled) and a usable Razorpay config
 * (console keys or the RAZORPAY_* env fallback, not soft-disabled). Anything
 * else is manual: upgrades go to Super Admin for approval.
 */
@Injectable()
export class BillingModeService {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly razorpay: RazorpaySettingsService,
  ) {}

  async getMode(): Promise<BillingMode> {
    const [enabled, resolved] = await Promise.all([
      this.platformConfig.getOnlinePaymentsEnabled(),
      this.razorpay
        .resolve()
        .catch(() => ({ config: null, isActive: true, source: null })),
    ]);
    return decideBillingMode({
      enabled,
      razorpayConfigured: resolved.config !== null,
      razorpayActive: resolved.isActive,
    });
  }
}
