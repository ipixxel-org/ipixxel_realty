"use client";

import type { CSSProperties, ReactNode } from "react";
import type { BlockConfig } from "../types";
import { ArrowRight, Sparkles } from "lucide-react";
import { useOpenPageRuntime } from "@/components/openpage/runtime/OpenPageRuntime";
import { cssBackgroundImage } from "@/lib/openpage/block-style";
import { El } from "../El";
import { CtaButton } from "../CtaButton";

interface CtaProps {
  headline: string;
  subheadline?: string;
  buttonText: string;
  buttonUrl?: string;
  buttonTarget?: "_self" | "_blank";
  popupId?: string;
  image?: string;
  bgImage?: string;
  bgColor?: string;
  badge?: string;
  secondaryButtonText?: string;
  secondaryButtonUrl?: string;
  secondaryButtonTarget?: "_self" | "_blank";
}

/**
 * Everything a CTA variant renders, resolved once so every variant honours the
 * same fields: badge, both buttons, featured image, background image and
 * background colour. Each part is an {@link El}, so it can be styled alone.
 */
function useCtaParts(block: BlockConfig) {
  const runtime = useOpenPageRuntime();
  const props = block.props as unknown as CtaProps;

  // Primary: a popup wins, then the URL, then the page's enquiry form.
  const primary = (className: string, icon: ReactNode = <ArrowRight size={16} />) => (
    <CtaButton
      block={block}
      id="cta:primary"
      prefix="button"
      label={props.buttonText}
      href={props.popupId ? "" : props.buttonUrl || "#enquire"}
      target={props.buttonTarget}
      onClick={() => runtime.openPopup(props.popupId)}
      className={className}
      icon={icon}
    />
  );
  const secondary = (className: string) => (
    <CtaButton
      block={block}
      id="cta:secondary"
      prefix="secondaryButton"
      label={props.secondaryButtonText}
      href={props.secondaryButtonUrl || "#enquire"}
      target={props.secondaryButtonTarget}
      className={className}
      icon={null}
    />
  );
  const badge = (className: string, icon: ReactNode = null) =>
    props.badge ? (
      <El block={block} id="cta:badge" className={className}>
        {icon}
        {props.badge}
      </El>
    ) : null;
  const headline = (className: string, as: "h2" | "h3" = "h2") => (
    <El block={block} id="cta:title" as={as} className={className}>
      {props.headline}
    </El>
  );
  const subheadline = (className: string) =>
    props.subheadline ? (
      <El block={block} id="cta:subtitle" as="p" className={className}>
        {props.subheadline}
      </El>
    ) : null;
  const image = (className: string) =>
    props.image ? (
      <El block={block} id="cta:media" className={`overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.image} alt="" className="w-full h-full object-cover" />
      </El>
    ) : null;
  const background = (fallbackColor?: string): CSSProperties => ({
    backgroundColor: props.bgColor || fallbackColor,
    backgroundImage: props.bgImage ? cssBackgroundImage(props.bgImage) : undefined,
    backgroundSize: props.bgImage ? "cover" : undefined,
    backgroundPosition: props.bgImage ? "center" : undefined,
  });

  return { props, primary, secondary, badge, headline, subheadline, image, background, hasBgImage: Boolean(props.bgImage) };
}

function CtaSimple({ block }: { block: BlockConfig }) {
  const c = useCtaParts(block);
  const onImage = c.hasBgImage;

  return (
    <section className="px-6 @md:px-10 py-16 @md:py-20 text-center relative overflow-hidden" style={c.background()}>
      {onImage ? (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] pointer-events-none" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-green/6 via-green/3 to-transparent pointer-events-none" />
      )}
      <div className="relative z-10">
        {c.badge("inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green/15 text-green text-[11px] font-semibold tracking-wide uppercase mb-4", <Sparkles size={12} />)}
        {c.headline(`font-display reveal-fade-up reveal-d1 text-3xl @md:text-4xl font-semibold tracking-tight mb-3 ${onImage ? "text-white" : ""}`)}
        {c.subheadline(`reveal-fade-up reveal-d2 text-sm mb-6 max-w-md mx-auto ${onImage ? "text-white/85" : "text-text-2"}`)}
        {c.image("max-w-2xl mx-auto mb-8 rounded-2xl aspect-[16/9]")}
        <div className="reveal-fade-up reveal-d3 flex flex-wrap justify-center gap-3">
          {c.primary("px-8 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:opacity-90 shadow-sm")}
          {c.secondary(
            `px-7 py-3 rounded-lg border text-sm font-semibold ${
              onImage ? "border-white/40 bg-white/10 text-white hover:bg-white/20" : "border-border-default bg-bg-1 text-text-0 hover:bg-bg-2"
            }`,
          )}
        </div>
      </div>
    </section>
  );
}

function CtaBooking({ block }: { block: BlockConfig }) {
  const c = useCtaParts(block);
  return (
    <section className="px-4 @md:px-8 py-10 @md:py-14 bg-white" style={c.background()}>
      <div className="max-w-6xl mx-auto rounded-[28px] @md:rounded-[32px] overflow-hidden bg-slate-50 border border-border-default grid @lg:grid-cols-2 min-h-[320px] shadow-sm">
        <div className="relative min-h-[220px] @lg:min-h-full">
          {c.props.image ? (
            c.image("absolute inset-0")
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-50/80 @lg:block hidden pointer-events-none" />
        </div>
        <div className="flex flex-col justify-center px-8 @md:px-12 py-10 @md:py-14 text-text-0">
          {c.badge("self-start inline-flex px-3 py-1 rounded-full bg-green/10 text-green text-[11px] font-semibold uppercase tracking-wide mb-4")}
          {c.headline("font-display text-3xl @md:text-4xl font-medium mb-3 text-text-0")}
          {c.subheadline("text-text-1 text-sm @md:text-base mb-8 max-w-md")}
          <div className="flex flex-wrap gap-3">
            {c.primary("px-6 py-3 rounded-full bg-green text-white text-sm font-semibold hover:opacity-90 shadow-sm", null)}
            {c.secondary("px-6 py-3 rounded-full border border-border-default text-text-0 text-sm font-semibold hover:bg-white")}
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaSplit({ block }: { block: BlockConfig }) {
  const c = useCtaParts(block);
  return (
    <section className="px-6 @md:px-10 py-12 @md:py-16" style={c.background()}>
      <div className="reveal-scale reveal-d1 flex flex-col @lg:flex-row items-center justify-between gap-6 p-8 rounded-2xl bg-bg-2 border border-border-default relative overflow-hidden shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-green/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col @md:flex-row @md:items-center gap-6 min-w-0">
          {c.image("w-full @md:w-40 aspect-[4/3] rounded-xl shrink-0")}
          <div className="min-w-0">
            {c.badge("inline-flex px-3 py-1 rounded-full bg-green/10 text-green text-[11px] font-semibold uppercase tracking-wide mb-2")}
            {c.headline("font-display text-xl @md:text-2xl font-semibold tracking-tight mb-1")}
            {c.subheadline("text-text-2 text-sm")}
          </div>
        </div>
        <div className="relative z-10 flex flex-wrap gap-3 shrink-0">
          {c.primary("px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:opacity-90")}
          {c.secondary("px-6 py-3 rounded-lg border border-border-default bg-bg-1 text-text-0 text-sm font-semibold hover:bg-bg-3")}
        </div>
      </div>
    </section>
  );
}

function CtaBanner({ block }: { block: BlockConfig }) {
  const c = useCtaParts(block);
  return (
    <section
      className="relative min-h-[340px] @md:min-h-[420px] flex items-center overflow-hidden px-6 @md:px-12 py-16"
      style={c.background("#0f172a")}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/35 pointer-events-none" />
      <div className="relative z-10 w-full max-w-6xl mx-auto grid @lg:grid-cols-[1.2fr_0.8fr] gap-8 items-center">
        <div className="max-w-2xl text-white">
          {c.badge("inline-block px-3 py-1 rounded-full bg-white/15 border border-white/20 text-white text-xs font-semibold uppercase tracking-wider mb-4")}
          {c.headline("font-display text-3xl @md:text-5xl font-bold tracking-tight mb-4 leading-tight")}
          {c.subheadline("text-white/80 text-base @md:text-lg mb-8 leading-relaxed")}
          <div className="flex flex-wrap gap-4">
            {c.primary("px-8 py-3.5 rounded-lg bg-green text-black text-sm font-semibold hover:opacity-90")}
            {c.secondary("px-7 py-3.5 rounded-lg border border-white/35 bg-white/10 backdrop-blur text-white text-sm font-medium hover:bg-white/20")}
          </div>
        </div>
        {c.image("hidden @lg:block rounded-2xl aspect-[4/3] border border-white/15 shadow-2xl")}
      </div>
    </section>
  );
}

function CtaStrip({ block }: { block: BlockConfig }) {
  const c = useCtaParts(block);
  return (
    <section className="px-6 py-6 border-y border-border-default" style={c.background("var(--color-bg-2)")}>
      <div className="max-w-6xl mx-auto flex flex-col @md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {c.image("w-16 h-16 rounded-lg shrink-0")}
          <div className="min-w-0">
            {c.badge("inline-flex px-2 py-0.5 rounded-full bg-green/10 text-green text-[10px] font-semibold uppercase tracking-wide mb-1")}
            {c.headline("font-semibold text-base @md:text-lg text-text-0", "h3")}
            {c.subheadline("text-text-2 text-xs @md:text-sm")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {c.primary("px-6 py-2.5 rounded-lg bg-green text-black text-xs @md:text-sm font-semibold hover:opacity-90", <ArrowRight size={14} />)}
          {c.secondary("px-5 py-2.5 rounded-lg border border-border-default bg-bg-1 text-text-0 text-xs @md:text-sm font-semibold hover:bg-bg-3")}
        </div>
      </div>
    </section>
  );
}

function CtaCard({ block }: { block: BlockConfig }) {
  const c = useCtaParts(block);
  return (
    <section className="px-6 @md:px-10 py-16">
      <div
        className="max-w-4xl mx-auto rounded-3xl border border-border-default p-8 @md:p-12 text-center relative overflow-hidden shadow-lg"
        style={c.background("var(--color-bg-2)")}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-green/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10">
          {c.badge("inline-flex px-3 py-1 rounded-full bg-green/15 text-green text-[11px] font-semibold uppercase tracking-wide mb-4")}
          {c.headline("font-display text-2xl @md:text-4xl font-bold tracking-tight mb-3")}
          {c.subheadline("text-text-2 text-sm @md:text-base mb-8 max-w-lg mx-auto")}
          {c.image("max-w-xl mx-auto mb-8 rounded-2xl aspect-[16/9]")}
          <div className="flex flex-wrap justify-center gap-3">
            {c.primary("px-8 py-3.5 rounded-full bg-green text-black text-sm font-semibold hover:opacity-90 shadow-md")}
            {c.secondary("px-7 py-3.5 rounded-full border border-border-default bg-bg-1 text-text-0 text-sm font-semibold hover:bg-bg-3")}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CtaBlock({ block }: { block: BlockConfig }) {
  switch (block.variant) {
    case "split":
      return <CtaSplit block={block} />;
    case "booking":
      return <CtaBooking block={block} />;
    case "banner":
      return <CtaBanner block={block} />;
    case "strip":
      return <CtaStrip block={block} />;
    case "card":
      return <CtaCard block={block} />;
    default:
      return <CtaSimple block={block} />;
  }
}
