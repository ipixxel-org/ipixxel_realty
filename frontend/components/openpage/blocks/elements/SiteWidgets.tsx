"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ListOrdered, X } from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { useOpenPageRuntime } from "@/components/openpage/runtime/OpenPageRuntime";
import { DynamicLeadForm } from "@/components/openpage/dynamic-lead-form";
import { findFormById, loadFormLibrary } from "@/lib/openpage/forms-store";
import { pageFormsWithLibraryFallback } from "@/lib/openpage/resolve-form";
import { alignClass, clamp, color, flag, list, num, part, safeHref, str } from "./shared";

const TITLE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span"] as const;
type TitleTag = (typeof TITLE_TAGS)[number];
const pickTag = (v: unknown, fallback: TitleTag): TitleTag => (TITLE_TAGS.includes(v as TitleTag) ? (v as TitleTag) : fallback);

/* ------------------------------------------------------------------ */
/* Site Logo / Site Title / Page Title                                 */
/* ------------------------------------------------------------------ */

export function SiteLogoBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const runtime = useOpenPageRuntime();
  const image = str(p.image);
  const width = clamp(num(p.width, 160), 40, 600);
  const href = safeHref(p.link) || "/";
  const name = str(p.alt) || runtime.projectName || "Logo";
  return (
    <section className="px-6 @md:px-10 py-4">
      <div className={`flex ${alignClass(p.align, "left")}`}>
        <a href={href} aria-label={name} className="inline-flex hover:opacity-90">
          <El block={block} id={part(block, "logo")} className="inline-flex items-center">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={name} style={{ width, maxWidth: "100%" }} className="h-auto object-contain" />
            ) : (
              // No logo uploaded: the project name stands in.
              <span className="font-display font-bold text-2xl tracking-tight">{name}</span>
            )}
          </El>
        </a>
      </div>
    </section>
  );
}

export function SiteTitleBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const runtime = useOpenPageRuntime();
  const Tag = pickTag(p.tag, "p");
  const text = str(p.text) || runtime.projectName || "Site title";
  const href = safeHref(p.link);
  const title = (
    <El block={block} id={part(block, "title")} as={Tag} className="font-display font-semibold text-2xl tracking-tight">
      {text}
    </El>
  );
  return (
    <section className={`px-6 @md:px-10 py-3 ${alignClass(p.align, "left").split(" ")[0]}`}>
      {href ? <a href={href} className="hover:opacity-90">{title}</a> : title}
    </section>
  );
}

export function PageTitleBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const runtime = useOpenPageRuntime();
  const Tag = pickTag(p.tag, "h1");
  const text = str(p.text) || runtime.projectName || "Page title";
  return (
    <section className={`px-6 @md:px-10 py-8 ${alignClass(p.align, "center").split(" ")[0]}`}>
      <El block={block} id={part(block, "title")} as={Tag} className="font-display font-bold text-4xl @md:text-5xl tracking-tight">
        {text}
      </El>
      {str(p.subtitle) ? (
        <El block={block} id={part(block, "subtitle")} as="p" className="mt-3 text-text-2 text-base @md:text-lg">
          {str(p.subtitle)}
        </El>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Breadcrumbs                                                         */
/* ------------------------------------------------------------------ */

const SEPARATORS = ["/", "›", "»", "•", "|", "→"];

export function BreadcrumbsBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const sep = SEPARATORS.includes(str(p.separator)) ? str(p.separator) : "›";
  const crumbs = [
    ...(flag(p.showHome, true) ? [{ label: str(p.homeLabel, "Home"), url: safeHref(p.homeUrl) || "/" }] : []),
    ...list(p.items).map((it) => ({ label: str(it.label), url: safeHref(it.url) })),
  ].filter((c) => c.label);
  return (
    <section className="px-6 @md:px-10 py-3">
      <nav aria-label="Breadcrumb">
        <ol className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${alignClass(p.align, "left")}`}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className="flex items-center gap-2">
                {last || !c.url ? (
                  <El block={block} id={part(block, last ? "current" : "link")} as="span" className={last ? "text-text-0 font-medium" : "text-text-2"} aria-current={last ? "page" : undefined}>
                    {c.label}
                  </El>
                ) : (
                  <a href={c.url} className="text-text-2 hover:text-green transition-colors">
                    <El block={block} id={part(block, "link")} as="span">
                      {c.label}
                    </El>
                  </a>
                )}
                {!last ? <span aria-hidden="true" className="text-text-3" style={{ color: color(p.separatorColor) }}>{sep}</span> : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Table of Contents                                                   */
/* ------------------------------------------------------------------ */

type TocEntry = { id: string; text: string; level: number };

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

const LEVELS: Record<string, string> = { h2: "h2", "h2-h3": "h2, h3", "h2-h4": "h2, h3, h4" };

/** Reads the page's headings (inside the same page root) and gives each an id. */
export function collectHeadings(root: ParentNode, selector: string, exclude: Element | null): TocEntry[] {
  const used = new Set<string>();
  const out: TocEntry[] = [];
  root.querySelectorAll<HTMLElement>(selector).forEach((h) => {
    if (exclude && exclude.contains(h)) return;
    const text = (h.textContent || "").trim();
    if (!text) return;
    let id = h.id;
    if (!id) {
      const base = slugify(text);
      id = base;
      let n = 2;
      while (used.has(id) || (document.getElementById(id) && document.getElementById(id) !== h)) id = `${base}-${n++}`;
      h.id = id;
    }
    used.add(id);
    out.push({ id, text, level: Number(h.tagName.slice(1)) || 2 });
  });
  return out;
}

export function TableOfContentsBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const selector = LEVELS[str(p.headings)] ?? LEVELS["h2-h3"];
  const numbered = flag(p.numbered, false);
  const collapsible = flag(p.collapsible, true);
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [open, setOpen] = useState(!flag(p.startCollapsed, false));
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const self = ref.current;
    if (!self) return;
    // The page root: the published site / preview, or the builder canvas.
    const root = self.closest(".op-site") || self.closest("[data-op-canvas]") || document.body;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setEntries(collectHeadings(root, selector, self)));
    };
    refresh();
    // Keep the list current while the page is edited.
    const mo = new MutationObserver(refresh);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
    };
  }, [selector]);

  const minLevel = entries.reduce((m, e) => Math.min(m, e.level), 6);
  const Tag = numbered ? "ol" : "ul";
  return (
    <section ref={ref} className="px-6 @md:px-10 py-4">
      <div className="max-w-xl rounded-xl border border-border-default bg-bg-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <El block={block} id={part(block, "title")} as="p" className="font-semibold text-sm flex items-center gap-2">
            <ListOrdered size={16} className="text-green" />
            {str(p.title, "Table of Contents")}
          </El>
          {collapsible ? (
            <button type="button" aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} className="p-1 rounded-md hover:bg-bg-3">
              <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          ) : null}
        </div>
        {open || !collapsible ? (
          entries.length ? (
            <Tag className={`mt-3 space-y-1.5 text-sm ${numbered ? "list-decimal pl-5" : ""}`}>
              {entries.map((e) => (
                <li key={e.id} style={{ marginLeft: (e.level - minLevel) * 14 }}>
                  <a
                    href={`#${e.id}`}
                    className="text-text-1 hover:text-green transition-colors"
                    onClick={(ev) => {
                      const target = document.getElementById(e.id);
                      if (!target) return;
                      ev.preventDefault();
                      target.scrollIntoView({ behavior: "smooth", block: "start" });
                      history.replaceState(null, "", `#${e.id}`);
                    }}
                  >
                    {e.text}
                  </a>
                </li>
              ))}
            </Tag>
          ) : (
            <p className="mt-3 text-xs text-text-3">Headings on this page will be listed here.</p>
          )
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Off-Canvas (slide-in enquiry panel)                                 */
/* ------------------------------------------------------------------ */

export function OffCanvasBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const runtime = useOpenPageRuntime();
  const editing = useElementEditor()?.isEditing === true;
  const [open, setOpen] = useState(false);
  // The panel is drawn on document.body (like the site popups): the site
  // root is a CSS container, which would trap a fixed panel inside the page.
  // Set on click, so it only exists in the browser.
  const [target, setTarget] = useState<Element | null>(null);
  const titleId = useId();
  const side = str(p.position) === "left" ? "left" : "right";
  const width = clamp(num(p.width, 420), 260, 720);
  const showForm = flag(p.showForm, true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Lock page scroll on the live page only (never the builder).
    const prev = document.body.style.overflow;
    if (!editing) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, editing]);

  const forms = open ? pageFormsWithLibraryFallback(runtime.forms, loadFormLibrary()) : runtime.forms;
  const formId = str(p.formId);
  const form = showForm ? (formId ? findFormById(formId, forms) : forms[0]) : undefined;

  const panel = open && target ? (
    <div className="fixed inset-0 z-[1000]" role="presentation">
      <div className="absolute inset-0 bg-black/50 op-oc-fade" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute top-0 ${side}-0 h-full max-w-full bg-white text-slate-900 shadow-2xl flex flex-col ${side === "left" ? "op-oc-left" : "op-oc-right"}`}
        style={{ width, backgroundColor: color(p.panelBg) }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <p id={titleId} className="font-display font-semibold text-lg">{str(p.panelTitle, "Enquire now")}</p>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-slate-100" autoFocus>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {str(p.body) ? <p className="text-sm text-slate-600 whitespace-pre-line">{str(p.body)}</p> : null}
          {showForm ? (
            form ? (
              <DynamicLeadForm
                form={form}
                live={runtime.live}
                pageId={runtime.pageId}
                place="off-canvas"
                projectName={runtime.projectName}
                projectId={runtime.projectId}
                unitId={runtime.unitId}
              />
            ) : (
              <p className="text-sm text-slate-500">Select a form in the Content tab.</p>
            )
          ) : null}
        </div>
      </div>
      <style>{`
        @keyframes op-oc-in-r { from { transform: translateX(100%) } to { transform: none } }
        @keyframes op-oc-in-l { from { transform: translateX(-100%) } to { transform: none } }
        @keyframes op-oc-fade { from { opacity: 0 } to { opacity: 1 } }
        .op-oc-right { animation: op-oc-in-r .3s ease both }
        .op-oc-left { animation: op-oc-in-l .3s ease both }
        .op-oc-fade { animation: op-oc-fade .3s ease both }
        @media (prefers-reduced-motion: reduce) { .op-oc-right, .op-oc-left, .op-oc-fade { animation: none } }
      `}</style>
    </div>
  ) : null;

  return (
    <section className="px-6 @md:px-10 py-4">
      <div className={`flex ${alignClass(p.align, "center")}`}>
        <El
          block={block}
          id={part(block, "button")}
          as="button"
          type="button"
          aria-haspopup="dialog"
          onClick={(e: React.MouseEvent<HTMLElement>) => {
            setTarget(e.currentTarget.ownerDocument.body);
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold shadow-sm hover:opacity-90"
          style={{ backgroundColor: color(p.buttonColor), color: color(p.buttonTextColor) }}
        >
          {str(p.buttonText, "Enquire Now")}
        </El>
      </div>
      {panel && target ? createPortal(panel, target) : null}
    </section>
  );
}
