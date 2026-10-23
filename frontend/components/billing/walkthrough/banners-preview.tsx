"use client";

import Link from "next/link";
import { useState } from "react";
import type { MockState } from "@/lib/billing/mock/state";
import { BillingBanner, RenewalReminderPopup } from "../banners";
import { useOrgBilling } from "../context";
import { AppFrame, PreviewTag, Sandbox } from "./stepper";

const SITUATIONS: { id: string; label: string; state: Partial<MockState>; popup?: boolean }[] = [
  { id: "renewal-a", label: "Renewal in 3 days — Option A: Auto-renew", state: { situation: "renewal_3d", renewalMode: "auto" } },
  { id: "renewal-b", label: "Renewal in 3 days — Option B: Pay each time", state: { situation: "renewal_3d", renewalMode: "manual" }, popup: true },
  { id: "payment-due", label: "Payment due (7 days left)", state: { situation: "payment_due" } },
  { id: "grace-ends", label: "Grace ends tomorrow", state: { situation: "grace_ends_tomorrow" } },
  { id: "moved", label: "Moved to Basic", state: { situation: "moved_to_basic" } },
  { id: "basic", label: "Change to Basic scheduled", state: { situation: "cancellation_scheduled" } },
  { id: "downgrade", label: "Change to a smaller plan scheduled", state: { situation: "downgrade_scheduled", downgradeTargetId: "growth" } },
];

function Shown({ popup }: { popup?: boolean }) {
  const { overview } = useOrgBilling();
  if (!overview) return null;
  return (
    <>
      <BillingBanner overview={overview} />
      {popup ? <RenewalReminderPopup overview={overview} alwaysOpen /> : null}
    </>
  );
}

/** One dropdown, one banner/popup — exactly as the customer sees it. */
export function BannersPreview() {
  const [id, setId] = useState(SITUATIONS[0].id);
  const s = SITUATIONS.find((x) => x.id === id)!;
  return (
    <div className="bw-stage">
      <header className="bw-head">
        <div className="bw-head-title">
          <b>Billing banners & popups</b>
          <PreviewTag />
        </div>
        <Link href="/org/billing-walkthrough?step=12" className="btn btn-ghost btn-sm">
          Choose what stays screen →
        </Link>
      </header>
      <main className="bw-main">
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="bw-situation">Situation</label>
          <select id="bw-situation" className="inp" value={id} onChange={(e) => setId(e.target.value)}>
            {SITUATIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
        <AppFrame url="/org/projects" minHeight={s.popup ? 420 : 160}>
          <Sandbox key={id} initial={{ paidPlanId: "pro", ...s.state }} stay>
            <Shown popup={s.popup} />
          </Sandbox>
        </AppFrame>
      </main>
    </div>
  );
}
