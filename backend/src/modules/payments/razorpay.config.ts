/**
 * Razorpay credentials. Two sources, resolved by RazorpaySettingsService:
 *
 *   1. Super Admin → Integrations → Razorpay (billing.razorpay_settings).
 *      When a key id is saved there it wins, and changes apply without a
 *      restart.
 *   2. RAZORPAY_* env vars (backend/.env), read once at boot as a fallback:
 *      - none of the three set  -> no env fallback (endpoints answer 503
 *                                  "Payments not configured" unless the
 *                                  console has keys); the API still boots.
 *      - some but not all set   -> refuse to boot (a half-configured gateway
 *                                  would take money it can't verify).
 *      - malformed key id       -> refuse to boot.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: 'test' | 'live';
}

/** The env fallback (or null), injected by PaymentsModule. */
export const RAZORPAY_CONFIG = Symbol('RAZORPAY_CONFIG');

export const RAZORPAY_KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]+$/;

export function razorpayModeOf(keyId: string): 'test' | 'live' | null {
  const match = RAZORPAY_KEY_ID_PATTERN.exec(keyId);
  return match ? (match[1] as 'test' | 'live') : null;
}

export function loadRazorpayConfig(
  env: Record<string, string | undefined> = process.env,
): RazorpayConfig | null {
  const keyId = (env.RAZORPAY_KEY_ID ?? '').trim();
  const keySecret = (env.RAZORPAY_KEY_SECRET ?? '').trim();
  const webhookSecret = (env.RAZORPAY_WEBHOOK_SECRET ?? '').trim();

  const present = [keyId, keySecret, webhookSecret].filter(Boolean).length;
  if (present === 0) return null;
  if (present < 3) {
    throw new Error(
      'Razorpay is partly configured: set all of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET, or none of them.',
    );
  }

  const mode = razorpayModeOf(keyId);
  if (!mode) {
    throw new Error(
      'RAZORPAY_KEY_ID is malformed: expected rzp_test_… or rzp_live_….',
    );
  }

  return { keyId, keySecret, webhookSecret, mode };
}

/**
 * The webhook secret must be its own value. The key id is public (it is sent
 * to every browser that opens Checkout), so a webhook secret equal to it would
 * let anyone sign fake payment.captured events.
 */
export function webhookSecretProblem(
  keyId: string,
  keySecret: string,
  webhookSecret: string,
): string | null {
  if (webhookSecret === keyId) {
    return 'The Webhook Secret must not be the Key ID (the Key ID is public). Use the separate secret you set on the Razorpay webhook.';
  }
  if (webhookSecret === keySecret) {
    return 'The Webhook Secret must not be the Key Secret. Use the separate secret you set on the Razorpay webhook.';
  }
  return null;
}
