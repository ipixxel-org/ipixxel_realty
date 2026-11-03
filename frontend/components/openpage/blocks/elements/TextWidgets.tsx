"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { isMediaSrc } from "@/lib/media";
import { subElementId } from "@/lib/openpage/element-style";
import { alignClass, clamp, color, flag, itemId, list, num, part, prefersReducedMotion, safeHref, str, strings } from "./shared";

/* ------------------------------------------------------------------ */
/* Icon List                                                           */
/* ------------------------------------------------------------------ */

/** A small icon: an uploaded image, or a short text / emoji, or a tick. */
export function ListIcon({ icon, colour, size = 18 }: { icon: string; colour?: string; size?: number }) {
  if (isMediaSrc(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" style={{ width: size, height: size }} className="object-contain shrink-0" />;
  }
  return (
    <span aria-hidden="true" className="shrink-0 inline-flex items-center justify-center font-semibold text-green leading-none" style={{ color: colour, width: size, height: size, fontSize: size * 0.85 }}>
      {icon || "✓"}
    </span>
  );
}

export function IconListBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const inline = p.layout === "inline";
  const divider = flag(p.divider, false);
  const iconColour = color(p.iconColor);
  const textColour = color(p.textColor);
  const size = clamp(num(p.iconSize, 18), 10, 64);
  const align = alignClass(p.align, "left");
  return (
    <section className="px-6 @md:px-10 py-4">
      <ul className={`flex ${inline ? `flex-row flex-wrap gap-x-6 gap-y-2 ${align}` : "flex-col"} ${align.split(" ")[0]}`}>
        {items.map((item, i) => {
          const id = itemId("items", item, i);
          const href = safeHref(item.link);
          const content = (
            <>
              <El block={block} id={subElementId(id, "icon")} as="span" className="inline-flex shrink-0">
                <ListIcon icon={str(item.icon) || str(p.icon)} colour={iconColour} size={size} />
              </El>
              <El block={block} id={subElementId(id, "text")} as="span" className="text-text-1 text-sm @md:text-base" style={{ color: textColour }}>
                {str(item.text, "List item")}
              </El>
            </>
          );
          return (
            <El
              key={id}
              block={block}
              id={id}
              as="li"
              className={`flex items-center gap-2.5 ${inline ? "" : `py-1.5 ${align}`} ${divider && !inline && i > 0 ? "border-t border-border-default" : ""}`}
            >
              {href ? (
                <a href={href} className="inline-flex items-center gap-2.5 hover:opacity-80">
                  {content}
                </a>
              ) : (
                content
              )}
            </El>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Alert                                                               */
/* ------------------------------------------------------------------ */

const ALERT_TONES = {
  info: { icon: Info, cls: "bg-sky-50 border-sky-300 text-sky-900" },
  success: { icon: CheckCircle2, cls: "bg-emerald-50 border-emerald-300 text-emerald-900" },
  warning: { icon: AlertTriangle, cls: "bg-amber-50 border-amber-300 text-amber-900" },
  danger: { icon: XCircle, cls: "bg-rose-50 border-rose-300 text-rose-900" },
} as const;

export function AlertBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const tone = ALERT_TONES[(str(p.alertType) as keyof typeof ALERT_TONES)] ?? ALERT_TONES.info;
  const Icon = tone.icon;
  const editing = useElementEditor()?.isEditing === true;
  const [closed, setClosed] = useState(false);
  // Dismissing only hides it on the live page; the builder always shows it.
  if (closed && !editing) return null;
  const icon = str(p.icon);
  const title = str(p.title);
  const description = str(p.description);
  return (
    <section className="px-6 @md:px-10 py-3">
      <div role="status" className={`relative flex items-start gap-3 rounded-xl border px-4 py-3.5 ${tone.cls}`} style={{ backgroundColor: color(p.bgColor), borderColor: color(p.borderColor) }}>
        {flag(p.showIcon, true) ? (
          <span className="mt-0.5 shrink-0">{icon ? <ListIcon icon={icon} size={20} /> : <Icon size={20} />}</span>
        ) : null}
        <div className="min-w-0 flex-1 pr-6">
          {title ? (
            <El block={block} id={part(block, "title")} as="p" className="font-semibold text-sm @md:text-base">
              {title}
            </El>
          ) : null}
          {description ? (
            <El block={block} id={part(block, "description")} as="p" className="text-sm opacity-90 mt-0.5 whitespace-pre-line">
              {description}
            </El>
          ) : null}
        </div>
        {flag(p.dismissible, false) ? (
          <button type="button" aria-label="Dismiss" onClick={() => setClosed(true)} className="absolute top-2.5 right-2.5 p-1 rounded-md opacity-60 hover:opacity-100">
            <X size={15} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Animated Headline                                                   */
/* ------------------------------------------------------------------ */

const HEADLINE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p"] as const;
type HeadlineTag = (typeof HEADLINE_TAGS)[number];
const HEADLINE_SIZES: Record<HeadlineTag, string> = {
  h1: "text-4xl @md:text-5xl",
  h2: "text-3xl @md:text-4xl",
  h3: "text-2xl @md:text-3xl",
  h4: "text-xl @md:text-2xl",
  h5: "text-lg @md:text-xl",
  h6: "text-base @md:text-lg",
  p: "text-2xl",
};

/** Index of the word on screen and, for typing, how many letters show. */
export function useRotatingWords(words: string[], mode: string, durationMs: number) {
  const [index, setIndex] = useState(0);
  const [chars, setChars] = useState<number | null>(null);
  const count = words.length;
  useEffect(() => {
    if (count < 2 || prefersReducedMotion()) return;
    if (mode !== "typing") {
      const t = setInterval(() => setIndex((i) => (i + 1) % count), durationMs);
      return () => clearInterval(t);
    }
    // Typing: type the word, hold, delete it, then move to the next word.
    let i = 0;
    let n = words[0].length;
    let deleting = true;
    const hold = Math.max(600, durationMs - 400);
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (deleting) {
        n -= 1;
        if (n <= 0) {
          deleting = false;
          i = (i + 1) % count;
          setIndex(i);
          n = 0;
        }
      } else {
        n += 1;
        if (n >= words[i].length) {
          deleting = true;
          setChars(words[i].length);
          timer = setTimeout(step, hold);
          return;
        }
      }
      setChars(n);
      timer = setTimeout(step, deleting ? 45 : 85);
    };
    timer = setTimeout(step, hold);
    return () => clearTimeout(timer);
    // words is compared by content through the joined key below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, mode, durationMs, words.join("\u0001")]);
  return { index: count ? index % count : 0, chars };
}

export function AnimatedHeadlineBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const requested = str(p.tag, "h2") as HeadlineTag;
  const Tag = HEADLINE_TAGS.includes(requested) ? requested : "h2";
  const words = strings(p.words);
  const shown = words.length ? words : ["Homes"];
  const mode = ["typing", "fade", "slide", "highlight"].includes(str(p.animation)) ? str(p.animation) : "typing";
  const duration = clamp(num(p.duration, 2500), 800, 15000);
  const { index, chars } = useRotatingWords(mode === "highlight" ? [] : shown, mode, duration);
  const word = shown[index] ?? "";
  const accent = color(p.highlightColor);
  const visible = mode === "typing" && chars !== null ? word.slice(0, chars) : word;

  return (
    <section className={`px-6 @md:px-10 py-6 ${alignClass(p.align, "center").split(" ")[0]}`}>
      <El block={block} id={part(block, "title")} as={Tag} className={`font-display font-semibold tracking-tight ${HEADLINE_SIZES[Tag]}`}>
        {str(p.before) ? <span>{str(p.before)} </span> : null}
        <El
          block={block}
          id={part(block, "words")}
          as="span"
          className={`relative inline-block text-green ${mode === "typing" ? "border-r-2 border-current pr-0.5" : ""}`}
          style={{ color: accent }}
          aria-live="polite"
        >
          {mode === "highlight" ? (
            <>
              <span className="relative z-10">{shown.join(" ")}</span>
              <svg aria-hidden="true" viewBox="0 0 200 20" preserveAspectRatio="none" className="absolute left-0 -bottom-1 w-full h-3 op-headline-mark">
                <path d="M2 14 Q 100 2 198 12" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
              </svg>
            </>
          ) : (
            <span key={mode === "typing" ? "t" : index} className={mode === "fade" ? "op-headline-fade" : mode === "slide" ? "op-headline-slide" : undefined}>
              {visible || " "}
            </span>
          )}
        </El>
        {str(p.after) ? <span> {str(p.after)}</span> : null}
      </El>
      <style>{`
        @keyframes op-headline-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes op-headline-slide { from { opacity: 0; transform: translateY(0.4em) } to { opacity: 1; transform: none } }
        @keyframes op-headline-mark { from { stroke-dasharray: 0 400 } to { stroke-dasharray: 400 0 } }
        .op-headline-fade { display: inline-block; animation: op-headline-fade .5s ease both }
        .op-headline-slide { display: inline-block; animation: op-headline-slide .45s ease both }
        .op-headline-mark path { animation: op-headline-mark 1.2s ease both }
        @media (prefers-reduced-motion: reduce) { .op-headline-fade, .op-headline-slide, .op-headline-mark path { animation: none } }
      `}</style>
    </section>
  );
}
