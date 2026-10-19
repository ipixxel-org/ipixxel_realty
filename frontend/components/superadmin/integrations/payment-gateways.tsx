"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRazorpaySettings } from "@/lib/api";
import { RAZORPAY_SETTINGS_HREF } from "@/lib/integrations";
import type { RazorpaySettingsView } from "@/lib/types";

/**
 * Integrations → Online payments → Payment gateways. One row per gateway;
 * Razorpay is the only one today. Edit opens that gateway's settings form.
 */
export function PaymentGatewaysList() {
  const [razorpay, setRazorpay] = useState<RazorpaySettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRazorpaySettings()
      .then((v) => {
        if (!cancelled) setRazorpay(v);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the payment gateways.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mode = razorpay?.mode === "live" ? "Live" : razorpay?.mode === "test" ? "Test" : "—";

  return (
    <div className="card reveal in" style={{ marginBottom: 24 }}>
      <div className="card-b" style={{ padding: 0 }}>
        {error ? (
          <div className="sub muted" role="status" style={{ padding: 16, color: "#991b1b" }}>
            {error}
          </div>
        ) : null}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Gateway</th>
                <th>Mode</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Razorpay</td>
                <td>{razorpay ? mode : "…"}</td>
                <td>
                  {razorpay ? (
                    <span className={`badge ${razorpay.configured ? "b-green" : "b-amber"}`}>
                      <span className="dot" style={{ background: "currentColor" }} />
                      {razorpay.configured ? "Configured" : "Not configured"}
                    </span>
                  ) : error ? (
                    "—"
                  ) : (
                    "Checking…"
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link href={RAZORPAY_SETTINGS_HREF} className="btn btn-ghost btn-sm">
                    Edit
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
