"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import type { BlockConfig } from "../types";
import { El } from "../El";
import { flag, num, part, str } from "../elements/shared";
import { isMediaSrc } from "@/lib/media";
import { bronzeVar, BRONZE_BTN } from "./IpxStoryBlocks";
import {
  BURGUNDY_GOLD,
  BurgundyHeading,
  Btn,
  Caption,
  EldecoHeading,
  FAMILY,
  IconImg,
  ITxt,
  KnowMore,
  Pic,
  SERIF,
  Shell,
  TarcHeading,
  Wrap,
  categories,
  items,
  lines,
  makeCtx,
  pickVariant,
  useIpxFonts,
  usePerView,
  useSlider,
  type Ctx,
  type Item,
} from "./shared";

/** Burgundy's deep wine backdrop, tinted by the accent colour. */
function wine(accent: string): string {
  return `radial-gradient(ellipse at 75% 35%, color-mix(in srgb, ${accent} 88%, #a3365f) 0%, color-mix(in srgb, ${accent} 78%, black) 100%)`;
}

/** Horizontal strip that shows `perView` children and slides by one. */
function Strip({
  start,
  perView,
  gap,
  children,
}: {
  start: number;
  perView: number;
  gap: number;
  children: ReactNode[];
}) {
  return (
    <div className="overflow-hidden">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(calc(${-start} * (100% + ${gap}px) / ${perView}))`, gap }}
      >
        {children.map((child, i) => (
          <div key={i} className="shrink-0" style={{ width: `calc((100% - ${gap * (perView - 1)}px) / ${perView})` }}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoldArrow({ dir, onClick, className = "" }: { dir: "prev" | "next"; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous" : "Next"}
      onClick={onClick}
      className={`grid place-items-center w-11 h-11 @3xl:w-[50px] @3xl:h-[50px] rounded-full text-white bg-[var(--ipx-accent)] hover:brightness-110 ${className}`}
    >
      {dir === "prev" ? <ChevronLeft size={24} strokeWidth={1.5} /> : <ChevronRight size={24} strokeWidth={1.5} />}
    </button>
  );
}

/* ========================================================================= */
/* Amenities                                                                 */
/* ========================================================================= */

export const AMENITIES_VARIANTS = ["burgundy-list", "eldeco-tiles", "tarc-carousel"] as const;

export function IpxAmenitiesBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, AMENITIES_VARIANTS);
  const ctx = makeCtx(block, variant);
  if (variant === "eldeco-tiles") return <EldecoTiles {...ctx} />;
  if (variant === "tarc-carousel") return <TarcAmenityCarousel {...ctx} />;
  return <BurgundyAmenityList {...ctx} />;
}

function BurgundyAmenityList(ctx: Ctx) {
  const list = items(ctx);
  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-28" style={{ background: wine(ctx.accent) }}>
      <Wrap>
        <BurgundyHeading ctx={ctx} dark />
        <div className="mt-12 @3xl:mt-16 flex flex-col gap-5">
          {list.map((it) => (
            <El key={it.id} block={ctx.block} id={it.id} className="relative overflow-hidden bg-white border border-white/60 min-h-[150px]">
              {isMediaSrc(it.get("image")) ? (
                <div className="absolute inset-y-0 right-0 w-[58%]">
                  <Pic src={it.get("image")} className="absolute inset-0 w-full h-full" />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-white via-white/40 to-transparent" />
                </div>
              ) : null}
              <div className="relative z-10 px-6 py-8 max-w-[360px]">
                <ITxt ctx={ctx} item={it} k="category" className="uppercase font-semibold tracking-[0.3em] text-[10.5px]" style={{ color: ctx.accent }} />
                <ITxt ctx={ctx} item={it} k="title" as="h3" className="mt-3 text-[18px] text-[#3d3d3d]" style={{ fontFamily: SERIF }} />
                <ITxt ctx={ctx} item={it} k="text" className="mt-2 text-[13px] leading-[1.55] text-[#555]" />
              </div>
            </El>
          ))}
        </div>
      </Wrap>
    </Shell>
  );
}

function EldecoTiles(ctx: Ctx) {
  const list = items(ctx);
  const highlight = flag(ctx.p.highlightFirst, true);
  return (
    <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20" style={bronzeVar(ctx)}>
      <Wrap>
        <EldecoHeading ctx={ctx} />
        <div className="mt-12 @3xl:mt-20 flex flex-wrap justify-center gap-4 @3xl:gap-[30px]">
          {list.map((it, i) => {
            const on = (highlight && i === 0) || flag(it.raw.highlight, false);
            return (
              <El
                key={it.id}
                block={ctx.block}
                id={it.id}
                className={`flex flex-col items-center justify-center gap-3 text-center px-3 border w-[calc(50%-8px)] @md:w-[calc(33.333%-11px)] @3xl:w-[190px] h-[106px] ${
                  on ? "text-white border-transparent [background:var(--ipx-btn-bg)]" : "text-[#1b1b1b] border-[#5a5a5a] bg-[#f1ede4]"
                }`}
              >
                <IconImg
                  src={it.get("icon")}
                  className={`w-9 h-9 ${on ? "brightness-0 invert" : ""}`}
                  fallback={<Dumbbell className="w-8 h-8" strokeWidth={1.2} />}
                />
                <ITxt ctx={ctx} item={it} k="title" className="text-[13px] @3xl:text-[13.5px] tracking-[0.06em] leading-snug" />
              </El>
            );
          })}
        </div>
        <div className="mt-4 @3xl:mt-4 flex justify-center">
          <Btn ctx={ctx} className={`${BRONZE_BTN} px-8 py-3 text-[13px] tracking-[0.18em]`} />
        </div>
      </Wrap>
    </Shell>
  );
}

function TarcAmenityCarousel(ctx: Ctx) {
  const list = items(ctx);
  const { perView, ref } = usePerView(3, 2, 1);
  const s = useSlider(list.length, { perView, autoplay: flag(ctx.p.autoplay, false), interval: num(ctx.p.interval, 5000) });
  return (
    <Shell ctx={ctx} className="py-14 @3xl:py-24" style={{ backgroundColor: FAMILY.tarc.cream }}>
      <Wrap>
        <TarcHeading ctx={ctx} />
        <div ref={ref} className="relative mt-10 @3xl:mt-14" {...s.handlers}>
          <Strip start={s.start} perView={perView} gap={20}>
            {list.map((it) => (
              <El key={it.id} block={ctx.block} id={it.id} className="block">
                <div className="relative overflow-hidden aspect-[359/510]">
                  <Pic src={it.get("image")} className="absolute inset-0 w-full h-full" />
                  <Caption text={str(ctx.p.imageCaption)} />
                </div>
                <ITxt ctx={ctx} item={it} k="title" className="mt-6 text-center text-[17px] @3xl:text-[18px] tracking-[0.05em] text-[#1b1b1b]" />
              </El>
            ))}
          </Strip>
          {s.canSlide ? (
            <>
              <GoldArrow dir="prev" onClick={() => s.go(-1)} className="absolute left-1 @3xl:-left-6 top-[34%] -translate-y-1/2 z-10" />
              <GoldArrow dir="next" onClick={() => s.go(1)} className="absolute right-1 @3xl:-right-6 top-[34%] -translate-y-1/2 z-10" />
            </>
          ) : null}
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Gallery                                                                   */
/* ========================================================================= */

export const GALLERY_VARIANTS = ["burgundy-carousel", "eldeco-grid", "tarc-journey"] as const;

export function IpxGalleryBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, GALLERY_VARIANTS);
  const ctx = makeCtx(block, variant);
  if (variant === "eldeco-grid") return <EldecoGrid {...ctx} />;
  if (variant === "tarc-journey") return <TarcJourney {...ctx} />;
  return <BurgundyCarousel {...ctx} />;
}

/** Images of the active tab (images without a tab show under every tab). */
function useTabs(ctx: Ctx) {
  const all = items(ctx, "images");
  const tabs = categories(all);
  const [active, setActive] = useState(0);
  const current = tabs[Math.min(active, Math.max(0, tabs.length - 1))] ?? "";
  const shown = current ? all.filter((it) => !it.get("category") || it.get("category").trim() === current) : all;
  return { tabs, active: Math.min(active, Math.max(0, tabs.length - 1)), setActive, shown };
}

function GalleryImage({ ctx, it, className }: { ctx: Ctx; it: Item; className: string }) {
  return (
    <El block={ctx.block} id={it.id} className={`relative overflow-hidden ${className}`}>
      <Pic src={it.get("src")} alt={it.get("alt")} className="absolute inset-0 w-full h-full" />
      <Caption text={it.get("caption") || str(ctx.p.imageCaption)} className="right-2 bottom-1.5" />
    </El>
  );
}

function BurgundyCarousel(ctx: Ctx) {
  const t = useTabs(ctx);
  const { perView, ref } = usePerView(3, 2, 1);
  const s = useSlider(t.shown.length, { perView });
  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24" style={{ background: wine(ctx.accent) }}>
      <Wrap>
        <BurgundyHeading ctx={ctx} dark />
        {t.tabs.length > 1 ? (
          <div className="mt-10 @3xl:mt-12 flex justify-center">
            <div className="flex">
              {t.tabs.map((tab, i) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    t.setActive(i);
                    s.setIndex(0);
                  }}
                  className="px-6 @3xl:px-10 pb-3 uppercase tracking-[0.25em] text-[12px] @3xl:text-[13px] border-b-2"
                  style={{
                    color: i === t.active ? BURGUNDY_GOLD : "rgba(255,255,255,0.7)",
                    borderColor: i === t.active ? BURGUNDY_GOLD : "rgba(255,255,255,0.35)",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div ref={ref} className="mt-8" {...s.handlers}>
          <Strip start={s.start} perView={perView} gap={16}>
            {t.shown.map((it) => (
              <GalleryImage key={it.id} ctx={ctx} it={it} className="aspect-[355/260] border border-white/40" />
            ))}
          </Strip>
        </div>
        {s.canSlide ? (
          <div className="mt-6 flex items-center justify-center gap-6">
            <button type="button" aria-label="Previous" onClick={() => s.go(-1)} className="grid place-items-center w-11 h-11 border" style={{ borderColor: BURGUNDY_GOLD, color: BURGUNDY_GOLD }}>
              <ArrowLeft size={20} strokeWidth={1.4} />
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: s.pages }, (_, i) => (
                <span key={i} className={`h-1.5 rounded-full ${i === s.start ? "w-6" : "w-1.5"}`} style={{ backgroundColor: i === s.start ? BURGUNDY_GOLD : "rgba(255,255,255,0.6)" }} />
              ))}
            </div>
            <button type="button" aria-label="Next" onClick={() => s.go(1)} className="grid place-items-center w-11 h-11 border" style={{ borderColor: BURGUNDY_GOLD, color: BURGUNDY_GOLD }}>
              <ArrowRight size={20} strokeWidth={1.4} />
            </button>
          </div>
        ) : null}
      </Wrap>
    </Shell>
  );
}

function EldecoGrid(ctx: Ctx) {
  const t = useTabs(ctx);
  return (
    <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20">
      <Wrap>
        <EldecoHeading ctx={ctx} />
        {t.tabs.length > 1 ? (
          <div className="mt-8 @3xl:mt-10 flex flex-wrap justify-center gap-2.5">
            {t.tabs.map((tab, i) => (
              <button
                key={tab}
                type="button"
                onClick={() => t.setActive(i)}
                className={`px-3 py-2 uppercase tracking-[0.14em] text-[11px] @3xl:text-[12px] border ${i === t.active ? "border-[#1b1b1b] text-[#1b1b1b]" : "border-[#1b1b1b]/35 text-[#1b1b1b]/60"}`}
              >
                {tab}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-10 @3xl:mt-16 grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4 gap-5">
          {t.shown.map((it) => (
            <GalleryImage key={it.id} ctx={ctx} it={it} className="aspect-[270/134]" />
          ))}
        </div>
      </Wrap>
    </Shell>
  );
}

function TarcJourney(ctx: Ctx) {
  const list = items(ctx, "images");
  const { perView, ref } = usePerView(2, 2, 1);
  const s = useSlider(list.length, { perView, autoplay: flag(ctx.p.autoplay, false), interval: num(ctx.p.interval, 5000) });
  const decor = str(ctx.p.decorImage);
  return (
    <Shell ctx={ctx} className="pt-14 @3xl:pt-20 pb-14 @3xl:pb-20" style={{ backgroundColor: FAMILY.tarc.cream }}>
      {decor ? <Pic src={decor} fit="contain" className="hidden @3xl:block absolute left-[11%] top-8 w-[250px] h-[180px] pointer-events-none" /> : null}
      <Wrap>
        <TarcHeading ctx={ctx} />
      </Wrap>
      <div ref={ref} className="mt-10 @3xl:mt-12" {...s.handlers}>
        <Strip start={s.start} perView={perView} gap={20}>
          {list.map((it) => (
            <GalleryImage key={it.id} ctx={ctx} it={it} className="aspect-[623/400]" />
          ))}
        </Strip>
      </div>
      {s.canSlide ? (
        <div className="mt-6 flex justify-center gap-6">
          <GoldArrow dir="prev" onClick={() => s.go(-1)} />
          <GoldArrow dir="next" onClick={() => s.go(1)} />
        </div>
      ) : null}
    </Shell>
  );
}

/* ========================================================================= */
/* Master / Site plan                                                        */
/* ========================================================================= */

export const MASTERPLAN_VARIANTS = ["eldeco-site", "tarc-master"] as const;

export function IpxMasterPlanBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, MASTERPLAN_VARIANTS);
  const ctx = makeCtx(block, variant);
  const src = str(ctx.p.image);
  const plan = (placeholder: string) =>
    isMediaSrc(src) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={str(ctx.p.title)} draggable={false} className="block w-full h-auto" />
    ) : (
      <Pic src="" className={`w-full ${placeholder}`} />
    );

  if (variant === "tarc-master") {
    return (
      <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20">
        <Wrap>
          <TarcHeading ctx={ctx} />
          <El block={ctx.block} id={part(ctx.block, "plan")} className="relative mx-auto mt-8 w-full max-w-[465px]">
            {plan("aspect-[465/740]")}
            {str(ctx.p.imageCaption) ? (
              <div className="absolute inset-x-0 bottom-0 px-6 pt-10 pb-3 text-center text-white text-[9px] @3xl:text-[10px] tracking-[0.18em] leading-[1.8] bg-gradient-to-t from-black/80 to-transparent">
                {str(ctx.p.imageCaption)}
              </div>
            ) : null}
          </El>
          <div className="mt-9 flex justify-center">
            <KnowMore ctx={ctx} />
          </div>
        </Wrap>
      </Shell>
    );
  }
  return (
    <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20" style={bronzeVar(ctx)}>
      <Wrap>
        <EldecoHeading ctx={ctx} />
        <El block={ctx.block} id={part(ctx.block, "plan")} className="mt-10 @3xl:mt-12">
          {plan("aspect-[1140/640]")}
        </El>
        <div className="mt-8 flex justify-center">
          <Btn ctx={ctx} className={BRONZE_BTN} />
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Floor plans                                                               */
/* ========================================================================= */

export const FLOORPLAN_VARIANTS = ["burgundy-tabs", "tarc-details"] as const;

/** "Label | Value" lines of a plan's specs. */
function specs(raw: string): Array<{ label: string; value: string }> {
  return lines(raw).map((l) => {
    const [label, ...rest] = l.split("|");
    return { label: label.trim(), value: rest.join("|").trim() };
  });
}

export function IpxFloorPlansBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, FLOORPLAN_VARIANTS);
  const ctx = makeCtx(block, variant);
  const plans = items(ctx, "plans");
  const [active, setActive] = useState(0);
  const i = Math.min(active, Math.max(0, plans.length - 1));
  const plan = plans[i];
  const planImage = (className: string) =>
    plan && isMediaSrc(plan.get("image")) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={plan.get("image")} alt={plan.get("title")} draggable={false} className={`block w-full h-auto ${className}`} />
    ) : (
      <Pic src="" className="w-full aspect-[560/320]" />
    );

  if (variant === "tarc-details") {
    const decor = str(ctx.p.decorImage);
    return (
      <Shell ctx={ctx} className="py-14 @3xl:py-24" style={{ backgroundColor: FAMILY.tarc.cream }}>
        {decor ? (
          <>
            <Pic src={decor} fit="contain" className="hidden @3xl:block absolute right-0 top-6 w-[300px] h-[220px] opacity-70 pointer-events-none" />
            <Pic src={decor} fit="contain" className="hidden @3xl:block absolute left-0 bottom-20 w-[300px] h-[220px] opacity-70 pointer-events-none" />
          </>
        ) : null}
        <Wrap>
          <TarcHeading ctx={ctx} />
          {plans.length > 1 ? (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {plans.map((pl, n) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setActive(n)}
                  className={`px-5 py-2 text-[14px] font-semibold border ${n === i ? "text-white border-transparent bg-[var(--ipx-accent)]" : "border-[var(--ipx-accent)] text-[var(--ipx-accent)] bg-white"}`}
                >
                  {pl.get("title")}
                </button>
              ))}
            </div>
          ) : null}
          {plan ? (
            <div className="mx-auto mt-10 @3xl:mt-12 max-w-[985px] grid grid-cols-1 @3xl:grid-cols-[260px_1fr] gap-10 @3xl:gap-12">
              <div>
                <ITxt ctx={ctx} item={plan} k="title" className="py-3.5 text-center text-white text-[18px] font-semibold bg-[var(--ipx-accent)]" />
                <div className="px-6">
                  {specs(plan.get("specs")).map((sp, n) => (
                    <div key={n} className="py-5 text-center border-b" style={{ borderColor: "color-mix(in srgb, var(--ipx-accent) 45%, transparent)" }}>
                      <div className="font-semibold tracking-[0.04em] text-[16px] @3xl:text-[17px]" style={{ color: ctx.accent }}>{sp.label}</div>
                      {sp.value ? <div className="mt-2 text-[13.5px] tracking-[0.1em] leading-[1.55] whitespace-pre-line">{sp.value}</div> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex justify-center">
                  <KnowMore ctx={ctx} />
                </div>
              </div>
              <div>
                {plan.get("price") ? (
                  <div className="flex flex-wrap items-center justify-center gap-4 h-[60px] bg-white border" style={{ borderColor: ctx.accent }}>
                    <span className="text-[15px] tracking-[0.04em]">{str(ctx.p.priceLabel, "Starting Price")}</span>
                    <ITxt ctx={ctx} item={plan} k="price" as="span" className="text-[26px] @3xl:text-[28px]" style={{ color: ctx.accent }} />
                  </div>
                ) : null}
                <div className="mt-6 p-[10px]" style={{ backgroundColor: "#cdbfae" }}>
                  <div className="bg-white">{planImage("")}</div>
                </div>
              </div>
            </div>
          ) : null}
        </Wrap>
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24" style={{ backgroundColor: FAMILY.burgundy.cream }}>
      <Wrap>
        <BurgundyHeading ctx={ctx} />
        {plans.length > 1 ? (
          <div className="mt-12 @3xl:mt-16 flex justify-center border-b border-[#e7d9d9] overflow-x-auto">
            {plans.map((pl, n) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => setActive(n)}
                className="shrink-0 px-6 @3xl:px-9 pb-4 -mb-px uppercase font-semibold tracking-[0.2em] text-[12px] @3xl:text-[13px] border-b-2"
                style={{ color: n === i ? ctx.accent : "#555", borderColor: n === i ? ctx.accent : "transparent" }}
              >
                {pl.get("title")}
              </button>
            ))}
          </div>
        ) : null}
        {plan ? (
          <El block={ctx.block} id={plan.id} className="mx-auto mt-12 @3xl:mt-20 w-full max-w-[560px]">
            {planImage("")}
          </El>
        ) : null}
      </Wrap>
    </Shell>
  );
}
