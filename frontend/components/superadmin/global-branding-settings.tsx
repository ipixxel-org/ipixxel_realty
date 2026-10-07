"use client";

import { useEffect, useState, useTransition } from "react";
import { getPlatformConfig, updatePlatformConfig } from "@/lib/api";
import { useGlobalTheme, applyThemeVariables } from "@/components/global-theme-provider";
import { Icon } from "@/components/icons";
import { formPageStyles } from "@/components/forms/form-page";
import type { PlatformConfig } from "@/lib/types";

const COLOR_PRESETS = [
  {
    name: "Platform Navy",
    primary: "#0f1424",
    secondary: "#2a3348",
    description: "Classic authoritative enterprise theme",
  },
  {
    name: "Modern Indigo",
    primary: "#4f46e5",
    secondary: "#06b6d4",
    description: "Vibrant high-tech SaaS gradient",
  },
  {
    name: "Luxury Slate & Gold",
    primary: "#0f172a",
    secondary: "#cda45e",
    description: "Premium high-end real estate aesthetic",
  },
  {
    name: "Emerald & Teal",
    primary: "#059669",
    secondary: "#0d9488",
    description: "Eco-friendly, modern organic architecture",
  },
  {
    name: "Royal Violet",
    primary: "#6d28d9",
    secondary: "#ec4899",
    description: "Creative, bold digital-first brand",
  },
  {
    name: "Deep Ocean",
    primary: "#0369a1",
    secondary: "#0284c7",
    description: "Clean maritime and waterfront properties",
  },
  {
    name: "Crimson & Obsidian",
    primary: "#991b1b",
    secondary: "#334155",
    description: "Prestigious, energetic signature design",
  },
];

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHex(val: string): string {
  let cleaned = val.trim();
  if (!cleaned.startsWith("#")) cleaned = `#${cleaned}`;
  return cleaned;
}

export function GlobalBrandingSettings() {
  const { primaryColor: currentGlobalPrimary, secondaryColor: currentGlobalSecondary, setGlobalTheme } = useGlobalTheme();
  const [primary, setPrimary] = useState(currentGlobalPrimary || "#0f1424");
  const [secondary, setSecondary] = useState(currentGlobalSecondary || "#2a3348");
  const [savedPrimary, setSavedPrimary] = useState(primary);
  const [savedSecondary, setSavedSecondary] = useState(secondary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    getPlatformConfig()
      .then((cfg: PlatformConfig) => {
        const prim = cfg.primaryColor || "#0f1424";
        const sec = cfg.secondaryColor || "#2a3348";
        setPrimary(prim);
        setSecondary(sec);
        setSavedPrimary(prim);
        setSavedSecondary(sec);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  // Live test on the current page while tweaking colors
  function handlePrimaryChange(val: string) {
    setPrimary(val);
    if (HEX_REGEX.test(normalizeHex(val))) {
      startTransition(() => {
        applyThemeVariables(normalizeHex(val), secondary);
      });
    }
  }

  function handleSecondaryChange(val: string) {
    setSecondary(val);
    if (HEX_REGEX.test(normalizeHex(val))) {
      startTransition(() => {
        applyThemeVariables(primary, normalizeHex(val));
      });
    }
  }

  function applyPreset(p: string, s: string) {
    setPrimary(p);
    setSecondary(s);
    startTransition(() => {
      applyThemeVariables(p, s);
    });
  }

  async function handleSave() {
    const prim = normalizeHex(primary);
    const sec = normalizeHex(secondary);

    if (!HEX_REGEX.test(prim)) {
      setStatus({ tone: "err", text: "Primary color must be a valid 3 or 6 digit hex code (e.g. #0f1424)" });
      return;
    }
    if (!HEX_REGEX.test(sec)) {
      setStatus({ tone: "err", text: "Secondary color must be a valid 3 or 6 digit hex code (e.g. #2a3348)" });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      await updatePlatformConfig({
        primaryColor: prim,
        secondaryColor: sec,
      });

      setSavedPrimary(prim);
      setSavedSecondary(sec);
      setGlobalTheme({ primaryColor: prim, secondaryColor: sec });
      setStatus({ tone: "ok", text: "Global primary & secondary colors updated and applied platform-wide!" });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Failed saving global colors" });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    applyPreset(savedPrimary, savedSecondary);
    setStatus(null);
  }

  const isDirty = primary !== savedPrimary || secondary !== savedSecondary;

  return (
    <div className="card reveal in" style={{ marginBottom: 28 }}>
      <div className="card-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${primary}, ${secondary})`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          />
          <span className="t">Global Theme Colors</span>
        </div>
        <span
          className="chip"
          style={{
            background: "var(--green-050)",
            color: "var(--green)",
            border: "1px solid var(--green-100)",
          }}
        >
          {loading ? "Loading…" : "Super Admin Controlled"}
        </span>
      </div>

      <div className={`card-b ${formPageStyles.page}`} style={{ display: "grid", gap: 24 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          Set the global <strong>Primary</strong> and <strong>Secondary</strong> brand colors for the entire platform.
          These variables automatically power buttons, headers, navigation highlights, badges, and gradients across the
          Super Admin Console, Organisation Portals, Authentication wizards, and Public Landing Pages.
        </div>

        {/* Color pickers */}
        <div className="row2" style={{ gap: 20 }}>
          {/* Primary Color */}
          <div
            style={{
              padding: 16,
              borderRadius: "var(--r)",
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <b style={{ fontSize: 14 }}>Primary Color</b>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Main brand color (buttons, active states, key UI elements)
                </div>
              </div>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: primary,
                  border: "2px solid #fff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="color"
                value={HEX_REGEX.test(primary) ? primary : "#0f1424"}
                onChange={(e) => handlePrimaryChange(e.target.value)}
                style={{
                  width: 44,
                  height: 38,
                  padding: 2,
                  borderRadius: 8,
                  border: "1px solid var(--line-2)",
                  cursor: "pointer",
                  background: "transparent",
                }}
                title="Choose Primary Color"
              />
              <input
                className="inp"
                value={primary}
                onChange={(e) => handlePrimaryChange(e.target.value)}
                placeholder="#0f1424"
                style={{ fontFamily: "monospace", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}
              />
            </div>
          </div>

          {/* Secondary Color */}
          <div
            style={{
              padding: 16,
              borderRadius: "var(--r)",
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <b style={{ fontSize: 14 }}>Secondary Color</b>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Accent color (secondary highlights, badges, gradient end)
                </div>
              </div>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: secondary,
                  border: "2px solid #fff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="color"
                value={HEX_REGEX.test(secondary) ? secondary : "#2a3348"}
                onChange={(e) => handleSecondaryChange(e.target.value)}
                style={{
                  width: 44,
                  height: 38,
                  padding: 2,
                  borderRadius: 8,
                  border: "1px solid var(--line-2)",
                  cursor: "pointer",
                  background: "transparent",
                }}
                title="Choose Secondary Color"
              />
              <input
                className="inp"
                value={secondary}
                onChange={(e) => handleSecondaryChange(e.target.value)}
                placeholder="#2a3348"
                style={{ fontFamily: "monospace", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}
              />
            </div>
          </div>
        </div>

        {/* Preset Palettes */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
            Curated Presets
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {COLOR_PRESETS.map((preset) => {
              const active = primary.toLowerCase() === preset.primary.toLowerCase() && secondary.toLowerCase() === preset.secondary.toLowerCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset.primary, preset.secondary)}
                  style={{
                    background: active ? "var(--surface)" : "var(--surface-2)",
                    border: active ? "2px solid var(--brand, #0f1424)" : "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.secondary} 50%)`,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {preset.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>
                      {preset.primary} · {preset.secondary}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Interactive Preview Box */}
        <div
          style={{
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              padding: "12px 18px",
              background: `linear-gradient(135deg, ${primary}, ${secondary})`,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", opacity: 0.8 }} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.4px" }}>
                Live Component Preview
              </span>
            </div>
            <span style={{ fontSize: 11.5, opacity: 0.85, fontFamily: "monospace" }}>
              Primary: {primary} | Secondary: {secondary}
            </span>
          </div>

          <div style={{ padding: "18px 20px", display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                className="btn"
                style={{
                  background: primary,
                  color: "#fff",
                  boxShadow: `0 4px 14px -3px ${primary}88`,
                }}
              >
                Primary Button
              </button>

              <button
                type="button"
                className="btn"
                style={{
                  background: secondary,
                  color: "#fff",
                  boxShadow: `0 4px 14px -3px ${secondary}88`,
                }}
              >
                Secondary Button
              </button>

              <button
                type="button"
                className="btn"
                style={{
                  background: "transparent",
                  color: primary,
                  border: `1px solid ${primary}`,
                }}
              >
                Outlined Primary
              </button>

              <button
                type="button"
                className="btn"
                style={{
                  background: "transparent",
                  color: secondary,
                  border: `1px solid ${secondary}`,
                }}
              >
                Outlined Secondary
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: `${primary}18`,
                  color: primary,
                  border: `1px solid ${primary}33`,
                }}
              >
                Primary Pill
              </span>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: `${secondary}18`,
                  color: secondary,
                  border: `1px solid ${secondary}33`,
                }}
              >
                Secondary Accent Pill
              </span>
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                  color: "#fff",
                }}
              >
                Gradient Badge
              </span>
            </div>
          </div>
        </div>

        {/* Status message */}
        {status && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: status.tone === "ok" ? "var(--green-050)" : "var(--rose-050)",
              color: status.tone === "ok" ? "var(--green)" : "var(--rose)",
              border: `1px solid ${status.tone === "ok" ? "var(--green-100)" : "var(--rose)"}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name={status.tone === "ok" ? "check" : "alert"} size={16} />
            {status.text}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            className={formPageStyles.btn}
            onClick={handleReset}
            disabled={saving || !isDirty}
          >
            Discard tweaks
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isDirty && (
              <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              className={formPageStyles.btnPrimary}
              onClick={handleSave}
              disabled={saving}
              style={{ background: primary }}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  <Icon name="check" size={14} />
                  Save Colors
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
