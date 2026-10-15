/**
 * OpenPage site-document model + helpers. An agent edits a JSON SiteConfig
 * (the same document the builder canvas saves), so all token operations are
 * pure functions over plain objects plus optional file read/write.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_THEME,
  type DesignSystemState,
  type TemplateTypography,
  type ThemeTokens,
  mergeTypographyPatch,
  normalizeDesignSystem,
  normalizeTheme,
} from "./design-tokens.js";

export interface BlockStyle {
  paddingTop?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  paddingRight?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  borderRadius?: string;
  textAlign?: string;
  marginTop?: string;
  marginBottom?: string;
  maxWidth?: string;
  gap?: string;
  [key: string]: unknown;
}

export interface BlockConfig {
  id: string;
  type: string;
  variant?: string;
  props?: Record<string, unknown>;
  style?: BlockStyle;
  elementStyles?: Record<string, BlockStyle>;
  children?: BlockConfig[];
  [key: string]: unknown;
}

export interface SiteConfig {
  engine?: "openpage";
  name: string;
  theme?: Partial<ThemeTokens>;
  designSystem?: DesignSystemState;
  blocks: BlockConfig[];
  [key: string]: unknown;
}

/** Resolve which site file to operate on: explicit arg > OP_SITE_FILE env. */
export function resolveSitePath(explicit?: string): string | undefined {
  const candidate = explicit?.trim() || process.env.OP_SITE_FILE?.trim();
  return candidate ? path.resolve(candidate) : undefined;
}

export async function readSite(sitePath: string): Promise<SiteConfig> {
  const raw = await readFile(sitePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.blocks)) {
    throw new Error(`"${sitePath}" is not a valid OpenPage site document (missing "blocks" array).`);
  }
  return parsed as SiteConfig;
}

export async function writeSite(sitePath: string, site: SiteConfig): Promise<void> {
  await writeFile(sitePath, `${JSON.stringify(site, null, 2)}\n`, "utf8");
}

/** Depth-first walk over blocks (including nested children). */
export function walkBlocks(blocks: BlockConfig[] = []): BlockConfig[] {
  const out: BlockConfig[] = [];
  const visit = (list: BlockConfig[]) => {
    for (const block of list) {
      if (!block || typeof block !== "object") continue;
      out.push(block);
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(blocks);
  return out;
}

export function findBlock(site: SiteConfig, blockId: string): BlockConfig | undefined {
  return walkBlocks(site.blocks).find((b) => b.id === blockId);
}

// ---------------------------------------------------------------------------
// Token read / write
// ---------------------------------------------------------------------------

export interface SiteDesignTokens {
  theme: ThemeTokens;
  typography: TemplateTypography;
  blocks: { id: string; type: string; variant?: string; style: BlockStyle }[];
}

/** Extract the complete, normalised token set currently on a site document. */
export function getDesignTokens(site: SiteConfig): SiteDesignTokens {
  const theme = normalizeTheme(site.theme);
  const designSystem = normalizeDesignSystem(site.designSystem);
  return {
    theme,
    typography: designSystem.typography,
    blocks: walkBlocks(site.blocks).map((b) => ({
      id: b.id,
      type: b.type,
      variant: b.variant,
      style: b.style ?? {},
    })),
  };
}

/** Patch theme tokens (only the keys supplied change). */
export function setThemeTokens(site: SiteConfig, patch: Partial<ThemeTokens>): SiteConfig {
  const next = structuredClone(site);
  next.theme = normalizeTheme(patch, normalizeTheme(site.theme));
  return next;
}

/** Patch typography tokens at the token/breakpoint level. */
export function setTypographyTokens(site: SiteConfig, patch: any): SiteConfig {
  const next = structuredClone(site);
  const current = normalizeDesignSystem(site.designSystem);
  const merged = mergeTypographyPatch(current.typography, patch);
  next.designSystem = {
    scope: current.scope,
    globalSetId: current.globalSetId,
    typography: normalizeDesignSystem(merged).typography,
  };
  return next;
}

/** Apply a named theme preset's tokens (typography is preserved). */
export function applyThemePresetToSite(site: SiteConfig, presetTheme: ThemeTokens): SiteConfig {
  const next = structuredClone(site);
  next.theme = { ...DEFAULT_THEME, ...presetTheme };
  return next;
}

/** Patch a single block's style tokens and (optionally) per-element styles. */
export function setBlockStyleTokens(
  site: SiteConfig,
  blockId: string,
  style: BlockStyle,
  elementStyles?: Record<string, BlockStyle>,
): SiteConfig {
  const next = structuredClone(site);
  const block = findBlock(next, blockId);
  if (!block) throw new Error(`Block "${blockId}" not found.`);
  block.style = { ...(block.style ?? {}), ...(style ?? {}) };
  if (elementStyles && typeof elementStyles === "object") {
    block.elementStyles = { ...(block.elementStyles ?? {}), ...elementStyles };
  }
  return next;
}

/** Merge an AI-produced design-token patch (theme/typography/blockStyles). */
export function mergeDesignTokenPatch(site: SiteConfig, patch: any): SiteConfig {
  let next = structuredClone(site);
  const p = patch && typeof patch === "object" ? patch : {};

  if (p.theme && typeof p.theme === "object") {
    next = setThemeTokens(next, p.theme);
  }
  if (p.typography && typeof p.typography === "object") {
    next = setTypographyTokens(next, p.typography);
  }
  if (p.blockStyles && typeof p.blockStyles === "object") {
    for (const [blockId, style] of Object.entries(p.blockStyles)) {
      if (style && typeof style === "object") {
        next = setBlockStyleTokens(next, blockId, style as BlockStyle);
      }
    }
  }
  return next;
}
