"use client";

import { useState, type CSSProperties } from "react";
import { BadgeIndianRupee, Building2, Gift, Sparkles, WashingMachine, Wrench } from "lucide-react";
import type { BlockConfig } from "../types";
import { El } from "../El";
import { color, part, str, strings } from "../elements/shared";
import {
  BRONZE,
  BurgundyHeading,
  Btn,
  Caption,
  EldecoHeading,
  EldecoWrap,
  FAMILY,
  HELVETICA,
  IconImg,
  ITxt,
  KnowMore,
  Pic,
  SERIF,
  Shell,
  TarcHeading,
  Txt,
  Wrap,
  items,
  makeCtx,
  pickVariant,
  useIpxFonts,
  type Ctx,
} from "./shared";
import { EmeraldKeyHighlights, EmeraldOfferBand, EmeraldOverview } from "./IpxEmeraldBlocks";
import { ModernHighlights, ModernOverview } from "./IpxModernBlocks";

/* ========================================================================= */
/* Overview                                                                  */
/* ========================================================================= */

export const OVERVIEW_VARIANTS = ["burgundy-features", "eldeco-overview", "tarc-story", "tarc-wellness", "emerald-overview", "modern-overview"] as const;

export function IpxOverviewBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, OVERVIEW_VARIANTS);
  const ctx = makeCtx(block, variant);
  if (variant === "eldeco-overview") return <EldecoOverview {...ctx} />;
  if (variant === "tarc-story") return <TarcStory {...ctx} />;
  if (variant === "tarc-wellness") return <TarcWellness {...ctx} />;
  if (variant === "emerald-overview") return <EmeraldOverview block={block} />;
  if (variant === "modern-overview") return <ModernOverview block={block} />;
  return <BurgundyFeatures {...ctx} />;
}

/** Bronze gradient (or the chosen button colour) for Eldeco buttons. */
export function bronzeVar(ctx: Ctx): CSSProperties {
  return { "--ipx-btn-bg": color(ctx.p.buttonColor) ?? BRONZE } as CSSProperties;
}
/** Eldeco bronze button without size / padding (callers add their own). */
export const BRONZE_BTN_BASE =
  "inline-flex items-center justify-center text-white leading-[1.2] font-semibold uppercase [background:var(--ipx-btn-bg)] hover:brightness-110";
export const BRONZE_BTN = `${BRONZE_BTN_BASE} px-6 py-3 text-[12px] @3xl:text-[12.5px] tracking-[0.14em]`;

/** Eldeco outlined / filled tab box (highlight tabs and the boxed label), Helvetica spaced capitals. */
const ELDECO_BOX =
  "px-6 @3xl:px-[29px] py-2.5 @3xl:py-[13px] uppercase leading-[1.15] tracking-[0.28em] text-[12px] @3xl:text-[14px] border";

function BurgundyFeatures(ctx: Ctx) {
  const list = items(ctx);
  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-28" style={{ backgroundColor: FAMILY.burgundy.cream }}>
      <Wrap>
        <BurgundyHeading ctx={ctx} />
        {list.length ? (
          <div className="mt-12 @3xl:mt-16 grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-[2px]">
            {list.map((it) => (
              <El key={it.id} block={ctx.block} id={it.id} className="bg-white px-7 py-9 @3xl:px-9 @3xl:py-12">
                <IconImg src={it.get("icon")} className="w-9 h-9" fallback={<Sparkles className="w-8 h-8 text-[#1b1b1b]" strokeWidth={1.3} />} />
                <ITxt
                  ctx={ctx}
                  item={it}
                  k="number"
                  value={it.get("number") || String(it.index + 1).padStart(2, "0")}
                  className="mt-6 text-[54px] @3xl:text-[62px] leading-none"
                  style={{ fontFamily: SERIF, color: "color-mix(in srgb, var(--ipx-accent) 12%, white)" }}
                />
                <ITxt ctx={ctx} item={it} k="title" as="h3" className="mt-6 text-[23px] @3xl:text-[25px] text-[#3d3d3d]" style={{ fontFamily: SERIF }} />
                <ITxt ctx={ctx} item={it} k="text" className="mt-4 text-[14.5px] leading-[1.75] text-[#555]" />
              </El>
            ))}
          </div>
        ) : null}
      </Wrap>
    </Shell>
  );
}

function EldecoOverview(ctx: Ctx) {
  return (
    <Shell ctx={ctx} className="bg-white pt-12 pb-12 @3xl:pt-14 @3xl:pb-9" style={bronzeVar(ctx)}>
      <EldecoWrap>
        <EldecoHeading ctx={ctx} />
        {/* Two equal columns: text inset 50px on the left, photo top-aligned with the first line. */}
        <div className="mt-8 @3xl:mt-10 grid grid-cols-1 @3xl:grid-cols-2 gap-8 @3xl:gap-6 items-start">
          <div className="@3xl:pl-[50px] @3xl:pr-[38px]">
            <Txt ctx={ctx} k="description" className="whitespace-pre-line text-[14px] leading-[2.28] tracking-[0.04em] text-[#212529]" />
            <div className="mt-7">
              <Btn ctx={ctx} className={BRONZE_BTN} />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[10px] aspect-[558/422]">
            <Pic src={str(ctx.p.image)} className="absolute inset-0 w-full h-full" />
            <Caption text={str(ctx.p.imageCaption)} className="left-6 bottom-4 text-[12px]" />
          </div>
        </div>
      </EldecoWrap>
    </Shell>
  );
}

function TarcStory(ctx: Ctx) {
  const right = str(ctx.p.imageSide) === "right";
  const decor = str(ctx.p.decorImage);
  return (
    <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20">
      <Wrap>
        <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-12 @3xl:gap-20 items-center">
          <div className={`relative ${right ? "@3xl:order-2 @3xl:justify-self-end" : ""}`}>
            <div className={`relative overflow-hidden ${right ? "aspect-[450/620] w-full @3xl:w-[450px]" : "aspect-[325/400] w-full @3xl:w-[325px]"}`}>
              <Pic src={str(ctx.p.image)} className="absolute inset-0 w-full h-full" />
              <Caption text={str(ctx.p.imageCaption)} />
            </div>
            {decor ? (
              <Pic
                src={decor}
                fit="contain"
                className={`absolute bottom-[3%] w-[42%] @3xl:w-[180px] pointer-events-none ${right ? "-left-[12%]" : "left-[62%] @3xl:left-[245px]"}`}
              />
            ) : null}
          </div>
          <div className={right ? "@3xl:order-1" : ""}>
            <Txt ctx={ctx} k="title" as="h2" className="max-w-[540px] font-normal tracking-[0.03em] leading-[1.35] text-[22px] @3xl:text-[27px] text-[#1f1f1f]" />
            <Txt ctx={ctx} k="description" className="mt-7 @3xl:mt-9 max-w-[480px] whitespace-pre-line text-[15px] leading-[1.95] tracking-[0.06em] text-[#1f1f1f]" />
            <div className="mt-10 @3xl:mt-16">
              <KnowMore ctx={ctx} />
            </div>
          </div>
        </div>
      </Wrap>
    </Shell>
  );
}

function TarcWellness(ctx: Ctx) {
  return (
    <Shell ctx={ctx} className="bg-white py-14 @3xl:py-24">
      <Wrap>
        <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_1.1fr] gap-12 @3xl:gap-20 items-center">
          <div>
            <Txt
              ctx={ctx}
              k="watermark"
              className="whitespace-pre-line font-bold leading-[1.12] text-[54px] @3xl:text-[70px] text-[#f4f4f4] select-none"
            />
            <Txt ctx={ctx} k="title" as="h2" className="-mt-2 max-w-[440px] font-normal tracking-[0.02em] leading-[1.5] text-[24px] @3xl:text-[27px] text-[#1f1f1f]" />
            <Txt ctx={ctx} k="description" className="mt-7 max-w-[430px] whitespace-pre-line text-[15px] leading-[1.8] tracking-[0.13em] text-[#1f1f1f]" />
            <div className="mt-9">
              <KnowMore ctx={ctx} />
            </div>
          </div>
          <div className="relative overflow-hidden aspect-[546/620]">
            <Pic src={str(ctx.p.image)} className="absolute inset-0 w-full h-full" />
            <Caption text={str(ctx.p.imageCaption)} />
          </div>
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Highlights                                                                */
/* ========================================================================= */

export const HIGHLIGHTS_VARIANTS = ["burgundy-offers", "eldeco-icons", "tarc-compass", "emerald-offer", "emerald-list", "modern-grid"] as const;

export function IpxHighlightsBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, HIGHLIGHTS_VARIANTS);
  const ctx = makeCtx(block, variant);
  if (variant === "eldeco-icons") return <EldecoIcons {...ctx} />;
  if (variant === "tarc-compass") return <TarcCompass {...ctx} />;
  if (variant === "emerald-offer") return <EmeraldOfferBand block={block} />;
  if (variant === "emerald-list") return <EmeraldKeyHighlights block={block} />;
  if (variant === "modern-grid") return <ModernHighlights block={block} />;
  return <BurgundyOffers {...ctx} />;
}

const OFFER_ICONS = [Wrench, BadgeIndianRupee, WashingMachine, Gift];

function BurgundyOffers(ctx: Ctx) {
  const list = items(ctx);
  const a = ctx.accent;
  return (
    <Shell ctx={ctx} className="bg-white px-1.5 py-1.5">
      <El
        block={ctx.block}
        id={part(ctx.block, "ribbon")}
        className="relative rounded-[18px] border border-white/40 overflow-hidden"
        style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${a} 62%, #d98aac) 0%, color-mix(in srgb, ${a} 70%, #c77aa0) 55%, ${a} 100%)` }}
      >
        <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4 gap-6 @3xl:gap-4 px-6 @3xl:px-8 py-7 @3xl:py-9">
          {list.map((it, i) => {
            const Fallback = OFFER_ICONS[i % OFFER_ICONS.length];
            return (
              <El key={it.id} block={ctx.block} id={it.id} className="flex items-center gap-5">
                <span className="grid place-items-center shrink-0 w-14 h-14 @3xl:w-16 @3xl:h-16 rounded-full bg-white">
                  <IconImg src={it.get("icon")} className="w-8 h-8" fallback={<Fallback className="w-8 h-8" style={{ color: a }} strokeWidth={1.8} />} />
                </span>
                <span className="min-w-0">
                  <ITxt ctx={ctx} item={it} k="title" as="span" className="block uppercase font-semibold tracking-[0.02em] text-white text-[18px] @3xl:text-[20px]" style={{ fontFamily: SERIF }} />
                  <ITxt ctx={ctx} item={it} k="text" as="span" className="block mt-1 uppercase tracking-[0.18em] text-white/85 text-[12px] @3xl:text-[13px]" />
                </span>
              </El>
            );
          })}
        </div>
        {/* Page-curl corner */}
        <span
          aria-hidden
          className="hidden @3xl:block absolute right-0 bottom-0 w-12 h-12"
          style={{ background: "linear-gradient(135deg, transparent 50%, #f6dbe5 50%, #e7b9ca 100%)", borderTopLeftRadius: 14 }}
        />
      </El>
    </Shell>
  );
}

function EldecoIcons(ctx: Ctx) {
  const tabs = strings(ctx.p.tabs);
  const [active, setActive] = useState(0);
  const all = items(ctx);
  const current = tabs[Math.min(active, Math.max(0, tabs.length - 1))] ?? "";
  // Items with a Tab name only show under that tab; items without one always show.
  const list = all.filter((it) => !it.get("category") || !current || it.get("category").trim().toLowerCase() === current.toLowerCase());
  return (
    <Shell ctx={ctx} className="bg-white pt-12 pb-12 @3xl:pt-14 @3xl:pb-11" style={bronzeVar(ctx)}>
      <EldecoWrap>
        <EldecoHeading ctx={ctx} />
        {tabs.length ? (
          <div className="mt-10 @3xl:mt-[76px] flex flex-wrap justify-center gap-4 @3xl:gap-x-[140px]">
            {tabs.map((t, i) => (
              <button
                key={`${t}-${i}`}
                type="button"
                aria-pressed={i === active}
                onClick={() => setActive(i)}
                className={`${ELDECO_BOX} ${
                  i === active ? "text-white border-transparent [background:var(--ipx-btn-bg)]" : "text-[#1b1b1b] border-[#1b1b1b] bg-white"
                }`}
                style={{ fontFamily: HELVETICA }}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
        {str(ctx.p.tabLabel) ? (
          <div className="mt-12 @3xl:mt-[150px] flex justify-center">
            <Txt ctx={ctx} k="tabLabel" className={`${ELDECO_BOX} border-[#1b1b1b] text-[#1b1b1b] text-center`} style={{ fontFamily: HELVETICA }} />
          </div>
        ) : null}
        <div className="mx-auto mt-12 @3xl:mt-[112px] max-w-[983px] grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-y-12 @3xl:gap-y-16 gap-x-10 text-center">
          {list.map((it) => (
            <El key={it.id} block={ctx.block} id={it.id} className="flex flex-col items-center">
              <IconImg src={it.get("icon")} className="w-14 h-14 @3xl:w-[60px] @3xl:h-[60px]" fallback={<Building2 className="w-14 h-14 text-[#111]" strokeWidth={0.9} />} />
              <ITxt ctx={ctx} item={it} k="title" className="mt-6 @3xl:mt-11 max-w-[290px] text-[13px] leading-[2.04] tracking-[0.08em] text-[#111]" />
            </El>
          ))}
        </div>
        <div className="mt-12 @3xl:mt-[60px] flex justify-center">
          <Btn ctx={ctx} className={BRONZE_BTN} />
        </div>
      </EldecoWrap>
    </Shell>
  );
}

const DIRECTION_FALLBACK = ["North", "East", "South", "West"];

/**
 * One compass axis run: ◆ at the outer end, a hairline, and an arrowhead at
 * the inner end (touching the emblem) pointing outwards. Fills the remaining
 * space of its flex parent; `dir` is the direction the arrowhead points.
 */
function CompassAxis({ dir, color }: { dir: "up" | "down" | "left" | "right"; color: string }) {
  const vertical = dir === "up" || dir === "down";
  const head = { up: "4,0 8,7 0,7", down: "0,0 8,0 4,7", left: "0,4 7,0 7,8", right: "0,0 7,4 0,8" }[dir];
  // Outer → inner order is ◆ — ▲ for up/left; down/right reverse it so the head still sits by the emblem.
  const flow = { up: "flex-col", down: "flex-col-reverse", left: "flex-row", right: "flex-row-reverse" }[dir];
  return (
    <span aria-hidden className={`flex-1 min-w-0 min-h-0 flex items-center ${flow}`}>
      <span className="block w-[7px] h-[7px] rotate-45 shrink-0" style={{ backgroundColor: color }} />
      <span className={`block flex-1 ${vertical ? "w-px" : "h-px"}`} style={{ backgroundColor: color }} />
      <svg
        width={vertical ? 8 : 7}
        height={vertical ? 7 : 8}
        viewBox={vertical ? "0 0 8 7" : "0 0 7 8"}
        className="shrink-0"
        fill={color}
      >
        <polygon points={head} />
      </svg>
    </span>
  );
}

function TarcCompass(ctx: Ctx) {
  const dirs = items(ctx, "directions").slice(0, 4);
  while (dirs.length < 4) {
    const index = dirs.length;
    dirs.push({ raw: {}, index, id: `${ctx.block.type}:dir-${index}`, get: () => "" });
  }
  const label = (i: number) => dirs[i].get("text") || DIRECTION_FALLBACK[i];
  const gold = ctx.accent;
  const dirTitle = (i: number, className: string) => (
    <div className={className}>
      <ITxt ctx={ctx} item={dirs[i]} k="title" className="text-[16px] @3xl:text-[17px] leading-tight tracking-[0.03em]" style={{ color: gold }} />
    </div>
  );
  return (
    <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20">
      <Wrap>
        <TarcHeading ctx={ctx} className="mb-10" />
        {/* Desktop compass — every piece is placed from the same centre point
            (CSS vars below), so the axes always run through the photo gaps and
            end on the emblem. Each axis is one flex run: title · label · ◆ ——— ▲
            with the arrowhead touching the emblem and pointing outwards (Figma). */}
        <div
          className="hidden @3xl:block relative mx-auto [--img:180px] [--gx:84px] [--gy:56px] [--emb:252px] [--side:130px] @5xl:[--img:240px] @5xl:[--gx:112px] @5xl:[--gy:72px] @5xl:[--emb:334px] @5xl:[--side:170px]"
          style={{
            width: "calc(var(--img) * 2 + var(--gx) + var(--side) * 2)",
            height: "calc(var(--img) * 2 + var(--gy) + 116px)",
          }}
        >
          {/* Quadrant photos (same index → quadrant order as before: TL, TR, BL, BR) */}
          {dirs.map((d, i) => (
            <El
              key={d.id}
              block={ctx.block}
              id={d.id}
              className="absolute overflow-hidden"
              style={{
                width: "var(--img)",
                height: "var(--img)",
                left: i % 2 === 0 ? "calc(50% - var(--gx) / 2 - var(--img))" : "calc(50% + var(--gx) / 2)",
                top: i < 2 ? "calc(50% - var(--gy) / 2 - var(--img))" : "calc(50% + var(--gy) / 2)",
              }}
            >
              <Pic src={d.get("image")} className="absolute inset-0 w-full h-full" />
              <Caption text={str(ctx.p.imageCaption)} className="left-1.5 bottom-1 text-[8px]" />
              <span className="sr-only">{label(i)}</span>
            </El>
          ))}
          {/* North */}
          <div className="absolute left-1/2 top-0 -translate-x-1/2 z-10 flex flex-col items-center" style={{ height: "calc(50% - var(--emb) / 2)" }}>
            {dirTitle(0, "text-center whitespace-nowrap")}
            <span className="mt-1.5 mb-1.5 text-[10px] tracking-[0.1em] uppercase">{label(0)}</span>
            <CompassAxis dir="up" color={gold} />
          </div>
          {/* South */}
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 z-10 flex flex-col-reverse items-center" style={{ height: "calc(50% - var(--emb) / 2)" }}>
            {dirTitle(2, "text-center whitespace-nowrap")}
            <span className="mt-1.5 mb-1.5 text-[10px] tracking-[0.1em] uppercase">{label(2)}</span>
            <CompassAxis dir="down" color={gold} />
          </div>
          {/* West */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center" style={{ width: "calc(50% - var(--emb) / 2)" }}>
            {dirTitle(3, "shrink-0 text-right w-[calc(var(--side)-12px)]")}
            <span className="ml-3 mr-2.5 text-[10px] tracking-[0.1em] uppercase">{label(3)}</span>
            <CompassAxis dir="left" color={gold} />
          </div>
          {/* East */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex flex-row-reverse items-center" style={{ width: "calc(50% - var(--emb) / 2)" }}>
            {dirTitle(1, "shrink-0 text-left w-[calc(var(--side)-12px)]")}
            <span className="mr-3 ml-2.5 text-[10px] tracking-[0.1em] uppercase">{label(1)}</span>
            <CompassAxis dir="right" color={gold} />
          </div>
          {/* Emblem */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-full bg-white p-3 grid place-items-center"
            style={{ width: "var(--emb)", height: "var(--emb)" }}
          >
            <Pic src={str(ctx.p.centerImage)} fit="contain" className="w-full h-full rounded-full" />
          </div>
        </div>
        {/* Phone / tablet: emblem, then the four photos with their titles */}
        <div className="@3xl:hidden">
          <div className="mx-auto w-44 h-44 rounded-full bg-white grid place-items-center">
            <Pic src={str(ctx.p.centerImage)} fit="contain" className="w-full h-full rounded-full" />
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {dirs.map((d, i) => (
              <El key={d.id} block={ctx.block} id={d.id} className="text-center">
                <div className="relative overflow-hidden aspect-square">
                  <Pic src={d.get("image")} className="absolute inset-0 w-full h-full" />
                </div>
                <div className="mt-2 text-[10px] tracking-[0.1em] uppercase">{label(i)}</div>
                <ITxt ctx={ctx} item={d} k="title" className="mt-1 text-[14px] leading-snug" style={{ color: gold }} />
              </El>
            ))}
          </div>
        </div>
      </Wrap>
    </Shell>
  );
}
