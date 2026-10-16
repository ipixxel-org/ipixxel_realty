import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { RazorpaySettings } from "@/components/superadmin/razorpay-settings";
import { BILLING_V2 } from "@/lib/billing/flag";

export const metadata: Metadata = {
  title: "Razorpay · iPixxel Realty Super Admin",
};

export default function RazorpayIntegrationPage() {
  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="billing" size={14} /> Integrations</div>
          <h1>Razorpay</h1>
          <div className="sub">
            Configure the Razorpay payment gateway for online payments without .env variables.
          </div>
        </div>
      </div>

      <RazorpaySettings />

      {/* Billing v2: invoices carry the platform's GST details, kept on the Settings page. */}
      {BILLING_V2 ? (
        <div className="card reveal in" style={{ marginBottom: 24 }}>
          <div className="card-b" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <b style={{ fontSize: 14 }}>Company &amp; tax details</b>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                Legal name, GSTIN, state and address printed on the GST invoice for every Razorpay payment.
              </div>
            </div>
            <Link href="/admin-console/settings#company-tax" className="btn btn-ghost btn-sm">
              Edit company &amp; tax details →
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
