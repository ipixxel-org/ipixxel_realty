"use client";

import { El } from "../El";
import { part, safeHref, str } from "../elements/shared";
import { useOpenPageRuntime } from "@/components/openpage/runtime/OpenPageRuntime";
import { DynamicLeadForm } from "@/components/openpage/dynamic-lead-form";
import { findFormById, loadFormLibrary } from "@/lib/openpage/forms-store";
import { pageFormsWithLibraryFallback } from "@/lib/openpage/resolve-form";
import { resolveMapEmbed } from "../realestate/RealEstateBlocks";
import { Pic, Txt, type Ctx } from "./shared";

/* Parts shared by several iPixxel widgets: Form Builder form, map, footer links. */

/** The page's chosen Form Builder form, rendered unstyled by this widget. */
export function LeadForm({ ctx }: { ctx: Ctx }) {
  const runtime = useOpenPageRuntime();
  const library = typeof window !== "undefined" ? loadFormLibrary() : [];
  const forms = pageFormsWithLibraryFallback(runtime.forms, library);
  const formId = str(ctx.p.formId);
  const form = formId ? findFormById(formId, forms) : forms[0];
  if (!form) return <p className="text-sm opacity-60">Select a form in the Content tab.</p>;
  return (
    <DynamicLeadForm
      form={form}
      live={runtime.live}
      pageId={runtime.pageId}
      place="ipixxel-form"
      projectName={runtime.projectName}
      projectId={runtime.projectId}
      unitId={runtime.unitId}
    />
  );
}

/** "Disclaimer & Privacy Policy | Crafted by …" line. */
export function LinksLine({ ctx, linkColor, textColor }: { ctx: Ctx; linkColor: string; textColor: string }) {
  const href = safeHref(ctx.p.linkUrl);
  const hasLink = Boolean(str(ctx.p.linkText));
  const hasCredit = Boolean(str(ctx.p.credit));
  if (!hasLink && !hasCredit) return null;
  return (
    <p className="mt-8 text-center text-[13px] @3xl:text-[14px] tracking-[0.08em]" style={{ color: textColor }}>
      {hasLink ? (
        <El
          block={ctx.block}
          id={part(ctx.block, "linkText")}
          as={href ? "a" : "span"}
          href={href || undefined}
          target={href && /^https?:/i.test(href) ? "_blank" : undefined}
          rel={href && /^https?:/i.test(href) ? "noopener noreferrer" : undefined}
          className="hover:underline"
          style={{ color: linkColor }}
        >
          {str(ctx.p.linkText)}
        </El>
      ) : null}
      {hasLink && hasCredit ? <span> | </span> : null}
      <Txt ctx={ctx} k="credit" as="span" />
    </p>
  );
}

/** A live Google map (https embed only) when a map link is set, else the map image. */
export function MapArea({ ctx, className }: { ctx: Ctx; className: string }) {
  const embed = str(ctx.p.mapEmbed).trim();
  const src = embed ? resolveMapEmbed(embed).src : "";
  return (
    <El block={ctx.block} id={part(ctx.block, "map")} className={`relative overflow-hidden ${className}`}>
      {src.startsWith("https://") ? (
        <iframe title={str(ctx.p.title) || "Map"} src={src} className="absolute inset-0 w-full h-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      ) : (
        <Pic src={str(ctx.p.mapImage)} alt={str(ctx.p.title)} fit="contain" className="absolute inset-0 w-full h-full" />
      )}
    </El>
  );
}
