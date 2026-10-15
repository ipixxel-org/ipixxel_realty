import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { AiSettings } from "@/components/superadmin/ai-settings";

export const metadata: Metadata = {
  title: "AI Design Agent · iPixxel Realty Super Admin",
};

export default function AiIntegrationPage() {
  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="sparkles" size={14} /> Integrations</div>
          <h1>AI Design Agent</h1>
          <div className="sub">
            Provide the API keys for the OpenPage AI Template builder without .env variables.
          </div>
        </div>
      </div>

      <AiSettings />
    </>
  );
}
