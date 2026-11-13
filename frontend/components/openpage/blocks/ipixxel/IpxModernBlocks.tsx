"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, Building, Building2, Compass, Leaf, MapPin, Sparkles, Users } from "lucide-react";
import type { BlockConfig } from "../types";
import { El } from "../El";
import { part, safeHref, str } from "../elements/shared";
import { isMediaSrc } from "@/lib/media";
import { LeadForm, MapArea } from "./parts";
import {
  Btn,
  categories,
  IconImg,
  INTER_TIGHT,
  ITxt,
  Pic,
  Shell,
  Txt,
  items,
  lines,
  makeCtx,
  useModernFonts,
  type Ctx,
  type Item,
} from "./shared";

/**
 * "Modern" templates for the iPixxel Realty widgets: clean white / light-grey
 * and black sections, tight sans titles with a grey second line, small spaced
 * eyebrows, rounded cards and black pill buttons.
 *
 * Each widget's block component calls the matching renderer here when its
 * template name starts with "modern-"; every text stays an {@link El}.
 */

const LIGHT = "#f4f4f4";

/** Wider content column than the shared Wrap (as in the artwork). */
function MWrap({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`relative mx-auto w-full max-w-[1200px] px-5 @3xl:px-8 ${className}`}>{children}</div>;
}

/** Paragraphs of a textarea (blank line = new paragraph). */
function paragraphs(v: unknown): string[] {
  return str(v)
    .split(/\r?\n\s*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Label | URL" lines → links (unsafe URLs are dropped, label kept). */
export function parseLinks(v: unknown): { label: string; href: string; heading: boolean }[] {
  return lines(v).map((line) => {
    if (line.startsWith("# ")) return { label: line.slice(2).trim(), href: "", heading: true };
    const [label, url = ""] = line.split("|").map((s) => s.trim());
    return { label, href: safeHref(url), heading: false };
  });
}

function LinkText({ href, children, className }: { href: string; children: ReactNode; className: string }) {
  if (!href) return <span className={className}>{children}</span>;
  const external = /^https?:/i.test(href);
  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className={`${className} hover:underline`}>
      {children}
    </a>
  );
}

/** Tiny spaced uppercase label. */
function Eyebrow({ ctx, light = false, className = "" }: { ctx: Ctx; light?: boolean; className?: string }) {
  return (
    <Txt
      ctx={ctx}
      k="eyebrow"
      className={`uppercase tracking-[0.28em] text-[11px] @3xl:text-[12px] ${light ? "text-white/70" : "text-[#4b4b4b]"} ${className}`}
    />
  );
}

/** Two-line title: black (or white) first line, grey second line. */
function Title({ ctx, light = false, as = "h2", className = "" }: { ctx: Ctx; light?: boolean; as?: "h1" | "h2"; className?: string }) {
  if (!str(ctx.p.title) && !str(ctx.p.titleAccent)) return null;
  const Tag = as;
  return (
    <Tag
      className={`font-semibold leading-[1.04] tracking-[-0.035em] text-[34px] @md:text-[42px] @3xl:text-[54px] ${className}`}
      style={{ fontFamily: INTER_TIGHT }}
    >
      <Txt ctx={ctx} k="title" as="span" className={`block whitespace-pre-line ${light ? "text-white" : "text-[#0b0b0b]"}`} />
      <Txt ctx={ctx} k="titleAccent" as="span" className="block whitespace-pre-line" style={{ color: "var(--ipx-accent)" }} />
    </Tag>
  );
}

/** Paragraph prop, split on blank lines. */
function Paras({ ctx, k, className, light = false }: { ctx: Ctx; k: string; className?: string; light?: boolean }) {
  const ps = paragraphs(ctx.p[k]);
  if (!ps.length) return null;
  return (
    <Txt
      ctx={ctx}
      k={k}
      as="div"
      className={`flex flex-col gap-4 text-[15px] leading-[1.8] ${light ? "text-white/80" : "text-[#4b4b4b]"} ${className ?? ""}`}
      value={ps.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    />
  );
}

/** Eyebrow + title on the left, paragraph on the right (stacked on phones). */
function SplitHead({ ctx, descKey = "description", light = false }: { ctx: Ctx; descKey?: string; light?: boolean }) {
  return (
    <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6 @3xl:gap-16 items-start">
      <div>
        <Eyebrow ctx={ctx} light={light} />
        <Title ctx={ctx} light={light} className="mt-4 @3xl:mt-5" />
      </div>
      <Paras ctx={ctx} k={descKey} light={light} className="@3xl:pt-10" />
    </div>
  );
}

const PILL =
  "inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[13px] @3xl:text-[14px] font-medium transition hover:opacity-90";

/** Black pill button with the ↗ arrow. */
function PillButton({ ctx, prefix = "button", textKey, light = false, className = "" }: { ctx: Ctx; prefix?: string; textKey?: string; light?: boolean; className?: string }) {
  if (!str(ctx.p[textKey ?? `${prefix}Text`])) return null;
  return (
    <Btn
      ctx={ctx}
      prefix={prefix}
      textKey={textKey}
      className={`${PILL} ${light ? "bg-white text-[#0b0b0b]" : "bg-[#0b0b0b] text-white"} ${className}`}
      icon={<ArrowUpRight aria-hidden size={16} strokeWidth={1.8} />}
    />
  );
}

function CenterButton({ ctx, prefix, textKey }: { ctx: Ctx; prefix?: string; textKey?: string }) {
  if (!str(ctx.p[textKey ?? `${prefix ?? "button"}Text`])) return null;
  return (
    <div className="mt-10 flex justify-center">
      <PillButton ctx={ctx} prefix={prefix} textKey={textKey} />
    </div>
  );
}

/* ========================================================================= */
/* Overview                                                                  */
/* ========================================================================= */

export function ModernOverview({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-overview");
  const stats = items(ctx, "stats");
  return (
    <Shell ctx={ctx} className="bg-white py-16 @3xl:py-24">
      <MWrap className="grid grid-cols-1 @3xl:grid-cols-[1fr_1fr] gap-12 @3xl:gap-20 items-start">
        <div>
          <Eyebrow ctx={ctx} />
          <Title ctx={ctx} className="mt-5" />
          <Paras ctx={ctx} k="description" className="mt-8 @3xl:mt-10 @3xl:text-[16px]" />
        </div>
        <div className="relative pb-8 @3xl:pb-0">
          <div className="relative overflow-hidden rounded-[28px] aspect-[540/570]">
            <Pic src={str(ctx.p.image)} alt={str(ctx.p.title)} className="absolute inset-0 w-full h-full" />
          </div>
          {stats.length ? (
            <div className="absolute -bottom-0 left-4 @3xl:-bottom-6 @3xl:-left-8 flex rounded-[22px] border border-black/10 bg-white px-2 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
              {stats.map((st, i) => (
                <El key={st.id} block={ctx.block} id={st.id} className={`px-5 @3xl:px-7 ${i ? "border-l border-black/10" : ""}`}>
                  <ITxt ctx={ctx} item={st} k="value" className="text-[26px] @3xl:text-[30px] font-medium leading-none text-[#0b0b0b]" style={{ fontFamily: INTER_TIGHT }} />
                  <ITxt ctx={ctx} item={st} k="label" className="mt-2 uppercase tracking-[0.2em] text-[10px] @3xl:text-[11px] text-[#4b4b4b]" />
                </El>
              ))}
            </div>
          ) : null}
        </div>
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Highlights: black grid                                                    */
/* ========================================================================= */

const HIGHLIGHT_ICONS = [Building2, Building, Users, ArrowUpRight, Leaf, Compass];

/** Divider lines between grid cells for 1 / 2 / 3 columns. */
function cellBorders(i: number): string {
  const mobile = i > 0 ? "border-t" : "";
  const md = `${i % 2 ? "@md:border-l" : "@md:border-l-0"} ${i >= 2 ? "@md:border-t" : "@md:border-t-0"}`;
  const xl = `${i % 3 ? "@3xl:border-l" : "@3xl:border-l-0"} ${i >= 3 ? "@3xl:border-t" : "@3xl:border-t-0"}`;
  return `${mobile} ${md} ${xl}`;
}

export function ModernHighlights({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-grid");
  const list = items(ctx);
  return (
    <Shell ctx={ctx} className="text-white py-16 @3xl:py-24" style={{ backgroundColor: "#000000" }}>
      <MWrap>
        <Eyebrow ctx={ctx} light />
        <Title ctx={ctx} light className="mt-5" />
        <Paras ctx={ctx} k="subtitle" light className="mt-6 max-w-[620px]" />
        {list.length ? (
          <div className="mt-12 @3xl:mt-16 grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3">
            {list.map((it) => {
              const Icon = HIGHLIGHT_ICONS[it.index % HIGHLIGHT_ICONS.length];
              return (
                <El
                  key={it.id}
                  block={ctx.block}
                  id={it.id}
                  className={`border-white/15 py-8 @md:px-7 @3xl:py-9 ${it.index % 3 === 0 ? "@3xl:pl-0" : "@3xl:pl-7"} ${it.index % 2 === 0 ? "@md:pl-0" : ""} ${cellBorders(it.index)}`}
                >
                  <IconImg src={it.get("icon")} className="w-7 h-7" fallback={<Icon aria-hidden className="w-7 h-7 text-white" strokeWidth={1.1} />} />
                  <ITxt ctx={ctx} item={it} k="title" as="h3" className="mt-8 text-[19px] @3xl:text-[21px] font-medium tracking-[-0.02em] text-white" style={{ fontFamily: INTER_TIGHT }} />
                  <ITxt ctx={ctx} item={it} k="text" className="mt-3 max-w-[260px] text-[12.5px] leading-[1.6] text-white/70" />
                </El>
              );
            })}
          </div>
        ) : null}
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Floor plans: residence cards                                              */
/* ========================================================================= */

function ArrowCircle() {
  return (
    <span aria-hidden className="grid place-items-center w-8 h-8 shrink-0 rounded-full border border-black/15 text-[#0b0b0b]">
      <ArrowUpRight size={14} strokeWidth={1.6} />
    </span>
  );
}

/** "Label | Value" lines of a plan's areas; a line without "|" is a note. */
function planSpecs(raw: string): Array<{ label: string; value: string }> {
  return lines(raw).map((l) => {
    const [label, ...rest] = l.split("|");
    return { label: label.trim(), value: rest.join("|").trim() };
  });
}

export function ModernResidences({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-cards");
  const plans = items(ctx, "plans");
  return (
    <Shell ctx={ctx} className="bg-white py-16 @3xl:py-24">
      <MWrap>
        <SplitHead ctx={ctx} />
        {plans.length ? (
          <div className="mt-12 @3xl:mt-16 grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4 gap-5">
            {plans.map((pl) => (
              <El key={pl.id} block={ctx.block} id={pl.id} className="overflow-hidden rounded-[20px] border border-black/10 bg-white">
                <div className="relative aspect-[267/248]">
                  <Pic src={pl.get("image")} alt={pl.get("title")} className="absolute inset-0 w-full h-full" />
                </div>
                <div className="px-5 pt-5 pb-6">
                  <div className="flex items-center justify-between gap-3">
                    <ITxt ctx={ctx} item={pl} k="title" as="h3" className="text-[17px] font-medium text-[#0b0b0b]" style={{ fontFamily: INTER_TIGHT }} />
                    <ArrowCircle />
                  </div>
                  {pl.get("price") ? (
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-[11px] uppercase tracking-[0.08em] text-[#8a8a8a]">{str(ctx.p.priceLabel, "Starting Price")}</span>
                      <ITxt ctx={ctx} item={pl} k="price" as="span" className="text-[17px] font-medium text-[#0b0b0b]" style={{ fontFamily: INTER_TIGHT }} />
                    </div>
                  ) : null}
                  {planSpecs(pl.get("specs")).length ? (
                    <div className="mt-4 border-t border-black/10">
                      {planSpecs(pl.get("specs")).map((sp, n) =>
                        sp.value ? (
                          <div key={n} className="py-2.5 border-b border-black/10">
                            <div className="text-[11px] uppercase tracking-[0.06em] text-[#8a8a8a]">{sp.label}</div>
                            <div className="mt-0.5 text-[12.5px] leading-[1.5] text-[#0b0b0b]">{sp.value}</div>
                          </div>
                        ) : (
                          <div key={n} className="pt-2 text-[11px] text-[#8a8a8a]">{sp.label}</div>
                        ),
                      )}
                    </div>
                  ) : null}
                  <ITxt ctx={ctx} item={pl} k="text" className="mt-4 text-[12.5px] leading-[1.65] text-[#4b4b4b]" />
                </div>
              </El>
            ))}
          </div>
        ) : null}
        <CenterButton ctx={ctx} />
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Master plan                                                               */
/* ========================================================================= */

export function ModernMasterPlan({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-plan");
  return (
    <Shell ctx={ctx} className="bg-white py-16 @3xl:py-24">
      <MWrap>
        <SplitHead ctx={ctx} descKey="subtitle" />
        <El block={ctx.block} id={part(ctx.block, "plan")} className="relative mt-12 @3xl:mt-16 overflow-hidden rounded-[28px] aspect-[4/3] @md:aspect-[1137/516] bg-[#e9ece6]">
          <Pic src={str(ctx.p.image)} alt={str(ctx.p.title)} className="absolute inset-0 w-full h-full" />
        </El>
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Gallery: landscape tabs + bento grid                                      */
/* ========================================================================= */

export function ModernLandscapeTabs({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-tabs");
  const images = items(ctx, "images");
  const tabs = categories(images);
  const [tab, setTab] = useState(0);
  const [slide, setSlide] = useState(0);
  const activeTab = tabs[Math.min(tab, tabs.length - 1)];
  const group = activeTab ? images.filter((im) => im.get("category").trim() === activeTab) : images;
  const current = group[Math.min(slide, group.length - 1)];
  const pick = (i: number) => {
    setTab(i);
    setSlide(0);
  };
  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24" style={{ backgroundColor: LIGHT }}>
      <MWrap>
        <SplitHead ctx={ctx} />
        {tabs.length > 1 ? (
          <div role="tablist" className="mt-10 @3xl:mt-14 flex gap-6 @3xl:gap-11 overflow-x-auto pb-1">
            {tabs.map((name, i) => {
              const active = name === activeTab;
              return (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => pick(i)}
                  className={`shrink-0 border-b-2 pb-3 text-[13px] @3xl:text-[14px] transition ${active ? "border-[#0b0b0b] font-medium text-[#0b0b0b]" : "border-transparent text-[#4b4b4b] hover:text-[#0b0b0b]"}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : null}
        {current ? (
          <El block={ctx.block} id={current.id} className="relative mt-6 overflow-hidden rounded-[28px] aspect-[4/3] @md:aspect-[1137/550]">
            <Pic src={current.get("src")} alt={current.get("alt") || current.get("caption")} tone="dark" className="absolute inset-0 w-full h-full" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.6))" }} />
            <div className="absolute left-5 right-5 bottom-5 @3xl:left-9 @3xl:right-auto @3xl:bottom-9 @3xl:max-w-[440px] text-white">
              <ITxt ctx={ctx} item={current} k="caption" value={current.get("caption") || activeTab} as="h3" className="text-[22px] @3xl:text-[30px] font-medium tracking-[-0.02em]" style={{ fontFamily: INTER_TIGHT }} />
              <ITxt ctx={ctx} item={current} k="text" className="mt-2 text-[12.5px] @3xl:text-[13px] leading-[1.6] text-white/85" />
            </div>
            {group.length > 1 ? (
              <div className="absolute right-5 bottom-5 @3xl:right-9 @3xl:bottom-10 flex items-center gap-1.5">
                {group.map((im, i) => (
                  <button
                    key={im.id}
                    type="button"
                    aria-label={`Show image ${i + 1}`}
                    aria-current={im === current}
                    onClick={() => setSlide(i)}
                    className={`h-2 rounded-full transition-all ${im === current ? "w-7 bg-white" : "w-2 bg-white/60 hover:bg-white/80"}`}
                  />
                ))}
              </div>
            ) : null}
          </El>
        ) : null}
      </MWrap>
    </Shell>
  );
}

export function ModernBento({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-bento");
  const images = items(ctx, "images").slice(0, 5);
  return (
    <Shell ctx={ctx} className="bg-white py-16 @3xl:py-24">
      <MWrap>
        <SplitHead ctx={ctx} />
        {images.length ? (
          <div className="mt-12 @3xl:mt-16 grid grid-cols-2 @3xl:grid-cols-[2fr_1fr_1fr] @3xl:grid-rows-[230px_230px] gap-3 @3xl:gap-4">
            {images.map((im, i) => (
              <El
                key={im.id}
                block={ctx.block}
                id={im.id}
                className={`relative overflow-hidden rounded-[20px] ${i === 0 ? "col-span-2 @3xl:col-span-1 @3xl:row-span-2 aspect-[4/3] @3xl:aspect-auto" : "aspect-[4/3] @3xl:aspect-auto"}`}
              >
                <Pic src={im.get("src")} alt={im.get("alt") || im.get("caption")} className="absolute inset-0 w-full h-full" />
              </El>
            ))}
          </div>
        ) : null}
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Amenities: pill list                                                      */
/* ========================================================================= */

export function ModernAmenityPills({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-pills");
  const list = items(ctx);
  return (
    <Shell ctx={ctx} className="bg-white py-16 @3xl:py-24">
      <MWrap>
        <SplitHead ctx={ctx} />
        {list.length ? (
          <div className="mt-12 @3xl:mt-16 grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-4">
            {list.map((it) => (
              <El key={it.id} block={ctx.block} id={it.id} className="flex items-center gap-4 rounded-full border border-black/10 bg-white px-6 h-[60px] @3xl:h-[64px]">
                <IconImg src={it.get("icon")} className="w-5 h-5" fallback={<Sparkles aria-hidden className="w-5 h-5 text-[#0b0b0b]" strokeWidth={1.3} />} />
                <ITxt ctx={ctx} item={it} k="title" as="h3" className="text-[14px] font-medium text-[#0b0b0b]" />
              </El>
            ))}
          </div>
        ) : null}
        <CenterButton ctx={ctx} />
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Location: map + distance cards                                            */
/* ========================================================================= */

function PlaceCard({ ctx, item }: { ctx: Ctx; item: Item }) {
  return (
    <El block={ctx.block} id={item.id} className="flex items-center gap-4 rounded-[20px] border border-black/10 bg-[#fbfaf7] px-5 py-4 @3xl:py-5">
      <IconImg src={item.get("icon")} className="w-5 h-5" fallback={<MapPin aria-hidden className="w-5 h-5 shrink-0 text-[#0b0b0b]" strokeWidth={1.5} />} />
      <div className="min-w-0 flex-1">
        <ITxt ctx={ctx} item={item} k="title" as="h3" className="text-[15px] font-medium text-[#0b0b0b]" />
        <ITxt ctx={ctx} item={item} k="text" className="mt-1 text-[12px] text-[#6b6b6b]" />
      </div>
      <ITxt ctx={ctx} item={item} k="value" className="shrink-0 text-right text-[12px] text-[#0b0b0b]" />
    </El>
  );
}

export function ModernLocation({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-list");
  const places = items(ctx, "places");
  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24" style={{ backgroundColor: LIGHT }}>
      <MWrap>
        <SplitHead ctx={ctx} />
        <div className="mt-12 @3xl:mt-16 grid grid-cols-1 @3xl:grid-cols-[1.25fr_1fr] gap-8 @3xl:gap-14 items-start">
          <MapArea ctx={ctx} className="rounded-[28px] aspect-[620/500] bg-white" />
          {places.length ? (
            <div className="flex flex-col gap-3">
              {places.map((pl) => (
                <PlaceCard key={pl.id} ctx={ctx} item={pl} />
              ))}
            </div>
          ) : null}
        </div>
        <CenterButton ctx={ctx} />
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Enquiry form (the form itself comes from Form Builder, unstyled)          */
/* ========================================================================= */

export function ModernFormSplit({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-split");
  const label = lines(ctx.p.imageLabel);
  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24" style={{ backgroundColor: LIGHT }}>
      <MWrap>
        <SplitHead ctx={ctx} />
        <div className="mt-12 @3xl:mt-16 grid grid-cols-1 @3xl:grid-cols-2 overflow-hidden rounded-[28px] border border-black/10 bg-white">
          <div className="relative min-h-[260px] @3xl:min-h-[536px]">
            <Pic src={str(ctx.p.image)} className="absolute inset-0 w-full h-full" />
            {label.length ? (
              <Txt
                ctx={ctx}
                k="imageLabel"
                as="div"
                className="absolute left-5 bottom-5 rounded-full bg-white/90 px-5 py-2.5 uppercase tracking-[0.22em] text-[10.5px] leading-[1.5] text-[#0b0b0b]"
                value={label.map((l, i) => (
                  <span key={i} className={`block ${i ? "text-[#4b4b4b]" : ""}`}>
                    {l}
                  </span>
                ))}
              />
            ) : null}
          </div>
          <div className="px-6 py-8 @3xl:px-12 @3xl:py-14">
            <El block={ctx.block} id={part(ctx.block, "form")}>
              <LeadForm ctx={ctx} />
            </El>
            <Txt ctx={ctx} k="formNote" className="mt-5 italic text-[11.5px] leading-[1.6] text-[#6b6b6b]" />
          </div>
        </div>
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* CTA banner                                                                */
/* ========================================================================= */

export function ModernBanner({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-banner");
  const image = str(ctx.p.image);
  return (
    <Shell ctx={ctx} className="text-white py-24 @3xl:py-32" style={{ backgroundColor: "#1b1a17" }}>
      {isMediaSrc(image) ? <Pic src={image} className="absolute inset-0 w-full h-full" /> : null}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.55))" }} />
      <MWrap className="flex flex-col items-center text-center">
        <Eyebrow ctx={ctx} light />
        <h2 className="mt-6 font-semibold leading-[1] tracking-[-0.045em] text-white text-[40px] @md:text-[52px] @3xl:text-[60px]" style={{ fontFamily: INTER_TIGHT }}>
          <Txt ctx={ctx} k="title" as="span" className="block whitespace-pre-line" />
          <Txt ctx={ctx} k="titleAccent" as="span" className="block whitespace-pre-line" />
        </h2>
        <Txt ctx={ctx} k="subtitle" className="mt-6 max-w-[560px] whitespace-pre-line text-[14px] @3xl:text-[15px] text-white/90" />
        <div className="mt-9 flex flex-wrap items-center justify-center gap-6">
          <PillButton ctx={ctx} light />
          <Btn
            ctx={ctx}
            prefix="second"
            className="inline-flex items-center gap-3 border-b border-white/70 pb-1.5 text-[12.5px] text-white hover:border-white"
            icon={<ArrowUpRight aria-hidden size={15} strokeWidth={1.8} />}
          />
        </div>
        <Txt ctx={ctx} k="note" className="mt-10 tracking-[0.12em] text-[10.5px] text-white/80" />
      </MWrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Footer: link columns + disclaimer                                         */
/* ========================================================================= */

export function ModernFooter({ block }: { block: BlockConfig }) {
  useModernFonts();
  const ctx = makeCtx(block, "modern-columns");
  const cols = items(ctx, "columns");
  const bottom = parseLinks(ctx.p.bottomLinks).filter((l) => !l.heading);
  return (
    <Shell ctx={ctx} className="text-white pt-14 pb-10" style={{ backgroundColor: "#000000" }}>
      <MWrap>
        {cols.length ? (
          <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4 gap-x-10 gap-y-10">
            {cols.map((col) => (
              <El key={col.id} block={ctx.block} id={col.id}>
                <ITxt ctx={ctx} item={col} k="title" as="h3" className="text-[15px] font-medium text-white" />
                <ul className="mt-4 flex flex-col gap-2.5">
                  {parseLinks(col.raw.links).map((l, i) =>
                    l.heading ? (
                      <li key={i} className="pt-2 text-[15px] font-medium text-white/60">
                        {l.label}
                      </li>
                    ) : (
                      <li key={i}>
                        <LinkText href={l.href} className="text-[13px] text-white/60">
                          {l.label}
                        </LinkText>
                      </li>
                    ),
                  )}
                </ul>
              </El>
            ))}
          </div>
        ) : null}
        <div className="mt-14 border-t border-white/10 pt-7">
          <Txt ctx={ctx} k="disclaimer" className="whitespace-pre-line text-[11.5px] leading-[1.75] text-white/50" />
          <p className="mt-5 text-[11.5px] text-white/50">
            <Txt ctx={ctx} k="credit" as="span" />
            {bottom.map((l, i) => (
              <span key={i}>
                {str(ctx.p.credit) || i ? " · " : ""}
                <LinkText href={l.href} className="text-white">
                  {l.label}
                </LinkText>
              </span>
            ))}
          </p>
        </div>
      </MWrap>
    </Shell>
  );
}
