/**
 * Razorpay credentials, read once from the environment at boot.
 *
 *   - none of the three set  -> payments are disabled (null); endpoints answer
 *                               503 "Payments not configured" and the API still
 *                               boots, so environments without keys keep working.
 *   - some but not all set   -> refuse to boot (a half-configured gateway would
 *                               take money it can't verify).
 *   - malformed key id       -> refuse to boot.
 *
 * Keys live in backend/.env only (see env.example). Never in the DB or git.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: 'test' | 'live';
}

export const RAZORPAY_CONFIG = Symbol('RAZORPAY_CONFIG');

const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]+$/;

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

  const match = KEY_ID_PATTERN.exec(keyId);
  if (!match) {
    throw new Error(
      'RAZORPAY_KEY_ID is malformed: expected rzp_test_… or rzp_live_….',
    );
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
    mode: match[1] as 'test' | 'live',
  };
}
