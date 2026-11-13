// Menu items stored as a string, one item per line — the format the iPixxel
// hero's navLinks() parses:
//   Label                      → scrolls to #label-slug
//   Label | section-id         → scrolls to #section-id
//   Label | https://… or /page → opens the link
//   Label | <link> | new       → same, in a new tab
// These helpers back the list editor in the inspector.
export type NavLine = { label: string; href: string; newTab: boolean }

const SLUG = /^[a-z0-9-]+$/i

export function parseNavLines(v: string): NavLine[] {
  return v
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = '', target = '', flag = ''] = line.split('|').map((s) => s.trim())
      return {
        label,
        href: SLUG.test(target) ? `#${target}` : target,
        newTab: flag.toLowerCase() === 'new',
      }
    })
}

export function serializeNavLines(items: NavLine[]): string {
  const clean = (s: string) => s.replace(/[|\r\n]/g, '').trim()
  return items
    .map((it) => {
      const label = clean(it.label)
      if (!label) return ''
      const href = clean(it.href)
      if (it.newTab) return `${label} | ${href} | new`
      return href ? `${label} | ${href}` : label
    })
    .filter(Boolean)
    .join('\n')
}
