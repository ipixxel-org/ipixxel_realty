import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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
      this.logger.warn(
        `Generating high-fidelity fallback layout for prompt: "${dto.prompt}"`,
      );
      generated = this.buildEngineeredFallback(dto, fetchedProject);
    }
    if (
      generated &&
      Array.isArray(generated.blocks) &&
      generated.blocks.length > 0
    ) {
      return this.normalizeSiteConfig(generated, dto, fetchedProject);
    }
    throw new ServiceUnavailableException(
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
    "<block-id>": { "paddingTop": "80px", "paddingBottom": "80px", "backgroundColor": "#...", "textAlign": "center", "borderRadius": "16px" }
  }
}

Token = { "fontFamily": string, "fontSize": number|string, "fontWeight": number, "lineHeight": number, "letterSpacing": number, "textTransform": string, "textColor": string }
Theme colors must be hex strings. Typography sizes are px numbers. Only include keys you are changing.`;

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
          block.style = { ...(block.style ?? {}), ...stylePatch };
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
    const systemInstruction = `You are an elite real estate conversion rate optimization (CRO) landing page architect AND brand art director.
You invent every part of the design yourself: the colour system, typography scale, section composition, order and layout. Never reuse a fixed template.
You generate valid JSON documents for the OpenPage builder.
Output MUST BE RAW VALID JSON ONLY with no markdown ticks, no backticks, and no wrapper text.

The JSON schema must adhere strictly to:
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
  "blocks": [
    {
      "id": string (unique like "block-hero-1"),
      "type": string (one of the widget types listed below),
      "variant": string,
      "props": { ... relevant widget props ... },
      "style": {
        "paddingTop": string, "paddingBottom": string,
        "backgroundColor": string, "textAlign": string,
        "borderRadius": string
      }
    }
  ]
}

Design token rules — treat these as the page's global design system:
- "theme" MUST define ALL keys above (never omit a color/font/radius).
- TypeToken = { "fontFamily": string, "fontSize": number (px), "fontWeight": number, "lineHeight": number, "letterSpacing": number (px), "textTransform": string, "textColor": string, "paragraphSpacing": number|string (p only) }.
- Every typography key MUST include "desktop"; include "tablet" and "mobile" overrides with smaller sizes.
- Use the Design Style + brand colors to pick a coherent palette: bg0→bg5 go from page background to deepest surface, text0→text3 from primary to muted, accent is the brand highlight, ctaButtonColor the primary button fill.
- "style" on each block uses tokens from the theme (backgroundColor should be one of the theme bg/text/accent hex values).
- Ensure text contrast against its background (dark bg → light text0/text1 and vice-versa).

Available OpenPage widget types & their standard props:
1. "navbar": props: { logo: string, ctaText: string, ctaId: string, menuItems: [{ label: string, id: string }] }
2. "project-banner": props: { badge: string, headline: string, location: string, description: string, price: string, primaryCta: string, secondaryCta: string, image: string, anchor: "hero" }
3. "project-overview": props: { title: string, subtitle: string, body: string, image: string, highlights: [{ title: string, description: string }], anchor: "overview" }
4. "property-details": props: { title: string, subtitle: string, items: [{ label: string, value: string }] }
5. "amenities": props: { title: string, subtitle: string, items: string[] or [{ title: string, description: string }], anchor: "amenities" }
6. "floor-plans": props: { title: string, subtitle: string, items: [{ name: string, beds: string, area: string, price: string, image: string }], anchor: "plans" }
7. "re-pricing": props: { title: string, subtitle: string, startingPrice: string, items: [{ name: string, price: string, meta: string }], anchor: "pricing" }
8. "location": props: { title: string, address: string, items: [{ title: string, meta: string }], anchor: "location" }
9. "developer": props: { title: string, name: string, body: string, anchor: "developer" }
10. "testimonials": props: { title: string, items: [{ name: string, role: string, quote: string, rating: 5 }] }
11. "faq": props: { title: string, items: [{ question: string, answer: string }] }
12. "cta": props: { headline: string, subheadline: string, buttonText: string, buttonUrl: string }
13. "lead-form": props: { title: string, subtitle: string, formId: string, anchor: "enquire" }
14. "download-brochure": props: { title: string, buttonText: string }
15. "footer": props: { logo: string, copyright: string, links: string[] }
`;

    const userPrompt = `
Design a high-converting real estate landing page from scratch based on these requirements:
- User Prompt: ${dto.prompt}
- Template Name: ${dto.templateName || 'AI Designed Template'}
- Category: ${dto.category || 'Luxury'}
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

You have full creative freedom. Choose a unique palette, typography, spacing rhythm and section variants that express the prompt. Do NOT fall back to a generic template.
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
          const block: any = {
            id:
              b.id ||
              `block-ai-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            type: b.type || 'project-overview',
            variant: b.variant || 'default',
            props: b.props || {},
            style: b.style || { paddingTop: '80px', paddingBottom: '80px' },
          };
          if (b.elementStyles && typeof b.elementStyles === 'object') {
            block.elementStyles = b.elementStyles;
          }
          return block;
        })
      : [];

    const site = {
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
        metaTitle: `${name} | Official Project Website`,
        metaDescription: `Discover ${name} in ${project?.location || 'prime location'}. High-end residences with premium amenities.`,
      },
      property: {
        name,
        builder: project?.developer || 'Premier Developers',
        location: project?.location || 'Prime City',
        startingPrice: project?.startingPrice
          ? `₹ ${project.startingPrice}`
          : '₹ 1.45 Cr*',
        description: dto.prompt,
      },
    };

    return site;
  }

  /**
   * Resilient fallback synthesizer for times when upstream AI providers (Gemini / Anthropic)
   * experience temporary 503 high demand or capacity limits.
   */
  private buildEngineeredFallback(
    dto: GenerateTemplateDto,
    project: any,
  ): any {
    const name =
      dto.templateName || project?.name || 'Exclusive Luxury Residences';
    const location = project?.location || 'Prime Location';
    const startingPrice = project?.startingPrice
      ? `₹ ${project.startingPrice}`
      : '₹ 1.85 Cr*';
    const configs =
      project?.unitTypes?.map((u: any) => u.name).join(', ') ||
      '2, 3 & 4 BHK Luxury Apartments';
    const developer =
      project?.developer || 'Premier Real Estate Developers';

    const accent = dto.primaryColor || '#c5a075';
    const accentDim = dto.accentColor || '#8c6d48';

    const blocks: any[] = [
      {
        id: `block-${Date.now()}-nav`,
        type: 'navbar',
        variant: 'default',
        props: {
          logo: name,
          phone: '+91 98765 43210',
          ctaText: 'Enquire Now',
          ctaAnchor: 'enquire',
          links: [
            { label: 'Overview', href: '#overview' },
            { label: 'Amenities', href: '#amenities' },
            { label: 'Floor Plans', href: '#floor-plans' },
            { label: 'Pricing', href: '#pricing' },
            { label: 'Location', href: '#location' },
          ],
        },
      },
      {
        id: `block-${Date.now()}-hero`,
        type: 'project-banner',
        variant: 'luxury',
        props: {
          headline: `Experience Unmatched Opulence at ${name}`,
          subheadline: `Thoughtfully crafted ${configs} situated in the prestigious heart of ${location}.`,
          locationBadge: location,
          priceText: startingPrice,
          ctaText: 'Book Private Viewing',
          ctaAnchor: 'enquire',
          backgroundImage:
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1920&q=80',
          stats: [
            { label: 'Configurations', value: '2, 3 & 4 BHK' },
            { label: 'Starting At', value: startingPrice },
            { label: 'Possession', value: 'Dec 2027' },
          ],
        },
      },
      {
        id: `block-${Date.now()}-overview`,
        type: 'project-overview',
        variant: 'split',
        props: {
          eyebrow: 'ARCHITECTURAL MASTERPIECE',
          title: `A New Benchmark for Refined Living in ${location}`,
          description:
            dto.prompt ||
            `${name} presents an exclusive collection of luxury residences designed to elevate your standard of living with sprawling balconies, panoramic views, and bespoke finishes.`,
          bulletPoints: [
            'Expansive floor-to-ceiling glass facades with abundant natural light',
            'IGBC Gold rated sustainable development with zero carbon footprint',
            'Direct arterial connectivity to major business districts & retail hubs',
          ],
          image:
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
        },
      },
      {
        id: `block-${Date.now()}-property-details`,
        type: 'property-details',
        variant: 'cards',
        props: {
          title: 'Development Specifications & Highlights',
          subtitle: 'Precision engineering tailored for generational legacy',
          details: [
            { label: 'Total Land Parcel', value: '12.5 Acres' },
            { label: 'Total Towers', value: '4 Iconic High-Rise Towers' },
            { label: 'Open Greenery', value: '80% Open Landscape' },
            { label: 'Structure', value: 'G + 38 Floors (Mivan Construction)' },
            { label: 'RERA Status', value: 'Approved & Registered' },
            { label: 'Approvals', value: 'All Major Banks Approved' },
          ],
        },
      },
      {
        id: `block-${Date.now()}-amenities`,
        type: 'amenities',
        variant: 'grid-icons',
        props: {
          title: 'Curated World-Class Amenities',
          subtitle: 'Over 40+ resort-grade lifestyle experiences for every generation',
          amenities: [
            { title: 'Temperature Controlled Infinity Pool', icon: 'waves', tag: 'Wellness' },
            { title: '50,000 Sq.Ft. Royal Clubhouse', icon: 'home', tag: 'Leisure' },
            { title: 'CrossFit Gym & Yoga Pavilion', icon: 'activity', tag: 'Fitness' },
            { title: 'Sky Lounge & Observational Deck', icon: 'sun', tag: 'Exclusive' },
            { title: 'Tennis & Badminton Courts', icon: 'target', tag: 'Sports' },
            { title: 'Multi-Tier 24/7 Smart Security', icon: 'shield', tag: 'Safety' },
          ],
        },
      },
      {
        id: `block-${Date.now()}-floorplans`,
        type: 'floor-plans',
        variant: 'tabs',
        props: {
          title: 'Thoughtfully Engineered Floor Layouts',
          subtitle: 'Zero space wastage layouts engineered for privacy and luxury',
          plans: [
            {
              type: '2 BHK Elegance',
              carpetArea: '1,350 Sq.Ft.',
              price: '₹ 1.45 Cr*',
              image:
                'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80',
            },
            {
              type: '3 BHK Signature',
              carpetArea: '1,980 Sq.Ft.',
              price: '₹ 2.10 Cr*',
              image:
                'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
            },
            {
              type: '4 BHK Presidential',
              carpetArea: '2,850 Sq.Ft.',
              price: '₹ 3.40 Cr*',
              image:
                'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80',
            },
          ],
        },
      },
      {
        id: `block-${Date.now()}-pricing`,
        type: 're-pricing',
        variant: 'tiers',
        props: {
          title: 'Transparent Pricing & Flexible Payment Plans',
          subtitle: 'Lucrative launch benefits with attractive construction linked plans (CLP)',
          tiers: [
            {
              name: '2 BHK Premium',
              size: '1,350 Sq.Ft.',
              price: '₹ 1.45 Cr*',
              badge: 'Selling Fast',
              features: ['Private Foyer', 'Modular Kitchen Fitted', 'Covered Car Parking'],
            },
            {
              name: '3 BHK Grande',
              size: '1,980 Sq.Ft.',
              price: '₹ 2.10 Cr*',
              badge: 'Most Popular',
              featured: true,
              features: ['Panoramic Deck', 'Italian Marble Flooring', '2 Covered Car Parkings', 'Walk-in Wardrobe'],
            },
            {
              name: '4 BHK Duplex',
              size: '2,850 Sq.Ft.',
              price: '₹ 3.40 Cr*',
              badge: 'Limited Edition',
              features: ['Private Elevator Lobby', 'Double-Height Living', 'Plunge Pool on Terrace', 'Home Automation'],
            },
          ],
        },
      },
      {
        id: `block-${Date.now()}-location`,
        type: 'location',
        variant: 'map-landmarks',
        props: {
          title: 'Unrivalled Strategic Location',
          subtitle: `Positioned at the epicenter of growth in ${location}`,
          landmarks: [
            { name: 'International Airport', distance: '25 Mins', category: 'Transit' },
            { name: 'Major IT & Tech Parks', distance: '10 Mins', category: 'Work' },
            { name: 'Leading International Schools', distance: '5 Mins', category: 'Education' },
            { name: 'Super-Specialty Hospitals', distance: '8 Mins', category: 'Healthcare' },
          ],
        },
      },
      {
        id: `block-${Date.now()}-developer`,
        type: 'developer',
        variant: 'profile',
        props: {
          developerName: developer,
          experience: '28+ Years of Excellence',
          totalDelivered: '45+ Landmark Developments',
          onTimeDeliveryRate: '98% On-Time Track Record',
          about:
            `${developer} is renowned for unwavering commitment to architectural innovation, uncompromising build quality, and timely project delivery across prime metropolitan centers.`,
        },
      },
      {
        id: `block-${Date.now()}-faq`,
        type: 'faq',
        variant: 'accordion',
        props: {
          title: 'Frequently Asked Questions',
          subtitle: 'Everything you need to know about the development and booking process',
          items: [
            {
              question: `Is ${name} RERA registered?`,
              answer: 'Yes, the project is fully RERA registered and compliant with all statutory guidelines.',
            },
            {
              question: 'What are the available payment schedules?',
              answer: 'We provide Construction-Linked Payment Plans (CLP) as well as subvention schemes through approved banking partners.',
            },
            {
              question: 'When is possession scheduled?',
              answer: 'Phase 1 possession is targeted for December 2027.',
            },
          ],
        },
      },
      {
        id: `block-${Date.now()}-cta`,
        type: 'cta',
        variant: 'gradient',
        props: {
          headline: 'Unlock Special Pre-Launch Pricing Benefits',
          subheadline: 'Exclusive pricing and zero stamp duty offers available for the first 25 priority bookings.',
          buttonText: 'Claim Launch Offer',
          buttonAnchor: 'enquire',
        },
      },
      {
        id: `block-${Date.now()}-form`,
        type: 'lead-form',
        variant: 'card',
        props: {
          title: 'Schedule a Private Site Visit & Consultation',
          subtitle: 'Fill in your details below. Our senior relationship manager will contact you within 15 minutes.',
          anchor: 'enquire',
          submitButtonText: 'Request VIP Call Back',
        },
      },
      {
        id: `block-${Date.now()}-footer`,
        type: 'footer',
        variant: 'simple',
        props: {
          logo: name,
          copyright: `© ${new Date().getFullYear()} ${developer}. All Rights Reserved.`,
          disclaimer:
            'Disclaimer: The imagery and details displayed are artistic impressions for illustrative purposes only. All terms are subject to final agreement.',
        },
      },
    ];

    return {
      name,
      theme: {
        accent,
        accentDim,
        ctaButtonColor: accent,
      },
      designSystem: {
        style: dto.designStyle || 'luxury',
        spacing: 'spacious',
      },
      blocks,
    };
  }
}
