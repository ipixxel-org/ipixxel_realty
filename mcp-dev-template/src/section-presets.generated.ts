/**
 * AUTO-GENERATED - do not edit by hand.
 *
 * Snapshot of frontend/lib/openpage/section-presets.ts taken by
 * mcp-dev-template/scripts/generate-library.ts. Re-run `npm run generate` in
 * mcp-dev-template after changing the frontend catalogue.
 */

export type SectionPresetCategory = "Header" | "Footer" | "Lead Forms" | "Hero" | "Overview" | "Amenities" | "Location" | "Floor Plans" | "Gallery" | "Pricing" | "Specifications" | "Builder" | "Testimonials" | "Brochure";

export interface SectionPreset {
  id: string;
  category: SectionPresetCategory;
  name: string;
  description: string;
  /** OpenPage block type the preset instantiates (e.g. "project-banner"). */
  type: string;
  variant: string;
  props: Record<string, unknown>;
}

export const SECTION_PRESETS: SectionPreset[] = [
  {
    "id": "header-classic",
    "category": "Header",
    "name": "Classic Sticky Header",
    "description": "Logo left, nav center, enquiry CTA right",
    "type": "navbar",
    "variant": "default",
    "props": {
      "logo": "{{builder_name}}",
      "logoImage": "",
      "links": [
        {
          "label": "Overview",
          "id": "overview"
        },
        {
          "label": "Amenities",
          "id": "amenities"
        },
        {
          "label": "Plans",
          "id": "plans"
        },
        {
          "label": "Gallery",
          "id": "gallery"
        },
        {
          "label": "Pricing",
          "id": "pricing"
        },
        {
          "label": "Contact",
          "id": "enquire"
        }
      ],
      "ctaText": "Book a Site Visit",
      "ctaId": "enquire"
    }
  },
  {
    "id": "header-centered",
    "category": "Header",
    "name": "Centered Logo Header",
    "description": "Brand centered between split nav links",
    "type": "navbar",
    "variant": "centered",
    "props": {
      "logo": "{{builder_name}}",
      "logoImage": "",
      "links": [
        {
          "label": "Overview",
          "id": "overview"
        },
        {
          "label": "Amenities",
          "id": "amenities"
        },
        {
          "label": "Plans",
          "id": "plans"
        },
        {
          "label": "Gallery",
          "id": "gallery"
        },
        {
          "label": "Pricing",
          "id": "pricing"
        },
        {
          "label": "Enquire",
          "id": "enquire"
        }
      ],
      "ctaText": "",
      "ctaId": "enquire"
    }
  },
  {
    "id": "header-dual",
    "category": "Header",
    "name": "Dual Info Header",
    "description": "Contact bar above classic navigation",
    "type": "navbar",
    "variant": "dual",
    "props": {
      "logo": "{{builder_name}}",
      "logoImage": "",
      "links": [
        {
          "label": "Overview",
          "id": "overview"
        },
        {
          "label": "Amenities",
          "id": "amenities"
        },
        {
          "label": "Plans",
          "id": "plans"
        },
        {
          "label": "Pricing",
          "id": "pricing"
        }
      ],
      "ctaText": "Enquire Now",
      "ctaId": "enquire",
      "phone": "+91 98765 43210",
      "email": "sales@{{builder_name}}.com",
      "badge": "RERA Registered"
    }
  },
  {
    "id": "header-pill",
    "category": "Header",
    "name": "Floating Pill Header",
    "description": "Floating rounded nav over the hero",
    "type": "navbar",
    "variant": "pill",
    "props": {
      "logo": "{{builder_name}}",
      "logoImage": "",
      "links": [
        {
          "label": "Overview",
          "id": "overview"
        },
        {
          "label": "Amenities",
          "id": "amenities"
        },
        {
          "label": "Plans",
          "id": "plans"
        },
        {
          "label": "Gallery",
          "id": "gallery"
        },
        {
          "label": "Pricing",
          "id": "pricing"
        },
        {
          "label": "Contact",
          "id": "enquire"
        }
      ],
      "ctaText": "Get Brochure",
      "ctaId": "brochure"
    }
  },
  {
    "id": "header-glass",
    "category": "Header",
    "name": "Glass Overlay Header",
    "description": "Frosted translucent bar for hero images",
    "type": "navbar",
    "variant": "glass",
    "props": {
      "logo": "{{builder_name}}",
      "logoImage": "",
      "links": [
        {
          "label": "Overview",
          "id": "overview"
        },
        {
          "label": "Amenities",
          "id": "amenities"
        },
        {
          "label": "Plans",
          "id": "plans"
        },
        {
          "label": "Pricing",
          "id": "pricing"
        }
      ],
      "ctaText": "Book a Visit",
      "ctaId": "enquire"
    }
  },
  {
    "id": "footer-compact",
    "category": "Footer",
    "name": "Compact Footer",
    "description": "Single-line minimal footer bar",
    "type": "footer",
    "variant": "minimal",
    "props": {
      "logo": "",
      "copyright": "© {{year}} {{builder_name}}. All rights reserved.",
      "links": [
        "Privacy",
        "Terms",
        "RERA"
      ]
    }
  },
  {
    "id": "footer-linkrow",
    "category": "Footer",
    "name": "Link Row Footer",
    "description": "Brand, anchor links and copyright in one row",
    "type": "footer",
    "variant": "simple",
    "props": {
      "logo": "{{builder_name}}",
      "copyright": "© {{year}} {{builder_name}}. All rights reserved.",
      "links": [
        "Overview",
        "Amenities",
        "Plans",
        "Pricing"
      ]
    }
  },
  {
    "id": "footer-classic",
    "category": "Footer",
    "name": "Classic Columns Footer",
    "description": "Multi-column sitemap with contact details",
    "type": "footer",
    "variant": "multi-column",
    "props": {
      "logo": "{{builder_name}}",
      "copyright": "© {{year}} {{builder_name}}. All rights reserved.",
      "tagline": "A thoughtfully planned address for contemporary living.",
      "address": "Site Office, Whitefield, Bengaluru",
      "phone": "+91 98765 43210",
      "email": "sales@{{builder_name}}.com",
      "socials": [],
      "links": [
        "Privacy",
        "Terms",
        "Sitemap"
      ],
      "columns": [
        {
          "title": "Explore",
          "links": [
            "Overview",
            "Amenities",
            "Floor Plans",
            "Gallery",
            "Pricing"
          ]
        },
        {
          "title": "Company",
          "links": [
            "About Us",
            "Projects",
            "Careers",
            "Press"
          ]
        },
        {
          "title": "Support",
          "links": [
            "Contact",
            "Brochure",
            "Site Visit",
            "FAQ"
          ]
        },
        {
          "title": "Legal",
          "links": [
            "Privacy",
            "Terms",
            "RERA",
            "Cookie Policy"
          ]
        }
      ]
    }
  },
  {
    "id": "footer-premium",
    "category": "Footer",
    "name": "Premium Newsletter Footer",
    "description": "Brand, newsletter signup and link columns",
    "type": "footer",
    "variant": "premium",
    "props": {
      "logo": "{{builder_name}}",
      "copyright": "© {{year}} {{builder_name}}. All rights reserved.",
      "tagline": "The latest project updates, price alerts and offers in your inbox.",
      "phone": "+91 98765 43210",
      "email": "sales@{{builder_name}}.com",
      "socials": [
        "f",
        "X",
        "in",
        "yt"
      ],
      "links": [
        "Privacy",
        "Terms"
      ],
      "columns": [
        {
          "title": "Explore",
          "links": [
            "Overview",
            "Amenities",
            "Floor Plans",
            "Pricing"
          ]
        },
        {
          "title": "Company",
          "links": [
            "About",
            "Projects",
            "Careers"
          ]
        },
        {
          "title": "Support",
          "links": [
            "Contact",
            "Brochure",
            "FAQ"
          ]
        }
      ]
    }
  },
  {
    "id": "footer-contact",
    "category": "Footer",
    "name": "Contact Cards Footer",
    "description": "Contact info cards above link columns",
    "type": "footer",
    "variant": "contact",
    "props": {
      "logo": "{{builder_name}}",
      "copyright": "© {{year}} {{builder_name}}. All rights reserved.",
      "tagline": "Visit our sales office or drop us a line.",
      "address": "Site Office, Whitefield, Bengaluru",
      "phone": "+91 98765 43210",
      "email": "sales@{{builder_name}}.com",
      "links": [
        "Privacy",
        "Terms",
        "Sitemap"
      ],
      "columns": [
        {
          "title": "Explore",
          "links": [
            "Overview",
            "Amenities",
            "Floor Plans",
            "Gallery"
          ]
        },
        {
          "title": "Company",
          "links": [
            "About",
            "Projects",
            "Careers"
          ]
        },
        {
          "title": "Support",
          "links": [
            "Contact",
            "Brochure",
            "FAQ"
          ]
        }
      ]
    }
  },
  {
    "id": "hero-split-form",
    "category": "Hero",
    "name": "Hero + Enquiry Form",
    "description": "Full-bleed cover with lead form on the right",
    "type": "project-banner",
    "variant": "split-form",
    "props": {
      "badge": "New Launch",
      "headline": "{{property_name}}",
      "location": "{{location}}",
      "description": "{{description}}",
      "price": "{{starting_price}}",
      "image": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80",
      "primaryCta": "Book a Site Visit",
      "secondaryCta": "Download Brochure",
      "formTitle": "Enquire now",
      "formSubtitle": "A relationship manager will call you shortly.",
      "formId": "",
      "anchor": "hero"
    }
  },
  {
    "id": "hero-overlay",
    "category": "Hero",
    "name": "Overlay Hero",
    "description": "Cinematic cover with CTAs over the image",
    "type": "project-banner",
    "variant": "overlay",
    "props": {
      "badge": "RERA Registered",
      "headline": "{{property_name}}",
      "location": "{{location}}",
      "description": "{{description}}",
      "price": "Starting {{starting_price}}",
      "image": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80",
      "primaryCta": "Book a Visit",
      "secondaryCta": "View Floor Plans",
      "secondaryCtaUrl": "#plans",
      "anchor": "hero"
    }
  },
  {
    "id": "hero-centered",
    "category": "Hero",
    "name": "Centered Minimal Hero",
    "description": "Centered headline with soft gradient backdrop",
    "type": "project-banner",
    "variant": "centered",
    "props": {
      "badge": "Exclusive",
      "headline": "{{property_name}}",
      "location": "{{location}}",
      "description": "{{description}}",
      "price": "{{starting_price}}",
      "image": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80",
      "primaryCta": "Enquire Now",
      "secondaryCta": "Download Brochure",
      "anchor": "hero"
    }
  },
  {
    "id": "hero-stats",
    "category": "Hero",
    "name": "Hero with Stats Strip",
    "description": "Hero plus key project stats under the CTAs",
    "type": "project-banner",
    "variant": "stats",
    "props": {
      "badge": "Ready to Move",
      "headline": "{{property_name}}",
      "location": "{{location}}",
      "description": "{{description}}",
      "price": "{{starting_price}}",
      "image": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80",
      "primaryCta": "Schedule Visit",
      "secondaryCta": "Get Brochure",
      "stats": [
        {
          "label": "Land",
          "value": "{{land_area}}"
        },
        {
          "label": "Towers",
          "value": "{{towers}}"
        },
        {
          "label": "Units",
          "value": "{{units}}"
        },
        {
          "label": "Possession",
          "value": "{{possession_date}}"
        }
      ],
      "anchor": "hero"
    }
  },
  {
    "id": "overview-split",
    "category": "Overview",
    "name": "Split Image Overview",
    "description": "Image left, story and checklist right",
    "type": "project-overview",
    "variant": "split",
    "props": {
      "title": "About {{property_name}}",
      "subtitle": "Project Overview",
      "body": "{{description}}",
      "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
      "ctaText": "Enquire Now",
      "ctaAnchor": "enquire",
      "highlights": [
        {
          "title": "RERA",
          "description": "{{rera_number}}"
        },
        {
          "title": "Location",
          "description": "{{location}}"
        },
        {
          "title": "Possession",
          "description": "{{possession_date}}"
        }
      ],
      "anchor": "overview"
    }
  },
  {
    "id": "overview-centered",
    "category": "Overview",
    "name": "Centered Story",
    "description": "Clean centered narrative block",
    "type": "project-overview",
    "variant": "centered",
    "props": {
      "title": "Project Overview",
      "subtitle": "{{builder_name}}",
      "body": "{{description}}",
      "anchor": "overview"
    }
  },
  {
    "id": "overview-cards",
    "category": "Overview",
    "name": "Overview Highlight Cards",
    "description": "Intro copy with three feature cards below",
    "type": "project-overview",
    "variant": "cards",
    "props": {
      "title": "Why {{property_name}}",
      "subtitle": "Designed for modern living",
      "body": "{{description}}",
      "image": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
      "highlights": [
        {
          "title": "Prime location",
          "description": "{{location}}"
        },
        {
          "title": "Flexible layouts",
          "description": "{{carpet_area}}"
        },
        {
          "title": "Trusted builder",
          "description": "{{builder_name}}"
        }
      ],
      "anchor": "overview"
    }
  },
  {
    "id": "overview-timeline",
    "category": "Overview",
    "name": "Overview Timeline",
    "description": "Story with vertical milestone list",
    "type": "project-overview",
    "variant": "timeline",
    "props": {
      "title": "The Journey",
      "subtitle": "{{property_name}}",
      "body": "{{description}}",
      "highlights": [
        {
          "title": "Launch",
          "description": "Project announcement & booking open"
        },
        {
          "title": "Construction",
          "description": "Structure and interiors underway"
        },
        {
          "title": "Possession",
          "description": "{{possession_date}}"
        }
      ],
      "anchor": "overview"
    }
  },
  {
    "id": "amenities-grid",
    "category": "Amenities",
    "name": "Amenity Image Cards",
    "description": "Grid of amenity cards with images",
    "type": "amenities",
    "variant": "grid",
    "props": {
      "title": "Amenities",
      "subtitle": "Lifestyle designed around you",
      "items": [
        {
          "title": "Clubhouse",
          "description": "Lounge, banquet and co-working.",
          "image": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80",
          "icon": ""
        },
        {
          "title": "Pool",
          "description": "Infinity pool with deck seating.",
          "image": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80",
          "icon": ""
        },
        {
          "title": "Gym",
          "description": "Fully equipped fitness studio.",
          "image": "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80",
          "icon": ""
        }
      ],
      "anchor": "amenities"
    }
  },
  {
    "id": "amenities-chips",
    "category": "Amenities",
    "name": "Amenity Chips",
    "description": "Compact pill list of amenities",
    "type": "amenities",
    "variant": "chips",
    "props": {
      "title": "On-site Amenities",
      "subtitle": "Everything within the campus",
      "items": [
        {
          "title": "Clubhouse",
          "description": "",
          "image": "",
          "icon": ""
        },
        {
          "title": "Swimming Pool",
          "description": "",
          "image": "",
          "icon": ""
        },
        {
          "title": "Gym",
          "description": "",
          "image": "",
          "icon": ""
        },
        {
          "title": "Kids Play",
          "description": "",
          "image": "",
          "icon": ""
        },
        {
          "title": "Landscaped Gardens",
          "description": "",
          "image": "",
          "icon": ""
        },
        {
          "title": "24×7 Security",
          "description": "",
          "image": "",
          "icon": ""
        }
      ],
      "anchor": "amenities"
    }
  },
  {
    "id": "amenities-icon-grid",
    "category": "Amenities",
    "name": "Icon Grid",
    "description": "Dense icon + title amenity grid",
    "type": "amenities",
    "variant": "icon-grid",
    "props": {
      "title": "Lifestyle Amenities",
      "subtitle": "Thoughtfully planned for every day",
      "items": [
        {
          "title": "Clubhouse",
          "description": "Community spaces",
          "image": "",
          "icon": ""
        },
        {
          "title": "Pool",
          "description": "Resort-style leisure",
          "image": "",
          "icon": ""
        },
        {
          "title": "Gym",
          "description": "Morning to night",
          "image": "",
          "icon": ""
        },
        {
          "title": "Park",
          "description": "Green lungs",
          "image": "",
          "icon": ""
        },
        {
          "title": "Sports",
          "description": "Courts & tracks",
          "image": "",
          "icon": ""
        },
        {
          "title": "Security",
          "description": "Gated & monitored",
          "image": "",
          "icon": ""
        }
      ],
      "anchor": "amenities"
    }
  },
  {
    "id": "amenities-featured",
    "category": "Amenities",
    "name": "Featured Amenity Row",
    "description": "Large featured amenity with supporting list",
    "type": "amenities",
    "variant": "featured",
    "props": {
      "title": "Signature Amenities",
      "subtitle": "The highlights residents love",
      "items": [
        {
          "title": "Resort Clubhouse",
          "description": "Banquet, café and lounge across multiple levels.",
          "image": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80",
          "icon": ""
        },
        {
          "title": "Infinity Pool",
          "description": "Deck seating and cabanas.",
          "image": "",
          "icon": ""
        },
        {
          "title": "Sky Deck",
          "description": "Open-air gatherings at dusk.",
          "image": "",
          "icon": ""
        }
      ],
      "anchor": "amenities"
    }
  },
  {
    "id": "location-split",
    "category": "Location",
    "name": "Map + Nearby",
    "description": "Embedded map with connectivity list",
    "type": "location",
    "variant": "split-map",
    "props": {
      "title": "Location & Connectivity",
      "address": "{{location}}",
      "embedUrl": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.079!2d77.7499!3d12.9698!2m3!1f0!2d0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae0e0!2sWhitefield%2C%20Bengaluru!5e0!3m2!1sen!2sin!4v1710000000000",
      "items": [
        {
          "title": "Metro",
          "meta": "12 min"
        },
        {
          "title": "IT Park",
          "meta": "8 min"
        },
        {
          "title": "Airport",
          "meta": "45 min"
        },
        {
          "title": "Mall",
          "meta": "10 min"
        }
      ],
      "anchor": "location"
    }
  },
  {
    "id": "location-list",
    "category": "Location",
    "name": "Connectivity List",
    "description": "Address and nearby points without map",
    "type": "location",
    "variant": "list",
    "props": {
      "title": "Neighbourhood",
      "address": "{{location}}",
      "items": [
        {
          "title": "Schools",
          "meta": "Within 3 km"
        },
        {
          "title": "Hospitals",
          "meta": "Within 4 km"
        },
        {
          "title": "Retail",
          "meta": "Within 2 km"
        }
      ],
      "anchor": "location"
    }
  },
  {
    "id": "location-map-only",
    "category": "Location",
    "name": "Full-width Map",
    "description": "Large map with address caption",
    "type": "location",
    "variant": "map-only",
    "props": {
      "title": "Find Us",
      "address": "{{location}}",
      "embedUrl": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.079!2d77.7499!3d12.9698!2m3!1f0!2d0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae0e0!2sWhitefield%2C%20Bengaluru!5e0!3m2!1sen!2sin!4v1710000000000",
      "items": [],
      "anchor": "location"
    }
  },
  {
    "id": "location-cards",
    "category": "Location",
    "name": "Connectivity Cards",
    "description": "Card grid of nearby destinations",
    "type": "location",
    "variant": "cards",
    "props": {
      "title": "Connected to Everything",
      "address": "{{location}}",
      "embedUrl": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.079!2d77.7499!3d12.9698!2m3!1f0!2d0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae0e0!2sWhitefield%2C%20Bengaluru!5e0!3m2!1sen!2sin!4v1710000000000",
      "items": [
        {
          "title": "ITPL",
          "meta": "8 minutes"
        },
        {
          "title": "ORR",
          "meta": "5 minutes"
        },
        {
          "title": "Whitefield Metro",
          "meta": "12 minutes"
        },
        {
          "title": "Kempegowda Airport",
          "meta": "45 minutes"
        }
      ],
      "anchor": "location"
    }
  },
  {
    "id": "plans-cards",
    "category": "Floor Plans",
    "name": "Gated Plan Cards",
    "description": "Blurred plans unlocked via Form Builder",
    "type": "floor-plans",
    "variant": "cards",
    "props": {
      "title": "Floor Plans",
      "subtitle": "Share details to unlock high-resolution plans",
      "gateEnabled": true,
      "formId": "",
      "items": [
        {
          "name": "2 BHK",
          "beds": "2 Beds",
          "area": "1,145 sq.ft",
          "price": "{{starting_price}}",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        },
        {
          "name": "3 BHK",
          "beds": "3 Beds",
          "area": "1,520 sq.ft",
          "price": "",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        }
      ],
      "anchor": "plans"
    }
  },
  {
    "id": "plans-list",
    "category": "Floor Plans",
    "name": "Compact Plan List",
    "description": "Row list with unlock CTA per plan",
    "type": "floor-plans",
    "variant": "list",
    "props": {
      "title": "Configurations",
      "subtitle": "Select a plan to unlock",
      "gateEnabled": true,
      "formId": "",
      "items": [
        {
          "name": "2 BHK Classic",
          "beds": "2 Beds",
          "area": "1,145 sq.ft",
          "price": "From {{starting_price}}",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        },
        {
          "name": "3 BHK Premium",
          "beds": "3 Beds",
          "area": "1,520 sq.ft",
          "price": "",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        }
      ],
      "anchor": "plans"
    }
  },
  {
    "id": "plans-showcase",
    "category": "Floor Plans",
    "name": "Showcase Plan",
    "description": "Large featured plan with side details",
    "type": "floor-plans",
    "variant": "showcase",
    "props": {
      "title": "Signature Layout",
      "subtitle": "Explore the most popular configuration",
      "gateEnabled": true,
      "formId": "",
      "items": [
        {
          "name": "3 BHK Grand",
          "beds": "3 Beds + Study",
          "area": "1,680 sq.ft",
          "price": "",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        },
        {
          "name": "2 BHK",
          "beds": "2 Beds",
          "area": "1,145 sq.ft",
          "price": "",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        }
      ],
      "anchor": "plans"
    }
  },
  {
    "id": "plans-open",
    "category": "Floor Plans",
    "name": "Open Plans (No Gate)",
    "description": "Visible plans without form unlock",
    "type": "floor-plans",
    "variant": "cards",
    "props": {
      "title": "Floor Plans",
      "subtitle": "Download anytime",
      "gateEnabled": false,
      "formId": "",
      "items": [
        {
          "name": "2 BHK",
          "beds": "2 Beds",
          "area": "1,145 sq.ft",
          "price": "",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        },
        {
          "name": "3 BHK",
          "beds": "3 Beds",
          "area": "1,520 sq.ft",
          "price": "",
          "image": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80",
          "downloadUrl": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1000&q=80"
        }
      ],
      "anchor": "plans"
    }
  },
  {
    "id": "gallery-grid",
    "category": "Gallery",
    "name": "Photo Grid",
    "description": "Responsive image grid with lightbox",
    "type": "gallery",
    "variant": "grid",
    "props": {
      "title": "Gallery",
      "anchor": "gallery",
      "images": [
        {
          "src": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80",
          "alt": "Living",
          "caption": "Living room",
          "category": "Interiors"
        },
        {
          "src": "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80",
          "alt": "Kitchen",
          "caption": "Kitchen",
          "category": "Interiors"
        },
        {
          "src": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80",
          "alt": "Lobby",
          "caption": "Lobby",
          "category": "Common"
        },
        {
          "src": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
          "alt": "Exterior",
          "caption": "Elevation",
          "category": "Exterior"
        }
      ]
    }
  },
  {
    "id": "gallery-masonry",
    "category": "Gallery",
    "name": "Masonry Gallery",
    "description": "Pinterest-style masonry layout",
    "type": "gallery",
    "variant": "masonry",
    "props": {
      "title": "Project Gallery",
      "anchor": "gallery",
      "images": [
        {
          "src": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80",
          "alt": "Living",
          "caption": "",
          "category": "Interiors"
        },
        {
          "src": "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80",
          "alt": "Kitchen",
          "caption": "",
          "category": "Interiors"
        },
        {
          "src": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80",
          "alt": "Pool",
          "caption": "",
          "category": "Amenities"
        },
        {
          "src": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
          "alt": "Exterior",
          "caption": "",
          "category": "Exterior"
        }
      ]
    }
  },
  {
    "id": "gallery-categories",
    "category": "Gallery",
    "name": "Filtered Gallery",
    "description": "Category chips + filtered images",
    "type": "gallery",
    "variant": "grid",
    "props": {
      "title": "Spaces & Views",
      "anchor": "gallery",
      "images": [
        {
          "src": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80",
          "alt": "Living",
          "caption": "Living",
          "category": "Interiors"
        },
        {
          "src": "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80",
          "alt": "Kitchen",
          "caption": "Kitchen",
          "category": "Interiors"
        },
        {
          "src": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80",
          "alt": "Pool",
          "caption": "Pool",
          "category": "Amenities"
        },
        {
          "src": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
          "alt": "Tower",
          "caption": "Elevation",
          "category": "Exterior"
        },
        {
          "src": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80",
          "alt": "Lobby",
          "caption": "Lobby",
          "category": "Common"
        }
      ]
    }
  },
  {
    "id": "gallery-minimal",
    "category": "Gallery",
    "name": "Minimal Strip",
    "description": "Three large equal photos",
    "type": "gallery",
    "variant": "strip",
    "props": {
      "title": "A Closer Look",
      "anchor": "gallery",
      "images": [
        {
          "src": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80",
          "alt": "Living",
          "caption": "Living spaces",
          "category": ""
        },
        {
          "src": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
          "alt": "Exterior",
          "caption": "Architecture",
          "category": ""
        },
        {
          "src": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80",
          "alt": "Lifestyle",
          "caption": "Lifestyle",
          "category": ""
        }
      ]
    }
  },
  {
    "id": "pricing-cards",
    "category": "Pricing",
    "name": "Pricing Cards",
    "description": "Configuration cards with enquire CTA",
    "type": "re-pricing",
    "variant": "cards",
    "props": {
      "title": "Pricing",
      "subtitle": "Transparent starting prices",
      "startingPrice": "{{starting_price}}",
      "items": [
        {
          "name": "2 BHK",
          "price": "{{starting_price}}",
          "meta": "1,145 sq.ft"
        },
        {
          "name": "3 BHK",
          "price": "On request",
          "meta": "1,520 sq.ft"
        },
        {
          "name": "4 BHK",
          "price": "On request",
          "meta": "2,100 sq.ft"
        }
      ],
      "anchor": "pricing"
    }
  },
  {
    "id": "pricing-simple",
    "category": "Pricing",
    "name": "Starting Price Banner",
    "description": "Single starting price with CTA",
    "type": "re-pricing",
    "variant": "simple",
    "props": {
      "title": "Starting Price",
      "subtitle": "All-inclusive offers available",
      "startingPrice": "{{starting_price}}",
      "items": [],
      "anchor": "pricing"
    }
  },
  {
    "id": "pricing-comparison",
    "category": "Pricing",
    "name": "Comparison Table",
    "description": "Side-by-side configuration pricing",
    "type": "re-pricing",
    "variant": "comparison",
    "props": {
      "title": "Compare Configurations",
      "subtitle": "Find the right fit",
      "startingPrice": "{{starting_price}}",
      "items": [
        {
          "name": "2 BHK",
          "price": "{{starting_price}}",
          "meta": "Carpet {{carpet_area}}"
        },
        {
          "name": "3 BHK",
          "price": "On request",
          "meta": "Larger living"
        },
        {
          "name": "Penthouse",
          "price": "On request",
          "meta": "Private terrace"
        }
      ],
      "anchor": "pricing"
    }
  },
  {
    "id": "pricing-banner",
    "category": "Pricing",
    "name": "Offer Banner",
    "description": "Promotional pricing strip",
    "type": "re-pricing",
    "variant": "banner",
    "props": {
      "title": "Limited Period Offer",
      "subtitle": "Book now and save on registration",
      "startingPrice": "{{starting_price}}",
      "items": [
        {
          "name": "All units",
          "price": "{{starting_price}}",
          "meta": "Inclusive of GST*"
        }
      ],
      "anchor": "pricing"
    }
  },
  {
    "id": "specs-grid",
    "category": "Specifications",
    "name": "Spec Stats Grid",
    "description": "Key project stats as metric cards",
    "type": "property-details",
    "variant": "grid",
    "props": {
      "title": "Specifications at a Glance",
      "subtitle": "Project snapshot",
      "type": "Residential",
      "status": "Under Construction",
      "possession": "{{possession_date}}",
      "rera": "{{rera_number}}",
      "items": [
        {
          "label": "Type",
          "value": "Apartment"
        },
        {
          "label": "Carpet",
          "value": "{{carpet_area}}"
        },
        {
          "label": "Land",
          "value": "{{land_area}}"
        },
        {
          "label": "Towers",
          "value": "{{towers}}"
        },
        {
          "label": "Units",
          "value": "{{units}}"
        }
      ],
      "anchor": "specs"
    }
  },
  {
    "id": "specs-table",
    "category": "Specifications",
    "name": "Spec Table",
    "description": "Label / value specification rows",
    "type": "property-details",
    "variant": "table",
    "props": {
      "title": "Technical Specifications",
      "subtitle": "Structure, flooring and finishes",
      "items": [
        {
          "label": "Structure",
          "value": "RCC framed structure"
        },
        {
          "label": "Flooring",
          "value": "Vitrified tiles in living & bedrooms"
        },
        {
          "label": "Kitchen",
          "value": "Granite platform with SS sink"
        },
        {
          "label": "Doors",
          "value": "Engineered wood with premium hardware"
        },
        {
          "label": "Windows",
          "value": "UPVC / aluminium glazed"
        },
        {
          "label": "Electrical",
          "value": "Concealed copper wiring"
        }
      ],
      "anchor": "specs"
    }
  },
  {
    "id": "specs-two-col",
    "category": "Specifications",
    "name": "Two-column Specs",
    "description": "Paired specification columns",
    "type": "property-details",
    "variant": "two-column",
    "props": {
      "title": "Project Specs",
      "subtitle": "{{property_name}}",
      "items": [
        {
          "label": "RERA",
          "value": "{{rera_number}}"
        },
        {
          "label": "Possession",
          "value": "{{possession_date}}"
        },
        {
          "label": "Land Area",
          "value": "{{land_area}}"
        },
        {
          "label": "Builder",
          "value": "{{builder_name}}"
        },
        {
          "label": "Location",
          "value": "{{location}}"
        },
        {
          "label": "Starting Price",
          "value": "{{starting_price}}"
        }
      ],
      "anchor": "specs"
    }
  },
  {
    "id": "specs-checklist",
    "category": "Specifications",
    "name": "Spec Checklist",
    "description": "Checklist of included finishes",
    "type": "property-details",
    "variant": "checklist",
    "props": {
      "title": "What's Included",
      "subtitle": "Standard specifications",
      "items": [
        {
          "label": "Modular kitchen provision",
          "value": "Yes"
        },
        {
          "label": "Premium sanitary fittings",
          "value": "Yes"
        },
        {
          "label": "Video door phone",
          "value": "Yes"
        },
        {
          "label": "Fire fighting system",
          "value": "Yes"
        },
        {
          "label": "Power backup",
          "value": "Common areas"
        },
        {
          "label": "Rainwater harvesting",
          "value": "Yes"
        }
      ],
      "anchor": "specs"
    }
  },
  {
    "id": "builder-simple",
    "category": "Builder",
    "name": "Builder About",
    "description": "Centered developer story",
    "type": "developer",
    "variant": "default",
    "props": {
      "title": "About the Developer",
      "name": "{{builder_name}}",
      "body": "{{builder_name}} delivers thoughtfully planned communities with lasting quality.",
      "anchor": "builder"
    }
  },
  {
    "id": "builder-split",
    "category": "Builder",
    "name": "Builder Split",
    "description": "Photo + developer narrative",
    "type": "developer",
    "variant": "split",
    "props": {
      "title": "Crafted by {{builder_name}}",
      "name": "{{builder_name}}",
      "body": "A legacy of landmark projects across the city — built on trust, design and timely delivery.",
      "image": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1000&q=80",
      "anchor": "builder"
    }
  },
  {
    "id": "builder-stats",
    "category": "Builder",
    "name": "Builder with Stats",
    "description": "Developer bio with delivery stats",
    "type": "developer",
    "variant": "stats",
    "props": {
      "title": "Trusted Developer",
      "name": "{{builder_name}}",
      "body": "Delivering homes that stand the test of time.",
      "items": [
        {
          "label": "Projects",
          "value": "40+"
        },
        {
          "label": "Families",
          "value": "12,000+"
        },
        {
          "label": "Years",
          "value": "25+"
        }
      ],
      "anchor": "builder"
    }
  },
  {
    "id": "builder-logo",
    "category": "Builder",
    "name": "Builder Brand Band",
    "description": "Minimal brand strip with CTA",
    "type": "developer",
    "variant": "band",
    "props": {
      "title": "A {{builder_name}} Development",
      "name": "{{builder_name}}",
      "body": "Quality. Transparency. On-time possession.",
      "ctaText": "Talk to sales",
      "ctaAnchor": "enquire",
      "anchor": "builder"
    }
  },
  {
    "id": "testimonials-cards",
    "category": "Testimonials",
    "name": "Testimonial Cards",
    "description": "Three-up resident quotes",
    "type": "testimonials",
    "variant": "cards",
    "props": {
      "title": "What Residents Say",
      "subtitle": "Stories from our community",
      "items": [
        {
          "name": "Ananya R.",
          "role": "2 BHK Owner",
          "quote": "The clubhouse and greens make everyday living feel like a resort.",
          "rating": 5,
          "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"
        },
        {
          "name": "Rahul M.",
          "role": "3 BHK Owner",
          "quote": "Transparent pricing and on-time updates throughout construction.",
          "rating": 5,
          "avatar": ""
        },
        {
          "name": "Priya S.",
          "role": "Investor",
          "quote": "Strong location and thoughtful layouts — a solid long-term buy.",
          "rating": 4,
          "avatar": ""
        }
      ],
      "anchor": "testimonials"
    }
  },
  {
    "id": "testimonials-carousel",
    "category": "Testimonials",
    "name": "Testimonial Carousel",
    "description": "One quote at a time with controls",
    "type": "testimonials",
    "variant": "carousel",
    "props": {
      "title": "Voices from {{property_name}}",
      "items": [
        {
          "name": "Kavya N.",
          "role": "Homeowner",
          "quote": "We love the morning walks and the kids' play areas.",
          "rating": 5
        },
        {
          "name": "Vikram T.",
          "role": "Homeowner",
          "quote": "Sales and CRM teams were responsive at every step.",
          "rating": 5
        }
      ],
      "anchor": "testimonials"
    }
  },
  {
    "id": "testimonials-spotlight",
    "category": "Testimonials",
    "name": "Spotlight Quote",
    "description": "Single large featured testimonial",
    "type": "testimonials",
    "variant": "spotlight",
    "props": {
      "title": "Featured Story",
      "items": [
        {
          "name": "Meera & Arjun",
          "role": "3 BHK Owners",
          "quote": "From booking to keys, the experience felt premium and personal.",
          "rating": 5,
          "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"
        }
      ],
      "anchor": "testimonials"
    }
  },
  {
    "id": "testimonials-band",
    "category": "Testimonials",
    "name": "Quote Band",
    "description": "Full-width quote on accent background",
    "type": "testimonials",
    "variant": "band",
    "props": {
      "title": "",
      "items": [
        {
          "name": "Resident Community",
          "role": "{{property_name}}",
          "quote": "A home that feels connected to the city — yet quietly tucked away.",
          "rating": 5
        }
      ],
      "anchor": "testimonials"
    }
  },
  {
    "id": "brochure-split",
    "category": "Brochure",
    "name": "Brochure Split",
    "description": "Preview image + gated download CTA",
    "type": "download-brochure",
    "variant": "split",
    "props": {
      "title": "Download Brochure",
      "subtitle": "Share your details to receive the project PDF.",
      "buttonText": "Download PDF",
      "image": "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80",
      "pdfUrl": "",
      "formId": "",
      "popupId": "",
      "anchor": "brochure"
    }
  },
  {
    "id": "brochure-card",
    "category": "Brochure",
    "name": "Brochure Card",
    "description": "Compact centered download card",
    "type": "download-brochure",
    "variant": "card",
    "props": {
      "title": "Project Brochure",
      "subtitle": "Floor plans, pricing and specifications in one PDF.",
      "buttonText": "Get Brochure",
      "image": "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80",
      "pdfUrl": "",
      "formId": "",
      "anchor": "brochure"
    }
  },
  {
    "id": "brochure-banner",
    "category": "Brochure",
    "name": "Brochure Banner",
    "description": "Horizontal promo strip with CTA",
    "type": "download-brochure",
    "variant": "banner",
    "props": {
      "title": "Want the full details?",
      "subtitle": "Download the brochure instantly after a quick form.",
      "buttonText": "Download now",
      "image": "",
      "pdfUrl": "",
      "formId": "",
      "anchor": "brochure"
    }
  },
  {
    "id": "brochure-minimal",
    "category": "Brochure",
    "name": "Minimal Download",
    "description": "Simple text + button gate",
    "type": "download-brochure",
    "variant": "minimal",
    "props": {
      "title": "Brochure",
      "subtitle": "PDF · Specs · Plans · Pricing",
      "buttonText": "Unlock PDF",
      "image": "",
      "pdfUrl": "",
      "formId": "",
      "anchor": "brochure"
    }
  },
  {
    "id": "lead-card",
    "category": "Lead Forms",
    "name": "Enquiry Card",
    "description": "Centered Form Builder enquiry card",
    "type": "lead-form",
    "variant": "card",
    "props": {
      "title": "Enquire now",
      "subtitle": "Our team responds within 15 minutes.",
      "formId": "",
      "anchor": "enquire"
    }
  },
  {
    "id": "lead-split",
    "category": "Lead Forms",
    "name": "Split Enquiry",
    "description": "Benefits list + form side by side",
    "type": "lead-form",
    "variant": "split",
    "props": {
      "title": "Talk to our sales team",
      "subtitle": "Site visits, pricing and inventory — answered personally.",
      "formId": "",
      "benefits": [
        "Priority site-visit slots",
        "Transparent price sheet",
        "WhatsApp updates"
      ],
      "anchor": "enquire"
    }
  },
  {
    "id": "lead-inline",
    "category": "Lead Forms",
    "name": "Inline Compact Form",
    "description": "Narrow form for mid-page conversion",
    "type": "lead-form",
    "variant": "inline",
    "props": {
      "title": "Request a callback",
      "subtitle": "Leave your number — we call back today.",
      "formId": "",
      "anchor": "enquire"
    }
  },
  {
    "id": "lead-site-visit",
    "category": "Lead Forms",
    "name": "Site Visit Form",
    "description": "Dedicated site-visit booking section",
    "type": "site-visit",
    "variant": "default",
    "props": {
      "title": "Book a site visit",
      "subtitle": "Pick a slot that works for you.",
      "formId": "",
      "anchor": "site-visit"
    }
  },
  {
    "id": "lead-default",
    "category": "Lead Forms",
    "name": "Simple Enquiry",
    "description": "Title + form without card chrome",
    "type": "lead-form",
    "variant": "default",
    "props": {
      "title": "Get in touch",
      "subtitle": "Leave your details and we’ll call back.",
      "formId": "",
      "anchor": "enquire"
    }
  },
  {
    "id": "lead-contact",
    "category": "Lead Forms",
    "name": "Contact Form",
    "description": "Classic contact section with Form Builder form",
    "type": "contact",
    "variant": "default",
    "props": {
      "title": "Get in Touch",
      "subtitle": "Questions about the project? Write to us.",
      "formId": "",
      "anchor": "contact"
    }
  },
  {
    "id": "lead-newsletter",
    "category": "Lead Forms",
    "name": "Newsletter Signup",
    "description": "Email capture for launch updates",
    "type": "newsletter",
    "variant": "default",
    "props": {
      "title": "Stay in the loop",
      "subtitle": "Get updates on this project. No spam.",
      "formId": "",
      "anchor": "newsletter"
    }
  },
  {
    "id": "lead-cta",
    "category": "Lead Forms",
    "name": "Enquiry CTA Banner",
    "description": "Closing conversion strip linking to the form",
    "type": "cta",
    "variant": "simple",
    "props": {
      "headline": "Ready to take the next step?",
      "subheadline": "Book a call or visit this weekend.",
      "buttonText": "Enquire Now",
      "buttonUrl": "#enquire"
    }
  }
];

export const SECTION_PRESET_CATEGORIES: SectionPresetCategory[] = [
  "Header",
  "Footer",
  "Lead Forms",
  "Hero",
  "Overview",
  "Amenities",
  "Location",
  "Floor Plans",
  "Gallery",
  "Pricing",
  "Specifications",
  "Builder",
  "Testimonials",
  "Brochure",
];
