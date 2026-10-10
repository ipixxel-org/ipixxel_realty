"use client";

import { useState, type MouseEvent } from "react";
import type { BlockConfig } from "../types";
import { Menu, X, Phone, Mail, ChevronDown } from "lucide-react";

export type NavMenuItem = {
  label: string;
  /** Section id without # — e.g. "amenities", "plans", "enquire" */
  id?: string;
  href?: string;
  /** PDF marketplace nav — show caret (visual only in builder preview). */
  dropdown?: boolean;
};

interface NavbarProps {
  logo: string;
  logoImage?: string;
  logoSize?: number | string;
  /** Legacy string labels or structured { label, id } menu items. */
  links?: Array<string | NavMenuItem>;
  menuItems?: NavMenuItem[];
  ctaText: string;
  ctaId?: string;
  ctaHref?: string;
  phone?: string;
  email?: string;
  badge?: string;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Normalize any stored navbar links into label + hash target. */
export function normalizeNavLinks(
  links?: Array<string | NavMenuItem>,
  menuItems?: NavMenuItem[],
): Array<{ label: string; href: string }> {
  const source = (menuItems && menuItems.length ? menuItems : links) ?? [];
  return source
    .map((item) => {
      if (typeof item === "string") {
        const label = item.trim();
        if (!label) return null;
        return { label, href: `#${slugify(label)}` };
      }
      const label = String(item.label || "").trim();
      if (!label) return null;
      const raw = String(item.href || item.id || "").trim();
      const id = raw.replace(/^#/, "") || slugify(label);
      return { label, href: `#${id}` };
    })
    .filter(Boolean) as Array<{ label: string; href: string }>;
}

function scrollToHash(href: string) {
  if (typeof document === "undefined") return;
  const id = href.replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }
}

function handleNavClick(e: MouseEvent<HTMLAnchorElement>, href: string, onClick?: () => void) {
  if (!href.startsWith("#")) {
    onClick?.();
    return;
  }
  e.preventDefault();
  scrollToHash(href);
  onClick?.();
}

function NavLinks({
  items,
  onClick,
  className = "text-[13px] text-text-2 hover:text-text-0 transition-colors",
  dropdownKeys,
}: {
  items: Array<{ label: string; href: string }>;
  onClick?: () => void;
  className?: string;
  dropdownKeys?: Set<string>;
}) {
  return (
    <>
      {items.map((item, i) => (
        <a
          key={`${item.href}-${i}`}
          href={item.href}
          onClick={(e) => handleNavClick(e, item.href, onClick)}
          className={`inline-flex items-center gap-1 ${className}`}
        >
          {item.label}
          {dropdownKeys?.has(item.label) ? <ChevronDown size={14} className="opacity-60 shrink-0" /> : null}
        </a>
      ))}
    </>
  );
}

function marketingDropdownLabels(
  links?: Array<string | NavMenuItem>,
  menuItems?: NavMenuItem[],
): Set<string> {
  const source = (menuItems && menuItems.length ? menuItems : links) ?? [];
  const out = new Set<string>();
  for (const item of source) {
    if (typeof item === "string") continue;
    if (item.dropdown && item.label) out.add(String(item.label).trim());
  }
  return out;
}

function Brand({ logo, logoImage, logoSize = 32 }: { logo: string; logoImage?: string; logoSize?: number | string }) {
  const size = Number(logoSize) || 32;
  return (
    <div className="flex items-center gap-2">
      {logoImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoImage}
          alt={logo}
          style={{ height: `${size}px` }}
          className="w-auto object-contain max-h-[120px]"
        />
      ) : (
        <div
          style={{ width: `${size}px`, height: `${size}px` }}
          className="rounded-lg bg-green/10 flex items-center justify-center shrink-0"
        >
          <div
            style={{ width: `${Math.max(4, Math.round(size * 0.5))}px`, height: `${Math.max(4, Math.round(size * 0.5))}px` }}
            className="rounded-full bg-green"
          />
        </div>
      )}
      <span className="font-semibold text-[15px] text-text-0 tracking-tight font-display">{logo}</span>
    </div>
  );
}

function CtaButton({
  text,
  href,
  onClick,
}: {
  text: string;
  href: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={(e) => handleNavClick(e, href, onClick)}
      className="px-4 py-2 rounded-full bg-green text-white text-[13px] font-semibold hover:bg-green-dim transition-all hover:accent-glow-md"
    >
      {text}
    </a>
  );
}

function resolveCtaHref(props: NavbarProps): string {
  const raw = String(props.ctaHref || props.ctaId || "enquire").trim();
  if (!raw) return "#enquire";
  if (raw.startsWith("#") || raw.startsWith("http") || raw.startsWith("/")) return raw;
  return `#${raw}`;
}

function NavbarDefault({ props, sticky }: { props: NavbarProps; sticky?: boolean }) {
  const { logo, logoImage, ctaText } = props;
  const items = normalizeNavLinks(props.links, props.menuItems);
  const ctaHref = resolveCtaHref(props);
  const [open, setOpen] = useState(false);

  return (
    <nav className={`${sticky ? "sticky top-0 z-40 backdrop-blur-md bg-bg-1/90 border-b border-border-subtle" : ""} px-6 @md:px-10 py-3.5`}>
      <div className="flex items-center justify-between gap-4">
        <Brand logo={logo} logoImage={logoImage} logoSize={props.logoSize} />
        <div className="hidden @2xl:flex items-center gap-7">
          <NavLinks items={items} />
        </div>
        <div className="flex items-center gap-3">
          {ctaText ? <CtaButton text={ctaText} href={ctaHref} /> : null}
          <button
            type="button"
            className="@2xl:hidden w-9 h-9 rounded-lg border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="@2xl:hidden flex flex-col gap-3 pt-4 pb-2">
          <NavLinks items={items} onClick={() => setOpen(false)} />
        </div>
      ) : null}
    </nav>
  );
}

function NavbarCentered({ props }: { props: NavbarProps }) {
  const { logo, logoImage, ctaText } = props;
  const items = normalizeNavLinks(props.links, props.menuItems);
  const ctaHref = resolveCtaHref(props);
  const mid = Math.ceil(items.length / 2);
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-bg-1/90 border-b border-border-subtle px-6 @md:px-10 py-3.5">
      <div className="flex items-center justify-between">
        <div className="hidden @2xl:flex items-center gap-6 flex-1">
          <NavLinks items={items.slice(0, mid)} />
        </div>
        <Brand logo={logo} logoImage={logoImage} logoSize={props.logoSize} />
        <div className="hidden @2xl:flex items-center gap-6 flex-1 justify-end">
          <NavLinks items={items.slice(mid)} />
          {ctaText ? <CtaButton text={ctaText} href={ctaHref} /> : null}
        </div>
        <button
          type="button"
          className="@2xl:hidden w-9 h-9 rounded-lg border border-border-default flex items-center justify-center"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          {open ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>
      {open ? (
        <div className="@2xl:hidden flex flex-col gap-3 pt-4">
          <NavLinks items={items} onClick={() => setOpen(false)} />
          {ctaText ? <CtaButton text={ctaText} href={ctaHref} onClick={() => setOpen(false)} /> : null}
        </div>
      ) : null}
    </nav>
  );
}

function NavbarDual({ props }: { props: NavbarProps }) {
  const { logo, logoImage, ctaText, phone, email, badge } = props;
  const items = normalizeNavLinks(props.links, props.menuItems);
  const ctaHref = resolveCtaHref(props);
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 bg-bg-1/95 backdrop-blur-md border-b border-border-subtle">
      <div className="hidden @2xl:flex items-center justify-between gap-6 px-6 @md:px-10 py-2 border-b border-border-subtle text-[11px] text-text-3">
        <div className="flex items-center gap-5 min-w-0">
          {phone ? (
            <span className="flex items-center gap-1.5 shrink-0">
              <Phone size={11} className="text-green" />
              {phone}
            </span>
          ) : null}
          {email ? (
            <span className="flex items-center gap-1.5 truncate">
              <Mail size={11} className="text-green" />
              {email}
            </span>
          ) : null}
          {!phone && !email ? <span>Sales office open daily 10 AM – 7 PM</span> : null}
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
          {badge || "RERA Registered Project"}
        </span>
      </div>
      <div className="px-6 @md:px-10 py-3">
        <div className="flex items-center justify-between gap-4">
          <Brand logo={logo} logoImage={logoImage} logoSize={props.logoSize} />
          <div className="hidden @2xl:flex items-center gap-7">
            <NavLinks items={items} />
          </div>
          <div className="flex items-center gap-3">
            {ctaText ? <CtaButton text={ctaText} href={ctaHref} /> : null}
            <button
              type="button"
              className="@2xl:hidden w-9 h-9 rounded-lg border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="@2xl:hidden flex flex-col gap-3 pt-4 pb-2">
            <NavLinks items={items} onClick={() => setOpen(false)} />
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function NavbarPill({ props }: { props: NavbarProps }) {
  const { logo, logoImage, ctaText } = props;
  const items = normalizeNavLinks(props.links, props.menuItems);
  const ctaHref = resolveCtaHref(props);
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-4 z-40 px-4 @md:px-8">
      <div className="flex items-center justify-between gap-4 rounded-full border border-border-subtle bg-bg-2/85 backdrop-blur-md shadow-lg shadow-black/30 pl-5 pr-2 py-2 @md:px-6">
        <Brand logo={logo} logoImage={logoImage} logoSize={props.logoSize} />
        <div className="hidden @2xl:flex items-center gap-6">
          <NavLinks items={items} />
        </div>
        <div className="flex items-center gap-2">
          {ctaText ? <CtaButton text={ctaText} href={ctaHref} /> : null}
          <button
            type="button"
            className="@2xl:hidden w-9 h-9 rounded-full border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="@2xl:hidden mt-2 rounded-2xl border border-border-subtle bg-bg-2/95 backdrop-blur-md p-4 flex flex-col gap-3">
          <NavLinks items={items} onClick={() => setOpen(false)} />
          {ctaText ? <CtaButton text={ctaText} href={ctaHref} onClick={() => setOpen(false)} /> : null}
        </div>
      ) : null}
    </nav>
  );
}

function NavbarGlass({ props }: { props: NavbarProps }) {
  const { logo, logoImage, ctaText } = props;
  const items = normalizeNavLinks(props.links, props.menuItems);
  const ctaHref = resolveCtaHref(props);
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 px-4 @md:px-8 py-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <Brand logo={logo} logoImage={logoImage} logoSize={props.logoSize} />
          <div className="hidden @2xl:flex items-center gap-7">
            {items.map((item, i) => (
              <a
                key={`${item.href}-${i}`}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href, undefined)}
                className="text-[13px] text-white/85 hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {ctaText ? (
              <a
                href={ctaHref}
                onClick={(e) => handleNavClick(e, ctaHref, undefined)}
                className="px-4 py-2 rounded-lg bg-green text-black text-[13px] font-semibold hover:bg-green-dim transition-all"
              >
                {ctaText}
              </a>
            ) : null}
            <button
              type="button"
              className="@2xl:hidden w-9 h-9 rounded-lg border border-white/15 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="@2xl:hidden flex flex-col gap-3 pt-4 pb-1">
            {items.map((item, i) => (
              <a
                key={`${item.href}-${i}`}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href, () => setOpen(false))}
                className="text-[13px] text-white/85 hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
            {ctaText ? (
              <a
                href={ctaHref}
                onClick={(e) => handleNavClick(e, ctaHref, () => setOpen(false))}
                className="px-4 py-2 rounded-lg bg-green text-black text-[13px] font-semibold mt-1 self-start"
              >
                {ctaText}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

/** PDF 1 — Marketplace pill header on light canvas, dark Contact CTA */
function NavbarMarketing({ props }: { props: NavbarProps }) {
  const { logo, logoImage, ctaText } = props;
  const items = normalizeNavLinks(props.links, props.menuItems);
  const dropdownKeys = marketingDropdownLabels(props.links, props.menuItems);
  const ctaHref = resolveCtaHref(props);
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 px-4 @md:px-8 py-3 @md:py-4 bg-bg-0">
      <div className="flex items-center justify-between gap-3 rounded-full border border-black/[0.06] bg-bg-1 shadow-[0_8px_30px_rgba(0,0,0,0.06)] pl-4 @md:pl-6 pr-2 @md:pr-3 py-2 @md:py-2.5 max-w-6xl mx-auto">
        <Brand logo={logo} logoImage={logoImage} logoSize={props.logoSize} />
        <div className="hidden @2xl:flex items-center gap-5 @3xl:gap-6 flex-1 justify-center">
          <NavLinks
            items={items}
            dropdownKeys={dropdownKeys}
            className="text-[13px] text-text-1 hover:text-text-0 transition-colors whitespace-nowrap"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ctaText ? (
            <a
              href={ctaHref}
              onClick={(e) => handleNavClick(e, ctaHref, undefined)}
              className="px-4 @md:px-5 py-2 rounded-full bg-text-0 text-bg-1 text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              {ctaText}
            </a>
          ) : null}
          <button
            type="button"
            className="@2xl:hidden w-9 h-9 rounded-full border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-2 transition-colors"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="@2xl:hidden mt-2 max-w-6xl mx-auto rounded-2xl border border-border-default bg-bg-1 p-4 flex flex-col gap-3 shadow-lg">
          <NavLinks items={items} dropdownKeys={dropdownKeys} onClick={() => setOpen(false)} />
        </div>
      ) : null}
    </nav>
  );
}

function NavbarMinimal({ props }: { props: NavbarProps }) {
  const { logo, logoImage, ctaText } = props;
  const items = normalizeNavLinks(props.links, props.menuItems);
  const ctaHref = resolveCtaHref(props);
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 px-6 @md:px-10 py-4">
      <div className="flex items-center justify-between gap-4">
        <Brand logo={logo} logoImage={logoImage} logoSize={props.logoSize} />
        <div className="hidden @2xl:flex items-center gap-7">
          <NavLinks items={items} />
        </div>
        <div className="flex items-center gap-3">
          {ctaText ? (
            <a
              href={ctaHref}
              onClick={(e) => handleNavClick(e, ctaHref, undefined)}
              className="text-[13px] font-semibold text-green hover:text-green-dim transition-colors"
            >
              {ctaText}
            </a>
          ) : null}
          <button
            type="button"
            className="@2xl:hidden w-9 h-9 rounded-lg border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="@2xl:hidden flex flex-col gap-3 pt-4 pb-2">
          <NavLinks items={items} onClick={() => setOpen(false)} />
        </div>
      ) : null}
    </nav>
  );
}

export function NavbarBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as NavbarProps;
  switch (block.variant) {
    case "centered":
      return <NavbarCentered props={props} />;
    case "dual":
      return <NavbarDual props={props} />;
    case "pill":
      return <NavbarPill props={props} />;
    case "glass":
      return <NavbarGlass props={props} />;
    case "minimal":
      return <NavbarMinimal props={props} />;
    case "marketing":
      return <NavbarMarketing props={props} />;
    default:
      return <NavbarDefault props={props} sticky={block.variant !== "static"} />;
  }
}
