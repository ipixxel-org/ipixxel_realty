"use client";

import type { BlockConfig } from "./types";
import { Component, type ReactNode } from "react";
import {
  applyBlockBoxStyleForDevice,
  blockAnimationClass,
  blockAnimationStyle,
  blockStyleTag,
  WIDGETS_WITH_REPLACEABLE_PADDING,
  MEDIA_WIDGETS,
  resolveBlockStyleForDevice,
} from "@/lib/openpage/block-style";
import { useDevice } from "@/components/openpage/runtime/device";
import { filterHiddenItems } from "./render-utils";
import { CustomFields } from "./CustomFields";

import { NavbarBlock } from "./navbar/NavbarBlock";
import { HeroBlock } from "./hero/HeroBlock";
import { FeaturesBlock } from "./features/FeaturesBlock";
import { PricingBlock } from "./pricing/PricingBlock";
import { CtaBlock } from "./cta/CtaBlock";
import { FooterBlock } from "./footer/FooterBlock";
import { TestimonialsBlock } from "./testimonials/TestimonialsBlock";
import { StatsBlock } from "./stats/StatsBlock";
import { FaqBlock } from "./faq/FaqBlock";
import { TeamBlock } from "./team/TeamBlock";
import { ContactBlock } from "./contact/ContactBlock";
import { NewsletterBlock } from "./newsletter/NewsletterBlock";
import { LogoCloudBlock } from "./logocloud/LogoCloudBlock";
import { DividerBlock } from "./divider/DividerBlock";
import { BannerBlock } from "./banner/BannerBlock";
import { ContentBlock } from "./content/ContentBlock";
import { ImageBlock } from "./image/ImageBlock";
import { VideoBlock } from "./video/VideoBlock";
import { GalleryBlock } from "./gallery/GalleryBlock";
import { SliderBlock } from "./slider/SliderBlock";
import { TabsBlock } from "./tabs/TabsBlock";
import { CountdownBlock } from "./countdown/CountdownBlock";
import { SocialIconsBlock } from "./social-icons/SocialIconsBlock";
import { IconBlock } from "./icon/IconBlock";
import { SpacerBlock } from "./spacer/SpacerBlock";
import { HtmlCodeBlock } from "./html-code/HtmlCodeBlock";
import { AnchorBlock } from "./anchor/AnchorBlock";
import { ColumnsBlock } from "./columns/ColumnsBlock";
import {
  ButtonBlock,
  EmiCalculatorBlock,
  HeadingBlock,
  IconBoxBlock,
  ImageBoxBlock,
  PaymentPlanBlock,
  PropertyFiltersBlock,
  PropertySearchBlock,
  TextBlock,
} from "./core/CoreWidgets";
import {
  AmenitiesBlock,
  ConstructionStatusBlock,
  CustomSectionBlock,
  DeveloperBlock,
  DownloadBrochureBlock,
  FloorPlansBlock,
  GoogleMapsBlock,
  LeadFormBlock,
  LocationBlock,
  OffersBlock,
  ProjectBannerBlock,
  ProjectHighlightsBlock,
  ProjectOverviewBlock,
  PropertyDetailsBlock,
  RePricingBlock,
  SiteVisitBlock,
  UnitConfigBlock,
} from "./realestate/RealEstateBlocks";
import { AlertBlock, AnimatedHeadlineBlock, IconListBlock } from "./elements/TextWidgets";
import { CounterBlock, FlipBoxBlock, HotspotBlock, PriceListBlock, ProgressBarBlock, StarRatingBlock } from "./elements/HighlightWidgets";
import { BreadcrumbsBlock, OffCanvasBlock, PageTitleBlock, SiteLogoBlock, SiteTitleBlock, TableOfContentsBlock } from "./elements/SiteWidgets";
import { PortfolioBlock, PostsBlock, PropertyCarouselBlock, ReviewsBlock } from "./elements/ListingWidgets";
import { VisualJourneyBlock } from "./elements/VisualJourneyBlock";
import { IpixxelHeroBlock } from "./ipixxel/IpixxelHeroBlock";
import { IpxHighlightsBlock, IpxOverviewBlock } from "./ipixxel/IpxStoryBlocks";
import { IpxAmenitiesBlock, IpxFloorPlansBlock, IpxGalleryBlock, IpxMasterPlanBlock } from "./ipixxel/IpxShowcaseBlocks";
import { IpxAboutBlock, IpxLocationBlock, IpxPricingBlock } from "./ipixxel/IpxDetailBlocks";
import { IpxCtaBlock, IpxFooterBlock, IpxFormBlock } from "./ipixxel/IpxActionBlocks";
import { IpxSpecsBlock } from "./ipixxel/IpxEmeraldBlocks";
import {
  AccordionBlock,
  ImageComparisonBlock,
  PopupTriggerBlock,
  SiteSearchBlock,
  SocialShareBlock,
  VideoGalleryBlock,
} from "./elements/AdditionalWidgets";

class BlockErrorBoundary extends Component<
  { blockType: string; children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-6 py-8 text-center border border-status-red/20 bg-status-red/5 rounded-lg mx-4 my-2">
          <p className="text-status-red text-sm font-medium mb-1">
            Failed to render {this.props.blockType} block
          </p>
          <p className="text-text-3 text-xs">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

function PlaceholderBlock({ block }: { block: BlockConfig }) {
  return (
    <div className="px-9 py-7 text-center text-text-3 text-sm">
      {block.type} block (coming soon)
    </div>
  )
}

const blockRenderers: Record<string, React.ComponentType<{ block: BlockConfig }>> = {
  navbar: NavbarBlock,
  hero: HeroBlock,
  features: FeaturesBlock,
  pricing: PricingBlock,
  cta: CtaBlock,
  footer: FooterBlock,
  testimonials: TestimonialsBlock,
  stats: StatsBlock,
  faq: FaqBlock,
  team: TeamBlock,
  contact: ContactBlock,
  newsletter: NewsletterBlock,
  logocloud: LogoCloudBlock,
  divider: DividerBlock,
  banner: BannerBlock,
  content: ContentBlock,
  image: ImageBlock,
  video: VideoBlock,
  gallery: GalleryBlock,
  slider: SliderBlock,
  tabs: TabsBlock,
  countdown: CountdownBlock,
  "social-icons": SocialIconsBlock,
  icon: IconBlock,
  spacer: SpacerBlock,
  "html-code": HtmlCodeBlock,
  anchor: AnchorBlock,
  columns: ColumnsBlock,
  heading: HeadingBlock,
  text: TextBlock,
  button: ButtonBlock,
  "icon-box": IconBoxBlock,
  "image-box": ImageBoxBlock,
  "property-search": PropertySearchBlock,
  "property-filters": PropertyFiltersBlock,
  "emi-calculator": EmiCalculatorBlock,
  "payment-plan": PaymentPlanBlock,
  "project-banner": ProjectBannerBlock,
  "project-overview": ProjectOverviewBlock,
  "property-details": PropertyDetailsBlock,
  "project-highlights": ProjectHighlightsBlock,
  amenities: AmenitiesBlock,
  "floor-plans": FloorPlansBlock,
  "unit-config": UnitConfigBlock,
  "re-pricing": RePricingBlock,
  offers: OffersBlock,
  location: LocationBlock,
  "google-maps": GoogleMapsBlock,
  "construction-status": ConstructionStatusBlock,
  developer: DeveloperBlock,
  "lead-form": LeadFormBlock,
  "download-brochure": DownloadBrochureBlock,
  "site-visit": SiteVisitBlock,
  "custom-section": CustomSectionBlock,
  "icon-list": IconListBlock,
  alert: AlertBlock,
  "animated-headline": AnimatedHeadlineBlock,
  counter: CounterBlock,
  "star-rating": StarRatingBlock,
  "progress-bar": ProgressBarBlock,
  "price-list": PriceListBlock,
  "flip-box": FlipBoxBlock,
  hotspot: HotspotBlock,
  "site-logo": SiteLogoBlock,
  "site-title": SiteTitleBlock,
  "page-title": PageTitleBlock,
  breadcrumbs: BreadcrumbsBlock,
  "table-of-contents": TableOfContentsBlock,
  "off-canvas": OffCanvasBlock,
  "property-carousel": PropertyCarouselBlock,
  "visual-journey": VisualJourneyBlock,
  "ipixxel-hero": IpixxelHeroBlock,
  "ipx-overview": IpxOverviewBlock,
  "ipx-highlights": IpxHighlightsBlock,
  "ipx-amenities": IpxAmenitiesBlock,
  "ipx-pricing": IpxPricingBlock,
  "ipx-floorplans": IpxFloorPlansBlock,
  "ipx-masterplan": IpxMasterPlanBlock,
  "ipx-specs": IpxSpecsBlock,
  "ipx-gallery": IpxGalleryBlock,
  "ipx-location": IpxLocationBlock,
  "ipx-about": IpxAboutBlock,
  "ipx-cta": IpxCtaBlock,
  "ipx-form": IpxFormBlock,
  "ipx-footer": IpxFooterBlock,
  posts: PostsBlock,
  portfolio: PortfolioBlock,
  reviews: ReviewsBlock,
  accordion: AccordionBlock,
  "video-gallery": VideoGalleryBlock,
  "image-comparison": ImageComparisonBlock,
  "social-share": SocialShareBlock,
  "popup-trigger": PopupTriggerBlock,
  "site-search": SiteSearchBlock,
};

export function RenderBlock({ block }: { block: BlockConfig }): ReactNode {
  const device = useDevice()
  const Renderer = blockRenderers[block.type] || PlaceholderBlock
  const resolved = resolveBlockStyleForDevice(block.style, device)
  const scopedCss = blockStyleTag(block.id, resolved, WIDGETS_WITH_REPLACEABLE_PADDING.has(block.type), MEDIA_WIDGETS.has(block.type))
  // Inline: the wrapper's box only. Backgrounds, borders, transforms and
  // typography come from `scopedCss`, so each is applied exactly once.
  const style = {
    ...applyBlockBoxStyleForDevice(block.style, device),
    ...blockAnimationStyle(block),
  }
  const animationClass = blockAnimationClass(block)
  const className = animationClass || undefined
  const renderBlock: BlockConfig = {
    ...block,
    props: filterHiddenItems(block.props) as Record<string, unknown>,
  }

  return (
    <BlockErrorBoundary blockType={block.type}>
      <div
        className={className || undefined}
        style={Object.keys(style).length ? style : undefined}
        data-block-type={block.type}
        data-block-id={block.id}
      >
        {scopedCss ? <style>{scopedCss}</style> : null}
        {block.style?.customCss ? (
          <style>{`[data-block-id="${block.id}"] { ${block.style.customCss} }`}</style>
        ) : null}
        <Renderer block={renderBlock} />
        <CustomFields block={renderBlock} />
      </div>
    </BlockErrorBoundary>
  )
}
