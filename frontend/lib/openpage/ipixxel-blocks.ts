/**
 * iPixxel Realty section widgets (Blocks panel → "iPixxel Realty").
 *
 * One widget per section type; its Template dropdown holds that section from
 * each design family (burgundy / eldeco / tarc / emerald / modern). Everything the builder needs
 * — Blocks-panel metadata, default content, inspector fields and list-item
 * fields — lives here so the core editor files only spread these in.
 *
 * Sample text is deliberately generic (no real developer or project names).
 */
import type { ItemFieldDef } from "@/components/openpage/editor/field-helpers";

type FieldType = "text" | "textarea" | "select" | "image" | "icon" | "form-select" | "toggle" | "number" | "color" | "array-items";
export interface IpxField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}
export interface IpxSection {
  title: string;
  fields: IpxField[];
}

export interface IpxWidget {
  type: string;
  /** Blocks-panel tile label. */
  label: string;
  description: string;
  variants: string[];
  defaultProps: Record<string, unknown>;
  sections: IpxSection[];
  /** List editors: list prop → item fields. */
  itemFields: Record<string, ItemFieldDef[]>;
  /** Blank item used by "Add item". */
  itemTemplates: Record<string, Record<string, unknown>>;
}

/** Button text / link / colours stored under one prefix (matches CtaButton). */
function buttonFields(prefix: string, label: string, textKey = `${prefix}Text`): IpxField[] {
  return [
    { key: textKey, label: `${label} text (empty hides it)`, type: "text" },
    { key: `${prefix}Url`, label: `${label} URL`, type: "text" },
    { key: `${prefix}Target`, label: `${label} link target`, type: "select", options: ["_self", "_blank"] },
    { key: `${prefix}Anchor`, label: `${label} scrolls to section ID (when no URL)`, type: "text" },
    { key: `${prefix}Color`, label: `${label} background`, type: "color" },
    { key: `${prefix}TextColor`, label: `${label} text colour`, type: "color" },
    { key: `${prefix}HoverColor`, label: `${label} hover background`, type: "color" },
    { key: `${prefix}HoverTextColor`, label: `${label} hover text`, type: "color" },
    { key: `${prefix}BorderColor`, label: `${label} border`, type: "color" },
    { key: `${prefix}Radius`, label: `${label} radius (px)`, type: "number" },
  ];
}

function layout(variants: string[]): IpxSection {
  return {
    title: "Layout",
    fields: [
      { key: "variant", label: "Template", type: "select", options: variants },
      { key: "accentColor", label: "Accent colour (empty = template colour)", type: "color" },
    ],
  };
}

const anchor: IpxField = { key: "anchor", label: "Section ID (menu scroll)", type: "text" };
const buttonDefaults = (text: string, prefix = "button", textKey = `${prefix}Text`) => ({
  [textKey]: text,
  [`${prefix}Url`]: "",
  [`${prefix}Target`]: "_self",
  [`${prefix}Anchor`]: "enquire",
});

/* ------------------------------------------------------------------------- */

const OVERVIEW: IpxWidget = {
  type: "ipx-overview",
  label: "Overview",
  description: "About the project: feature cards, overview with image, story splits, green overview",
  variants: ["burgundy-features", "eldeco-overview", "tarc-story", "tarc-wellness", "emerald-overview", "modern-overview"],
  defaultProps: {
    anchor: "overview",
    accentColor: "",
    eyebrow: "The Project Difference",
    title: "A Thing of Beauty.",
    titleAccent: "A Joy Forever.",
    subtitle: "Seven Towers, One Great View",
    description:
      "Nestled amidst expansive green belts, the residences offer a rare lifestyle immersed in nature — with open skylines, sunlit homes and thoughtfully planned spaces for every generation.",
    image: "",
    imageCaption: "Artistic Impression",
    imageSide: "left",
    decorImage: "",
    watermark: "Revitalizing\nthe Spirit",
    stats: [
      { value: "48", label: "Acres" },
      { value: "14", label: "Towers" },
    ],
    ...buttonDefaults("Enquire Now"),
    items: [
      { icon: "", number: "", title: "Riverside Living", text: "Wake up to panoramic views from your private balcony." },
      { icon: "", number: "", title: "Landmark Towers", text: "Only four residences per floor for unmatched privacy." },
      { icon: "", number: "", title: "VIP Club", text: "Lounge, library, café, spa and an indoor games arena." },
      { icon: "", number: "", title: "Rooftop Landscaping", text: "An infinity pool and gardens overlooking the skyline." },
      { icon: "", number: "", title: "White Glove Services", text: "Concierge, chef on call and convenience shopping." },
      { icon: "", number: "", title: "Prime Address", text: "Malls, IT parks and the airport within minutes." },
    ],
  },
  sections: [
    layout(["burgundy-features", "eldeco-overview", "tarc-story", "tarc-wellness", "emerald-overview", "modern-overview"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "text" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "image", label: "Image", type: "image" },
        { key: "imageCaption", label: "Image caption (e.g. Artistic Impression)", type: "text" },
        { key: "imageSide", label: "Image side (story template)", type: "select", options: ["left", "right"] },
        { key: "decorImage", label: "Decorative motif image (story template)", type: "image" },
        { key: "watermark", label: "Big faded text (wellness template)", type: "textarea" },
        { key: "stats", label: "Stats card (modern template)", type: "array-items" },
        anchor,
      ],
    },
    { title: "Feature cards", fields: [{ key: "items", label: "Cards", type: "array-items" }] },
    { title: "Button", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    items: [
      { key: "icon", label: "Icon (upload / SVG URL)", kind: "icon" },
      { key: "number", label: "Number (empty = 01, 02…)", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Text", kind: "textarea", rows: 3 },
    ],
    stats: [
      { key: "value", label: "Number", kind: "text" },
      { key: "label", label: "Label", kind: "text" },
    ],
  },
  itemTemplates: { items: { icon: "", number: "", title: "", text: "" }, stats: { value: "", label: "" } },
};

const HIGHLIGHTS: IpxWidget = {
  type: "ipx-highlights",
  label: "Highlights",
  description: "Offer ribbon, icon grid, compass, green offer band or key-highlights list",
  variants: ["burgundy-offers", "eldeco-icons", "tarc-compass", "emerald-offer", "emerald-list", "modern-grid"],
  defaultProps: {
    anchor: "highlights",
    accentColor: "",
    title: "Highlights",
    subtitle: "Indulgence in the rare – crafted once, remembered always",
    eyebrow: "Project Highlights",
    titleAccent: "",
    tabs: "Key Planning Features\nSpecifications",
    tabLabel: "Apartment Design Highlights",
    logo: "",
    logoText: "EMERALD HEIGHTS",
    offerText: "Free Club Membership +\nFree Fire Fighting Charges",
    image: "",
    image2: "",
    planValue: "30:40:30",
    planLabel: "Easy Payment Plan",
    configText: "3 & 4 BHK",
    configNote: "Luxury Apartments",
    priceLabel: "Starts at",
    price: "₹ 1.85 Cr*",
    address: "Sector 150, Noida",
    centerImage: "",
    imageCaption: "Image for representation",
    ...buttonDefaults("Know More"),
    items: [
      { icon: "", title: "0 Maintenance", text: "For 2 years", category: "" },
      { icon: "", title: "No EMI", text: "For 24 months*", category: "" },
      { icon: "", title: "₹5 Lakhs", text: "Worth white goods", category: "" },
      { icon: "", title: "₹1 Lakh", text: "Gold voucher", category: "" },
    ],
    directions: [
      { image: "", title: "The Beacon of Aspiration", text: "North" },
      { image: "", title: "The Gateway to New Beginnings", text: "East" },
      { image: "", title: "The Sanctuary of Serenity", text: "South" },
      { image: "", title: "The Canvas of Sunset Dreams", text: "West" },
    ],
  },
  sections: [
    layout(["burgundy-offers", "eldeco-icons", "tarc-compass", "emerald-offer", "emerald-list", "modern-grid"]),
    {
      title: "Content",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "eyebrow", label: "Small label above the title (modern grid)", type: "text" },
        { key: "titleAccent", label: "Title second line (modern grid)", type: "text" },
        { key: "tabs", label: "Tab buttons, one per line (icon grid)", type: "textarea" },
        { key: "tabLabel", label: "Boxed label above the icons (icon grid)", type: "text" },
        { key: "items", label: "Highlights", type: "array-items" },
        anchor,
      ],
    },
    {
      title: "Compass (four directions)",
      fields: [
        { key: "centerImage", label: "Centre emblem image", type: "image" },
        { key: "imageCaption", label: "Photo caption", type: "text" },
        { key: "directions", label: "Directions (North, East, South, West)", type: "array-items" },
      ],
    },
    {
      title: "Offer band (emerald)",
      fields: [
        { key: "logo", label: "Logo image", type: "image" },
        { key: "logoText", label: "Logo text (when no logo image)", type: "text" },
        { key: "offerText", label: "Offer text", type: "textarea" },
        { key: "image", label: "Oval photo (offer band) / left photo (key highlights)", type: "image" },
        { key: "image2", label: "Right photo (key highlights)", type: "image" },
        { key: "planValue", label: "Payment plan value", type: "text" },
        { key: "planLabel", label: "Payment plan label", type: "text" },
        { key: "configText", label: "Configuration", type: "text" },
        { key: "configNote", label: "Configuration note", type: "text" },
        { key: "priceLabel", label: "Price label", type: "text" },
        { key: "price", label: "Price", type: "text" },
        { key: "address", label: "Location line", type: "text" },
      ],
    },
    { title: "Button (icon grid / key highlights)", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    items: [
      { key: "icon", label: "Icon (upload / SVG URL)", kind: "icon" },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Second line (offer ribbon)", kind: "text" },
      { key: "category", label: "Tab name (icon grid; empty = every tab)", kind: "text" },
    ],
    directions: [
      { key: "image", label: "Photo", kind: "image" },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Direction word", kind: "text" },
    ],
  },
  itemTemplates: { items: { icon: "", title: "", text: "", category: "" }, directions: { image: "", title: "", text: "" } },
};

const AMENITIES: IpxWidget = {
  type: "ipx-amenities",
  label: "Amenities",
  description: "Amenity list cards, icon tiles, image carousel or green photo cards",
  variants: ["burgundy-list", "eldeco-tiles", "tarc-carousel", "emerald-cards", "modern-pills"],
  defaultProps: {
    anchor: "amenities",
    accentColor: "",
    eyebrow: "World-Class Living",
    title: "Beyond Comfort,",
    titleAccent: "Into Luxury",
    subtitle: "Amenities that embody luxury, elevating every moment with serenity and sophistication.",
    description: "From rooftop infinity pools to private theatres — every detail has been curated for those who accept nothing less than the finest.",
    highlightFirst: true,
    imageCaption: "Artistic impression",
    bgImage: "",
    autoplay: false,
    interval: 5000,
    ...buttonDefaults("View All Amenities"),
    items: [
      { image: "", icon: "", category: "Wellness & Fitness", title: "Infinity Pool", text: "Rooftop infinity pool with panoramic views", highlight: false },
      { image: "", icon: "", category: "Wellness & Fitness", title: "Yoga Studio", text: "A dedicated studio for movement and mindfulness", highlight: false },
      { image: "", icon: "", category: "VIP Club", title: "Lounge & Library", text: "A curated space for quiet leisure", highlight: false },
      { image: "", icon: "", category: "Entertainment", title: "Private Theatre", text: "Cinematic experiences within your community", highlight: false },
      { image: "", icon: "", category: "Family & Recreation", title: "Kids Play Area", text: "Joy for every family member", highlight: false },
      { image: "", icon: "", category: "Sports", title: "Multipurpose Court", text: "Basketball, badminton and more", highlight: false },
    ],
  },
  sections: [
    layout(["burgundy-list", "eldeco-tiles", "tarc-carousel", "emerald-cards", "modern-pills"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "text" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "items", label: "Amenities", type: "array-items" },
        { key: "highlightFirst", label: "Highlight the first tile (icon tiles)", type: "toggle" },
        { key: "bgImage", label: "Background image (emerald template)", type: "image" },
        { key: "imageCaption", label: "Photo caption (carousel)", type: "text" },
        { key: "autoplay", label: "Autoplay (carousel / photo cards)", type: "toggle" },
        { key: "interval", label: "Autoplay interval (ms)", type: "number" },
        anchor,
      ],
    },
    { title: "Button (icon tiles / photo cards)", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    items: [
      { key: "image", label: "Photo (list / carousel / photo cards)", kind: "image" },
      { key: "icon", label: "Icon (tiles / photo cards)", kind: "icon" },
      { key: "category", label: "Category (list)", kind: "text" },
      { key: "title", label: "Name", kind: "text" },
      { key: "text", label: "Description (list)", kind: "textarea", rows: 2 },
      { key: "highlight", label: "Highlight this tile", kind: "toggle" },
    ],
  },
  itemTemplates: { items: { image: "", icon: "", category: "", title: "", text: "", highlight: false } },
};

const GALLERY: IpxWidget = {
  type: "ipx-gallery",
  label: "Gallery",
  description: "Tabbed carousel, tabbed grid, visual-journey slider or two-row photo slider",
  variants: ["burgundy-carousel", "eldeco-grid", "tarc-journey", "emerald-rows", "modern-tabs", "modern-bento"],
  defaultProps: {
    anchor: "gallery",
    accentColor: "",
    eyebrow: "Project Gallery",
    title: "Life at",
    titleAccent: "The Residences",
    subtitle: "Step into a world where every frame captures the essence of beauty and innovation",
    description: "A curated glimpse into riverside vistas, grand lobbies and rooftop serenity.",
    imageCaption: "Artistic Impression",
    decorImage: "",
    autoplay: false,
    interval: 5000,
    ...buttonDefaults("Get Exclusive Brochure"),
    images: [
      { src: "", category: "Exterior", caption: "", alt: "" },
      { src: "", category: "Exterior", caption: "", alt: "" },
      { src: "", category: "Exterior", caption: "", alt: "" },
      { src: "", category: "Exterior", caption: "", alt: "" },
      { src: "", category: "Interior", caption: "", alt: "" },
      { src: "", category: "Interior", caption: "", alt: "" },
      { src: "", category: "Interior", caption: "", alt: "" },
      { src: "", category: "Interior", caption: "", alt: "" },
    ],
  },
  sections: [
    layout(["burgundy-carousel", "eldeco-grid", "tarc-journey", "emerald-rows", "modern-tabs", "modern-bento"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "text" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "images", label: "Images (Tab = Exterior / Interior …)", type: "array-items" },
        { key: "imageCaption", label: "Default photo caption", type: "text" },
        { key: "decorImage", label: "Decorative motif (visual journey)", type: "image" },
        { key: "autoplay", label: "Autoplay (visual journey / two-row slider)", type: "toggle" },
        { key: "interval", label: "Autoplay interval (ms)", type: "number" },
        anchor,
      ],
    },
    { title: "Button (two-row slider)", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    images: [
      { key: "src", label: "Image", kind: "image" },
      { key: "category", label: "Tab (e.g. Exterior; empty = every tab)", kind: "text" },
      { key: "caption", label: "Caption (empty = default)", kind: "text" },
      { key: "alt", label: "Alt text", kind: "text" },
      { key: "text", label: "Description (landscape tabs)", kind: "textarea", rows: 2 },
    ],
  },
  itemTemplates: { images: { src: "", category: "", caption: "", alt: "", text: "" } },
};

const MASTERPLAN: IpxWidget = {
  type: "ipx-masterplan",
  label: "Master / Site Plan",
  description: "Full-width site plan or framed master plan",
  variants: ["eldeco-site", "tarc-master", "modern-plan"],
  defaultProps: {
    anchor: "master-plan",
    accentColor: "",
    title: "Master Plan",
    subtitle: "An inspired blueprint for the life you have always envisioned.",
    image: "",
    imageCaption: "Map is not to scale. The developer reserves all rights to add, remove or change any amenity or specification.",
    eyebrow: "Master Plan",
    titleAccent: "",
    showCompass: true,
    ...buttonDefaults("View All"),
  },
  sections: [
    layout(["eldeco-site", "tarc-master", "modern-plan"]),
    {
      title: "Content",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "image", label: "Plan image", type: "image" },
        { key: "imageCaption", label: "Caption over the plan (master plan)", type: "textarea" },
        { key: "eyebrow", label: "Small label above the title (modern)", type: "text" },
        { key: "titleAccent", label: "Title second line (modern)", type: "text" },
        { key: "showCompass", label: "Show north compass (modern)", type: "toggle" },
        anchor,
      ],
    },
    { title: "Button", fields: buttonFields("button", "Button") },
  ],
  itemFields: {},
  itemTemplates: {},
};

const FLOORPLANS: IpxWidget = {
  type: "ipx-floorplans",
  label: "Floor Plans",
  description: "Tabbed floor plans, plan with areas and price, or green plan tabs",
  variants: ["burgundy-tabs", "tarc-details", "emerald-tabs", "modern-cards"],
  defaultProps: {
    anchor: "plans",
    accentColor: "",
    eyebrow: "Floor Plans",
    title: "Every Room,",
    titleAccent: "Perfectly Planned",
    subtitle: "Where every square foot speaks of thoughtful elegance.",
    description: "Meticulously designed layouts that balance privacy, flow and luxury — each square foot purposefully crafted.",
    priceLabel: "Starting Price",
    decorImage: "",
    ...buttonDefaults("View All"),
    plans: [
      {
        title: "3 BHK",
        image: "",
        price: "₹ 2.4 Cr*",
        specs: "Carpet Area | 140 sq.m. / 1,504 sq.ft. (Approx.)\nTotal Balcony Area | 18 sq.m. / 195 sq.ft. (Approx.)\n1 Sq M - 10.764 Sq Ft",
        text: "Spacious family residences with generous living areas and thoughtfully planned private spaces.",
      },
      {
        title: "4 BHK",
        image: "",
        price: "₹ 3.9 Cr*",
        specs: "Carpet Area | 194 sq.m. / 2,087 sq.ft. (Approx.)\nTotal Balcony Area | 26 sq.m. / 280 sq.ft. (Approx.)\n1 Sq M - 10.764 Sq Ft",
        text: "Larger residences for families seeking additional space, comfort and an elevated lifestyle.",
      },
    ],
  },
  sections: [
    layout(["burgundy-tabs", "tarc-details", "emerald-tabs", "modern-cards"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "text" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "plans", label: "Plans (one tab each)", type: "array-items" },
        { key: "priceLabel", label: "Price label", type: "text" },
        { key: "decorImage", label: "Decorative motif (details template)", type: "image" },
        anchor,
      ],
    },
    { title: "Button (details / green tabs)", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    plans: [
      { key: "title", label: "Name (tab)", kind: "text" },
      { key: "image", label: "Plan image", kind: "image" },
      { key: "price", label: "Starting price", kind: "text" },
      { key: "specs", label: "Areas, one per line: Label | Value", kind: "textarea", rows: 4 },
      { key: "text", label: "Short description (modern cards)", kind: "textarea", rows: 3 },
    ],
  },
  itemTemplates: { plans: { title: "", image: "", price: "", specs: "", text: "" } },
};

const PRICING: IpxWidget = {
  type: "ipx-pricing",
  label: "Pricing",
  description: "Unit cards with features, simple price cards or green price rows",
  variants: ["burgundy-cards", "eldeco-cards", "emerald-rows"],
  defaultProps: {
    anchor: "pricing",
    accentColor: "",
    eyebrow: "Residences",
    title: "Choose Your",
    titleAccent: "Canvas of Life",
    subtitle: "",
    description: "Distinct configurations — each a masterclass in space, light and luxury living. All priced on carpet area, all RERA-compliant.",
    priceLabel: "Starting Price",
    typologyLabel: "Typology",
    sizeLabel: "Size",
    bgImage: "",
    note: "* All areas as per RERA norms. Dimensions indicative.",
    ...buttonDefaults("Get Price for This Unit", "cardButton", "cardButtonText"),
    units: [
      {
        badge: "Pinnacle",
        title: "3 BHK Residence",
        area: "Carpet: 1,504 sq.ft.",
        price: "₹ 2.4 Cr*",
        features: "Living + Dining: 24'6\" × 13'6\"\nMaster Bedroom: 15'3\" × 11'3\"\nLarge Open Balcony\nModular Kitchen + Dry Balcony",
        highlight: false,
      },
      {
        badge: "Most Popular",
        title: "4 BHK Residence",
        area: "Carpet: 2,087 sq.ft.",
        price: "₹ 3.9 Cr*",
        features: "Living + Dining: 26'0\" × 14'0\"\nMaster Bedroom: 16'0\" × 12'0\"\nWraparound Balcony\nModular Kitchen + Dry Balcony",
        highlight: true,
      },
    ],
  },
  sections: [
    layout(["burgundy-cards", "eldeco-cards", "emerald-rows"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "text" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "units", label: "Units", type: "array-items" },
        { key: "priceLabel", label: "Price label (simple cards / price rows)", type: "text" },
        { key: "typologyLabel", label: "Typology label (price rows)", type: "text" },
        { key: "sizeLabel", label: "Size label (price rows)", type: "text" },
        { key: "bgImage", label: "Background image (emerald template)", type: "image" },
        { key: "note", label: "Note under the cards", type: "text" },
        anchor,
      ],
    },
    { title: "Card button (price rows: one button below)", fields: buttonFields("cardButton", "Card button", "cardButtonText") },
  ],
  itemFields: {
    units: [
      { key: "badge", label: "Badge", kind: "text" },
      { key: "title", label: "Name", kind: "text" },
      { key: "area", label: "Area line", kind: "text" },
      { key: "price", label: "Price", kind: "text" },
      { key: "features", label: "Features, one per line", kind: "textarea", rows: 4 },
      { key: "highlight", label: "Highlight this card", kind: "toggle" },
    ],
  },
  itemTemplates: { units: { badge: "", title: "", area: "", price: "", features: "", highlight: false } },
};

const LOCATION: IpxWidget = {
  type: "ipx-location",
  label: "Location / Map",
  description: "Map with nearby places and distances",
  variants: ["burgundy-map", "eldeco-map", "tarc-map", "emerald-map", "modern-list"],
  defaultProps: {
    anchor: "location",
    accentColor: "",
    eyebrow: "Location",
    title: "Location Advantages",
    titleAccent: "An Address That Connects",
    subtitle: "A prime address, where opportunities and prestige converge.",
    description: "",
    address: "Sector 150, Noida",
    mapImage: "",
    mapEmbed: "",
    ...buttonDefaults("Know More"),
    places: [
      { icon: "", title: "City Hospital", value: "4.0 Km" },
      { icon: "", title: "Five-star Hotel", value: "4.5 Km" },
      { icon: "", title: "Metro Station", value: "6.0 Km" },
      { icon: "", title: "Expressway", value: "7.0 Km" },
      { icon: "", title: "International School", value: "8.0 Km" },
      { icon: "", title: "Cricket Stadium", value: "17.3 Km" },
      { icon: "", title: "Shopping Mall", value: "12.0 Km" },
      { icon: "", title: "International Airport", value: "40.0 Km" },
    ],
  },
  sections: [
    layout(["burgundy-map", "eldeco-map", "tarc-map", "emerald-map", "modern-list"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "text" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "address", label: "Address (pin line)", type: "text" },
        anchor,
      ],
    },
    {
      title: "Map",
      fields: [
        { key: "mapImage", label: "Map image", type: "image" },
        { key: "mapEmbed", label: "Or a live Google Map (place link, embed code or address)", type: "textarea" },
        { key: "places", label: "Nearby places (emerald: first one sits above the map)", type: "array-items" },
      ],
    },
    { title: "Button", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    places: [
      { key: "icon", label: "Icon (map-list template)", kind: "icon" },
      { key: "title", label: "Place", kind: "text" },
      { key: "value", label: "Distance / time", kind: "text" },
      { key: "text", label: "Subtitle (modern list)", kind: "text" },
    ],
  },
  itemTemplates: { places: { icon: "", title: "", value: "", text: "" } },
};

const ABOUT: IpxWidget = {
  type: "ipx-about",
  label: "About Developer",
  description: "Developer stats, full-image about banner or green about with mission & vision",
  variants: ["burgundy-stats", "eldeco-stats", "tarc-banner", "emerald-about"],
  defaultProps: {
    anchor: "about",
    accentColor: "",
    eyebrow: "The Developer",
    title: "About the Developer",
    titleAccent: "",
    subtitle: "Sculpting the future of luxury living, inspired by legacy",
    description:
      "Homes crafted with quality, delivered on time and built to last for generations. The group has delivered landmark projects across the country with thousands of satisfied families.",
    logo: "",
    logoText: "BRAND",
    brandColor: "",
    image: "",
    imageCaption: "Artistic impression",
    missionTitle: "Mission",
    missionText: "To create exceptional living spaces that combine innovative architecture, uncompromising quality and community-centric planning.",
    visionTitle: "Vision",
    visionText: "To go beyond construction by building sustainable communities that inspire better living for generations.",
    ...buttonDefaults("Know More"),
    stats: [
      { value: "19", label: "Years in Real Estate" },
      { value: "70L", label: "Sq.Ft. Delivered" },
      { value: "26", label: "Projects Completed" },
      { value: "12", label: "Ongoing Projects" },
      { value: "500+", label: "Acres Land Bank" },
      { value: "50+", label: "Industry Awards" },
    ],
  },
  sections: [
    layout(["burgundy-stats", "eldeco-stats", "tarc-banner", "emerald-about"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "text" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle (banner)", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "logo", label: "Logo image", type: "image" },
        { key: "logoText", label: "Logo text (when no logo image)", type: "text" },
        { key: "brandColor", label: "Logo / numbers colour (stats grid)", type: "color" },
        { key: "image", label: "Background image (banner / emerald)", type: "image" },
        { key: "missionTitle", label: "Mission heading (emerald)", type: "text" },
        { key: "missionText", label: "Mission text (emerald)", type: "textarea" },
        { key: "visionTitle", label: "Vision heading (emerald)", type: "text" },
        { key: "visionText", label: "Vision text (emerald)", type: "textarea" },
        { key: "imageCaption", label: "Image caption", type: "text" },
        { key: "stats", label: "Stats", type: "array-items" },
        anchor,
      ],
    },
    { title: "Button (banner / emerald)", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    stats: [
      { key: "value", label: "Number", kind: "text" },
      { key: "label", label: "Label", kind: "text" },
    ],
  },
  itemTemplates: { stats: { value: "", label: "" } },
};

const CTA: IpxWidget = {
  type: "ipx-cta",
  label: "CTA / Banner",
  description: "Call-to-action, full-image banner or virtual tour",
  variants: ["burgundy-cta", "tarc-club", "tarc-tour", "modern-banner"],
  defaultProps: {
    anchor: "",
    accentColor: "",
    eyebrow: "The Time Is Now",
    title: "Claim Your",
    titleAccent: "Dream Residence",
    subtitle: "Enjoy a seamless, guided virtual site tour showcasing every detail of the project from anywhere.",
    description: "Pre-launch units are moving fast. Speak to our consultant today and secure your preferred floor and view before they are gone.",
    image: "",
    decorImage: "",
    imageCaption: "Artistic impression",
    ...buttonDefaults("Book Private Preview"),
    ...buttonDefaults("Schedule a site visit", "second"),
    note: "48 Acres · 14 Towers · 3,484 Residences · 60+ Amenities",
  },
  sections: [
    layout(["burgundy-cta", "tarc-club", "tarc-tour", "modern-banner"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "textarea" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "subtitle", label: "Subtitle (virtual tour)", type: "textarea" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "image", label: "Image (banner background / tour device)", type: "image" },
        { key: "decorImage", label: "Decorative motif (virtual tour)", type: "image" },
        { key: "imageCaption", label: "Image caption", type: "text" },
        { key: "note", label: "Small line under the buttons (modern banner)", type: "text" },
        anchor,
      ],
    },
    { title: "Button", fields: buttonFields("button", "Button") },
    { title: "Second link (modern banner)", fields: buttonFields("second", "Second link") },
  ],
  itemFields: {},
  itemTemplates: {},
};

const FORM: IpxWidget = {
  type: "ipx-form",
  label: "Enquiry Form",
  description: "Section layout around a Form Builder form",
  variants: ["burgundy-split", "eldeco-bar", "tarc-quote", "emerald-form", "modern-split"],
  defaultProps: {
    anchor: "enquire",
    accentColor: "",
    eyebrow: "Limited Inventory",
    title: "Get Your Quote",
    titleAccent: "",
    description: "Register now to receive your exclusive invitation to the private preview, detailed pricing and floor plans.",
    bullets:
      "Receive exclusive pre-launch pricing & floor plans instantly\nSchedule a private site visit with a dedicated relationship manager\nGet a complete cost breakdown: base price, stamp duty, registration\nRERA-registered project — complete legal peace of mind",
    formTitle: "Request Exclusive Details",
    formSubtitle: "Response guaranteed within 60 minutes",
    formId: "",
    imageLabel: "The Residences\nSector 150, Noida",
    formNote: "By submitting, you agree to be contacted regarding this project. Your information is confidential and will not be shared with third parties.",
    image: "",
  },
  sections: [
    layout(["burgundy-split", "eldeco-bar", "tarc-quote", "emerald-form", "modern-split"]),
    {
      title: "Content",
      fields: [
        { key: "eyebrow", label: "Small label above the title", type: "text" },
        { key: "title", label: "Title", type: "textarea" },
        { key: "titleAccent", label: "Title second line (italic)", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "bullets", label: "Points, one per line (split template)", type: "textarea" },
        { key: "image", label: "Side illustration (quote / emerald / modern template)", type: "image" },
        { key: "imageLabel", label: "Label on the photo, one line each (modern)", type: "textarea" },
        anchor,
      ],
    },
    {
      title: "Form",
      fields: [
        { key: "formId", label: "Form (Form Builder)", type: "form-select" },
        { key: "formTitle", label: "Form card title (split template)", type: "text" },
        { key: "formSubtitle", label: "Form card subtitle", type: "text" },
        { key: "formNote", label: "Note under the form", type: "textarea" },
      ],
    },
  ],
  itemFields: {},
  itemTemplates: {},
};

const FOOTER: IpxWidget = {
  type: "ipx-footer",
  label: "Footer",
  description: "RERA QR footer, disclaimer band, RERA disclaimer footer or green RERA footer",
  variants: ["burgundy-footer", "eldeco-footer", "tarc-footer", "emerald-footer", "modern-columns"],
  defaultProps: {
    anchor: "",
    accentColor: "",
    title: "RERA NO. XX/XXX/0000/00",
    title2: "Project RERA NO. XXXXXXXX/00/0000",
    readMoreText: "Read more",
    address: "Sector 150, Noida, Uttar Pradesh",
    website: "www.example.com",
    disclaimer:
      "Disclaimer – The content and visuals are an artistic rendering for illustrative purposes only and do not constitute a legal offer. All details are indicative and subject to change without notice. Purchasers are advised to verify all details independently before making any decision.",
    linkText: "Disclaimer & Privacy Policy",
    linkUrl: "",
    credit: "Copyright © 2026. All Rights Reserved",
    bandColor: "",
    columns: [
      { title: "Contact", links: "+91 90000 00000 | tel:+919000000000\n# About Us\nOur Story\nCareers" },
      { title: "Residences", links: "1 BHK\n2 BHK\n3 BHK\n4 BHK" },
      { title: "Explore", links: "Overview | #overview\nAmenities | #amenities\nLocation | #location\nGallery | #gallery" },
      { title: "Connect", links: "Instagram\nFacebook\nLinkedIn\nYouTube" },
    ],
    bottomLinks: "Disclaimer\nPrivacy Policy\nTerms of Use",
    callText: "Call Now",
    phone: "+91 90000 00000",
    ...buttonDefaults("Get Brochure"),
    qrCodes: [
      { image: "", title: "Phase 1", text: "Scan To Verify\nRERA No." },
      { image: "", title: "Phase 2", text: "Scan To Verify\nRERA No." },
    ],
  },
  sections: [
    layout(["burgundy-footer", "eldeco-footer", "tarc-footer", "emerald-footer", "modern-columns"]),
    {
      title: "Content",
      fields: [
        { key: "title", label: "Title / RERA line", type: "text" },
        { key: "title2", label: "Second RERA line (emerald)", type: "text" },
        { key: "address", label: "Address (QR footer)", type: "text" },
        { key: "website", label: "Website (QR footer)", type: "text" },
        { key: "disclaimer", label: "Disclaimer", type: "textarea" },
        { key: "readMoreText", label: "Read more text (emerald; empty shows full text)", type: "text" },
        { key: "linkText", label: "Link text", type: "text" },
        { key: "linkUrl", label: "Link URL", type: "text" },
        { key: "credit", label: "Credit / copyright text", type: "text" },
        { key: "bandColor", label: "Band colour (disclaimer band; empty = bronze)", type: "color" },
        { key: "qrCodes", label: "RERA QR codes (QR footer)", type: "array-items" },
        { key: "columns", label: "Link columns (modern footer)", type: "array-items" },
        { key: "bottomLinks", label: "Bottom links, one per line: Label | URL (modern footer)", type: "textarea" },
      ],
    },
    {
      title: "Buttons (QR footer)",
      fields: [
        { key: "callText", label: "Call button text (empty hides it)", type: "text" },
        { key: "phone", label: "Phone number", type: "text" },
        ...buttonFields("button", "Second button"),
      ],
    },
  ],
  itemFields: {
    qrCodes: [
      { key: "image", label: "QR code image", kind: "image" },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Text", kind: "textarea", rows: 3 },
    ],
    columns: [
      { key: "title", label: "Column heading", kind: "text" },
      { key: "links", label: "Links, one per line: Label | URL (start a line with # for a sub-heading)", kind: "textarea", rows: 6 },
    ],
  },
  itemTemplates: { qrCodes: { image: "", title: "", text: "" }, columns: { title: "", links: "" } },
};

const SPECS: IpxWidget = {
  type: "ipx-specs",
  label: "Specifications",
  description: "Two-column project specifications with gold titles",
  variants: ["emerald-specs"],
  defaultProps: {
    anchor: "specifications",
    accentColor: "",
    title: "Project Specifications",
    description: "",
    bgImage: "",
    ...buttonDefaults("Read More"),
    items: [
      { title: "Kitchen", text: "Individual RO water unit" },
      { title: "External Wall", text: "Texture paint" },
      { title: "Doors & Windows", text: "Laminated flush door shutters" },
      { title: "Railings", text: "MS / glass railing in balconies" },
      { title: "Floor to Floor Height", text: "3.30 m (11'-0\")" },
      { title: "Toilets", text: "Ceramic sanitary ware, wall tiles" },
      { title: "Structure", text: "Earthquake-resistant frame structure" },
      { title: "Electrical", text: "Modular switches, ISI-mark wiring" },
    ],
  },
  sections: [
    layout(["emerald-specs"]),
    {
      title: "Content",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "description", label: "Paragraph", type: "textarea" },
        { key: "items", label: "Specifications", type: "array-items" },
        { key: "bgImage", label: "Background image", type: "image" },
        anchor,
      ],
    },
    { title: "Button", fields: buttonFields("button", "Button") },
  ],
  itemFields: {
    items: [
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Points, one per line", kind: "textarea", rows: 3 },
    ],
  },
  itemTemplates: { items: { title: "", text: "" } },
};

export const IPX_WIDGETS: IpxWidget[] = [
  OVERVIEW,
  HIGHLIGHTS,
  AMENITIES,
  PRICING,
  FLOORPLANS,
  MASTERPLAN,
  SPECS,
  GALLERY,
  LOCATION,
  ABOUT,
  CTA,
  FORM,
  FOOTER,
];

export const IPX_WIDGET_TYPES = IPX_WIDGETS.map((w) => w.type);

/** Blocks-panel metadata entries (merged into block-metadata). */
export const IPX_BLOCK_METADATA = IPX_WIDGETS.map((w) => ({
  type: w.type,
  label: w.label,
  description: w.description,
  category: "Real Estate",
  variants: w.variants,
  defaultProps: w.defaultProps,
}));

/** Inspector field sections per widget type. */
export const IPX_INSPECTOR_FIELDS: Record<string, { sections: IpxSection[] }> = Object.fromEntries(
  IPX_WIDGETS.map((w) => [w.type, { sections: w.sections }]),
);

/** List-item fields keyed `${type}.${listKey}`. */
export const IPX_ITEM_FIELDS: Record<string, ItemFieldDef[]> = Object.fromEntries(
  IPX_WIDGETS.flatMap((w) => Object.entries(w.itemFields).map(([k, v]) => [`${w.type}.${k}`, v])),
);

/** Blank items keyed by type → list key. */
export const IPX_ITEM_TEMPLATES: Record<string, Record<string, Record<string, unknown>>> = Object.fromEntries(
  IPX_WIDGETS.filter((w) => Object.keys(w.itemTemplates).length).map((w) => [w.type, w.itemTemplates]),
);

/** Marks each key as used only by the given templates. */
function only(variants: string[], keys: string[]): Record<string, string[]> {
  return Object.fromEntries(keys.map((k) => [k, variants]));
}

/**
 * Inspector fields that only some templates use, per widget type: field key →
 * templates that show it. The Content tab hides the others for the chosen
 * template (a section with nothing left is hidden too). Keys not listed are
 * used by every template. Checked by __tests__/ipixxel-inspector.test.tsx.
 */
export const IPX_FIELD_VARIANTS: Record<string, Record<string, string[]>> = {
  "ipixxel-hero": {
    ...only(["skyline", "offer-slider", "emerald-slider", "modern-form"], ["logoText"]),
    ...only(["grand-band", "skyline", "emerald-slider"], ["location"]),
    ...only(["skyline", "offer-slider", "emerald-slider"], ["phone"]),
    ...only(["grand-band", "skyline"], ["disclaimer"]),
    ...only(["grand-band"], ["brandName", "brandColor", "brandNumber", "brandTitle", "brandSubtitle", "headline", "legalText", "qrImage", "bandText", "offerLabel", "offerValue"]),
    ...only(["skyline"], ["logo2", "skylineTitle", "stat1Label", "stat1Value", "stat2Label", "stat2Value", "tourText", "tourUrl", "callText", "menuAnchor", "galleryText", "galleryUrl", "primaryAnchor", "primaryCta", "primaryCtaUrl", "primaryCtaTarget", "primaryCtaColor", "primaryCtaTextColor", "primaryCtaHoverColor", "primaryCtaHoverTextColor", "primaryCtaBorderColor", "primaryCtaRadius"]),
    ...only(["offer-slider"], ["logoTagline", "offerTitle", "highlightText", "benefitText", "benefitValue", "benefitNote", "configText", "priceText", "validLabel", "validValue", "offerBadgeImage", "badgeTop", "badgeTitle", "badgeScript", "whatsappIcon", "whatsappSize", "headerCtaAnchor", "headerCta", "headerCtaUrl", "headerCtaTarget", "headerCtaColor", "headerCtaTextColor", "headerCtaHoverColor", "headerCtaHoverTextColor", "headerCtaBorderColor", "headerCtaRadius"]),
    ...only(["offer-slider", "emerald-slider"], ["slides", "textOnAllSlides", "autoplay", "interval", "whatsapp", "showFloatingButtons"]),
    ...only(["emerald-slider"], ["emeraldTitle", "emeraldConfig", "emeraldPriceLabel", "emeraldPrice", "emeraldPlan", "emeraldRibbon"]),
    ...only(["modern-form"], ["modernNav", "modernEyebrow", "modernTitle", "modernText", "modernFormTitle", "formId", "modernNavCtaAnchor", "modernCtaAnchor", "modernLinkAnchor", "modernNavCta", "modernCta", "modernLink", "modernNavCtaUrl", "modernNavCtaTarget", "modernNavCtaColor", "modernNavCtaTextColor", "modernNavCtaHoverColor", "modernNavCtaHoverTextColor", "modernNavCtaBorderColor", "modernNavCtaRadius", "modernCtaUrl", "modernCtaTarget", "modernCtaColor", "modernCtaTextColor", "modernCtaHoverColor", "modernCtaHoverTextColor", "modernCtaBorderColor", "modernCtaRadius", "modernLinkUrl", "modernLinkTarget", "modernLinkColor", "modernLinkTextColor", "modernLinkHoverColor", "modernLinkHoverTextColor", "modernLinkBorderColor", "modernLinkRadius"]),
  },
  "ipx-overview": {
    ...only(["burgundy-features", "emerald-overview", "modern-overview"], ["eyebrow", "titleAccent"]),
    ...only(["eldeco-overview"], ["subtitle"]),
    ...only(["eldeco-overview", "tarc-story", "tarc-wellness", "emerald-overview", "modern-overview"], ["image"]),
    ...only(["eldeco-overview", "tarc-story", "tarc-wellness", "emerald-overview"], ["imageCaption", "buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
    ...only(["tarc-story"], ["imageSide", "decorImage"]),
    ...only(["tarc-wellness"], ["watermark"]),
    ...only(["modern-overview"], ["stats"]),
    ...only(["burgundy-features"], ["items"]),
  },
  "ipx-highlights": {
    ...only(["eldeco-icons", "tarc-compass", "emerald-list", "modern-grid"], ["title", "subtitle"]),
    ...only(["modern-grid"], ["eyebrow"]),
    ...only(["emerald-list", "modern-grid"], ["titleAccent"]),
    ...only(["eldeco-icons"], ["tabs", "tabLabel"]),
    ...only(["burgundy-offers", "eldeco-icons", "emerald-list", "modern-grid"], ["items"]),
    ...only(["tarc-compass"], ["centerImage", "imageCaption", "directions"]),
    ...only(["emerald-offer"], ["logo", "logoText", "offerText", "planValue", "planLabel", "configText", "configNote", "priceLabel", "price", "address"]),
    ...only(["emerald-offer", "emerald-list"], ["image"]),
    ...only(["emerald-list"], ["image2"]),
    ...only(["eldeco-icons", "emerald-list"], ["buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
  },
  "ipx-amenities": {
    ...only(["burgundy-list", "modern-pills"], ["eyebrow"]),
    ...only(["burgundy-list", "emerald-cards", "modern-pills"], ["titleAccent", "description"]),
    ...only(["eldeco-tiles", "tarc-carousel"], ["subtitle"]),
    ...only(["eldeco-tiles"], ["highlightFirst"]),
    ...only(["emerald-cards"], ["bgImage"]),
    ...only(["tarc-carousel"], ["imageCaption"]),
    ...only(["tarc-carousel", "emerald-cards"], ["autoplay", "interval"]),
    ...only(["eldeco-tiles", "emerald-cards", "modern-pills"], ["buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
  },
  "ipx-pricing": {
    ...only(["burgundy-cards"], ["eyebrow"]),
    ...only(["burgundy-cards", "emerald-rows"], ["titleAccent", "description"]),
    ...only(["eldeco-cards"], ["subtitle"]),
    ...only(["eldeco-cards", "emerald-rows"], ["priceLabel"]),
    ...only(["emerald-rows"], ["typologyLabel", "sizeLabel", "bgImage"]),
  },
  "ipx-floorplans": {
    ...only(["burgundy-tabs", "modern-cards"], ["eyebrow"]),
    ...only(["burgundy-tabs", "emerald-tabs", "modern-cards"], ["titleAccent", "description"]),
    ...only(["tarc-details"], ["subtitle", "priceLabel", "decorImage"]),
    ...only(["tarc-details", "emerald-tabs", "modern-cards"], ["buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
  },
  "ipx-masterplan": {
    ...only(["tarc-master"], ["imageCaption"]),
    ...only(["modern-plan"], ["eyebrow", "titleAccent", "showCompass"]),
    ...only(["eldeco-site", "tarc-master"], ["buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
  },
  "ipx-gallery": {
    ...only(["burgundy-carousel", "modern-tabs", "modern-bento"], ["eyebrow"]),
    ...only(["burgundy-carousel", "emerald-rows", "modern-tabs", "modern-bento"], ["titleAccent", "description"]),
    ...only(["eldeco-grid", "tarc-journey"], ["subtitle"]),
    ...only(["burgundy-carousel", "eldeco-grid", "tarc-journey"], ["imageCaption"]),
    ...only(["tarc-journey"], ["decorImage"]),
    ...only(["tarc-journey", "emerald-rows"], ["autoplay", "interval"]),
    ...only(["emerald-rows"], ["buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
  },
  "ipx-location": {
    ...only(["burgundy-map", "modern-list"], ["eyebrow"]),
    ...only(["burgundy-map", "emerald-map", "modern-list"], ["titleAccent", "description"]),
    ...only(["eldeco-map", "tarc-map"], ["subtitle"]),
    ...only(["tarc-map"], ["address"]),
    ...only(["burgundy-map", "eldeco-map", "emerald-map", "modern-list"], ["buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
  },
  "ipx-about": {
    ...only(["burgundy-stats"], ["eyebrow"]),
    ...only(["burgundy-stats", "tarc-banner", "emerald-about"], ["title"]),
    ...only(["burgundy-stats", "emerald-about"], ["titleAccent"]),
    ...only(["tarc-banner", "emerald-about"], ["subtitle", "image", "buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
    ...only(["eldeco-stats", "tarc-banner", "emerald-about"], ["logo", "logoText"]),
    ...only(["eldeco-stats"], ["brandColor"]),
    ...only(["emerald-about"], ["missionTitle", "missionText", "visionTitle", "visionText"]),
    ...only(["tarc-banner"], ["imageCaption"]),
  },
  "ipx-cta": {
    ...only(["burgundy-cta", "modern-banner"], ["eyebrow", "titleAccent"]),
    ...only(["tarc-tour", "modern-banner"], ["subtitle"]),
    ...only(["burgundy-cta"], ["description"]),
    ...only(["tarc-club", "tarc-tour", "modern-banner"], ["image"]),
    ...only(["tarc-tour"], ["decorImage"]),
    ...only(["tarc-club"], ["imageCaption"]),
    ...only(["modern-banner"], ["note", "secondText", "secondUrl", "secondTarget", "secondAnchor", "secondColor", "secondTextColor", "secondHoverColor", "secondHoverTextColor", "secondBorderColor", "secondRadius"]),
  },
  "ipx-form": {
    ...only(["burgundy-split", "modern-split"], ["eyebrow"]),
    ...only(["burgundy-split", "emerald-form", "modern-split"], ["titleAccent", "description", "formNote"]),
    ...only(["burgundy-split"], ["bullets", "formTitle", "formSubtitle"]),
    ...only(["tarc-quote", "emerald-form", "modern-split"], ["image"]),
    ...only(["modern-split"], ["imageLabel"]),
  },
  "ipx-footer": {
    ...only(["burgundy-footer", "tarc-footer", "emerald-footer"], ["title"]),
    ...only(["emerald-footer"], ["title2", "readMoreText"]),
    ...only(["burgundy-footer"], ["address", "website", "qrCodes", "callText", "phone", "buttonText", "buttonUrl", "buttonTarget", "buttonAnchor", "buttonColor", "buttonTextColor", "buttonHoverColor", "buttonHoverTextColor", "buttonBorderColor", "buttonRadius"]),
    ...only(["eldeco-footer", "tarc-footer", "emerald-footer"], ["linkText", "linkUrl"]),
    ...only(["eldeco-footer", "tarc-footer", "emerald-footer", "modern-columns"], ["credit"]),
    ...only(["eldeco-footer"], ["bandColor"]),
    ...only(["modern-columns"], ["columns", "bottomLinks"]),
  },
};

/** Template options per widget type (inspector "known variants"). */
export const IPX_KNOWN_VARIANTS: Record<string, string[]> = Object.fromEntries(IPX_WIDGETS.map((w) => [w.type, w.variants]));
