"use client";

import { useMemo, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import type { BlockConfig } from "../types";

import { El } from "../El";
import { listElementId, subElementId } from "@/lib/openpage/element-style";

interface GalleryImage {
  _id?: string;
  src?: string;
  alt?: string;
  caption?: string;
  meta?: string;
  category?: string;
}

/** Clamp a user-entered image height so a bad value can never collapse the grid. */
function imageHeight(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, 60), 900);
}

function ImageCard({
  image,
  tall,
  height,
  onOpen,
  block,
}: {
  image: GalleryImage;
  tall?: boolean;
  height: number;
  onOpen: () => void;
  block: BlockConfig;
}) {
  const itemIdBase = listElementId({ path: ["images"] }, image._id || "");
  return (
    <El
      block={block}
      id={itemIdBase}
      as="button"
      type="button"
      onClick={onOpen}
      className={`rounded-xl overflow-hidden border border-border-default group text-left w-full ${tall ? "row-span-2" : ""}`}
    >
      {image.src ? (
        <El block={block} id={subElementId(itemIdBase, "image")} className="block h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt={image.alt || ""}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
            style={{ minHeight: height }}
          />
        </El>
      ) : (
        <El
          block={block}
          id={subElementId(itemIdBase, "image")}
          className="w-full h-full bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center"
          style={{ minHeight: height }}
        >
          <ImageIcon size={24} className="text-text-3" />
        </El>
      )}
      {image.caption ? (
        <El block={block} id={subElementId(itemIdBase, "caption")} as="div" className="px-3 py-2 bg-bg-2 text-[11px] text-text-2">
          {image.caption}
        </El>
      ) : null}
    </El>
  );
}

export function GalleryBlock({ block }: { block: BlockConfig }) {
  const { variant, props } = block;
  const title = props.title as string | undefined;
  const subtitle = typeof props.subtitle === "string" ? props.subtitle : "";
  const images = ((): GalleryImage[] => {
    const src = Array.isArray(props.images) ? props.images as GalleryImage[] : [];
    // Same fallback id the list editor uses, so "Style this item" always matches.
    return src.map((it, i) => ({ ...it, _id: it._id || `idx_${i}` }));
  })();
  const categories = useMemo(() => {
    const cats = Array.from(new Set(images.map((i) => i.category).filter(Boolean))) as string[];
    return cats;
  }, [images]);
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState<number | null>(null);
  const visible = filter === "All" ? images : images.filter((i) => i.category === filter);
  const openImage = open != null ? visible[open] : null;

  // One height control drives every variant, so shrinking an image is a single
  // field instead of a fixed Tailwind class the user cannot influence.
  const cardHeight = imageHeight(props.imageHeight, variant === "lifestyle" ? 260 : 160);
  const rowHeight = variant === "masonry" ? cardHeight : undefined;

  return (
    <section id={(typeof props.anchor === "string" && props.anchor) || "gallery"} className="px-6 py-16 @lg:px-16 @lg:py-20">
      {typeof props.label === "string" && props.label ? (
        <El block={block} id="gallery:label" as="p" className="text-[11px] uppercase tracking-[0.28em] text-text-2 font-medium mb-3 text-center @lg:text-left max-w-6xl mx-auto">
          {props.label}
        </El>
      ) : null}
      {title ? (
        <El block={block} id="gallery:title" as="h2" className={`font-display text-3xl @md:text-4xl font-semibold ${subtitle ? "mb-2" : "mb-6"} ${variant === "lifestyle" ? "text-left max-w-xl" : "text-center"}`}>
          {title}
        </El>
      ) : null}
      {subtitle ? (
        <El block={block} id="gallery:subtitle" as="p" className={`text-text-2 text-sm mb-6 ${variant === "lifestyle" ? "text-left max-w-xl" : "text-center max-w-xl mx-auto"}`}>
          {subtitle}
        </El>
      ) : null}
      {categories.length ? (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {["All", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === c ? "bg-green text-black border-green" : "border-border-default text-text-2 hover:border-border-hover"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
      {variant === "lifestyle" ? (
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-6 @md:gap-8 max-w-6xl mx-auto">
          {visible.map((img, i) => {
            const id = listElementId({ path: ["images"] }, img._id || "");
            return (
            <El
              key={id}
              block={block}
              id={id}
              as="button"
              type="button"
              onClick={() => setOpen(i)}
              className="text-left group"
            >
              <div
                className={`rounded-[24px] overflow-hidden bg-bg-2 ${i % 3 === 0 ? "aspect-[3/4]" : "aspect-[16/11]"}`}
                style={{ minHeight: cardHeight }}
              >
                {img.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.src} alt={img.alt || ""} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
                ) : (
                  <div className="w-full h-full min-h-[200px] bg-bg-3 flex items-center justify-center">
                    <ImageIcon size={24} className="text-text-3" />
                  </div>
                )}
              </div>
              <div className="flex items-baseline justify-between gap-3 mt-3 px-1">
                <El block={block} id={subElementId(id, "caption")} as="span" className="font-display text-lg text-text-0">{img.caption || img.alt || "Space"}</El>
                {img.meta ? (
                  <El block={block} id={subElementId(id, "meta")} as="span" className="text-[10px] uppercase tracking-[0.2em] text-text-3 shrink-0">{img.meta}</El>
                ) : null}
              </div>
            </El>
            );
          })}
        </div>
      ) : (
      <div
        className={
          variant === "strip"
            ? "flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
            : variant === "masonry"
              ? "grid grid-cols-2 @lg:grid-cols-3 gap-3"
              : "grid grid-cols-2 @lg:grid-cols-3 gap-3"
        }
        style={rowHeight ? { gridAutoRows: `${rowHeight}px` } : undefined}
      >
        {visible.map((img, i) =>
          variant === "strip" ? (
            <El
              key={img._id || `${img.src}-${i}`}
              block={block}
              id={listElementId({ path: ["images"] }, img._id || "")}
              as="button"
              type="button"
              onClick={() => setOpen(i)}
              className="snap-start shrink-0 w-[72%] @sm:w-[42%] @lg:w-[28%] rounded-xl overflow-hidden border border-border-default group text-left"
            >
              {img.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt={img.alt || ""}
                  className="w-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                  style={{ height: cardHeight }}
                />
              ) : (
                <div
                  className="w-full bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center"
                  style={{ height: cardHeight }}
                >
                  <ImageIcon size={24} className="text-text-3" />
                </div>
              )}
              {img.caption ? (
                <El block={block} id={subElementId(listElementId({ path: ["images"] }, img._id || ""), "caption")} className="px-3 py-2 bg-bg-2 text-[11px] text-text-2">
                  {img.caption}
                </El>
              ) : null}
            </El>
          ) : (
            <ImageCard
              key={img._id || `${img.src}-${i}`}
              image={img}
              tall={variant === "masonry" && i % 3 === 0}
              height={cardHeight}
              onOpen={() => setOpen(i)}
              block={block}
            />
          )
        )}
      </div>
      )}
      {openImage?.src ? (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <button type="button" className="absolute top-4 right-4 text-white" aria-label="Close" onClick={() => setOpen(null)}>
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={openImage.src} alt={openImage.alt || ""} className="max-h-[88vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </section>
  );
}
