/**
 * Steps through both billing walkthroughs end to end (the real components on
 * sandboxed mock data) and fails on any console error.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BannersPreview } from "@/components/billing/walkthrough/banners-preview";
import { ADMIN_STEPS } from "@/components/billing/walkthrough/admin-steps";
import { ORG_STEPS } from "@/components/billing/walkthrough/org-steps";
import { AdminWalkthrough, CustomerWalkthrough } from "@/components/billing/walkthrough/walkthroughs";

let search = new URLSearchParams();
const replace = vi.fn((url: string) => {
  search = new URLSearchParams(url.split("?")[1] ?? "");
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/billing-walkthrough",
  useSearchParams: () => search,
  useParams: () => ({}),
}));

let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  search = new URLSearchParams();
  replace.mockClear();
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Let mock-client promises and the effects they trigger settle. */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const show = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

/** What must be visible on each customer step (the real component, in its situation). */
const ORG_EXPECT: (RegExp | string)[] = [
  "Upgrade to add more users",
  "Compare plans",
  "PIN code",
  /LAUNCH20 applied/,
  "CGST 9%",
  /SIMULATED PAYMENT/,
  "Your plan is active",
  "Billing details",
  "Option B: Pay each time",
  /We couldn't charge/,
  /Grace ends tomorrow/,
  "2 of 2 selected",
  /Your account is paused/,
  /18 days left/,
  /You have 10 users; Growth allows 5/,
];

describe("customer walkthrough", () => {
  it(`steps through all ${ORG_STEPS.length} steps with no console errors`, async () => {
    expect(ORG_STEPS).toHaveLength(15);
    show(<CustomerWalkthrough />);
    for (let i = 0; i < ORG_STEPS.length; i++) {
      await settle();
      expect(screen.getByText(`Step ${i + 1} of ${ORG_STEPS.length}`)).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: ORG_STEPS[i].title })).toBeInTheDocument();
      expect(screen.getAllByText(ORG_EXPECT[i]).length).toBeGreaterThan(0);
      if (i < ORG_STEPS.length - 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  it("arrow keys move between steps and Back works", async () => {
    show(<CustomerWalkthrough />);
    await settle();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await settle();
    expect(screen.getByText("Step 2 of 15")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await settle();
    expect(screen.getByText("Step 1 of 15")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(replace).toHaveBeenCalledWith("/org/billing-walkthrough?step=2", { scroll: false });
  });

  it("step 4 shows why an invalid code is refused", async () => {
    search = new URLSearchParams("step=4");
    show(<CustomerWalkthrough />);
    await settle();
    expect(screen.getByText(/There's no coupon called FAKE10/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay ₹1,888/ })).toBeInTheDocument();
  });

  it("step 6: paying in the practice window moves on to the success step", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      search = new URLSearchParams("step=6");
      show(<CustomerWalkthrough />);
      await settle();
      const popup = screen.getByRole("dialog", { name: "Payment" });
      expect(within(popup).getByText("₹1,888")).toBeInTheDocument();
      fireEvent.click(within(popup).getByRole("button", { name: /^Pay ₹/ }));
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });
      await settle();
      expect(screen.getByText("Step 7 of 15")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("step 12: ticking is limited by the counter and the owner is locked", async () => {
    search = new URLSearchParams("step=12");
    show(<CustomerWalkthrough />);
    await settle();
    expect(screen.getByRole("checkbox", { name: "Rohan Mehta" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Arjun Nair" })).toBeDisabled(); // 2 of 2 already
    fireEvent.click(screen.getByRole("checkbox", { name: "Priya Sharma" }));
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Arjun Nair" }));
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it("step 15: confirming a downgrade shows the undo", async () => {
    search = new URLSearchParams("step=15");
    show(<CustomerWalkthrough />);
    await settle();
    // Right: Basic already scheduled, with the undo.
    expect(screen.getByText(/Change to Basic scheduled for/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Keep Pro" })).toHaveLength(1);
    // Over Growth's limits: pick an option first.
    const keep = screen.queryByRole("radio", { name: "Keep the default picks" });
    if (keep) fireEvent.click(keep);
    fireEvent.click(screen.getByRole("button", { name: /Confirm plan change/ }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule plan change" }));
    await settle();
    expect(screen.getAllByText(/Change to Growth scheduled for/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Keep Pro" })).toHaveLength(2);
    expect(screen.getByText("Step 15 of 15")).toBeInTheDocument();
  });
});

const ADMIN_EXPECT: (RegExp | string)[] = [
  "Coming later",
  "Only specific organisations",
  "Total discount given",
  "Moved to Basic",
  /Upgraded to Pro mid-cycle/,
  "Give more time to pay",
  /credit note/,
  "Fall back to Basic",
];

describe("admin walkthrough", () => {
  it(`steps through all ${ADMIN_STEPS.length} steps with no console errors`, async () => {
    show(<AdminWalkthrough />);
    for (let i = 0; i < ADMIN_STEPS.length; i++) {
      await settle();
      expect(screen.getByText(`Step ${i + 1} of ${ADMIN_STEPS.length}`)).toBeInTheDocument();
      expect(screen.getAllByText(ADMIN_EXPECT[i]).length + screen.queryAllByDisplayValue(ADMIN_EXPECT[i]).length).toBeGreaterThan(0);
      if (i < ADMIN_STEPS.length - 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(errors).toEqual([]);
  });

  it("a coupon created in step 2 appears in the list in step 3", async () => {
    search = new URLSearchParams("step=2");
    show(<AdminWalkthrough />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Create coupon" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    expect(screen.getByText("SKYLINE15")).toBeInTheDocument();
  });
});

describe("banners preview", () => {
  it("switches between every situation with one dropdown", async () => {
    show(<BannersPreview />);
    const select = screen.getByLabelText("Situation") as HTMLSelectElement;
    const expectByOption: Record<string, RegExp> = {
      "renewal-a": /will be charged on/,
      "renewal-b": /renews in 3 days/,
      "payment-due": /We couldn't charge/,
      "grace-ends": /Grace ends tomorrow/,
      moved: /You're on Basic now/,
      basic: /Change to Basic scheduled for/,
      downgrade: /Change to Growth scheduled/,
    };
    for (const [value, text] of Object.entries(expectByOption)) {
      fireEvent.change(select, { target: { value } });
      await settle();
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("link", { name: "Choose what stays screen →" })).toHaveAttribute("href", "/org/billing-walkthrough?step=12");
    expect(errors).toEqual([]);
  });
});
