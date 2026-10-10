import type { CSSProperties } from "react";
import type { FormLeadField, LandingPageData, SiteConfig } from "./types";
import { defaultTypography } from "./design-system";
import {
  DEFAULT_FOOTER_DESIGN,
  DEFAULT_HEADER_DESIGN,
  defaultFooterSettings,
  defaultFooterStyle,
  defaultHeaderSettings,
  defaultHeaderStyle,
  labelsFromLinks,
  linksOf,
} from "./chrome-presets";

const DEFAULT_FIELDS: FormLeadField[] = [
  { id: "f1", type: "text", label: "Full name", placeholder: "e.g. Rohan Kapoor", required: true },
  { id: "f2", type: "phone", label: "Phone number", placeholder: "+91 98765 43210", required: true },
  { id: "f3", type: "email", label: "Email address", placeholder: "you@email.com", required: false },
  { id: "f4", type: "select", label: "Interested in", placeholder: "Choose an option", required: true, options: [] },
  { id: "f5", type: "checkbox", label: "I agree to receive updates", placeholder: "", required: true },
];

export function defaultSiteConfig(input: {
  name: string;
  slug: string;
  domain?: string;
  primary?: string;
  accent?: string;
}): SiteConfig {
  const host = input.domain?.trim() || "";
  const title = `${input.name} | Real Estate`;
  return {
    page: { language: "en", password: "", favicon: "/favicon.ico" },
    seo: {
      metaTitle: title.slice(0, 60),
      metaDescription: `Explore ${input.name}. Book a site visit and get pricing, floor plans and offers.`,
      keywords: "real estate, apartments, site visit",
      // Empty when no domain is assigned: renderers fall back to the real
      // page URL rather than emitting a placeholder localhost canonical.
      canonical: host ? `https://${host}` : "",
      index: true,
      sitemap: true,
      ogTitle: input.name,
      ogDescription: `Explore ${input.name}. Book a site visit today.`,
      ogImage: "/og-default.jpg",
    },
    brand: {
      name: input.name,
      tagline: "Luxury living, thoughtfully built.",
      email: "hello@example.com",
      phone: "+91 98765 43210",
      primary: input.primary || "#6D5DFC",
      accent: input.accent || "#CDA45E",
      headingFont: "Playfair Display",
      bodyFont: "Inter",
      logo: "",
      facebook: "",
      instagram: "",
      twitter: "",
      youtube: "",
      linkedin: "",
      accentButtons: true,
    },
    header: {
      sticky: true,
      transparent: false,
      showTopbar: true,
      variant: "light",
      cta: "Book a Site Visit",
      ctaLink: "#contact",
      menu: ["Amenities", "Floor Plans", "Gallery", "Pricing", "Contact"],
      menuLinks: ["Amenities", "Floor Plans", "Gallery", "Pricing", "Contact"].map((label) => ({
        label,
        href: `#${label.toLowerCase().replace(/\s+/g, "-")}`,
      })),
      design: DEFAULT_HEADER_DESIGN,
      settings: defaultHeaderSettings(DEFAULT_HEADER_DESIGN),
      style: defaultHeaderStyle(DEFAULT_HEADER_DESIGN),
      floatEnabled: true,
      floatSide: "right",
      floatWhatsapp: true,
      floatCall: true,
      floatEnquire: true,
      floatEmail: true,
    },
    footer: {
      rera: "",
      copyright: `© ${new Date().getFullYear()} ${input.name}. All rights reserved.`,
      design: DEFAULT_FOOTER_DESIGN,
      settings: defaultFooterSettings(DEFAULT_FOOTER_DESIGN),
      style: defaultFooterStyle(DEFAULT_FOOTER_DESIGN),
    },
    tracking: {
      gaId: "",
      gtmId: "",
      metaPixel: "",
      customScripts: "",
      utmSource: "facebook",
      utmMedium: "cpc",
      utmCampaign: "launch",
      goalForm: true,
      goalWhatsapp: true,
      goalCall: true,
      goalBrochure: false,
    },
    form: {
      name: `${input.name} — Enquiry Form`,
      description: "Collects leads for this template. Fully configurable — fields, PDF, thank-you & embed.",
      embed: { id: `emb_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`, allowExternal: true },
      pdf: { enabled: false, url: "", filename: "brochure.pdf", autoDownload: true },
      thankYouPage: {
        enabled: true,
        heading: "Thank You — You're All Set!",
        description: "Your enquiry has been received. A relationship manager will call you within 15 minutes.",
        text: "Meanwhile, explore the brochure or book a priority site visit. Editing this thank-you only affects this form.",
        image: "",
        icon: "CheckCircle2",
        buttons: [
          { label: "Download Brochure", href: "", variant: "primary" },
          { label: "Back to Website", href: "/", variant: "outline" },
        ],
        html: "",
        successMessage: "Thanks — our team will call you shortly.",
        showPdfConfirmation: true,
        typography: { fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.6, textColor: "#111827" },
        colors: { bg: "#ffffff", text: "#111827", accent: input.primary || "#6D5DFC" },
        background: "#ffffff",
        spacing: { padding: 32, margin: 0, gap: 16 },
        alignment: "center",
        responsive: {},
      },
      notifyEmail: "",
      whatsapp: "",
      thankYou: "Thanks — our team will call you shortly.",
      multiStep: false,
      templateId: "custom",
      saveToCrm: true,
      sendEmail: true,
      sendWhatsapp: true,
      redirectThankYou: false,
      submitLabel: "Submit",
      deliverableUrl: "",
      deliverableLabel: "",
      fields: DEFAULT_FIELDS.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
      successAction: "message",
      successUrl: "",
      successTitle: "",
      errorMessage: "Please fill in the highlighted required fields.",
      openPopupId: "",
      customActions: [],
    },
    forms: [],
    media: { notes: "" },
    designSystem: { scope: "template", typography: defaultTypography() },
  };
}

const SEED: Record<string, Partial<{ primary: string; accent: string; brand: string; tagline: string; keywords: string; rera: string; ga: string; headerDesign: string; footerDesign: string }>> = {
  p1: {
    primary: "#6D5DFC",
    accent: "#CDA45E",
    brand: "Aurora Residences",
    tagline: "Premium 3 & 4 BHK homes on Sarjapur Road.",
    keywords: "premium apartments, sarjapur, bangalore, rera",
    rera: "PRM/KA/RERA/1251/446/PR/2026/1",
    ga: "G-AURORA01",
    headerDesign: "classic",
    footerDesign: "columns",
  },
  p2: {
    primary: "#2563EB",
    accent: "#10B981",
    brand: "Northstar Residences",
    tagline: "Founders' pricing from ₹89 L in Hebbal.",
    keywords: "new launch, hebbal, founders offer, northstar",
    rera: "PRM/KA/RERA/1251/447/PR/2026/2",
    ga: "G-NORTH02",
    headerDesign: "minimal",
    footerDesign: "slimbar",
  },
  p3: {
    primary: "#B08D57",
    accent: "#171310",
    brand: "The Residences at Indus",
    tagline: "Limited-edition sky residences in Whitefield.",
    keywords: "luxury apartments, whitefield, sky residences, indus",
    rera: "PRM/KA/RERA/1251/448/PR/2026/3",
    ga: "G-INDUS03",
    headerDesign: "overlay",
    footerDesign: "centered",
  },
  p4: {
    primary: "#E11D48",
    accent: "#F97316",
    brand: "Skyline Greens",
    tagline: "Campaign pricing from ₹62 L in Electronic City.",
    keywords: "ad campaign, electronic city, discount offer, skyline greens",
    rera: "PRM/KA/RERA/1251/449/PR/2026/4",
    ga: "G-SKYLN04",
    headerDesign: "ribbon",
    footerDesign: "cards",
  },
};

export function seedConfigFor(
  page: Pick<LandingPageData, "id" | "name" | "slug"> & Partial<LandingPageData>,
): SiteConfig {
  const extra = SEED[page.id] ?? (page.parentPageId ? SEED[page.parentPageId] : undefined);
  const brandName = extra?.brand ?? (page.pageType === "thank-you" ? page.name.replace(/ — Thank You$/, "") : page.name);
  const base = defaultSiteConfig({
    name: brandName,
    slug: page.slug,
    domain: page.domain ?? "",
    primary: extra?.primary,
    accent: extra?.accent,
  });
  if (!extra) return base;
  const menuLinks = linksOf(base.header);
  return {
    ...base,
    seo: {
      ...base.seo,
      metaTitle: `${extra.brand} | ${page.template ?? page.name}`.slice(0, 60),
      metaDescription: extra.tagline || base.seo.metaDescription,
      keywords: extra.keywords || base.seo.keywords,
      ogTitle: extra.brand || page.name,
      ogDescription: extra.tagline || base.seo.ogDescription,
    },
    brand: {
      ...base.brand,
      name: extra.brand || page.name,
      tagline: extra.tagline || base.brand.tagline,
      email: `hello@${page.domain || "example.com"}`,
    },
    header: {
      ...base.header,
      design: (extra.headerDesign as SiteConfig["header"]["design"]) || DEFAULT_HEADER_DESIGN,
      settings: defaultHeaderSettings((extra.headerDesign as SiteConfig["header"]["design"]) || DEFAULT_HEADER_DESIGN),
      style: defaultHeaderStyle((extra.headerDesign as SiteConfig["header"]["design"]) || DEFAULT_HEADER_DESIGN),
      menuLinks,
      menu: labelsFromLinks(menuLinks),
    },
    footer: {
      ...base.footer,
      rera: extra.rera || "",
      design: (extra.footerDesign as SiteConfig["footer"]["design"]) || DEFAULT_FOOTER_DESIGN,
      settings: defaultFooterSettings((extra.footerDesign as SiteConfig["footer"]["design"]) || DEFAULT_FOOTER_DESIGN),
      style: defaultFooterStyle((extra.footerDesign as SiteConfig["footer"]["design"]) || DEFAULT_FOOTER_DESIGN),
    },
    tracking: { ...base.tracking, gaId: extra.ga || "" },
  };
}

export function ensureConfig(page: LandingPageData): SiteConfig {
  return page.config ? hydrateConfig(page.config, page) : seedConfigFor(page);
}

function hydrateConfig(raw: SiteConfig, page: LandingPageData): SiteConfig {
  const fallback = seedConfigFor(page);
  // Header/footer chrome: keep the stored design + customizations when present,
  // otherwise fall back to this page's own seed — never another page's config.
  const rawHeader = raw.header ?? fallback.header;
  const headerDesign = rawHeader.design ?? fallback.header.design ?? DEFAULT_HEADER_DESIGN;
  const headerMenuLinks =
    Array.isArray(rawHeader.menuLinks) && rawHeader.menuLinks.length > 0
      ? rawHeader.menuLinks
      : Array.isArray(fallback.header.menuLinks)
        ? fallback.header.menuLinks
        : linksOf(rawHeader);
  const header = {
    ...fallback.header,
    ...rawHeader,
    design: headerDesign,
    settings: { ...defaultHeaderSettings(headerDesign), ...(rawHeader.settings ?? {}) },
    style: { ...defaultHeaderStyle(headerDesign), ...(rawHeader.style ?? {}) },
    menuLinks: headerMenuLinks,
    menu:
      Array.isArray(rawHeader.menu) && rawHeader.menu.length > 0
        ? rawHeader.menu
        : headerMenuLinks.map((l) => l.label),
  } as SiteConfig["header"];
  const rawFooter = raw.footer ?? fallback.footer;
  const footerDesign = rawFooter.design ?? fallback.footer.design ?? DEFAULT_FOOTER_DESIGN;
  const footer = {
    ...fallback.footer,
    ...rawFooter,
    design: footerDesign,
    settings: { ...defaultFooterSettings(footerDesign), ...(rawFooter.settings ?? {}) },
    style: { ...defaultFooterStyle(footerDesign), ...(rawFooter.style ?? {}) },
  } as SiteConfig["footer"];
  return {
    page: { ...fallback.page, ...raw.page },
    seo: { ...fallback.seo, ...raw.seo },
    brand: { ...fallback.brand, ...raw.brand },
    header,
    footer,
    tracking: { ...fallback.tracking, ...raw.tracking },
    form: {
      ...fallback.form,
      ...raw.form,
      embed: raw.form?.embed ?? fallback.form.embed,
      pdf: { ...fallback.form.pdf, ...(raw.form?.pdf ?? {}) },
      thankYouPage: {
        ...fallback.form.thankYouPage,
        ...(raw.form?.thankYouPage ?? {}),
        buttons: raw.form?.thankYouPage?.buttons ?? fallback.form.thankYouPage.buttons,
        typography: { ...fallback.form.thankYouPage.typography, ...(raw.form?.thankYouPage?.typography ?? {}) },
        colors: { ...fallback.form.thankYouPage.colors, ...(raw.form?.thankYouPage?.colors ?? {}) },
        spacing: { ...fallback.form.thankYouPage.spacing, ...(raw.form?.thankYouPage?.spacing ?? {}) },
      },
      fields: raw.form?.fields?.length ? raw.form.fields : fallback.form.fields,
      customActions: raw.form?.customActions ?? fallback.form.customActions ?? [],
    },
    forms: Array.isArray(raw.forms) ? raw.forms : (fallback.forms ?? []),
    media: { ...fallback.media, ...raw.media },
    ...(raw.propertyBinding ? { propertyBinding: raw.propertyBinding } : {}),
    ...(raw.vars ? { vars: raw.vars } : {}),
    ...(raw.property ? { property: raw.property } : {}),
    ...(raw.designSystem ? { designSystem: raw.designSystem } : {}),
    // Template plan access lives in config — keep it so builder saves don't wipe it.
    ...(Array.isArray(raw.allowedPlanIds) ? { allowedPlanIds: raw.allowedPlanIds } : {}),
  };
}

export function cloneConfig(config: SiteConfig): SiteConfig {
  return JSON.parse(JSON.stringify(config)) as SiteConfig;
}

function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (full.length !== 6) return `rgba(109, 93, 252, ${alpha})`;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(109, 93, 252, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function googleFontsHref(...names: string[]): string {
  const families = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (families.length === 0) return "";
  const q = families.map((n) => `family=${n.replace(/ /g, "+")}:wght@400;500;600;700;800`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

export function siteThemeStyle(brand: SiteConfig["brand"]): CSSProperties {
  const primary = brand.primary || "#6D5DFC";
  const accent = brand.accent || "#CDA45E";
  return {
    ["--ps-site-primary" as string]: primary,
    ["--ps-site-accent" as string]: accent,
    ["--ps-primary" as string]: primary,
    ["--ps-primary-dark" as string]: primary,
    ["--ps-primary-soft" as string]: withAlpha(primary, 0.14),
    ["--ps-primary-mist" as string]: withAlpha(primary, 0.08),
    ["--ps-primary-glow" as string]: withAlpha(primary, 0.32),
    ["--ps-grad-primary" as string]: `linear-gradient(135deg, ${primary}, ${accent})`,
    ["--ps-heading-font" as string]: `${brand.headingFont}, Georgia, serif`,
    fontFamily: `${brand.bodyFont}, Inter, system-ui, sans-serif`,
  };
}
