import type { BlockConfig, ElementId } from "../types";
import { listElementId } from "@/lib/openpage/element-style";

/** Small, defensive readers for widget props (props are user-editable JSON). */
export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : fallback;
}

export function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Booleans may be stored as true/false or as the strings "true"/"false". */
export function flag(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export function list<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as T[]) : [];
}

export function strings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  return [];
}

/** Element id for a named part of the block, e.g. `alert:title`. */
export function part(block: BlockConfig, key: string): ElementId {
  return `${block.type}:${key}` as ElementId;
}

/** Element id for one list item (matches what the list editor styles). */
export function itemId(path: string, item: Record<string, unknown>, index: number): ElementId {
  return listElementId({ path: [path] }, typeof item._id === "string" ? item._id : `legacy_${index}`);
}

/** Only http(s), relative, anchor, mailto and tel links; anything else is dropped. */
export function safeHref(v: unknown): string {
  const href = str(v).trim();
  if (!href) return "";
  if (/^(https?:|mailto:|tel:|#|\/|\?)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return "";
  return href;
}

export function alignClass(v: unknown, fallback: "left" | "center" | "right" = "left"): string {
  const a = v === "left" || v === "center" || v === "right" ? v : fallback;
  return a === "center" ? "text-center justify-center" : a === "right" ? "text-right justify-end" : "text-left justify-start";
}

/** A CSS colour from the inspector, or undefined (keeps theme colours). */
export function color(v: unknown): string | undefined {
  const c = str(v).trim();
  return c && !/[;{}<>]/.test(c) ? c : undefined;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
