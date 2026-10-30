"use client";

import { useEffect, useState } from "react";

export interface Slide {
  src: string;
  alt?: string;
  caption?: string;
}

/** Seconds between slides when none (or an invalid value) is set. */
export const DEFAULT_SLIDE_SECONDS = 4;

/** Turn a stored "seconds" value (number or text) into milliseconds, clamped to 1–30 s. */
export function slideIntervalMs(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  const seconds = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 1), 30) : DEFAULT_SLIDE_SECONDS;
  return Math.round(seconds * 1000);
}

/**
 * Auto-playing image slideshow: cross-fades to the next image every
 * `intervalMs`, pauses while hovered, and shows small square indicators
 * (click to jump). With a single image it is just that image.
 */
export function ImageSlideshow({
  slides,
  intervalMs,
  className = "",
  imgClassName = "w-full h-full object-cover",
}: {
  slides: Slide[];
  intervalMs: number;
  className?: string;
  imgClassName?: string;
}) {
  const count = slides.length;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  // Images can be removed while editing; never point past the end.
  const active = count ? current % count : 0;

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [count, paused, intervalMs]);

  if (!count) return null;

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-slideshow=""
    >
      {slides.map((s, i) => (
        <div
          key={`${i}-${s.src}`}
          className="absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === active ? 1 : 0 }}
          aria-hidden={i === active ? undefined : true}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt={s.alt || ""} className={imgClassName} loading={i === 0 ? undefined : "lazy"} />
          {s.caption ? (
            <span className="absolute bottom-3 right-4 text-[10px] uppercase tracking-[0.15em] text-white/85 drop-shadow">
              {s.caption}
            </span>
          ) : null}
        </div>
      ))}
      {count > 1 ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show image ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => setCurrent(i)}
              className={`w-4 h-4 transition-colors ${i === active ? "bg-white" : "bg-white/45 hover:bg-white/70"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
