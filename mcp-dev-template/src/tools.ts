/**
 * MCP tool surface for the OpenPage builder. Two families:
 *
 *  - Design-token tools operate directly on a JSON site document (file path via
 *    `siteFile` arg or the OP_SITE_FILE env var) — read/patch theme, typography
 *    and per-block style tokens.
 *  - AI tools proxy the backend's `/ai/*` endpoints so an agent can generate a
 *    fresh token-driven template or re-theme an existing one.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  THEME_TOKEN_KEYS,
  findThemePreset,
  listThemePresets,
  normalizeTheme,
} from "./design-tokens.js";
import {
  type SiteConfig,
  applyThemePresetToSite,
  getDesignTokens,
  readSite,
  resolveSitePath,
  setBlockStyleTokens,
  setThemeTokens,
  setTypographyTokens,
  walkBlocks,
  writeSite,
} from "./site.js";
import { BackendClient } from "./backend.js";

function text(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorText(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function requireSitePath(siteFile?: string): string {
  const resolved = resolveSitePath(siteFile);
  if (!resolved) {
    throw new Error(
      "No site document selected. Pass `siteFile` or set the OP_SITE_FILE environment variable to the path of an OpenPage site JSON.",
    );
  }
  return resolved;
}

function summarize(site: SiteConfig) {
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

const siteFileArg = z
  .string()
  .optional()
  .describe("Path to the OpenPage site JSON. Defaults to the OP_SITE_FILE env var.");
const saveArg = z
  .boolean()
  .optional()
  .describe("Write the updated document back to disk (default true).");

export function registerDesignTools(server: McpServer): void {
  // --- Discovery -----------------------------------------------------------

  server.registerTool(
    "list_theme_presets",
    {
      title: "List theme presets",
      description:
        "List the built-in OpenPage theme token presets (id, name, accent, display font). Use with apply_theme_preset.",
      inputSchema: {},
    },
    async () => text(listThemePresets()),
  );

  server.registerTool(
    "get_design_tokens",
    {
      title: "Get design tokens",
      description:
        "Read the full design-token set of a site document: theme colors/fonts/radii, H1–P typography tokens per breakpoint, and each block's style tokens.",
      inputSchema: { siteFile: siteFileArg },
    },
    async ({ siteFile }) => {
      const site = await readSite(requireSitePath(siteFile));
      return text(getDesignTokens(site));
    },
  );

  server.registerTool(
    "list_blocks",
    {
      title: "List blocks",
      description:
        "List every block in the document (depth-first, including nested children) with its id, type and variant, so you can target one with set_block_style_tokens or regenerate_section.",
      inputSchema: { siteFile: siteFileArg },
    },
    async ({ siteFile }) => {
      const site = await readSite(requireSitePath(siteFile));
      return text(
        walkBlocks(site.blocks).map((b) => ({
          id: b.id,
          type: b.type,
          variant: b.variant,
          style: b.style ?? {},
        })),
      );
    },
  );

  // --- Token edits ---------------------------------------------------------

  server.registerTool(
    "set_theme_tokens",
    {
      title: "Set theme tokens",
      description:
        `Patch theme tokens. Only the keys you supply change. Valid keys: ${THEME_TOKEN_KEYS.join(", ")}. Colors are hex strings; radius/radiusLg are numbers.`,
      inputSchema: {
        theme: z
          .record(z.union([z.string(), z.number()]))
          .describe("Partial ThemeTokens patch.")
          .refine((t) => Object.keys(t).length > 0, "Provide at least one theme token."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ theme, siteFile, save }) => {
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const next = setThemeTokens(site, theme as never);
      if (save !== false) await writeSite(target, next);
      return text({ saved: save !== false, path: target, ...summarize(next) });
    },
  );

  server.registerTool(
    "set_typography_tokens",
    {
      title: "Set typography tokens",
      description:
        "Patch H1–H6/P typography tokens. Shape: { h1: { desktop: Token, tablet: PartialToken, mobile: PartialToken }, ..., p: {...} }. Token = { fontFamily, fontSize (px number), fontWeight, lineHeight, letterSpacing (px), textTransform, textColor, paragraphSpacing (p only) }. Only supplied keys/breakpoints change.",
      inputSchema: {
        typography: z.record(z.any()).describe("Partial typography token patch keyed by h1..h6 and p."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ typography, siteFile, save }) => {
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const next = setTypographyTokens(site, typography);
      if (save !== false) await writeSite(target, next);
      return text({
        saved: save !== false,
        path: target,
        typography: getDesignTokens(next).typography,
      });
    },
  );

  server.registerTool(
    "apply_theme_preset",
    {
      title: "Apply theme preset",
      description:
        "Apply a named built-in theme preset's tokens to the document (typography is preserved). See list_theme_presets for ids.",
      inputSchema: {
        presetId: z.string().describe("Preset id, e.g. 'ocean', 'estate', 'vista-red'."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ presetId, siteFile, save }) => {
      const preset = findThemePreset(presetId);
      if (!preset) {
        const available = listThemePresets().map((p) => p.id).join(", ");
        return errorText(`Unknown preset "${presetId}". Available: ${available}.`);
      }
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const next = applyThemePresetToSite(site, preset.theme);
      if (save !== false) await writeSite(target, next);
      return text({ saved: save !== false, path: target, preset: preset.id, ...summarize(next) });
    },
  );

  server.registerTool(
    "set_block_style_tokens",
    {
      title: "Set block style tokens",
      description:
        "Patch one block's style tokens (padding, backgroundColor, textAlign, borderRadius, gap, maxWidth, …) and optionally per-element styles. Find the block id with list_blocks.",
      inputSchema: {
        blockId: z.string().describe("Target block id (see list_blocks)."),
        style: z.record(z.any()).describe("Partial BlockStyle patch for that block."),
        elementStyles: z
          .record(z.any())
          .optional()
          .describe("Optional per-element style map keyed by element id."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ blockId, style, elementStyles, siteFile, save }) => {
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      try {
        const next = setBlockStyleTokens(site, blockId, style, elementStyles);
        if (save !== false) await writeSite(target, next);
        const block = walkBlocks(next.blocks).find((b) => b.id === blockId);
        return text({ saved: save !== false, path: target, blockId, style: block?.style ?? {} });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  // --- AI tools ------------------------------------------------------------

  server.registerTool(
    "get_ai_status",
    {
      title: "Get AI status",
      description: "Report which AI design agent (provider + model) the backend is using and whether it is configured.",
      inputSchema: {},
    },
    async () => {
      if (!BackendClient.isBackendConfigured()) {
        return text({
          backendConfigured: false,
          hint: "Set OP_API_TOKEN (and optionally OP_API_BASE_URL) to enable the AI tools.",
        });
      }
      try {
        const status = await BackendClient.getStatus();
        return text({ backendConfigured: true, ...status });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  server.registerTool(
    "generate_ai_template",
    {
      title: "Generate AI template",
      description:
        "Generate a complete, token-driven OpenPage template via the backend design agent. Omit designStyle/colours/sections to let the agent design everything itself. Optionally save the returned document to a site file.",
      inputSchema: {
        prompt: z.string().describe("Design/content brief for the landing page."),
        mode: z.enum(["prompt", "project", "template"]).optional(),
        templateName: z.string().optional(),
        category: z.string().optional(),
        designStyle: z.string().optional(),
        primaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        targetAudience: z.string().optional(),
        selectedSections: z.array(z.string()).optional(),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async (args) => {
      if (!BackendClient.isBackendConfigured()) {
        return errorText("Set OP_API_TOKEN (and optionally OP_API_BASE_URL) to use AI tools.");
      }
      try {
        const site = await BackendClient.generateTemplate({
          mode: args.mode ?? "prompt",
          prompt: args.prompt,
          templateName: args.templateName,
          category: args.category,
          designStyle: args.designStyle,
          primaryColor: args.primaryColor,
          accentColor: args.accentColor,
          targetAudience: args.targetAudience,
          selectedSections: args.selectedSections,
        });
        if (args.siteFile) {
          await writeSite(requireSitePath(args.siteFile), site);
        }
        return text({ saved: Boolean(args.siteFile), ...summarize(site) });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  server.registerTool(
    "improve_page_design",
    {
      title: "Improve page design (tokens)",
      description:
        "Re-theme an existing site document through the backend. Only design tokens change (theme, typography, per-section styles) — copy is left untouched. Loads the document, applies the token patch and saves it.",
      inputSchema: {
        instruction: z.string().describe("Design instruction, e.g. 'warmer palette, bigger headings, more breathing room'."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ instruction, siteFile, save }) => {
      if (!BackendClient.isBackendConfigured()) {
        return errorText("Set OP_API_TOKEN (and optionally OP_API_BASE_URL) to use AI tools.");
      }
      const target = requireSitePath(siteFile);
      try {
        const site = await readSite(target);
        const improved = await BackendClient.improveDesign(site, instruction);
        if (save !== false && improved && Array.isArray(improved.blocks)) {
          await writeSite(target, improved);
        }
        return text({ saved: save !== false, path: target, ...summarize(improved) });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  server.registerTool(
    "regenerate_section",
    {
      title: "Regenerate section",
      description:
        "Rewrite/improve a single block's copy via the backend and merge the result back into the document.",
      inputSchema: {
        action: z
          .enum(["rewrite", "improve-headline", "shorten", "change-tone", "improve-cta", "regenerate", "suggest-styling"])
          .describe("Which transformation to apply."),
        blockId: z.string().describe("Target block id (see list_blocks)."),
        tone: z.string().optional(),
        prompt: z.string().optional(),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ action, blockId, tone, prompt, siteFile, save }) => {
      if (!BackendClient.isBackendConfigured()) {
        return errorText("Set OP_API_TOKEN (and optionally OP_API_BASE_URL) to use AI tools.");
      }
      const target = requireSitePath(siteFile);
      try {
        const site = await readSite(target);
        const block = walkBlocks(site.blocks).find((b) => b.id === blockId);
        if (!block) return errorText(`Block "${blockId}" not found.`);

        const updated = await BackendClient.regenerateSection({ action, block, tone, prompt });
        const next = structuredClone(site);
        const target0 = walkBlocks(next.blocks).find((b) => b.id === blockId);
        if (target0 && updated && typeof updated === "object") {
          if (updated.props) target0.props = updated.props as Record<string, unknown>;
          if (updated.style) target0.style = updated.style as never;
        }
        if (save !== false) await writeSite(target, next);
        return text({ saved: save !== false, path: target, blockId, action });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );
}
