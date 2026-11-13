// Footer link lists stored as a string, one line each — the format the modern
// footer's parseLinks() reads:
//   # Heading                  → sub-heading (no link)
//   Label                      → plain text (no link)
//   Label | URL                → link (https://, /page, #section-id, tel:, mailto:)
//   Label | URL | new          → same, always in a new tab
//   Label | URL | same         → same, always in this tab
// Without a flag, https:// links open in a new tab and the rest in this tab.
// These helpers back the list editor in the inspector.
export type LinkTarget = "auto" | "_self" | "_blank";
export type LinkLine = { heading: boolean; label: string; href: string; target: LinkTarget };

export function parseLinkLines(v: string): LinkLine[] {
  return v
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("# ")) return { heading: true, label: line.slice(2).trim(), href: "", target: "auto" as const };
      const [label = "", href = "", flag = ""] = line.split("|").map((s) => s.trim());
      const f = flag.toLowerCase();
      return { heading: false, label, href, target: f === "new" ? "_blank" : f === "same" ? "_self" : "auto" };
    });
}

export function serializeLinkLines(items: LinkLine[]): string {
  const clean = (s: string) => s.replace(/[|\r\n]/g, "").trim();
  return items
    .map((it) => {
      const label = clean(it.label);
      if (!label) return "";
      if (it.heading) return `# ${label}`;
      const href = clean(it.href);
      if (!href) return label;
      if (it.target === "_blank") return `${label} | ${href} | new`;
      if (it.target === "_self") return `${label} | ${href} | same`;
      return `${label} | ${href}`;
    })
    .filter(Boolean)
    .join("\n");
}
