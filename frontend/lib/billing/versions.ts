/**
 * Plan versions, for the org: "Starter (v2)", and what the plan's newer
 * version changes and when (BillingOverview.nextVersion) — the wording the
 * banner and the current-plan card share.
 */
import { formatDate, packagePriceText } from "./pricing";
import type { BillingOverview, NextPlanVersion } from "./types";

/** "Starter (v2)" — the plan with the version the org is on. */
export function planNameWithVersion(o: Pick<BillingOverview, "plan" | "planVersion">): string {
  return o.planVersion ? `${o.plan.name} (v${o.planVersion})` : o.plan.name;
}

/** "₹2,500 + GST a month (was ₹2,000)" — the new price for the org's interval. */
export function versionPriceText(v: NextPlanVersion): string | null {
  if (!v.price) return null;
  const per = v.price.interval === "yearly" ? "a year" : "a month";
  return `${packagePriceText(v.price.to)} ${per} (was ${packagePriceText(v.price.from, { gst: false })})`;
}

/**
 * The headline:
 * - "Starter changes at your renewal on 26 Nov 2026" (limits / features change);
 * - "Starter will be ₹1,199 + GST from 26 Nov 2026" (only the price changes);
 * - Basic: "Basic changes on 6 Nov 2026".
 */
export function nextVersionTitle(v: NextPlanVersion): string {
  const on = formatDate(v.at);
  if (v.reason === "basic") return `${v.planName} changes on ${on}`;
  if (!v.changes.length && v.price) return `${v.planName} will be ${packagePriceText(v.price.to)} from ${on}`;
  return `${v.planName} changes at your renewal on ${on}`;
}

/** "From then: 3 users instead of 5, no Team chat. ₹2,500 + GST a month (was ₹2,000)." */
export function nextVersionLine(v: NextPlanVersion): string {
  const parts: string[] = [];
  if (v.changes.length) parts.push(`From then: ${v.changes.map((c) => c.text).join(", ")}.`);
  const price = versionPriceText(v);
  if (price && v.changes.length) parts.push(`${price}.`);
  if (price && !v.changes.length) parts.push(`Was ${packagePriceText(v.price!.from)}. Nothing else changes.`);
  if (v.lower) parts.push("Choose what stays — otherwise the default picks apply. Nothing is deleted.");
  return parts.join(" ");
}

/** Short form for a busy banner: "3 users instead of 5, no Team chat", or the new price. */
export function nextVersionShort(v: NextPlanVersion): string {
  return v.changes.length ? v.changes.map((c) => c.text).join(", ") : (versionPriceText(v) ?? "");
}
