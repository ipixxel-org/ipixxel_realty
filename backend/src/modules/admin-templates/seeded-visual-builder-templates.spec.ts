import {
  buildSolsticeStandardTemplateContent,
  buildSolsticePremiumTemplateContent,
  buildSolsticeThankYouContent,
} from '../../../prisma/seed-visual-builder-templates';
import { toLandingPageData } from './template.mapper';
import {
  bindLandingPageContent,
  type PropertySnapshot,
} from '../../common/utils/landing-page-property.util';
import type { Prisma, Template } from '@prisma/client';

interface TestBlockShape {
  id: string;
  type: string;
  props: {
    headline?: string;
    location?: string;
    price?: string;
    items?: Array<{ title?: string }>;
  };
}

interface TestSiteShape {
  engine?: string;
  blocks?: TestBlockShape[];
  pages?: Array<{ blocks: TestBlockShape[] }>;
}

describe('Seeded Visual Builder Templates (Backend Mapper & Property Binding)', () => {
  const sampleSnapshot: PropertySnapshot = {
    name: 'Emerald Crest',
    builder: 'Skyline Developers',
    type: 'Luxury Apartments',
    status: 'Under Construction',
    description: 'Bespoke sky residences overlooking landscaped greens.',
    startingPrice: '₹2.45 Cr',
    carpetArea: '1,850 sq.ft',
    reraNumber: 'PRM/KA/RERA/1251/446/PR/999999',
    location: 'Indiranagar, Bengaluru',
    possession: 'June 2028',
    amenities: ['Infinity Pool', 'Clubhouse', 'Padel Court'],
    features: ['Corner Glass Decks', 'EV Charging'],
    gallery: ['https://example.com/gallery-1.jpg'],
    landArea: '8 Acres',
    towers: '4',
    units: '240',
    brochureUrl: 'https://example.com/emerald-crest.pdf',
    floorPlans: [
      {
        name: '3 BHK Royale',
        image: 'https://example.com/plan-3bhk.jpg',
        beds: '3 BHK',
        area: '1,850 sq.ft',
      },
    ],
  };

  it('maps Standard and Premium seeded templates cleanly via toLandingPageData', () => {
    const now = new Date();
    const stdRow: Template = {
      id: 'tpl-std-1',
      name: 'Solstice Residences — Standard',
      slug: 'solstice-residences-standard',
      status: 'published',
      tier: 'free',
      thumbnail: 'https://example.com/std.jpg',
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: 'cat-re',
      kind: 'custom',
      pageType: 'landing',
      parentId: null,
      domain: '',
      content:
        buildSolsticeStandardTemplateContent() as unknown as Prisma.JsonValue,
      createdAt: now,
      updatedAt: now,
    };

    const prmRow: Template = {
      ...stdRow,
      id: 'tpl-prm-1',
      name: 'Solstice Residences — Premium',
      slug: 'solstice-residences-premium',
      tier: 'premium',
      content:
        buildSolsticePremiumTemplateContent() as unknown as Prisma.JsonValue,
    };

    const stdMapped = toLandingPageData(stdRow, { includeContent: true });
    const prmMapped = toLandingPageData(prmRow, { includeContent: true });

    if (!('site' in stdMapped) || !('site' in prmMapped)) {
      throw new Error('Expected toLandingPageData to include content fields');
    }

    const stdSite: TestSiteShape | null = stdMapped.site;
    const prmSite: TestSiteShape | null = prmMapped.site;

    expect(stdMapped.engine).toBe('openpage');
    expect(stdMapped.tier).toBe('free');
    expect(stdMapped.isPaid).toBe(false);
    expect(stdSite?.blocks?.length).toBeGreaterThanOrEqual(12);

    expect(prmMapped.engine).toBe('openpage');
    expect(prmMapped.tier).toBe('premium');
    expect(prmMapped.isPaid).toBe(true);
    expect(prmSite?.blocks?.length).toBeGreaterThanOrEqual(20);
  });

  it('dynamically overlays bound project data onto both Standard and Premium OpenPage blocks', () => {
    for (const content of [
      buildSolsticeStandardTemplateContent(),
      buildSolsticePremiumTemplateContent(),
    ]) {
      const bound = bindLandingPageContent(
        content,
        { kind: 'project', projectId: 'proj-123' },
        sampleSnapshot,
      );

      const boundSite = bound.site as TestSiteShape;
      expect(boundSite.engine).toBe('openpage');
      const blocks = boundSite.pages?.[0]?.blocks ?? [];
      const banner = blocks.find((b) => b.type === 'project-banner');
      expect(banner?.props.headline).toBe('Emerald Crest');
      expect(banner?.props.location).toBe('Indiranagar, Bengaluru');
      expect(banner?.props.price).toBe('₹2.45 Cr');

      const amenities = blocks.find((b) => b.type === 'amenities');
      expect(amenities?.props.items).toHaveLength(3);
      expect(amenities?.props.items?.[0]?.title).toBe('Infinity Pool');
    }

    expect(buildSolsticeThankYouContent('standard').engine).toBe('openpage');
    expect(buildSolsticeThankYouContent('premium').engine).toBe('openpage');
  });
});
