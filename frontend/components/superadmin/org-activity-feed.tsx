"use client";

import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import type { OrganisationActivityRow } from "@/lib/types";

// Super Admin → Organisation → Activity. Read-only feed of the org's audit log
// rows: grouped by day, categorised (icon + colour + filter chips), searchable
// and paginated. Presentation only — data comes from /admin/organisations/:id/activity.

const PAGE_SIZE = 10;

type CategoryKey =
  | "profile"
  | "domains"
  | "landing"
  | "billing"
  | "projects"
  | "team"
  | "templates"
  | "other";

const CATEGORIES: Record<CategoryKey, { label: string; icon: IconName; fg: string; bg: string }> = {
  profile: { label: "Organisation", icon: "building", fg: "#2563eb", bg: "#eff6ff" },
  domains: { label: "Domains", icon: "globe", fg: "#0891b2", bg: "#ecfeff" },
  landing: { label: "Landing pages", icon: "landing", fg: "#7c3aed", bg: "#f5f3ff" },
  billing: { label: "Subscription", icon: "billing", fg: "#059669", bg: "#ecfdf5" },
  projects: { label: "Projects", icon: "properties", fg: "#d97706", bg: "#fffbeb" },
  team: { label: "Team", icon: "users", fg: "#db2777", bg: "#fdf2f8" },
  templates: { label: "Templates", icon: "templates", fg: "#4f46e5", bg: "#eef2ff" },
  other: { label: "Other", icon: "activity", fg: "#64748b", bg: "#f1f5f9" },
};

function categoryOf(action: string): CategoryKey {
  const a = action.toLowerCase();
  if (a.includes("domain")) return "domains";
  if (a.includes("landing_page")) return "landing";
  if (a.includes("template")) return "templates";
  if (/subscription|package_change|payment|razorpay|invoice/.test(a)) return "billing";
  if (/project|unit/.test(a)) return "projects";
  if (/team|member|user/.test(a)) return "team";
  if (a.startsWith("org_")) return "profile";
  return "other";
}

// Friendlier, sentence-case titles for the common actions; anything else
// falls back to "snake_case" → "Snake case".
const ACTION_TITLE: Record<string, string> = {
  org_profile_updated: "Organisation details updated",
  org_industry_changed: "Industry changed",
  org_onboarded: "Organisation onboarded",
  org_registered_pending: "Registered — awaiting approval",
  org_approved: "Organisation approved",
  org_rejected: "Organisation rejected",
  org_deleted: "Organisation deleted",
  org_templates_updated: "Templates updated",
  custom_domain_requested: "Custom domain requested",
  custom_domain_ssl_verified: "SSL certificate verified",
  custom_domain_unpublished: "Custom domain unpublished",
  org_domain_approved: "Domain request approved",
  org_domain_rejected: "Domain request rejected",
  org_domain_suspended: "Domain suspended",
  org_domain_reactivated: "Domain reactivated",
  landing_page_created: "Landing page created",
  landing_page_published: "Landing page published",
  landing_page_unpublished: "Landing page unpublished",
  landing_page_duplicated: "Landing page duplicated",
};

function titleFor(action: string): string {
  if (ACTION_TITLE[action]) return ACTION_TITLE[action];
  const words = action.split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  if (day === today) return "Today";
  if (day === today - 86_400_000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function OrgActivityFeed({ activity }: { activity: OrganisationActivityRow[] | null }) {
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => activity ?? [], [activity]);

  // Only offer chips for categories that actually occur, with counts.
  const counts = useMemo(() => {
    const c = new Map<CategoryKey, number>();
    for (const r of rows) {
      const k = categoryOf(r.action);
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && categoryOf(r.action) !== category) return false;
      if (!q) return true;
      return (
        titleFor(r.action).toLowerCase().includes(q) ||
        (r.entity ?? "").toLowerCase().includes(q) ||
        (r.actor?.name ?? "").toLowerCase().includes(q) ||
        (r.actor?.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, category, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Group the visible page by day, keeping order (rows are newest first).
  const groups: { label: string; items: OrganisationActivityRow[] }[] = [];
  for (const r of pageRows) {
    const label = dayLabel(r.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  const chip = (key: CategoryKey | "all", label: string, count: number) => {
    const on = category === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => {
          setCategory(key);
          setPage(1);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 999,
          border: on ? "1px solid #2563eb" : "1px solid #e2e8f0",
          background: on ? "#2563eb" : "#fff",
          color: on ? "#fff" : "#475569",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        <span
          style={{
            fontSize: 11,
            padding: "0 6px",
            borderRadius: 999,
            background: on ? "rgba(255,255,255,0.25)" : "#f1f5f9",
            color: on ? "#fff" : "#64748b",
          }}
        >
          {count}
        </span>
      </button>
    );
  };

  const pagerBtn = (disabled: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: disabled ? "#f1f5f9" : "#fff",
    color: disabled ? "#94a3b8" : "#334155",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #eef2f6", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#eff6ff",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="activity" size={17} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Activity</div>
              <div style={{ fontSize: 12.5, color: "#64748b" }}>
                {rows.length} event{rows.length === 1 ? "" : "s"} recorded for this organisation
              </div>
            </div>
          </div>
          <div style={{ position: "relative", minWidth: 220, flex: "0 1 280px" }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
              <Icon name="search" size={14} />
            </span>
            <input
              className="inp"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search activity or person…"
              style={{ paddingLeft: 32, height: 36, fontSize: 13, width: "100%" }}
            />
          </div>
        </div>
        {rows.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chip("all", "All", rows.length)}
            {(Object.keys(CATEGORIES) as CategoryKey[])
              .filter((k) => (counts.get(k) ?? 0) > 0)
              .map((k) => chip(k, CATEGORIES[k].label, counts.get(k) ?? 0))}
          </div>
        ) : null}
      </div>

      {/* Body */}
      <div style={{ padding: "6px 22px 18px" }}>
        {activity === null ? (
          <p className="muted" style={{ padding: "18px 0" }}>Loading activity…</p>
        ) : rows.length === 0 ? (
          <div style={{ padding: "36px 0", textAlign: "center", color: "#64748b" }}>
            <Icon name="activity" size={26} style={{ opacity: 0.4 }} />
            <div style={{ marginTop: 8, fontSize: 13.5 }}>No activity yet.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: "#64748b", fontSize: 13.5 }}>
            No activity matches this filter.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label + g.items[0].id}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                  padding: "16px 0 8px",
                }}
              >
                {g.label}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {g.items.map((r) => {
                  const cat = CATEGORIES[categoryOf(r.action)];
                  const who = r.actor?.name || r.actor?.email || "System";
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "12px 14px",
                        border: "1px solid #eef2f6",
                        borderRadius: 12,
                        background: "#fff",
                      }}
                    >
                      <div
                        aria-hidden
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: cat.bg,
                          color: cat.fg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name={cat.icon} size={17} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>{titleFor(r.action)}</div>
                        <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          by <span style={{ color: "#334155", fontWeight: 600 }}>{who}</span>
                          {r.actor?.name ? <> · {r.actor.email}</> : null}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: 999,
                          background: cat.bg,
                          color: cat.fg,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cat.label}
                      </span>
                      <div
                        style={{ textAlign: "right", minWidth: 72, flexShrink: 0 }}
                        title={new Date(r.createdAt).toLocaleString("en-GB")}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#334155" }}>{timeOf(r.createdAt)}</div>
                        <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{relative(r.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Pagination — only when there is more than one page */}
        {totalPages > 1 ? (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 600 }}>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length} events
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                style={pagerBtn(currentPage <= 1)}
              >
                <Icon name="chevron-left" size={14} /> Previous
              </button>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", padding: "0 8px" }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                style={pagerBtn(currentPage >= totalPages)}
              >
                Next <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
