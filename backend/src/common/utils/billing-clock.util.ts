// ---------------------------------------------------------------------------
// Billing clock — "now" for the subscription lifecycle and billing v2.
//
// Testing aid: outside production, BILLING_CLOCK_OVERRIDE moves the billing
// clock so renewals, grace and fall back to Basic can be tried without
// editing dates in the database. Accepted values:
//   - an ISO date or datetime: "2026-11-20" or "2026-11-20T09:00:00Z"
//   - an offset from the real time: "+10d", "-2d", "+36h"
// Ignored (real time) when NODE_ENV=production, when unset, or when the value
// can't be read. Only billing decisions use it (lifecycle sweep, overview,
// quotes, period dates); timestamps on rows (createdAt, Razorpay orders,
// invoices) stay real.
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

/** The override as a function of the real time, or null when none applies. */
export function parseClockOverride(
  raw: string | undefined,
  nodeEnv: string | undefined,
): ((real: Date) => Date) | null {
  if (nodeEnv === 'production') return null;
  const v = raw?.trim();
  if (!v) return null;
  const offset = /^([+-])(\d+(?:\.\d+)?)([dh])$/i.exec(v);
  if (offset) {
    const sign = offset[1] === '-' ? -1 : 1;
    const ms =
      Number(offset[2]) * (offset[3].toLowerCase() === 'd' ? 24 : 1) * HOUR_MS;
    return (real) => new Date(real.getTime() + sign * ms);
  }
  const fixed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v,
  );
  if (Number.isNaN(fixed)) return null;
  return () => new Date(fixed);
}

/** Now, for billing — the override when one applies (never in production). */
export function billingNow(): Date {
  const real = new Date();
  const override = parseClockOverride(
    process.env.BILLING_CLOCK_OVERRIDE,
    process.env.NODE_ENV,
  );
  return override ? override(real) : real;
}

/**
 * Billing v2 on the server (BILLING_V2=true, set together with the frontend's
 * NEXT_PUBLIC_BILLING_V2). The only behaviour it changes: when grace ends
 * unpaid, the org always falls back to Basic, whatever the stored legacy
 * setting says (restrict / cancel).
 */
export function isBillingV2Server(): boolean {
  return process.env.BILLING_V2 === 'true';
}
