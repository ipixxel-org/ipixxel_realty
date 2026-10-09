"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Btn } from "@/components/openpage/ui";
import type { LandingPageData } from "@/lib/openpage/types";

export function ModuleShell({ children }: { children: ReactNode }) {
  return <div className="ps-module-shell">{children}</div>;
}

export function ModuleHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ps-module-header">
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, color: "var(--ps-ink)" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ps-muted)", marginTop: 4, maxWidth: 620, lineHeight: 1.5 }}>{description}</div>
      </div>
      {actions ? <div className="ps-module-actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  delta?: string;
  icon: ReactNode;
  tone?: "primary" | "secondary" | "success" | "neutral";
}) {
  const tones = {
    primary: { bg: "var(--ps-primary-soft)", color: "var(--ps-primary)" },
    secondary: { bg: "var(--ps-secondary-soft)", color: "var(--ps-secondary-dark)" },
    success: { bg: "var(--ps-success-soft)", color: "var(--ps-success)" },
    neutral: { bg: "#eef0f5", color: "var(--ps-slate)" },
  };
  return (
    <div className="ps-card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, background: tones[tone].bg, color: tones[tone].color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ps-ink)", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: "var(--ps-muted)", fontWeight: 600, marginTop: 2 }}>{label}</div>
      </div>
      {delta ? <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "var(--ps-success)", background: "var(--ps-success-soft)", padding: "3px 8px", borderRadius: 999 }}>{delta}</span> : null}
    </div>
  );
}

export function Table({
  head,
  rows,
  rowKey,
}: {
  head: ReactNode[];
  rows: { cells: ReactNode[]; selected?: boolean; onClick?: () => void; menu?: ReactNode }[];
  rowKey?: (i: number) => string;
}) {
  return (
    <div className="ps-table-wrap" style={{ background: "var(--ps-panel)", border: "1px solid var(--ps-line)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${head.length},minmax(0,1fr))`, padding: "11px 18px", background: "var(--ps-bg)", borderBottom: "1px solid var(--ps-line)", gap: 12 }}>
        {head.map((h, i) => (
          <div key={i} style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--ps-muted)" }}>
            {h}
          </div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={rowKey ? rowKey(i) : i}
          onClick={r.onClick}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${head.length},minmax(0,1fr))`,
            padding: "12px 18px",
            borderBottom: i < rows.length - 1 ? "1px solid var(--ps-line)" : "none",
            alignItems: "center",
            gap: 12,
            cursor: r.onClick ? "pointer" : "default",
            background: r.selected ? "var(--ps-primary-mist)" : "transparent",
            transition: "background .12s",
          }}
        >
          {r.cells}
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: "published" | "draft" | "scheduled" | "password" | "live" | "unpublished" | "connected" | "pending" | "error" }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    published: { label: "Published", bg: "var(--ps-success-soft)", fg: "var(--ps-success)" },
    live: { label: "Live", bg: "var(--ps-success-soft)", fg: "var(--ps-success)" },
    connected: { label: "Connected", bg: "var(--ps-success-soft)", fg: "var(--ps-success)" },
    draft: { label: "Draft", bg: "var(--ps-surface-muted)", fg: "var(--ps-muted)" },
    scheduled: { label: "Scheduled", bg: "var(--ps-warn-soft)", fg: "var(--ps-warn)" },
    password: { label: "Password", bg: "var(--ps-secondary-soft)", fg: "var(--ps-secondary-dark)" },
    unpublished: { label: "Unpublished", bg: "var(--ps-surface-muted)", fg: "var(--ps-muted)" },
    pending: { label: "Pending DNS", bg: "var(--ps-warn-soft)", fg: "var(--ps-warn)" },
    error: { label: "Error", bg: "var(--ps-danger-soft)", fg: "var(--ps-danger)" },
  };
  const s = map[status] ?? map.draft;
  return <span className="ps-chip" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

export function RowMenu({
  items,
}: {
  items?: { label: string; onClick: () => void; danger?: boolean; hidden?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const visible = (items ?? []).filter((i) => !i.hidden);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        title="More actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{ background: "none", border: "none", color: "var(--ps-muted)", cursor: "pointer", padding: 4, display: "inline-flex" }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          className="ps-card ps-fade-in"
          style={{ position: "absolute", right: 0, top: 28, zIndex: 80, minWidth: 188, padding: 6, boxShadow: "var(--ps-shadow-lg)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {visible.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--ps-muted)" }}>No actions</div>
          ) : (
            visible.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  textAlign: "left",
                  gap: 8,
                  padding: "8px 10px",
                  border: "none",
                  borderRadius: 8,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: item.danger ? "var(--ps-danger)" : "var(--ps-ink)",
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PrimaryAction({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick?: () => void }) {
  return (
    <Btn variant="primary" icon={icon ?? <Plus size={15} />} onClick={onClick}>
      {label}
    </Btn>
  );
}

export function Pills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          style={{ padding: "7px 14px", borderRadius: 999, border: value === o ? "1.5px solid var(--ps-primary)" : "1px solid var(--ps-line-strong)", background: value === o ? "var(--ps-primary-soft)" : "var(--ps-panel-raised)", color: value === o ? "var(--ps-primary)" : "var(--ps-slate)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function SiteScopeBar({
  pages,
  activeId,
  label = "Editing this template",
}: {
  pages: LandingPageData[];
  activeId: string;
  onChange?: (id: string) => void;
  label?: string;
}) {
  const active = pages.find((p) => p.id === activeId) ?? pages[0];
  if (!active) return null;
  return (
    <div className="ps-scope-bar">
      <span className="ps-scope-bar-label">{label}</span>
      <span className="ps-scope-bar-name">{active.name}</span>
      <span className="ps-scope-bar-meta">
        {active.domain || "No domain"} · /{active.slug}
      </span>
    </div>
  );
}