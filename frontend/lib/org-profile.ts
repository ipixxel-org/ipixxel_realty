// Option lists for the organisation profile ("General" details), shared by
// the Org Admin settings page and the Super Admin organisation-detail edit
// form so both screens edit the same fields with the same choices.

import type { OrgIndustry } from "./types";

// Matches the registration wizard's ORG_TYPES exactly (Organisation.industry
// enum) — the wizard's "What describes you best?" step and these dropdowns
// edit the same field, so the option set has to stay in sync.
export const INDUSTRY_OPTIONS: { value: OrgIndustry; label: string }[] = [
  { value: "developer", label: "Real Estate — Developer" },
  { value: "broker", label: "Real Estate — Broker / Agency" },
  { value: "channel", label: "Channel Partner" },
  { value: "mixed", label: "Mixed" },
];

export function industryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return INDUSTRY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const ORG_COLOR_PRESETS = [
  { hex: "#0f1424", label: "Sapphire Navy" },
  { hex: "#2563eb", label: "Royal Blue" },
  { hex: "#059669", label: "Emerald Green" },
  { hex: "#0d9488", label: "Modern Teal" },
  { hex: "#4f46e5", label: "Indigo" },
  { hex: "#7c3aed", label: "Royal Purple" },
  { hex: "#e11d48", label: "Crimson Rose" },
  { hex: "#d97706", label: "Amber Gold" },
];
