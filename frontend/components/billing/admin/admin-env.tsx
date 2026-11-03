"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { billingClient } from "@/lib/billing";
import { BillingEnvProvider } from "../context";
import { useAuthOrNull } from "../limit-prompt";

/** Billing data layer for Super Admin pages; edits need admin_subscriptions:edit. */
export function AdminBillingEnv({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  return (
    <BillingEnvProvider client={billingClient} canEdit={hasPermission("admin_subscriptions", "edit")}>
      {children}
    </BillingEnvProvider>
  );
}

/**
 * What the backend's SuperAdminGuard allows on the Super Admin billing
 * screens. It picks the action from the HTTP method (GET view, POST add,
 * PUT edit, DELETE delete; package requests: approve → approve, reject →
 * delete), so each button checks the switch its request really needs:
 *  - post (Subscriptions "Add" — the "Create plan" / "Assign plan" switch):
 *    Extend grace, Mark paid offline, Apply coupon, Move to Basic, Refund,
 *    Mark resolved, New coupon, and the plan save-confirm preview
 *  - put (Subscriptions "Edit" / "Change"): save a plan, edit a coupon,
 *    Choose what stays, Mark as paid / Edit payment, a coupon on a request
 *  - del (Subscriptions "Delete" / "Reject"): delete a plan, Reject a request,
 *    Clear payment, remove a request's coupon
 *  - approve (Subscriptions "Approve"): Approve a request
 *  - settings*: Lifecycle (Expiry & Grace Policy) and Company & tax details
 *  - coupons*: the Coupons module (admin_coupons) — list / usage, New coupon
 *    (POST → add, "Create"), Edit coupon (PUT → edit)
 */
export function useAdminBillingAccess() {
  // Outside an AuthProvider (walkthroughs on the mock, isolated tests): everything, as before.
  const auth = useAuthOrNull();
  const hasPermission = auth ? auth.hasPermission : () => true;
  const sub = (a: "view" | "add" | "edit" | "delete" | "approve") => hasPermission("admin_subscriptions", a);
  const post = sub("add");
  const put = sub("edit");
  return {
    view: sub("view"),
    post,
    put,
    del: sub("delete"),
    approve: sub("approve"),
    /** Editing a plan: the confirm previews (POST) and the save is a PUT. */
    editPlan: post && put,
    couponsView: hasPermission("admin_coupons", "view"),
    couponsAdd: hasPermission("admin_coupons", "add"),
    couponsEdit: hasPermission("admin_coupons", "edit"),
    settingsView: hasPermission("admin_settings", "view"),
    settingsEdit: hasPermission("admin_settings", "edit"),
  };
}
