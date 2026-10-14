"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatINR, round2 } from "@/lib/billing/pricing";
import type { BillingOverview, RetentionSummary } from "@/lib/billing/types";
import { useBillingEnv, useOptionalOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { usePayment } from "./payment";
import { Banner, BLink } from "./ui";

/** Re-fetch the shared overview after an action (no-op outside OrgBillingProvider). */
function useRefresh() {
  const ctx = useOptionalOrgBilling();
  return () => ctx?.refresh() ?? Promise.resolve();
}

/* ------------------------------------------------------------- Pay now */

export function usePayNow(overview: BillingOverview) {
  const { toast } = useToast();
  const refresh = useRefresh();
  const plan = overview.paidPlan ?? overview.plan;
  return usePayment({
    renewalMode: overview.renewalMode,
    title: `${plan.name} renewal`,
    subtitle: `${plan.name} · ${overview.interval} · incl. 18% GST · ${overview.orgName}`,
    onActive: (r) => {
      void refresh();
      toast({ variant: "success", title: `Payment received — ${r.planName} is active`, description: `Paid ${formatINR(r.amount)}. Next renewal ${formatDate(r.activeUntil)}.` });
    },
    onFailed: (reason) => toast({ variant: "error", title: "Payment failed", description: reason }),
    onClosed: () => toast({ variant: "info", title: "Payment cancelled", description: "The payment window was closed. Nothing was charged." }),
  });
}

export function PayNowButton({ overview, className = "btn btn-primary btn-sm" }: { overview: BillingOverview; className?: string }) {
  const { canEdit } = useBillingEnv();
  const pay = usePayNow(overview);
  const plan = overview.paidPlan ?? overview.plan;
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!canEdit || pay.busy}
        title={canEdit ? undefined : "Ask an admin with billing access to pay"}
        onClick={() => void pay.start({ planId: plan.id, interval: overview.interval, purpose: "renewal" })}
      >
        Pay now · {formatINR(overview.renewalAmount ?? 0)}
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
              Cancel
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
    </div>
  );
}

/* ------------------------------------------------------------ Banners */

function UndoButton({ label, run, done }: { label: string; run: () => Promise<unknown>; done: string }) {
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

/** The banner for the org's billing situation, or nothing when all is well. */
export function BillingBanner({ overview }: { overview: BillingOverview }) {
  const { client } = useBillingEnv();
  const o = overview;
  const plan = o.paidPlan ?? o.plan;
  const auto = o.renewalMode === "auto";

  switch (o.status) {
    case "renewal_due":
      return auto ? (
        <Banner
          tone="info"
          icon="calendar"
          title={`${formatINR(o.renewalAmount ?? 0)} will be charged on ${formatDate(o.periodEnd!)}`}
          actions={<UpdatePaymentMethodButton overview={o} />}
        >
          Your {plan.name} plan renews automatically{o.paymentMethod ? ` using ${o.paymentMethod.label}` : ""}. Nothing to do.
        </Banner>
      ) : (
        <Banner tone="amber" icon="calendar" title={`Your ${plan.name} plan renews on ${formatDate(o.periodEnd!)}`} actions={<PayNowButton overview={o} />}>
          Pay {formatINR(o.renewalAmount ?? 0)} (incl. GST) before then to keep everything running.
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
                : `Your ${plan.name} renewal of ${formatINR(o.renewalAmount ?? 0)} was due on ${formatDate(o.dueDate!)}`
          }
          actions={
            <>
              <PayNowButton overview={o} />
              {auto && !tomorrow ? <UpdatePaymentMethodButton overview={o} /> : null}
              <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                Choose what stays
              </BLink>
            </>
          }
        >
          {tomorrow ? (
            <>
              Pay now to keep {plan.name}. Otherwise only what&apos;s listed below stays active; everything else is paused, never deleted.
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

    case "moved_to_basic":
      return (
        <Banner
          tone="gray"
          icon="pause"
          title={`You're on Basic now — ${plan.name} ended on ${formatDate(o.movedToBasicAt!)}`}
          actions={
            <>
              <BLink to="checkout" params={{ plan: plan.id, interval: o.interval }} className="btn btn-primary btn-sm">
                Buy {plan.name} again
              </BLink>
              <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                Change what stays
              </BLink>
            </>
          }
        >
          {o.locked.users} users paused, {o.locked.projects} projects view-only, {o.locked.landingPages} landing pages offline. Nothing was deleted and leads keep coming
          in. Buy again and everything comes back straight away.
        </Banner>
      );

    case "cancellation_scheduled":
      return (
        <Banner
          tone="amber"
          icon="calendar"
          title="Cancellation scheduled"
          actions={<UndoButton label="Undo cancellation" run={() => client.undoCancel()} done={`Cancellation undone — ${plan.name} will renew as usual.`} />}
        >
          {plan.name} stays fully active until {formatDate(o.cancelAt!)}. After that {o.orgName} moves to Basic{auto ? " and automatic payments stop" : ""}.
        </Banner>
      );

    case "downgrade_scheduled":
      return (
        <Banner
          tone="info"
          icon="arrow-down"
          title={`Downgrade to ${o.downgradeTo!.name} scheduled for ${formatDate(o.downgradeAt!)}`}
          actions={
            <>
              <BLink to="chooseWhatStays" className="btn btn-ghost btn-sm">
                Choose what stays
              </BLink>
              <UndoButton label="Undo downgrade" run={() => client.undoDowngrade()} done={`Downgrade cancelled — you'll stay on ${plan.name}.`} />
            </>
          }
        >
          You keep {plan.name} until then. From {formatDate(o.downgradeAt!)} you&apos;ll pay{" "}
          {formatINR(o.interval === "yearly" ? o.downgradeTo!.priceYearly : o.downgradeTo!.priceMonthly)} + GST per {o.interval === "yearly" ? "year" : "month"}.
        </Banner>
      );

    default:
      return null;
  }
}

/** Option B: the "renews in 3 days" popup. Opens on its own once per renewal date. */
export function RenewalReminderPopup({ overview, alwaysOpen = false }: { overview: BillingOverview; alwaysOpen?: boolean }) {
  const pay = usePayNow(overview);
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
  const price = overview.interval === "yearly" ? plan.priceYearly : plan.priceMonthly;
  const show = overview.renewalMode === "manual" && overview.status === "renewal_due" && (!dismissed || alwaysOpen);

  return (
    <>
      <BillingDialog
        open={show && !pay.busy}
        onClose={dismiss}
        title={`Your ${plan.name} plan renews in 3 days`}
        description={`Renewal date: ${overview.periodEnd ? formatDate(overview.periodEnd) : ""}. Pay now so nothing is interrupted.`}
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
                void pay.start({ planId: plan.id, interval: overview.interval, purpose: "renewal" });
              }}
            >
              Pay now · {formatINR(overview.renewalAmount ?? 0)}
            </button>
          </DialogActions>
        }
      >
        <div className="bl-breakdown">
          <div className="bl-line">
            <span>
              {plan.name} · {overview.interval}
            </span>
            <span>{formatINR(price)}</span>
          </div>
          <div className="bl-line">
            <span>GST 18%</span>
            <span>{formatINR(round2((overview.renewalAmount ?? 0) - price))}</span>
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
