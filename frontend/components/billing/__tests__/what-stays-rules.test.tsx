/**
 * "Choose what stays" rules: two options picked every time a change is over
 * the target's limits, view-only for the org once decided, and Super Admin
 * can change it on open rows and the current plan's row.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { CheckoutScreen } from "@/components/billing/checkout";
import { ChooseWhatStaysScreen } from "@/components/billing/choose-what-stays";
import { OrgPackageRequests } from "@/components/billing/admin/package-requests";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { initialMockState, type MockState } from "@/lib/billing/mock/state";
import type { CheckoutPreview, RetentionChoices, UsageConflict } from "@/lib/billing/types";
import type { PackageChangeRequestRow } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ hasPermission: () => true, user: { roleKeys: ["super_admin"] } }) }));
const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, getAdminPackageChangeRequests: api.list };
});

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

const DEFAULT = "Keep the default picks";
const OWN = "I'll choose what stays";

describe("request screen: pick what stays, every time", () => {
  function withConflict(conflict: UsageConflict | null, retention?: (r: RetentionChoices) => RetentionChoices) {
    const base = createMockBillingClient({ initial: manual({ situation: "basic" }) });
    const client: BillingClient = {
      ...base,
      previewCheckout: async (req) => ({ ...(await base.previewCheckout(req)), usageConflict: conflict }) as CheckoutPreview,
      getRetentionChoices: async (req) => {
        const r = await base.getRetentionChoices(req);
        return retention ? retention(r) : r;
      },
    };
    return client;
  }
  const conflict = { items: [{ key: "users" as const, limit: 5, used: 8 }], choicesFit: false };
  // An earlier saved choice: the first user only (isDefault false).
  const earlier = (r: RetentionChoices): RetentionChoices => ({
    ...r,
    isDefault: false,
    users: r.users.map((u, i) => ({ ...u, selected: i === 0 })),
  });

  it("two options, none selected on arrival; Send waits; the default picks are listed and sent as 'default'", async () => {
    const client = withConflict(conflict);
    const start = vi.spyOn(client, "startCheckout");
    await show(client, <CheckoutScreen planId="pro" interval="monthly" />);
    const send = screen.getByRole("button", { name: /Send change request/ });
    expect(screen.getByRole("radio", { name: DEFAULT })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: OWN })).not.toBeChecked();
    expect(send).toBeDisabled();
    const defaults = (await client.getRetentionChoices({ targetPlanId: "pro" })).users.filter((u) => u.defaultPicked);
    expect(screen.getByTestId("what-stays-defaults")).toHaveTextContent(defaults[0].name);
    fireEvent.click(screen.getByRole("radio", { name: DEFAULT }));
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await settle();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ planId: "pro", whatStaysChoice: "default" }));
  });

  it("\"I'll choose\" with nothing saved: a Choose what stays button, Send stays disabled", async () => {
    await show(withConflict(conflict), <CheckoutScreen planId="pro" interval="monthly" />);
    fireEvent.click(screen.getByRole("radio", { name: OWN }));
    const own = screen.getByTestId("what-stays-own");
    expect(within(own).getByRole("link", { name: "Choose what stays" })).toHaveAttribute(
      "href",
      "/org/settings/billing/choose-what-stays?target=pro&back=checkout&interval=monthly",
    );
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeDisabled();
  });

  it("an earlier saved choice: still nothing selected; \"I'll choose\" shows it with Edit and sends 'saved'", async () => {
    const client = withConflict({ ...conflict, choicesFit: true }, earlier);
    const start = vi.spyOn(client, "startCheckout");
    await show(client, <CheckoutScreen planId="pro" interval="monthly" />);
    // The old "You've chosen what stays" box is gone; nothing is picked for them.
    expect(screen.queryByText(/You've chosen what stays/)).toBeNull();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: OWN }));
    const own = screen.getByTestId("what-stays-own");
    expect(own).toHaveTextContent("Your earlier choice");
    expect(within(own).getByRole("link", { name: "Edit" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send change request/ }));
    await settle();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ whatStaysChoice: "saved" }));
  });

  it("back from Choose what stays (pick=saved): \"I'll choose\" is selected again", async () => {
    await show(withConflict({ ...conflict, choicesFit: true }, earlier), <CheckoutScreen planId="pro" interval="monthly" initialPick="saved" />);
    expect(screen.getByRole("radio", { name: OWN })).toBeChecked();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeEnabled();
  });

  it("no conflict: no options", async () => {
    await show(withConflict(null), <CheckoutScreen planId="pro" interval="monthly" />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeEnabled();
  });
});

describe("Super Admin, org detail → Package requests: the Action column", () => {
  const row = (over: Partial<PackageChangeRequestRow>) =>
    ({
      id: "r",
      orgId: "org-1",
      currentPlanId: "pro",
      targetPlanId: "starter",
      billingCycle: "monthly",
      status: "approved",
      kind: "request",
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-20T10:00:00.000Z",
      organisation: { id: "org-1", name: "Acme", slug: "acme", city: "Pune" },
      requestedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      currentPlan: { id: "pro", name: "Pro", priceMonthly: 1499, priceYearly: 14990 },
      targetPlan: { id: "starter", name: "Starter", priceMonthly: 999, priceYearly: 9990 },
      label: "Change to Starter",
      payment: null,
      billingCheckout: null,
      whatStays: { planId: "starter", planName: "Starter", choice: "default", applied: true, users: { limit: 2, total: 3, kept: [], paused: [] } },
      ...over,
    }) as unknown as PackageChangeRequestRow;

  it("Choose what stays for open rows and the current plan's row, View what stays otherwise, nothing without a conflict", async () => {
    api.list.mockReset().mockResolvedValue({
      data: [
        row({ id: "open", status: "pending", whatStaysEditable: true, applied: false } as never),
        row({ id: "current", status: "approved", whatStaysEditable: true }),
        row({ id: "old", status: "approved", whatStaysEditable: false }),
        row({ id: "fits", status: "approved", whatStays: null, whatStaysEditable: false }),
      ],
      total: 4,
      page: 1,
      limit: 100,
    });
    await show(createMockBillingClient(), <OrgPackageRequests orgId="org-1" />);
    expect(screen.getByRole("columnheader", { name: "Action" })).toBeInTheDocument();
    const [open, current, old, fits] = screen.getAllByTestId("org-package-request");
    const lastCell = (r: HTMLElement) => r.querySelectorAll("td")[r.querySelectorAll("td").length - 1] as HTMLElement;
    expect(within(lastCell(open)).getByRole("button", { name: "Choose what stays" })).toBeInTheDocument();
    expect(within(lastCell(open)).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(lastCell(current)).getByRole("button", { name: "Choose what stays" })).toBeInTheDocument();
    expect(within(lastCell(old)).getByRole("button", { name: "View what stays" })).toBeInTheDocument();
    expect(within(lastCell(old)).queryByRole("button", { name: "Choose what stays" })).toBeNull();
    expect(within(lastCell(fits)).queryByRole("button")).toBeNull();
    // Not in the Change column any more.
    expect(within(open.querySelectorAll("td")[1] as HTMLElement).queryByRole("button")).toBeNull();
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
