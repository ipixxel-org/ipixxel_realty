/**
 * Plan versions for Super Admin: the newest version and organisations per
 * version on each plan card, the confirm before a save that makes a new
 * version (Basic: who's over the new limits and gets notice), and "Starter v2"
 * with "v3 applies at renewal on …" on the Subscriptions list and org page.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider } from "@/components/billing/context";
import { AdminPlansEditor, PlanEditForm, versionConfirmText, versionCountsText } from "@/components/billing/admin/plans-editor";
import { newerVersionNote, planWithVersion, SubscriptionDetailView, SubscriptionsList } from "@/components/billing/admin/subscriptions";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { formatDate } from "@/lib/billing/pricing";
import type { BillingPlan, PlanSavePreview, SubscriptionRow } from "@/lib/billing/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin-console/subscriptions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ hasPermission: () => true, user: { roleKeys: ["super_admin"] } }) }));

afterEach(cleanup);

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function show(client: BillingClient, node: ReactNode) {
  render(
    <ToastProvider>
      <BillingEnvProvider client={client}>{node}</BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
}

const preview = (over: Partial<PlanSavePreview> = {}): PlanSavePreview => ({
  planName: "Starter",
  isFree: false,
  createsVersion: true,
  version: 4,
  orgsOnPlan: 16,
  basic: null,
  ...over,
});

/* ------------------------------------------------------------ Texts */

describe("texts", () => {
  it("organisations per version, newest first", () => {
    expect(
      versionCountsText([
        { version: 3, orgs: 12 },
        { version: 2, orgs: 4 },
        { version: 1, orgs: 1 },
      ]),
    ).toBe("v3 · 12 orgs, v2 · 4 orgs, v1 · 1 org");
  });

  it("the save confirm (paid plan)", () => {
    expect(versionConfirmText(preview())).toBe("This creates v4. 16 organisations stay on their current version until their next renewal.");
    expect(versionConfirmText(preview({ orgsOnPlan: 1 }))).toBe("This creates v4. 1 organisation stays on its current version until its next renewal.");
    expect(versionConfirmText(preview({ orgsOnPlan: 0 }))).toBe("This creates v4. No organisations are on this plan yet.");
  });

  it("the save confirm (Basic): over the new limits get notice, the rest move now", () => {
    const basic = (overLimits: number, moveNow: number) => preview({ planName: "Basic", isFree: true, version: 3, orgsOnPlan: overLimits + moveNow, basic: { overLimits, moveNow, noticeDays: 7 } });
    expect(versionConfirmText(basic(2, 0))).toBe("This creates Basic v3. 2 organisations on Basic are over the new limits; they get 7 days' notice.");
    expect(versionConfirmText(basic(1, 5))).toBe(
      "This creates Basic v3. 1 organisation on Basic is over the new limits; they get 7 days' notice. The 5 organisations on Basic that fit move to it now.",
    );
    expect(versionConfirmText(basic(0, 9))).toBe("This creates Basic v3. All 9 organisations on Basic move to it now.");
  });

  it("an organisation's plan and version, and when the newer one applies", () => {
    const row = { plan: { name: "Starter", isFree: false }, planVersion: 2, latestVersion: 3, versionAppliesOn: "2026-11-26" } as unknown as SubscriptionRow;
    expect(planWithVersion(row)).toBe("Starter v2");
    expect(newerVersionNote(row)).toBe(`v3 applies at renewal on ${formatDate("2026-11-26")}`);
    expect(newerVersionNote({ ...row, plan: { ...row.plan, isFree: true } })).toBe(`v3 applies on ${formatDate("2026-11-26")}`);
    expect(newerVersionNote({ ...row, versionAppliesOn: null })).toBeNull();
    expect(planWithVersion({ ...row, planVersion: null })).toBe("Starter");
  });
});

/* -------------------------------------------------------- Plans & Pricing */

describe("Plans & Pricing", () => {
  it("each card shows the newest version and organisations per version", async () => {
    const base = createMockBillingClient();
    const plans = await base.listAdminPlans();
    const client = {
      ...base,
      listAdminPlans: async () =>
        plans.map((p) => (p.id === "growth" ? { ...p, version: 3, versions: [{ version: 3, orgs: 12 }, { version: 2, orgs: 4 }] } : p)),
    } as BillingClient;
    await show(client, <AdminPlansEditor />);
    const card = screen.getAllByTestId("admin-plan-card").find((c) => within(c).queryByText("Growth"))!;
    expect(within(card).getByTestId("plan-version")).toHaveTextContent("v3");
    expect(within(card).getByTestId("plan-version-counts")).toHaveTextContent("v3 · 12 orgs, v2 · 4 orgs");
  });

  async function editForm(answer: PlanSavePreview) {
    const base = createMockBillingClient();
    const starter = (await base.listAdminPlans()).find((p) => p.id === "growth")!;
    const saveAdminPlan = vi.fn(async (p: BillingPlan) => p);
    const previewAdminPlanSave = vi.fn(async () => answer);
    const client = { ...base, saveAdminPlan, previewAdminPlanSave } as BillingClient;
    await show(client, <PlanEditForm initial={starter} />);
    return { starter, saveAdminPlan, previewAdminPlanSave };
  }

  it("a change that makes a new version asks first, with who it affects; Save v4 saves", async () => {
    const { saveAdminPlan, previewAdminPlanSave } = await editForm(preview());
    fireEvent.change(screen.getByLabelText("Monthly price (₹, before GST)"), { target: { value: "1199" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await settle();
    expect(previewAdminPlanSave).toHaveBeenCalled();
    expect(saveAdminPlan).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Save as v4?");
    expect(dialog).toHaveTextContent("This creates v4. 16 organisations stay on their current version until their next renewal.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save v4" }));
    await settle();
    expect(saveAdminPlan).toHaveBeenCalledWith(expect.objectContaining({ priceMonthly: 1199 }));
  });

  it("Cancel in the confirm saves nothing", async () => {
    const { saveAdminPlan } = await editForm(preview());
    fireEvent.change(screen.getByLabelText("Users"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await settle();
    expect(saveAdminPlan).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a name or description change saves straight away (no new version)", async () => {
    const { saveAdminPlan } = await editForm(preview({ createsVersion: false, version: 3 }));
    fireEvent.change(screen.getByLabelText("Short description"), { target: { value: "For small teams" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saveAdminPlan).toHaveBeenCalledWith(expect.objectContaining({ tagline: "For small teams" }));
  });

  it("the mock works out the same: price, limits or features make a version", async () => {
    const client = createMockBillingClient();
    const starter = (await client.listAdminPlans()).find((p) => p.id === "growth")!;
    expect((await client.previewAdminPlanSave({ ...starter, tagline: "x" })).createsVersion).toBe(false);
    expect((await client.previewAdminPlanSave({ ...starter, priceYearly: starter.priceYearly + 1 })).createsVersion).toBe(true);
    expect((await client.previewAdminPlanSave({ ...starter, modules: { ...starter.modules, teamChat: !starter.modules.teamChat } })).createsVersion).toBe(true);
  });
});

/* --------------------------------------------- Subscriptions and org page */

describe("organisations: plan with its version", () => {
  it("Subscriptions list: 'Starter v2' and when v3 applies", async () => {
    const base = createMockBillingClient();
    const list = await base.listSubscriptions({ page: 1, pageSize: 10 } as never);
    const rows: SubscriptionRow[] = list.data.slice(0, 2).map((r, i) => ({
      ...r,
      orgName: `Org ${i}`,
      plan: { ...r.plan, name: "Starter", isFree: false },
      planVersion: i === 0 ? 2 : 3,
      latestVersion: 3,
      versionAppliesOn: i === 0 ? "2026-11-26" : null,
    }));
    const client = { ...base, listSubscriptions: async () => ({ ...list, data: rows, total: 2 }) } as BillingClient;
    await show(client, <SubscriptionsList />);
    const row0 = screen.getByText("Org 0").closest("tr")!;
    const row1 = screen.getByText("Org 1").closest("tr")!;
    expect(within(row0).getByTestId("row-plan")).toHaveTextContent("Starter v2");
    expect(within(row0).getByTestId("newer-version-note")).toHaveTextContent(`v3 applies at renewal on ${formatDate("2026-11-26")}`);
    expect(within(row1).getByTestId("row-plan")).toHaveTextContent("Starter v3");
    expect(within(row1).queryByTestId("newer-version-note")).toBeNull();
  });

  it("org page: the plan summary shows the version and the note", async () => {
    const base = createMockBillingClient();
    const first = (await base.listSubscriptions({ page: 1, pageSize: 10 } as never)).data[0];
    const real = await base.getSubscription(first.orgId);
    const client = {
      ...base,
      getSubscription: async () => ({ ...real, plan: { ...real.plan, name: "Growth", isFree: false }, planVersion: 1, latestVersion: 2, versionAppliesOn: "2026-12-01" }),
    } as BillingClient;
    await show(client, <SubscriptionDetailView orgId={first.orgId} />);
    expect(screen.getByTestId("summary-plan")).toHaveTextContent("Growth v1");
    expect(screen.getByTestId("newer-version-note")).toHaveTextContent(`v2 applies at renewal on ${formatDate("2026-12-01")}`);
  });
});
