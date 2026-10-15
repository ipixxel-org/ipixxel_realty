/**
 * Higher-level building blocks for the MCP server:
 *
 *  - a catalogue of ready-made sections (a snapshot of the frontend
 *    `SECTION_PRESETS` catalogue) that an agent can drop into a page,
 *  - curated full-page starter templates composed from those sections,
 *  - reusable "brand kits" (theme + typography bundles) persisted as JSON so a
 *    palette/type system can be captured once and re-applied across pages.
 *
 * All functions are pure over plain objects except the brand-kit store, which
 * reads/writes JSON files under the brand-kit directory.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_THEME,
  type TemplateTypography,
  type ThemeTokens,
  defaultTypography,
  findThemePreset,
  normalizeDesignSystem,
  normalizeTheme,
} from "./design-tokens.js";
import {
  SECTION_PRESETS,
  SECTION_PRESET_CATEGORIES,
  type SectionPreset,
  type SectionPresetCategory,
} from "./section-presets.generated.js";
import {
  BLOCK_METADATA,
  type BlockMetaSnapshot,
} from "./block-catalog.generated.js";
import type { BlockConfig, SiteConfig } from "./site.js";

export {
  SECTION_PRESETS,
  SECTION_PRESET_CATEGORIES,
  type SectionPreset,
  type SectionPresetCategory,
  BLOCK_METADATA,
  type BlockMetaSnapshot,
};

// ---------------------------------------------------------------------------
// Section library
// ---------------------------------------------------------------------------

/** Stable-ish unique block id, matching the builder's `block-<type>-<base36>`. */
export function newBlockId(type: string): string {
  return `block-${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export interface SectionSummary {
  id: string;
  category: SectionPresetCategory;
  name: string;
  description: string;
  type: string;
  variant: string;
}

export function listSections(filter: { category?: string; type?: string } = {}): SectionSummary[] {
  return SECTION_PRESETS.filter(
    (p) =>
      (!filter.category || p.category === filter.category) &&
      (!filter.type || p.type === filter.type),
  ).map(({ id, category, name, description, type, variant }) => ({
    id,
    category,
    name,
    description,
    type,
    variant,
  }));
}

export function findSection(id: string): SectionPreset | undefined {
  return SECTION_PRESETS.find((p) => p.id === id);
}

/** Instantiate a preset into a fresh block (deep-cloned, never shared). */
export function createBlockFromSection(preset: SectionPreset): BlockConfig {
  return {
    id: newBlockId(preset.type),
    type: preset.type,
    variant: preset.variant,
    props: JSON.parse(JSON.stringify(preset.props)) as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Widget / block-type catalogue
// ---------------------------------------------------------------------------

export interface BlockTypeSummary {
  type: string;
  label: string;
  description: string;
  category: string;
  variants: string[];
  /** Default prop keys the builder fills in for this type. */
  props: string[];
}

export function listBlockTypes(filter: { category?: string } = {}): BlockTypeSummary[] {
  return BLOCK_METADATA.filter((m) => !filter.category || m.category === filter.category).map(
    (m) => ({
      type: m.type,
      label: m.label,
      description: m.description,
      category: m.category,
      variants: m.variants,
      props: Object.keys(m.defaultProps ?? {}),
    }),
  );
}

export function findBlockType(type: string): BlockMetaSnapshot | undefined {
  return BLOCK_METADATA.find((m) => m.type === type);
}

export interface CreateBlockOptions {
  variant?: string;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  elementStyles?: Record<string, unknown>;
}

/**
 * Build an arbitrary block of `type`, seeded with the type's default props
 * (deep-cloned) and overlaid with any supplied props. Returns null for an
 * unknown block type.
 */
export function createBlockFromType(type: string, options: CreateBlockOptions = {}): BlockConfig | null {
  const meta = findBlockType(type);
  if (!meta) return null;
  const propsSource = JSON.parse(JSON.stringify(meta.defaultProps ?? {})) as Record<string, unknown>;
  const block: BlockConfig = {
    id: newBlockId(type),
    type,
    variant: options.variant ?? meta.variants?.[0] ?? "default",
    props: { ...propsSource, ...(options.props ?? {}) },
  };
  if (options.style && typeof options.style === "object") block.style = options.style as BlockConfig["style"];
  if (options.elementStyles && typeof options.elementStyles === "object") {
    block.elementStyles = options.elementStyles as BlockConfig["elementStyles"];
  }
  return block;
}

// ---------------------------------------------------------------------------
// Starter templates
// ---------------------------------------------------------------------------

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  /** Theme preset id applied on create (see list_theme_presets). */
  themePreset?: string;
  /** Ordered section preset ids (see list_sections). */
  sections: string[];
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "landing-classic",
    name: "Classic Landing Page",
    description: "Sticky nav, overlay hero, overview, amenities, gallery, testimonials and a closing CTA.",
    sections: [
      "header-classic",
      "hero-overlay",
      "overview-split",
      "amenities-grid",
      "gallery-grid",
      "testimonials-cards",
      "lead-cta",
      "footer-classic",
    ],
  },
  {
    id: "landing-split-form",
    name: "Lead-Gen Landing",
    description: "Centered nav, split hero with enquiry form, specs, plans, location map, pricing and a split lead form.",
    sections: [
      "header-centered",
      "hero-split-form",
      "specs-grid",
      "plans-cards",
      "location-split",
      "pricing-cards",
      "lead-split",
      "footer-contact",
    ],
  },
  {
    id: "estate-luxury",
    name: "Luxury Estate",
    description: "Dual-info header and a long-form luxury narrative capped with a premium footer (Estate Gold palette).",
    themePreset: "estate",
    sections: [
      "header-dual",
      "hero-overlay",
      "overview-timeline",
      "amenities-icon-grid",
      "plans-showcase",
      "gallery-masonry",
      "builder-stats",
      "testimonials-carousel",
      "brochure-banner",
      "lead-inline",
      "footer-premium",
    ],
  },
  {
    id: "dark-showcase",
    name: "Dark Showcase",
    description: "Dark ocean palette: glass nav, stats hero, featured amenities, pricing and a spotlight testimonial.",
    themePreset: "ocean",
    sections: [
      "header-glass",
      "hero-stats",
      "amenities-featured",
      "gallery-categories",
      "pricing-simple",
      "testimonials-spotlight",
      "lead-site-visit",
      "footer-premium",
    ],
  },
  {
    id: "brochure-focus",
    name: "Brochure Focus",
    description: "Pill nav, centered hero, card overview and a brochure download front and centre.",
    sections: [
      "header-pill",
      "hero-centered",
      "overview-cards",
      "gallery-masonry",
      "brochure-split",
      "builder-simple",
      "lead-card",
      "footer-compact",
    ],
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Short, airy one-pager: glass nav, centered hero, chips amenities and a slim CTA.",
    sections: [
      "header-glass",
      "hero-centered",
      "overview-centered",
      "amenities-chips",
      "lead-cta",
      "footer-linkrow",
    ],
  },
];

export function findTemplatePreset(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((t) => t.id === id);
}

export function listTemplatePresets(): (Omit<TemplatePreset, "sections"> & { sectionCount: number; sectionIds: string[] })[] {
  return TEMPLATE_PRESETS.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    themePreset: t.themePreset,
    sectionCount: t.sections.length,
    sectionIds: t.sections,
  }));
}

// ---------------------------------------------------------------------------
// Site scaffolding
// ---------------------------------------------------------------------------

export interface BuildSiteOptions {
  name: string;
  blocks: BlockConfig[];
  theme?: Partial<ThemeTokens>;
  themePresetId?: string;
  typography?: unknown;
}

/** Assemble a fresh OpenPage document from blocks + (optional) theme/typography. */
export function buildSite(options: BuildSiteOptions): SiteConfig {
  const preset = options.themePresetId ? findThemePreset(options.themePresetId) : undefined;
  const theme = preset ? { ...preset.theme } : normalizeTheme(options.theme);
  const typography = options.typography
    ? normalizeDesignSystem({ typography: options.typography }).typography
    : defaultTypography();
  return {
    engine: "openpage",
    name: options.name,
    theme,
    designSystem: { scope: "template", typography },
    blocks: options.blocks,
  };
}

/** Resolve a list of section preset ids into blocks, reporting unknown ids. */
export function instantiateSections(sectionIds: string[]): { blocks: BlockConfig[]; unknown: string[] } {
  const blocks: BlockConfig[] = [];
  const unknown: string[] = [];
  for (const id of sectionIds) {
    const preset = findSection(id);
    if (!preset) {
      unknown.push(id);
      continue;
    }
    blocks.push(createBlockFromSection(preset));
  }
  return { blocks, unknown };
}

// ---------------------------------------------------------------------------
// Brand kits
// ---------------------------------------------------------------------------

export interface BrandKit {
  id: string;
  name: string;
  theme: ThemeTokens;
  typography: TemplateTypography;
  updatedAt: string;
}

export interface BrandKitSummary {
  id: string;
  name: string;
  accent: string;
  fontDisplay: string;
  updatedAt: string;
}

export function resolveBrandKitDir(): string {
  const override = process.env.OP_BRAND_KIT_DIR?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), ".openpage", "brand-kits");
}

export function slugifyBrandKitId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "brand-kit";
}

function brandKitFile(id: string): string {
  return path.join(resolveBrandKitDir(), `${id}.json`);
}

export async function listBrandKits(): Promise<BrandKitSummary[]> {
  const dir = resolveBrandKitDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const kits: BrandKitSummary[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(".json")) continue;
    try {
      const kit = JSON.parse(await readFile(path.join(dir, entry), "utf8")) as BrandKit;
      kits.push({
        id: kit.id,
        name: kit.name,
        accent: kit.theme?.accent ?? "",
        fontDisplay: kit.theme?.fontDisplay ?? "",
        updatedAt: kit.updatedAt ?? "",
      });
    } catch {
      // ignore malformed kit files
    }
  }
  return kits.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readBrandKit(id: string): Promise<BrandKit> {
  let raw: string;
  try {
    raw = await readFile(brandKitFile(id), "utf8");
  } catch {
    throw new Error(`Brand kit "${id}" not found in ${resolveBrandKitDir()}.`);
  }
  return JSON.parse(raw) as BrandKit;
}

export async function writeBrandKit(kit: BrandKit): Promise<string> {
  await mkdir(resolveBrandKitDir(), { recursive: true });
  const file = brandKitFile(kit.id);
  await writeFile(file, `${JSON.stringify(kit, null, 2)}\n`, "utf8");
  return file;
}

/** Capture a kit from a site document's resolved theme + typography. */
export function brandKitFromSite(name: string, site: SiteConfig, id?: string): BrandKit {
  const theme = normalizeTheme(site.theme);
  const typography = normalizeDesignSystem(site.designSystem).typography;
  return {
    id: id?.trim() || slugifyBrandKitId(name),
    name,
    theme,
    typography,
    updatedAt: new Date().toISOString(),
  };
}

/** Apply a kit's theme + typography onto a site (copy untouched). */
export function applyBrandKitToSite(site: SiteConfig, kit: BrandKit): SiteConfig {
  const next = structuredClone(site);
  const current = normalizeDesignSystem(next.designSystem);
  next.theme = { ...DEFAULT_THEME, ...kit.theme };
  next.designSystem = {
    scope: current.scope,
    globalSetId: current.globalSetId,
    typography: kit.typography ?? defaultTypography(),
  };
  return next;
}
