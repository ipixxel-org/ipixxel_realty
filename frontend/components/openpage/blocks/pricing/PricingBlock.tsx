import type { BlockConfig } from '../types'
import { Check, Star } from 'lucide-react'
import { El } from "../El"
import { listElementId, subElementId } from "@/lib/openpage/element-style"

interface PricingTier {
  name: string
  price: string
  period?: string
  description?: string
  features: string[]
  cta: string
  featured?: boolean
  _id?: string
  priceColor?: string
  ctaUrl?: string
  ctaTarget?: "_self" | "_blank"
}

interface PricingProps {
  title: string
  subtitle?: string
  tiers?: PricingTier[]
  priceColor?: string
}

const defaultTiers: PricingTier[] = [
  {
    name: 'Starter',
    price: '$0',
    period: '/month',
    description: 'For personal projects',
    features: ['1 website', '5 blocks', 'Basic export', 'Community support'],
    cta: 'Get Started',
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'For professionals',
    features: ['Unlimited websites', 'All blocks', 'Custom domains', 'Priority support', 'Agent API access', 'Version history'],
    cta: 'Upgrade to Pro',
    featured: true,
  },
  {
    name: 'Team',
    price: '$49',
    period: '/month',
    description: 'For teams and agencies',
    features: ['Everything in Pro', 'Team collaboration', 'Custom components', 'SSO', 'Dedicated support'],
    cta: 'Contact Sales',
  },
]

function tierPriceId(tier: PricingTier, index: number) {
  return subElementId(
    listElementId({ path: ["tiers"] }, tier._id || `tier_${index}`),
    "price",
  )
}

function PriceText({ block, tier, index, color }: {
  block: BlockConfig
  tier: PricingTier
  index: number
  color?: string
}) {
  return (
    <El
      block={block}
      id={tierPriceId(tier, index)}
      as="span"
      className="text-3xl font-bold tracking-tight"
      style={{ color: tier.priceColor || color || undefined }}
    >
      {tier.price}
    </El>
  )
}

function PricingSimple({ block, props }: { block: BlockConfig; props: PricingProps }) {
  const tiers = props.tiers || defaultTiers

  return (
    <section className="px-6 @md:px-10 py-16 @md:py-20">
      <div className="reveal-fade-up reveal-d1 text-center mb-10">
        <El block={block} id="pricing:title" as="h2" className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">{props.title}</El>
        {props.subtitle && (
          <El block={block} id="pricing:subtitle" as="p" className="text-text-2 text-sm max-w-lg mx-auto">{props.subtitle}</El>
        )}
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {tiers.map((tier, i) => (
          <div
            key={i}
            className={`reveal-fade-up reveal-d${Math.min(i + 2, 8)} relative rounded-xl p-6 flex flex-col transition-all ${
              tier.featured
                ? 'bg-bg-2 border-2 border-green accent-glow-ring'
                : 'bg-bg-2 border border-border-default hover:border-border-hover'
            }`}
          >
            {tier.featured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-green text-black text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Star size={10} fill="currentColor" />
                Recommended
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-1">{tier.name}</h3>
              {tier.description && (
                <p className="text-[11px] text-text-3">{tier.description}</p>
              )}
            </div>

            <div className="mb-4">
              <PriceText block={block} tier={tier} index={i} color={props.priceColor} />
              {tier.period && (
                <span className="text-text-3 text-sm">{tier.period}</span>
              )}
            </div>

            <ul className="space-y-2 mb-6 flex-1">
              {tier.features.map((feature, j) => (
                <li key={j} className="flex items-start gap-2 text-[12.5px] text-text-1">
                  <Check size={14} className="text-green shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href={tier.ctaUrl || "#enquire"}
              target={tier.ctaTarget || "_self"}
              rel={tier.ctaTarget === "_blank" ? "noopener noreferrer" : undefined}
              className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tier.featured
                  ? 'bg-green text-black hover:bg-green-dim hover:accent-glow-lg'
                  : 'bg-bg-3 text-text-0 border border-border-default hover:bg-bg-4 hover:border-border-hover'
              }`}
            >
              {tier.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}

function PricingComparison({ block, props }: { block: BlockConfig; props: PricingProps }) {
  const tiers = props.tiers || defaultTiers
  const allFeatures = [...new Set(tiers.flatMap((t) => t.features))]

  return (
    <section className="px-6 @md:px-10 py-16 @md:py-20">
      <div className="reveal-fade-up reveal-d1 text-center mb-10">
        <El block={block} id="pricing:title" as="h2" className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">{props.title}</El>
        {props.subtitle && (
          <El block={block} id="pricing:subtitle" as="p" className="text-text-2 text-sm max-w-lg mx-auto">{props.subtitle}</El>
        )}
      </div>

      <div className="reveal-fade-up reveal-d2 max-w-3xl mx-auto overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-border-default">
              <th className="py-3 px-3 text-text-3 font-medium">Feature</th>
              {tiers.map((tier, i) => (
                <th key={i} className={`py-3 px-3 text-center font-semibold ${tier.featured ? 'text-green' : 'text-text-0'}`}>
                  {tier.name}
                  <El
                    block={block}
                    id={tierPriceId(tier, i)}
                    as="div"
                    className="text-lg font-bold mt-0.5"
                    style={{ color: tier.priceColor || props.priceColor || undefined }}
                  >
                    {tier.price}
                  </El>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allFeatures.map((feature, i) => (
              <tr key={i} className="border-b border-border-subtle">
                <td className="py-2.5 px-3 text-text-1">{feature}</td>
                {tiers.map((tier, j) => (
                  <td key={j} className="py-2.5 px-3 text-center">
                    {tier.features.includes(feature) ? (
                      <Check size={14} className="text-green mx-auto" />
                    ) : (
                      <span className="text-text-3">-</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PricingBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as PricingProps

  switch (block.variant) {
    case 'comparison':
      return <PricingComparison block={block} props={props} />
    default:
      return <PricingSimple block={block} props={props} />
  }
}
