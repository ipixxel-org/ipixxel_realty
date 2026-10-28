import type { BlockConfig } from '../types'
import { El } from '../El'
import { listElementId, subElementId } from '@/lib/openpage/element-style'
import { isMediaSrc } from '@/lib/media'

interface FooterLink {
  id: string
  label: string
  url: string
}

interface FooterSocial extends FooterLink {
  icon: string
}

interface FooterColumn {
  id: string
  title: string
  links: FooterLink[]
}

const SAMPLE_TAGLINE = 'A thoughtfully planned address for contemporary living.'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** A text field that shows a sample only until the user sets it — even to empty. */
function optionalText(value: unknown, sample: string): string {
  return typeof value === 'string' ? value : sample
}

/**
 * Normalised footer content. The editable lists (`menuLinks`, `socialLinks`,
 * `linkColumns`) win; older footers that only have the legacy string lists
 * (`links`, `socials`, `columns`) still render from those.
 */
function footerData(p: Record<string, unknown>) {
  const objects = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>).filter((x) => x && typeof x === 'object') : null)
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [])
  const itemId = (list: string, item: Record<string, unknown> | null, i: number) =>
    listElementId({ path: [list] }, (item && typeof item._id === 'string' && item._id) || `idx_${i}`)

  const menu = objects(p.menuLinks)
  const links: FooterLink[] = menu
    ? menu.map((l, i) => ({ id: itemId('menuLinks', l, i), label: str(l.label), url: str(l.url) })).filter((l) => l.label)
    : strings(p.links).map((label, i) => ({ id: itemId('menuLinks', null, i), label, url: `#${slug(label)}` }))

  const social = objects(p.socialLinks)
  const socials: FooterSocial[] = social
    ? social
        .map((s, i) => ({ id: itemId('socialLinks', s, i), label: str(s.label), url: str(s.url), icon: str(s.icon) }))
        .filter((s) => s.label || s.icon)
    : strings(p.socials).map((label, i) => ({ id: itemId('socialLinks', null, i), label, url: '', icon: '' }))

  const parseLines = (text: string, base: string): FooterLink[] =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, j) => {
        const [label, url] = line.split('|').map((part) => part.trim())
        return { id: subElementId(base, `link-${j}`), label, url: url || `#${slug(label)}` }
      })
  const cols = objects(p.linkColumns)
  const legacyCols = objects(p.columns)
  const columns: FooterColumn[] | null = cols
    ? cols.map((c, i) => {
        const id = itemId('linkColumns', c, i)
        return { id, title: str(c.title), links: parseLines(str(c.links), id) }
      })
    : legacyCols
      ? legacyCols.map((c, i) => {
          const id = itemId('linkColumns', null, i)
          return { id, title: str(c.title), links: parseLines(strings(c.links).join('\n'), id) }
        })
      : null

  return { links, socials, columns }
}

function linkProps(url: string) {
  const external = /^https?:\/\//i.test(url)
  return {
    href: url || '#',
    target: external ? '_blank' : undefined,
    rel: external ? 'noopener noreferrer' : undefined,
  }
}

interface FooterViewProps {
  block: BlockConfig
  p: Record<string, unknown>
  data: ReturnType<typeof footerData>
}

function Brand({ block, p, size }: { block: BlockConfig; p: Record<string, unknown>; size: 'sm' | 'md' }) {
  const logo = str(p.logo)
  const logoImage = str(p.logoImage)
  const box = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7'
  return (
    <El block={block} id="footer:brand" className="flex items-center gap-2">
      {logoImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoImage} alt={logo} className={`${size === 'sm' ? 'h-6' : 'h-7'} w-auto object-contain`} />
      ) : (
        <div className={`${box} rounded-md bg-green/10 flex items-center justify-center`}>
          <div className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} rounded-full bg-green`} />
        </div>
      )}
      {logo ? (
        <El block={block} id="footer:logo" as="span" className="text-sm font-semibold text-text-1">
          {logo}
        </El>
      ) : null}
    </El>
  )
}

function Tagline({ block, p, className }: { block: BlockConfig; p: Record<string, unknown>; className: string }) {
  const tagline = optionalText(p.tagline, SAMPLE_TAGLINE)
  return tagline ? (
    <El block={block} id="footer:tagline" as="p" className={className}>
      {tagline}
    </El>
  ) : null
}

function Copyright({ block, p, className }: { block: BlockConfig; p: Record<string, unknown>; className: string }) {
  const text = str(p.copyright)
  return text ? (
    <El block={block} id="footer:copyright" as="span" className={className}>
      {text}
    </El>
  ) : null
}

function Links({ block, links, className }: { block: BlockConfig; links: FooterLink[]; className: string }) {
  return (
    <>
      {links.map((link) => (
        <El key={link.id} block={block} id={link.id} as="a" {...linkProps(link.url)} className={className}>
          {link.label}
        </El>
      ))}
    </>
  )
}

function Socials({ block, socials, round }: { block: BlockConfig; socials: FooterSocial[]; round?: boolean }) {
  if (!socials.length) return null
  return (
    <div className="flex flex-wrap items-center gap-3">
      {socials.map((s) => (
        <El
          key={s.id}
          block={block}
          id={s.id}
          as="a"
          {...linkProps(s.url)}
          aria-label={s.label || 'Social link'}
          className={
            round || s.icon
              ? 'w-8 h-8 rounded-full border border-border-subtle bg-bg-1 flex items-center justify-center text-[11px] text-text-3 hover:text-green hover:border-green/40 transition-colors overflow-hidden'
              : 'text-[11px] text-text-3 hover:text-text-1 transition-colors'
          }
        >
          {isMediaSrc(s.icon) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.icon} alt={s.label} className="w-4 h-4 object-contain" />
          ) : (
            s.label
          )}
        </El>
      ))}
    </div>
  )
}

function Columns({ block, columns }: { block: BlockConfig; columns: FooterColumn[] }) {
  return (
    <>
      {columns.map((col) => (
        <El key={col.id} block={block} id={col.id}>
          {col.title ? (
            <El block={block} id={subElementId(col.id, 'title')} as="h4" className="text-[11px] font-semibold uppercase tracking-wider text-text-2 mb-3">
              {col.title}
            </El>
          ) : null}
          <ul className="space-y-2">
            {col.links.map((link) => (
              <li key={link.id}>
                <a {...linkProps(link.url)} className="text-[12.5px] text-text-3 hover:text-text-1 transition-colors">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </El>
      ))}
    </>
  )
}

function ContactLines({ block, p, className }: { block: BlockConfig; p: Record<string, unknown>; className: string }) {
  return (
    <>
      {str(p.address) ? <El block={block} id="footer:address" as="p" className={`${className} mt-3`}>{str(p.address)}</El> : null}
      {str(p.phone) ? <El block={block} id="footer:phone" as="p" className={`${className} mt-1`}>{str(p.phone)}</El> : null}
      {str(p.email) ? <El block={block} id="footer:email" as="p" className={className}>{str(p.email)}</El> : null}
    </>
  )
}

function FooterSimple({ block, p, data }: FooterViewProps) {
  return (
    <footer className="px-6 @md:px-10 py-8 border-t border-border-subtle">
      <div className="flex flex-col @lg:flex-row items-center justify-between gap-4">
        <Brand block={block} p={p} size="sm" />
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Links block={block} links={data.links} className="text-[12px] text-text-3 hover:text-text-1 transition-colors" />
        </div>
        <div className="flex flex-col items-center @lg:items-end gap-2">
          <Socials block={block} socials={data.socials} />
          <Copyright block={block} p={p} className="text-[11px] text-text-3" />
        </div>
      </div>
    </footer>
  )
}

const MULTI_COLUMN_SAMPLE: FooterColumn[] = [
  { title: 'Product', items: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
  { title: 'Company', items: ['About', 'Blog', 'Careers', 'Press'] },
  { title: 'Resources', items: ['Documentation', 'API Reference', 'Guides', 'Community'] },
  { title: 'Legal', items: ['Privacy', 'Terms', 'Security', 'Cookie Policy'] },
].map((c, i) => ({
  id: `linkColumns:sample_${i}`,
  title: c.title,
  links: c.items.map((label, j) => ({ id: `linkColumns:sample_${i}/link-${j}`, label, url: `#${slug(label)}` })),
}))

const EXPLORE_SAMPLE: FooterColumn[] = [
  { title: 'Explore', items: ['Overview', 'Amenities', 'Floor Plans', 'Pricing'] },
  { title: 'Company', items: ['About', 'Blog', 'Careers', 'Press'] },
  { title: 'Resources', items: ['Documentation', 'Guides', 'RERA Info', 'Community'] },
].map((c, i) => ({
  id: `linkColumns:sample_${i}`,
  title: c.title,
  links: c.items.map((label, j) => ({ id: `linkColumns:sample_${i}/link-${j}`, label, url: `#${slug(label)}` })),
}))

function FooterMultiColumn({ block, p, data }: FooterViewProps) {
  const columns = data.columns ?? MULTI_COLUMN_SAMPLE
  return (
    <footer className="px-6 @md:px-10 py-12 border-t border-border-subtle">
      <div className="grid grid-cols-2 @2xl:grid-cols-5 gap-8 mb-10">
        <div className="col-span-2 @2xl:col-span-1">
          <div className="mb-3"><Brand block={block} p={p} size="md" /></div>
          <Tagline block={block} p={p} className="text-[12px] text-text-3 leading-relaxed max-w-[220px]" />
          <ContactLines block={block} p={p} className="text-[12px] text-text-2" />
          {data.socials.length ? <div className="mt-3"><Socials block={block} socials={data.socials} /></div> : null}
        </div>
        <Columns block={block} columns={columns} />
      </div>

      <div className="pt-6 border-t border-border-subtle flex flex-col @lg:flex-row items-center justify-between gap-3">
        <Copyright block={block} p={p} className="text-[11px] text-text-3" />
        <div className="flex flex-wrap gap-4">
          <Links block={block} links={data.links} className="text-[11px] text-text-3 hover:text-text-1 transition-colors" />
        </div>
      </div>
    </footer>
  )
}

function FooterMinimal({ block, p, data }: FooterViewProps) {
  return (
    <footer className="px-6 @md:px-10 py-6">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-text-3">
        <Copyright block={block} p={p} className="" />
        <Links block={block} links={data.links} className="hover:text-text-1 transition-colors" />
      </div>
      {data.socials.length ? <div className="mt-3 flex justify-center"><Socials block={block} socials={data.socials} /></div> : null}
    </footer>
  )
}

function FooterPremium({ block, p, data }: FooterViewProps) {
  const columns = data.columns ?? EXPLORE_SAMPLE
  return (
    <footer className="px-6 @md:px-10 pt-14 pb-8 bg-bg-2/60">
      <div className="grid grid-cols-1 @2xl:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10 mb-12">
        <div>
          <div className="mb-3"><Brand block={block} p={p} size="md" /></div>
          <Tagline block={block} p={p} className="text-[12px] text-text-3 leading-relaxed max-w-[260px]" />
          <div className="mt-5 flex items-center gap-2 max-w-[300px]">
            <input
              type="text"
              placeholder="Email address"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border-default bg-bg-1 text-text-0 text-[12px] placeholder:text-text-3 outline-none"
            />
            <button type="button" className="shrink-0 px-4 py-2 rounded-lg bg-green text-black text-[12px] font-semibold hover:bg-green-dim transition-all">
              Subscribe
            </button>
          </div>
          <div className="flex flex-wrap gap-4 mt-5 text-text-3 text-[11px]">
            {str(p.phone) ? <El block={block} id="footer:phone" as="span">{str(p.phone)}</El> : null}
            {str(p.email) ? <El block={block} id="footer:email" as="span">{str(p.email)}</El> : null}
          </div>
        </div>
        <Columns block={block} columns={columns} />
      </div>

      <div className="pt-6 border-t border-border-subtle flex flex-col @lg:flex-row items-center justify-between gap-3">
        <Copyright block={block} p={p} className="text-[11px] text-text-3" />
        <div className="flex flex-wrap items-center gap-4">
          <Links block={block} links={data.links} className="text-[11px] text-text-3 hover:text-text-1 transition-colors" />
          <Socials block={block} socials={data.socials} round />
        </div>
      </div>
    </footer>
  )
}

function FooterContact({ block, p, data }: FooterViewProps) {
  const columns = data.columns ?? EXPLORE_SAMPLE
  // Sample values show until a field is set; clearing a field hides its card.
  const contactCards = [
    { key: 'phone', label: 'Call', value: optionalText(p.phone, '+91 98765 43210') },
    { key: 'email', label: 'Email', value: optionalText(p.email, 'hello@builders.com') },
    { key: 'address', label: 'Site Office', value: optionalText(p.address, 'Whitefield, Bengaluru') },
  ].filter((c) => c.value)

  return (
    <footer className="px-6 @md:px-10 py-14 border-t border-border-subtle">
      {contactCards.length ? (
        <div className="grid grid-cols-1 @md:grid-cols-3 gap-4 mb-12">
          {contactCards.map((card) => (
            <El key={card.key} block={block} id={`footer:${card.key}Card`} className="rounded-xl border border-border-subtle bg-bg-2/60 px-4 py-4">
              <div className="text-[10px] uppercase tracking-wider text-text-3 mb-1">{card.label}</div>
              <div className="text-[13px] font-medium text-text-0">{card.value}</div>
            </El>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-10 mb-10">
        <div className="col-span-2 @2xl:col-span-1">
          <div className="mb-3"><Brand block={block} p={p} size="md" /></div>
          <Tagline block={block} p={p} className="text-[12px] text-text-3 leading-relaxed max-w-[220px]" />
          {data.socials.length ? <div className="mt-4"><Socials block={block} socials={data.socials} /></div> : null}
        </div>
        <Columns block={block} columns={columns} />
      </div>

      <div className="pt-6 border-t border-border-subtle flex flex-col @lg:flex-row items-center justify-between gap-3">
        <Copyright block={block} p={p} className="text-[11px] text-text-3" />
        <div className="flex flex-wrap gap-4">
          <Links block={block} links={data.links} className="text-[11px] text-text-3 hover:text-text-1 transition-colors" />
        </div>
      </div>
    </footer>
  )
}

export function FooterBlock({ block }: { block: BlockConfig }) {
  const p = block.props as Record<string, unknown>
  const view = { block, p, data: footerData(p) }

  switch (block.variant) {
    case 'multi-column':
      return <FooterMultiColumn {...view} />
    case 'minimal':
      return <FooterMinimal {...view} />
    case 'premium':
      return <FooterPremium {...view} />
    case 'contact':
      return <FooterContact {...view} />
    default:
      return <FooterSimple {...view} />
  }
}
