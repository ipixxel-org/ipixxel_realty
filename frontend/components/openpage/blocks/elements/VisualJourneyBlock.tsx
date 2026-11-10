"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { CtaButton } from "../CtaButton";
import { subElementId } from "@/lib/openpage/element-style";
import { clamp, color, flag, itemId, list, num, part, prefersReducedMotion, safeHref, str } from "./shared";

/** Default warm accent used for the title, divider, arrows and caption dot. */
const DEFAULT_ACCENT = "#9b7a5a";

/**
 * Visual Journey: a heading, an optional paragraph, then one large image at a
 * time with left / right arrows. Each image has its own name (e.g. "Pickle
 * Ball Court"), an optional corner badge (e.g. "AI Impression") and an
 * optional paragraph under it. An optional button sits at the bottom.
 */
export function VisualJourneyBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const slides = list(p.images).filter((s) => !s.hidden);
  const count = slides.length;
  const accent = color(p.accentColor) ?? DEFAULT_ACCENT;
  const arrowColor = color(p.arrowColor) ?? accent;
  const height = clamp(Math.round(num(p.imageHeight, 420)), 160, 900);
  const radius = clamp(Math.round(num(p.imageRadius, 14)), 0, 60);
  const autoplay = flag(p.autoplay, false);
  const interval = clamp(num(p.interval, 5000), 2000, 20000);
  const showDivider = flag(p.showDivider, true);
  const editing = useElementEditor()?.isEditing === true;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Keep the index valid when images are removed in the builder.
  const current = count ? ((index % count) + count) % count : 0;

  const go = useCallback((dir: 1 | -1) => {
    if (count < 2) return;
    setIndex((i) => (((i + dir) % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (!autoplay || editing || paused || count < 2 || prefersReducedMotion()) return;
    const t = setInterval(() => go(1), interval);
    return () => clearInterval(t);
  }, [autoplay, editing, paused, count, interval, go]);

  // Swipe on phones.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => { touchX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start == null || end == null || Math.abs(end - start) < 40) return;
    go(end < start ? 1 : -1);
  };

  const title = str(p.title);
  const description = str(p.description);
  const active = slides[current];
  const activeId = active ? itemId("images", active, current) : null;
  const caption = active ? str(active.caption) : "";
  const slideText = active ? str(active.description) : "";
  const buttonText = str(p.buttonText);

  const arrow = (dir: 1 | -1) => (
    <button
      type="button"
      aria-label={dir === 1 ? "Next image" : "Previous image"}
      onClick={(e) => {
        e.stopPropagation();
        go(dir);
      }}
      className="op-vj-arrow shrink-0 w-11 h-11 @md:w-14 @md:h-14 rounded-full border flex items-center justify-center transition-colors hover:bg-black/5 bg-white/70 @md:bg-transparent backdrop-blur-sm @md:backdrop-blur-none"
      style={{ color: arrowColor, borderColor: arrowColor }}
    >
      {dir === 1 ? <ArrowRight size={22} strokeWidth={1.5} /> : <ArrowLeft size={22} strokeWidth={1.5} />}
    </button>
  );

  return (
    <section id={str(p.anchor) || undefined} className="px-4 @md:px-10 py-12 @md:py-16">
      <div className="max-w-6xl mx-auto">
        {/* Heading + divider + optional paragraph */}
        {title || description ? (
          <div className="text-center max-w-2xl mx-auto mb-8 @md:mb-10">
            {title ? (
              <El
                block={block}
                id={part(block, "title")}
                as="h2"
                className="font-display text-2xl @md:text-3xl font-light tracking-[0.08em]"
                style={{ color: accent }}
              >
                {title}
              </El>
            ) : null}
            {title && showDivider ? (
              <div className="flex items-center justify-center gap-2 mt-3" aria-hidden="true">
                <span className="h-px w-20 @md:w-24 opacity-50" style={{ backgroundColor: accent }} />
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                <span className="h-px w-20 @md:w-24 opacity-50" style={{ backgroundColor: accent }} />
              </div>
            ) : null}
            {description ? (
              <El block={block} id={part(block, "description")} as="p" className="mt-4 text-text-2 text-[15px] leading-relaxed whitespace-pre-line">
                {description}
              </El>
            ) : null}
          </div>
        ) : null}

        {/* Slider: arrows beside the image on wider screens, over it on phones */}
        {count ? (
          <div
            className="relative flex items-center gap-3 @md:gap-8"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") go(-1);
              if (e.key === "ArrowRight") go(1);
            }}
          >
            {count > 1 ? <div className="absolute left-2 z-10 @md:static">{arrow(-1)}</div> : null}

            <div className="flex-1 min-w-0">
              <div
                className="relative overflow-hidden bg-bg-3"
                style={{ height, borderRadius: radius }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                aria-roledescription="carousel"
              >
                <div
                  className="flex h-full transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(-${current * 100}%)` }}
                >
                  {slides.map((s, i) => {
                    const id = itemId("images", s, i);
                    const src = str(s.src);
                    const badge = str(s.badge);
                    return (
                      <El
                        key={id}
                        block={block}
                        id={id}
                        className="relative w-full h-full shrink-0"
                        aria-hidden={i !== current}
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt={str(s.alt) || str(s.caption)}
                            loading={i === 0 ? "eager" : "lazy"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs text-slate-500">
                            Add an image
                          </div>
                        )}
                        {badge ? (
                          <El
                            block={block}
                            id={subElementId(id, "badge")}
                            as="span"
                            className="absolute bottom-3 right-4 text-[10px] tracking-wide text-white/90 drop-shadow"
                          >
                            {badge}
                          </El>
                        ) : null}
                      </El>
                    );
                  })}
                </div>
              </div>

              {/* Name and optional paragraph of the image on screen */}
              {caption && activeId ? (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} aria-hidden="true" />
                  <El block={block} id={subElementId(activeId, "caption")} as="span" className="text-xs @md:text-sm text-text-1 tracking-wide">
                    {caption}
                  </El>
                </div>
              ) : null}
              {slideText && activeId ? (
                <El
                  block={block}
                  id={subElementId(activeId, "description")}
                  as="p"
                  className="mt-2 text-center text-text-2 text-sm leading-relaxed max-w-2xl mx-auto whitespace-pre-line"
                >
                  {slideText}
                </El>
              ) : null}
              {count > 1 ? (
                <div className="sr-only" aria-live="polite">
                  Image {current + 1} of {count}
                </div>
              ) : null}
            </div>

            {count > 1 ? <div className="absolute right-2 z-10 @md:static">{arrow(1)}</div> : null}
          </div>
        ) : editing ? (
          <div className="rounded-xl border-2 border-dashed border-border-default p-10 text-center text-sm text-text-3">
            Add images from the Content tab.
          </div>
        ) : null}

        {/* Optional button (hidden while its text is empty) */}
        {buttonText ? (
          // Default look: accent outline that fills on hover. Any colour set in
          // the Content tab (background, text, border, hover) overrides it.
          <div className="flex justify-center mt-8" style={{ ["--op-vj-accent" as string]: accent }}>
            <CtaButton
              block={block}
              id={part(block, "button")}
              prefix="button"
              label={buttonText}
              href={safeHref(p.buttonUrl)}
              target={str(p.buttonTarget)}
              icon={null}
              brand={null}
              className="px-7 py-3 rounded-full border border-[var(--op-vj-accent)] text-[var(--op-vj-accent)] hover:bg-[var(--op-vj-accent)] hover:text-white text-sm font-medium tracking-wide"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
