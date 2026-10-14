/** After a verified payment, the UI waits for the server to apply the plan. */
import { describe, expect, it, vi } from "vitest";
import { waitForPlan } from "@/components/billing/payment";
import type { BillingOverview } from "../types";

const ov = (planId: string, interval: "monthly" | "yearly", status = "active") =>
  ({ plan: { id: planId, name: planId.toUpperCase() }, interval, status, periodEnd: "2026-11-14" }) as unknown as BillingOverview;

describe("waitForPlan", () => {
  it("polls until the overview shows the paid plan and interval", async () => {
    const getBillingOverview = vi
      .fn()
      .mockResolvedValueOnce(ov("basic", "monthly", "free"))
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce(ov("growth", "monthly"))
      .mockResolvedValue(ov("growth", "yearly"));
    const res = await waitForPlan({ getBillingOverview }, "growth", "yearly", { everyMs: 1, timeoutMs: 1000 });
    expect(res).toEqual({ applied: true, periodEnd: "2026-11-14", planName: "GROWTH" });
    expect(getBillingOverview).toHaveBeenCalledTimes(4);
  });

  it("gives up after the timeout (the success page then says we're finishing setup)", async () => {
    const getBillingOverview = vi.fn().mockResolvedValue(ov("basic", "monthly", "free"));
    const res = await waitForPlan({ getBillingOverview }, "growth", "monthly", { everyMs: 5, timeoutMs: 20 });
    expect(res).toEqual({ applied: false, periodEnd: null, planName: null });
  });
});
