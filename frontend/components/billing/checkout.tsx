"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { BILLING_FIELD_LABEL } from "@/lib/billing/details";
import { planChangeRoute } from "@/lib/billing/direction";
import { formatDate, formatINR, packagePriceText, stateName } from "@/lib/billing/pricing";
import { pendingRequestText, planChangeBlock } from "@/lib/billing/requests";
import type { BillingDetailsField, BillingInterval, BillingOverview, BillingProfile, CheckoutPreview, PendingUpgrade } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery, useOrgBilling } from "./context";
import { ScheduledChangeNote } from "./banners";
import { usePayment } from "./payment";
import { WithdrawRequestButton } from "./requests";
import { Banner, BillingRedirect, BLink, ErrorNote, Loading, Section, useCheckoutLive } from "./ui";

/* ---------------------------------------------------------- Billing details */

/** Read-only: billing details are the org profile, edited in Settings → General. */
export function BillingDetailsSummary({ profile: p }: { profile: BillingProfile }) {
  const row = (label: string, value: string | null) => (
    <div style={{ display: "flex", gap: 12 }}>
      <span className="bl-muted" style={{ minWidth: 92 }}>
        {label}
      </span>
      <span>{value?.trim() ? value : <span className="bl-muted">Not added</span>}</span>
    </div>
  );
  return (
    <div data-testid="billing-details-summary" style={{ display: "grid", gap: 4, fontSize: 13 }}>
      {row("Name", p.legalName)}
      {row("Address", [p.addressLine1, p.addressLine2].filter(Boolean).join(", "))}
      {row("City", p.city)}
      {row("State", stateName(p.state))}
      {row("PIN code", p.pincode)}
      {row("GSTIN", p.gstin)}
    </div>
  );
}

/** Shown when an invoice field is missing: checkout can't go ahead until it's filled in. */
export function MissingDetailsNote({ missing }: { missing: BillingDetailsField[] }) {
  const { canEditOrgProfile } = useBillingEnv();
  if (!missing.length) return null;
  return (
    <div className="bl-stack" style={{ gap: 8, marginTop: 10 }} role="alert">
      <ErrorNote message={`Complete your organisation details to continue. Missing: ${missing.map((k) => BILLING_FIELD_LABEL[k]).join(", ")}.`} />
      {canEditOrgProfile ? (
        <BLink to="generalSettings" className="btn btn-ghost btn-sm">
          Complete organisation details
        </BLink>
      ) : (
        <div className="bl-muted">Ask your organisation admin to complete these details.</div>
      )}
    </div>
  );
}

/** The billing details card: a summary of Settings → General, with a link to edit it there. */
export function BillingDetailsSection({ overview: o, sub = "From your General settings — printed on your GST invoices" }: { overview: BillingOverview; sub?: string }) {
  const { canEditOrgProfile } = useBillingEnv();
  return (
    <Section
      title="Billing details"
      sub={sub}
      action={
        canEditOrgProfile ? (
          <BLink to="generalSettings" className="btn btn-ghost btn-sm">
            Edit in General settings
          </BLink>
        ) : null
      }
    >
      <BillingDetailsSummary profile={o.billingProfile} />
      <MissingDetailsNote missing={o.billingDetailsMissing} />
    </Section>
  );
}

/* ----------------------------------------------------------------- Coupon */

export function CouponField({
  applied,
  error,
  busy,
  initialCode = "",
  onApply,
  onRemove,
}: {
  applied: CheckoutPreview["coupon"];
  error: string | null;
  busy?: boolean;
  initialCode?: string;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  return (
    <div>
      <div className="bl-row" style={{ alignItems: "flex-start" }}>
        <input
          className="inp"
          aria-label="Coupon code"
          style={{ flex: 1, minWidth: 160, textTransform: "uppercase" }}
          placeholder="e.g. LAUNCH20"
          value={applied ? applied.code : code}
          disabled={!!applied}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onApply(code);
          }}
        />
        {applied ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setCode("");
              onRemove();
            }}
          >
            Remove
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onApply(code)}>
            Apply
          </button>
        )}
      </div>
      {applied ? (
        <div className="bl-coupon-ok">
          ✓ {applied.code} applied — {applied.description}.
        </div>
      ) : null}
      {error ? <div className="bl-coupon-err">✕ {error}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------- Price summary */

export function PriceSummary({ preview: p, renewalMode }: { preview: CheckoutPreview; renewalMode: BillingOverview["renewalMode"] }) {
  const per = p.interval === "yearly" ? "year" : "month";
  return (
    <div>
      <div className="bl-breakdown">
        <div className="bl-line">
          <span>
            {p.planName} plan ({p.interval})
          </span>
          <span>{formatINR(p.planPrice)}</span>
        </div>
        {p.proration && p.kind === "interval_change" ? (
          <div className="bl-line minus">
            <span>
              Credit for the unused part of your monthly plan
              <div className="bl-work">
                {formatINR(p.proration.oldPrice)} × {p.proration.daysLeft} days left ÷ {p.proration.daysInPeriod} = <b>{formatINR(p.proration.credit)}</b>
              </div>
            </span>
            <span>−{formatINR(p.proration.credit)}</span>
          </div>
        ) : p.proration ? (
          <div className="bl-line minus">
            <span>
              Credit for the part of this {per} you&apos;ve already paid for
              <div className="bl-work">
                You only pay the difference for the {p.proration.daysLeft} days left: ({formatINR(p.proration.newPrice)} − {formatINR(p.proration.oldPrice)}) ×{" "}
                {p.proration.daysLeft} ÷ {p.proration.daysInPeriod} = <b>{formatINR(p.proration.charge)}</b>
              </div>
            </span>
            <span>−{formatINR(p.proration.credit)}</span>
          </div>
        ) : null}
        {p.coupon ? (
          <div className="bl-line minus">
            <span>Coupon {p.coupon.code}</span>
            <span>−{formatINR(p.couponDiscount)}</span>
          </div>
        ) : null}
        <div className="bl-line">
          <span className="bl-strong">Taxable value</span>
          <span>{formatINR(p.taxable)}</span>
        </div>
        {p.gst.kind === "intra" ? (
          <>
            <div className="bl-line">
              <span>CGST 9%</span>
              <span>{formatINR(p.gst.cgst)}</span>
            </div>
            <div className="bl-line">
              <span>SGST 9%</span>
              <span>{formatINR(p.gst.sgst)}</span>
            </div>
          </>
        ) : (
          <div className="bl-line">
            <span>IGST 18%</span>
            <span>{formatINR(p.gst.igst)}</span>
          </div>
        )}
        <div className="bl-line total">
          <span>Total due now</span>
          <span>{formatINR(p.total)}</span>
        </div>
      </div>
      <div className="bl-muted" style={{ marginTop: 6 }}>
        {!p.billingState
          ? "Choose your state in General settings to see how GST is split."
          : p.gst.kind === "intra"
            ? `Billing state ${stateName(p.billingState)} is the same as ours, so GST is split into CGST and SGST.`
            : `Billing state ${stateName(p.billingState)} is outside ours, so it's charged as IGST.`}
      </div>
      <div className="bl-muted" style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg)", borderRadius: 10 }}>
        {p.kind === "upgrade_same_interval"
          ? `Your renewal date stays ${formatDate(p.periodEnd)}. `
          : p.kind === "interval_change"
            ? `A new yearly cycle starts today and runs until ${formatDate(p.periodEnd)}. `
            : `Your plan runs until ${formatDate(p.periodEnd)}. `}
        Then {packagePriceText(p.recurringPrice)} per {per}
        {p.coupon && p.couponRenewalsLeft > 0 && p.couponRenewalsLeft < 99 ? ` (${p.coupon.code} also covers the next ${p.couponRenewalsLeft} renewals)` : ""}
        {renewalMode === "auto" ? ", charged automatically to the method you pay with now." : ". We'll remind you 3 days before each renewal."}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Checkout */

type Part = "details" | "coupon" | "summary";

const CONFLICT_NOUN = { users: ["user", "users"], projects: ["project", "projects"], landingPages: ["published landing page", "published landing pages"], templates: ["template", "templates"] } as const;

/** "Pro allows 5 users; you have 8. Choose which 5 stay active when this change is approved." (same words as the API) */
export function usageConflictLines(planName: string, conflict: NonNullable<CheckoutPreview["usageConflict"]>): string[] {
  return conflict.items.map((i) => {
    const [one, many] = CONFLICT_NOUN[i.key];
    return `${planName} allows ${i.limit} ${i.limit === 1 ? one : many}; you have ${i.used}. Choose which ${i.limit} stay active when this change is approved.`;
  });
}

/**
 * Manual mode, the target plan is smaller than what the org uses: pick what
 * stays (saved for that plan, applied when the request is approved) before sending.
 */
export function UsageConflictNote({
  planId,
  planName,
  interval,
  conflict,
}: {
  planId: string;
  planName: string;
  interval: BillingInterval;
  conflict: NonNullable<CheckoutPreview["usageConflict"]>;
}) {
  const fits = conflict.choicesFit;
  return (
    <div className="bl-stack" style={{ gap: 8, marginTop: 10 }} data-testid="usage-conflict">
      <Banner
        tone={fits ? "green" : "amber"}
        icon={fits ? "check" : "info"}
        title={fits ? `You've chosen what stays on ${planName}` : `Choose what stays on ${planName}`}
        actions={
          <BLink to="chooseWhatStays" params={{ target: planId, back: "checkout", interval }} className={`btn btn-sm ${fits ? "btn-ghost" : "btn-primary"}`}>
            {fits ? "Change what stays" : "Choose what stays"}
          </BLink>
        }
      >
        {usageConflictLines(planName, conflict).join(" ")}
        {fits ? " Everything else is paused (never deleted) when the change is approved." : ""}
      </Banner>
    </div>
  );
}

/** The org's latest upgrade request was rejected: say so, with the Super Admin's reason. */
export function RejectedUpgradeBanner({ rejected: r }: { rejected: NonNullable<BillingOverview["rejectedUpgrade"]> }) {
  return (
    <Banner tone="rose" icon="info" title={`Change to ${r.toPlan.name} was not approved`}>
      Your request for {r.toPlan.name} ({r.interval}) was rejected{r.rejectedAt ? ` on ${formatDate(r.rejectedAt)}` : ""}.
      {r.reason ? (
        <>
          {" "}
          <b>Reason:</b> {r.reason}
        </>
      ) : null}{" "}
      You can send a new request from Plans.
    </Banner>
  );
}

/** An upgrade request (manual mode) or a paid order waiting on our team. */
export function PendingUpgradeBanner({ pending: u }: { pending: PendingUpgrade }) {
  return (
    <Banner
      tone="info"
      icon="clock"
      title={u.status === "needs_review" ? "Your payment is being checked" : `${u.label ?? `Change to ${u.toPlan.name}`} requested`}
      actions={
        u.status === "pending_approval" && u.requestId ? (
          <>
            <BLink to="requests" className="btn btn-ghost btn-sm">
              View requests
            </BLink>
            {u.paid ? (
              <span className="bl-muted bl-small">Contact us to withdraw</span>
            ) : (
              <WithdrawRequestButton requestId={u.requestId} toPlan={u.toPlan.name} />
            )}
          </>
        ) : undefined
      }
    >
      {u.status === "needs_review"
        ? `We received your payment for ${u.toPlan.name} (${u.interval}). Our team is finishing the setup — nothing more to do on your side.`
        : `Sent on ${formatDate(u.createdAt)} for ${u.toPlan.name} (${u.interval}). ${
            u.paid ? "Payment received – waiting for approval." : "Waiting for payment — our team will confirm how to pay."
          }${u.movedToBasicAt ? " You moved to Basic while it was waiting; everything that fits comes back once it's approved." : " You keep everything on your current plan until then."}`}
    </Banner>
  );
}

export function CheckoutScreen({
  planId,
  interval,
  parts = ["details", "coupon", "summary"],
  initialCoupon,
  autoPay = false,
  renewal = false,
}: {
  planId: string;
  interval: BillingInterval;
  /** Pay for the next term of the current plan (Pay now while organisation details are incomplete). */
  renewal?: boolean;
  /** Walkthrough steps show one part at a time. */
  parts?: Part[];
  initialCoupon?: string;
  /** Open the payment popup straight away (walkthrough). */
  autoPay?: boolean;
}) {
  const { client, nav, canEdit } = useBillingEnv();
  const { overview, refresh } = useOrgBilling();
  const { toast } = useToast();
  const { data: plans } = useBillingQuery((c) => c.listPlans(), []);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const autoDone = useRef(false);
  const purpose = renewal ? "renewal" : "purchase";
  // Online = Razorpay Checkout; otherwise the order is a request our team approves.
  const online = useCheckoutLive(overview);

  useEffect(() => {
    let active = true;
    client
      .previewCheckout({ planId, interval, couponCode: coupon ?? undefined, purpose })
      .then((p) => {
        if (!active) return;
        setPreview(p);
        setPreviewError(null);
      })
      .catch((e: unknown) => {
        if (active) setPreviewError(e instanceof Error ? e.message : "Couldn't work out the price.");
      });
    return () => {
      active = false;
    };
  }, [client, planId, interval, coupon, purpose]);

  const target = plans?.find((p) => p.id === planId);

  const payment = usePayment({
    renewalMode: overview?.renewalMode ?? "auto",
    title: `${target?.name ?? ""} · ${interval}`,
    subtitle: renewal
      ? `Renew ${target?.name}`
      : preview?.kind === "upgrade_same_interval" || preview?.kind === "interval_change"
        ? `Change plan ${overview?.plan.name} → ${target?.name}`
        : `Buy ${target?.name}`,
    // A renewal keeps the plan: it's applied when the period end moves on.
    isApplied: renewal ? (ov) => ov.periodEnd !== overview?.periodEnd : undefined,
    onActive: (r) => {
      void refresh();
      nav.go("checkoutSuccess", {
        plan: r.planId,
        interval: r.interval,
        amount: r.amount,
        ref: r.reference,
        until: r.activeUntil || undefined,
        coupon: r.couponCode ?? undefined,
        finishing: r.finishing ? 1 : undefined,
      });
    },
    onFailed: (reason) => nav.go("checkoutFailure", { plan: planId, interval, reason }),
    onClosed: () => toast({ variant: "info", title: "Payment not completed", description: "You closed the payment window. Nothing was charged — try again when you're ready." }),
    onRequested: () => {
      void refresh();
      toast({
        variant: "success",
        title: renewal ? "Renewal requested" : "Request sent",
        description: "Our team will confirm how to pay, then approve it. You keep everything on your current plan until then.",
      });
      nav.go("overview");
    },
  });

  async function applyCoupon(code: string) {
    if (!code.trim()) {
      setCouponError("Enter a coupon code.");
      return;
    }
    setChecking(true);
    try {
      const p = await client.previewCheckout({ planId, interval, couponCode: code });
      if (p.couponError) setCouponError(p.couponError);
      else {
        setCoupon(p.coupon!.code);
        setCouponError(null);
        setPreview(p);
      }
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : "Couldn't check that coupon.");
    } finally {
      setChecking(false);
    }
  }

  async function pay() {
    await payment.start({ planId, interval, couponCode: coupon ?? undefined, purpose });
  }

  // Walkthrough: open the payment popup on arrival.
  useEffect(() => {
    if (!autoPay || autoDone.current || !overview || !preview) return;
    if (initialCoupon && !coupon && !couponError) return; // wait for the preset coupon
    autoDone.current = true;
    void payment.start({ planId, interval, couponCode: coupon ?? undefined, purpose: "purchase" });
  }, [autoPay, overview, preview, payment, planId, interval, coupon, couponError, initialCoupon]);

  // Apply a preset coupon on arrival (walkthrough). Idempotent, so a re-run is harmless.
  useEffect(() => {
    if (!initialCoupon) return;
    let active = true;
    client
      .previewCheckout({ planId, interval, couponCode: initialCoupon })
      .then((p) => {
        if (!active) return;
        if (p.couponError) setCouponError(p.couponError);
        else {
          setCoupon(p.coupon!.code);
          setPreview(p);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, initialCoupon, planId, interval]);

  if (!overview || !plans) return <Loading what="checkout" />;
  if (!target) return <ErrorNote message="That plan doesn't exist." />;

  const inGrace = overview.status === "past_due" || overview.status === "grace_ending";
  // Renewal overdue: there's no paid term to schedule a downgrade against, so
  // any paid plan is bought here (manual mode: a request at its full price).
  const overduePurchase = inGrace && !target.isFree;
  // Same rule as the plan cards: a smaller plan (or yearly → monthly) belongs on the downgrade page.
  const route = planChangeRoute(overview, target, interval, online);
  if (!renewal && !overduePurchase && route === "downgrade") {
    return <BillingRedirect to="downgrade" params={target.isFree ? { plan: target.id } : { plan: target.id, interval }} />;
  }
  if (!renewal && !overduePurchase && route === null) {
    return (
      <Banner
        tone="amber"
        icon="info"
        title={target.isFree ? "Basic is free — there's nothing to buy" : `You're already on ${overview.plan.name} (${overview.interval})`}
        actions={
          <BLink to="plans" className="btn btn-primary btn-sm">
            See plans
          </BLink>
        }
      />
    );
  }

  // A change to Basic / a smaller plan is scheduled: no other plan change until
  // it's undone ("Keep <plan>"). Renewals still go through (at its price).
  if (!renewal && planChangeBlock(overview)?.reason === "change_scheduled") return <ScheduledChangeNote overview={overview} />;

  // A waiting upgrade request doesn't block paying a renewal online. In manual
  // mode a renewal is a request too, so one waiting request blocks it.
  const pendingUpgrade = renewal && online ? null : overview.pendingUpgrade;
  // Manual mode: the renewal is a request our team approves once it's paid.
  const manualRenewal = renewal && !online;
  // Manual mode, renewal overdue: any plan is a request at its full price.
  const overdueChange = !online && !renewal && preview?.kind === "renewal";
  const showCoupon = parts.includes("coupon") && preview?.couponsEnabled !== false;
  const left = parts.includes("details") || showCoupon;
  const right = parts.includes("summary");
  // Over the plan's limits: never let them pay for a plan that can't be applied.
  const tooSmall = preview?.usageError ?? null;
  // Every invoice field must be filled in (Settings → General) before paying.
  const missingDetails = overview.billingDetailsMissing;
  // Manual mode over the target's limits: send once they've chosen what stays.
  const conflict = preview?.usageConflict ?? null;
  const mustChoose = !!conflict && !conflict.choicesFit;
  // A request waiting for approval: the button keeps its label (Send change request / Pay) but is disabled.
  const waiting = pendingUpgrade?.status === "pending_approval";
  const buttonReason =
    pendingUpgrade
      ? waiting
        ? pendingRequestText(pendingUpgrade)
        : "Your last payment is still being checked by our team"
      : !canEdit
        ? "Ask an admin with billing access to buy a plan"
        : missingDetails.length
          ? "Complete your organisation details to continue"
          : mustChoose
            ? "Choose what stays on the new plan first"
            : undefined;
  const disabled = !canEdit || payment.busy || !!pendingUpgrade || !!tooSmall || missingDetails.length > 0 || mustChoose;

  return (
    <div className="bl-stack">
      {pendingUpgrade ? <PendingUpgradeBanner pending={pendingUpgrade} /> : null}
      <div className={left && right ? "bl-split" : "bl-stack"}>
        {left ? (
          <div className="bl-stack">
            {parts.includes("details") ? <BillingDetailsSection overview={overview} /> : null}
            {showCoupon ? (
              <Section title="Coupon" sub="Taken off before GST">
                <CouponField
                  applied={preview?.coupon && coupon ? preview.coupon : null}
                  error={couponError}
                  busy={checking}
                  initialCode={initialCoupon}
                  onApply={(c) => void applyCoupon(c)}
                  onRemove={() => {
                    setCoupon(null);
                    setCouponError(null);
                  }}
                />
              </Section>
            ) : null}
          </div>
        ) : null}
        {right ? (
          <Section
            title={renewal ? (online ? `Renew ${target.name}` : `Request renewal of ${target.name}`) : online ? "Order summary" : `Request a change to ${target.name}`}
            sub={online ? `${target.name} · ${interval === "yearly" ? "billed yearly" : "billed monthly"}` : "Approved by our team once it's paid"}
          >
            {preview ? (
              <>
                <PriceSummary preview={preview} renewalMode={overview.renewalMode} />
                {conflict && !pendingUpgrade ? <UsageConflictNote planId={target.id} planName={target.name} interval={interval} conflict={conflict} /> : null}
                {missingDetails.length && !parts.includes("details") ? (
                  <MissingDetailsNote missing={missingDetails} />
                ) : tooSmall ? (
                  <div className="bl-stack" style={{ gap: 8, marginTop: 10 }}>
                    <ErrorNote message={tooSmall} />
                    <BLink to="plans" className="btn btn-ghost btn-sm">
                      Choose a bigger plan
                    </BLink>
                  </div>
                ) : manualRenewal ? (
                  <div className="bl-muted" style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg)", borderRadius: 10, lineHeight: 1.55 }}>
                    Online payment isn&apos;t available for your account. Send a renewal request and our team will confirm how to pay; the new period continues from your
                    renewal date once it&apos;s paid and approved.
                  </div>
                ) : overdueChange ? (
                  <div className="bl-muted" style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg)", borderRadius: 10, lineHeight: 1.55 }} data-testid="overdue-note">
                    <span className="badge b-amber" style={{ marginRight: 6 }}>
                      overdue renewal
                    </span>
                    Your renewal is overdue, so this is {target.name}&apos;s full price (nothing was paid for the overdue days). Once it&apos;s paid and approved the new period
                    continues from {overview.dueDate ? formatDate(overview.dueDate) : "your renewal date"}.
                  </div>
                ) : !online ? (
                  <div className="bl-muted" style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg)", borderRadius: 10, lineHeight: 1.55 }}>
                    Online payment isn&apos;t available for your account, so plan changes are approved by our team. Send a request and we&apos;ll confirm the plan and how
                    to pay. You stay on {overview.plan.name} with everything working until the change is approved.
                  </div>
                ) : null}
                {/* The tooltip sits on a wrapper: a disabled button shows none of its own in some browsers. */}
                <div title={buttonReason} style={{ display: "flex", marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "100%", justifyContent: "center", padding: 12, ...(waiting ? { opacity: 0.65, cursor: "not-allowed" } : null) }}
                    disabled={disabled}
                    onClick={() => void pay()}
                  >
                    {pendingUpgrade && !waiting ? (
                      <>
                        <Icon name="clock" size={15} /> Request pending
                      </>
                    ) : manualRenewal ? (
                      <>
                        <Icon name="arrow-up" size={15} /> Send renewal request
                      </>
                    ) : !online ? (
                      <>
                        <Icon name="arrow-up" size={15} /> Send change request
                      </>
                    ) : preview.total === 0 ? (
                      <>
                        <Icon name="check" size={15} /> Activate {target.name} — nothing to pay
                      </>
                    ) : (
                      <>
                        <Icon name="lock" size={15} /> Pay {formatINR(preview.total)}
                      </>
                    )}
                  </button>
                </div>
                <div className="bl-muted bl-small" style={{ textAlign: "center", marginTop: 8 }}>
                  {online ? "Secure payment by Razorpay. GST invoice by email." : "No payment is taken now. GST invoice by email once it's approved."}
                </div>
              </>
            ) : previewError ? (
              <div className="bl-stack" style={{ gap: 10 }}>
                <ErrorNote message={previewError} />
                <BLink to="plans" className="btn btn-ghost btn-sm">
                  Back to plans
                </BLink>
              </div>
            ) : (
              <Loading what="price" />
            )}
          </Section>
        ) : null}
        {payment.popup}
      </div>
    </div>
  );
}
