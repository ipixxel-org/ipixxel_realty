import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { PaymentGatewaysList } from "@/components/superadmin/integrations/payment-gateways";

export const metadata: Metadata = {
  title: "Payment gateways · iPixxel Realty Super Admin",
};

export default function PaymentGatewaysPage() {
  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="billing" size={14} /> Online payments</div>
          <h1>Payment gateways</h1>
          <div className="sub">The gateways organisations can pay through. Online payments use a gateway once its keys are saved and working.</div>
        </div>
      </div>
      <PaymentGatewaysList />
    </>
  );
}
