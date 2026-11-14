/**
 * Design tokens for the OpenPage builder — the shared vocabulary an agent uses
 * to edit a page. Mirrors `frontend/lib/openpage/design-system.ts` and
 * `frontend/lib/openpage/theme-presets.ts` so that anything an agent changes
 * here renders identically in the visual builder and on the published site.
 */

export type TypeKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p";

export const TYPE_KEYS: TypeKey[] = ["h1", "h2", "h3", "h4", "h5", "h6", "p"];

export interface TypeToken {
  fontFamily?: string;
  /** CSS length — numbers are treated as px, strings pass through ("3rem"). */
  fontSize?: number | string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: string;
  textColor?: string;
  /** Paragraph token only: vertical rhythm between blocks. */
  paragraphSpacing?: number | string;
}

export interface ResponsiveType {
  desktop: TypeToken;
  tablet?: Partial<TypeToken>;
  mobile?: Partial<TypeToken>;
}

export type TemplateTypography = Record<TypeKey, ResponsiveType>;

export interface DesignSystemState {
  scope: "template" | "global";
  globalSetId?: string;
  typography: TemplateTypography;
}

export interface ThemeTokens {
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
  ctaButtonColor: string;
  borderDefault: string;
  borderSubtle: string;
  borderHover: string;
  fontSans: string;
  fontDisplay: string;
  fontMono: string;
  radius: number;
  radiusLg: number;
}

export const THEME_TOKEN_KEYS: (keyof ThemeTokens)[] = [
  "bg0", "bg1", "bg2", "bg3", "bg4", "bg5",
  "text0", "text1", "text2", "text3",
  "accent", "accentDim", "ctaButtonColor",
  "borderDefault", "borderSubtle", "borderHover",
  "fontSans", "fontDisplay", "fontMono", "radius", "radiusLg",
];

export const DEFAULT_THEME: ThemeTokens = {
  bg0: "#ffffff",
  bg1: "#ffffff",
  bg2: "#f8fafc",
  bg3: "#f1f5f9",
  bg4: "#e2e8f0",
  bg5: "#cbd5e1",
  text0: "#0f172a",
  text1: "#1e293b",
  text2: "#475569",
  text3: "#64748b",
  accent: "#6d5dfc",
  accentDim: "#c5a075",
  ctaButtonColor: "#6d5dfc",
  borderDefault: "#e2e8f0",
  borderSubtle: "#f1f5f9",
  borderHover: "#cbd5e1",
  fontSans: "Inter",
  fontDisplay: "Playfair Display",
  fontMono: "JetBrains Mono",
  radius: 12,
  radiusLg: 20,
};

const HEADING_DEFAULTS = {
  fontFamily: "",
  fontWeight: 800,
  lineHeight: 1.15,
  letterSpacing: -0.5,
  textTransform: "none",
};

export function defaultTypography(): TemplateTypography {
  return {
    h1: { desktop: { ...HEADING_DEFAULTS, fontSize: 52 }, tablet: { fontSize: 40 }, mobile: { fontSize: 32 } },
    h2: { desktop: { ...HEADING_DEFAULTS, fontWeight: 700, fontSize: 34 }, tablet: { fontSize: 28 }, mobile: { fontSize: 24 } },
    h3: { desktop: { ...HEADING_DEFAULTS, fontWeight: 700, fontSize: 26 }, tablet: { fontSize: 22 }, mobile: { fontSize: 20 } },
    h4: { desktop: { ...HEADING_DEFAULTS, fontWeight: 700, fontSize: 21, letterSpacing: -0.2 }, tablet: { fontSize: 19 } },
    h5: { desktop: { ...HEADING_DEFAULTS, fontWeight: 700, fontSize: 17, letterSpacing: 0 } },
    h6: { desktop: { ...HEADING_DEFAULTS, fontWeight: 700, fontSize: 14, letterSpacing: 0.6, textTransform: "uppercase" } },
    p: { desktop: { fontFamily: "", fontSize: 15, fontWeight: 400, lineHeight: 1.75, letterSpacing: 0, textColor: "", paragraphSpacing: "" }, mobile: { fontSize: 14 } },
  };
}

const toNumber = (value: unknown, fallback?: number): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

/** Merge an AI/user-provided (partial, loosely typed) theme over the defaults. */
export function normalizeTheme(raw: any, fallback: Partial<ThemeTokens> = {}): ThemeTokens {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = { ...DEFAULT_THEME, ...fallback };
  const pick = (key: keyof ThemeTokens): string => {
    const value = source[key];
    return typeof value === "string" && value.trim() ? value.trim() : (base[key] as string);
  };
  return {
    bg0: pick("bg0"),
    bg1: pick("bg1"),
    bg2: pick("bg2"),
    bg3: pick("bg3"),
    bg4: pick("bg4"),
    bg5: pick("bg5"),
    text0: pick("text0"),
    text1: pick("text1"),
    text2: pick("text2"),
    text3: pick("text3"),
    accent: pick("accent"),
    accentDim: pick("accentDim"),
    ctaButtonColor: pick("ctaButtonColor"),
    borderDefault: pick("borderDefault"),
    borderSubtle: pick("borderSubtle"),
    borderHover: pick("borderHover"),
    fontSans: pick("fontSans"),
    fontDisplay: pick("fontDisplay"),
    fontMono: pick("fontMono"),
    radius: toNumber(source.radius, base.radius) ?? base.radius,
    radiusLg: toNumber(source.radiusLg, base.radiusLg) ?? base.radiusLg,
  };
}

function normalizeResponsive(raw: any, fallback: ResponsiveType): ResponsiveType {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    desktop: { ...fallback.desktop, ...(r.desktop && typeof r.desktop === "object" ? r.desktop : {}) },
    tablet: r.tablet ? { ...fallback.tablet, ...r.tablet } : fallback.tablet,
    mobile: r.mobile ? { ...fallback.mobile, ...r.mobile } : fallback.mobile,
  };
}

/** Merge token typography over the defaults, one token key at a time. */
export function normalizeTypography(raw: any): TemplateTypography {
  const base = defaultTypography();
  if (!raw || typeof raw !== "object") return base;
  const out = {} as TemplateTypography;
  for (const key of TYPE_KEYS) {
    out[key] = normalizeResponsive(raw[key], base[key]);
  }
  return out;
}

/**
 * Merge a loose typography patch over an existing typography object at the
 * per-token, per-breakpoint level. Missing breakpoints / keys keep the base.
 */
export function mergeTypographyPatch(base: any, patch: any): any {
  const b = base && typeof base === "object" ? base : {};
  const p = patch && typeof patch === "object" ? patch : {};
  const out: any = {};
  for (const key of TYPE_KEYS) {
    const baseKey = b[key] && typeof b[key] === "object" ? b[key] : {};
    const patchKey = p[key] && typeof p[key] === "object" ? p[key] : {};
    out[key] = {
      desktop: { ...(baseKey.desktop ?? {}), ...(patchKey.desktop ?? {}) },
      tablet: { ...(baseKey.tablet ?? {}), ...(patchKey.tablet ?? {}) },
      mobile: { ...(baseKey.mobile ?? {}), ...(patchKey.mobile ?? {}) },
    };
  }
  return out;
}

export function normalizeDesignSystem(raw: any): DesignSystemState {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    scope: r.scope === "global" ? "global" : "template",
    globalSetId: typeof r.globalSetId === "string" ? r.globalSetId : undefined,
    typography: normalizeTypography(r.typography ?? r),
  };
}

// ---------------------------------------------------------------------------
// Theme presets — mirrors the frontend `themePresets` catalogue.
// ---------------------------------------------------------------------------

export interface ThemePreset {
  id: string;
  name: string;
  theme: ThemeTokens;
}

const preset = (id: string, name: string, patch: Partial<ThemeTokens>): ThemePreset => ({
  id,
  name,
  theme: { ...DEFAULT_THEME, ...patch },
});

export const THEME_PRESETS: ThemePreset[] = [
  preset("default", "Clean White", {}),
  preset("estate", "Estate Gold", {
    bg0: "#f7f4ef", bg1: "#fbfaf7", bg2: "#f1ece4", bg3: "#e6dfd2", bg4: "#d4cfc4", bg5: "#c4b8a8",
    text0: "#1a1612", text1: "#4a4238", text2: "#7a7268", text3: "#a39a8e",
    accent: "#b8860b", accentDim: "#9a6f08", ctaButtonColor: "#b8860b", fontSans: "Plus Jakarta Sans", fontDisplay: "Cormorant Garamond", radius: 12, radiusLg: 20,
  }),
  preset("ivory", "Ivory", {
    bg0: "#fdfcfa", bg1: "#f5f3ef", bg2: "#edebe5", bg3: "#e0ddd6", bg4: "#ccc8bf", bg5: "#b0ab9f",
    text0: "#1c1917", text1: "#44403c", text2: "#78716c", text3: "#a8a29e",
    accent: "#0f1424", accentDim: "#0f1424", ctaButtonColor: "#0f1424", fontSans: "Plus Jakarta Sans", fontDisplay: "Sora", radius: 10, radiusLg: 16,
  }),
  preset("clean", "Clean", {
    bg0: "#ffffff", bg1: "#f8f9fa", bg2: "#f1f3f5", bg3: "#e9ecef", bg4: "#dee2e6", bg5: "#ced4da",
    text0: "#212529", text1: "#495057", text2: "#868e96", text3: "#adb5bd",
    accent: "#228be6", accentDim: "#1c7ed6", ctaButtonColor: "#228be6", fontSans: "Inter", fontDisplay: "Inter", radius: 8, radiusLg: 12,
  }),
  preset("sand", "Sand", {
    bg0: "#faf8f5", bg1: "#f2efe8", bg2: "#e8e4db", bg3: "#ddd8cd", bg4: "#c8c2b5", bg5: "#b3ab9c",
    text0: "#2c2418", text1: "#5c5347", text2: "#8a8074", text3: "#b0a798",
    accent: "#d97706", accentDim: "#b45309", ctaButtonColor: "#d97706", fontSans: "Nunito Sans", fontDisplay: "Outfit", radius: 10, radiusLg: 14,
  }),
  preset("amber", "Amber", {
    bg0: "#171210", bg1: "#1e1816", bg2: "#26201c", bg3: "#302925", bg4: "#3d3530", bg5: "#504640",
    text0: "#faf6f0", text1: "#d4c8b8", text2: "#a89a88", text3: "#7d7062",
    accent: "#e8a838", accentDim: "#cc8f20", ctaButtonColor: "#e8a838", fontSans: "Outfit", fontDisplay: "Outfit", radius: 6, radiusLg: 10,
  }),
  preset("ocean", "Ocean", {
    bg0: "#0a1628", bg1: "#101e32", bg2: "#162740", bg3: "#1d3050", bg4: "#264060", bg5: "#305575",
    text0: "#eef4ff", text1: "#b0c8e8", text2: "#7a9cc0", text3: "#506d90",
    accent: "#3b82f6", accentDim: "#2563eb", ctaButtonColor: "#3b82f6", fontSans: "Inter", fontDisplay: "Sora", radius: 12, radiusLg: 20,
  }),
  preset("rose", "Rosé", {
    bg0: "#16101a", bg1: "#1e1620", bg2: "#261e28", bg3: "#302632", bg4: "#3e3340", bg5: "#504250",
    text0: "#faf4f8", text1: "#d0bcc8", text2: "#a08898", text3: "#786575",
    accent: "#f472b6", accentDim: "#ec4899", ctaButtonColor: "#f472b6", fontSans: "DM Sans", fontDisplay: "Raleway", radius: 12, radiusLg: 18,
  }),
  preset("purple-haze", "Purple Haze", {
    bg0: "#100c1a", bg1: "#16111f", bg2: "#1e1828", bg3: "#262033", bg4: "#302a40", bg5: "#3e3650",
    text0: "#f5f0ff", text1: "#c4b5fd", text2: "#8b7cbf", text3: "#6b5c8f",
    accent: "#8b5cf6", accentDim: "#7c3aed", ctaButtonColor: "#8b5cf6", fontSans: "Manrope", fontDisplay: "Sora", radius: 10, radiusLg: 14,
  }),
  preset("slate", "Slate", {
    bg0: "#0f1114", bg1: "#161a1e", bg2: "#1e2228", bg3: "#252a32", bg4: "#2e353e", bg5: "#3a4250",
    text0: "#f0f4f8", text1: "#94a3b8", text2: "#64748b", text3: "#475569",
    accent: "#06b6d4", accentDim: "#0891b2", ctaButtonColor: "#06b6d4", fontSans: "Work Sans", fontDisplay: "Space Grotesk", radius: 6, radiusLg: 10,
  }),
  preset("forest", "Forest", {
    bg0: "#0a120c", bg1: "#101a13", bg2: "#16221a", bg3: "#1e2c22", bg4: "#26382a", bg5: "#304434",
    text0: "#eef8f0", text1: "#a0c8a8", text2: "#6ea078", text3: "#4e7858",
    accent: "#10b981", accentDim: "#059669", ctaButtonColor: "#10b981", fontSans: "Plus Jakarta Sans", fontDisplay: "DM Sans", radius: 8, radiusLg: 14,
  }),
  preset("aurelia", "Aurelia Reserve", {
    bg0: "#f7f4ef", bg1: "#fbfaf7", bg2: "#f1ece4", bg3: "#e6dfd2", bg4: "#d4cfc4", bg5: "#c4b8a8",
    text0: "#1a1612", text1: "#4a4238", text2: "#7a7268", text3: "#a39a8e",
    accent: "#1a1612", accentDim: "#3a322c", ctaButtonColor: "#1a1612", fontSans: "Montserrat", fontDisplay: "Cormorant Garamond", radius: 14, radiusLg: 24,
  }),
  preset("vista-red", "Vista Framed", {
    bg0: "#faf8f5", bg1: "#ffffff", bg2: "#f3f0eb", bg3: "#e8e4dc", bg4: "#d6d0c6", bg5: "#c0b8ac",
    text0: "#12101c", text1: "#3d3a4a", text2: "#6b6778", text3: "#9a96a5",
    accent: "#e11d2e", accentDim: "#be1230", ctaButtonColor: "#e11d2e", fontSans: "Inter", fontDisplay: "Playfair Display", radius: 16, radiusLg: 32,
  }),
];

export function findThemePreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

export function listThemePresets(): { id: string; name: string; accent: string; fontDisplay: string }[] {
  return THEME_PRESETS.map((p) => ({ id: p.id, name: p.name, accent: p.theme.accent, fontDisplay: p.theme.fontDisplay }));
}
