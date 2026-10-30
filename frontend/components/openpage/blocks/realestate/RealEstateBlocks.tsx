"use client";

import type { BlockConfig, ElementId } from "../types";
import { El } from "../El";
import { CtaButton } from "../CtaButton";
import { listElementId, subElementId } from "@/lib/openpage/element-style";
import { ArrowRight, Check, Download, Lock, MapPin, Play } from "lucide-react";
import { useOpenPageRuntime } from "@/components/openpage/runtime/OpenPageRuntime";
import { DynamicLeadForm } from "@/components/openpage/dynamic-lead-form";
import { findFormById, loadFormLibrary } from "@/lib/openpage/forms-store";
import { mergeFormLibraries } from "@/lib/openpage/resolve-form";
import { isMediaSrc } from "@/lib/media";
import { Bullet, isBulletStyle } from "../Bullet";
import { ImageSlideshow, slideIntervalMs, type Slide } from "../ImageSlideshow";
import { useDevice } from "@/components/openpage/runtime/device";
import { resolveBlockStyleForDevice } from "@/lib/openpage/block-style";

function resolveRuntimeForms(runtimeForms: ReturnType<typeof useOpenPageRuntime>["forms"]) {
  const library = typeof window !== "undefined" ? loadFormLibrary() : [];
  return mergeFormLibraries(runtimeForms, library);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function items<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * True when a CSS colour (#rgb, #rrggbb, #rrggbbaa, rgb[a]()) is dark enough
 * that text on it must be light. Unknown values (gradients, named colours,
 * variables) return false so the theme's own text colours are kept.
 */
function isDarkColor(color: string | undefined): boolean {
  const value = (color ?? "").trim().toLowerCase();
  let r: number;
  let g: number;
  let b: number;
  let a = 1;
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex && (hex.length === 3 || hex.length === 6 || hex.length === 8)) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    r = parseInt(full.slice(0, 2), 16);
    g = parseInt(full.slice(2, 4), 16);
    b = parseInt(full.slice(4, 6), 16);
    if (full.length === 8) a = parseInt(full.slice(6, 8), 16) / 255;
  } else {
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value);
    if (!rgb) return false;
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (rgb[4]) a = rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : Number(rgb[4]);
  }
  // A mostly transparent colour shows whatever is behind it — don't guess.
  if (a < 0.5) return false;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance < 0.4;
}

/** First non-empty string among `values`. */
function firstText(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function scrollToAnchor(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SectionShell({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const cleanClass = className
    .replace(/\bbg-bg-[0-5]\b/g, "bg-white")
    .replace(/\bbg-black\b/g, "bg-white");
  return <section id={id} className={`px-6 @md:px-10 py-16 @md:py-20 bg-white text-text-0 ${cleanClass}`}>{children}</section>;
}

/**
 * Shared element ids for a section's fixed (non-list) parts. They must stay in
 * sync with the ids the inspector writes to `elementStyles`, which is what makes
 * per-element styling, visibility and typography actually take effect.
 */
function part(block: BlockConfig, key: string): ElementId {
  return `${block.type}:${key}`;
}

/**
 * Element id for one item of a named list, e.g. `items:it_abc`, or one of its
 * named children, e.g. `items:it_abc/title`. Mirrors `listElementId` /
 * `subElementId` in `element-style.ts`, which is what the list editor writes to.
 */
function itemPart(listKey: string, item: unknown, subKey?: string): ElementId {
  const itemId = (item as { _id?: unknown } | null | undefined)?._id;
  const base = listElementId({ path: [listKey] }, typeof itemId === "string" ? itemId : "");
  return subKey ? subElementId(base, subKey) : base;
}

/**
 * Section heading. Wrapped in {@link El} so the heading and its subheading are
 * individually selectable and styleable rather than inheriting section styles.
 */
function Title({
  block,
  title,
  subtitle,
  description,
  align = "center",
  onDark = false,
}: {
  block?: BlockConfig;
  title?: string;
  subtitle?: string;
  /** Optional paragraph shown directly under the title (before the subtitle). */
  description?: string;
  align?: "center" | "left";
  /** Section background is dark — use light text so the heading stays readable. */
  onDark?: boolean;
}) {
  const content = (
    <>
      {title ? (
        <El
          block={block!}
          id={part(block!, "title")}
          as="h2"
          className={`font-display text-3xl @md:text-4xl font-semibold tracking-tight mb-2${onDark ? " text-white" : ""}`}
        >
          {title}
        </El>
      ) : null}
      {description && block ? (
        <El
          block={block}
          id={part(block, "description")}
          as="p"
          className={`${onDark ? "text-white/80" : "text-text-1"} text-[15px] leading-relaxed mb-2 whitespace-pre-line`}
        >
          {description}
        </El>
      ) : null}
      {subtitle ? (
        <El
          block={block!}
          id={part(block!, "subtitle")}
          as="p"
          className={`${onDark ? "text-white/75" : "text-text-2"} text-sm leading-relaxed`}
        >
          {subtitle}
        </El>
      ) : null}
    </>
  );

  if (!block) {
    return <div className="mb-8 text-center max-w-2xl mx-auto">{content}</div>;
  }

  return (
    <El
      block={block}
      id={part(block, "headingRow")}
      className={`mb-8 max-w-2xl mx-auto ${align === "center" ? "text-center" : "text-left"}`}
    >
      {content}
    </El>
  );
}

/** A stat from a `stats`-style list, keyed so it can be styled per item. */
interface StatItem {
  id: ElementId;
  value: string;
  label: string;
}

/**
 * Normalise a stats/highlights list into value+label pairs that keep each
 * item's element id. Items without an `_id` fall back to `idx_<n>`, the same id
 * the list editor uses, so "Style this item" always targets the right card.
 */
function statItems(list: unknown, listKey: string): StatItem[] {
  return items<Record<string, unknown>>(list)
    .map((s, i) => ({
      id: itemPart(listKey, { _id: typeof s?._id === "string" && s._id ? s._id : `idx_${i}` }),
      value: str(s?.value ?? s?.stat ?? s?.title ?? ""),
      label: str(s?.label ?? s?.description ?? s?.subtitle ?? ""),
    }))
    .filter((s) => s.value || s.label);
}

/** One stat card: the card, its value and its label are each selectable. */
function Stat({
  block,
  stat,
  className,
  valueClass,
  labelClass,
  labelFirst = false,
}: {
  block: BlockConfig;
  stat: StatItem;
  className?: string;
  valueClass: string;
  labelClass: string;
  labelFirst?: boolean;
}) {
  const value = (
    <El block={block} id={subElementId(stat.id, "value")} className={valueClass}>
      {stat.value || "—"}
    </El>
  );
  const label = (
    <El block={block} id={subElementId(stat.id, "label")} className={labelClass}>
      {stat.label}
    </El>
  );
  return (
    <El block={block} id={stat.id} className={className}>
      {labelFirst ? label : value}
      {labelFirst ? value : label}
    </El>
  );
}

/**
 * The banner's primary or secondary button. A URL makes it a link; otherwise
 * the primary scrolls to the enquiry form and the secondary opens the brochure
 * popup. Colours, hover, radius, URL and target all come from the Content tab.
 */
function BannerCta({
  block,
  which,
  onPrimary,
  onSecondary,
  className,
  icon = null,
}: {
  block: BlockConfig;
  which: "primary" | "secondary";
  onPrimary: () => void;
  onSecondary: () => void;
  className: string;
  icon?: React.ReactNode;
}) {
  const p = block.props;
  const primary = which === "primary";
  const prefix = primary ? "primaryCta" : "secondaryCta";
  // A brochure popup takes precedence over the secondary URL, as before.
  const href = primary ? str(p.primaryCtaUrl) : str(p.popupId) ? "" : str(p.secondaryCtaUrl);
  return (
    <CtaButton
      block={block}
      id={part(block, prefix)}
      prefix={prefix}
      label={str(p[prefix])}
      href={href}
      target={str(p[`${prefix}Target`])}
      onClick={primary ? onPrimary : onSecondary}
      className={className}
      icon={icon}
    />
  );
}

function HeroCopy({
  block,
  p,
  onPrimary,
  onSecondary,
  light,
  centered,
  stats,
}: {
  block: BlockConfig;
  p: Record<string, unknown>;
  onPrimary: () => void;
  onSecondary: () => void;
  light?: boolean;
  centered?: boolean;
  stats?: StatItem[];
}) {
  const text = light ? "text-white" : "text-text-0";
  const muted = light ? "text-white/80" : "text-text-1";
  return (
    <div className={`${light ? "text-white" : ""} ${centered ? "text-center flex flex-col items-center" : ""}`}>
      {str(p.badge) ? (
        <El
          block={block}
          id={part(block, "badge")}
          style={{
            color: (p.badgeColor as string) || (p.tagColor as string) || undefined,
            backgroundColor: (p.badgeBg as string) || (p.tagBg as string) || undefined,
            borderColor: (p.badgeColor as string) || (p.tagColor as string) || undefined,
          }}
          className="inline-flex px-3 py-1 rounded-full bg-green/20 text-green text-[11px] font-semibold tracking-wide uppercase mb-4"
        >
          {str(p.badge)}
        </El>
      ) : null}
      <El
        block={block}
        id={part(block, "title")}
        as="h1"
        className={`font-display text-4xl @md:text-6xl font-semibold tracking-tight mb-4 leading-[1.1] ${text}`}
      >
        {str(p.headline, "Project name")}
      </El>
      {str(p.location) ? (
        <El block={block} id={part(block, "location")} as="p" className={`flex items-center gap-2 text-sm mb-3 ${muted} ${centered ? "justify-center" : ""}`}>
          <MapPin size={14} /> {str(p.location)}
        </El>
      ) : null}
      {str(p.description) ? (
        <El block={block} id={part(block, "subtitle")} as="p" className={`text-base @md:text-lg leading-relaxed max-w-xl mb-4 ${muted}`}>
          {str(p.description)}
        </El>
      ) : null}
      {str(p.price) ? (
        <El block={block} id={part(block, "price")} as="p" className="text-xl font-semibold mb-7 text-green">
          {str(p.price)}
        </El>
      ) : null}
      <div className={`flex flex-wrap gap-3 ${centered ? "justify-center" : ""}`}>
        <BannerCta
          block={block}
          which="primary"
          onPrimary={onPrimary}
          onSecondary={onSecondary}
          className="px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim hover:accent-glow-md"
        />
        <BannerCta
          block={block}
          which="secondary"
          onPrimary={onPrimary}
          onSecondary={onSecondary}
          className={`px-6 py-3 rounded-lg border text-sm font-medium ${
            light ? "border-white/40 bg-white/10 text-white hover:bg-white/20" : "border-border-default bg-bg-1 hover:bg-bg-2"
          }`}
        />
      </div>

      {stats && stats.length > 0 ? (
        <div className={`flex flex-wrap gap-6 mt-6 pt-5 border-t ${light ? "border-white/20" : "border-border-default"} ${centered ? "justify-center" : ""}`}>
          {stats.map((s) => (
            <Stat
              key={s.id}
              block={block}
              stat={s}
              className={light ? "text-white" : "text-text-0"}
              valueClass="font-display text-2xl font-bold text-green"
              labelClass={`text-[11px] uppercase tracking-wider font-medium ${muted}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectBannerBlock({ block }: { block: BlockConfig }) {
  const runtime = useOpenPageRuntime();
  const p = block.props;
  const formId = str(p.formId);
  const forms = resolveRuntimeForms(runtime.forms);
  const form = formId ? findFormById(formId, forms) : forms[0];

  const stats = statItems(p.stats, "stats");

  const onPrimary = () => scrollToAnchor(str(p.primaryAnchor, "enquire"));
  const onSecondary = () => runtime.openPopup(str(p.popupId) || undefined, { brochureUrl: str(p.pdfUrl) });
  const cta = (which: "primary" | "secondary", className: string, icon: React.ReactNode = null) => (
    <BannerCta block={block} which={which} onPrimary={onPrimary} onSecondary={onSecondary} className={className} icon={icon} />
  );
  const headline = (fallback: string, className: string) => (
    <El block={block} id={part(block, "title")} as="h1" className={className}>
      {str(p.headline, fallback)}
    </El>
  );
  const description = (className: string) =>
    str(p.description) ? (
      <El block={block} id={part(block, "subtitle")} as="p" className={className}>
        {str(p.description)}
      </El>
    ) : null;

  if (block.variant === "split-form") {
    return (
      <section className="relative min-h-[640px] @lg:min-h-[720px] overflow-hidden">
        {str(p.image) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/50 to-black/25" />
        <div className="relative z-10 grid @lg:grid-cols-[1.15fr_0.85fr] gap-8 items-center px-6 @md:px-12 py-16 @md:py-24 max-w-6xl mx-auto">
          <HeroCopy block={block} p={p} onPrimary={onPrimary} onSecondary={onSecondary} light stats={stats} />
          <div
            id="hero-enquire"
            data-op-panel=""
            className="rounded-2xl bg-bg-1/95 backdrop-blur-md border border-border-default p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
          >
            <El block={block} id={part(block, "formTitle")} as="h3" className="text-lg font-semibold mb-1">
              {str(p.formTitle, "Enquire now")}
            </El>
            <El block={block} id={part(block, "formSubtitle")} as="p" className="text-text-2 text-sm mb-4">
              {str(p.formSubtitle, "A relationship manager will call you shortly.")}
            </El>
            {form ? (
              <DynamicLeadForm
                form={form}
                live={runtime.live}
                pageId={runtime.pageId}
                place="hero-form"
                projectName={runtime.projectName}
                projectId={runtime.projectId}
                unitId={runtime.unitId}
              />
            ) : (
              <p className="text-sm text-text-3">Select a form in Properties.</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (block.variant === "centered") {
    return (
      <section className="relative min-h-[520px] @md:min-h-[620px] flex items-center justify-center overflow-hidden text-center">
        {str(p.image) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bg-3 via-bg-2 to-green/10" />
        )}
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative z-10 px-6 @md:px-12 py-24 max-w-3xl mx-auto flex flex-col items-center">
          <HeroCopy block={block} p={p} onPrimary={onPrimary} onSecondary={onSecondary} light centered stats={stats} />
        </div>
      </section>
    );
  }

  if (block.variant === "stats") {
    return (
      <section className="relative min-h-[600px] flex flex-col justify-end overflow-hidden">
        {str(p.image) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-green/20 to-bg-2" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20" />
        <div className="relative z-10 px-6 @md:px-12 pt-24 pb-10 max-w-5xl">
          <HeroCopy block={block} p={p} onPrimary={onPrimary} onSecondary={onSecondary} light />
        </div>
        {stats.length ? (
          <div className="relative z-10 border-t border-white/15 bg-black/35 backdrop-blur-md">
            <div className="grid grid-cols-2 @md:grid-cols-4 gap-4 px-6 @md:px-12 py-5 max-w-5xl">
              {stats.map((s) => (
                <Stat
                  key={s.id}
                  block={block}
                  stat={s}
                  className="text-white"
                  valueClass="font-display text-xl @md:text-2xl font-semibold"
                  labelClass="text-[11px] uppercase tracking-wider text-white/65 mt-1"
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  /* PDF 8 — Aurelia editorial: left copy + pill CTAs + floating label/value bar */
  if (block.variant === "editorial") {
    const onImage = Boolean(str(p.image));
    return (
      <section className="relative min-h-[88vh] flex flex-col overflow-hidden bg-white">
        {onImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100" />
        )}
        {onImage && <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/15" />}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-6 @md:px-12 @lg:px-16 pt-28 pb-36 max-w-3xl">
          {str(p.badge) ? (
            <El block={block} id={part(block, "badge")} as="p" className={`text-[11px] uppercase tracking-[0.28em] font-medium mb-5 ${onImage ? "text-white/80" : "text-green"}`}>
              {str(p.badge)}
            </El>
          ) : null}
          {headline(
            "Architecture Crafted For Generations.",
            `font-display text-4xl @md:text-6xl @lg:text-[4.25rem] font-medium leading-[1.08] tracking-tight mb-5 ${onImage ? "text-white" : "text-text-0"}`,
          )}
          {description(`text-base @md:text-lg leading-relaxed max-w-xl mb-8 ${onImage ? "text-white/80" : "text-text-1"}`)}
          <div className="flex flex-wrap gap-3">
            {cta("primary", "px-7 py-3 rounded-full bg-green text-white text-[12px] font-semibold uppercase tracking-[0.12em] hover:bg-green-dim shadow-sm")}
            {cta(
              "secondary",
              `px-7 py-3 rounded-full border text-[12px] font-semibold uppercase tracking-[0.12em] ${
                onImage ? "border-white/55 text-white hover:bg-white/10" : "border-border-default text-text-0 hover:bg-slate-50"
              }`,
            )}
          </div>
        </div>
        {stats.length ? (
          <div className="absolute bottom-6 left-6 right-6 @md:left-12 @md:right-12 @lg:left-16 @lg:right-16 z-20">
            <div className="rounded-2xl bg-white/95 backdrop-blur-md border border-border-default shadow-lg grid grid-cols-2 @md:grid-cols-4 divide-x divide-border-subtle overflow-hidden">
              {stats.map((s) => (
                <Stat
                  key={s.id}
                  block={block}
                  stat={s}
                  labelFirst
                  className="px-5 @md:px-7 py-5 text-text-0"
                  labelClass="text-[10px] uppercase tracking-[0.22em] text-text-2 mb-2 font-medium"
                  valueClass="font-display text-xl @md:text-2xl font-semibold text-text-0"
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  /* PDF 3 — Framed rounded hero with glass 2×2 stats */
  if (block.variant === "framed") {
    return (
      <section className="bg-white px-3 @md:px-5 pt-3 @md:pt-4 pb-10">
        <div className="relative min-h-[560px] @md:min-h-[640px] rounded-[28px] @md:rounded-[36px] overflow-hidden">
          {str(p.image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
          <div className="relative z-10 flex flex-col justify-end h-full min-h-[560px] @md:min-h-[640px] px-6 @md:px-12 py-12 @md:py-16 max-w-3xl">
            {headline("Luxury residences", "font-display text-3xl @md:text-5xl @lg:text-[3.4rem] font-medium text-white leading-[1.12] mb-6")}
            {stats.length ? (
              <div className="mb-7 grid grid-cols-2 gap-px rounded-2xl overflow-hidden bg-white/15 backdrop-blur-md border border-white/25 max-w-md">
                {stats.slice(0, 4).map((s) => (
                  <Stat
                    key={s.id}
                    block={block}
                    stat={s}
                    className="bg-white/10 px-4 py-3.5"
                    valueClass="font-display text-xl @md:text-2xl font-semibold text-white leading-none mb-1"
                    labelClass="text-[11px] text-white/75 leading-snug"
                  />
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {cta("primary", "self-start px-6 py-3 rounded-full bg-green text-white text-sm font-semibold hover:bg-green-dim", <ArrowRight size={14} />)}
              {cta("secondary", "self-start px-6 py-3 rounded-full border border-white/55 text-white text-sm font-semibold hover:bg-white/10")}
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* PDF 5 — Asymmetric: headline + floating stats card over photo */
  if (block.variant === "asymmetric") {
    return (
      <section className="bg-white px-6 @md:px-10 @lg:px-14 pt-10 @md:pt-14 pb-16">
        <div className="max-w-6xl mx-auto grid @lg:grid-cols-[1.15fr_0.85fr] gap-8 @lg:gap-10 items-start">
          <div className="relative order-2 @lg:order-1">
            <div className="relative rounded-[28px] overflow-hidden aspect-[4/3] @lg:aspect-[5/4] bg-bg-2">
              {str(p.image) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2" />
              )}
            </div>
            {str(p.rera) || str(p.badge) ? (
              <El
                block={block}
                id={part(block, "badge")}
                className="absolute bottom-4 right-4 @md:bottom-6 @md:right-6 rounded-full bg-white/90 backdrop-blur px-4 py-2 text-[10px] @md:text-[11px] font-semibold tracking-wide text-text-0 shadow-sm max-w-[min(100%,280px)] truncate"
              >
                {str(p.rera) || str(p.badge)}
              </El>
            ) : null}
          </div>
          <div className="order-1 @lg:order-2 @lg:pt-4">
            {headline("Your Future Home Starts Here", "font-display text-4xl @md:text-5xl @lg:text-[3.5rem] font-medium text-text-0 leading-[1.1] tracking-tight mb-4")}
            {description("text-text-1 text-sm @md:text-base leading-relaxed mb-8 max-w-md")}
            {stats.length ? (
              <div className="rounded-2xl border border-border-default bg-bg-1/90 backdrop-blur shadow-[0_12px_40px_rgba(0,0,0,0.06)] grid grid-cols-2 divide-x divide-y divide-border-subtle overflow-hidden max-w-sm">
                {stats.slice(0, 4).map((s) => (
                  <Stat
                    key={s.id}
                    block={block}
                    stat={s}
                    className="px-5 py-5 text-center"
                    valueClass="font-display text-2xl @md:text-3xl font-semibold text-text-0 leading-none mb-1.5"
                    labelClass="text-[11px] uppercase tracking-wider text-text-2"
                  />
                ))}
              </div>
            ) : null}
            {(str(p.primaryCta) || str(p.secondaryCta)) && (
              <div className="flex flex-wrap gap-3 mt-7">
                {cta("primary", "px-5 py-2.5 rounded-lg bg-green text-white text-sm font-semibold hover:bg-green-dim")}
                {cta("secondary", "px-5 py-2.5 rounded-lg border border-border-default text-sm font-medium hover:bg-bg-2")}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* PDF 6 — Centered over image + overlapping info bar */
  if (block.variant === "info-bar") {
    return (
      <section className="relative pb-24 @md:pb-28 bg-white">
        <div className="relative min-h-[520px] @md:min-h-[600px] overflow-hidden">
          {str(p.image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/35 to-white/70" />
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-24 @md:py-32 max-w-3xl mx-auto">
            {headline("Discover Modern Living", "font-display text-3xl @md:text-5xl @lg:text-[3.25rem] font-medium text-text-0 leading-[1.15] tracking-tight mb-4")}
            {description("text-text-1 text-sm @md:text-base leading-relaxed max-w-xl")}
            {str(p.primaryCta) || str(p.secondaryCta) ? (
              <div className="flex flex-wrap justify-center gap-3 mt-7">
                {cta("primary", "px-6 py-3 rounded-full bg-green text-white text-sm font-semibold hover:bg-green-dim")}
                {cta("secondary", "px-6 py-3 rounded-full border border-border-default bg-white/70 text-text-0 text-sm font-semibold hover:bg-white")}
              </div>
            ) : null}
          </div>
        </div>
        {stats.length ? (
          <div className="absolute left-4 right-4 @md:left-10 @md:right-10 @lg:left-16 @lg:right-16 bottom-6 z-20">
            <div className="rounded-2xl @md:rounded-3xl bg-bg-1 border border-border-default shadow-[0_20px_60px_rgba(0,0,0,0.1)] grid grid-cols-2 @md:grid-cols-4 divide-x divide-border-subtle overflow-hidden">
              {stats.slice(0, 4).map((s) => (
                <Stat
                  key={s.id}
                  block={block}
                  stat={s}
                  labelFirst
                  className="px-4 @md:px-6 py-5 @md:py-6 text-center @md:text-left"
                  labelClass="text-[10px] uppercase tracking-[0.18em] text-green font-semibold mb-2"
                  valueClass="font-semibold text-sm @md:text-base text-text-0 leading-snug"
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  /* PDF 1 — Centered copy inside large rounded framed hero */
  if (block.variant === "framed-center") {
    return (
      <section className="bg-white px-4 @md:px-8 pt-3 @md:pt-5 pb-10">
        <div className="relative min-h-[520px] @md:min-h-[620px] rounded-[28px] @md:rounded-[36px] overflow-hidden flex items-center justify-center text-center">
          {str(p.image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2" />
          )}
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative z-10 px-6 @md:px-12 py-20 max-w-3xl mx-auto flex flex-col items-center">
            {headline("Find your perfect investment properties", "font-display text-4xl @md:text-5xl @lg:text-[3.5rem] font-medium text-white leading-[1.12] mb-4")}
            {description("text-white/85 text-sm @md:text-base leading-relaxed mb-8 max-w-xl")}
            <div className="flex flex-wrap justify-center gap-3">
              {cta(
                "primary",
                "px-6 py-3 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white text-sm font-semibold hover:bg-black/70",
                <ArrowRight size={14} className="-rotate-45" />,
              )}
              {cta("secondary", "px-6 py-3 rounded-full border border-white/55 text-white text-sm font-semibold hover:bg-white/10")}
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* PDF 2 — Split curve: photo left with large bottom-right radius, cream stats panel */
  if (block.variant === "split-curve") {
    return (
      <section className="bg-white grid @lg:grid-cols-2 min-h-[560px] @lg:min-h-[640px]">
        <div className="relative min-h-[360px] @lg:min-h-full overflow-hidden rounded-br-[120px] @lg:rounded-br-[180px]">
          {str(p.image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2" />
          )}
        </div>
        <div className="flex flex-col justify-center px-8 @md:px-12 @lg:px-14 py-12 @lg:py-16 bg-white">
          {headline("4 BHK Luxury Flat", "font-display text-3xl @md:text-4xl @lg:text-[2.75rem] font-medium text-text-0 leading-[1.15] mb-8")}
          {stats.length ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 mb-8 max-w-md">
              {stats.slice(0, 4).map((s, i) => (
                <Stat
                  key={s.id}
                  block={block}
                  stat={s}
                  className={`pr-4 ${i % 2 === 0 ? "border-r border-border-default" : ""}`}
                  valueClass="font-display text-2xl @md:text-3xl font-semibold text-text-0 leading-none mb-2"
                  labelClass="text-[12px] text-green leading-snug"
                />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {cta(
              "primary",
              "self-start px-6 py-3 rounded-full bg-green text-white text-sm font-semibold hover:bg-green-dim",
              <ArrowRight size={14} className="-rotate-45" />,
            )}
            {cta("secondary", "self-start px-6 py-3 rounded-full border border-border-default text-text-0 text-sm font-semibold hover:bg-bg-2")}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-[560px] @md:min-h-[680px] flex items-center overflow-hidden">
      {str(p.image) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-green/20 to-bg-2" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-black/20" />
      <div className="relative z-10 px-6 @md:px-12 py-24 max-w-3xl">
        <HeroCopy block={block} p={p} onPrimary={onPrimary} onSecondary={onSecondary} light stats={stats} />
      </div>
    </section>
  );
}

/**
 * Scalar props the user created with "Add Field". They are not part of any
 * renderer, so without this they are editable but silently invisible on the
 * page — render them as a labelled definition list instead.
 */
function customScalarProps(p: Record<string, unknown>, known: string[]): Array<{ label: string; value: string }> {
  const skip = new Set([...known, "variant", "anchor", "_id", "hidden"]);
  const out: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(p)) {
    if (skip.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());
    out.push({ label, value: trimmed });
  }
  return out;
}

const OVERVIEW_KNOWN_PROPS = [
  "title",
  "subtitle",
  "body",
  "image",
  "highlights",
  "stats",
  "ctaText",
  "ctaAnchor",
  "imagePosition",
  "slides",
  "slideInterval",
  "formTitle",
  "formSubtitle",
  "formId",
  "popupId",
  "pdfUrl",
  "ctaUrl",
  "ctaTarget",
  "ctaColor",
  "ctaTextColor",
  "ctaHoverColor",
  "ctaHoverTextColor",
  "ctaBorderColor",
  "ctaRadius",
];

function CustomPropList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (!rows.length) return null;
  return (
    <div className="mt-8 grid gap-3 max-w-3xl mx-auto">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col @sm:flex-row gap-1 @sm:gap-4 rounded-xl border border-border-default bg-bg-2 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-text-3 @sm:w-44 shrink-0">{r.label}</div>
          <div className="text-sm text-text-1 whitespace-pre-line">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ProjectOverviewBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  // A highlight may be plain text (AI-generated / older pages) or
  // { title, description }; empty ones are skipped instead of showing a bare icon.
  const highlights = items<unknown>(p.highlights)
    .map((raw, i) => {
      const h = typeof raw === "string" ? { title: raw } : ((raw ?? {}) as Record<string, unknown>);
      return {
        id: itemPart("highlights", { _id: typeof h._id === "string" && h._id ? h._id : `idx_${i}` }),
        title: str(h.title).trim(),
        description: str(h.description).trim(),
        icon: str(h.icon).trim(),
      };
    })
    .filter((h) => h.title || h.description);
  const overviewStats = statItems(p.stats, "stats");
  const customRows = customScalarProps(p, OVERVIEW_KNOWN_PROPS);
  const variant = block.variant || (str(p.image) ? "split" : "centered");
  // Centered template slideshow: the main image followed by the "Slider
  // images". With two or more it rotates automatically; otherwise the single
  // image shows as before.
  const overviewSlides: Slide[] = [];
  if (str(p.image).trim()) overviewSlides.push({ src: str(p.image).trim(), alt: str(p.title) });
  for (const s of items<Record<string, unknown>>(p.slides)) {
    if (!s || !str(s.image).trim()) continue;
    overviewSlides.push({ src: str(s.image).trim(), alt: str(s.caption) || str(p.title), caption: str(s.caption).trim() });
  }

  const body = (className: string) =>
    str(p.body) ? (
      <El block={block} id={part(block, "body")} as="p" className={className}>
        {str(p.body)}
      </El>
    ) : null;
  const cta = (className: string) => (
    <CtaButton
      block={block}
      id={part(block, "cta")}
      prefix="cta"
      label={str(p.ctaText)}
      href={str(p.ctaUrl) || `#${str(p.ctaAnchor, "enquire")}`}
      target={str(p.ctaTarget)}
      className={className}
    />
  );
  const ctaRow = (align: "center" | "left") =>
    str(p.ctaText).trim() ? (
      <div className={`mt-10 flex ${align === "center" ? "justify-center" : ""}`}>
        {cta("px-5 py-2.5 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim")}
      </div>
    ) : null;
  const sub = (h: { id: string }, key: "title" | "description" | "icon") =>
    subElementId(h.id, key);
  // A highlight's uploaded logo / icon, or `fallback` (check mark, step number)
  // when none is set. Selectable as "Icon" for per-item styling.
  const hlIcon = (h: { id: string; icon: string }, className: string, imgClass: string, fallback: React.ReactNode) => (
    <El block={block} id={sub(h, "icon")} as="span" className={className}>
      {isMediaSrc(h.icon) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={h.icon} alt="" className={imgClass} />
      ) : (
        fallback
      )}
    </El>
  );

  if (variant === "cards") {
    return (
      <SectionShell id={str(p.anchor, "overview")}>
        <Title block={block} title={str(p.title, "Why this project")} subtitle={str(p.subtitle)} />
        {body("max-w-3xl mx-auto text-text-1 leading-relaxed text-center mb-10")}
        <div className="grid @md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {highlights.map((h) => (
            <El key={h.id} block={block} id={h.id} className="rounded-2xl border border-border-default bg-bg-2 p-6 text-center hover:-translate-y-0.5 hover:border-border-hover transition-all">
              {hlIcon(h, "w-10 h-10 rounded-full bg-green/10 text-green flex items-center justify-center mx-auto mb-3 overflow-hidden", "w-6 h-6 object-contain", <Check size={14} />)}
              <El block={block} id={sub(h, "title")} as="h3" className="font-semibold mb-1">{h.title}</El>
              {h.description ? <El block={block} id={sub(h, "description")} as="p" className="text-text-2 text-sm">{h.description}</El> : null}
            </El>
          ))}
        </div>
        {ctaRow("center")}
      </SectionShell>
    );
  }

  if (variant === "timeline") {
    return (
      <SectionShell id={str(p.anchor, "overview")}>
        <Title block={block} title={str(p.title, "The Journey")} subtitle={str(p.subtitle)} />
        {body("max-w-2xl mx-auto text-text-1 leading-relaxed text-center mb-10")}
        <ol className="max-w-xl mx-auto space-y-0">
          {highlights.map((h, i) => (
            <El key={h.id} block={block} id={h.id} as="li" className="relative pl-10 pb-8 last:pb-0">
              {hlIcon(h, "absolute left-0 top-1 w-6 h-6 rounded-full bg-green text-black text-[11px] font-bold flex items-center justify-center overflow-hidden", "w-4 h-4 object-contain", i + 1)}
              {i < highlights.length - 1 ? <span className="absolute left-[11px] top-8 bottom-0 w-px bg-border-default" /> : null}
              <El block={block} id={sub(h, "title")} className="font-semibold">{h.title}</El>
              {h.description ? <El block={block} id={sub(h, "description")} as="p" className="text-text-2 text-sm mt-1">{h.description}</El> : null}
            </El>
          ))}
        </ol>
        {ctaRow("center")}
      </SectionShell>
    );
  }

  if (variant === "split") {
    const imageFirst = str(p.imagePosition) !== "right";
    return (
      <SectionShell id={str(p.anchor, "overview")}>
        <div className="grid @lg:grid-cols-2 gap-10 @lg:gap-16 items-center max-w-6xl mx-auto">
          <div className={`rounded-[24px] overflow-hidden border border-border-default aspect-[3/4] @lg:aspect-[4/5] bg-bg-2 ${imageFirst ? "order-1" : "order-2"}`}>
            {str(p.image) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={str(p.image)} alt={str(p.title)} className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700" />
            ) : (
              <div className="w-full h-full min-h-[280px] bg-bg-3" />
            )}
          </div>
          <div className={imageFirst ? "order-2" : "order-1"}>
            {str(p.subtitle) ? (
              <El block={block} id={part(block, "subtitle")} as="p" className="text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-3">
                {str(p.subtitle)}
              </El>
            ) : null}
            <El block={block} id={part(block, "title")} as="h2" className="font-display text-3xl @md:text-4xl font-semibold mb-4">
              {str(p.title, "About the Project")}
            </El>
            {body("text-text-1 leading-relaxed mb-6 whitespace-pre-line")}
            {highlights.length ? (
              <ul className="space-y-3 mb-7">
                {highlights.map((h) => (
                  <El key={h.id} block={block} id={h.id} as="li" className="flex gap-3 text-sm">
                    {hlIcon(h, "mt-0.5 w-5 h-5 rounded-full bg-green/15 text-green flex items-center justify-center shrink-0 overflow-hidden", "w-3.5 h-3.5 object-contain", <Check size={12} />)}
                    <span>
                      <El block={block} id={sub(h, "title")} as="strong" className="text-text-0">{h.title}</El>
                      {h.description ? (
                        <El block={block} id={sub(h, "description")} as="span" className="text-text-2"> — {h.description}</El>
                      ) : null}
                    </span>
                  </El>
                ))}
              </ul>
            ) : null}
            {overviewStats.length ? (
              <div className="grid grid-cols-2 border-t border-l border-border-default mb-6">
                {overviewStats.map((s) => (
                  <Stat
                    key={s.id}
                    block={block}
                    stat={s}
                    className="border-r border-b border-border-default px-5 py-5"
                    valueClass="font-display text-3xl font-medium text-text-0 mb-1"
                    labelClass="text-[10px] uppercase tracking-[0.18em] text-text-3"
                  />
                ))}
              </div>
            ) : null}
            {cta("px-5 py-2.5 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim")}
          </div>
        </div>
        <CustomPropList rows={customRows} />
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "overview")}>
      <Title block={block} title={str(p.title, "Project Overview")} subtitle={str(p.subtitle)} />
      {body("max-w-3xl mx-auto text-text-1 leading-relaxed text-center whitespace-pre-line")}
      {overviewStats.length ? (
        <div className="mt-10 grid grid-cols-2 @md:grid-cols-4 gap-px bg-border-default rounded-2xl overflow-hidden max-w-4xl mx-auto">
          {overviewStats.map((s) => (
            <Stat
              key={s.id}
              block={block}
              stat={s}
              className="bg-white px-5 py-6 text-center"
              valueClass="font-display text-2xl font-semibold mb-1"
              labelClass="text-[10px] uppercase tracking-[0.18em] text-text-3"
            />
          ))}
        </div>
      ) : null}
      {highlights.length ? (
        <div className="mt-10 grid @md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {highlights.map((h) => (
            <El key={h.id} block={block} id={h.id} className="rounded-2xl border border-border-default bg-bg-2 p-5">
              {isMediaSrc(h.icon) ? hlIcon(h, "w-10 h-10 mb-3 flex items-center justify-center overflow-hidden", "w-10 h-10 object-contain", null) : null}
              <El block={block} id={sub(h, "title")} as="h3" className="font-semibold mb-1">{h.title}</El>
              {h.description ? <El block={block} id={sub(h, "description")} as="p" className="text-text-2 text-sm">{h.description}</El> : null}
            </El>
          ))}
        </div>
      ) : null}
      {overviewSlides.length > 1 ? (
        <El block={block} id={part(block, "slider")} className="mt-10 max-w-5xl mx-auto rounded-[28px] overflow-hidden bg-bg-2">
          <ImageSlideshow slides={overviewSlides} intervalMs={slideIntervalMs(p.slideInterval)} className="aspect-[16/9]" />
        </El>
      ) : str(p.image) ? (
        <div className="mt-10 max-w-5xl mx-auto rounded-[28px] overflow-hidden aspect-[16/9] bg-bg-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={str(p.image)} alt={str(p.title)} className="w-full h-full object-cover" />
        </div>
      ) : null}
      {ctaRow("center")}
      <CustomPropList rows={customRows} />
    </SectionShell>
  );
}

export function PropertyDetailsBlock({ block }: { block: BlockConfig }) {
  const variant = block.variant || "grid";

  // Dedicated fields win over the generic list so entering Type / Status /
  // Possession / RERA in the inspector always shows up on the page.
  const typedRows: Array<{ label: string; value: string }> = [
    { label: "Type", value: str(block.props.type) },
    { label: "Status", value: str(block.props.status) },
    { label: "Possession", value: str(block.props.possession) },
    { label: "RERA", value: str(block.props.rera) },
  ].filter((r) => r.value.trim());

  const listRows = items<{ label: string; value: string }>(block.props.items).filter(
    (r) => str(r?.label).trim() || str(r?.value).trim(),
  );

  const claimed = new Set(typedRows.map((r) => r.label.toLowerCase()));
  const merged = [
    ...typedRows,
    ...listRows.filter((r) => !claimed.has(str(r.label).trim().toLowerCase())),
  ];

  const data = merged.length
    ? merged
    : [
        { label: "Type", value: "Residential" },
        { label: "Status", value: "Under Construction" },
        { label: "Possession", value: "Dec 2027" },
      ];

  // Rows coming from the `items` list carry a stable `_id` so "Style this item"
  // and per-device visibility work; the dedicated fields have no list identity.
  const rowId = (row: unknown): ElementId | undefined => {
    const id = (row as { _id?: unknown } | null | undefined)?._id;
    return typeof id === "string" && id ? itemPart("items", row) : undefined;
  };

  const cells = data.map((row, i) => {
    const id = rowId(row);
    // Dedicated fields have no list identity, so key them off their index to
    // keep every cell in its own style scope.
    const labelId = id ? subElementId(id, "label") : `${part(block, `rowLabel-${i}`)}`;
    const valueId = id ? subElementId(id, "value") : `${part(block, `rowValue-${i}`)}`;
    const label = (
      <El block={block} id={labelId} as="span">
        {row.label}
      </El>
    );
    const value = (
      <El block={block} id={valueId} as="span">
        {row.value}
      </El>
    );
    return { row, i, id, label, value };
  });

  if (variant === "table") {
    return (
      <SectionShell id={str(block.props.anchor, "highlights")} className="bg-bg-2">
        <Title block={block} title={str(block.props.title, "Specifications")} subtitle={str(block.props.subtitle)} />
        <div className="max-w-2xl mx-auto overflow-hidden rounded-2xl border border-border-default bg-bg-1">
          <table className="w-full text-sm">
            <tbody>
              {cells.map(({ i, id, label, value }) => {
                const inner = (
                  <>
                    <td className="px-5 py-3.5 text-text-3 w-[40%]">{label}</td>
                    <td className="px-5 py-3.5 font-medium">{value}</td>
                  </>
                );
                return id ? (
                  <El key={i} block={block} id={id} as="tr" className="border-b border-border-subtle last:border-0">
                    {inner}
                  </El>
                ) : (
                  <tr key={i} className="border-b border-border-subtle last:border-0">
                    {inner}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionShell>
    );
  }

  if (variant === "two-column") {
    return (
      <SectionShell id={str(block.props.anchor, "highlights")}>
        <Title block={block} title={str(block.props.title, "Project Highlights")} subtitle={str(block.props.subtitle)} />
        <div className="grid @md:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {cells.map(({ i, id, label, value }) => {
            const inner = (
              <>
                {label}
                {value}
              </>
            );
            return id ? (
              <El
                key={i}
                block={block}
                id={id}
                className="flex items-center justify-between rounded-xl border border-border-default bg-bg-2 px-4 py-3"
              >
                {inner}
              </El>
            ) : (
              <div key={i} className="flex items-center justify-between rounded-xl border border-border-default bg-bg-2 px-4 py-3">
                {inner}
              </div>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (variant === "checklist") {
    return (
      <SectionShell id={str(block.props.anchor, "highlights")} className="bg-bg-2">
        <Title block={block} title={str(block.props.title, "Specifications")} subtitle={str(block.props.subtitle)} />
        <ul className="max-w-xl mx-auto space-y-3">
          {cells.map(({ i, id, label, value }) => {
            const inner = (
              <>
                <span className="mt-0.5 w-5 h-5 rounded-full bg-green/15 text-green flex items-center justify-center shrink-0">
                  <Check size={12} />
                </span>
                <span>
                  <strong className="text-text-0">{label}:</strong> <span className="text-text-2">{value}</span>
                </span>
              </>
            );
            return id ? (
              <El key={i} block={block} id={id} as="li" className="flex gap-3 items-start text-sm">
                {inner}
              </El>
            ) : (
              <li key={i} className="flex gap-3 items-start text-sm">
                {inner}
              </li>
            );
          })}
        </ul>
      </SectionShell>
    );
  }

  // Cards sit in a wrapping flex row (not a fixed 5-column grid) so they can
  // be aligned: "Card alignment" in Content, or the row's own Layout & Flex in
  // the Element tab (click the empty space beside the cards). Each card keeps
  // the old column width - 2 / 3 / 5 per row - so the default looks the same.
  const cardsAlign = str(block.props.cardsAlign, "left");
  const justify = cardsAlign === "center" ? "justify-center" : cardsAlign === "right" ? "justify-end" : "justify-start";
  const cardClass =
    "basis-[calc(50%-0.5rem)] @md:basis-[calc(33.333%-0.667rem)] @2xl:basis-[calc(20%-0.8rem)] grow-0 shrink min-w-0 " +
    "rounded-2xl border border-border-default bg-bg-1 p-5 text-center hover:-translate-y-0.5 hover:border-border-hover transition-all";
  return (
    <SectionShell id={str(block.props.anchor, "highlights")} className="bg-bg-2">
      <Title block={block} title={str(block.props.title, "Project Highlights")} subtitle={str(block.props.subtitle)} />
      <El block={block} id={part(block, "cardsRow")} className={`flex flex-wrap gap-4 max-w-6xl mx-auto ${justify}`}>
        {cells.map(({ i, id, label, value }) => {
          const inner = (
            <>
              <div className="w-10 h-10 rounded-full bg-green/10 text-green flex items-center justify-center mx-auto mb-3">
                <Check size={14} />
              </div>
              <div className="font-display text-2xl font-semibold mb-1">{value}</div>
              <div className="text-[11px] uppercase tracking-wider text-text-3">{label}</div>
            </>
          );
          return id ? (
            <El
              key={i}
              block={block}
              id={id}
              className={cardClass}
            >
              {inner}
            </El>
          ) : (
            <div key={i} className={cardClass}>
              {inner}
            </div>
          );
        })}
      </El>
    </SectionShell>
  );
}

export function ProjectHighlightsBlock({ block }: { block: BlockConfig }) {
  const itemsList = items<{ title: string; description: string; icon?: string }>(block.props.items);
  const p = block.props;

  if (block.variant === "split-impact") {
    return (
      <SectionShell id={str(p.anchor, "impact")} className="bg-[#e8efe8]">
        <div className="max-w-6xl mx-auto grid @lg:grid-cols-2 gap-8 @lg:gap-12 items-center">
          <div className="rounded-[28px] overflow-hidden aspect-[4/3] @lg:aspect-auto @lg:min-h-[360px] bg-bg-3">
            {str(p.image) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={str(p.image)} alt="" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <div>
            <p className="font-display text-4xl @md:text-5xl text-text-0 leading-tight mb-1">{str(p.title, "Do good.")}</p>
            {str(p.accentLine) ? (
              <p className="font-display text-4xl @md:text-5xl italic text-green leading-tight mb-6">{str(p.accentLine)}</p>
            ) : null}
            {str(p.body) ? <p className="text-text-1 text-sm @md:text-base leading-relaxed mb-8 max-w-md">{str(p.body)}</p> : null}
            <div className="flex flex-wrap gap-3">
              {str(p.author) ? (
                <a
                  href={`#${str(p.ctaAnchor, "about")}`}
                  className="px-5 py-2.5 rounded-full border border-text-0 text-sm font-semibold hover:bg-text-0 hover:text-bg-1 transition-colors"
                >
                  {str(p.author)}
                </a>
              ) : null}
              {str(p.authorRole) ? (
                <a
                  href={`#${str(p.secondaryAnchor, "impact")}`}
                  className="px-5 py-2.5 rounded-full bg-text-0 text-bg-1 text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  {str(p.authorRole)}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </SectionShell>
    );
  }

  if (block.variant === "quote") {
    return (
      <SectionShell id={str(p.anchor, "philosophy")} className="bg-bg-2">
        <div className="max-w-3xl mx-auto text-center py-6 @md:py-10">
          {str(p.subtitle) ? (
            <p className="text-[11px] uppercase tracking-[0.28em] text-text-2 font-medium mb-8">{str(p.subtitle)}</p>
          ) : null}
          <p className="font-display text-3xl @md:text-5xl text-text-0 leading-tight mb-3">{str(p.title)}</p>
          {str(p.accentLine) ? (
            <p className="font-display text-3xl @md:text-5xl italic text-green leading-tight mb-8">{str(p.accentLine)}</p>
          ) : null}
          {str(p.body) ? <p className="text-text-1 text-sm mt-2">{str(p.body)}</p> : null}
          {str(p.author) ? (
            <div className="mt-8">
              <div className="text-sm font-semibold text-text-0">{str(p.author)}</div>
              {str(p.authorRole) ? (
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-3 mt-1">{str(p.authorRole)}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </SectionShell>
    );
  }

  if (block.variant === "signature") {
    return (
      <SectionShell id={str(p.anchor, "highlights")}>
        <div className="flex flex-col @lg:flex-row @lg:items-end @lg:justify-between gap-4 mb-8 max-w-6xl mx-auto">
          <h2 className="font-display text-3xl @md:text-4xl font-medium tracking-tight">
            {str(p.title, "Signature Highlights")}
          </h2>
          {str(p.subtitle) ? <p className="text-text-2 text-sm max-w-sm @lg:text-right">{str(p.subtitle)}</p> : null}
        </div>
        <div className="max-w-6xl mx-auto rounded-2xl border border-border-default overflow-hidden">
          <div className="grid grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-5 divide-y @sm:divide-y-0 @sm:divide-x divide-border-default">
            {itemsList.map((it, i) => (
              <div key={i} className="p-6 @xl:p-7">
                <div className="w-9 h-9 rounded-lg bg-green/10 text-green flex items-center justify-center mb-5">
                  <Check size={14} />
                </div>
                <h3 className="font-display text-lg font-medium mb-3 leading-snug">{it.title}</h3>
                <p className="text-text-2 text-sm leading-relaxed">{it.description}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionShell>
    );
  }

  if (block.variant === "radial") {
    const mid = Math.ceil(itemsList.length / 2);
    const left = itemsList.slice(0, mid);
    const right = itemsList.slice(mid);
    return (
      <SectionShell id={str(p.anchor, "highlights")} className="bg-bg-2">
        <Title block={block} title={str(p.title, "Project Highlights")} />
        <div className="max-w-5xl mx-auto grid @lg:grid-cols-[1fr_auto_1fr] gap-8 @lg:gap-10 items-center">
          <ul className="space-y-5 @lg:text-right">
            {left.map((it, i) => (
              <li key={i} className="flex @lg:flex-row-reverse gap-3 items-start text-sm text-text-1">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-green shrink-0" />
                <span>{it.title}{it.description ? ` ${it.description}` : ""}</span>
              </li>
            ))}
          </ul>
          <div className="w-56 h-56 @md:w-72 @md:h-72 rounded-full overflow-hidden border-4 border-bg-1 shadow-lg mx-auto bg-bg-3">
            {str(p.image) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={str(p.image)} alt="" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <ul className="space-y-5">
            {right.map((it, i) => (
              <li key={i} className="flex gap-3 items-start text-sm text-text-1">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-green shrink-0" />
                <span>{it.title}{it.description ? ` ${it.description}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "highlights")}>
      <Title block={block} title={str(p.title, "Highlights")} subtitle={str(p.subtitle)} />
      <div className="grid @md:grid-cols-3 gap-4">
        {itemsList.map((it, i) => (
          <div key={i} className="rounded-xl border border-border-default bg-bg-2 p-5">
            <div className="w-8 h-8 rounded-lg bg-green/15 text-green flex items-center justify-center mb-3">
              <Check size={14} />
            </div>
            <h3 className="font-semibold mb-1">{it.title}</h3>
            <p className="text-text-2 text-sm">{it.description}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

interface AmenityItem {
  _id?: string;
  title: string;
  description: string;
  image: string;
  icon: string;
  cardColor?: string;
  cardBg?: string;
  iconBg?: string;
  iconColor?: string;
  [key: string]: unknown;
}

export function AmenitiesBlock({ block }: { block: BlockConfig }) {
  const raw = block.props.items;
  const p = block.props;

  // Spread each source entry so its stable `_id` survives — rebuilding the
  // object would collapse every card onto the same element id and break
  // "Style this item", hide-item and per-device visibility.
  const amen: AmenityItem[] = Array.isArray(raw)
    ? raw.map((a, i) =>
        typeof a === "string"
          ? { _id: `it_${i}`, title: a, description: "", image: "", icon: "" }
          : {
              ...(typeof a === "object" && a !== null ? (a as Record<string, unknown>) : {}),
              _id: (a as { _id?: string })?._id || `it_${i}`,
              title: String((a as { title?: string })?.title || ""),
              description: String((a as { description?: string })?.description || ""),
              image: String((a as { image?: string })?.image || ""),
              icon: String((a as { icon?: string })?.icon || ""),
            },
      )
    : [
        { _id: "it_0", title: "Clubhouse", description: "A 30,000 sq.ft clubhouse for gatherings and leisure.", image: "", icon: "" },
        { _id: "it_1", title: "Pool", description: "Temperature-controlled infinity pool with deck.", image: "", icon: "" },
        { _id: "it_2", title: "Gym", description: "Fully equipped fitness studio overlooking the greens.", image: "", icon: "" },
      ];

  const exploreText = str(p.ctaText).trim();
  const exploreHref = str(p.ctaUrl).trim() || `#${str(p.ctaAnchor, "listings")}`;
  const exploreButton = exploreText ? (
    <div className="mt-10 flex justify-center">
      <CtaButton
        block={block}
        id={part(block, "cta")}
        prefix="cta"
        label={exploreText}
        href={exploreHref}
        target={str(p.ctaTarget)}
        className="px-7 py-3 rounded-lg border border-border-default text-sm font-semibold hover:border-green hover:bg-green/5"
        brand="secondary"
      />
    </div>
  ) : null;

  if (block.variant === "chips") {
    return (
      <SectionShell id={str(p.anchor, "amenities")}>
        <Title block={block} title={str(p.title, "Amenities")} subtitle={str(p.subtitle)} />
        <div className="flex flex-wrap justify-center gap-2">
          {amen.map((a) => (
            <El
              key={itemPart("items", a)}
              block={block}
              id={itemPart("items", a)}
              className="px-3 py-1.5 rounded-full border border-border-default bg-bg-2 text-sm"
            >
              {a.title}
            </El>
          ))}
        </div>
        {exploreButton}
      </SectionShell>
    );
  }

  if (block.variant === "icon-grid") {
    return (
      <SectionShell id={str(p.anchor, "amenities")} className="bg-bg-2">
        <Title block={block} title={str(p.title, "Amenities")} subtitle={str(p.subtitle)} />
        <div className="grid grid-cols-2 @md:grid-cols-3 @2xl:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {amen.map((a) => (
            <El
              key={itemPart("items", a)}
              block={block}
              id={itemPart("items", a)}
              className="rounded-2xl border border-border-default bg-bg-1 p-5 text-center hover:border-green/40 transition-all"
            >
              <El
                block={block}
                id={subElementId(itemPart("items", a), "icon")}
                className="w-11 h-11 rounded-xl bg-green/10 text-green flex items-center justify-center mx-auto mb-3 overflow-hidden"
              >
                {isMediaSrc(a.icon) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.icon} alt="" className="w-6 h-6 object-contain" />
                ) : (
                  <Check size={16} />
                )}
              </El>
              <El block={block} id={subElementId(itemPart("items", a), "title")} as="h3" className="font-semibold text-sm mb-1">
                {a.title}
              </El>
              {a.description ? (
                <El block={block} id={subElementId(itemPart("items", a), "description")} as="p" className="text-text-3 text-xs leading-relaxed">
                  {a.description}
                </El>
              ) : null}
            </El>
          ))}
        </div>
        {exploreButton}
      </SectionShell>
    );
  }

  if (block.variant === "featured") {
    const [first, ...rest] = amen;
    return (
      <SectionShell id={str(p.anchor, "amenities")}>
        <Title block={block} title={str(p.title, "Amenities")} subtitle={str(p.subtitle)} />
        <div className="grid @lg:grid-cols-2 gap-5 max-w-6xl mx-auto">
          {first ? (
            <El
              block={block}
              id={itemPart("items", first)}
              className="rounded-2xl overflow-hidden border border-border-default bg-bg-2 relative min-h-[280px]"
            >
              {first.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={first.image} alt={first.title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-bg-3" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <El block={block} id={subElementId(itemPart("items", first), "title")} as="h3" className="font-display text-2xl font-semibold mb-1">
                  {first.title}
                </El>
                {first.description ? (
                  <El block={block} id={subElementId(itemPart("items", first), "description")} as="p" className="text-white/80 text-sm">
                    {first.description}
                  </El>
                ) : null}
              </div>
            </El>
          ) : null}
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4 content-start">
            {rest.map((a) => {
              const id = itemPart("items", a);
              // Smaller cards show their own image (or uploaded icon) too;
              // without either they look as before.
              return (
                <El key={id} block={block} id={id} className="rounded-2xl border border-border-default bg-bg-2 overflow-hidden">
                  {a.image ? (
                    <El block={block} id={subElementId(id, "image")} className="block aspect-[4/3] bg-bg-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.image} alt={a.title} className="w-full h-full object-cover" />
                    </El>
                  ) : null}
                  <div className="p-5">
                    {!a.image && isMediaSrc(a.icon) ? (
                      <El block={block} id={subElementId(id, "icon")} className="w-10 h-10 rounded-xl bg-green/10 flex items-center justify-center mb-3 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.icon} alt="" className="w-6 h-6 object-contain" />
                      </El>
                    ) : null}
                    {a.title ? (
                      <El block={block} id={subElementId(id, "title")} as="h3" className="font-semibold mb-1">
                        {a.title}
                      </El>
                    ) : null}
                    {a.description ? (
                      <El block={block} id={subElementId(id, "description")} as="p" className="text-text-2 text-sm">
                        {a.description}
                      </El>
                    ) : null}
                  </div>
                </El>
              );
            })}
          </div>
        </div>
        {exploreButton}
      </SectionShell>
    );
  }

  if (block.variant === "mosaic") {
    const [featured, ...rest] = amen;
    return (
      <SectionShell id={str(p.anchor, "amenities")}>
        <Title block={block} title={str(p.title, "Amenities")} subtitle={str(p.subtitle)} />
        <div className="max-w-6xl mx-auto grid @lg:grid-cols-2 gap-3 @md:gap-4">
          {featured ? (
            <El
              block={block}
              id={itemPart("items", featured)}
              className="relative rounded-[22px] overflow-hidden min-h-[320px] @lg:min-h-[420px] @lg:row-span-2 group"
            >
              {featured.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featured.image} alt={featured.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
              ) : (
                <div className="absolute inset-0 bg-bg-3" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between gap-3">
                <div>
                  <El block={block} id={subElementId(itemPart("items", featured), "title")} as="h3" className="text-white font-semibold text-xl mb-0.5">
                    {featured.title}
                  </El>
                  {featured.description ? (
                    <El block={block} id={subElementId(itemPart("items", featured), "description")} as="p" className="text-white/80 text-sm">
                      {featured.description}
                    </El>
                  ) : null}
                </div>
                <span className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white shrink-0">
                  <ArrowRight size={14} />
                </span>
              </div>
            </El>
          ) : null}
          <div className="grid grid-cols-2 gap-3 @md:gap-4">
            {rest.slice(0, 4).map(mosaicTile)}
          </div>
        </div>
        {/* The mosaic frame holds five tiles; any further amenities continue
            below it instead of being silently dropped. */}
        {rest.length > 4 ? (
          <div className="max-w-6xl mx-auto mt-3 @md:mt-4 grid grid-cols-2 @md:grid-cols-4 gap-3 @md:gap-4">
            {rest.slice(4).map(mosaicTile)}
          </div>
        ) : null}
        {exploreButton}
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "amenities")}>
      <Title block={block} title={str(p.title, "Amenities")} subtitle={str(p.subtitle)} />
      <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {amen.map((a) => (
          <El
            key={itemPart("items", a)}
            block={block}
            id={itemPart("items", a)}
            style={{
              backgroundColor: (a.cardColor as string) || (a.cardBg as string) || (p.cardColor as string) || (p.cardBg as string) || undefined,
            }}
            className="group rounded-2xl border border-border-default bg-bg-2 overflow-hidden hover:-translate-y-0.5 hover:border-border-hover transition-all"
          >
            {a.image ? (
              <El block={block} id={subElementId(itemPart("items", a), "image")} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.image} alt={a.title} className="h-40 w-full object-cover" />
              </El>
            ) : null}
            <div className="p-5">
              {!a.image ? (
                <El
                  block={block}
                  id={subElementId(itemPart("items", a), "icon")}
                  style={{
                    backgroundColor: (a.iconBg as string) || undefined,
                    color: (a.iconColor as string) || undefined,
                  }}
                  className="w-9 h-9 rounded-lg bg-green/10 text-green flex items-center justify-center mb-3 overflow-hidden"
                >
                  {isMediaSrc(a.icon) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.icon} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <Check size={14} />
                  )}
                </El>
              ) : null}
              <El block={block} id={subElementId(itemPart("items", a), "title")} as="h3" className="font-semibold mb-1">
                {a.title}
              </El>
              {a.description ? (
                <El block={block} id={subElementId(itemPart("items", a), "description")} as="p" className="text-text-2 text-sm leading-relaxed">
                  {a.description}
                </El>
              ) : null}
            </div>
          </El>
        ))}
      </div>
      {exploreButton}
    </SectionShell>
  );

  function mosaicTile(a: AmenityItem) {
    return (
      <El key={itemPart("items", a)} block={block} id={itemPart("items", a)} className="relative rounded-[22px] overflow-hidden aspect-square group">
        {a.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.image} alt={a.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
        ) : (
          <div className="absolute inset-0 bg-bg-3" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-2">
          <div>
            <El block={block} id={subElementId(itemPart("items", a), "title")} as="h3" className="text-white font-semibold text-sm">
              {a.title}
            </El>
            {a.description ? (
              <El block={block} id={subElementId(itemPart("items", a), "description")} as="p" className="text-white/75 text-xs">
                {a.description}
              </El>
            ) : null}
          </div>
          <span className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white shrink-0">
            <ArrowRight size={12} />
          </span>
        </div>
      </El>
    );
  }
}

export function FloorPlansBlock({ block }: { block: BlockConfig }) {
  const runtime = useOpenPageRuntime();
  const plans = items<{
    _id?: string;
    name: string;
    beds: string;
    area: string;
    price?: string;
    image?: string;
    downloadUrl?: string;
    blurred?: boolean;
  }>(block.props.items);
  const gateEnabled = block.props.gateEnabled !== false;
  const formId = str(block.props.formId);
  const popupId = str(block.props.popupId);
  const forms = resolveRuntimeForms(runtime.forms);
  const form = formId ? findFormById(formId, forms) : forms.find((f) => f.id.includes("floor")) || forms[0];

  function unlockKey(plan: { _id?: string; name: string; image?: string }, index: number) {
    return `floor-plan:${plan._id || `${plan.image || plan.name}:${index}`}`;
  }

  function openGate(plan: { _id?: string; name: string; image?: string; downloadUrl?: string }, index: number) {
    const key = unlockKey(plan, index);
    if (!gateEnabled || runtime.isUnlocked(key)) {
      const url = plan.downloadUrl || plan.image;
      if (url && typeof window !== "undefined") window.open(url, "_blank");
      return;
    }
    runtime.openPopup(popupId || undefined, {
      mode: "floor-plan",
      unlockKey: key,
      unlockImageUrl: plan.image || plan.downloadUrl,
      brochureUrl: plan.downloadUrl || plan.image,
      formId: form?.id,
      title: `Unlock ${plan.name || "floor plan"}`,
      description: "Share your details to view and download the full-resolution floor plan.",
    });
  }

  // Each plan is a list item: "Style this item" styles the card, and its name,
  // size line and price are separately selectable.
  const planId = (plan: { _id?: string }, i: number) => itemPart("items", { _id: plan._id || `idx_${i}` });
  const planText = (plan: { name: string; beds: string; area: string; price?: string }, id: ElementId, cls: {
    name: string;
    meta: string;
    price: string;
  }) => (
    <>
      <El block={block} id={subElementId(id, "name")} className={cls.name}>{plan.name}</El>
      {[plan.beds, plan.area].filter(Boolean).length ? (
        <El block={block} id={subElementId(id, "meta")} className={cls.meta}>
          {[plan.beds, plan.area].filter(Boolean).join(" · ")}
        </El>
      ) : null}
      {plan.price ? <El block={block} id={subElementId(id, "price")} className={cls.price}>{plan.price}</El> : null}
    </>
  );

  return (
    <SectionShell id={str(block.props.anchor, "plans")} className="bg-bg-2">
      <Title block={block} title={str(block.props.title, "Floor Plans")} subtitle={str(block.props.subtitle)} />
      {block.variant === "list" ? (
        <div className="max-w-3xl mx-auto space-y-3">
          {plans.map((plan, i) => {
            const key = unlockKey(plan, i);
            const unlocked = !gateEnabled || runtime.isUnlocked(key);
            const id = planId(plan, i);
            return (
              <El key={id} block={block} id={id} className="flex flex-col @sm:flex-row @sm:items-center gap-4 rounded-2xl border border-border-default bg-bg-1 p-4">
                <button type="button" className="relative w-full @sm:w-36 h-24 rounded-xl overflow-hidden bg-bg-3 shrink-0" onClick={() => openGate(plan, i)}>
                  {plan.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={plan.image} alt={plan.name} className={`w-full h-full object-cover ${unlocked ? "" : "blur-md"}`} />
                  ) : null}
                  {!unlocked ? <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Lock size={14} /></span> : null}
                </button>
                <div className="flex-1 min-w-0">
                  {planText(plan, id, { name: "font-semibold", meta: "text-text-2 text-sm", price: "text-green text-sm font-semibold mt-1" })}
                </div>
                <button type="button" className="inline-flex items-center gap-2 text-sm font-medium text-green shrink-0" onClick={() => openGate(plan, i)}>
                  {unlocked ? <>Download <Download size={14} /></> : <>Unlock <ArrowRight size={14} /></>}
                </button>
              </El>
            );
          })}
        </div>
      ) : block.variant === "showcase" && plans[0] ? (
        <div className="max-w-5xl mx-auto grid @lg:grid-cols-[1.2fr_0.8fr] gap-6">
          {(() => {
            const plan = plans[0];
            const key = unlockKey(plan, 0);
            const unlocked = !gateEnabled || runtime.isUnlocked(key);
            const id = planId(plan, 0);
            return (
              <>
                <button type="button" className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-border-default bg-bg-1" onClick={() => openGate(plan, 0)}>
                  {plan.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={plan.image} alt={plan.name} className={`w-full h-full object-cover ${unlocked ? "" : "blur-md brightness-75"}`} />
                  ) : null}
                  {!unlocked ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white text-sm font-semibold">
                      <Lock size={18} /> Unlock floor plan
                    </span>
                  ) : null}
                </button>
                <El block={block} id={id} className="flex flex-col justify-center">
                  {planText(plan, id, {
                    name: "font-display text-3xl font-semibold mb-2",
                    meta: "text-text-2 mb-2",
                    price: "text-green font-semibold text-lg mb-6",
                  })}
                  <button type="button" className="inline-flex items-center gap-2 self-start px-5 py-2.5 rounded-lg bg-green text-black text-sm font-semibold" onClick={() => openGate(plan, 0)}>
                    {unlocked ? "Download plan" : "Unlock & download"} <ArrowRight size={14} />
                  </button>
                  {plans.length > 1 ? (
                    <div className="mt-8 space-y-2">
                      {plans.slice(1).map((other, j) => {
                        const otherId = planId(other, j + 1);
                        return (
                          <El
                            key={otherId}
                            block={block}
                            id={otherId}
                            as="button"
                            type="button"
                            className="w-full flex items-center justify-between rounded-xl border border-border-default bg-bg-1 px-4 py-3 text-sm hover:border-border-hover"
                            onClick={() => openGate(other, j + 1)}
                          >
                            <El block={block} id={subElementId(otherId, "name")} as="span" className="font-medium">{other.name}</El>
                            <El block={block} id={subElementId(otherId, "meta")} as="span" className="text-text-3">{other.area}</El>
                          </El>
                        );
                      })}
                    </div>
                  ) : null}
                </El>
              </>
            );
          })()}
        </div>
      ) : (
        <div className="grid @md:grid-cols-2 @2xl:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {plans.map((plan, i) => {
            const key = unlockKey(plan, i);
            const unlocked = !gateEnabled || runtime.isUnlocked(key);
            const img = plan.image;
            const id = planId(plan, i);
            return (
              <El key={id} block={block} id={id} className="rounded-2xl border border-border-default bg-bg-1 overflow-hidden hover:border-border-hover transition-all">
                <button
                  type="button"
                  className="relative aspect-[4/3] w-full bg-bg-3 flex items-center justify-center text-text-3 text-sm overflow-hidden group"
                  onClick={() => openGate(plan, i)}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={plan.name}
                      className={`w-full h-full object-cover transition duration-300 ${unlocked ? "" : "scale-105 blur-md brightness-75"}`}
                    />
                  ) : (
                    plan.name
                  )}
                  {!unlocked ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white text-sm font-semibold">
                      <Lock size={18} />
                      Unlock floor plan
                    </span>
                  ) : null}
                </button>
                <div className="p-5">
                  {planText(plan, id, { name: "font-semibold text-lg", meta: "text-text-2 text-sm mt-1", price: "text-green text-sm font-semibold mt-2" })}
                  <button
                    type="button"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-green hover:underline"
                    onClick={() => openGate(plan, i)}
                  >
                    {unlocked ? (
                      <>
                        Download plan <Download size={14} />
                      </>
                    ) : (
                      <>
                        Unlock &amp; download <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </El>
            );
          })}
        </div>
      )}
      {!plans.length ? (
        <p className="text-center text-sm text-text-3">Add floor plan images in Properties, or bind a project with floor plans.</p>
      ) : null}
    </SectionShell>
  );
}

export function UnitConfigBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const rows = items<{
    _id?: string;
    config: string;
    type?: string;
    area: string;
    price: string;
    image?: string;
    cta?: string;
    description?: string;
    meta?: string;
  }>(p.items).map((r, i) => ({ ...r, id: itemPart("items", { _id: r._id || `idx_${i}` }) }));

  const sub = (id: ElementId, key: string) => subElementId(id, key);
  // Card buttons share the section's button colours (Content tab) and can each
  // be restyled from the Element tab. Alignment: full width (default) or
  // left / center / right.
  const align = str(p.ctaAlign, "full");
  const ctaWrap =
    align === "left" ? "flex justify-start" : align === "center" ? "flex justify-center" : align === "right" ? "flex justify-end" : "";
  const cardCta = (r: (typeof rows)[number]) => {
    const label = str(r.cta).trim() || str(p.ctaText, "Enquire");
    const href = str(p.ctaUrl).trim();
    return label.trim() ? (
      <div className={`mt-4 ${ctaWrap}`}>
        <CtaButton
          block={block}
          id={sub(r.id, "cta")}
          prefix="cta"
          label={label}
          href={href}
          target={str(p.ctaTarget)}
          onClick={() => scrollToAnchor(str(p.ctaAnchor, "enquire"))}
          icon={null}
          className={`${align === "full" ? "w-full" : ""} px-4 py-2.5 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim`}
        />
      </div>
    ) : null;
  };

  if (block.variant === "listings") {
    return (
      <SectionShell id={str(p.anchor, "listings")}>
        <El block={block} id={part(block, "headingRow")} className="max-w-6xl mx-auto mb-8">
          <El block={block} id={part(block, "title")} as="h2" className="font-display text-3xl @md:text-4xl font-medium tracking-tight">
            {str(p.title, "New Properties")}
          </El>
          {str(p.subtitle) ? (
            <El block={block} id={part(block, "subtitle")} as="p" className="text-text-2 text-sm mt-2">
              {str(p.subtitle)}
            </El>
          ) : null}
        </El>
        <div className="grid @md:grid-cols-2 gap-5 @md:gap-6 max-w-6xl mx-auto">
          {rows.map((r) => (
            <El
              key={r.id}
              block={block}
              id={r.id}
              as="article"
              className="rounded-[22px] border border-border-default bg-bg-1 overflow-hidden hover:border-border-hover transition-colors group"
            >
              <div className="aspect-[16/10] bg-bg-3 relative overflow-hidden">
                {r.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt={r.config} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
                ) : null}
                {r.type ? (
                  <El block={block} id={sub(r.id, "type")} as="span" className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-bg-1/95 text-[11px] font-semibold uppercase tracking-wide text-text-0">
                    {r.type}
                  </El>
                ) : null}
              </div>
              <div className="p-5 @md:p-6">
                <El block={block} id={sub(r.id, "title")} as="h3" className="font-display text-xl @md:text-2xl font-medium leading-snug mb-2">
                  {r.config}
                </El>
                {r.description ? (
                  <El block={block} id={sub(r.id, "description")} as="p" className="text-text-2 text-sm leading-relaxed line-clamp-3 mb-4">
                    {r.description}
                  </El>
                ) : null}
                <div className="flex flex-wrap gap-2 text-[12px] text-text-2">
                  {r.area ? <El block={block} id={sub(r.id, "area")} as="span" className="px-2.5 py-1 rounded-full bg-bg-2">{r.area}</El> : null}
                  {r.meta ? <El block={block} id={sub(r.id, "meta")} as="span" className="px-2.5 py-1 rounded-full bg-bg-2">{r.meta}</El> : null}
                  {r.price && !r.meta ? <El block={block} id={sub(r.id, "price")} as="span" className="px-2.5 py-1 rounded-full bg-bg-2">{r.price}</El> : null}
                </div>
              </div>
            </El>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (block.variant === "table") {
    return (
      <SectionShell id={str(p.anchor, "units")}>
        <Title block={block} title={str(p.title, "Property Types")} subtitle={str(p.subtitle)} />
        <div className="overflow-x-auto max-w-3xl mx-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-3 border-b border-border-default">
                <th className="py-2 pr-4">Configuration</th>
                <th className="py-2 pr-4">Carpet area</th>
                <th className="py-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <El key={r.id} block={block} id={r.id} as="tr" className="border-b border-border-subtle">
                  <El block={block} id={sub(r.id, "title")} as="td" className="py-3 pr-4 font-medium">{r.config}</El>
                  <El block={block} id={sub(r.id, "area")} as="td" className="py-3 pr-4 text-text-2">{r.area}</El>
                  <El block={block} id={sub(r.id, "price")} as="td" className="py-3">{r.price}</El>
                </El>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "units")}>
      <Title block={block} title={str(p.title, "Property Types")} subtitle={str(p.subtitle)} />
      <div className="grid @md:grid-cols-2 @2xl:grid-cols-3 gap-5 max-w-6xl mx-auto">
        {rows.map((r) => (
          <El
            key={r.id}
            block={block}
            id={r.id}
            className="rounded-2xl border border-border-default bg-bg-1 overflow-hidden hover:-translate-y-0.5 hover:border-border-hover transition-all"
          >
            <div className="aspect-[16/10] bg-bg-3">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt={r.config} className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div className="p-5">
              {r.type ? (
                <El block={block} id={sub(r.id, "type")} className="text-[11px] uppercase tracking-wider text-green font-semibold mb-1">
                  {r.type}
                </El>
              ) : null}
              <El block={block} id={sub(r.id, "title")} className="font-semibold text-lg">{r.config}</El>
              {r.area ? <El block={block} id={sub(r.id, "area")} className="text-text-2 text-sm mt-1">{r.area}</El> : null}
              {r.price ? <El block={block} id={sub(r.id, "price")} className="text-green font-semibold mt-2">{r.price}</El> : null}
              {cardCta(r)}
            </div>
          </El>
        ))}
      </div>
    </SectionShell>
  );
}

export function RePricingBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  type PriceCard = { _id?: string; name: string; price: string; meta?: string; description?: string; cta?: string; url?: string; priceColor?: string };
  const cards = items<PriceCard>(p.items).map((c, i) => ({ ...c, id: itemPart("items", { _id: c._id || `idx_${i}` }) }));
  const variant = block.variant || (cards.length ? "cards" : "simple");
  const startingPrice = str(p.startingPrice).trim();
  // "Starting from" is an editable field; clearing it hides the label.
  const startingLabel = typeof p.startingLabel === "string" ? p.startingLabel.trim() : "Starting from";
  // The section price colour is for the starting price only. Card prices use
  // their own colour, or the "Card price color" shared by all cards.
  const cardPriceColor = (c: PriceCard) => str(c.priceColor) || str(p.cardPriceColor) || undefined;

  const label = (className: string) =>
    startingLabel ? (
      <El block={block} id={part(block, "startingLabel")} className={className}>
        {startingLabel}
      </El>
    ) : null;
  const startingHeadline = startingPrice ? (
    <div className="text-center mb-10">
      {label("text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-2")}
      <El block={block} id={part(block, "startingPrice")} className="font-display text-4xl @md:text-5xl font-semibold" style={{ color: str(p.priceColor) || undefined }}>
        {startingPrice}
      </El>
    </div>
  ) : null;
  const disclaimer = (className: string) =>
    str(p.disclaimer) ? (
      <El block={block} id={part(block, "disclaimer")} as="p" className={className}>
        {str(p.disclaimer)}
      </El>
    ) : null;
  // The section's own button. Each card has a separate button and text.
  const sectionCta = (fallback: string, className: string) => (
    <CtaButton
      block={block}
      id={part(block, "cta")}
      prefix="cta"
      label={str(p.ctaText, fallback)}
      href={str(p.ctaUrl) || `#${str(p.ctaAnchor, "enquire")}`}
      target={str(p.ctaTarget)}
      icon={null}
      className={className}
    />
  );

  if (variant === "comparison") {
    return (
      <SectionShell id={str(p.anchor, "pricing")}>
        <Title block={block} title={str(p.title, "Compare Plans")} subtitle={str(p.subtitle)} />
        {startingHeadline}
        {cards.length ? (
          <div className="overflow-x-auto max-w-4xl mx-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-border-default text-left">
                  <th className="py-3 pr-4 text-text-3 font-medium">Unit</th>
                  <th className="py-3 pr-4 text-text-3 font-medium">Price</th>
                  <th className="py-3 text-text-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <El key={c.id} block={block} id={c.id} as="tr" className="border-b border-border-subtle">
                    <El block={block} id={subElementId(c.id, "name")} as="td" className="py-4 pr-4 font-semibold">{c.name}</El>
                    <td className="py-4 pr-4">
                      <El block={block} id={subElementId(c.id, "price")} className="text-green font-semibold" style={{ color: cardPriceColor(c) }}>
                        {c.price}
                      </El>
                    </td>
                    <td className="py-4 text-text-2">
                      <El block={block} id={subElementId(c.id, "meta")} as="span">{c.meta || (str(c.description).trim() ? "" : "—")}</El>
                      {str(c.description).trim() ? (
                        <El block={block} id={subElementId(c.id, "description")} as="span" className="block text-xs text-text-3 mt-1 whitespace-pre-line">
                          {str(c.description).trim()}
                        </El>
                      ) : null}
                    </td>
                  </El>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {str(p.ctaText).trim() ? <div className="mt-8 flex justify-center">{sectionCta("", "px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim")}</div> : null}
        {disclaimer("text-center text-text-3 text-xs mt-6")}
      </SectionShell>
    );
  }

  if (variant === "banner") {
    const price = startingPrice || cards[0]?.price || "";
    return (
      <SectionShell id={str(p.anchor, "pricing")} className="bg-bg-2">
        <div className="max-w-4xl mx-auto rounded-3xl border border-border-default bg-gradient-to-br from-bg-1 to-green/5 px-8 @md:px-12 py-12 text-center">
          {label("text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-3")}
          {price ? (
            <El block={block} id={part(block, "startingPrice")} as="h2" className="font-display text-4xl @md:text-5xl font-semibold mb-3" style={{ color: str(p.priceColor) || undefined }}>
              {price}
            </El>
          ) : null}
          {str(p.title) ? (
            <El block={block} id={part(block, "title")} as="p" className="font-semibold text-text-0 mb-1">
              {str(p.title)}
            </El>
          ) : null}
          {str(p.subtitle) ? (
            <El block={block} id={part(block, "subtitle")} as="p" className="text-text-2 text-sm mb-8 max-w-lg mx-auto">
              {str(p.subtitle)}
            </El>
          ) : null}
          {sectionCta("Enquire Now", "px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim")}
          {disclaimer("text-text-3 text-xs mt-6")}
        </div>
      </SectionShell>
    );
  }

  if (variant === "cards" || cards.length) {
    return (
      <SectionShell id={str(p.anchor, "pricing")}>
        <Title block={block} title={str(p.title, "Pricing")} subtitle={str(p.subtitle)} />
        {startingHeadline}
        {cards.length ? (
          <div className="grid @md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {cards.map((c) => (
              <El key={c.id} block={block} id={c.id} className="rounded-2xl border border-border-default bg-bg-2 p-6 text-center hover:border-green/40 transition-all">
                <El block={block} id={subElementId(c.id, "name")} className="text-sm text-text-2 mb-2">{c.name}</El>
                <El
                  block={block}
                  id={subElementId(c.id, "price")}
                  className="font-display text-3xl font-semibold text-green mb-2"
                  style={{ color: cardPriceColor(c) }}
                >
                  {c.price}
                </El>
                {c.meta ? <El block={block} id={subElementId(c.id, "meta")} as="p" className="text-text-3 text-xs mb-5">{c.meta}</El> : null}
                {str(c.description).trim() ? (
                  <El block={block} id={subElementId(c.id, "description")} as="p" className="text-text-2 text-sm leading-relaxed mb-5 whitespace-pre-line">
                    {str(c.description).trim()}
                  </El>
                ) : null}
                <CtaButton
                  block={block}
                  id={subElementId(c.id, "cta")}
                  prefix="cardCta"
                  label={typeof c.cta === "string" ? c.cta : "Enquire"}
                  href={str(c.url) || "#enquire"}
                  icon={null}
                  className="px-4 py-2 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim"
                />
              </El>
            ))}
          </div>
        ) : null}
        {str(p.ctaText).trim() ? <div className="mt-8 flex justify-center">{sectionCta("", "px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim")}</div> : null}
        {disclaimer("text-center text-text-3 text-xs mt-6")}
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "pricing")}>
      <Title block={block} title={str(p.title, "Pricing")} subtitle={str(p.subtitle)} />
      <div className="text-center">
        {startingPrice ? (
          <>
            {label("text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-2")}
            <El block={block} id={part(block, "startingPrice")} className="font-display text-4xl font-bold" style={{ color: str(p.priceColor) || undefined }}>
              {startingPrice}
            </El>
          </>
        ) : null}
        {disclaimer("text-text-3 text-xs mt-2")}
        {str(p.ctaText).trim() ? <div className="mt-6 flex justify-center">{sectionCta("", "px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim")}</div> : null}
      </div>
    </SectionShell>
  );
}

/**
 * Turn whatever the user pasted into the "Google Maps link" field into a URL an
 * iframe can load. Google refuses to frame its normal share/place pages, so
 * they are rewritten to the embed form. Returns a `problem` instead when the
 * input cannot be embedded at all (short links need a server-side redirect).
 */
export function resolveMapEmbed(raw: string): { src: string; problem?: string } {
  let value = raw.trim();
  if (!value) return { src: "" };

  // The "Embed a map" snippet: <iframe src="https://www.google.com/maps/embed?pb=...">
  const iframeSrc = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(value)?.[1];
  if (iframeSrc) value = iframeSrc.replace(/&amp;/g, "&");

  if (/^(data:|blob:)/i.test(value)) return { src: value };

  const embedFor = (q: string, zoom = "15") =>
    `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${encodeURIComponent(zoom)}&output=embed`;

  // Bare coordinates, e.g. "12.9716,77.5946".
  if (/^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(value)) return { src: embedFor(value.replace(/\s+/g, "")) };

  // Plain text (an address or place name).
  if (!/^https?:\/\//i.test(value)) return { src: embedFor(value) };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { src: "", problem: "This doesn't look like a valid Google Maps link." };
  }

  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl" || (host === "goo.gl" && url.pathname.startsWith("/maps"))) {
    return {
      src: "",
      problem:
        "Short map links (maps.app.goo.gl) can't be embedded. Open the link, then copy the full address-bar URL — or use Share → Embed a map and paste that code.",
    };
  }

  // Already an embed URL — leave it alone.
  if (/\/maps\/embed/i.test(url.pathname) || url.searchParams.get("output") === "embed") return { src: value };

  const isGoogleMaps = /(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.startsWith("/maps");
  const fromQuery =
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    url.searchParams.get("destination") ||
    url.searchParams.get("daddr") ||
    url.searchParams.get("address") ||
    "";
  if (fromQuery) return { src: embedFor(fromQuery, url.searchParams.get("z") || url.searchParams.get("zoom") || "15") };

  if (isGoogleMaps) {
    const path = decodeURIComponent(url.pathname);
    // Coordinates in the path: /maps/place/Name/@12.97,77.59,15z or /maps/@12.97,77.59,15z
    const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/.exec(path);
    const place = /\/maps\/(?:place|search)\/([^/@]+)/.exec(path)?.[1]?.replace(/\+/g, " ");
    const dir = path.startsWith("/maps/dir/") ? path.split("/").filter(Boolean).pop()?.replace(/\+/g, " ") : undefined;
    const zoom = at?.[3] ? String(Math.round(Number(at[3]))) : "15";
    if (at) return { src: embedFor(`${at[1]},${at[2]}`, zoom) };
    if (place) return { src: embedFor(place, zoom) };
    if (dir && !dir.startsWith("@")) return { src: embedFor(dir, zoom) };
  }

  return {
    src: "",
    problem: "This link can't be shown as a map. Paste a Google Maps place link, the Embed a map code, an address, or coordinates.",
  };
}

function MapFrame({ src, title }: { src: string; title: string }) {
  const { src: embed, problem } = resolveMapEmbed(src);
  if (!embed) {
    return (
      <div className="w-full h-full min-h-[260px] flex items-center justify-center text-text-3 text-sm px-4 text-center">
        {problem || "Add a Google Maps link — a place link, the Embed a map code, an address or coordinates all work."}
      </div>
    );
  }
  return (
    <iframe
      title={title}
      src={embed}
      className="w-full h-full border-0"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

export function OffersBlock({ block }: { block: BlockConfig }) {
  const offers = items<{ title: string; description: string }>(block.props.items);
  return (
    <SectionShell className="bg-green/5">
      <Title block={block} title={str(block.props.title, "Limited Offers")} />
      <div className="grid @md:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {offers.map((o, i) => (
          <div key={i} className="rounded-xl border border-green/30 bg-bg-1 p-5">
            <h3 className="font-semibold text-green mb-1">{o.title}</h3>
            <p className="text-sm text-text-2">{o.description}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/**
 * One "nearby place" row. Accepts the field names AI-generated and older
 * pages use (place/time, name/distance, text) as well as title/meta.
 */
function locationItem(n: Record<string, unknown>) {
  return {
    title: firstText(n.title, n.place, n.name, n.label),
    meta: firstText(n.meta, n.time, n.distance, n.duration, n.text, n.description),
  };
}

export function LocationBlock({ block }: { block: BlockConfig }) {
  const nearby = items<Record<string, unknown>>(block.props.items);
  const embed = str(block.props.embedUrl).trim();
  const variant = block.variant || "split-map";
  const p = block.props;
  const image = str(p.image);
  const device = useDevice();
  // A dark section background (set in Style) needs light text everywhere in
  // the widget; per-element styles from the inspector still take priority.
  const onDark = isDarkColor(resolveBlockStyleForDevice(block.style, device)?.backgroundColor);
  const tone = onDark
    ? {
        text: "text-white",
        muted: "text-white/70",
        row: "border-white/15 bg-white/[0.06]",
        tile: "border-white/15 bg-white/[0.06]",
        rule: "border-white/15",
      }
    : {
        text: "",
        muted: "text-text-3",
        row: "border-border-default bg-bg-2",
        tile: "border-border-default bg-bg-1",
        rule: "border-border-default",
      };

  // Every template shows the same fields: subheading, address, image, map,
  // nearby places and the CTA — so no field silently does nothing.
  const heading = (fallback: string) => (
    <Title block={block} title={str(p.title, fallback)} subtitle={str(p.subtitle)} onDark={onDark} />
  );
  const address = (className = "") =>
    str(p.address) ? (
      <El block={block} id={part(block, "address")} as="p" className={`flex items-start gap-2 text-sm ${onDark ? "text-white/90" : "text-text-1"} ${className}`}>
        <MapPin size={16} className="text-green mt-0.5 shrink-0" />
        <span>{str(p.address)}</span>
      </El>
    ) : null;
  const media = (className: string) =>
    image ? (
      <El block={block} id={part(block, "media")} className={`rounded-2xl overflow-hidden bg-bg-2 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={str(p.title)} className="w-full h-full object-cover" />
      </El>
    ) : null;
  const map = (className: string) => (
    <El block={block} id={part(block, "map")} className={`rounded-2xl overflow-hidden border border-border-default bg-bg-2 ${className}`}>
      <MapFrame src={embed} title={str(p.title, "Google Maps")} />
    </El>
  );
  // The section's buttons: the main CTA and an optional second button, side by
  // side. Each has its own text, link and colours ("CTA Button" / "Second
  // Button" in the inspector); either can be hidden by clearing its text.
  const ctaText = str(p.ctaText).trim();
  const secondText = str(p.secondaryCtaText).trim();
  const cta = (className = "") =>
    ctaText || secondText ? (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        {ctaText ? (
          <CtaButton
            block={block}
            id={part(block, "cta")}
            prefix="cta"
            label={ctaText}
            href={str(p.ctaUrl) || (embed.startsWith("http") ? embed : "#enquire")}
            target={str(p.ctaTarget) || (str(p.ctaUrl) ? "" : embed.startsWith("http") ? "_blank" : "")}
            className="px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim"
          />
        ) : null}
        {secondText ? (
          <CtaButton
            block={block}
            id={part(block, "secondaryCta")}
            prefix="secondaryCta"
            label={secondText}
            href={str(p.secondaryCtaUrl) || "#enquire"}
            target={str(p.secondaryCtaTarget)}
            icon={null}
            className="px-6 py-3 rounded-lg border border-border-default bg-bg-1 text-text-0 text-sm font-semibold hover:bg-bg-2"
          />
        ) : null}
      </div>
    ) : null;
  // Bullet before each nearby place: the location pin by default, or the
  // style chosen in "Bullet" (arrow, check, dot, number, none).
  const bullet = isBulletStyle(p.bulletStyle) ? p.bulletStyle : "pin";
  const rows = (rowClass: string) =>
    nearby.map((n, i) => {
      const id = itemPart("items", n);
      const row = locationItem(n);
      return (
        <El key={id} block={block} id={id} className={rowClass}>
          <El block={block} id={subElementId(id, "title")} as="div" className={`flex items-center gap-2 text-sm font-medium min-w-0 ${tone.text}`}>
            <Bullet style={bullet} index={i} />
            <span className="min-w-0">{row.title}</span>
          </El>
          <El block={block} id={subElementId(id, "meta")} as="div" className={`${tone.muted} text-sm shrink-0 text-right`}>
            {row.meta}
          </El>
        </El>
      );
    });

  if (variant === "map-only") {
    return (
      <SectionShell id={str(p.anchor, "location")} className="pt-8">
        {heading("Location")}
        {address("justify-center mb-6 -mt-4")}
        {embed || !image ? map("aspect-[16/8] max-w-6xl mx-auto") : media("aspect-[16/8] max-w-6xl mx-auto")}
        {cta("mt-8 flex justify-center")}
      </SectionShell>
    );
  }

  if (variant === "list") {
    return (
      <SectionShell id={str(p.anchor, "location")}>
        {heading("Location & Connectivity")}
        <div className="max-w-2xl mx-auto">
          {address("mb-5")}
          {media("aspect-[16/9] mb-6")}
          <div className="space-y-3">{rows(`flex items-center justify-between gap-4 rounded-xl border ${tone.row} px-4 py-3.5`)}</div>
          {cta("mt-8 flex justify-center")}
        </div>
      </SectionShell>
    );
  }

  if (variant === "cards") {
    return (
      <SectionShell id={str(p.anchor, "location")} className="bg-bg-2">
        {heading("Location Advantages")}
        {address("justify-center mb-8 -mt-4")}
        <div className="grid @md:grid-cols-2 @2xl:grid-cols-3 gap-4 max-w-5xl mx-auto mb-8">
          {nearby.map((n, i) => {
            const id = itemPart("items", n);
            const row = locationItem(n);
            return (
              <El key={id} block={block} id={id} className={`rounded-2xl border ${tone.tile} p-5 text-center`}>
                {bullet !== "none" ? (
                  <span className="mb-3 flex justify-center">
                    <Bullet style={bullet} index={i} size={18} />
                  </span>
                ) : null}
                <El block={block} id={subElementId(id, "title")} as="div" className={`font-semibold mb-1 ${tone.text}`}>
                  {row.title}
                </El>
                <El block={block} id={subElementId(id, "meta")} as="div" className={`${tone.muted} text-sm`}>
                  {row.meta}
                </El>
              </El>
            );
          })}
        </div>
        {embed ? map("aspect-[16/7] max-w-5xl mx-auto") : media("aspect-[16/7] max-w-5xl mx-auto")}
        {cta("mt-8 flex justify-center")}
      </SectionShell>
    );
  }

  if (variant === "editorial") {
    return (
      <SectionShell id={str(p.anchor, "location")} className="bg-bg-0">
        <El block={block} id={part(block, "headingRow")} className="max-w-6xl mx-auto mb-10">
          {str(p.subtitle) ? (
            <El block={block} id={part(block, "subtitle")} as="p" className="text-[11px] uppercase tracking-[0.28em] text-green font-medium mb-3">
              {str(p.subtitle)}
            </El>
          ) : null}
          <El block={block} id={part(block, "title")} as="h2" className={`font-display text-3xl @md:text-5xl font-medium tracking-tight max-w-2xl ${tone.text}`}>
            {str(p.title, "Quietly Central.")}
          </El>
          {address("mt-4 max-w-2xl")}
        </El>
        <div className="max-w-6xl mx-auto grid @lg:grid-cols-[0.95fr_1.05fr] gap-8 @lg:gap-12 items-start">
          <El block={block} id={part(block, "media")} className="rounded-[24px] overflow-hidden aspect-[3/4] bg-bg-2">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="w-full h-full object-cover" />
            ) : embed ? (
              <MapFrame src={embed} title={str(p.title, "Google Maps")} />
            ) : (
              <div className="w-full h-full min-h-[360px] bg-bg-3" />
            )}
          </El>
          <div>
            <div className={`grid grid-cols-1 @sm:grid-cols-2 border-t border-l ${tone.rule}`}>
              {nearby.map((n) => {
                const id = itemPart("items", n);
                const row = locationItem(n);
                return (
                  <El key={id} block={block} id={id} className={`border-r border-b ${tone.rule} px-5 py-6`}>
                    <El block={block} id={subElementId(id, "title")} as="div" className={`font-medium mb-2 ${onDark ? "text-white" : "text-text-0"}`}>
                      {row.title}
                    </El>
                    <El block={block} id={subElementId(id, "meta")} as="div" className={`font-display text-sm tracking-wide ${onDark ? "text-white/70" : "text-text-2"}`}>
                      {row.meta}
                    </El>
                  </El>
                );
              })}
            </div>
            {image && embed ? map("aspect-[16/10] mt-6") : null}
            {cta("mt-8")}
          </div>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "location")}>
      {heading("Location & Connectivity")}
      <div className="grid @lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-start">
        {embed || !image ? map("aspect-[4/3]") : media("aspect-[4/3]")}
        <div className="min-w-0">
          {address("mb-5")}
          {embed ? media("aspect-[16/9] mb-5") : null}
          <div className="space-y-3">{rows(`flex items-center justify-between gap-4 rounded-xl border ${tone.row} px-4 py-3`)}</div>
          {cta("mt-6")}
        </div>
      </div>
    </SectionShell>
  );
}

export function GoogleMapsBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  if (p.showMap === false) return null;
  const src = str(p.embedUrl);
  const height = typeof p.mapHeight === "number" && p.mapHeight > 0 ? p.mapHeight : 360;

  return (
    <SectionShell id={str(p.anchor, "map")} className="pt-0">
      {str(p.title) || str(p.subtitle) ? (
        <El block={block} id={part(block, "headingRow")} className="max-w-6xl mx-auto mb-5">
          {str(p.title) ? (
            <El block={block} id={part(block, "title")} as="h2" className="font-display text-2xl @md:text-3xl font-semibold tracking-tight">
              {str(p.title)}
            </El>
          ) : null}
          {str(p.subtitle) ? (
            <El block={block} id={part(block, "subtitle")} as="p" className="text-text-2 text-sm mt-2">
              {str(p.subtitle)}
            </El>
          ) : null}
        </El>
      ) : null}
      <El block={block} id={part(block, "map")} className="rounded-xl overflow-hidden border border-border-default bg-bg-2 max-w-6xl mx-auto" style={{ height }}>
        <MapFrame src={src} title={str(p.title, "Google Maps")} />
      </El>
    </SectionShell>
  );
}

export function ConstructionStatusBlock({ block }: { block: BlockConfig }) {
  const stages = items<{ label: string; percent?: string; year?: string; description?: string; title?: string }>(
    block.props.items,
  );
  const p = block.props;

  if (block.variant === "timeline") {
    return (
      <SectionShell id={str(p.anchor, "progress")} className="bg-bg-2">
        <div className="max-w-5xl mx-auto">
          {str(p.subtitle) ? (
            <p className="text-[11px] uppercase tracking-[0.28em] text-text-2 font-medium mb-3 text-center">
              {str(p.subtitle)}
            </p>
          ) : null}
          <h2 className="font-display text-3xl @md:text-4xl font-medium text-center mb-12">
            {str(p.title, "Built Slowly. On Purpose.")}
          </h2>
          <div className="relative grid grid-cols-2 @md:grid-cols-4 gap-8">
            <div className="hidden @md:block absolute top-3 left-[12%] right-[12%] h-px bg-border-default" />
            {stages.map((s, i) => (
              <div key={i} className="relative text-center">
                <div className="mx-auto w-3 h-3 rounded-full bg-green border-4 border-bg-1 shadow mb-5 relative z-10" />
                <div className="font-display text-2xl text-text-0 mb-2">{s.year || s.percent || ""}</div>
                <div className="text-sm font-semibold mb-1">{s.title || s.label}</div>
                {s.description ? <p className="text-text-2 text-xs leading-relaxed">{s.description}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "progress")}>
      <Title block={block} title={str(p.title, "Construction Status")} />
      <div className="max-w-xl mx-auto space-y-4">
        {stages.map((s, i) => (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span>{s.label || s.title}</span>
              <span className="text-text-3">{s.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-bg-3 overflow-hidden">
              <div className="h-full bg-green" style={{ width: `${Number(s.percent) || 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export function DeveloperBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const listKey = Array.isArray(p.stats) ? "stats" : "items";
  // Stats keep their stable `_id` so each one (and its value / label) can be
  // selected and styled from the Element tab, like other list widgets.
  const stats = items<Record<string, unknown>>(p.stats || p.items)
    .map((s, i) => ({
      id: itemPart(listKey, { _id: str(s._id) || `idx_${i}` }),
      value: str(s.value ?? s.stat ?? s.title ?? "").trim(),
      label: str(s.label ?? s.description ?? s.subtitle ?? "").trim(),
    }))
    .filter((s) => s.value || s.label);
  const variant = block.variant || "default";
  const logo = str(p.logo).trim();
  const image = str(p.image).trim();
  const name = str(p.name).trim();
  const title = str(p.title, "About the Developer");
  const body = str(p.body).trim();
  const anchor = str(p.anchor, "builder");

  const nameEl = (className: string, as: "h2" | "h3" = "h2") =>
    name ? (
      <El block={block} id={part(block, "name")} as={as} className={className}>
        {name}
      </El>
    ) : null;
  const bodyEl = (className: string) =>
    body ? (
      <El block={block} id={part(block, "body")} as="p" className={`whitespace-pre-line ${className}`}>
        {body}
      </El>
    ) : null;
  const logoEl = (className: string) =>
    logo ? (
      <El block={block} id={part(block, "logo")} className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={`${name || "Developer"} logo`} className="max-h-full max-w-full h-12 w-auto object-contain" />
      </El>
    ) : null;
  const statsGrid = (gridClass: string, cardClass: string, valueClass: string, labelClass: string) =>
    stats.length > 0 ? (
      <div className={gridClass}>
        {stats.map((s) => (
          <El key={s.id} block={block} id={s.id} className={cardClass}>
            {s.value ? <El block={block} id={subElementId(s.id, "value")} className={valueClass}>{s.value}</El> : null}
            {s.label ? <El block={block} id={subElementId(s.id, "label")} className={labelClass}>{s.label}</El> : null}
          </El>
        ))}
      </div>
    ) : null;

  if (variant === "split") {
    return (
      <SectionShell id={anchor} className="bg-bg-2">
        <div className={`grid ${image || logo ? "@lg:grid-cols-2" : ""} gap-10 max-w-6xl mx-auto items-center`}>
          {image || logo ? (
            <div>
              {image ? (
                <El block={block} id={part(block, "image")} className="rounded-2xl overflow-hidden border border-border-default aspect-[4/3] bg-bg-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={name || "Developer"} className="w-full h-full object-cover" />
                </El>
              ) : null}
              {logoEl(`${image ? "mt-4 " : ""}flex items-center justify-center rounded-xl border border-border-default bg-bg-1 px-6 py-4`)}
            </div>
          ) : null}
          <div>
            <El block={block} id={part(block, "title")} as="p" className="text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-3">
              {title}
            </El>
            {nameEl("font-display text-3xl font-semibold mb-4")}
            {bodyEl("text-text-1 leading-relaxed")}
            {statsGrid(
              "grid grid-cols-2 @md:grid-cols-3 gap-3 mt-6 pt-6 border-t border-border-default/60",
              "rounded-xl border border-border-default/80 bg-bg-1/80 p-3.5 text-center shadow-sm",
              "font-display text-xl @md:text-2xl font-bold text-green mb-0.5",
              "text-[10.5px] uppercase tracking-wider text-text-3 font-medium",
            )}
          </div>
        </div>
      </SectionShell>
    );
  }

  if (variant === "stats") {
    // Only the stats the user entered: never placeholder numbers on a live page.
    return (
      <SectionShell id={anchor}>
        <Title block={block} title={title} subtitle={name} />
        {bodyEl("max-w-2xl mx-auto text-text-1 text-center leading-relaxed mb-10")}
        {statsGrid(
          "grid grid-cols-2 @md:grid-cols-4 gap-4 max-w-4xl mx-auto",
          "rounded-2xl border border-border-default bg-bg-2 p-5 text-center shadow-sm",
          "font-display text-2xl font-semibold text-green mb-1",
          "text-[11px] uppercase tracking-wider text-text-3",
        )}
      </SectionShell>
    );
  }

  if (variant === "band") {
    return (
      <section id={anchor} className="px-6 @md:px-10 py-12 bg-green/10 border-y border-green/20">
        <div className="max-w-5xl mx-auto flex flex-col @md:flex-row @md:items-center gap-6 @md:gap-10">
          {logo || image ? (
            <El block={block} id={part(block, logo ? "logo" : "image")} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo || image} alt={name || "Developer"} className="h-14 w-auto object-contain" />
            </El>
          ) : null}
          <div className="flex-1">
            {name ? (
              nameEl("font-semibold text-lg", "h3")
            ) : (
              <El block={block} id={part(block, "title")} as="h3" className="font-semibold text-lg">
                {title || "Developer"}
              </El>
            )}
            {bodyEl("text-text-2 text-sm mt-1 line-clamp-2")}
            {statsGrid(
              "flex flex-wrap gap-6 mt-4 pt-3 border-t border-green/20",
              "",
              "font-display text-lg font-bold text-green",
              "text-[10px] uppercase tracking-wider text-text-3",
            )}
          </div>
        </div>
      </section>
    );
  }

  const hasMedia = Boolean(logo || image);
  return (
    <SectionShell id={anchor} className="bg-bg-2">
      {/* Without an image or logo the text takes the full width instead of
          leaving an empty column. */}
      <div className={`grid ${hasMedia ? "@lg:grid-cols-2 max-w-6xl" : "max-w-3xl"} gap-10 mx-auto items-center`}>
        {hasMedia ? (
          <div>
            {image ? (
              <El block={block} id={part(block, "image")} className="rounded-2xl border border-border-default bg-bg-1 aspect-[4/3] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={name || "Developer"} className="w-full h-full object-cover" />
              </El>
            ) : null}
            {logoEl(
              image
                ? "mt-4 flex items-center justify-center rounded-xl border border-border-default bg-bg-1 px-6 py-4"
                : "rounded-2xl border border-border-default bg-bg-1 aspect-[4/3] flex items-center justify-center p-6",
            )}
          </div>
        ) : null}
        <div>
          <Title block={block} title={title} subtitle={name} align={hasMedia ? "left" : "center"} />
          {bodyEl(`text-text-1 leading-relaxed ${hasMedia ? "" : "text-center"}`)}
          {statsGrid(
            "grid grid-cols-2 @md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-border-default/60",
            "rounded-xl border border-border-default bg-bg-1 p-4 text-center shadow-sm",
            "font-display text-xl @md:text-2xl font-bold text-green mb-1",
            "text-[11px] uppercase tracking-wider text-text-3",
          )}
        </div>
      </div>
    </SectionShell>
  );
}

export function LeadFormBlock({ block }: { block: BlockConfig }) {
  const runtime = useOpenPageRuntime();
  const formId = str(block.props.formId);
  const forms = resolveRuntimeForms(runtime.forms);
  const form = formId ? findFormById(formId, forms) : forms[0];
  const variant = block.variant || "card";

  // Consent / disclaimer text shown under the form (the "Consent" field).
  const consent = str(block.props.consent).trim();
  // Paragraph shown directly under the title (the "Description" field).
  const description = str(block.props.description).trim();
  const descriptionEl = (className: string) =>
    description ? (
      <El block={block} id={part(block, "description")} as="p" className={className}>
        {description}
      </El>
    ) : null;
  const formEl = (
    <>
      {form ? (
        <DynamicLeadForm
          form={form}
          live={runtime.live}
          pageId={runtime.pageId}
          place="lead-form-block"
          projectName={runtime.projectName}
          projectId={runtime.projectId}
          unitId={runtime.unitId}
        />
      ) : (
        <p className="text-sm text-text-3 text-center">Select a form in Properties.</p>
      )}
      {consent ? (
        <El block={block} id={part(block, "consent")} as="p" className="mt-4 text-[11px] leading-relaxed text-text-3 whitespace-pre-line">
          {consent}
        </El>
      ) : null}
    </>
  );
  const heading = (fallback: string, className: string) => (
    <El block={block} id={part(block, "title")} as="h2" className={className}>
      {str(block.props.title, fallback)}
    </El>
  );
  const subtitle = (text: string, className: string) =>
    text ? (
      <El block={block} id={part(block, "subtitle")} as="p" className={className}>
        {text}
      </El>
    ) : null;

  if (variant === "split") {
    // Each benefit is a list item, so "Style this item" and per-item
    // visibility work for it like for any other card.
    const benefits = items<unknown>(block.props.benefits)
      .map((b, i) => ({
        id: itemPart("benefits", {
          _id: typeof b === "object" && b && typeof (b as { _id?: unknown })._id === "string" ? (b as { _id: string })._id : `idx_${i}`,
        }),
        text: typeof b === "string" ? b : String((b as { title?: string; text?: string })?.title || (b as { text?: string })?.text || ""),
        // The list editor gives each benefit a Description field; show it.
        description: typeof b === "object" && b ? str((b as { description?: unknown }).description).trim() : "",
      }))
      .filter((b) => b.text || b.description);
    return (
      <SectionShell id={str(block.props.anchor, "enquire")} className="bg-bg-2">
        <div className="grid @lg:grid-cols-2 gap-10 max-w-5xl mx-auto items-center">
          <div>
            {heading("Enquire now", "font-display text-3xl @md:text-4xl font-semibold mb-3")}
            {descriptionEl("text-text-1 text-[15px] leading-relaxed mb-4 whitespace-pre-line")}
            {subtitle(str(block.props.subtitle, "Share your details and our team will get in touch."), "text-text-2 text-sm leading-relaxed mb-4")}
            {benefits.length ? (
              <ul className="space-y-2 mb-6">
                {benefits.map((b) => (
                  <El key={b.id} block={block} id={b.id} as="li" className="flex gap-2 text-sm items-start">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-green/15 text-green flex items-center justify-center shrink-0"><Check size={12} /></span>
                    <div className="min-w-0">
                      {b.text ? <El block={block} id={subElementId(b.id, "title")} className="font-medium text-text-0">{b.text}</El> : null}
                      {b.description ? (
                        <El block={block} id={subElementId(b.id, "description")} as="p" className="text-text-2 text-[13px] leading-relaxed mt-0.5 whitespace-pre-line">
                          {b.description}
                        </El>
                      ) : null}
                    </div>
                  </El>
                ))}
              </ul>
            ) : null}
            {str(block.props.image) ? (
              <El block={block} id={part(block, "media")} className="rounded-2xl overflow-hidden border border-border-default">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={str(block.props.image)} alt="" className="aspect-[4/3] object-cover w-full" />
              </El>
            ) : null}
          </div>
          <div data-op-panel="" className="rounded-2xl border border-border-default bg-bg-1 p-6 @md:p-8">{formEl}</div>
        </div>
      </SectionShell>
    );
  }

  if (variant === "inline") {
    return (
      <SectionShell id={str(block.props.anchor, "enquire")}>
        <div className="max-w-4xl mx-auto rounded-2xl border border-border-default bg-bg-2 p-6 @md:p-8">
          <div className="flex flex-col @md:flex-row @md:items-end gap-4 @md:gap-8 mb-6">
            <div className="flex-1">
              {heading("Enquire now", "font-display text-2xl font-semibold")}
              {descriptionEl("text-text-1 text-sm leading-relaxed mt-2 whitespace-pre-line")}
              {subtitle(str(block.props.subtitle), "text-text-2 text-sm mt-1")}
            </div>
          </div>
          {formEl}
        </div>
      </SectionShell>
    );
  }

  if (variant === "default") {
    return (
      <SectionShell id={str(block.props.anchor, "enquire")} className="bg-bg-2">
        <Title block={block} title={str(block.props.title, "Get in touch")} description={description} subtitle={str(block.props.subtitle)} />
        <div className="max-w-lg mx-auto">{formEl}</div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(block.props.anchor, "enquire")}>
      <Title block={block} title={str(block.props.title, "Enquire now")} description={description} subtitle={str(block.props.subtitle)} />
      <div data-op-panel="" className="max-w-lg mx-auto rounded-2xl border border-border-default bg-bg-2 p-6 @md:p-8">
        {formEl}
      </div>
    </SectionShell>
  );
}

export function DownloadBrochureBlock({ block }: { block: BlockConfig }) {
  const runtime = useOpenPageRuntime();
  const p = block.props;
  const preview = str(p.image);
  const pdfUrl = str(p.pdfUrl) || runtime.brochureUrl || "";
  const formId = str(p.formId);
  const popupId = str(p.popupId);
  const unlockKey = "brochure:main";
  const unlocked = runtime.isUnlocked(unlockKey);
  const variant = block.variant || "split";

  function openGate() {
    if (unlocked && pdfUrl) {
      if (typeof window !== "undefined") window.open(pdfUrl, "_blank");
      return;
    }
    runtime.openPopup(popupId || undefined, {
      mode: "brochure",
      unlockKey,
      brochureUrl: pdfUrl,
      formId: formId || undefined,
      title: str(p.popupTitle, "Download brochure"),
      description: str(p.popupDescription, "Share your details to receive the project brochure PDF."),
    });
  }

  // Clearing "Button text" removes the button entirely (arrow included).
  const buttonText = str(p.buttonText, "Download PDF");
  const cta = (
    <CtaButton
      block={block}
      id={part(block, "button")}
      prefix="button"
      label={unlocked ? str(p.unlockedButtonText) || buttonText : buttonText}
      onClick={openGate}
      icon={<ArrowRight size={16} />}
      className="px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim"
    />
  );
  const heading = (fallback: string, className: string) => (
    <El block={block} id={part(block, "title")} as="h2" className={className}>
      {str(p.title, fallback)}
    </El>
  );
  const subtitle = (fallback: string, className: string) =>
    str(p.subtitle, fallback) ? (
      <El block={block} id={part(block, "subtitle")} as="p" className={className}>
        {str(p.subtitle, fallback)}
      </El>
    ) : null;

  if (variant === "card") {
    return (
      <SectionShell id={str(p.anchor, "brochure")}>
        <div className="max-w-md mx-auto rounded-3xl border border-border-default bg-bg-2 overflow-hidden text-center">
          <div className="aspect-[4/3] bg-bg-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className={`w-full h-full object-cover ${unlocked ? "" : "blur-[2px]"}`} />
            ) : (
              <div className="h-full min-h-[180px] flex items-center justify-center text-text-3"><Download size={28} /></div>
            )}
          </div>
          <div className="p-8">
            {heading("Download Brochure", "font-display text-2xl font-semibold mb-2")}
            {subtitle("Get the full project brochure as PDF.", "text-text-2 text-sm mb-6")}
            {cta}
          </div>
        </div>
      </SectionShell>
    );
  }

  if (variant === "banner") {
    return (
      <section id={str(p.anchor, "brochure")} className="px-6 @md:px-10 py-10">
        <div className="max-w-5xl mx-auto rounded-2xl border border-border-default bg-gradient-to-r from-bg-2 to-green/10 px-6 @md:px-10 py-8 flex flex-col @md:flex-row @md:items-center gap-6 justify-between">
          <div>
            {heading("Download Brochure", "font-display text-2xl font-semibold mb-1")}
            {subtitle("Share your details to receive the project brochure.", "text-text-2 text-sm")}
          </div>
          {cta}
        </div>
      </section>
    );
  }

  if (variant === "minimal") {
    return (
      <SectionShell id={str(p.anchor, "brochure")}>
        <div className="max-w-xl mx-auto text-center">
          <Download className="mx-auto mb-4 text-green" size={28} />
          {heading("Brochure", "font-display text-2xl font-semibold mb-2")}
          {subtitle("Download the project brochure PDF.", "text-text-2 text-sm mb-6")}
          {cta}
          {!pdfUrl ? <p className="text-xs text-text-3 mt-3">Set a PDF URL in Properties or bind a project with a brochure.</p> : null}
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "brochure")}>
      <div className="max-w-5xl mx-auto grid @lg:grid-cols-2 gap-8 items-center rounded-3xl border border-border-default bg-bg-2 overflow-hidden">
        <div className="aspect-[4/5] @lg:aspect-auto @lg:min-h-[360px] bg-bg-3 relative">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={str(p.title, "Brochure")}
              className={`w-full h-full object-cover ${unlocked ? "" : "blur-[2px]"}`}
            />
          ) : (
            <div className="h-full min-h-[280px] flex items-center justify-center text-text-3">Brochure preview</div>
          )}
        </div>
        <div className="p-8 @md:p-12">
          <Download className="mb-4 text-green" size={28} />
          {heading("Download Brochure", "font-display text-3xl font-semibold mb-3")}
          {subtitle("Share your details to receive the project brochure.", "text-text-2 text-sm leading-relaxed mb-6")}
          {cta}
          {!pdfUrl ? (
            <p className="text-xs text-text-3 mt-3">Set a PDF URL in Properties or bind a project with a brochure.</p>
          ) : null}
        </div>
      </div>
    </SectionShell>
  );
}

export function SiteVisitBlock({ block }: { block: BlockConfig }) {
  const runtime = useOpenPageRuntime();
  const formId = str(block.props.formId);
  const forms = resolveRuntimeForms(runtime.forms);
  const form = formId ? findFormById(formId, forms) : forms[0];
  return (
    <SectionShell id={str(block.props.anchor) || undefined} className="bg-bg-2">
      <Title block={block} title={str(block.props.title, "Book a site visit")} subtitle={str(block.props.subtitle)} />
      <div className="max-w-md mx-auto">
        {form ? (
          <DynamicLeadForm
            form={form}
            live={runtime.live}
            pageId={runtime.pageId}
            place="site-visit"
            projectName={runtime.projectName}
            projectId={runtime.projectId}
            unitId={runtime.unitId}
          />
        ) : (
          <p className="text-sm text-text-3 text-center">Attach a form to this section from Properties.</p>
        )}
      </div>
    </SectionShell>
  );
}

export function CustomSectionBlock({ block }: { block: BlockConfig }) {
  return (
    <SectionShell>
      <Title block={block} title={str(block.props.title, "Custom section")} subtitle={str(block.props.subtitle)} />
      <div className="max-w-3xl mx-auto text-text-1 leading-relaxed whitespace-pre-wrap">{str(block.props.body)}</div>
    </SectionShell>
  );
}

export function VideoEmbedBlock({ block }: { block: BlockConfig }) {
  const url = str(block.props.url);
  return (
    <SectionShell>
      <Title block={block} title={str(block.props.title, "Walkthrough")} />
      <div className="aspect-video rounded-xl overflow-hidden border border-border-default bg-bg-2 flex items-center justify-center">
        {url ? (
          <iframe title="Video" src={url} className="w-full h-full border-0" allow="autoplay; encrypted-media" allowFullScreen />
        ) : (
          <div className="text-text-3 text-sm flex items-center gap-2"><Play size={16} /> Add a YouTube/Vimeo embed URL</div>
        )}
      </div>
    </SectionShell>
  );
}
