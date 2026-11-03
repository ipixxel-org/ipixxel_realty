"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BedDouble, Calendar, ChevronLeft, ChevronRight, MapPin, Maximize2 } from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { subElementId } from "@/lib/openpage/element-style";
import { clamp, color, flag, itemId, list, num, part, prefersReducedMotion, safeHref, str } from "./shared";
import { Stars } from "./HighlightWidgets";

function SectionHeading({ block, fallback }: { block: BlockConfig; fallback?: string }) {
  const title = str(block.props.title, fallback ?? "");
  const subtitle = str(block.props.subtitle);
  if (!title && !subtitle) return null;
  return (
    <div className="text-center max-w-2xl mx-auto mb-8">
      {title ? (
        <El block={block} id={part(block, "title")} as="h2" className="font-display font-semibold text-3xl @md:text-4xl tracking-tight">
          {title}
        </El>
      ) : null}
      {subtitle ? (
        <El block={block} id={part(block, "subtitle")} as="p" className="mt-2 text-text-2">
          {subtitle}
        </El>
      ) : null}
    </div>
  );
}

function Img({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={`w-full h-full object-cover ${className ?? ""}`} />
  ) : (
    <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
  );
}

/* ------------------------------------------------------------------ */
/* Property Carousel (Loop Carousel)                                   */
/* ------------------------------------------------------------------ */

export function PropertyCarouselBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const perView = clamp(Math.round(num(p.slidesPerView, 3)), 1, 4);
  const autoplay = flag(p.autoplay, false);
  const interval = clamp(num(p.interval, 5000), 2000, 20000);
  const editing = useElementEditor()?.isEditing === true;
  const track = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  const scroll = useCallback((dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-op-slide]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (dir === 1 && atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!autoplay || editing || paused || items.length <= perView || prefersReducedMotion()) return;
    const t = setInterval(() => scroll(1), interval);
    return () => clearInterval(t);
  }, [autoplay, editing, paused, interval, items.length, perView, scroll]);

  // Phone: one card and a peek; tablet: two; desktop: the chosen number.
  const basis = `calc((100% - ${(perView - 1) * 20}px) / ${perView})`;
  return (
    <section className="px-6 @md:px-10 py-12">
      <div className="max-w-6xl mx-auto">
        <SectionHeading block={block} />
        <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div
            ref={track}
            className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ ["--op-slide" as string]: basis }}
          >
            {items.map((item, i) => {
              const id = itemId("items", item, i);
              const href = safeHref(item.url);
              const status = str(item.status);
              const card = (
                <El block={block} id={id} className="h-full rounded-2xl border border-border-default bg-bg-1 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                  <div className="relative aspect-[4/3] bg-bg-3">
                    <Img src={str(item.image)} alt={str(item.title)} />
                    {status ? (
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-slate-900 text-[11px] font-semibold shadow-sm">{status}</span>
                    ) : null}
                  </div>
                  <div className="p-5 flex flex-col gap-2 flex-1">
                    <El block={block} id={subElementId(id, "title")} as="h3" className="font-semibold text-lg text-text-0">
                      {str(item.title, "Property")}
                    </El>
                    {str(item.location) ? (
                      <p className="flex items-center gap-1.5 text-sm text-text-2"><MapPin size={14} className="shrink-0" />{str(item.location)}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
                      {str(item.config) ? <span className="flex items-center gap-1"><BedDouble size={13} />{str(item.config)}</span> : null}
                      {str(item.area) ? <span className="flex items-center gap-1"><Maximize2 size={13} />{str(item.area)}</span> : null}
                    </div>
                    <div className="mt-auto pt-3 flex items-center justify-between gap-2 border-t border-border-default">
                      <El block={block} id={subElementId(id, "price")} as="span" className="font-semibold text-green" style={{ color: color(p.priceColor) }}>
                        {str(item.price)}
                      </El>
                      {href ? (
                        <span className="text-sm font-medium text-text-1 flex items-center gap-1">
                          {str(p.buttonText, "View")} <ArrowRight size={14} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </El>
              );
              return (
                <div key={id} data-op-slide="" className="snap-start shrink-0 w-[85%] @md:w-[calc((100%-20px)/2)] @4xl:w-[var(--op-slide)]">
                  {href ? <a href={href} className="block h-full">{card}</a> : card}
                </div>
              );
            })}
          </div>
          {items.length > 1 ? (
            <div className="flex justify-center gap-2 mt-5">
              <button type="button" aria-label="Previous" onClick={() => scroll(-1)} className="w-10 h-10 rounded-full border border-border-default bg-bg-1 flex items-center justify-center hover:bg-bg-3">
                <ChevronLeft size={18} />
              </button>
              <button type="button" aria-label="Next" onClick={() => scroll(1)} className="w-10 h-10 rounded-full border border-border-default bg-bg-1 flex items-center justify-center hover:bg-bg-3">
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Project Updates / Posts                                             */
/* ------------------------------------------------------------------ */

const COLS: Record<number, string> = { 1: "", 2: "@md:grid-cols-2", 3: "@md:grid-cols-2 @4xl:grid-cols-3", 4: "@md:grid-cols-2 @4xl:grid-cols-4" };

export function PostsBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const cols = clamp(Math.round(num(p.columns, 3)), 1, 4);
  const listView = block.variant === "list";
  const showExcerpt = flag(p.showExcerpt, true);
  const readMore = str(p.readMoreText, "Read more");
  return (
    <section className="px-6 @md:px-10 py-12">
      <div className="max-w-6xl mx-auto">
        <SectionHeading block={block} />
        <div className={listView ? "space-y-5 max-w-4xl mx-auto" : `grid grid-cols-1 ${COLS[cols]} gap-6`}>
          {items.map((item, i) => {
            const id = itemId("items", item, i);
            const href = safeHref(item.url);
            const meta = [str(item.category), str(item.date)].filter(Boolean);
            return (
              <El key={id} block={block} id={id} as="article" className={`rounded-2xl border border-border-default bg-bg-1 overflow-hidden shadow-sm ${listView ? "flex flex-col @md:flex-row" : "flex flex-col"}`}>
                <div className={`bg-bg-3 ${listView ? "aspect-[16/10] @md:aspect-auto @md:w-72 shrink-0" : "aspect-[16/10]"}`}>
                  <Img src={str(item.image)} alt={str(item.title)} />
                </div>
                <div className="p-5 flex flex-col gap-2 flex-1">
                  {meta.length ? (
                    <p className="flex items-center gap-1.5 text-xs text-text-3 uppercase tracking-wider">
                      <Calendar size={12} /> {meta.join(" · ")}
                    </p>
                  ) : null}
                  <El block={block} id={subElementId(id, "title")} as="h3" className="font-semibold text-lg text-text-0 leading-snug">
                    {href ? <a href={href} className="hover:text-green">{str(item.title, "Update title")}</a> : str(item.title, "Update title")}
                  </El>
                  {showExcerpt && str(item.excerpt) ? (
                    <El block={block} id={subElementId(id, "excerpt")} as="p" className="text-sm text-text-2 line-clamp-3">
                      {str(item.excerpt)}
                    </El>
                  ) : null}
                  {href && readMore ? (
                    <a href={href} className="mt-auto pt-2 text-sm font-semibold text-green inline-flex items-center gap-1">
                      {readMore} <ArrowRight size={14} />
                    </a>
                  ) : null}
                </div>
              </El>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio (completed projects with category filter)                 */
/* ------------------------------------------------------------------ */

export function PortfolioBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const cols = clamp(Math.round(num(p.columns, 3)), 1, 4);
  const allLabel = str(p.allLabel, "All");
  const categories = useMemo(() => [...new Set(items.map((it) => str(it.category).trim()).filter(Boolean))], [items]);
  const [active, setActive] = useState("");
  const showFilter = flag(p.showFilter, true) && categories.length > 1;
  const shown = active ? items.filter((it) => str(it.category).trim() === active) : items;
  return (
    <section className="px-6 @md:px-10 py-12">
      <div className="max-w-6xl mx-auto">
        <SectionHeading block={block} />
        {showFilter ? (
          <div role="tablist" aria-label="Filter projects" className="flex flex-wrap justify-center gap-2 mb-8">
            {["", ...categories].map((c) => (
              <button
                key={c || "all"}
                type="button"
                role="tab"
                aria-selected={active === c}
                onClick={() => setActive(c)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${active === c ? "bg-text-0 text-bg-1" : "border border-border-default text-text-2 hover:text-text-0"}`}
              >
                {c || allLabel}
              </button>
            ))}
          </div>
        ) : null}
        <div className={`grid grid-cols-1 ${COLS[cols]} gap-5`}>
          {shown.map((item) => {
            const i = items.indexOf(item);
            const id = itemId("items", item, i);
            const href = safeHref(item.url);
            const tile = (
              <El block={block} id={id} className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-bg-3">
                <Img src={str(item.image)} alt={str(item.title)} className="transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  {str(item.status) ? <span className="inline-block mb-2 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur text-[11px] font-semibold">{str(item.status)}</span> : null}
                  <El block={block} id={subElementId(id, "title")} as="h3" className="font-semibold text-lg leading-snug">
                    {str(item.title, "Project")}
                  </El>
                  {str(item.location) ? <p className="text-sm text-white/80 flex items-center gap-1 mt-0.5"><MapPin size={13} />{str(item.location)}</p> : null}
                </div>
              </El>
            );
            return href ? <a key={id} href={href} className="block">{tile}</a> : <div key={id}>{tile}</div>;
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export function averageRating(items: Array<Record<string, unknown>>): number {
  const rated = items.map((it) => num(it.rating, NaN)).filter((n) => Number.isFinite(n) && n > 0);
  if (!rated.length) return 0;
  return Math.round((rated.reduce((a, b) => a + clamp(b, 0, 5), 0) / rated.length) * 10) / 10;
}

export function ReviewsBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const manual = num(p.averageRating, NaN);
  const avg = Number.isFinite(manual) && manual > 0 ? clamp(manual, 0, 5) : averageRating(items);
  const total = Math.max(Math.round(num(p.totalReviews, items.length)), items.length);
  const starColour = color(p.starColor);
  return (
    <section className="px-6 @md:px-10 py-12">
      <div className="max-w-6xl mx-auto">
        <SectionHeading block={block} />
        {flag(p.showSummary, true) && avg > 0 ? (
          <div className="flex flex-col items-center gap-1.5 mb-8">
            <span className="font-display text-4xl font-semibold">{avg.toFixed(1)}</span>
            <Stars rating={avg} size={22} colour={starColour} />
            <span className="text-sm text-text-2">Based on {total} review{total === 1 ? "" : "s"}</span>
          </div>
        ) : null}
        <div className="grid grid-cols-1 @md:grid-cols-2 @4xl:grid-cols-3 gap-5">
          {items.map((item, i) => {
            const id = itemId("items", item, i);
            const avatar = str(item.avatar);
            const author = str(item.author, "Customer");
            return (
              <El key={id} block={block} id={id} as="article" className="rounded-2xl border border-border-default bg-bg-1 p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Stars rating={clamp(num(item.rating, 5), 0, 5)} size={16} colour={starColour} />
                  {str(item.source) ? <span className="text-[11px] text-text-3 uppercase tracking-wider">{str(item.source)}</span> : null}
                </div>
                <El block={block} id={subElementId(id, "text")} as="p" className="text-sm text-text-1 leading-relaxed whitespace-pre-line">
                  {str(item.text)}
                </El>
                <div className="mt-auto flex items-center gap-3 pt-2">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-green/15 text-green font-semibold text-sm flex items-center justify-center shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : author.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <El block={block} id={subElementId(id, "author")} as="p" className="text-sm font-semibold text-text-0 truncate">
                      {author}
                    </El>
                    {str(item.date) ? <p className="text-xs text-text-3">{str(item.date)}</p> : null}
                  </div>
                </div>
              </El>
            );
          })}
        </div>
      </div>
    </section>
  );
}
