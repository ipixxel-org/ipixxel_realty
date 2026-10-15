/**
 * Snapshots the frontend builder catalogues into typed data modules so the MCP
 * server and the backend AI prompt share the *exact* section/block vocabulary
 * the visual builder uses, instead of drifting hand-written copies.
 *
 * Sources (frontend = single source of truth):
 *   frontend/lib/openpage/section-presets.ts   -> section library
 *   frontend/lib/openpage/block-metadata.ts    -> block/widget catalogue
 *
 * Outputs:
 *   mcp-dev-template/src/section-presets.generated.ts
 *   mcp-dev-template/src/block-catalog.generated.ts
 *   backend/src/modules/ai/block-catalog.generated.ts
 *
 * Run with tsx (the frontend modules are pure data; their only imports are
 * type-only and erased by the loader).
 *
 *   npm run generate
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "../../frontend/lib/openpage");

type SectionPreset = {
  id: string;
  category: string;
  name: string;
  description: string;
  type: string;
  variant: string;
  props: Record<string, unknown>;
};

type BlockMeta = {
  type: string;
  label: string;
  description: string;
  category: string;
  variants: string[];
  defaultProps: Record<string, unknown>;
};

async function load<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(path.join(frontend, file)).href)) as T;
}

const sectionsMod = await load<{
  SECTION_PRESETS: SectionPreset[];
  SECTION_PRESET_CATEGORIES: string[];
}>("section-presets.ts");
const blocksMod = await load<{ blockMetadata: BlockMeta[] }>("block-metadata.ts");

const presets = sectionsMod.SECTION_PRESETS;
const categories =
  sectionsMod.SECTION_PRESET_CATEGORIES ?? [...new Set(presets.map((p) => p.category))];
const blocks = blocksMod.blockMetadata;

if (!Array.isArray(presets) || presets.length === 0) throw new Error("No SECTION_PRESETS found");
if (!Array.isArray(blocks) || blocks.length === 0) throw new Error("No blockMetadata found");

const banner = (source: string) =>
  `/**\n * AUTO-GENERATED - do not edit by hand.\n *\n * Snapshot of frontend/lib/openpage/${source} taken by\n * mcp-dev-template/scripts/generate-library.ts. Re-run \`npm run generate\` in\n * mcp-dev-template after changing the frontend catalogue.\n */\n`;

// --- section-presets.generated.ts -----------------------------------------
const categoryUnion = categories.map((c) => JSON.stringify(c)).join(" | ");
const categoryArray = categories.map((c) => `  ${JSON.stringify(c)},`).join("\n");

const sectionFile =
  banner("section-presets.ts") +
  `\nexport type SectionPresetCategory = ${categoryUnion};\n\n` +
  `export interface SectionPreset {\n` +
  `  id: string;\n  category: SectionPresetCategory;\n  name: string;\n  description: string;\n` +
  `  /** OpenPage block type the preset instantiates (e.g. "project-banner"). */\n` +
  `  type: string;\n  variant: string;\n  props: Record<string, unknown>;\n}\n\n` +
  `export const SECTION_PRESETS: SectionPreset[] = ${JSON.stringify(presets, null, 2)};\n\n` +
  `export const SECTION_PRESET_CATEGORIES: SectionPresetCategory[] = [\n${categoryArray}\n];\n`;

// --- block-catalog.generated.ts -------------------------------------------
const blockFile =
  banner("block-metadata.ts") +
  `\nexport interface BlockMetaSnapshot {\n` +
  `  type: string;\n  label: string;\n  description: string;\n  category: string;\n` +
  `  variants: string[];\n  defaultProps: Record<string, unknown>;\n}\n\n` +
  `export const BLOCK_METADATA: BlockMetaSnapshot[] = ${JSON.stringify(blocks, null, 2)};\n`;

const targets = [
  path.resolve(here, "../src/section-presets.generated.ts"),
  path.resolve(here, "../src/block-catalog.generated.ts"),
  path.resolve(here, "../../backend/src/modules/ai/block-catalog.generated.ts"),
];

const contents = [sectionFile, blockFile, blockFile];

for (let i = 0; i < targets.length; i++) {
  await mkdir(path.dirname(targets[i]), { recursive: true });
  await writeFile(targets[i], contents[i], "utf8");
  console.log(`generate-library: wrote ${path.relative(process.cwd(), targets[i])}`);
}

console.log(
  `generate-library: ${presets.length} sections / ${categories.length} categories, ${blocks.length} block types`,
);
