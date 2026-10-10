"use client";

import { useState } from "react";
import type * as React from "react";
import {
  BarChart3,
  Building2,
  Check,
  Copy,
  Megaphone,
  Palette,
  Search,
  Settings2,
  Share2,
  Type,
} from "lucide-react";
import type { SiteConfig, SiteSeo, SiteTracking } from "@/components/openpage/blocks/types";
import type { FormDefinition } from "@/lib/openpage/forms-store";
import type { BusinessSettings, HeadingStyle, LandingPageData, PageSettings, TypographySettings } from "@/lib/openpage/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { googleFontOptions } from "@/lib/openpage/theme-presets";
import { MediaPicker } from "@/components/media-picker";

const EMPTY_SETTINGS: PageSettings = {
  theme: {},
  typography: {},
  business: {},
  socialLinks: [],
  page: {},
};

const PLATFORMS = ["Instagram", "Facebook", "LinkedIn", "Twitter / X", "YouTube", "Telegram", "WhatsApp", "Other"];

const ROBOT_OPTIONS = [
  { value: "", label: "Follow index flag" },
  { value: "index,follow", label: "Index · follow links" },
  { value: "noindex,nofollow", label: "Hide · do not follow" },
  { value: "noindex,follow", label: "Hide · follow links" },
];

const SECTIONS: {
  key: SectionKey;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number | string }>;
}[] = [
    { key: "seo", label: "SEO Config", desc: "Search engines, Open Graph & Structured Data", icon: Search },
    { key: "analytics", label: "Analytics & Tracking", desc: "Pixels, tags, scripts & consent", icon: BarChart3 },
    { key: "branding", label: "Branding", desc: "Colours, radius & container width", icon: Palette },
    { key: "typography", label: "Typography", desc: "Fonts, heading scale & body text", icon: Type },
    { key: "business", label: "Business Info", desc: "Name, contacts & location", icon: Building2 },
    { key: "page", label: "Page Settings", desc: "Slug, status, favicon, custom code", icon: Settings2 },
    { key: "conversions", label: "Conversion & Forms", desc: "Success behaviour & lead routing", icon: Megaphone },
    { key: "social", label: "Social & Sharing", desc: "Social profiles & share links", icon: Share2 },
  ];

type SectionKey = "seo" | "analytics" | "branding" | "typography" | "business" | "page" | "conversions" | "social";

type FormPatch = (f: FormDefinition) => FormDefinition;

export function PageSettingsModule({ page, onPage }: { page: LandingPageData; onPage: (patch: Partial<LandingPageData>) => void }) {
  const [tab, setTab] = useState<SectionKey>("seo");
  const [copied, setCopied] = useState(false);
  const site = useConfigStore((s) => s.config);
  const settings = site.settings ?? EMPTY_SETTINGS;

  const commit = (recipe: (c: SiteConfig) => SiteConfig) => {
    useConfigStore.getState().patchSite(recipe(useConfigStore.getState().config));
  };
  const patchSettings = (patch: Partial<PageSettings>) => {
    commit((c) => ({ ...c, settings: { ...EMPTY_SETTINGS, ...(c.settings ?? {}), ...patch } }));
  };
  const patchTheme = (patch: Partial<PageSettings["theme"]>) => patchSettings({ theme: { ...settings.theme, ...patch } });
  const patchType = (patch: Partial<TypographySettings>) => patchSettings({ typography: { ...settings.typography, ...patch } });
  const patchPageBag = (patch: Partial<PageSettings["page"]>) => patchSettings({ page: { ...settings.page, ...patch } });
  const patchBusiness = (patch: Partial<BusinessSettings>) => patchSettings({ business: { ...settings.business, ...patch } });
  const patchSeo = (patch: Partial<SiteSeo>) => commit((c) => ({ ...c, seo: { ...(c.seo ?? {}), ...patch } }));
  const patchTracking = (patch: Partial<SiteTracking>) =>
    commit((c) => ({ ...c, tracking: { ...(c.tracking ?? {}), ...patch } }));
  const patchFirstForm = (fn: FormPatch) =>
    commit((c) => ({
      ...c,
      forms: c.forms?.map((f, i) => (i === 0 ? fn(f) : f)) ?? c.forms,
    }));

  const active = SECTIONS.find((s) => s.key === tab) ?? SECTIONS[0];

  return (
    <div className="op-root" style={{ height: "100%", display: "flex", minHeight: 0 }}>
      <aside
        className="ps-settings-rail"
        style={{
          width: 248,
          flexShrink: 0,
          borderRight: "1px solid var(--ps-line)",
          background: "var(--ps-panel)",
          padding: "14px 10px",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ps-muted)", padding: "4px 10px 8px" }}>
          Page settings
        </div>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = s.key === tab;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setTab(s.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                marginBottom: 2,
                background: isActive ? "var(--ps-primary-soft)" : "transparent",
                color: isActive ? "var(--ps-primary)" : "var(--ps-ink)",
              }}
            >
              <Icon size={15} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</span>
            </button>
          );
        })}
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "26px 32px 56px" }}>
        <div style={{ maxWidth: 860 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--ps-ink)" }}>{active.label}</h2>
          <p style={{ margin: "4px 0 18px", fontSize: 12.5, color: "var(--ps-muted)" }}>{active.desc}</p>

          {tab === "seo" && (
            <SeoSection
              site={site}
              page={page}
              patchSeo={patchSeo}
              commit={commit}
              onPatchPage={onPage}
            />
          )}
          {tab === "analytics" && <AnalyticsSection site={site} patchTracking={patchTracking} />}
          {tab === "branding" && (
            <BrandingSection settings={settings} patchTheme={patchTheme} patchPageBag={patchPageBag} />
          )}
          {tab === "typography" && <TypographySection settings={settings} site={site} patchType={patchType} />}
          {tab === "business" && <BusinessSection settings={settings} patchBusiness={patchBusiness} />}
          {tab === "page" && (
            <PageScopeSection
              page={page}
              settings={settings}
              commit={commit}
              onPatchPage={onPage}
              patchPageBag={patchPageBag}
            />
          )}
          {tab === "conversions" && <ConversionsSection site={site} patchFirstForm={patchFirstForm} patchTracking={patchTracking} />}
          {tab === "social" && (
            <SocialSection
              settings={settings}
              patchSettings={patchSettings}
              copied={copied}
              setCopied={setCopied}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="ps-card" style={{ padding: 18, marginBottom: 16 }}>
      {title ? <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "var(--ps-ink)" }}>{title}</h3> : null}
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ps-ink)", marginBottom: 5 }}>{label}</label>
      {children}
      {hint ? <div style={{ marginTop: 4, fontSize: 11, color: "var(--ps-muted)", lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--ps-bg)",
  border: "1px solid var(--ps-line-strong)",
  borderRadius: "var(--ps-radius-sm)",
  padding: "9px 11px",
  fontSize: 13,
  color: "var(--ps-ink)",
  outline: "none",
  boxSizing: "border-box",
};
const areaStyle: React.CSSProperties = { ...inputStyle, fontFamily: "ui-monospace, monospace", lineHeight: 1.6, minHeight: 84, resize: "vertical" };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

function Input({ value, on, placeholder, type }: { value: string; on: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      className="ps-input"
      type={type ?? "text"}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => on(e.target.value)}
      style={{ padding: 9 }}
    />
  );
}

function Area({ value, on, placeholder, rows }: { value: string; on: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      className="ps-input"
      value={value ?? ""}
      placeholder={placeholder}
      rows={rows ?? 3}
      onChange={(e) => on(e.target.value)}
      style={areaStyle}
    />
  );
}

function Select({
  value,
  options,
  on,
}: {
  value: string;
  options: { value: string; label: string }[];
  on: (v: string) => void;
}) {
  return (
    <select className="ps-input" value={value ?? ""} onChange={(e) => on(e.target.value)} style={selectStyle}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ checked, on, label, hint }: { checked: boolean; on: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => on(!checked)}
        style={{
          width: 38,
          height: 22,
          flexShrink: 0,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          position: "relative",
          marginTop: 2,
          background: checked ? "var(--ps-primary, #6d5dfc)" : "var(--ps-line-strong, #c6cbd4)",
          transition: "background .15s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            transition: "left .15s",
            boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          }}
        />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ps-ink)" }}>{label}</div>
        {hint ? <div style={{ fontSize: 11, color: "var(--ps-muted)", marginTop: 1 }}>{hint}</div> : null}
      </div>
    </div>
  );
}

function ColorField({ label, value, on }: { label: string; value?: string; on: (v: string) => void }) {
  return (
    <Row label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={value ?? "#6d5dfc"}
          onChange={(e) => on(e.target.value)}
          style={{ width: 40, height: 34, border: "1px solid var(--ps-line-strong)", borderRadius: 8, padding: 2, background: "var(--ps-bg)", cursor: "pointer" }}
        />
        <input className="ps-input" value={value ?? ""} placeholder="#6d5dfc" onChange={(e) => on(e.target.value)} style={{ padding: 8, flex: 1 }} />
      </div>
    </Row>
  );
}

/* ---------------------------------- SEO ---------------------------------- */

function SeoSection({
  site,
  page,
  patchSeo,
  commit,
  onPatchPage,
}: {
  site: SiteConfig;
  page: LandingPageData;
  patchSeo: (p: Partial<SiteSeo>) => void;
  commit?: (r: (c: SiteConfig) => SiteConfig) => void;
  onPatchPage?: (patch: Partial<LandingPageData>) => void;
}) {
  const seo = site.seo ?? {};
  const slug = (page.slug || page.id?.replace(/^page-/, ""))?.replace(/^\//, "");
  const pathFor = (v: string) => {
    const clean = (v || "").trim().replace(/^\/+/, "");
    return clean ? `/${clean}` : "/";
  };
  const setSlug = (v: string) => {
    const clean = (v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");
    commit?.((c) => ({
      ...c,
      pages: c.pages?.map((p, i) => (i === 0 ? { ...p, path: pathFor(clean) } : p)) ?? c.pages,
    }));
    onPatchPage?.({ slug: clean });
  };

  return (
    <>
      <PreviewGrid>
        <GoogleSerpCard seo={seo} site={site} page={page} />
        <OgCard seo={seo} site={site} page={page} />
      </PreviewGrid>
      <Card title="Search engines">
        <Row label="URL Slug" hint="The URL path on your domain. e.g. /my-property">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--ps-muted)" }}>/</span>
            <Input value={slug} on={setSlug} placeholder="villa-aurora" />
          </div>
        </Row>
        <Row label="Meta title" hint={`${(seo.metaTitle ?? "").length} / 60 chars — keep under 60 for a full result.`}>
          <Input value={seo.metaTitle ?? ""} on={(v) => patchSeo({ metaTitle: v })} />
        </Row>
        <Row label="Meta description" hint={`${(seo.metaDescription ?? "").length} / 160 chars.`}>
          <Area value={seo.metaDescription ?? ""} on={(v) => patchSeo({ metaDescription: v })} />
        </Row>
        <Row label="Keywords" hint="Comma separated. Search engines mostly ignore this, so keep it short.">
          <Input value={seo.keywords ?? ""} on={(v) => patchSeo({ keywords: v })} />
        </Row>
        <Row label="Robots" hint="Controls whether search engines may index this page and follow links.">
          <Select value={seo.robots ?? ""} options={ROBOT_OPTIONS} on={(v) => patchSeo({ robots: v })} />
        </Row>
        <Row label="Canonical URL" hint="Preferred URL for this page. Leave empty to auto-derive it.">
          <Input value={seo.canonical ?? ""} on={(v) => patchSeo({ canonical: v })} placeholder="https://example.com/property/villa-aurora" />
        </Row>
        <Toggle
          checked={seo.index !== false}
          on={(v) => patchSeo({ index: v })}
          label="Allow indexing"
          hint="Unchecked sends noindex to search engines. Overridden by the Robots field above."
        />
      </Card>

      <Card title="Open Graph (Facebook, LinkedIn, WhatsApp)">
        <Row label="OG title">
          <Input value={seo.ogTitle ?? ""} on={(v) => patchSeo({ ogTitle: v })} placeholder={seo.metaTitle} />
        </Row>
        <Row label="OG description">
          <Area value={seo.ogDescription ?? ""} on={(v) => patchSeo({ ogDescription: v })} placeholder={seo.metaDescription} />
        </Row>
        <Row label="Share image">
          <MediaPicker kind="image" label="OG image" value={seo.ogImage ?? ""} onChange={(v) => patchSeo({ ogImage: v })} />
        </Row>
      </Card>

      <Card title="Twitter / X card">
        <Row label="Card type">
          <Select
            value={seo.twitterCard ?? ""}
            options={[
              { value: "", label: "Auto (large image when one is set)" },
              { value: "summary", label: "Summary" },
              { value: "summary_large_image", label: "Summary with large image" },
            ]}
            on={(v) => patchSeo({ twitterCard: v as SiteSeo["twitterCard"] })}
          />
        </Row>
        <Row label="Twitter title">
          <Input value={seo.twitterTitle ?? ""} on={(v) => patchSeo({ twitterTitle: v })} placeholder={seo.ogTitle || seo.metaTitle} />
        </Row>
        <Row label="Twitter description">
          <Area value={seo.twitterDescription ?? ""} on={(v) => patchSeo({ twitterDescription: v })} placeholder={seo.ogDescription} />
        </Row>
        <Row label="Twitter image">
          <MediaPicker kind="image" label="Twitter image" value={seo.twitterImage ?? ""} onChange={(v) => patchSeo({ twitterImage: v })} />
        </Row>
      </Card>

      <Card title="Structured data (JSON-LD)">
        <Row label="Custom schema" hint="Valid JSON object that replaces the auto-generated RealEstateListing schema. Malformed JSON is ignored and the default is used.">
          <Area value={seo.schema ?? ""} on={(v) => patchSeo({ schema: v })} rows={6} placeholder={'{\n  "@type": "RealEstateListing",\n  "name": "Villa Aurora"\n}'} />
        </Row>
      </Card>
    </>
  );
}

function PreviewGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function GoogleSerpCard({ seo, site, page }: { seo: SiteSeo | undefined; site: SiteConfig; page: LandingPageData }) {
  const rawDomain = (seo?.canonical || page.domain || "ipixxel.ae").replace(/^https?:\/\//, "").split("/")[0];
  const domain = rawDomain.includes(".") ? rawDomain : "ipixxel.ae";
  const slug = (page.slug || "").replace(/^\//, "");
  const badge =
    seo?.robots?.includes("noindex") || seo?.index === false ? (
      <span style={{ color: "#c5221f", fontSize: 10, fontWeight: 600 }}>Excluded by noindex</span>
    ) : (
      <span style={{ color: "#006500", fontSize: 10, fontWeight: 600 }}>Indexable</span>
    );
  return (
    <div className="ps-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ps-muted)", marginBottom: 10 }}>
        Google preview
      </div>
      <div style={{ fontSize: 11, color: "#202124" }}>
        <div style={{ fontSize: 12, marginBottom: 2 }}>
          {domain}{slug ? ` › ${slug}` : ""} {badge}
        </div>
        <div style={{ color: "#1a0dab", fontSize: 15, fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }}>
          {seo?.metaTitle || page.name || "Untitled page"}
        </div>
        <div style={{ fontSize: 12, color: "#4d5156", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {seo?.metaDescription || "Add a meta description to show a preview here."}
        </div>
      </div>
    </div>
  );
}

function OgCard({ seo, site, page }: { seo: SiteSeo | undefined; site: SiteConfig; page: LandingPageData }) {
  const domain = (seo?.canonical || page.domain || site.name || "your-site").replace(/^https?:\/\//, "").split("/")[0];
  return (
    <div className="ps-card" style={{ padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ps-muted)", marginBottom: 10 }}>
        Social share
      </div>
      <div style={{ border: "1px solid var(--ps-line)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
        <div
          style={{
            height: 72,
            background: seo?.ogImage ? undefined : "linear-gradient(120deg,#6d5dfc,#0ea5e9)",
            backgroundImage: seo?.ogImage ? `url(${seo.ogImage})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div style={{ padding: "8px 10px" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5f6368", marginBottom: 2 }}>{domain}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1f2933", lineHeight: 1.25, marginBottom: 2 }}>{seo?.ogTitle || seo?.metaTitle || page.name}</div>
          <div style={{ fontSize: 11, color: "#5f6368", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {seo?.ogDescription || seo?.metaDescription || "Add an OG description & image to make shares look great."}
          </div>
        </div>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 10, fontSize: 11, color: "var(--ps-muted)" }}>
        {seo?.ogImage ? "Image attached" : "No share image — add one for richer previews."}
      </div>
    </div>
  );
}

/* ------------------------------- Analytics -------------------------------- */

function AnalyticsSection({ site, patchTracking }: { site: SiteConfig; patchTracking: (p: Partial<SiteTracking>) => void }) {
  const t = site.tracking ?? {};
  return (
    <>
      <Card title="Analytics & remarketing">
        <Row label="Google Analytics 4 ID" hint="Format G-XXXXXXXXXX">
          <Input value={t.gaId ?? ""} on={(v) => patchTracking({ gaId: v })} placeholder="G-XXXXXXXXXX" />
        </Row>
        <Row label="Google Tag Manager ID" hint="Format GTM-XXXXXXX">
          <Input value={t.gtmId ?? ""} on={(v) => patchTracking({ gtmId: v })} placeholder="GTM-XXXXXXX" />
        </Row>
        <Row label="Meta (Facebook) Pixel ID">
          <Input value={t.metaPixel ?? ""} on={(v) => patchTracking({ metaPixel: v })} placeholder="1234567890" />
        </Row>
      </Card>

      <Card title="Custom scripts">
        <Row label="Head scripts" hint={'Paste raw <script> or <noscript> tags. Injected into <head> on the live page.'}>
          <Area value={t.headerScripts ?? ""} on={(v) => patchTracking({ headerScripts: v })} rows={5} placeholder={'<script src="..."></script>'} />
        </Row>
        <Row label="Body scripts" hint={'Injected just before </body> on the live page. Great for chat widgets.'}>
          <Area value={t.bodyScripts ?? ""} on={(v) => patchTracking({ bodyScripts: v })} rows={5} placeholder={'<script src="..."></script>'} />
        </Row>
        <Row label="Legacy custom scripts" hint={'Plain JS executed inline in <head>.'}>
          <Area value={t.customScripts ?? ""} on={(v) => patchTracking({ customScripts: v })} rows={3} />
        </Row>
      </Card>

      <Card title="Cookie consent">
        <Toggle
          checked={!!t.cookieConsent}
          on={(v) => patchTracking({ cookieConsent: v, consentText: t.consentText || undefined })}
          label="Require consent before tracking"
          hint="Shows a banner; GA, GTM and Meta pixels are held back until the visitor accepts."
        />
        {t.cookieConsent ? (
          <Row label="Consent message">
            <Area value={t.consentText ?? ""} on={(v) => patchTracking({ consentText: v })} rows={2} placeholder="We use cookies and similar technologies to improve your experience and analyze site traffic." />
          </Row>
        ) : null}
      </Card>

      <Card title="Campaign attribution (defaults)">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Row label="Source">
            <Input value={t.utmSource ?? ""} on={(v) => patchTracking({ utmSource: v })} placeholder="google" />
          </Row>
          <Row label="Medium">
            <Input value={t.utmMedium ?? ""} on={(v) => patchTracking({ utmMedium: v })} placeholder="cpc" />
          </Row>
          <Row label="Campaign">
            <Input value={t.utmCampaign ?? ""} on={(v) => patchTracking({ utmCampaign: v })} placeholder="aurora-launch" />
          </Row>
        </div>
      </Card>
    </>
  );
}

/* -------------------------------- Branding -------------------------------- */

function BrandingSection({
  settings,
  patchTheme,
  patchPageBag,
}: {
  settings: PageSettings;
  patchTheme: (p: Partial<PageSettings["theme"]>) => void;
  patchPageBag: (p: Partial<PageSettings["page"]>) => void;
}) {
  const t = settings.theme;
  const primary = t.primary ?? "#6d5dfc";
  const text = t.text ?? "#0f172a";
  const bg = t.bg ?? "#ffffff";
  return (
    <>
      <Card title="Live preview">
        <div
          style={{
            borderRadius: 12,
            background: bg,
            color: text,
            padding: "18px 20px",
            border: "1px solid var(--ps-line)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: primary }}>Acme Realty</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>A brand headline in your primary colour</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={{ background: primary, color: bg, border: "none", borderRadius: t.radius ?? 10, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}>
              Primary action
            </button>
            <button type="button" style={{ background: "transparent", color: primary, border: `1.5px solid ${primary}`, borderRadius: t.radius ?? 10, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}>
              Outline action
            </button>
            <button type="button" style={{ background: "transparent", color: text, border: "1px solid var(--ps-line)", borderRadius: t.radius ?? 10, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}>
              Ghost
            </button>
          </div>
        </div>
      </Card>

      <Card title="Brand palette">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <ColorField label="Primary" value={t.primary} on={(v) => patchTheme({ primary: v })} />
          <ColorField label="CTA Button" value={t.ctaButtonColor || t.primary} on={(v) => patchTheme({ ctaButtonColor: v })} />
          <ColorField label="Text" value={t.text} on={(v) => patchTheme({ text: v })} />
          <ColorField label="Background" value={t.bg} on={(v) => patchTheme({ bg: v })} />
        </div>
      </Card>

      <Card title="Shape & layout">
        <Row label="Button radius" hint="Rounded corners used by buttons and interactive elements.">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range"
              min={0}
              max={32}
              value={t.radius ?? 10}
              onChange={(e) => patchTheme({ radius: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: "var(--ps-muted)", width: 34, textAlign: "right" }}>{t.radius ?? 10}px</span>
          </div>
        </Row>
        <Row label="Container width" hint="Maximum content width in px. 0 keeps the template default.">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range"
              min={0}
              max={1600}
              step={20}
              value={t.containerWidth ?? 0}
              onChange={(e) => patchTheme({ containerWidth: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: "var(--ps-muted)", width: 46, textAlign: "right" }}>{t.containerWidth ? `${t.containerWidth}px` : "Default"}</span>
          </div>
        </Row>
      </Card>

      <Card title="Favicon">
        <Row label="Site icon" hint="Shown in browser tabs and bookmarks.">
          <MediaPicker kind="image" label="Favicon" value={settings.page.favicon ?? ""} onChange={(v) => patchPageBag({ favicon: v })} />
        </Row>
      </Card>
    </>
  );
}

/* ------------------------------- Typography ------------------------------- */

function TypographySection({
  settings,
  site,
  patchType,
}: {
  settings: PageSettings;
  site: SiteConfig;
  patchType: (p: Partial<TypographySettings>) => void;
}) {
  const tp = settings.typography;
  const bodyFont = tp.bodyFont || site.theme?.fontSans || "Inter";
  const headingFont = tp.headingFont || site.theme?.fontDisplay || "Inter";
  const primary = settings.theme.primary ?? site.theme?.accent ?? "#6d5dfc";
  const text = settings.theme.text ?? "#0f172a";

  const h1 = tp.h1 ?? {};
  const patchLevel = (level: keyof TypographySettings, patch: Partial<HeadingStyle>) =>
    patchType({ [level]: { ...(tp[level] as HeadingStyle | undefined), ...patch } } as Partial<TypographySettings>);

  const fontOptions = [{ value: "", label: "Use template font" }, ...googleFontOptions.map((f) => ({ value: f, label: f }))];

  return (
    <>
      <Card title="Live preview">
        <div style={{ borderRadius: 12, border: "1px solid var(--ps-line)", background: "#fff", color: text, padding: "22px 24px" }}>
          <div style={{ fontFamily: `"${headingFont}", sans-serif`, fontSize: h1.size ?? "2.25em", fontWeight: h1.weight ?? 700, lineHeight: h1.lineHeight ?? 1.1, color: text, marginBottom: 6 }}>
            Aurora Skyline Residences
          </div>
          <div style={{ fontFamily: `"${headingFont}", sans-serif`, fontSize: tp.h2?.size ?? "1.5em", fontWeight: tp.h2?.weight ?? 700, color: primary, marginBottom: 14 }}>
            Move-in ready October
          </div>
          <p style={{ fontFamily: `"${bodyFont}", sans-serif`, fontSize: tp.bodySize ?? "1em", fontWeight: tp.bodyWeight ?? 400, lineHeight: tp.bodyLineHeight ?? 1.6, margin: 0, color: text }}>
            Every home includes smart climate control, a 2-car garage and a private terrace. Book a guided site visit — a
            relationship manager will call you within 15 minutes.
          </p>
        </div>
      </Card>

      <Card title="Font family">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Row label="Heading font" hint={headingFont}>
            <Select value={tp.headingFont ?? ""} options={fontOptions} on={(v) => patchType({ headingFont: v })} />
          </Row>
          <Row label="Body font" hint={bodyFont}>
            <Select value={tp.bodyFont ?? ""} options={fontOptions} on={(v) => patchType({ bodyFont: v })} />
          </Row>
        </div>
      </Card>

      <Card title="Headings scale">
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ps-muted)", lineHeight: 1.5 }}>
          Set explicit sizes (any CSS value, e.g. 2.5em or 40px) for a level to opt it into this override. Tablet and mobile
          scale shrink the ones you set below.
        </p>
        {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((lv, i) => {
          const s = tp[lv] as HeadingStyle | undefined;
          return (
            <div key={lv} style={{ display: "grid", gridTemplateColumns: "54px 1fr 1fr 1fr 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: `hsl(${220 + i * 18} 28% 30%)` }}>{lv.toUpperCase()}</span>
              <Input value={s?.size ?? ""} on={(v) => patchLevel(lv, { size: v })} placeholder="Size" />
              <Input value={s?.weight ?? ""} on={(v) => patchLevel(lv, { weight: v })} placeholder="Weight" />
              <Input value={s?.lineHeight ?? ""} on={(v) => patchLevel(lv, { lineHeight: v })} placeholder="Line height" />
              <Input value={s?.letterSpacing ?? ""} on={(v) => patchLevel(lv, { letterSpacing: v })} placeholder="Spacing" />
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <Row label="Tablet scale" hint={`Tablet headings render at ${Math.round(((tp.tabletScale ?? 0.875) * 100))}% of desktop.`}>
            <input type="range" min={0.5} max={1} step={0.025} value={tp.tabletScale ?? 0.875} onChange={(e) => patchType({ tabletScale: Number(e.target.value) })} style={{ width: "100%" }} />
          </Row>
          <Row label="Mobile scale" hint={`Mobile headings render at ${Math.round(((tp.mobileScale ?? 0.75) * 100))}% of desktop.`}>
            <input type="range" min={0.5} max={1} step={0.025} value={tp.mobileScale ?? 0.75} onChange={(e) => patchType({ mobileScale: Number(e.target.value) })} style={{ width: "100%" }} />
          </Row>
        </div>
      </Card>

      <Card title="Body text">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Row label="Size">
            <Input value={tp.bodySize ?? ""} on={(v) => patchType({ bodySize: v })} placeholder="1em" />
          </Row>
          <Row label="Weight">
            <Input value={tp.bodyWeight ?? ""} on={(v) => patchType({ bodyWeight: v })} placeholder="400" />
          </Row>
          <Row label="Line height">
            <Input value={tp.bodyLineHeight ?? ""} on={(v) => patchType({ bodyLineHeight: v })} placeholder="1.6" />
          </Row>
        </div>
        <Row label="Custom font CSS" hint="Paste @font-face blocks or font import rules. Any family you declare here wins over Google Fonts when names match.">
          <Area value={tp.customFontCss ?? ""} on={(v) => patchType({ customFontCss: v })} rows={5} placeholder={"@font-face {\n  font-family: \"MyFont\";\n  src: url(\"/fonts/myfont.woff2\");\n}"} />
        </Row>
      </Card>
    </>
  );
}

/* ------------------------------- Business Info ----------------------------- */

function BusinessSection({ settings, patchBusiness }: { settings: PageSettings; patchBusiness: (p: Partial<BusinessSettings>) => void }) {
  const b = settings.business;
  return (
    <Card title="Business details">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Row label="Business name">
          <Input value={b.name ?? ""} on={(v) => patchBusiness({ name: v })} />
        </Row>
        <Row label="Tagline">
          <Input value={b.tagline ?? ""} on={(v) => patchBusiness({ tagline: v })} />
        </Row>
        <Row label="Street address">
          <Input value={b.address ?? ""} on={(v) => patchBusiness({ address: v })} />
        </Row>
        <Row label="City / locality">
          <Input value={b.city ?? ""} on={(v) => patchBusiness({ city: v })} />
        </Row>
        <Row label="Email">
          <Input type="email" value={b.email ?? ""} on={(v) => patchBusiness({ email: v })} />
        </Row>
        <Row label="Phone">
          <Input type="tel" value={b.phone ?? ""} on={(v) => patchBusiness({ phone: v })} />
        </Row>
        <Row label="WhatsApp" hint="With country code, e.g. +919876543210">
          <Input value={b.whatsapp ?? ""} on={(v) => patchBusiness({ whatsapp: v })} />
        </Row>
        <Row label="Website">
          <Input value={b.website ?? ""} on={(v) => patchBusiness({ website: v })} placeholder="https://" />
        </Row>
      </div>
      <Card title="Local business preview">
        <div style={{ fontSize: 12.5, color: "var(--ps-slate)", lineHeight: 1.7 }}>
          {b.name || "Your business"} · {b.city || "City"} · {b.email || "email@example.com"} · {b.phone || "+00 000 000 000"}
        </div>
      </Card>
    </Card>
  );
}

/* ------------------------------ Page scope -------------------------------- */

function PageScopeSection({
  page,
  settings,
  commit,
  onPatchPage,
  patchPageBag,
}: {
  page: LandingPageData;
  settings: PageSettings;
  commit: (r: (c: SiteConfig) => SiteConfig) => void;
  onPatchPage: (patch: Partial<LandingPageData>) => void;
  patchPageBag: (patch: Partial<PageSettings["page"]>) => void;
}) {
  const slug = (page.slug || page.id?.replace(/^page-/, ""))?.replace(/^\//, "");
  const pathFor = (v: string) => {
    const clean = (v || "").trim().replace(/^\/+/, "");
    return clean ? `/${clean}` : "/";
  };
  const setSlug = (v: string) => {
    const clean = (v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");
    commit((c) => ({
      ...c,
      pages: c.pages?.map((p, i) => (i === 0 ? { ...p, path: pathFor(clean) } : p)) ?? c.pages,
    }));
    onPatchPage({ slug: clean });
  };
  const setName = (v: string) => {
    commit((c) => ({ ...c, name: v, pages: c.pages?.map((p, i) => (i === 0 ? { ...p, name: v } : p)) ?? c.pages }));
    onPatchPage({ name: v });
  };
  return (
    <>
      <Card title="Identity">
        <Row label="Page name" hint="Shown in the studio, the dashboard and browser tab.">
          <Input value={page.name ?? ""} on={setName} />
        </Row>
        <Row label="Slug" hint="The URL path on your domain. Leave blank for the home page (/).">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--ps-muted)" }}>/</span>
            <Input value={slug} on={setSlug} placeholder="villa-aurora" />
          </div>
        </Row>
        <Row label="Status">
          <Select
            value={page.status ?? "draft"}
            options={[
              { value: "draft", label: "Draft" },
              { value: "published", label: "Published" },
              { value: "unpublished", label: "Unpublished" },
            ]}
            on={(v) => onPatchPage({ status: v as LandingPageData["status"] })}
          />
        </Row>
      </Card>

      <Card title="Favicon">
        <Row label="Site icon" hint="Shown in browser tabs. Applies to the live page only.">
          <MediaPicker kind="image" label="favicon" value={settings.page.favicon ?? ""} onChange={(v) => patchPageBag({ favicon: v })} compact />
        </Row>
      </Card>

      <Card title="Custom code">
        <Row label="Custom CSS" hint={'Injected as a <style> tag on the live page. Scoped selectors with .op-site if you need to target the site.'}>
          <Area value={settings.page.customCss ?? ""} on={(v) => patchPageBag({ customCss: v })} rows={6} placeholder={'.op-site .hero-cta {\n  background: #0f1424;\n}'} />
        </Row>
        <Row label="Custom JavaScript" hint={'Injected as a <script> tag on the live page.'}>
          <Area value={settings.page.customJs ?? ""} on={(v) => patchPageBag({ customJs: v })} rows={6} placeholder={'document.addEventListener("start", () => {…});'} />
        </Row>
      </Card>
    </>
  );
}

/* ----------------------------- Conversion & forms -------------------------- */

function ConversionsSection({
  site,
  patchFirstForm,
  patchTracking,
}: {
  site: SiteConfig;
  patchFirstForm: (fn: FormPatch) => void;
  patchTracking: (p: Partial<SiteTracking>) => void;
}) {
  const form = site.forms?.[0];
  const t = site.tracking ?? {};
  if (!form) {
    return (
      <div className="ps-card" style={{ padding: 26, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--ps-slate)", lineHeight: 1.7 }}>
          No form on this page yet.
          <br />
          <span style={{ color: "var(--ps-muted)" }}>Add a Contact or Lead form widget in the Canvas Builder — its success behaviour is configured here.</span>
        </div>
      </div>
    );
  }
  return (
    <>
      <Card title="After a successful submission">
        <Row label="Success behaviour">
          <Select
            value={form.successAction ?? "thankyou"}
            options={[
              { value: "message", label: "Show inline success message" },
              { value: "thankyou", label: "Open the Thank You page" },
              { value: "url", label: "Redirect to a custom URL" },
            ]}
            on={(v) => patchFirstForm((f) => ({ ...f, successAction: v as FormDefinition["successAction"] }))}
          />
        </Row>
        {(form.successAction ?? "thankyou") === "message" ? (
          <Row label="Success message" hint="Shown in place of the form.">
            <Area value={form.successTitle || form.thankYou || ""} on={(v) => patchFirstForm((f) => ({ ...f, successTitle: v }))} rows={2} />
          </Row>
        ) : null}
        {(form.successAction ?? "thankyou") === "thankyou" ? (
          <Row label="Thank You page" hint="Rewrites the legacy confirmation message used before dedicated Thank You pages were added.">
            <Input value={form.thankYou ?? ""} on={(v) => patchFirstForm((f) => ({ ...f, thankYou: v }))} placeholder="Thanks — our team will call you shortly." />
          </Row>
        ) : null}
        {(form.successAction ?? "thankyou") === "url" ? (
          <Row label="Redirect URL">
            <Input value={form.successUrl ?? ""} on={(v) => patchFirstForm((f) => ({ ...f, successUrl: v }))} placeholder="https://example.com/thank-you" />
          </Row>
        ) : null}
      </Card>

      <Card title="Lead routing">
        <Toggle
          checked={form.sendEmail !== false}
          on={(v) => patchFirstForm((f) => ({ ...f, sendEmail: v }))}
          label="Email me on each lead"
        />
        {form.sendEmail !== false ? (
          <Row label="Notification email">
            <Input type="email" value={form.notifyEmail ?? ""} on={(v) => patchFirstForm((f) => ({ ...f, notifyEmail: v }))} placeholder="sales@acme-realty.com" />
          </Row>
        ) : null}

        <Toggle
          checked={form.sendWhatsapp ?? false}
          on={(v) => patchFirstForm((f) => ({ ...f, sendWhatsapp: v }))}
          label="Forward leads to WhatsApp"
        />
        {form.sendWhatsapp ? (
          <Row label="WhatsApp number" hint="With country code, e.g. +919876543210">
            <Input value={form.whatsapp ?? ""} on={(v) => patchFirstForm((f) => ({ ...f, whatsapp: v }))} placeholder="+919876543210" />
          </Row>
        ) : null}

        <Toggle
          checked={form.saveToCrm !== false}
          on={(v) => patchFirstForm((f) => ({ ...f, saveToCrm: v }))}
          label="Save leads to my CRM"
          hint="Leads persist to the workspace CRM for follow-up."
        />
      </Card>

      <Card title="Conversion goals">
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--ps-muted)", lineHeight: 1.5 }}>
          These flags feed analytics conversions and the dashboard&apos;s conversion count.
        </p>
        <Toggle checked={t.goalForm ?? false} on={(v) => patchTracking({ goalForm: v })} label="Form submission" />
        <Toggle checked={t.goalWhatsapp ?? false} on={(v) => patchTracking({ goalWhatsapp: v })} label="WhatsApp click" />
        <Toggle checked={t.goalCall ?? false} on={(v) => patchTracking({ goalCall: v })} label="Call click" />
        <Toggle checked={t.goalBrochure ?? false} on={(v) => patchTracking({ goalBrochure: v })} label="Brochure download" />
      </Card>
    </>
  );
}

/* --------------------------------- Social --------------------------------- */

function SocialSection({
  settings,
  patchSettings,
  copied,
  setCopied,
}: {
  settings: PageSettings;
  patchSettings: (p: Partial<PageSettings>) => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  const links = settings.socialLinks ?? [];
  const shareText = encodeURIComponent(settings.business?.name || "Check this out");
  const shareUrl = encodeURIComponent(settings.business?.website || "");
  const shareLinks = [
    { label: "WhatsApp", href: `https://wa.me/?text=${shareText}%20${shareUrl}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}` },
  ];
  const setLinks = (next: typeof links) => patchSettings({ socialLinks: next });
  const copyAll = () => {
    const lines = shareLinks.map((l) => `${l.label}: ${l.href}`).join("\n");
    void navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <>
      <Card title="Share links (auto-generated)" >
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ps-muted)", lineHeight: 1.5 }}>
          Built from your Business Info name &amp; website. Pasted anywhere, they pre-fill a share for this page.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {shareLinks.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--ps-line)", borderRadius: 9, padding: "8px 10px", fontSize: 12 }}>
              <Share2 size={13} />
              <span style={{ fontWeight: 700, color: "var(--ps-ink)" }}>{l.label}</span>
              <code style={{ flex: 1, fontSize: 10.5, color: "var(--ps-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.href}</code>
            </div>
          ))}
        </div>
        <button type="button" onClick={copyAll} className="ps-btn" style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy all links"}
        </button>
      </Card>

      <Card title="Social profiles">
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--ps-muted)", lineHeight: 1.5 }}>
          Profiles for this business, used by templates when they render a follow bar or contact rail.
        </p>
        {links.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr 34px", gap: 8, marginBottom: 8 }}>
            <select
              className="ps-input"
              value={l.platform}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))}
              style={{ padding: 8 }}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <Input value={l.url} on={(v) => setLinks(links.map((x, j) => (j === i ? { ...x, url: v } : x)))} placeholder="https://" />
            <button
              type="button"
              onClick={() => setLinks(links.filter((_, j) => j !== i))}
              title="Remove"
              style={{ border: "1px solid var(--ps-line)", background: "var(--ps-bg)", borderRadius: 8, cursor: "pointer", color: "var(--ps-muted)" }}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="ps-btn" onClick={() => setLinks([...links, { platform: "Instagram", url: "" }])}>
          + Add profile
        </button>
      </Card>
    </>
  );
}

export default PageSettingsModule;