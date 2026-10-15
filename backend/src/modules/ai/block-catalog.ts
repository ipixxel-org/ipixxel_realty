/**
 * Block/widget helpers built on the generated catalogue snapshot, so the AI
 * pipeline speaks the exact block vocabulary the visual builder renders.
 */

import { BLOCK_METADATA, type BlockMetaSnapshot } from './block-catalog.generated';

export type { BlockMetaSnapshot };

const byType = new Map<string, BlockMetaSnapshot>(
  BLOCK_METADATA.map((meta) => [meta.type, meta]),
);

export function findBlockMeta(type: string): BlockMetaSnapshot | undefined {
  return byType.get(type);
}

export function blockTypes(): string[] {
  return BLOCK_METADATA.map((m) => m.type);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Fill any props a generated block omitted by merging the type's defaultProps
 * underneath. Supplied props always win, so a deliberately empty array stays
 * empty — only absent keys get defaults. Recurses into column containers.
 */
export function applyBlockDefaults(block: any): any {
  if (!isPlainObject(block)) return block;
  const meta = typeof block.type === 'string' ? byType.get(block.type) : undefined;
  // Deep-clone defaults so two blocks of the same type never share nested
  // arrays/objects (a later in-place edit must not leak across blocks).
  const defaults = meta?.defaultProps
    ? (structuredClone(meta.defaultProps) as Record<string, unknown>)
    : {};
  const props: Record<string, unknown> = {
    ...defaults,
    ...(isPlainObject(block.props) ? block.props : {}),
  };

  if (Array.isArray(props.columns)) {
    props.columns = (props.columns as any[]).map((col) =>
      isPlainObject(col)
        ? {
            ...col,
            blocks: Array.isArray(col.blocks)
              ? col.blocks.map(applyBlockDefaults)
              : [],
          }
        : col,
    );
  }

  return { ...block, props };
}

export function applyBlocksDefaults(blocks: unknown): any[] {
  return (Array.isArray(blocks) ? blocks : []).map(applyBlockDefaults);
}

/**
 * Compact widget catalogue for the generation prompt: one line per block type
 * with its category, variants and prop keys. Prop *values* are intentionally
 * omitted (defaults are filled in afterwards) to keep the prompt small.
 */
export function formatWidgetCatalog(): string {
  const lines: string[] = [];
  for (const meta of BLOCK_METADATA) {
    const variants = meta.variants?.length ? meta.variants.join(' | ') : 'default';
    const propKeys = Object.keys(meta.defaultProps ?? {});
    const props = propKeys.length ? propKeys.join(', ') : '(any props)';
    lines.push(
      `- "${meta.type}" [${meta.category}] variants: ${variants} — ${meta.description} props: ${props}`,
    );
  }
  return lines.join('\n');
}
