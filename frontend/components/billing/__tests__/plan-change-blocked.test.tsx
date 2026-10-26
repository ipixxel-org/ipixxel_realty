/**
 * While a change to Basic / a smaller plan is scheduled, other plan changes
 * are blocked like a pending request blocks them: plan cards disabled with
 * the message, the checkout shows the message instead of the form. "Keep
 * <plan>" unblocks; the renewal still works.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { CheckoutScreen } from "@/components/billing/checkout";
import { DowngradeScreen } from "@/components/billing/plan-changes";
import { PlansScreen } from "@/components/billing/plans";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { planChangeBlock } from "@/lib/billing/requests";
import type { BillingOverview } from "@/lib/billing/types";

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

const TO_BASIC = /^You've scheduled a change to Basic on \d{1,2} \w{3,4} \d{4}\. Click 'Keep Growth' to undo it before choosing another plan\.$/;
const PENDING_TEXT = /^You already have a pending request \(.+ → Pro, sent 22 Oct\)\. Wait for approval or withdraw it\.$/;
const planButtons = () => screen.getAllByRole("button").filter((b) => /Change plan|Request|yearly|monthly/.test(b.textContent ?? ""));

describe("a scheduled change blocks other plan changes", () => {
  it("Basic scheduled: every plan card is disabled with the message", async () => {
    const client = createMockBillingClient({ initial: { situation: "cancellation_scheduled", paidPlanId: "growth" } });
    await show(client, <PlansScreen />);
    expect(planButtons().length).toBeGreaterThan(0);
    for (const b of planButtons()) expect(b).toBeDisabled();
    expect(screen.queryAllByRole("link", { name: /Change plan/ })).toHaveLength(0);
    const blocked = screen.getAllByTestId("plan-action-blocked");
    expect(blocked.length).toBeGreaterThan(0);
    for (const b of blocked) expect(b.getAttribute("title")).toMatch(TO_BASIC);
  });

  it("the checkout opened by URL shows the message and Keep Growth instead of the form; Keep Growth brings the form back", async () => {
    const client = createMockBillingClient({ initial: { situation: "cancellation_scheduled", paidPlanId: "growth" } });
    await show(client, <CheckoutScreen planId="pro" interval="monthly" />);
    const note = screen.getByTestId("change-scheduled-note");
    expect(note).toHaveTextContent("Change to Basic scheduled for");
    expect(screen.getByText(TO_BASIC)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Keep Growth" }));
    await settle();
    expect(client.snapshot().situation).toBe("active");
    expect(screen.queryByTestId("change-scheduled-note")).toBeNull();
    expect(screen.getByRole("button", { name: /^Pay / })).toBeEnabled();
  });

  it("after Keep, the plan cards are links again", async () => {
    const client = createMockBillingClient({ initial: { situation: "cancellation_scheduled", paidPlanId: "growth" } });
    await client.undoCancel();
    await show(client, <PlansScreen />);
    expect(screen.queryAllByTestId("plan-action-blocked")).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: /Change plan/ }).length).toBeGreaterThan(0);
  });

  it("the downgrade page opened by URL shows the message instead of the form", async () => {
    const client = createMockBillingClient({ initial: { situation: "downgrade_scheduled", paidPlanId: "pro", downgradeTargetId: "growth" } });
    await show(client, <DowngradeScreen planId="basic" />);
    expect(screen.getByTestId("change-scheduled-note")).toHaveTextContent(
      /You've scheduled a change to Growth on .+\. Click 'Keep Pro' to undo it before choosing another plan\./,
    );
    expect(screen.queryByRole("button", { name: /Move to Basic/ })).toBeNull();
    // Still allowed: choose what stays for the scheduled plan, and Keep Pro.
    expect(screen.getByRole("link", { name: "Choose what stays" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep Pro" })).toBeEnabled();
  });

  it("the renewal checkout still opens (renewal at the scheduled plan's price)", async () => {
    const client = createMockBillingClient({ initial: { situation: "downgrade_scheduled", paidPlanId: "pro", downgradeTargetId: "growth" } });
    await show(client, <CheckoutScreen planId="pro" interval="monthly" renewal />);
    expect(screen.queryByTestId("change-scheduled-note")).toBeNull();
    expect(screen.getByRole("button", { name: /^Pay / })).toBeInTheDocument();
  });
});

describe("planChangeBlock (one check for both reasons)", () => {
  const base = {
    pendingUpgrade: null,
    plan: { name: "Starter", isFree: false },
    cancelAt: null,
    downgradeTo: null,
    downgradeAt: null,
  } as unknown as BillingOverview;

  it("uses the API's reason and message", () => {
    expect(planChangeBlock({ ...base, planChangeBlockedReason: "change_scheduled", planChangeBlockedMessage: "From the API" })).toEqual({
      reason: "change_scheduled",
      message: "From the API",
    });
    expect(planChangeBlock({ ...base, cancelAt: "2026-11-25", planChangeBlockedReason: null })).toBeNull();
  });

  it("works it out when the API doesn't send it", () => {
    expect(planChangeBlock({ ...base, cancelAt: "2026-11-25" })).toEqual({
      reason: "change_scheduled",
      message: "You've scheduled a change to Basic on 25 Nov 2026. Click 'Keep Starter' to undo it before choosing another plan.",
    });
    expect(planChangeBlock(base)).toBeNull();
  });
});

describe("request_pending is unchanged", () => {
  it("plan cards and Send stay disabled with the pending message", async () => {
    const pendingRequest = { requestId: "pcr_1", checkoutId: "chk_1", planId: "pro", interval: "monthly" as const, createdAt: "2026-10-22T12:00:00.000Z" };
    const client = createMockBillingClient({ initial: { situation: "active", paidPlanId: "growth", pendingRequest } });
    const view = await show(client, <PlansScreen />);
    for (const b of planButtons()) expect(b).toBeDisabled();
    expect(screen.getAllByTitle(PENDING_TEXT).length).toBeGreaterThan(0);
    view.unmount();
    await show(client, <CheckoutScreen planId="pro" interval="yearly" />);
    expect(screen.queryByTestId("change-scheduled-note")).toBeNull();
  });
});
