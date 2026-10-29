"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { BlockConfig, ElementId } from "./types";
import { El } from "./El";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Colours for a button stored on the block's props under one prefix, using the
 * same names as the generic Hero: `${prefix}Color` (background),
 * `${prefix}TextColor`, `${prefix}HoverColor`, `${prefix}HoverTextColor`,
 * `${prefix}BorderColor` and `${prefix}Radius`.
 */
export function ctaColors(props: Record<string, unknown>, prefix: string) {
  const radius = Number(props[`${prefix}Radius`]);
  return {
    bg: str(props[`${prefix}Color`]),
    text: str(props[`${prefix}TextColor`]),
    hoverBg: str(props[`${prefix}HoverColor`]),
    hoverText: str(props[`${prefix}HoverTextColor`]),
    border: str(props[`${prefix}BorderColor`]),
    radius: Number.isFinite(radius) && radius >= 0 && props[`${prefix}Radius`] !== "" ? `${radius}px` : "",
  };
}

/**
 * A section's call-to-action button.
 *
 * - Renders nothing when its text is empty, so clearing the text removes the
 *   whole button (including its arrow) rather than leaving an empty pill.
 * - Its colours come from props (Content tab) and it is an {@link El}, so it can
 *   also be styled from the Element tab.
 * - Carries `op-btn`, which keeps section-wide Type settings off it.
 */
export function CtaButton({
  block,
  id,
  prefix,
  label,
  href,
  target,
  onClick,
  className = "",
  icon = <ArrowRight size={15} />,
  brand = /secondary/i.test(prefix) ? "secondary" : null,
}: {
  block: BlockConfig;
  id: ElementId;
  /** Prop prefix holding this button's colours, e.g. `primaryCta`. */
  prefix: string;
  label: string | undefined;
  /** When set the button is a link; otherwise it runs `onClick`. */
  href?: string;
  target?: string;
  onClick?: () => void;
  className?: string;
  /** Trailing icon; `null` for none. */
  icon?: ReactNode;
  /**
   * Which Page Settings → Branding colour this button takes by default
   * (see `[data-op-cta]` in openpage.css). Buttons already on `bg-green`
   * follow the CTA colour without it. `null` keeps the block's own look,
   * e.g. a light button on a dark photo.
   */
  brand?: "primary" | "secondary" | null;
}) {
  const text = (label ?? "").trim();
  if (!text) return null;

  const c = ctaColors(block.props, prefix);
  const style: CSSProperties = {
    backgroundColor: c.bg || undefined,
    color: c.text || undefined,
    borderColor: c.border || undefined,
    borderStyle: c.border ? "solid" : undefined,
    borderWidth: c.border ? 1 : undefined,
    borderRadius: c.radius || undefined,
  };
  const hover = {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      if (c.hoverBg) e.currentTarget.style.backgroundColor = c.hoverBg;
      if (c.hoverText) e.currentTarget.style.color = c.hoverText;
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      e.currentTarget.style.backgroundColor = c.bg;
      e.currentTarget.style.color = c.text;
    },
  };
  const content = (
    <>
      {text}
      {icon}
    </>
  );
  const classes = `op-btn inline-flex items-center justify-center gap-2 transition-colors ${className}`;
  const brandAttr = brand ? { "data-op-cta": brand } : {};

  const link = (href ?? "").trim();
  if (link) {
    const newTab = target === "_blank";
    return (
      <El
        block={block}
        id={id}
        as="a"
        href={link}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        className={classes}
        style={style}
        {...brandAttr}
        {...hover}
      >
        {content}
      </El>
    );
  }
  return (
    <El block={block} id={id} as="button" type="button" onClick={onClick} className={classes} style={style} {...brandAttr} {...hover}>
      {content}
    </El>
  );
}
