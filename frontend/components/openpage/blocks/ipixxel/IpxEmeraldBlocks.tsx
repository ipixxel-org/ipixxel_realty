"use client";

import { useId, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, IndianRupee, MapPin, Sparkles } from "lucide-react";
import type { BlockConfig } from "../types";
import { El } from "../El";
import { clamp, color, flag, num, part, safeHref, str } from "../elements/shared";
import { isMediaSrc } from "@/lib/media";
import { LeadForm, MapArea } from "./parts";
import {
  Btn,
  Caption,
  CINZEL,
  GOLD_GRADIENT,
  IconImg,
  ITxt,
  Pic,
  Shell,
  Txt,
  Wrap,
  items,
  lines,
  makeCtx,
  pickVariant,
  useEmeraldFonts,
  usePerView,
  useSlider,
  type Ctx,
  type Item,
} from "./shared";

/**
 * "Emerald" templates for the iPixxel Realty widgets: deep green sections,
 * gold Cinzel titles with a line-and-diamond rule, gold gradient buttons.
 *
 * Each widget's block component calls the matching renderer here when its
 * template name starts with "emerald-"; every text stays an {@link El}.
 */

const EM = {
  teal: "#0b3b31",
  night: "#021a11",
  panel: "#0b3d33",
};

/** Dark leafy green used behind most emerald sections. */
const LEAF_BG =
  "radial-gradient(70% 60% at 12% 18%, rgba(34,92,58,0.55) 0%, transparent 60%)," +
  "radial-gradient(60% 70% at 88% 85%, rgba(24,74,46,0.5) 0%, transparent 62%)," +
  "linear-gradient(160deg, #07301f 0%, #031b11 100%)";

/** Gold gradient (or the chosen button colour) for this section's button. */
function goldVar(ctx: Ctx, prefix = "button"): CSSProperties {
  return { "--ipx-btn-bg": color(ctx.p[`${prefix}Color`]) ?? GOLD_GRADIENT } as CSSProperties;
}

const GOLD_BTN =
  "inline-flex items-center justify-center px-6 py-3 text-[13px] @3xl:text-[15px] font-semibold tracking-[0.08em] uppercase text-[#1b1b1b] [background:var(--ipx-btn-bg)] shadow-[0_6px_18px_rgba(0,0,0,0.25)] hover:brightness-110 transition";

/* ------------------------------------------------------------------------- */
/* Small decorations                                                         */
/* ------------------------------------------------------------------------- */

/** Four-point gold sparkle. */
function Sparkle({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} style={style} fill="currentColor">
      <path d="M10 2c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" />
      <path d="M19 13c.3 2.2 1.1 3 3.3 3.3-2.2.3-3 1.1-3.3 3.3-.3-2.2-1.1-3-3.3-3.3 2.2-.3 3-1.1 3.3-3.3z" />
    </svg>
  );
}

/** Faint line-art mandala used in corners. */
function Mandala({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className={`pointer-events-none absolute ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.7"
      style={{ color: "var(--ipx-accent)" }}
    >
      <circle cx="100" cy="100" r="97" />
      <circle cx="100" cy="100" r="60" />
      <circle cx="100" cy="100" r="40" />
      {Array.from({ length: 16 }, (_, i) => (
        <ellipse key={`p${i}`} cx="100" cy="44" rx="13" ry="34" transform={`rotate(${i * 22.5} 100 100)`} />
      ))}
      {Array.from({ length: 24 }, (_, i) => (
        <path key={`d${i}`} d="M100 4 q7 10 0 22 q-7 -12 0 -22z" transform={`rotate(${i * 15} 100 100)`} />
      ))}
    </svg>
  );
}

/** Thin gold line ending in a diamond (after section titles). */
function Rule({ className = "w-[110px] @3xl:w-[150px]" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative hidden @md:block h-px shrink-0 ${className}`}
      style={{ background: "linear-gradient(90deg, transparent, var(--ipx-accent))" }}
    >
      <span className="absolute -right-0.5 top-1/2 w-[6px] h-[6px] -translate-y-1/2 rotate-45" style={{ background: "var(--ipx-accent)" }} />
    </span>
  );
}

/** Photo background with a tint, or the fallback gradient until a photo is set. */
function Backdrop({ src, overlay, fallback }: { src: string; overlay: string; fallback: string }) {
  if (!isMediaSrc(src)) return <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: fallback }} />;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: overlay }} />
    </>
  );
}

/** Uploaded full-section background photo with a tint; nothing until one is set. */
function BgPhoto({ src, overlay, className = "object-cover" }: { src: unknown; overlay: string; className?: string }) {
  if (!isMediaSrc(src)) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden draggable={false} className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: overlay }} />
    </>
  );
}

/** Faint wavy "wood grain" lines, as in the design's dark panels. */
function Grain({ className = "", opacity = 0.05 }: { className?: string; opacity?: number }) {
  const id = `ipx-grain-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg aria-hidden className={`pointer-events-none absolute ${className}`} preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="520" height="36" patternUnits="userSpaceOnUse">
          <path
            d="M0 6 C90 1 170 11 260 6 S430 1 520 6 M0 18 C110 13 200 24 300 18 S450 12 520 18 M0 30 C80 26 190 35 270 30 S440 25 520 30"
            fill="none"
            stroke="#ffffff"
            strokeOpacity={opacity}
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Gold Cinzel title + rule, then the paragraph. */
function Heading({
  ctx,
  k = "title",
  accentKey = "titleAccent",
  descKey = "description",
  center = false,
  stack = false,
  className = "",
}: {
  ctx: Ctx;
  k?: string;
  accentKey?: string;
  descKey?: string;
  center?: boolean;
  /** Put the second title line on its own line below the title. */
  stack?: boolean;
  className?: string;
}) {
  const title = str(ctx.p[k]);
  const accent = accentKey ? str(ctx.p[accentKey]) : "";
  return (
    <div className={`${center ? "text-center" : ""} ${className}`}>
      {title || accent ? (
        <div className={`flex items-center gap-5 @3xl:gap-8 ${center ? "justify-center" : ""}`}>
          <h2 className="font-semibold leading-tight tracking-[0.02em] text-[21px] @3xl:text-[26px]" style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }}>
            <Txt ctx={ctx} k={k} as="span" />
            {title && accent && !stack ? " " : null}
            {accent ? <Txt ctx={ctx} k={accentKey} as="span" className={stack ? "block" : undefined} /> : null}
          </h2>
          <Rule />
        </div>
      ) : null}
      {descKey ? (
        <Txt
          ctx={ctx}
          k={descKey}
          className="mt-6 @3xl:mt-9 whitespace-pre-line text-[14px] @3xl:text-[15px] leading-[1.95] tracking-[0.03em] text-white/90"
        />
      ) : null}
    </div>
  );
}

/** Logo image, or the logo text in gold Cinzel. */
function Logo({ ctx, className, textClass }: { ctx: Ctx; className: string; textClass: string }) {
  const logo = str(ctx.p.logo);
  if (isMediaSrc(logo)) {
    return (
      <El block={ctx.block} id={part(ctx.block, "logo")} className="inline-flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={str(ctx.p.logoText)} draggable={false} className={`${className} w-auto object-contain`} />
      </El>
    );
  }
  return <Txt ctx={ctx} k="logoText" className={textClass} style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />;
}

function GoldButton({ ctx, prefix = "button", textKey }: { ctx: Ctx; prefix?: string; textKey?: string }) {
  if (!str(ctx.p[textKey ?? `${prefix}Text`])) return null;
  return (
    <div className="relative mt-10 flex justify-center">
      <Btn ctx={ctx} prefix={prefix} textKey={textKey} className={GOLD_BTN} />
    </div>
  );
}

/** Round gold-outline previous / next arrows. */
function Arrows({ go, className = "" }: { go: (dir: 1 | -1) => void; className?: string }) {
  const cls =
    "grid place-items-center w-11 h-11 @3xl:w-12 @3xl:h-12 rounded-full border text-[color:var(--ipx-accent)] border-[color:var(--ipx-accent)] bg-black/10 hover:bg-white/10 transition";
  return (
    <div className={`relative flex items-center gap-4 ${className}`}>
      <button type="button" aria-label="Previous" onClick={() => go(-1)} className={cls}>
        <ArrowLeft size={20} strokeWidth={1.5} />
      </button>
      <button type="button" aria-label="Next" onClick={() => go(1)} className={cls}>
        <ArrowRight size={20} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/* ========================================================================= */
/* Overview                                                                  */
/* ========================================================================= */

export function EmeraldOverview({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-overview");
  const subtitle = [str(ctx.p.title), str(ctx.p.titleAccent)].filter(Boolean);
  const image = str(ctx.p.image);
  const hasImage = isMediaSrc(image);
  return (
    <Shell ctx={ctx} className="text-white py-16 @3xl:py-24" style={{ background: LEAF_BG, ...goldVar(ctx) }}>
      <BgPhoto src={ctx.p.bgImage} overlay="linear-gradient(160deg, rgba(4,40,24,0.55) 0%, rgba(2,22,13,0.75) 100%)" />
      <Grain className="inset-0 w-full h-full" opacity={0.035} />
      <div aria-hidden className="hidden @3xl:block absolute left-0 top-[8%] w-[64%] h-[70%] bg-white/[0.035] shadow-[0_30px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <Grain className="inset-0 w-full h-full" opacity={0.06} />
      </div>
      <Wrap className="grid grid-cols-1 @3xl:grid-cols-[1.3fr_1fr] gap-12 @3xl:gap-16 items-center">
        <div>
          <Heading ctx={ctx} k="eyebrow" accentKey="" descKey="" />
          {subtitle.length ? (
            <h3 className="mt-7 @3xl:mt-10 text-[21px] @3xl:text-[24px] font-medium leading-snug" style={{ color: "color-mix(in srgb, var(--ipx-accent) 85%, white)" }}>
              <Txt ctx={ctx} k="title" as="span" />
              {subtitle.length > 1 ? " " : null}
              <Txt ctx={ctx} k="titleAccent" as="span" />
            </h3>
          ) : null}
          <Txt
            ctx={ctx}
            k="description"
            className="mt-5 whitespace-pre-line text-[14px] @3xl:text-[15px] leading-[2] tracking-[0.04em] text-white/90 @3xl:text-justify"
          />
          {str(ctx.p.buttonText) ? (
            <div className="mt-9">
              <Btn ctx={ctx} className={GOLD_BTN} />
            </div>
          ) : null}
        </div>
        <div className="relative mx-auto w-full max-w-[420px]">
          <div aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 border" style={{ borderColor: "color-mix(in srgb, var(--ipx-accent) 55%, transparent)" }} />
          {/* An uploaded image keeps its own height so nothing is cropped. */}
          <div className={`relative overflow-hidden bg-white/5 ${hasImage ? "" : "aspect-[412/568]"}`}>
            {hasImage ? (
              <Pic src={image} alt={str(ctx.p.title)} className="block w-full h-auto max-h-[900px]" fit="contain" />
            ) : (
              <Pic src="" tone="dark" className="absolute inset-0 w-full h-full" />
            )}
            <Caption text={str(ctx.p.imageCaption)} />
          </div>
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Highlights: offer band + key highlights list                              */
/* ========================================================================= */

export function EmeraldOfferBand({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-offer");
  const hasPrice = Boolean(str(ctx.p.price) || str(ctx.p.priceLabel));
  const hasConfig = Boolean(str(ctx.p.configText) || str(ctx.p.configNote));
  return (
    <Shell ctx={ctx} className="text-white" style={{ background: LEAF_BG }}>
      <BgPhoto src={ctx.p.bgImage} overlay="linear-gradient(90deg, rgba(3,40,24,0.35) 0%, rgba(3,30,18,0.55) 100%)" />
      <Sparkle className="hidden @3xl:block absolute right-[4%] bottom-[7%] w-[54px]" style={{ color: "color-mix(in srgb, var(--ipx-accent) 80%, white)" }} />
      <div className="relative mx-auto grid max-w-[1245px] grid-cols-1 @3xl:grid-cols-[0.95fr_1fr_1.15fr] items-center gap-8 @3xl:gap-6 px-5 py-10 @3xl:px-10 @3xl:py-0 @3xl:min-h-[260px]">
        <div className="flex flex-col items-center text-center @3xl:items-start @3xl:text-left">
          <div className="@3xl:w-full @3xl:flex @3xl:justify-center @3xl:pr-10">
            <Logo ctx={ctx} className="h-[90px] @3xl:h-[110px]" textClass="tracking-[0.25em] text-[20px] font-semibold" />
          </div>
          <Txt ctx={ctx} k="offerText" as="h2" className="mt-5 whitespace-pre-line font-normal leading-[1.3] text-white text-[22px] @3xl:text-[26px]" />
        </div>

        {/* Oval photo tilted down to the right inside a thin gold ring, as in the design. */}
        <div className="relative mx-auto w-[280px] @md:w-[340px] @3xl:w-full max-w-[380px] aspect-[3/2] @3xl:my-4">
          <div aria-hidden className="absolute inset-0 rounded-[50%] border rotate-[16deg]" style={{ borderColor: "var(--ipx-accent)" }} />
          <El block={ctx.block} id={part(ctx.block, "ovalPhoto")} className="absolute left-[4%] right-[4%] top-[3%] bottom-[8%] overflow-hidden rounded-[50%] rotate-[16deg] bg-black/20">
            {/* Counter-rotated and oversized so the photo stays upright and fills the oval. */}
            <Pic src={str(ctx.p.image)} tone="dark" className="absolute left-[-15%] top-[-25%] w-[130%] h-[150%] max-w-none -rotate-[16deg]" />
          </El>
          <Sparkle className="absolute -left-1.5 top-[24%] w-3" style={{ color: "var(--ipx-accent)" }} />
          <Sparkle className="absolute right-[14%] top-[30%] w-3" style={{ color: "var(--ipx-accent)" }} />
        </div>

        <div className="flex flex-col items-center gap-5 text-center @3xl:items-start @3xl:text-left">
          {str(ctx.p.planValue) || str(ctx.p.planLabel) ? (
            <El block={ctx.block} id={part(ctx.block, "plan")} className="inline-flex flex-wrap items-center justify-center gap-x-3 rounded-[4px] border border-white/60 px-4 py-2">
              <Txt ctx={ctx} k="planValue" as="span" className="font-semibold leading-none text-[32px] @3xl:text-[38px]" style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
              <Txt ctx={ctx} k="planLabel" as="span" className="uppercase font-semibold text-[14px] @3xl:text-[16px]" style={{ fontFamily: CINZEL }} />
            </El>
          ) : null}
          {hasConfig || hasPrice ? (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              {hasConfig ? (
                <div className="leading-tight">
                  <Txt ctx={ctx} k="configText" className="font-semibold text-[22px] @3xl:text-[25px]" style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
                  <Txt ctx={ctx} k="configNote" className="uppercase text-[15px] @3xl:text-[17px]" />
                </div>
              ) : null}
              {hasConfig && hasPrice ? <span aria-hidden className="hidden @md:block w-px h-12 bg-white/50" /> : null}
              {hasPrice ? (
                <div className="flex items-center gap-2">
                  <IndianRupee aria-hidden size={34} strokeWidth={1.2} />
                  <div className="leading-tight">
                    <Txt ctx={ctx} k="priceLabel" className="uppercase font-medium text-[14px] @3xl:text-[15px]" />
                    <Txt ctx={ctx} k="price" className="text-[22px] @3xl:text-[24px]" style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {str(ctx.p.address) ? (
            <p className="inline-flex items-center gap-2 text-[15px] @3xl:text-[16px]">
              <MapPin aria-hidden size={18} />
              <Txt ctx={ctx} k="address" as="span" />
            </p>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

/** Photo with a thin gold frame nudged towards the centre of the section. */
function FramedPhoto({ src, side, className = "" }: { src: string; side: "left" | "right"; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className={`absolute inset-y-0 border ${side === "left" ? "left-0 -right-2.5" : "-left-2.5 right-0"}`}
        style={{ borderColor: "color-mix(in srgb, var(--ipx-accent) 55%, transparent)" }}
      />
      <Pic src={src} tone="dark" className="relative w-full h-full" />
    </div>
  );
}

/** Thin vertical gold line with a sparkle in its middle (key highlights). */
function SideLine({ side }: { side: "left" | "right" }) {
  return (
    <span aria-hidden className={`hidden @3xl:block absolute -top-4 -bottom-4 w-px ${side === "left" ? "left-0" : "right-0"}`}>
      <span className="absolute inset-0 bg-gradient-to-b from-transparent via-[color:var(--ipx-accent)] to-transparent opacity-70" />
      <Sparkle className="absolute left-1/2 top-1/2 w-7 -translate-x-1/2 -translate-y-1/2" style={{ color: "var(--ipx-accent)" }} />
    </span>
  );
}

export function EmeraldKeyHighlights({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-list");
  const list = items(ctx);
  const left = str(ctx.p.image);
  const right = str(ctx.p.image2);
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={{ backgroundColor: EM.teal, ...goldVar(ctx) }}>
      <BgPhoto src={ctx.p.bgImage} overlay="rgba(11,59,49,0.6)" />
      <Mandala className="-right-[70px] -top-[30px] w-[240px] @3xl:w-[290px] opacity-35" />
      <Mandala className="-left-[90px] -bottom-[70px] w-[240px] @3xl:w-[290px] opacity-35" />
      <Wrap>
        <Heading ctx={ctx} descKey="subtitle" stack />
      </Wrap>
      {/* Desktop: photo | line | centred list | line | photo (right photo sits lower). */}
      <div className="relative mt-10 @3xl:mt-12 grid grid-cols-1 @3xl:grid-cols-[min(23.5%,400px)_minmax(0,1fr)_min(23.5%,400px)] items-start gap-10 @3xl:gap-0">
        <FramedPhoto src={left} side="left" className="hidden @3xl:block aspect-[292/384] mr-2.5" />
        <div className="relative px-5 @3xl:self-stretch @3xl:mx-[clamp(16px,2.2cqw,40px)] @3xl:px-[clamp(20px,4cqw,80px)]">
          <SideLine side="left" />
          <SideLine side="right" />
          {list.length ? (
            <ul className="mx-auto flex w-full max-w-[460px] flex-col gap-6 @3xl:gap-[26px]">
              {list.map((it) => (
                <El key={it.id} block={ctx.block} id={it.id} as="li" className="relative pl-[26px]">
                  <Sparkle className="absolute left-0 top-1/2 w-[15px] -translate-y-1/2" style={{ color: "var(--ipx-accent)" }} />
                  <ITxt ctx={ctx} item={it} k="title" as="h3" className="font-semibold leading-[1.45] tracking-[0.03em] text-[16px] @3xl:text-[18px]" style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
                  <ITxt ctx={ctx} item={it} k="text" className="mt-1 text-[13.5px] @3xl:text-[14.5px] leading-[1.6] tracking-[0.03em] text-white/90" />
                </El>
              ))}
            </ul>
          ) : null}
        </div>
        <FramedPhoto src={right} side="right" className="hidden @3xl:block aspect-[292/384] ml-2.5 @3xl:mt-[clamp(28px,3.9cqw,60px)]" />
        {isMediaSrc(left) || isMediaSrc(right) ? (
          <div className="@3xl:hidden grid grid-cols-2 gap-3 px-5">
            {[left, right].filter(isMediaSrc).map((src, i) => (
              <Pic key={i} src={src} className="w-full aspect-[3/4]" />
            ))}
          </div>
        ) : null}
      </div>
      <GoldButton ctx={ctx} />
    </Shell>
  );
}

/* ========================================================================= */
/* Amenities                                                                 */
/* ========================================================================= */

export function EmeraldAmenityCards({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-cards");
  const list = items(ctx);
  const { perView, ref } = usePerView(5, 3, 2);
  const slider = useSlider(list.length, {
    perView,
    autoplay: flag(ctx.p.autoplay, false),
    interval: clamp(num(ctx.p.interval, 5000), 2000, 20000),
  });
  const width = 100 / perView;
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={goldVar(ctx)}>
      <Backdrop
        src={str(ctx.p.bgImage)}
        overlay="linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.3) 100%)"
        fallback="linear-gradient(160deg, #3b5248 0%, #1d3029 100%)"
      />
      <Wrap>
        <Heading ctx={ctx} />
      </Wrap>
      {list.length ? (
        <div ref={ref} className="relative mt-10 overflow-hidden px-3 @3xl:px-6" {...slider.handlers}>
          <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${slider.start * width}%)` }}>
            {list.map((it) => (
              <div key={it.id} className="shrink-0 px-1.5 @3xl:px-2.5" style={{ width: `${width}%` }}>
                <El block={ctx.block} id={it.id} className={`flex h-full ${it.index % 2 === 0 ? "flex-col" : "flex-col-reverse"}`}>
                  <div className="flex aspect-[226/122] flex-col items-center justify-center gap-2.5 px-3 text-center" style={{ backgroundColor: EM.night }}>
                    <IconImg
                      src={it.get("icon")}
                      className="w-8 h-8"
                      fallback={<Sparkles aria-hidden className="w-7 h-7" strokeWidth={1.3} style={{ color: "var(--ipx-accent)" }} />}
                    />
                    <ITxt ctx={ctx} item={it} k="title" as="h3" className="text-[14px] @md:text-[15px] @3xl:text-[17px] font-medium leading-snug text-white" />
                  </div>
                  <div className="relative aspect-[226/250] overflow-hidden">
                    <Pic src={it.get("image")} alt={it.get("title")} className="absolute inset-0 w-full h-full" />
                  </div>
                </El>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {slider.canSlide ? <Arrows go={slider.go} className="mt-7 justify-center" /> : null}
      <GoldButton ctx={ctx} />
    </Shell>
  );
}

/* ========================================================================= */
/* Floor plans                                                               */
/* ========================================================================= */

function DiamondLine({ className }: { className: string }) {
  return (
    <span aria-hidden className={`absolute inset-x-0 h-px ${className}`} style={{ background: "color-mix(in srgb, var(--ipx-accent) 55%, transparent)" }}>
      <span className="absolute -left-1 top-1/2 w-[7px] h-[7px] -translate-y-1/2 rotate-45" style={{ background: "var(--ipx-accent)" }} />
      <span className="absolute -right-1 top-1/2 w-[7px] h-[7px] -translate-y-1/2 rotate-45" style={{ background: "var(--ipx-accent)" }} />
    </span>
  );
}

export function EmeraldFloorPlans({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-tabs");
  const plans = items(ctx, "plans");
  const [tab, setTab] = useState(0);
  const current = plans[Math.min(tab, plans.length - 1)];
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={{ background: LEAF_BG, ...goldVar(ctx) }}>
      <Wrap>
        <Heading ctx={ctx} />
        {plans.length ? (
          <div role="tablist" className="mt-10 flex flex-wrap justify-center gap-x-4 @3xl:gap-x-14 gap-y-3">
            {plans.map((pl, i) => {
              const active = pl === current;
              return (
                <button
                  key={pl.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(i)}
                  className={`relative px-6 @3xl:px-12 py-3 @3xl:py-4 text-[15px] @3xl:text-[19px] font-medium tracking-[0.06em] ${active ? "text-white" : "text-white/85 hover:text-white"}`}
                >
                  <ITxt ctx={ctx} item={pl} k="title" as="span" />
                  {active ? (
                    <>
                      <DiamondLine className="top-0" />
                      <DiamondLine className="bottom-0" />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {current ? (
          <El block={ctx.block} id={current.id} className="relative mx-auto mt-10 @3xl:mt-14 w-full max-w-[750px] aspect-[750/472] bg-white/5">
            <Pic src={current.get("image")} alt={current.get("title")} fit="contain" tone="dark" className="absolute inset-0 w-full h-full" />
          </El>
        ) : null}
        <GoldButton ctx={ctx} />
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Pricing                                                                   */
/* ========================================================================= */

export function EmeraldPriceRows({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-rows");
  const units = items(ctx, "units");
  const label = "text-[13px] @3xl:text-[14px] tracking-[0.03em]";
  const value = "mt-1 font-semibold leading-tight text-[20px] @3xl:text-[25px]";
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={goldVar(ctx, "cardButton")}>
      <Backdrop
        src={str(ctx.p.bgImage)}
        overlay="linear-gradient(180deg, rgba(5,40,30,0.85) 0%, rgba(5,40,30,0.72) 100%)"
        fallback="linear-gradient(160deg, #134236 0%, #06241b 100%)"
      />
      <Wrap>
        <Heading ctx={ctx} />
        {units.length ? (
          <div className="mt-10 @3xl:mt-14">
            {units.map((u) => (
              <El key={u.id} block={ctx.block} id={u.id} className="relative">
                <div className="grid grid-cols-2 @3xl:grid-cols-[1fr_1fr_auto] gap-x-6 gap-y-4 px-2 @3xl:px-5 py-5">
                  <div className="col-span-2 @3xl:col-span-1">
                    <Txt ctx={ctx} k="typologyLabel" className={label} style={{ color: "var(--ipx-accent)" }} />
                    <ITxt ctx={ctx} item={u} k="title" className={value} style={{ fontFamily: CINZEL }} />
                  </div>
                  <div>
                    <Txt ctx={ctx} k="sizeLabel" className={label} style={{ color: "var(--ipx-accent)" }} />
                    <ITxt ctx={ctx} item={u} k="area" className={value} style={{ fontFamily: CINZEL }} />
                  </div>
                  <div className="text-right">
                    <Txt ctx={ctx} k="priceLabel" className={label} style={{ color: "var(--ipx-accent)" }} />
                    <ITxt ctx={ctx} item={u} k="price" className={value} style={{ fontFamily: CINZEL }} />
                  </div>
                </div>
                <div
                  aria-hidden
                  className="h-3 @3xl:h-11 opacity-80"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--ipx-accent) 25%, transparent) 25%, color-mix(in srgb, var(--ipx-accent) 60%, white) 65%, color-mix(in srgb, var(--ipx-accent) 30%, transparent) 100%)",
                  }}
                />
              </El>
            ))}
          </div>
        ) : null}
        <Txt ctx={ctx} k="note" className="mt-5 text-[12px] text-white/60" />
        <GoldButton ctx={ctx} prefix="cardButton" textKey="cardButtonText" />
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Location                                                                  */
/* ========================================================================= */

function PlaceText({ ctx, item, align }: { ctx: Ctx; item: Item; align: "left" | "right" | "center" }) {
  const text = align === "left" ? "text-left" : align === "right" ? "text-left @3xl:text-right" : "text-center";
  return (
    <div className={text}>
      <ITxt ctx={ctx} item={item} k="value" className="font-semibold text-[17px] @3xl:text-[19px]" style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
      <ITxt ctx={ctx} item={item} k="title" className="mt-1 text-[13px] @3xl:text-[15px] tracking-[0.03em] text-white/90" />
    </div>
  );
}

function Connector({ flip = false }: { flip?: boolean }) {
  return (
    <span aria-hidden className="relative hidden @3xl:block h-px w-[90px] shrink-0" style={{ background: "color-mix(in srgb, var(--ipx-accent) 60%, transparent)" }}>
      <span className={`absolute top-1/2 w-[6px] h-[6px] -translate-y-1/2 rotate-45 ${flip ? "-right-0.5" : "-left-0.5"}`} style={{ background: "var(--ipx-accent)" }} />
    </span>
  );
}

export function EmeraldLocation({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-map");
  const [top, ...rest] = items(ctx, "places");
  const half = Math.ceil(rest.length / 2);
  const left = rest.slice(0, half);
  const right = rest.slice(half);
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={{ backgroundColor: EM.teal, ...goldVar(ctx) }}>
      <Mandala className="-right-20 -top-10 w-[260px] opacity-30" />
      <Mandala className="-left-24 -bottom-24 w-[260px] opacity-30" />
      <Wrap>
        <Heading ctx={ctx} />
        <div className="mt-12 grid grid-cols-1 @3xl:grid-cols-[1fr_minmax(0,350px)_1fr] items-center gap-8 @3xl:gap-0">
          <ul className="order-2 @3xl:order-1 grid grid-cols-2 gap-6 @3xl:flex @3xl:flex-col @3xl:gap-9">
            {left.map((pl) => (
              <El key={pl.id} block={ctx.block} id={pl.id} as="li" className="flex items-center justify-start @3xl:justify-end gap-5">
                <PlaceText ctx={ctx} item={pl} align="right" />
                <Connector />
              </El>
            ))}
          </ul>
          <div className="order-1 @3xl:order-2 @3xl:self-stretch @3xl:border-x @3xl:border-white/15 @3xl:px-4">
            {top ? (
              <El block={ctx.block} id={top.id} className="mb-4">
                <PlaceText ctx={ctx} item={top} align="center" />
              </El>
            ) : null}
            <MapArea ctx={ctx} className="aspect-[346/206] bg-white" />
          </div>
          <ul className="order-3 grid grid-cols-2 gap-6 @3xl:flex @3xl:flex-col @3xl:gap-9">
            {right.map((pl) => (
              <El key={pl.id} block={ctx.block} id={pl.id} as="li" className="flex items-center gap-5">
                <Connector flip />
                <PlaceText ctx={ctx} item={pl} align="left" />
              </El>
            ))}
          </ul>
        </div>
        <GoldButton ctx={ctx} />
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Specifications (own widget)                                               */
/* ========================================================================= */

export const SPECS_VARIANTS = ["emerald-specs"] as const;

function SideOrnament({ side }: { side: "left" | "right" }) {
  return (
    <div aria-hidden className={`hidden @3xl:block absolute top-[6%] bottom-[6%] w-px ${side === "left" ? "left-[4%]" : "right-[4%]"}`}>
      <span className="absolute inset-0 bg-gradient-to-b from-transparent via-[color:var(--ipx-accent)] to-transparent opacity-60" />
      <Sparkle className="absolute left-1/2 top-1/2 w-6 -translate-x-1/2 -translate-y-1/2" style={{ color: "var(--ipx-accent)" }} />
    </div>
  );
}

export function IpxSpecsBlock({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const variant = pickVariant(block, SPECS_VARIANTS);
  const ctx = makeCtx(block, variant);
  const list = items(ctx);
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={{ background: LEAF_BG, ...goldVar(ctx) }}>
      {isMediaSrc(str(ctx.p.bgImage)) ? (
        <Backdrop src={str(ctx.p.bgImage)} overlay="linear-gradient(180deg, rgba(3,27,17,0.85), rgba(3,27,17,0.85))" fallback="" />
      ) : null}
      <SideOrnament side="left" />
      <SideOrnament side="right" />
      <Wrap>
        <Heading ctx={ctx} />
        {list.length ? (
          <div className="mt-10 grid grid-cols-1 @md:grid-cols-2 gap-x-14 gap-y-8 @3xl:px-16">
            {list.map((it) => {
              const points = lines(it.raw.text);
              return (
                <El key={it.id} block={ctx.block} id={it.id}>
                  <ITxt ctx={ctx} item={it} k="title" as="h3" className="font-semibold tracking-[0.03em] text-[17px] @3xl:text-[19px]" style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
                  {points.length ? (
                    <ITxt
                      ctx={ctx}
                      item={it}
                      k="text"
                      as="ul"
                      className="mt-2 flex flex-col gap-1.5"
                      value={points.map((pt, i) => (
                        <li key={i} className="flex items-baseline gap-2.5 text-[14px] @3xl:text-[15px] tracking-[0.03em] text-white/90">
                          <span aria-hidden className="w-1.5 h-1.5 shrink-0 rounded-full bg-white -translate-y-0.5" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    />
                  ) : null}
                </El>
              );
            })}
          </div>
        ) : null}
        <GoldButton ctx={ctx} />
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Gallery                                                                   */
/* ========================================================================= */

export function EmeraldGalleryRows({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-rows");
  const images = items(ctx, "images");
  const rows = [images.filter((_, i) => i % 2 === 0), images.filter((_, i) => i % 2 === 1)].filter((r) => r.length);
  const { perView, ref } = usePerView(3, 2, 1);
  const longest = Math.max(0, ...rows.map((r) => r.length));
  const slider = useSlider(longest, {
    perView,
    autoplay: flag(ctx.p.autoplay, false),
    interval: clamp(num(ctx.p.interval, 5000), 2000, 20000),
  });
  // A slot is a little narrower than 1/perView so the next photo peeks in.
  const slot = 100 / (perView + 0.5);
  return (
    <Shell ctx={ctx} className="text-white pt-14 pb-12 @3xl:pt-20 @3xl:pb-16" style={{ backgroundColor: EM.night, ...goldVar(ctx) }}>
      <Wrap>
        <Heading ctx={ctx} />
      </Wrap>
      {rows.length ? (
        <div ref={ref} className="relative mt-10 flex flex-col gap-4 @3xl:gap-5 overflow-hidden" {...slider.handlers}>
          {rows.map((row, r) => (
            <div
              key={r}
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${slider.start * slot + (r === 1 ? slot / 2 : 0)}%)` }}
            >
              {row.map((img) => (
                <div key={img.id} className="shrink-0 px-2 @3xl:px-2.5" style={{ width: `${slot}%` }}>
                  <El block={ctx.block} id={img.id} className="relative aspect-[273/185] overflow-hidden rounded-[6px]">
                    <Pic src={img.get("src")} alt={img.get("alt") || img.get("caption")} tone="dark" className="absolute inset-0 w-full h-full" />
                  </El>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <Wrap className="mt-10 flex flex-col @3xl:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-1.5 @3xl:w-[200px]">
          {slider.canSlide
            ? Array.from({ length: slider.pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === slider.start}
                  onClick={() => slider.setIndex(i)}
                  className="w-2.5 h-2.5 rotate-45 border border-[color:var(--ipx-accent)]"
                  style={{ background: i === slider.start ? "var(--ipx-accent)" : "transparent" }}
                />
              ))
            : null}
        </div>
        {str(ctx.p.buttonText) ? <Btn ctx={ctx} className={GOLD_BTN} /> : null}
        <div className="flex @3xl:w-[200px] @3xl:justify-end">{slider.canSlide ? <Arrows go={slider.go} /> : null}</div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* About developer                                                           */
/* ========================================================================= */

export function EmeraldAbout({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-about");
  const stats = items(ctx, "stats");
  const sub = "mt-7 uppercase font-medium text-[18px] @3xl:text-[20px] text-white";
  const para = "mt-2 whitespace-pre-line text-[14px] @3xl:text-[15px] leading-[1.95] tracking-[0.03em] text-white/90 @3xl:text-justify";
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={goldVar(ctx)}>
      <Backdrop
        src={str(ctx.p.image)}
        overlay="linear-gradient(180deg, rgba(28,58,36,0.9) 0%, rgba(22,48,30,0.82) 100%)"
        fallback="linear-gradient(160deg, #2c4a33 0%, #16301f 100%)"
      />
      <Wrap>
        <Logo ctx={ctx} className="h-[72px] @3xl:h-[84px]" textClass="tracking-[0.25em] text-[20px] font-semibold" />
        <Heading ctx={ctx} descKey="" className="mt-5" />
        <Txt ctx={ctx} k="subtitle" as="h3" className="mt-8 @3xl:mt-10 font-medium text-[20px] @3xl:text-[24px] text-white" />
        <Txt ctx={ctx} k="description" className={`${para} mt-4`} />
        <Txt ctx={ctx} k="missionTitle" as="h4" className={sub} />
        <Txt ctx={ctx} k="missionText" className={para} />
        <Txt ctx={ctx} k="visionTitle" as="h4" className={sub} />
        <Txt ctx={ctx} k="visionText" className={para} />
        {stats.length ? (
          <div className="mt-12 flex flex-wrap justify-center gap-y-8 border-y border-white/20 py-8 @3xl:px-10 text-center">
            {stats.map((st) => (
              <El key={st.id} block={ctx.block} id={st.id} className="w-1/2 @3xl:w-1/4 px-3">
                <ITxt ctx={ctx} item={st} k="value" className="font-semibold leading-none text-[28px] @3xl:text-[34px]" style={{ fontFamily: CINZEL, color: "color-mix(in srgb, var(--ipx-accent) 70%, white)" }} />
                <ITxt ctx={ctx} item={st} k="label" className="mt-3 text-[14px] @3xl:text-[16px] leading-snug text-white" />
              </El>
            ))}
          </div>
        ) : null}
        <GoldButton ctx={ctx} />
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Enquiry form (the form itself comes from Form Builder, unstyled)          */
/* ========================================================================= */

/** Faint line drawing of a tower, used until a side image is uploaded. */
function TowerSketch() {
  const floors = Array.from({ length: 14 }, (_, i) => i);
  return (
    <svg viewBox="0 0 300 420" aria-hidden className="absolute bottom-0 right-0 h-full w-auto opacity-35" fill="none" stroke="currentColor" strokeWidth="0.8" style={{ color: "var(--ipx-accent)" }}>
      <path d="M60 420V70l70-30 70 30v350M130 40v380M200 100l60 25v295M0 420h300" />
      {floors.map((i) => (
        <g key={i}>
          <path d={`M60 ${90 + i * 23}h140`} />
          <path d={`M200 ${120 + i * 21}h60`} />
        </g>
      ))}
      {[80, 105, 155, 180].map((x) => (
        <path key={x} d={`M${x} 80v340`} />
      ))}
    </svg>
  );
}

export function EmeraldForm({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-form");
  const image = str(ctx.p.image);
  const hasBg = isMediaSrc(ctx.p.bgImage);
  return (
    <Shell ctx={ctx} className="text-white py-14 @3xl:py-20" style={{ backgroundColor: EM.night }}>
      {/* Background photo: anchored right, fading into the dark green behind the form. */}
      <BgPhoto
        src={ctx.p.bgImage}
        className="object-cover object-[75%_center] @3xl:object-right"
        overlay={`linear-gradient(90deg, ${EM.night} 0%, rgba(2,26,17,0.92) 38%, rgba(2,26,17,0.35) 70%, rgba(2,26,17,0.1) 100%), linear-gradient(0deg, rgba(2,26,17,0.6) 0%, transparent 30%)`}
      />
      <Wrap className="grid grid-cols-1 @3xl:grid-cols-[1.15fr_1fr] gap-10 items-stretch">
        <div>
          <Heading ctx={ctx} />
          <El block={ctx.block} id={part(ctx.block, "formCard")} className="mt-10 max-w-[560px] p-5 @3xl:p-7 shadow-[0_24px_50px_rgba(0,0,0,0.5)]" style={{ backgroundColor: EM.panel }}>
            <El block={ctx.block} id={part(ctx.block, "form")}>
              <LeadForm ctx={ctx} />
            </El>
          </El>
          <Txt ctx={ctx} k="formNote" className="mt-4 max-w-[560px] whitespace-pre-line text-[11.5px] leading-[1.6] text-white/50" />
        </div>
        <div className="relative hidden @3xl:block min-h-[420px]">
          {isMediaSrc(image) ? <Pic src={image} fit="contain" className="absolute inset-0 w-full h-full object-bottom" /> : hasBg ? null : <TowerSketch />}
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Footer                                                                    */
/* ========================================================================= */

export function EmeraldFooter({ block }: { block: BlockConfig }) {
  useEmeraldFonts();
  const ctx = makeCtx(block, "emerald-footer");
  const [open, setOpen] = useState(false);
  const href = safeHref(ctx.p.linkUrl);
  const external = Boolean(href && /^https?:/i.test(href));
  const rera = "text-[14px] @3xl:text-[16px] font-semibold tracking-[0.04em]";
  return (
    <Shell ctx={ctx} className="text-white pt-14 pb-8" style={{ backgroundColor: EM.teal }}>
      <Mandala className="left-1/2 top-4 w-[300px] -translate-x-1/2 opacity-[0.14]" />
      <Wrap className="text-center">
        <Txt ctx={ctx} k="title" as="h2" className={rera} style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
        <Txt ctx={ctx} k="title2" className={`mt-1 ${rera}`} style={{ fontFamily: CINZEL, color: "var(--ipx-accent)" }} />
        <Txt
          ctx={ctx}
          k="disclaimer"
          className={`mx-auto mt-6 max-w-[1050px] whitespace-pre-line text-[12px] @3xl:text-[13px] leading-[1.75] text-white/80 ${open ? "" : "line-clamp-3"}`}
        />
        {!open && str(ctx.p.disclaimer) && str(ctx.p.readMoreText) ? (
          <button type="button" onClick={() => setOpen(true)} className="relative mt-4 text-[13px] text-white/80 hover:text-white">
            <Txt ctx={ctx} k="readMoreText" as="span" />
          </button>
        ) : null}
        <div aria-hidden className="mx-auto mt-8 h-px w-full max-w-[1060px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }} />
        {str(ctx.p.linkText) ? (
          <p className="mt-6 text-[13px] @3xl:text-[14px] tracking-[0.1em]">
            <El
              block={ctx.block}
              id={part(ctx.block, "linkText")}
              as={href ? "a" : "span"}
              href={href || undefined}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="hover:underline"
              style={{ color: "var(--ipx-accent)" }}
            >
              {str(ctx.p.linkText)}
            </El>
          </p>
        ) : null}
        <Txt ctx={ctx} k="credit" className="mt-3 text-[12px] @3xl:text-[13px]" style={{ color: "var(--ipx-accent)" }} />
      </Wrap>
    </Shell>
  );
}
