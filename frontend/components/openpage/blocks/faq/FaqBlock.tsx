"use client";

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { BlockConfig } from '../types'
import { El } from '../El'
import { listElementId, subElementId } from '@/lib/openpage/element-style'

interface FaqItem {
  _id?: string
  question: string
  answer: string
}

interface FaqProps {
  title?: string
  subtitle?: string
  items?: FaqItem[]
}

const defaultFaqs: FaqItem[] = [
  { question: 'What is OpenPage?', answer: 'OpenPage is a visual website builder that uses structured JSON config as the source of truth. Both humans and AI agents can edit the same config to build beautiful websites.' },
  { question: 'How does the JSON config work?', answer: 'Every website is represented as a JSON document with blocks, styles, and content. The visual editor reads and writes this JSON, and agents can make surgical edits via the API.' },
  { question: 'Can I use my own components?', answer: 'Yes! OpenPage supports custom components. You can build your own blocks following our component schema and register them in the block registry.' },
  { question: 'Is it free to use?', answer: 'OpenPage offers a free tier for personal projects with up to 5 blocks. Pro and Team plans unlock unlimited blocks, custom domains, and priority support.' },
]

/**
 * One FAQ card. The card, its question and its answer are separately
 * selectable. The question toggle is a `role="button"` element rather than a
 * `<button>` so styles set on the card ("Style this item") reach its text —
 * real buttons are deliberately shielded from card typography.
 */
function AccordionItem({
  block,
  id,
  item,
  isOpen,
  onToggle,
  className,
}: {
  block: BlockConfig
  id: string
  item: FaqItem
  isOpen: boolean
  onToggle: () => void
  className: string
}) {
  return (
    <El block={block} id={id} className={`border-b border-border-subtle ${className}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className="w-full flex items-center justify-between py-4 text-left group cursor-pointer"
      >
        <El block={block} id={subElementId(id, 'question')} as="span" className="text-[13.5px] font-medium text-text-0 group-hover:text-green transition-colors">
          {item.question}
        </El>
        <ChevronDown
          size={16}
          className={`text-text-3 shrink-0 ml-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-green' : ''
          }`}
        />
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[500px] pb-4' : 'max-h-0'
        }`}
      >
        <El block={block} id={subElementId(id, 'answer')} as="p" className="text-[12.5px] text-text-2 leading-relaxed pr-8">
          {item.answer}
        </El>
      </div>
    </El>
  )
}

export function FaqBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as FaqProps
  const items = props.items || defaultFaqs
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="px-6 @md:px-10 py-16 @md:py-20">
      <El block={block} id="faq:headingRow" className="reveal-fade-up reveal-d1 text-center mb-10">
        <El block={block} id="faq:title" as="h2" className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">
          {props.title || 'Frequently Asked Questions'}
        </El>
        {props.subtitle && (
          <El block={block} id="faq:subtitle" as="p" className="text-text-2 text-sm max-w-lg mx-auto">
            {props.subtitle}
          </El>
        )}
      </El>

      <div className="max-w-2xl mx-auto">
        {items.map((item, i) => {
          const id = listElementId({ path: ['items'] }, item._id || `idx_${i}`)
          return (
            <AccordionItem
              key={id}
              block={block}
              id={id}
              item={item}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              className={`reveal-fade-up reveal-d${Math.min(i + 2, 8)}`}
            />
          )
        })}
      </div>
    </section>
  )
}
