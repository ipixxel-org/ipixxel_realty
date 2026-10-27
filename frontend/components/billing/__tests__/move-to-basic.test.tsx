/**
 * Settings → Billing without "Cancel plan": no "How you pay" block, Basic is a
 * normal choice under Change plan (scheduled for the end of the paid period,
 * with an undo), and no customer-facing "cancel" wording in the org screens.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { BillingOverviewPanel } from "@/components/billing/overview";
import { PlansScreen } from "@/components/billing/plans";
import { DowngradeScreen } from "@/components/billing/plan-changes";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";

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

const onGrowth = () => createMockBillingClient({ initial: { situation: "active", paidPlanId: "growth" } });

describe("Settings → Billing", () => {
  it('has no "How you pay" block and no Cancel plan button', async () => {
    await show(onGrowth(), <BillingOverviewPanel showInvoices={false} />);
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.queryByText("How you pay")).toBeNull();
    const row = screen.getByTestId("billing-actions");
    expect(within(row).queryByText(/cancel/i)).toBeNull();
    expect(within(row).getByRole("link", { name: /Change plan/ })).toBeInTheDocument();
  });

  it("Basic is a normal choice on the plans page", async () => {
    await show(onGrowth(), <PlansScreen />);
    const links = screen.getAllByRole("link", { name: /Change plan/ });
    expect(links.some((a) => a.getAttribute("href")?.includes("plan=basic"))).toBe(true);
  });
});

describe("choosing Basic", () => {
  it("asks why, schedules the change with the new wording, and Keep Growth undoes it", async () => {
    const client = onGrowth();
    const cancelPlan = vi.spyOn(client, "cancelPlan");
    await show(client, <DowngradeScreen planId="basic" />);

    fireEvent.change(screen.getByLabelText("Why are you moving to Basic? (optional)"), { target: { value: "Too expensive" } });
    // Over Basic's limits: pick an option first (none is selected on arrival).
    expect(screen.getByRole("button", { name: /Move to Basic/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Keep the default picks" }));
    fireEvent.click(screen.getByRole("button", { name: /Move to Basic/ }));
    await settle();
    expect(screen.getByText(/^Move to Basic on \d{1,2} \w{3} \d{4}\?$/)).toBeInTheDocument();
    expect(screen.getByText("You keep Growth until then.")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Move to Basic/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await settle();

    expect(cancelPlan).toHaveBeenCalledWith({ reason: "Too expensive", whatStaysChoice: "default" });
    expect(client.snapshot().situation).toBe("cancellation_scheduled");
    // Toast and banner say the same thing.
    expect(screen.getAllByText(/^Change to Basic scheduled for \d{1,2} \w{3} \d{4}$/).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: "Keep Growth" }));
    await settle();
    expect(client.snapshot().situation).toBe("active");
    expect(screen.getByText("You'll stay on Growth — it renews as usual.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep Growth" })).toBeNull();
    expect(screen.getByRole("button", { name: /Move to Basic/ })).toBeInTheDocument();
  });

  it("a smaller paid plan uses the same style: Change to … scheduled, Keep Pro", async () => {
    const client = createMockBillingClient({ initial: { situation: "active", paidPlanId: "pro" } });
    await show(client, <DowngradeScreen planId="growth" />);
    const keep = screen.queryByRole("radio", { name: "Keep the default picks" });
    if (keep) fireEvent.click(keep);
    fireEvent.click(screen.getByRole("button", { name: /Confirm plan change/ }));
    expect(screen.getByText(/^Change to Growth on \d{1,2} \w{3} \d{4}\?$/)).toBeInTheDocument();
    expect(screen.getByText("You keep Pro until then.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schedule plan change" }));
    await settle();
    expect(screen.getAllByText(/^Change to Growth scheduled for /).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Keep Pro" })).toBeInTheDocument();
  });
});

/* -------------------------------------------- No "cancel" in customer copy */

describe('no customer-facing "cancel" text in the org billing screens', () => {
  // Org-facing billing components (Super Admin screens under admin/ keep their Cancel action).
  const dir = join(process.cwd(), "components", "billing");
  const files = [
    ...readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => join(dir, f)),
    join(dir, "walkthrough", "org-steps.tsx"),
    join(dir, "walkthrough", "banners-preview.tsx"),
    join(process.cwd(), "lib", "billing", "requests.ts"),
  ];

  it.each(files.map((f) => [f.slice(process.cwd().length + 1), f]))("%s", (_name, file) => {
    // Comments aside, a whole word "cancel…" can only be text (identifiers like
    // cancelPlan or "cancellation_scheduled" aren't whole words).
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const hits = code.split("\n").filter((l) => /\bcancel(?:s|led|ling|lation)?\b/i.test(l));
    expect(hits).toEqual([]);
  });
});
