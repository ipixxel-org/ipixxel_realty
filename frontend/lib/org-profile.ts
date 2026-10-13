// Option lists for the organisation profile ("General" details), shared by
// the Org Admin settings page and the Super Admin organisation-detail edit
// form so both screens edit the same fields with the same choices.

import type { OrgIndustry } from "./types";

// Matches the registration wizard's ORG_TYPES exactly (Organisation.industry
// enum) — the wizard's "What describes you best?" step and these dropdowns
// edit the same field, so the option set has to stay in sync.
// `short` matches the signup cards and is used for list columns, filters and
// change history. "mixed" is shown as "Others" — the stored value is unchanged.
export const INDUSTRY_OPTIONS: { value: OrgIndustry; label: string; short: string }[] = [
  { value: "developer", label: "Real Estate — Developer", short: "Developer" },
  { value: "broker", label: "Real Estate — Broker / Agency", short: "Broker / Agency" },
  { value: "channel", label: "Channel Partner", short: "Channel Partner" },
  { value: "mixed", label: "Others", short: "Others" },
];

export function industryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return INDUSTRY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function industryShortLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return INDUSTRY_OPTIONS.find((o) => o.value === value)?.short ?? value;
}

// Logo / favicon upload rules — mirror the backend's FIELD_RULES (storage.types
// `logo` / `favicon`) so the forms can tell users the limits up front and
// reject an oversized file before uploading. The server still enforces them.
export const ORG_ASSET_RULES = {
  logo: {
    accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
    maxBytes: 2 * 1024 * 1024,
    hint: "PNG, JPG, WebP or SVG · max 2 MB · recommended 512 × 512 px (square, transparent background)",
  },
  favicon: {
    accept: "image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico",
    maxBytes: 512 * 1024,
    hint: "PNG, ICO or SVG · max 512 KB · recommended 64 × 64 px (square)",
  },
} as const;

export function orgAssetTooLarge(kind: "logo" | "favicon", file: File): string | null {
  const rule = ORG_ASSET_RULES[kind];
  if (file.size <= rule.maxBytes) return null;
  const limit = kind === "logo" ? "2 MB" : "512 KB";
  return `That ${kind} is too large — the limit is ${limit}.`;
}

// Fired after the org's logo/favicon are saved so the org portal shell
// (sidebar logo + browser-tab icon) updates without a reload.
export const ORG_BRANDING_CHANGE_EVENT = "ipixxel_org_branding_changed";
export type OrgBrandingChangeDetail = { logoUrl: string | null; faviconUrl: string | null };

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
