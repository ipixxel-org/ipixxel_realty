"use client";

import { useMemo } from "react";
import type { SiteConfig, BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { resolveTheme, themeToCSS } from "@/lib/openpage/theme-presets";
import { useGoogleFonts } from "@/lib/openpage/useGoogleFonts";
import { DeviceProvider } from "@/components/openpage/runtime/device";
import { OpenPageRuntimeProvider } from "@/components/openpage/runtime/OpenPageRuntime";
import type { FormDefinition } from "@/lib/openpage/forms-store";
import { mergeFormLibraries } from "@/lib/openpage/resolve-form";
import { PageSettingsChrome } from "@/components/openpage/renderer/PageSettingsChrome";
import { applyVarsDeep } from "@/lib/openpage/block-style";

function varsFromProperty(site: SiteConfig): Record<string, string> {
  if (site.vars && Object.keys(site.vars).length) return site.vars;
  const p = site.property;
  if (!p) return {};
  return {
    property_name: p.name || "",
    builder_name: p.builder || "",
    starting_price: p.startingPrice || "",
    rera_number: p.reraNumber || "",
    possession_date: p.possession || "",
    carpet_area: p.carpetArea || "",
    location: p.location || "",
    description: p.description || "",
    tagline: p.description || "",
    land_area: p.landArea || "",
    towers: p.towers || "",
    units: p.units || "",
  };
}

export function SiteRenderer({
  site,
  live = true,
  pageId,
  projectName,
  forms,
  projectId,
  unitId,
}: {
  site: SiteConfig;
  live?: boolean;
  pageId?: string;
  projectName?: string;
  forms?: FormDefinition[];
  projectId?: string;
  unitId?: string;
}) {
  const resolvedSite = useMemo(() => {
    const vars = varsFromProperty(site);
    if (!Object.keys(vars).length) return site;
    return applyVarsDeep(site, vars) as SiteConfig;
  }, [site]);

  const pages =
    resolvedSite.pages && resolvedSite.pages.length > 0
      ? resolvedSite.pages
      : [{ id: "page-home", name: "Home", path: "/", blocks: resolvedSite.blocks }];
  const blocks: BlockConfig[] = pages[0]?.blocks ?? resolvedSite.blocks ?? [];
  const { typography, theme: themeOverride } = resolvedSite.settings ?? {};

  const resolved = useMemo(() => {
    const base = resolveTheme(resolvedSite.theme);
    return {
      ...base,
      fontSans: typography?.bodyFont || base.fontSans,
      fontDisplay: typography?.headingFont || base.fontDisplay,
      accent: themeOverride?.primary || base.accent,
      ctaButtonColor: themeOverride?.ctaButtonColor || base.ctaButtonColor,
      text0: themeOverride?.text || base.text0,
      bg1: themeOverride?.bg ?? base.bg1,
      radius: themeOverride?.radius ?? base.radius,
    };
  }, [
    resolvedSite.theme,
    typography?.bodyFont,
    typography?.headingFont,
    themeOverride?.primary,
    themeOverride?.ctaButtonColor,
    themeOverride?.text,
    themeOverride?.bg,
    themeOverride?.radius,
  ]);
  const cssVars = useMemo(() => {
    const vars = themeToCSS(resolved);
    if (resolvedSite.settings?.theme?.containerWidth) {
      Object.assign(vars, { "--op-container": `${resolvedSite.settings.theme.containerWidth}px` });
    }
    return vars;
  }, [resolved, resolvedSite.settings]);
  useGoogleFonts([resolved.fontSans, resolved.fontDisplay, resolved.fontMono]);
  const library = mergeFormLibraries(forms, resolvedSite.forms);

  const binding = resolvedSite.propertyBinding;
  const resolvedProjectId =
    projectId || (binding?.kind === "project" ? binding.projectId : undefined);
  const resolvedUnitId = unitId || (binding?.kind === "unit" ? binding.unitId : undefined);

  return (
    <OpenPageRuntimeProvider
      live={live}
      pageId={pageId}
      projectName={projectName || resolvedSite.property?.name || resolvedSite.name}
      projectId={resolvedProjectId}
      unitId={resolvedUnitId}
      brochureUrl={resolvedSite.property?.brochureUrl}
      forms={library}
      popups={resolvedSite.popups ?? []}
    >
      <div
        className="op-site @container min-h-screen w-full"
        style={{ ...cssVars, color: "var(--color-text-0)", backgroundColor: "var(--color-bg-1)" } as React.CSSProperties}
      >
        {resolvedSite.settings ? <PageSettingsChrome settings={resolvedSite.settings} /> : null}
        <DeviceProvider device="auto">
          {blocks.map((block) => (
            <RenderBlock key={block.id} block={block} />
          ))}
        </DeviceProvider>
      </div>
    </OpenPageRuntimeProvider>
  );
}
