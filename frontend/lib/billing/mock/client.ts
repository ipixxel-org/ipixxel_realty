/**
 * `BillingClient` backed by mock data. Every method resolves with the same
 * shapes the real API will return. State lives in memory; pass `persistKey`
 * to keep it in localStorage (the app-wide client does, so a refresh keeps
 * what the user clicked). Walkthrough steps create throwaway instances.
 */
import { BillingError, type BillingClient } from "../client";
import { couponStatusFor } from "../coupons";
import {
  addCycle,
  addDays,
  checkGstin,
  COMPANY_STATE,
  describeCoupon,
  formatDate,
  formatINR,
  planPrice,
  priceBreakdown,
  round2,
  validateCoupon,
  withGst,
} from "../pricing";
import type {
  AdminPaymentRow,
  BillingInterval,
  BillingOverview,
  CheckoutPreview,
  CheckoutReceipt,
  Coupon,
  CouponRow,
  OrgCoupon,
  OrgPlanRequest,
  Paged,
  PaymentRecord,
  SubscriptionDetail,
  SubscriptionRow,
  SubscriptionStatus,
} from "../types";
import { missingBillingDetails } from "../details";
import { pendingRequestText } from "../requests";
import { DEFAULT_BILLING_DETAILS, DEMO_ORG, MOCK_SELLER, TODAY, type MockOrg, type MockPayment } from "./data";
import { deriveAccess, deriveDates, deriveOverview, deriveRetention, freePlan, initialMockState, planById, planNames, type MockState } from "./state";

export interface MockBillingClient extends BillingClient {
  /** Current mock state (read-only use: fixtures, tests). */
  snapshot(): MockState;
  /** Synchronous overview — lets presentation pages render without a loading flash. */
  overviewNow(): BillingOverview;
  reset(): void;
}

interface PendingCheckout {
  planId: string;
  interval: BillingInterval;
  couponCode: string | null;
  purpose: "purchase" | "renewal";
  amount: number;
}

function paged<T>(rows: T[], page = 1, pageSize = 10): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}

export function createMockBillingClient(opts: { initial?: Partial<MockState>; persistKey?: string; today?: string } = {}): MockBillingClient {
  const today = opts.today ?? TODAY;
  let state: MockState = initialMockState(opts.initial);
  let loaded = !opts.persistKey;
  const pending = new Map<string, PendingCheckout>();

  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(opts.persistKey!);
      if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<MockState>) };
    } catch {
      // Blocked storage — keep the in-memory defaults.
    }
  }

  function save() {
    if (!opts.persistKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(opts.persistKey, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function get(): MockState {
    load();
    return state;
  }

  function set(patch: Partial<MockState>) {
    state = { ...get(), ...patch };
    save();
  }

  const ok = <T>(v: T) => Promise.resolve(JSON.parse(JSON.stringify(v)) as T);
  const fail = (msg: string) => Promise.reject(new BillingError(msg));
  const overview = () => deriveOverview(get(), today);

  /* ------------------------------------------------------------ pricing */

  function preview(planId: string, interval: BillingInterval, couponCode: string | undefined, purpose: "purchase" | "renewal" = "purchase"): CheckoutPreview {
    const s = get();
    const plan = planById(s, planId);
    const ov = overview();
    const onFree = ov.status === "free" || ov.status === "moved_to_basic";
    const inGrace = ov.status === "past_due" || ov.status === "grace_ending";
    const isUpgrade = purpose === "purchase" && !onFree && plan.rank > ov.plan.rank;
    const midCycle = isUpgrade && !inGrace && interval === ov.interval && ov.daysLeftInPeriod > 0;
    const stateName = (s.billingProfile ?? DEFAULT_BILLING_DETAILS).state || COMPANY_STATE;
    const fromPlanRow = ov.paidPlan && !onFree ? ov.paidPlan : ov.plan;

    let coupon: Coupon | null = null;
    let couponError: string | null = null;
    if (couponCode && couponCode.trim()) {
      const res = validateCoupon(couponCode, s.coupons, {
        planId,
        planNames: planNames(s),
        cycle: interval,
        orgId: DEMO_ORG.id,
        today,
        orgRedeemed: s.redeemed,
        usesSoFar: new Set(s.redemptions.filter((r) => r.code === couponCode.trim().toUpperCase()).map((r) => r.orgId)).size,
      });
      if (res.ok) coupon = res.coupon;
      else couponError = res.reason;
    }
    const b = priceBreakdown({
      plan,
      cycle: interval,
      coupon,
      upgradeFrom: midCycle ? { plan: ov.plan, daysLeft: ov.daysLeftInPeriod, daysInCycle: ov.daysInPeriod } : null,
      billingState: stateName,
    });
    const renewalFrom = purpose === "renewal" ? (ov.periodEnd ?? today) : today;
    return {
      planId,
      planName: plan.name,
      interval,
      kind: purpose === "renewal" ? "renewal" : midCycle ? "upgrade_same_interval" : "new",
      fromPlan: { id: fromPlanRow.id, name: fromPlanRow.name, interval: ov.interval },
      planPrice: b.planPrice,
      couponsEnabled: true,
      proration: b.proration
        ? { oldPrice: b.proration.oldPrice, newPrice: b.proration.newPrice, daysLeft: b.proration.daysLeft, daysInPeriod: b.proration.daysInCycle, charge: b.proration.charge, credit: b.proration.credit }
        : null,
      coupon: coupon ? { code: coupon.code, description: describeCoupon(coupon) } : null,
      couponError,
      couponDiscount: b.couponDiscount,
      taxable: b.taxable,
      billingState: stateName,
      gst: b.gst,
      total: b.total,
      periodEnd: midCycle ? ov.periodEnd! : addCycle(renewalFrom, interval),
      recurringPrice: planPrice(plan, interval),
      couponRenewalsLeft: coupon?.duration === "first_n" ? Math.max(0, (coupon.durationCount ?? 1) - 1) : coupon?.duration === "forever" ? 99 : 0,
      paymentMode: ov.paymentMode,
      paymentModeReason: ov.paymentModeReason,
      warnings: [],
    };
  }

  function activate(p: PendingCheckout, reference: string): CheckoutReceipt {
    const s = get();
    const ov = overview();
    const plan = planById(s, p.planId);
    const pv = preview(p.planId, p.interval, p.couponCode ?? undefined, p.purpose);
    let periodStart = s.periodStart;
    if (p.purpose === "renewal") periodStart = ov.dueDate ?? ov.periodEnd ?? today;
    else if (pv.kind === "new") periodStart = today;
    const seq = s.invoiceSeq + 1;
    set({
      situation: "active",
      paidPlanId: plan.id,
      interval: p.interval,
      periodStart,
      picks: null,
      redeemed: p.couponCode ? [...new Set([...s.redeemed, p.couponCode])] : s.redeemed,
      invoiceSeq: seq,
      invoices: [
        {
          id: `inv_${seq}`,
          number: `IPX/26-27/0${seq}`,
          issuedAt: today,
          description: `${plan.name} · ${p.interval}${pv.kind === "upgrade_same_interval" ? " (upgrade, prorated)" : p.purpose === "renewal" ? " renewal" : ""}${p.couponCode ? ` (${p.couponCode})` : ""}`,
          subtotal: pv.taxable,
          gst: pv.gst.total,
          total: pv.total,
          status: "paid",
        },
        ...s.invoices,
      ],
      payments: [
        {
          id: `pay_${seq}`,
          orgId: DEMO_ORG.id,
          createdAt: `${today}T12:00:00`,
          description: `${plan.name} ${p.purpose === "renewal" ? "renewal" : pv.kind === "upgrade_same_interval" ? "upgrade (prorated)" : "purchase"}`,
          amount: pv.total,
          method: pv.total === 0 ? "100% coupon — no payment" : s.renewalMode === "auto" ? `Card · ${s.paymentMethod.label}` : "UPI",
          status: "captured",
          couponCode: p.couponCode ?? undefined,
          reference,
        },
        ...s.payments,
      ],
    });
    const after = deriveDates(get(), today);
    return {
      planId: plan.id,
      planName: plan.name,
      interval: p.interval,
      amount: pv.total,
      reference,
      activeUntil: after.periodEnd ?? addCycle(today, p.interval),
      couponCode: p.couponCode,
    };
  }

  /* ------------------------------------------------------------ admin helpers */

  function couponRow(c: Coupon): CouponRow {
    const uses = new Set(get().redemptions.filter((r) => r.code === c.code).map((r) => r.orgId)).size;
    return { coupon: c, uses, status: couponStatusFor(c, uses, today) };
  }

  function orgRow(o: MockOrg): SubscriptionRow {
    const s = get();
    if (o.id === DEMO_ORG.id) {
      // Keep the demo org in step with what the org side shows.
      const ov = overview();
      const d = deriveDates(s, today);
      return {
        orgId: o.id,
        orgName: o.name,
        city: o.city,
        state: o.state,
        plan: ov.plan,
        interval: ov.interval,
        status: ov.status,
        renewalMode: ov.renewalMode,
        keyDate: ov.graceEndsAt ?? ov.movedToBasicAt ?? d.periodEnd,
        users: o.users,
        couponCode: o.couponCode ?? null,
      };
    }
    return {
      orgId: o.id,
      orgName: o.name,
      city: o.city,
      state: o.state,
      plan: planById(s, o.plan),
      interval: o.cycle,
      status: o.status,
      renewalMode: o.renewalMode,
      keyDate: o.keyDate,
      users: o.users,
      couponCode: o.couponCode ?? null,
    };
  }

  /** Razorpay ids for a mock payment (offline ones have none). Mock invoices have no document. */
  function paymentRefs(p: MockPayment) {
    const online = p.reference.startsWith("pay_");
    return {
      orderId: online ? `order_${p.reference.slice(4)}` : null,
      gatewayPaymentId: online && p.status !== "failed" ? p.reference : null,
      invoice: null,
      creditNote: null,
    };
  }

  function paymentRow(p: MockPayment): AdminPaymentRow {
    return {
      id: p.id,
      orgId: p.orgId,
      orgName: get().orgs.find((o) => o.id === p.orgId)?.name ?? p.orgId,
      createdAt: p.createdAt,
      description: p.description,
      amount: p.amount,
      method: p.method,
      status: p.status,
      failureReason: p.failureReason ?? null,
      couponCode: p.couponCode ?? null,
      reference: p.reference,
      receiptUrl: null,
      ...paymentRefs(p),
    };
  }

  function detail(orgId: string): SubscriptionDetail {
    const s = get();
    const o = s.orgs.find((x) => x.id === orgId);
    if (!o) throw new BillingError("No organisation with that id.");
    const row = orgRow(o);
    const coupon = o.couponCode ? s.coupons.find((c) => c.code === o.couponCode) : undefined;
    return {
      ...row,
      renewalAmount: withGst(planPrice(row.plan, row.interval), o.state),
      graceDays: s.lifecycle.graceDays,
      timeline: o.timeline,
      payments: s.payments.filter((p) => p.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(paymentRow),
      coupon: coupon ? couponRow(coupon) : null,
    };
  }

  function updateOrg(orgId: string, patch: (o: MockOrg) => Partial<MockOrg>) {
    set({ orgs: get().orgs.map((o) => (o.id === orgId ? { ...o, ...patch(o) } : o)) });
  }

  const event = (o: MockOrg, kind: MockOrg["timeline"][number]["kind"], text: string) => ({ timeline: [...o.timeline, { at: today, kind, text }] });

  const client: MockBillingClient = {
    isMock: true,
    isReal: () => false,
    snapshot: () => get(),
    overviewNow: () => overview(),
    reset() {
      state = initialMockState(opts.initial);
      save();
    },

    getBillingOverview: () => ok(overview()),
    listPlans: () => ok([...get().plans].sort((a, b) => a.rank - b.rank)),

    listAdminCheckouts: () => ok([]),

    previewCheckout: (req) => ok(preview(req.planId, req.interval, req.couponCode, req.purpose ?? "purchase")),

    startCheckout(req) {
      const s = get();
      // Same rule as the API: the org profile must have every invoice field.
      if (missingBillingDetails(s.billingProfile).length) return fail("Complete your organisation details to continue.");
      const pv = preview(req.planId, req.interval, req.couponCode, req.purpose);
      if (req.couponCode && pv.couponError) return fail(pv.couponError);
      const p: PendingCheckout = { planId: req.planId, interval: req.interval, couponCode: pv.coupon?.code ?? null, purpose: req.purpose, amount: pv.total };
      if (pv.total === 0) return ok({ status: "activated" as const, receipt: activate(p, "free_coupon") });
      const id = `chk_${Math.random().toString(36).slice(2, 10)}`;
      if (pv.paymentMode === "manual") {
        // Same as the API: the same request again is returned; a different one is refused.
        const existing = s.pendingRequest;
        if (existing) {
          if (existing.planId !== p.planId || existing.interval !== p.interval) {
            const ov = overview();
            return fail(
              pendingRequestText({ fromPlan: { id: ov.plan.id, name: ov.plan.name }, toPlan: { id: existing.planId, name: planById(s, existing.planId).name }, createdAt: existing.createdAt }),
            );
          }
          return ok({ status: "pending_approval" as const, mode: "manual" as const, checkoutId: existing.checkoutId, requestId: existing.requestId });
        }
        const pendingRequest = { requestId: `pcr_${id.slice(4)}`, checkoutId: id, planId: p.planId, interval: p.interval, createdAt: `${today}T12:00:00.000Z` };
        set({ pendingRequest });
        return ok({ status: "pending_approval" as const, mode: "manual" as const, checkoutId: id, requestId: pendingRequest.requestId });
      }
      pending.set(id, p);
      return ok({ status: "payment_required" as const, mode: "online" as const, checkoutId: id, amount: pv.total, razorpay: null });
    },

    confirmCheckout(req) {
      const p = pending.get(req.checkoutId);
      if (!p) return fail("This checkout has expired. Please start again.");
      pending.delete(req.checkoutId);
      activate(p, req.razorpayPaymentId);
      return ok({ checkoutId: req.checkoutId, checkoutStatus: "paid" as const, paymentStatus: "captured" as const, toPlanId: p.planId, toInterval: p.interval });
    },

    updatePaymentMethod(req) {
      const pm =
        req.kind === "card"
          ? { kind: "card" as const, label: "Mastercard •••• 5100", detail: "Expires 11/2029 · mandate up to ₹15,000" }
          : { kind: "upi" as const, label: "UPI AutoPay · rohan@okhdfc", detail: "Mandate up to ₹15,000" };
      set({ paymentMethod: pm });
      return ok(pm);
    },

    cancelPlan() {
      const st = overview().status;
      if (st === "free" || st === "moved_to_basic") return fail("You're already on Basic.");
      set({ situation: "cancellation_scheduled" });
      return ok(overview());
    },
    undoCancel() {
      if (get().situation !== "cancellation_scheduled") return fail("No change to Basic is scheduled.");
      set({ situation: "active" });
      return ok(overview());
    },
    scheduleDowngrade(req) {
      const s = get();
      const ov = overview();
      const target = planById(s, req.planId);
      if (target.rank >= ov.plan.rank) return fail(`${target.name} isn't smaller than your current plan.`);
      set({ situation: "downgrade_scheduled", downgradeTargetId: target.id });
      return ok(overview());
    },
    undoDowngrade() {
      if (get().situation !== "downgrade_scheduled") return fail("No downgrade is scheduled.");
      set({ situation: "active" });
      return ok(overview());
    },

    getRetentionChoices: (req) => ok(deriveRetention(get(), today, req.targetPlanId)),
    saveRetentionChoices(req) {
      const s = get();
      const target = planById(s, req.targetPlanId);
      if (req.userIds.length > (target.limits.users ?? Infinity)) return fail(`${target.name} allows ${target.limits.users} users.`);
      if (req.projectIds.length > (target.limits.projects ?? Infinity)) return fail(`${target.name} allows ${target.limits.projects} projects.`);
      if (req.landingPageIds.length > (target.limits.landingPages ?? Infinity)) return fail(`${target.name} allows ${target.limits.landingPages} landing pages.`);
      const owner = deriveRetention(s, today, target.id).users.find((u) => u.locked);
      if (owner && !req.userIds.includes(owner.id)) return fail("The owner always stays active.");
      set({ picks: { targetPlanId: target.id, users: req.userIds, projects: req.projectIds, landingPages: req.landingPageIds } });
      return ok(deriveRetention(get(), today, target.id));
    },

    getAccessStatus: () => ok(deriveAccess(get())),

    listInvoices: (req) =>
      ok(paged(overview().status === "free" ? [] : get().invoices.map((i) => ({ ...i, pdfUrl: null, checkoutId: null })), req.page, req.pageSize)),
    listPayments: (req) =>
      ok(
        paged<PaymentRecord>(
          overview().status === "free"
            ? []
            : get()
                .payments.filter((p) => p.orgId === DEMO_ORG.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((p) => ({
                  id: p.id,
                  createdAt: p.createdAt,
                  description: p.description,
                  amount: p.amount,
                  method: p.method,
                  status: p.status,
                  failureReason: p.failureReason ?? null,
                  couponCode: p.couponCode ?? null,
                  reference: p.reference,
                  receiptUrl: null,
                  ...paymentRefs(p),
                })),
          req.page,
          req.pageSize,
        ),
      ),

    listOrgRequests(req) {
      const s = get();
      const ov = overview();
      const p = s.pendingRequest;
      const rows: OrgPlanRequest[] = p
        ? [
            {
              id: p.requestId,
              requestedAt: p.createdAt,
              requestedBy: ov.ownerName || null,
              fromPlan: { id: ov.plan.id, name: ov.plan.name },
              toPlan: { id: p.planId, name: planById(s, p.planId).name },
              interval: p.interval,
              amount: planPrice(planById(s, p.planId), p.interval),
              amountNote: null,
              status: "pending",
              decidedAt: null,
              rejectionReason: null,
              whatStays: null,
            },
          ]
        : [];
      return ok(paged(rows, req.page, req.pageSize));
    },
    withdrawRequest(requestId) {
      const s = get();
      if (!s.pendingRequest || s.pendingRequest.requestId !== requestId) return fail("Only pending requests can be withdrawn.");
      set({ pendingRequest: null });
      return ok(overview());
    },
    listOrgCoupons() {
      const s = get();
      const names = planNames(s);
      return ok(
        s.coupons
          .filter((c) => (c.orgIds ? c.orgIds.includes(DEMO_ORG.id) : c.showToCustomers === true) && c.validFrom <= today)
          .map((c) => {
            const used = s.redemptions.find((r) => r.code === c.code && r.orgId === DEMO_ORG.id) ?? null;
            const redeemed = !!used || s.redeemed.includes(c.code);
            const row = couponRow(c);
            const status: OrgCoupon["status"] =
              redeemed && c.oncePerOrg ? "redeemed" : row.status === "expired" ? "expired" : row.status === "used_up" && !redeemed ? "used_up" : "available";
            return {
              code: c.code,
              description: c.description || describeCoupon(c),
              kind: c.kind,
              value: c.value,
              plans: c.planIds.map((id) => ({ id, name: names[id] ?? id })),
              interval: c.interval,
              duration: c.duration,
              durationCount: c.durationCount,
              validTo: c.validTo,
              forYourOrg: !!c.orgIds,
              status,
              redeemedAt: used ? used.at : null,
              invoiceUrl: null,
              invoiceNumber: null,
            };
          }),
      );
    },

    /* ------------------------------------------------------------ admin */

    listAdminPlans: () => ok([...get().plans].sort((a, b) => a.rank - b.rank)),
    saveAdminPlan(plan) {
      if (plan.isFree && (plan.priceMonthly !== 0 || plan.priceYearly !== 0)) return fail("The free plan can't have a price.");
      if (!plan.isFree && plan.priceMonthly <= 0) return fail("A paid plan needs a monthly price.");
      set({ plans: get().plans.map((p) => (p.id === plan.id ? plan : p)) });
      return ok(plan);
    },

    listCoupons: () => ok(get().coupons.map(couponRow)),
    getCoupon(code) {
      const s = get();
      const c = s.coupons.find((x) => x.code === code);
      if (!c) return fail(`There is no coupon called ${code}.`);
      const redemptions = s.redemptions
        .filter((r) => r.code === code)
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((r) => ({ orgId: r.orgId, orgName: s.orgs.find((o) => o.id === r.orgId)?.name ?? r.orgId, at: r.at, planName: planById(s, r.plan).name, discount: r.discount }));
      return ok({ ...couponRow(c), redemptions, totalDiscount: round2(redemptions.reduce((sum, r) => sum + r.discount, 0)) });
    },
    saveCoupon(req) {
      const s = get();
      const c = { ...req.coupon, code: req.coupon.code.trim().toUpperCase() };
      if (!/^[A-Z0-9]{3,20}$/.test(c.code)) return fail("Codes are 3–20 letters or digits.");
      const exists = s.coupons.some((x) => x.code === c.code);
      if (req.isNew && exists) return fail(`${c.code} already exists.`);
      if (!req.isNew && !exists) return fail(`There is no coupon called ${c.code}.`);
      set({ coupons: req.isNew ? [...s.coupons, c] : s.coupons.map((x) => (x.code === c.code ? c : x)) });
      return ok(couponRow(c));
    },
    listOrgOptions: () => ok(get().orgs.map((o) => ({ id: o.id, name: o.name, city: o.city, planName: planById(get(), o.plan).name }))),

    listSubscriptions(req) {
      const rows = get().orgs.map(orgRow);
      const counts = Object.fromEntries(
        (["free", "active", "renewal_due", "past_due", "grace_ending", "moved_to_basic", "cancellation_scheduled", "downgrade_scheduled"] as SubscriptionStatus[]).map((st) => [
          st,
          rows.filter((r) => r.status === st).length,
        ]),
      ) as Record<SubscriptionStatus, number>;
      const q = (req.q ?? "").trim().toLowerCase();
      const filtered = rows.filter((r) => (!req.status || r.status === req.status) && (!req.planId || r.plan.id === req.planId) && r.orgName.toLowerCase().includes(q));
      return ok({ ...paged(filtered, req.page, req.pageSize), countsByStatus: counts });
    },
    getSubscription(orgId) {
      try {
        return ok(detail(orgId));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    extendGrace(req) {
      const o = get().orgs.find((x) => x.id === req.orgId);
      if (!o) return fail("No organisation with that id.");
      if ((o.status !== "past_due" && o.status !== "grace_ending") || !o.keyDate) return fail("Only an organisation in its grace period can get more time.");
      const until = addDays(o.keyDate, req.days);
      updateOrg(o.id, () => ({ status: "past_due", keyDate: until, ...event(o, "grace", `Grace extended by ${req.days} days to ${formatDate(until)}${req.note ? ` — ${req.note}` : ""}`) }));
      return ok(detail(o.id));
    },
    markPaidOffline(req) {
      const s = get();
      const o = s.orgs.find((x) => x.id === req.orgId);
      if (!o) return fail("No organisation with that id.");
      if (!(req.amount > 0)) return fail("Enter the amount received.");
      const next = addCycle(req.receivedOn, o.cycle);
      set({
        payments: [
          {
            id: `off_${s.payments.length + 1}`,
            orgId: o.id,
            createdAt: `${req.receivedOn}T12:00:00`,
            description: `${planById(s, o.plan).name} renewal (paid offline)`,
            amount: req.amount,
            method: `Offline · ${req.method}`,
            status: "offline",
            reference: req.reference || "—",
          },
          ...s.payments,
        ],
      });
      updateOrg(o.id, () => ({
        status: "active",
        keyDate: next,
        ...event(o, "renewed", `Marked paid offline — ${formatINR(req.amount)} by ${req.method}${req.reference ? ` (${req.reference})` : ""}`),
      }));
      return ok(detail(o.id));
    },
    applyCoupon(req) {
      const s = get();
      const o = s.orgs.find((x) => x.id === req.orgId);
      if (!o) return fail("No organisation with that id.");
      const res = validateCoupon(req.code, s.coupons, { planId: o.plan, planNames: planNames(s), cycle: o.cycle, orgId: o.id, today, orgRedeemed: [], usesSoFar: 0 });
      if (!res.ok) return fail(res.reason);
      updateOrg(o.id, () => ({ couponCode: res.coupon.code, ...event(o, "coupon", `${res.coupon.code} applied by admin: ${describeCoupon(res.coupon)}`) }));
      return ok(detail(o.id));
    },
    cancelSubscription(req) {
      const s = get();
      const o = s.orgs.find((x) => x.id === req.orgId);
      if (!o) return fail("No organisation with that id.");
      const note = req.note ? ` — ${req.note}` : "";
      updateOrg(o.id, () =>
        req.when === "now"
          ? { plan: freePlan(s).id, status: "moved_to_basic", keyDate: today, ...event(o, "moved_to_basic", `Cancelled by admin and moved to Basic now${note}`) }
          : { status: "cancellation_scheduled", ...event(o, "cancel", `Cancellation scheduled by admin for ${o.keyDate ? formatDate(o.keyDate) : "period end"}${note}`) },
      );
      return ok(detail(o.id));
    },

    listAdminPayments(req) {
      const all = [...get().payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(paymentRow);
      const q = req.search?.trim().toLowerCase();
      const found = (p: AdminPaymentRow) => !q || [p.orderId, p.gatewayPaymentId, p.reference].some((v) => v?.toLowerCase().includes(q));
      const rows = all.filter((p) => (!req.status || p.status === req.status) && (!req.orgId || p.orgId === req.orgId) && found(p));
      const sum = (f: (p: AdminPaymentRow) => boolean) => round2(all.filter(f).reduce((t, p) => t + p.amount, 0));
      return ok({
        ...paged(rows, req.page, req.pageSize),
        totals: {
          collected: sum((p) => p.status === "captured" || p.status === "offline"),
          refunded: sum((p) => p.status === "refunded"),
          failed: all.filter((p) => p.status === "failed").length,
        },
      });
    },
    refundPayment(req) {
      const s = get();
      const p = s.payments.find((x) => x.id === req.paymentId);
      if (!p) return fail("Payment not found.");
      if (p.status !== "captured" && p.status !== "offline") return fail("Only a paid payment can be refunded.");
      if (p.amount <= 0) return fail("Nothing to refund on a ₹0 payment.");
      const cn = `CN/26-27/${String(s.creditNoteSeq).padStart(4, "0")}`;
      set({ creditNoteSeq: s.creditNoteSeq + 1, payments: s.payments.map((x) => (x.id === p.id ? { ...x, status: "refunded" } : x)) });
      return ok({ payment: paymentRow({ ...p, status: "refunded" }), creditNoteNumber: cn });
    },

    getLifecycleSettings: () => ok(get().lifecycle),
    runLifecycleCheck: () =>
      ok({ ranAt: new Date().toISOString(), scanned: get().orgs.length, movedToFreePlan: 0, scheduledPlanApplied: 0, newlyPastDue: 0, newlyExpired: 0, newlyCancelled: 0, remindersSent: 0 }),
    getCompanyDetails() {
      const seller = get().seller ?? { ...MOCK_SELLER };
      return ok({ seller, warnings: seller.state ? [] : [{ code: "seller_state_missing" as const, message: "The company's state isn't set, so every checkout is charged IGST." }] });
    },
    saveCompanyDetails(details) {
      const problem = checkGstin(details.seller.gstin, details.seller.state);
      if (problem) return fail(problem);
      set({ seller: details.seller });
      return ok({ seller: details.seller, warnings: details.seller.state ? [] : [{ code: "seller_state_missing" as const, message: "The company's state isn't set, so every checkout is charged IGST." }] });
    },
    saveLifecycleSettings(settings) {
      if (settings.graceDays < 0 || settings.notifyDaysBefore < 0) return fail("Days can't be negative.");
      // Omitted = unchanged (the switch lives in Integrations → Online payments).
      const on = settings.onlinePaymentsEnabled ?? get().lifecycle.onlinePaymentsEnabled;
      const lifecycle = { ...settings, onlinePaymentsEnabled: on, paymentMode: on ? ("online" as const) : ("manual" as const), paymentModeReason: on ? null : ("switched_off" as const) };
      set({ lifecycle });
      return ok(lifecycle);
    },
  };
  return client;
}

