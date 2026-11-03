"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Star } from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { isMediaSrc } from "@/lib/media";
import { subElementId } from "@/lib/openpage/element-style";
import { alignClass, clamp, color, flag, itemId, list, num, part, prefersReducedMotion, safeHref, str } from "./shared";
import { ListIcon } from "./TextWidgets";

/**
 * Runs `onVisible` once, the first time the element scrolls into view.
 * Browsers without IntersectionObserver never run it, so they simply keep
 * the final state (full number, full bar).
 */
function useOnVisible<T extends HTMLElement>(onVisible: () => void, enabled: boolean) {
  const ref = useRef<T>(null);
  const done = useRef(false);
  const cb = useRef(onVisible);
  useEffect(() => {
    cb.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || done.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !done.current) {
        done.current = true;
        io.disconnect();
        cb.current();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

/* ------------------------------------------------------------------ */
/* Counter                                                             */
/* ------------------------------------------------------------------ */

export function formatCounter(value: number, decimals: number, separator: boolean): string {
  const fixed = value.toFixed(decimals);
  if (!separator) return fixed;
  const [int, dec] = fixed.split(".");
  // Indian-style grouping is not assumed; plain thousands separators.
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `${grouped}.${dec}` : grouped;
}

export function CounterBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const start = num(p.start, 0);
  const end = num(p.end, 100);
  const duration = clamp(num(p.duration, 2000), 0, 20000);
  const decimals = (() => {
    const s = str(p.end);
    const d = s.includes(".") ? s.split(".")[1].length : 0;
    return clamp(d, 0, 3);
  })();
  const separator = flag(p.separator, true);
  const editing = useElementEditor()?.isEditing === true;
  // The final number is rendered first (no JavaScript, crawlers, builder);
  // on the live page it counts up when it scrolls into view.
  const [value, setValue] = useState(end);
  const ref = useOnVisible<HTMLDivElement>(() => {
    if (prefersReducedMotion() || duration === 0) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(start + (end - start) * eased);
      if (k < 1) requestAnimationFrame(tick);
    };
    setValue(start);
    requestAnimationFrame(tick);
  }, !editing);
  const shown = editing ? end : value;

  return (
    <section className="px-6 @md:px-10 py-6">
      <div ref={ref} className={`flex flex-col ${alignClass(p.align, "center")} ${str(p.align) === "left" ? "items-start" : str(p.align) === "right" ? "items-end" : "items-center"}`}>
        <El block={block} id={part(block, "number")} className="font-display font-semibold text-4xl @md:text-5xl text-green tabular-nums" style={{ color: color(p.numberColor) }}>
          {str(p.prefix)}
          {formatCounter(shown, decimals, separator)}
          {str(p.suffix)}
        </El>
        {str(p.title) ? (
          <El block={block} id={part(block, "title")} as="p" className="mt-1 text-text-2 text-sm @md:text-base">
            {str(p.title)}
          </El>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Star Rating                                                         */
/* ------------------------------------------------------------------ */

export function Stars({ rating, scale = 5, size = 18, colour }: { rating: number; scale?: number; size?: number; colour?: string }) {
  const value = clamp(rating, 0, scale);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rated ${value} out of ${scale}`}>
      {Array.from({ length: scale }, (_, i) => {
        const fill = clamp(value - i, 0, 1);
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-slate-300" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="text-amber-400" style={{ color: colour }} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function StarRatingBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const scale = num(p.scale, 5) === 10 ? 10 : 5;
  const rating = clamp(num(p.rating, 4.5), 0, scale);
  const size = clamp(num(p.size, 20), 10, 48);
  return (
    <section className="px-6 @md:px-10 py-4">
      <div className={`flex flex-wrap items-center gap-2.5 ${alignClass(p.align, "center")}`}>
        {str(p.label) ? (
          <El block={block} id={part(block, "label")} as="span" className="text-text-1 text-sm font-medium">
            {str(p.label)}
          </El>
        ) : null}
        <Stars rating={rating} scale={scale} size={size} colour={color(p.starColor)} />
        {flag(p.showValue, true) ? <span className="text-text-2 text-sm tabular-nums">{rating}/{scale}</span> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Progress Bar                                                        */
/* ------------------------------------------------------------------ */

export function ProgressBarBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const height = clamp(num(p.height, 10), 4, 40);
  const editing = useElementEditor()?.isEditing === true;
  // Bars start full (no JavaScript / no observer); when the observer is
  // available they reset and grow as they scroll into view.
  const [grown, setGrown] = useState<boolean | null>(null);
  const ref = useOnVisible<HTMLDivElement>(() => setGrown(true), !editing);
  useEffect(() => {
    if (editing || typeof IntersectionObserver === "undefined" || prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Only below-the-fold bars animate; ones already on screen stay full.
    if (r.top > window.innerHeight) {
      const t = setTimeout(() => setGrown((g) => (g === null ? false : g)), 0);
      return () => clearTimeout(t);
    }
  }, [editing, ref]);
  const full = editing || grown !== false;
  const showPercent = flag(p.showPercent, true);
  return (
    <section className="px-6 @md:px-10 py-6">
      {str(p.title) ? (
        <El block={block} id={part(block, "title")} as="h3" className="font-display font-semibold text-xl mb-4">
          {str(p.title)}
        </El>
      ) : null}
      <div ref={ref} className="space-y-4">
        {items.map((item, i) => {
          const id = itemId("items", item, i);
          const pct = clamp(num(item.percent, 0), 0, 100);
          const inner = str(item.innerText);
          return (
            <El key={id} block={block} id={id}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5 text-sm">
                <El block={block} id={subElementId(id, "title")} as="span" className="font-medium text-text-0">
                  {str(item.title, "Progress")}
                </El>
                {showPercent ? <span className="text-text-2 tabular-nums">{pct}%</span> : null}
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label={str(item.title, "Progress")}
                className="w-full rounded-full bg-slate-200 overflow-hidden"
                style={{ height, backgroundColor: color(p.trackColor) }}
              >
                <div
                  className="h-full rounded-full bg-green transition-[width] duration-1000 ease-out flex items-center justify-end"
                  style={{ width: `${full ? pct : 0}%`, backgroundColor: color(item.color) || color(p.barColor) }}
                >
                  {inner && height >= 16 ? <span className="px-2 text-[11px] font-semibold text-white whitespace-nowrap">{inner}</span> : null}
                </div>
              </div>
            </El>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Price List                                                          */
/* ------------------------------------------------------------------ */

export function PriceListBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const sep = ["dotted", "dashed", "solid", "none"].includes(str(p.separator)) ? str(p.separator) : "dotted";
  return (
    <section className="px-6 @md:px-10 py-8">
      <div className="max-w-3xl mx-auto">
        {str(p.title) ? (
          <El block={block} id={part(block, "title")} as="h2" className="font-display font-semibold text-2xl @md:text-3xl mb-6 text-center">
            {str(p.title)}
          </El>
        ) : null}
        <ul className="space-y-5">
          {items.map((item, i) => {
            const id = itemId("items", item, i);
            const image = str(item.image);
            const href = safeHref(item.link);
            const row = (
              <div className="flex items-start gap-4">
                {image ? (
                  <El block={block} id={subElementId(id, "image")} className="w-16 h-16 @md:w-20 @md:h-20 rounded-xl overflow-hidden shrink-0 bg-bg-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt={str(item.title)} className="w-full h-full object-cover" />
                  </El>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <El block={block} id={subElementId(id, "title")} as="span" className="font-semibold text-text-0">
                      {str(item.title, "Unit type")}
                    </El>
                    {sep !== "none" ? <span aria-hidden="true" className="flex-1 min-w-4 border-b-2 border-border-default translate-y-[-3px]" style={{ borderBottomStyle: sep as "dotted" }} /> : <span className="flex-1" />}
                    <El block={block} id={subElementId(id, "price")} as="span" className="font-semibold text-green whitespace-nowrap" style={{ color: color(p.priceColor) }}>
                      {str(item.price)}
                    </El>
                  </div>
                  {str(item.description) ? (
                    <El block={block} id={subElementId(id, "description")} as="p" className="text-text-2 text-sm mt-1">
                      {str(item.description)}
                    </El>
                  ) : null}
                </div>
              </div>
            );
            return (
              <El key={id} block={block} id={id} as="li">
                {href ? <a href={href} className="block hover:opacity-85">{row}</a> : row}
              </El>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Flip Box                                                            */
/* ------------------------------------------------------------------ */

const FLIP: Record<string, string> = {
  left: "rotateY(-180deg)",
  right: "rotateY(180deg)",
  up: "rotateX(180deg)",
  down: "rotateX(-180deg)",
};

export function FlipBoxBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const [flipped, setFlipped] = useState(false);
  const turn = FLIP[str(p.direction)] ?? FLIP.right;
  const height = clamp(num(p.height, 300), 160, 800);
  const frontImage = str(p.frontImage);
  const icon = str(p.frontIcon);
  const href = safeHref(p.buttonUrl);
  const face = "absolute inset-0 rounded-2xl overflow-hidden flex flex-col items-center justify-center text-center p-6 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]";
  return (
    <section className="px-6 @md:px-10 py-6">
      <div
        className="group relative max-w-md mx-auto [perspective:1200px]"
        style={{ height }}
        onMouseEnter={() => setFlipped(true)}
        onMouseLeave={() => setFlipped(false)}
        onFocus={() => setFlipped(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFlipped(false);
        }}
      >
        <div
          className="relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none"
          style={{ transform: flipped ? turn : "none" }}
        >
          <El block={block} id={part(block, "front")} className={`${face} bg-bg-2 border border-border-default`} style={{ backgroundColor: color(p.frontBg) }}>
            {frontImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frontImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40" />
              </>
            ) : null}
            <div className={`relative ${frontImage ? "text-white" : ""}`}>
              {icon ? (
                <div className="mx-auto mb-3 w-14 h-14 rounded-xl bg-green/10 flex items-center justify-center">
                  {isMediaSrc(icon) ? <ListIcon icon={icon} size={30} /> : <span className="text-2xl">{icon}</span>}
                </div>
              ) : null}
              <El block={block} id={part(block, "frontTitle")} as="h3" className="font-display font-semibold text-xl @md:text-2xl">
                {str(p.frontTitle, "Front title")}
              </El>
              {str(p.frontDescription) ? (
                <El block={block} id={part(block, "frontDescription")} as="p" className={`mt-2 text-sm ${frontImage ? "text-white/85" : "text-text-2"}`}>
                  {str(p.frontDescription)}
                </El>
              ) : null}
            </div>
            {/* Touch screens have no hover: a tap flips the box. */}
            <button
              type="button"
              aria-label="Show more"
              onClick={() => setFlipped(true)}
              className={`absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center ${frontImage ? "bg-white/20 text-white" : "bg-bg-3 text-text-1"}`}
            >
              <Plus size={16} />
            </button>
          </El>
          <El
            block={block}
            id={part(block, "back")}
            className={`${face} bg-green text-black`}
            style={{ transform: turn, backgroundColor: color(p.backBg), color: color(p.backTextColor) }}
          >
            <El block={block} id={part(block, "backTitle")} as="h3" className="font-display font-semibold text-xl @md:text-2xl">
              {str(p.backTitle, "Back title")}
            </El>
            {str(p.backDescription) ? (
              <El block={block} id={part(block, "backDescription")} as="p" className="mt-2 text-sm opacity-90 whitespace-pre-line">
                {str(p.backDescription)}
              </El>
            ) : null}
            {str(p.buttonText) ? (
              <a
                href={href || "#enquire"}
                className="mt-4 inline-flex px-5 py-2.5 rounded-lg bg-black/85 text-white text-sm font-semibold hover:bg-black"
                onClick={(e) => e.stopPropagation()}
              >
                {str(p.buttonText)}
              </a>
            ) : null}
            <button type="button" aria-label="Show front" onClick={() => setFlipped(false)} className="absolute top-3 right-3 px-2 py-1 text-[11px] rounded-md bg-black/10">
              Back
            </button>
          </El>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Hotspot (site plan / floor plan markers)                            */
/* ------------------------------------------------------------------ */

export function HotspotBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const image = str(p.image);
  const items = list(p.items);
  const [open, setOpen] = useState<number | null>(null);
  const markerColour = color(p.markerColor);
  const size = clamp(num(p.markerSize, 28), 16, 56);
  const hover = str(p.trigger) !== "click";
  return (
    <section className="px-6 @md:px-10 py-8">
      {str(p.title) ? (
        <El block={block} id={part(block, "title")} as="h2" className="font-display font-semibold text-2xl @md:text-3xl mb-5 text-center">
          {str(p.title)}
        </El>
      ) : null}
      <div className="relative max-w-5xl mx-auto rounded-2xl overflow-hidden bg-bg-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={str(p.imageAlt, "Site plan")} className="w-full h-auto block" />
        ) : (
          <div className="aspect-[16/9] flex items-center justify-center text-text-3 text-sm">Add a site plan or floor plan image</div>
        )}
        {items.map((item, i) => {
          const id = itemId("items", item, i);
          const x = clamp(num(item.x, 50), 0, 100);
          const y = clamp(num(item.y, 50), 0, 100);
          const isOpen = open === i;
          const href = safeHref(item.link);
          // Tooltips flip to the other side near the edges so they stay inside.
          const tipX = x > 70 ? "right-0" : x < 30 ? "left-0" : "left-1/2 -translate-x-1/2";
          const tipY = y < 30 ? "top-full mt-2" : "bottom-full mb-2";
          return (
            <div
              key={id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%`, zIndex: isOpen ? 20 : 10 }}
              onMouseEnter={hover ? () => setOpen(i) : undefined}
              onMouseLeave={hover ? () => setOpen(null) : undefined}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={str(item.label, `Marker ${i + 1}`)}
                onClick={() => setOpen(isOpen ? null : i)}
                className="relative rounded-full bg-green text-black font-bold text-xs flex items-center justify-center shadow-lg ring-4 ring-white/70"
                style={{ width: size, height: size, backgroundColor: markerColour }}
              >
                <span className="absolute inset-0 rounded-full bg-inherit animate-ping opacity-40 motion-reduce:animate-none" style={{ backgroundColor: markerColour }} />
                <span className="relative">{str(item.icon) || i + 1}</span>
              </button>
              {isOpen ? (
                <El block={block} id={id} className={`absolute ${tipX} ${tipY} w-56 rounded-xl bg-white text-slate-900 shadow-xl border border-slate-200 p-3 text-left`}>
                  <El block={block} id={subElementId(id, "label")} as="p" className="font-semibold text-sm">
                    {str(item.label, `Marker ${i + 1}`)}
                  </El>
                  {str(item.content) ? (
                    <El block={block} id={subElementId(id, "content")} as="p" className="text-xs text-slate-600 mt-1 whitespace-pre-line">
                      {str(item.content)}
                    </El>
                  ) : null}
                  {href ? (
                    <a href={href} className="mt-2 inline-block text-xs font-semibold text-green underline">
                      {str(item.linkText, "Learn more")}
                    </a>
                  ) : null}
                </El>
              ) : null}
            </div>
          );
        })}
      </div>
      {flag(p.showLegend, false) && items.length ? (
        <ol className="max-w-5xl mx-auto mt-4 grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-2 text-sm">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-text-1">
              <span className="w-6 h-6 rounded-full bg-green text-black text-[11px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: markerColour }}>
                {str(item.icon) || i + 1}
              </span>
              {str(item.label, `Marker ${i + 1}`)}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
