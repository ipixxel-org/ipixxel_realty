"use client";

import type { ReactNode } from "react";
import { formatDate } from "@/lib/billing/pricing";
import type { BillingNotice } from "@/lib/billing/types";
import { CompactBanner, Countdown } from "./ui";

/**
 * The billing banner for people who can't manage billing (no billing:edit):
 * the same situation in words, no amounts, and instead of the action buttons
 * a line saying who can act. Built from GET /org/billing/notice, or from the
 * overview (noticeFromOverview) for people who can view billing.
 */

const left = (n: number) => `${n} ${n === 1 ? "day" : "days"} left`;

/** The muted line that replaces the banner's buttons. */
export function AskAdmin({ children }: { children: ReactNode }) {
  return (
    <span className="bl-muted" data-testid="billing-ask-admin">
      {children}
    </span>
  );
}

/** "2 users paused, 1 landing page offline" — only what's paused; "" when nothing is. */
function pausedText(l: BillingNotice["locked"]): string {
  const part = (n: number, one: string, many: string, what: string) => (n ? `${n} ${n === 1 ? one : many} ${what}` : null);
  return [
    part(l.users, "user", "users", "paused"),
    part(l.projects, "project", "projects", "view-only"),
    part(l.landingPages, "landing page", "landing pages", "offline"),
    part(l.templates, "template", "templates", "paused"),
  ]
    .filter(Boolean)
    .join(", ");
}

export function MemberBillingBanner({ notice: n, picks }: { notice: BillingNotice; picks?: ReactNode }) {
  const plan = n.planName;
  const days = n.daysLeftInPeriod > 0 ? n.daysLeftInPeriod : n.graceDaysLeft;
  const chip = days > 0 ? <Countdown days={days} /> : undefined;
  const decides = <AskAdmin>Your organisation admin decides what stays active.</AskAdmin>;

  switch (n.status) {
    case "renewal_due":
      return (
        <CompactBanner
          state={n.status}
          tone="amber"
          icon="calendar"
          aside={chip}
          title={n.downgradeToName ? `Your plan changes to ${n.downgradeToName} on ${formatDate(n.periodEnd!)}` : `Your ${plan} plan renews on ${formatDate(n.periodEnd!)}`}
          line="It needs renewing before then to keep everything running."
          actions={<AskAdmin>Ask your organisation admin to renew.</AskAdmin>}
          strip={`Renewal due · ${n.daysLeftInPeriod > 0 ? left(n.daysLeftInPeriod) : "today"}`}
        />
      );

    case "past_due":
      return (
        <CompactBanner
          state={n.status}
          tone="amber"
          icon="alert"
          aside={<Countdown days={n.graceDaysLeft} />}
          title={`Your ${plan} plan's renewal is overdue`}
          line={`Some users, projects and pages may pause on ${formatDate(n.graceEndsAt!)} unless it's renewed.`}
          details={picks}
          actions={<AskAdmin>Ask your organisation admin to renew.</AskAdmin>}
          strip={`Renewal overdue · ${left(n.graceDaysLeft)}`}
        />
      );

    case "grace_ending":
      return (
        <CompactBanner
          state={n.status}
          tone="amber"
          icon="alert"
          aside={<Countdown days={n.graceDaysLeft} />}
          title={`Last day of ${plan}`}
          line={`From tomorrow ${n.orgName} moves to Basic.`}
          details={picks}
          actions={<AskAdmin>Ask your organisation admin to renew today.</AskAdmin>}
          strip={`Grace ends tomorrow · ${left(n.graceDaysLeft)}`}
        />
      );

    case "expired":
      return (
        <CompactBanner
          state={n.status}
          tone="amber"
          icon="alert"
          title={`Your ${plan} plan has expired`}
          line="Publishing is paused. Nothing was deleted and leads keep coming in."
          details={picks}
          actions={<AskAdmin>Ask your organisation admin to renew.</AskAdmin>}
          strip={`${plan} expired · publishing paused`}
        />
      );

    case "moved_to_basic": {
      const paused = pausedText(n.locked);
      return (
        <CompactBanner
          state={n.status}
          tone="gray"
          icon="pause"
          title="Your organisation is on Basic now"
          line={`${paused ? `${paused}. ` : ""}Nothing was deleted and leads keep coming in.`}
          details={picks}
          actions={<AskAdmin>Ask your organisation admin to buy a plan again.</AskAdmin>}
          strip={`On Basic now · ${plan} items paused, not deleted`}
        />
      );
    }

    case "cancellation_scheduled":
      return (
        <CompactBanner
          state={n.status}
          tone="amber"
          icon="calendar"
          aside={chip}
          title={`Your plan changes to Basic on ${formatDate(n.cancelAt!)}`}
          line={`You keep ${plan} until then.`}
          details={picks}
          actions={decides}
          strip={`Change to Basic scheduled${days > 0 ? ` · ${left(days)}` : ""}`}
        />
      );

    case "downgrade_scheduled":
      return (
        <CompactBanner
          state={n.status}
          tone="amber"
          icon="arrow-down"
          aside={chip}
          title={`Your plan changes to ${n.downgradeToName} on ${formatDate(n.downgradeAt!)}`}
          line={`You keep ${plan} until then.`}
          details={picks}
          actions={decides}
          strip={`Change to ${n.downgradeToName} scheduled${days > 0 ? ` · ${left(days)}` : ""}`}
        />
      );

    default: {
      // A newer version of the plan lowers a limit or switches a feature off.
      const v = n.nextVersion;
      if (!v) return null;
      const title = v.reason === "basic" ? `Your plan changes to ${v.planName} on ${formatDate(v.at)}` : `Your ${v.planName} plan changes on ${formatDate(v.at)}`;
      return (
        <CompactBanner
          state="renewal-change"
          tone="amber"
          icon="calendar"
          title={title}
          line={v.answered ? "Your organisation admin has chosen what stays active." : undefined}
          details={v.overLimit && !v.answered ? picks : undefined}
          actions={v.answered ? undefined : decides}
          strip={title}
        />
      );
    }
  }
}
