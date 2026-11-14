"use client";

import { useMemo } from "react";
import type { SiteConfig, BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { resolveSiteTheme, siteBrandAttrs, siteThemeCSS, sitePageBackground } from "@/lib/openpage/theme-presets";
import { useGoogleFonts } from "@/lib/openpage/useGoogleFonts";
import { blockFontFamilies } from "@/lib/openpage/block-fonts";
import { DeviceProvider } from "@/components/openpage/runtime/device";
import { OpenPageRuntimeProvider } from "@/components/openpage/runtime/OpenPageRuntime";
import type { FormDefinition } from "@/lib/openpage/forms-store";
import { mergeFormLibraries } from "@/lib/openpage/resolve-form";
import { PageSettingsChrome } from "@/components/openpage/renderer/PageSettingsChrome";
import { applyVarsDeep } from "@/lib/openpage/block-style";
import { shouldRenderBlock } from "@/lib/openpage/conditional-render";
import { ConditionalRenderProvider } from "@/components/openpage/renderer/ConditionalContext";

function varsFromProperty(site: SiteConfig): Record<string, string> {
  const p = site.property;
  const defaults: Record<string, string> = p
    ? {
        property_name: p.name || "",
        "property.name": p.name || "",
        builder_name: p.builder || "",
        "property.builder": p.builder || "",
        starting_price: p.startingPrice || "",
        "property.startingPrice": p.startingPrice || "",
        rera_number: p.reraNumber || "",
        "property.reraNumber": p.reraNumber || "",
        possession_date: p.possession || "",
        "property.possession": p.possession || "",
        carpet_area: p.carpetArea || "",
        "property.carpetArea": p.carpetArea || "",
        location: p.location || "",
        "property.location": p.location || "",
        description: p.description || "",
        "property.description": p.description || "",
        tagline: p.description || "",
        "property.tagline": p.description || "",
        land_area: p.landArea || "",
        "property.landArea": p.landArea || "",
        towers: p.towers || "",
        "property.towers": p.towers || "",
        units: p.units || "",
        "property.units": p.units || "",
      }
    : {};

  return {
    ...defaults,
    ...(site.vars || {}),
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

  const blocks = useMemo<BlockConfig[]>(() => {
    const pages =
      resolvedSite.pages && resolvedSite.pages.length > 0
        ? resolvedSite.pages
        : [{ id: "page-home", name: "Home", path: "/", blocks: resolvedSite.blocks }];
    return pages[0]?.blocks ?? resolvedSite.blocks ?? [];
  }, [resolvedSite]);

  const conditionalContext = useMemo(
    () => ({ vars: varsFromProperty(resolvedSite), property: resolvedSite.property }),
    [resolvedSite],
  );
  const visibleBlocks = useMemo(
    () => blocks.filter((b) => shouldRenderBlock(b, conditionalContext)),
    [blocks, conditionalContext],
  );

  const resolved = useMemo(() => resolveSiteTheme(resolvedSite), [resolvedSite]);
  const cssVars = useMemo(() => siteThemeCSS(resolvedSite), [resolvedSite]);
  const brandAttrs = useMemo(() => siteBrandAttrs(resolvedSite), [resolvedSite]);
  // Fonts picked on individual blocks too, not only the theme fonts — otherwise
  // a heading set to e.g. Playfair Display falls back to a system font when live.
  const blockFonts = useMemo(
    () => blockFontFamilies([...(resolvedSite.blocks ?? []), ...(resolvedSite.pages ?? []).flatMap((p) => p.blocks ?? [])]),
    [resolvedSite],
  );
  useGoogleFonts([resolved.fontSans, resolved.fontDisplay, resolved.fontMono, ...blockFonts]);
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
        {...brandAttrs}
        className="op-site @container min-h-screen w-full"
        // Same page background as the builder canvas (see sitePageBackground).
        style={{ ...cssVars, color: "var(--color-text-0)", backgroundColor: sitePageBackground(resolvedSite) } as React.CSSProperties}
      >
        {resolvedSite.settings ? <PageSettingsChrome settings={resolvedSite.settings} /> : null}
        <DeviceProvider device="auto">
          <ConditionalRenderProvider value={conditionalContext}>
            {visibleBlocks.map((block) => (
              <RenderBlock key={block.id} block={block} />
            ))}
          </ConditionalRenderProvider>
        </DeviceProvider>
      </div>
    </OpenPageRuntimeProvider>
  );
}
