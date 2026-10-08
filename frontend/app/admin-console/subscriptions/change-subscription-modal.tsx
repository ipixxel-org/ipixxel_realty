"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Field,
  FormActions,
  FormAlert,
  FormGrid,
  FormModal,
  SelectInput,
} from "@/components/forms/form-page";
import type { Plan, Subscription } from "@/lib/types";

// Upgrade / change subscription — popup on the Subscriptions studio (was the
// /subscriptions/[id]/change page, which now redirects here). Same two
// fields and the same PATCH.

export function ChangeSubscriptionModal({
  sub,
  plans,
  onClose,
  onChanged,
}: {
  sub: Subscription;
  plans: Plan[];
  onClose: () => void;
  onChanged: (updated: Subscription, cycle: "monthly" | "yearly") => void;
}) {
  const [planId, setPlanId] = useState<string>(sub.planId);
  const [cycle, setCycle] = useState<"monthly" | "yearly">(sub.billingCycle);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirmUpgrade() {
    if (saving) return;
    if (!planId) {
      setError("Select a plan");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<Subscription>(`/admin/subscriptions/${encodeURIComponent(sub.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ planId, billingCycle: cycle }),
      });
      onChanged(updated, cycle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
      setSaving(false);
    }
  }

  return (
    <FormModal
      open
      onClose={onClose}
      title="Upgrade / change subscription"
      description={`Change subscription for ${sub.organisation?.name ?? "this organisation"}.`}
      busy={saving}
      size="lg"
      onSubmit={() => void confirmUpgrade()}
    >
      <FormAlert message={error} />
      <FormGrid>
        <Field htmlFor="ch-plan" label="Select plan" icon="billing">
          <SelectInput id="ch-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — ₹{p.priceMonthly}/mo / ₹{p.priceYearly}/yr
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field htmlFor="ch-cycle" label="Billing cycle" icon="calendar">
          <SelectInput
            id="ch-cycle"
            value={cycle}
            onChange={(e) => setCycle(e.target.value as "monthly" | "yearly")}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </SelectInput>
        </Field>
      </FormGrid>
      <FormActions onCancel={onClose} busy={saving} busyLabel="Saving…" submitLabel="Confirm change" />
    </FormModal>
  );
}
