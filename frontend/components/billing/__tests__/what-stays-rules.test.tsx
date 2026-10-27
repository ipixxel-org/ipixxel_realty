/**
 * "Choose what stays" rules: confirmed once before a change the org is over
 * on (a saved choice or "Keep the default picks shown above"), view-only for
 * the org once decided, and Super Admin can change it any time.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { CheckoutScreen } from "@/components/billing/checkout";
import { ChooseWhatStaysScreen } from "@/components/billing/choose-what-stays";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { initialMockState, type MockState } from "@/lib/billing/mock/state";
import type { CheckoutPreview, RetentionChoices, UsageConflict } from "@/lib/billing/types";

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
      <BillingEnvProvider client={client} canEdit>
        <OrgBillingProvider>{node}</OrgBillingProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
  return view;
}

const KEEP = "Keep the default picks shown above";

describe("request screen: confirm what stays before sending", () => {
  function withConflict(conflict: UsageConflict | null) {
    const base = createMockBillingClient({ initial: manual({ situation: "basic" }) });
    const client: BillingClient = {
      ...base,
      previewCheckout: async (req) => ({ ...(await base.previewCheckout(req)), usageConflict: conflict }) as CheckoutPreview,
    };
    return client;
  }
  const conflict = { items: [{ key: "users" as const, limit: 5, used: 8 }], choicesFit: false };

  it("Send is disabled until the default-picks tick, which is sent with the request", async () => {
    const client = withConflict(conflict);
    const start = vi.spyOn(client, "startCheckout");
    await show(client, <CheckoutScreen planId="pro" interval="monthly" />);
    const send = screen.getByRole("button", { name: /Send change request/ });
    expect(send).toBeDisabled();
    // The default picks are listed above the tick.
    expect(screen.getByTestId("keep-default-picks")).toHaveTextContent(/if you don.t choose/);
    fireEvent.click(screen.getByRole("checkbox", { name: KEEP }));
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await settle();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ planId: "pro", acceptDefaultPicks: true }));
  });

  it("a saved choice that fits: enabled, no tick asked, nothing extra sent", async () => {
    const client = withConflict({ ...conflict, choicesFit: true });
    const start = vi.spyOn(client, "startCheckout");
    await show(client, <CheckoutScreen planId="pro" interval="monthly" />);
    expect(screen.queryByRole("checkbox", { name: KEEP })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Send change request/ }));
    await settle();
    expect(start.mock.calls[0][0]).not.toHaveProperty("acceptDefaultPicks");
  });

  it("no conflict: no tick", async () => {
    await show(withConflict(null), <CheckoutScreen planId="pro" interval="monthly" />);
    expect(screen.queryByRole("checkbox", { name: KEEP })).toBeNull();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeEnabled();
  });
});

describe("choose what stays once it's decided", () => {
  async function choices(base: BillingClient): Promise<RetentionChoices> {
    return base.getRetentionChoices({});
  }

  it("the org sees a view-only list (stays active / paused) and the contact-support note", async () => {
    const base = createMockBillingClient({ initial: { situation: "moved_to_basic" } });
    const locked = { ...(await choices(base)), locked: true };
    const save = vi.fn();
    const client: BillingClient = { ...base, getRetentionChoices: async () => locked, saveRetentionChoices: save };
    await show(client, <ChooseWhatStaysScreen requestId="req-1" />);
    const view = screen.getByTestId("what-stays-read-only");
    expect(within(view).getAllByText("Stays active:").length).toBeGreaterThan(0);
    expect(view).toHaveTextContent("Paused:");
    const kept = locked.users.filter((u) => u.selected).map((u) => u.name);
    expect(view).toHaveTextContent(kept[0]);
    expect(within(view).getByTestId("what-stays-locked")).toHaveTextContent("To change what stays, contact our support team");
    expect(within(view).getByRole("link", { name: /Support/ })).toHaveAttribute("href", "/org/support");
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("Super Admin gets the editor for that org and request, even when it's locked for the org", async () => {
    const base = createMockBillingClient({ initial: { situation: "moved_to_basic" } });
    const data = await choices(base);
    const get = vi.fn(async () => ({ ...data, locked: false }));
    const save = vi.fn(async () => ({ ...data, locked: false }));
    const orgGet = vi.fn();
    const client: BillingClient = { ...base, getAdminRetentionChoices: get, saveAdminRetentionChoices: save, getRetentionChoices: orgGet };
    await show(client, <ChooseWhatStaysScreen admin={{ orgId: "org-9", orgName: "Acme" }} requestId="req-1" targetPlanId={data.targetPlan.id} />);
    expect(get).toHaveBeenCalledWith({ orgId: "org-9", targetPlanId: data.targetPlan.id, requestId: "req-1" });
    expect(orgGet).not.toHaveBeenCalled();
    expect(screen.getByText(/Acme is on .* now — saving applies straight away/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await settle();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-9", requestId: "req-1", targetPlanId: data.targetPlan.id }));
  });
});
