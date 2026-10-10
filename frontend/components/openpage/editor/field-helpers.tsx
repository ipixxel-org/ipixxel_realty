"use client";

import type { ReactNode } from "react";
import { ITEM_ID_KEY } from "@/components/openpage/blocks/types";
import { MediaPicker } from "@/components/media-picker";

export type ItemFieldKind = "text" | "textarea" | "select" | "image" | "icon" | "toggle" | "number";

export interface ItemFieldDef {
  key: string;
  label?: string;
  kind?: ItemFieldKind;
  options?: string[];
  placeholder?: string;
  rows?: number;
  /** Rendered instead of the standard input (links, colour pickers, …). */
  render?: (value: unknown, update: (next: unknown) => void) => ReactNode;
}

export function mediaKindForKey(key: string): "image" | "icon" | null {
  const k = key.toLowerCase();
  if (k === "icon" || k === "iconimage") return "icon";
  if (
    k === "src" ||
    k === "image" ||
    k === "logoimage" ||
    k === "heroimage" ||
    k === "avatar" ||
    k === "photo" ||
    k.endsWith("image")
  )
    return "image";
  return null;
}

const LONG_TEXT_HINTS = ["body", "description", "text", "content", "message", "note"];

function kindForKey(key: string, sample: unknown): ItemFieldKind {
  const media = mediaKindForKey(key);
  if (media) return media;
  if (typeof sample === "boolean") return "toggle";
  if (typeof sample === "number") return "number";
  const k = key.toLowerCase();
  if (LONG_TEXT_HINTS.some((hint) => k.includes(hint))) return "textarea";
  return "text";
}

const FIELD_LABEL_MAP: Record<string, string> = {
  name: "Plan Name",
  beds: "Bedrooms",
  bedrooms: "Bedrooms",
  image: "Floor Plan Image",
  price: "Price",
  area: "Area",
  carpetArea: "Carpet Area",
  downloadUrl: "Download URL",
  title: "Title",
  description: "Description",
  icon: "Icon",
  iconBg: "Icon Background",
  iconColor: "Icon Color",
  cardBg: "Card Background",
  cardColor: "Card Color",
  stat: "Stat Value",
  value: "Value",
  label: "Label",
  role: "Role",
  quote: "Quote",
  question: "Question",
  answer: "Answer",
};

export function humanizeFieldLabel(key: string): string {
  if (FIELD_LABEL_MAP[key]) return FIELD_LABEL_MAP[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export const FLOOR_PLAN_FIELDS: ItemFieldDef[] = [
  { key: "name", label: "Plan Name", kind: "text", placeholder: "e.g. 2 BHK Luxury" },
  { key: "beds", label: "Bedrooms", kind: "text", placeholder: "e.g. 2 BHK" },
  { key: "area", label: "Area", kind: "text", placeholder: "e.g. 1,250 sq.ft." },
  { key: "price", label: "Price", kind: "text", placeholder: "e.g. ₹1.25 Cr" },
  { key: "image", label: "Floor Plan Image", kind: "image" },
  { key: "downloadUrl", label: "Download URL", kind: "text", placeholder: "https://... or #enquire" },
];

export const AMENITY_FIELDS: ItemFieldDef[] = [
  { key: "title", label: "Title", kind: "text", placeholder: "e.g. Swimming Pool" },
  { key: "description", label: "Description", kind: "textarea", placeholder: "Short description" },
  { key: "image", label: "Image (optional)", kind: "image" },
  { key: "icon", label: "Icon (optional if image used)", kind: "icon" },
  { key: "cardBg", label: "Card Color (optional)", kind: "text", placeholder: "e.g. #ffffff or #f8fafc" },
];

/**
 * Infer editable fields from an existing item so legacy lists keep working
 * without an explicit schema, while the reserved `_id` stays hidden.
 */
export function inferItemFields(
  item: Record<string, unknown> | undefined,
): ItemFieldDef[] {
  if (!item) return [];
  return Object.entries(item)
    .filter(([key]) => key !== ITEM_ID_KEY && !key.startsWith("_"))
    .map(([key, value]) => {
      const kind = kindForKey(key, value);
      const def: ItemFieldDef = { key, kind, label: humanizeFieldLabel(key) };
      if (kind === "textarea") def.rows = 3;
      return def;
    });
}

const FIELD_CLS =
  "w-full px-2 py-1.5 rounded border border-border-subtle bg-bg-3 text-text-0 text-[11px] outline-none focus:border-green";

/** Render one item's content fields. Shared by every list editor. */
export function ItemFields({
  item,
  fields,
  onChange,
}: {
  item: Record<string, unknown>;
  fields?: ItemFieldDef[];
  onChange: (key: string, value: unknown) => void;
}) {
  const resolved = fields?.length ? fields : inferItemFields(item);

  return (
    <div className="space-y-1.5">
      {resolved.map((field) => {
        const value = item[field.key];
        const label = field.label ?? field.key;

        if (field.render) {
          return (
            <div key={field.key}>
              <p className="text-[10px] text-text-3 mb-0.5">{label}</p>
              {field.render(value, (next) => onChange(field.key, next))}
            </div>
          );
        }

        if (field.kind === "image" || field.kind === "icon") {
          return (
            <MediaPicker
              key={field.key}
              kind={field.kind}
              label={label}
              value={String(value ?? "")}
              compact
              onChange={(v) => onChange(field.key, v)}
            />
          );
        }

        if (field.kind === "toggle") {
          return (
            <label
              key={field.key}
              className="flex items-center justify-between px-2 py-1.5 rounded border border-border-subtle bg-bg-3 cursor-pointer"
            >
              <span className="text-[11px] text-text-1">{label}</span>
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => onChange(field.key, e.target.checked)}
                className="w-3.5 h-3.5 accent-green cursor-pointer"
              />
            </label>
          );
        }

        if (field.kind === "select") {
          return (
            <div key={field.key}>
              <p className="text-[10px] text-text-3 mb-0.5">{label}</p>
              <select
                value={String(value ?? "")}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={`${FIELD_CLS} cursor-pointer`}
              >
                {(field.options || [""]).map((o) => (
                  <option key={o} value={o}>
                    {o || "—"}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (field.kind === "textarea") {
          return (
            <div key={field.key}>
              <p className="text-[10px] text-text-3 mb-0.5">{label}</p>
              <textarea
                value={String(value ?? "")}
                onChange={(e) => onChange(field.key, e.target.value)}
                rows={field.rows ?? 3}
                placeholder={field.placeholder}
                className={`${FIELD_CLS} resize-y`}
              />
            </div>
          );
        }

        return (
          <div key={field.key}>
            <p className="text-[10px] text-text-3 mb-0.5">{label}</p>
            <input
              type={field.kind === "number" ? "number" : "text"}
              value={String(value ?? "")}
              onChange={(e) =>
                onChange(field.key, field.kind === "number" ? Number(e.target.value) : e.target.value)
              }
              placeholder={field.placeholder}
              className={FIELD_CLS}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Best-effort human label for a list item. */
export function itemDisplayName(
  item: Record<string, unknown>,
  keys: string[] = ["title", "label", "name", "text", "heading", "src", "image"],
): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}