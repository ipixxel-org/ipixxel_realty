"use client";

import type { BlockConfig } from "../types";
import { Mail } from "lucide-react";
import { useOpenPageRuntime } from "@/components/openpage/runtime/OpenPageRuntime";
import { DynamicLeadForm } from "@/components/openpage/dynamic-lead-form";
import { findFormById, loadFormLibrary } from "@/lib/openpage/forms-store";
import { mergeFormLibraries } from "@/lib/openpage/resolve-form";
import { isMediaSrc } from "@/lib/media";
import { El } from "../El";

export function NewsletterBlock({ block }: { block: BlockConfig }) {
  const runtime = useOpenPageRuntime();
  const title = typeof block.props.title === "string" ? block.props.title : "Stay in the loop";
  const subtitle =
    typeof block.props.subtitle === "string"
      ? block.props.subtitle
      : "Get updates on this project. No spam.";
  const formId = typeof block.props.formId === "string" ? block.props.formId : "";
  const library = typeof window !== "undefined" ? loadFormLibrary() : [];
  const forms = mergeFormLibraries(runtime.forms, library);
  const form = formId ? findFormById(formId, forms) : forms[0];
  // The icon above the title: the default envelope, an uploaded logo/icon, or
  // hidden entirely with "Show icon" off.
  const icon = typeof block.props.icon === "string" ? block.props.icon : "";
  const showIcon = block.props.showIcon !== false;

  return (
    <section className="px-6 @md:px-10 py-12 @md:py-16">
      <div className="max-w-xl mx-auto text-center">
        {showIcon ? (
          <El block={block} id="newsletter:icon" className="w-12 h-12 rounded-xl bg-green/10 border border-green/20 flex items-center justify-center text-green mx-auto mb-4 overflow-hidden">
            {isMediaSrc(icon) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="w-full h-full object-contain p-1.5" />
            ) : (
              <Mail size={22} />
            )}
          </El>
        ) : null}
        <El block={block} id="newsletter:title" as="h2" className="text-xl @md:text-2xl font-bold tracking-tight mb-2">{title}</El>
        {subtitle ? <El block={block} id="newsletter:subtitle" as="p" className="text-text-2 text-sm mb-6">{subtitle}</El> : null}
        <div data-op-panel="" className="rounded-2xl border border-border-default bg-bg-2 p-5 text-left">
          {form ? (
            <DynamicLeadForm
              form={form}
              live={runtime.live}
              pageId={runtime.pageId}
              place="newsletter"
              projectName={runtime.projectName}
              projectId={runtime.projectId}
              unitId={runtime.unitId}
            />
          ) : (
            <p className="text-sm text-text-3 text-center">
              Attach a Form Builder form in Properties for newsletter signups.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
