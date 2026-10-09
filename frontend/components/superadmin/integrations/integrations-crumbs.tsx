"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { INTEGRATIONS, INTEGRATIONS_HREF } from "@/lib/integrations";

/** "← Integrations / SMTP" above every integration sub-page; hidden on the grid itself. */
export function IntegrationsCrumbs() {
  const pathname = usePathname();
  const current = INTEGRATIONS.find(
    (it) => pathname === it.href || pathname.startsWith(`${it.href}/`),
  );
  if (!current) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="muted"
      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}
    >
      <Link
        href={INTEGRATIONS_HREF}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "inherit", textDecoration: "none", fontWeight: 600 }}
      >
        <Icon name="chevron-left" size={14} /> Integrations
      </Link>
      <span aria-hidden>/</span>
      <span aria-current="page" style={{ color: "var(--ink, #0f172a)", fontWeight: 600 }}>
        {current.crumb}
      </span>
    </nav>
  );
}
