"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getIntegrationsStatus } from "@/lib/api";
import { Icon } from "@/components/icons";
import { isUnrestrictedPlatformUser } from "@/components/superadmin/shell";
import {
  INTEGRATIONS,
  type IntegrationDef,
  type IntegrationKey,
  type IntegrationStatus,
} from "@/lib/integrations";

type Badge = { cls: string; text: string };

function statusBadge(
  it: IntegrationDef,
  status: IntegrationStatus | undefined,
  loading: boolean,
): Badge {
  if (it.comingSoon) return { cls: "b-gray", text: "Coming soon" };
  if (loading) return { cls: "b-gray", text: "Checking…" };
  if (status?.active) return { cls: "b-green", text: "Active • Configured" };
  if (status?.configured) return { cls: "b-amber", text: "Configured • Inactive" };
  return { cls: "b-amber", text: "Not configured" };
}

export function IntegrationsGrid() {
  const { user, hasPermission } = useAuth();
  const [statuses, setStatuses] = useState<Partial<Record<IntegrationKey, IntegrationStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIntegrationsStatus()
      .then((rows) => {
        if (cancelled) return;
        setStatuses(Object.fromEntries(rows.map((r) => [r.key, r])));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load integration status.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unrestricted = isUnrestrictedPlatformUser(user);
  const visible = INTEGRATIONS.filter(
    (it) => it.comingSoon || unrestricted || hasPermission(it.permission, "view"),
  );

  return (
    <>
      {error && (
        <div className="sub muted" role="status" style={{ marginBottom: 16, color: "#991b1b" }}>
          {error}
        </div>
      )}
      <div className="grid g3" style={{ marginBottom: 28 }}>
        {visible.map((it) => {
          const badge = statusBadge(it, statuses[it.key], loading && it.statusSource === "api");
          return (
            <div key={it.key} className="card hover reveal in">
              <div className="card-b">
                <span
                  className={`ic ${it.tone}`}
                  style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name={it.icon} size={20} />
                </span>
                <h3 style={{ margin: "14px 0 4px" }}>{it.name}</h3>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {it.description}
                </div>
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span className={`badge ${badge.cls}`}>
                    <span className="dot" style={{ background: "currentColor" }} />
                    {badge.text}
                  </span>
                  {it.comingSoon ? (
                    <button type="button" className="btn btn-ghost btn-sm" disabled>
                      Manage
                    </button>
                  ) : (
                    <Link href={it.href} className="btn btn-ghost btn-sm">
                      Manage
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
