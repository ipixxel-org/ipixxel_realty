/**
 * Super Admin "Extend grace": the extension on the plan summary, timeline and
 * Organisation Subscriptions list; the "Give more time to pay" number input
 * (1–60 whole days, live end date, added on top of an earlier extension);
 * and the red action is "Move to Basic".
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider } from "@/components/billing/context";
import { graceDaysError, graceEndAfter, SubscriptionDetailView, SubscriptionsList } from "@/components/billing/admin/subscriptions";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { formatDate } from "@/lib/billing/pricing";
import type { SubscriptionDetail, SubscriptionRow } from "@/lib/billing/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin-console/subscriptions",
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
  render(
    <ToastProvider>
      <BillingEnvProvider client={client}>{node}</BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
}

/** An org in grace: due 25 Oct, 7 grace days (+ `extra` given) → ends 1 Nov + extra. */
async function inGrace(extra = 0) {
  const base = createMockBillingClient();
  const first = (await base.listSubscriptions({ page: 1, pageSize: 10 } as never)).data[0];
  const real = await base.getSubscription(first.orgId);
  const due = "2026-10-25";
  const detail: SubscriptionDetail = {
    ...real,
    status: "past_due",
    plan: real.plan.isFree ? (await base.listPlans()).find((p) => !p.isFree)! : real.plan,
    dueDate: due,
    graceDays: 7,
    graceExtraDays: extra,
    keyDate: graceEndAfter({ dueDate: due, graceDays: 7, graceExtraDays: extra, keyDate: null }, 0),
    timeline: [
      { at: "2026-10-26T10:00:00Z", kind: "grace", text: "Grace extended by 3 days → 4 Nov 2026 by admin@acme.test · 'Customer promised a bank transfer by Friday'" },
    ],
  };
  const extendGrace = vi.fn(async (req: { orgId: string; days: number; note?: string }) => ({
    ...detail,
    graceExtraDays: extra + req.days,
    keyDate: graceEndAfter(detail, req.days),
  }));
  const client = { ...base, getSubscription: async () => detail, extendGrace } as BillingClient;
  return { client, detail, extendGrace };
}

async function openDialog(client: BillingClient, orgId: string) {
  await show(client, <SubscriptionDetailView orgId={orgId} />);
  fireEvent.click(within(screen.getByTestId("subscription-actions")).getByRole("button", { name: /Extend grace/ }));
}

const daysInput = () => screen.getByLabelText("Extra days") as HTMLInputElement;
const extendButton = () => screen.getAllByRole("button").find((b) => /^Extend (by|grace)/.test(b.textContent ?? "") && b.closest("[role=dialog]"))!;

/* ---------------------------------------------------- Shown on the page */

describe("extension shown on the org billing page", () => {
  it("plan summary: Grace ends with '7 days + 3 extra days', and the line below says they were given", async () => {
    const { client, detail } = await inGrace(3);
    await show(client, <SubscriptionDetailView orgId={detail.orgId} />);
    expect(screen.getByTestId("summary-key-date")).toHaveTextContent(formatDate("2026-11-04"));
    expect(screen.getByTestId("summary-grace-extra")).toHaveTextContent("7 days + 3 extra days");
    expect(document.body.textContent).toContain("Grace period 7 days + 3 extra days given.");
    // The status tag doesn't change.
    expect(screen.getByText("Payment due · grace")).toBeInTheDocument();
  });

  it("plan summary without an extension stays as before", async () => {
    const { client, detail } = await inGrace(0);
    await show(client, <SubscriptionDetailView orgId={detail.orgId} />);
    expect(screen.queryByTestId("summary-grace-extra")).toBeNull();
    expect(document.body.textContent).toContain("Grace period 7 days.");
    expect(document.body.textContent).not.toContain("extra days given");
  });

  it("timeline: the extension with the date, who, days, new end and note", async () => {
    const { client, detail } = await inGrace(3);
    await show(client, <SubscriptionDetailView orgId={detail.orgId} />);
    const line = screen.getByText(/Grace extended by 3 days/).closest("li")!;
    expect(line).toHaveTextContent(formatDate("2026-10-26"));
    expect(line).toHaveTextContent("Grace extended by 3 days → 4 Nov 2026 by admin@acme.test · 'Customer promised a bank transfer by Friday'");
  });

  it("Organisation Subscriptions list: '+3 days' next to the status for an extended grace only", async () => {
    const base = createMockBillingClient();
    const list = await base.listSubscriptions({ page: 1, pageSize: 10 } as never);
    const rows: SubscriptionRow[] = list.data.slice(0, 2).map((r, i) => ({
      ...r,
      orgName: `Org ${i}`,
      status: "past_due",
      keyDate: "2026-11-04",
      graceExtraDays: i === 0 ? 3 : 0,
    }));
    const client = { ...base, listSubscriptions: async () => ({ ...list, data: rows, total: 2 }) } as BillingClient;
    await show(client, <SubscriptionsList />);
    const row0 = screen.getByText("Org 0").closest("tr")!;
    const row1 = screen.getByText("Org 1").closest("tr")!;
    expect(within(row0).getByTestId("grace-extra-tag")).toHaveTextContent("+3 days");
    expect(within(row0).getByText("Payment due · grace")).toBeInTheDocument();
    expect(within(row1).queryByTestId("grace-extra-tag")).toBeNull();
  });
});

/* ------------------------------------------------------------- Dialog */

describe("Give more time to pay", () => {
  it("is a number input; whole numbers 1–60 only, with an inline error and the button disabled", async () => {
    const { client, detail } = await inGrace(0);
    await openDialog(client, detail.orgId);
    expect(daysInput().type).toBe("number");
    for (const [v, msg] of [
      ["", "Enter the number of extra days."],
      ["0", "At least 1 day."],
      ["2.5", "Whole days only"],
      ["61", "At most 60 days"],
    ] as const) {
      fireEvent.change(daysInput(), { target: { value: v } });
      expect(screen.getByTestId("grace-days-error")).toHaveTextContent(msg);
      expect(extendButton()).toBeDisabled();
      expect(screen.queryByTestId("grace-new-end")).toBeNull();
    }
    fireEvent.change(daysInput(), { target: { value: "60" } });
    expect(screen.queryByTestId("grace-days-error")).toBeNull();
    expect(extendButton()).toBeEnabled();
  });

  it("validation rules match the backend's 1–60 whole days", () => {
    expect(graceDaysError("1")).toBeNull();
    expect(graceDaysError("60")).toBeNull();
    expect(graceDaysError(" 7 ")).toBeNull();
    expect(graceDaysError("-1")).not.toBeNull();
    expect(graceDaysError("1e1")).not.toBeNull();
  });

  it("shows the new end date live as they type (same rule as the backend: due date + grace + extra days)", async () => {
    const { client, detail } = await inGrace(0);
    await openDialog(client, detail.orgId);
    expect(screen.getByTestId("grace-intro")).toHaveTextContent(`Grace currently ends ${formatDate("2026-11-01")}.`);
    expect(screen.getByTestId("grace-intro").textContent).not.toContain("given earlier");
    expect(screen.getByTestId("grace-new-end")).toHaveTextContent(`Grace will end on ${formatDate("2026-11-04")} (currently ${formatDate("2026-11-01")})`);
    fireEvent.change(daysInput(), { target: { value: "10" } });
    expect(screen.getByTestId("grace-new-end")).toHaveTextContent(`Grace will end on ${formatDate("2026-11-11")} (currently ${formatDate("2026-11-01")})`);
  });

  it("an earlier extension: the intro says so and the new days go on top", async () => {
    const { client, detail } = await inGrace(3);
    await openDialog(client, detail.orgId);
    expect(screen.getByTestId("grace-intro")).toHaveTextContent(`Grace currently ends ${formatDate("2026-11-04")} (includes 3 extra days given earlier)`);
    fireEvent.change(daysInput(), { target: { value: "2" } });
    expect(screen.getByTestId("grace-new-end")).toHaveTextContent(`Grace will end on ${formatDate("2026-11-06")} (currently ${formatDate("2026-11-04")})`);
  });

  it("the button reads 'Extend by N days' with the typed number and sends it; the note stays optional", async () => {
    const { client, detail, extendGrace } = await inGrace(0);
    await openDialog(client, detail.orgId);
    expect(extendButton()).toHaveTextContent("Extend by 3 days");
    fireEvent.change(daysInput(), { target: { value: "1" } });
    expect(extendButton()).toHaveTextContent("Extend by 1 day");
    fireEvent.change(daysInput(), { target: { value: "12" } });
    expect(extendButton()).toHaveTextContent("Extend by 12 days");
    fireEvent.click(extendButton());
    await settle();
    expect(extendGrace).toHaveBeenCalledWith({ orgId: detail.orgId, days: 12, note: undefined });
  });
});

/* ------------------------------------------------------ Move to Basic */

describe("Move to Basic", () => {
  it("the red action and its dialog say Move to Basic, not Cancel", async () => {
    const { client, detail } = await inGrace(0);
    await show(client, <SubscriptionDetailView orgId={detail.orgId} />);
    const row = screen.getByTestId("subscription-actions");
    expect(within(row).queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Move to Basic" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(`Move ${detail.orgName} to Basic`);
    expect(within(dialog).getByRole("button", { name: "Move to Basic" })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/Cancel plan/);
  });
});
