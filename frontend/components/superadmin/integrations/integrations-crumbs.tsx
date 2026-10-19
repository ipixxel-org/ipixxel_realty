"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { INTEGRATIONS, INTEGRATIONS_HREF } from "@/lib/integrations";

const linkStyle = { color: "inherit", textDecoration: "none", fontWeight: 600 } as const;

/** "← Integrations / SMTP" above every integration sub-page; hidden on the grid itself. */
export function IntegrationsCrumbs() {
  const pathname = usePathname();
  const current = INTEGRATIONS.find(
    (it) => pathname === it.href || pathname.startsWith(`${it.href}/`),
  );
  if (!current) return null;
  const sub = current.subPages?.find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));

  return (
    <nav
      aria-label="Breadcrumb"
      className="muted"
      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}
    >
      <Link href={INTEGRATIONS_HREF} style={{ ...linkStyle, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="chevron-left" size={14} /> Integrations
      </Link>
      <span aria-hidden>/</span>
      {sub ? (
        <>
          <Link href={current.href} style={linkStyle}>
            {current.crumb}
          </Link>
          <span aria-hidden>/</span>
          <span aria-current="page" style={{ color: "var(--ink, #0f172a)", fontWeight: 600 }}>
            {sub.crumb}
          </span>
        </>
      ) : (
        <span aria-current="page" style={{ color: "var(--ink, #0f172a)", fontWeight: 600 }}>
          {current.crumb}
        </span>
      )}
    </nav>
  );
}
