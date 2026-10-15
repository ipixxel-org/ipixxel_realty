"use client";

import { useEffect, useState } from "react";
import {
  clearAiSettings,
  getAiSettings,
  updateAiSettings,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/components/icons";
import { formPageStyles } from "@/components/forms/form-page";
import type { AiProviderName, AiSettingsView } from "@/lib/types";

/** The API returns this in place of a stored secret; sending it back keeps it. */
const SECRET_MASK = "••••••••";

type Status = { tone: "ok" | "err"; text: string } | null;

const PROVIDERS: { value: AiProviderName | ""; label: string }[] = [
  { value: "", label: "Auto-detect (first configured)" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic Claude" },
  { value: "external", label: "Custom agent (HTTP endpoint)" },
];

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [show, setShow] = useState(false);
  const masked = value === SECRET_MASK;
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <input
        id={id}
        type={show && !masked ? "text" : "password"}
        className="inp inp-mono"
        placeholder={placeholder}
        value={value}
        // Clicking into a saved (masked) secret clears it so a new one can be typed;
        // leaving it empty on save keeps the stored value.
        onFocus={() => masked && onChange("")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="new-password"
        style={{ paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        title={masked ? "Saved secrets can't be shown" : show ? "Hide secret" : "Show secret"}
        disabled={masked || disabled}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          cursor: masked || disabled ? "default" : "pointer",
          color: "#64748b",
          padding: 4,
          display: "flex",
          opacity: masked ? 0.4 : 1,
        }}
      >
        <Icon name={show && !masked ? "eye-off" : "eye"} size={16} />
      </button>
    </div>
  );
}

export function AiSettings() {
  const { user } = useAuth();
  const canEdit = !!(user?.platformUnrestricted || user?.roleKeys?.includes("super_admin"));

  const [view, setView] = useState<AiSettingsView | null>(null);
  const [provider, setProvider] = useState<AiProviderName | "">("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [geminiThinkingBudget, setGeminiThinkingBudget] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [aiGenerateApiUrl, setAiGenerateApiUrl] = useState("");
  const [aiGenerateApiKey, setAiGenerateApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  function apply(v: AiSettingsView) {
    setView(v);
    setProvider(v.provider);
    setGeminiApiKey(v.geminiApiKey);
    setGeminiModel(v.geminiModel);
    setGeminiThinkingBudget(v.geminiThinkingBudget);
    setAnthropicApiKey(v.anthropicApiKey);
    setAnthropicModel(v.anthropicModel);
    setAiGenerateApiUrl(v.aiGenerateApiUrl);
    setAiGenerateApiKey(v.aiGenerateApiKey);
  }

  useEffect(() => {
    getAiSettings()
      .then(apply)
      .catch((e: unknown) =>
        setStatus({ tone: "err", text: e instanceof Error ? e.message : "Could not load AI settings." }),
      )
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await updateAiSettings({
        provider,
        geminiApiKey: geminiApiKey.trim() || SECRET_MASK,
        geminiModel: geminiModel.trim(),
        geminiThinkingBudget: geminiThinkingBudget.trim(),
        anthropicApiKey: anthropicApiKey.trim() || SECRET_MASK,
        anthropicModel: anthropicModel.trim(),
        aiGenerateApiUrl: aiGenerateApiUrl.trim(),
        aiGenerateApiKey: aiGenerateApiKey.trim() || SECRET_MASK,
      });
      apply(res);
      setStatus({
        tone: "ok",
        text: "AI provider credentials saved. The OpenPage AI Template builder uses them immediately — no server restart needed.",
      });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function removeSaved() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await clearAiSettings();
      apply(res);
      setStatus({
        tone: "ok",
        text: "Saved credentials removed. Falling back to the server .env values.",
      });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Could not remove credentials" });
    } finally {
      setSaving(false);
    }
  }

  const busy = loading || saving;

  let chip: { text: string; style: React.CSSProperties };
  if (loading) chip = { text: "Loading…", style: { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } };
  else if (view?.provider === "gemini" && view.hasGeminiApiKey)
    chip = { text: "Active • Gemini", style: { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" } };
  else if (view?.provider === "anthropic" && view.hasAnthropicApiKey)
    chip = { text: "Active • Claude", style: { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" } };
  else if (view?.provider === "external" && view.aiGenerateApiUrl)
    chip = { text: "Active • Custom agent", style: { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" } };
  else if (view?.hasGeminiApiKey || view?.hasAnthropicApiKey || view?.aiGenerateApiUrl)
    chip = { text: "Configured", style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" } };
  else chip = { text: "Setup Required", style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" } };

  return (
    <div className="card reveal in" style={{ marginBottom: 24 }}>
      <div className="card-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="sparkles" size={20} />
          <span className="t" style={{ fontSize: 16 }}>AI Design Agent</span>
        </div>
        <span className="chip" style={chip.style}>
          {chip.text}
        </span>
      </div>

      <div className={`card-b ${formPageStyles.page}`} style={{ display: "grid", gap: 18 }}>
        <p className="muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.55 }}>
          The agent that generates full page designs for the OpenPage AI Template builder. Add keys here instead of the
          server <code>.env</code>.
          <br />
          <strong style={{ color: "#334155" }}>
            Saved here, they apply immediately — no server restart required.
          </strong>
          {view?.source === "env" ? (
            <>
              <br />
              No keys saved yet — using the server <code>.env</code> values. Saving here overrides them.
            </>
          ) : null}
        </p>

        {!canEdit && !loading ? (
          <div className="muted" role="note" style={{ fontSize: 13 }}>
            Only a Super Admin can change AI provider credentials.
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="ai-provider" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
            <span>Active provider</span>
            <span className="hint">Which agent the builder uses</span>
          </label>
          <select
            id="ai-provider"
            className="inp"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProviderName | "")}
            disabled={busy || !canEdit}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Google Gemini */}
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", display: "grid", gap: 14 }}>
          <div style={{ fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={15} /> Google Gemini
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ai-gemini-key" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>API key</span>
              <span className="hint">{view?.hasGeminiApiKey ? "Saved — leave blank to keep" : "aistudio.google.com/apikey"}</span>
            </label>
            <SecretInput
              id="ai-gemini-key"
              value={geminiApiKey}
              onChange={setGeminiApiKey}
              placeholder="AIza…"
              disabled={busy || !canEdit}
            />
          </div>
          <div className="row2" style={{ gap: 16 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ai-gemini-model" style={{ fontWeight: 600 }}>Model</label>
              <input
                id="ai-gemini-model"
                className="inp inp-mono"
                placeholder="gemini-3.8-flash"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                disabled={busy || !canEdit}
                autoComplete="off"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ai-gemini-budget" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                <span>Thinking budget</span>
                <span className="hint">Gemini 2.5 only · 0 = fastest</span>
              </label>
              <input
                id="ai-gemini-budget"
                className="inp inp-mono"
                placeholder="0"
                value={geminiThinkingBudget}
                onChange={(e) => setGeminiThinkingBudget(e.target.value)}
                disabled={busy || !canEdit}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {/* Anthropic Claude */}
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", display: "grid", gap: 14 }}>
          <div style={{ fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={15} /> Anthropic Claude
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ai-anthropic-key" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>API key</span>
              <span className="hint">{view?.hasAnthropicApiKey ? "Saved — leave blank to keep" : "console.anthropic.com"}</span>
            </label>
            <SecretInput
              id="ai-anthropic-key"
              value={anthropicApiKey}
              onChange={setAnthropicApiKey}
              placeholder="sk-ant-…"
              disabled={busy || !canEdit}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ai-anthropic-model" style={{ fontWeight: 600 }}>Model</label>
            <input
              id="ai-anthropic-model"
              className="inp inp-mono"
              placeholder="claude-sonnet-4-20250514"
              value={anthropicModel}
              onChange={(e) => setAnthropicModel(e.target.value)}
              disabled={busy || !canEdit}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Custom agent */}
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", display: "grid", gap: 14 }}>
          <div style={{ fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="integrations" size={15} /> Custom agent (HTTP endpoint)
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ai-generate-url" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>Endpoint URL</span>
              <span className="hint">POST &#123; system, prompt &#125; → JSON design</span>
            </label>
            <input
              id="ai-generate-url"
              className="inp inp-mono"
              placeholder="https://your-agent.example.com/generate"
              value={aiGenerateApiUrl}
              onChange={(e) => setAiGenerateApiUrl(e.target.value)}
              disabled={busy || !canEdit}
              autoComplete="off"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ai-generate-key" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>Bearer token</span>
              <span className="hint">{view?.hasAiGenerateApiKey ? "Saved — leave blank to keep" : "Optional"}</span>
            </label>
            <SecretInput
              id="ai-generate-key"
              value={aiGenerateApiKey}
              onChange={setAiGenerateApiKey}
              placeholder="Optional bearer token"
              disabled={busy || !canEdit}
            />
          </div>
        </div>

        {status && (
          <div
            role="status"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: status.tone === "ok" ? "#ecfdf5" : "#fef2f2",
              color: status.tone === "ok" ? "#065f46" : "#991b1b",
              border: `1px solid ${status.tone === "ok" ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {status.text}
          </div>
        )}

        {canEdit ? (
          <div className={formPageStyles.actions}>
            {view?.source === "database" ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={removeSaved} disabled={busy} style={{ marginRight: "auto" }}>
                <Icon name="trash" size={14} /> Remove saved credentials
              </button>
            ) : null}
            <button type="button" className={formPageStyles.btnPrimary} onClick={save} disabled={busy}>
              <Icon name="check" size={16} />
              {saving ? "Saving to Database…" : "Save AI credentials"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
