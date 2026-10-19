import type { PlatformConfigService } from '../platform-config/platform-config.service';
import type { RazorpaySettingsService } from '../payments/razorpay-settings.service';
import { decideBillingMode } from './billing-mode.service';
import type { OnlinePaymentsV2 } from './billing.types';

/**
 * The Online payments switch plus whether any gateway can take payments.
 * Same inputs and decision as BillingModeService.getMode(); also says which
 * gateway is usable, which the mode alone can't (switched off hides it).
 * Shared by Integrations → Online payments and the integrations status grid.
 */
export async function readOnlinePayments(
  platformConfig: Pick<PlatformConfigService, 'getOnlinePaymentsEnabled'>,
  razorpay: Pick<RazorpaySettingsService, 'resolve'>,
): Promise<OnlinePaymentsV2> {
  const [enabled, resolved] = await Promise.all([
    platformConfig.getOnlinePaymentsEnabled(),
    razorpay
      .resolve()
      .catch(() => ({ config: null, isActive: true, source: null })),
  ]);
  const mode = decideBillingMode({
    enabled,
    razorpayConfigured: resolved.config !== null,
    razorpayActive: resolved.isActive,
  });
  return {
    enabled,
    paymentMode: mode.mode,
    paymentModeReason: mode.reason,
    // resolve() only returns a config when the keys are complete and Razorpay is switched on.
    gateway: resolved.config !== null ? 'razorpay' : null,
  };
}
