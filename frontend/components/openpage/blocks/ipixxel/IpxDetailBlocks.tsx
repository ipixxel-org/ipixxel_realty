"use client";

import type { CSSProperties } from "react";
import { MapPin } from "lucide-react";
import type { BlockConfig } from "../types";
import { El } from "../El";
import { CtaButton } from "../CtaButton";
import { color, flag, part, safeHref, str } from "../elements/shared";
import { isMediaSrc } from "@/lib/media";
import { MapArea } from "./parts";
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
  MONTSERRAT,
  Pic,
  SERIF,
  Shell,
  TarcHeading,
  Txt,
  Wrap,
  items,
  lines,
  makeCtx,
  pickVariant,
  scrollToAnchor,
  useIpxFonts,
  type Ctx,
} from "./shared";
import { EmeraldAbout, EmeraldLocation, EmeraldPriceRows } from "./IpxEmeraldBlocks";

/* ========================================================================= */
/* Pricing                                                                   */
/* ========================================================================= */

export const PRICING_VARIANTS = ["burgundy-cards", "eldeco-cards", "emerald-rows"] as const;

/** The shared per-card button (same text / link / colours on every card). */
function CardButton({ ctx, className }: { ctx: Ctx; className: string }) {
  const label = str(ctx.p.cardButtonText);
  if (!label) return null;
  return (
    <CtaButton
      block={ctx.block}
      id={part(ctx.block, "cardButtonText")}
      prefix="cardButton"
      label={label}
      href={safeHref(ctx.p.cardButtonUrl)}
      target={str(ctx.p.cardButtonTarget)}
      onClick={() => scrollToAnchor(str(ctx.p.cardButtonAnchor, "enquire"))}
      brand={null}
      icon={null}
      className={className}
    />
  );
}

export function IpxPricingBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, PRICING_VARIANTS);
  const ctx = makeCtx(block, variant);
  const units = items(ctx, "units");

  if (variant === "emerald-rows") return <EmeraldPriceRows block={block} />;

  if (variant === "eldeco-cards") {
    return (
      <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20" style={{ ...bronzeVar(ctx), "--ipx-card-btn": color(ctx.p.cardButtonColor) ?? "var(--ipx-btn-bg)" } as CSSProperties}>
        <Wrap>
          <EldecoHeading ctx={ctx} />
          <div className="mx-auto mt-12 @3xl:mt-20 max-w-[882px] grid grid-cols-1 @md:grid-cols-2 gap-10 @3xl:gap-[150px]">
            {units.map((u) => (
              <El key={u.id} block={ctx.block} id={u.id} className="bg-white px-8 @3xl:px-12 py-12 text-center shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                <ITxt ctx={ctx} item={u} k="title" className="border border-[#1b1b1b] px-4 py-3 uppercase tracking-[0.2em] text-[14px] @3xl:text-[15px] leading-snug whitespace-pre-line" />
                <Txt ctx={ctx} k="priceLabel" className="mt-9 tracking-[0.12em] text-[15px] @3xl:text-[16px]" />
                <ITxt ctx={ctx} item={u} k="price" className="mt-4 pb-3 border-b border-[#eee] tracking-[0.14em] font-medium text-[21px] @3xl:text-[22px]" />
                <div className="mt-6 flex justify-center">
                  <CardButton ctx={ctx} className={`${BRONZE_BTN} [background:var(--ipx-card-btn)]`} />
                </div>
              </El>
            ))}
          </div>
          <Txt ctx={ctx} k="note" className="mt-8 text-center text-[12px] text-[#555]" />
        </Wrap>
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} className="bg-white py-16 @3xl:py-24">
      <Wrap>
        <BurgundyHeading ctx={ctx} />
        <div className="mt-12 @3xl:mt-16 grid grid-cols-1 @3xl:grid-cols-2 gap-6">
          {units.map((u, n) => {
            const hot = flag(u.raw.highlight, n === 1);
            return (
              <El
                key={u.id}
                block={ctx.block}
                id={u.id}
                className={`relative px-7 @3xl:px-10 pt-12 pb-10 border ${hot ? "text-white border-transparent" : "bg-white border-[#eeeeee]"}`}
                style={hot ? { backgroundColor: ctx.accent } : undefined}
              >
                <ITxt
                  ctx={ctx}
                  item={u}
                  k="badge"
                  className="absolute top-0 right-5 px-3.5 py-1.5 uppercase font-bold tracking-[0.25em] text-[10px]"
                  style={hot ? { backgroundColor: BURGUNDY_GOLD, color: "#3b2a12" } : { backgroundColor: ctx.accent, color: "#fff" }}
                />
                <ITxt ctx={ctx} item={u} k="title" as="h3" className="text-[28px] @3xl:text-[30px]" style={{ fontFamily: SERIF, color: hot ? "#e7c891" : "#1b1b1b" }} />
                <ITxt ctx={ctx} item={u} k="area" className={`mt-3 uppercase tracking-[0.25em] text-[11px] ${hot ? "text-white/60" : "text-[#555]"}`} />
                <ITxt ctx={ctx} item={u} k="price" className="mt-6 font-bold text-[34px] @3xl:text-[36px]" style={{ color: hot ? "#fff" : ctx.accent }} />
                {lines(u.get("features")).length ? (
                  <ul className="mt-3">
                    {lines(u.get("features")).map((f, k) => (
                      <li key={k} className={`flex items-baseline gap-3 py-2 border-b text-[14px] ${hot ? "border-white/15 text-white/85" : "border-[#efefef] text-[#555]"}`}>
                        <span aria-hidden style={{ color: BURGUNDY_GOLD }}>✦</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-8">
                  <CardButton
                    ctx={ctx}
                    className={`w-full justify-center py-3.5 border uppercase font-semibold tracking-[0.25em] text-[12px] @3xl:text-[13px] ${
                      hot ? "bg-white/10 border-white/30 text-white hover:bg-white/20" : "bg-white text-[var(--ipx-accent)] border-[var(--ipx-accent)] hover:bg-[var(--ipx-accent)] hover:text-white"
                    }`}
                  />
                </div>
              </El>
            );
          })}
        </div>
        <Txt ctx={ctx} k="note" className="mt-5 text-center text-[12px] text-[#555]" />
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Location / map                                                            */
/* ========================================================================= */

export const LOCATION_VARIANTS = ["burgundy-map", "eldeco-map", "tarc-map", "emerald-map"] as const;

export function IpxLocationBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, LOCATION_VARIANTS);
  const ctx = makeCtx(block, variant);
  const places = items(ctx, "places");

  if (variant === "emerald-map") return <EmeraldLocation block={block} />;

  if (variant === "eldeco-map") {
    return (
      <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20" style={bronzeVar(ctx)}>
        <Wrap>
          <EldecoHeading ctx={ctx} />
          <div className="mt-10 @3xl:mt-12 grid grid-cols-1 @3xl:grid-cols-[1fr_1fr] gap-10 @3xl:gap-20 items-start">
            <MapArea ctx={ctx} className="aspect-[558/446] bg-[#f4f1ea]" />
            <div className="@3xl:pt-6">
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-6">
                {places.map((pl) => (
                  <El key={pl.id} block={ctx.block} id={pl.id} className="flex items-center gap-4 py-4 border-b border-[#eeeeee]">
                    <span className="grid place-items-center shrink-0 w-16 h-[54px] rounded-[4px] [background:var(--ipx-btn-bg)]">
                      <IconImg src={pl.get("icon")} className="w-8 h-8 brightness-0 invert" fallback={<MapPin className="w-7 h-7 text-white" strokeWidth={1.3} />} />
                    </span>
                    <span className="text-[13.5px] tracking-[0.06em] leading-[1.55] text-[#1b1b1b]">
                      <ITxt ctx={ctx} item={pl} k="title" as="span" />
                      {pl.get("value") ? <> - <ITxt ctx={ctx} item={pl} k="value" as="span" /></> : null}
                    </span>
                  </El>
                ))}
              </div>
              <div className="mt-12 flex justify-center">
                <Btn ctx={ctx} className={BRONZE_BTN} />
              </div>
            </div>
          </div>
        </Wrap>
      </Shell>
    );
  }

  if (variant === "tarc-map") {
    return (
      <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20">
        <Wrap>
          <TarcHeading ctx={ctx} />
          {str(ctx.p.address) ? (
            <div className="mt-6 flex items-center justify-center gap-2">
              <MapPin className="w-6 h-6" strokeWidth={1.2} style={{ color: ctx.accent }} />
              <Txt ctx={ctx} k="address" as="span" className="text-[15px] @3xl:text-[16px] tracking-[0.06em]" />
            </div>
          ) : null}
          <MapArea ctx={ctx} className="mx-auto mt-5 w-full max-w-[744px] aspect-[744/412] bg-[#f4f4f4]" />
          <div className="mx-auto mt-10 @3xl:mt-12 max-w-[744px] flex flex-wrap justify-center gap-x-12 gap-y-10">
            {places.map((pl) => (
              <El
                key={pl.id}
                block={ctx.block}
                id={pl.id}
                className="w-[calc(50%-24px)] @3xl:w-[216px] pb-5 text-center border-b"
                style={{ borderColor: "color-mix(in srgb, var(--ipx-accent) 55%, transparent)" }}
              >
                <ITxt ctx={ctx} item={pl} k="value" className="text-[16px] @3xl:text-[17px] tracking-[0.05em]" style={{ color: ctx.accent }} />
                <ITxt ctx={ctx} item={pl} k="title" className="mt-2 text-[17px] @3xl:text-[19px] tracking-[0.04em] leading-tight" />
              </El>
            ))}
          </div>
        </Wrap>
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24" style={{ backgroundColor: FAMILY.burgundy.cream }}>
      <Wrap>
        <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_1.05fr] gap-12 @3xl:gap-16 items-center">
          <div>
            <BurgundyHeading ctx={ctx} />
            <ul className="mt-8">
              {places.map((pl) => (
                <El key={pl.id} block={ctx.block} id={pl.id} as="li" className="flex items-baseline justify-between gap-4 py-4 border-b border-[#e6dada]">
                  <span className="flex items-baseline gap-3">
                    <span aria-hidden style={{ color: BURGUNDY_GOLD }}>✦</span>
                    <ITxt ctx={ctx} item={pl} k="title" as="span" className="text-[18px] @3xl:text-[19px] text-[#3d3d3d]" style={{ fontFamily: SERIF }} />
                  </span>
                  <ITxt ctx={ctx} item={pl} k="value" as="span" className="shrink-0 uppercase tracking-[0.2em] text-[11.5px] font-semibold" style={{ color: ctx.accent }} />
                </El>
              ))}
            </ul>
            <div className="mt-10">
              <Btn ctx={ctx} className="inline-flex px-10 py-4 uppercase font-semibold tracking-[0.25em] text-[12px] @3xl:text-[13px] text-white bg-[var(--ipx-accent)] hover:brightness-110" />
            </div>
          </div>
          <MapArea ctx={ctx} className="aspect-[560/480] bg-white border-[10px] border-white shadow-[0_20px_50px_rgba(0,0,0,0.08)]" />
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* About the developer                                                       */
/* ========================================================================= */

export const ABOUT_VARIANTS = ["burgundy-stats", "eldeco-stats", "tarc-banner", "emerald-about"] as const;

function Logo({ ctx, className, textClass, textStyle }: { ctx: Ctx; className: string; textClass: string; textStyle?: CSSProperties }) {
  const logo = str(ctx.p.logo);
  if (isMediaSrc(logo)) {
    return (
      <El block={ctx.block} id={part(ctx.block, "logo")} className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={str(ctx.p.logoText)} draggable={false} className={`${className} w-auto object-contain`} />
      </El>
    );
  }
  return <Txt ctx={ctx} k="logoText" className={textClass} style={textStyle} />;
}

export function IpxAboutBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, ABOUT_VARIANTS);
  const ctx = makeCtx(block, variant);
  const stats = items(ctx, "stats");

  if (variant === "emerald-about") return <EmeraldAbout block={block} />;

  if (variant === "eldeco-stats") {
    const brand = color(ctx.p.brandColor) ?? "#0d6b45";
    return (
      <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20">
        <Wrap>
          <Logo
            ctx={ctx}
            className="h-12 @3xl:h-14"
            textClass="text-center font-black tracking-[0.01em] text-[34px] @3xl:text-[44px] leading-none"
            textStyle={{ color: brand, fontFamily: MONTSERRAT }}
          />
          <div className="mx-auto mt-6 max-w-[700px] grid grid-cols-2">
            {stats.map((st, n) => (
              <El key={st.id} block={ctx.block} id={st.id} className={`py-3 my-3 text-center ${n % 2 === 0 ? "border-r border-[#1b1b1b]" : ""}`}>
                <ITxt ctx={ctx} item={st} k="value" as="span" className="text-[18px] @3xl:text-[20px] tracking-[0.08em]" style={{ color: brand }} />{" "}
                <ITxt ctx={ctx} item={st} k="label" as="span" className="text-[16px] @3xl:text-[18px] tracking-[0.08em] text-[#1b1b1b]" />
              </El>
            ))}
          </div>
          <Txt ctx={ctx} k="description" className="mx-auto mt-8 @3xl:mt-10 max-w-[990px] text-center whitespace-pre-line text-[13.5px] @3xl:text-[14.5px] leading-[2.2] tracking-[0.06em] text-[#333]" />
        </Wrap>
      </Shell>
    );
  }

  if (variant === "tarc-banner") {
    return (
      <Shell ctx={ctx} className="text-white">
        <Pic src={str(ctx.p.image)} tone="dark" className="absolute inset-0 w-full h-full" />
        <div aria-hidden className="absolute inset-0 bg-black/60" />
        <Wrap className="py-16 @3xl:py-20 text-center">
          <Logo ctx={ctx} className="h-24 @3xl:h-[112px]" textClass="tracking-[0.2em] text-[34px] text-white" textStyle={{ fontFamily: SERIF }} />
          <Txt ctx={ctx} k="title" as="h2" className="mt-10 @3xl:mt-14 text-white text-[22px] @3xl:text-[24px] tracking-[0.1em]" />
          <Txt ctx={ctx} k="subtitle" className="mt-8 @3xl:mt-12 text-white text-[17px] @3xl:text-[20px] tracking-[0.04em]" />
          <Txt ctx={ctx} k="description" className="mx-auto mt-8 @3xl:mt-12 max-w-[930px] whitespace-pre-line text-[12.5px] leading-[2.15] tracking-[0.14em] text-white/90" />
          <div className="mt-10 @3xl:mt-16 flex justify-center">
            <KnowMore ctx={ctx} light />
          </div>
        </Wrap>
        <Caption text={str(ctx.p.imageCaption)} />
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} className="bg-white py-16 @3xl:py-24">
      <Wrap>
        <BurgundyHeading ctx={ctx} center />
        <div className="mt-12 @3xl:mt-16 grid grid-cols-2 @md:grid-cols-3 @3xl:grid-cols-6 gap-[2px]">
          {stats.map((st) => (
            <El key={st.id} block={ctx.block} id={st.id} className="py-9 @3xl:py-10 px-2 text-center" style={{ backgroundColor: FAMILY.burgundy.cream }}>
              <ITxt ctx={ctx} item={st} k="value" className="text-[36px] @3xl:text-[40px] leading-none" style={{ fontFamily: SERIF, color: ctx.accent }} />
              <ITxt ctx={ctx} item={st} k="label" className="mt-3 text-[12px] @3xl:text-[12.5px] tracking-[0.1em] text-[#444]" />
            </El>
          ))}
        </div>
      </Wrap>
    </Shell>
  );
}
