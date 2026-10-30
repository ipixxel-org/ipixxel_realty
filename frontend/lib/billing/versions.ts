/**
 * Plan versions, for the org. Organisations never see version numbers — only
 * the plan name. When the plan's newer version (BillingOverview.nextVersion)
 * is worse for them — a lower limit, a feature switched off, or a higher
 * price — the banner, the renewal popup and the current-plan card say what
 * gets worse, in one sentence:
 *   "From your next renewal on 26 Nov 2026, Starter includes 3 users (you
 *    have 5) and costs ₹1,199 + GST."
 * During grace (renewal overdue) it's "When you renew, …". Nothing is shown
 * when the new version is the same or better.
 * The backend's in-app reminder uses the same rule and wording
 * (plan-version-change.util.ts → worseNoticeText).
 */
import { formatDate, packagePriceText } from "./pricing";
import type { BillingOverview, NextPlanVersion, PlanVersionChange } from "./types";

export interface RenewalChangeNotice {
  /** "From your next renewal on 26 Nov 2026, Starter includes 3 users (you have 5) and costs ₹1,199 + GST." */
  text: string;
  /** Headline: "Changes at your next renewal" (Basic: "Basic changes on 6 Nov 2026"). */
  title: string;
  /** Using more than a new limit allows: "Choose what stays" applies. */
  overLimit: boolean;
}

/** Today as YYYY-MM-DD in the browser's time zone. */
function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const OVERDUE = new Set(["past_due", "grace_ending", "expired"]);

/** "3 users", "1 live landing page". */
function count(n: number, label: string): string {
  return `${n} ${n === 1 ? label.replace(/s$/, "") : label}`;
}

function andList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The price rise for the org's interval, or null (same or cheaper). */
function priceRise(v: NextPlanVersion): string | null {
  if (!v.price || v.price.to <= v.price.from) return null;
  return `${packagePriceText(v.price.to)}${v.price.interval === "yearly" ? " a year" : ""}`;
}

/**
 * What gets worse in the plan's newer version, or null when nothing does
 * (same or better: no notice). Lists only what gets worse.
 */
export function renewalChangeNotice(
  o: Pick<BillingOverview, "nextVersion" | "usage" | "status">,
  now: string = today(),
): RenewalChangeNotice | null {
  const v = o.nextVersion;
  if (!v) return null;
  const used = (c: PlanVersionChange) => o.usage.find((u) => u.key === c.key)?.used;
  const worse = v.changes.filter((c) => c.lower);
  const items = worse.map((c) => {
    if (c.kind === "feature") return `no ${c.label}`;
    const have = used(c);
    const was = have ?? c.from;
    return `${count(c.to as number, c.label)} (${have !== undefined ? "you have" : "now"} ${was === null ? "unlimited" : String(was)})`;
  });
  const price = priceRise(v);
  if (!items.length && !price) return null;

  const basic = v.reason === "basic";
  const when = basic
    ? `From ${formatDate(v.at)}`
    : OVERDUE.has(o.status) || v.at <= now
      ? "When you renew"
      : `From your next renewal on ${formatDate(v.at)}`;
  const what = items.length ? `includes ${andList(items)}${price ? ` and costs ${price}` : ""}` : `costs ${price}`;
  return {
    text: `${when}, ${v.planName} ${what}.`,
    title: basic ? `${v.planName} changes on ${formatDate(v.at)}` : "Changes at your next renewal",
    overLimit: worse.some((c) => {
      const have = used(c);
      return c.kind === "limit" && c.to !== null && have !== undefined && have > (c.to as number);
    }),
  };
}
