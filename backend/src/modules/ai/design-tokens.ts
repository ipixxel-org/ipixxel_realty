/**
 * Design tokens for the OpenPage builder — mirrors the frontend contract in
 * `frontend/lib/openpage/design-system.ts` and
 * `frontend/lib/openpage/theme-presets.ts`.
 *
 * The AI pipelines (generate + improve) speak in these tokens rather than raw
 * CSS so that a generated page is fully driven by the same theme/typography
 * system the visual editor exposes. Keep the shapes in sync with the frontend
 * types — they are serialised verbatim into the `SiteConfig` document.
 */

export type TypeKey = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';

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
  scope: 'template' | 'global';
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

export const TYPE_KEYS: TypeKey[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];

export const DEFAULT_THEME: ThemeTokens = {
  bg0: '#ffffff',
  bg1: '#ffffff',
  bg2: '#f8fafc',
  bg3: '#f1f5f9',
  bg4: '#e2e8f0',
  bg5: '#cbd5e1',
  text0: '#0f172a',
  text1: '#1e293b',
  text2: '#475569',
  text3: '#64748b',
  accent: '#6d5dfc',
  accentDim: '#c5a075',
  ctaButtonColor: '#6d5dfc',
  borderDefault: '#e2e8f0',
  borderSubtle: '#f1f5f9',
  borderHover: '#cbd5e1',
  fontSans: 'Inter',
  fontDisplay: 'Playfair Display',
  fontMono: 'JetBrains Mono',
  radius: 12,
  radiusLg: 20,
};

const HEADING_DEFAULTS = {
  fontFamily: '',
  fontWeight: 800,
  lineHeight: 1.15,
  letterSpacing: -0.5,
  textTransform: 'none',
};

export function defaultTypography(): TemplateTypography {
  return {
    h1: {
      desktop: { ...HEADING_DEFAULTS, fontSize: 52 },
      tablet: { fontSize: 40 },
      mobile: { fontSize: 32 },
    },
    h2: {
      desktop: { ...HEADING_DEFAULTS, fontWeight: 700, fontSize: 34 },
      tablet: { fontSize: 28 },
      mobile: { fontSize: 24 },
    },
    h3: {
      desktop: { ...HEADING_DEFAULTS, fontWeight: 700, fontSize: 26 },
      tablet: { fontSize: 22 },
      mobile: { fontSize: 20 },
    },
    h4: {
      desktop: {
        ...HEADING_DEFAULTS,
        fontWeight: 700,
        fontSize: 21,
        letterSpacing: -0.2,
      },
      tablet: { fontSize: 19 },
    },
    h5: {
      desktop: {
        ...HEADING_DEFAULTS,
        fontWeight: 700,
        fontSize: 17,
        letterSpacing: 0,
      },
    },
    h6: {
      desktop: {
        ...HEADING_DEFAULTS,
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
      },
    },
    p: {
      desktop: {
        fontFamily: '',
        fontSize: 15,
        fontWeight: 400,
        lineHeight: 1.75,
        letterSpacing: 0,
        textColor: '',
        paragraphSpacing: '',
      },
      mobile: { fontSize: 14 },
    },
  };
}

const toNumber = (value: unknown, fallback?: number): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

/** Merge an AI-provided (partial, possibly loosely typed) theme over the defaults. */
export function normalizeTheme(
  raw: any,
  fallback: Partial<ThemeTokens> = {},
): ThemeTokens {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = { ...DEFAULT_THEME, ...fallback };
  const pick = (key: keyof ThemeTokens): string => {
    const value = source[key];
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : (base[key] as string);
  };
  return {
    bg0: pick('bg0'),
    bg1: pick('bg1'),
    bg2: pick('bg2'),
    bg3: pick('bg3'),
    bg4: pick('bg4'),
    bg5: pick('bg5'),
    text0: pick('text0'),
    text1: pick('text1'),
    text2: pick('text2'),
    text3: pick('text3'),
    accent: pick('accent'),
    accentDim: pick('accentDim'),
    ctaButtonColor: pick('ctaButtonColor'),
    borderDefault: pick('borderDefault'),
    borderSubtle: pick('borderSubtle'),
    borderHover: pick('borderHover'),
    fontSans: pick('fontSans'),
    fontDisplay: pick('fontDisplay'),
    fontMono: pick('fontMono'),
    radius: toNumber(source.radius, base.radius) ?? base.radius,
    radiusLg: toNumber(source.radiusLg, base.radiusLg) ?? base.radiusLg,
  };
}

function normalizeResponsive(
  raw: any,
  fallback: ResponsiveType,
): ResponsiveType {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    desktop: {
      ...fallback.desktop,
      ...(r.desktop && typeof r.desktop === 'object' ? r.desktop : {}),
    },
    tablet: r.tablet ? { ...fallback.tablet, ...r.tablet } : fallback.tablet,
    mobile: r.mobile ? { ...fallback.mobile, ...r.mobile } : fallback.mobile,
  };
}

/** Merge AI typography tokens over the defaults, one token key at a time. */
export function normalizeTypography(raw: any): TemplateTypography {
  const base = defaultTypography();
  if (!raw || typeof raw !== 'object') return base;
  const out = {} as TemplateTypography;
  for (const key of TYPE_KEYS) {
    out[key] = normalizeResponsive(raw[key], base[key]);
  }
  return out;
}

/**
 * Merge a loose typography patch over an existing (possibly partial)
 * typography object at the per-token, per-breakpoint level. Missing breakpoints
 * and token keys keep whatever the base had.
 */
export function mergeTypographyPatch(base: any, patch: any): any {
  const b = base && typeof base === 'object' ? base : {};
  const p = patch && typeof patch === 'object' ? patch : {};
  const out: any = {};
  for (const key of TYPE_KEYS) {
    const baseKey = b[key] && typeof b[key] === 'object' ? b[key] : {};
    const patchKey = p[key] && typeof p[key] === 'object' ? p[key] : {};
    out[key] = {
      desktop: { ...(baseKey.desktop ?? {}), ...(patchKey.desktop ?? {}) },
      tablet: { ...(baseKey.tablet ?? {}), ...(patchKey.tablet ?? {}) },
      mobile: { ...(baseKey.mobile ?? {}), ...(patchKey.mobile ?? {}) },
    };
  }
  return out;
}

/** Wrap typography into a full design-system state (template-scoped by default). */
export function normalizeDesignSystem(raw: any): DesignSystemState {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    scope: r.scope === 'global' ? 'global' : 'template',
    globalSetId: typeof r.globalSetId === 'string' ? r.globalSetId : undefined,
    typography: normalizeTypography(r.typography ?? r),
  };
}

/**
 * The canonical list of token keys surfaced to the agent, so a prompt can spell
 * out exactly what the model is allowed to emit.
 */
export const THEME_TOKEN_KEYS: (keyof ThemeTokens)[] = [
  'bg0',
  'bg1',
  'bg2',
  'bg3',
  'bg4',
  'bg5',
  'text0',
  'text1',
  'text2',
  'text3',
  'accent',
  'accentDim',
  'ctaButtonColor',
  'borderDefault',
  'borderSubtle',
  'borderHover',
  'fontSans',
  'fontDisplay',
  'fontMono',
  'radius',
  'radiusLg',
];
