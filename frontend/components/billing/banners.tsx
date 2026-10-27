"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatINR, packagePriceText, planPrice, renewalPriceNote, renewalPriceText, round2 } from "@/lib/billing/pricing";
import { blockingRequest, pendingRequestText, planChangeBlock } from "@/lib/billing/requests";
import type { BillingOverview, RetentionSummary } from "@/lib/billing/types";
import { useBillingEnv, useOptionalOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { usePayment } from "./payment";
import { Banner, BLink, useRenewalLive } from "./ui";

/** Re-fetch the shared overview after an action (no-op outside OrgBillingProvider). */
function useRefresh() {
  const ctx = useOptionalOrgBilling();
  return () => ctx?.refresh() ?? Promise.resolve();
}

/* ------------------------------------------------------------- Pay now */

/**
 * Pay the renewal. With saved billing details it opens the payment straight
 * away; without them (first online payment) it goes to the renewal checkout,
 * which collects them and shows the GST invoice summary.
 */
export function usePayNow(overview: BillingOverview) {
  const { toast } = useToast();
  const refresh = useRefresh();
  const { nav } = useBillingEnv();
  const plan = overview.paidPlan ?? overview.plan;
  const payment = usePayment({
    renewalMode: overview.renewalMode,
    // Same plan before and after: wait for the new period end instead.
    isApplied: (ov) => ov.periodEnd !== overview.periodEnd,
    title: `${plan.name} renewal`,
    subtitle: `${plan.name} · ${overview.interval} · incl. 18% GST · ${overview.orgName}`,
    onActive: (r) => {
      void refresh();
      toast({ variant: "success", title: `Payment received — ${r.planName || plan.name} is active`, description: r.activeUntil ? `Paid ${formatINR(r.amount)}. Next renewal ${formatDate(r.activeUntil)}.` : `Paid ${formatINR(r.amount)}.` });
    },
    onFailed: (reason) => toast({ variant: "error", title: "Payment failed", description: reason }),
    onClosed: () => toast({ variant: "info", title: "Payment not completed", description: "The payment window was closed. Nothing was charged." }),
  });
  // Incomplete organisation details: the renewal checkout shows what to fill in.
  const renew = () =>
    overview.billingDetailsMissing.length === 0
      ? payment.start({ planId: plan.id, interval: overview.interval, purpose: "renewal" })
      : Promise.resolve(nav.go("checkout", { plan: plan.id, interval: overview.interval, renew: 1 }));
  return { ...payment, renew };
}

/** Statuses where the renewal can be paid (or, in manual mode, requested). */
export const RENEWAL_OPEN = ["renewal_due", "past_due", "grace_ending", "expired"] as const;

/**
 * Manual mode: "Request renewal" opens the renewal request (today's price,
 * renewal coupon, GST) — our team approves it once it's paid. While a request
 * waits it's disabled with the same message as everywhere else.
 */
export function RequestRenewalButton({ overview, className = "btn btn-primary btn-sm" }: { overview: BillingOverview; className?: string }) {
  const { canEdit } = useBillingEnv();
  const waiting = blockingRequest(overview);
  const plan = overview.paidPlan ?? overview.plan;
  if (waiting || !canEdit) {
    const renewalAsked = !!waiting?.label?.startsWith("Renewal of");
    return (
      <span title={waiting ? pendingRequestText(waiting) : "Ask an admin with billing access to request the renewal"} style={{ display: "inline-flex" }}>
        <button type="button" className={className} disabled style={{ opacity: 0.65, cursor: "not-allowed" }}>
          {renewalAsked ? "Renewal requested" : `Request renewal · ${renewalPriceText(overview)}`}
        </button>
      </span>
    );
  }
  return (
    <BLink to="checkout" params={{ plan: plan.id, interval: overview.interval, renew: 1 }} className={className} title={renewalPriceNote(overview) ?? undefined}>
      Request renewal · {renewalPriceText(overview)}
    </BLink>
  );
}

/** Pay the renewal online; in manual mode, request it instead. */
export function PayNowButton({ overview, className = "btn btn-primary btn-sm" }: { overview: BillingOverview; className?: string }) {
  const live = useRenewalLive(overview);
  // Manual mode (online payments off): the renewal is a request.
  if (!live && overview.paymentMode === "manual") return <RequestRenewalButton overview={overview} className={className} />;
  return <OnlinePayNowButton overview={overview} className={className} live={live} />;
}

function OnlinePayNowButton({ overview, className, live }: { overview: BillingOverview; className: string; live: boolean }) {
  const { canEdit } = useBillingEnv();
  const pay = usePayNow(overview);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!canEdit || pay.busy || !live}
        title={!live ? "Online payment isn't available for your account — our team will contact you to renew." : canEdit ? (renewalPriceNote(overview) ?? undefined) : "Ask an admin with billing access to pay"}
        onClick={() => void pay.renew()}
      >
        Pay now · {renewalPriceText(overview)}
      </button>
      {pay.popup}
    </>
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

/** The banner for the org's billing situation, or nothing when all is well. */
export function BillingBanner({ overview }: { overview: BillingOverview }) {
  const { client } = useBillingEnv();
  const live = useRenewalLive(overview);
  // Manual mode: renewing and changing plan are both requests to our team.
  const manual = !live && overview.paymentMode === "manual";
  const o = overview;
  const plan = o.paidPlan ?? o.plan;
  // Auto-renew copy only when the backend offers it (it doesn't yet: "pay each time").
  const auto = o.renewalMode === "auto" && o.autoRenewAvailable;

  switch (o.status) {
    case "renewal_due":
      return auto ? (
        <Banner
          tone="info"
          icon="calendar"
          title={`${renewalPriceText(o)} will be charged on ${formatDate(o.periodEnd!)}`}
          actions={<UpdatePaymentMethodButton overview={o} />}
        >
          Your {plan.name} plan renews automatically{o.paymentMethod ? ` using ${o.paymentMethod.label}` : ""}. Nothing to do.
        </Banner>
      ) : (
        <Banner
          tone="amber"
          icon="calendar"
          title={o.downgradeTo ? `Your plan changes to ${o.downgradeTo.name} on ${formatDate(o.periodEnd!)}` : `Your ${plan.name} plan renews on ${formatDate(o.periodEnd!)}`}
          actions={<PayNowButton overview={o} />}
        >
          Pay {renewalPriceText(o)} before then to keep everything running
          {o.downgradeTo ? ` — that's ${o.downgradeTo.name} (${o.downgradeInterval ?? o.interval}) from then on` : ""}.
        </Banner>
      );

    case "past_due":
    case "grace_ending": {
      const tomorrow = o.status === "grace_ending";
      return (
        <Banner
          tone="rose"
          icon="alert"
          aside={
            <span className="bl-countdown" aria-label={`${o.graceDaysLeft} ${o.graceDaysLeft === 1 ? "day" : "days"} left`}>
              <b>{o.graceDaysLeft}</b>
              <span>{o.graceDaysLeft === 1 ? "day left" : "days left"}</span>
            </span>
          }
          title={
            tomorrow
              ? `Grace ends tomorrow — on ${formatDate(o.graceEndsAt!)} ${o.orgName} moves to Basic`
              : auto
                ? `We couldn't charge ${o.paymentMethod?.label ?? "your saved payment method"} on ${formatDate(o.dueDate!)}`
                : `Your ${plan.name} renewal (${renewalPriceText(o)}) was due on ${formatDate(o.dueDate!)}`
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
        >
          {tomorrow ? (
            <>
              {manual ? `Request the renewal (or a different plan) to keep a paid plan.` : `Pay now to keep ${plan.name}.`} Otherwise only what&apos;s listed below stays active; everything else is paused, never deleted.
              {o.retention ? <PicksSummary retention={o.retention} /> : null}
            </>
          ) : (
            <>
              Day {o.graceDay} of {o.graceDays}{auto ? " — we'll try the charge again every day" : ""}. Everything keeps working until {formatDate(o.graceEndsAt!)}; after that you move
              to Basic.
            </>
          )}
        </Banner>
      );
    }

    case "expired":
      return (
        <Banner
          tone="rose"
          icon="alert"
          title={`Your ${plan.name} plan has expired`}
          actions={
            <>
              <PayNowButton overview={o} />
              <BLink to="plans" className="btn btn-ghost btn-sm">
                See plans
              </BLink>
            </>
          }
        >
          Publishing is paused{o.dueDate ? ` since the renewal on ${formatDate(o.dueDate)} wasn't paid` : ""}. Nothing was deleted and leads keep coming in. Renew to bring
          your live pages back.
        </Banner>
      );

    case "moved_to_basic":
      return (
        <Banner
          tone="gray"
          icon="pause"
          title={`You're on Basic now — ${plan.name} ended on ${formatDate(o.movedToBasicAt!)}`}
          actions={
            <>
              <BLink to="checkout" params={{ plan: plan.id, interval: o.interval }} className="btn btn-primary btn-sm">
                Buy {plan.name} again · {packagePriceText(planPrice(plan, o.interval))}
              </BLink>
              <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                Change what stays
              </BLink>
            </>
          }
        >
          {o.locked.users} users paused, {o.locked.projects} projects view-only, {o.locked.landingPages} landing pages offline{o.locked.templates ? `, ${o.locked.templates} template${o.locked.templates === 1 ? "" : "s"} paused` : ""}. Nothing was deleted and leads keep coming
          in. Buy again and everything comes back straight away.
        </Banner>
      );

    case "cancellation_scheduled":
      return (
        <Banner
          tone="amber"
          icon="calendar"
          title={`Change to Basic scheduled for ${formatDate(o.cancelAt!)}`}
          actions={<UndoButton label={`Keep ${plan.name}`} run={() => client.undoCancel()} done={`You'll stay on ${plan.name} — it renews as usual.`} />}
        >
          You keep {plan.name} until then. After that {o.orgName} moves to Basic{auto ? " and automatic payments stop" : ""}.
        </Banner>
      );

    case "downgrade_scheduled":
      return (
        <Banner
          tone="info"
          icon="arrow-down"
          title={`Change to ${o.downgradeTo!.name} scheduled for ${formatDate(o.downgradeAt!)}`}
          actions={
            <>
              <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                Choose what stays
              </BLink>
              <UndoButton label={`Keep ${plan.name}`} run={() => client.undoDowngrade()} done={`You'll stay on ${plan.name}.`} />
            </>
          }
        >
          You keep {plan.name} until then. From {formatDate(o.downgradeAt!)} you&apos;ll pay{" "}
          {packagePriceText(planPrice(o.downgradeTo!, o.downgradeInterval ?? o.interval))} per{" "}
          {(o.downgradeInterval ?? o.interval) === "yearly" ? "year" : "month"}.
        </Banner>
      );

    default:
      return null;
  }
}

/** Option B: the "renews in N days" popup (from the reminder setting). Opens on its own once per renewal date. */
export function RenewalReminderPopup({ overview, alwaysOpen = false }: { overview: BillingOverview; alwaysOpen?: boolean }) {
  const pay = usePayNow(overview);
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
        open={show && !pay.busy}
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
                if (manual) nav.go("checkout", { plan: plan.id, interval: overview.interval, renew: 1 });
                else void pay.renew();
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
      {pay.popup}
    </>
  );
}
