"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { alignClass, clamp, color, flag, list, num, part, safeHref, str } from "./shared";

/* ------------------------------------------------------------------ */
/* Hamburger Menu                                                      */
/* ------------------------------------------------------------------ */

type MenuLink = { label: string; url: string; target: "_self" | "_blank"; active: boolean };

type Loc = { pathname: string; hash: string; origin: string };

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/**
 * True when a menu link points at the page the visitor is on.
 * `#section` links match the current hash; page links match the path
 * (and the hash too, when the link has one). Other sites never match.
 */
export function isActiveHref(href: string, loc: Loc | null): boolean {
  if (!href || !loc) return false;
  if (href.startsWith("#")) return href.length > 1 && loc.hash === href;
  let url: URL;
  try {
    url = new URL(href, `${loc.origin}${loc.pathname}`);
  } catch {
    return false;
  }
  if (url.origin !== loc.origin) return false;
  if (trimSlash(url.pathname) !== trimSlash(loc.pathname)) return false;
  return url.hash ? url.hash === loc.hash : true;
}

function readLinks(v: unknown): MenuLink[] {
  return list(v)
    .map((it) => ({
      label: str(it.label).trim(),
      url: safeHref(it.url),
      target: (str(it.target) === "_blank" ? "_blank" : "_self") as MenuLink["target"],
      active: flag(it.active, false),
    }))
    .filter((l) => l.label);
}

export function HamburgerMenuBlock({ block }: { block: BlockConfig }) {
  const p = block.props;
  const editing = useElementEditor()?.isEditing === true;
  const [open, setOpen] = useState(false);
  // Drawn on document.body: the page root is a CSS container, which would
  // trap a fixed panel inside the page (same as Off-Canvas).
  const [target, setTarget] = useState<Element | null>(null);
  // Read after mount only, so server and browser render the same markup.
  const [loc, setLoc] = useState<Loc | null>(null);
  const [clicked, setClicked] = useState<number | null>(null);
  const titleId = useId();

  const links = readLinks(p.items);
  const side = str(p.position) === "left" ? "left" : "right";
  const width = clamp(num(p.width, 320), 220, 640);
  const iconSize = clamp(num(p.iconSize, 28), 16, 64);
  const inlineOnDesktop = str(p.display) === "inline-desktop";
  const panelTitle = str(p.panelTitle);

  useEffect(() => {
    const read = () => setLoc({ pathname: window.location.pathname, hash: window.location.hash, origin: window.location.origin });
    read();
    const onNav = () => {
      setClicked(null);
      read();
    };
    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);
    return () => {
      window.removeEventListener("hashchange", onNav);
      window.removeEventListener("popstate", onNav);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    if (!editing) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, editing]);

  // A link the visitor just clicked wins; otherwise links marked "Active"
  // in the inspector, or the one matching the current page / section.
  const isActive = (l: MenuLink, i: number) => (clicked !== null ? clicked === i : l.active || isActiveHref(l.url, loc));

  // Colours as CSS variables so hover / active work on the inline links and
  // on the panel (which lives outside the block, on document.body).
  const vars = {
    "--hm-link": color(p.linkColor) ?? "currentColor",
    "--hm-active": color(p.activeLinkColor) ?? "var(--color-green, #16a34a)",
    "--hm-hover": color(p.hoverLinkColor) ?? color(p.activeLinkColor) ?? "var(--color-green, #16a34a)",
  } as CSSProperties;

  const linkClass = (active: boolean) =>
    `op-hm-link transition-colors ${active ? "op-hm-active font-semibold" : ""}`;

  const renderLink = (l: MenuLink, i: number, inPanel: boolean) => {
    const active = isActive(l, i);
    const className = `${linkClass(active)} ${inPanel ? "block py-3 text-base border-b border-black/5" : "text-sm"}`;
    const onClick = () => {
      setClicked(i);
      if (inPanel) setOpen(false);
    };
    return l.url ? (
      <a
        key={i}
        href={l.url}
        target={l.target}
        rel={l.target === "_blank" ? "noopener noreferrer" : undefined}
        aria-current={active ? "page" : undefined}
        className={className}
        onClick={onClick}
      >
        {l.label}
      </a>
    ) : (
      <span key={i} className={className} aria-current={active ? "page" : undefined}>
        {l.label}
      </span>
    );
  };

  const styles = `
    .op-hm-link { color: var(--hm-link) }
    .op-hm-link:hover, .op-hm-link:focus-visible { color: var(--hm-hover) }
    .op-hm-link.op-hm-active { color: var(--hm-active) }
    @keyframes op-hm-in-r { from { transform: translateX(100%) } to { transform: none } }
    @keyframes op-hm-in-l { from { transform: translateX(-100%) } to { transform: none } }
    @keyframes op-hm-fade { from { opacity: 0 } to { opacity: 1 } }
    .op-hm-right { animation: op-hm-in-r .3s ease both }
    .op-hm-left { animation: op-hm-in-l .3s ease both }
    .op-hm-fade { animation: op-hm-fade .3s ease both }
    @media (prefers-reduced-motion: reduce) { .op-hm-right, .op-hm-left, .op-hm-fade { animation: none } }
  `;

  const panel = open && target ? (
    <div className="fixed inset-0 z-[1000]" role="presentation" style={vars}>
      <div className="absolute inset-0 bg-black/50 op-hm-fade" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={panelTitle ? titleId : undefined}
        aria-label={panelTitle ? undefined : "Menu"}
        className={`absolute top-0 ${side}-0 h-full max-w-full bg-white text-slate-900 shadow-2xl flex flex-col ${side === "left" ? "op-hm-left" : "op-hm-right"}`}
        style={{ width, backgroundColor: color(p.panelBg) }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          {panelTitle ? (
            <p id={titleId} className="font-display font-semibold text-lg" style={{ color: color(p.panelTitleColor) }}>
              {panelTitle}
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md hover:bg-black/5"
            // Empty: same colour as the hamburger icon (as before).
            style={{ color: color(p.closeIconColor) ?? color(p.iconColor) }}
            autoFocus
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Menu" className="flex-1 overflow-y-auto px-5 pb-6">
          {links.length ? links.map((l, i) => renderLink(l, i, true)) : (
            <p className="text-sm text-slate-500">Add menu links in the Content tab.</p>
          )}
        </nav>
      </div>
      <style>{styles}</style>
    </div>
  ) : null;

  return (
    <section className="px-6 @md:px-10 py-4" style={vars}>
      <div className={`flex items-center ${alignClass(p.align, "right")}`}>
        {inlineOnDesktop ? (
          <nav aria-label="Menu" className="hidden @md:flex flex-wrap items-center gap-x-6 gap-y-2">
            {links.map((l, i) => renderLink(l, i, false))}
          </nav>
        ) : null}
        <El
          block={block}
          id={part(block, "toggle")}
          as="button"
          type="button"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e: React.MouseEvent<HTMLElement>) => {
            setTarget(e.currentTarget.ownerDocument.body);
            setOpen(true);
          }}
          className={`inline-flex items-center justify-center p-2 rounded-md hover:bg-black/5 ${inlineOnDesktop ? "@md:hidden" : ""}`}
          style={{ color: color(p.iconColor) }}
        >
          <Menu size={iconSize} />
        </El>
      </div>
      <style>{styles}</style>
      {panel && target ? createPortal(panel, target) : null}
    </section>
  );
}
