import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { RazorpaySettings } from "@/components/superadmin/razorpay-settings";

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
    </>
  );
}
