"use client";

import { useState } from "react";
import Link from "next/link";
import { saveOnlinePayments } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/components/icons";
import { Switch } from "@/components/superadmin/switch";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { isUnrestrictedPlatformUser } from "@/components/superadmin/shell";
import type { IntegrationDef, IntegrationStatus } from "@/lib/integrations";

type Badge = { cls: string; text: string };

const GATEWAY_NAME: Record<string, string> = { razorpay: "Razorpay" };

/** "Active · Razorpay" / "Off" / "No gateway configured". */
export function onlinePaymentsBadge(status: IntegrationStatus | undefined, loading: boolean): Badge {
  if (loading) return { cls: "b-gray", text: "Checking…" };
  if (!status?.configured) return { cls: "b-amber", text: "No gateway configured" };
  if (status.enabled) return { cls: "b-green", text: `Active · ${GATEWAY_NAME[status.gateway ?? ""] ?? "Online"}` };
  return { cls: "b-gray", text: "Off" };
}

/**
 * Integrations → Online payments. The switch is platform_configs.online_payments_enabled
 * (PUT /admin/billing/online-payments, admin_settings edit — the module it had on
 * the lifecycle card). It can't be turned on until a gateway has usable keys;
 * once on it can always be turned off. Manage opens the payment gateways list.
 */
export function OnlinePaymentsCard({
  it,
  status,
  loading,
}: {
  it: IntegrationDef;
  status: IntegrationStatus | undefined;
  loading: boolean;
}) {
  const { user, hasPermission } = useAuth();
  // The grid's status until the switch is saved here; then the save's answer.
  const [saved, setSaved] = useState<IntegrationStatus | null>(null);
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = saved ?? status;
  const enabled = current?.enabled === true;
  const gatewayReady = current?.configured === true;
  const canEdit = isUnrestrictedPlatformUser(user) || hasPermission("admin_settings", "edit");
  const disabled = loading || busy || !canEdit || (!enabled && !gatewayReady);
  const badge = onlinePaymentsBadge(current, loading);

  async function confirm() {
    if (pending === null) return;
    setBusy(true);
    setError(null);
    try {
      const next = await saveOnlinePayments(pending);
      setSaved({
        key: "payments",
        configured: next.gateway !== null,
        active: next.paymentMode === "online",
        enabled: next.enabled,
        gateway: next.gateway,
      });
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change online payments.");
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const hint = loading
    ? null
    : !gatewayReady && !enabled
      ? "Add working keys for a payment gateway (Manage) to turn this on."
      : !gatewayReady
        ? "No gateway has working keys, so upgrades still go to Super Admin for approval."
        : !canEdit
          ? "You can't change this setting."
          : null;

  return (
    <div className="card hover reveal in">
      <div className="card-b">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <span
            className={`ic ${it.tone}`}
            style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={it.icon} size={20} />
          </span>
          <Switch
            checked={enabled}
            disabled={disabled}
            aria-label="Online payments"
            onChange={(on) => {
              setError(null);
              setPending(on);
            }}
          />
        </div>
        <h3 style={{ margin: "14px 0 4px" }}>{it.name}</h3>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {it.description}
        </div>
        {hint ? (
          <div className="hint" style={{ marginTop: 8 }}>
            {hint}
          </div>
        ) : null}
        {error ? (
          <div role="alert" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "var(--rose)" }}>
            {error}
          </div>
        ) : null}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span className={`badge ${badge.cls}`}>
            <span className="dot" style={{ background: "currentColor" }} />
            {badge.text}
          </span>
          <Link href={it.href} className="btn btn-ghost btn-sm">
            Manage
          </Link>
        </div>
      </div>
      <ConfirmModal
        open={pending !== null}
        title={pending ? "Turn on online payments?" : "Turn off online payments?"}
        message={
          pending
            ? "Organisations will pay for upgrades and renewals online through Razorpay, and the plan changes as soon as the payment is confirmed."
            : "Organisations won't be able to pay online. Upgrades will be sent to Super Admin for approval in Package Requests."
        }
        confirmLabel={pending ? "Turn on" : "Turn off"}
        destructive={pending === false}
        busy={busy}
        onConfirm={() => void confirm()}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
