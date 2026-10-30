"use client";

import type { ReactNode } from "react";
import { ITEM_ID_KEY } from "@/components/openpage/blocks/types";
import { MediaPicker } from "@/components/media-picker";

export type ItemFieldKind = "text" | "textarea" | "select" | "image" | "icon" | "toggle" | "number" | "color" | "array-strings";

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
  if (key.toLowerCase().includes("color") || key.toLowerCase().endsWith("bg")) return "color";
  if (Array.isArray(sample)) return "array-strings";
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
  { key: "iconColor", label: "Icon Color", kind: "color" },
  { key: "iconBg", label: "Icon Background", kind: "color" },
  { key: "cardBg", label: "Card Color (optional)", kind: "color", placeholder: "#ffffff" },
];

export const ICON_BOX_FIELDS: ItemFieldDef[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "icon", label: "Icon / Image", kind: "icon" },
  { key: "iconColor", label: "Icon Color", kind: "color" },
  { key: "iconBg", label: "Icon Background", kind: "color" },
  { key: "cardBg", label: "Card Background", kind: "color" },
  { key: "textColor", label: "Title Color", kind: "color" },
  { key: "link", label: "Link URL", kind: "text" },
  { key: "target", label: "Link target", kind: "select", options: ["_self", "_blank"] },
];

export const PRICING_TIER_FIELDS: ItemFieldDef[] = [
  { key: "name", label: "Plan name", kind: "text" },
  { key: "price", label: "Price", kind: "text" },
  { key: "period", label: "Billing period", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "features", label: "Features", kind: "array-strings" },
  { key: "cta", label: "Button text", kind: "text" },
  { key: "featured", label: "Featured", kind: "toggle" },
];

/** Default card button text — keep in sync with RePricingBlock's fallback. */
export const RE_PRICING_CARD_CTA_DEFAULT = "Enquire";

export const RE_PRICING_CARD_FIELDS: ItemFieldDef[] = [
  { key: "name", label: "Plan Name", kind: "text", placeholder: "e.g. 2 BHK" },
  { key: "price", label: "Price", kind: "text", placeholder: "e.g. ₹ 1.42 Cr*" },
  { key: "meta", label: "Note", kind: "text", placeholder: "e.g. 1,250 sq.ft." },
  { key: "description", label: "Description (optional)", kind: "textarea", rows: 3, placeholder: "e.g. Size 1325 - 1350 Sq. Ft." },
  {
    key: "cta",
    label: "Button text (clear to hide the button)",
    // Older cards have no `cta` key and still render the default text, so
    // show that here instead of an empty box that doesn't match the canvas.
    render: (value, update) => (
      <input
        type="text"
        value={typeof value === "string" ? value : RE_PRICING_CARD_CTA_DEFAULT}
        placeholder="Button hidden"
        onChange={(e) => update(e.target.value)}
        className={FIELD_CLS}
      />
    ),
  },
  { key: "url", label: "Button URL", kind: "text", placeholder: "https://… or #enquire" },
  { key: "priceColor", label: "Price color (this card)", kind: "color" },
];

export const FEATURE_FIELDS: ItemFieldDef[] = [
  { key: "icon", label: "Icon", kind: "icon" },
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea", rows: 3 },
  { key: "image", label: "Image (alternating template)", kind: "image" },
  { key: "label", label: "Small label (optional)", kind: "text" },
  { key: "tags", label: "Tags (optional)", kind: "array-strings" },
];

export const OVERVIEW_HIGHLIGHT_FIELDS: ItemFieldDef[] = [
  { key: "title", label: "Highlight", kind: "text", placeholder: "e.g. 4-Side Ventilated Homes" },
  { key: "description", label: "Description (optional)", kind: "textarea", rows: 2 },
  // Replaces the check mark (or step number) when set.
  { key: "icon", label: "Logo / icon (optional)", kind: "icon" },
];

/** Project Overview "Slider images" (centered template slideshow). */
export const OVERVIEW_SLIDE_FIELDS: ItemFieldDef[] = [
  { key: "image", label: "Image", kind: "image" },
  { key: "caption", label: "Caption (optional)", kind: "text", placeholder: "e.g. Artistic impression" },
];

export const TESTIMONIAL_FIELDS: ItemFieldDef[] = [
  { key: "name", label: "Name", kind: "text", placeholder: "e.g. Priya Sharma" },
  { key: "role", label: "Role / detail", kind: "text", placeholder: "e.g. Homeowner, Tower B" },
  { key: "quote", label: "Quote", kind: "textarea", rows: 3 },
  { key: "avatar", label: "Photo (optional)", kind: "image" },
  { key: "rating", label: "Star rating (optional)", kind: "select", options: ["", "1", "2", "3", "4", "5"] },
];

export const FOOTER_LINK_FIELDS: ItemFieldDef[] = [
  { key: "label", label: "Label", kind: "text", placeholder: "e.g. Privacy Policy" },
  { key: "url", label: "URL", kind: "text", placeholder: "https://… or #section-id" },
];

export const FOOTER_SOCIAL_FIELDS: ItemFieldDef[] = [
  { key: "label", label: "Name", kind: "text", placeholder: "e.g. Instagram" },
  { key: "url", label: "Profile URL", kind: "text", placeholder: "https://instagram.com/…" },
  { key: "icon", label: "Logo (optional — the name shows without one)", kind: "icon" },
];

export const FOOTER_COLUMN_FIELDS: ItemFieldDef[] = [
  { key: "title", label: "Column title", kind: "text", placeholder: "e.g. Explore" },
  {
    key: "links",
    label: "Links — one per line, as Label | URL",
    kind: "textarea",
    rows: 5,
    placeholder: "Overview | #overview\nAmenities | #amenities\nPrivacy | https://…",
  },
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

        if (field.kind === "color") {
          const color = String(value ?? "");
          const picker = /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
          return (
            <div key={field.key}>
              <p className="text-[10px] text-text-3 mb-0.5">{label}</p>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={picker}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  aria-label={`${label} picker`}
                  className="h-7 w-8 rounded border border-border-subtle bg-bg-3 p-1"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder ?? "#ffffff"}
                  aria-label={`${label} value`}
                  className={`${FIELD_CLS} flex-1`}
                />
              </div>
            </div>
          );
        }

        if (field.kind === "array-strings") {
          const values = Array.isArray(value) ? value.map(String) : [];
          return (
            <div key={field.key}>
              <p className="text-[10px] text-text-3 mb-0.5">{label}</p>
              <div className="space-y-1">
                {values.map((entry, index) => (
                  <div key={index} className="flex gap-1">
                    <input
                      type="text"
                      value={entry}
                      onChange={(e) => {
                        const next = [...values];
                        next[index] = e.target.value;
                        onChange(field.key, next);
                      }}
                      className={`${FIELD_CLS} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => onChange(field.key, values.filter((_, i) => i !== index))}
                      className="px-1 text-text-3 hover:text-status-red"
                    >
                      x
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => onChange(field.key, [...values, ""])} className="text-[10px] text-green">
                  + Add value
                </button>
              </div>
            </div>
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
                onChange(field.key, field.kind === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)
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