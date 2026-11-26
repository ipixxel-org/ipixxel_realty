/**
 * AUTO-GENERATED - do not edit by hand.
 *
 * Snapshot of frontend/lib/openpage/block-metadata.ts taken by
 * backend/mcp-dev-template/scripts/generate-library.ts. Re-run `npm run mcp:generate`
 * from backend/ after changing the frontend catalogue.
 */

export interface BlockMetaSnapshot {
  type: string;
  label: string;
  description: string;
  category: string;
  variants: string[];
  defaultProps: Record<string, unknown>;
}

export const BLOCK_METADATA: BlockMetaSnapshot[] = [
  {
    "type": "section",
    "label": "Section",
    "description": "A single full-width box that holds other widgets",
    "category": "Core",
    "variants": [
      "1-col"
    ],
    "defaultProps": {
      "gap": "24px"
    }
  },
  {
    "type": "div",
    "label": "Div",
    "description": "A plain box that groups widgets, like a container without spacing",
    "category": "Core",
    "variants": [
      "1-col"
    ],
    "defaultProps": {
      "gap": "16px"
    }
  },
  {
    "type": "columns",
    "label": "Container / Columns",
    "description": "Single-column container that can expand into a grid",
    "category": "Core",
    "variants": [
      "1-col",
      "2-col",
      "3-col",
      "4-col"
    ],
    "defaultProps": {
      "gap": "24px"
    }
  },
  {
    "type": "heading",
    "label": "Heading",
    "description": "Section heading",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "text": "Heading",
      "tag": "h2"
    }
  },
  {
    "type": "text",
    "label": "Text Editor",
    "description": "Body copy",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "body": "Write your content here."
    }
  },
  {
    "type": "image",
    "label": "Image",
    "description": "Upload or link an image",
    "category": "Core",
    "variants": [
      "hero-image",
      "side-by-side",
      "grid"
    ],
    "defaultProps": {
      "src": "",
      "alt": "",
      "title": ""
    }
  },
  {
    "type": "video",
    "label": "Video",
    "description": "YouTube or Vimeo walkthrough",
    "category": "Core",
    "variants": [
      "youtube",
      "vimeo"
    ],
    "defaultProps": {
      "url": "",
      "title": "Walkthrough"
    }
  },
  {
    "type": "button",
    "label": "Button",
    "description": "Call-to-action button",
    "category": "Core",
    "variants": [
      "default",
      "outline",
      "pill",
      "glass"
    ],
    "defaultProps": {
      "label": "Enquire Now",
      "url": "#enquire"
    }
  },
  {
    "type": "icon",
    "label": "Icon",
    "description": "Upload an icon or use a built-in name",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "icon": "",
      "size": "48px",
      "label": ""
    }
  },
  {
    "type": "icon-box",
    "label": "Icon Box",
    "description": "Icon with title and text",
    "category": "Core",
    "variants": [
      "default",
      "horizontal",
      "minimal",
      "centered"
    ],
    "defaultProps": {
      "icon": "",
      "title": "Icon box",
      "description": "Short supporting text."
    }
  },
  {
    "type": "image-box",
    "label": "Image Box",
    "description": "Image with title and text",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "image": "",
      "title": "Image box",
      "description": "Short supporting text."
    }
  },
  {
    "type": "divider",
    "label": "Divider",
    "description": "Visual break",
    "category": "Core",
    "variants": [
      "line",
      "dots"
    ],
    "defaultProps": {
      "height": 40
    }
  },
  {
    "type": "spacer",
    "label": "Spacer",
    "description": "Empty vertical space",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "height": "60px"
    }
  },
  {
    "type": "html-code",
    "label": "HTML / Custom Code",
    "description": "Embed custom HTML",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "code": "<p>Custom HTML</p>"
    }
  },
  {
    "type": "grid",
    "label": "Grid",
    "description": "Rows and columns of widgets, e.g. property cards or amenities",
    "category": "Core",
    "variants": [
      "1-col"
    ],
    "defaultProps": {
      "gap": "16px"
    }
  },
  {
    "type": "icon-list",
    "label": "Icon List",
    "description": "Feature list with icons, e.g. 3 BHK, parking, clubhouse",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "layout": "vertical",
      "items": [
        {
          "text": "2 & 3 BHK residences",
          "icon": "✓",
          "link": ""
        },
        {
          "text": "Covered car parking",
          "icon": "✓",
          "link": ""
        },
        {
          "text": "Clubhouse and pool",
          "icon": "✓",
          "link": ""
        }
      ]
    }
  },
  {
    "type": "animated-headline",
    "label": "Animated Headline",
    "description": "Headline with rotating or highlighted words",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "before": "Find your",
      "words": [
        "dream home",
        "perfect villa",
        "next investment"
      ],
      "after": "",
      "animation": "typing",
      "duration": 2500,
      "tag": "h2"
    }
  },
  {
    "type": "alert",
    "label": "Alert",
    "description": "Notice such as limited inventory or offer expiry",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "alertType": "warning",
      "title": "Limited units left",
      "description": "Book this week to get launch pricing.",
      "dismissible": false,
      "showIcon": true
    }
  },
  {
    "type": "slider",
    "label": "Image Carousel",
    "description": "Full-width slides of project images",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "images": [
        {
          "src": "",
          "alt": "",
          "caption": ""
        }
      ],
      "height": "420px",
      "autoPlay": true,
      "interval": 5000,
      "showDots": true,
      "showArrows": true
    }
  },
  {
    "type": "social-icons",
    "label": "Social Icons",
    "description": "Links to social profiles",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "",
      "style": "circle",
      "size": "md",
      "icons": [
        {
          "platform": "facebook",
          "url": "",
          "label": "Facebook"
        },
        {
          "platform": "instagram",
          "url": "",
          "label": "Instagram"
        },
        {
          "platform": "youtube",
          "url": "",
          "label": "YouTube"
        },
        {
          "platform": "whatsapp",
          "url": "",
          "label": "WhatsApp"
        }
      ]
    }
  },
  {
    "type": "tabs",
    "label": "Tabs",
    "description": "Tabbed content, e.g. specifications",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "",
      "items": [
        {
          "label": "Specifications",
          "content": "Add the details here."
        },
        {
          "label": "Amenities",
          "content": "Add the details here."
        }
      ]
    }
  },
  {
    "type": "site-logo",
    "label": "Site Logo",
    "description": "Your logo, linked to the home page",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "image": "",
      "alt": "",
      "link": "/",
      "width": 160,
      "align": "left"
    }
  },
  {
    "type": "site-title",
    "label": "Site Title",
    "description": "Site or project name (uses the project name when empty)",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "text": "",
      "tag": "p",
      "link": "/",
      "align": "left"
    }
  },
  {
    "type": "page-title",
    "label": "Page Title",
    "description": "Main page title (H1) with optional subtitle",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "text": "",
      "subtitle": "",
      "tag": "h1",
      "align": "center"
    }
  },
  {
    "type": "breadcrumbs",
    "label": "Breadcrumbs",
    "description": "Page path, e.g. Home › Projects › Tower A",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "showHome": true,
      "homeLabel": "Home",
      "homeUrl": "/",
      "separator": "›",
      "items": [
        {
          "label": "Projects",
          "url": "#"
        },
        {
          "label": "Project name",
          "url": ""
        }
      ]
    }
  },
  {
    "type": "table-of-contents",
    "label": "Table of Contents",
    "description": "Links to the headings on this page",
    "category": "Core",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "On this page",
      "headings": "h2-h3",
      "numbered": false,
      "collapsible": true,
      "startCollapsed": false
    }
  },
  {
    "type": "hotspot",
    "label": "Hotspot",
    "description": "Clickable markers on a site plan or floor plan",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Master Plan",
      "image": "",
      "trigger": "hover",
      "items": [
        {
          "x": "30",
          "y": "40",
          "label": "Clubhouse",
          "content": "Gym, lounge and party hall.",
          "icon": "",
          "link": "",
          "linkText": ""
        },
        {
          "x": "65",
          "y": "60",
          "label": "Tower A",
          "content": "2 & 3 BHK residences.",
          "icon": "",
          "link": "",
          "linkText": ""
        }
      ]
    }
  },
  {
    "type": "counter",
    "label": "Counter",
    "description": "Animated number, e.g. units, towers or acres",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "start": 0,
      "end": "100",
      "prefix": "",
      "suffix": "+",
      "title": "Your figure here",
      "duration": 2000,
      "separator": true
    }
  },
  {
    "type": "star-rating",
    "label": "Star Rating",
    "description": "Visual rating for a project or builder",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "rating": 4.5,
      "scale": 5,
      "label": "Rating",
      "showValue": true
    }
  },
  {
    "type": "progress-bar",
    "label": "Progress Bar",
    "description": "Construction progress or milestones",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Construction Progress",
      "showPercent": true,
      "items": [
        {
          "title": "Foundation",
          "percent": "100",
          "innerText": "",
          "color": ""
        },
        {
          "title": "Structure",
          "percent": "60",
          "innerText": "",
          "color": ""
        }
      ]
    }
  },
  {
    "type": "price-list",
    "label": "Price List",
    "description": "Unit types with starting prices",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Price List",
      "separator": "dotted",
      "items": [
        {
          "title": "2 BHK",
          "description": "1,145 sq.ft",
          "price": "₹ 1.42 Cr*",
          "image": "",
          "link": ""
        },
        {
          "title": "3 BHK",
          "description": "1,580 sq.ft",
          "price": "₹ 1.95 Cr*",
          "image": "",
          "link": ""
        }
      ]
    }
  },
  {
    "type": "pricing",
    "label": "Price Table",
    "description": "Compare plans or packages with features",
    "category": "Real Estate",
    "variants": [
      "simple",
      "comparison"
    ],
    "defaultProps": {
      "title": "Choose your plan",
      "subtitle": "",
      "tiers": [
        {
          "name": "2 BHK",
          "price": "₹ 1.42 Cr*",
          "period": "",
          "description": "",
          "features": [
            "1,145 sq.ft",
            "2 bathrooms"
          ],
          "cta": "Enquire",
          "featured": false
        },
        {
          "name": "3 BHK",
          "price": "₹ 1.95 Cr*",
          "period": "",
          "description": "",
          "features": [
            "1,580 sq.ft",
            "3 bathrooms"
          ],
          "cta": "Enquire",
          "featured": true
        }
      ]
    }
  },
  {
    "type": "flip-box",
    "label": "Flip Box",
    "description": "Flips on hover to reveal more details or a CTA",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "frontTitle": "3 BHK Residences",
      "frontDescription": "Spacious homes with private balconies",
      "frontIcon": "",
      "frontImage": "",
      "backTitle": "From ₹ 1.95 Cr*",
      "backDescription": "1,580 sq.ft · Ready by 2027",
      "buttonText": "Enquire Now",
      "buttonUrl": "#enquire",
      "direction": "right",
      "height": 300
    }
  },
  {
    "type": "countdown",
    "label": "Countdown",
    "description": "Timer for launch offers or booking deadlines",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Launch offer ends in",
      "targetDate": "",
      "expiredText": "This offer has ended.",
      "showDays": true,
      "showHours": true,
      "showMinutes": true,
      "showSeconds": true
    }
  },
  {
    "type": "off-canvas",
    "label": "Off-Canvas",
    "description": "Button that opens a slide-in enquiry panel",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "buttonText": "Enquire Now",
      "panelTitle": "Enquire now",
      "body": "",
      "formId": "",
      "showForm": true,
      "position": "right",
      "width": 420
    }
  },
  {
    "type": "visual-journey",
    "label": "Visual Journey",
    "description": "Image slider with arrows, image names, paragraph and button",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Visual Journey",
      "description": "",
      "showDivider": true,
      "images": [
        {
          "src": "",
          "caption": "Pickle Ball Court",
          "badge": "AI Impression",
          "description": "",
          "alt": ""
        },
        {
          "src": "",
          "caption": "Clubhouse",
          "badge": "AI Impression",
          "description": "",
          "alt": ""
        },
        {
          "src": "",
          "caption": "Swimming Pool",
          "badge": "AI Impression",
          "description": "",
          "alt": ""
        }
      ],
      "imageHeight": 420,
      "imageRadius": 14,
      "autoplay": false,
      "interval": 5000,
      "accentColor": "",
      "arrowColor": "",
      "buttonText": "",
      "buttonUrl": "",
      "buttonTarget": "_self"
    }
  },
  {
    "type": "ipixxel-hero",
    "label": "Hero",
    "description": "Ready-made real estate hero designs (iPixxel Realty)",
    "category": "Real Estate",
    "variants": [
      "grand-band",
      "skyline",
      "offer-slider",
      "emerald-slider",
      "modern-form"
    ],
    "defaultProps": {
      "image": "",
      "logo": "",
      "logoText": "BRAND",
      "location": "Sector 150, Noida",
      "disclaimer": "*T&C Apply | Artistic Impression",
      "anchor": "hero",
      "accentColor": "",
      "brandColor": "",
      "brandName": "AURUM",
      "brandNumber": "9",
      "brandTitle": "VISTA",
      "brandSubtitle": "RESIDENCES",
      "headline": "Terraces to Forever Greens",
      "legalText": "RERA REG. NO.: UPRERAPRJ000000/01/2026\nWEBSITE: WWW.UP-RERA.IN\nLAUNCH DATE: 1ST JANUARY 2026",
      "qrImage": "",
      "bandText": "3 & 4 BR Oxy-rich Residences Starting ₹ 2.37 Cr*",
      "offerLabel": "Exclusive\nPayment Plan",
      "offerValue": "30:40:30*",
      "logo2": "",
      "skylineTitle": "Four-side Open Residences",
      "stat1Label": "Typology",
      "stat1Value": "4BHK",
      "stat2Label": "Starting Price",
      "stat2Value": "₹ 9.7 Cr*",
      "tourText": "Instant Virtual Tour",
      "tourUrl": "",
      "callText": "Call Now",
      "phone": "+91 90000 00000",
      "menuAnchor": "overview",
      "galleryText": "Gallery",
      "galleryUrl": "",
      "primaryCta": "Enquire Now",
      "primaryCtaUrl": "",
      "primaryCtaTarget": "_self",
      "primaryAnchor": "enquire",
      "logoTagline": "luxury line",
      "headerCta": "Get Price & Brochure",
      "headerCtaUrl": "",
      "headerCtaTarget": "_self",
      "headerCtaAnchor": "",
      "offerTitle": "Book Your Dream Home",
      "highlightText": "Drive Your Dream Car",
      "benefitText": "Assured Benefits Upto",
      "benefitValue": "₹20 LAKHS",
      "benefitNote": "On every booking",
      "configText": "3 & 4 BHKs",
      "priceText": "₹2.40 CR*",
      "validLabel": "Valid till",
      "validValue": "30th Sep",
      "offerBadgeImage": "",
      "badgeTop": "Property",
      "badgeTitle": "Privilege",
      "badgeScript": "fest",
      "slides": [],
      "autoplay": true,
      "interval": 5000,
      "textOnAllSlides": false,
      "whatsapp": "",
      "whatsappIcon": "",
      "whatsappSize": "",
      "showFloatingButtons": true,
      "emeraldTitle": "Emerald Heights",
      "emeraldConfig": "3 & 4 BHK Apartments",
      "emeraldPriceLabel": "Starting From",
      "emeraldPrice": "₹ 1.85 Cr*",
      "emeraldPlan": "Payment Plan: 30:40:30",
      "emeraldRibbon": "Offer valid for the first 25 bookings only*",
      "modernNav": "Overview\nResidences\nLifestyle\nAmenities\nLocation\nGallery",
      "modernNavCta": "Get Price",
      "modernNavCtaUrl": "",
      "modernNavCtaTarget": "_self",
      "modernNavCtaAnchor": "",
      "modernEyebrow": "A new point of view · Sector 150",
      "modernTitle": "Life, considered\nbeautifully.",
      "modernText": "Discover a more elevated way to live — an address shaped by architecture, landscape and the art of coming home.",
      "modernCta": "Get price & availability",
      "modernCtaUrl": "",
      "modernCtaTarget": "_self",
      "modernCtaAnchor": "",
      "modernLink": "Schedule a site visit",
      "modernLinkUrl": "",
      "modernLinkTarget": "_self",
      "modernLinkAnchor": "",
      "modernFormTitle": "The Residences, Sector 150",
      "formId": ""
    }
  },
  {
    "type": "property-carousel",
    "label": "Property Carousel",
    "description": "Property cards in a sliding carousel",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Featured Properties",
      "subtitle": "",
      "slidesPerView": 3,
      "autoplay": false,
      "interval": 5000,
      "buttonText": "View",
      "items": [
        {
          "image": "",
          "title": "Property name",
          "location": "Location",
          "config": "2 & 3 BHK",
          "area": "1,145 sq.ft",
          "price": "From ₹ 1.42 Cr*",
          "status": "New Launch",
          "url": ""
        },
        {
          "image": "",
          "title": "Property name",
          "location": "Location",
          "config": "3 BHK",
          "area": "1,580 sq.ft",
          "price": "From ₹ 1.95 Cr*",
          "status": "Ready to move",
          "url": ""
        },
        {
          "image": "",
          "title": "Property name",
          "location": "Location",
          "config": "4 BHK",
          "area": "2,200 sq.ft",
          "price": "From ₹ 2.80 Cr*",
          "status": "",
          "url": ""
        }
      ]
    }
  },
  {
    "type": "portfolio",
    "label": "Portfolio",
    "description": "Completed projects with category filter",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Our Projects",
      "subtitle": "",
      "showFilter": true,
      "columns": 3,
      "items": [
        {
          "image": "",
          "title": "Project name",
          "location": "Location",
          "category": "Completed",
          "status": "Delivered",
          "url": ""
        },
        {
          "image": "",
          "title": "Project name",
          "location": "Location",
          "category": "Ongoing",
          "status": "Under construction",
          "url": ""
        }
      ]
    }
  },
  {
    "type": "posts",
    "label": "Project Updates / Blog",
    "description": "News, construction updates or blog posts",
    "category": "Real Estate",
    "variants": [
      "grid",
      "list"
    ],
    "defaultProps": {
      "title": "Latest Updates",
      "subtitle": "",
      "columns": 3,
      "showExcerpt": true,
      "readMoreText": "Read more",
      "items": [
        {
          "image": "",
          "title": "Update title",
          "date": "",
          "category": "Construction",
          "excerpt": "A short summary of this update.",
          "url": ""
        }
      ]
    }
  },
  {
    "type": "reviews",
    "label": "Reviews",
    "description": "Customer reviews with an average rating",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Customer Reviews",
      "subtitle": "",
      "showSummary": true,
      "items": [
        {
          "author": "Customer name",
          "rating": "5",
          "date": "",
          "source": "",
          "text": "Replace this with a real customer review.",
          "avatar": ""
        }
      ]
    }
  },
  {
    "type": "navbar",
    "label": "Header / Navigation",
    "description": "Logo, menu and enquire CTA",
    "category": "Core",
    "variants": [
      "default",
      "centered",
      "dual",
      "pill",
      "glass",
      "minimal",
      "marketing"
    ],
    "defaultProps": {
      "logo": "Project",
      "logoImage": "",
      "ctaText": "Enquire Now",
      "ctaId": "enquire",
      "menuItems": [
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
          "label": "Contact",
          "id": "enquire"
        }
      ],
      "links": [
        "Overview",
        "Amenities",
        "Plans",
        "Gallery",
        "Contact"
      ]
    }
  },
  {
    "type": "project-banner",
    "label": "Hero / Banner",
    "description": "Cover image, title, CTAs and optional form",
    "category": "Real Estate",
    "variants": [
      "split-form",
      "overlay",
      "centered",
      "stats",
      "editorial",
      "framed",
      "asymmetric",
      "info-bar",
      "framed-center",
      "split-curve"
    ],
    "defaultProps": {
      "badge": "New Launch",
      "headline": "Project name",
      "location": "",
      "description": "",
      "price": "",
      "image": "",
      "primaryCta": "Book a Site Visit",
      "secondaryCta": "Download Brochure",
      "stats": [],
      "formId": "",
      "anchor": "hero"
    }
  },
  {
    "type": "project-overview",
    "label": "Project Overview",
    "description": "About the project with highlights",
    "category": "Real Estate",
    "variants": [
      "split",
      "centered",
      "cards",
      "timeline"
    ],
    "defaultProps": {
      "title": "About the Project",
      "subtitle": "",
      "body": "",
      "image": "",
      "highlights": [],
      "stats": [],
      "ctaText": "",
      "anchor": "overview"
    }
  },
  {
    "type": "unit-config",
    "label": "Property Listing / Cards",
    "description": "Unit cards with type, area, price and enquire",
    "category": "Real Estate",
    "variants": [
      "cards",
      "table",
      "listings"
    ],
    "defaultProps": {
      "title": "Residences",
      "items": [
        {
          "type": "Apartment",
          "config": "2 BHK",
          "area": "1,145 sq.ft",
          "price": "From ₹ 1.42 Cr*",
          "image": ""
        }
      ]
    }
  },
  {
    "type": "property-search",
    "label": "Property Search",
    "description": "Search bar for projects and units",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "placeholder": "Search by location, project or configuration",
      "buttonText": "Search"
    }
  },
  {
    "type": "property-filters",
    "label": "Property Filters",
    "description": "Filter chips for configuration and status",
    "category": "Real Estate",
    "variants": [
      "default",
      "tabs"
    ],
    "defaultProps": {
      "title": "Filters",
      "items": [
        {
          "label": "2 BHK"
        },
        {
          "label": "3 BHK"
        },
        {
          "label": "Ready"
        }
      ]
    }
  },
  {
    "type": "property-details",
    "label": "Property Details",
    "description": "Type, status, possession, RERA and stats",
    "category": "Real Estate",
    "variants": [
      "grid",
      "table",
      "two-column",
      "checklist"
    ],
    "defaultProps": {
      "title": "Property Details",
      "items": [
        {
          "label": "Type",
          "value": "Apartment"
        },
        {
          "label": "Possession",
          "value": "Dec 2027"
        }
      ],
      "anchor": "highlights"
    }
  },
  {
    "type": "gallery",
    "label": "Property Gallery",
    "description": "Gallery with lightbox and filters",
    "category": "Real Estate",
    "variants": [
      "grid",
      "masonry",
      "strip",
      "lifestyle"
    ],
    "defaultProps": {
      "title": "Gallery",
      "images": [
        {
          "src": "",
          "alt": "",
          "caption": "",
          "meta": "",
          "category": ""
        }
      ],
      "anchor": "gallery"
    }
  },
  {
    "type": "amenities",
    "label": "Property Amenities",
    "description": "Amenity cards with icon or image",
    "category": "Real Estate",
    "variants": [
      "grid",
      "chips",
      "icon-grid",
      "featured",
      "mosaic"
    ],
    "defaultProps": {
      "title": "Amenities",
      "items": [
        {
          "title": "Clubhouse",
          "description": "Lounge and banquet.",
          "image": "",
          "icon": ""
        }
      ],
      "anchor": "amenities"
    }
  },
  {
    "type": "floor-plans",
    "label": "Floor Plans",
    "description": "Gated gallery — Form Builder unlock + download",
    "category": "Real Estate",
    "variants": [
      "cards",
      "list",
      "showcase"
    ],
    "defaultProps": {
      "title": "Floor Plans",
      "gateEnabled": true,
      "formId": "",
      "items": [
        {
          "name": "2 BHK",
          "beds": "2 Beds",
          "area": "1,145 sq.ft",
          "price": "",
          "image": "",
          "downloadUrl": ""
        }
      ],
      "anchor": "plans"
    }
  },
  {
    "type": "location",
    "label": "Location / Map",
    "description": "Map embed, address and nearby",
    "category": "Real Estate",
    "variants": [
      "split-map",
      "list",
      "map-only",
      "cards",
      "editorial",
      "advantages"
    ],
    "defaultProps": {
      "title": "Location & Connectivity",
      "subtitle": "",
      "address": "",
      "embedUrl": "",
      "items": [],
      "anchor": "location"
    }
  },
  {
    "type": "project-highlights",
    "label": "Location Advantages",
    "description": "Nearby highlights with icons",
    "category": "Real Estate",
    "variants": [
      "grid",
      "signature",
      "quote",
      "radial",
      "split-impact"
    ],
    "defaultProps": {
      "title": "Location advantages",
      "items": [
        {
          "title": "ITPL",
          "description": "8 minutes",
          "icon": ""
        }
      ]
    }
  },
  {
    "type": "features",
    "label": "Project Highlights",
    "description": "Why choose us / selling points",
    "category": "Real Estate",
    "variants": [
      "grid",
      "list",
      "alternating"
    ],
    "defaultProps": {
      "label": "Highlights",
      "title": "Project highlights",
      "items": [
        {
          "icon": "",
          "title": "RERA registered",
          "description": "Fully compliant development."
        }
      ]
    }
  },
  {
    "type": "re-pricing",
    "label": "Price",
    "description": "Starting prices and enquire",
    "category": "Real Estate",
    "variants": [
      "cards",
      "simple",
      "comparison",
      "banner"
    ],
    "defaultProps": {
      "title": "Pricing",
      "startingPrice": "₹ 1.42 Cr*",
      "items": [
        {
          "name": "2 BHK",
          "price": "₹ 1.42 Cr*",
          "meta": ""
        }
      ],
      "anchor": "pricing"
    }
  },
  {
    "type": "payment-plan",
    "label": "Payment Plan",
    "description": "Booking and construction linked payments",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Payment plan",
      "items": [
        {
          "title": "10%",
          "description": "On booking"
        },
        {
          "title": "40%",
          "description": "On agreement"
        },
        {
          "title": "50%",
          "description": "On possession"
        }
      ]
    }
  },
  {
    "type": "emi-calculator",
    "label": "EMI / Mortgage Calculator",
    "description": "Estimate monthly instalments",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "EMI calculator",
      "principal": 14200000,
      "rate": 8.4,
      "years": 20
    }
  },
  {
    "type": "developer",
    "label": "Builder / Developer",
    "description": "About the developer with stats or logo band",
    "category": "Real Estate",
    "variants": [
      "default",
      "split",
      "stats",
      "band"
    ],
    "defaultProps": {
      "title": "About the Developer",
      "name": "Your developer name",
      "body": "About the developer: track record, delivered projects and what sets them apart.",
      "image": "",
      "logo": "",
      "stats": [],
      "anchor": "builder"
    }
  },
  {
    "type": "team",
    "label": "Agent / Sales Team",
    "description": "Sales team with photos",
    "category": "Real Estate",
    "variants": [
      "grid"
    ],
    "defaultProps": {
      "title": "Sales team",
      "members": [
        {
          "name": "Relationship manager",
          "role": "Sales",
          "avatar": ""
        }
      ]
    }
  },
  {
    "type": "testimonials",
    "label": "Testimonials",
    "description": "Customer quotes",
    "category": "Real Estate",
    "variants": [
      "cards",
      "carousel",
      "spotlight",
      "band"
    ],
    "defaultProps": {
      "title": "What residents say",
      "items": [
        {
          "name": "Resident name",
          "role": "Homeowner",
          "quote": "Replace this with a real quote from a happy resident.",
          "avatar": "",
          "rating": "5"
        }
      ],
      "anchor": "testimonials"
    }
  },
  {
    "type": "faq",
    "label": "FAQ",
    "description": "Accordion Q&A",
    "category": "Real Estate",
    "variants": [
      "accordion"
    ],
    "defaultProps": {
      "title": "FAQs",
      "items": [
        {
          "question": "",
          "answer": ""
        }
      ]
    }
  },
  {
    "type": "cta",
    "label": "CTA / Enquiry Section",
    "description": "Closing headline and button",
    "category": "Real Estate",
    "variants": [
      "simple",
      "split",
      "booking"
    ],
    "defaultProps": {
      "headline": "Book a site visit",
      "subheadline": "",
      "buttonText": "Enquire Now",
      "buttonUrl": "#enquire"
    }
  },
  {
    "type": "download-brochure",
    "label": "Download Brochure",
    "description": "Brochure CTA with popup form",
    "category": "Real Estate",
    "variants": [
      "split",
      "card",
      "banner",
      "minimal"
    ],
    "defaultProps": {
      "title": "Download Brochure",
      "buttonText": "Download Brochure",
      "image": "",
      "pdfUrl": "",
      "formId": "",
      "popupId": "",
      "anchor": "brochure"
    }
  },
  {
    "type": "construction-status",
    "label": "Construction Status",
    "description": "Progress bars or delivery timeline",
    "category": "Real Estate",
    "variants": [
      "default",
      "timeline"
    ],
    "defaultProps": {
      "title": "Construction Status",
      "subtitle": "",
      "items": [
        {
          "label": "Foundation",
          "percent": "100",
          "year": "2026",
          "title": "Foundation",
          "description": ""
        }
      ],
      "anchor": "progress"
    }
  },
  {
    "type": "lead-form",
    "label": "Contact / Enquiry Form",
    "description": "Form Builder form on the page",
    "category": "Real Estate",
    "variants": [
      "card",
      "split",
      "inline",
      "default"
    ],
    "defaultProps": {
      "title": "Enquire now",
      "subtitle": "",
      "formId": "",
      "image": "",
      "anchor": "enquire"
    }
  },
  {
    "type": "site-visit",
    "label": "Site Visit Booking",
    "description": "Book a site visit with Form Builder",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Book a site visit",
      "subtitle": "",
      "formId": "",
      "anchor": "site-visit"
    }
  },
  {
    "type": "contact",
    "label": "Contact Form",
    "description": "Contact section with Form Builder form",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Get in Touch",
      "subtitle": "",
      "formId": "",
      "anchor": "contact"
    }
  },
  {
    "type": "newsletter",
    "label": "Newsletter Signup",
    "description": "Email / updates capture via Form Builder",
    "category": "Real Estate",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Stay in the loop",
      "subtitle": "Get updates on this project. No spam.",
      "formId": "",
      "anchor": "newsletter"
    }
  },
  {
    "type": "footer",
    "label": "Footer",
    "description": "Company info, links and legal",
    "category": "Core",
    "variants": [
      "multi-column",
      "simple",
      "minimal",
      "premium",
      "contact",
      "disclaimer"
    ],
    "defaultProps": {
      "logo": "Project",
      "logoImage": "",
      "copyright": "All rights reserved.",
      "links": [
        "Privacy Policy",
        "Terms"
      ]
    }
  },
  {
    "type": "accordion",
    "label": "Accordion / Toggle",
    "description": "Collapsible questions with optional nested accordions",
    "category": "Basic",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Frequently Asked Questions",
      "subtitle": "",
      "openFirst": true,
      "allowMultiple": false,
      "items": [
        {
          "title": "What is included?",
          "content": "Add the answer here.",
          "items": []
        },
        {
          "title": "How do I get started?",
          "content": "Add the answer here.",
          "items": []
        }
      ]
    }
  },
  {
    "type": "video-gallery",
    "label": "Video Gallery",
    "description": "Grid of videos with a lightbox player",
    "category": "Media",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Video Gallery",
      "subtitle": "",
      "columns": 3,
      "items": [
        {
          "title": "Project walkthrough",
          "url": "",
          "thumbnail": ""
        },
        {
          "title": "Neighbourhood tour",
          "url": "",
          "thumbnail": ""
        },
        {
          "title": "Sample apartment",
          "url": "",
          "thumbnail": ""
        }
      ]
    }
  },
  {
    "type": "image-comparison",
    "label": "Before / After Slider",
    "description": "Draggable image comparison slider",
    "category": "Media",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "title": "Before & After",
      "subtitle": "",
      "beforeImage": "",
      "afterImage": "",
      "beforeLabel": "Before",
      "afterLabel": "After",
      "startPercent": 50
    }
  },
  {
    "type": "social-share",
    "label": "Social Share",
    "description": "Share the page to social networks",
    "category": "Marketing",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "label": "Share",
      "url": "",
      "networks": [
        "facebook",
        "x",
        "linkedin",
        "whatsapp",
        "email"
      ],
      "showCopy": true
    }
  },
  {
    "type": "popup-trigger",
    "label": "Popup Trigger",
    "description": "Button that opens a popup message",
    "category": "Marketing",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "label": "Get in touch",
      "mode": "popup",
      "url": "",
      "popupTitle": "Get in touch",
      "popupContent": "Add your popup message in the Content tab.",
      "popupCtaLabel": "",
      "popupCtaUrl": "",
      "buttonColor": "#111827",
      "textColor": "#ffffff",
      "radius": 8
    }
  },
  {
    "type": "site-search",
    "label": "Site Search",
    "description": "Search form for the website",
    "category": "Header & Footer",
    "variants": [
      "default"
    ],
    "defaultProps": {
      "placeholder": "Search…",
      "buttonLabel": "Search",
      "targetPath": "/search",
      "queryParam": "q"
    }
  },
  {
    "type": "ipx-overview",
    "label": "Overview",
    "description": "About the project: feature cards, overview with image, story splits, green overview",
    "category": "Real Estate",
    "variants": [
      "burgundy-features",
      "eldeco-overview",
      "tarc-story",
      "tarc-wellness",
      "emerald-overview",
      "modern-overview"
    ],
    "defaultProps": {
      "anchor": "overview",
      "accentColor": "",
      "eyebrow": "The Project Difference",
      "title": "A Thing of Beauty.",
      "titleAccent": "A Joy Forever.",
      "subtitle": "Seven Towers, One Great View",
      "description": "Nestled amidst expansive green belts, the residences offer a rare lifestyle immersed in nature — with open skylines, sunlit homes and thoughtfully planned spaces for every generation.",
      "image": "",
      "imageCaption": "Artistic Impression",
      "imageSide": "left",
      "decorImage": "",
      "bgImage": "",
      "watermark": "Revitalizing\nthe Spirit",
      "stats": [
        {
          "value": "48",
          "label": "Acres"
        },
        {
          "value": "14",
          "label": "Towers"
        }
      ],
      "buttonText": "Enquire Now",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "items": [
        {
          "icon": "",
          "number": "",
          "title": "Riverside Living",
          "text": "Wake up to panoramic views from your private balcony."
        },
        {
          "icon": "",
          "number": "",
          "title": "Landmark Towers",
          "text": "Only four residences per floor for unmatched privacy."
        },
        {
          "icon": "",
          "number": "",
          "title": "VIP Club",
          "text": "Lounge, library, café, spa and an indoor games arena."
        },
        {
          "icon": "",
          "number": "",
          "title": "Rooftop Landscaping",
          "text": "An infinity pool and gardens overlooking the skyline."
        },
        {
          "icon": "",
          "number": "",
          "title": "White Glove Services",
          "text": "Concierge, chef on call and convenience shopping."
        },
        {
          "icon": "",
          "number": "",
          "title": "Prime Address",
          "text": "Malls, IT parks and the airport within minutes."
        }
      ]
    }
  },
  {
    "type": "ipx-highlights",
    "label": "Highlights",
    "description": "Offer ribbon, icon grid, compass, green offer band or key-highlights list",
    "category": "Real Estate",
    "variants": [
      "burgundy-offers",
      "eldeco-icons",
      "tarc-compass",
      "emerald-offer",
      "emerald-list",
      "modern-grid"
    ],
    "defaultProps": {
      "anchor": "highlights",
      "accentColor": "",
      "title": "Highlights",
      "subtitle": "Indulgence in the rare – crafted once, remembered always",
      "eyebrow": "Project Highlights",
      "titleAccent": "",
      "tabs": "Key Planning Features\nSpecifications",
      "tabLabel": "Apartment Design Highlights",
      "logo": "",
      "logoText": "EMERALD HEIGHTS",
      "offerText": "Free Club Membership +\nFree Fire Fighting Charges",
      "image": "",
      "image2": "",
      "bgImage": "",
      "planValue": "30:40:30",
      "planLabel": "Easy Payment Plan",
      "configText": "3 & 4 BHK",
      "configNote": "Luxury Apartments",
      "priceLabel": "Starts at",
      "price": "₹ 1.85 Cr*",
      "address": "Sector 150, Noida",
      "centerImage": "",
      "imageCaption": "Image for representation",
      "buttonText": "Know More",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "items": [
        {
          "icon": "",
          "title": "0 Maintenance",
          "text": "For 2 years",
          "category": ""
        },
        {
          "icon": "",
          "title": "No EMI",
          "text": "For 24 months*",
          "category": ""
        },
        {
          "icon": "",
          "title": "₹5 Lakhs",
          "text": "Worth white goods",
          "category": ""
        },
        {
          "icon": "",
          "title": "₹1 Lakh",
          "text": "Gold voucher",
          "category": ""
        }
      ],
      "directions": [
        {
          "image": "",
          "title": "The Beacon of Aspiration",
          "text": "North"
        },
        {
          "image": "",
          "title": "The Gateway to New Beginnings",
          "text": "East"
        },
        {
          "image": "",
          "title": "The Sanctuary of Serenity",
          "text": "South"
        },
        {
          "image": "",
          "title": "The Canvas of Sunset Dreams",
          "text": "West"
        }
      ]
    }
  },
  {
    "type": "ipx-amenities",
    "label": "Amenities",
    "description": "Amenity list cards, icon tiles, image carousel or green photo cards",
    "category": "Real Estate",
    "variants": [
      "burgundy-list",
      "eldeco-tiles",
      "tarc-carousel",
      "emerald-cards",
      "modern-pills"
    ],
    "defaultProps": {
      "anchor": "amenities",
      "accentColor": "",
      "eyebrow": "World-Class Living",
      "title": "Beyond Comfort,",
      "titleAccent": "Into Luxury",
      "subtitle": "Amenities that embody luxury, elevating every moment with serenity and sophistication.",
      "description": "From rooftop infinity pools to private theatres — every detail has been curated for those who accept nothing less than the finest.",
      "highlightFirst": true,
      "imageCaption": "Artistic impression",
      "bgImage": "",
      "autoplay": false,
      "interval": 5000,
      "buttonText": "View All Amenities",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "items": [
        {
          "image": "",
          "icon": "",
          "category": "Wellness & Fitness",
          "title": "Infinity Pool",
          "text": "Rooftop infinity pool with panoramic views",
          "highlight": false
        },
        {
          "image": "",
          "icon": "",
          "category": "Wellness & Fitness",
          "title": "Yoga Studio",
          "text": "A dedicated studio for movement and mindfulness",
          "highlight": false
        },
        {
          "image": "",
          "icon": "",
          "category": "VIP Club",
          "title": "Lounge & Library",
          "text": "A curated space for quiet leisure",
          "highlight": false
        },
        {
          "image": "",
          "icon": "",
          "category": "Entertainment",
          "title": "Private Theatre",
          "text": "Cinematic experiences within your community",
          "highlight": false
        },
        {
          "image": "",
          "icon": "",
          "category": "Family & Recreation",
          "title": "Kids Play Area",
          "text": "Joy for every family member",
          "highlight": false
        },
        {
          "image": "",
          "icon": "",
          "category": "Sports",
          "title": "Multipurpose Court",
          "text": "Basketball, badminton and more",
          "highlight": false
        }
      ]
    }
  },
  {
    "type": "ipx-pricing",
    "label": "Pricing",
    "description": "Unit cards with features, simple price cards or green price rows",
    "category": "Real Estate",
    "variants": [
      "burgundy-cards",
      "eldeco-cards",
      "emerald-rows"
    ],
    "defaultProps": {
      "anchor": "pricing",
      "accentColor": "",
      "eyebrow": "Residences",
      "title": "Choose Your",
      "titleAccent": "Canvas of Life",
      "subtitle": "",
      "description": "Distinct configurations — each a masterclass in space, light and luxury living. All priced on carpet area, all RERA-compliant.",
      "priceLabel": "Starting Price",
      "typologyLabel": "Typology",
      "sizeLabel": "Size",
      "bgImage": "",
      "note": "* All areas as per RERA norms. Dimensions indicative.",
      "cardButtonText": "Get Price for This Unit",
      "cardButtonUrl": "",
      "cardButtonTarget": "_self",
      "cardButtonAnchor": "enquire",
      "units": [
        {
          "badge": "Pinnacle",
          "title": "3 BHK Residence",
          "area": "Carpet: 1,504 sq.ft.",
          "price": "₹ 2.4 Cr*",
          "features": "Living + Dining: 24'6\" × 13'6\"\nMaster Bedroom: 15'3\" × 11'3\"\nLarge Open Balcony\nModular Kitchen + Dry Balcony",
          "highlight": false
        },
        {
          "badge": "Most Popular",
          "title": "4 BHK Residence",
          "area": "Carpet: 2,087 sq.ft.",
          "price": "₹ 3.9 Cr*",
          "features": "Living + Dining: 26'0\" × 14'0\"\nMaster Bedroom: 16'0\" × 12'0\"\nWraparound Balcony\nModular Kitchen + Dry Balcony",
          "highlight": true
        }
      ]
    }
  },
  {
    "type": "ipx-floorplans",
    "label": "Floor Plans",
    "description": "Tabbed floor plans, plan with areas and price, or green plan tabs",
    "category": "Real Estate",
    "variants": [
      "burgundy-tabs",
      "tarc-details",
      "emerald-tabs",
      "modern-cards"
    ],
    "defaultProps": {
      "anchor": "plans",
      "accentColor": "",
      "eyebrow": "Floor Plans",
      "title": "Every Room,",
      "titleAccent": "Perfectly Planned",
      "subtitle": "Where every square foot speaks of thoughtful elegance.",
      "description": "Meticulously designed layouts that balance privacy, flow and luxury — each square foot purposefully crafted.",
      "priceLabel": "Starting Price",
      "decorImage": "",
      "buttonText": "View All",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "plans": [
        {
          "title": "3 BHK",
          "image": "",
          "price": "₹ 2.4 Cr*",
          "specs": "Carpet Area | 140 sq.m. / 1,504 sq.ft. (Approx.)\nTotal Balcony Area | 18 sq.m. / 195 sq.ft. (Approx.)\n1 Sq M - 10.764 Sq Ft",
          "text": "Spacious family residences with generous living areas and thoughtfully planned private spaces."
        },
        {
          "title": "4 BHK",
          "image": "",
          "price": "₹ 3.9 Cr*",
          "specs": "Carpet Area | 194 sq.m. / 2,087 sq.ft. (Approx.)\nTotal Balcony Area | 26 sq.m. / 280 sq.ft. (Approx.)\n1 Sq M - 10.764 Sq Ft",
          "text": "Larger residences for families seeking additional space, comfort and an elevated lifestyle."
        }
      ]
    }
  },
  {
    "type": "ipx-masterplan",
    "label": "Master / Site Plan",
    "description": "Full-width site plan or framed master plan",
    "category": "Real Estate",
    "variants": [
      "eldeco-site",
      "tarc-master",
      "modern-plan"
    ],
    "defaultProps": {
      "anchor": "master-plan",
      "accentColor": "",
      "title": "Master Plan",
      "subtitle": "An inspired blueprint for the life you have always envisioned.",
      "image": "",
      "imageCaption": "Map is not to scale. The developer reserves all rights to add, remove or change any amenity or specification.",
      "eyebrow": "Master Plan",
      "titleAccent": "",
      "buttonText": "View All",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire"
    }
  },
  {
    "type": "ipx-specs",
    "label": "Specifications",
    "description": "Two-column project specifications with gold titles",
    "category": "Real Estate",
    "variants": [
      "emerald-specs"
    ],
    "defaultProps": {
      "anchor": "specifications",
      "accentColor": "",
      "title": "Project Specifications",
      "description": "",
      "bgImage": "",
      "bgDarkness": "",
      "buttonText": "Read More",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "items": [
        {
          "title": "Kitchen",
          "text": "Individual RO water unit"
        },
        {
          "title": "External Wall",
          "text": "Texture paint"
        },
        {
          "title": "Doors & Windows",
          "text": "Laminated flush door shutters"
        },
        {
          "title": "Railings",
          "text": "MS / glass railing in balconies"
        },
        {
          "title": "Floor to Floor Height",
          "text": "3.30 m (11'-0\")"
        },
        {
          "title": "Toilets",
          "text": "Ceramic sanitary ware, wall tiles"
        },
        {
          "title": "Structure",
          "text": "Earthquake-resistant frame structure"
        },
        {
          "title": "Electrical",
          "text": "Modular switches, ISI-mark wiring"
        }
      ]
    }
  },
  {
    "type": "ipx-gallery",
    "label": "Gallery",
    "description": "Tabbed carousel, tabbed grid, visual-journey slider or two-row photo slider",
    "category": "Real Estate",
    "variants": [
      "burgundy-carousel",
      "eldeco-grid",
      "tarc-journey",
      "emerald-rows",
      "modern-tabs",
      "modern-bento"
    ],
    "defaultProps": {
      "anchor": "gallery",
      "accentColor": "",
      "eyebrow": "Project Gallery",
      "title": "Life at",
      "titleAccent": "The Residences",
      "subtitle": "Step into a world where every frame captures the essence of beauty and innovation",
      "description": "A curated glimpse into riverside vistas, grand lobbies and rooftop serenity.",
      "imageCaption": "Artistic Impression",
      "decorImage": "",
      "autoplay": false,
      "interval": 5000,
      "buttonText": "Get Exclusive Brochure",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "images": [
        {
          "src": "",
          "category": "Exterior",
          "caption": "",
          "alt": ""
        },
        {
          "src": "",
          "category": "Exterior",
          "caption": "",
          "alt": ""
        },
        {
          "src": "",
          "category": "Exterior",
          "caption": "",
          "alt": ""
        },
        {
          "src": "",
          "category": "Exterior",
          "caption": "",
          "alt": ""
        },
        {
          "src": "",
          "category": "Interior",
          "caption": "",
          "alt": ""
        },
        {
          "src": "",
          "category": "Interior",
          "caption": "",
          "alt": ""
        },
        {
          "src": "",
          "category": "Interior",
          "caption": "",
          "alt": ""
        },
        {
          "src": "",
          "category": "Interior",
          "caption": "",
          "alt": ""
        }
      ]
    }
  },
  {
    "type": "ipx-location",
    "label": "Location / Map",
    "description": "Map with nearby places and distances",
    "category": "Real Estate",
    "variants": [
      "burgundy-map",
      "eldeco-map",
      "tarc-map",
      "emerald-map",
      "modern-list"
    ],
    "defaultProps": {
      "anchor": "location",
      "accentColor": "",
      "eyebrow": "Location",
      "title": "Location Advantages",
      "titleAccent": "An Address That Connects",
      "subtitle": "A prime address, where opportunities and prestige converge.",
      "description": "",
      "address": "Sector 150, Noida",
      "mapImage": "",
      "mapEmbed": "",
      "buttonText": "Know More",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "places": [
        {
          "icon": "",
          "title": "City Hospital",
          "value": "4.0 Km"
        },
        {
          "icon": "",
          "title": "Five-star Hotel",
          "value": "4.5 Km"
        },
        {
          "icon": "",
          "title": "Metro Station",
          "value": "6.0 Km"
        },
        {
          "icon": "",
          "title": "Expressway",
          "value": "7.0 Km"
        },
        {
          "icon": "",
          "title": "International School",
          "value": "8.0 Km"
        },
        {
          "icon": "",
          "title": "Cricket Stadium",
          "value": "17.3 Km"
        },
        {
          "icon": "",
          "title": "Shopping Mall",
          "value": "12.0 Km"
        },
        {
          "icon": "",
          "title": "International Airport",
          "value": "40.0 Km"
        }
      ]
    }
  },
  {
    "type": "ipx-about",
    "label": "About Developer",
    "description": "Developer stats, full-image about banner or green about with mission & vision",
    "category": "Real Estate",
    "variants": [
      "burgundy-stats",
      "eldeco-stats",
      "tarc-banner",
      "emerald-about"
    ],
    "defaultProps": {
      "anchor": "about",
      "accentColor": "",
      "eyebrow": "The Developer",
      "title": "About the Developer",
      "titleAccent": "",
      "subtitle": "Sculpting the future of luxury living, inspired by legacy",
      "description": "Homes crafted with quality, delivered on time and built to last for generations. The group has delivered landmark projects across the country with thousands of satisfied families.",
      "logo": "",
      "logoText": "BRAND",
      "brandColor": "",
      "image": "",
      "bgDarkness": "",
      "imageCaption": "Artistic impression",
      "missionTitle": "Mission",
      "missionText": "To create exceptional living spaces that combine innovative architecture, uncompromising quality and community-centric planning.",
      "visionTitle": "Vision",
      "visionText": "To go beyond construction by building sustainable communities that inspire better living for generations.",
      "buttonText": "Know More",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "stats": [
        {
          "value": "19",
          "label": "Years in Real Estate"
        },
        {
          "value": "70L",
          "label": "Sq.Ft. Delivered"
        },
        {
          "value": "26",
          "label": "Projects Completed"
        },
        {
          "value": "12",
          "label": "Ongoing Projects"
        },
        {
          "value": "500+",
          "label": "Acres Land Bank"
        },
        {
          "value": "50+",
          "label": "Industry Awards"
        }
      ]
    }
  },
  {
    "type": "ipx-cta",
    "label": "CTA / Banner",
    "description": "Call-to-action, full-image banner or virtual tour",
    "category": "Real Estate",
    "variants": [
      "burgundy-cta",
      "tarc-club",
      "tarc-tour",
      "modern-banner"
    ],
    "defaultProps": {
      "anchor": "",
      "accentColor": "",
      "eyebrow": "The Time Is Now",
      "title": "Claim Your",
      "titleAccent": "Dream Residence",
      "subtitle": "Enjoy a seamless, guided virtual site tour showcasing every detail of the project from anywhere.",
      "description": "Pre-launch units are moving fast. Speak to our consultant today and secure your preferred floor and view before they are gone.",
      "image": "",
      "decorImage": "",
      "imageCaption": "Artistic impression",
      "buttonText": "Book Private Preview",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "secondText": "Schedule a site visit",
      "secondUrl": "",
      "secondTarget": "_self",
      "secondAnchor": "enquire",
      "note": "48 Acres · 14 Towers · 3,484 Residences · 60+ Amenities"
    }
  },
  {
    "type": "ipx-form",
    "label": "Enquiry Form",
    "description": "Section layout around a Form Builder form",
    "category": "Real Estate",
    "variants": [
      "burgundy-split",
      "eldeco-bar",
      "tarc-quote",
      "emerald-form",
      "modern-split"
    ],
    "defaultProps": {
      "anchor": "enquire",
      "accentColor": "",
      "eyebrow": "Limited Inventory",
      "title": "Get Your Quote",
      "titleAccent": "",
      "description": "Register now to receive your exclusive invitation to the private preview, detailed pricing and floor plans.",
      "bullets": "Receive exclusive pre-launch pricing & floor plans instantly\nSchedule a private site visit with a dedicated relationship manager\nGet a complete cost breakdown: base price, stamp duty, registration\nRERA-registered project — complete legal peace of mind",
      "formTitle": "Request Exclusive Details",
      "formSubtitle": "Response guaranteed within 60 minutes",
      "formId": "",
      "imageLabel": "The Residences\nSector 150, Noida",
      "bgImage": "",
      "formNote": "By submitting, you agree to be contacted regarding this project. Your information is confidential and will not be shared with third parties.",
      "image": ""
    }
  },
  {
    "type": "ipx-footer",
    "label": "Footer",
    "description": "RERA QR footer, disclaimer band, RERA disclaimer footer or green RERA footer",
    "category": "Real Estate",
    "variants": [
      "burgundy-footer",
      "eldeco-footer",
      "tarc-footer",
      "emerald-footer",
      "modern-columns"
    ],
    "defaultProps": {
      "anchor": "",
      "accentColor": "",
      "title": "RERA NO. XX/XXX/0000/00",
      "title2": "Project RERA NO. XXXXXXXX/00/0000",
      "readMoreText": "Read more",
      "address": "Sector 150, Noida, Uttar Pradesh",
      "website": "www.example.com",
      "disclaimer": "Disclaimer – The content and visuals are an artistic rendering for illustrative purposes only and do not constitute a legal offer. All details are indicative and subject to change without notice. Purchasers are advised to verify all details independently before making any decision.",
      "linkText": "Disclaimer & Privacy Policy",
      "linkUrl": "",
      "credit": "Copyright © 2026. All Rights Reserved",
      "bandColor": "",
      "columns": [
        {
          "title": "Contact",
          "links": "+91 90000 00000 | tel:+919000000000\n# About Us\nOur Story\nCareers"
        },
        {
          "title": "Residences",
          "links": "1 BHK\n2 BHK\n3 BHK\n4 BHK"
        },
        {
          "title": "Explore",
          "links": "Overview | #overview\nAmenities | #amenities\nLocation | #location\nGallery | #gallery"
        },
        {
          "title": "Connect",
          "links": "Instagram\nFacebook\nLinkedIn\nYouTube"
        }
      ],
      "bottomLinks": "Disclaimer\nPrivacy Policy\nTerms of Use",
      "callText": "Call Now",
      "phone": "+91 90000 00000",
      "buttonText": "Get Brochure",
      "buttonUrl": "",
      "buttonTarget": "_self",
      "buttonAnchor": "enquire",
      "qrCodes": [
        {
          "image": "",
          "title": "Phase 1",
          "text": "Scan To Verify\nRERA No."
        },
        {
          "image": "",
          "title": "Phase 2",
          "text": "Scan To Verify\nRERA No."
        }
      ]
    }
  }
];
