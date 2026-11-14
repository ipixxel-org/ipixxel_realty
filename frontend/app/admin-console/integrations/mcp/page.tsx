import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { McpConnectionPanel } from "@/components/superadmin/mcp-connection";

export const metadata: Metadata = {
  title: "MCP for Claude · iPixxel Realty Super Admin",
};

export default function McpIntegrationPage() {
  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow">
            <Icon name="sparkles" size={14} /> Integrations
          </div>
          <h1>MCP for Claude</h1>
          <div className="sub">
            Connect Claude Desktop to the OpenPage builder through the Model Context Protocol. The
            generated config uses this machine’s backend and a token for your account.
          </div>
        </div>
      </div>
      <McpConnectionPanel />
    </>
  );
}
