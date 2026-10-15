import type { BlockConfig } from '../types'

interface FooterProps {
  logo: string
  logoImage?: string
  copyright: string
  links?: string[]
  tagline?: string
  phone?: string
  email?: string
  address?: string
  socials?: string[]
  columns?: { title: string; links: string[] }[]
}

function FooterSimple({ props }: { props: FooterProps }) {
  return (
    <footer className="px-6 @md:px-10 py-8 border-t border-border-subtle">
      <div className="flex flex-col @lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {props.logoImage ? (
            <img src={props.logoImage} alt={props.logo} className="h-6 w-auto object-contain" />
          ) : (
            <div className="w-6 h-6 rounded-md bg-green/10 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-green" />
            </div>
          )}
          <span className="text-sm font-semibold text-text-1">{props.logo}</span>
        </div>

        <div className="flex items-center gap-4">
          {(props.links ?? []).map((link, i) => (
            <span
              key={i}
              className="text-[12px] text-text-3 hover:text-text-1 transition-colors cursor-pointer"
            >
              {link}
            </span>
          ))}
        </div>

        <span className="text-[11px] text-text-3">{props.copyright}</span>
      </div>
    </footer>
  )
}

function FooterMultiColumn({ props }: { props: FooterProps }) {
  const columns = props.columns || [
    { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
    { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
    { title: 'Resources', links: ['Documentation', 'API Reference', 'Guides', 'Community'] },
    { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'Cookie Policy'] },
  ]

  return (
    <footer className="px-6 @md:px-10 py-12 border-t border-border-subtle">
      <div className="grid grid-cols-2 @2xl:grid-cols-5 gap-8 mb-10">
        {/* Brand column */}
        <div className="col-span-2 @2xl:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            {props.logoImage ? (
              <img src={props.logoImage} alt={props.logo} className="h-7 w-auto object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-md bg-green/10 flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-green" />
              </div>
            )}
            <span className="text-sm font-semibold">{props.logo}</span>
          </div>
          <p className="text-[12px] text-text-3 leading-relaxed max-w-[220px]">
            {props.tagline || "A thoughtfully planned address for contemporary living."}
          </p>
          {props.address ? <p className="text-[12px] text-text-3 mt-3">{props.address}</p> : null}
          {props.phone ? <p className="text-[12px] text-text-2 mt-1">{props.phone}</p> : null}
          {props.email ? <p className="text-[12px] text-text-2">{props.email}</p> : null}
          {props.socials?.length ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {props.socials.map((s) => (
                <span key={s} className="text-[11px] text-text-3 hover:text-text-1 cursor-pointer">{s}</span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Link columns */}
        {columns.map((col, i) => (
          <div key={i}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-2 mb-3">
              {col.title}
            </h4>
            <ul className="space-y-2">
              {col.links.map((link, j) => (
                <li key={j}>
                  <span className="text-[12.5px] text-text-3 hover:text-text-1 transition-colors cursor-pointer">
                    {link}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="pt-6 border-t border-border-subtle flex flex-col @lg:flex-row items-center justify-between gap-3">
        <span className="text-[11px] text-text-3">{props.copyright}</span>
        <div className="flex gap-4">
          {(props.links ?? []).map((link, i) => (
            <span
              key={i}
              className="text-[11px] text-text-3 hover:text-text-1 transition-colors cursor-pointer"
            >
              {link}
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}

function FooterMinimal({ props }: { props: FooterProps }) {
  const links = props.links ?? []
  return (
    <footer className="px-6 @md:px-10 py-6">
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-3">
        <span>{props.copyright}</span>
        {links.length > 0 && <span className="mx-1">|</span>}
        {links.map((link, i) => (
          <span key={i}>
            <span className="hover:text-text-1 transition-colors cursor-pointer">{link}</span>
            {i < links.length - 1 && <span className="mx-1">|</span>}
          </span>
        ))}
      </div>
    </footer>
  )
}

function FooterPremium({ props }: { props: FooterProps }) {
  const columns = props.columns || [
    { title: 'Explore', links: ['Overview', 'Amenities', 'Floor Plans', 'Pricing'] },
    { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
    { title: 'Resources', links: ['Documentation', 'Guides', 'RERA Info', 'Community'] },
  ]

  return (
    <footer className="px-6 @md:px-10 pt-14 pb-8 bg-bg-2/60">
      <div className="grid grid-cols-1 @2xl:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10 mb-12">
        <div>
          <div className="flex items-center gap-2 mb-3">
            {props.logoImage ? (
              <img src={props.logoImage} alt={props.logo} className="h-7 w-auto object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-md bg-green/10 flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-green" />
              </div>
            )}
            <span className="text-sm font-semibold">{props.logo}</span>
          </div>
          <p className="text-[12px] text-text-3 leading-relaxed max-w-[260px]">
            {props.tagline || "A thoughtfully planned address for contemporary living."}
          </p>
          <div className="mt-5 flex items-center gap-2 max-w-[300px]">
            <input
              type="text"
              placeholder="Email address"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border-default bg-bg-1 text-text-0 text-[12px] placeholder:text-text-3 outline-none"
            />
            <button className="shrink-0 px-4 py-2 rounded-lg bg-green text-black text-[12px] font-semibold hover:bg-green-dim transition-all">
              Subscribe
            </button>
          </div>
          <div className="flex flex-wrap gap-4 mt-5 text-text-3 text-[11px]">
            {props.phone ? <span>{props.phone}</span> : null}
            {props.email ? <span>{props.email}</span> : null}
          </div>
        </div>

        {columns.map((col, i) => (
          <div key={i}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-2 mb-3">
              {col.title}
            </h4>
            <ul className="space-y-2">
              {col.links.map((link, j) => (
                <li key={j}>
                  <span className="text-[12.5px] text-text-3 hover:text-text-1 transition-colors cursor-pointer">
                    {link}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-border-subtle flex flex-col @lg:flex-row items-center justify-between gap-3">
        <span className="text-[11px] text-text-3">{props.copyright}</span>
        <div className="flex gap-4">
          {props.socials?.map((s, i) => (
            <span
              key={i}
              className="w-7 h-7 rounded-full border border-border-subtle bg-bg-1 flex items-center justify-center text-[11px] text-text-3 hover:text-green hover:border-green/40 transition-colors cursor-pointer"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}

function FooterContact({ props }: { props: FooterProps }) {
  const columns = props.columns || [
    { title: 'Explore', links: ['Overview', 'Amenities', 'Floor Plans', 'Pricing'] },
    { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
    { title: 'Resources', links: ['Documentation', 'Guides', 'RERA Info', 'Community'] },
  ]
  const contactCards = [
    { label: 'Call', value: props.phone || '+91 98765 43210' },
    { label: 'Email', value: props.email || 'hello@builders.com' },
    { label: 'Site Office', value: props.address || 'Whitefield, Bengaluru' },
  ]

  return (
    <footer className="px-6 @md:px-10 py-14 border-t border-border-subtle">
      <div className="grid grid-cols-1 @md:grid-cols-3 gap-4 mb-12">
        {contactCards.map((card, i) => (
          <div
            key={i}
            className="rounded-xl border border-border-subtle bg-bg-2/60 px-4 py-4"
          >
            <div className="text-[10px] uppercase tracking-wider text-text-3 mb-1">{card.label}</div>
            <div className="text-[13px] font-medium text-text-0">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-10 mb-10">
        <div className="col-span-2 @2xl:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            {props.logoImage ? (
              <img src={props.logoImage} alt={props.logo} className="h-7 w-auto object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-md bg-green/10 flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-green" />
              </div>
            )}
            <span className="text-sm font-semibold">{props.logo}</span>
          </div>
          <p className="text-[12px] text-text-3 leading-relaxed max-w-[220px]">
            {props.tagline || "A thoughtfully planned address for contemporary living."}
          </p>
        </div>
        {columns.map((col, i) => (
          <div key={i}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-2 mb-3">
              {col.title}
            </h4>
            <ul className="space-y-2">
              {col.links.map((link, j) => (
                <li key={j}>
                  <span className="text-[12.5px] text-text-3 hover:text-text-1 transition-colors cursor-pointer">
                    {link}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-border-subtle flex flex-col @lg:flex-row items-center justify-between gap-3">
        <span className="text-[11px] text-text-3">{props.copyright}</span>
        <div className="flex gap-4">
          {(props.links ?? []).map((link, i) => (
            <span
              key={i}
              className="text-[11px] text-text-3 hover:text-text-1 transition-colors cursor-pointer"
            >
              {link}
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}

export function FooterBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as FooterProps

  switch (block.variant) {
    case 'multi-column':
      return <FooterMultiColumn props={props} />
    case 'minimal':
      return <FooterMinimal props={props} />
    case 'premium':
      return <FooterPremium props={props} />
    case 'contact':
      return <FooterContact props={props} />
    default:
      return <FooterSimple props={props} />
  }
}
