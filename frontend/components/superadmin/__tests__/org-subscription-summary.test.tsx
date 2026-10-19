/**
 * Super Admin → Organisations → (org) → Subscription: read-only plan summary
 * with a link to the org's page in Subscriptions; no upgrade controls.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrgSubscriptionSummary, orgSubscriptionSummary, type OrgSubscriptionRow } from "../org-subscription-summary";

vi.mock("@/lib/billing/flag", () => ({ BILLING_V2: true }));

afterEach(cleanup);

const growth = { name: "Growth", priceMonthly: 1499, priceYearly: 14990 };
const basic = { name: "Basic", priceMonthly: 0, priceYearly: 0 };
const row = (o: Partial<OrgSubscriptionRow>): OrgSubscriptionRow => ({
  status: "active",
  billingCycle: "monthly",
  startedAt: "2026-09-01T00:00:00.000Z",
  renewsAt: "2026-11-01T00:00:00.000Z",
  graceEndsAt: null,
  plan: growth,
  ...o,
});

describe("orgSubscriptionSummary", () => {
  it("active paid plan: renews on, price for the cycle + GST", () => {
    expect(orgSubscriptionSummary(row({}))).toMatchObject({
      planName: "Growth",
      cycle: "Monthly",
      status: { label: "Active" },
      dateLabel: "Renews on",
      date: "2026-11-01T00:00:00.000Z",
      price: "₹1,499 + GST",
    });
    expect(orgSubscriptionSummary(row({ billingCycle: "yearly" }))).toMatchObject({ cycle: "Yearly", price: "₹14,990 + GST" });
  });

  it("past due: payment due, grace ends on", () => {
    expect(orgSubscriptionSummary(row({ status: "past_due", graceEndsAt: "2026-11-08T00:00:00.000Z" }))).toMatchObject({
      status: { label: "Payment due" },
      dateLabel: "Grace ends on",
      date: "2026-11-08T00:00:00.000Z",
    });
  });

  it("free plan: on Basic, no cycle, no renewal date, Free", () => {
    expect(orgSubscriptionSummary(row({ plan: basic }))).toMatchObject({
      planName: "Basic",
      cycle: null,
      status: { label: "On Basic" },
      dateLabel: null,
      price: "Free",
    });
  });
});

describe("OrgSubscriptionSummary", () => {
  it("shows the plan read-only and links to the org's page in Subscriptions", () => {
    render(<OrgSubscriptionSummary orgId="org-1" subscription={row({})} />);
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("Renews on")).toBeInTheDocument();
    expect(screen.getByText("₹1,499 + GST")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage in Subscriptions →" })).toHaveAttribute("href", "/admin-console/subscriptions/org/org-1");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Upgrade/)).toBeNull();
  });

  it("without a subscription still offers the link", () => {
    render(<OrgSubscriptionSummary orgId="org-1" subscription={null} />);
    expect(screen.getByText("No subscription")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage in Subscriptions →" })).toBeInTheDocument();
  });
});
