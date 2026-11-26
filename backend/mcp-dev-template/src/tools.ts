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
import { errorText, requireSitePath, saveArg, siteFileArg, summarize, text } from "./tool-support.js";

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

  server.registerTool(
    "get_site",
    {
      title: "Get site document",
      description:
        "Read the full OpenPage site document (name, theme, design system, blocks, pages and SEO). Use this after generate_ai_template or create_template to inspect the complete template.",
      inputSchema: { siteFile: siteFileArg },
    },
    async ({ siteFile }) => {
      const site = await readSite(requireSitePath(siteFile));
      return text(site);
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
        "Generate a complete, token-driven OpenPage template via the backend design agent. Omit designStyle/colours/sections to let the agent design everything itself. The full site document is returned and (by default) saved to siteFile or OP_SITE_FILE so list_blocks, get_design_tokens and the other editing tools can work on it.",
      inputSchema: {
        prompt: z.string().describe("Design/content brief for the landing page."),
        mode: z.enum(["prompt", "project", "template"]).optional(),
        templateName: z.string().optional(),
        pageType: z.string().optional(),
        category: z.string().optional(),
        projectId: z.string().optional(),
        designStyle: z.string().optional(),
        primaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        typography: z.string().optional(),
        targetAudience: z.string().optional(),
        selectedSections: z.array(z.string()).optional(),
        imageStyle: z.string().optional(),
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
          pageType: args.pageType,
          category: args.category,
          projectId: args.projectId,
          designStyle: args.designStyle,
          primaryColor: args.primaryColor,
          accentColor: args.accentColor,
          typography: args.typography,
          targetAudience: args.targetAudience,
          selectedSections: args.selectedSections,
          imageStyle: args.imageStyle,
        });
        const target = resolveSitePath(args.siteFile);
        const shouldSave = Boolean(target) && args.save !== false;
        if (shouldSave && target) await writeSite(target, site);
        return text({
          saved: shouldSave,
          path: shouldSave ? target : undefined,
          ...summarize(site),
          site,
        });
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

  server.registerTool(
    "generate_ai_section",
    {
      title: "Generate AI section",
      description:
        "Generate a brand new section block with tailored copy & styles using natural language, and append/insert it into the document.",
      inputSchema: {
        prompt: z.string().describe("Instructions describing the section, copy, and layout to generate."),
        sectionType: z.string().optional().describe("Optional block type: features, pricing, amenities, faq, cta, testimonials, etc."),
        tone: z.string().optional().describe("Tone: luxury, urgent, corporate, friendly."),
        insertIndex: z.number().optional().describe("Optional 0-based index to insert the block at (defaults to end of page)."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ prompt, sectionType, tone, insertIndex, siteFile, save }) => {
      if (!BackendClient.isBackendConfigured()) {
        return errorText("Set OP_API_TOKEN (and optionally OP_API_BASE_URL) to use AI tools.");
      }
      const target = requireSitePath(siteFile);
      try {
        const site = await readSite(target);
        const newBlock = await BackendClient.generateSection({
          prompt,
          sectionType,
          tone,
          siteContext: {
            projectName: (site.property as any)?.name || site.name,
            location: (site.property as any)?.location,
          },
        });
        if (!newBlock || typeof newBlock !== "object" || !newBlock.id) {
          return errorText("Failed to generate a valid section block.");
        }
        const next = structuredClone(site);
        const idx = typeof insertIndex === "number" ? Math.max(0, Math.min(next.blocks.length, insertIndex)) : next.blocks.length;
        next.blocks.splice(idx, 0, newBlock as any);
        if (save !== false) await writeSite(target, next);
        return text({ saved: save !== false, path: target, block: newBlock, insertedIndex: idx });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  server.registerTool(
    "edit_ai_component",
    {
      title: "Edit component with AI",
      description:
        "Modify a specific component or nested element inside a block using natural language instructions (e.g. 'Make headline shorter and mention private beach access').",
      inputSchema: {
        blockId: z.string().describe("Target block id to edit."),
        prompt: z.string().describe("Natural language editing instruction."),
        elementId: z.string().optional().describe("Optional element id inside the block to target."),
        action: z.string().optional().describe("Action type: edit, rewrite, tone, polish."),
        tone: z.string().optional().describe("Tone: luxury, urgent, friendly, etc."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ blockId, prompt, elementId, action, tone, siteFile, save }) => {
      if (!BackendClient.isBackendConfigured()) {
        return errorText("Set OP_API_TOKEN (and optionally OP_API_BASE_URL) to use AI tools.");
      }
      const target = requireSitePath(siteFile);
      try {
        const site = await readSite(target);
        const block = walkBlocks(site.blocks).find((b) => b.id === blockId);
        if (!block) return errorText(`Block "${blockId}" not found.`);

        const updated = await BackendClient.editComponent({
          block,
          prompt,
          elementId,
          action,
          tone,
          siteContext: {
            projectName: (site.property as any)?.name || site.name,
            location: (site.property as any)?.location,
          },
        });

        const next = structuredClone(site);
        const targetBlock = walkBlocks(next.blocks).find((b) => b.id === blockId);
        if (targetBlock && updated && typeof updated === "object") {
          if (updated.props) targetBlock.props = updated.props as Record<string, unknown>;
          if (updated.style) targetBlock.style = updated.style as never;
          if (updated.elementStyles) (targetBlock as any).elementStyles = updated.elementStyles;
        }
        if (save !== false) await writeSite(target, next);
        return text({ saved: save !== false, path: target, blockId, elementId });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  server.registerTool(
    "get_page_seo",
    {
      title: "Get page SEO settings",
      description: "Read meta tags, OpenGraph, keywords, and schema settings for the site document.",
      inputSchema: { siteFile: siteFileArg },
    },
    async ({ siteFile }) => {
      const site = await readSite(requireSitePath(siteFile));
      return text(site.seo ?? {});
    },
  );

  server.registerTool(
    "set_page_seo",
    {
      title: "Set page SEO settings",
      description: "Update meta title, meta description, keywords, canonical URL, or OpenGraph settings.",
      inputSchema: {
        seo: z.record(z.any()).describe("SEO settings patch: metaTitle, metaDescription, keywords, canonical, ogTitle, ogDescription, ogImage, etc."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ seo, siteFile, save }) => {
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const next = structuredClone(site);
      next.seo = { ...(next.seo || {}), ...seo };
      if (save !== false) await writeSite(target, next);
      return text({ saved: save !== false, path: target, seo: next.seo });
    },
  );
}
