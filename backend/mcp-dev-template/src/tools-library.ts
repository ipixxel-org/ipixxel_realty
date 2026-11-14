/**
 * Library tools for the OpenPage MCP server. Where `tools.ts` edits an existing
 * document's tokens/copy, these assemble and reshape templates:
 *
 *  - Starter templates: scaffold a whole page from a curated set of sections.
 *  - Section library: discover ready-made sections and add/remove/reorder them.
 *  - Brand kits: capture a theme + typography bundle and re-apply it anywhere.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readSite, insertBlock, moveBlock, removeBlockById, writeSite } from "./site.js";
import {
  applyBrandKitToSite,
  brandKitFromSite,
  buildSite,
  createBlockFromSection,
  createBlockFromType,
  findBlockType,
  findSection,
  findTemplatePreset,
  instantiateSections,
  listBlockTypes,
  listBrandKits,
  listSections,
  listTemplatePresets,
  readBrandKit,
  resolveBrandKitDir,
  writeBrandKit,
  type BrandKit,
} from "./library.js";
import { errorText, requireSitePath, saveArg, siteFileArg, summarize, text } from "./tool-support.js";

const styleArg = z
  .record(z.any())
  .optional()
  .describe("Optional block style-token patch applied to the inserted section (padding, backgroundColor, …).");

export function registerLibraryTools(server: McpServer): void {
  // --- Starter templates ---------------------------------------------------

  server.registerTool(
    "list_template_presets",
    {
      title: "List template presets",
      description:
        "List the curated full-page starter templates. Create one with create_template to scaffold themes, typography and an ordered set of sections in a single call.",
      inputSchema: {},
    },
    async () => text(listTemplatePresets()),
  );

  server.registerTool(
    "create_template",
    {
      title: "Create template",
      description:
        "Scaffold a new OpenPage document and save it. Provide either a starter template id (from list_template_presets) OR an explicit sectionIds list (from list_sections). Optionally override the theme preset. Returns the written path and a summary.",
      inputSchema: {
        name: z.string().optional().describe("Document name (defaults to the starter's name, else 'Untitled Template')."),
        templateId: z.string().optional().describe("Starter template id, e.g. 'landing-classic'."),
        sectionIds: z
          .array(z.string())
          .optional()
          .describe("Explicit ordered list of section preset ids to instantiate."),
        themePresetId: z.string().optional().describe("Theme preset id (from list_theme_presets). Overrides the starter's theme."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ name, templateId, sectionIds, themePresetId, siteFile, save }) => {
      const preset = templateId ? findTemplatePreset(templateId) : undefined;
      if (templateId && !preset) {
        const available = listTemplatePresets().map((t) => t.id).join(", ");
        return errorText(`Unknown templateId "${templateId}". Available: ${available}.`);
      }
      const ids = sectionIds ?? preset?.sections ?? [];
      if (ids.length === 0) {
        return errorText("Provide a templateId or a non-empty sectionIds list.");
      }
      const { blocks, unknown } = instantiateSections(ids);
      if (unknown.length > 0) {
        return errorText(`Unknown section id(s): ${unknown.join(", ")}. See list_sections.`);
      }
      const site = buildSite({
        name: name ?? preset?.name ?? "Untitled Template",
        blocks,
        themePresetId: themePresetId ?? preset?.themePreset,
      });
      const shouldSave = save !== false;
      const target = shouldSave ? requireSitePath(siteFile) : undefined;
      if (shouldSave && target) await writeSite(target, site);
      return text({
        saved: shouldSave,
        path: target,
        templateId: preset?.id,
        sectionIds: ids,
        ...summarize(site),
      });
    },
  );

  // --- Section library -----------------------------------------------------

  server.registerTool(
    "list_sections",
    {
      title: "List sections",
      description:
        "List the ready-made section library (the same catalogue the visual builder offers). Filter by category and/or block type. Use the returned id with add_section or create_template.",
      inputSchema: {
        category: z.string().optional().describe("Filter by category, e.g. 'Hero', 'Gallery', 'Lead Forms'."),
        type: z.string().optional().describe("Filter by block type, e.g. 'project-banner', 'footer'."),
      },
    },
    async ({ category, type }) => text(listSections({ category, type })),
  );

  server.registerTool(
    "get_section",
    {
      title: "Get section",
      description:
        "Return the full definition (block type, variant and props) of one section preset so you can inspect or adapt it before inserting.",
      inputSchema: {
        presetId: z.string().describe("Section preset id (from list_sections)."),
      },
    },
    async ({ presetId }) => {
      const preset = findSection(presetId);
      if (!preset) return errorText(`Unknown section "${presetId}". See list_sections.`);
      return text(preset);
    },
  );

  server.registerTool(
    "list_block_types",
    {
      title: "List block types",
      description:
        "List every low-level block/widget type the builder supports (type, category, variants, default prop keys). Use with add_block to compose any page beyond the ready-made sections.",
      inputSchema: {
        category: z.string().optional().describe("Filter by category, e.g. 'Core' or 'Real Estate'."),
      },
    },
    async ({ category }) => text(listBlockTypes({ category })),
  );

  server.registerTool(
    "add_block",
    {
      title: "Add block",
      description:
        "Insert an arbitrary block of any supported type at an optional index, seeded with the type's default props and overlaid with your own. Supports per-device style overrides under style.responsive and per-element styles. Use list_block_types first.",
      inputSchema: {
        type: z.string().describe("Block type, e.g. 'hero'/'project-banner', 'features', 'pricing', 'faq'."),
        variant: z.string().optional().describe("Variant name (defaults to the type's first variant)."),
        props: z.record(z.any()).optional().describe("Props merged over the type's defaults (copy, items, images, …)."),
        style: z
          .record(z.any())
          .optional()
          .describe("Block style patch. Supports responsive: { tablet, mobile } and any BlockStyle key."),
        elementStyles: z
          .record(z.any())
          .optional()
          .describe("Optional per-element style map keyed by element id."),
        index: z.number().int().optional().describe("0-based position among top-level sections (default: append)."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ type, variant, props, style, elementStyles, index, siteFile, save }) => {
      if (!findBlockType(type)) {
        const available = listBlockTypes().map((b) => b.type).join(", ");
        return errorText(`Unknown block type "${type}". Available: ${available}.`);
      }
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const block = createBlockFromType(type, { variant, props, style, elementStyles });
      if (!block) return errorText(`Could not create block of type "${type}".`);
      const next = insertBlock(site, block, index);
      if (save !== false) await writeSite(target, next);
      return text({
        saved: save !== false,
        path: target,
        blockId: block.id,
        type: block.type,
        variant: block.variant,
        ...summarize(next),
      });
    },
  );

  server.registerTool(
    "add_section",
    {
      title: "Add section",
      description:
        "Insert a ready-made section into an existing document at an optional index (default: append). Optionally patch its style tokens at the same time.",
      inputSchema: {
        presetId: z.string().describe("Section preset id (from list_sections)."),
        index: z.number().int().optional().describe("0-based position among top-level sections (default: append)."),
        style: styleArg,
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ presetId, index, style, siteFile, save }) => {
      const preset = findSection(presetId);
      if (!preset) return errorText(`Unknown section "${presetId}". See list_sections.`);
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const block = createBlockFromSection(preset);
      if (style && typeof style === "object") {
        block.style = { ...(block.style ?? {}), ...style };
      }
      const next = insertBlock(site, block, index);
      if (save !== false) await writeSite(target, next);
      return text({
        saved: save !== false,
        path: target,
        blockId: block.id,
        type: block.type,
        variant: block.variant,
        ...summarize(next),
      });
    },
  );

  server.registerTool(
    "remove_block",
    {
      title: "Remove block",
      description: "Delete a section (or nested block) by id. Find ids with list_blocks.",
      inputSchema: {
        blockId: z.string().describe("Target block id (from list_blocks)."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ blockId, siteFile, save }) => {
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const next = removeBlockById(site, blockId);
      if (save !== false) await writeSite(target, next);
      return text({ saved: save !== false, path: target, removed: blockId, ...summarize(next) });
    },
  );

  server.registerTool(
    "move_block",
    {
      title: "Move block",
      description: "Reorder a top-level section by moving it to a new index. Use list_blocks to see the current order.",
      inputSchema: {
        blockId: z.string().describe("Target block id (from list_blocks)."),
        toIndex: z.number().int().describe("Destination index among top-level sections (0-based)."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ blockId, toIndex, siteFile, save }) => {
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      try {
        const next = moveBlock(site, blockId, toIndex);
        if (save !== false) await writeSite(target, next);
        return text({
          saved: save !== false,
          path: target,
          blockId,
          order: next.blocks.map((b) => b.id),
          ...summarize(next),
        });
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  // --- Brand kits ----------------------------------------------------------

  server.registerTool(
    "list_brand_kits",
    {
      title: "List brand kits",
      description: "List saved brand kits (theme + typography bundles) and the directory they are stored in.",
      inputSchema: {},
    },
    async () => text({ directory: resolveBrandKitDir(), kits: await listBrandKits() }),
  );

  server.registerTool(
    "save_brand_kit",
    {
      title: "Save brand kit",
      description:
        "Capture a reusable brand kit. By default the theme + typography are taken from a site document (set OP_SITE_FILE or pass siteFile). Use get_design_tokens to inspect a document first.",
      inputSchema: {
        name: z.string().describe("Human-readable kit name (also slugified into the id)."),
        kitId: z.string().optional().describe("Override the derived kit id / filename."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ name, kitId, siteFile, save }) => {
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const kit: BrandKit = brandKitFromSite(name, site, kitId);
      const file = save === false ? undefined : await writeBrandKit(kit);
      return text({
        saved: save !== false,
        path: file,
        kit: { id: kit.id, name: kit.name, accent: kit.theme.accent, fontDisplay: kit.theme.fontDisplay },
      });
    },
  );

  server.registerTool(
    "get_brand_kit",
    {
      title: "Get brand kit",
      description: "Return a saved brand kit's full theme + typography tokens.",
      inputSchema: {
        kitId: z.string().describe("Brand kit id (from list_brand_kits)."),
      },
    },
    async ({ kitId }) => {
      try {
        return text(await readBrandKit(kitId));
      } catch (err) {
        return errorText((err as Error).message);
      }
    },
  );

  server.registerTool(
    "apply_brand_kit",
    {
      title: "Apply brand kit",
      description:
        "Apply a saved brand kit's theme + typography to a document. Only design tokens change; copy and block styles are left untouched.",
      inputSchema: {
        kitId: z.string().describe("Brand kit id (from list_brand_kits)."),
        siteFile: siteFileArg,
        save: saveArg,
      },
    },
    async ({ kitId, siteFile, save }) => {
      let kit: BrandKit;
      try {
        kit = await readBrandKit(kitId);
      } catch (err) {
        return errorText((err as Error).message);
      }
      const target = requireSitePath(siteFile);
      const site = await readSite(target);
      const next = applyBrandKitToSite(site, kit);
      if (save !== false) await writeSite(target, next);
      return text({ saved: save !== false, path: target, kitId: kit.id, ...summarize(next) });
    },
  );
}
