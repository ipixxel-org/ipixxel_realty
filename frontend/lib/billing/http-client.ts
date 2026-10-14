/**
 * Real HTTP implementations of BillingClient functions, one per backend
 * endpoint in docs/billing-ui-contract.md. Only the functions that exist on
 * the backend are here; `index.ts` decides which ones the app uses.
 */
import { apiFetch, ApiError } from "@/lib/api";
import { BillingError, type BillingClient, type BillingFunction } from "./client";

type Impl = Partial<Omit<BillingClient, "isMock" | "isReal">>;

/** API errors carry customer-facing messages — surface them as BillingError. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError || e instanceof Error) throw new BillingError(e.message);
    throw new BillingError("Something went wrong. Please try again.");
  }
}

const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });

export const httpBilling: Impl = {
  getBillingOverview: () => call("/org/billing/v2"),
  listPlans: () => call("/org/billing/plans"),
  getAccessStatus: () => call("/org/billing/access"),
  listAdminPlans: () => call("/admin/billing/plans"),
  saveAdminPlan: (plan) => call(`/admin/billing/plans/${encodeURIComponent(plan.id)}`, put(plan)),
  getLifecycleSettings: () => call("/admin/billing/lifecycle"),
  saveLifecycleSettings: (settings) => call("/admin/billing/lifecycle", put(settings)),
};

export const HTTP_FUNCTIONS = Object.keys(httpBilling) as BillingFunction[];
