/**
 * Super Admin version history: one column per version (newest first) with
 * prices, every limit and feature switch; changed cells highlighted with the
 * old value as a tooltip; who / when and "Latest" in the header; org counts
 * that expand the organisations on a version (linked to their billing page,
 * with when they move to the latest). Opened from the plan card's version
 * line, and (one version) from the org page's "View".
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider } from "@/components/billing/context";
import { AdminPlansEditor } from "@/components/billing/admin/plans-editor";
import { PlanVersionHistoryDialog } from "@/components/billing/admin/plan-version-history";
import { SubscriptionDetailView } from "@/components/billing/admin/subscriptions";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { formatDate } from "@/lib/billing/pricing";
import type { PlanVersionHistory, PlanVersionOrg } from "@/lib/billing/types";

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

const HISTORY: PlanVersionHistory = {
  planId: "growth",
  planName: "Growth",
  isFree: false,
  limitRows: [
    { key: "users", label: "Users" },
    { key: "projects", label: "Projects" },
    { key: "landingPages", label: "Live landing pages" },
    { key: "landingPagesCreate", label: "Created landing pages" },
    { key: "templates", label: "Templates" },
    { key: "metaPages", label: "Meta pages" },
  ],
  featureRows: [
    { key: "teamChat", label: "Team chat" },
    { key: "metaLeadAds", label: "Meta lead ads" },
  ],
  versions: [
    {
      id: "ver-2",
      version: 2,
      latest: true,
      createdAt: "2026-10-30",
      createdBy: "Asha Rao",
      priceMonthly: 2500,
      priceYearly: 20000,
      limits: { users: 3, projects: null, landingPages: 2, landingPagesCreate: 4, templates: 2, metaPages: 1 },
      features: { teamChat: false, metaLeadAds: true },
      orgs: 0,
    },
    {
      id: "ver-1",
      version: 1,
      latest: false,
      createdAt: "2026-09-01",
      createdBy: null,
      priceMonthly: 2000,
      priceYearly: 20000,
      limits: { users: 5, projects: null, landingPages: 2, landingPagesCreate: null, templates: 2, metaPages: 1 },
      features: { teamChat: true, metaLeadAds: true },
      orgs: 2,
    },
  ],
};
const ORGS: PlanVersionOrg[] = [
  { orgId: "org-a", orgName: "Acme Realty", interval: "monthly", movesOn: "2026-11-26" },
  { orgId: "org-b", orgName: "Bay Homes", interval: "yearly", movesOn: "2027-03-01" },
];

function client() {
  const base = createMockBillingClient();
  const listPlanVersionOrgs = vi.fn(async () => ({ data: ORGS, total: 2, page: 1, pageSize: 20 }));
  const c = { ...base, getPlanVersions: async () => HISTORY, listPlanVersionOrgs } as BillingClient;
  return { c, listPlanVersionOrgs };
}

const cell = (key: string, v: number) => screen.getByTestId(`cell-${key}-v${v}`);

describe("the history table", () => {
  it("one column per version, newest first: prices, every limit and feature; Unlimited shown as such", async () => {
    await show(client().c, <PlanVersionHistoryDialog open onClose={() => {}} planId="growth" planName="Growth" />);
    const heads = within(screen.getByTestId("version-history")).getAllByRole("columnheader").slice(1);
    expect(heads.map((h) => h.textContent)).toEqual([
      expect.stringContaining("v2"),
      expect.stringContaining("v1"),
    ]);
    expect(cell("priceMonthly", 2)).toHaveTextContent("₹2,500 + GST");
    expect(cell("priceYearly", 1)).toHaveTextContent("₹20,000 + GST");
    expect(cell("users", 2)).toHaveTextContent("3");
    expect(cell("projects", 2)).toHaveTextContent("Unlimited");
    expect(cell("landingPagesCreate", 1)).toHaveTextContent("Unlimited");
    expect(cell("metaPages", 2)).toHaveTextContent("1");
    expect(cell("teamChat", 2)).toHaveTextContent("Off");
    expect(cell("teamChat", 1)).toHaveTextContent("On");
    for (const label of ["Users", "Projects", "Live landing pages", "Created landing pages", "Templates", "Meta pages", "Team chat", "Meta lead ads"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("the header: version, created on, created by, and Latest on the newest", async () => {
    await show(client().c, <PlanVersionHistoryDialog open onClose={() => {}} planId="growth" planName="Growth" />);
    const v2 = screen.getByTestId("version-head-v2");
    expect(v2).toHaveTextContent("Latest");
    expect(v2).toHaveTextContent(formatDate("2026-10-30"));
    expect(v2).toHaveTextContent("by Asha Rao");
    const v1 = screen.getByTestId("version-head-v1");
    expect(v1).not.toHaveTextContent("Latest");
    expect(v1).toHaveTextContent(formatDate("2026-09-01"));
  });

  it("cells that changed from the version before are highlighted, with the old value as a tooltip", async () => {
    await show(client().c, <PlanVersionHistoryDialog open onClose={() => {}} planId="growth" planName="Growth" />);
    expect(cell("priceMonthly", 2)).toHaveAttribute("data-changed", "true");
    expect(cell("priceMonthly", 2)).toHaveAttribute("title", "Was ₹2,000 + GST in v1");
    expect(cell("users", 2)).toHaveAttribute("title", "Was 5 in v1");
    expect(cell("landingPagesCreate", 2)).toHaveAttribute("title", "Was Unlimited in v1");
    expect(cell("teamChat", 2)).toHaveAttribute("title", "Was On in v1");
    // Unchanged, and the oldest version (nothing before it): not highlighted.
    expect(cell("priceYearly", 2)).not.toHaveAttribute("data-changed");
    expect(cell("projects", 2)).not.toHaveAttribute("title");
    expect(cell("users", 1)).not.toHaveAttribute("data-changed");
  });

  it("org counts: a link that lists the organisations on that version, each linked to its billing page", async () => {
    const { c, listPlanVersionOrgs } = client();
    await show(c, <PlanVersionHistoryDialog open onClose={() => {}} planId="growth" planName="Growth" />);
    // None on v2: no link.
    expect(screen.queryByTestId("version-orgs-link-v2")).toBeNull();
    const link = screen.getByTestId("version-orgs-link-v1");
    expect(link).toHaveTextContent("2 orgs");
    fireEvent.click(link);
    await settle();
    expect(listPlanVersionOrgs).toHaveBeenCalledWith({ planId: "growth", versionId: "ver-1", page: 1, pageSize: 20 });
    const list = screen.getByTestId("version-orgs-v1");
    expect(list).toHaveTextContent("Organisations on v1");
    expect(within(list).getByRole("link", { name: "Acme Realty" })).toHaveAttribute("href", "/admin-console/subscriptions/org/org-a");
    const acme = within(list).getByText("Acme Realty").closest("tr")!;
    expect(acme).toHaveTextContent("Monthly");
    expect(acme).toHaveTextContent(formatDate("2026-11-26"));
    expect(within(list).getByText("Bay Homes").closest("tr")!).toHaveTextContent("Yearly");
    // Click again: closed.
    fireEvent.click(link);
    expect(screen.queryByTestId("version-orgs-v1")).toBeNull();
  });

  it("one version only (the org page's View)", async () => {
    await show(client().c, <PlanVersionHistoryDialog open onClose={() => {}} planId="growth" planName="Growth" onlyVersionId="ver-1" title="Growth v1" />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Growth v1");
    expect(screen.getByTestId("version-head-v1")).toBeInTheDocument();
    expect(screen.queryByTestId("version-head-v2")).toBeNull();
  });
});

describe("where it opens", () => {
  it("the plan card's version line opens the version history", async () => {
    const base = createMockBillingClient();
    const plans = await base.listAdminPlans();
    const c = {
      ...base,
      getPlanVersions: async () => HISTORY,
      listAdminPlans: async () => plans.map((p) => (p.id === "growth" ? { ...p, version: 2, versions: [{ version: 2, orgs: 0 }, { version: 1, orgs: 2 }] } : p)),
    } as BillingClient;
    await show(c, <AdminPlansEditor />);
    const line = screen.getByTestId("plan-version-counts");
    expect(line).toHaveTextContent("Version history · v2 · 0 orgs, v1 · 2 orgs");
    fireEvent.click(line);
    await settle();
    expect(screen.getByRole("dialog")).toHaveTextContent("Growth — version history");
    expect(screen.getByTestId("version-history")).toBeInTheDocument();
  });

  it("the org page: 'Growth v1' with View, showing that version's values", async () => {
    const base = createMockBillingClient();
    const first = (await base.listSubscriptions({ page: 1, pageSize: 10 } as never)).data[0];
    const real = await base.getSubscription(first.orgId);
    const c = {
      ...base,
      getPlanVersions: async () => HISTORY,
      getSubscription: async () => ({ ...real, plan: { ...real.plan, id: "growth", name: "Growth", isFree: false }, planVersion: 1, planVersionId: "ver-1", latestVersion: 2 }),
    } as BillingClient;
    await show(c, <SubscriptionDetailView orgId={first.orgId} />);
    expect(screen.getByTestId("summary-plan")).toHaveTextContent("Growth v1");
    fireEvent.click(screen.getByTestId("view-plan-version"));
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Growth v1");
    expect(within(dialog).getByTestId("cell-users-v1")).toHaveTextContent("5");
    expect(within(dialog).queryByTestId("version-head-v2")).toBeNull();
  });
});
