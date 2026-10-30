"use client";

import type { BlockConfig } from "./types";
import { El } from "./El";
import { isMediaSrc } from "@/lib/media";

/** Prop that lists the keys a user created with the inspector's "Add Field". */
export const CUSTOM_FIELDS_KEY = "_customFields";

/** Blocks that already render their own extra fields. */
const RENDERS_OWN_CUSTOM_FIELDS = new Set(["project-overview"]);

/** Added fields a block already renders itself, so they are not shown twice. */
const RENDERED_BY_BLOCK: Record<string, string[]> = { "lead-form": ["consent", "description"] };

export function customFieldKeys(block: BlockConfig): string[] {
  const raw = block.props?.[CUSTOM_FIELDS_KEY];
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string" && k.length > 0) : [];
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Values of the fields a user added with "Add Field", shown under the block's
 * own content. Without this they were editable but never appeared on the page.
 * Each value is its own element, so it can be styled independently.
 */
export function CustomFields({ block }: { block: BlockConfig }) {
  if (RENDERS_OWN_CUSTOM_FIELDS.has(block.type)) return null;
  const own = RENDERED_BY_BLOCK[block.type] ?? [];
  const rows = customFieldKeys(block)
    .filter((key) => !own.includes(key))
    .map((key) => ({ key, value: block.props[key] }))
    .filter((r): r is { key: string; value: string } => typeof r.value === "string" && r.value.trim() !== "");
  if (!rows.length) return null;

  return (
    <div className="px-6 @md:px-10 pb-6 max-w-3xl mx-auto space-y-3">
      {rows.map(({ key, value }) =>
        isMediaSrc(value) ? (
          <El key={key} block={block} id={`${block.type}:custom-${key}`} className="rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={humanize(key)} className="w-full h-auto object-cover" />
          </El>
        ) : (
          <El key={key} block={block} id={`${block.type}:custom-${key}`} as="p" className="text-text-1 text-sm leading-relaxed whitespace-pre-line text-center">
            {value}
          </El>
        ),
      )}
    </div>
  );
}
