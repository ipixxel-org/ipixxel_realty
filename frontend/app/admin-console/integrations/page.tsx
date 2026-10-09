import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { IntegrationsGrid } from "@/components/superadmin/integrations/integrations-grid";

export const metadata: Metadata = {
  title: "Integrations · iPixxel Realty Super Admin",
};

export default function SuperAdminIntegrationsPage() {
  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="integrations" size={14} /> System</div>
          <h1>Integrations</h1>
          <div className="sub">Connect the third-party services that power email, sign-in and payments.</div>
        </div>
      </div>
      <IntegrationsGrid />
    </>
  );
}
