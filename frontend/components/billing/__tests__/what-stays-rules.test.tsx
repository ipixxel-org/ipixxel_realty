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
import { RequestsTable } from "@/components/billing/requests";
import { UsageCard } from "@/components/billing/overview";
import { AdminSubscriptionDetailBody } from "@/components/billing/admin/admin-pages";
import { ChooseWhatStaysPage } from "@/components/billing/org-pages";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { initialMockState, type MockState } from "@/lib/billing/mock/state";
import type { CheckoutPreview, OrgPlanRequest, RetentionChoices, UsageConflict } from "@/lib/billing/types";
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

describe("scheduled changes that took effect", () => {
  const STARTS = "2026-11-26T00:00:00.000Z";
  const DONE = "2026-10-27T09:00:00.000Z";
  const adminRow = (over: Partial<PackageChangeRequestRow>) =>
    ({
      id: "to-basic",
      orgId: "org-1",
      currentPlanId: "starter",
      targetPlanId: "basic",
      billingCycle: "monthly",
      status: "done",
      kind: "scheduled_change",
      startsAt: STARTS,
      reviewedAt: DONE,
      scheduledAmount: null,
      createdAt: "2026-10-27T08:00:00.000Z",
      updatedAt: DONE,
      organisation: { id: "org-1", name: "Acme", slug: "acme", city: "Pune" },
      requestedBy: null,
      reviewedBy: null,
      currentPlan: { id: "starter", name: "Starter", priceMonthly: 999, priceYearly: 9990 },
      targetPlan: { id: "basic", name: "Basic", priceMonthly: 0, priceYearly: 0 },
      label: "Change to Basic",
      payment: null,
      billingCheckout: null,
      whatStays: { planId: "basic", planName: "Basic", choice: "default", applied: true, projects: { limit: 2, total: 5, kept: [], paused: [] } },
      ...over,
    }) as unknown as PackageChangeRequestRow;

  it("Super Admin: a Done move to Basic (the current plan's row) is editable and shows when it really took effect", async () => {
    api.list.mockReset().mockResolvedValue({
      data: [adminRow({ whatStaysEditable: true }), adminRow({ id: "old", kind: "request", status: "approved", targetPlanId: "starter", whatStaysEditable: false } as never)],
      total: 2,
      page: 1,
      limit: 100,
    });
    await show(createMockBillingClient(), <OrgPackageRequests orgId="org-1" />);
    const [done, old] = screen.getAllByTestId("org-package-request");
    const lastCell = (r: HTMLElement) => r.querySelectorAll("td")[r.querySelectorAll("td").length - 1] as HTMLElement;
    expect(within(lastCell(done)).getByRole("button", { name: "Choose what stays" })).toBeInTheDocument();
    expect(within(lastCell(old)).getByRole("button", { name: "View what stays" })).toBeInTheDocument();
    expect(within(done).getByTestId("scheduled-date")).toHaveTextContent("Took effect 27 Oct 2026");
    expect(done).not.toHaveTextContent("Starts 26 Nov 2026");
  });

  it("org Requests tab: the same real date; a still-scheduled row keeps its start date", async () => {
    const base = createMockBillingClient({ initial: manual() });
    const orgRow = (over: Partial<OrgPlanRequest>): OrgPlanRequest => ({
      id: "s",
      kind: "scheduled_change",
      requestedAt: "2026-10-27T08:00:00.000Z",
      requestedBy: "Vidya C",
      fromPlan: { id: "starter", name: "Starter" },
      toPlan: { id: "basic", name: "Basic" },
      interval: "monthly",
      amount: null,
      amountNote: null,
      status: "done",
      decidedAt: DONE,
      rejectionReason: null,
      whatStays: null,
      startsAt: STARTS,
      ...over,
    });
    const rows = [orgRow({}), orgRow({ id: "s2", status: "scheduled", decidedAt: null })];
    await show({ ...base, listOrgRequests: async () => ({ data: rows, total: 2, page: 1, pageSize: 10 }) }, <RequestsTable />);
    const [done, scheduled] = screen.getAllByTestId("org-plan-request");
    expect(within(done).getByTestId("scheduled-date")).toHaveTextContent("Took effect 27 Oct 2026");
    expect(within(scheduled).getByTestId("scheduled-date")).toHaveTextContent("Starts 26 Nov 2026");
  });
});

describe("one place: the latest row", () => {
  const p = (id: string) => ({ id, name: id });
  const ws = {
    planId: "starter",
    planName: "Starter",
    choice: "default" as const,
    applied: true,
    projects: { limit: 3, total: 5, kept: [p("P-1"), p("P-2"), p("P-3")], paused: [p("P-4"), p("P-5")] },
  };
  const orgRow = (over: Partial<OrgPlanRequest>): OrgPlanRequest => ({
    id: "r",
    requestedAt: "2026-10-27T08:00:00.000Z",
    requestedBy: "Vidya C",
    fromPlan: { id: "growth", name: "Growth" },
    toPlan: { id: "starter", name: "Starter" },
    interval: "monthly",
    amount: 999,
    amountNote: null,
    status: "approved",
    decidedAt: "2026-10-27T09:00:00.000Z",
    rejectionReason: null,
    whatStays: ws,
    ...over,
  });

  it("org Requests tab: the summary + the button the API gives each row", async () => {
    const rows = [
      orgRow({ id: "latest", status: "pending", decidedAt: null, whatStaysAction: "change", whatStays: { ...ws, applied: false } }),
      orgRow({ id: "older", whatStaysAction: "view" }),
      orgRow({ id: "fits", whatStays: null, whatStaysAction: null }),
    ];
    const base = createMockBillingClient({ initial: manual() });
    await show({ ...base, listOrgRequests: async () => ({ data: rows, total: 3, page: 1, pageSize: 10 }) }, <RequestsTable />);
    const [latest, older, fits] = screen.getAllByTestId("org-plan-request");
    expect(within(latest).getByTestId("what-stays")).toHaveTextContent(/^Keeps 3 of 5 projectsChange what stays$/);
    expect(within(older).getByTestId("what-stays")).toHaveTextContent(/^Kept 3 of 5 projectsView$/);
    expect(within(older).getByRole("link", { name: "View" })).toHaveAttribute("href", "/org/settings/billing/choose-what-stays?target=starter&back=requests&request=older");
    expect(fits).toHaveTextContent("Everything fits");
    expect(within(fits).queryByRole("link", { name: /View|Change what stays/ })).toBeNull();
  });

  async function readOnly(view: RetentionChoices["view"], viewDate: string | null) {
    const base = createMockBillingClient({ initial: { situation: "moved_to_basic" } });
    const data = { ...(await base.getRetentionChoices({})), locked: true, view, viewDate };
    await show({ ...base, getRetentionChoices: async () => data }, <ChooseWhatStaysScreen requestId="older" />);
  }

  it("an older row's View is history, with its date", async () => {
    await readOnly("history", "2026-10-27T09:00:00.000Z");
    expect(screen.getByTestId("what-stays-history")).toHaveTextContent(
      "What stayed when this change applied on 27 Oct 2026. This is history; your current setup may be different. See the latest request for what's active now.",
    );
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  });

  it("a rejected or withdrawn row's View: what was requested (not applied)", async () => {
    await readOnly("not_applied", null);
    expect(screen.getByTestId("what-stays-not-applied")).toHaveTextContent("What was requested (not applied).");
  });

  it("the latest applied row's View: the live state and the contact-support note", async () => {
    await readOnly(undefined, null);
    expect(screen.getByTestId("what-stays-read-only")).toHaveTextContent(/Active now on/);
    expect(screen.getByTestId("what-stays-locked")).toHaveTextContent("To change what stays, contact our support team");
  });

  it("Super Admin org page: the standalone Choose what stays sits in the action row, only when no request set the plan", async () => {
    api.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 10 });
    const base = createMockBillingClient();
    const detail = await base.getSubscription((await base.listSubscriptions({ page: 1, pageSize: 10 } as never)).data[0].orgId);
    let view = await show({ ...base, getSubscription: async () => ({ ...detail, whatStaysOrgLevel: false }) }, <AdminSubscriptionDetailBody orgId={detail.orgId} />);
    expect(screen.queryByTestId("org-level-what-stays")).toBeNull();
    view.unmount();
    view = await show({ ...base, getSubscription: async () => ({ ...detail, whatStaysOrgLevel: true }) }, <AdminSubscriptionDetailBody orgId={detail.orgId} />);
    const row = screen.getByTestId("subscription-actions");
    expect(within(row).getByTestId("org-level-what-stays")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Choose what stays" })).toBeInTheDocument();
    // Next to the Cancel (move to Basic) button, and nowhere else on the page.
    expect(within(row).getByRole("button", { name: "Cancel" }).parentElement!.nextElementSibling).toBe(within(row).getByTestId("org-level-what-stays"));
    expect(screen.getAllByTestId("org-level-what-stays")).toHaveLength(1);
  });

  it("Super Admin org page order: actions, plan summary, Package requests, Payments, then Timeline and Coupon in use", async () => {
    api.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 10 });
    const base = createMockBillingClient();
    const detail = await base.getSubscription((await base.listSubscriptions({ page: 1, pageSize: 10 } as never)).data[0].orgId);
    await show({ ...base, getSubscription: async () => detail }, <AdminSubscriptionDetailBody orgId={detail.orgId} />);
    const order = [
      screen.getByTestId("subscription-actions"),
      screen.getByText(detail.orgName, { selector: "h2, h3, .bl-section-title, *" }),
      screen.getByText("Package requests"),
      screen.getByText("Payments"),
      screen.getByText("Timeline"),
      screen.getByText("Coupon in use"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("org billing page: Active now with a View link while anything is paused", async () => {
    const base = createMockBillingClient({ initial: { situation: "moved_to_basic" } });
    const o = await base.getBillingOverview();
    const usage = o.usage.map((u) => (u.key === "projects" ? { ...u, used: 3 } : u.key === "templates" ? { ...u, used: 1 } : u));
    await show(
      { ...base, getBillingOverview: async () => ({ ...o, usage, locked: { users: 0, projects: 2, landingPages: 0, templates: 0 } }) },
      <UsageCard overview={{ ...o, usage, locked: { users: 0, projects: 2, landingPages: 0, templates: 0 } }} />,
    );
    const line = screen.getByTestId("active-now");
    expect(line).toHaveTextContent("3 of 5 projects");
    expect(line).toHaveTextContent("1 of 1 template");
    expect(within(line).getByRole("link", { name: "View" })).toHaveAttribute("href", `/org/settings/billing/choose-what-stays?target=${o.plan.id}`);
  });
});

describe("Choose what stays: Save keeps the ticks and goes back", () => {
  const item = (id: string, picked: boolean, locked = false) => ({ id, name: `User ${id}`, detail: "", reason: "", defaultPicked: picked, selected: picked, locked });
  async function defaults(base: BillingClient): Promise<RetentionChoices> {
    const growth = (await base.listPlans()).find((p) => p.id === "growth")!;
    // Growth allows 5 users; 7 here. The default picks are u1–u5.
    return {
      targetPlan: { ...growth, limits: { ...growth.limits, users: 5 } },
      appliesOn: "2026-11-27T00:00:00.000Z",
      isDefault: true,
      locked: false,
      users: [item("u1", true, true), item("u2", true), item("u3", true), item("u4", true), item("u5", true), item("u6", false), item("u7", false)],
      projects: [],
      landingPages: [],
    };
  }

  it("the first Save sends exactly what's ticked (not the default picks) and keeps showing it", async () => {
    const base = createMockBillingClient({ initial: manual() });
    const before = await defaults(base);
    // The server keeps answering with the pre-save picks (a late or cached reload must not win).
    const save = vi.fn(async (req: { userIds: string[] }) => ({
      ...before,
      isDefault: false,
      users: before.users.map((u) => ({ ...u, selected: req.userIds.includes(u.id) })),
    }));
    await show({ ...base, getRetentionChoices: async () => before, saveRetentionChoices: save as never }, <ChooseWhatStaysScreen targetPlanId="growth" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "User u2" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "User u3" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "User u6" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "User u7" }));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual(expect.objectContaining({ targetPlanId: "growth", userIds: ["u1", "u4", "u5", "u6", "u7"] }));
    // After the save the editor shows the saved ticks, not the old defaults.
    expect(screen.getByRole("checkbox", { name: "User u6" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "User u2" })).not.toBeChecked();
    expect(screen.getByText("Showing your saved choice")).toBeInTheDocument();
  });

  async function onPage(back: string, extra: Record<string, string> = {}) {
    const base = createMockBillingClient({ initial: manual() });
    const before = await defaults(base);
    const overview = vi.spyOn(base, "getBillingOverview");
    const go = vi.fn(() => true);
    const client: BillingClient = { ...base, getRetentionChoices: async () => before, saveRetentionChoices: async () => ({ ...before, isDefault: false }) };
    render(
      <ToastProvider>
        <BillingEnvProvider client={client} canEdit onNavigate={go}>
          <OrgBillingProvider>
            <ChooseWhatStaysPage target="growth" back={back} {...extra} />
          </OrgBillingProvider>
        </BillingEnvProvider>
      </ToastProvider>,
    );
    await settle();
    return { go, overview };
  }

  it("Save returns to the request page (plan + interval kept, \"I'll choose\" selected) after reloading the overview", async () => {
    const { go, overview } = await onPage("checkout", { interval: "yearly" });
    const loadsBefore = overview.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await settle();
    expect(overview.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(go).toHaveBeenLastCalledWith("checkout", { plan: "growth", interval: "yearly", pick: "saved" });
    // The overview reload happened before going back.
    expect(overview.mock.invocationCallOrder.at(-1)!).toBeLessThan(go.mock.invocationCallOrder.at(-1)!);
  });

  it("Save returns to the downgrade page and to the Requests tab", async () => {
    let page = await onPage("downgrade", { interval: "monthly" });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await settle();
    expect(page.go).toHaveBeenLastCalledWith("downgrade", { plan: "growth", interval: "monthly", pick: "saved" });
    cleanup();
    page = await onPage("requests", { request: "req-1" });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await settle();
    expect(page.go).toHaveBeenLastCalledWith("requests", undefined);
  });

  it("Back (instead of Save) returns to the same page without saving", async () => {
    await onPage("checkout", { interval: "monthly" });
    const links = screen.getAllByRole("link", { name: "Back to your request" });
    // The page header's Back and the one next to Save.
    expect(links).toHaveLength(2);
    const cancel = links[1];
    expect(cancel).toHaveAttribute("href", "/org/settings/billing/checkout?plan=growth&interval=monthly&pick=saved");
  });

  it("back on the request page: \"I'll choose\" is selected and shows the saved choice; Send is enabled", async () => {
    const base = createMockBillingClient({ initial: manual({ situation: "basic" }) });
    const saved = (r: RetentionChoices): RetentionChoices => ({ ...r, isDefault: false, users: r.users.map((u, i) => ({ ...u, selected: i === 0 })) });
    const client: BillingClient = {
      ...base,
      previewCheckout: async (req) => ({ ...(await base.previewCheckout(req)), usageConflict: { items: [{ key: "users", limit: 5, used: 8 }], choicesFit: true } }) as CheckoutPreview,
      getRetentionChoices: async (req) => saved(await base.getRetentionChoices(req)),
    };
    await show(client, <CheckoutScreen planId="pro" interval="monthly" initialPick="saved" />);
    expect(screen.getByRole("radio", { name: OWN })).toBeChecked();
    expect(screen.getByTestId("what-stays-own")).toHaveTextContent("Your earlier choice");
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeEnabled();
  });
});

describe("Send change request waits for an option", () => {
  it("disabled with nothing selected even when the preview doesn't report the conflict (usage over the plan)", async () => {
    const base = createMockBillingClient({ initial: manual({ situation: "basic" }) });
    const o = await base.getBillingOverview();
    const usage = o.usage.map((u) => (u.key === "users" ? { ...u, used: 8 } : u));
    const client: BillingClient = {
      ...base,
      getBillingOverview: async () => ({ ...o, usage }),
      previewCheckout: async (req) => ({ ...(await base.previewCheckout(req)), usageConflict: null, usageError: null }) as CheckoutPreview,
    };
    await show(client, <CheckoutScreen planId="growth" interval="monthly" />);
    const send = screen.getByRole("button", { name: /Send change request/ });
    expect(screen.getByRole("radio", { name: DEFAULT })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: OWN })).not.toBeChecked();
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: OWN }));
    expect(send).toBeDisabled();
    expect(within(screen.getByTestId("what-stays-own")).getByRole("link", { name: "Choose what stays" })).toHaveAttribute(
      "href",
      "/org/settings/billing/choose-what-stays?target=growth&back=checkout&interval=monthly",
    );
    fireEvent.click(screen.getByRole("radio", { name: DEFAULT }));
    expect(send).toBeEnabled();
  });
});
