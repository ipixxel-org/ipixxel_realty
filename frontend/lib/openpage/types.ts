import type { DesignSystemState } from "./design-system";

export type Device = "desktop" | "tablet" | "mobile";

export type ModuleKey = "builder" | "settings";

/** Heading level typography (used by Page Settings). */
export interface HeadingStyle {
  size?: string;
  weight?: string;
  lineHeight?: string;
  letterSpacing?: string;
}

/** Page-scoped typography overrides (Page Settings → Typography). */
export interface TypographySettings {
  bodyFont?: string;
  headingFont?: string;
  bodySize?: string;
  bodyWeight?: string;
  bodyLineHeight?: string;
  h1?: HeadingStyle;
  h2?: HeadingStyle;
  h3?: HeadingStyle;
  h4?: HeadingStyle;
  h5?: HeadingStyle;
  h6?: HeadingStyle;
  /** Per-device size percentage relative to desktop (e.g. 0.9). */
  tabletScale?: number;
  mobileScale?: number;
  /** @font-face / custom font CSS injected verbatim. */
  customFontCss?: string;
}

/** Branding overrides applied on top of the template theme (Page Settings → Branding). */
export interface ThemeOverride {
  primary?: string;
  ctaButtonColor?: string;
  text?: string;
  bg?: string;
  radius?: number;
  containerWidth?: number;
}

/** Business contact details (Page Settings → Business Info). */
export interface BusinessSettings {
  name?: string;
  tagline?: string;
  address?: string;
  city?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

/** The per-page configuration bag edited by Page Settings. */
export interface PageSettings {
  theme: ThemeOverride;
  typography: TypographySettings;
  business: BusinessSettings;
  socialLinks: SocialLink[];
  page: { favicon?: string; customCss?: string; customJs?: string };
}

export type WidgetCategory =
  | "Layout"
  | "Basic"
  | "Real Estate"
  | "Media"
  | "Forms"
  | "Marketing"
  | "Header & Footer"
  | "SEO"
  | "Advanced";

export interface MenuLink {
  label: string;
  href: string;
}

export type HeaderDesignId = "classic" | "centered" | "ribbon" | "minimal" | "overlay";
export type FooterDesignId = "columns" | "centered" | "newsletter" | "slimbar" | "cards";

/** Length value: a plain number is treated as px; strings pass through as-is ("10px", "1rem", "50%"). */
export type CssLength = number | string;

/**
 * Per-device (tablet / mobile) overrides stored under style.responsive.
 * Only spacing, layout and typography are overridable — colors/borders/effects
 * stay shared so a device tweak can never silently re-theme a section.
 */
export interface ResponsiveOverrides {
  spacing?: Partial<SectionStyle["spacing"]>;
  layout?: Partial<SectionStyle["layout"]>;
  typography?: Partial<SectionStyle["typography"]>;
}

export interface SectionStyle {
  colors?: {
    bg?: string;
    overlay?: string;
    gradient?: string;
    text?: string;
    image?: string;
  };
  typography?: {
    fontFamily?: string;
    fontSize?: CssLength;
    fontWeight?: number;
    lineHeight?: number;
    letterSpacing?: number;
    /** Per-widget overrides for the design-system tokens. */
    textTransform?: string;
    textColor?: string;
    paragraphSpacing?: CssLength;
  };
  border?: {
    width?: CssLength;
    style?: string;
    radius?: CssLength;
    color?: string;
  };
  effects?: {
    shadow?: string;
    blur?: number;
    glass?: boolean;
    hover?: string;
    animation?: string;
  };
  spacing?: {
    padding?: { top: CssLength; right: CssLength; bottom: CssLength; left: CssLength };
    margin?: { top: CssLength; right: CssLength; bottom: CssLength; left: CssLength };
    gap?: CssLength;
  };
  layout?: {
    width?: "boxed" | "full" | "custom";
    customWidth?: CssLength;
    height?: "auto" | "fixed" | "vh";
    fixedHeight?: CssLength;
    align?: "left" | "center" | "right";
    direction?: "row" | "column";
    wrap?: boolean;
    justify?: string;
    alignItems?: string;
  };
  responsive?: {
    hideDesktop?: boolean;
    hideTablet?: boolean;
    hideMobile?: boolean;
    /** Per-device overrides — merged over the desktop values when previewing/publishing. */
    tablet?: ResponsiveOverrides;
    mobile?: ResponsiveOverrides;
  };
  advanced?: {
    classes?: string;
    elementId?: string;
    zIndex?: number;
    position?: string;
    customCss?: string;
    attributes?: string;
  };
}

export interface SectionInstance {
  id: string;
  type: string;
  label: string;
  icon: string;
  global?: boolean;
  hidden?: boolean;
  locked?: boolean;
  settings: Record<string, any>;
  style: SectionStyle;
  children?: SectionInstance[];
}

export interface PropertyData {
  id: string;
  name: string;
  builder: string;
  type: string;
  status: string;
  description: string;
  startingPrice: string;
  carpetArea: string;
  reraNumber: string;
  location: string;
  possession: string;
  amenities: string[];
  features: string[];
  gallery: string[];
  videos: { title: string; url: string }[];
  floorPlans: { name: string; beds: string; area: string; image: string; price?: string }[];
  brochureUrl: string;
  mapUrl: string;
  towers: string;
  landArea: string;
  metro: string;
  units: string;
}

export type FieldLogicOp =
  | "eq"
  | "neq"
  | "contains"
  | "notcontains"
  | "gt"
  | "lt"
  | "empty"
  | "notempty";

export interface FieldLogicRule {
  /** id of the controlling field (see FormLeadField.id). */
  field: string;
  op: FieldLogicOp;
  value: string;
}

export type FieldLogicAction =
  | "show"
  | "hide"
  | "require"
  | "optional"
  | "enable"
  | "disable"
  | "set_value";

export interface FieldLogic {
  enabled: boolean;
  /** AND = all rules must match; OR = any rule must match. */
  match: "any" | "all";
  rules: FieldLogicRule[];
  /** What to do when the rules match. Default: show. */
  action?: FieldLogicAction;
  /** Used when action === "set_value". */
  setValue?: string;
}

export type FormFieldType =
  | "text"
  | "name"
  | "email"
  | "phone"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "time"
  | "datetime"
  | "textarea"
  | "file"
  | "hidden"
  | "address"
  | "heading"
  | "html"
  | "consent"
  | "captcha"
  | "submit";

export type FormFieldWidth = "full" | "half" | "third";

export interface FieldValidation {
  /** Regex or preset name */
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  customMessage?: string;
}

export interface FormLeadField {
  id: string;
  type: FormFieldType | string;
  label: string;
  placeholder: string;
  required: boolean;
  options?: string[];
  /** Conditional logic — show this field only when rules match. */
  logic?: FieldLogic;
  validation?: FieldValidation;
  /** Optional help text under field */
  helpText?: string;
  defaultValue?: string;
  width?: FormFieldWidth;
  cssClass?: string;
  /** Auto-fill from ?param= on the page URL. */
  queryParam?: string;
  /** 0-based step index when the form is multi-step. */
  step?: number;
  /** Raw HTML for type === "html". */
  html?: string;
}

export interface FormPdfConfig {
  enabled: boolean;
  url: string;
  filename: string;
  autoDownload: boolean;
  /** pdf or image shown / downloaded after submit. */
  kind?: "pdf" | "image";
}

export interface FormDownloadRule {
  field: string;
  op: FieldLogicOp | string;
  value: string;
  url: string;
  filename?: string;
  kind?: "pdf" | "image";
  label?: string;
}

export interface FormThankYouButton {
  label: string;
  href: string;
  variant: "primary" | "secondary" | "outline";
}

export interface FormThankYouPage {
  enabled: boolean;
  heading: string;
  description: string;
  text: string;
  image: string;
  icon: string;
  buttons: FormThankYouButton[];
  html: string;
  successMessage: string;
  showPdfConfirmation: boolean;
  typography: {
    fontFamily: string;
    fontSize: number | string;
    fontWeight?: number;
    lineHeight?: number;
    letterSpacing?: number;
    textTransform?: string;
    textColor?: string;
  };
  colors: { bg: string; text: string; accent?: string };
  background: string;
  spacing: { padding: number | string; margin: number | string; gap: number | string };
  alignment: "left" | "center" | "right";
  /** Per-device responsive overrides */
  responsive?: { hideOnMobile?: boolean };
}

export interface FormEmbedConfig {
  id: string;
  allowExternal: boolean;
}

export type FormSubmissionAction = "save" | "email" | "whatsapp" | "webhook" | "redirect" | "pdf" | "thankyou";

export interface FormCustomAction {
  id: string;
  type: FormSubmissionAction;
  label: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface SiteConfig {
  page: {
    language: string;
    password: string;
    favicon: string;
    /** Page-specific CSS injected on the live page. */
    customCss?: string;
    /** Page-specific JS injected on the live page. */
    customJs?: string;
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    keywords: string;
    canonical: string;
    index: boolean;
    sitemap: boolean;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    robots?: string;
    twitterCard?: "summary" | "summary_large_image";
    twitterTitle?: string;
    twitterDescription?: string;
    twitterImage?: string;
    schema?: string;
  };
  brand: {
    name: string;
    tagline: string;
    email: string;
    phone: string;
    primary: string;
    accent: string;
    headingFont: string;
    bodyFont: string;
    logo: string;
    facebook: string;
    instagram: string;
    twitter: string;
    youtube: string;
    linkedin: string;
    accentButtons: boolean;
    /** Predefined visual design style for all real estate widgets: standard, premium, or modern. */
    layoutTheme?: "standard" | "premium" | "modern";
  };
  header: {
    sticky: boolean;
    transparent: boolean;
    showTopbar: boolean;
    variant: "light" | "dark" | "glass";
    cta: string;
    ctaLink: string;
    menu: string[];
    floatEnabled: boolean;
    floatSide: "left" | "right";
    floatWhatsapp: boolean;
    floatCall: boolean;
    floatEnquire: boolean;
    floatEmail: boolean;
    /** Which of the 5 reusable header layouts this template uses. */
    design?: HeaderDesignId;
    /** Editable nav links (label + href). Preferred over the legacy string menu. */
    menuLinks?: MenuLink[];
    /** Design-specific content settings — every text, button, icon and link. */
    settings?: Record<string, unknown>;
    /** Full style customization (colors, typography, spacing, border, layout, responsive). */
    style?: SectionStyle;
  };
  footer: {
    rera: string;
    copyright: string;
    /** Which of the 5 reusable footer layouts this template uses. */
    design?: FooterDesignId;
    /** Design-specific content settings — every text, button, icon and link. */
    settings?: Record<string, unknown>;
    /** Full style customization (colors, typography, spacing, border, layout, responsive). */
    style?: SectionStyle;
  };
  tracking: {
    gaId: string;
    gtmId: string;
    metaPixel: string;
    customScripts: string;
    headerScripts?: string;
    bodyScripts?: string;
    cookieConsent?: boolean;
    consentText?: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    goalForm: boolean;
    goalWhatsapp: boolean;
    goalCall: boolean;
    goalBrochure: boolean;
  };
  form: {
    /** User-defined form identity */
    name: string;
    description: string;
    embed: FormEmbedConfig;
    pdf: FormPdfConfig;
    thankYouPage: FormThankYouPage;
    notifyEmail: string;
    whatsapp: string;
    thankYou: string;
    multiStep: boolean;
    templateId: string;
    saveToCrm: boolean;
    sendEmail: boolean;
    sendWhatsapp: boolean;
    redirectThankYou: boolean;
    submitLabel: string;
    deliverableUrl: string;
    deliverableLabel: string;
    fields: FormLeadField[];
    /** Post-submit behaviour: inline message, Thank You page redirect, or custom URL. */
    successAction: FormSuccessAction;
    /** Custom URL used when successAction === "url". */
    successUrl: string;
    /** Headline shown on the inline success state. */
    successTitle: string;
    /** Message shown above fields when validation fails. */
    errorMessage: string;
    /** Conditional action: open this popup (by id) after a successful submit. */
    openPopupId: string;
    /** Extensible submission pipeline */
    customActions?: FormCustomAction[];
    webhookUrl?: string;
    autoReplySubject?: string;
    autoReplyBody?: string;
    honeypot?: boolean;
    preventDuplicate?: boolean;
    captchaEnabled?: boolean;
    progressBar?: boolean;
    stepCount?: number;
    style?: {
      background?: string;
      textColor?: string;
      buttonColor?: string;
      radius?: number;
    };
    analytics?: { views?: number; submissions?: number };
    /** When false, the form is disabled and not receiving leads. */
    enabled?: boolean;
    integrations?: {
      googleSheetsUrl?: string;
      crm?: boolean;
      email?: boolean;
      whatsapp?: boolean;
      sms?: string;
      analyticsEvent?: string;
    };
    /** If a rule matches after submit, redirect there instead of successUrl. */
    redirectRules?: Array<{ field: string; op: FieldLogicOp; value: string; url: string }>;
    /** Conditional after-submit PDF/image downloads. First match wins, else pdf config. */
    downloadRules?: FormDownloadRule[];
  };
  /** Form Builder library persisted with the page (not only localStorage). */
  forms?: Array<SiteConfig["form"] & { id: string; pageId?: string; createdAt?: string; updatedAt?: string }>;
  media: {
    notes: string;
  };
  /** Bound inventory snapshot applied at landing-page create. */
  propertyBinding?: { kind: "project"; projectId: string } | { kind: "unit"; unitId: string };
  vars?: Record<string, string>;
  property?: {
    name: string;
    builder: string;
    type: string;
    status: string;
    description: string;
    startingPrice: string;
    carpetArea: string;
    reraNumber: string;
    location: string;
    possession: string;
    amenities: string[];
    features: string[];
    gallery: string[];
    landArea: string;
    towers: string;
    units: string;
  };
  /** Per-template design system — typography scope (template/global) + tokens. */
  designSystem?: DesignSystemState;
  /** Page-scoped configuration captured by Page Settings. */
  settings?: PageSettings;
  /** Templates only: subscription plan ids granted access. Empty/absent → fall back to `tier`. */
  allowedPlanIds?: string[];
}

export interface LandingPageData {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "password" | "unpublished";
  template: string;
  domain: string;
  views: string;
  conversions: string;
  updated: string;
  thumbnail: string;
  sections: SectionInstance[];
  config?: SiteConfig;
  openPageSite?: import("@/components/openpage/blocks/types").SiteConfig;
  kind?: "preset" | "custom";
  designId?: string;
  /** Landing pages convert; thank-you pages confirm and hand over deliverables. */
  pageType?: "landing" | "thank-you";
  /** For thank-you pages: the landing page id they belong to. */
  parentPageId?: string;
  /** Linked companion thank-you page for a landing page */
  thankYouPage?: { id: string; name: string; slug: string; status: string } | null;
  /** Linked parent landing page for a thank-you page */
  parentLandingPage?: { id: string; name: string; slug: string; status: string } | null;
  /** Server-persisted fields (backend persistence layer). */
  tier?: "free" | "paid" | "premium";
  categoryId?: string | null;
  templateCategory?: { id: string; name: string; slug: string; tier: "free" | "paid" | "premium" } | null;
  isPaid?: boolean;
  category?: string | null;
  /** Subscription plan ids granted access (mirrors config.allowedPlanIds). Empty → tier-based access. */
  allowedPlanIds?: string[];
  /** ISO timestamp from the backend — `updated` is still the display string derived from this. */
  updatedAt?: string;
}

/** What happens after a successful (validated) form submission. */
export type FormSuccessAction = "message" | "thankyou" | "url";

/** How a conditional popup is opened on the live page. */
export type PopupTrigger = "load" | "delay" | "scroll" | "exit" | "click" | "form-success" | "url-param";

export interface FormTemplateData {
  id: string;
  name: string;
  icon: string;
  steps: number;
  fields: number;
  description: string;
}

export interface TemplateData {
  id: string;
  name: string;
  category: string;
  icon: string;
  pages: number;
  conversions: string;
  accent: string;
  accent2: string;
  description: string;
  thumbnail: string;
}

export interface DomainRow {
  id: string;
  domain: string;
  favicon: string;
  plan: string;
  created: string;
  pages: number;
  ssl: string;
  status: "live" | "draft" | "password" | "unpublished" | "pending";
  expiry: string;
}