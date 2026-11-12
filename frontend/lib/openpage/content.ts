import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";
import type { LandingPageData, SectionInstance, SiteConfig as LegacyConfig } from "@/lib/openpage/types";
import { ensureConfig } from "@/lib/openpage/site-config";
import { themePresets } from "@/lib/openpage/theme-presets";
import { buildRealEstateTemplate } from "@/lib/openpage/re-templates";
import { loadFormLibrary, newFormDefinition, type FormDefinition } from "@/lib/openpage/forms-store";
import { mergeFormLibraries } from "@/lib/openpage/resolve-form";

const FORM_BLOCK_TYPES = new Set([
  "lead-form",
  "site-visit",
  "project-banner",
  "ipx-form",
  "contact",
  "newsletter",
  "download-brochure",
  "cta",
  "floor-plans",
  "off-canvas",
]);

/** Every block, including widgets nested inside containers / Divs. */
function allBlocks(blocks: BlockConfig[]): BlockConfig[] {
  const out: BlockConfig[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const b of list as BlockConfig[]) {
      if (!b || typeof b !== "object") continue;
      out.push(b);
      const cols = (b.props as Record<string, unknown> | undefined)?.columns;
      if (b.type === "columns" && Array.isArray(cols)) for (const c of cols) walk((c as { blocks?: unknown })?.blocks);
    }
  };
  walk(blocks);
  return out;
}

function siteBlocks(site: SiteConfig): BlockConfig[] {
  if (Array.isArray(site.blocks) && site.blocks.length) return site.blocks;
  const pageBlocks = site.pages?.[0]?.blocks;
  return Array.isArray(pageBlocks) ? pageBlocks : [];
}

/**
 * Make sure every form referenced by blocks/popups is embedded on the site
 * itself (not only in the builder's localStorage library). Visitors never see
 * the admin browser library — without this, live pages show empty forms and
 * lead submits never capture field schemas.
 */
export function ensureSiteForms(site: SiteConfig): SiteConfig {
  const blocks = siteBlocks(site);
  const pageForms = (site.forms ?? []) as FormDefinition[];
  const library = typeof window !== "undefined" ? loadFormLibrary() : [];
  const catalog = mergeFormLibraries(pageForms, library);

  const needed = new Set<string>();
  // Nested widgets count too (e.g. a form or Off-Canvas inside a container),
  // or their form would be missing on the live page.
  for (const block of allBlocks(blocks)) {
    const fid = block.props?.formId;
    if (typeof fid === "string" && fid.trim()) needed.add(fid.trim());
  }
  for (const popup of site.popups ?? []) {
    if (popup.formId?.trim()) needed.add(popup.formId.trim());
  }

  const forms: FormDefinition[] = [...pageForms];
  const seen = new Set(forms.map((f) => f.id));
  for (const id of needed) {
    if (seen.has(id)) continue;
    const found = catalog.find((f) => f.id === id);
    if (found) {
      forms.push(JSON.parse(JSON.stringify(found)) as FormDefinition);
      seen.add(id);
    }
  }

  let defaultForm = forms[0];
  const needsDefault = blocks.some(
    (b) => FORM_BLOCK_TYPES.has(b.type) && !String(b.props?.formId ?? "").trim(),
  );
  if (needsDefault && !defaultForm) {
    defaultForm = newFormDefinition(undefined, "Project enquiry");
    forms.push(defaultForm);
  }

  const bindId = defaultForm?.id;
  const nextBlocks =
    bindId
      ? blocks.map((b) => {
          if (!FORM_BLOCK_TYPES.has(b.type)) return b;
          if (String(b.props?.formId ?? "").trim()) return b;
          return { ...b, props: { ...b.props, formId: bindId } };
        })
      : blocks;

  const pages =
    site.pages && site.pages.length
      ? site.pages.map((p, i) => (i === 0 ? { ...p, blocks: nextBlocks } : p))
      : [{ id: "page-home", name: "Home", path: "/", blocks: nextBlocks }];

  return {
    ...site,
    forms,
    blocks: nextBlocks,
    pages,
  };
}

export function isOpenPageSite(value: unknown): value is SiteConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as SiteConfig;
  return Array.isArray(v.blocks) || (Array.isArray(v.pages) && v.pages.length > 0);
}

export function normalizeSite(site: SiteConfig, name?: string): SiteConfig {
  const blocks = siteBlocks(site);
  const pages =
    site.pages && site.pages.length
      ? site.pages.map((p, i) => (i === 0 ? { ...p, blocks: p.blocks?.length ? p.blocks : blocks } : p))
      : [{ id: "page-home", name: "Home", path: "/", blocks }];
  return {
    ...site,
    engine: "openpage",
    name: site.name || name || "Untitled",
    blocks: pages[0]?.blocks ?? blocks,
    pages,
  };
}

export function siteFromLandingPage(page: LandingPageData): SiteConfig {
  const raw = page as LandingPageData & {
    openPageSite?: SiteConfig;
    site?: SiteConfig;
    content?: { site?: SiteConfig; config?: { site?: SiteConfig } & Record<string, unknown> };
  };
  const cfg = page.config ?? raw.content?.config;
  const candidates = [
    raw.openPageSite,
    raw.site,
    raw.content?.site,
    (raw.config as (LegacyConfig & { site?: SiteConfig }) | undefined)?.site,
    raw.content?.config?.site,
  ];
  for (const stored of candidates) {
    if (stored && isOpenPageSite(stored)) {
      const site = normalizeSite({ ...stored, name: stored.name || page.name });
      const binding = (cfg as { propertyBinding?: SiteConfig["propertyBinding"] } | undefined)?.propertyBinding
        ?? site.propertyBinding;
      const property = (cfg as { property?: SiteConfig["property"] } | undefined)?.property ?? site.property;
      const vars = (cfg as { vars?: Record<string, string> } | undefined)?.vars ?? site.vars;
      const cfgForms = (cfg as { forms?: SiteConfig["forms"] } | undefined)?.forms;
      const forms =
        Array.isArray(site.forms) && site.forms.length
          ? site.forms
          : Array.isArray(cfgForms) && cfgForms.length
            ? cfgForms
            : site.forms ?? cfgForms ?? [];
      return {
        ...site,
        forms,
        ...(binding ? { propertyBinding: binding } : {}),
        ...(property ? { property } : {}),
        ...(vars ? { vars } : {}),
      };
    }
  }
  if (page.sections?.length) {
    return migrateLegacySections(page);
  }
  return normalizeSite(buildRealEstateTemplate("blank", page.name || "Landing page"));
}

function migrateLegacySections(page: LandingPageData): SiteConfig {
  const cfg = ensureConfig(page);
  const blocks: BlockConfig[] = page.sections.map((section, i) => sectionToBlock(section, i));
  const ivory = themePresets.find((t) => t.id === "ivory")?.theme;
  return {
    engine: "openpage",
    name: page.name,
    pages: [{ id: "page-home", name: "Home", path: "/", blocks }],
    blocks,
    theme: ivory,
    forms: cfg.forms as SiteConfig["forms"],
    seo: cfg.seo,
    tracking: cfg.tracking,
    property: cfg.property,
  };
}

function sectionToBlock(section: SectionInstance, index: number): BlockConfig {
  const typeMap: Record<string, BlockConfig["type"]> = {
    hero: "project-banner",
    faq: "faq",
    gallery: "gallery",
    video: "video",
    testimonials: "testimonials",
    footer: "footer",
    "lead-form": "lead-form",
    amenities: "amenities",
    "floor-plans": "floor-plans",
    location: "location",
    "cta-banner": "cta",
    cta: "cta",
    pricing: "re-pricing",
  };
  const type = typeMap[section.type] ?? "custom-section";
  return {
    id: section.id || `block-migrated-${index}`,
    type,
    variant: "default",
    props: { ...section.settings, title: section.label || section.settings?.title },
  };
}

export function landingPageFromSite(page: LandingPageData, site: SiteConfig): LandingPageData {
  const cfg = ensureConfig(page);
  const secured = ensureSiteForms(site);
  const rawPath = secured.pages?.[0]?.path;
  const siteSlug = rawPath ? rawPath.replace(/^\/+/, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '') : undefined;
  return {
    ...page,
    name: secured.name || page.name,
    slug: siteSlug || page.slug,
    config: {
      ...cfg,
      settings: secured.settings ?? cfg.settings,
      page: {
        ...cfg.page,
        favicon: secured.settings?.page?.favicon ?? cfg.page.favicon,
        customCss: secured.settings?.page?.customCss ?? cfg.page.customCss,
        customJs: secured.settings?.page?.customJs ?? cfg.page.customJs,
      },
      forms: secured.forms ?? cfg.forms,
      seo: {
        ...cfg.seo,
        metaTitle: secured.seo?.metaTitle ?? cfg.seo.metaTitle,
        metaDescription: secured.seo?.metaDescription ?? cfg.seo.metaDescription,
        keywords: secured.seo?.keywords ?? cfg.seo.keywords,
        canonical: secured.seo?.canonical ?? cfg.seo.canonical,
        index: secured.seo?.index ?? cfg.seo.index,
        robots: secured.seo?.robots ?? cfg.seo.robots,
        ogTitle: secured.seo?.ogTitle ?? cfg.seo.ogTitle,
        ogDescription: secured.seo?.ogDescription ?? cfg.seo.ogDescription,
        ogImage: secured.seo?.ogImage ?? cfg.seo.ogImage,
        twitterCard: secured.seo?.twitterCard ?? cfg.seo.twitterCard,
        twitterTitle: secured.seo?.twitterTitle ?? cfg.seo.twitterTitle,
        twitterDescription: secured.seo?.twitterDescription ?? cfg.seo.twitterDescription,
        twitterImage: secured.seo?.twitterImage ?? cfg.seo.twitterImage,
        schema: secured.seo?.schema ?? cfg.seo.schema,
      },
      tracking: {
        ...cfg.tracking,
        gaId: secured.tracking?.gaId ?? cfg.tracking.gaId,
        gtmId: secured.tracking?.gtmId ?? cfg.tracking.gtmId,
        metaPixel: secured.tracking?.metaPixel ?? cfg.tracking.metaPixel,
        customScripts: secured.tracking?.customScripts ?? cfg.tracking.customScripts,
        headerScripts: secured.tracking?.headerScripts ?? cfg.tracking.headerScripts,
        bodyScripts: secured.tracking?.bodyScripts ?? cfg.tracking.bodyScripts,
        cookieConsent: secured.tracking?.cookieConsent ?? cfg.tracking.cookieConsent,
        consentText: secured.tracking?.consentText ?? cfg.tracking.consentText,
        utmSource: secured.tracking?.utmSource ?? cfg.tracking.utmSource,
        utmMedium: secured.tracking?.utmMedium ?? cfg.tracking.utmMedium,
        utmCampaign: secured.tracking?.utmCampaign ?? cfg.tracking.utmCampaign,
        goalForm: secured.tracking?.goalForm ?? cfg.tracking.goalForm,
        goalWhatsapp: secured.tracking?.goalWhatsapp ?? cfg.tracking.goalWhatsapp,
        goalCall: secured.tracking?.goalCall ?? cfg.tracking.goalCall,
        goalBrochure: secured.tracking?.goalBrochure ?? cfg.tracking.goalBrochure,
      },
    },
    openPageSite: { ...normalizeSite(secured, page.name), engine: "openpage" },
    sections: [],
  };
}

export function emptyOpenPage(name = "Untitled"): SiteConfig {
  return {
    engine: "openpage",
    name,
    pages: [{ id: "page-home", name: "Home", path: "/", blocks: [] }],
    blocks: [],
    forms: [],
    globalWidgets: [],
  };
}
