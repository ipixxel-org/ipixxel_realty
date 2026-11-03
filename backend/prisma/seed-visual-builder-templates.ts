import { PrismaClient, Prisma } from '@prisma/client';

const IMG = {
  heroDay:
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1920&q=80',
  heroTwilight:
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1920&q=80',
  overview:
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80',
  living:
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
  kitchen:
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
  penthouse:
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdbc?auto=format&fit=crop&w=1200&q=80',
  pool: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
  gym: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
  garden:
    'https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=1200&q=80',
  lobby:
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
  plan: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80',
  brochure:
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80',
  avatar1:
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
  avatar2:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
  avatar3:
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80',
};

const BROCHURE_PDF =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

const MAP_EMBED =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.079!2d77.7499!3d12.9698!2m3!1f0!2d0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae0e0!2sWhitefield%2C%20Bengaluru!5e0!3m2!1sen!2sin!4v1710000000000';

const STANDARD_THEME = {
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
  accent: '#2563eb',
  accentDim: '#1d4ed8',
  ctaButtonColor: '#2563eb',
  borderDefault: '#e2e8f0',
  borderSubtle: '#f1f5f9',
  borderHover: '#cbd5e1',
  fontSans: 'Plus Jakarta Sans',
  fontDisplay: 'Outfit',
  fontMono: 'JetBrains Mono',
  radius: 10,
  radiusLg: 16,
};

const PREMIUM_THEME = {
  bg0: '#f7f4ef',
  bg1: '#fbfaf7',
  bg2: '#f1ece4',
  bg3: '#e6dfd2',
  bg4: '#d4cfc4',
  bg5: '#c4b8a8',
  text0: '#1a1612',
  text1: '#4a4238',
  text2: '#7a7268',
  text3: '#a39a8e',
  accent: '#b8860b',
  accentDim: '#9a6f08',
  ctaButtonColor: '#b8860b',
  borderDefault: '#e4ddd2',
  borderSubtle: '#efeae2',
  borderHover: '#d6cec2',
  fontSans: 'Plus Jakarta Sans',
  fontDisplay: 'Cormorant Garamond',
  fontMono: 'JetBrains Mono',
  radius: 12,
  radiusLg: 20,
};

function buildLegacyConfigEnvelope(params: {
  name: string;
  slug: string;
  primary: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  site: Record<string, unknown>;
  forms: unknown[];
  allowedPlanIds?: string[];
  index?: boolean;
}) {
  return {
    page: { language: 'en', password: '', favicon: '/favicon.ico' },
    seo: {
      metaTitle: `${params.name} | Solstice Residences`,
      metaDescription: `Explore ${params.name} — RERA-registered residences with resort amenities, curated floor plans, and priority site visits.`,
      keywords:
        'solstice residences, real estate, luxury apartments, floor plans, rera',
      canonical: '',
      index: params.index ?? true,
      sitemap: params.index ?? true,
      ogTitle: params.name,
      ogDescription: `Explore ${params.name}. Book a private tour or download the official brochure.`,
      ogImage: IMG.heroDay,
    },
    brand: {
      name: 'Solstice Residences',
      tagline: 'Thoughtfully crafted urban sanctuaries.',
      email: 'concierge@solsticeresidences.in',
      phone: '+91 80 4890 2200',
      primary: params.primary,
      accent: params.accent,
      headingFont: params.headingFont,
      bodyFont: params.bodyFont,
      logo: '',
      facebook: 'https://facebook.com',
      instagram: 'https://instagram.com',
      twitter: '',
      youtube: 'https://youtube.com',
      linkedin: 'https://linkedin.com',
      accentButtons: true,
    },
    tracking: {
      gaId: '',
      gtmId: '',
      metaPixel: '',
      customScripts: '',
      utmSource: 'website',
      utmMedium: 'organic',
      utmCampaign: params.slug,
      goalForm: true,
      goalWhatsapp: true,
      goalCall: true,
      goalBrochure: true,
    },
    forms: params.forms,
    site: params.site,
    ...(params.allowedPlanIds ? { allowedPlanIds: params.allowedPlanIds } : {}),
  };
}

/**
 * Dynamically builds the Standard variation of Solstice Residences using only
 * registered OpenPage visual builder blocks, containers, forms, and popups.
 */
export function buildSolsticeStandardTemplateContent(
  allowedPlanIds: string[] = [],
) {
  const name = 'Solstice Residences — Standard';
  const slug = 'solstice-residences-standard';
  const enquiryFormId = 'form-solstice-std-enquiry';
  const popupId = 'popup-solstice-std-brochure';

  const forms = [
    {
      id: enquiryFormId,
      name: 'Solstice Standard Enquiry',
      description: 'Lead capture form for Solstice Residences (Standard)',
      submitLabel: 'Request Price Sheet & Callback',
      thankYou:
        'Thank you! Our sales advisor will reach out within 15 minutes.',
      successAction: 'message',
      saveToCrm: true,
      fields: [
        {
          id: 'fld_std_name',
          type: 'text',
          label: 'Full Name',
          placeholder: 'Enter your full name',
          required: true,
        },
        {
          id: 'fld_std_phone',
          type: 'phone',
          label: 'Mobile Number',
          placeholder: '+91 98765 43210',
          required: true,
        },
        {
          id: 'fld_std_email',
          type: 'email',
          label: 'Email Address',
          placeholder: 'you@example.com',
          required: false,
        },
        {
          id: 'fld_std_config',
          type: 'select',
          label: 'Preferred Configuration',
          placeholder: 'Select unit type',
          required: true,
          options: [
            '2 BHK Comfort (1,180 sq.ft)',
            '3 BHK Classic (1,560 sq.ft)',
            '3.5 BHK Corner (1,820 sq.ft)',
          ],
        },
        {
          id: 'fld_std_consent',
          type: 'checkbox',
          label:
            'I authorize Solstice Residences to contact me via phone, SMS, or WhatsApp.',
          placeholder: '',
          required: true,
        },
      ],
    },
  ];

  const popups = [
    {
      id: popupId,
      name: 'Solstice Brochure Gate',
      title: 'Download Official E-Brochure',
      description:
        'Enter your contact details to unlock the master plan, floor plans, and specification sheet.',
      formId: enquiryFormId,
      closeOnOverlay: true,
      trigger: 'click',
      brochureUrl: BROCHURE_PDF,
      image: IMG.brochure,
    },
  ];

  const blocks = [
    {
      id: 'blk-std-navbar',
      type: 'navbar',
      variant: 'default',
      props: {
        logo: 'Solstice Residences',
        sticky: true,
        ctaText: 'Enquire Now',
        ctaId: 'enquire',
        ctaButtonColor: '#2563eb',
        ctaTextColor: '#ffffff',
        ctaRadius: 8,
        menuItems: [
          { label: 'Overview', id: 'overview' },
          { label: 'Residences', id: 'units' },
          { label: 'Amenities', id: 'amenities' },
          { label: 'Floor Plans', id: 'plans' },
          { label: 'Pricing', id: 'pricing' },
          { label: 'Location', id: 'location' },
        ],
        links: [
          'Overview',
          'Residences',
          'Amenities',
          'Floor Plans',
          'Pricing',
          'Location',
        ],
      },
    },
    {
      id: 'blk-std-hero',
      type: 'project-banner',
      variant: 'overlay',
      props: {
        anchor: 'hero',
        contentWidth: 'boxed',
        badge: 'RERA Registered · PRM/KA/RERA/1251/446/PR/2026',
        headline: 'Solstice Residences',
        location: 'Whitefield Main Road, Bengaluru',
        price: 'Starting ₹ 1.28 Cr*',
        description:
          'Smartly planned 2, 3 & 3.5 BHK sunlit homes across a 6.5-acre green enclave, 8 minutes from Whitefield Metro & ITPL.',
        image: IMG.heroDay,
        primaryCta: 'Schedule Site Visit',
        primaryCtaUrl: '#enquire',
        primaryCtaColor: '#2563eb',
        primaryCtaTextColor: '#ffffff',
        primaryCtaRadius: 8,
        secondaryCta: 'Download Brochure',
        popupId,
        pdfUrl: BROCHURE_PDF,
        formId: enquiryFormId,
        stats: [
          { _id: 'st_hero_1', value: '6.5 Acres', label: 'Green Campus' },
          { _id: 'st_hero_2', value: '3 Towers', label: 'G + 24 Floors' },
          { _id: 'st_hero_3', value: '72%', label: 'Open Spaces' },
          { _id: 'st_hero_4', value: 'Dec 2027', label: 'Possession' },
        ],
      },
    },
    {
      id: 'blk-std-metrics-container',
      type: 'columns',
      variant: '4-col',
      style: {
        backgroundColor: '#f8fafc',
        paddingTop: '36px',
        paddingBottom: '36px',
      },
      props: {
        htmlTag: 'section',
        contentWidth: 'boxed',
        gap: '20px',
        columns: [
          {
            width: 25,
            mobileWidth: 50,
            blocks: [
              {
                id: 'blk-std-cnt-1',
                type: 'counter',
                variant: 'default',
                props: {
                  start: 0,
                  end: '6.5',
                  suffix: ' Ac',
                  title: 'Master-Planned Campus',
                  align: 'center',
                  numberColor: '#2563eb',
                  duration: 1600,
                },
              },
            ],
          },
          {
            width: 25,
            mobileWidth: 50,
            blocks: [
              {
                id: 'blk-std-cnt-2',
                type: 'counter',
                variant: 'default',
                props: {
                  start: 0,
                  end: '324',
                  suffix: '+',
                  title: 'Vastu-Compliant Homes',
                  align: 'center',
                  numberColor: '#2563eb',
                  duration: 1600,
                },
              },
            ],
          },
          {
            width: 25,
            mobileWidth: 50,
            blocks: [
              {
                id: 'blk-std-cnt-3',
                type: 'counter',
                variant: 'default',
                props: {
                  start: 0,
                  end: '30',
                  suffix: '+',
                  title: 'Lifestyle Amenities',
                  align: 'center',
                  numberColor: '#2563eb',
                  duration: 1600,
                },
              },
            ],
          },
          {
            width: 25,
            mobileWidth: 50,
            blocks: [
              {
                id: 'blk-std-cnt-4',
                type: 'counter',
                variant: 'default',
                props: {
                  start: 0,
                  end: '8',
                  suffix: ' Min',
                  title: 'To Metro & ITPL Hub',
                  align: 'center',
                  numberColor: '#2563eb',
                  duration: 1600,
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'blk-std-overview',
      type: 'project-overview',
      variant: 'split',
      props: {
        anchor: 'overview',
        subtitle: 'About Solstice Residences',
        title: 'Everyday Comfort Meets Connected Urban Living',
        body: 'Designed for modern families, Solstice Residences blends efficient zero-wastage floor plans with a vehicle-free central podium. Every apartment enjoys two-side cross ventilation, wide balconies overlooking landscaped courts, and seamless access to Bengaluru’s eastern tech corridor.',
        image: IMG.overview,
        imagePosition: 'right',
        ctaText: 'Book a Guided Walkthrough',
        ctaAnchor: 'enquire',
        highlights: [
          {
            _id: 'std_ov_h1',
            title: 'Zero Dead-Space Layouts',
            description:
              'Corner living rooms and wide utility decks maximize usable carpet area.',
          },
          {
            _id: 'std_ov_h2',
            title: 'Vehicle-Free Central Park',
            description:
              'Peripheral basement ramps keep walking trails and kids’ zones completely safe.',
          },
          {
            _id: 'std_ov_h3',
            title: 'IGBC Gold Pre-Certified',
            description:
              'Rainwater harvesting, solar common lighting, and EV-ready parking bays.',
          },
        ],
      },
    },
    {
      id: 'blk-std-details',
      type: 'property-details',
      variant: 'grid',
      props: {
        anchor: 'highlights',
        cardsAlign: 'center',
        title: 'Project Snapshot',
        subtitle: 'Key specifications and regulatory milestones at a glance.',
        type: 'Residential Apartments',
        status: 'New Launch',
        possession: 'December 2027',
        rera: 'PRM/KA/RERA/1251/446/PR/2026',
        items: [
          { _id: 'std_pd_1', label: 'Land Parcel', value: '6.5 Acres' },
          { _id: 'std_pd_2', label: 'Elevation', value: '3 Towers · 24F' },
          { _id: 'std_pd_3', label: 'Configurations', value: '2, 3 & 3.5 BHK' },
          { _id: 'std_pd_4', label: 'Clubhouse', value: '25,000 sq.ft' },
          { _id: 'std_pd_5', label: 'RERA Status', value: 'Approved' },
        ],
      },
    },
    {
      id: 'blk-std-units',
      type: 'unit-config',
      variant: 'cards',
      props: {
        anchor: 'units',
        title: 'Apartment Configurations',
        subtitle:
          'Choose the layout tailored to your family’s lifestyle and space needs.',
        ctaText: 'Check Availability',
        ctaAnchor: 'enquire',
        items: [
          {
            _id: 'std_uc_1',
            type: 'Smart Residence',
            config: '2 BHK Comfort',
            area: '1,180 – 1,240 sq.ft',
            price: '₹ 1.28 Cr*',
            image: IMG.living,
            cta: 'Request Cost Sheet',
          },
          {
            _id: 'std_uc_2',
            type: 'Family Residence',
            config: '3 BHK Classic',
            area: '1,560 – 1,640 sq.ft',
            price: '₹ 1.69 Cr*',
            image: IMG.kitchen,
            cta: 'Request Cost Sheet',
          },
          {
            _id: 'std_uc_3',
            type: 'Corner Suite',
            config: '3.5 BHK + Study',
            area: '1,820 – 1,890 sq.ft',
            price: '₹ 1.98 Cr*',
            image: IMG.penthouse,
            cta: 'Request Cost Sheet',
          },
        ],
      },
    },
    {
      id: 'blk-std-amenities',
      type: 'amenities',
      variant: 'icon-grid',
      props: {
        anchor: 'amenities',
        title: 'Curated Lifestyle Amenities',
        subtitle:
          'Over 30 indoor and outdoor spaces designed for wellness, work, and recreation.',
        ctaText: 'Schedule a Clubhouse Preview',
        ctaAnchor: 'enquire',
        items: [
          {
            _id: 'std_am_1',
            title: '25,000 sq.ft Clubhouse',
            description: 'Multi-purpose hall, indoor games lounge, and café.',
            image: IMG.lobby,
            icon: '',
          },
          {
            _id: 'std_am_2',
            title: 'Lap & Kids’ Pool',
            description: 'Sun-deck loungers and dedicated toddler splash pool.',
            image: IMG.pool,
            icon: '',
          },
          {
            _id: 'std_am_3',
            title: 'Fitness & Yoga Centre',
            description: 'Cardio, strength zone, and morning yoga pavilion.',
            image: IMG.gym,
            icon: '',
          },
          {
            _id: 'std_am_4',
            title: 'Co-Working Pods',
            description: 'High-speed Wi-Fi work bays and quiet meeting rooms.',
            image: '',
            icon: '',
          },
          {
            _id: 'std_am_5',
            title: 'Sensory Gardens',
            description:
              '800m reflexology trail, elders’ sit-out, and pet park.',
            image: IMG.garden,
            icon: '',
          },
          {
            _id: 'std_am_6',
            title: 'Multi-Sport Courts',
            description: 'Badminton, half-basketball, and box cricket arena.',
            image: '',
            icon: '',
          },
        ],
      },
    },
    {
      id: 'blk-std-floorplans',
      type: 'floor-plans',
      variant: 'cards',
      props: {
        anchor: 'plans',
        title: 'Unit Floor Plans',
        subtitle:
          'Thoughtfully zoned living, dining, and private bedroom wings.',
        gateEnabled: false,
        formId: enquiryFormId,
        popupId,
        items: [
          {
            _id: 'std_fp_1',
            name: '2 BHK Comfort Plan',
            beds: '2 Beds · 2 Baths · 1 Deck',
            area: '1,180 sq.ft',
            price: '₹ 1.28 Cr*',
            image: IMG.plan,
            downloadUrl: BROCHURE_PDF,
          },
          {
            _id: 'std_fp_2',
            name: '3 BHK Classic Plan',
            beds: '3 Beds · 3 Baths · 2 Decks',
            area: '1,560 sq.ft',
            price: '₹ 1.69 Cr*',
            image: IMG.plan,
            downloadUrl: BROCHURE_PDF,
          },
          {
            _id: 'std_fp_3',
            name: '3.5 BHK + Study Plan',
            beds: '3 Beds + Home Office · 3 Baths',
            area: '1,820 sq.ft',
            price: '₹ 1.98 Cr*',
            image: IMG.plan,
            downloadUrl: BROCHURE_PDF,
          },
        ],
      },
    },
    {
      id: 'blk-std-pricing',
      type: 're-pricing',
      variant: 'simple',
      props: {
        anchor: 'pricing',
        title: 'Transparent Launch Pricing',
        subtitle:
          'All-inclusive base prices with zero hidden floor-rise surprises on early-bird inventory.',
        startingLabel: 'Starting from',
        startingPrice: '₹ 1.28 Cr*',
        disclaimer:
          '*Statutory taxes, stamp duty, and registration charges extra as applicable.',
        ctaText: 'Get Complete Cost Sheet',
        ctaUrl: '#enquire',
        items: [
          {
            _id: 'std_pr_1',
            name: '2 BHK Comfort',
            price: '₹ 1.28 Cr*',
            meta: '1,180 sq.ft SBA',
            description: 'Ideal for young families & tech professionals.',
            cta: 'Enquire',
            url: '#enquire',
          },
          {
            _id: 'std_pr_2',
            name: '3 BHK Classic',
            price: '₹ 1.69 Cr*',
            meta: '1,560 sq.ft SBA',
            description: 'Dual balconies with central courtyard views.',
            cta: 'Enquire',
            url: '#enquire',
          },
          {
            _id: 'std_pr_3',
            name: '3.5 BHK + Study',
            price: '₹ 1.98 Cr*',
            meta: '1,820 sq.ft SBA',
            description: 'Corner residence with dedicated WFH studio.',
            cta: 'Enquire',
            url: '#enquire',
          },
        ],
      },
    },
    {
      id: 'blk-std-location',
      type: 'location',
      variant: 'split-map',
      props: {
        anchor: 'location',
        bulletStyle: 'pin',
        title: 'Location & Connectivity',
        subtitle:
          'Connected to schools, hospitals, metro transit, and major IT parks.',
        address: 'Survey 42, Whitefield Main Road, Bengaluru 560066',
        embedUrl: MAP_EMBED,
        ctaText: 'Book Site Visit',
        ctaUrl: '#enquire',
        items: [
          {
            _id: 'std_loc_1',
            title: 'Whitefield Metro Station',
            meta: '8 mins',
          },
          { _id: 'std_loc_2', title: 'ITPL & EPIP Tech Zone', meta: '10 mins' },
          {
            _id: 'std_loc_3',
            title: 'Manipal Hospital Whitefield',
            meta: '9 mins',
          },
          {
            _id: 'std_loc_4',
            title: 'Phoenix Marketcity Mall',
            meta: '16 mins',
          },
          {
            _id: 'std_loc_5',
            title: 'Deens Academy & Gopalan Int’l',
            meta: '11 mins',
          },
          {
            _id: 'std_loc_6',
            title: 'Outer Ring Road Junction',
            meta: '18 mins',
          },
        ],
      },
    },
    {
      id: 'blk-std-faq',
      type: 'faq',
      variant: 'accordion',
      props: {
        title: 'Frequently Asked Questions',
        subtitle:
          'Answers to common homebuyer questions about Solstice Residences.',
        items: [
          {
            _id: 'std_faq_1',
            question: 'Is Solstice Residences RERA registered?',
            answer:
              'Yes, the project is registered under Karnataka RERA (PRM/KA/RERA/1251/446/PR/2026) with full escrow compliance.',
          },
          {
            _id: 'std_faq_2',
            question: 'Which banks have approved home loans for this project?',
            answer:
              'Leading lenders including SBI, HDFC, ICICI Bank, Axis Bank, and Kotak Mahindra Bank have pre-approved the project.',
          },
          {
            _id: 'std_faq_3',
            question: 'When is the scheduled handover date?',
            answer:
              'Possession is scheduled for December 2027, with model apartments open for viewing today.',
          },
          {
            _id: 'std_faq_4',
            question: 'How can I book a site visit?',
            answer:
              'Fill out the enquiry form below and our relationship team will arrange a convenient weekday or weekend slot.',
          },
        ],
      },
    },
    {
      id: 'blk-std-lead-form',
      type: 'lead-form',
      variant: 'card',
      props: {
        anchor: 'enquire',
        title: 'Enquire About Solstice Residences',
        subtitle:
          'Receive the latest inventory chart, payment schedule, and site-visit slots.',
        formId: enquiryFormId,
        consent:
          'Your contact details remain strictly confidential and are used solely to assist with your enquiry.',
      },
    },
    {
      id: 'blk-std-brochure',
      type: 'download-brochure',
      variant: 'banner',
      props: {
        anchor: 'brochure',
        title: 'Download the Complete Project Brochure',
        subtitle:
          'Master plan, tower orientation, and detailed technical specifications in PDF format.',
        buttonText: 'Download PDF Brochure',
        unlockedButtonText: 'Open Brochure PDF',
        pdfUrl: BROCHURE_PDF,
        formId: enquiryFormId,
        popupId,
      },
    },
    {
      id: 'blk-std-footer',
      type: 'footer',
      variant: 'simple',
      props: {
        logo: 'Solstice Residences',
        tagline:
          'Solstice Residences by Horizon Urban Living · Whitefield, Bengaluru.',
        address: 'Survey 42, Whitefield Main Road, Bengaluru 560066',
        phone: '+91 80 4890 2200',
        email: 'sales@solsticeresidences.in',
        copyright:
          '© 2026 Solstice Residences. RERA No: PRM/KA/RERA/1251/446/PR/2026. All rights reserved.',
        menuLinks: [
          { _id: 'std_ft_1', label: 'Overview', url: '#overview' },
          { _id: 'std_ft_2', label: 'Configurations', url: '#units' },
          { _id: 'std_ft_3', label: 'Amenities', url: '#amenities' },
          { _id: 'std_ft_4', label: 'Pricing', url: '#pricing' },
          { _id: 'std_ft_5', label: 'Enquire', url: '#enquire' },
        ],
        socialLinks: [
          {
            _id: 'std_fs_1',
            label: 'Instagram',
            url: 'https://instagram.com',
            icon: '',
          },
          {
            _id: 'std_fs_2',
            label: 'LinkedIn',
            url: 'https://linkedin.com',
            icon: '',
          },
          {
            _id: 'std_fs_3',
            label: 'YouTube',
            url: 'https://youtube.com',
            icon: '',
          },
        ],
      },
    },
  ];

  const site = {
    engine: 'openpage',
    name,
    theme: STANDARD_THEME,
    forms,
    popups,
    globalWidgets: [],
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks }],
    blocks,
  };

  return {
    engine: 'openpage',
    sections: [],
    site,
    config: buildLegacyConfigEnvelope({
      name,
      slug,
      primary: '#2563eb',
      accent: '#1d4ed8',
      headingFont: 'Outfit',
      bodyFont: 'Plus Jakarta Sans',
      site,
      forms,
      allowedPlanIds,
    }),
  };
}

/**
 * Dynamically builds the Premium variation of Solstice Residences using only
 * registered OpenPage visual builder blocks, multi-column Flexbox containers,
 * interactive financial/comparison widgets, gated forms, and popups.
 */
export function buildSolsticePremiumTemplateContent(
  allowedPlanIds: string[] = [],
) {
  const name = 'Solstice Residences — Premium';
  const slug = 'solstice-residences-premium';
  const conciergeFormId = 'form-solstice-prm-concierge';
  const dossierFormId = 'form-solstice-prm-dossier';
  const popupId = 'popup-solstice-prm-dossier';

  const forms = [
    {
      id: conciergeFormId,
      name: 'Solstice Private Concierge Enquiry',
      description:
        'VIP tour & private preview desk for Solstice Residences (Premium)',
      submitLabel: 'Reserve Private Preview',
      thankYou:
        'Your private concierge request is confirmed. Our luxury desk will call you within 10 minutes.',
      successAction: 'message',
      saveToCrm: true,
      fields: [
        {
          id: 'fld_prm_name',
          type: 'text',
          label: 'Full Name',
          placeholder: 'Your full name',
          required: true,
        },
        {
          id: 'fld_prm_phone',
          type: 'phone',
          label: 'Mobile / WhatsApp Number',
          placeholder: '+91 98765 43210',
          required: true,
        },
        {
          id: 'fld_prm_email',
          type: 'email',
          label: 'Email Address',
          placeholder: 'name@company.com',
          required: true,
        },
        {
          id: 'fld_prm_tier',
          type: 'select',
          label: 'Residence Collection',
          placeholder: 'Choose residence tier',
          required: true,
          options: [
            '3 BHK Sky-Deck Residence (2,140 sq.ft)',
            '4 BHK Private-Lift Residence (2,980 sq.ft)',
            'Duplex Sky Villa Penthouse (4,350 sq.ft)',
          ],
        },
        {
          id: 'fld_prm_slot',
          type: 'select',
          label: 'Viewing Preference',
          placeholder: 'Select preview experience',
          required: false,
          options: [
            'Chauffeur-Driven Lounge Preview (Weekend)',
            'Private Weekday Architect Walkthrough',
            'Live 4K Virtual Tour (NRI / Outstation)',
          ],
        },
        {
          id: 'fld_prm_consent',
          type: 'checkbox',
          label:
            'I consent to receive curated portfolio details from the Solstice Private Client Desk.',
          placeholder: '',
          required: true,
        },
      ],
    },
    {
      id: dossierFormId,
      name: 'Solstice Architectural Dossier Unlock',
      description:
        'Unlocks gated floor plans and private residence dossier PDF',
      submitLabel: 'Unlock Architectural Dossier',
      thankYou: 'Unlocked — your architectural dossier is ready to view.',
      successAction: 'message',
      saveToCrm: true,
      fields: [
        {
          id: 'fld_dos_name',
          type: 'text',
          label: 'Full Name',
          placeholder: 'Your name',
          required: true,
        },
        {
          id: 'fld_dos_phone',
          type: 'phone',
          label: 'Mobile Number',
          placeholder: '+91 98765 43210',
          required: true,
        },
        {
          id: 'fld_dos_email',
          type: 'email',
          label: 'Email Address',
          placeholder: 'you@domain.com',
          required: true,
        },
      ],
    },
  ];

  const popups = [
    {
      id: popupId,
      name: 'Solstice Private Dossier Modal',
      title: 'Unlock the Solstice Collector’s Dossier',
      description:
        'Includes floor-by-floor sun-path studies, imported marble & fixture schedules, and private deck dimensions.',
      formId: dossierFormId,
      closeOnOverlay: true,
      trigger: 'click',
      brochureUrl: BROCHURE_PDF,
      image: IMG.brochure,
    },
  ];

  const blocks = [
    {
      id: 'blk-prm-topbar',
      type: 'banner',
      variant: 'bar',
      props: {
        text: 'FOUNDERS’ SIGNATURE RELEASE · Limited Private-Lift Sky Residences · RERA: PRM/KA/RERA/1251/446/PR/2026',
        linkText: 'Request Private Invitation →',
        linkUrl: '#enquire',
      },
    },
    {
      id: 'blk-prm-navbar',
      type: 'navbar',
      variant: 'centered',
      props: {
        logo: 'SOLSTICE RESERVE',
        sticky: true,
        ctaText: 'Private Preview',
        ctaId: 'enquire',
        ctaButtonColor: '#b8860b',
        ctaTextColor: '#ffffff',
        ctaRadius: 999,
        menuItems: [
          { label: 'Philosophy', id: 'overview' },
          { label: 'Residences', id: 'residences' },
          { label: 'Club & Wellness', id: 'amenities' },
          { label: 'Gallery', id: 'gallery' },
          { label: 'Plans', id: 'plans' },
          { label: 'Investment', id: 'investment' },
          { label: 'Address', id: 'location' },
        ],
        links: [
          'Philosophy',
          'Residences',
          'Club & Wellness',
          'Gallery',
          'Plans',
          'Investment',
          'Address',
        ],
      },
    },
    {
      id: 'blk-prm-hero',
      type: 'project-banner',
      variant: 'split-form',
      props: {
        anchor: 'hero',
        contentWidth: 'boxed',
        badge: 'By Invitation · Signature Edition',
        badgeColor: '#fef3c7',
        badgeBg: 'rgba(184, 134, 11, 0.28)',
        headline: 'Solstice Residences — Signature Reserve',
        location: 'Whitefield Boulevard, Bengaluru',
        price: 'Residences from ₹ 2.85 Cr*',
        description:
          'Private-elevator sky residences and duplex penthouses set within a 6.5-acre botanical sanctuary, crowned by a 45,000 sq.ft private members’ clubhouse and rooftop infinity conservatory.',
        image: IMG.heroTwilight,
        primaryCta: 'Arrange Chauffeur Preview',
        primaryCtaUrl: '#enquire',
        primaryCtaColor: '#b8860b',
        primaryCtaTextColor: '#ffffff',
        primaryCtaRadius: 10,
        secondaryCta: 'Collector’s Dossier',
        popupId,
        pdfUrl: BROCHURE_PDF,
        formId: conciergeFormId,
        formTitle: 'Private Client Concierge',
        formSubtitle:
          'Schedule a confidential walkthrough with our senior portfolio director.',
        stats: [
          { _id: 'prm_hs_1', value: '26 / Ac', label: 'Ultra-Low Density' },
          { _id: 'prm_hs_2', value: '11.5 ft', label: 'Floor-to-Ceiling' },
          { _id: 'prm_hs_3', value: '45,000 sq.ft', label: 'Private Club' },
          { _id: 'prm_hs_4', value: '78%', label: 'Botanical Greens' },
        ],
      },
    },
    {
      id: 'blk-prm-editorial-container',
      type: 'columns',
      variant: '2-col',
      style: {
        backgroundColor: '#fbfaf7',
        paddingTop: '56px',
        paddingBottom: '56px',
      },
      props: {
        htmlTag: 'section',
        contentWidth: 'boxed',
        gap: '32px',
        alignItems: 'center',
        columns: [
          {
            width: 55,
            mobileWidth: 100,
            blocks: [
              {
                id: 'blk-prm-ed-heading',
                type: 'heading',
                variant: 'default',
                style: { alignment: 'left' },
                props: {
                  tag: 'h2',
                  text: 'Crafted Like a Private Boutique Resort',
                },
              },
              {
                id: 'blk-prm-ed-text',
                type: 'text',
                variant: 'default',
                style: { alignment: 'left' },
                props: {
                  body: 'Every residence arrives via a biometric private lift lobby, opening onto 11-foot deep wraparound sky decks framed in acoustic double-glazed glass and Italian Statuario marble.',
                },
              },
              {
                id: 'blk-prm-ed-rating',
                type: 'star-rating',
                variant: 'default',
                props: {
                  rating: 4.9,
                  scale: '5',
                  label: 'Architectural & Sustainability Benchmark',
                  showValue: true,
                  starColor: '#b8860b',
                  align: 'left',
                },
              },
              {
                id: 'blk-prm-ed-btn',
                type: 'button',
                variant: 'pill',
                props: {
                  label: 'Explore Architectural Philosophy',
                  url: '#overview',
                  align: 'left',
                  buttonColor: '#1a1612',
                  textColor: '#ffffff',
                  radius: 999,
                },
              },
            ],
          },
          {
            width: 45,
            mobileWidth: 100,
            blocks: [
              {
                id: 'blk-prm-ed-progress',
                type: 'progress-bar',
                variant: 'default',
                props: {
                  title: 'Design & Sustainability Indices',
                  showPercent: true,
                  height: 12,
                  barColor: '#b8860b',
                  trackColor: '#e6dfd2',
                  items: [
                    {
                      _id: 'prm_pb_1',
                      title: 'Botanical Open Landscape Ratio',
                      percent: 78,
                    },
                    {
                      _id: 'prm_pb_2',
                      title: 'Natural Daylight & Cross-Ventilation Score',
                      percent: 96,
                    },
                    {
                      _id: 'prm_pb_3',
                      title: 'Solar & Water Self-Sufficiency',
                      percent: 85,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'blk-prm-overview',
      type: 'project-overview',
      variant: 'cards',
      props: {
        anchor: 'overview',
        subtitle: 'Architectural Vision',
        title: 'Three Sculpted Glass Towers Above a Forest Canopy',
        body: 'Designed in collaboration with international landscape urbanists, Solstice Reserve elevates every home above lush water courts, sunken lounges, and century-old transplanted rain trees.',
        image: IMG.overview,
        ctaText: 'Request Master Plan Walkthrough',
        ctaAnchor: 'enquire',
        highlights: [
          {
            _id: 'prm_ov_1',
            title: 'Private Biometric Lift Foyers',
            description:
              'Dedicated high-speed passenger elevators opening directly into your residence vestibule.',
          },
          {
            _id: 'prm_ov_2',
            title: '270° Panoramic Sky Decks',
            description:
              'Cantilevered outdoor living rooms with weatherproof timber decking and glass balustrades.',
          },
          {
            _id: 'prm_ov_3',
            title: 'IGBC Platinum Rated Sanctuary',
            description:
              'Low-E solar glazing, central VRV air-conditioning, and hospital-grade MERV-13 air filtration.',
          },
        ],
        stats: [
          { _id: 'prm_ovs_1', value: '168', label: 'Limited Edition Homes' },
          {
            _id: 'prm_ovs_2',
            value: '2 : 1',
            label: 'Lift-to-Residence Ratio',
          },
          {
            _id: 'prm_ovs_3',
            value: '3 Bays',
            label: 'EV-Ready Parking / Unit',
          },
        ],
      },
    },
    {
      id: 'blk-prm-details',
      type: 'property-details',
      variant: 'two-column',
      props: {
        anchor: 'specifications',
        title: 'Signature Specifications',
        subtitle:
          'Uncompromising finishes curated from Europe’s finest design houses.',
        type: 'Luxury Sky Residences & Penthouses',
        status: 'Founders’ Release Open',
        possession: 'December 2027',
        rera: 'PRM/KA/RERA/1251/446/PR/2026',
        items: [
          {
            _id: 'prm_sp_1',
            label: 'Living & Dining Flooring',
            value: 'Imported Italian Statuario Marble',
          },
          {
            _id: 'prm_sp_2',
            label: 'Master Suite Flooring',
            value: 'Engineered European White Oak',
          },
          {
            _id: 'prm_sp_3',
            label: 'Bath Couture',
            value: 'Hansgrohe Axor & Duravit SensoWash',
          },
          {
            _id: 'prm_sp_4',
            label: 'Fenestration',
            value: 'Schüco Acoustic Double-Glazed Sliders',
          },
          {
            _id: 'prm_sp_5',
            label: 'Climate Control',
            value: 'Daikin Concealed VRV System',
          },
          {
            _id: 'prm_sp_6',
            label: 'Home Automation',
            value: 'Schneider KNX Smart Lighting & Curtain Scenes',
          },
        ],
      },
    },
    {
      id: 'blk-prm-units',
      type: 'unit-config',
      variant: 'listings',
      props: {
        anchor: 'residences',
        title: 'The Residence Collection',
        subtitle:
          'Each floor plate hosts only two corner residences for absolute acoustic and visual privacy.',
        ctaText: 'Reserve Private Viewing',
        ctaAnchor: 'enquire',
        items: [
          {
            _id: 'prm_uc_1',
            type: 'Signature Residence',
            config: '3 BHK + Staff Quarter',
            area: '2,140 sq.ft',
            price: '₹ 2.85 Cr*',
            image: IMG.living,
            cta: 'Request Private Sheet',
          },
          {
            _id: 'prm_uc_2',
            type: 'Grand Private-Lift Suite',
            config: '4 BHK + Family Lounge + Staff',
            area: '2,980 sq.ft',
            price: '₹ 3.95 Cr*',
            image: IMG.kitchen,
            cta: 'Request Private Sheet',
          },
          {
            _id: 'prm_uc_3',
            type: 'Crown Collection',
            config: '5 BHK Duplex Sky Villa + Plunge Pool',
            area: '4,350 sq.ft',
            price: '₹ 6.20 Cr*',
            image: IMG.penthouse,
            cta: 'By Invitation',
          },
        ],
      },
    },
    {
      id: 'blk-prm-amenities',
      type: 'amenities',
      variant: 'featured',
      props: {
        anchor: 'amenities',
        title: 'The 45,000 sq.ft Solstice Club & Sky Conservatory',
        subtitle:
          'Hospitality-inspired wellness, dining, and private business suites across four curated levels.',
        ctaText: 'Tour the Show Club',
        ctaAnchor: 'enquire',
        items: [
          {
            _id: 'prm_am_1',
            title: '25th-Floor Heated Infinity Pool',
            description:
              ' cantilevered rooftop lap pool with cabanas, sunken sunset bar, and skyline views.',
            image: IMG.pool,
            icon: '',
          },
          {
            _id: 'prm_am_2',
            title: 'Private Dining & Cigar Salon',
            description:
              'Chef’s kitchen conservatory for intimate resident celebrations up to 40 guests.',
            image: IMG.lobby,
            icon: '',
          },
          {
            _id: 'prm_am_3',
            title: 'Hydrotherapy Spa & Pilates Studio',
            description:
              'Finnish sauna, vitality plunge, Reformer Pilates studio, and Technogym Artis suite.',
            image: IMG.gym,
            icon: '',
          },
          {
            _id: 'prm_am_4',
            title: 'Executive Boardroom & Library',
            description:
              'Soundproofed video-conferencing suites and espresso lounge.',
            image: IMG.living,
            icon: '',
          },
          {
            _id: 'prm_am_5',
            title: 'Botanical Miyawaki Forest Walk',
            description:
              '2.5 acres of dense native flora, koi ponds, and shaded meditation pavilions.',
            image: IMG.garden,
            icon: '',
          },
        ],
      },
    },
    {
      id: 'blk-prm-gallery',
      type: 'gallery',
      variant: 'masonry',
      props: {
        anchor: 'gallery',
        label: 'Visual Tour',
        title: 'Architecture & Interiors',
        subtitle:
          'Glimpses of our show residence, arrival lobby, and landscaped water courts.',
        images: [
          {
            _id: 'prm_gl_1',
            src: IMG.heroTwilight,
            alt: 'Twilight facade',
            caption: 'Sculpted Glass Crown',
            category: 'Exteriors',
          },
          {
            _id: 'prm_gl_2',
            src: IMG.lobby,
            alt: 'Double height lobby',
            caption: '24-ft Concierge Arrival',
            category: 'Interiors',
          },
          {
            _id: 'prm_gl_3',
            src: IMG.living,
            alt: 'Grand living room',
            caption: 'Show Residence Salon',
            category: 'Interiors',
          },
          {
            _id: 'prm_gl_4',
            src: IMG.pool,
            alt: 'Sky infinity pool',
            caption: 'Sky Deck Pool',
            category: 'Club',
          },
          {
            _id: 'prm_gl_5',
            src: IMG.kitchen,
            alt: 'Gourmet island kitchen',
            caption: 'Poggenpohl Show Kitchen',
            category: 'Interiors',
          },
          {
            _id: 'prm_gl_6',
            src: IMG.garden,
            alt: 'Water courtyard',
            caption: 'Central Botanical Court',
            category: 'Landscape',
          },
        ],
      },
    },
    {
      id: 'blk-prm-comparison',
      type: 'image-comparison',
      variant: 'default',
      props: {
        title: 'Daylight Sanctuary to Twilight Landmark',
        subtitle:
          'Drag the slider to experience the architectural facade from sun-drenched morning to illuminated dusk.',
        beforeImage: IMG.heroDay,
        afterImage: IMG.heroTwilight,
        beforeLabel: 'Morning Daylight',
        afterLabel: 'Illuminated Dusk',
        startPercent: 50,
      },
    },
    {
      id: 'blk-prm-floorplans',
      type: 'floor-plans',
      variant: 'showcase',
      props: {
        anchor: 'plans',
        title: 'Architectural Floor Plates',
        subtitle:
          'Unlock high-resolution CAD dimension sheets and Vastu orientation diagrams.',
        gateEnabled: true,
        formId: dossierFormId,
        popupId,
        items: [
          {
            _id: 'prm_fp_1',
            name: '3 BHK Sky-Deck Residence',
            beds: '3 Suites + Staff · Private Lift Foyer',
            area: '2,140 sq.ft',
            price: '₹ 2.85 Cr*',
            image: IMG.plan,
            downloadUrl: BROCHURE_PDF,
          },
          {
            _id: 'prm_fp_2',
            name: '4 BHK Grand Corner Suite',
            beds: '4 Suites + Family Lounge + Staff',
            area: '2,980 sq.ft',
            price: '₹ 3.95 Cr*',
            image: IMG.plan,
            downloadUrl: BROCHURE_PDF,
          },
          {
            _id: 'prm_fp_3',
            name: '5 BHK Duplex Sky Villa',
            beds: 'Double-Height Salon + Private Plunge Pool',
            area: '4,350 sq.ft',
            price: '₹ 6.20 Cr*',
            image: IMG.plan,
            downloadUrl: BROCHURE_PDF,
          },
        ],
      },
    },
    {
      id: 'blk-prm-pricing',
      type: 're-pricing',
      variant: 'cards',
      props: {
        anchor: 'investment',
        title: 'Founders’ Tranche Allocation',
        subtitle:
          'Privileged pre-revision tariff for the first 25 residences. 100% RERA escrow protected.',
        startingLabel: 'Signature Collection from',
        startingPrice: '₹ 2.85 Cr*',
        priceColor: '#b8860b',
        cardPriceColor: '#b8860b',
        disclaimer:
          '*Indicative base values excluding club membership, GST, and statutory registration.',
        ctaText: 'Speak with Wealth Desk',
        ctaUrl: '#enquire',
        items: [
          {
            _id: 'prm_pr_1',
            name: '3 BHK Sky-Deck',
            price: '₹ 2.85 Cr*',
            meta: '2,140 sq.ft · 2 Covered EV Bays',
            description:
              'East/West facing residences overlooking the 2.5-acre central forest.',
            cta: 'Request Allocation',
            url: '#enquire',
          },
          {
            _id: 'prm_pr_2',
            name: '4 BHK Private-Lift',
            price: '₹ 3.95 Cr*',
            meta: '2,980 sq.ft · 3 Covered EV Bays',
            description:
              '270-degree corner wrap deck, private foyer, and wet + dry gourmet kitchens.',
            cta: 'Request Allocation',
            url: '#enquire',
          },
          {
            _id: 'prm_pr_3',
            name: 'Duplex Sky Villa',
            price: '₹ 6.20 Cr*',
            meta: '4,350 sq.ft · 4 Private Garage Bays',
            description:
              '22-ft double-height living room with private heated terrace plunge pool.',
            cta: 'Private Consultation',
            url: '#enquire',
          },
        ],
      },
    },
    {
      id: 'blk-prm-finance-container',
      type: 'columns',
      variant: '2-col',
      style: {
        backgroundColor: '#f1ece4',
        paddingTop: '48px',
        paddingBottom: '48px',
      },
      props: {
        htmlTag: 'section',
        contentWidth: 'boxed',
        gap: '28px',
        alignItems: 'stretch',
        columns: [
          {
            width: 50,
            mobileWidth: 100,
            blocks: [
              {
                id: 'blk-prm-payment-plan',
                type: 'payment-plan',
                variant: 'default',
                props: {
                  title: 'Milestone-Linked 20:30:30:20 Plan',
                  items: [
                    {
                      _id: 'prm_pp_1',
                      title: '20%',
                      description: 'On Booking & RERA Agreement Execution',
                    },
                    {
                      _id: 'prm_pp_2',
                      title: '30%',
                      description: 'On Completion of Podium & 12th Slab',
                    },
                    {
                      _id: 'prm_pp_3',
                      title: '30%',
                      description: 'On Superstructure Top-Out & Facade Glazing',
                    },
                    {
                      _id: 'prm_pp_4',
                      title: '20%',
                      description: 'On OC Receipt & Handover Invitation',
                    },
                  ],
                },
              },
            ],
          },
          {
            width: 50,
            mobileWidth: 100,
            blocks: [
              {
                id: 'blk-prm-emi-calc',
                type: 'emi-calculator',
                variant: 'default',
                props: {
                  title: 'Bespoke Home Finance Estimator',
                  principal: '22500000',
                  rate: '8.35',
                  years: '20',
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'blk-prm-construction',
      type: 'construction-status',
      variant: 'timeline',
      props: {
        anchor: 'progress',
        subtitle: 'Live Execution Milestones',
        title: 'Engineered with Precision',
        items: [
          {
            _id: 'prm_cs_1',
            year: '100%',
            title: 'Excavation & Raft Foundation',
            description: 'Completed ahead of schedule with M50 grade concrete.',
          },
          {
            _id: 'prm_cs_2',
            year: '85%',
            title: 'Triple-Level Podium & Ramp',
            description:
              'Structural slab work nearing completion across Towers A & B.',
          },
          {
            _id: 'prm_cs_3',
            year: '45%',
            title: 'Residential Superstructure',
            description:
              'Mivan aluminium formwork progressing at 2 floors per month.',
          },
          {
            _id: 'prm_cs_4',
            year: 'Q4 2027',
            title: 'Clubhouse & Handover',
            description:
              'Show suite ready on site today for private inspection.',
          },
        ],
      },
    },
    {
      id: 'blk-prm-location',
      type: 'location',
      variant: 'editorial',
      props: {
        anchor: 'location',
        subtitle: 'The Golden Quadrant of East Bengaluru',
        title: 'Quietly Secluded. Effortlessly Central.',
        address: 'Survey 42, Whitefield Boulevard, Bengaluru 560066',
        image: IMG.overview,
        embedUrl: MAP_EMBED,
        ctaText: 'Arrange Chauffeur Pick-Up',
        ctaUrl: '#enquire',
        secondaryCtaText: 'Open in Google Maps',
        secondaryCtaUrl: 'https://maps.google.com/?q=Whitefield+Bengaluru',
        secondaryCtaTarget: '_blank',
        items: [
          {
            _id: 'prm_lc_1',
            title: 'Whitefield Purple-Line Metro',
            meta: '08 Mins Drive',
          },
          {
            _id: 'prm_lc_2',
            title: 'ITPL & International Tech Park',
            meta: '10 Mins Drive',
          },
          {
            _id: 'prm_lc_3',
            title: 'The International School Bangalore',
            meta: '18 Mins Drive',
          },
          {
            _id: 'prm_lc_4',
            title: 'Manipal Quaternary Care Hospital',
            meta: '09 Mins Drive',
          },
          {
            _id: 'prm_lc_5',
            title: 'JW Marriott & Phoenix Marketcity',
            meta: '16 Mins Drive',
          },
          {
            _id: 'prm_lc_6',
            title: 'Kempegowda International Airport',
            meta: '42 Mins via STRR',
          },
        ],
      },
    },
    {
      id: 'blk-prm-developer',
      type: 'developer',
      variant: 'split',
      props: {
        anchor: 'developer',
        title: 'Legacy of Excellence',
        name: 'Horizon Urban Living',
        body: 'For over two decades, Horizon Urban Living has authored landmark residential enclaves across Bengaluru and Mumbai. Every development is backed by zero-debt land ownership, international architectural partnerships, and an unbroken record of ahead-of-RERA deliveries.',
        image: IMG.lobby,
        stats: [
          { _id: 'prm_dv_1', value: '24+ Yrs', label: 'Architectural Legacy' },
          { _id: 'prm_dv_2', value: '18M sq.ft', label: 'Delivered Spaces' },
          { _id: 'prm_dv_3', value: '6,500+', label: 'Discerning Families' },
        ],
      },
    },
    {
      id: 'blk-prm-testimonials',
      type: 'testimonials',
      variant: 'carousel',
      props: {
        anchor: 'testimonials',
        title: 'Endorsed by Homeowners & Advisors',
        subtitle:
          'Reflections from early patrons who toured the Solstice show residence.',
        items: [
          {
            _id: 'prm_tm_1',
            name: 'Siddharth & Kavya Menon',
            role: '4 BHK Patrons · Tower A',
            quote:
              'Stepping out of the private lift directly into a sunlit marble foyer with an 11-foot deck sold us instantly. Nothing else in Whitefield comes close to this density.',
            rating: 5,
            avatar: IMG.avatar2,
          },
          {
            _id: 'prm_tm_2',
            name: 'Nandini Deshmukh',
            role: 'Real Estate Portfolio Advisor',
            quote:
              'With Purple Line metro connectivity and only 26 residences per acre, Solstice Reserve commands strong capital appreciation and executive rental yields.',
            rating: 5,
            avatar: IMG.avatar1,
          },
          {
            _id: 'prm_tm_3',
            name: 'Arjun Malhotra',
            role: 'NRI Investor · Singapore',
            quote:
              'The live 4K virtual walkthrough, transparent RERA documentation, and milestone-linked escrow plan made reserving our unit completely effortless from abroad.',
            rating: 5,
            avatar: IMG.avatar3,
          },
        ],
      },
    },
    {
      id: 'blk-prm-faq',
      type: 'faq',
      variant: 'accordion',
      props: {
        title: 'Private Client FAQ',
        subtitle:
          'Key details on customization, NRI acquisition, and handover.',
        items: [
          {
            _id: 'prm_fq_1',
            question:
              'Can interior layouts be customized in the 4 BHK & Sky Villa residences?',
            answer:
              'Yes. Non-structural partition walls, flooring palettes, and home-office configurations can be tailored with our in-house design studio during the structural phase.',
          },
          {
            _id: 'prm_fq_2',
            question:
              'Do you support NRI bookings and FEMA-compliant NRE/NRO documentation?',
            answer:
              'Yes, a dedicated NRI desk assists with power-of-attorney attestation, NRE/NRO escrow remittances, and pre-sanctioned NRI home loans.',
          },
          {
            _id: 'prm_fq_3',
            question: 'How many car parks are allocated per residence?',
            answer:
              '3 BHK residences include 2 covered EV-ready bays, 4 BHK suites include 3 bays, and Duplex Sky Villas include a 4-car private enclosed basement garage.',
          },
          {
            _id: 'prm_fq_4',
            question: 'Is the 4,350 sq.ft show residence open for viewing?',
            answer:
              'Yes, private by-appointment previews are hosted daily between 10:00 AM and 7:30 PM, with complimentary chauffeur pick-up within Bengaluru.',
          },
        ],
      },
    },
    {
      id: 'blk-prm-lead-form',
      type: 'lead-form',
      variant: 'split',
      props: {
        anchor: 'enquire',
        title: 'Schedule Your Private Lounge Preview',
        description:
          'Experience our full-scale show residence, material library, and 3D architectural scale model over artisanal coffee.',
        subtitle: 'Our Private Client Desk responds within 10 minutes.',
        image: IMG.living,
        formId: conciergeFormId,
        benefits: [
          {
            _id: 'prm_bf_1',
            title: 'Complimentary Chauffeur Transfer',
            description:
              'Doorstep luxury sedan pick-up and drop across Bengaluru.',
          },
          {
            _id: 'prm_bf_2',
            title: 'Founders’ Tranche Price Protection',
            description:
              'Access pre-revision inventory and bespoke milestone payment schedules.',
          },
          {
            _id: 'prm_bf_3',
            title: '1-on-1 Senior Architect Consultation',
            description:
              'Review sun-path orientation, acoustic glazing, and bespoke layout options.',
          },
        ],
        consent:
          'Strictly confidential · Zero spam guarantee · RERA Reg: PRM/KA/RERA/1251/446/PR/2026.',
      },
    },
    {
      id: 'blk-prm-brochure',
      type: 'download-brochure',
      variant: 'split',
      props: {
        anchor: 'brochure',
        title: 'The Solstice Collector’s Dossier',
        subtitle:
          'Download the 48-page architectural monograph featuring floor plates, Schüco & Axor specification schedules, and landscape master plan.',
        image: IMG.brochure,
        pdfUrl: BROCHURE_PDF,
        formId: dossierFormId,
        popupId,
        buttonText: 'Unlock Collector’s Dossier',
        unlockedButtonText: 'Download Monograph PDF',
        buttonColor: '#b8860b',
        buttonTextColor: '#ffffff',
        buttonRadius: 10,
      },
    },
    {
      id: 'blk-prm-cta',
      type: 'cta',
      variant: 'booking',
      props: {
        badge: 'Weekend Private Previews',
        headline: 'Experience Solstice Reserve in Person',
        subheadline:
          'Limited curated preview slots each Saturday & Sunday at our Whitefield Experience Gallery.',
        image: IMG.pool,
        buttonText: 'Reserve Preview Slot',
        buttonUrl: '#enquire',
        buttonColor: '#b8860b',
        buttonTextColor: '#ffffff',
        buttonRadius: 10,
        secondaryButtonText: 'Unlock Dossier',
        secondaryButtonUrl: '#brochure',
      },
    },
    {
      id: 'blk-prm-footer',
      type: 'footer',
      variant: 'premium',
      props: {
        logo: 'SOLSTICE RESERVE',
        tagline:
          'An ultra-low-density architectural sanctuary by Horizon Urban Living on Whitefield Boulevard, Bengaluru.',
        address:
          'Solstice Experience Gallery, Survey 42, Whitefield Boulevard, Bengaluru 560066',
        phone: '+91 80 4890 9900',
        email: 'privateclients@solsticeresidences.in',
        copyright:
          '© 2026 Solstice Residences by Horizon Urban Living. Karnataka RERA: PRM/KA/RERA/1251/446/PR/2026. Artistic impressions for representation.',
        menuLinks: [
          { _id: 'prm_ft_1', label: 'Privacy Policy', url: '#overview' },
          {
            _id: 'prm_ft_2',
            label: 'RERA Disclosures',
            url: '#specifications',
          },
          { _id: 'prm_ft_3', label: 'Disclaimer', url: '#investment' },
        ],
        linkColumns: [
          {
            _id: 'prm_fc_1',
            title: 'The Sanctuary',
            links:
              'Philosophy | #overview\nSpecifications | #specifications\nClub & Wellness | #amenities\nGallery | #gallery',
          },
          {
            _id: 'prm_fc_2',
            title: 'Residences',
            links:
              '3 BHK Sky-Deck | #residences\n4 BHK Private-Lift | #residences\nDuplex Sky Villas | #residences\nFloor Plates | #plans',
          },
          {
            _id: 'prm_fc_3',
            title: 'Private Desk',
            links:
              'Founders’ Pricing | #investment\nBook Chauffeur Visit | #enquire\nCollector’s Dossier | #brochure\nLocation | #location',
          },
        ],
        socialLinks: [
          {
            _id: 'prm_fs_1',
            label: 'Instagram',
            url: 'https://instagram.com',
            icon: '',
          },
          {
            _id: 'prm_fs_2',
            label: 'LinkedIn',
            url: 'https://linkedin.com',
            icon: '',
          },
          {
            _id: 'prm_fs_3',
            label: 'YouTube',
            url: 'https://youtube.com',
            icon: '',
          },
        ],
      },
    },
  ];

  const site = {
    engine: 'openpage',
    name,
    theme: PREMIUM_THEME,
    forms,
    popups,
    globalWidgets: [],
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks }],
    blocks,
  };

  return {
    engine: 'openpage',
    sections: [],
    site,
    config: buildLegacyConfigEnvelope({
      name,
      slug,
      primary: '#b8860b',
      accent: '#1a1612',
      headingFont: 'Cormorant Garamond',
      bodyFont: 'Plus Jakarta Sans',
      site,
      forms,
      allowedPlanIds,
    }),
  };
}

/**
 * Builds a dynamic visual-builder Thank-You companion page for either variation.
 */
export function buildSolsticeThankYouContent(variant: 'standard' | 'premium') {
  const isPremium = variant === 'premium';
  const name = isPremium
    ? 'Solstice Residences — Premium (Thank You)'
    : 'Solstice Residences — Standard (Thank You)';
  const slug = isPremium
    ? 'solstice-residences-premium-thank-you'
    : 'solstice-residences-standard-thank-you';
  const parentSlug = isPremium
    ? '/solstice-residences-premium'
    : '/solstice-residences-standard';
  const accent = isPremium ? '#b8860b' : '#2563eb';

  const blocks = [
    {
      id: `blk-${variant}-ty-nav`,
      type: 'navbar',
      variant: 'default',
      props: {
        logo: isPremium ? 'SOLSTICE RESERVE' : 'Solstice Residences',
        ctaText: 'Back to Project Page',
        ctaHref: parentSlug,
        ctaButtonColor: accent,
        ctaTextColor: '#ffffff',
        menuItems: [],
        links: [],
      },
    },
    {
      id: `blk-${variant}-ty-hero`,
      type: 'hero',
      variant: 'centered',
      props: {
        badge: isPremium ? 'Private Concierge Confirmed' : 'Enquiry Received',
        headline: isPremium
          ? 'Thank You — Your Private Preview Is Prioritized'
          : 'Thank You for Your Interest in Solstice Residences',
        subheadline: isPremium
          ? 'A Senior Portfolio Director will contact you within 10 minutes with your personalized residence dossier and preview confirmation.'
          : 'Our relationship advisor will reach out within 15 minutes with the latest cost sheet, availability, and brochure.',
        primaryCta: 'Download Brochure PDF',
        primaryCtaUrl: BROCHURE_PDF,
        primaryCtaTarget: '_blank',
        primaryCtaColor: accent,
        primaryCtaTextColor: '#ffffff',
        secondaryCta: 'Return to Project Overview',
        secondaryCtaUrl: parentSlug,
      },
    },
    {
      id: `blk-${variant}-ty-steps`,
      type: 'icon-box',
      variant: 'card',
      props: {
        iconColor: accent,
        items: [
          {
            _id: `${variant}_ty_1`,
            icon: '1',
            title: 'Instant Allocation Check',
            description:
              'We match your preferred configuration and floor orientation against live inventory.',
          },
          {
            _id: `${variant}_ty_2`,
            icon: '2',
            title: isPremium ? 'Dedicated Director Call' : 'Advisor Callback',
            description:
              'Receive transparent all-inclusive pricing and milestone payment schedules.',
          },
          {
            _id: `${variant}_ty_3`,
            icon: '3',
            title: isPremium
              ? 'Chauffeur Show-Suite Tour'
              : 'Guided Site Visit',
            description:
              'Walk the model residence and clubhouse at your preferred weekend or weekday slot.',
          },
        ],
      },
    },
    {
      id: `blk-${variant}-ty-footer`,
      type: 'footer',
      variant: 'minimal',
      props: {
        logo: isPremium ? 'SOLSTICE RESERVE' : 'Solstice Residences',
        copyright:
          '© 2026 Solstice Residences · RERA: PRM/KA/RERA/1251/446/PR/2026.',
        menuLinks: [
          {
            _id: `${variant}_ty_ft1`,
            label: 'Back to Main Page',
            url: parentSlug,
          },
        ],
      },
    },
  ];

  const site = {
    engine: 'openpage',
    name,
    theme: isPremium ? PREMIUM_THEME : STANDARD_THEME,
    forms: [],
    popups: [],
    globalWidgets: [],
    pages: [{ id: 'page-home', name: 'Thank You', path: `/${slug}`, blocks }],
    blocks,
  };

  return {
    engine: 'openpage',
    sections: [],
    site,
    config: buildLegacyConfigEnvelope({
      name,
      slug,
      primary: accent,
      accent,
      headingFont: isPremium ? 'Cormorant Garamond' : 'Outfit',
      bodyFont: 'Plus Jakarta Sans',
      site,
      forms: [],
      index: false,
    }),
  };
}

export async function seedVisualBuilderTemplates(prisma: PrismaClient) {
  const category = await prisma.templateCategory.upsert({
    where: { slug: 'real-estate' },
    update: {},
    create: {
      name: 'Real Estate',
      slug: 'real-estate',
      tier: 'free',
    },
  });

  // Ensure a top-tier Ultra Pro plan exists so `premium` tier templates map
  // cleanly to an active plan without altering existing Basic / Starter plans.
  await prisma.plan.upsert({
    where: { slug: 'ultra-pro' },
    update: {},
    create: {
      name: 'Ultra Pro',
      slug: 'ultra-pro',
      description:
        'Enterprise real estate suite with Premium visual builder templates, unlimited campaigns, and priority CRM.',
      priceMonthly: 14999,
      priceYearly: 149990,
      features: [
        '25 landing pages',
        '10 projects',
        '50 team members',
        'All Standard & Premium templates',
        'Publishing & custom domains',
        'WhatsApp & CRM automation',
      ],
      limits: { projects: 10, users: 50, templates: 25, landingPages: 25 },
      capabilities: {
        publishing: true,
        whatsappIntegration: true,
        paidTemplates: true,
        premiumTemplates: true,
      },
      color: '#f5f3ff',
      badge: 'b-violet',
      isPopular: false,
      isActive: true,
    },
  });

  const standardContent =
    buildSolsticeStandardTemplateContent() as unknown as Prisma.InputJsonValue;
  const standardTemplate = await prisma.template.upsert({
    where: { slug: 'solstice-residences-standard' },
    update: {
      name: 'Solstice Residences — Standard',
      status: 'published',
      tier: 'free',
      thumbnail: IMG.heroDay,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'landing',
      content: standardContent,
    },
    create: {
      name: 'Solstice Residences — Standard',
      slug: 'solstice-residences-standard',
      status: 'published',
      tier: 'free',
      thumbnail: IMG.heroDay,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'landing',
      content: standardContent,
    },
  });

  const standardThankYouContent = buildSolsticeThankYouContent(
    'standard',
  ) as unknown as Prisma.InputJsonValue;
  await prisma.template.upsert({
    where: { slug: 'solstice-residences-standard-thank-you' },
    update: {
      name: 'Solstice Residences — Standard — Thank You',
      status: 'published',
      tier: 'free',
      thumbnail: IMG.heroDay,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'thank_you',
      parentId: standardTemplate.id,
      content: standardThankYouContent,
    },
    create: {
      name: 'Solstice Residences — Standard — Thank You',
      slug: 'solstice-residences-standard-thank-you',
      status: 'published',
      tier: 'free',
      thumbnail: IMG.heroDay,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'thank_you',
      parentId: standardTemplate.id,
      content: standardThankYouContent,
    },
  });

  const premiumContent =
    buildSolsticePremiumTemplateContent() as unknown as Prisma.InputJsonValue;
  const premiumTemplate = await prisma.template.upsert({
    where: { slug: 'solstice-residences-premium' },
    update: {
      name: 'Solstice Residences — Premium',
      status: 'published',
      tier: 'premium',
      thumbnail: IMG.heroTwilight,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'landing',
      content: premiumContent,
    },
    create: {
      name: 'Solstice Residences — Premium',
      slug: 'solstice-residences-premium',
      status: 'published',
      tier: 'premium',
      thumbnail: IMG.heroTwilight,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'landing',
      content: premiumContent,
    },
  });

  const premiumThankYouContent = buildSolsticeThankYouContent(
    'premium',
  ) as unknown as Prisma.InputJsonValue;
  await prisma.template.upsert({
    where: { slug: 'solstice-residences-premium-thank-you' },
    update: {
      name: 'Solstice Residences — Premium — Thank You',
      status: 'published',
      tier: 'premium',
      thumbnail: IMG.heroTwilight,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'thank_you',
      parentId: premiumTemplate.id,
      content: premiumThankYouContent,
    },
    create: {
      name: 'Solstice Residences — Premium — Thank You',
      slug: 'solstice-residences-premium-thank-you',
      status: 'published',
      tier: 'premium',
      thumbnail: IMG.heroTwilight,
      designId: 'blank',
      baseDesignName: 'Blank canvas',
      categoryId: category.id,
      kind: 'custom',
      pageType: 'thank_you',
      parentId: premiumTemplate.id,
      content: premiumThankYouContent,
    },
  });

  // Assign the Standard variation to the demo organisation (`skylinedev`) so
  // org admins can immediately test creating & editing pages from it too.
  const demoOrg = await prisma.organisation.findUnique({
    where: { slug: 'skylinedev' },
    select: { id: true },
  });
  if (demoOrg) {
    await prisma.organisationTemplate.upsert({
      where: {
        orgId_templateId: {
          orgId: demoOrg.id,
          templateId: standardTemplate.id,
        },
      },
      update: {},
      create: {
        orgId: demoOrg.id,
        templateId: standardTemplate.id,
      },
    });
  }

  console.log(
    `Seeded dynamic visual-builder templates: "${standardTemplate.name}" (${standardTemplate.tier}) & "${premiumTemplate.name}" (${premiumTemplate.tier}).`,
  );

  return { standardTemplate, premiumTemplate };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedVisualBuilderTemplates(prisma)
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
