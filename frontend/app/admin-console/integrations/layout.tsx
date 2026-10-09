import type { ReactNode } from "react";
import { IntegrationsCrumbs } from "@/components/superadmin/integrations/integrations-crumbs";

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <IntegrationsCrumbs />
      {children}
    </>
  );
}
