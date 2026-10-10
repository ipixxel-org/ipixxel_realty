"use client";

import { useState } from "react";
import { Code, Plus, Trash2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { BlockConfig, BlockType } from "@/components/openpage/blocks/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { Section } from "./shared-components";
import { ElementListEditor } from "./ElementListEditor";
import { MediaPicker } from "@/components/media-picker";
import { type FormDefinition } from "@/lib/openpage/forms-store";
import { useBuilderLeadForms } from "@/components/openpage/builder/forms-context";
import { DynamicDataPicker } from "./DynamicDataPicker";
import { FLOOR_PLAN_FIELDS, AMENITY_FIELDS } from "./field-helpers";

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'array-strings' | 'array-items' | 'image' | 'icon' | 'form-select' | 'toggle' | 'nav-menu' | 'number'
  options?: string[]
}

const blockFields: Partial<Record<BlockType, { sections: { title: string; fields: FieldDef[] }[] }>> = {
  navbar: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'logo', label: 'Logo Text', type: 'text' },
          { key: 'logoImage', label: 'Logo', type: 'image' },
          { key: 'logoSize', label: 'Logo Size (px)', type: 'number' },
          { key: 'ctaText', label: 'CTA Button', type: 'text' },
          { key: 'ctaId', label: 'CTA section ID', type: 'text' },
          { key: 'menuItems', label: 'Menu items', type: 'nav-menu' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['default', 'centered', 'static'] },
        ],
      },
    ],
  },
  hero: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'badge', label: 'Badge', type: 'text' },
          { key: 'badgeColor', label: 'Tag / Badge Color', type: 'text' },
          { key: 'badgeBg', label: 'Tag / Badge Background', type: 'text' },
          { key: 'headline', label: 'Headline', type: 'text' },
          { key: 'subheadline', label: 'Subheadline', type: 'textarea' },
          { key: 'primaryCta', label: 'Primary CTA', type: 'text' },
          { key: 'primaryCtaUrl', label: 'Primary CTA URL', type: 'text' },
          { key: 'secondaryCta', label: 'Secondary CTA', type: 'text' },
          { key: 'secondaryCtaUrl', label: 'Secondary CTA URL', type: 'text' },
          { key: 'heroImage', label: 'Hero image', type: 'image' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['centered', 'split', 'gradient', 'minimal'] },
        ],
      },
    ],
  },
  features: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'label', label: 'Section Label', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'text' },
        ],
      },
      {
        title: 'Items',
        fields: [
          { key: 'items', label: 'Feature Cards', type: 'array-items' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['grid', 'list', 'alternating'] },
        ],
      },
    ],
  },
  pricing: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'text' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['simple', 'comparison'] },
        ],
      },
    ],
  },
  cta: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'headline', label: 'Headline', type: 'text' },
          { key: 'subheadline', label: 'Subheadline', type: 'text' },
          { key: 'badge', label: 'Badge (optional)', type: 'text' },
          { key: 'buttonText', label: 'Button Text', type: 'text' },
          { key: 'buttonUrl', label: 'Button URL', type: 'text' },
          { key: 'popupId', label: 'Popup ID', type: 'text' },
          { key: 'secondaryButtonText', label: 'Secondary Button Text', type: 'text' },
          { key: 'secondaryButtonUrl', label: 'Secondary Button URL', type: 'text' },
          { key: 'bgImage', label: 'Background Image', type: 'image' },
          { key: 'image', label: 'Featured Image (Booking variant)', type: 'image' },
        ],
      },
      {
        title: 'Style & Colors',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['simple', 'split', 'booking', 'banner', 'strip', 'card'] },
          { key: 'buttonColor', label: 'Button Color', type: 'text' },
          { key: 'buttonTextColor', label: 'Button Text Color', type: 'text' },
          { key: 'bgColor', label: 'Background Color', type: 'text' },
        ],
      },
    ],
  },
  footer: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'logo', label: 'Logo Text', type: 'text' },
          { key: 'logoImage', label: 'Logo', type: 'image' },
          { key: 'copyright', label: 'Copyright', type: 'text' },
          { key: 'tagline', label: 'Tagline', type: 'textarea' },
          { key: 'address', label: 'Address', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'links', label: 'Links', type: 'array-strings' },
          { key: 'socials', label: 'Social links', type: 'array-strings' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['simple', 'multi-column', 'minimal', 'premium', 'contact'] },
        ],
      },
    ],
  },
  testimonials: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'text' },
          { key: 'items', label: 'Testimonials', type: 'array-items' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['cards', 'carousel', 'spotlight', 'band'] },
        ],
      },
    ],
  },
  stats: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'items', label: 'Stats', type: 'array-items' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['grid', 'bar', 'counter'] },
        ],
      },
    ],
  },
  faq: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'text' },
          { key: 'items', label: 'Questions', type: 'array-items' },
        ],
      },
    ],
  },
  team: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'text' },
          { key: 'members', label: 'Members', type: 'array-items' },
        ],
      },
    ],
  },
  contact: {
    sections: [{ title: 'Form', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'formId', label: 'Form (Form Builder)', type: 'form-select' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  newsletter: {
    sections: [{ title: 'Form', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'formId', label: 'Form (Form Builder)', type: 'form-select' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  logocloud: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'logos', label: 'Logos', type: 'array-strings' },
        ],
      },
    ],
  },
  content: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'body', label: 'Body', type: 'textarea' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['prose', 'columns', 'highlight'] },
        ],
      },
    ],
  },
  image: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'src', label: 'Image', type: 'image' },
          { key: 'alt', label: 'Alt Text', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'subtitle', label: 'Subtitle', type: 'text' },
          { key: 'imageSide', label: 'Image Side', type: 'select', options: ['left', 'right'] },
        ],
      },
      {
        title: 'Grid Images',
        fields: [
          { key: 'images', label: 'Images', type: 'array-items' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['hero-image', 'side-by-side', 'grid'] },
        ],
      },
    ],
  },
  video: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'url', label: 'Video URL', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Platform', type: 'select', options: ['youtube', 'vimeo'] },
        ],
      },
    ],
  },
  gallery: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'images', label: 'Images', type: 'array-items' },
          { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['grid', 'masonry', 'strip', 'lifestyle'] },
          { key: 'imageHeight', label: 'Image height (px)', type: 'number' },
        ],
      },
    ],
  },
  divider: {
    sections: [
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['line', 'space', 'dots'] },
          { key: 'width', label: 'Width', type: 'select', options: ['full', 'centered', 'narrow'] },
          { key: 'height', label: 'Height (px)', type: 'text' },
        ],
      },
    ],
  },
  banner: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'text', label: 'Text', type: 'text' },
          { key: 'linkText', label: 'Link Text', type: 'text' },
          { key: 'linkUrl', label: 'Link URL', type: 'text' },
        ],
      },
      {
        title: 'Style',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['ribbon', 'bar'] },
        ],
      },
    ],
  },
  'project-banner': {
    sections: [
      { title: 'Layout', fields: [
        { key: 'variant', label: 'Template', type: 'select', options: ['split-form', 'overlay', 'centered', 'stats'] },
      ]},
      { title: 'Content', fields: [
        { key: 'badge', label: 'Badge', type: 'text' },
        { key: 'badgeColor', label: 'Tag / Badge Color', type: 'text' },
        { key: 'badgeBg', label: 'Tag / Badge Background', type: 'text' },
        { key: 'headline', label: 'Headline', type: 'text' },
        { key: 'location', label: 'Location', type: 'text' },
        { key: 'price', label: 'Price', type: 'text' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'image', label: 'Cover image', type: 'image' },
          { key: 'primaryCta', label: 'Primary CTA', type: 'text' },
          { key: 'secondaryCta', label: 'Secondary CTA', type: 'text' },
          { key: 'stats', label: 'Stats (stats layout)', type: 'array-items' },
          { key: 'formId', label: 'Form (Form Builder)', type: 'form-select' },
          { key: 'popupId', label: 'Brochure popup ID', type: 'text' },
          { key: 'pdfUrl', label: 'Brochure PDF URL', type: 'text' },
          { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
      ]},
    ],
  },
  'project-overview': {
    sections: [{ title: 'Layout', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['split', 'centered', 'cards', 'timeline'] },
    ]}, { title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'highlights', label: 'Highlights', type: 'array-items' },
      { key: 'stats', label: 'Stats', type: 'array-items' },
      { key: 'ctaText', label: 'CTA text', type: 'text' },
      { key: 'imagePosition', label: 'Image side', type: 'select', options: ['left', 'right'] },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  'property-details': {
    sections: [{ title: 'Layout', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['grid', 'table', 'two-column', 'checklist'] },
    ]}, { title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'items', label: 'Highlights', type: 'array-items' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'possession', label: 'Possession', type: 'text' },
      { key: 'rera', label: 'RERA', type: 'text' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  amenities: {
    sections: [{ title: 'Layout', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['grid', 'chips', 'icon-grid', 'featured', 'mosaic'] },
      { key: 'cardBg', label: 'Card Background Color', type: 'text' },
    ]}, { title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'items', label: 'Amenities', type: 'array-items' },
      { key: 'ctaText', label: 'CTA text', type: 'text' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'text' },
      { key: 'ctaAnchor', label: 'CTA anchor', type: 'text' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  'floor-plans': {
    sections: [
      { title: 'Layout', fields: [
        { key: 'variant', label: 'Template', type: 'select', options: ['cards', 'list', 'showcase'] },
      ]},
      { title: 'Plans', fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'subtitle', label: 'Subtitle', type: 'text' },
        { key: 'items', label: 'Floor plans', type: 'array-items' },
        { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
      ]},
      { title: 'Form gate', fields: [
        { key: 'gateEnabled', label: 'Require form to unlock', type: 'toggle' },
        { key: 'formId', label: 'Unlock form (Form Builder)', type: 'form-select' },
        { key: 'popupId', label: 'Popup ID (optional)', type: 'text' },
      ]},
    ],
  },
  'unit-config': {
    sections: [{ title: 'Units', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['cards', 'table'] },
      { key: 'items', label: 'Configurations', type: 'array-items' },
    ] }],
  },
  're-pricing': {
    sections: [{ title: 'Layout', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['cards', 'simple', 'comparison', 'banner'] },
    ]}, { title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'startingPrice', label: 'Starting price', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'items', label: 'Price cards', type: 'array-items' },
      { key: 'disclaimer', label: 'Disclaimer', type: 'text' },
      { key: 'ctaText', label: 'CTA text', type: 'text' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  offers: {
    sections: [{ title: 'Offers', fields: [
      { key: 'items', label: 'Offers', type: 'array-items' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  location: {
      sections: [{ title: 'Layout', fields: [
        { key: 'variant', label: 'Template', type: 'select', options: ['split-map', 'list', 'map-only', 'cards', 'editorial'] },
      ]}, { title: 'Content', fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'subtitle', label: 'Subheading', type: 'text' },
        { key: 'address', label: 'Address', type: 'text' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'embedUrl', label: 'Google Maps link', type: 'text' },
        { key: 'items', label: 'Nearby', type: 'array-items' },
        { key: 'ctaText', label: 'CTA text', type: 'text' },
        { key: 'ctaUrl', label: 'CTA URL', type: 'text' },
        { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
      ]}],
    },
  'google-maps': {
    sections: [{ title: 'Layout', fields: [
      { key: 'showMap', label: 'Show map', type: 'toggle' },
      { key: 'mapHeight', label: 'Map height (px)', type: 'number' },
    ]}, { title: 'Map', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'embedUrl', label: 'Google Maps link', type: 'text' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  developer: {
    sections: [{ title: 'Layout', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['default', 'split', 'stats', 'band'] },
    ]}, { title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'name', label: 'Developer name', type: 'text' },
      { key: 'body', label: 'About', type: 'textarea' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'logo', label: 'Logo', type: 'image' },
      { key: 'stats', label: 'Stats', type: 'array-items' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  'lead-form': {
    sections: [{ title: 'Layout', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['card', 'split', 'inline', 'default'] },
    ]}, { title: 'Form', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'image', label: 'Side image (split)', type: 'image' },
      { key: 'benefits', label: 'Benefits (split)', type: 'array-items' },
      { key: 'formId', label: 'Form (Form Builder)', type: 'form-select' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  'download-brochure': {
    sections: [{ title: 'Layout', fields: [
      { key: 'variant', label: 'Template', type: 'select', options: ['split', 'card', 'banner', 'minimal'] },
    ]}, { title: 'Brochure', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'buttonText', label: 'Button text', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'image', label: 'Preview image', type: 'image' },
      { key: 'pdfUrl', label: 'PDF URL', type: 'text' },
      { key: 'formId', label: 'Unlock form (Form Builder)', type: 'form-select' },
      { key: 'popupId', label: 'Popup ID (optional)', type: 'text' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  'site-visit': {
    sections: [{ title: 'Form', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'formId', label: 'Form (Form Builder)', type: 'form-select' },
      { key: 'anchor', label: 'Section ID (menu scroll)', type: 'text' },
    ]}],
  },
  'custom-section': {
    sections: [{ title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ]}],
  },
  slider: {
    sections: [
      { title: 'Content', fields: [
        { key: 'images', label: 'Images', type: 'array-items' },
      ]},
      { title: 'Settings', fields: [
        { key: 'height', label: 'Height', type: 'text' },
        { key: 'autoPlay', label: 'Auto-play', type: 'select', options: ['true', 'false'] },
        { key: 'interval', label: 'Interval (ms)', type: 'text' },
        { key: 'showDots', label: 'Show Dots', type: 'select', options: ['true', 'false'] },
        { key: 'showArrows', label: 'Show Arrows', type: 'select', options: ['true', 'false'] },
      ]},
    ],
  },
  tabs: {
    sections: [
      { title: 'Content', fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'items', label: 'Tab Items', type: 'array-items' },
      ]},
    ],
  },
  countdown: {
    sections: [
      { title: 'Content', fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'targetDate', label: 'Target Date (ISO)', type: 'text' },
        { key: 'deadline', label: 'Deadline (ISO)', type: 'text' },
        { key: 'expiredText', label: 'Expired Text', type: 'text' },
      ]},
      { title: 'Display', fields: [
        { key: 'showDays', label: 'Show Days', type: 'select', options: ['true', 'false'] },
        { key: 'showHours', label: 'Show Hours', type: 'select', options: ['true', 'false'] },
        { key: 'showMinutes', label: 'Show Minutes', type: 'select', options: ['true', 'false'] },
        { key: 'showSeconds', label: 'Show Seconds', type: 'select', options: ['true', 'false'] },
      ]},
    ],
  },
  'social-icons': {
    sections: [
      { title: 'Content', fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'icons', label: 'Icons', type: 'array-items' },
      ]},
      { title: 'Style', fields: [
        { key: 'style', label: 'Shape', type: 'select', options: ['rounded', 'circle', 'square'] },
        { key: 'size', label: 'Size', type: 'select', options: ['sm', 'md', 'lg'] },
      ]},
    ],
  },
  icon: {
    sections: [
      { title: 'Content', fields: [
        { key: 'icon', label: 'Icon', type: 'icon' },
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'link', label: 'Link URL', type: 'text' },
      ]},
      { title: 'Style', fields: [
        { key: 'size', label: 'Size', type: 'text' },
        { key: 'color', label: 'Color', type: 'text' },
      ]},
    ],
  },
  spacer: {
    sections: [
      { title: 'Settings', fields: [
        { key: 'height', label: 'Height', type: 'text' },
        { key: 'backgroundColor', label: 'Background Color', type: 'text' },
      ]},
    ],
  },
  'html-code': {
    sections: [
      { title: 'Content', fields: [
        { key: 'code', label: 'HTML Code', type: 'textarea' },
      ]},
    ],
  },
  anchor: {
    sections: [
      { title: 'Settings', fields: [
        { key: 'anchorId', label: 'Anchor ID', type: 'text' },
      ]},
    ],
  },
  columns: {
    sections: [
      { title: 'Layout', fields: [
        { key: 'gap', label: 'Gap', type: 'text' },
      ]},
    ],
  },
  'construction-status': {
    sections: [
      { title: 'Content', fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'items', label: 'Milestones', type: 'array-items' },
      ]},
    ],
  },
  'project-highlights': {
    sections: [
      { title: 'Content', fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'subtitle', label: 'Subtitle', type: 'text' },
        { key: 'items', label: 'Highlights', type: 'array-items' },
      ]},
    ],
  },
  heading: {
    sections: [{ title: 'Content', fields: [
      { key: 'text', label: 'Heading', type: 'text' },
      { key: 'tag', label: 'HTML Tag', type: 'select', options: ['h1', 'h2', 'h3', 'h4'] },
      { key: 'url', label: 'Link', type: 'text' },
    ]}],
  },
  text: {
    sections: [{ title: 'Content', fields: [
      { key: 'body', label: 'Text', type: 'textarea' },
    ]}],
  },
  'image-box': {
    sections: [{ title: 'Content', fields: [
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ]}],
  },
  'property-search': {
    sections: [{ title: 'Content', fields: [
      { key: 'placeholder', label: 'Placeholder', type: 'text' },
      { key: 'buttonText', label: 'Button', type: 'text' },
    ]}],
  },
  'property-filters': {
    sections: [{ title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'Filters', type: 'array-items' },
    ]}],
  },
  'emi-calculator': {
    sections: [{ title: 'Defaults', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'principal', label: 'Loan amount', type: 'text' },
      { key: 'rate', label: 'Interest rate', type: 'text' },
      { key: 'years', label: 'Tenure (years)', type: 'text' },
    ]}],
  },
  'payment-plan': {
    sections: [{ title: 'Content', fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'Milestones', type: 'array-items' },
    ]}],
  },
  'icon-box': {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'icon', label: 'Icon / Icon Image', type: 'icon' },
        ],
      },
      {
        title: 'Style & Colors',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['card', 'horizontal', 'minimal', 'centered'] },
          { key: 'iconColor', label: 'Icon Color', type: 'text' },
          { key: 'iconBg', label: 'Icon Background Color', type: 'text' },
          { key: 'cardBg', label: 'Card Color', type: 'text' },
          { key: 'textColor', label: 'Title Color', type: 'text' },
        ],
      },
    ],
  },
  button: {
    sections: [
      {
        title: 'Content',
        fields: [
          { key: 'label', label: 'Button Text', type: 'text' },
          { key: 'url', label: 'Button URL', type: 'text' },
        ],
      },
      {
        title: 'Style & Colors',
        fields: [
          { key: 'variant', label: 'Variant', type: 'select', options: ['solid', 'outline', 'pill', 'glass'] },
          { key: 'align', label: 'Alignment', type: 'select', options: ['center', 'left', 'right'] },
          { key: 'buttonColor', label: 'Button Color', type: 'text' },
          { key: 'textColor', label: 'Text Color', type: 'text' },
          { key: 'bgImage', label: 'Section Background Image', type: 'image' },
        ],
      },
    ],
  },
}

const TYPE_ALIASES: Record<string, BlockType> = {
  're-hero': 'project-banner',
  'hero-re': 'project-banner',
  're-project-banner': 'project-banner',
  're-overview': 'project-overview',
  're-project-overview': 'project-overview',
  're-highlights': 'project-highlights',
  're-project-highlights': 'project-highlights',
  're-amenities': 'amenities',
  're-floor-plans': 'floor-plans',
  're-pricing': 're-pricing',
  'pricing-re': 're-pricing',
  're-location': 'location',
  're-developer': 'developer',
  're-site-visit': 'site-visit',
  're-lead-form': 'lead-form',
  're-specifications': 'property-details',
  'specifications': 'property-details',
  're-construction-status': 'construction-status',
  're-offers': 'offers',
  're-banner': 'project-banner',
  're-unit-config': 'unit-config',
  're-gallery': 'gallery',
  'gallery-re': 'gallery',
  're-faq': 'faq',
  're-testimonials': 'testimonials',
  're-contact': 'contact',
};

const KNOWN_VARIANTS: Record<string, string[]> = {
  'project-banner': ['split-form', 'overlay', 'centered', 'editorial', 'framed', 'asymmetric', 'info-bar', 'framed-center', 'split-curve', 'stats'],
  'project-overview': ['split', 'centered', 'cards', 'timeline'],
  'property-details': ['grid', 'table', 'two-column', 'checklist'],
  'project-highlights': ['grid', 'table', 'two-column', 'checklist'],
  'amenities': ['grid', 'chips', 'icon-grid', 'featured', 'mosaic'],
  'floor-plans': ['cards', 'list', 'showcase'],
  'unit-config': ['cards', 'table'],
  're-pricing': ['cards', 'simple', 'comparison', 'banner'],
  'location': ['split-map', 'list', 'map-only', 'cards'],
  'developer': ['default', 'split', 'stats', 'band'],
  'lead-form': ['card', 'split', 'inline', 'default'],
  'download-brochure': ['split', 'card', 'banner', 'minimal'],
  'testimonials': ['cards', 'carousel', 'spotlight', 'band'],
  'stats': ['grid', 'bar', 'counter'],
  'hero': ['centered', 'split', 'gradient', 'minimal'],
  'features': ['grid', 'list', 'alternating'],
  'cta': ['simple', 'split', 'booking', 'banner', 'strip', 'card'],
  'icon-box': ['card', 'horizontal', 'minimal', 'centered'],
  'button': ['solid', 'outline', 'pill', 'glass'],
  'footer': ['simple', 'multi-column', 'minimal', 'premium', 'contact'],
};

function PropertyField({ field, block }: { field: FieldDef; block: BlockConfig }) {
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps)
  const updateBlock = useConfigStore((s) => s.updateBlock)
  const patchSite = useConfigStore((s) => s.patchSite)
  const forms = useConfigStore((s) => s.config.forms ?? [])
  const pageBlocks = useConfigStore((s) => {
    const pages = s.config.pages
    if (!pages || pages.length === 0) return s.config.blocks
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0]
    return page.blocks
  })
  // Only forms that exist under Lead Forms are offered — not the page's own
  // template-seeded forms or stale localStorage entries.
  const leadForms = useBuilderLeadForms()
  const selectableForms = leadForms ?? []
  const selectedFormId = field.type === 'form-select'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? String((block.props as any)[field.key] || '')
    : ''
  const orphanForm = selectedFormId && leadForms && !leadForms.some((f) => f.id === selectedFormId)
    ? forms.find((f) => f.id === selectedFormId)
    : undefined

  // For variant field, it's on the block itself
  const value = field.key === 'variant'
    ? block.variant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (block.props as any)[field.key]

  const onChange = (newValue: unknown) => {
    if (field.key === 'variant') {
      updateBlock(block.id, { variant: newValue as string })
    } else {
      updateBlockProps(block.id, { [field.key]: newValue })
    }
  }

  function ensureFormOnPage(formId: string) {
    if (!formId) {
      onChange(formId)
      return
    }
    const already = forms.some((f) => f.id === formId)
    if (already) {
      onChange(formId)
      return
    }
    const fromLib = selectableForms.find((f) => f.id === formId)
    if (fromLib) {
      const copy: FormDefinition = JSON.parse(JSON.stringify(fromLib))
      patchSite({ forms: [...forms, copy] })
    }
    onChange(formId)
  }

  const sectionAnchors = (() => {
    const seen = new Set<string>()
    const out: Array<{ id: string; label: string }> = []
    for (const b of pageBlocks) {
      if (b.type === 'navbar') continue
      const props = b.props as Record<string, unknown>
      const anchor =
        (typeof props.anchor === 'string' && props.anchor) ||
        (typeof props.anchorId === 'string' && props.anchorId) ||
        ''
      const id = String(anchor || '').replace(/^#/, '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push({ id, label: `${b.type} → #${id}` })
    }
    // Common defaults always available
    for (const id of ['overview', 'amenities', 'plans', 'gallery', 'pricing', 'location', 'brochure', 'enquire']) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, label: `#${id}` })
    }
    return out
  })()

  switch (field.type) {
    case 'nav-menu': {
      // Prefer structured menuItems; migrate legacy string links on first edit.
      const rawItems = Array.isArray(value) ? value : []
      const legacyLinks = Array.isArray((block.props as { links?: unknown }).links)
        ? ((block.props as { links: unknown[] }).links)
        : []
      const items: Array<{ label: string; id: string }> =
        rawItems.length > 0
          ? rawItems.map((item) => {
              if (typeof item === 'string') {
                const label = item
                return { label, id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
              }
              const obj = item as { label?: string; id?: string; href?: string }
              const label = String(obj.label || '')
              const id = String(obj.id || obj.href || '').replace(/^#/, '')
              return { label, id }
            })
          : legacyLinks.map((item) => {
              const label = typeof item === 'string' ? item : String((item as { label?: string }).label || '')
              return {
                label,
                id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              }
            })

      function commit(next: Array<{ label: string; id: string }>) {
        updateBlockProps(block.id, {
          menuItems: next,
          // Keep legacy string labels in sync for older templates
          links: next.map((n) => n.label),
        })
      }

      return (
        <div className="mb-2.5">
          <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{field.label}</label>
          <p className="text-[10px] text-text-3 mb-2 leading-relaxed">
            Set a label and section ID. The menu scrolls to <code className="text-green">#id</code> on the page.
            Match the Section ID field on each section.
          </p>
          {items.map((item, i) => (
            <div key={i} className="bg-bg-2 border border-border-default rounded p-2 mb-1.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-3 font-medium">Item {i + 1}</span>
                <button
                  type="button"
                  onClick={() => commit(items.filter((_, idx) => idx !== i))}
                  className="text-[10px] text-text-3 hover:text-status-red transition-colors"
                >
                  Remove
                </button>
              </div>
              <div>
                <label className="block text-[10px] text-text-3 mb-0.5">Label</label>
                <input
                  type="text"
                  value={item.label}
                  placeholder="Amenities"
                  onChange={(e) => {
                    const updated = [...items]
                    updated[i] = { ...updated[i], label: e.target.value }
                    commit(updated)
                  }}
                  className="w-full px-1.5 py-1 rounded border border-border-subtle bg-bg-3 text-text-0 text-[11px] outline-none focus:border-green"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-3 mb-0.5">Section ID</label>
                <div className="flex gap-1">
                  <span className="px-1.5 py-1 text-[11px] text-text-3 bg-bg-3 border border-border-subtle rounded">#</span>
                  <input
                    type="text"
                    value={item.id}
                    placeholder="amenities"
                    list={`nav-anchors-${block.id}`}
                    onChange={(e) => {
                      const updated = [...items]
                      updated[i] = {
                        ...updated[i],
                        id: e.target.value.replace(/^#/, '').replace(/\s+/g, '-').toLowerCase(),
                      }
                      commit(updated)
                    }}
                    className="flex-1 px-1.5 py-1 rounded border border-border-subtle bg-bg-3 text-text-0 text-[11px] outline-none focus:border-green font-mono"
                  />
                </div>
              </div>
            </div>
          ))}
          <datalist id={`nav-anchors-${block.id}`}>
            {sectionAnchors.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => commit([...items, { label: '', id: '' }])}
            className="text-[10px] text-green hover:text-green-dim transition-colors mt-0.5"
          >
            + Add menu item
          </button>
        </div>
      )
    }

    case 'form-select':
      return (
        <div className="mb-2.5">
          <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{field.label}</label>
          <select
            value={String(value || '')}
            onChange={(e) => ensureFormOnPage(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green cursor-pointer"
          >
            <option value="">{leadForms === null ? 'Loading forms…' : 'Select a form'}</option>
            {orphanForm ? (
              <option value={orphanForm.id} disabled>
                {orphanForm.name} (not in Lead Forms)
              </option>
            ) : null}
            {selectableForms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <p className="text-[10px] text-text-3 mt-1">
            {leadForms && leadForms.length === 0
              ? 'No forms yet — create one under Lead Forms.'
              : 'Forms come from Lead Forms. Selecting one copies it onto this page so leads save on publish/preview.'}
          </p>
        </div>
      )

    case 'toggle':
      return (
        <label className="mb-2.5 flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-[11.5px] text-text-2 font-medium">{field.label}</span>
          <input
            type="checkbox"
            checked={value !== false}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-[var(--color-green,#10b981)]"
          />
        </label>
      )

    case 'number':
      return (
        <div className="mb-2.5">
          <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{field.label}</label>
          <input
            type="number"
            value={value === undefined || value === null || value === '' ? '' : String(value)}
            placeholder="Auto"
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green"
          />
        </div>
      )

    case 'text':
      return (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11.5px] text-text-2 font-medium">{field.label}</label>
            <DynamicDataPicker onSelectTag={(tag) => onChange(tag)} />
          </div>
          <input
            type="text"
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green"
          />
        </div>
      )

    case 'textarea':
      return (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11.5px] text-text-2 font-medium">{field.label}</label>
            <DynamicDataPicker onSelectTag={(tag) => onChange(tag)} />
          </div>
          <textarea
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green resize-y"
          />
        </div>
      )

    case 'select':
      return (
        <div className="mb-2.5">
          <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{field.label}</label>
          <select
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green cursor-pointer"
          >
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )

    case 'image':
    case 'icon':
      return (
        <div className="mb-3">
          <MediaPicker
            kind={field.type}
            label={field.label}
            value={String(value || '')}
            compact
            onChange={(v) => onChange(v)}
          />
        </div>
      )

    case 'array-strings': {
      const items = (Array.isArray(value) ? value : []) as string[]
      return (
        <div className="mb-2.5">
          <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{field.label}</label>
          {items.map((item, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                type="text"
                value={item}
                onChange={(e) => {
                  const updated = [...items]
                  updated[i] = e.target.value
                  onChange(updated)
                }}
                className="flex-1 px-2 py-1 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green"
              />
              <button
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="px-1.5 text-text-3 hover:text-status-red text-xs transition-colors"
              >
                x
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange([...items, ''])}
            className="text-[10px] text-green hover:text-green-dim transition-colors mt-0.5"
          >
            + Add item
          </button>
        </div>
      )
    }

    case 'array-items': {
      const items = (Array.isArray(value) ? value : []) as Array<Record<string, string>>

      // Infer new item shape from existing items, or use sensible defaults per field key
      function createEmptyItem(): Record<string, string> {
        if (items.length > 0) {
          const template: Record<string, string> = {}
          for (const key of Object.keys(items[0])) {
            if (key === '_id') continue
            template[key] = ''
          }
          return template
        }
        // Fallback templates by block type + field key
        const blockTemplates: Partial<Record<string, Record<string, Record<string, string>>>> = {
          testimonials: { items: { name: '', role: '', quote: '' } },
          stats: { items: { value: '', label: '' } },
          developer: { stats: { value: '', label: '' } },
          'project-banner': { stats: { value: '', label: '' } },
          'project-overview': { stats: { value: '', label: '' }, highlights: { title: '', description: '' } },
          'property-details': { items: { label: '', value: '' } },
          amenities: { items: { title: '', description: '', image: '', icon: '' } },
          location: { items: { title: '', meta: '' } },
          faq: { items: { question: '', answer: '' } },
          team: { members: { name: '', role: '', avatar: '' } },
          features: { items: { icon: '', title: '', description: '' } },
          'unit-config': { items: { type: '', config: '', area: '', price: '', image: '' } },
          're-pricing': { items: { name: '', price: '', meta: '', cta: '' } },
          image: { images: { src: '', alt: '' } },
          gallery: { images: { src: '', alt: '', caption: '', meta: '', category: '' } },
          'floor-plans': { items: { name: '', beds: '', area: '', price: '', image: '', downloadUrl: '' } },
        }
        return blockTemplates[block.type]?.[field.key] || { title: '', description: '' }
      }

      const customItemFields =
        block.type === 'floor-plans' && field.key === 'items'
          ? FLOOR_PLAN_FIELDS
          : block.type === 'amenities' && field.key === 'items'
            ? AMENITY_FIELDS
            : undefined;

      // Delegated to the shared list editor so every dynamic list in the
      // builder gets add / duplicate / delete / hide / drag-reorder plus a
      // styling hand-off, not just append-and-remove.
      return (
        <div className="mb-2.5">
          <ElementListEditor
            block={block}
            list={{ path: [field.key] }}
            label={field.label}
            template={createEmptyItem()}
            fields={customItemFields}
          />
        </div>
      )
    }

    default:
      return null
  }
}

export function PropertiesPanel({ block }: { block: BlockConfig }) {
  const [showJson, setShowJson] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [showAddProp, setShowAddProp] = useState(false)
  const [newPropKey, setNewPropKey] = useState("")
  const [newPropType, setNewPropType] = useState<"text" | "textarea" | "image" | "toggle">("text")

  const updateColumnWidth = useConfigStore((s) => s.updateColumnWidth)
  const addColumn = useConfigStore((s) => s.addColumn)
  const removeColumn = useConfigStore((s) => s.removeColumn)
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps)
  const updateBlock = useConfigStore((s) => s.updateBlock)

  // Normalize block type via aliases
  const normalizedType = TYPE_ALIASES[block.type] || block.type
  const schema = blockFields[normalizedType as BlockType] || blockFields[block.type as BlockType]

  // Collect all keys covered in predefined schema
  const predefinedKeys = new Set<string>()
  if (schema) {
    for (const section of schema.sections) {
      for (const field of section.fields) {
        predefinedKeys.add(field.key)
      }
    }
  }

  // Check if variant switcher is already present in schema
  const variants = KNOWN_VARIANTS[normalizedType] || KNOWN_VARIANTS[block.type]
  const hasVariantInSchema = predefinedKeys.has("variant")

  // Discover all extra properties from block.props that aren't in schema
  const extraFields: FieldDef[] = []
  const propsObj = (block.props || {}) as Record<string, unknown>
  const propKeys = Object.keys(propsObj)

  for (const key of propKeys) {
    if (predefinedKeys.has(key)) continue
    if (key === "columns" && block.type === "columns") continue

    const val = propsObj[key]
    const lowerKey = key.toLowerCase()
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())

    if (typeof val === "boolean") {
      extraFields.push({ key, label, type: "toggle" })
    } else if (
      lowerKey.includes("image") ||
      lowerKey.includes("img") ||
      lowerKey.includes("photo") ||
      lowerKey.includes("logo") ||
      lowerKey.includes("banner") ||
      lowerKey.includes("avatar") ||
      lowerKey.includes("src") ||
      (typeof val === "string" && /\.(jpg|jpeg|png|webp|avif|svg)$/i.test(val))
    ) {
      extraFields.push({ key, label, type: "image" })
    } else if (lowerKey.includes("formid") || lowerKey === "form") {
      extraFields.push({ key, label, type: "form-select" })
    } else if (Array.isArray(val)) {
      if (val.length === 0 || typeof val[0] === "string") {
        extraFields.push({ key, label, type: "array-strings" })
      } else {
        extraFields.push({ key, label, type: "array-items" })
      }
    } else if (
      typeof val === "string" &&
      (val.length > 50 || val.includes("\n") || lowerKey.includes("body") || lowerKey.includes("desc") || lowerKey.includes("content") || lowerKey.includes("bio") || lowerKey.includes("address"))
    ) {
      extraFields.push({ key, label, type: "textarea" })
    } else {
      extraFields.push({ key, label, type: "text" })
    }
  }

  const columns = block.type === "columns"
    ? ((block.props.columns as Array<{ width: number; blocks: BlockConfig[] }>) ?? [])
    : []

  const handleAddCustomProperty = () => {
    const cleanKey = newPropKey.trim().replace(/\s+/g, "_")
    if (!cleanKey) {
      toast.error("Please enter a property key")
      return
    }
    let initialVal: unknown = ""
    if (newPropType === "toggle") initialVal = false
    updateBlockProps(block.id, { [cleanKey]: initialVal })
    setNewPropKey("")
    setShowAddProp(false)
    toast.success(`Property "${cleanKey}" added to block`)
  }

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonText)
      if (parsed.props) updateBlockProps(block.id, parsed.props)
      if (parsed.variant) updateBlock(block.id, { variant: parsed.variant })
      setJsonError(null)
      toast.success("Block updated from JSON")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid JSON"
      setJsonError(msg)
      toast.error(`JSON Error: ${msg}`)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-border-default flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-2">
            Content
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green/10 text-green font-semibold">
            {block.type}
          </span>
        </div>
        <button
          onClick={() => setShowAddProp(!showAddProp)}
          className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-text-1 font-medium transition-colors"
          title="Add a custom property to this block"
        >
          <Plus size={11} />
          <span>Add Field</span>
        </button>
      </div>

      {/* Add Custom Field Form Drawer */}
      {showAddProp && (
        <div className="p-3 bg-slate-50 border-b border-border-default space-y-2 animate-in fade-in duration-150">
          <div className="text-[11px] font-semibold text-text-0">Add Custom Property</div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              placeholder="e.g. badge, carpetArea, rera"
              value={newPropKey}
              onChange={(e) => setNewPropKey(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded border border-border-default bg-white text-text-0 focus:outline-none focus:border-green"
            />
            <select
              value={newPropType}
              onChange={(e) => setNewPropType(e.target.value as any)}
              className="px-2 py-1.5 text-xs rounded border border-border-default bg-white text-text-0 focus:outline-none focus:border-green"
            >
              <option value="text">Text</option>
              <option value="textarea">Long Text</option>
              <option value="image">Image</option>
              <option value="toggle">Toggle</option>
            </select>
          </div>
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              onClick={() => setShowAddProp(false)}
              className="px-2.5 py-1 text-[11px] text-text-2 hover:text-text-0"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustomProperty}
              className="px-3 py-1 text-[11px] rounded bg-green text-white font-medium hover:bg-green-dim shadow-sm"
            >
              Save Field
            </button>
          </div>
        </div>
      )}

      {/* Variant Selector (if block has variants and not explicitly in schema) */}
      {!hasVariantInSchema && variants && variants.length > 0 && (
        <Section title="Layout & Variant">
          <div className="space-y-1.5">
            <label className="text-[10px] text-text-3 uppercase font-medium">Block Layout</label>
            <select
              value={block.variant || variants[0]}
              onChange={(e) => updateBlock(block.id, { variant: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs rounded border border-border-default bg-white text-text-0 focus:outline-none focus:border-green cursor-pointer font-medium"
            >
              {variants.map((v) => (
                <option key={v} value={v}>
                  {v.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        </Section>
      )}

      {/* Predefined Schema Sections */}
      {schema?.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.fields.map((field) => (
            <PropertyField key={field.key} field={field} block={block} />
          ))}
        </Section>
      ))}

      {/* Extra / Dynamic Auto-Discovered Properties */}
      {extraFields.length > 0 && (
        <Section title={schema ? "Additional Properties" : "Block Properties"}>
          {extraFields.map((field) => (
            <PropertyField key={field.key} field={field} block={block} />
          ))}
        </Section>
      )}

      {/* Empty State Fallback if zero properties exist anywhere */}
      {!schema && extraFields.length === 0 && (
        <div className="p-4 text-center space-y-2">
          <p className="text-[11px] text-text-2">
            No properties currently found on this block.
          </p>
          <button
            onClick={() => setShowAddProp(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green text-white text-xs font-semibold hover:bg-green-dim transition-colors shadow-sm"
          >
            <Plus size={13} /> Add First Property
          </button>
        </div>
      )}

      {/* Column Width Editor */}
      {block.type === "columns" && (
        <Section title="Columns">
          <div className="space-y-2">
            {columns.map((col, i) => (
              <div key={i} className="bg-slate-50 border border-border-default rounded p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-text-3 font-medium">Column {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-3 font-mono">{col.width}%</span>
                    {columns.length > 1 && (
                      <button
                        onClick={() => removeColumn(block.id, i)}
                        className="text-[10px] text-text-3 hover:text-status-red transition-colors"
                        title="Remove column"
                      >
                        x
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={col.width}
                  onChange={(e) => updateColumnWidth(block.id, i, Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-slate-200 cursor-pointer accent-green"
                />
                <div className="text-[9px] text-text-3 mt-0.5">{col.blocks.length} widget(s) in this column</div>
              </div>
            ))}
            {columns.length < 6 && (
              <button
                onClick={() => addColumn(block.id)}
                className="w-full py-1.5 rounded border border-dashed border-border-default text-[10px] text-text-3 hover:border-green hover:text-green transition-colors"
              >
                + Add Column
              </button>
            )}
          </div>
        </Section>
      )}

      {/* View & Edit JSON Drawer */}
      <div className="border-t border-border-subtle bg-white">
        <button
          onClick={() => {
            if (!showJson) {
              setJsonText(JSON.stringify({ id: block.id, type: block.type, variant: block.variant, props: block.props }, null, 2))
              setJsonError(null)
            }
            setShowJson(!showJson)
          }}
          className="w-full px-3.5 py-2 flex items-center justify-between text-[10px] text-text-3 hover:text-text-2 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Code size={11} />
            {showJson ? "Hide" : "Manage Raw"} Block JSON
          </span>
          <span className="text-[9px] font-mono text-text-3">{showJson ? "▲ Close" : "▼ Edit JSON"}</span>
        </button>
        {showJson && (
          <div className="px-3 pb-3 space-y-2">
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setJsonError(null)
              }}
              rows={8}
              className="w-full p-2 text-[10px] font-mono text-text-0 bg-slate-50 border border-border-default rounded focus:outline-none focus:border-green resize-y"
            />
            {jsonError && (
              <div className="flex items-center gap-1 text-[10px] text-status-red">
                <AlertCircle size={11} />
                <span>{jsonError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setJsonText(JSON.stringify({ id: block.id, type: block.type, variant: block.variant, props: block.props }, null, 2))
                  setJsonError(null)
                }}
                className="px-2.5 py-1 text-[10px] rounded border border-border-default text-text-2 hover:text-text-0"
              >
                Reset
              </button>
              <button
                onClick={handleApplyJson}
                className="px-3 py-1 text-[10px] rounded bg-green text-white font-medium hover:bg-green-dim shadow-sm flex items-center gap-1"
              >
                <Check size={11} /> Apply Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
