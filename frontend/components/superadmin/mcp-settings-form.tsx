"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import {
  getMcpSettings,
  resetMcpSettings,
  updateMcpSettings,
  type McpSettings,
  type UpdateMcpSettingsInput,
} from "@/lib/api";

type Field = {
  key: keyof UpdateMcpSettingsInput;
  label: string;
  hint: string;
  mono?: boolean;
};

const FIELDS: Field[] = [
  {
    key: "backendUrl",
    label: "Backend API URL",
    hint: "Where the MCP server calls the /ai/* endpoints.",
  },
  {
    key: "tokenExpiresIn",
    label: "Token lifetime",
    hint: "Include a unit, e.g. 90d, 12h or 30m.",
  },
  {
    key: "command",
    label: "Node command",
    hint: "Usually node. Change only for a custom runtime.",
  },
  {
    key: "tsxCli",
    label: "TSX runner path",
    hint: "Absolute path to the tsx cli.mjs in backend/node_modules.",
    mono: true,
  },
  {
    key: "serverEntry",
    label: "MCP server entry",
    hint: "Absolute path to mcp-dev-template/src/index.ts.",
    mono: true,
  },
  {
    key: "siteFile",
    label: "Design file",
    hint: "Generated templates are saved here. Blank uses the default.",
    mono: true,
  },
  {
    key: "brandKitDir",
    label: "Brand kits directory",
    hint: "Where saved brand kits live.",
    mono: true,
  },
  {
    key: "claudeConfigPath",
    label: "Claude config file",
    hint: "Shown in the setup steps on the connection card.",
    mono: true,
  },
];

const EMPTY: UpdateMcpSettingsInput = {
  command: "",
  backendUrl: "",
  tokenExpiresIn: "",
  tsxCli: "",
  serverEntry: "",
  siteFile: "",
  brandKitDir: "",
  claudeConfigPath: "",
};

function toForm(settings: McpSettings): UpdateMcpSettingsInput {
  return {
    command: settings.command,
    backendUrl: settings.backendUrl,
    tokenExpiresIn: settings.tokenExpiresIn,
    tsxCli: settings.tsxCli,
    serverEntry: settings.serverEntry,
    siteFile: settings.siteFile,
    brandKitDir: settings.brandKitDir,
    claudeConfigPath: settings.claudeConfigPath,
  };
}

export function McpSettingsForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<UpdateMcpSettingsInput>(EMPTY);
  const [settings, setSettings] = useState<McpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMcpSettings()
      .then((next) => {
        setSettings(next);
        setForm(toForm(next));
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "Could not load the MCP settings.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function setField(key: keyof UpdateMcpSettingsInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await updateMcpSettings(form);
      setSettings(next);
      setForm(toForm(next));
      toast.success("MCP settings saved");
      onSaved();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Could not save the MCP settings.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError(null);
    try {
      const next = await resetMcpSettings();
      setSettings(next);
      setForm(toForm(next));
      toast.success("MCP settings reset to defaults");
      onSaved();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Could not reset the MCP settings.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const saved = settings?.source === "database";
  const busy = loading || saving;

  let chip: { text: string; style: React.CSSProperties };
  if (loading) {
    chip = {
      text: "Loading…",
      style: {
        background: "#f1f5f9",
        color: "#475569",
        border: "1px solid #e2e8f0",
      },
    };
  } else if (error && !settings) {
    chip = {
      text: "Unavailable",
      style: {
        background: "#fef2f2",
        color: "#991b1b",
        border: "1px solid #fecaca",
      },
    };
  } else if (saved) {
    chip = {
      text: "Saved in console",
      style: {
        background: "#ecfdf5",
        color: "#065f46",
        border: "1px solid #a7f3d0",
      },
    };
  } else {
    chip = {
      text: "Auto-detected defaults",
      style: {
        background: "#eff6ff",
        color: "#1d4ed8",
        border: "1px solid #bfdbfe",
      },
    };
  }

  return (
    <div className="card reveal in" style={{ marginBottom: 24 }}>
      <div
        className="card-h"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="settings" size={20} />
          <span className="t" style={{ fontSize: 16 }}>
            Connection settings
          </span>
        </div>
        <span className="chip" style={chip.style}>
          {chip.text}
        </span>
      </div>

      <div className="card-b" style={{ display: "grid", gap: 18 }}>
        <p
          className="muted"
          style={{ fontSize: 13.5, margin: 0, lineHeight: 1.55 }}
        >
          These values are stored in the console, not in the server{" "}
          <code>.env</code>. Blank a field to fall back to the auto-detected
          default, then save and regenerate the connection below.
        </p>

        {error && (
          <div
            role="alert"
            style={{ color: "#991b1b", fontSize: 13, lineHeight: 1.5 }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          {FIELDS.map((field) => (
            <label key={field.key} style={{ display: "grid", gap: 6 }}>
              <span
                style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}
              >
                {field.label}
              </span>
              <input
                className={field.mono ? "inp inp-mono" : "inp"}
                value={form[field.key] ?? ""}
                onChange={(event) => setField(field.key, event.target.value)}
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
              />
              <span className="hint" style={{ fontSize: 11.5 }}>
                {field.hint}
              </span>
            </label>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span className="hint" style={{ fontSize: 12 }}>
            {settings?.updatedAt
              ? `Last saved ${new Date(settings.updatedAt).toLocaleString()}`
              : "No overrides yet — using defaults."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void reset()}
              disabled={busy}
            >
              Reset to defaults
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void save()}
              disabled={busy}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
