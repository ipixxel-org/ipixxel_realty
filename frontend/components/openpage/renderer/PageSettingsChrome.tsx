"use client";

import { useMemo } from "react";
import type { PageSettings, HeadingStyle } from "@/lib/openpage/types";

const LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function headingRule(level: (typeof LEVELS)[number], s?: HeadingStyle): string {
  const parts = [
    s?.size && `font-size:${s.size}`,
    s?.weight && `font-weight:${s.weight}`,
    s?.lineHeight && `line-height:${s.lineHeight}`,
    s?.letterSpacing && `letter-spacing:${s.letterSpacing}`,
  ].filter(Boolean);
  return parts.length ? `.op-site ${level}{${parts.join(";")}}` : "";
}

export function PageSettingsChrome({ settings }: { settings: PageSettings }) {
  const { typography, theme, page } = settings;
  const tablet = typography?.tabletScale ?? 0.875;
  const mobile = typography?.mobileScale ?? 0.75;

  const typoCss = useMemo(() => {
    const sized = LEVELS.filter((h) => typography?.[h]?.size);
    const heading = sized.map((h) => {
      const override = typography?.[h];
      const base = headingRule(h, override);
      const media = [
        `@media(max-width:1023px){.op-site ${h}{${headingScale(override, tablet)}}}`,
        `@media(max-width:639px){.op-site ${h}{${headingScale(override, mobile)}}}`,
      ].join("\n");
      return `${base}\n${media}`;
    }).join("\n");

    const body = [
      typography?.bodySize && `.op-site p,.op-site li,.op-site input,.op-site textarea,.op-site button{font-size:${typography.bodySize}}`,
      typography?.bodyWeight && `.op-site p,.op-site li{font-weight:${typography.bodyWeight}}`,
      typography?.bodyLineHeight && `.op-site p,.op-site li{line-height:${typography.bodyLineHeight}}`,
    ].filter(Boolean).join("\n");

    return [heading, body].filter(Boolean).join("\n");
  }, [typography, tablet, mobile]);

  const chrome = [typoCss, typography?.customFontCss, page?.customCss].filter(Boolean).join("\n\n");

  return (
    <>
      {chrome ? <style id="op-page-settings-css">{chrome}</style> : null}
      {page?.favicon ? <link rel="icon" href={page.favicon} /> : null}
      {/* Custom JavaScript is no longer offered; previously saved scripts
          are not run, so no hidden code executes on the live page. */}
      {theme?.containerWidth ? (
        <style>{`.op-site .op-container{max-width:var(--op-container,1200px);margin-left:auto;margin-right:auto}`}</style>
      ) : null}
    </>
  );
}

function headingScale(s: HeadingStyle | undefined, factor: number): string {
  if (!s?.size) return "";
  const parsed = parseFloat(s.size) || 1;
  const scaled = `${(parsed * factor).toFixed(3)}${s.size.endsWith("rem") ? "rem" : "em"}`;
  const parts = [`font-size:${scaled}`];
  if (s.weight) parts.push(`font-weight:${s.weight}`);
  if (s.lineHeight) parts.push(`line-height:${s.lineHeight}`);
  return parts.join(";");
}