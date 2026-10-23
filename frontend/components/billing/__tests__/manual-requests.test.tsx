/**
 * Org billing in manual mode (online payments off): "Choose what stays" on the
 * action row, the over-the-limits notice on the request screen, the Requests
 * list, everything disabled while a request waits, and withdrawing it.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { BillingOverviewPanel } from "@/components/billing/overview";
import { CheckoutScreen } from "@/components/billing/checkout";
import { PlansScreen } from "@/components/billing/plans";
import { RequestsTable } from "@/components/billing/requests";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { initialMockState, type MockState } from "@/lib/billing/mock/state";
import type { CheckoutPreview, OrgPlanRequest, UsageConflict } from "@/lib/billing/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

afterEach(cleanup);

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function manual(over: Partial<MockState> = {}): Partial<MockState> {
  const base = initialMockState().lifecycle;
  return { lifecycle: { ...base, onlinePaymentsEnabled: false }, ...over };
}

async function show(client: BillingClient, node: ReactNode) {
  const view = render(
    <ToastProvider>
      <BillingEnvProvider client={client}>
        <OrgBillingProvider>{node}</OrgBillingProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
  return view;
}

const actionRow = () => screen.getByTestId("billing-actions");
const waitingRequest = { requestId: "pcr_1", checkoutId: "chk_1", planId: "pro", interval: "monthly" as const, createdAt: "2026-10-22T12:00:00.000Z" };
const PENDING_TEXT = /^You already have a pending request \(.+ → Pro, sent 22 Oct\)\. Wait for approval or withdraw it\.$/;

/* --------------------------------------------------------- Choose what stays */

describe('"Choose what stays" on Settings → Billing', () => {
  it("is hidden from the action row in manual mode, shown in online mode", async () => {
    const view = await show(createMockBillingClient({ initial: manual() }), <BillingOverviewPanel showInvoices={false} />);
    expect(within(actionRow()).queryByRole("link", { name: "Choose what stays" })).toBeNull();
    expect(within(actionRow()).getByRole("link", { name: "Requests" })).toHaveAttribute("href", "/org/settings/billing/requests");
    view.unmount();
    await show(createMockBillingClient(), <BillingOverviewPanel showInvoices={false} />);
    expect(within(actionRow()).getByRole("link", { name: "Choose what stays" })).toBeInTheDocument();
  });

  it("stays in the grace and \"You're on Basic now\" banners in manual mode", async () => {
    for (const situation of ["payment_due", "moved_to_basic"] as const) {
      const view = await show(createMockBillingClient({ initial: manual({ situation }) }), <BillingOverviewPanel showInvoices={false} />);
      expect(within(actionRow()).queryByRole("link", { name: "Choose what stays" })).toBeNull();
      // Grace: "Choose what stays"; on Basic: "Change what stays".
      expect(screen.getAllByRole("link", { name: /(Choose|Change) what stays/ }).length).toBeGreaterThan(0);
      view.unmount();
    }
  });
});

/* ------------------------------------------------- Request screen: conflict */

describe("request screen over the target plan's limits", () => {
  function withConflict(conflict: UsageConflict | null) {
    const base = createMockBillingClient({ initial: manual({ situation: "basic" }) });
    const client: BillingClient = {
      ...base,
      previewCheckout: async (req) => ({ ...(await base.previewCheckout(req)), usageConflict: conflict }) as CheckoutPreview,
    };
    return client;
  }

  it("shows the notice and keeps Send disabled until the choices fit", async () => {
    const conflict = { items: [{ key: "users" as const, limit: 5, used: 8 }], choicesFit: false };
    const view = await show(withConflict(conflict), <CheckoutScreen planId="pro" interval="monthly" />);
    const note = screen.getByTestId("usage-conflict");
    expect(note).toHaveTextContent("Pro allows 5 users; you have 8. Choose which 5 stay active when this change is approved.");
    expect(within(note).getByRole("link", { name: "Choose what stays" })).toHaveAttribute(
      "href",
      "/org/settings/billing/choose-what-stays?target=pro&back=checkout&interval=monthly",
    );
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeDisabled();
    view.unmount();

    await show(withConflict({ ...conflict, choicesFit: true }), <CheckoutScreen planId="pro" interval="monthly" />);
    expect(screen.getByTestId("usage-conflict")).toHaveTextContent("You've chosen what stays on Pro");
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeEnabled();
  });

  it("no conflict → nothing extra", async () => {
    await show(withConflict(null), <CheckoutScreen planId="pro" interval="monthly" />);
    expect(screen.queryByTestId("usage-conflict")).toBeNull();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeEnabled();
  });
});

/* ----------------------------------------------------------------- Requests */

describe("Settings → Billing → Requests", () => {
  it("lists every status, the amount and the rejection reason", async () => {
    const row = (over: Partial<OrgPlanRequest>): OrgPlanRequest => ({
      id: "r",
      requestedAt: "2026-10-20T10:00:00.000Z",
      requestedBy: "Vidya C",
      fromPlan: { id: "starter", name: "Starter" },
      toPlan: { id: "pro", name: "Pro" },
      interval: "monthly",
      amount: 500,
      amountNote: "prorated",
      status: "pending",
      decidedAt: null,
      rejectionReason: null,
      whatStays: null,
      ...over,
    });
    const rows = [
      row({ id: "r4" }),
      row({ id: "r3", status: "withdrawn", decidedAt: "2026-10-19T10:00:00.000Z", amountNote: null, amount: 2000 }),
      row({ id: "r2", status: "rejected", decidedAt: "2026-10-18T10:00:00.000Z", rejectionReason: "Pay the open invoice first." }),
      row({ id: "r1", status: "approved", decidedAt: "2026-10-17T10:00:00.000Z" }),
    ];
    const base = createMockBillingClient({ initial: manual() });
    const listOrgRequests = vi.fn(async () => ({ data: rows, total: 4, page: 1, pageSize: 10 }));
    await show({ ...base, listOrgRequests }, <RequestsTable />);
    expect(listOrgRequests).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    const [pending, withdrawn, rejected, approved] = screen.getAllByTestId("org-plan-request");
    expect(pending).toHaveTextContent("Starter → Pro");
    expect(pending).toHaveTextContent("₹500 + GST · prorated");
    expect(pending).toHaveTextContent("Pending");
    expect(within(pending).getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(withdrawn).toHaveTextContent("Withdrawn");
    expect(withdrawn).toHaveTextContent("₹2,000 + GST");
    expect(rejected).toHaveTextContent("Rejected");
    expect(rejected).toHaveTextContent("Reason: Pay the open invoice first.");
    expect(rejected).toHaveTextContent("18 Oct 2026");
    expect(approved).toHaveTextContent("Approved");
    for (const r of [withdrawn, rejected, approved]) expect(within(r).queryByRole("button")).toBeNull();
  });
});

/* -------------------------------------------------- While a request is pending */

describe("while a request is pending", () => {
  it("Change plan, every plan card and Send are disabled with the same message", async () => {
    const client = createMockBillingClient({ initial: manual({ situation: "active", paidPlanId: "growth", pendingRequest: waitingRequest }) });
    let view = await show(client, <BillingOverviewPanel showInvoices={false} />);
    const change = within(actionRow()).getByRole("button", { name: /Change plan/ });
    expect(change).toBeDisabled();
    expect(change.parentElement!.getAttribute("title")).toMatch(PENDING_TEXT);
    view.unmount();

    view = await show(client, <PlansScreen />);
    const actions = screen.getAllByRole("button").filter((b) => /Change plan|Request|yearly|monthly/.test(b.textContent ?? ""));
    expect(actions.length).toBeGreaterThan(0);
    for (const b of actions) expect(b).toBeDisabled();
    expect(screen.queryAllByRole("link", { name: /Change plan/ })).toHaveLength(0);
    expect(screen.getAllByTitle(PENDING_TEXT).length).toBeGreaterThan(0);
    view.unmount();

    await show(client, <CheckoutScreen planId="pro" interval="monthly" />);
    const send = screen.getByRole("button", { name: /Request pending/ });
    expect(send).toBeDisabled();
    expect(send.getAttribute("title")).toMatch(PENDING_TEXT);
  });

  it("withdraw (with a confirm) clears it and re-enables the buttons", async () => {
    const client = createMockBillingClient({ initial: manual({ situation: "active", paidPlanId: "growth", pendingRequest: waitingRequest }) });
    await show(
      client,
      <>
        <BillingOverviewPanel showInvoices={false} />
        <RequestsTable />
      </>,
    );
    const row = screen.getByTestId("org-plan-request");
    fireEvent.click(within(row).getByRole("button", { name: "Withdraw" }));
    expect(screen.getByText("Withdraw this request?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
    await settle();
    expect(client.snapshot().pendingRequest).toBeNull();
    expect(within(actionRow()).getByRole("link", { name: /Change plan/ })).toBeInTheDocument();
    expect(screen.queryByText(/Change to Pro requested/)).toBeNull();
  });
});

/* ------------------------------------------- What they chose, and the labels */

describe("Requests show what they chose to keep", () => {
  const whatStays = (applied: boolean) => ({
    planId: "pro",
    planName: "Pro",
    choice: "saved" as const,
    applied,
    users: { limit: 2, total: 3, kept: [{ id: "u1", name: "Rohan" }, { id: "u3", name: "Arjun" }], paused: [{ id: "u2", name: "Priya" }] },
  });
  const req = (over: Partial<OrgPlanRequest>): OrgPlanRequest => ({
    id: "r",
    requestedAt: "2026-10-20T10:00:00.000Z",
    requestedBy: "Vidya C",
    fromPlan: { id: "growth", name: "Growth" },
    toPlan: { id: "pro", name: "Pro" },
    interval: "monthly",
    amount: 500,
    amountNote: null,
    status: "pending",
    decidedAt: null,
    rejectionReason: null,
    whatStays: null,
    ...over,
  });

  it("pending: the summary, the names, and a link to change it; decided: what was applied; none: everything fits", async () => {
    const rows = [
      req({ id: "p", whatStays: whatStays(false) }),
      req({ id: "a", status: "approved", decidedAt: "2026-10-21T10:00:00.000Z", whatStays: whatStays(true) }),
      req({ id: "n", status: "approved", decidedAt: "2026-10-19T10:00:00.000Z" }),
    ];
    const base = createMockBillingClient({ initial: manual() });
    await show({ ...base, listOrgRequests: async () => ({ data: rows, total: 3, page: 1, pageSize: 10 }) }, <RequestsTable />);
    const [pending, approved, none] = screen.getAllByTestId("org-plan-request");
    const p = within(pending).getByTestId("what-stays");
    expect(p).toHaveTextContent("Keeps 2 of 3 users");
    expect(p).toHaveTextContent("Your choice");
    expect(p).toHaveTextContent("Stays active: Rohan, Arjun");
    expect(p).toHaveTextContent("Will be paused: Priya");
    expect(within(p).getByRole("link", { name: "Change what stays" })).toHaveAttribute(
      "href",
      "/org/settings/billing/choose-what-stays?target=pro&back=requests",
    );
    const a = within(approved).getByTestId("what-stays");
    expect(a).toHaveTextContent("Applied when approved");
    expect(a).toHaveTextContent("Paused: Priya");
    expect(within(a).queryByRole("link")).toBeNull();
    expect(none).toHaveTextContent("Everything fits");
  });

  it('plan cards say "Change plan" (not Upgrade / Downgrade), as does the action row', async () => {
    const client = createMockBillingClient({ initial: manual({ situation: "active", paidPlanId: "growth" }) });
    let view = await show(client, <PlansScreen />);
    const links = screen.getAllByRole("link", { name: /Change plan/ });
    expect(links.length).toBeGreaterThanOrEqual(2); // a bigger and a smaller plan
    expect(screen.queryByRole("link", { name: /^(Upgrade|Downgrade|Request upgrade)$/ })).toBeNull();
    view.unmount();
    view = await show(createMockBillingClient({ initial: manual({ situation: "basic" }) }), <BillingOverviewPanel showInvoices={false} />);
    expect(within(actionRow()).getByRole("link", { name: /Change plan/ })).toBeInTheDocument();
    view.unmount();
    await show(client, <CheckoutScreen planId="pro" interval="monthly" />);
    expect(screen.getByText("Request a change to Pro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeInTheDocument();
  });
});
