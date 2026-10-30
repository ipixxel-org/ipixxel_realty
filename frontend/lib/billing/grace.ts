import type { BillingOverview } from "./types";

type GraceFields = Pick<BillingOverview, "graceDay" | "graceDays" | "graceExtraDays">;

/** Extra grace days our team added (Super Admin "extend grace"); 0 when none. */
export function graceExtraDays(o: Pick<BillingOverview, "graceExtraDays">): number {
  return Math.max(0, o.graceExtraDays ?? 0);
}

/** Total grace the org gets: the usual days plus any extra days from our team. */
export function graceTotalDays(o: Pick<BillingOverview, "graceDays" | "graceExtraDays">): number {
  return o.graceDays + graceExtraDays(o);
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * "Day 3 of 7", or with an extension "Day 8 of 10 (7 days + 3 extra days from
 * our team)". Same total as the countdown (graceDaysLeft counts to graceEndsAt,
 * which includes the extension).
 */
export function graceDayText(o: GraceFields): string {
  const extra = graceExtraDays(o);
  const base = `Day ${o.graceDay} of ${graceTotalDays(o)}`;
  return extra > 0 ? `${base} (${days(o.graceDays)} + ${extra} extra ${extra === 1 ? "day" : "days"} from our team)` : base;
}
