"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Link2,
  Mail,
  MessageCircle,
  Play,
  Search,
  Share2,
  X,
} from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { subElementId } from "@/lib/openpage/element-style";
import { color, flag, itemId, list, num, part, safeHref, str, strings } from "./shared";

function SectionHeading({ block, fallback }: { block: BlockConfig; fallback?: string }) {
  const title = str(block.props.title, fallback ?? "");
  const subtitle = str(block.props.subtitle);
  if (!title && !subtitle) return null;
  return (
    <div className="text-center max-w-2xl mx-auto mb-8">
      {title ? (
        <El block={block} id={part(block, "title")} as="h2" className="font-display font-semibold text-3xl @md:text-4xl tracking-tight">
          {title}
        </El>
      ) : null}
      {subtitle ? (
        <El block={block} id={part(block, "subtitle")} as="p" className="mt-2 text-text-2">
          {subtitle}
        </El>
      ) : null}
    </div>
  );
}

export function videoEmbedUrl(raw: unknown): string {
  const url = str(raw).trim();
  if (!url) return "";
  try {
    const parsed = new URL(url, "https://example.com");
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (host.endsWith("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }
  } catch {
    return "";
  }
  return "";
}

function NestedAccordion({
  block,
  parentId,
  items,
  startOpen,
}: {
  block: BlockConfig;
  parentId: string;
  items: Array<Record<string, unknown>>;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState<number | null>(startOpen ? 0 : null);
  return (
    <div className="mt-3 space-y-2 border-l border-border-default pl-3">
      {items.map((sub, j) => {
        const id = `${parentId}-sub-${j}`;
        const isOpen = open === j;
        return (
          <div key={id} className="rounded-lg border border-border-default bg-bg-2/40">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : j)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <El block={block} id={subElementId(id, "title")} as="span" className="text-sm font-medium text-text-0">
                {str(sub.title, "Nested question")}
              </El>
              <ChevronDown size={14} className={`shrink-0 text-text-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen ? (
              <El block={block} id={subElementId(id, "content")} as="p" className="px-3 pb-3 text-sm text-text-2 whitespace-pre-line">
                {str(sub.content)}
              </El>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function AccordionBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const allowMultiple = flag(p.allowMultiple, false);
  const openFirst = flag(p.openFirst, true);
  const [open, setOpen] = useState<number[]>(openFirst && items.length > 0 ? [0] : []);

  const toggle = (index: number) => {
    setOpen((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      return allowMultiple ? [...prev, index] : [index];
    });
  };

  return (
    <section className="px-6 @md:px-10 py-12">
      <div className="max-w-3xl mx-auto">
        <SectionHeading block={block} />
        <div className="space-y-2">
          {items.map((item, i) => {
            const id = itemId("items", item, i);
            const isOpen = open.includes(i);
            const nested = list<Record<string, unknown>>(item.items);
            return (
              <El
                key={id}
                block={block}
                id={id}
                className="rounded-xl border border-border-default bg-bg-1 overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-bg-2/60 transition-colors"
                >
                  <El block={block} id={subElementId(id, "title")} as="span" className="text-[15px] font-semibold text-text-0">
                    {str(item.title, "Question")}
                  </El>
                  <ChevronDown size={18} className={`shrink-0 text-text-3 transition-transform duration-200 ${isOpen ? "rotate-180 text-green" : ""}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${isOpen ? "max-h-[1200px]" : "max-h-0"}`}>
                  <El block={block} id={subElementId(id, "content")} as="div" className="px-4 pb-4 text-sm text-text-2 leading-relaxed whitespace-pre-line">
                    {str(item.content)}
                  </El>
                  {nested.length > 0 ? (
                    <div className="px-4 pb-4">
                      <NestedAccordion block={block} parentId={id} items={nested} startOpen={false} />
                    </div>
                  ) : null}
                </div>
              </El>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function VideoGalleryBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const items = list(p.items);
  const columns = Math.min(4, Math.max(1, Math.round(num(p.columns, 3))));
  const editing = useElementEditor()?.isEditing === true;
  const [active, setActive] = useState<number | null>(null);
  const colsClass = columns === 1 ? "" : columns === 2 ? "@md:grid-cols-2" : columns === 3 ? "@md:grid-cols-2 @4xl:grid-cols-3" : "@md:grid-cols-2 @4xl:grid-cols-4";
  const current = active === null ? null : items[active];

  return (
    <section className="px-6 @md:px-10 py-12">
      <div className="max-w-6xl mx-auto">
        <SectionHeading block={block} />
        <div className={`grid grid-cols-1 ${colsClass} gap-4`}>
          {items.map((item, i) => {
            const id = itemId("items", item, i);
            const src = str(item.thumbnail);
            const embed = videoEmbedUrl(item.url);
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (editing || !embed) return;
                  setActive(i);
                }}
                className="group relative aspect-video rounded-xl overflow-hidden border border-border-default bg-slate-200 text-left"
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={str(item.title, "Video")} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
                  <span className="w-12 h-12 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-md">
                    <Play size={20} className="ml-0.5" fill="currentColor" />
                  </span>
                </span>
                <span className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                  <El block={block} id={subElementId(id, "title")} as="span" className="text-white text-sm font-medium">
                    {str(item.title, "Video")}
                  </El>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {current ? (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={str(current.title, "Video")}>
          <button type="button" aria-label="Close video" onClick={() => setActive(null)} className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
            <X size={20} />
          </button>
          <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
            <iframe src={videoEmbedUrl(current.url)} title={str(current.title, "Video")} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ImageComparisonBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const before = str(p.beforeImage);
  const after = str(p.afterImage);
  const start = Math.min(100, Math.max(0, num(p.startPercent, 50)));
  const [pos, setPos] = useState(start);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClientX = (clientX: number) => {
    const el = frame.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current) updateFromClientX(e.clientX);
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  return (
    <section className="px-6 @md:px-10 py-12">
      <div className="max-w-5xl mx-auto">
        <SectionHeading block={block} />
        <div
          ref={frame}
          className="relative aspect-[16/10] rounded-xl overflow-hidden border border-border-default bg-slate-200 select-none touch-none cursor-ew-resize"
          onPointerDown={(e) => {
            dragging.current = true;
            updateFromClientX(e.clientX);
          }}
        >
          {after ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={after} alt={str(p.afterLabel, "After")} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-sky-200" />
          )}
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
            {before ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={before} alt={str(p.beforeLabel, "Before")} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-500" />
            )}
          </div>
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-semibold">
            <El block={block} id={part(block, "beforeLabel")} as="span">{str(p.beforeLabel, "Before")}</El>
          </span>
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-semibold">
            <El block={block} id={part(block, "afterLabel")} as="span">{str(p.afterLabel, "After")}</El>
          </span>
          <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${pos}%` }}>
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-md">
              <span className="text-xs font-bold tracking-tighter">‹ ›</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            aria-label="Comparison position"
            onChange={(e) => setPos(Number(e.target.value))}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 w-2/3 accent-white opacity-0 hover:opacity-100 focus:opacity-100"
          />
        </div>
      </div>
    </section>
  );
}

const SHARE_NETWORKS: Record<string, { label: string; href: (url: string, title: string) => string }> = {
  facebook: {
    label: "Facebook",
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  x: {
    label: "X",
    href: (url, title) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  linkedin: {
    label: "LinkedIn",
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  whatsapp: {
    label: "WhatsApp",
    href: (url, title) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`.trim())}`,
  },
  email: {
    label: "Email",
    href: (url, title) => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  },
};

export function SocialShareBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const editing = useElementEditor()?.isEditing === true;
  const requested = strings(p.networks);
  const networks = requested.length ? requested : ["facebook", "x", "linkedin", "whatsapp", "email"];
  const [copied, setCopied] = useState(false);
  const currentUrl = str(p.url) || (typeof window !== "undefined" ? window.location.href : "");
  const title = str(p.title) || (typeof document !== "undefined" ? document.title : "");

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="px-6 @md:px-10 py-6">
      <div className="flex flex-wrap items-center gap-2">
        {str(p.label, "Share") ? (
          <span className="text-sm font-medium text-text-2 mr-1">{str(p.label, "Share")}</span>
        ) : null}
        {networks.map((key) => {
          const network = SHARE_NETWORKS[key.toLowerCase()];
          if (!network) return null;
          return (
            <a
              key={key}
              href={network.href(currentUrl, title)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Share on ${network.label}`}
              onClick={(e) => {
                if (editing) e.preventDefault();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-1 px-3 py-1.5 text-xs font-medium text-text-1 hover:border-green hover:text-green transition-colors"
            >
              {key.toLowerCase() === "email" ? <Mail size={13} /> : key.toLowerCase() === "whatsapp" ? <MessageCircle size={13} /> : <Share2 size={13} />}
              {network.label}
            </a>
          );
        })}
        {flag(p.showCopy, true) ? (
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-1 px-3 py-1.5 text-xs font-medium text-text-1 hover:border-green hover:text-green transition-colors"
          >
            <Link2 size={13} />
            {copied ? "Copied" : "Copy link"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function PopupTriggerBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const [open, setOpen] = useState(false);
  const href = safeHref(p.url);
  const label = str(p.label, "Open popup");
  const bg = color(p.buttonColor) ?? "#111827";
  const fg = color(p.textColor) ?? "#ffffff";
  const radius = Math.max(0, num(p.radius, 8));

  if (href && str(p.mode, "popup") === "link") {
    return (
      <section className="px-6 @md:px-10 py-4">
        <a href={href} className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90" style={{ backgroundColor: bg, color: fg, borderRadius: radius }}>
          {label}
        </a>
      </section>
    );
  }

  return (
    <section className="px-6 @md:px-10 py-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
        style={{ backgroundColor: bg, color: fg, borderRadius: radius }}
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={str(p.popupTitle, label)} onClick={() => setOpen(false)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-bg-1 border border-border-default shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Close popup" onClick={() => setOpen(false)} className="absolute top-3 right-3 p-1.5 rounded-lg text-text-3 hover:bg-bg-3 hover:text-text-0">
              <X size={16} />
            </button>
            <h3 className="font-display font-semibold text-xl text-text-0 pr-8">{str(p.popupTitle, "Get in touch")}</h3>
            <p className="mt-2 text-sm text-text-2 whitespace-pre-line">{str(p.popupContent, "Add your popup message in the Content tab.")}</p>
            {str(p.popupCtaLabel) ? (
              <a href={safeHref(p.popupCtaUrl) || "#"} className="mt-4 inline-flex rounded-lg bg-green px-4 py-2 text-sm font-semibold text-black hover:bg-green-dim transition-colors">
                {str(p.popupCtaLabel)}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SiteSearchBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const editing = useElementEditor()?.isEditing === true;
  const action = safeHref(p.targetPath) || "/search";
  return (
    <section className="px-6 @md:px-10 py-4">
      <form
        role="search"
        action={action}
        method="get"
        onSubmit={(e) => {
          if (editing) e.preventDefault();
        }}
        className="flex w-full max-w-xl items-center gap-2"
      >
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            type="search"
            name={str(p.queryParam, "q") || "q"}
            placeholder={str(p.placeholder, "Search…")}
            className="w-full rounded-lg border border-border-default bg-bg-1 py-2.5 pl-9 pr-3 text-sm text-text-0 placeholder:text-text-3 outline-none focus:border-green"
          />
        </label>
        <button type="submit" className="rounded-lg bg-green px-4 py-2.5 text-sm font-semibold text-black hover:bg-green-dim transition-colors">
          {str(p.buttonLabel, "Search")}
        </button>
      </form>
    </section>
  );
}
