"use client";

import { useState, useEffect, useCallback } from "react";
import type { BlockConfig } from "../types";
import { flag, num } from "../elements/shared";

interface SliderProps {
  images?: Array<{ src: string; alt?: string; caption?: string }>;
  autoPlay?: boolean | string;
  interval?: number | string;
  showDots?: boolean | string;
  showArrows?: boolean | string;
  height?: string;
}

export function SliderBlock({ block }: { block: BlockConfig }) {
  const p = block.props as SliderProps
  // Images with no picture yet are skipped. Old blocks with no image list at
  // all keep their sample photos, as before.
  const listed = (Array.isArray(p.images) ? p.images : []).filter((img) => img && typeof img.src === "string" && img.src.trim())
  const images = Array.isArray(p.images) ? listed : [
    { src: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200', alt: 'Property 1' },
    { src: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200', alt: 'Property 2' },
    { src: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200', alt: 'Property 3' },
  ]
  const [current, setCurrent] = useState(0)
  // Settings are saved as true/false or "true"/"false"; "false" means off.
  const autoPlay = flag(p.autoPlay, true)
  const interval = Math.min(30000, Math.max(1500, num(p.interval, 5000)))

  const next = useCallback(() => setCurrent((c) => (c + 1) % Math.max(1, images.length)), [images.length])
  const prev = useCallback(() => setCurrent((c) => (c - 1 + images.length) % Math.max(1, images.length)), [images.length])
  const active = images.length ? current % images.length : 0

  useEffect(() => {
    if (!autoPlay || images.length < 2) return
    const timer = setInterval(next, interval)
    return () => clearInterval(timer)
  }, [autoPlay, interval, next, images.length])

  if (!images.length) {
    return (
      <div className="w-full flex items-center justify-center bg-[var(--color-bg-3)] text-[var(--color-text-3)] text-sm" style={{ height: p.height || "400px" }}>
        Add images in the Content tab
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: p.height || '400px' }}>
      {images.map((img, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === active ? 1 : 0 }}
        >
          <img src={img.src} alt={img.alt || ''} className="w-full h-full object-cover" />
          {img.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-4 text-center">
              {img.caption}
            </div>
          )}
        </div>
      ))}

      {flag(p.showArrows, true) && images.length > 1 && (
        <>
          <button type="button" aria-label="Previous slide" onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors backdrop-blur-sm">
            ‹
          </button>
          <button type="button" aria-label="Next slide" onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors backdrop-blur-sm">
            ›
          </button>
        </>
      )}

      {flag(p.showDots, true) && images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setCurrent(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${i === active ? 'bg-white scale-110' : 'bg-white/40 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
