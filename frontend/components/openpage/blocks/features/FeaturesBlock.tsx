import { createElement } from 'react'
import type { BlockConfig } from '../types'
import {
  Blocks, Code, Bot, Zap, Shield, Globe,
  Layers, Palette, Rocket, Star, Lock, Settings,
  Home, Trees, Award, MapPin, Building2, Heart,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isMediaSrc } from '@/lib/media'
import { listElementId, subElementId } from '@/lib/openpage/element-style'
import { El } from '../El'
import { CtaButton } from '../CtaButton'
import { Bullet, isBulletStyle } from '../Bullet'

interface FeatureItem {
  _id?: string
  icon?: string
  title: string
  description: string
  image?: string
  label?: string
  tags?: unknown
}

interface FeaturesProps {
  label?: string
  title: string
  subtitle?: string
  items: FeatureItem[]
  /** Section image: beside the list (list template) or under the heading. */
  image?: string
  /** Section ID for menu links. */
  anchor?: string
  ctaText?: string
  /** Older / AI-generated name for the button text. */
  buttonText?: string
  ctaUrl?: string
  ctaTarget?: string
  /** List template: 'icons' (default boxes) or a bullet style (arrow, check, …). */
  bulletStyle?: string
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** The section-level image, selectable for styling. */
function SectionImage({ block, props, className }: { block: BlockConfig; props: FeaturesProps; className: string }) {
  const src = text(props.image)
  if (!src) return null
  return (
    <El block={block} id="features:image" className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={text(props.title)} className="w-full h-full object-cover" />
    </El>
  )
}

/** Optional section button ("Cta Text"; falls back to "Button Text"). */
function SectionCta({ block, props }: { block: BlockConfig; props: FeaturesProps }) {
  // A cleared Button text hides the button; the older field only fills in
  // when Button text was never set.
  const label = typeof props.ctaText === 'string' ? text(props.ctaText) : text(props.buttonText)
  if (!label) return null
  return (
    <div className="mt-10 flex justify-center">
      <CtaButton
        block={block}
        id="features:cta"
        prefix="cta"
        label={label}
        href={text(props.ctaUrl) || '#enquire'}
        target={text(props.ctaTarget)}
        icon={null}
        className="px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim"
      />
    </div>
  )
}

/** Section ID only when the user set one, so existing pages keep their markup. */
function sectionId(props: FeaturesProps): string | undefined {
  return text(props.anchor) || undefined
}

const iconMap: Record<string, LucideIcon> = {
  Blocks, Code, Bot, Zap, Shield, Globe,
  Layers, Palette, Rocket, Star, Lock, Settings,
  Home, Trees, Award, MapPin, Building2, Heart,
}

function getIcon(name?: string): LucideIcon {
  if (!name) return Zap
  return iconMap[name] || Zap
}

function FeatureGlyph({ icon }: { icon?: string }) {
  if (isMediaSrc(icon)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" className="w-[18px] h-[18px] object-contain" />
    )
  }
  return createElement(getIcon(icon), { size: 18 })
}

/** Stable element id for a card; falls back to the list editor's `idx_<n>`. */
function cardId(item: FeatureItem, i: number) {
  return listElementId({ path: ['items'] }, item._id || `idx_${i}`)
}

/** Section label, heading and subtitle — each styleable on its own. */
function Header({ block, props, className }: { block: BlockConfig; props: FeaturesProps; className: string }) {
  return (
    <El block={block} id="features:headingRow" className={className}>
      {props.label && (
        <El block={block} id="features:label" className="text-[11px] font-semibold uppercase tracking-widest text-green mb-2">
          {props.label}
        </El>
      )}
      <El block={block} id="features:title" as="h2" className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">
        {props.title}
      </El>
      {props.subtitle && (
        <El block={block} id="features:subtitle" as="p" className="text-text-2 text-sm max-w-lg mx-auto">
          {props.subtitle}
        </El>
      )}
    </El>
  )
}

function FeaturesGrid({ block, props }: { block: BlockConfig; props: FeaturesProps }) {
  return (
    <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-20">
      <Header block={block} props={props} className="reveal-fade-up reveal-d1 text-center mb-10" />
      <SectionImage block={block} props={props} className="max-w-5xl mx-auto mb-10 rounded-[24px] overflow-hidden aspect-[16/9] bg-bg-3" />

      <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-4">
        {(props.items || []).map((item, i) => {
          const id = cardId(item, i)
          return (
            <El
              key={id}
              block={block}
              id={id}
              className={`reveal-fade-up reveal-d${Math.min(i + 2, 8)} group bg-bg-2 border border-border-default rounded-xl p-5 transition-all hover:-translate-y-0.5 hover:border-border-hover hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]`}
            >
              <El block={block} id={subElementId(id, 'icon')} className="w-10 h-10 rounded-lg bg-green/10 border border-green/20 flex items-center justify-center text-green mb-3 transition-all group-hover:bg-green/15 group-hover:accent-glow-md">
                <FeatureGlyph icon={item.icon} />
              </El>
              <El block={block} id={subElementId(id, 'title')} as="h3" className="text-sm font-semibold mb-1">{item.title}</El>
              <El block={block} id={subElementId(id, 'description')} as="p" className="text-[12.5px] text-text-2 leading-relaxed">{item.description}</El>
            </El>
          )
        })}
      </div>
      <SectionCta block={block} props={props} />
    </section>
  )
}

function FeaturesList({ block, props }: { block: BlockConfig; props: FeaturesProps }) {
  const hasImage = Boolean(text(props.image))
  // A bullet style turns the cards into a compact bulleted list.
  const bullet = isBulletStyle(props.bulletStyle) ? props.bulletStyle : null
  if (bullet) {
    return (
      <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-20">
        <Header block={block} props={props} className="reveal-fade-up reveal-d1 text-center mb-10" />
        <div className={hasImage ? 'max-w-6xl mx-auto grid @lg:grid-cols-2 gap-8 @lg:gap-12 items-center' : ''}>
          <SectionImage block={block} props={props} className="rounded-[24px] overflow-hidden aspect-[4/3] bg-bg-3" />
          <ul className={`${hasImage ? '' : 'max-w-2xl mx-auto '}space-y-3`}>
            {(props.items || []).map((item, i) => {
              const id = cardId(item, i)
              return (
                <El key={id} block={block} id={id} as="li" className="flex items-start gap-3">
                  {bullet !== 'none' ? (
                    <El block={block} id={subElementId(id, 'bullet')} as="span" className="mt-[3px] w-4 flex justify-center shrink-0">
                      <Bullet style={bullet} index={i} />
                    </El>
                  ) : null}
                  <span className="min-w-0">
                    <El block={block} id={subElementId(id, 'title')} as="span" className="text-[13.5px] text-text-1 tracking-wide">{item.title}</El>
                    {text(item.description) ? (
                      <El block={block} id={subElementId(id, 'description')} as="span" className="block text-[12.5px] text-text-2 leading-relaxed mt-0.5">{item.description}</El>
                    ) : null}
                  </span>
                </El>
              )
            })}
          </ul>
        </div>
        <SectionCta block={block} props={props} />
      </section>
    )
  }
  return (
    <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-20">
      <Header block={block} props={props} className="reveal-fade-up reveal-d1 text-center mb-10" />

      <div className={hasImage ? 'max-w-6xl mx-auto grid @lg:grid-cols-2 gap-8 @lg:gap-12 items-center' : ''}>
      <SectionImage block={block} props={props} className="rounded-[24px] overflow-hidden aspect-[4/3] bg-bg-3" />
      <div className={`${hasImage ? '' : 'max-w-2xl mx-auto '}space-y-4`}>
        {(props.items || []).map((item, i) => {
          const id = cardId(item, i)
          return (
            <El
              key={id}
              block={block}
              id={id}
              className={`reveal-fade-up reveal-d${Math.min(i + 2, 8)} flex gap-4 p-4 rounded-xl bg-bg-2 border border-border-default transition-all hover:border-border-hover`}
            >
              <El block={block} id={subElementId(id, 'icon')} className="w-10 h-10 rounded-lg bg-green/10 border border-green/20 flex items-center justify-center text-green shrink-0">
                <FeatureGlyph icon={item.icon} />
              </El>
              <div>
                <El block={block} id={subElementId(id, 'title')} as="h3" className="text-sm font-semibold mb-0.5">{item.title}</El>
                <El block={block} id={subElementId(id, 'description')} as="p" className="text-[12.5px] text-text-2 leading-relaxed">{item.description}</El>
              </div>
            </El>
          )
        })}
      </div>
      </div>
      <SectionCta block={block} props={props} />
    </section>
  )
}

function FeaturesAlternating({ block, props }: { block: BlockConfig; props: FeaturesProps }) {
  return (
    <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-20">
      <Header block={block} props={props} className="reveal-fade-up reveal-d1 text-center mb-12" />
      <SectionImage block={block} props={props} className="max-w-5xl mx-auto mb-12 rounded-[24px] overflow-hidden aspect-[16/9] bg-bg-3" />

      <div className="space-y-8">
        {(props.items || []).map((item, i) => {
          const id = cardId(item, i)
          const isReversed = i % 2 === 1
          const tags = Array.isArray(item.tags) ? (item.tags as unknown[]).map(String) : []

          return (
            <El
              key={id}
              block={block}
              id={id}
              className={`reveal-fade-up reveal-d${Math.min(i + 2, 8)} flex flex-col @lg:flex-row items-center gap-6 @lg:gap-10 ${isReversed ? '@lg:flex-row-reverse' : ''}`}
            >
              {/* Image / placeholder (each card's own Image field) */}
              <El block={block} id={subElementId(id, 'image')} className="flex-1 w-full">
                {text(item.image) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={text(item.image)} alt={item.title} className="w-full h-56 @lg:h-72 object-cover rounded-[24px]" />
                ) : (
                  <div className="w-full h-56 @lg:h-72 rounded-[24px] bg-bg-3 border border-border-default flex items-center justify-center text-green">
                    <FeatureGlyph icon={item.icon} />
                  </div>
                )}
              </El>
              {/* Text */}
              <div className="flex-1">
                <El block={block} id={subElementId(id, 'icon')} className="w-10 h-10 rounded-lg bg-green/10 border border-green/20 flex items-center justify-center text-green mb-3">
                  <FeatureGlyph icon={item.icon} />
                </El>
                {item.label ? (
                  <El block={block} id={subElementId(id, 'label')} className="text-[11px] uppercase tracking-[0.22em] text-text-2 font-medium mb-2">
                    {String(item.label)}
                  </El>
                ) : null}
                <El block={block} id={subElementId(id, 'title')} as="h3" className="font-display text-2xl font-medium mb-2">{item.title}</El>
                <El block={block} id={subElementId(id, 'description')} as="p" className="text-text-2 text-[13px] leading-relaxed mb-4">{item.description}</El>
                {tags.length ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span key={tag} className="px-3 py-1 rounded-full border border-border-default text-[10px] uppercase tracking-[0.14em] text-text-2">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </El>
          )
        })}
      </div>
      <SectionCta block={block} props={props} />
    </section>
  )
}

export function FeaturesBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as FeaturesProps

  switch (block.variant) {
    case 'list':
      return <FeaturesList block={block} props={props} />
    case 'alternating':
      return <FeaturesAlternating block={block} props={props} />
    default:
      return <FeaturesGrid block={block} props={props} />
  }
}
