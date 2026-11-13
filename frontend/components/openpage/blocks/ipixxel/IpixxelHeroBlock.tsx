"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Images, MapPin, Menu, MessageCircle, Phone, PhoneCall, Video } from "lucide-react";
import type { BlockConfig } from "../types";
import { El, useElementEditor } from "../El";
import { CtaButton } from "../CtaButton";
import { clamp, color, flag, list, num, part, prefersReducedMotion, safeHref, str } from "../elements/shared";
import { useDevice } from "@/components/openpage/runtime/device";
import { overlayLayer, resolveBlockStyleForDevice } from "@/lib/openpage/block-style";
import { isMediaSrc } from "@/lib/media";
import { CINZEL, GOLD_GRADIENT, INTER, INTER_TIGHT, POPPINS, makeCtx, useEmeraldFonts, useModernFonts, useSlider } from "./shared";
import { LeadForm } from "./parts";

/**
 * iPixxel Realty → Hero.
 *
 * Ready-made real-estate hero designs, picked from the "Template" dropdown the
 * same way as Real Estate → Hero / Banner. All templates read the same props,
 * so switching template keeps the user's content. Every text, logo and button
 * is an {@link El}, so it can be restyled from the Element tab; the section's
 * background, overlay and spacing come from the Style tab as usual.
 *
 * Sizes use `cqw` (a share of the page width) so on desktop each design scales
 * like the original artwork; below the `@3xl` container width (phones) the
 * designs switch to a stacked layout.
 */

export const IPIXXEL_HERO_VARIANTS = ["grand-band", "skyline", "offer-slider", "emerald-slider", "modern-form"] as const;

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "'Montserrat', 'Helvetica Neue', Arial, sans-serif";
/** Both families with the italic and black weights these designs use. */
const HERO_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900" +
  "&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400;1,600;1,700&display=swap";

/** Adds the fonts stylesheet once per page; the CSS fallbacks cover a failed load. */
function useHeroFonts() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector("link[data-ipixxel-hero-fonts]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HERO_FONTS_URL;
    link.setAttribute("data-ipixxel-hero-fonts", "");
    document.head.appendChild(link);
  }, []);
}

/** Per-template default accent (band / gold lines / burgundy). */
const DEFAULT_ACCENT: Record<string, string> = {
  "grand-band": "#8a6a3a",
  skyline: "#d6a645",
  "offer-slider": "#6b0f2a",
  "emerald-slider": "#c9a45c",
  "modern-form": "#8a877d",
};

const GOLD_TEXT: CSSProperties = {
  backgroundImage: "linear-gradient(180deg, #e3c48a 0%, #b88a4a 45%, #8c6430 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

function scrollToAnchor(id: string) {
  if (typeof document === "undefined" || !id) return;
  document.getElementById(id.replace(/^#/, ""))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Digits and a leading + only, for tel: / wa.me links. */
function phoneDigits(v: unknown): string {
  return str(v).replace(/[^\d+]/g, "");
}

/** The uploaded WhatsApp icon (shown as-is), else the built-in chat icon. */
function WhatsAppIcon({ src, size }: { src: unknown; size: number }) {
  if (isMediaSrc(src)) return <Img src={src} alt="" className="w-full h-full object-contain" />;
  return <MessageCircle size={size} className="w-1/2 h-1/2" />;
}

/** Fixed WhatsApp button size from the inspector (24–120px), or undefined for auto. */
function whatsAppSize(v: unknown): CSSProperties | undefined {
  const px = num(v, 0);
  if (!px || px <= 0) return undefined;
  const size = clamp(Math.round(px), 24, 120);
  return { width: size, height: size, maxWidth: "none", maxHeight: "none" };
}

/** Circle styles for the WhatsApp button; an uploaded icon brings its own look. */
function whatsAppSkin(src: unknown, builtIn: string): string {
  return isMediaSrc(src) ? "bg-transparent" : builtIn;
}

function Img({ src, alt = "", className, style }: { src: string; alt?: string; className?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={style} draggable={false} />;
}

export function IpixxelHeroBlock({ block }: { block: BlockConfig }) {
  useHeroFonts();
  const variant = (IPIXXEL_HERO_VARIANTS as readonly string[]).includes(block.variant ?? "")
    ? (block.variant as string)
    : "grand-band";
  const p = block.props;
  const accent = color(p.accentColor) ?? DEFAULT_ACCENT[variant];

  // Style → Background → Overlay is drawn above the photo (the block-level
  // overlay sits behind it), exactly like Hero / Banner.
  const device = useDevice();
  const resolvedStyle = resolveBlockStyleForDevice(block.style, device);
  const overlayBg = overlayLayer(resolvedStyle?.overlayColor, resolvedStyle?.overlayOpacity);
  const styleBackground = Boolean(resolvedStyle?.backgroundImage || resolvedStyle?.backgroundColor);

  const ctx: HeroCtx = {
    block,
    p,
    accent,
    overlayBg,
    styleBackground,
    onPrimary: () => scrollToAnchor(str(p.primaryAnchor, "enquire")),
  };

  if (variant === "skyline") return <SkylineHero {...ctx} />;
  if (variant === "offer-slider") return <OfferSliderHero {...ctx} />;
  if (variant === "emerald-slider") return <EmeraldSliderHero {...ctx} />;
  if (variant === "modern-form") return <ModernFormHero {...ctx} />;
  return <GrandBandHero {...ctx} />;
}

interface HeroCtx {
  block: BlockConfig;
  p: Record<string, unknown>;
  accent: string;
  overlayBg: string | undefined;
  styleBackground: boolean;
  onPrimary: () => void;
}

/** Cover photo (or a placeholder when none is set) plus the Style overlay. */
function Cover({ ctx, src, alt = "", placeholder, className = "absolute inset-0" }: { ctx: HeroCtx; src: string; alt?: string; placeholder: string; className?: string }) {
  return (
    <>
      {src ? (
        <Img src={src} alt={alt} className={`${className} w-full h-full object-cover`} />
      ) : ctx.styleBackground ? null : (
        <div aria-hidden className={className} style={{ backgroundImage: placeholder }} />
      )}
      {ctx.overlayBg && src ? (
        <div data-op-overlay="" aria-hidden className={`${className} pointer-events-none`} style={{ backgroundImage: ctx.overlayBg }} />
      ) : null}
    </>
  );
}

function Text({ ctx, k, as = "p", className, style, children }: { ctx: HeroCtx; k: string; as?: "p" | "h1" | "h2" | "span" | "div"; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const value = children ?? str(ctx.p[k]);
  if (value === "" || value === null || value === undefined) return null;
  return (
    <El block={ctx.block} id={part(ctx.block, k)} as={as} className={className} style={style}>
      {value}
    </El>
  );
}

/* ------------------------------------------------------------------------- */
/* Template 1 — "Grand band": brand lock-up top-left, script tagline,         */
/* RERA block top-right, price band with an offer card along the bottom.     */
/* ------------------------------------------------------------------------- */

function GrandBandHero(ctx: HeroCtx) {
  const { block, p, accent } = ctx;
  const brandColor = color(p.brandColor) ?? "#0d6b45";
  const qr = str(p.qrImage);
  const logo = str(p.logo);

  return (
    <section className="relative overflow-hidden bg-white" id={str(p.anchor) || undefined}>
      <div className="relative flex flex-col gap-5 px-5 pt-6 pb-8 min-h-[460px] @3xl:block @3xl:p-0 @3xl:min-h-0 @3xl:aspect-[1000/520]">
        <Cover ctx={ctx} src={str(p.image)} placeholder="linear-gradient(180deg,#eaf3f7 0%,#cfe3d2 55%,#7c9a5c 100%)" />

        {/* Brand lock-up */}
        <El
          block={block}
          id={part(block, "brandBlock")}
          className="relative z-10 @3xl:absolute @3xl:left-[4.5%] @3xl:top-[5%] flex flex-col items-start"
        >
          {logo ? (
            <Img src={logo} alt={str(p.brandName)} className="h-14 @3xl:h-[9cqw] max-h-[130px] w-auto object-contain" />
          ) : (
            <>
              <Text
                ctx={ctx}
                k="brandName"
                as="div"
                className="font-black leading-[0.95] tracking-[0.01em] text-[44px] @3xl:text-[clamp(30px,7.6cqw,104px)]"
                style={{ fontFamily: SANS, color: brandColor }}
              />
              <div className="flex items-end gap-2 @3xl:gap-[0.8cqw] -mt-1">
                <Text
                  ctx={ctx}
                  k="brandNumber"
                  as="div"
                  className="leading-[0.8] font-normal text-[118px] @3xl:text-[clamp(80px,21.5cqw,300px)]"
                  style={{ fontFamily: SERIF, ...GOLD_TEXT }}
                />
                <div className="flex flex-col pb-1 @3xl:pb-[0.6cqw]">
                  <Text
                    ctx={ctx}
                    k="brandTitle"
                    as="div"
                    className="leading-none font-light tracking-[0.04em] text-[44px] @3xl:text-[clamp(30px,7.4cqw,102px)]"
                    style={{ fontFamily: SANS, ...GOLD_TEXT }}
                  />
                  <Text
                    ctx={ctx}
                    k="brandSubtitle"
                    as="div"
                    className="font-semibold tracking-[0.16em] mt-1 text-[17px] @3xl:text-[clamp(13px,2.75cqw,38px)]"
                    style={{ fontFamily: SANS, color: "#7a5a2c" }}
                  />
                  <Text
                    ctx={ctx}
                    k="location"
                    as="div"
                    className="font-semibold tracking-[0.06em] uppercase mt-2 text-[11px] @3xl:text-[clamp(9px,1.5cqw,20px)]"
                    style={{ fontFamily: SANS, color: "#4a4a4a" }}
                  />
                </div>
              </div>
            </>
          )}
        </El>

        {/* Tagline */}
        <Text
          ctx={ctx}
          k="headline"
          as="h1"
          className="relative z-10 italic font-semibold leading-tight text-[26px] @3xl:absolute @3xl:right-[6%] @3xl:top-[19%] @3xl:text-[clamp(20px,3.7cqw,52px)]"
          style={{ fontFamily: SERIF, color: "#14406a" }}
        />

        {/* RERA / legal block */}
        {str(p.legalText) || qr ? (
          <El
            block={block}
            id={part(block, "legalBlock")}
            className="relative z-10 order-last flex items-start gap-2 @3xl:absolute @3xl:right-[1.2%] @3xl:top-[1.6%] @3xl:order-none"
          >
            <Text
              ctx={ctx}
              k="legalText"
              as="p"
              className="whitespace-pre-line text-[8px] leading-[1.35] text-[#2b2b2b] @3xl:text-right @3xl:text-[clamp(6px,0.62cqw,9px)] font-medium uppercase"
            />
            {qr ? <Img src={qr} alt="QR code" className="w-9 h-9 @3xl:w-[3cqw] @3xl:h-[3cqw] object-contain bg-white" /> : null}
          </El>
        ) : null}

        {/* Disclaimer */}
        <Text
          ctx={ctx}
          k="disclaimer"
          as="p"
          className="relative z-10 mt-auto text-[10px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] @3xl:absolute @3xl:left-[2%] @3xl:bottom-[13%] @3xl:text-[clamp(8px,0.9cqw,12px)]"
        />
      </div>

      {/* Price band + offer card */}
      <El
        block={block}
        id={part(block, "band")}
        className="relative z-20 flex flex-col items-center gap-4 px-5 py-5 @3xl:absolute @3xl:inset-x-0 @3xl:bottom-0 @3xl:flex-row @3xl:justify-between @3xl:gap-[2cqw] @3xl:py-0 @3xl:pl-[4.5%] @3xl:pr-[5.5%] @3xl:h-[8.6cqw] @3xl:max-h-[120px]"
        style={{ background: `linear-gradient(90deg, ${accent} 0%, color-mix(in srgb, ${accent} 78%, white) 50%, ${accent} 100%)` }}
      >
        <Text
          ctx={ctx}
          k="bandText"
          as="p"
          className="text-center @3xl:text-left text-white font-semibold uppercase tracking-[0.02em] text-[16px] @3xl:text-[clamp(11px,1.72cqw,26px)]"
          style={{ fontFamily: SERIF }}
        />
        {str(p.offerLabel) || str(p.offerValue) ? (
          <El
            block={block}
            id={part(block, "offerCard")}
            className="flex items-center gap-3 bg-white rounded-xl px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)] @3xl:self-end @3xl:mb-[1.1cqw] @3xl:rounded-[1.2cqw] @3xl:px-[2.2cqw] @3xl:py-[1cqw] @3xl:gap-[1.4cqw] @3xl:-mt-[4.5cqw]"
          >
            <Text
              ctx={ctx}
              k="offerLabel"
              as="p"
              className="whitespace-pre-line text-center uppercase font-semibold leading-[1.15] text-[12px] @3xl:text-[clamp(9px,1.55cqw,21px)]"
              style={{ fontFamily: SERIF, color: accent }}
            />
            <Text
              ctx={ctx}
              k="offerValue"
              as="p"
              className="font-bold leading-none text-[34px] @3xl:text-[clamp(22px,4.6cqw,62px)]"
              style={{ fontFamily: SERIF, color: accent }}
            />
          </El>
        ) : null}
      </El>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Template 2 — "Skyline": transparent header, centred title, two stats on   */
/* gold pin lines, location and gallery along the bottom, side Enquire tab.  */
/* ------------------------------------------------------------------------- */

function SkylineHero(ctx: HeroCtx) {
  const { block, p, accent } = ctx;
  const logo = str(p.logo);
  const logo2 = str(p.logo2);
  const phone = phoneDigits(p.phone);
  const tourHref = safeHref(p.tourUrl);
  const galleryHref = safeHref(p.galleryUrl);

  const stat = (n: 1 | 2, side: "left" | "right") =>
    str(p[`stat${n}Label`]) || str(p[`stat${n}Value`]) ? (
      <El
        block={block}
        id={part(block, `stat${n}`)}
        className={`absolute z-10 top-[38%] bottom-[22%] @3xl:top-[44%] @3xl:bottom-[17%] flex flex-col items-center text-center ${
          side === "left" ? "left-[6%] @3xl:left-[16%]" : "right-[19%] @3xl:right-[16%]"
        }`}
      >
        <Text ctx={ctx} k={`stat${n}Label`} className="text-white/95 tracking-[0.03em] text-[12px] @3xl:text-[clamp(11px,1.3cqw,18px)]" />
        <Text
          ctx={ctx}
          k={`stat${n}Value`}
          className="text-white tracking-[0.08em] font-normal mt-1 text-[22px] @3xl:text-[clamp(18px,2.75cqw,38px)]"
        />
        <span aria-hidden className="mt-3 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <span aria-hidden className="w-[2px] flex-1" style={{ backgroundColor: accent }} />
      </El>
    ) : null;

  return (
    <section
      className="relative overflow-hidden text-white min-h-[600px] @3xl:min-h-0 @3xl:aspect-[1100/490]"
      id={str(p.anchor) || undefined}
      style={{ "--ipx-accent": accent } as CSSProperties}
    >
      <Cover ctx={ctx} src={str(p.image)} placeholder="linear-gradient(180deg,#16345c 0%,#3f6690 45%,#9fb4c8 75%,#2f3b2a 100%)" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />

      {/* Header */}
      <El
        block={block}
        id={part(block, "header")}
        className="absolute z-20 inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pt-4 @3xl:px-[5%] @3xl:pt-[2.4cqw]"
      >
        <div className="flex items-center gap-3 @3xl:gap-[1.6cqw] min-w-0">
          {logo ? (
            <Img src={logo} alt={str(p.logoText)} className="h-10 @3xl:h-[4.8cqw] max-h-[72px] w-auto object-contain" />
          ) : (
            <Text ctx={ctx} k="logoText" as="span" className="text-[20px] @3xl:text-[clamp(16px,2.2cqw,30px)] tracking-[0.12em]" style={{ fontFamily: SERIF }} />
          )}
          {logo2 ? (
            <>
              <span aria-hidden className="w-px self-stretch bg-white/60" />
              <Img src={logo2} alt="" className="h-10 @3xl:h-[4.8cqw] max-h-[72px] w-auto object-contain" />
            </>
          ) : null}
        </div>
        <nav className="flex items-center gap-3 @3xl:gap-[1.8cqw] text-[14px] @3xl:text-[clamp(11px,1.25cqw,17px)]">
          {str(p.tourText) ? (
            <El
              block={block}
              id={part(block, "tourText")}
              as="a"
              href={tourHref || undefined}
              target={tourHref ? "_blank" : undefined}
              rel={tourHref ? "noopener noreferrer" : undefined}
              className="hidden @md:flex items-center gap-2 text-white hover:opacity-85"
            >
              <Video size={20} style={{ color: accent }} fill={accent} />
              <span>{str(p.tourText)}</span>
            </El>
          ) : null}
          {str(p.tourText) && str(p.callText) ? <span aria-hidden className="hidden @md:block w-px h-6 bg-white/40" /> : null}
          {str(p.callText) ? (
            <El
              block={block}
              id={part(block, "callText")}
              as="a"
              href={phone ? `tel:${phone}` : undefined}
              className="flex items-center gap-2 text-white hover:opacity-85"
            >
              <Phone size={18} style={{ color: accent }} fill={accent} />
              <span className="hidden @md:inline">{str(p.callText)}</span>
            </El>
          ) : null}
          <button
            type="button"
            aria-label="Menu"
            onClick={() => scrollToAnchor(str(p.menuAnchor, "overview"))}
            className="text-white hover:opacity-85"
          >
            <Menu size={26} />
          </button>
        </nav>
      </El>

      {/* Title */}
      <Text
        ctx={ctx}
        k="skylineTitle"
        as="h1"
        className="absolute z-10 inset-x-4 top-[15%] @3xl:top-[19%] text-center font-normal tracking-[0.02em] leading-tight text-[26px] @3xl:text-[clamp(20px,3.2cqw,46px)]"
      />

      {stat(1, "left")}
      {stat(2, "right")}

      {/* Location */}
      {str(p.location) ? (
        <El
          block={block}
          id={part(block, "location")}
          className="absolute z-10 inset-x-4 bottom-[13%] @3xl:bottom-[4.5%] flex items-center justify-center gap-2 text-center text-[15px] @3xl:text-[clamp(13px,1.8cqw,25px)]"
        >
          <MapPin className="shrink-0 w-5 h-5 @3xl:w-[2cqw] @3xl:h-[2cqw]" strokeWidth={1.6} />
          <span>{str(p.location)}</span>
        </El>
      ) : null}

      {/* Gallery button */}
      {str(p.galleryText) ? (
        <El
          block={block}
          id={part(block, "galleryText")}
          as={galleryHref ? "a" : "button"}
          href={galleryHref || undefined}
          type={galleryHref ? undefined : "button"}
          onClick={galleryHref ? undefined : () => scrollToAnchor("gallery")}
          className="absolute z-10 left-4 bottom-[4%] @3xl:left-[5%] @3xl:bottom-[4%] flex items-center gap-2 rounded-md bg-black/55 px-3 py-2 text-white text-[13px] @3xl:text-[clamp(11px,1.3cqw,17px)] @3xl:px-[1.3cqw] @3xl:py-[0.8cqw] hover:bg-black/70"
        >
          <Images className="w-5 h-5 @3xl:w-[2cqw] @3xl:h-[2cqw]" strokeWidth={1.6} />
          <span>{str(p.galleryText)}</span>
        </El>
      ) : null}

      <Text
        ctx={ctx}
        k="disclaimer"
        className="absolute z-10 right-4 bottom-[1%] @3xl:right-auto @3xl:left-[0.6%] @3xl:bottom-[0.8%] text-white/85 text-[9px] @3xl:text-[clamp(7px,0.75cqw,11px)]"
      />

      {/* Side Enquire tab */}
      <CtaButton
        block={block}
        id={part(block, "primaryCta")}
        prefix="primaryCta"
        label={str(p.primaryCta)}
        href={safeHref(p.primaryCtaUrl)}
        target={str(p.primaryCtaTarget)}
        onClick={ctx.onPrimary}
        brand={null}
        icon={null}
        className="absolute z-20 right-0 top-1/2 -translate-y-1/2 rounded-r-xl px-2 py-4 bg-[var(--ipx-accent)] text-white text-[12px] tracking-[0.06em] [writing-mode:vertical-rl] rotate-180 @3xl:px-[0.9cqw] @3xl:py-[2.2cqw] @3xl:text-[clamp(11px,1.25cqw,17px)] hover:brightness-110"
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Template 3 — "Offer slider": white header with phone + CTA, slides with   */
/* an offer stack on the right, offer band with price tag, arrows and dots.  */
/* ------------------------------------------------------------------------- */

function OfferSliderHero(ctx: HeroCtx) {
  const { block, p, accent } = ctx;
  const editing = useElementEditor()?.isEditing === true;
  const logo = str(p.logo);
  const phone = phoneDigits(p.phone);
  // WhatsApp uses the phone number until its own number is set.
  const whatsapp = (phoneDigits(p.whatsapp) || phone).replace(/^\+/, "");
  const showFloating = flag(p.showFloatingButtons, true);
  const textOnAll = flag(p.textOnAllSlides, false);
  const autoplay = flag(p.autoplay, true);
  const interval = clamp(num(p.interval, 5000), 2000, 20000);
  const badgeImage = str(p.offerBadgeImage);

  // The background image is the first slide; "More slides" follow it.
  const slides = [
    { src: str(p.image), alt: "" },
    ...list(p.slides)
      .filter((s) => !s.hidden && str(s.src))
      .map((s) => ({ src: str(s.src), alt: str(s.alt) })),
  ];
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = count ? ((index % count) + count) % count : 0;
  const go = useCallback(
    (dir: 1 | -1) => {
      if (count < 2) return;
      setIndex((i) => (((i + dir) % count) + count) % count);
    },
    [count],
  );
  useEffect(() => {
    if (!autoplay || editing || paused || count < 2 || prefersReducedMotion()) return;
    const t = setInterval(() => go(1), interval);
    return () => clearInterval(t);
  }, [autoplay, editing, paused, count, interval, go]);

  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start == null || end == null || Math.abs(end - start) < 40) return;
    go(end < start ? 1 : -1);
  };

  const showText = current === 0 || textOnAll;
  const slide = slides[current] ?? slides[0];

  return (
    <section
      className="relative bg-white text-[#1b1b1b]"
      id={str(p.anchor) || undefined}
      style={{ "--ipx-accent": accent } as CSSProperties}
    >
      <style>{`@keyframes ipxHeroFade{from{opacity:0}to{opacity:1}}`}</style>

      {/* Header */}
      <El
        block={block}
        id={part(block, "header")}
        className="relative z-20 flex items-center justify-between gap-3 bg-white px-4 py-3 @3xl:px-[3%] @3xl:py-[1.4cqw]"
      >
        {logo ? (
          <Img src={logo} alt={str(p.logoText)} className="h-10 @3xl:h-[4.4cqw] max-h-[64px] w-auto object-contain" />
        ) : (
          <div className="flex flex-col leading-none">
            <Text
              ctx={ctx}
              k="logoText"
              as="span"
              className="uppercase tracking-[0.02em] text-[22px] @3xl:text-[clamp(18px,2.4cqw,34px)]"
              style={{ fontFamily: SERIF, color: accent }}
            />
            <Text
              ctx={ctx}
              k="logoTagline"
              as="span"
              className="mt-1 text-[11px] @3xl:text-[clamp(9px,1.15cqw,16px)] text-[#3a3a3a] tracking-[0.04em]"
              style={{ fontFamily: SERIF }}
            />
          </div>
        )}
        <div className="flex items-center gap-3 @3xl:gap-[2cqw]">
          {str(p.phone) ? (
            <El
              block={block}
              id={part(block, "phone")}
              as="a"
              href={phone ? `tel:${phone}` : undefined}
              className="hidden @3xl:inline text-[#c09347] tracking-[0.04em] text-[clamp(11px,1.1cqw,16px)] hover:opacity-80"
            >
              {str(p.phone)}
            </El>
          ) : null}
          <CtaButton
            block={block}
            id={part(block, "headerCta")}
            prefix="headerCta"
            label={str(p.headerCta)}
            href={safeHref(p.headerCtaUrl)}
            target={str(p.headerCtaTarget)}
            onClick={() => scrollToAnchor(str(p.headerCtaAnchor) || str(p.primaryAnchor, "enquire"))}
            brand={null}
            icon={null}
            className="uppercase font-semibold tracking-[0.08em] bg-[var(--ipx-accent)] text-white text-[11px] px-3 py-2 @3xl:text-[clamp(10px,1.1cqw,15px)] @3xl:px-[1.9cqw] @3xl:py-[0.9cqw] hover:brightness-110"
          />
        </div>
      </El>

      {/* Slide */}
      <div
        className="relative flex flex-col @3xl:block @3xl:aspect-[1100/470] overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={current} className="relative aspect-[4/3] @3xl:absolute @3xl:inset-0 @3xl:aspect-auto" style={{ animation: "ipxHeroFade .6s ease" }}>
          <Cover ctx={ctx} src={slide.src} alt={slide.alt} placeholder="linear-gradient(110deg,#f4f1ee 0%,#e6dfd8 50%,#ffffff 100%)" />
        </div>

        {showText ? (
          <El
            block={block}
            id={part(block, "offerStack")}
            className="relative z-10 flex flex-col items-center text-center gap-3 px-5 py-7 @3xl:absolute @3xl:right-[2.5%] @3xl:top-[9%] @3xl:w-[57%] @3xl:p-0 @3xl:gap-[1.3cqw]"
          >
            <Text
              ctx={ctx}
              k="offerTitle"
              as="h1"
              className="uppercase font-normal tracking-[0.06em] leading-tight text-[26px] @3xl:text-[clamp(20px,3.5cqw,50px)]"
              style={{ fontFamily: SERIF }}
            />
            <Text
              ctx={ctx}
              k="highlightText"
              className="uppercase bg-[#1b1b1b] text-white tracking-[0.18em] px-3 py-1.5 text-[13px] @3xl:text-[clamp(11px,2cqw,29px)] @3xl:px-[0.9cqw] @3xl:py-[0.3cqw]"
            />
            {str(p.benefitText) ? (
              <span aria-hidden className="leading-none text-[24px] @3xl:text-[clamp(18px,3cqw,42px)] font-light">+</span>
            ) : null}
            <Text
              ctx={ctx}
              k="benefitText"
              className="uppercase tracking-[0.2em] text-[13px] @3xl:text-[clamp(11px,2cqw,29px)]"
            />
            {str(p.benefitValue) ? (
              <El
                block={block}
                id={part(block, "benefitBadge")}
                className="flex flex-col items-center rounded-md px-4 py-2 text-white shadow-[0_6px_18px_rgba(107,15,42,0.35)] @3xl:px-[1.6cqw] @3xl:py-[0.7cqw]"
                style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 55%, #e07aa0) 0%, ${accent} 100%)` }}
              >
                <Text ctx={ctx} k="benefitValue" className="font-bold leading-none text-[20px] @3xl:text-[clamp(16px,2.6cqw,36px)]" style={{ fontFamily: SERIF }} />
                <Text ctx={ctx} k="benefitNote" className="uppercase tracking-[0.12em] mt-1 text-[8px] @3xl:text-[clamp(7px,0.75cqw,11px)]" />
              </El>
            ) : null}
          </El>
        ) : null}

        {/* Offer badge (image, or a text lock-up) */}
        {showText && (badgeImage || str(p.badgeTitle)) ? (
          <El
            block={block}
            id={part(block, "offerBadge")}
            // The text badge's title box rests on the band's top edge (13%); "fest" hangs below it.
            className={`hidden @3xl:flex absolute z-20 right-[2%] flex-col items-center ${badgeImage ? "bottom-[5.5%]" : "bottom-[13%]"}`}
          >
            {badgeImage ? (
              <Img src={badgeImage} alt={str(p.badgeTitle)} className="w-[20cqw] h-auto object-contain" />
            ) : (
              <>
                <Text
                  ctx={ctx}
                  k="badgeTop"
                  className="bg-white px-[0.8cqw] uppercase tracking-[0.3em] text-[#8a8a8a] text-[clamp(8px,1cqw,22px)] -mb-[0.55em] relative z-10"
                />
                <Text
                  ctx={ctx}
                  k="badgeTitle"
                  className="bg-white border border-[#1b1b1b]/30 px-[0.45em] pt-[0.3em] pb-[0.12em] uppercase font-black leading-none tracking-[0.01em] text-[clamp(18px,3.5cqw,84px)]"
                  style={{ fontFamily: SERIF, filter: "drop-shadow(1px 1px 0 #a3a3a3)", backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${accent} 60%, #c25b84), ${accent})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
                />
                <Text
                  ctx={ctx}
                  k="badgeScript"
                  className="absolute left-1/2 top-full -translate-x-1/2 -mt-[0.18em] whitespace-nowrap italic text-white leading-none text-[clamp(22px,4.6cqw,110px)] [text-shadow:0_2px_6px_rgba(0,0,0,0.35)]"
                  style={{ fontFamily: SERIF, WebkitTextStroke: "1px #5a5a5a" }}
                />
              </>
            )}
          </El>
        ) : null}

        {/* Offer band */}
        {showText ? (
          <El
            block={block}
            id={part(block, "band")}
            className="relative z-10 flex flex-wrap items-end gap-x-4 gap-y-2 px-4 pt-14 pb-4 text-white @3xl:absolute @3xl:inset-x-0 @3xl:bottom-0 @3xl:flex-nowrap @3xl:items-center @3xl:h-[13%] @3xl:px-[2%] @3xl:py-0 @3xl:gap-[2cqw]"
            style={{ backgroundColor: accent }}
          >
            <div className="relative">
              <Text
                ctx={ctx}
                k="configText"
                className="absolute left-0 bottom-full mb-0 whitespace-nowrap bg-white text-[#1b1b1b] border border-[#1b1b1b]/20 border-b-0 rounded-tr-[28px] pl-3 pr-8 py-1.5 font-medium text-[18px] @3xl:rounded-tr-[3.6cqw] @3xl:pl-[4.6cqw] @3xl:pr-[3cqw] @3xl:py-[0.7cqw] @3xl:text-[clamp(14px,2.3cqw,56px)] @3xl:-translate-y-[0.4cqw]"
                style={{ fontFamily: SERIF }}
              />
              <Text
                ctx={ctx}
                k="priceText"
                className="bg-[#111] text-white font-bold px-3 py-1 text-[26px] @3xl:px-[1.3cqw] @3xl:py-[0.2cqw] @3xl:text-[clamp(18px,3.1cqw,74px)]"
                style={{ fontFamily: SERIF }}
              />
            </div>
            {str(p.validLabel) || str(p.validValue) ? (
              <El block={block} id={part(block, "validity")} className="flex flex-col pr-4 border-r border-white/60 leading-tight">
                <Text ctx={ctx} k="validLabel" as="span" className="uppercase tracking-[0.2em] text-[10px] @3xl:text-[clamp(8px,0.95cqw,22px)]" />
                <Text ctx={ctx} k="validValue" as="span" className="uppercase font-semibold tracking-[0.04em] text-[18px] @3xl:text-[clamp(14px,2cqw,48px)]" style={{ fontFamily: SERIF }} />
              </El>
            ) : null}
          </El>
        ) : null}

        {/* Arrows + dots (always shown, as in the design) */}
        {count > 0 ? (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              disabled={count < 2}
              onClick={() => go(-1)}
              className="absolute z-30 left-3 @3xl:left-[1.6%] top-[37.5cqw] @3xl:top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 @3xl:w-[3.4cqw] @3xl:h-[3.4cqw] max-w-[48px] max-h-[48px] rounded-full bg-black/70 text-white hover:bg-black/85"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              disabled={count < 2}
              onClick={() => go(1)}
              className="absolute z-30 right-3 @3xl:right-[1.6%] top-[37.5cqw] @3xl:top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 @3xl:w-[3.4cqw] @3xl:h-[3.4cqw] max-w-[48px] max-h-[48px] rounded-full bg-[#555]/80 text-white hover:bg-[#555]"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute z-30 left-1/2 -translate-x-1/2 top-[calc(75cqw-2.25rem)] @3xl:top-auto @3xl:bottom-[3.5%] flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === current}
                  onClick={() => setIndex(i)}
                  className={`h-2 rounded-full transition-all ${i === current ? "w-6 bg-[#e8c37a]" : "w-2 bg-white/80"}`}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* Floating call / WhatsApp */}
        {showFloating && phone ? (
          <a
            href={`tel:${phone}`}
            aria-label="Call"
            className="absolute z-30 left-3 top-3 @3xl:top-auto @3xl:left-[calc(3.3%-clamp(42px,4.4cqw,104px)/2)] @3xl:bottom-[calc(13%+1.6cqw-clamp(42px,4.4cqw,104px)/2)] grid place-items-center w-12 h-12 @3xl:w-[clamp(42px,4.4cqw,104px)] @3xl:h-[clamp(42px,4.4cqw,104px)] rounded-full bg-[#5cc84a] border-2 border-white/80 text-white shadow-lg hover:brightness-110"
          >
            <PhoneCall className="w-1/2 h-1/2" fill="currentColor" strokeWidth={1.6} />
          </a>
        ) : null}
        {showFloating && whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className={`absolute z-30 right-3 top-3 @3xl:top-auto @3xl:right-[1.6%] @3xl:bottom-[calc(13%-clamp(42px,4.4cqw,104px)*0.9)] grid place-items-center w-12 h-12 @3xl:w-[clamp(42px,4.4cqw,104px)] @3xl:h-[clamp(42px,4.4cqw,104px)] rounded-full overflow-hidden hover:brightness-110 ${whatsAppSkin(p.whatsappIcon, "bg-[#25d366] border-2 border-white text-white shadow-lg")}`}
            style={whatsAppSize(p.whatsappSize)}
          >
            <WhatsAppIcon src={p.whatsappIcon} size={24} />
          </a>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Template 4 — "Emerald slider": full-bleed photo slides under a tinted     */
/* logo / phone bar, gold title, price row and an offer ribbon.              */
/* ------------------------------------------------------------------------- */

function EmeraldSliderHero(ctx: HeroCtx) {
  useEmeraldFonts();
  const { block, p, accent } = ctx;
  const logo = str(p.logo);
  const phone = phoneDigits(p.phone);
  const whatsapp = phoneDigits(p.whatsapp).replace(/^\+/, "");
  const showFloating = flag(p.showFloatingButtons, true);
  const slides = [
    { src: str(p.image), alt: "" },
    ...list(p.slides)
      .filter((s) => !s.hidden && str(s.src))
      .map((s) => ({ src: str(s.src), alt: str(s.alt) })),
  ];
  const slider = useSlider(slides.length, {
    autoplay: flag(p.autoplay, true),
    interval: clamp(num(p.interval, 5000), 2000, 20000),
  });
  const current = slider.start;
  const slide = slides[current] ?? slides[0];
  const showText = current === 0 || flag(p.textOnAllSlides, false);
  const hasPrice = Boolean(str(p.emeraldPriceLabel) || str(p.emeraldPrice));
  const gold: CSSProperties = { fontFamily: CINZEL, color: accent };

  return (
    <section
      className="relative bg-[#04241a] text-white"
      id={str(p.anchor) || undefined}
      style={{ "--ipx-accent": accent, fontFamily: POPPINS } as CSSProperties}
    >
      <style>{`@keyframes ipxHeroFade{from{opacity:0}to{opacity:1}}`}</style>
      <div className="relative flex flex-col @3xl:block @3xl:aspect-[1245/552] overflow-hidden" {...slider.handlers}>
        {/* Photo, header bar, dots and WhatsApp */}
        <div className="relative aspect-[4/3] @md:aspect-[16/10] @3xl:absolute @3xl:inset-0 @3xl:aspect-auto overflow-hidden">
          <div key={current} className="absolute inset-0" style={{ animation: "ipxHeroFade .6s ease" }}>
            <Cover ctx={ctx} src={slide.src} alt={slide.alt} placeholder="linear-gradient(160deg,#b9cdc4 0%,#6f8f82 50%,#1f3d31 100%)" />
          </div>
          {showText ? (
            <div
              aria-hidden
              className="hidden @3xl:block absolute inset-x-0 bottom-0 h-[48%] pointer-events-none"
              style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.72) 100%)" }}
            />
          ) : null}
          <El
            block={block}
            id={part(block, "header")}
            className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-2.5 bg-[#0d3b2b]/60 @3xl:h-[17%] @3xl:px-[7%] @3xl:py-0"
          >
            {logo ? (
              <Img src={logo} alt={str(p.logoText)} className="h-11 @3xl:h-[6cqw] max-h-[84px] w-auto object-contain" />
            ) : (
              <Text ctx={ctx} k="logoText" as="span" className="uppercase font-semibold tracking-[0.3em] text-[15px] @3xl:text-[clamp(14px,1.5cqw,22px)]" style={gold} />
            )}
            {str(p.phone) ? (
              <El
                block={block}
                id={part(block, "phone")}
                as="a"
                href={phone ? `tel:${phone}` : undefined}
                className="inline-flex items-center gap-2 border border-white/70 px-3 py-1.5 text-[12px] tracking-[0.04em] text-white @3xl:px-[1.2cqw] @3xl:py-[0.6cqw] @3xl:text-[clamp(11px,1.2cqw,17px)] hover:bg-white/10"
              >
                <Phone aria-hidden size={14} fill="currentColor" style={{ color: accent }} />
                {str(p.phone)}
              </El>
            ) : null}
          </El>
          {slides.length > 1 ? (
            <div className="absolute z-20 left-1/2 bottom-2.5 @3xl:bottom-[2%] flex -translate-x-1/2 items-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === current}
                  onClick={() => slider.setIndex(i)}
                  className={`h-3 w-5 @3xl:h-[1.6cqw] @3xl:w-[2.3cqw] max-h-[24px] max-w-[34px] transition-colors ${i === current ? "bg-white" : "bg-white/40 hover:bg-white/60"}`}
                />
              ))}
            </div>
          ) : null}
          {showFloating && whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className={`absolute z-30 right-3 bottom-3 @3xl:right-[2.5%] @3xl:bottom-[10%] grid place-items-center w-11 h-11 @3xl:w-[clamp(40px,3.4cqw,52px)] @3xl:h-[clamp(40px,3.4cqw,52px)] rounded-full overflow-hidden hover:scale-105 transition-transform ${whatsAppSkin(p.whatsappIcon, "bg-white text-[#1b1b1b] shadow-lg")}`}
              style={whatsAppSize(p.whatsappSize)}
            >
              <WhatsAppIcon src={p.whatsappIcon} size={22} />
            </a>
          ) : null}
        </div>

        {/* Location, title, price row and ribbon */}
        {showText ? (
          <El
            block={block}
            id={part(block, "info")}
            className="relative z-20 flex flex-col items-center gap-3 px-5 py-7 text-center @3xl:absolute @3xl:inset-x-0 @3xl:bottom-[7%] @3xl:gap-[0.9cqw] @3xl:p-0"
          >
            {str(p.location) ? (
              <p className="inline-flex items-center gap-1.5 text-[13px] text-white/90 @3xl:text-[clamp(11px,1.15cqw,16px)]">
                <MapPin aria-hidden size={15} />
                <Text ctx={ctx} k="location" as="span" />
              </p>
            ) : null}
            <Text
              ctx={ctx}
              k="emeraldTitle"
              as="h1"
              className="font-semibold uppercase leading-tight tracking-[0.04em] text-[24px] @3xl:text-[clamp(20px,2.6cqw,38px)]"
              style={gold}
            />
            <div className="flex w-full flex-col items-center gap-2 @md:flex-row @md:justify-center @md:gap-6 @3xl:w-[76%] @3xl:justify-between">
              <Text ctx={ctx} k="emeraldConfig" className="text-[14px] text-white/90 @3xl:text-[clamp(12px,1.25cqw,18px)] @3xl:w-[30%] @3xl:text-left" />
              {hasPrice ? (
                <p className="inline-flex items-baseline gap-2">
                  <Text ctx={ctx} k="emeraldPriceLabel" as="span" className="text-[14px] text-white/90 @3xl:text-[clamp(12px,1.25cqw,18px)]" />
                  <Text ctx={ctx} k="emeraldPrice" as="span" className="font-semibold text-[26px] @3xl:text-[clamp(20px,2.4cqw,34px)]" style={gold} />
                </p>
              ) : null}
              <Text ctx={ctx} k="emeraldPlan" className="text-[14px] text-white/90 @3xl:text-[clamp(12px,1.25cqw,18px)] @3xl:w-[30%] @3xl:text-right" />
            </div>
            <Text
              ctx={ctx}
              k="emeraldRibbon"
              className="mt-1 px-5 py-2 uppercase font-medium tracking-[0.12em] text-[#1b1b1b] text-[11px] @3xl:px-[3cqw] @3xl:py-[0.6cqw] @3xl:text-[clamp(10px,1.15cqw,16px)]"
              style={{ background: GOLD_GRADIENT }}
            />
          </El>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Template 5 — "Modern form": floating white navbar, big tight title with   */
/* two buttons on the left and a Form Builder enquiry card on the right.     */
/* ------------------------------------------------------------------------- */

/** Navbar lines "Label" or "Label | target" → in-page or safe links. */
function navLinks(v: unknown): { label: string; href: string }[] {
  return str(v)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, target = ""] = line.split("|").map((s) => s.trim());
      const href = target
        ? /^[a-z0-9-]+$/i.test(target)
          ? `#${target}`
          : safeHref(target)
        : `#${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      return { label, href };
    })
    .filter((l) => l.label);
}

function ModernFormHero(ctx: HeroCtx) {
  useModernFonts();
  const { block, p } = ctx;
  const logo = str(p.logo);
  const links = navLinks(p.modernNav);
  const formCtx = makeCtx(block, "modern-form");
  const arrow = <ArrowUpRight aria-hidden size={15} strokeWidth={1.8} />;

  return (
    <section
      className="relative overflow-hidden bg-[#141414] text-white"
      id={str(p.anchor) || undefined}
      style={{ fontFamily: INTER, "--ipx-accent": ctx.accent } as CSSProperties}
    >
      <Cover ctx={ctx} src={str(p.image)} placeholder="linear-gradient(160deg,#3a3f3a 0%,#1d211d 60%,#0f120f 100%)" />
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.05) 100%)" }} />

      {/* Navbar */}
      <El
        block={block}
        id={part(block, "header")}
        className="relative z-20 mx-4 mt-4 flex items-center justify-between gap-4 rounded-[14px] bg-white/95 px-4 py-2.5 text-[#0b0b0b] @3xl:mx-[5.5%] @3xl:mt-[1.6cqw] @3xl:px-5 @3xl:py-3"
      >
        {logo ? (
          <Img src={logo} alt={str(p.logoText)} className="h-8 @3xl:h-9 w-auto object-contain" />
        ) : (
          <Text ctx={ctx} k="logoText" as="span" className="text-[17px] @3xl:text-[18px] font-bold tracking-[-0.02em]" style={{ fontFamily: INTER_TIGHT }} />
        )}
        {links.length ? (
          <nav className="hidden @3xl:flex items-center gap-[2cqw] text-[12.5px]">
            {links.map((l, i) => (
              <a key={i} href={l.href || undefined} className="hover:opacity-70">
                {l.label}
              </a>
            ))}
          </nav>
        ) : null}
        {str(p.modernNavCta) ? (
          <CtaButton
            block={block}
            id={part(block, "modernNavCta")}
            prefix="modernNavCta"
            label={str(p.modernNavCta)}
            href={safeHref(p.modernNavCtaUrl)}
            target={str(p.modernNavCtaTarget)}
            onClick={() => scrollToAnchor(str(p.modernNavCtaAnchor, "enquire"))}
            brand={null}
            icon={arrow}
            className="inline-flex items-center gap-2 rounded-full bg-[#0b0b0b] px-4 py-2 text-[12px] text-white @3xl:px-5 @3xl:py-2.5 hover:opacity-90"
          />
        ) : null}
      </El>

      {/* Copy + form */}
      <div className="relative z-10 grid grid-cols-1 items-center gap-10 px-5 pt-14 pb-10 @3xl:grid-cols-[1fr_minmax(0,360px)] @3xl:gap-[4cqw] @3xl:px-[5.5%] @3xl:pt-[8cqw] @3xl:pb-[5.5cqw]">
        <El block={block} id={part(block, "copy")}>
          <Text ctx={ctx} k="modernEyebrow" className="uppercase tracking-[0.22em] text-[10.5px] @3xl:text-[11px] text-white/85" />
          <Text
            ctx={ctx}
            k="modernTitle"
            as="h1"
            className="mt-5 whitespace-pre-line font-semibold leading-[0.98] tracking-[-0.05em] text-[44px] @md:text-[56px] @3xl:text-[clamp(44px,6cqw,92px)]"
            style={{ fontFamily: INTER_TIGHT }}
          />
          <Text ctx={ctx} k="modernText" className="mt-7 max-w-[400px] whitespace-pre-line text-[14px] leading-[1.75] text-white/90" />
          <div className="mt-9 flex flex-wrap items-center gap-6">
            {str(p.modernCta) ? (
              <CtaButton
                block={block}
                id={part(block, "modernCta")}
                prefix="modernCta"
                label={str(p.modernCta)}
                href={safeHref(p.modernCtaUrl)}
                target={str(p.modernCtaTarget)}
                onClick={() => scrollToAnchor(str(p.modernCtaAnchor, "enquire"))}
                brand={null}
                icon={arrow}
                className="inline-flex items-center gap-5 rounded-full bg-white px-5 py-3 text-[12.5px] text-[#0b0b0b] hover:opacity-90"
              />
            ) : null}
            {str(p.modernLink) ? (
              <CtaButton
                block={block}
                id={part(block, "modernLink")}
                prefix="modernLink"
                label={str(p.modernLink)}
                href={safeHref(p.modernLinkUrl)}
                target={str(p.modernLinkTarget)}
                onClick={() => scrollToAnchor(str(p.modernLinkAnchor, "enquire"))}
                brand={null}
                icon={arrow}
                className="inline-flex items-center gap-3 border-b border-white/70 pb-1.5 text-[12px] text-white hover:border-white"
              />
            ) : null}
          </div>
        </El>
        <El block={block} id={part(block, "formCard")} className="rounded-[18px] bg-white p-5 text-[#0b0b0b] shadow-[0_20px_50px_rgba(0,0,0,0.25)] @3xl:p-6">
          <Text ctx={ctx} k="modernFormTitle" as="h2" className="mb-4 text-[18px] tracking-[-0.01em]" />
          <El block={block} id={part(block, "form")}>
            <LeadForm ctx={formCtx} />
          </El>
        </El>
      </div>
    </section>
  );
}
