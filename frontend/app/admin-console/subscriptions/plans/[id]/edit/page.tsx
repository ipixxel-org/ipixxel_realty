"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { AdminEditPlanPage } from "@/components/billing/admin/admin-pages";
import { BILLING_V2 } from "@/lib/billing/flag";
import { PlanForm } from "../../../plan-form";
import { SUBS_PATH } from "../../../subscriptions-shared";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="form-alert">
      {children} <Link href={SUBS_PATH}>Back to Plans &amp; Subscriptions</Link>
    </div>
  );
}

export default function EditPlanPage() {
  const params = useParams<{ id: string }>();
  // Billing v2 (NEXT_PUBLIC_BILLING_V2): the v2 plan form (prices, free plan, limits, features).
  if (BILLING_V2) return params?.id ? <AdminEditPlanPage planId={params.id} /> : null;
  return <LegacyEditPlanPage id={params?.id} />;
}

function LegacyEditPlanPage({ id }: { id: string | undefined }) {
  const { isLoading, hasPermission } = useAuth();
  const canEdit = hasPermission("admin_subscriptions", "edit");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || isLoading || !canEdit) return;
    let cancelled = false;
    apiFetch<Plan>(`/admin/plans/${encodeURIComponent(id)}`)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load plan");
      });
    return () => {
      cancelled = true;
    };
  }, [id, isLoading, canEdit]);

  if (isLoading) return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
  if (!canEdit) return <Notice>You don&apos;t have permission to edit plans.</Notice>;
  if (error) return <Notice>{error}</Notice>;
  if (!plan) return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
  return <PlanForm key={plan.id} plan={plan} />;
}
