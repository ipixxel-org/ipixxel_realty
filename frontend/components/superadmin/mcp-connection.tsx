"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { getMcpConnection, type McpConnection } from "@/lib/api";
import { McpSettingsForm } from "./mcp-settings-form";

const mono: CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
};

function formatExpiry(iso: string | null): string {
  if (!iso) return "No expiry";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskToken(token: string): string {
  if (token.length <= 18) return "•".repeat(token.length);
  return `${token.slice(0, 10)}…${token.slice(-8)}`;
}

export function McpConnectionPanel() {
  const [conn, setConn] = useState<McpConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    getMcpConnection()
      .then(setConn)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load the MCP connection."),
      )
      .finally(() => setLoading(false));
  }, []);

  async function regenerate() {
    setLoading(true);
    setError(null);
    try {
      setConn(await getMcpConnection());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load the MCP connection.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  }

  function downloadConfig() {
    if (!conn) return;
    const blob = new Blob([JSON.stringify(conn.config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "claude_desktop_config.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const configText = conn ? JSON.stringify(conn.config, null, 2) : "";

  let chip: { text: string; style: CSSProperties };
  if (loading) {
    chip = { text: "Generating…", style: { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } };
  } else if (error) {
    chip = { text: "Unavailable", style: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" } };
  } else {
    chip = { text: "Ready", style: { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" } };
  }

  return (
    <>
      <McpSettingsForm onSaved={() => void regenerate()} />
      <div className="card reveal in" style={{ marginBottom: 24 }}>
        <div
          className="card-h"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="sparkles" size={20} />
          <span className="t" style={{ fontSize: 16 }}>
            OpenPage MCP server
          </span>
        </div>
        <span className="chip" style={chip.style}>
          {chip.text}
        </span>
      </div>

      <div className="card-b" style={{ display: "grid", gap: 20 }}>
        <p className="muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.55 }}>
          This config lets Claude Desktop (or Cursor, or any MCP client) call the same AI design tools the
          builder uses: generate a complete template, inspect the brand kit, regenerate copy, insert
          blocks and update page SEO. Generated templates are saved to the design file below, so Claude
          can keep editing them. The token is issued for your Super Admin account and is valid until{" "}
          <strong style={{ color: "#334155" }}>{conn ? formatExpiry(conn.expiresAt) : "it expires"}</strong>.
        </p>

        {error && (
          <div role="alert" style={{ display: "grid", gap: 10, color: "#991b1b", fontSize: 13 }}>
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => void regenerate()}>
              Try again
            </button>
          </div>
        )}

        {loading && !conn && <div className="muted" style={{ fontSize: 13 }}>Building the connection…</div>}

        {conn && (
          <>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "14px 16px",
                display: "grid",
                gap: 8,
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>Setup</div>
              <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                <li>Install Claude Desktop and open its config file.</li>
                <li>Merge the JSON below into it (keep any other servers you already have).</li>
                <li>Restart Claude Desktop, then ask it to “list the OpenPage design tools”.</li>
              </ol>
              <div className="hint" style={{ fontSize: 12, marginTop: 2 }}>
                Try: “Generate a modern 3BHK villa landing page” — Claude calls{" "}
                <code style={mono}>generate_ai_template</code> and saves it to{" "}
                <code style={mono}>{conn.paths.siteFile}</code>.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span className="hint" style={{ fontSize: 12 }}>
                  Config file
                </span>
                <code style={{ ...mono, fontSize: 12, color: "#334155", wordBreak: "break-all" }}>
                  {conn.claudeConfigPath}
                </code>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void copy(conn.claudeConfigPath, "Config path")}
                >
                  Copy path
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>Claude Desktop config</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void copy(configText, "MCP config")}
                  >
                    <Icon name="copy" size={14} /> Copy JSON
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={downloadConfig}>
                    <Icon name="download" size={14} /> Download
                  </button>
                </div>
              </div>
              <pre
                style={{
                  ...mono,
                  margin: 0,
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "#0f172a",
                  color: "#e2e8f0",
                  fontSize: 12,
                  lineHeight: 1.6,
                  overflowX: "auto",
                }}
              >
                {configText}
              </pre>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "14px 16px",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>Access token</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowToken((v) => !v)}>
                    <Icon name={showToken ? "eye-off" : "eye"} size={14} />
                    {showToken ? "Hide" : "Reveal"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void copy(conn.token, "Token")}
                  >
                    <Icon name="copy" size={14} /> Copy token
                  </button>
                </div>
              </div>
              <code
                style={{
                  ...mono,
                  fontSize: 12,
                  color: "#334155",
                  wordBreak: "break-all",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {showToken ? conn.token : maskToken(conn.token)}
              </code>
              <div className="hint" style={{ fontSize: 12 }}>
                Treat this like a password. Anyone with it can edit OpenPage designs as you.
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "14px 16px",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>Server paths</div>
              {[
                { label: "MCP runtime", value: conn.paths.tsxCli },
                { label: "Server entry", value: conn.paths.entry },
                { label: "API base URL", value: conn.paths.apiBaseUrl },
                { label: "Design file", value: conn.paths.siteFile },
                { label: "Brand kits", value: conn.paths.brandKitDir },
              ].map((row) => (
                <div key={row.label} style={{ display: "grid", gap: 3 }}>
                  <span className="hint" style={{ fontSize: 12 }}>
                    {row.label}
                  </span>
                  <code style={{ ...mono, fontSize: 12, color: "#334155", wordBreak: "break-all" }}>
                    {row.value}
                  </code>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="hint" style={{ fontSize: 12 }}>
                Regenerate to issue a fresh token. Previous tokens remain valid until they expire.
              </span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void regenerate()}>
                {loading ? "Regenerating…" : "Regenerate token"}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </>
  );
}
