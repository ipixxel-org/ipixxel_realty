"use client";

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Star, Quote } from 'lucide-react'
import type { BlockConfig, ElementId } from '../types'
import { El } from '../El'
import { listElementId, subElementId } from '@/lib/openpage/element-style'

interface Testimonial {
  _id?: string
  name?: string
  role?: string
  quote?: string
  rating?: number | string
  avatar?: string
}

interface TestimonialsProps {
  title?: string
  subtitle?: string
  items?: Testimonial[]
  viewAllText?: string
  viewAllUrl?: string
  anchor?: string
}

const defaultTestimonials: Testimonial[] = [
  { name: 'Sarah Chen', role: 'CEO at TechCorp', quote: 'OpenPage completely changed how we build landing pages. The JSON config approach is genius.', rating: 5 },
  { name: 'Marcus Johnson', role: 'Lead Developer', quote: 'Finally, a tool where both designers and AI agents can work together seamlessly.', rating: 5 },
  { name: 'Emma Wilson', role: 'Product Manager', quote: 'We shipped our marketing site in half the time. The component library is incredible.', rating: 4 },
]

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Initials for the avatar fallback; safe for missing or odd names. */
function initials(name: unknown): string {
  const parts = text(name).split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((n) => n[0]!.toUpperCase()).join('') || '?'
}

/** 1–5 stars, or 0 for no rating. Accepts numbers or numeric strings. */
function ratingOf(v: unknown): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0
}

type Item = Testimonial & { id: ElementId }

/** Visible testimonials with stable element ids; skips completely empty ones. */
function itemsOf(props: TestimonialsProps): Item[] {
  const list = Array.isArray(props.items) ? props.items : defaultTestimonials
  return list
    .filter((t) => t && typeof t === 'object')
    .map((t, i) => ({ ...t, id: listElementId({ path: ['items'] }, t._id || `idx_${i}`) }))
    .filter((t) => text(t.quote) || text(t.name))
}

function sectionId(props: TestimonialsProps): string {
  return text(props.anchor) || 'testimonials'
}

function StarRating({ rating }: { rating: number }) {
  if (!rating) return null
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={12} className={i <= rating ? 'text-status-yellow fill-status-yellow' : 'text-text-3'} />
      ))}
    </div>
  )
}

function Avatar({ block, item, size }: { block: BlockConfig; item: Item; size: string }) {
  const src = text(item.avatar)
  return (
    <El block={block} id={subElementId(item.id, 'avatar')} className="shrink-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={text(item.name)} className={`${size} rounded-full object-cover border border-border-default`} />
      ) : (
        <div className={`${size} rounded-full bg-bg-4 border border-border-default flex items-center justify-center text-[11px] font-semibold text-text-2`}>
          {initials(item.name)}
        </div>
      )}
    </El>
  )
}

function QuoteText({ block, item, className }: { block: BlockConfig; item: Item; className: string }) {
  const quote = text(item.quote)
  if (!quote) return null
  return (
    <El block={block} id={subElementId(item.id, 'quote')} as="p" className={className}>
      &ldquo;{quote}&rdquo;
    </El>
  )
}

function Person({ block, item, nameClass, roleClass }: { block: BlockConfig; item: Item; nameClass: string; roleClass: string }) {
  return (
    <div className="min-w-0">
      {text(item.name) ? (
        <El block={block} id={subElementId(item.id, 'name')} className={nameClass}>{text(item.name)}</El>
      ) : null}
      {text(item.role) ? (
        <El block={block} id={subElementId(item.id, 'role')} className={roleClass}>{text(item.role)}</El>
      ) : null}
    </div>
  )
}

function Heading({ block, props, className = 'reveal-fade-up reveal-d1 text-center mb-10' }: { block: BlockConfig; props: TestimonialsProps; className?: string }) {
  const title = text(props.title) || 'What people say'
  const subtitle = text(props.subtitle)
  return (
    <El block={block} id="testimonials:headingRow" className={className}>
      <El block={block} id="testimonials:title" as="h2" className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">
        {title}
      </El>
      {subtitle ? (
        <El block={block} id="testimonials:subtitle" as="p" className="text-text-2 text-sm max-w-lg mx-auto">
          {subtitle}
        </El>
      ) : null}
    </El>
  )
}

function TestimonialsCards({ block, props }: { block: BlockConfig; props: TestimonialsProps }) {
  const items = itemsOf(props)
  return (
    <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-20">
      <Heading block={block} props={props} />
      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-4">
        {items.map((item, i) => (
          <El
            key={item.id}
            block={block}
            id={item.id}
            className={`reveal-fade-up reveal-d${Math.min(i + 2, 8)} bg-bg-2 border border-border-default rounded-xl p-5 transition-all hover:border-border-hover`}
          >
            <Quote size={20} className="text-green/30 mb-3" />
            <QuoteText block={block} item={item} className="text-[13px] text-text-1 leading-relaxed mb-4 italic" />
            <StarRating rating={ratingOf(item.rating)} />
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border-subtle">
              <Avatar block={block} item={item} size="w-9 h-9" />
              <Person block={block} item={item} nameClass="text-[12.5px] font-semibold" roleClass="text-[11px] text-text-3" />
            </div>
          </El>
        ))}
      </div>
      {text(props.viewAllText) ? (
        <div className="mt-10 flex justify-center">
          <a
            href={text(props.viewAllUrl) || '#listings'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-text-0 text-sm font-semibold hover:bg-bg-2 transition-colors"
          >
            {text(props.viewAllText)}
          </a>
        </div>
      ) : null}
    </section>
  )
}

function TestimonialsCarousel({ block, props }: { block: BlockConfig; props: TestimonialsProps }) {
  const items = itemsOf(props)
  const [activeIndex, setActiveIndex] = useState(0)
  if (items.length === 0) {
    return (
      <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-20">
        <Heading block={block} props={props} />
      </section>
    )
  }
  const safeIndex = Math.min(activeIndex, items.length - 1)
  const item = items[safeIndex]!
  const goTo = (index: number) => setActiveIndex(((index % items.length) + items.length) % items.length)

  return (
    <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-20">
      <Heading block={block} props={props} />
      <div className="reveal-fade-up reveal-d2 max-w-2xl mx-auto">
        <El block={block} id={item.id} className="text-center">
          <Quote size={32} className="text-green/20 mx-auto mb-4" />
          <QuoteText block={block} item={item} className="text-lg text-text-0 leading-relaxed mb-4 italic" />
          <div className="flex justify-center mb-4">
            <StarRating rating={ratingOf(item.rating)} />
          </div>
          <div className="flex items-center justify-center gap-3">
            <Avatar block={block} item={item} size="w-10 h-10" />
            <div className="text-left">
              <Person block={block} item={item} nameClass="text-sm font-semibold" roleClass="text-[11px] text-text-3" />
            </div>
          </div>
        </El>

        {items.length > 1 ? (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              type="button"
              aria-label="Previous testimonial"
              onClick={() => goTo(safeIndex - 1)}
              className="w-8 h-8 rounded-full border border-border-default bg-bg-2 flex items-center justify-center text-text-2 hover:text-text-0 hover:border-border-hover transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-1.5">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  aria-label={`Show testimonial ${i + 1}`}
                  onClick={() => goTo(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === safeIndex ? 'bg-green' : 'bg-bg-4 hover:bg-bg-5'}`}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Next testimonial"
              onClick={() => goTo(safeIndex + 1)}
              className="w-8 h-8 rounded-full border border-border-default bg-bg-2 flex items-center justify-center text-text-2 hover:text-text-0 hover:border-border-hover transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function TestimonialsSpotlight({ block, props }: { block: BlockConfig; props: TestimonialsProps }) {
  // Spotlight features one testimonial: the first visible one.
  const item = itemsOf(props)[0]
  return (
    <section id={sectionId(props)} className="px-6 @md:px-10 py-16 @md:py-24">
      {text(props.title) || text(props.subtitle) ? <Heading block={block} props={props} /> : null}
      {item ? (
        <El block={block} id={item.id} className="max-w-2xl mx-auto text-center">
          <div className="reveal-fade-up reveal-d1"><Quote size={48} className="text-green/20 mx-auto mb-6" /></div>
          <QuoteText block={block} item={item} className="reveal-fade-up reveal-d2 text-xl @md:text-2xl text-text-0 leading-relaxed mb-8 italic font-display" />
          <div className="flex justify-center mb-6">
            <StarRating rating={ratingOf(item.rating)} />
          </div>
          <div className="flex items-center justify-center gap-3">
            <Avatar block={block} item={item} size="w-12 h-12" />
            <div className="text-left">
              <Person block={block} item={item} nameClass="text-sm font-semibold" roleClass="text-[12px] text-text-3" />
            </div>
          </div>
        </El>
      ) : null}
    </section>
  )
}

function TestimonialsBand({ block, props }: { block: BlockConfig; props: TestimonialsProps }) {
  const items = itemsOf(props)
  return (
    <section id={sectionId(props)} className="px-6 @md:px-10 py-14 bg-bg-1 border-y border-border-default">
      <div className="max-w-6xl mx-auto">
        {text(props.title) || text(props.subtitle) ? <Heading block={block} props={props} className="text-center mb-8" /> : null}
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
          {items.map((item) => (
            <El
              key={item.id}
              block={block}
              id={item.id}
              className="snap-start shrink-0 w-[85%] @sm:w-[48%] @lg:w-[32%] rounded-2xl border border-border-default bg-bg-1 p-5"
            >
              <Quote size={18} className="text-green/30 mb-3" />
              <QuoteText block={block} item={item} className="text-[13px] text-text-1 leading-relaxed mb-4 italic line-clamp-4" />
              <StarRating rating={ratingOf(item.rating)} />
              <div className="flex items-center gap-3 mt-3">
                <Avatar block={block} item={item} size="w-8 h-8" />
                <Person block={block} item={item} nameClass="text-[12px] font-semibold" roleClass="text-[11px] text-text-3" />
              </div>
            </El>
          ))}
        </div>
      </div>
    </section>
  )
}

export function TestimonialsBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as TestimonialsProps

  switch (block.variant) {
    case 'carousel':
      return <TestimonialsCarousel block={block} props={props} />
    case 'spotlight':
      return <TestimonialsSpotlight block={block} props={props} />
    case 'band':
      return <TestimonialsBand block={block} props={props} />
    default:
      return <TestimonialsCards block={block} props={props} />
  }
}
