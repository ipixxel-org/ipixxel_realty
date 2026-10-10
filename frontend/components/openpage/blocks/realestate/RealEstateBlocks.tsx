"use client";

import type { BlockConfig, ElementId } from "../types";
import { El } from "../El";
import { listElementId, subElementId } from "@/lib/openpage/element-style";
import { ArrowRight, Check, Download, Lock, MapPin, Play } from "lucide-react";
import { useOpenPageRuntime } from "@/components/openpage/runtime/OpenPageRuntime";
import { DynamicLeadForm } from "@/components/openpage/dynamic-lead-form";
import { findFormById, loadFormLibrary } from "@/lib/openpage/forms-store";
import { mergeFormLibraries } from "@/lib/openpage/resolve-form";
import { isMediaSrc } from "@/lib/media";

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

/** True when the inspector flagged this list item as hidden. */
function isHiddenItem(item: unknown): boolean {
  return (item as { hidden?: unknown } | null | undefined)?.hidden === true;
}

/**
 * Section heading. Wrapped in {@link El} so the heading and its subheading are
 * individually selectable and styleable rather than inheriting section styles.
 */
function Title({
  block,
  title,
  subtitle,
  align = "center",
}: {
  block?: BlockConfig;
  title?: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  const content = (
    <>
      {title ? (
        <El
          block={block!}
          id={part(block!, "title")}
          as="h2"
          className="font-display text-3xl @md:text-4xl font-semibold tracking-tight mb-2"
        >
          {title}
        </El>
      ) : null}
      {subtitle ? (
        <El block={block!} id={part(block!, "subtitle")} as="p" className="text-text-2 text-sm leading-relaxed">
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

function HeroCopy({
  p,
  onPrimary,
  onSecondary,
  light,
  centered,
  stats,
}: {
  p: Record<string, unknown>;
  onPrimary: () => void;
  onSecondary: () => void;
  light?: boolean;
  centered?: boolean;
  stats?: Array<{ value: string; label: string }>;
}) {
  const text = light ? "text-white" : "text-text-0";
  const muted = light ? "text-white/80" : "text-text-1";
  return (
    <div className={`${light ? "text-white" : ""} ${centered ? "text-center flex flex-col items-center" : ""}`}>
      {str(p.badge) ? (
        <div
          style={{
            color: (p.badgeColor as string) || (p.tagColor as string) || undefined,
            backgroundColor: (p.badgeBg as string) || (p.tagBg as string) || undefined,
            borderColor: (p.badgeColor as string) || (p.tagColor as string) || undefined,
          }}
          className="inline-flex px-3 py-1 rounded-full bg-green/20 text-green text-[11px] font-semibold tracking-wide uppercase mb-4"
        >
          {str(p.badge)}
        </div>
      ) : null}
      <h1 className={`font-display text-4xl @md:text-6xl font-semibold tracking-tight mb-4 leading-[1.1] ${text}`}>
        {str(p.headline, "Project name")}
      </h1>
      {str(p.location) ? (
        <p className={`flex items-center gap-2 text-sm mb-3 ${muted} ${centered ? "justify-center" : ""}`}>
          <MapPin size={14} /> {str(p.location)}
        </p>
      ) : null}
      {str(p.description) ? <p className={`text-base @md:text-lg leading-relaxed max-w-xl mb-4 ${muted}`}>{str(p.description)}</p> : null}
      {str(p.price) ? <p className="text-xl font-semibold mb-7 text-green">{str(p.price)}</p> : null}
      <div className={`flex flex-wrap gap-3 ${centered ? "justify-center" : ""}`}>
        {str(p.primaryCta) ? (
          <button type="button" onClick={onPrimary} className="px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim transition-all hover:accent-glow-md">
            {str(p.primaryCta)}
          </button>
        ) : null}
        {str(p.secondaryCta) ? (
          <button
            type="button"
            onClick={onSecondary}
            className={`px-6 py-3 rounded-lg border text-sm font-medium transition-all ${
              light ? "border-white/40 bg-white/10 hover:bg-white/20" : "border-border-default bg-bg-1 hover:bg-bg-2"
            }`}
          >
            {str(p.secondaryCta)}
          </button>
        ) : null}
      </div>

      {stats && stats.length > 0 ? (
        <div className={`flex flex-wrap gap-6 mt-6 pt-5 border-t ${light ? "border-white/20" : "border-border-default"} ${centered ? "justify-center" : ""}`}>
          {stats.map((s, i) => (
            <div key={i} className={light ? "text-white" : "text-text-0"}>
              <div className="font-display text-2xl font-bold text-green">{s.value}</div>
              <div className={`text-[11px] uppercase tracking-wider font-medium ${muted}`}>{s.label}</div>
            </div>
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

  const rawStats = items<Record<string, unknown>>(p.stats);
  const stats = rawStats
    .map((s) => ({
      value: str(s.value ?? s.stat ?? s.title ?? ""),
      label: str(s.label ?? s.description ?? s.subtitle ?? ""),
    }))
    .filter((s) => s.value || s.label);

  const onPrimary = () => {
    if (str(p.primaryCtaUrl)) {
      window.location.href = str(p.primaryCtaUrl);
      return;
    }
    scrollToAnchor(str(p.primaryAnchor, "enquire"));
  };
  const onSecondary = () => {
    if (str(p.secondaryCtaUrl) && !str(p.popupId)) {
      window.location.href = str(p.secondaryCtaUrl);
      return;
    }
    runtime.openPopup(str(p.popupId) || undefined, { brochureUrl: str(p.pdfUrl) });
  };

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
          <HeroCopy p={p} onPrimary={onPrimary} onSecondary={onSecondary} light stats={stats} />
          <div id="hero-enquire" className="rounded-2xl bg-bg-1/95 backdrop-blur-md border border-border-default p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <h3 className="text-lg font-semibold mb-1">{str(p.formTitle, "Enquire now")}</h3>
            <p className="text-text-2 text-sm mb-4">{str(p.formSubtitle, "A relationship manager will call you shortly.")}</p>
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
          <HeroCopy p={p} onPrimary={onPrimary} onSecondary={onSecondary} light centered stats={stats} />
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
          <HeroCopy p={p} onPrimary={onPrimary} onSecondary={onSecondary} light />
        </div>
        {stats.length ? (
          <div className="relative z-10 border-t border-white/15 bg-black/35 backdrop-blur-md">
            <div className="grid grid-cols-2 @md:grid-cols-4 gap-4 px-6 @md:px-12 py-5 max-w-5xl">
              {stats.map((s, i) => (
                <div key={i} className="text-white">
                  <div className="font-display text-xl @md:text-2xl font-semibold">{s.value || "—"}</div>
                  <div className="text-[11px] uppercase tracking-wider text-white/65 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  /* PDF 8 — Aurelia editorial: left copy + pill CTAs + floating label/value bar */
  if (block.variant === "editorial") {
    return (
      <section className="relative min-h-[88vh] flex flex-col overflow-hidden bg-white">
        {str(p.image) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={str(p.image)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100" />
        )}
        {str(p.image) && <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/15" />}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-6 @md:px-12 @lg:px-16 pt-28 pb-36 max-w-3xl">
          {str(p.badge) ? (
            <p className={`text-[11px] uppercase tracking-[0.28em] font-medium mb-5 ${str(p.image) ? "text-white/80" : "text-green"}`}>{str(p.badge)}</p>
          ) : null}
          <h1 className={`font-display text-4xl @md:text-6xl @lg:text-[4.25rem] font-medium leading-[1.08] tracking-tight mb-5 ${str(p.image) ? "text-white" : "text-text-0"}`}>
            {str(p.headline, "Architecture Crafted For Generations.")}
          </h1>
          {str(p.description) ? (
            <p className={`text-base @md:text-lg leading-relaxed max-w-xl mb-8 ${str(p.image) ? "text-white/80" : "text-text-1"}`}>{str(p.description)}</p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {str(p.primaryCta) ? (
              <button
                type="button"
                onClick={onPrimary}
                className="px-7 py-3 rounded-full bg-green text-white text-[12px] font-semibold uppercase tracking-[0.12em] hover:bg-green-dim transition-colors shadow-sm"
              >
                {str(p.primaryCta)}
              </button>
            ) : null}
            {str(p.secondaryCta) ? (
              <button
                type="button"
                onClick={onSecondary}
                className={`px-7 py-3 rounded-full border text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  str(p.image) ? "border-white/55 text-white hover:bg-white/10" : "border-border-default text-text-0 hover:bg-slate-50"
                }`}
              >
                {str(p.secondaryCta)}
              </button>
            ) : null}
          </div>
        </div>
        {stats.length ? (
          <div className="absolute bottom-6 left-6 right-6 @md:left-12 @md:right-12 @lg:left-16 @lg:right-16 z-20">
            <div className="rounded-2xl bg-white/95 backdrop-blur-md border border-border-default shadow-lg grid grid-cols-2 @md:grid-cols-4 divide-x divide-border-subtle overflow-hidden">
              {stats.map((s, i) => (
                <div key={i} className="px-5 @md:px-7 py-5 text-text-0">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-text-2 mb-2 font-medium">{s.label}</div>
                  <div className="font-display text-xl @md:text-2xl font-semibold text-text-0">{s.value || "—"}</div>
                </div>
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
            <h1 className="font-display text-3xl @md:text-5xl @lg:text-[3.4rem] font-medium text-white leading-[1.12] mb-6">
              {str(p.headline, "Luxury residences")}
            </h1>
            {stats.length ? (
              <div className="mb-7 grid grid-cols-2 gap-px rounded-2xl overflow-hidden bg-white/15 backdrop-blur-md border border-white/25 max-w-md">
                {stats.slice(0, 4).map((s, i) => (
                  <div key={i} className="bg-white/10 px-4 py-3.5">
                    <div className="font-display text-xl @md:text-2xl font-semibold text-white leading-none mb-1">
                      {s.value || "—"}
                    </div>
                    <div className="text-[11px] text-white/75 leading-snug">{s.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {str(p.primaryCta) ? (
              <button
                type="button"
                onClick={onPrimary}
                className="inline-flex items-center gap-2 self-start px-6 py-3 rounded-full bg-green text-white text-sm font-semibold hover:bg-green-dim transition-colors"
              >
                {str(p.primaryCta)}
                <ArrowRight size={14} />
              </button>
            ) : null}
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
              <div className="absolute bottom-4 right-4 @md:bottom-6 @md:right-6 rounded-full bg-white/90 backdrop-blur px-4 py-2 text-[10px] @md:text-[11px] font-semibold tracking-wide text-text-0 shadow-sm max-w-[min(100%,280px)] truncate">
                {str(p.rera) || str(p.badge)}
              </div>
            ) : null}
          </div>
          <div className="order-1 @lg:order-2 @lg:pt-4">
            <h1 className="font-display text-4xl @md:text-5xl @lg:text-[3.5rem] font-medium text-text-0 leading-[1.1] tracking-tight mb-4">
              {str(p.headline, "Your Future Home Starts Here")}
            </h1>
            {str(p.description) ? (
              <p className="text-text-1 text-sm @md:text-base leading-relaxed mb-8 max-w-md">{str(p.description)}</p>
            ) : null}
            {stats.length ? (
              <div className="rounded-2xl border border-border-default bg-bg-1/90 backdrop-blur shadow-[0_12px_40px_rgba(0,0,0,0.06)] grid grid-cols-2 divide-x divide-y divide-border-subtle overflow-hidden max-w-sm">
                {stats.slice(0, 4).map((s, i) => (
                  <div key={i} className="px-5 py-5 text-center">
                    <div className="font-display text-2xl @md:text-3xl font-semibold text-text-0 leading-none mb-1.5">
                      {s.value || "—"}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-text-2">{s.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {(str(p.primaryCta) || str(p.secondaryCta)) && (
              <div className="flex flex-wrap gap-3 mt-7">
                {str(p.primaryCta) ? (
                  <button
                    type="button"
                    onClick={onPrimary}
                    className="px-5 py-2.5 rounded-lg bg-green text-white text-sm font-semibold hover:bg-green-dim transition-colors"
                  >
                    {str(p.primaryCta)}
                  </button>
                ) : null}
                {str(p.secondaryCta) ? (
                  <button
                    type="button"
                    onClick={onSecondary}
                    className="px-5 py-2.5 rounded-lg border border-border-default text-sm font-medium hover:bg-bg-2 transition-colors"
                  >
                    {str(p.secondaryCta)}
                  </button>
                ) : null}
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
            <h1 className="font-display text-3xl @md:text-5xl @lg:text-[3.25rem] font-medium text-text-0 leading-[1.15] tracking-tight mb-4">
              {str(p.headline, "Discover Modern Living")}
            </h1>
            {str(p.description) ? (
              <p className="text-text-1 text-sm @md:text-base leading-relaxed max-w-xl">{str(p.description)}</p>
            ) : null}
          </div>
        </div>
        {stats.length ? (
          <div className="absolute left-4 right-4 @md:left-10 @md:right-10 @lg:left-16 @lg:right-16 bottom-6 z-20">
            <div className="rounded-2xl @md:rounded-3xl bg-bg-1 border border-border-default shadow-[0_20px_60px_rgba(0,0,0,0.1)] grid grid-cols-2 @md:grid-cols-4 divide-x divide-border-subtle overflow-hidden">
              {stats.slice(0, 4).map((s, i) => (
                <div key={i} className="px-4 @md:px-6 py-5 @md:py-6 text-center @md:text-left">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-green font-semibold mb-2">{s.label}</div>
                  <div className="font-semibold text-sm @md:text-base text-text-0 leading-snug">{s.value || "—"}</div>
                </div>
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
            <h1 className="font-display text-4xl @md:text-5xl @lg:text-[3.5rem] font-medium text-white leading-[1.12] mb-4">
              {str(p.headline, "Find your perfect investment properties")}
            </h1>
            {str(p.description) ? (
              <p className="text-white/85 text-sm @md:text-base leading-relaxed mb-8 max-w-xl">{str(p.description)}</p>
            ) : null}
            {str(p.primaryCta) ? (
              <button
                type="button"
                onClick={onPrimary}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white text-sm font-semibold hover:bg-black/70 transition-colors"
              >
                {str(p.primaryCta)}
                <ArrowRight size={14} className="-rotate-45" />
              </button>
            ) : null}
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
          <h1 className="font-display text-3xl @md:text-4xl @lg:text-[2.75rem] font-medium text-text-0 leading-[1.15] mb-8">
            {str(p.headline, "4 BHK Luxury Flat")}
          </h1>
          {stats.length ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 mb-8 max-w-md">
              {stats.slice(0, 4).map((s, i) => (
                <div key={i} className={`pr-4 ${i % 2 === 0 ? "border-r border-border-default" : ""}`}>
                  <div className="font-display text-2xl @md:text-3xl font-semibold text-text-0 leading-none mb-2">
                    {s.value || "—"}
                  </div>
                  <div className="text-[12px] text-green leading-snug">{s.label}</div>
                </div>
              ))}
            </div>
          ) : null}
          {str(p.primaryCta) ? (
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex items-center gap-2 self-start px-6 py-3 rounded-full bg-green text-white text-sm font-semibold hover:bg-green-dim transition-colors"
            >
              {str(p.primaryCta)}
              <ArrowRight size={14} className="-rotate-45" />
            </button>
          ) : null}
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
        <HeroCopy p={p} onPrimary={onPrimary} onSecondary={onSecondary} light stats={stats} />
      </div>
    </section>
  );
}

/** Normalise a stats/highlights list into displayable value+label pairs. */
function statPairs(list: unknown): Array<{ value: string; label: string }> {
  return items<Record<string, unknown>>(list)
    .map((s) => ({
      value: str(s?.value ?? s?.stat ?? s?.title ?? ""),
      label: str(s?.label ?? s?.description ?? s?.subtitle ?? ""),
    }))
    .filter((s) => s.value || s.label);
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
  "formTitle",
  "formSubtitle",
  "formId",
  "popupId",
  "pdfUrl",
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
  const highlights = items<{ title: string; description?: string }>(p.highlights);
  const cta = str(p.ctaText);
  const overviewStats = statPairs(p.stats);
  const customRows = customScalarProps(p, OVERVIEW_KNOWN_PROPS);
  const variant = block.variant || (str(p.image) ? "split" : "centered");

  if (variant === "cards") {
    return (
      <SectionShell id={str(p.anchor, "overview")}>
        <Title block={block} title={str(p.title, "Why this project")} subtitle={str(p.subtitle)} />
        <p className="max-w-3xl mx-auto text-text-1 leading-relaxed text-center mb-10">{str(p.body)}</p>
        <div className="grid @md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {highlights.map((h, i) => (
            <div key={i} className="rounded-2xl border border-border-default bg-bg-2 p-6 text-center hover:-translate-y-0.5 hover:border-border-hover transition-all">
              <div className="w-10 h-10 rounded-full bg-green/10 text-green flex items-center justify-center mx-auto mb-3">
                <Check size={14} />
              </div>
              <h3 className="font-semibold mb-1">{h.title}</h3>
              {h.description ? <p className="text-text-2 text-sm">{h.description}</p> : null}
            </div>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (variant === "timeline") {
    return (
      <SectionShell id={str(p.anchor, "overview")}>
        <Title block={block} title={str(p.title, "The Journey")} subtitle={str(p.subtitle)} />
        <p className="max-w-2xl mx-auto text-text-1 leading-relaxed text-center mb-10">{str(p.body)}</p>
        <ol className="max-w-xl mx-auto space-y-0">
          {highlights.map((h, i) => (
            <li key={i} className="relative pl-10 pb-8 last:pb-0">
              <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-green text-black text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
              {i < highlights.length - 1 ? <span className="absolute left-[11px] top-8 bottom-0 w-px bg-border-default" /> : null}
              <div className="font-semibold">{h.title}</div>
              {h.description ? <p className="text-text-2 text-sm mt-1">{h.description}</p> : null}
            </li>
          ))}
        </ol>
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
            {str(p.subtitle) ? <p className="text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-3">{str(p.subtitle)}</p> : null}
            <h2 className="font-display text-3xl @md:text-4xl font-semibold mb-4">{str(p.title, "About the Project")}</h2>
            <p className="text-text-1 leading-relaxed mb-6 whitespace-pre-line">{str(p.body)}</p>
            {highlights.length ? (
              <ul className="space-y-3 mb-7">
                {highlights.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-green/15 text-green flex items-center justify-center shrink-0"><Check size={12} /></span>
                    <span><strong className="text-text-0">{h.title}</strong>{h.description ? <span className="text-text-2"> — {h.description}</span> : null}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {overviewStats.length ? (
              <div className="grid grid-cols-2 border-t border-l border-border-default mb-6">
                {overviewStats.map((s, i) => (
                  <div key={i} className="border-r border-b border-border-default px-5 py-5">
                    <div className="font-display text-3xl font-medium text-text-0 mb-1">{s.value}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-text-3">{s.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {cta ? (
              <a href={`#${str(p.ctaAnchor, "enquire")}`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim transition-all">
                {cta} <ArrowRight size={15} />
              </a>
            ) : null}
          </div>
        </div>
        <CustomPropList rows={customRows} />
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "overview")}>
      <Title block={block} title={str(p.title, "Project Overview")} subtitle={str(p.subtitle)} />
      <p className="max-w-3xl mx-auto text-text-1 leading-relaxed text-center whitespace-pre-line">{str(p.body)}</p>
      {overviewStats.length ? (
        <div className="mt-10 grid grid-cols-2 @md:grid-cols-4 gap-px bg-border-default rounded-2xl overflow-hidden max-w-4xl mx-auto">
          {overviewStats.map((s, i) => (
            <div key={i} className="bg-white px-5 py-6 text-center">
              <div className="font-display text-2xl font-semibold mb-1">{s.value || "—"}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-text-3">{s.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      {str(p.image) ? (
        <div className="mt-10 max-w-5xl mx-auto rounded-[28px] overflow-hidden aspect-[16/9] bg-bg-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={str(p.image)} alt={str(p.title)} className="w-full h-full object-cover" />
        </div>
      ) : null}
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

  return (
    <SectionShell id={str(block.props.anchor, "highlights")} className="bg-bg-2">
      <Title block={block} title={str(block.props.title, "Project Highlights")} subtitle={str(block.props.subtitle)} />
      <div className="grid grid-cols-2 @md:grid-cols-3 @2xl:grid-cols-5 gap-4 max-w-6xl mx-auto">
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
              className="rounded-2xl border border-border-default bg-bg-1 p-5 text-center hover:-translate-y-0.5 hover:border-border-hover transition-all"
            >
              {inner}
            </El>
          ) : (
            <div key={i} className="rounded-2xl border border-border-default bg-bg-1 p-5 text-center hover:-translate-y-0.5 hover:border-border-hover transition-all">
              {inner}
            </div>
          );
        })}
      </div>
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
    <El block={block} id={part(block, "cta")} className="mt-10 flex justify-center">
      <a
        href={exploreHref}
        className="inline-flex items-center gap-2 px-7 py-3 rounded-lg border border-border-default text-sm font-semibold hover:border-green hover:bg-green/5 transition-colors"
      >
        {exploreText}
        <ArrowRight size={15} />
      </a>
    </El>
  ) : null;

  if (block.variant === "chips") {
    return (
      <SectionShell id={str(p.anchor, "amenities")}>
        <Title block={block} title={str(p.title, "Amenities")} subtitle={str(p.subtitle)} />
        <div className="flex flex-wrap justify-center gap-2">
          {amen.map((a, i) => (
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
            {rest.map((a) => (
              <El key={itemPart("items", a)} block={block} id={itemPart("items", a)} className="rounded-2xl border border-border-default bg-bg-2 p-5">
                <El block={block} id={subElementId(itemPart("items", a), "title")} as="h3" className="font-semibold mb-1">
                  {a.title}
                </El>
                {a.description ? (
                  <El block={block} id={subElementId(itemPart("items", a), "description")} as="p" className="text-text-2 text-sm">
                    {a.description}
                  </El>
                ) : null}
              </El>
            ))}
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
            {rest.slice(0, 4).map((a) => (
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
            ))}
          </div>
        </div>
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
}

export function FloorPlansBlock({ block }: { block: BlockConfig }) {
  const runtime = useOpenPageRuntime();
  const plans = items<{
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

  function unlockKey(plan: { name: string; image?: string }, index: number) {
    return `floor-plan:${index}:${plan.image || plan.name}`;
  }

  function openGate(plan: { name: string; image?: string; downloadUrl?: string }, index: number) {
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

  return (
    <SectionShell id={str(block.props.anchor, "plans")} className="bg-bg-2">
      <Title block={block} title={str(block.props.title, "Floor Plans")} subtitle={str(block.props.subtitle)} />
      {block.variant === "list" ? (
        <div className="max-w-3xl mx-auto space-y-3">
          {plans.map((plan, i) => {
            const key = unlockKey(plan, i);
            const unlocked = !gateEnabled || runtime.isUnlocked(key);
            return (
              <div key={i} className="flex flex-col @sm:flex-row @sm:items-center gap-4 rounded-2xl border border-border-default bg-bg-1 p-4">
                <button type="button" className="relative w-full @sm:w-36 h-24 rounded-xl overflow-hidden bg-bg-3 shrink-0" onClick={() => openGate(plan, i)}>
                  {plan.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={plan.image} alt={plan.name} className={`w-full h-full object-cover ${unlocked ? "" : "blur-md"}`} />
                  ) : null}
                  {!unlocked ? <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Lock size={14} /></span> : null}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{plan.name}</div>
                  <div className="text-text-2 text-sm">{[plan.beds, plan.area].filter(Boolean).join(" · ")}</div>
                  {plan.price ? <div className="text-green text-sm font-semibold mt-1">{plan.price}</div> : null}
                </div>
                <button type="button" className="inline-flex items-center gap-2 text-sm font-medium text-green shrink-0" onClick={() => openGate(plan, i)}>
                  {unlocked ? <>Download <Download size={14} /></> : <>Unlock <ArrowRight size={14} /></>}
                </button>
              </div>
            );
          })}
        </div>
      ) : block.variant === "showcase" && plans[0] ? (
        <div className="max-w-5xl mx-auto grid @lg:grid-cols-[1.2fr_0.8fr] gap-6">
          {(() => {
            const plan = plans[0];
            const key = unlockKey(plan, 0);
            const unlocked = !gateEnabled || runtime.isUnlocked(key);
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
                <div className="flex flex-col justify-center">
                  <h3 className="font-display text-3xl font-semibold mb-2">{plan.name}</h3>
                  <p className="text-text-2 mb-2">{[plan.beds, plan.area].filter(Boolean).join(" · ")}</p>
                  {plan.price ? <p className="text-green font-semibold text-lg mb-6">{plan.price}</p> : null}
                  <button type="button" className="inline-flex items-center gap-2 self-start px-5 py-2.5 rounded-lg bg-green text-black text-sm font-semibold" onClick={() => openGate(plan, 0)}>
                    {unlocked ? "Download plan" : "Unlock & download"} <ArrowRight size={14} />
                  </button>
                  {plans.length > 1 ? (
                    <div className="mt-8 space-y-2">
                      {plans.slice(1).map((p, i) => (
                        <button key={i + 1} type="button" className="w-full flex items-center justify-between rounded-xl border border-border-default bg-bg-1 px-4 py-3 text-sm hover:border-border-hover" onClick={() => openGate(p, i + 1)}>
                          <span className="font-medium">{p.name}</span>
                          <span className="text-text-3">{p.area}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
            return (
              <div key={i} className="rounded-2xl border border-border-default bg-bg-1 overflow-hidden hover:border-border-hover transition-all">
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
                  <div className="font-semibold text-lg">{plan.name}</div>
                  <div className="text-text-2 text-sm mt-1">
                    {[plan.beds, plan.area].filter(Boolean).join(" · ")}
                  </div>
                  {plan.price ? <div className="text-green text-sm font-semibold mt-2">{plan.price}</div> : null}
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
              </div>
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
  const rows = items<{
    config: string;
    type?: string;
    area: string;
    price: string;
    image?: string;
    cta?: string;
    description?: string;
    meta?: string;
  }>(block.props.items);

  if (block.variant === "listings") {
    return (
      <SectionShell id={str(block.props.anchor, "listings")}>
        <div className="max-w-6xl mx-auto mb-8">
          <h2 className="font-display text-3xl @md:text-4xl font-medium tracking-tight">{str(block.props.title, "New Properties")}</h2>
          {str(block.props.subtitle) ? <p className="text-text-2 text-sm mt-2">{str(block.props.subtitle)}</p> : null}
        </div>
        <div className="grid @md:grid-cols-2 gap-5 @md:gap-6 max-w-6xl mx-auto">
          {rows.map((r, i) => (
            <article
              key={i}
              className="rounded-[22px] border border-border-default bg-bg-1 overflow-hidden hover:border-border-hover transition-colors group"
            >
              <div className="aspect-[16/10] bg-bg-3 relative overflow-hidden">
                {r.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt={r.config} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
                ) : null}
                {r.type ? (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-bg-1/95 text-[11px] font-semibold uppercase tracking-wide text-text-0">
                    {r.type}
                  </span>
                ) : null}
              </div>
              <div className="p-5 @md:p-6">
                <h3 className="font-display text-xl @md:text-2xl font-medium leading-snug mb-2">{r.config}</h3>
                {r.description ? <p className="text-text-2 text-sm leading-relaxed line-clamp-3 mb-4">{r.description}</p> : null}
                <div className="flex flex-wrap gap-2 text-[12px] text-text-2">
                  {r.area ? <span className="px-2.5 py-1 rounded-full bg-bg-2">{r.area}</span> : null}
                  {r.meta ? <span className="px-2.5 py-1 rounded-full bg-bg-2">{r.meta}</span> : null}
                  {r.price && !r.meta ? <span className="px-2.5 py-1 rounded-full bg-bg-2">{r.price}</span> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (block.variant === "table") {
    return (
      <SectionShell id={str(block.props.anchor, "units")}>
        <Title block={block} title={str(block.props.title, "Property Types")} subtitle={str(block.props.subtitle)} />
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
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border-subtle">
                  <td className="py-3 pr-4 font-medium">{r.config}</td>
                  <td className="py-3 pr-4 text-text-2">{r.area}</td>
                  <td className="py-3">{r.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(block.props.anchor, "units")}>
      <Title block={block} title={str(block.props.title, "Property Types")} subtitle={str(block.props.subtitle)} />
      <div className="grid @md:grid-cols-2 @2xl:grid-cols-3 gap-5 max-w-6xl mx-auto">
        {rows.map((r, i) => (
          <div key={i} className="rounded-2xl border border-border-default bg-bg-1 overflow-hidden hover:-translate-y-0.5 hover:border-border-hover transition-all">
            <div className="aspect-[16/10] bg-bg-3">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt={r.config} className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div className="p-5">
              {r.type ? <div className="text-[11px] uppercase tracking-wider text-green font-semibold mb-1">{r.type}</div> : null}
              <div className="font-semibold text-lg">{r.config}</div>
              <div className="text-text-2 text-sm mt-1">{r.area}</div>
              <div className="text-green font-semibold mt-2">{r.price}</div>
              <button
                type="button"
                className="mt-4 w-full px-4 py-2.5 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim"
                onClick={() => scrollToAnchor("enquire")}
              >
                {r.cta || str(block.props.ctaText, "Enquire")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export function RePricingBlock({ block }: { block: BlockConfig }) {
  const cards = items<{ name: string; price: string; meta?: string; cta?: string; features?: string[] }>(block.props.items);
  const variant = block.variant || (cards.length ? "cards" : "simple");
  const startingPrice = str(block.props.startingPrice).trim();
  type PriceCard = { name: string; price: string; meta?: string; cta?: string; features?: string[] };
  const fallbackCard: PriceCard = { name: "Starting", price: startingPrice || "₹ 1.2 Cr*", meta: str(block.props.disclaimer) };
  const pricedCards: PriceCard[] = cards.length ? cards : [fallbackCard];

  // The starting price is a headline, not a card — surface it above the grid
  // whenever it is set so entering it always has a visible effect.
  const StartingHeadline = startingPrice ? (
    <div className="text-center mb-10">
      <div className="text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-2">Starting from</div>
      <div className="font-display text-4xl @md:text-5xl font-semibold">{startingPrice}</div>
      {str(block.props.subtitle) ? (
        <p className="text-text-2 text-sm mt-3 max-w-lg mx-auto">{str(block.props.subtitle)}</p>
      ) : null}
    </div>
  ) : null;

  if (variant === "comparison") {
    return (
      <SectionShell id={str(block.props.anchor, "pricing")}>
        <Title block={block} title={str(block.props.title, "Compare Plans")} subtitle={str(block.props.subtitle)} />
        {StartingHeadline}
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
              {pricedCards.map((c, i) => (
                <tr key={i} className="border-b border-border-subtle">
                  <td className="py-4 pr-4 font-semibold">{c.name}</td>
                  <td className="py-4 pr-4 text-green font-semibold">{c.price}</td>
                  <td className="py-4 text-text-2">{c.meta || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {str(block.props.disclaimer) ? <p className="text-center text-text-3 text-xs mt-6">{str(block.props.disclaimer)}</p> : null}
      </SectionShell>
    );
  }

  if (variant === "banner") {
    return (
      <SectionShell id={str(block.props.anchor, "pricing")} className="bg-bg-2">
        <div className="max-w-4xl mx-auto rounded-3xl border border-border-default bg-gradient-to-br from-bg-1 to-green/5 px-8 @md:px-12 py-12 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-3">Starting from</p>
          <h2 className="font-display text-4xl @md:text-5xl font-semibold mb-3">{startingPrice || cards[0]?.price || "₹ 1.2 Cr*"}</h2>
          <p className="text-text-2 text-sm mb-8 max-w-lg mx-auto">{str(block.props.subtitle, str(block.props.title, "Exclusive pricing for limited units"))}</p>
          <a href="#enquire" className="inline-flex px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold">{str(block.props.ctaText, "Enquire Now")}</a>
          {str(block.props.disclaimer) ? <p className="text-text-3 text-xs mt-6">{str(block.props.disclaimer)}</p> : null}
        </div>
      </SectionShell>
    );
  }

  if (variant === "cards" || cards.length) {
    return (
      <SectionShell id={str(block.props.anchor, "pricing")}>
        <Title block={block} title={str(block.props.title, "Pricing")} subtitle={str(block.props.subtitle)} />
        {StartingHeadline}
        <div className="grid @md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {pricedCards.map((c, i) => (
            <div key={i} className="rounded-2xl border border-border-default bg-bg-2 p-6 text-center hover:border-green/40 transition-all">
              <div className="text-sm text-text-2 mb-2">{c.name}</div>
              <div className="font-display text-3xl font-semibold text-green mb-2">{c.price}</div>
              {c.meta ? <p className="text-text-3 text-xs mb-5">{c.meta}</p> : null}
              <a href="#enquire" className="inline-flex px-4 py-2 rounded-lg bg-green text-black text-sm font-semibold">{c.cta || str(block.props.ctaText, "Enquire")}</a>
            </div>
          ))}
        </div>
        {str(block.props.disclaimer) ? <p className="text-center text-text-3 text-xs mt-6">{str(block.props.disclaimer)}</p> : null}
      </SectionShell>
    );
  }
  return (
    <SectionShell id={str(block.props.anchor, "pricing")}>
      <Title block={block} title={str(block.props.title, "Pricing")} subtitle={str(block.props.subtitle)} />
      <div className="text-center">
        <div className="font-display text-4xl font-bold">{startingPrice || "₹ 1.2 Cr*"}</div>
        <p className="text-text-3 text-xs mt-2">{str(block.props.disclaimer, "*T&C apply. Price on request for selected units.")}</p>
      </div>
    </SectionShell>
  );
}

/**
 * Turn any pasted Google Maps link into something an iframe can actually load.
 * Users routinely paste the share/place URL from the browser address bar, which
 * Google refuses to frame — normalise it to the embed form instead.
 */
function normalizeMapUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^(data:|blob:)/i.test(value)) return value;

  // Bare coordinates, e.g. "12.9716,77.5946" or "?q=12.9716,77.5946".
  const coords = value.match(/^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/);
  if (coords) return `https://www.google.com/maps?q=${encodeURIComponent(value)}&z=15&output=embed`;

  if (!/^https?:\/\//i.test(value)) {
    return `https://www.google.com/maps?q=${encodeURIComponent(value)}&z=15&output=embed`;
  }

  // Already an embed URL — leave it alone.
  if (/\/maps\/embed\//i.test(value) || /[?&]output=embed\b/i.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  const query =
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    url.searchParams.get("destination") ||
    url.searchParams.get("address") ||
    "";
  if (!query) return value;

  // A place/directions URL identifies the target through `data=` or the path.
  const dataParam = url.searchParams.get("data");
  const target = dataParam || query;
  const zoom = url.searchParams.get("zoom") || "15";

  if (/google\.[a-z.]+\/maps\/embed/i.test(value)) return value;

  const embed = new URL("https://www.google.com/maps");
  embed.searchParams.set("q", target);
  embed.searchParams.set("z", zoom);
  embed.searchParams.set("output", "embed");
  return embed.toString();
}

function MapFrame({ src, title }: { src: string; title: string }) {
  const embed = normalizeMapUrl(src);
  if (!embed) {
    return (
      <div className="w-full h-full min-h-[260px] flex items-center justify-center text-text-3 text-sm px-4 text-center">
        Add a Google Maps link — a share link, place URL or coordinates all work.
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

export function LocationBlock({ block }: { block: BlockConfig }) {
  const nearby = items<{ title: string; meta: string }>(block.props.items);
  const embed = str(block.props.embedUrl);
  const variant = block.variant || "split-map";
  const p = block.props;

  if (variant === "map-only") {
    return (
      <SectionShell id={str(p.anchor, "location")} className="pt-8">
        <Title block={block} title={str(p.title, "Location")} subtitle={str(p.address)} />
        <El block={block} id={part(block, "map")} className="rounded-2xl overflow-hidden border border-border-default aspect-[16/8] bg-bg-2 max-w-6xl mx-auto">
          <MapFrame src={embed} title={str(p.title, "Google Maps")} />
        </El>
      </SectionShell>
    );
  }

  if (variant === "list") {
    return (
      <SectionShell id={str(p.anchor, "location")}>
        <Title block={block} title={str(p.title, "Location & Connectivity")} subtitle={str(p.address)} />
        <div className="max-w-2xl mx-auto space-y-3">
          {nearby.map((n) => {
            const id = itemPart("items", n);
            return (
              <El key={id} block={block} id={id} className="flex items-center justify-between rounded-xl border border-border-default bg-bg-2 px-4 py-3.5">
                <El block={block} id={subElementId(id, "title")} as="div" className="flex items-center gap-2 text-sm font-medium">
                  <MapPin size={14} className="text-green" />
                  {n.title}
                </El>
                <El block={block} id={subElementId(id, "meta")} as="div" className="text-text-3 text-sm">
                  {n.meta}
                </El>
              </El>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (variant === "cards") {
    return (
      <SectionShell id={str(p.anchor, "location")} className="bg-bg-2">
        <Title block={block} title={str(p.title, "Location Advantages")} subtitle={str(p.address)} />
        <div className="grid @md:grid-cols-2 @2xl:grid-cols-3 gap-4 max-w-5xl mx-auto mb-8">
          {nearby.map((n) => {
            const id = itemPart("items", n);
            return (
              <El key={id} block={block} id={id} className="rounded-2xl border border-border-default bg-bg-1 p-5 text-center">
                <MapPin size={18} className="text-green mx-auto mb-3" />
                <El block={block} id={subElementId(id, "title")} as="div" className="font-semibold mb-1">
                  {n.title}
                </El>
                <El block={block} id={subElementId(id, "meta")} as="div" className="text-text-3 text-sm">
                  {n.meta}
                </El>
              </El>
            );
          })}
        </div>
        {embed.trim() ? (
          <El block={block} id={part(block, "map")} className="rounded-2xl overflow-hidden border border-border-default aspect-[16/7] bg-bg-1 max-w-5xl mx-auto">
            <MapFrame src={embed} title={str(p.title, "Google Maps")} />
          </El>
        ) : null}
      </SectionShell>
    );
  }

  if (variant === "editorial") {
    const image = str(p.image);
    return (
      <SectionShell id={str(p.anchor, "location")} className="bg-bg-0">
        <El block={block} id={part(block, "headingRow")} className="max-w-6xl mx-auto mb-10">
          {str(p.subtitle) ? (
            <El block={block} id={part(block, "subtitle")} as="p" className="text-[11px] uppercase tracking-[0.28em] text-green font-medium mb-3">
              {str(p.subtitle)}
            </El>
          ) : null}
          <El block={block} id={part(block, "title")} as="h2" className="font-display text-3xl @md:text-5xl font-medium tracking-tight max-w-2xl">
            {str(p.title, "Quietly Central.")}
          </El>
        </El>
        <div className="max-w-6xl mx-auto grid @lg:grid-cols-[0.95fr_1.05fr] gap-8 @lg:gap-12 items-start">
          <El block={block} id={part(block, "media")} className="rounded-[24px] overflow-hidden aspect-[3/4] bg-bg-2">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="w-full h-full object-cover" />
            ) : embed.trim() ? (
              <MapFrame src={embed} title={str(p.title, "Google Maps")} />
            ) : (
              <div className="w-full h-full min-h-[360px] bg-bg-3" />
            )}
          </El>
          <div className="grid grid-cols-1 @sm:grid-cols-2 border-t border-l border-border-default">
            {nearby.map((n) => {
              const id = itemPart("items", n);
              return (
                <El key={id} block={block} id={id} className="border-r border-b border-border-default px-5 py-6">
                  <El block={block} id={subElementId(id, "title")} as="div" className="font-medium text-text-0 mb-2">
                    {n.title}
                  </El>
                  <El block={block} id={subElementId(id, "meta")} as="div" className="font-display text-sm text-text-2 tracking-wide">
                    {n.meta}
                  </El>
                </El>
              );
            })}
          </div>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "location")}>
      <Title block={block} title={str(p.title, "Location & Connectivity")} subtitle={str(p.address)} />
      <div className="grid @lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-start">
        <El block={block} id={part(block, "map")} className="rounded-2xl overflow-hidden border border-border-default aspect-[4/3] bg-bg-2">
          <MapFrame src={embed} title={str(p.title, "Google Maps")} />
        </El>
        <div>
          {str(p.address) ? (
            <El block={block} id={part(block, "address")} as="p" className="flex items-start gap-2 text-sm mb-5">
              <MapPin size={16} className="text-green mt-0.5" />
              <span>{str(p.address)}</span>
            </El>
          ) : null}
          <div className="space-y-3">
            {nearby.map((n) => {
              const id = itemPart("items", n);
              return (
                <El key={id} block={block} id={id} className="flex items-center justify-between rounded-xl border border-border-default bg-bg-2 px-4 py-3">
                  <El block={block} id={subElementId(id, "title")} as="div" className="flex items-center gap-2 text-sm font-medium">
                    <MapPin size={14} className="text-green" />
                    {n.title}
                  </El>
                  <El block={block} id={subElementId(id, "meta")} as="div" className="text-text-3 text-sm">
                    {n.meta}
                  </El>
                </El>
              );
            })}
          </div>
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
      {str(p.title) ? (
        <div className="max-w-6xl mx-auto mb-5">
          <h2 className="font-display text-2xl @md:text-3xl font-semibold tracking-tight">{str(p.title)}</h2>
          {str(p.subtitle) ? <p className="text-text-2 text-sm mt-2">{str(p.subtitle)}</p> : null}
        </div>
      ) : null}
      <div
        className="rounded-xl overflow-hidden border border-border-default bg-bg-2 max-w-6xl mx-auto"
        style={{ height }}
      >
        <MapFrame src={src} title={str(p.title, "Google Maps")} />
      </div>
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
  const rawStats = items<Record<string, unknown>>(p.stats || p.items);
  const stats = rawStats
    .map((s) => ({
      value: str(s.value ?? s.stat ?? s.title ?? ""),
      label: str(s.label ?? s.description ?? s.subtitle ?? ""),
    }))
    .filter((s) => s.value || s.label);
  const variant = block.variant || "default";
  const logo = str(p.logo).trim();
  const image = str(p.image).trim();

  if (variant === "split") {
    return (
      <SectionShell id={str(p.anchor, "builder")} className="bg-bg-2">
        <div className="grid @lg:grid-cols-2 gap-10 max-w-6xl mx-auto items-center">
          <div className="rounded-2xl overflow-hidden border border-border-default aspect-[4/3] bg-bg-1">
            {str(p.image) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={str(p.image)} alt={str(p.name)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full min-h-[240px] bg-bg-3" />
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-green font-semibold mb-3">{str(p.title, "About the Developer")}</p>
            <h2 className="font-display text-3xl font-semibold mb-4">{str(p.name)}</h2>
            <p className="text-text-1 leading-relaxed">{str(p.body)}</p>
            {stats.length > 0 && (
              <div className="grid grid-cols-2 @md:grid-cols-3 gap-3 mt-6 pt-6 border-t border-border-default/60">
                {stats.map((s, i) => (
                  <div key={i} className="rounded-xl border border-border-default/80 bg-bg-1/80 p-3.5 text-center shadow-sm">
                    <div className="font-display text-xl @md:text-2xl font-bold text-green mb-0.5">{s.value}</div>
                    <div className="text-[10.5px] uppercase tracking-wider text-text-3 font-medium">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionShell>
    );
  }

  if (variant === "stats") {
    const displayStats = stats.length
      ? stats
      : [
          { label: "Projects", value: "50+" },
          { label: "Years", value: "25+" },
          { label: "Cities", value: "12" },
          { label: "Homes", value: "10k+" },
        ];
    return (
      <SectionShell id={str(p.anchor, "builder")}>
        <Title block={block} title={str(p.title, "About the Developer")} subtitle={str(p.name)} />
        <p className="max-w-2xl mx-auto text-text-1 text-center leading-relaxed mb-10">{str(p.body)}</p>
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {displayStats.map((s, i) => (
            <div key={i} className="rounded-2xl border border-border-default bg-bg-2 p-5 text-center shadow-sm">
              <div className="font-display text-2xl font-semibold text-green mb-1">{s.value}</div>
              <div className="text-[11px] uppercase tracking-wider text-text-3">{s.label}</div>
            </div>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (variant === "band") {
    return (
      <section id={str(p.anchor, "builder")} className="px-6 @md:px-10 py-12 bg-green/10 border-y border-green/20">
        <div className="max-w-5xl mx-auto flex flex-col @md:flex-row @md:items-center gap-6 @md:gap-10">
          {str(p.logo) || str(p.image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo || image} alt={str(p.name)} className="h-14 w-auto object-contain shrink-0" />
          ) : null}
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{str(p.name) || str(p.title, "Developer")}</h3>
            <p className="text-text-2 text-sm mt-1 line-clamp-2">{str(p.body)}</p>
            {stats.length > 0 && (
              <div className="flex flex-wrap gap-6 mt-4 pt-3 border-t border-green/20">
                {stats.map((s, i) => (
                  <div key={i}>
                    <div className="font-display text-lg font-bold text-green">{s.value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-text-3">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <SectionShell id={str(p.anchor, "builder")} className="bg-bg-2">
      <div className="grid @lg:grid-cols-2 gap-10 max-w-6xl mx-auto items-center">
        <div>
          {logo || image ? (
            <div className="rounded-2xl border border-border-default bg-white aspect-[4/3] overflow-hidden flex items-center justify-center p-6">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={str(p.name, "Developer")} className="w-full h-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`${str(p.name, "Developer")} logo`} className="max-h-full max-w-full object-contain" />
              )}
            </div>
          ) : null}
          {logo && image ? (
            <div className="mt-4 flex items-center justify-center rounded-xl border border-border-default bg-white px-6 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt={`${str(p.name, "Developer")} logo`} className="h-12 w-auto object-contain" />
            </div>
          ) : null}
        </div>
        <div>
          <Title block={block} title={str(p.title, "About the Developer")} subtitle={str(p.name)} />
          <p className="text-text-1 leading-relaxed whitespace-pre-line">{str(p.body)}</p>
          {stats.length > 0 && (
            <div className="grid grid-cols-2 @md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-border-default/60">
              {stats.map((s, i) => (
                <div key={i} className="rounded-xl border border-border-default bg-bg-1 p-4 text-center shadow-sm">
                  <div className="font-display text-xl @md:text-2xl font-bold text-green mb-1">{s.value}</div>
                  <div className="text-[11px] uppercase tracking-wider text-text-3">{s.label}</div>
                </div>
              ))}
            </div>
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

  const formEl = form ? (
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
  );

  if (variant === "split") {
    const benefits = Array.isArray(block.props.benefits)
      ? (block.props.benefits as unknown[]).map((b) => (typeof b === "string" ? b : String((b as { title?: string }).title || "")))
      : [];
    return (
      <SectionShell id={str(block.props.anchor, "enquire")} className="bg-bg-2">
        <div className="grid @lg:grid-cols-2 gap-10 max-w-5xl mx-auto items-center">
          <div>
            <h2 className="font-display text-3xl @md:text-4xl font-semibold mb-3">{str(block.props.title, "Enquire now")}</h2>
            <p className="text-text-2 text-sm leading-relaxed mb-4">{str(block.props.subtitle, "Share your details and our team will get in touch.")}</p>
            {benefits.length ? (
              <ul className="space-y-2 mb-6">
                {benefits.filter(Boolean).map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm items-start">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-green/15 text-green flex items-center justify-center shrink-0"><Check size={12} /></span>
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
            {str(block.props.image) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={str(block.props.image)} alt="" className="rounded-2xl border border-border-default aspect-[4/3] object-cover w-full" />
            ) : null}
          </div>
          <div className="rounded-2xl border border-border-default bg-bg-1 p-6 @md:p-8">{formEl}</div>
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
              <h2 className="font-display text-2xl font-semibold">{str(block.props.title, "Enquire now")}</h2>
              {str(block.props.subtitle) ? <p className="text-text-2 text-sm mt-1">{str(block.props.subtitle)}</p> : null}
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
        <Title block={block} title={str(block.props.title, "Get in touch")} subtitle={str(block.props.subtitle)} />
        <div className="max-w-lg mx-auto">{formEl}</div>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={str(block.props.anchor, "enquire")}>
      <Title block={block} title={str(block.props.title, "Enquire now")} subtitle={str(block.props.subtitle)} />
      <div className="max-w-lg mx-auto rounded-2xl border border-border-default bg-bg-2 p-6 @md:p-8">
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

  const cta = (
    <button
      type="button"
      className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold"
      onClick={openGate}
    >
      {unlocked ? str(p.unlockedButtonText, "Download PDF") : str(p.buttonText, "Download PDF")}
      <ArrowRight size={16} />
    </button>
  );

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
            <h2 className="font-display text-2xl font-semibold mb-2">{str(p.title, "Download Brochure")}</h2>
            <p className="text-text-2 text-sm mb-6">{str(p.subtitle, "Get the full project brochure as PDF.")}</p>
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
            <h2 className="font-display text-2xl font-semibold mb-1">{str(p.title, "Download Brochure")}</h2>
            <p className="text-text-2 text-sm">{str(p.subtitle, "Share your details to receive the project brochure.")}</p>
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
          <h2 className="font-display text-2xl font-semibold mb-2">{str(p.title, "Brochure")}</h2>
          <p className="text-text-2 text-sm mb-6">{str(p.subtitle, "Download the project brochure PDF.")}</p>
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
          <h2 className="font-display text-3xl font-semibold mb-3">{str(p.title, "Download Brochure")}</h2>
          <p className="text-text-2 text-sm leading-relaxed mb-6">
            {str(p.subtitle, "Share your details to receive the project brochure.")}
          </p>
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
    <SectionShell className="bg-bg-2">
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
