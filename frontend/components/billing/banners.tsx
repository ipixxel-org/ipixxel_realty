"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatINR, packagePriceText, planPrice, renewalPriceNote, renewalPriceText, round2 } from "@/lib/billing/pricing";
import { blockingRequest, pendingRequestText, planChangeBlock } from "@/lib/billing/requests";
import { graceDayText, graceExtraDays } from "@/lib/billing/grace";
import type { BillingOverview, RetentionSummary } from "@/lib/billing/types";
import { useBillingEnv, useOptionalOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { Banner, BLink, CompactBanner, Countdown, useRenewalLive, WhatStaysLockedNote } from "./ui";

/** Re-fetch the shared overview after an action (no-op outside OrgBillingProvider). */
function useRefresh() {
  const ctx = useOptionalOrgBilling();
  return () => ctx?.refresh() ?? Promise.resolve();
}

/* ------------------------------------------------------------ Renew */

/** Statuses where the renewal can be paid (or, in manual mode, requested). */
export const RENEWAL_OPEN = ["renewal_due", "past_due", "grace_ending", "expired"] as const;

/** Is the renewal open for this org (a paid plan in the renewal window, grace or expired)? */
export function renewalOpen(o: BillingOverview): boolean {
  return !o.plan.isFree && (RENEWAL_OPEN as readonly string[]).includes(o.status);
}

/** A disabled renewal button with its reason as the tooltip. */
function DisabledRenew({ title, className, style, children }: { title: string; className: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <span title={title} style={{ display: "inline-flex", ...(style?.width ? { width: style.width } : null) }}>
      <button type="button" className={className} disabled style={{ ...style, opacity: 0.65, cursor: "not-allowed" }}>
        {children}
      </button>
    </span>
  );
}

const OFFLINE_RENEWAL = "Online payment isn't available for your account — our team will contact you to renew.";

/**
 * Manual mode: "Request renewal" opens the Plans page, where the current plan's
 * "Request renewal" starts the request (today's price, renewal coupon, GST).
 * While a request waits it's disabled with the same message as everywhere else.
 */
export function RequestRenewalButton({ overview, className = "btn btn-primary btn-sm" }: { overview: BillingOverview; className?: string }) {
  const { canEdit } = useBillingEnv();
  const waiting = blockingRequest(overview);
  if (waiting || !canEdit) {
    const renewalAsked = !!waiting?.label?.startsWith("Renewal of");
    return (
      <DisabledRenew title={waiting ? pendingRequestText(waiting) : "Ask an admin with billing access to request the renewal"} className={className}>
        {renewalAsked ? "Renewal requested" : `Request renewal · ${renewalPriceText(overview)}`}
      </DisabledRenew>
    );
  }
  return (
    <BLink to="plans" className={className} title={renewalPriceNote(overview) ?? undefined}>
      Request renewal · {renewalPriceText(overview)}
    </BLink>
  );
}

/** Pay the renewal online (opens the Plans page, current plan → Renew); in manual mode, request it instead. */
export function PayNowButton({ overview, className = "btn btn-primary btn-sm" }: { overview: BillingOverview; className?: string }) {
  const live = useRenewalLive(overview);
  const { canEdit } = useBillingEnv();
  // Manual mode (online payments off): the renewal is a request.
  if (!live && overview.paymentMode === "manual") return <RequestRenewalButton overview={overview} className={className} />;
  const label = `Pay now · ${renewalPriceText(overview)}`;
  if (!live || !canEdit) {
    return (
      <DisabledRenew title={!live ? OFFLINE_RENEWAL : "Ask an admin with billing access to pay"} className={className}>
        {label}
      </DisabledRenew>
    );
  }
  return (
    <BLink to="plans" className={className} title={renewalPriceNote(overview) ?? undefined}>
      {label}
    </BLink>
  );
}

/**
 * The current plan's button on the Plans page while the renewal is open:
 * "Renew" (online) or "Request renewal" (manual) — opens the renewal checkout.
 */
export function RenewPlanButton({ overview, className = "btn btn-primary", style }: { overview: BillingOverview; className?: string; style?: CSSProperties }) {
  const { canEdit } = useBillingEnv();
  const live = useRenewalLive(overview);
  const manual = !live && overview.paymentMode === "manual";
  const plan = overview.paidPlan ?? overview.plan;
  const label = (
    <>
      <Icon name="refresh" size={15} /> {manual ? "Request renewal" : "Renew"}
    </>
  );
  const waiting = manual ? blockingRequest(overview) : null;
  if (waiting) {
    const renewalAsked = !!waiting.label?.startsWith("Renewal of");
    return (
      <DisabledRenew title={pendingRequestText(waiting)} className={className} style={style}>
        {renewalAsked ? "Renewal requested" : label}
      </DisabledRenew>
    );
  }
  if (!canEdit || (!manual && !live)) {
    return (
      <DisabledRenew title={!canEdit ? "Ask an admin with billing access to renew" : OFFLINE_RENEWAL} className={className} style={style}>
        {label}
      </DisabledRenew>
    );
  }
  return (
    <BLink
      to="checkout"
      params={{ plan: plan.id, interval: overview.interval, renew: 1 }}
      className={className}
      style={style}
      title={renewalPriceNote(overview) ?? undefined}
    >
      {label}
    </BLink>
  );
}

/* --------------------------------------------------- Update payment method */

export function UpdatePaymentMethodButton({ overview, className = "btn btn-ghost btn-sm" }: { overview: BillingOverview; className?: string }) {
  const { client, canEdit } = useBillingEnv();
  const { toast } = useToast();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"card" | "upi">("card");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const pm = await client.updatePaymentMethod({ kind });
      setOpen(false);
      void refresh();
      toast({ variant: "success", title: "Payment method updated", description: `${pm.label} will be charged on renewal.` });
    } catch (e) {
      toast({ variant: "error", title: "Couldn't update the payment method", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={!canEdit} onClick={() => setOpen(true)}>
        <Icon name="edit" size={14} /> Update payment method
      </button>
      <BillingDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Update payment method"
        description="You'll approve the new method with your bank or UPI app."
        footer={
          <DialogActions>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Go back
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Authorise new method"}
            </button>
          </DialogActions>
        }
      >
        <div className="bl-stack" style={{ gap: 10 }}>
          {overview.paymentMethod ? (
            <div className="bl-muted">
              Currently on file: <b>{overview.paymentMethod.label}</b>
            </div>
          ) : null}
          {(["card", "upi"] as const).map((k) => (
            <label key={k} className="bl-tick-row" style={{ border: "1px solid var(--line-2)", borderRadius: 10 }}>
              <input type="radio" name="bl-method" checked={kind === k} onChange={() => setKind(k)} />
              <span className="bl-tick-main">
                <b>{k === "card" ? "Debit / credit card" : "UPI AutoPay"}</b>
                <span className="bl-muted">{k === "card" ? "Charged automatically on each renewal" : "Approve once in your UPI app"}</span>
              </span>
            </label>
          ))}
        </div>
      </BillingDialog>
    </>
  );
}

/* -------------------------------------------------------------- Picks */

export function PicksSummary({ retention }: { retention: RetentionSummary }) {
  const list = (names: string[]) => names.join(", ") || "none";
  return (
    <div className="bl-picks">
      <div className="bl-muted" style={{ fontWeight: 700 }}>
        {retention.isDefault ? `What stays on ${retention.targetPlanName} (picked for you — you can change it)` : `What stays on ${retention.targetPlanName} (your choice)`}
      </div>
      <div>
        <b>Users:</b> {list(retention.users)}
      </div>
      <div>
        <b>Projects:</b> {list(retention.projects)}
      </div>
      <div>
        <b>Landing pages:</b> {list(retention.landingPages)}
      </div>
      {retention.templates ? (
        <div>
          <b>Templates:</b> {list(retention.templates)}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ Banners */

/** "Keep <plan>": undo a scheduled change (banner, and the Requests list). */
export function UndoButton({ label, run, done, onDone }: { label: string; run: () => Promise<unknown>; done: string; onDone?: () => void }) {
  const { canEdit } = useBillingEnv();
  const { toast } = useToast();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={!canEdit || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
          await refresh();
          toast({ variant: "success", title: done });
          onDone?.();
        } catch (e) {
          toast({ variant: "error", title: "Couldn't undo", description: e instanceof Error ? e.message : undefined });
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}

/**
 * A change to Basic / a smaller plan is scheduled, so this plan change can't
 * start: the message, "Keep <plan>" (undo) and the way back to the plans.
 * Shown instead of the checkout / downgrade form.
 */
export function ScheduledChangeNote({ overview: o }: { overview: BillingOverview }) {
  const { client } = useBillingEnv();
  const block = planChangeBlock(o);
  if (block?.reason !== "change_scheduled") return null;
  const plan = o.paidPlan ?? o.plan;
  return (
    <div data-testid="change-scheduled-note">
      <Banner
        tone="amber"
        icon="calendar"
        title={
          o.downgradeTo
            ? `Change to ${o.downgradeTo.name} scheduled for ${formatDate(o.downgradeAt!)}`
            : `Change to Basic scheduled for ${formatDate(o.cancelAt!)}`
        }
        actions={
          <>
            {o.downgradeTo ? (
              <>
                <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                  Choose what stays
                </BLink>
                <UndoButton label={`Keep ${plan.name}`} run={() => client.undoDowngrade()} done={`You'll stay on ${plan.name}.`} />
              </>
            ) : (
              <UndoButton label={`Keep ${plan.name}`} run={() => client.undoCancel()} done={`You'll stay on ${plan.name} — it renews as usual.`} />
            )}
            <BLink to="plans" className="btn btn-ghost btn-sm">
              See plans
            </BLink>
          </>
        }
      >
        {block.message}
      </Banner>
    </div>
  );
}

/** Days the countdown chip shows: to the renewal, or (in grace) to the end of grace. */
function daysLeft(o: BillingOverview): number {
  return o.daysLeftInPeriod > 0 ? o.daysLeftInPeriod : o.graceDaysLeft;
}

const left = (n: number) => `${n} ${n === 1 ? "day" : "days"} left`;

/**
 * The banner for the org's billing situation, or nothing when all is well.
 * Compact: one line, the countdown chip and the buttons; "See what stays"
 * opens the list in place; X shrinks it to a strip until tomorrow.
 * Yellow (amber) for every reminder, grace day and scheduled change — the last day too.
 */
export function BillingBanner({ overview }: { overview: BillingOverview }) {
  const { client } = useBillingEnv();
  const live = useRenewalLive(overview);
  // Manual mode: renewing and changing plan are both requests to our team.
  const manual = !live && overview.paymentMode === "manual";
  const o = overview;
  const plan = o.paidPlan ?? o.plan;
  // Auto-renew copy only when the backend offers it (it doesn't yet: "pay each time").
  const auto = o.renewalMode === "auto" && o.autoRenewAvailable;
  const picks = o.retention ? <PicksSummary retention={o.retention} /> : undefined;
  const n = daysLeft(o);
  const chip = n > 0 ? <Countdown days={n} /> : undefined;

  switch (o.status) {
    case "renewal_due":
      return auto ? (
        <CompactBanner
          state={o.status}
          tone="info"
          icon="calendar"
          title={`${renewalPriceText(o)} will be charged on ${formatDate(o.periodEnd!)}`}
          line={<>Your {plan.name} plan renews automatically{o.paymentMethod ? ` using ${o.paymentMethod.label}` : ""}. Nothing to do.</>}
          actions={<UpdatePaymentMethodButton overview={o} />}
          strip={`Renews automatically on ${formatDate(o.periodEnd!)}`}
        />
      ) : (
        <CompactBanner
          state={o.status}
          tone="amber"
          icon="calendar"
          aside={chip}
          title={o.downgradeTo ? `Your plan changes to ${o.downgradeTo.name} on ${formatDate(o.periodEnd!)}` : `Your ${plan.name} plan renews on ${formatDate(o.periodEnd!)}`}
          line={
            <>
              Pay {renewalPriceText(o)} before then to keep everything running
              {o.downgradeTo ? ` — that's ${o.downgradeTo.name} (${o.downgradeInterval ?? o.interval}) from then on` : ""}.
            </>
          }
          actions={<PayNowButton overview={o} />}
          strip={`Renewal due · ${o.daysLeftInPeriod > 0 ? left(o.daysLeftInPeriod) : "today"}`}
        />
      );

    case "past_due":
    case "grace_ending": {
      const tomorrow = o.status === "grace_ending";
      const extra = graceExtraDays(o) > 0;
      const pausedNote = "Everything else is paused, never deleted.";
      return (
        <CompactBanner
          state={o.status}
          tone="amber"
          icon="alert"
          aside={<Countdown days={o.graceDaysLeft} />}
          title={
            tomorrow
              ? `Grace ends tomorrow — on ${formatDate(o.graceEndsAt!)} ${o.orgName} moves to Basic`
              : auto
                ? `We couldn't charge ${o.paymentMethod?.label ?? "your saved payment method"} on ${formatDate(o.dueDate!)}`
                : `${plan.name} renewal overdue`
          }
          line={
            tomorrow ? (
              <>
                {extra ? `${graceDayText(o)}. ` : ""}
                {manual ? "Request the renewal (or a different plan) to keep a paid plan." : `Pay now to keep ${plan.name}.`}
                {picks ? "" : ` Otherwise only what stays on Basic is active. ${pausedNote}`}
              </>
            ) : (
              <>
                {graceDayText(o)}
                {auto ? " — we'll try the charge again every day" : ""}. Everything keeps working until {formatDate(o.graceEndsAt!)}; after that you move to Basic.
              </>
            )
          }
          details={
            picks ? (
              <>
                <span className="bl-muted">
                  {tomorrow ? "Otherwise only what's listed below stays active." : "If the renewal isn't paid, only what's listed below stays active on Basic."} {pausedNote}
                </span>
                {picks}
              </>
            ) : undefined
          }
          actions={
            <>
              <PayNowButton overview={o} />
              {manual ? (
                <BLink to="plans" className="btn btn-ghost btn-sm">
                  Change plan
                </BLink>
              ) : null}
              {auto && !tomorrow ? <UpdatePaymentMethodButton overview={o} /> : null}
              <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                Choose what stays
              </BLink>
            </>
          }
          strip={`${tomorrow ? "Grace ends tomorrow" : "Renewal overdue"} · ${left(o.graceDaysLeft)}`}
        />
      );
    }

    case "expired":
      return (
        <CompactBanner
          state={o.status}
          tone="amber"
          icon="alert"
          title={`Your ${plan.name} plan has expired`}
          line={
            <>
              Publishing is paused{o.dueDate ? ` since the renewal on ${formatDate(o.dueDate)} wasn't paid` : ""}. Nothing was deleted and leads keep coming in. Renew to bring
              your live pages back.
            </>
          }
          details={picks}
          actions={
            <>
              <PayNowButton overview={o} />
              <BLink to="plans" className="btn btn-ghost btn-sm">
                See plans
              </BLink>
            </>
          }
          strip={`${plan.name} expired · publishing paused`}
        />
      );

    case "moved_to_basic":
      return (
        <CompactBanner
          state={o.status}
          tone="gray"
          icon="pause"
          title={`You're on Basic now — ${plan.name} ended on ${formatDate(o.movedToBasicAt!)}`}
          line={
            <>
              {o.locked.users} users paused, {o.locked.projects} projects view-only, {o.locked.landingPages} landing pages offline
              {o.locked.templates ? `, ${o.locked.templates} template${o.locked.templates === 1 ? "" : "s"} paused` : ""}. Nothing was deleted and leads keep coming in. Buy
              again and everything comes back straight away.
            </>
          }
          details={picks}
          actions={
            <>
              <BLink to="checkout" params={{ plan: plan.id, interval: o.interval }} className="btn btn-primary btn-sm">
                Buy {plan.name} again · {packagePriceText(planPrice(plan, o.interval))}
              </BLink>
              {/* The move took effect: what stays is view-only for the org now. */}
              <WhatStaysLockedNote />
            </>
          }
          strip={`On Basic now · ${plan.name} items paused, not deleted`}
        />
      );

    case "cancellation_scheduled":
      return (
        <CompactBanner
          state={o.status}
          tone="amber"
          icon="calendar"
          aside={chip}
          title={`Change to Basic scheduled for ${formatDate(o.cancelAt!)}`}
          line={
            <>
              You keep {plan.name} until then. After that {o.orgName} moves to Basic{auto ? " and automatic payments stop" : ""}.
            </>
          }
          details={picks}
          actions={<UndoButton label={`Keep ${plan.name}`} run={() => client.undoCancel()} done={`You'll stay on ${plan.name} — it renews as usual.`} />}
          strip={`Change to Basic scheduled${n > 0 ? ` · ${left(n)}` : ""}`}
        />
      );

    case "downgrade_scheduled":
      return (
        <CompactBanner
          state={o.status}
          tone="amber"
          icon="arrow-down"
          aside={chip}
          title={`Change to ${o.downgradeTo!.name} scheduled for ${formatDate(o.downgradeAt!)}`}
          line={
            <>
              You keep {plan.name} until then. From {formatDate(o.downgradeAt!)} you&apos;ll pay{" "}
              {packagePriceText(planPrice(o.downgradeTo!, o.downgradeInterval ?? o.interval))} per {(o.downgradeInterval ?? o.interval) === "yearly" ? "year" : "month"}.
            </>
          }
          details={picks}
          actions={
            <>
              <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                Choose what stays
              </BLink>
              <UndoButton label={`Keep ${plan.name}`} run={() => client.undoDowngrade()} done={`You'll stay on ${plan.name}.`} />
            </>
          }
          strip={`Change to ${o.downgradeTo!.name} scheduled${n > 0 ? ` · ${left(n)}` : ""}`}
        />
      );

    default:
      return null;
  }
}

/** Option B: the "renews in N days" popup (from the reminder setting). Opens on its own once per renewal date. */
export function RenewalReminderPopup({ overview, alwaysOpen = false }: { overview: BillingOverview; alwaysOpen?: boolean }) {
  const { nav, canEdit } = useBillingEnv();
  const key = `billing-v2:reminder-dismissed:${overview.periodEnd}`;
  const [dismissed, setDismissed] = useState(() => {
    if (alwaysOpen || typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  };
  const plan = overview.paidPlan ?? overview.plan;
  const b = overview.renewalBreakdown;
  const price = b?.price ?? (overview.interval === "yearly" ? plan.priceYearly : plan.priceMonthly);
  const left = overview.daysLeftInPeriod;
  const live = useRenewalLive(overview);
  // Manual mode: the popup offers "Request renewal" (not while a request already waits).
  const manual = !live && overview.paymentMode === "manual";
  const show =
    (live || (manual && canEdit && !blockingRequest(overview))) && overview.renewalMode === "manual" && overview.status === "renewal_due" && (!dismissed || alwaysOpen);

  return (
    <>
      <BillingDialog
        open={show}
        onClose={dismiss}
        title={left > 0 ? `Your ${plan.name} plan renews in ${left} ${left === 1 ? "day" : "days"}` : `Your ${plan.name} plan renews today`}
        description={`Renewal date: ${overview.periodEnd ? formatDate(overview.periodEnd) : ""}. ${manual ? "Send a renewal request so nothing is interrupted — our team confirms how to pay." : "Pay now so nothing is interrupted."}`}
        footer={
          <DialogActions>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
              Remind me later
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                dismiss();
                // Both modes: the Plans page, where the current plan's Renew / Request renewal opens the checkout.
                nav.go("plans");
              }}
            >
              {manual ? "Request renewal" : "Pay now"} · {renewalPriceText(overview)}
            </button>
          </DialogActions>
        }
      >
        <div className="bl-breakdown">
          <div className="bl-line">
            <span>
              {b?.planName ?? plan.name} · {b?.interval ?? overview.interval}
            </span>
            <span>{formatINR(price)}</span>
          </div>
          {b && b.couponDiscount > 0 ? (
            <div className="bl-line">
              <span>Coupon{b.couponCode ? ` ${b.couponCode}` : ""}</span>
              <span>−{formatINR(b.couponDiscount)}</span>
            </div>
          ) : null}
          <div className="bl-line">
            <span>GST 18%</span>
            <span>{formatINR(b?.gst ?? round2((overview.renewalAmount ?? 0) - price))}</span>
          </div>
          <div className="bl-line total">
            <span>Total</span>
            <span>{formatINR(overview.renewalAmount ?? 0)}</span>
          </div>
        </div>
      </BillingDialog>
    </>
  );
}
