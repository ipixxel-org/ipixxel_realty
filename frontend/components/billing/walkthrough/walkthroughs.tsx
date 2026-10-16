"use client";

import { Suspense } from "react";
import { ADMIN_STEP_ROUTES, ADMIN_STEPS, AdminWalkthroughData } from "./admin-steps";
import { ORG_STEP_ROUTES, ORG_STEPS } from "./org-steps";
import { Stepper } from "./stepper";

/** Presentation pages — render with or without NEXT_PUBLIC_BILLING_V2, never in the nav. */
export function CustomerWalkthrough() {
  return (
    <Suspense fallback={null}>
      <Stepper heading="How the customer sees it" steps={ORG_STEPS} routes={ORG_STEP_ROUTES} />
    </Suspense>
  );
}

export function AdminWalkthrough() {
  return (
    <AdminWalkthroughData>
      <Suspense fallback={null}>
        <Stepper heading="How Super Admin manages it" steps={ADMIN_STEPS} routes={ADMIN_STEP_ROUTES} />
      </Suspense>
    </AdminWalkthroughData>
  );
}
