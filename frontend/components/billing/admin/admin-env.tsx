"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { billingClient } from "@/lib/billing";
import { BillingEnvProvider } from "../context";

/** Billing data layer for Super Admin pages; edits need admin_subscriptions:edit. */
export function AdminBillingEnv({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  return (
    <BillingEnvProvider client={billingClient} canEdit={hasPermission("admin_subscriptions", "edit")}>
      {children}
    </BillingEnvProvider>
  );
}
