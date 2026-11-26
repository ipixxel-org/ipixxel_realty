/**
 * Shared helpers for the MCP tool modules: response shaping, the common
 * `siteFile` / `save` arguments, and site-path resolution.
 */

import { z } from "zod";
import { type SiteConfig, getDesignTokens, resolveSitePath, walkBlocks } from "./site.js";

export function text(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function errorText(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Resolve the target site path, throwing a friendly error when unset. */
export function requireSitePath(siteFile?: string): string {
  const resolved = resolveSitePath(siteFile);
  if (!resolved) {
    throw new Error(
      "No site document selected. Pass `siteFile` or set the OP_SITE_FILE environment variable to the path of an OpenPage site JSON.",
    );
  }
  return resolved;
}

export const siteFileArg = z
  .string()
  .optional()
  .describe("Path to the OpenPage site JSON. Defaults to the OP_SITE_FILE env var.");

export const saveArg = z
  .boolean()
  .optional()
  .describe("Write the updated document back to disk (default true).");

/** Compact, agent-friendly summary of a site document. */
export function summarize(site: SiteConfig) {
  const tokens = getDesignTokens(site);
  return {
    name: site.name,
    engine: site.engine ?? "openpage",
    blockCount: walkBlocks(site.blocks).length,
    theme: {
      accent: tokens.theme.accent,
      accentDim: tokens.theme.accentDim,
      bg0: tokens.theme.bg0,
      text0: tokens.theme.text0,
      fontSans: tokens.theme.fontSans,
      fontDisplay: tokens.theme.fontDisplay,
      radius: tokens.theme.radius,
    },
    typography: {
      h1: tokens.typography.h1.desktop,
      h2: tokens.typography.h2.desktop,
      p: tokens.typography.p.desktop,
    },
  };
}
