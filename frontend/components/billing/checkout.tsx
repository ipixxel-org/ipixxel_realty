"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { BILLING_FIELD_LABEL } from "@/lib/billing/details";
import { formatDate, formatINR, packagePriceText, stateName } from "@/lib/billing/pricing";
import type { BillingDetailsField, BillingInterval, BillingOverview, BillingProfile, CheckoutPreview, PendingUpgrade } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery, useOrgBilling } from "./context";
import { usePayment } from "./payment";
import { Banner, BLink, ErrorNote, Loading, Section, useCheckoutLive } from "./ui";

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

/** The org's latest upgrade request was rejected: say so, with the Super Admin's reason. */
export function RejectedUpgradeBanner({ rejected: r }: { rejected: NonNullable<BillingOverview["rejectedUpgrade"]> }) {
  return (
    <Banner tone="rose" icon="info" title={`Upgrade to ${r.toPlan.name} was not approved`}>
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
    <Banner tone="info" icon="clock" title={u.status === "needs_review" ? "Your payment is being checked" : `Upgrade to ${u.toPlan.name} requested`}>
      {u.status === "needs_review"
        ? `We received your payment for ${u.toPlan.name} (${u.interval}). Our team is finishing the setup — nothing more to do on your side.`
        : `Sent on ${formatDate(u.createdAt)} for ${u.toPlan.name} (${u.interval}). Our team will approve it shortly; you keep everything on your current plan until then.`}
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
        ? `Upgrade ${overview?.plan.name} → ${target?.name}`
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
    onClosed: () => toast({ variant: "info", title: "Payment cancelled", description: "You closed the payment window. Nothing was charged — try again when you're ready." }),
    onRequested: () => {
      void refresh();
      toast({ variant: "success", title: "Request sent", description: "Our team will approve it shortly. You keep everything on your current plan until then." });
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

  const onFree = overview.status === "free" || overview.status === "moved_to_basic";
  const inGrace = overview.status === "past_due" || overview.status === "grace_ending";
  const samePlan = target.id === overview.plan.id;
  // Same plan monthly → yearly is an interval change (allowed); yearly → monthly happens at renewal.
  const notAnUpgrade =
    !onFree &&
    !inGrace &&
    (target.rank < overview.plan.rank || (target.rank === overview.plan.rank && !samePlan) || (samePlan && (interval === overview.interval || interval === "monthly")));
  if (!renewal && (target.isFree || notAnUpgrade)) {
    return (
      <Banner
        tone="amber"
        icon="info"
        title={target.isFree ? "Basic is free — there's nothing to buy" : samePlan && interval === overview.interval ? `You're already on ${overview.plan.name}` : "This isn't an upgrade"}
        actions={
          <BLink to="plans" className="btn btn-primary btn-sm">
            See plans
          </BLink>
        }
      >
        Moving to a smaller plan (or from yearly to monthly billing) is a downgrade, which takes effect at the end of your billing period.
      </Banner>
    );
  }

  // A waiting upgrade request doesn't block paying a renewal.
  const pendingUpgrade = renewal ? null : overview.pendingUpgrade;
  // Manual mode has no online renewal: our team renews the plan.
  const manualRenewal = renewal && !online;
  const showCoupon = parts.includes("coupon") && preview?.couponsEnabled !== false;
  const left = parts.includes("details") || showCoupon;
  const right = parts.includes("summary");
  // Over the plan's limits: never let them pay for a plan that can't be applied.
  const tooSmall = preview?.usageError ?? null;
  // Every invoice field must be filled in (Settings → General) before paying.
  const missingDetails = overview.billingDetailsMissing;
  const disabled = !canEdit || payment.busy || !!pendingUpgrade || manualRenewal || !!tooSmall || missingDetails.length > 0;

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
            title={renewal ? `Renew ${target.name}` : online ? "Order summary" : `Request an upgrade to ${target.name}`}
            sub={online || renewal ? `${target.name} · ${interval === "yearly" ? "billed yearly" : "billed monthly"}` : "Approved by our team"}
          >
            {preview ? (
              <>
                <PriceSummary preview={preview} renewalMode={overview.renewalMode} />
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
                    Online payment isn&apos;t available for your account, so our team renews your plan. We&apos;ll contact you before it&apos;s due.
                  </div>
                ) : !online ? (
                  <div className="bl-muted" style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg)", borderRadius: 10, lineHeight: 1.55 }}>
                    Online payment isn&apos;t available for your account, so upgrades are approved by our team. Send a request and we&apos;ll confirm the plan and how to
                    pay. You stay on {overview.plan.name} with everything working until the upgrade is approved.
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: 14, padding: 12 }}
                  disabled={disabled}
                  title={
                    pendingUpgrade
                      ? "An upgrade request is already waiting for approval"
                      : !canEdit
                        ? "Ask an admin with billing access to buy a plan"
                        : missingDetails.length
                          ? "Complete your organisation details to continue"
                          : undefined
                  }
                  onClick={() => void pay()}
                >
                  {pendingUpgrade ? (
                    <>
                      <Icon name="clock" size={15} /> Request pending
                    </>
                  ) : manualRenewal ? (
                    <>
                      <Icon name="clock" size={15} /> Renewed by our team
                    </>
                  ) : !online ? (
                    <>
                      <Icon name="arrow-up" size={15} /> Send upgrade request
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
                <div className="bl-muted bl-small" style={{ textAlign: "center", marginTop: 8 }}>
                  {online ? "Secure payment by Razorpay. GST invoice by email." : manualRenewal ? "Nothing to pay here." : "No payment is taken now."}
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
