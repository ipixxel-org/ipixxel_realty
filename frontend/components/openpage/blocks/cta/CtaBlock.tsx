"use client";

import type { BlockConfig } from "../types";
import { ArrowRight, Sparkles } from "lucide-react";
import { useOpenPageRuntime } from "@/components/openpage/runtime/OpenPageRuntime";

interface CtaProps {
  headline: string;
  subheadline?: string;
  buttonText: string;
  buttonUrl?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  popupId?: string;
  image?: string;
  bgImage?: string;
  bgColor?: string;
  badge?: string;
  secondaryButtonText?: string;
  secondaryButtonUrl?: string;
}

function useCtaClick(props: CtaProps) {
  const runtime = useOpenPageRuntime();
  return () => {
    if (props.popupId) {
      runtime.openPopup(props.popupId);
      return;
    }
    if (props.buttonUrl) {
      if (props.buttonUrl.startsWith("#")) {
        document.getElementById(props.buttonUrl.slice(1))?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      window.location.href = props.buttonUrl;
      return;
    }
    document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth" });
  };
}

function getBtnStyle(props: CtaProps) {
  return {
    backgroundColor: props.buttonColor || undefined,
    color: props.buttonTextColor || undefined,
  };
}

function CtaSimple({ props }: { props: CtaProps }) {
  const onClick = useCtaClick(props);
  const btnStyle = getBtnStyle(props);

  return (
    <section
      className="px-6 @md:px-10 py-16 @md:py-20 text-center relative overflow-hidden"
      style={{
        backgroundImage: props.bgImage ? `url(${props.bgImage})` : undefined,
        backgroundSize: props.bgImage ? "cover" : undefined,
        backgroundPosition: "center",
        backgroundColor: props.bgColor || undefined,
      }}
    >
      {props.bgImage ? (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] pointer-events-none" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-green/6 via-green/3 to-transparent pointer-events-none" />
      )}
      <div className="relative z-10">
        {props.badge && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green/15 text-green text-[11px] font-semibold tracking-wide uppercase mb-4">
            <Sparkles size={12} />
            {props.badge}
          </div>
        )}
        <h2 className={`font-display reveal-fade-up reveal-d1 text-3xl @md:text-4xl font-semibold tracking-tight mb-3 ${props.bgImage ? "text-white" : ""}`}>
          {props.headline}
        </h2>
        {props.subheadline && (
          <p className={`reveal-fade-up reveal-d2 text-sm mb-6 max-w-md mx-auto ${props.bgImage ? "text-white/85" : "text-text-2"}`}>
            {props.subheadline}
          </p>
        )}
        <div className="reveal-fade-up reveal-d3">
          <button
            type="button"
            onClick={onClick}
            style={btnStyle}
            className="px-8 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:opacity-90 transition-all inline-flex items-center gap-2 shadow-sm"
          >
            {props.buttonText}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function CtaBooking({ props }: { props: CtaProps }) {
  const onClick = useCtaClick(props);
  const btnStyle = getBtnStyle(props);
  const onSecondary = () => {
    const url = props.secondaryButtonUrl || "#listings";
    if (url.startsWith("#")) {
      document.getElementById(url.slice(1))?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    window.location.href = url;
  };
  return (
    <section className="px-4 @md:px-8 py-10 @md:py-14 bg-white">
      <div className="max-w-6xl mx-auto rounded-[28px] @md:rounded-[32px] overflow-hidden bg-slate-50 border border-border-default grid @lg:grid-cols-2 min-h-[320px] shadow-sm">
        <div className="relative min-h-[220px] @lg:min-h-full">
          {props.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-50/80 @lg:block hidden" />
        </div>
        <div className="flex flex-col justify-center px-8 @md:px-12 py-10 @md:py-14 text-text-0">
          <h2 className="font-display text-3xl @md:text-4xl font-medium mb-3 text-text-0">{props.headline}</h2>
          {props.subheadline ? <p className="text-text-1 text-sm @md:text-base mb-8 max-w-md">{props.subheadline}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onClick}
              style={btnStyle}
              className="px-6 py-3 rounded-full bg-green text-white text-sm font-semibold hover:opacity-90 transition-colors shadow-sm"
            >
              {props.buttonText}
            </button>
            {props.secondaryButtonText ? (
              <button
                type="button"
                onClick={onSecondary}
                className="px-6 py-3 rounded-full border border-border-default text-text-0 text-sm font-semibold hover:bg-white transition-colors"
              >
                {props.secondaryButtonText}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaSplit({ props }: { props: CtaProps }) {
  const onClick = useCtaClick(props);
  const btnStyle = getBtnStyle(props);

  return (
    <section
      className="px-6 @md:px-10 py-12 @md:py-16"
      style={{
        backgroundImage: props.bgImage ? `url(${props.bgImage})` : undefined,
        backgroundSize: props.bgImage ? "cover" : undefined,
        backgroundPosition: "center",
      }}
    >
      <div className="reveal-scale reveal-d1 flex flex-col @lg:flex-row items-center justify-between gap-6 p-8 rounded-2xl bg-bg-2 border border-border-default relative overflow-hidden shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-green/5 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <h2 className="font-display text-xl @md:text-2xl font-semibold tracking-tight mb-1">
            {props.headline}
          </h2>
          {props.subheadline && (
            <p className="text-text-2 text-sm">{props.subheadline}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClick}
          style={btnStyle}
          className="relative z-10 px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:opacity-90 transition-all shrink-0 flex items-center gap-2"
        >
          {props.buttonText}
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function CtaBanner({ props }: { props: CtaProps }) {
  const onClick = useCtaClick(props);
  const btnStyle = getBtnStyle(props);
  const onSecondary = () => {
    const url = props.secondaryButtonUrl || "#enquire";
    if (url.startsWith("#")) {
      document.getElementById(url.slice(1))?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    window.location.href = url;
  };

  return (
    <section
      className="relative min-h-[340px] @md:min-h-[420px] flex items-center overflow-hidden px-6 @md:px-12 py-16"
      style={{
        backgroundImage: props.bgImage ? `url(${props.bgImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: props.bgColor || "#0f172a",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/35 pointer-events-none" />
      <div className="relative z-10 max-w-2xl text-white">
        {props.badge && (
          <span className="inline-block px-3 py-1 rounded-full bg-white/15 border border-white/20 text-white text-xs font-semibold uppercase tracking-wider mb-4">
            {props.badge}
          </span>
        )}
        <h2 className="font-display text-3xl @md:text-5xl font-bold tracking-tight mb-4 leading-tight">
          {props.headline}
        </h2>
        {props.subheadline && (
          <p className="text-white/80 text-base @md:text-lg mb-8 leading-relaxed">
            {props.subheadline}
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={onClick}
            style={btnStyle}
            className="px-8 py-3.5 rounded-lg bg-green text-black text-sm font-semibold hover:opacity-90 transition-all inline-flex items-center gap-2"
          >
            {props.buttonText}
            <ArrowRight size={16} />
          </button>
          {props.secondaryButtonText && (
            <button
              type="button"
              onClick={onSecondary}
              className="px-7 py-3.5 rounded-lg border border-white/35 bg-white/10 backdrop-blur text-white text-sm font-medium hover:bg-white/20 transition-all"
            >
              {props.secondaryButtonText}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function CtaStrip({ props }: { props: CtaProps }) {
  const onClick = useCtaClick(props);
  const btnStyle = getBtnStyle(props);

  return (
    <section
      className="px-6 py-6 border-y border-border-default"
      style={{
        backgroundColor: props.bgColor || "var(--color-bg-2)",
        backgroundImage: props.bgImage ? `url(${props.bgImage})` : undefined,
        backgroundSize: "cover",
      }}
    >
      <div className="max-w-6xl mx-auto flex flex-col @md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base @md:text-lg text-text-0">{props.headline}</h3>
          {props.subheadline && <p className="text-text-2 text-xs @md:text-sm">{props.subheadline}</p>}
        </div>
        <button
          type="button"
          onClick={onClick}
          style={btnStyle}
          className="px-6 py-2.5 rounded-lg bg-green text-black text-xs @md:text-sm font-semibold hover:opacity-90 transition-all shrink-0 inline-flex items-center gap-1.5"
        >
          {props.buttonText}
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

function CtaCard({ props }: { props: CtaProps }) {
  const onClick = useCtaClick(props);
  const btnStyle = getBtnStyle(props);

  return (
    <section className="px-6 @md:px-10 py-16">
      <div
        className="max-w-4xl mx-auto rounded-3xl border border-border-default p-8 @md:p-12 text-center relative overflow-hidden shadow-lg"
        style={{
          backgroundColor: props.bgColor || "var(--color-bg-2)",
          backgroundImage: props.bgImage ? `url(${props.bgImage})` : undefined,
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-green/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10">
          <h2 className="font-display text-2xl @md:text-4xl font-bold tracking-tight mb-3">
            {props.headline}
          </h2>
          {props.subheadline && (
            <p className="text-text-2 text-sm @md:text-base mb-8 max-w-lg mx-auto">
              {props.subheadline}
            </p>
          )}
          <button
            type="button"
            onClick={onClick}
            style={btnStyle}
            className="px-8 py-3.5 rounded-full bg-green text-black text-sm font-semibold hover:opacity-90 transition-all shadow-md inline-flex items-center gap-2"
          >
            {props.buttonText}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function CtaBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as CtaProps;

  switch (block.variant) {
    case "split":
      return <CtaSplit props={props} />;
    case "booking":
      return <CtaBooking props={props} />;
    case "banner":
      return <CtaBanner props={props} />;
    case "strip":
      return <CtaStrip props={props} />;
    case "card":
      return <CtaCard props={props} />;
    default:
      return <CtaSimple props={props} />;
  }
}
