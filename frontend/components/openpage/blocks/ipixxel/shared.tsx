"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode, type TouchEvent } from "react";
import { ArrowRight, ImageIcon } from "lucide-react";
import type { BlockConfig, ElementId } from "../types";
import { El, useElementEditor } from "../El";
import { CtaButton } from "../CtaButton";
import { color, itemId, list, part, prefersReducedMotion, safeHref, str } from "../elements/shared";
import { subElementId } from "@/lib/openpage/element-style";
import { isMediaSrc } from "@/lib/media";

/**
 * Shared building blocks for the iPixxel Realty widgets.
 *
 * Every widget has one template per design family:
 *   - "burgundy" — serif headings with an italic accent line, cream / wine
 *   - "eldeco"   — spaced capital titles, bronze gradient buttons
 *   - "tarc"     — light sans titles, gold accents, circled "Know More" arrows
 *   - "emerald"  — deep green sections, gold Cinzel titles, gold gradient buttons
 *   - "modern"   — clean white / black sections, tight sans titles, rounded cards, pill buttons
 *
 * Every text is an {@link El} keyed `${type}:${prop}` (lists: per item), so it
 * can be restyled from the Element tab; the section itself takes the Style tab.
 */

export type Family = "burgundy" | "eldeco" | "tarc" | "emerald" | "modern";

export const SERIF = "'Times New Roman', Tinos, Times, Georgia, serif";
export const MONTSERRAT = "'Montserrat', 'Helvetica Neue', Arial, sans-serif";
export const HELVETICA = "'Helvetica Neue', Helvetica, Arial, sans-serif";
export const CINZEL = "'Cinzel', 'Trajan Pro', Georgia, serif";
export const POPPINS = "'Poppins', 'Helvetica Neue', Arial, sans-serif";
export const INTER = "'Inter', 'Helvetica Neue', Arial, sans-serif";
export const INTER_TIGHT = "'Inter Tight', 'Inter', 'Helvetica Neue', Arial, sans-serif";

export const FAMILY: Record<Family, { accent: string; cream: string; ink: string; body: string; font: string }> = {
  burgundy: { accent: "#6b0f2a", cream: "#f8f4ef", ink: "#3b3b3b", body: "#555555", font: HELVETICA },
  eldeco: { accent: "#8a5a3c", cream: "#fbf8f1", ink: "#2b2b2b", body: "#333333", font: MONTSERRAT },
  tarc: { accent: "#b08d57", cream: "#f3ece2", ink: "#222222", body: "#2b2b2b", font: HELVETICA },
  emerald: { accent: "#c9a45c", cream: "#0b3b31", ink: "#ffffff", body: "rgba(255,255,255,0.88)", font: POPPINS },
  modern: { accent: "#8a877d", cream: "#f4f4f4", ink: "#0b0b0b", body: "#4b4b4b", font: INTER },
};

export const BURGUNDY_GOLD = "#c9a36a";
export const BRONZE = "linear-gradient(100deg, #8b5a2b 0%, #b5814f 45%, #93613a 70%, #7e4f26 100%)";
/** Emerald family gold button. */
export const GOLD_GRADIENT = "linear-gradient(90deg, #f8e7bd 0%, #e2c38d 35%, #bd915a 75%, #a97b45 100%)";

/** Which design family a template belongs to, from its name prefix. */
export function familyOf(variant: string): Family {
  if (variant.startsWith("eldeco")) return "eldeco";
  if (variant.startsWith("tarc")) return "tarc";
  if (variant.startsWith("emerald")) return "emerald";
  if (variant.startsWith("modern")) return "modern";
  return "burgundy";
}

/** The widget's own variant, or its first one when unknown. */
export function pickVariant(block: BlockConfig, variants: readonly string[]): string {
  return variants.includes(block.variant ?? "") ? (block.variant as string) : variants[0];
}

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900" +
  "&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400;1,600;1,700&display=swap";

/** Adds the Montserrat / Playfair stylesheet once per page (CSS fallbacks cover a failed load). */
export function useIpxFonts() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector("link[data-ipixxel-hero-fonts]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_URL;
    link.setAttribute("data-ipixxel-hero-fonts", "");
    document.head.appendChild(link);
  }, []);
}

const EMERALD_FONTS_URL = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap";

/** Adds the Cinzel / Poppins stylesheet (emerald templates) once per page. */
export function useEmeraldFonts() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector("link[data-ipixxel-emerald-fonts]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = EMERALD_FONTS_URL;
    link.setAttribute("data-ipixxel-emerald-fonts", "");
    document.head.appendChild(link);
  }, []);
}

const MODERN_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Inter+Tight:wght@500;600;700&display=swap";

/** Adds the Inter / Inter Tight stylesheet (modern templates) once per page. */
export function useModernFonts() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector("link[data-ipixxel-modern-fonts]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MODERN_FONTS_URL;
    link.setAttribute("data-ipixxel-modern-fonts", "");
    document.head.appendChild(link);
  }, []);
}

/** Context handed to every template renderer. */
export interface Ctx {
  block: BlockConfig;
  p: Record<string, unknown>;
  family: Family;
  accent: string;
}

export function makeCtx(block: BlockConfig, variant: string): Ctx {
  const family = familyOf(variant);
  return { block, p: block.props, family, accent: color(block.props.accentColor) ?? FAMILY[family].accent };
}

/** Section wrapper: anchor id, accent variable and the family's base font. */
export function Shell({
  ctx,
  className = "",
  style,
  children,
}: {
  ctx: Ctx;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  // Dark sections pass "text-white"; the family ink colour must not override it.
  const light = /(^|\s)text-white(\s|$)/.test(className);
  return (
    <section
      id={str(ctx.p.anchor) || undefined}
      className={`relative overflow-hidden ${className}`}
      style={{ "--ipx-accent": ctx.accent, fontFamily: FAMILY[ctx.family].font, color: light ? "#ffffff" : FAMILY[ctx.family].ink, ...style } as CSSProperties}
    >
      {children}
    </section>
  );
}

/** Centred content column. */
export function Wrap({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`relative mx-auto w-full max-w-[1120px] px-5 @3xl:px-8 ${className}`}>{children}</div>;
}

/** A prop shown as its own element; renders nothing while the prop is empty. */
export function Txt({
  ctx,
  k,
  as = "p",
  className,
  style,
  value,
}: {
  ctx: Ctx;
  k: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  value?: ReactNode;
}) {
  const v = value ?? str(ctx.p[k]);
  if (v === "" || v === null || v === undefined) return null;
  return (
    <El block={ctx.block} id={part(ctx.block, k)} as={as} className={className} style={style}>
      {v}
    </El>
  );
}

/** One list item with its element id and readers for its fields. */
export interface Item {
  raw: Record<string, unknown>;
  id: ElementId;
  index: number;
  get: (key: string) => string;
}

export function items(ctx: Ctx, key = "items"): Item[] {
  return list(ctx.p[key])
    .filter((it) => !it.hidden)
    .map((raw, index) => ({ raw, index, id: itemId(key, raw, index), get: (k: string) => str(raw[k]) }));
}

/** A field of a list item as its own element (styleable per item). */
export function ITxt({
  ctx,
  item,
  k,
  as = "p",
  className,
  style,
  value,
}: {
  ctx: Ctx;
  item: Item;
  k: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  value?: ReactNode;
}) {
  const v = value ?? item.get(k);
  if (v === "" || v === null || v === undefined) return null;
  return (
    <El block={ctx.block} id={subElementId(item.id, k)} as={as} className={className} style={style}>
      {v}
    </El>
  );
}

/** Lines of a textarea prop / item field. */
export function lines(v: unknown): string[] {
  return str(v)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A photo, or a soft placeholder until one is uploaded. */
export function Pic({
  src,
  alt = "",
  className = "",
  fit = "cover",
  tone = "light",
}: {
  src: string;
  alt?: string;
  className?: string;
  fit?: "cover" | "contain";
  tone?: "light" | "dark";
}) {
  if (isMediaSrc(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} draggable={false} className={`${className} ${fit === "contain" ? "object-contain" : "object-cover"}`} />;
  }
  return (
    <div
      aria-hidden
      className={`${className} flex items-center justify-center ${tone === "dark" ? "text-white/30" : "text-black/20"}`}
      style={{
        backgroundImage:
          tone === "dark"
            ? "linear-gradient(135deg,#2a2a2a 0%,#4a4a4a 100%)"
            : "linear-gradient(135deg,#ece6dd 0%,#d9d2c6 100%)",
      }}
    >
      <ImageIcon className="w-8 h-8" strokeWidth={1.2} />
    </div>
  );
}

/** Icon from an uploaded image / SVG URL, else the given fallback. */
export function IconImg({ src, className, fallback }: { src: string; className: string; fallback: ReactNode }) {
  if (isMediaSrc(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" draggable={false} className={`${className} object-contain`} />;
  }
  return <>{fallback}</>;
}

/** "Artistic impression" label in a photo's corner. */
export function Caption({ text, className = "left-2 bottom-1.5" }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <span className={`absolute z-10 text-[10px] tracking-[0.06em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] ${className}`}>
      {text}
    </span>
  );
}

/** Scroll to an in-page section id (no-op on the server). */
export function scrollToAnchor(id: string) {
  if (typeof document === "undefined" || !id) return;
  document.getElementById(id.replace(/^#/, ""))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The widget's button, from `${prefix}` (text), `${prefix}Url`, `${prefix}Target`
 * and the usual colour props. Without a URL it scrolls to `${prefix}Anchor`
 * (default "enquire").
 */
export function Btn({
  ctx,
  prefix = "button",
  textKey,
  className,
  icon = null,
}: {
  ctx: Ctx;
  prefix?: string;
  textKey?: string;
  className: string;
  icon?: ReactNode;
}) {
  const label = str(ctx.p[textKey ?? `${prefix}Text`]);
  if (!label) return null;
  return (
      <CtaButton
        block={ctx.block}
        id={part(ctx.block, textKey ?? `${prefix}Text`)}
        prefix={prefix}
        label={label}
        href={safeHref(ctx.p[`${prefix}Url`])}
        target={str(ctx.p[`${prefix}Target`])}
        onClick={() => scrollToAnchor(str(ctx.p[`${prefix}Anchor`], "enquire"))}
        brand={null}
        icon={icon}
        className={className}
      />
  );
}

/** TARC-style "Know More ⟶(○)" link. */
export function KnowMore({
  ctx,
  prefix = "button",
  light = false,
  className = "",
}: {
  ctx: Ctx;
  prefix?: string;
  light?: boolean;
  className?: string;
}) {
  return (
    <Btn
      ctx={ctx}
      prefix={prefix}
      className={`group inline-flex items-center gap-3 bg-transparent text-[15px] tracking-[0.04em] ${light ? "text-white" : "text-[#1b1b1b]"} ${className}`}
      icon={
        <span className="relative inline-flex items-center">
          <span className={`block w-8 h-px ${light ? "bg-white" : "bg-[#1b1b1b]"}`} />
          <span className={`-ml-2 grid place-items-center w-12 h-12 @3xl:w-[62px] @3xl:h-[62px] rounded-full border ${light ? "border-white" : "border-[#1b1b1b]"} transition-transform group-hover:translate-x-1`}>
            <ArrowRight size={20} strokeWidth={1.2} className="-ml-5" />
          </span>
        </span>
      }
    />
  );
}

/** Burgundy eyebrow + two-line serif heading (second line italic, accent coloured). */
export function BurgundyHeading({
  ctx,
  dark = false,
  center = false,
  className = "",
}: {
  ctx: Ctx;
  dark?: boolean;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={`${center ? "text-center flex flex-col items-center" : ""} ${className}`}>
      {str(ctx.p.eyebrow) ? (
        <El
          block={ctx.block}
          id={part(ctx.block, "eyebrow")}
          className="inline-flex items-center gap-3 mb-5 text-[11px] font-semibold tracking-[0.32em] uppercase"
          style={{ color: dark ? BURGUNDY_GOLD : ctx.accent }}
        >
          <span>{str(ctx.p.eyebrow)}</span>
          <span aria-hidden className="block w-10 h-px" style={{ backgroundColor: dark ? BURGUNDY_GOLD : ctx.accent }} />
        </El>
      ) : null}
      <h2 className="leading-[1.08]" style={{ fontFamily: SERIF }}>
        <Txt ctx={ctx} k="title" as="span" className={`block text-[38px] @3xl:text-[56px] ${dark ? "text-white" : "text-[#3d3d3d]"}`} />
        <Txt
          ctx={ctx}
          k="titleAccent"
          as="span"
          className="block italic text-[38px] @3xl:text-[56px]"
          style={{ color: dark ? BURGUNDY_GOLD : ctx.accent }}
        />
      </h2>
      <Txt
        ctx={ctx}
        k="description"
        className={`mt-6 max-w-[620px] text-[15px] @3xl:text-[16px] leading-[1.9] whitespace-pre-line ${dark ? "text-white/65" : "text-[#555]"}`}
      />
    </div>
  );
}

/** Eldeco spaced-capitals title + subtitle, centred. */
export function EldecoHeading({ ctx, className = "" }: { ctx: Ctx; className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <Txt
        ctx={ctx}
        k="title"
        as="h2"
        className="uppercase font-medium tracking-[0.18em] text-[22px] @3xl:text-[26px]"
        style={{ color: ctx.accent, fontFamily: HELVETICA }}
      />
      <Txt ctx={ctx} k="subtitle" className="mt-5 tracking-[0.12em] text-[14px] @3xl:text-[16px]" style={{ color: ctx.accent }} />
    </div>
  );
}

/** TARC light sans title + spaced subtitle, centred. */
export function TarcHeading({ ctx, light = false, className = "" }: { ctx: Ctx; light?: boolean; className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <Txt
        ctx={ctx}
        k="title"
        as="h2"
        className={`font-normal tracking-[0.04em] text-[24px] @3xl:text-[28px] ${light ? "text-white" : "text-[#1f1f1f]"}`}
      />
      <Txt
        ctx={ctx}
        k="subtitle"
        className={`mt-4 mx-auto max-w-[720px] tracking-[0.14em] leading-[1.9] text-[13px] @3xl:text-[16px] ${light ? "text-white/90" : "text-[#1f1f1f]"}`}
      />
    </div>
  );
}

/** Index state for a carousel showing `perView` items at once. */
export function useSlider(count: number, opts: { perView?: number; autoplay?: boolean; interval?: number } = {}) {
  const perView = Math.max(1, opts.perView ?? 1);
  const editing = useElementEditor()?.isEditing === true;
  const maxStart = Math.max(0, count - perView);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const start = Math.min(index, maxStart);
  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => {
      const cur = Math.min(i, maxStart);
      const next = cur + dir;
      return next < 0 ? maxStart : next > maxStart ? 0 : next;
    }),
    [maxStart],
  );
  useEffect(() => {
    if (!opts.autoplay || editing || paused || maxStart === 0 || prefersReducedMotion()) return;
    const t = setInterval(() => go(1), Math.max(2000, opts.interval ?? 5000));
    return () => clearInterval(t);
  }, [opts.autoplay, opts.interval, editing, paused, maxStart, go]);

  const touchX = useRef<number | null>(null);
  const handlers = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onTouchStart: (e: TouchEvent) => {
      touchX.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = touchX.current;
      touchX.current = null;
      const end = e.changedTouches[0]?.clientX;
      if (s == null || end == null || Math.abs(end - s) < 40) return;
      go(end < s ? 1 : -1);
    },
  };
  return { start, go, setIndex, canSlide: maxStart > 0, pages: maxStart + 1, handlers };
}

/** Slides per view from the carousel's drawn width (phones get fewer). */
export function usePerView(desktop: number, tablet: number, mobile = 1) {
  const [w, setW] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const perView = w === null ? desktop : w < 560 ? mobile : w < 900 ? tablet : desktop;
  return { perView, ref };
}

/** Distinct, non-empty category names of a list, in first-seen order. */
export function categories(list: Item[], key = "category"): string[] {
  return [...new Set(list.map((it) => it.get(key).trim()).filter(Boolean))];
}
