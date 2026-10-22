/** The mock client honours the BillingClient contract the backend will implement. */
import { describe, expect, it } from "vitest";
import { createMockBillingClient } from "../mock/client";

describe("mock billing client", () => {
  it("an active monthly Pro org has 18 of 31 days left and renews at ₹5,900", async () => {
    const o = await createMockBillingClient().getBillingOverview();
    expect(o.status).toBe("active");
    expect(o.periodEnd).toBe("2026-11-01");
    expect(o.daysLeftInPeriod).toBe(18);
    expect(o.daysInPeriod).toBe(31);
    expect(o.renewalAmount).toBe(5900);
  });

  it("grace day 1 has 7 days left; grace-ends-tomorrow has 1 and lists what stays", async () => {
    const due = await createMockBillingClient({ initial: { situation: "payment_due" } }).getBillingOverview();
    expect(due.graceDay).toBe(1);
    expect(due.graceDaysLeft).toBe(7);
    const last = await createMockBillingClient({ initial: { situation: "grace_ends_tomorrow" } }).getBillingOverview();
    expect(last.graceEndsAt).toBe("2026-10-15");
    expect(last.graceDaysLeft).toBe(1);
    expect(last.retention?.users).toEqual(["Rohan Mehta", "Priya Sharma"]);
  });

  it("previews a mid-cycle upgrade with the prorated charge", async () => {
    const c = createMockBillingClient({ initial: { paidPlanId: "growth" } });
    const p = await c.previewCheckout({ planId: "pro", interval: "monthly" });
    expect(p.kind).toBe("upgrade_same_interval");
    expect(p.proration?.charge).toBe(1741.94);
    expect(p.total).toBe(2055.48);
  });

  it("first purchase: blocked until the org details are complete, then coupon, payment and the plan is active", async () => {
    const empty = createMockBillingClient({ initial: { situation: "basic", billingProfile: null, redeemed: [] } });
    expect((await empty.getBillingOverview()).billingDetailsMissing).toEqual(["legalName", "addressLine1", "city", "state", "pincode"]);
    await expect(empty.startCheckout({ planId: "growth", interval: "monthly", purpose: "purchase" })).rejects.toThrow(/Complete your organisation details/);
    const c = createMockBillingClient({
      initial: { situation: "basic", redeemed: [], billingProfile: { legalName: "Acme", addressLine1: "1 Road", addressLine2: null, city: "Mysuru", state: "29", pincode: "570001", country: "IN", gstin: null } },
    });
    expect((await c.getBillingOverview()).billingDetailsMissing).toEqual([]);
    const start = await c.startCheckout({ planId: "growth", interval: "monthly", couponCode: "LAUNCH20", purpose: "purchase" });
    expect(start.status).toBe("payment_required");
    if (start.status !== "payment_required") return;
    expect(start.amount).toBe(1888);
    const done = await c.confirmCheckout({ checkoutId: start.checkoutId, razorpayOrderId: "o", razorpayPaymentId: "pay_1", razorpaySignature: "s" });
    expect(done).toMatchObject({ checkoutStatus: "paid", toPlanId: "growth", toInterval: "monthly" });
    const o = await c.getBillingOverview();
    expect(o.plan.id).toBe("growth");
    expect(o.periodEnd).toBe("2026-11-14");
    expect((await c.listInvoices({})).data[0].total).toBe(1888);
  });

  it("a 100% coupon activates without a payment", async () => {
    const c = createMockBillingClient({ initial: { situation: "moved_to_basic" } });
    const res = await c.startCheckout({ planId: "pro", interval: "monthly", couponCode: "PARTNER100", purpose: "purchase" });
    expect(res.status).toBe("activated");
  });

  it("schedules and undoes a downgrade and a cancellation", async () => {
    const c = createMockBillingClient();
    expect((await c.scheduleDowngrade({ planId: "growth" })).status).toBe("downgrade_scheduled");
    expect((await c.undoDowngrade()).status).toBe("active");
    expect((await c.cancelPlan({})).cancelAt).toBe("2026-11-01");
    expect((await c.undoCancel()).status).toBe("active");
    await expect(c.scheduleDowngrade({ planId: "pro" })).rejects.toThrow(/isn't smaller/);
  });

  it("retention: defaults for Basic, owner locked, limits enforced, and locks apply on Basic", async () => {
    const c = createMockBillingClient({ initial: { situation: "payment_due" } });
    const r = await c.getRetentionChoices({});
    expect(r.targetPlan.id).toBe("basic");
    expect(r.users.filter((u) => u.selected).map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(r.users.find((u) => u.id === "u1")?.locked).toBe(true);
    await expect(c.saveRetentionChoices({ targetPlanId: "basic", userIds: ["u1", "u2", "u3"], projectIds: [], landingPageIds: [] })).rejects.toThrow(/allows 2 users/);
    await expect(c.saveRetentionChoices({ targetPlanId: "basic", userIds: ["u2"], projectIds: [], landingPageIds: [] })).rejects.toThrow(/owner/);

    const moved = createMockBillingClient({ initial: { situation: "moved_to_basic" } });
    const a = await moved.getAccessStatus();
    expect(a.pausedUserIds).toHaveLength(8);
    expect(a.viewOnlyProjectIds).toEqual(["p2", "p3", "p4", "p5"]);
    expect(a.offlineLandingPageIds).toEqual(["lp2", "lp3", "lp4"]);
    expect(a.modules.teamChat).toBe(false);
  });

  it("admin: coupons, subscriptions, grace, offline payment and refund", async () => {
    const c = createMockBillingClient();
    await c.saveCoupon({
      isNew: true,
      coupon: {
        code: "SKYLINE15", description: "", kind: "percent", value: 15, planIds: ["growth", "pro"], interval: "any", duration: "first_payment",
        durationCount: null, validFrom: "2026-10-01", validTo: null, totalUses: null, oncePerOrg: true, orgIds: ["org-skyline"], showToCustomers: false,
      },
    });
    expect((await c.listCoupons()).map((r) => r.coupon.code)).toContain("SKYLINE15");
    expect((await c.getCoupon("LAUNCH20")).uses).toBe(2);

    const subs = await c.listSubscriptions({ page: 1, pageSize: 10 });
    expect(subs.data).toHaveLength(10);
    expect(subs.total).toBe(14);
    expect(subs.countsByStatus.moved_to_basic).toBe(2);

    const grace = await c.extendGrace({ orgId: "org-coastal", days: 3 });
    expect(grace.keyDate).toBe("2026-10-24");
    await expect(c.extendGrace({ orgId: "org-vista", days: 3 })).rejects.toThrow(/grace period/);

    const paid = await c.markPaidOffline({ orgId: "org-urbannest", amount: 2360, method: "NEFT / RTGS", reference: "UTR1", receivedOn: "2026-10-14" });
    expect(paid.status).toBe("active");
    expect(paid.payments[0].status).toBe("offline");

    const refund = await c.refundPayment({ paymentId: "pay_101" });
    expect(refund.payment.status).toBe("refunded");
    expect(refund.creditNoteNumber).toMatch(/^CN\//);
    await expect(c.refundPayment({ paymentId: "pay_101" })).rejects.toThrow(/Only a paid payment/);
  });
});
