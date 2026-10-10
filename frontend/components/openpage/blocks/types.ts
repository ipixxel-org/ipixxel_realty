import type { FormDefinition } from "@/lib/openpage/forms-store";

export type GenericBlockType =
  | "navbar"
  | "hero"
  | "features"
  | "pricing"
  | "cta"
  | "footer"
  | "testimonials"
  | "stats"
  | "faq"
  | "team"
  | "contact"
  | "newsletter"
  | "logocloud"
  | "divider"
  | "banner"
  | "content"
  | "image"
  | "video"
  | "gallery"
  | "slider"
  | "tabs"
  | "countdown"
  | "social-icons"
  | "icon"
  | "spacer"
  | "html-code"
  | "anchor"
  | "columns"
  | "heading"
  | "text"
  | "button"
  | "icon-box"
  | "image-box"
  | "property-search"
  | "property-filters"
  | "emi-calculator"
  | "payment-plan";

export type RealEstateBlockType =
  | "project-banner"
  | "project-overview"
  | "property-details"
  | "project-highlights"
  | "amenities"
  | "floor-plans"
  | "unit-config"
  | "re-pricing"
  | "offers"
  | "location"
  | "google-maps"
  | "construction-status"
  | "developer"
  | "lead-form"
  | "download-brochure"
  | "site-visit"
  | "custom-section";

export type BlockType = GenericBlockType | RealEstateBlockType;

export type BlockVariant = string;

export interface BlockTypography {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: string;
  letterSpacing?: string;
  wordSpacing?: string;
  textTransform?: string;
  textDecoration?: string;
  color?: string;
  textAlign?: string;
}

/**
 * Interaction states. Kept deliberately small and flat so it can be edited by
 * the shared colour/typography controls and serialised into a JSON column.
 */
export interface BlockInteractionState {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  boxShadow?: string;
  opacity?: string;
  transform?: string;
  textDecoration?: string;
}

/**
 * Element-level identity. Every individually editable node inside a section
 * (a heading, a paragraph, Button 1, a card, a tab, a footer column, a menu
 * item) is addressed by a stable key so its styles survive reordering,
 * duplication and deletion of its siblings.
 */
export type ElementId = string;

export type ElementStyleMap = Record<ElementId, BlockStyle>;

/** Reserved key on list items that carries their stable identity. */
export const ITEM_ID_KEY = "_id";

export interface BlockStyle {
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  paddingRight?: string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  alignment?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  borderRadius?: string;
  boxShadow?: string;
  opacity?: string;
  overflow?: string;
  zIndex?: string;
  hideOnDesktop?: boolean;
  hideOnTablet?: boolean;
  hideOnMobile?: boolean;
  customCss?: string;
  sectionPadding?: string;
  sectionMaxWidth?: string;
  sectionAlignment?: string;
  sectionBackground?: string;
  sectionBorderWidth?: string;
  sectionBorderColor?: string;
  sectionBorderRadius?: string;

  /* ---------------------------------------------------------------------
   * Additive fields below power per-element styling (see ElementStyleMap).
   * All optional so previously persisted documents keep working untouched.
   * ------------------------------------------------------------------ */

  /* Flexbox / layout */
  display?: string;
  flexDirection?: string;
  flexWrap?: string;
  flex?: string;
  justifyContent?: string;
  alignItems?: string;
  alignSelf?: string;
  alignContent?: string;
  gap?: string;
  rowGap?: string;
  columnGap?: string;

  /* Sizing */
  height?: string;
  minWidth?: string;
  maxHeight?: string;

  /* Positioned layout */
  position?: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;

  /* Media */
  objectFit?: string;
  objectPosition?: string;
  aspectRatio?: string;

  /* Effects */
  transform?: string;
  filter?: string;
  transition?: string;
  cursor?: string;

  /* Overlay painted by the owning block (hero / full-bleed sections). */
  overlayColor?: string;
  overlayOpacity?: string;

  /* Master visibility switch, used by elements inside dynamic lists. */
  hidden?: boolean;

  hover?: BlockInteractionState;
  active?: BlockInteractionState;

  typography?: BlockTypography;
  /**
   * Per-device value overrides. `desktop` values live on the style root;
   * tablet/mobile overrides are merged over them at render time, so changing
   * a mobile value never touches desktop. Like Elementor, colors/borders
   * shared effects can also be overridden per device if desired.
   */
  responsive?: {
    tablet?: Partial<Omit<BlockStyle, "responsive">>;
    mobile?: Partial<Omit<BlockStyle, "responsive">>;
  };
}

export interface ColumnConfig {
  id: string;
  width: number;
  blocks: BlockConfig[];
  style?: BlockStyle;
}

export interface SectionConfig {
  id: string;
  columns: ColumnConfig[];
  style?: BlockStyle;
}

export interface BlockConfig {
  id: string;
  type: BlockType;
  variant: BlockVariant;
  props: Record<string, unknown>;
  style?: BlockStyle;
  /**
   * Per-element styles keyed by stable {@link ElementId}. Lets a single block
   * style its heading, each paragraph, Button 1 and Button 2 independently.
   */
  elementStyles?: ElementStyleMap;
  children?: BlockConfig[];
  columnId?: string;
  sectionId?: string;
  globalWidgetId?: string;
  animation?: string;
  animationDuration?: string;
  animationDelay?: string;
}

export interface GlobalWidget {
  id: string;
  name: string;
  block: BlockConfig;
  createdAt: number;
}

export interface ThemeConfig {
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  bg5: string;
  text0: string;
  text1: string;
  text2: string;
  text3: string;
  accent: string;
  accentDim: string;
  ctaButtonColor?: string;
  borderDefault: string;
  borderSubtle: string;
  borderHover: string;
  fontSans: string;
  fontDisplay: string;
  fontMono: string;
  radius: number;
  radiusLg: number;
}

export interface PageConfig {
  id: string;
  name: string;
  path: string;
  blocks: BlockConfig[];
}

export interface PopupConfig {
  id: string;
  name: string;
  title: string;
  description: string;
  image?: string;
  videoUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  formId?: string;
  customHtml?: string;
  closeOnOverlay: boolean;
  trigger: "manual" | "exit" | "delay" | "scroll" | "click";
  triggerValue?: string;
  brochureUrl?: string;
}

export interface SiteSeo {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string;
  canonical?: string;
  index?: boolean;
  /** Freeform robots directive (e.g. "index,follow") — overrides the index flag when set. */
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  /** Raw JSON-LD string. When set and valid, it replaces the auto-generated schema. */
  schema?: string;
}

export interface SiteTracking {
  gaId?: string;
  gtmId?: string;
  metaPixel?: string;
  customScripts?: string;
  /** Injected into <head> verbatim. */
  headerScripts?: string;
  /** Injected into <body> verbatim. */
  bodyScripts?: string;
  /** Gate third-party pixels behind an explicit consent banner. */
  cookieConsent?: boolean;
  consentText?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  goalForm?: boolean;
  goalWhatsapp?: boolean;
  goalCall?: boolean;
  goalBrochure?: boolean;
}

export interface SiteProperty {
  name?: string;
  builder?: string;
  type?: string;
  status?: string;
  description?: string;
  startingPrice?: string;
  carpetArea?: string;
  reraNumber?: string;
  location?: string;
  possession?: string;
  amenities?: string[];
  features?: string[];
  gallery?: string[];
  landArea?: string;
  towers?: string;
  units?: string;
  brochureUrl?: string;
  floorPlans?: Array<{ name: string; image: string; beds?: string; area?: string; downloadUrl?: string }>;
}

export interface SiteConfig {
  engine?: "openpage";
  name: string;
  pages?: PageConfig[];
  blocks: BlockConfig[];
  theme?: Partial<ThemeConfig>;
  forms?: FormDefinition[];
  popups?: PopupConfig[];
  seo?: SiteSeo;
  tracking?: SiteTracking;
  property?: SiteProperty;
  propertyBinding?: { kind: "project"; projectId: string } | { kind: "unit"; unitId: string };
  vars?: Record<string, string>;
  globalWidgets?: GlobalWidget[];
  /** Page-specific settings captured by the Page Settings module. */
  settings?: import("@/lib/openpage/types").PageSettings;
}
