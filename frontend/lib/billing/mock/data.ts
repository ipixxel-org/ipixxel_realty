/**
 * Mock billing data — the one file to edit for demos. Every number here is
 * illustrative. Only the mock client (./client.ts) and walkthrough fixtures
 * read it; the real backend replaces all of it.
 */
import type { MemberRole } from "../default-picks";
import type { BillingInterval, BillingPlan, Coupon, Invoice, PaymentStatus, RenewalMode, SubscriptionStatus, TimelineEvent } from "../types";

type InvoiceRow = { id: string; number: string; issuedAt: string; description: string; subtotal: number; gst: number; total: number; status: Invoice["status"] };

export interface MockUser { id: string; name: string; email: string; role: MemberRole; lastLoginAt: string }
export interface MockProject { id: string; name: string; location: string; units: number; updatedAt: string }
export interface MockLandingPage { id: string; name: string; projectId: string; url: string; leadsLast30Days: number; leadsTotal: number }
export interface MockPayment {
  id: string; orgId: string; createdAt: string; description: string; amount: number; method: string;
  status: PaymentStatus; failureReason?: string; couponCode?: string; reference: string;
}
export interface MockOrg {
  id: string; name: string; city: string; state: string; plan: string; cycle: BillingInterval;
  status: SubscriptionStatus; renewalMode: RenewalMode; keyDate: string | null; users: number;
  couponCode?: string; timeline: TimelineEvent[];
}
export interface MockRedemption { code: string; orgId: string; at: string; discount: number; plan: string }

/** The mock clock: "today" for the mock client and the walkthroughs, so every date is stable. */
export const TODAY = "2026-10-14";

export const GRACE_DAYS = 7;
export const NOTIFY_DAYS_BEFORE = 3;

/* ------------------------------------------------------------------ Plans */

export const PLANS: BillingPlan[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "Free forever — get your first project online.",
    priceMonthly: 0,
    priceYearly: 0,
    isFree: true,
    rank: 0,
    limits: { users: 2, projects: 1, landingPages: 1, templates: 1 },
    modules: { teamChat: false, metaLeadAds: false, metaPages: 0, whatsapp: false, aiCalling: false },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For growing teams running a few launches at once.",
    priceMonthly: 2000,
    priceYearly: 20000,
    isFree: false,
    rank: 1,
    limits: { users: 5, projects: 5, landingPages: 5, templates: 5 },
    modules: { teamChat: true, metaLeadAds: true, metaPages: 1, whatsapp: false, aiCalling: false },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For developers with a full sales floor.",
    priceMonthly: 5000,
    priceYearly: 50000,
    isFree: false,
    rank: 2,
    limits: { users: 10, projects: 20, landingPages: 20, templates: 20 },
    modules: { teamChat: true, metaLeadAds: true, metaPages: 5, whatsapp: false, aiCalling: false },
  },
];

/* --------------------------------------------------------------- Demo org */

export const DEMO_ORG = {
  id: "org-skyline",
  name: "Skyline Developers",
  ownerName: "Rohan Mehta",
  /** Templates in use — under every plan's limit, so it never needs picking. */
  templatesUsed: 1,
};

export const DEFAULT_BILLING_DETAILS = {
  legalName: "Skyline Developers Pvt. Ltd.",
  addressLine1: "4th Floor, Prestige Tech Park, Outer Ring Road",
  addressLine2: null as string | null,
  city: "Bengaluru",
  /** GST state code — Karnataka. */
  state: "29",
  pincode: "560103",
  country: "IN",
  gstin: "29AABCS1234F1Z5" as string | null,
};

/** The mock platform as GST seller. */
export const MOCK_SELLER = {
  legalName: "iPixxel Technologies Pvt. Ltd.",
  gstin: "29AAICI1234A1Z9",
  state: "29",
  addressLine1: "2nd Floor, Indiranagar 100 Ft Road",
  addressLine2: null,
  city: "Bengaluru",
  pincode: "560038",
};

/** Option A: the card / UPI mandate saved for auto-renewals. */
export const SAVED_PAYMENT_METHOD = {
  kind: "card" as "card" | "upi",
  label: "Visa •••• 4242",
  detail: "Expires 08/2028 · mandate up to ₹15,000",
};

export const DEMO_USERS: MockUser[] = [
  { id: "u1", name: "Rohan Mehta", email: "rohan@skylinedev.in", role: "owner", lastLoginAt: "2026-10-14" },
  { id: "u2", name: "Priya Sharma", email: "priya@skylinedev.in", role: "admin", lastLoginAt: "2026-10-13" },
  { id: "u3", name: "Arjun Nair", email: "arjun@skylinedev.in", role: "admin", lastLoginAt: "2026-10-02" },
  { id: "u4", name: "Kavya Reddy", email: "kavya@skylinedev.in", role: "manager", lastLoginAt: "2026-10-14" },
  { id: "u5", name: "Vikram Rao", email: "vikram@skylinedev.in", role: "agent", lastLoginAt: "2026-10-12" },
  { id: "u6", name: "Aditya Joshi", email: "aditya@skylinedev.in", role: "manager", lastLoginAt: "2026-10-11" },
  { id: "u7", name: "Sneha Iyer", email: "sneha@skylinedev.in", role: "agent", lastLoginAt: "2026-10-10" },
  { id: "u8", name: "Imran Khan", email: "imran@skylinedev.in", role: "agent", lastLoginAt: "2026-10-09" },
  { id: "u9", name: "Meera Pillai", email: "meera@skylinedev.in", role: "agent", lastLoginAt: "2026-09-28" },
  { id: "u10", name: "Nikhil Gowda", email: "nikhil@skylinedev.in", role: "agent", lastLoginAt: "2026-08-30" },
];

export const DEMO_PROJECTS: MockProject[] = [
  { id: "p1", name: "Skyline Heights", location: "Whitefield, Bengaluru", units: 240, updatedAt: "2026-10-12" },
  { id: "p2", name: "Lakeview Residency", location: "Hebbal, Bengaluru", units: 180, updatedAt: "2026-10-09" },
  { id: "p3", name: "Palm Grove Villas", location: "Sarjapur Road, Bengaluru", units: 64, updatedAt: "2026-09-30" },
  { id: "p4", name: "Orchid Enclave", location: "Mysuru", units: 120, updatedAt: "2026-09-21" },
  { id: "p5", name: "Metro Square Offices", location: "MG Road, Bengaluru", units: 48, updatedAt: "2026-08-15" },
];

export const DEMO_LANDING_PAGES: MockLandingPage[] = [
  { id: "lp1", name: "Skyline Heights — Launch Offer", projectId: "p1", url: "skyline.ipixxel.site/launch", leadsLast30Days: 142, leadsTotal: 610 },
  { id: "lp2", name: "Lakeview — Site Visit Weekend", projectId: "p2", url: "skyline.ipixxel.site/lakeview", leadsLast30Days: 87, leadsTotal: 302 },
  { id: "lp3", name: "Palm Grove — Diwali Booking", projectId: "p3", url: "skyline.ipixxel.site/palm-grove", leadsLast30Days: 35, leadsTotal: 35 },
  { id: "lp4", name: "Orchid Enclave — Brochure", projectId: "p4", url: "skyline.ipixxel.site/orchid", leadsLast30Days: 12, leadsTotal: 198 },
];

export const DEMO_INVOICES: InvoiceRow[] = [
  { id: "inv7", number: "IPX/26-27/0712", issuedAt: "2026-10-01", description: "Pro · monthly · Oct 2026", subtotal: 5000, gst: 900, total: 5900, status: "paid" },
  { id: "inv6", number: "IPX/26-27/0588", issuedAt: "2026-09-01", description: "Pro · monthly · Sep 2026", subtotal: 5000, gst: 900, total: 5900, status: "paid" },
  { id: "inv5", number: "IPX/26-27/0461", issuedAt: "2026-08-01", description: "Pro · monthly · Aug 2026", subtotal: 5000, gst: 900, total: 5900, status: "paid" },
  { id: "inv4", number: "IPX/26-27/0349", issuedAt: "2026-07-14", description: "Upgrade Growth → Pro (prorated, 18 of 31 days)", subtotal: 1741.94, gst: 313.54, total: 2055.48, status: "paid" },
  { id: "inv3", number: "IPX/26-27/0287", issuedAt: "2026-07-01", description: "Growth · monthly · Jul 2026 (LAUNCH20)", subtotal: 1600, gst: 288, total: 1888, status: "paid" },
  { id: "inv2", number: "IPX/26-27/0190", issuedAt: "2026-06-01", description: "Growth · monthly · Jun 2026 (LAUNCH20)", subtotal: 1600, gst: 288, total: 1888, status: "paid" },
  { id: "inv1", number: "IPX/25-26/1102", issuedAt: "2026-05-01", description: "Growth · monthly · May 2026 (LAUNCH20)", subtotal: 1600, gst: 288, total: 1888, status: "paid" },
];

/* ------------------------------------------------------- Admin-side orgs */

export const ORGS: MockOrg[] = [
  {
    id: "org-skyline", name: "Skyline Developers", city: "Bengaluru", state: "Karnataka", plan: "pro", cycle: "monthly",
    status: "active", renewalMode: "auto", keyDate: "2026-11-01", users: 10, couponCode: "LAUNCH20",
    timeline: [
      { at: "2026-04-20", kind: "bought", text: "Signed up on Basic (free)" },
      { at: "2026-05-01", kind: "bought", text: "Bought Growth monthly — ₹1,888 with LAUNCH20" },
      { at: "2026-05-01", kind: "coupon", text: "LAUNCH20 applied: 20% off the first 3 payments" },
      { at: "2026-06-01", kind: "renewed", text: "Renewed Growth — ₹1,888 (auto-charge, Visa •••• 4242)" },
      { at: "2026-07-01", kind: "renewed", text: "Renewed Growth — ₹1,888 (last LAUNCH20 payment)" },
      { at: "2026-07-14", kind: "plan_change", text: "Upgraded to Pro mid-cycle — ₹2,055.48 prorated" },
      { at: "2026-08-01", kind: "renewed", text: "Renewed Pro — ₹5,900" },
      { at: "2026-09-01", kind: "payment_failed", text: "Auto-charge failed: card declined by bank" },
      { at: "2026-09-01", kind: "grace", text: "Grace period started (7 days)" },
      { at: "2026-09-02", kind: "renewed", text: "Paid ₹5,900 by UPI — grace closed" },
      { at: "2026-10-01", kind: "renewed", text: "Renewed Pro — ₹5,900" },
    ],
  },
  {
    id: "org-greenfield", name: "Greenfield Realty", city: "Pune", state: "Maharashtra", plan: "growth", cycle: "monthly",
    status: "renewal_due", renewalMode: "manual", keyDate: "2026-10-17", users: 4,
    timeline: [
      { at: "2026-06-17", kind: "bought", text: "Bought Growth monthly — ₹1,770 with FLAT500" },
      { at: "2026-07-17", kind: "renewed", text: "Paid renewal — ₹2,360 (Pay now)" },
      { at: "2026-08-17", kind: "renewed", text: "Paid renewal — ₹2,360 (Pay now)" },
      { at: "2026-09-17", kind: "renewed", text: "Paid renewal — ₹2,360 (Pay now)" },
    ],
  },
  {
    id: "org-coastal", name: "Coastal Homes", city: "Kochi", state: "Kerala", plan: "pro", cycle: "monthly",
    status: "past_due", renewalMode: "auto", keyDate: "2026-10-21", users: 9,
    timeline: [
      { at: "2026-03-14", kind: "bought", text: "Bought Pro monthly — ₹5,900" },
      { at: "2026-09-14", kind: "renewed", text: "Renewed Pro — ₹5,900" },
      { at: "2026-10-14", kind: "payment_failed", text: "Auto-charge failed: UPI mandate revoked" },
      { at: "2026-10-14", kind: "grace", text: "Grace period started — ends 21 Oct" },
    ],
  },
  {
    id: "org-urbannest", name: "UrbanNest Builders", city: "Hyderabad", state: "Telangana", plan: "growth", cycle: "monthly",
    status: "grace_ending", renewalMode: "manual", keyDate: "2026-10-15", users: 5,
    timeline: [
      { at: "2026-05-08", kind: "bought", text: "Bought Growth monthly — ₹2,360 with FLAT500 (₹1,770)" },
      { at: "2026-09-08", kind: "renewed", text: "Paid renewal — ₹2,360" },
      { at: "2026-10-08", kind: "payment_failed", text: "Renewal not paid" },
      { at: "2026-10-08", kind: "grace", text: "Grace period started — ends 15 Oct" },
    ],
  },
  {
    id: "org-sunrise", name: "Sunrise Estates", city: "Chennai", state: "Tamil Nadu", plan: "basic", cycle: "monthly",
    status: "moved_to_basic", renewalMode: "manual", keyDate: "2026-10-07", users: 6,
    timeline: [
      { at: "2026-06-30", kind: "bought", text: "Bought Growth monthly — ₹2,360" },
      { at: "2026-09-30", kind: "payment_failed", text: "Renewal not paid" },
      { at: "2026-09-30", kind: "grace", text: "Grace period started — ends 7 Oct" },
      { at: "2026-10-07", kind: "moved_to_basic", text: "Moved to Basic — 4 users paused, 2 projects view-only" },
    ],
  },
  {
    id: "org-heritage", name: "Heritage Properties", city: "Jaipur", state: "Rajasthan", plan: "pro", cycle: "yearly",
    status: "cancellation_scheduled", renewalMode: "auto", keyDate: "2027-02-01", users: 8,
    timeline: [
      { at: "2026-02-01", kind: "bought", text: "Bought Pro yearly — ₹59,000" },
      { at: "2026-09-22", kind: "cancel", text: "Owner scheduled cancellation — access until 1 Feb 2027" },
    ],
  },
  {
    id: "org-bluestone", name: "Bluestone Infra", city: "Mangaluru", state: "Karnataka", plan: "pro", cycle: "monthly",
    status: "downgrade_scheduled", renewalMode: "auto", keyDate: "2026-11-05", users: 5,
    timeline: [
      { at: "2026-04-05", kind: "bought", text: "Bought Pro monthly — ₹5,900" },
      { at: "2026-10-05", kind: "renewed", text: "Renewed Pro — ₹5,900" },
      { at: "2026-10-10", kind: "plan_change", text: "Downgrade to Growth scheduled for 5 Nov" },
    ],
  },
  {
    id: "org-pinnacle", name: "Pinnacle Realtors", city: "Ahmedabad", state: "Gujarat", plan: "basic", cycle: "monthly",
    status: "free", renewalMode: "manual", keyDate: null, users: 2,
    timeline: [{ at: "2026-09-12", kind: "bought", text: "Signed up on Basic (free)" }],
  },
  {
    id: "org-meridian", name: "Meridian Homes", city: "Bengaluru", state: "Karnataka", plan: "growth", cycle: "yearly",
    status: "active", renewalMode: "auto", keyDate: "2027-03-19", users: 5,
    timeline: [
      { at: "2026-03-19", kind: "bought", text: "Bought Growth yearly — ₹23,600" },
    ],
  },
  {
    id: "org-vista", name: "Vista Living", city: "Noida", state: "Uttar Pradesh", plan: "pro", cycle: "yearly",
    status: "active", renewalMode: "manual", keyDate: "2027-01-08", users: 10,
    timeline: [{ at: "2026-01-08", kind: "bought", text: "Bought Pro yearly — ₹59,000" }],
  },
  {
    id: "org-aurora", name: "Aurora Spaces", city: "Kolkata", state: "West Bengal", plan: "basic", cycle: "monthly",
    status: "free", renewalMode: "manual", keyDate: null, users: 1,
    timeline: [{ at: "2026-10-02", kind: "bought", text: "Signed up on Basic (free)" }],
  },
  {
    id: "org-crescent", name: "Crescent Developers", city: "Mysuru", state: "Karnataka", plan: "growth", cycle: "monthly",
    status: "active", renewalMode: "auto", keyDate: "2026-10-29", users: 3, couponCode: "PARTNER100",
    timeline: [
      { at: "2026-09-29", kind: "bought", text: "Bought Growth monthly — ₹0 with PARTNER100" },
      { at: "2026-09-29", kind: "coupon", text: "PARTNER100 applied: 100% off the first payment" },
    ],
  },
  {
    id: "org-riverside", name: "Riverside Realty", city: "Surat", state: "Gujarat", plan: "growth", cycle: "monthly",
    status: "renewal_due", renewalMode: "auto", keyDate: "2026-10-16", users: 5,
    couponCode: "LAUNCH20",
    timeline: [
      { at: "2026-08-16", kind: "bought", text: "Bought Growth monthly — ₹1,888 with LAUNCH20" },
      { at: "2026-09-16", kind: "renewed", text: "Renewed Growth — ₹1,888 (LAUNCH20, payment 2 of 3)" },
    ],
  },
  {
    id: "org-summit", name: "Summit Buildcon", city: "Indore", state: "Madhya Pradesh", plan: "basic", cycle: "monthly",
    status: "moved_to_basic", renewalMode: "auto", keyDate: "2026-09-20", users: 7,
    timeline: [
      { at: "2026-07-13", kind: "bought", text: "Bought Pro monthly — ₹5,900" },
      { at: "2026-09-13", kind: "payment_failed", text: "Auto-charge failed: insufficient funds" },
      { at: "2026-09-20", kind: "moved_to_basic", text: "Moved to Basic after grace" },
    ],
  },
];

/* ---------------------------------------------------------------- Coupons */

export const COUPONS: Coupon[] = [
  {
    code: "LAUNCH20", description: "Launch offer — 20% off the first 3 months", kind: "percent", value: 20,
    planIds: ["growth", "pro"], interval: "monthly", duration: "first_n", durationCount: 3,
    validFrom: "2026-04-01", validTo: "2026-12-31", totalUses: 200, oncePerOrg: true, orgIds: null,
  },
  {
    code: "FLAT500", description: "₹500 off your first payment", kind: "fixed", value: 500,
    planIds: ["growth", "pro"], interval: "any", duration: "first_payment", durationCount: null,
    validFrom: "2026-01-01", validTo: null, totalUses: null, oncePerOrg: true, orgIds: null,
  },
  {
    code: "PARTNER100", description: "Channel-partner deal — first payment free", kind: "percent", value: 100,
    planIds: ["growth", "pro"], interval: "any", duration: "first_payment", durationCount: null,
    validFrom: "2026-09-01", validTo: "2027-03-31", totalUses: 10, oncePerOrg: true,
    orgIds: ["org-skyline", "org-crescent"],
  },
  {
    code: "DIWALI25", description: "Diwali 2025 — 25% off yearly plans", kind: "percent", value: 25,
    planIds: ["growth", "pro"], interval: "yearly", duration: "first_payment", durationCount: null,
    validFrom: "2025-10-15", validTo: "2025-11-15", totalUses: 50, oncePerOrg: true, orgIds: null,
  },
];

export const COUPON_REDEMPTIONS: MockRedemption[] = [
  { code: "LAUNCH20", orgId: "org-skyline", at: "2026-05-01", discount: 400, plan: "growth" },
  { code: "LAUNCH20", orgId: "org-skyline", at: "2026-06-01", discount: 400, plan: "growth" },
  { code: "LAUNCH20", orgId: "org-skyline", at: "2026-07-01", discount: 400, plan: "growth" },
  { code: "LAUNCH20", orgId: "org-riverside", at: "2026-08-16", discount: 400, plan: "growth" },
  { code: "LAUNCH20", orgId: "org-riverside", at: "2026-09-16", discount: 400, plan: "growth" },
  { code: "FLAT500", orgId: "org-urbannest", at: "2026-05-08", discount: 500, plan: "growth" },
  { code: "FLAT500", orgId: "org-greenfield", at: "2026-06-17", discount: 500, plan: "growth" },
  { code: "FLAT500", orgId: "org-sunrise", at: "2026-06-30", discount: 500, plan: "growth" },
  { code: "PARTNER100", orgId: "org-crescent", at: "2026-09-29", discount: 2000, plan: "growth" },
  { code: "DIWALI25", orgId: "org-heritage", at: "2025-11-02", discount: 12500, plan: "pro" },
];

/** Codes the demo org has already redeemed (for "once per organisation"). */
export const DEMO_ORG_REDEEMED: string[] = ["LAUNCH20"];

/* --------------------------------------------------------------- Payments */

export const PAYMENTS: MockPayment[] = [
  { id: "pay_101", orgId: "org-skyline", createdAt: "2026-10-01T09:02:00", description: "Pro renewal · Oct 2026", amount: 5900, method: "Card · Visa •••• 4242", status: "captured", reference: "pay_PxR41kz1mAq7" },
  { id: "pay_102", orgId: "org-coastal", createdAt: "2026-10-14T06:00:00", description: "Pro renewal · Oct 2026", amount: 5900, method: "UPI mandate", status: "failed", failureReason: "UPI mandate revoked", reference: "pay_PxV09aLm3Qe2" },
  { id: "pay_103", orgId: "org-bluestone", createdAt: "2026-10-05T06:00:00", description: "Pro renewal · Oct 2026", amount: 5900, method: "Card · Mastercard •••• 8812", status: "captured", reference: "pay_PxS77hJk2Lp0" },
  { id: "pay_104", orgId: "org-crescent", createdAt: "2026-09-29T15:41:00", description: "Growth · first payment (PARTNER100)", amount: 0, method: "100% coupon — no payment", status: "captured", couponCode: "PARTNER100", reference: "free_PxQ12" },
  { id: "pay_105", orgId: "org-greenfield", createdAt: "2026-09-17T11:20:00", description: "Growth renewal · Sep 2026", amount: 2360, method: "UPI · greenfield@okaxis", status: "captured", reference: "pay_PxN55tYu8Rw1" },
  { id: "pay_106", orgId: "org-urbannest", createdAt: "2026-09-08T10:05:00", description: "Growth renewal · Sep 2026", amount: 2360, method: "Netbanking · HDFC", status: "captured", reference: "pay_PxL20bVc4Ms9" },
  { id: "pay_107", orgId: "org-skyline", createdAt: "2026-09-02T18:13:00", description: "Pro renewal · Sep 2026 (paid in grace)", amount: 5900, method: "UPI · rohan@okhdfc", status: "captured", reference: "pay_PxK98qWe1Zx4" },
  { id: "pay_108", orgId: "org-skyline", createdAt: "2026-09-01T06:00:00", description: "Pro renewal · Sep 2026", amount: 5900, method: "Card · Visa •••• 4242", status: "failed", failureReason: "Card declined by bank", reference: "pay_PxK10aSd7Cv3" },
  { id: "pay_109", orgId: "org-heritage", createdAt: "2026-02-01T12:30:00", description: "Pro yearly", amount: 59000, method: "Card · Amex •••• 1005", status: "captured", reference: "pay_Pw901mNb5Gh2" },
  { id: "pay_110", orgId: "org-summit", createdAt: "2026-09-13T06:00:00", description: "Pro renewal · Sep 2026", amount: 5900, method: "Card · RuPay •••• 3310", status: "failed", failureReason: "Insufficient funds", reference: "pay_PxJ44rTy6Ui8" },
  { id: "pay_111", orgId: "org-sunrise", createdAt: "2026-08-30T09:45:00", description: "Growth renewal · Aug 2026", amount: 2360, method: "UPI · sunrise@okicici", status: "refunded", reference: "pay_PxH31eRt9Yu5" },
  { id: "pay_112", orgId: "org-skyline", createdAt: "2026-08-01T06:00:00", description: "Pro renewal · Aug 2026", amount: 5900, method: "Card · Visa •••• 4242", status: "captured", reference: "pay_PxF71wQa2Sd6" },
  { id: "pay_113", orgId: "org-meridian", createdAt: "2026-03-19T14:10:00", description: "Growth yearly", amount: 23600, method: "Netbanking · SBI", status: "captured", reference: "pay_Pv512zXc3Vb7" },
  { id: "pay_114", orgId: "org-vista", createdAt: "2026-01-08T10:00:00", description: "Pro yearly", amount: 59000, method: "Offline · NEFT UTR SBIN0261008", status: "offline", reference: "offline_0108" },
  { id: "pay_115", orgId: "org-skyline", createdAt: "2026-07-14T16:22:00", description: "Upgrade Growth → Pro (prorated)", amount: 2055.48, method: "Card · Visa •••• 4242", status: "captured", reference: "pay_PxD09uIo4Pa1" },
  { id: "pay_116", orgId: "org-riverside", createdAt: "2026-09-16T06:00:00", description: "Growth renewal · Sep 2026 (LAUNCH20)", amount: 1888, method: "Card · Visa •••• 9001", status: "captured", couponCode: "LAUNCH20", reference: "pay_PxM66oPl7Kj3" },
  { id: "pay_117", orgId: "org-greenfield", createdAt: "2026-08-17T12:02:00", description: "Growth renewal · Aug 2026", amount: 2360, method: "UPI · greenfield@okaxis", status: "captured", reference: "pay_PxG81iUy5Th6" },
  { id: "pay_118", orgId: "org-skyline", createdAt: "2026-07-01T06:00:00", description: "Growth renewal · Jul 2026 (LAUNCH20)", amount: 1888, method: "Card · Visa •••• 4242", status: "captured", couponCode: "LAUNCH20", reference: "pay_PxC22yTr8Ew4" },
  { id: "pay_119", orgId: "org-urbannest", createdAt: "2026-05-08T13:37:00", description: "Growth · first payment (FLAT500)", amount: 1770, method: "UPI · urbannest@ybl", status: "captured", couponCode: "FLAT500", reference: "pay_Pw733gFd1Nm8" },
  { id: "pay_120", orgId: "org-skyline", createdAt: "2026-06-01T06:00:00", description: "Growth renewal · Jun 2026 (LAUNCH20)", amount: 1888, method: "Card · Visa •••• 4242", status: "captured", couponCode: "LAUNCH20", reference: "pay_PwX18bNm6Qw2" },
  { id: "pay_121", orgId: "org-skyline", createdAt: "2026-05-01T11:48:00", description: "Growth · first payment (LAUNCH20)", amount: 1888, method: "Card · Visa •••• 4242", status: "captured", couponCode: "LAUNCH20", reference: "pay_PwT40cVb9Lk5" },
  { id: "pay_122", orgId: "org-coastal", createdAt: "2026-09-14T06:00:00", description: "Pro renewal · Sep 2026", amount: 5900, method: "UPI mandate", status: "captured", reference: "pay_PxL83dSa4Gf7" },
];
