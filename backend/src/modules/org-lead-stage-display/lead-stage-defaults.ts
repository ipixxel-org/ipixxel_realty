import { LeadStatus } from '@prisma/client';

/**
 * The fixed pipeline stages, in canonical order. This mirrors the `LeadStatus`
 * enum — it is NOT configurable. Only the label/colour shown for each stage
 * can be overridden per org (see OrgLeadStageDisplay).
 */
export const LEAD_STAGE_ORDER: LeadStatus[] = [
  LeadStatus.new,
  LeadStatus.contacted,
  LeadStatus.follow_up,
  LeadStatus.site_visit,
  LeadStatus.negotiation,
  LeadStatus.won,
  LeadStatus.lost,
];

export interface LeadStageDisplayDefault {
  label: string;
  color: string;
}

/**
 * Built-in label + badge colour for every stage. An org row in
 * org_lead_stage_displays overrides these; a stage with no row uses this.
 * Colours match the swatches the Settings UI has always shown for these stages.
 */
export const DEFAULT_LEAD_STAGE_DISPLAY: Record<
  LeadStatus,
  LeadStageDisplayDefault
> = {
  new: { label: 'New', color: '#94a3b8' },
  contacted: { label: 'Contacted', color: '#0ea5e9' },
  connected: { label: 'Connected', color: '#06b6d4' },
  follow_up: { label: 'Follow-up', color: '#f59e0b' },
  interested: { label: 'Interested', color: '#8b5cf6' },
  not_interested: { label: 'Not Interested', color: '#64748b' },
  converted: { label: 'Converted', color: '#15803d' },
  site_visit: { label: 'Site Visit', color: '#6366f1' },
  negotiation: { label: 'Negotiation', color: '#7c3aed' },
  won: { label: 'Won', color: '#16a34a' },
  lost: { label: 'Lost', color: '#e11d48' },
};

export interface LeadStageDisplay {
  status: LeadStatus;
  label: string;
  color: string;
  /** True when the org has changed this stage away from its default. */
  customized: boolean;
}

/** One override row, or `null` when the org hasn't touched this stage. */
export type StageOverride = { label: string; color: string } | null;

export function mergeStageDisplay(
  status: LeadStatus,
  override: StageOverride,
): LeadStageDisplay {
  const fallback = DEFAULT_LEAD_STAGE_DISPLAY[status];
  const label = override?.label ?? fallback.label;
  const color = override?.color ?? fallback.color;
  return {
    status,
    label,
    color,
    customized: label !== fallback.label || color !== fallback.color,
  };
}
