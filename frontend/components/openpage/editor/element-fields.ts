import type { ItemFieldDef } from "./field-helpers";

/**
 * List-item fields for the Elementor-style elements
 * (components/openpage/blocks/elements). Keyed `${blockType}.${propKey}`.
 */
export const ELEMENT_ITEM_FIELDS: Record<string, ItemFieldDef[]> = {
  "icon-list.items": [
    { key: "text", label: "Text", kind: "text", placeholder: "e.g. Covered car parking" },
    { key: "icon", label: "Icon (emoji, text or image)", kind: "icon" },
    { key: "link", label: "Link (optional)", kind: "text", placeholder: "https://… or #section-id" },
  ],
  "hotspot.items": [
    { key: "label", label: "Label", kind: "text", placeholder: "e.g. Clubhouse" },
    { key: "content", label: "Tooltip text", kind: "textarea", rows: 2 },
    { key: "x", label: "Left position (%)", kind: "number", placeholder: "0–100" },
    { key: "y", label: "Top position (%)", kind: "number", placeholder: "0–100" },
    { key: "icon", label: "Marker text (default: number)", kind: "text", placeholder: "e.g. A" },
    { key: "link", label: "Link (optional)", kind: "text", placeholder: "https://… or #section-id" },
    { key: "linkText", label: "Link text", kind: "text", placeholder: "Learn more" },
  ],
  "progress-bar.items": [
    { key: "title", label: "Title", kind: "text", placeholder: "e.g. Structure" },
    { key: "percent", label: "Percent (0–100)", kind: "number" },
    { key: "innerText", label: "Text inside the bar (bar height 16px+)", kind: "text" },
    { key: "color", label: "Bar colour (optional)", kind: "color" },
  ],
  "price-list.items": [
    { key: "title", label: "Title", kind: "text", placeholder: "e.g. 3 BHK" },
    { key: "price", label: "Price", kind: "text", placeholder: "e.g. ₹ 1.95 Cr*" },
    { key: "description", label: "Description", kind: "textarea", rows: 2 },
    { key: "image", label: "Image (optional)", kind: "image" },
    { key: "link", label: "Link (optional)", kind: "text", placeholder: "https://… or #enquire" },
  ],
  "property-carousel.items": [
    { key: "title", label: "Title", kind: "text" },
    { key: "image", label: "Image", kind: "image" },
    { key: "location", label: "Location", kind: "text" },
    { key: "config", label: "Configuration", kind: "text", placeholder: "e.g. 2 & 3 BHK" },
    { key: "area", label: "Area", kind: "text", placeholder: "e.g. 1,145 sq.ft" },
    { key: "price", label: "Price", kind: "text", placeholder: "e.g. From ₹ 1.42 Cr*" },
    { key: "status", label: "Status badge", kind: "text", placeholder: "e.g. New Launch" },
    { key: "url", label: "Link", kind: "text", placeholder: "https://… or #enquire" },
  ],
  "posts.items": [
    { key: "title", label: "Title", kind: "text" },
    { key: "image", label: "Image", kind: "image" },
    { key: "date", label: "Date", kind: "text", placeholder: "e.g. 12 Oct 2026" },
    { key: "category", label: "Category", kind: "text", placeholder: "e.g. Construction" },
    { key: "excerpt", label: "Summary", kind: "textarea", rows: 3 },
    { key: "url", label: "Link", kind: "text", placeholder: "https://…" },
  ],
  "portfolio.items": [
    { key: "title", label: "Title", kind: "text" },
    { key: "image", label: "Image", kind: "image" },
    { key: "location", label: "Location", kind: "text" },
    { key: "category", label: "Category (used by the filter)", kind: "text", placeholder: "e.g. Completed" },
    { key: "status", label: "Status badge", kind: "text", placeholder: "e.g. Delivered" },
    { key: "url", label: "Link", kind: "text", placeholder: "https://…" },
  ],
  "reviews.items": [
    { key: "author", label: "Name", kind: "text" },
    { key: "rating", label: "Rating", kind: "select", options: ["5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"] },
    { key: "text", label: "Review", kind: "textarea", rows: 3 },
    { key: "date", label: "Date", kind: "text", placeholder: "e.g. March 2026" },
    { key: "source", label: "Source", kind: "text", placeholder: "e.g. Google" },
    { key: "avatar", label: "Photo (optional)", kind: "image" },
  ],
  "breadcrumbs.items": [
    { key: "label", label: "Label", kind: "text" },
    { key: "url", label: "Link (empty for the current page)", kind: "text" },
  ],
  "slider.images": [
    { key: "src", label: "Image", kind: "image" },
    { key: "alt", label: "Alt text", kind: "text" },
    { key: "caption", label: "Caption (optional)", kind: "text" },
  ],
  "social-icons.icons": [
    {
      key: "platform",
      label: "Network",
      kind: "select",
      options: ["facebook", "instagram", "youtube", "linkedin", "twitter", "whatsapp", "telegram", "pinterest", "email", "phone"],
    },
    { key: "url", label: "Link", kind: "text", placeholder: "https://… , mailto: or tel:" },
    { key: "label", label: "Label (tooltip)", kind: "text" },
  ],
  "visual-journey.images": [
    { key: "src", label: "Image", kind: "image" },
    { key: "caption", label: "Image name", kind: "text", placeholder: "e.g. Pickle Ball Court" },
    { key: "description", label: "Paragraph below image (optional)", kind: "textarea", rows: 3 },
    { key: "badge", label: "Corner label (optional)", kind: "text", placeholder: "e.g. AI Impression" },
    { key: "alt", label: "Alt text (optional)", kind: "text" },
  ],
  "tabs.items": [
    { key: "label", label: "Tab title", kind: "text" },
    { key: "content", label: "Content", kind: "textarea", rows: 4 },
  ],
};

/** Blank item used by "Add item" when a list is empty. */
export const ELEMENT_ITEM_TEMPLATES: Record<string, Record<string, Record<string, unknown>>> = {
  "icon-list": { items: { text: "", icon: "✓", link: "" } },
  hotspot: { items: { label: "", content: "", x: "50", y: "50", icon: "", link: "", linkText: "" } },
  "progress-bar": { items: { title: "", percent: "50", innerText: "", color: "" } },
  "price-list": { items: { title: "", price: "", description: "", image: "", link: "" } },
  "property-carousel": { items: { title: "", image: "", location: "", config: "", area: "", price: "", status: "", url: "" } },
  posts: { items: { title: "", image: "", date: "", category: "", excerpt: "", url: "" } },
  portfolio: { items: { title: "", image: "", location: "", category: "", status: "", url: "" } },
  reviews: { items: { author: "", rating: "5", text: "", date: "", source: "", avatar: "" } },
  breadcrumbs: { items: { label: "", url: "" } },
  slider: { images: { src: "", alt: "", caption: "" } },
  "social-icons": { icons: { platform: "facebook", url: "", label: "" } },
  tabs: { items: { label: "", content: "" } },
  "visual-journey": { images: { src: "", caption: "", description: "", badge: "", alt: "" } },
};

/** Styleable parts of each list item ("Style …" buttons in the list editor). */
export const ELEMENT_ITEM_SUB_ELEMENTS: Record<string, Record<string, Array<{ key: string; label: string }>>> = {
  "icon-list": { items: [{ key: "icon", label: "Icon" }, { key: "text", label: "Text" }] },
  hotspot: { items: [{ key: "label", label: "Label" }, { key: "content", label: "Tooltip" }] },
  "progress-bar": { items: [{ key: "title", label: "Title" }] },
  "price-list": { items: [{ key: "title", label: "Title" }, { key: "price", label: "Price" }, { key: "description", label: "Description" }, { key: "image", label: "Image" }] },
  "property-carousel": { items: [{ key: "title", label: "Title" }, { key: "price", label: "Price" }] },
  posts: { items: [{ key: "title", label: "Title" }, { key: "excerpt", label: "Summary" }] },
  portfolio: { items: [{ key: "title", label: "Title" }] },
  reviews: { items: [{ key: "text", label: "Review" }, { key: "author", label: "Name" }] },
  "visual-journey": { images: [{ key: "caption", label: "Image name" }, { key: "description", label: "Paragraph" }, { key: "badge", label: "Corner label" }] },
};
