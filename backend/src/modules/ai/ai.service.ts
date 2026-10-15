import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GenerateTemplateDto } from './dto/generate-template.dto';
import { RegenerateSectionDto } from './dto/regenerate-section.dto';
import {
  DEFAULT_THEME,
  THEME_TOKEN_KEYS,
  mergeTypographyPatch,
  normalizeDesignSystem,
  normalizeTheme,
} from './design-tokens';
import { AiProvider, resolveAiProvider } from './ai-provider';
import { applyBlockDefaults, formatWidgetCatalog } from './block-catalog';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep-merge a style patch so nested groups (responsive.tablet/mobile, hover,
 * active, typography) merge key-by-key instead of being replaced wholesale.
 */
function mergeStyle(base: any, patch: any): any {
  const out: any = { ...(isPlainObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeStyle(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    const provider = resolveAiProvider();
    return {
      configured: Boolean(provider),
      model: provider?.model ?? '',
      provider: provider?.name ?? 'none',
    };
  }

  /** Resolve the active design agent or fail loudly (no static fallback). */
  private requireProvider(): AiProvider {
    const provider = resolveAiProvider();
    if (!provider) {
      throw new ServiceUnavailableException(
        'No AI design agent is configured. Set AI_PROVIDER and the matching ' +
          'credential (GEMINI_API_KEY, ANTHROPIC_API_KEY, or AI_GENERATE_API_URL).',
      );
    }
    return provider;
  }

  /**
   * Generates a full OpenPage-compatible landing page site document
   */
  async generateLandingPage(orgId: string | null, dto: GenerateTemplateDto) {
    let projectContext = '';
    let fetchedProject: any = null;

    if (dto.projectId && orgId) {
      fetchedProject = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        include: {
          unitTypes: true,
          _count: { select: { units: true } },
        },
      });

      if (fetchedProject) {
        projectContext = `
REAL PROJECT DATA (USE THESE EXACT FACTS, DO NOT INVENT CONTRADICTORY DATA):
- Project Name: ${fetchedProject.name}
- Location: ${fetchedProject.location || 'Bangalore, India'}
- Description: ${fetchedProject.description || ''}
- Starting Price: ${fetchedProject.startingPrice ? '₹ ' + fetchedProject.startingPrice : 'On Request'}
- Configurations: ${fetchedProject.unitTypes?.map((u: any) => u.name).join(', ') || '2, 3 & 4 BHK'}
- Land Area / Towers: ${fetchedProject.landArea || ''} ${fetchedProject.totalTowers ? fetchedProject.totalTowers + ' Towers' : ''}
- Amenities: ${Array.isArray(fetchedProject.amenities) ? fetchedProject.amenities.join(', ') : ''}
- RERA Number: ${fetchedProject.reraNumber || ''}
- Possession: ${fetchedProject.possessionDate ? new Date(fetchedProject.possessionDate).toLocaleDateString() : 'Ready / Under Construction'}
`;
      }
    }

    const provider = this.requireProvider();

    // "Improve current page" edits the design tokens of the document already on
    // the canvas instead of generating a brand-new page — the same way an
    // Elementor MCP session tweaks an existing layout rather than replacing it.
    if (
      dto.mode === 'improve' &&
      dto.currentSite &&
      typeof dto.currentSite === 'object'
    ) {
      return this.improveDesignTokens(dto, provider, projectContext);
    }

    let generated: any;
    try {
      generated = await this.callAgentTemplatePipeline(
        dto,
        provider,
        projectContext,
        fetchedProject,
      );
    } catch (err: any) {
      this.logger.error(
        `AI design generation failed via ${provider.name}: ${err.message}`,
        err.stack,
      );
      // No static fallback: an agent-driven builder must never silently
      // substitute a canned page. Surface the failure instead.
      throw new BadGatewayException(
        `The AI design agent (${provider.name}) could not generate this page: ` +
          `${err.message}. Please try again or refine the prompt.`,
      );
    }
    if (
      generated &&
      Array.isArray(generated.blocks) &&
      generated.blocks.length > 0
    ) {
      return this.normalizeSiteConfig(generated, dto, fetchedProject);
    }
    throw new BadGatewayException(
      `${provider.name} returned no usable sections. Please refine the prompt and try again.`,
    );
  }

  /**
   * Token-editing pass for an existing OpenPage document. The model is asked
   * for a *patch* of design tokens only (theme + typography + per-section
   * style tokens) which is merged over the current document. Content props are
   * left untouched, so an "improve" action can safely re-theme a live page.
   */
  private async improveDesignTokens(
    dto: GenerateTemplateDto,
    provider: AiProvider,
    projectContext: string,
  ) {
    const currentSite: any = dto.currentSite ?? {};

    try {
      const sections = Array.isArray(currentSite.blocks)
        ? currentSite.blocks.map((b: any) => ({
            id: b.id,
            type: b.type,
            variant: b.variant,
          }))
        : [];

      const systemInstruction = `You are a brand & design-system art director for the OpenPage page builder.
You receive an existing page document and an instruction, and you return a DESIGN TOKEN PATCH ONLY.
Never rewrite copy or change block props — only design tokens.
Output MUST BE RAW VALID JSON, no markdown, no backticks, no commentary.

Patch schema (all keys optional):
{
  "theme": { ${THEME_TOKEN_KEYS.join(', ')} },
  "typography": {
    "h1": { "desktop": Token, "tablet": PartialToken, "mobile": PartialToken },
    ...one entry per key in h1,h2,h3,h4,h5,h6,p...
  },
  "blockStyles": {
    "<block-id>": {
      "paddingTop": "80px", "paddingBottom": "80px", "backgroundColor": "#...", "textAlign": "center", "borderRadius": "16px",
      "responsive": { "tablet": { ...partial... }, "mobile": { "paddingTop": "48px", "textAlign": "center" } },
      "elementStyles": { "<elementKey>": { ...partial style... } }
    }
  }
}

Token = { "fontFamily": string, "fontSize": number|string, "fontWeight": number, "lineHeight": number, "letterSpacing": number, "textTransform": string, "textColor": string }
Theme colors must be hex strings. Typography sizes are px numbers. Only include keys you are changing.
Per-block styles support per-device overrides via "responsive.tablet"/"responsive.mobile" and per-element overrides via "elementStyles". Keep the page responsive on every screen.`;

      const userPrompt = `Instruction: ${dto.prompt}
Design Style: ${dto.designStyle || 'keep current'}
Primary Color hint: ${dto.primaryColor || 'keep current'}
Accent Color hint: ${dto.accentColor || 'keep current'}
Target Audience: ${dto.targetAudience || 'keep current'}
${projectContext}

Current theme tokens:
${JSON.stringify(currentSite.theme ?? {}, null, 2)}

Current typography tokens:
${JSON.stringify(currentSite.designSystem?.typography ?? {}, null, 2)}

Page sections (by id/type):
${JSON.stringify(sections, null, 2)}

Return the token patch as raw JSON only.`;

      const patch = await provider.generateJson({
        system: systemInstruction,
        prompt: userPrompt,
        temperature: 0.5,
      });
      return this.mergeDesignTokens(currentSite, patch);
    } catch (err: any) {
      this.logger.error(
        `Design-token improve failed: ${err.message}. Returning current page unchanged.`,
        err.stack,
      );
      return currentSite;
    }
  }

  /** Merge a design-token patch into an existing site document. */
  private mergeDesignTokens(currentSite: any, patch: any) {
    const site = JSON.parse(JSON.stringify(currentSite ?? {}));
    const p = patch && typeof patch === 'object' ? patch : {};

    if (p.theme && typeof p.theme === 'object') {
      site.theme = normalizeTheme(p.theme, normalizeTheme(site.theme));
    }

    if (p.typography && typeof p.typography === 'object') {
      const merged = mergeTypographyPatch(
        site.designSystem?.typography,
        p.typography,
      );
      site.designSystem = {
        scope: site.designSystem?.scope === 'global' ? 'global' : 'template',
        globalSetId: site.designSystem?.globalSetId,
        typography: normalizeDesignSystem(merged).typography,
      };
    }

    if (
      p.blockStyles &&
      typeof p.blockStyles === 'object' &&
      Array.isArray(site.blocks)
    ) {
      for (const block of site.blocks) {
        const stylePatch = p.blockStyles[block.id];
        if (stylePatch && typeof stylePatch === 'object') {
          const { elementStyles, ...styleOnly } = stylePatch;
          block.style = mergeStyle(block.style, styleOnly);
          if (isPlainObject(elementStyles)) {
            block.elementStyles = mergeStyle(block.elementStyles, elementStyles);
          }
        }
      }
    }

    return site;
  }

  /**
   * Asks the active design agent to invent the full page document.
   */
  private async callAgentTemplatePipeline(
    dto: GenerateTemplateDto,
    provider: AiProvider,
    projectContext: string,
    project: any,
  ) {
    const systemInstruction = `You are an elite landing-page designer and brand art director.
You invent every part of the design yourself: the colour system, typography scale, section composition, order, spacing and responsive behaviour. Never reuse a fixed template, and never emit a placeholder or lorem-ipsum page.
You are industry-agnostic: the brief may describe real estate, a restaurant, a SaaS product, a clinic, an event, a portfolio, an agency, an online store, a personal brand or anything else. Design for whatever the brief actually describes.
You generate valid OpenPage documents.
Output MUST BE RAW VALID JSON ONLY, with no markdown ticks, no backticks and no wrapper text.

Schema:
{
  "name": string,
  "theme": {
    "bg0": string, "bg1": string, "bg2": string, "bg3": string, "bg4": string, "bg5": string,
    "text0": string, "text1": string, "text2": string, "text3": string,
    "accent": string, "accentDim": string, "ctaButtonColor": string,
    "borderDefault": string, "borderSubtle": string, "borderHover": string,
    "fontSans": string, "fontDisplay": string, "fontMono": string,
    "radius": number, "radiusLg": number
  },
  "designSystem": {
    "scope": "template",
    "typography": {
      "h1": { "desktop": TypeToken, "tablet": PartialTypeToken, "mobile": PartialTypeToken },
      "h2": { "desktop": TypeToken, "tablet": PartialTypeToken, "mobile": PartialTypeToken },
      "h3": { "desktop": TypeToken, "tablet": PartialTypeToken, "mobile": PartialTypeToken },
      "h4": { "desktop": TypeToken, "tablet": PartialTypeToken, "mobile": PartialTypeToken },
      "h5": { "desktop": TypeToken, "tablet": PartialTypeToken, "mobile": PartialTypeToken },
      "h6": { "desktop": TypeToken, "tablet": PartialTypeToken, "mobile": PartialTypeToken },
      "p":  { "desktop": TypeToken, "tablet": PartialTypeToken, "mobile": PartialTypeToken }
    }
  },
  "seo": { "metaTitle": string, "metaDescription": string },
  "blocks": [
    {
      "id": string (unique, e.g. "block-hero-1"),
      "type": string (one of the widget types listed below),
      "variant": string (one of that type's variants),
      "props": { ... relevant widget props ... },
      "style": {
        "paddingTop": string, "paddingBottom": string,
        "backgroundColor": string, "textAlign": string,
        "borderRadius": string, "maxWidth": string, "gap": string,
        "responsive": {
          "tablet": { "paddingTop": string, "paddingBottom": string, "textAlign": string, ... },
          "mobile": { "paddingTop": string, "paddingBottom": string, "textAlign": string, ... }
        }
      },
      "elementStyles": { "<elementKey>": { ...partial style... } }
    }
  ]
}

Design-token rules — treat these as the page's global design system:
- "theme" MUST define ALL keys above (never omit a colour/font/radius).
- TypeToken = { "fontFamily": string, "fontSize": number (px), "fontWeight": number, "lineHeight": number, "letterSpacing": number (px), "textTransform": string, "textColor": string, "paragraphSpacing": number|string (p only) }.
- Every typography key MUST include "desktop"; ALWAYS include "tablet" and "mobile" overrides with smaller sizes.
- Use the Design Style + brand colours to pick a coherent palette: bg0→bg5 go from page background to deepest surface, text0→text3 from primary to muted, accent is the brand highlight, ctaButtonColor the primary button fill.
- Ensure text contrast against its background (dark bg → light text0/text1 and vice-versa).

Responsive (multi-device) rules — REQUIRED, the page must be designed for every screen:
- Desktop values live directly on each block's "style". Provide per-device deltas under "style.responsive.tablet" and "style.responsive.mobile".
- On mobile, typically reduce "paddingTop"/"paddingBottom", set "textAlign": "center" where it reads better, and tighten radii. Multi-column sections should stack (the builder does this automatically — reflect it in your padding/alignment choices).
- Do NOT emit the exact same values for all breakpoints; make a real, considered per-device layout.

Style rules:
- "style.backgroundColor" should be one of the theme colours; keep contrast with the text.
- You may also use "style.typography" (BlockTypography), "style.hover"/"style.active" states, and per-element overrides via "elementStyles" keyed by the element's stable key.
- Every block MUST have a unique "id".
- Provide real, specific, on-brief copy. Never output lorem ipsum or placeholder filler.

Available widget types (choose and order ~6–12 that best serve the brief; you may omit "props" keys you are unsure of — sensible defaults are filled automatically, but always provide the content/copy):
${formatWidgetCatalog()}

Composition notes:
- Start with a "navbar" and end with a "footer" unless the brief says otherwise.
- Prefer purpose-fit types for the industry (e.g. "features"/"pricing"/"faq" for SaaS, "gallery"/"amenities"/"unit-config" for property, "gallery"/"testimonials" for restaurants).
`;

    const userPrompt = `
Design a high-converting landing page from scratch based on these requirements:
- User Prompt: ${dto.prompt}
- Template Name: ${dto.templateName || 'AI Designed Template'}
- Category / Industry: ${dto.category || 'Infer from the prompt'}
- Design Style: ${dto.designStyle || 'You decide — invent a distinctive art direction that fits the prompt'}
- Primary Brand Color: ${dto.primaryColor || 'You decide'}
- Accent Color: ${dto.accentColor || 'You decide'}
- Typography: ${dto.typography || 'You decide — pick a display + body pairing that suits the brand'}
- Target Audience: ${dto.targetAudience || 'You decide based on the prompt'}
${projectContext}
${
  dto.selectedSections && dto.selectedSections.length > 0
    ? `- Required Sections (design and order them as you see fit): ${dto.selectedSections.join(', ')}`
    : '- Sections: You decide the ideal composition, order and count (typically 8-12) for this specific brief.'
}

You have full creative freedom. Choose a unique palette, typography, spacing rhythm, responsive rules and section variants that express the brief. Design for the industry the brief describes — do NOT fall back to a generic or real-estate-specific template unless the brief is real estate.
Return raw JSON only.
`;

    const parsed = await provider.generateJson({
      system: systemInstruction,
      prompt: userPrompt,
      temperature: 0.85,
    });
    return parsed;
  }

  /**
   * Section-level AI operations: rewrites, improves headlines, changes tones, or regenerates a block
   */
  async regenerateSection(dto: RegenerateSectionDto) {
    const provider = this.requireProvider();
    const block = dto.block as any;
    const action = dto.action;

    const prompt = `You are a real estate copywriter and conversion optimization expert.
You are modifying a specific section in the OpenPage builder.
Action requested: "${action}"
Block Type: "${block.type}"
Block Variant: "${block.variant || 'default'}"
User Prompt / Instruction: "${dto.prompt || ''}"
Tone: "${dto.tone || 'luxury and persuasive'}"
Site Context: Project: ${dto.siteContext?.projectName || 'Premier Residences'}, Location: ${dto.siteContext?.location || 'Prime City'}, Category: ${dto.siteContext?.category || 'Luxury'}

Current Block Props:
${JSON.stringify(block.props, null, 2)}

Provide an improved, professional version of this block.
Return RAW VALID JSON ONLY representing the updated block object:
{
  "id": "${block.id}",
  "type": "${block.type}",
  "variant": "${block.variant || 'default'}",
  "props": { ... updated props with improved copy ... },
  "style": ${JSON.stringify(block.style || {})}
}
`;

    const parsed = await provider.generateJson({ prompt, temperature: 0.7 });
    return parsed;
  }

  /**
   * Normalizes raw Gemini output into valid OpenPage SiteConfig format
   */
  private normalizeSiteConfig(
    raw: any,
    dto: GenerateTemplateDto,
    project: any,
  ): any {
    const name =
      dto.templateName || project?.name || raw.name || 'AI Generated Template';

    // Brand-color hints from the modal win over the model's own palette, but
    // every other token still comes from the (normalised) AI theme.
    const themeFallback: Partial<typeof DEFAULT_THEME> = {};
    if (dto.primaryColor) {
      themeFallback.accent = dto.primaryColor;
      themeFallback.ctaButtonColor = dto.primaryColor;
    }
    if (dto.accentColor) themeFallback.accentDim = dto.accentColor;
    const theme = normalizeTheme(raw.theme, themeFallback);
    const designSystem = normalizeDesignSystem(raw.designSystem);

    const blocks = Array.isArray(raw.blocks)
      ? raw.blocks.map((b: any, idx: number) => {
          // Fill omitted props from the block type's defaults, then keep every
          // design field the agent emitted (style incl. responsive overrides,
          // per-element styles, animation, visibility…).
          const block: any = applyBlockDefaults({
            id:
              b.id ||
              `block-ai-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            type: b.type || 'content',
            variant: b.variant || 'default',
            props: b.props || {},
            style: b.style || { paddingTop: '80px', paddingBottom: '80px' },
          });
          if (b.elementStyles && typeof b.elementStyles === 'object') {
            block.elementStyles = b.elementStyles;
          }
          for (const key of [
            'animation',
            'animationDuration',
            'animationDelay',
            'children',
          ]) {
            if (b[key] !== undefined) block[key] = b[key];
          }
          return block;
        })
      : [];

    const site: any = {
      engine: 'openpage',
      name,
      theme,
      designSystem,
      blocks,
      pages: [
        {
          id: 'page-home',
          name: 'Home',
          path: '/',
          blocks,
        },
      ],
      seo: {
        metaTitle: raw.seo?.metaTitle || `${name}`,
        metaDescription:
          raw.seo?.metaDescription ||
          `Discover ${name}. ${dto.prompt.slice(0, 140)}`,
      },
    };

    // Preserve any extra top-level fields the agent produced (page settings,
    // popups, tracking, custom vars…).
    for (const key of ['settings', 'popups', 'tracking', 'vars']) {
      if (raw[key] !== undefined) site[key] = raw[key];
    }

    // Only attach the real-estate property block when the brief actually has
    // one (project data fetched or the agent emitted it) — a restaurant or SaaS
    // page must not inherit property fields.
    if (project || (raw.property && typeof raw.property === 'object')) {
      site.property = {
        name,
        builder: project?.developer || raw.property?.builder || '',
        location: project?.location || raw.property?.location || '',
        startingPrice: project?.startingPrice
          ? `₹ ${project.startingPrice}`
          : raw.property?.startingPrice || '',
        description: raw.property?.description || dto.prompt,
      };
    }

    return site;
  }

}
