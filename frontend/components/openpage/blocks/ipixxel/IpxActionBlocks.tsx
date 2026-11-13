"use client";

import { Phone } from "lucide-react";
import type { BlockConfig } from "../types";
import { El } from "../El";
import { CtaButton } from "../CtaButton";
import { color, part, str } from "../elements/shared";
import { isMediaSrc } from "@/lib/media";
import { LeadForm, LinksLine } from "./parts";
import {
  BRONZE,
  BURGUNDY_GOLD,
  BurgundyHeading,
  Btn,
  Caption,
  FAMILY,
  ITxt,
  KnowMore,
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
  useIpxFonts,
} from "./shared";
import { EmeraldFooter, EmeraldForm } from "./IpxEmeraldBlocks";
import { ModernBanner, ModernFooter, ModernFormSplit } from "./IpxModernBlocks";

function wine(accent: string): string {
  return `radial-gradient(ellipse at 70% 40%, color-mix(in srgb, ${accent} 88%, #a3365f) 0%, color-mix(in srgb, ${accent} 75%, black) 100%)`;
}

/* ========================================================================= */
/* CTA / banner                                                              */
/* ========================================================================= */

export const CTA_VARIANTS = ["burgundy-cta", "tarc-club", "tarc-tour", "modern-banner"] as const;

export function IpxCtaBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, CTA_VARIANTS);
  const ctx = makeCtx(block, variant);

  if (variant === "modern-banner") return <ModernBanner block={block} />;

  if (variant === "tarc-club") {
    return (
      <Shell ctx={ctx} className="text-white min-h-[420px] @3xl:min-h-0 @3xl:aspect-[1280/530] flex items-end @3xl:block">
        <Pic src={str(ctx.p.image)} tone="dark" className="absolute inset-0 w-full h-full" />
        <div aria-hidden className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 w-full px-6 pb-14 @3xl:p-0 @3xl:absolute @3xl:right-[6%] @3xl:top-[20%] @3xl:w-auto flex flex-col items-end text-right">
          <Txt ctx={ctx} k="title" as="h2" className="max-w-[440px] text-white whitespace-pre-line uppercase tracking-[0.12em] leading-[1.45] text-[22px] @3xl:text-[27px]" />
          <div className="mt-8 @3xl:mt-10">
            <KnowMore ctx={ctx} light />
          </div>
        </div>
        <Caption text={str(ctx.p.imageCaption)} />
      </Shell>
    );
  }

  if (variant === "tarc-tour") {
    return (
      <Shell ctx={ctx} className="bg-white py-14 @3xl:py-20">
        <Wrap>
          <div className="mx-auto max-w-[460px]">
            <TarcHeading ctx={ctx} />
          </div>
          <div className="mt-10 grid grid-cols-1 @3xl:grid-cols-[1fr_2fr] gap-10 items-center">
            <div className="order-2 @3xl:order-1 flex flex-col items-center @3xl:items-start @3xl:pl-[18%] gap-8">
              {isMediaSrc(str(ctx.p.decorImage)) ? <Pic src={str(ctx.p.decorImage)} fit="contain" className="w-[100px] h-[76px]" /> : null}
              <KnowMore ctx={ctx} />
            </div>
            <El block={ctx.block} id={part(ctx.block, "device")} className="order-1 @3xl:order-2 relative w-full aspect-[730/490]">
              <Pic src={str(ctx.p.image)} fit="contain" className="absolute inset-0 w-full h-full" />
            </El>
          </div>
        </Wrap>
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24 text-center" style={{ backgroundColor: FAMILY.burgundy.cream }}>
      <Wrap className="flex flex-col items-center">
        <Txt ctx={ctx} k="eyebrow" className="uppercase font-semibold tracking-[0.32em] text-[11px]" style={{ color: BURGUNDY_GOLD }} />
        <h2 className="mt-5 leading-[1.08]" style={{ fontFamily: SERIF }}>
          <Txt ctx={ctx} k="title" as="span" className="block text-[38px] @3xl:text-[56px] text-[#1b1b1b]" />
          <Txt ctx={ctx} k="titleAccent" as="span" className="block italic text-[38px] @3xl:text-[56px]" style={{ color: BURGUNDY_GOLD }} />
        </h2>
        <Txt ctx={ctx} k="description" className="mt-7 max-w-[560px] whitespace-pre-line text-[15px] @3xl:text-[16px] leading-[1.85] text-[#1b1b1b]" />
        <div className="mt-10">
          <Btn ctx={ctx} className="inline-flex px-11 py-3.5 uppercase font-semibold tracking-[0.25em] text-[12px] @3xl:text-[13px] text-white bg-[var(--ipx-accent)] hover:brightness-110" />
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Enquiry form (the form itself comes from Form Builder)                    */
/* ========================================================================= */

export const FORM_VARIANTS = ["burgundy-split", "eldeco-bar", "tarc-quote", "emerald-form", "modern-split"] as const;

export function IpxFormBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, FORM_VARIANTS);
  const ctx = makeCtx(block, variant);

  if (variant === "emerald-form") return <EmeraldForm block={block} />;
  if (variant === "modern-split") return <ModernFormSplit block={block} />;

  if (variant === "eldeco-bar") {
    return (
      <Shell ctx={ctx} className="bg-[#fdf9ee] shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
        <div className="mx-auto max-w-[1280px] flex flex-col @3xl:flex-row items-center gap-6 @3xl:gap-10 px-5 @3xl:px-14 py-6">
          <Txt ctx={ctx} k="title" as="h2" className="shrink-0 @3xl:w-[180px] text-center whitespace-pre-line font-bold leading-[1.3] text-[22px]" style={{ color: ctx.accent }} />
          <El block={ctx.block} id={part(ctx.block, "form")} className="w-full min-w-0 flex-1">
            <LeadForm ctx={ctx} />
          </El>
        </div>
      </Shell>
    );
  }

  if (variant === "tarc-quote") {
    return (
      <Shell ctx={ctx} className="bg-white pt-14 @3xl:pt-20">
        <Wrap>
          <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_1.45fr] gap-10 items-end">
            <div className="@3xl:pl-12 max-w-[400px] pb-14 @3xl:pb-24">
              <Txt ctx={ctx} k="title" as="h2" className="font-normal tracking-[0.02em] text-[36px] @3xl:text-[44px] @3xl:pl-6" style={{ color: ctx.accent }} />
              <El block={ctx.block} id={part(ctx.block, "form")} className="mt-6">
                <LeadForm ctx={ctx} />
              </El>
            </div>
            {isMediaSrc(str(ctx.p.image)) ? (
              <Pic src={str(ctx.p.image)} fit="contain" className="hidden @3xl:block w-full h-[540px] object-bottom" />
            ) : null}
          </div>
        </Wrap>
      </Shell>
    );
  }

  const bullets = lines(ctx.p.bullets);
  return (
    <Shell ctx={ctx} className="py-16 @3xl:py-24" style={{ background: wine(ctx.accent) }}>
      <Wrap>
        <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_510px] gap-12 @3xl:gap-16 items-center">
          <div>
            <BurgundyHeading ctx={ctx} dark />
            {bullets.length ? (
              <El block={ctx.block} id={part(ctx.block, "bullets")} as="ul" className="mt-10 flex flex-col gap-5">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-baseline gap-3 text-white text-[14.5px] leading-snug">
                    <span aria-hidden className="text-[11px]" style={{ color: BURGUNDY_GOLD }}>✦</span>
                    <span>{b}</span>
                  </li>
                ))}
              </El>
            ) : null}
          </div>
          <El block={ctx.block} id={part(ctx.block, "formCard")} className="bg-white px-7 py-9 @3xl:px-12 @3xl:py-14">
            <Txt ctx={ctx} k="formTitle" as="h3" className="text-[24px]" style={{ fontFamily: SERIF, color: ctx.accent }} />
            <Txt ctx={ctx} k="formSubtitle" className="mt-1 text-[13px] tracking-[0.04em] text-[#555]" />
            <El block={ctx.block} id={part(ctx.block, "form")} className="mt-8">
              <LeadForm ctx={ctx} />
            </El>
            <Txt ctx={ctx} k="formNote" className="mt-6 text-center whitespace-pre-line text-[11.5px] leading-[1.6] text-[#8a8a8a]" />
          </El>
        </div>
      </Wrap>
    </Shell>
  );
}

/* ========================================================================= */
/* Footer                                                                    */
/* ========================================================================= */

export const FOOTER_VARIANTS = ["burgundy-footer", "eldeco-footer", "tarc-footer", "emerald-footer", "modern-columns"] as const;

export function IpxFooterBlock({ block }: { block: BlockConfig }) {
  useIpxFonts();
  const variant = pickVariant(block, FOOTER_VARIANTS);
  const ctx = makeCtx(block, variant);

  if (variant === "emerald-footer") return <EmeraldFooter block={block} />;
  if (variant === "modern-columns") return <ModernFooter block={block} />;

  if (variant === "eldeco-footer") {
    return (
      <Shell ctx={ctx} className="py-10 text-white" style={{ background: color(ctx.p.bandColor) ?? BRONZE }}>
        <Wrap>
          <Txt ctx={ctx} k="disclaimer" className="mx-auto max-w-[1140px] text-center whitespace-pre-line text-[12px] @3xl:text-[12.5px] leading-[1.8] tracking-[0.04em] text-white/90" />
          <LinksLine ctx={ctx} linkColor="rgba(255,255,255,0.7)" textColor="#ffffff" />
        </Wrap>
      </Shell>
    );
  }

  if (variant === "tarc-footer") {
    return (
      <Shell ctx={ctx} className="bg-white pb-12">
        <div aria-hidden className="mx-auto h-px w-[92%]" style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${ctx.accent} 45%, white), transparent)` }} />
        <Wrap className="pt-12">
          <Txt ctx={ctx} k="title" as="h2" className="text-center tracking-[0.02em] text-[18px] @3xl:text-[22px]" style={{ color: ctx.accent }} />
          <Txt ctx={ctx} k="disclaimer" className="mx-auto mt-8 max-w-[1110px] text-center whitespace-pre-line text-[11.5px] @3xl:text-[12px] leading-[2] tracking-[0.14em] text-[#1b1b1b]" />
          <LinksLine ctx={ctx} linkColor={ctx.accent} textColor="#1b1b1b" />
        </Wrap>
      </Shell>
    );
  }

  const qrs = items(ctx, "qrCodes");
  const phone = str(ctx.p.phone).replace(/[^\d+]/g, "");
  return (
    <Shell ctx={ctx} className="py-12 text-white" style={{ backgroundColor: `color-mix(in srgb, ${ctx.accent} 62%, black)` }}>
      <Wrap className="max-w-[960px]">
        {qrs.length ? (
          <div className="flex flex-wrap justify-center @3xl:justify-start gap-7">
            {qrs.map((q) => (
              <El key={q.id} block={ctx.block} id={q.id} className="w-[134px] px-4 py-5 text-center border border-white/10 bg-white/[0.03]">
                <ITxt ctx={ctx} item={q} k="title" className="text-[13px] text-white/80" />
                <div className="mx-auto mt-2 w-[100px] h-[100px] bg-white p-1.5">
                  <Pic src={q.get("image")} fit="contain" className="w-full h-full" />
                </div>
                <ITxt ctx={ctx} item={q} k="text" className="mt-3 whitespace-pre-line text-[13px] leading-[1.75] text-white/80" />
              </El>
            ))}
          </div>
        ) : null}
        <div className="mt-10 text-center">
          <Txt ctx={ctx} k="title" as="h2" className="text-[18px]" style={{ fontFamily: SERIF, color: BURGUNDY_GOLD }} />
          <Txt ctx={ctx} k="address" className="mt-3 text-[13px] text-white/85" />
          {str(ctx.p.website) ? (
            <Txt
              ctx={ctx}
              k="website"
              as="p"
              className="mt-1 text-[13px] text-white/85"
            />
          ) : null}
          <Txt ctx={ctx} k="disclaimer" className="mt-4 whitespace-pre-line text-[11px] leading-[1.6] text-white/40" />
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-5 @3xl:gap-7">
          {str(ctx.p.callText) ? (
            <CtaButton
              block={ctx.block}
              id={part(ctx.block, "callText")}
              prefix="callButton"
              label={str(ctx.p.callText)}
              href={phone ? `tel:${phone}` : ""}
              brand={null}
              icon={<Phone size={16} strokeWidth={1.8} />}
              className="inline-flex flex-row-reverse items-center gap-3 px-11 py-3 uppercase font-bold tracking-[0.2em] text-[13px] @3xl:text-[14px] text-white bg-[var(--ipx-accent)] hover:brightness-110"
            />
          ) : null}
          <Btn ctx={ctx} className="inline-flex px-11 py-3 uppercase tracking-[0.2em] text-[13px] @3xl:text-[14px] text-white/80 border border-white/15 hover:bg-white/5" />
        </div>
      </Wrap>
    </Shell>
  );
}

