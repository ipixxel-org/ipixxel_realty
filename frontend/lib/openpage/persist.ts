import type { LandingPageData, SectionInstance, SiteConfig } from "./types";
import { PAGES } from "./data";
import { applyLandingPagePropertyFromConfig } from "./data";
import { BLANK_TEMPLATE, buildTemplateSections, buildThankYouSections, inferDesignId } from "./page-templates";
import { ensureConfig } from "./site-config";
import { apiFetch } from "../api";
import { isStructural } from "./tree";

export const PAGES_STORAGE_KEY = "prestate.pages.v4";

// ---------------------------------------------------------------------------
// Widget migrations — merged library ids. Old pages keep rendering: every
// stored section type is remapped once on load, carrying its settings across.
// ---------------------------------------------------------------------------

/** Removed widget id → primary widget id that replaces it. */
export const WIDGET_MIGRATIONS: Record<string, string> = {
  slider: "carousel",
  accordion: "faq",
  "row-2": "row",
  "enquiry-form": "lead-form",
  "multistep-form": "lead-form",
  "whatsapp-form": "lead-form",
  "sticky-footer-bar": "sticky-cta",
  "whatsapp-cta": "call-cta",
  map: "location-advantages",
  nearby: "location-advantages",
  "offer-banner": "cta-banner",
};

/** Extra settings patches applied when a widget is migrated. */
const WIDGET_MIGRATION_SETTINGS: Record<string, Record<string, unknown> | undefined> = {
  "whatsapp-cta": { mode: "whatsapp" },
  "offer-banner": { layout: "strip" },
};

function migrateSectionNode(node: SectionInstance): SectionInstance {
  const target = WIDGET_MIGRATIONS[node.type];
  let next: SectionInstance = node;
  if (target) {
    next = {
      ...node,
      type: target,
      // Adopt the primary widget's identity so labels/icons stay consistent.
      label: node.label || target,
      settings: {
        ...node.settings,
        ...(WIDGET_MIGRATION_SETTINGS[node.type] ?? {}),
      },
    };
    // nearby items used {title,text}; LocationSection reads {title,meta}.
    if (node.type === "nearby" && Array.isArray(next.settings.items)) {
      next.settings.items = (next.settings.items as { title?: string; text?: string; meta?: string }[]).map((it) => ({
        ...it,
        meta: it.meta ?? it.text,
      }));
    }
  }
  if (!isStructural(next.type)) {
    const align = next.style.layout?.align;
    if (align == null || align === "left") {
      next = {
        ...next,
        style: {
          ...next.style,
          layout: {
            ...next.style.layout,
            align: "center",
          },
        },
      };
    }
  }
  if (next.children?.length) next = { ...next, children: next.children.map(migrateSectionNode) };
  return next;
}

/** Normalize a page's section tree through all widget merges (idempotent). */
export function migrateSections(list: SectionInstance[]): SectionInstance[] {
  return list.map(migrateSectionNode);
}

function sectionsFor(designId: string, pageType?: string) {
  return migrateSections(pageType === "thank-you" ? buildThankYouSections() : buildTemplateSections(designId));
}

export function seedPages(): LandingPageData[] {
  return PAGES.map((p) => {
    const page: LandingPageData = {
      ...p,
      kind: p.kind ?? "preset",
      designId: p.designId ?? inferDesignId(p.template),
      pageType: p.pageType ?? "landing",
      sections: sectionsFor(p.designId ?? p.template, p.pageType),
    };
    return { ...page, config: ensureConfig(page) };
  });
}

const PRESET_IDS = PAGES.map((p) => p.id);

export function loadPages(): LandingPageData[] {
  if (typeof window === "undefined") return seedPages();
  try {
    const raw = window.localStorage.getItem(PAGES_STORAGE_KEY);
    if (!raw) return seedPages();
    const parsed = JSON.parse(raw) as LandingPageData[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seedPages();
    return parsed.map((p) => {
      const designId = p.designId ?? inferDesignId(p.template);
      const kind = p.kind ?? (PRESET_IDS.includes(p.id) ? "preset" : "custom");
      const pageType = p.pageType ?? "landing";
      const page: LandingPageData = {
        ...p,
        designId,
        kind,
        pageType,
        sections: migrateSections(Array.isArray(p.sections) ? p.sections : sectionsFor(designId, pageType)),
      };
      return { ...page, config: ensureConfig(page) };
    });
  } catch {
    return seedPages();
  }
}

export function savePages(pages: LandingPageData[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAGES_STORAGE_KEY, JSON.stringify(pages));
  } catch {
    /* quota */
  }
}

/** Update a single page inside storage without touching the rest (no data loss). */
export function savePage(pages: LandingPageData[], updated: LandingPageData) {
  const idx = pages.findIndex((p) => p.id === updated.id);
  const next = idx >= 0 ? pages.map((p) => (p.id === updated.id ? { ...updated, updated: new Date().toISOString() } : p)) : [...pages, updated];
  savePages(next);
  return next;
}

// ---------------------------------------------------------------------------
// API — templates (backend)
// ---------------------------------------------------------------------------

const TEMPLATES_PATH = "/admin/templates";
const LANDING_PAGES_PATH = "/org/landing-pages";

// Which REST resource the builder is editing. Defaults to "template"
// everywhere so every existing admin-console caller is unaffected — only
// the org builder (`resource="landing-page"`) opts into the org-scoped path.
export type Resource = "template" | "landing-page";

// Raw shape returned by the backend — same field names/casing as
// LandingPageData except sections/config are only present when content was
// requested (list rows omit them by default).
interface ApiTemplate {
  id: string;
  name: string;
  slug: string;
  status: LandingPageData["status"];
  template: string;
  domain: string;
  thumbnail: string | null;
  kind: "preset" | "custom";
  designId: string;
  pageType: "landing" | "thank-you";
  parentPageId: string | null;
  tier?: "free" | "paid" | "premium";
  categoryId?: string | null;
  templateCategory?: { id: string; name: string; slug: string; tier: "free" | "paid" | "premium" } | null;
  category: string | null;
  isPaid: boolean;
  allowedPlanIds?: string[];
  createdAt: string;
  updatedAt: string;
  sections?: SectionInstance[];
  config?: SiteConfig;
  engine?: string;
  site?: LandingPageData["openPageSite"] | null;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Maps the backend's response shape onto LandingPageData. `views`/`conversions`
// are decorative-only in the frontend (never computed anywhere) and are not
// persisted server-side, so they always fall back to the existing "—" placeholder.
function fromApiTemplate(raw: ApiTemplate): LandingPageData {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    status: raw.status,
    template: raw.template,
    domain: raw.domain,
    views: "—",
    conversions: "—",
    updated: formatRelativeTime(raw.updatedAt),
    updatedAt: raw.updatedAt,
    thumbnail: raw.thumbnail ?? "",
    sections: raw.sections ?? [],
    config: raw.config,
    openPageSite: raw.site ?? undefined,
    kind: raw.kind,
    designId: raw.designId,
    pageType: raw.pageType,
    parentPageId: raw.parentPageId ?? undefined,
    tier: raw.tier ?? (raw.isPaid ? "paid" : "free"),
    categoryId: raw.categoryId ?? null,
    templateCategory: raw.templateCategory ?? null,
    isPaid: raw.isPaid,
    category: raw.category,
    allowedPlanIds: Array.isArray(raw.allowedPlanIds) ? raw.allowedPlanIds : [],
  };
}

function toContentBody(page: Pick<LandingPageData, "sections" | "config" | "openPageSite">) {
  const site = page.openPageSite ?? null;
  const config = {
    ...(page.config ?? {}),
    ...(site ? { site } : {}),
  };
  return {
    engine: "openpage" as const,
    site,
    sections: page.sections ?? [],
    config,
  };
}

// Raw shape returned by /org/landing-pages — an org's own copy, not a
// Template row. Deliberately has no domain/isPaid/kind: those are
// Template-only concepts that don't exist on LandingPage.
interface ApiLandingPage {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "published" | "unpublished";
  thumbnail: string | null;
  pageType: "landing" | "thank_you";
  parentId: string | null;
  sourceTemplateId: string | null;
  sourceTemplate?: { id: string; name: string } | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  thankYouPage?: { id: string; name: string; slug: string; status: string } | null;
  parentLandingPage?: { id: string; name: string; slug: string; status: string } | null;
  content?: { sections: SectionInstance[]; config: SiteConfig; engine?: string; site?: LandingPageData["openPageSite"] };
}

// Maps a LandingPage row onto the same LandingPageData shape the builder
// already knows how to render — so BuilderWorkspace/Canvas/the widget
// modules need no changes to serve either resource.
function fromApiLandingPage(raw: ApiLandingPage): LandingPageData {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    // LandingPageStatus has values (pending_approval/approved/rejected) that
    // LandingPageData's status union doesn't include. The builder only ever
    // compares this against "published" (see TopNav), which still resolves
    // correctly for every other value — so this cast doesn't lie, it just
    // widens past a union that predates approval statuses.
    status: raw.status as LandingPageData["status"],
    // A from-scratch page (no sourceTemplate) has genuinely empty sections
    // in storage — BuilderWorkspace's seedSections() re-derives starter
    // content from `template` whenever sections is empty, and only
    // buildTemplateSections("tpl-blank"/"...scratch"/"blank") short-circuits
    // to []. Any other fallback (e.g. the previous "Custom") falls through
    // to the default design's real starter content instead of staying blank.
    template: raw.sourceTemplate?.name ?? BLANK_TEMPLATE.name,
    domain: "",
    views: "—",
    conversions: "—",
    updated: formatRelativeTime(raw.updatedAt),
    updatedAt: raw.updatedAt,
    thumbnail: raw.thumbnail ?? "",
    sections: raw.content?.sections ?? [],
    config: raw.content?.config,
    openPageSite: raw.content?.site,
    kind: "custom",
    designId: inferDesignId(raw.sourceTemplate?.name ?? BLANK_TEMPLATE.name),
    pageType: raw.pageType === "thank_you" ? "thank-you" : "landing",
    parentPageId: raw.parentId ?? undefined,
    thankYouPage: raw.thankYouPage ?? null,
    parentLandingPage: raw.parentLandingPage ?? null,
    isPaid: false,
    category: null,
  };
}

/** List persisted templates. Includes content by default so
 *  buildTemplateRows()'s existing brand/font reads on custom rows keep
 *  working unchanged — pass includeContent: false for lightweight reads
 *  (e.g. a domain-collision index) that don't need the section tree.
 *  The API defaults to landing pages only (thank-you companions are reached
 *  through their parent, not browsable in their own right) — pass
 *  pageType: "thank-you" for the few callers that genuinely need those. */
export async function loadTemplates(
  options: {
    includeContent?: boolean;
    pageType?: "landing" | "thank-you";
    resource?: Resource;
  } = {},
): Promise<LandingPageData[]> {
  if (options.resource === "landing-page") {
    // The org's own pages — always lightweight (no content) regardless.
    const res = await apiFetch<{ data: ApiLandingPage[] }>(`${LANDING_PAGES_PATH}?limit=100`);
    return res.data.map(fromApiLandingPage);
  }
  const includeContent = options.includeContent ?? true;
  const params = new URLSearchParams({ includeContent: String(includeContent) });
  if (options.pageType) params.set("pageType", options.pageType);
  const rows = await apiFetch<ApiTemplate[]>(`${TEMPLATES_PATH}?${params.toString()}`);
  return rows.map(fromApiTemplate);
}

const PAGE_BACKUP_PREFIX = "prestate.page.";

export function saveLocalBackup(record: LandingPageData) {
  if (typeof window === "undefined" || !record?.id) return;
  try {
    const dataToSave = {
      ...record,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };
    window.localStorage.setItem(`${PAGE_BACKUP_PREFIX}${record.id}`, JSON.stringify(dataToSave));
  } catch {
    /* quota */
  }
}

export function getLocalBackup(id: string): LandingPageData | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = window.localStorage.getItem(`${PAGE_BACKUP_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as LandingPageData;
  } catch {
    return null;
  }
}

export async function loadTemplate(id: string, resource: Resource = "template"): Promise<LandingPageData | null> {
  const localBackup = getLocalBackup(id);
  try {
    if (resource === "template" && id.startsWith("tpl-")) {
      if (localBackup && (localBackup.designId === id || localBackup.id === id)) {
        return localBackup;
      }
      const { TEMPLATES, BLANK_TEMPLATE, buildTemplateSections } = await import("./data");
      const { seedConfigFor } = await import("./site-config");
      const design = TEMPLATES.find((t) => t.id === id) || BLANK_TEMPLATE;
      const now = new Date().toISOString();
      const page: LandingPageData = {
        id,
        name: design.name,
        slug: design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        status: "draft",
        template: design.name,
        domain: "",
        views: "—",
        conversions: design.conversions ?? "—",
        updated: "just now",
        thumbnail: design.thumbnail ?? "",
        designId: design.id,
        kind: "preset",
        tier: "free",
        sections: buildTemplateSections(id),
        updatedAt: now,
      };
      page.config = seedConfigFor(page);
      return page;
    }

    if (resource === "landing-page") {
      try {
        const raw = await apiFetch<ApiLandingPage>(`${LANDING_PAGES_PATH}/${encodeURIComponent(id)}`);
        const serverPage = fromApiLandingPage(raw);
        applyLandingPagePropertyFromConfig(serverPage.config);
        if (localBackup) {
          const localTime = localBackup.updatedAt ? new Date(localBackup.updatedAt).getTime() : 0;
          const serverTime = serverPage.updatedAt ? new Date(serverPage.updatedAt).getTime() : 0;
          if (localTime > serverTime && localBackup.openPageSite) {
            return {
              ...serverPage,
              sections: localBackup.sections?.length ? localBackup.sections : serverPage.sections,
              config: localBackup.config || serverPage.config,
              openPageSite: localBackup.openPageSite || serverPage.openPageSite,
            };
          }
        }
        return serverPage;
      } catch (err) {
        if (localBackup) {
          applyLandingPagePropertyFromConfig(localBackup.config);
          return localBackup;
        }
        throw err;
      }
    }
    try {
      const raw = await apiFetch<ApiTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}`);
      applyLandingPagePropertyFromConfig(null);
      const serverPage = fromApiTemplate(raw);
      if (localBackup) {
        const localTime = localBackup.updatedAt ? new Date(localBackup.updatedAt).getTime() : 0;
        const serverTime = serverPage.updatedAt ? new Date(serverPage.updatedAt).getTime() : 0;
        if (localTime > serverTime && localBackup.openPageSite) {
          return {
            ...serverPage,
            sections: localBackup.sections?.length ? localBackup.sections : serverPage.sections,
            config: localBackup.config || serverPage.config,
            openPageSite: localBackup.openPageSite || serverPage.openPageSite,
          };
        }
      }
      return serverPage;
    } catch (err) {
      if (localBackup) {
        return localBackup;
      }
      throw err;
    }
  } catch {
    return localBackup || null;
  }
}

export interface CreateTemplateInput {
  name: string;
  slug?: string;
  designId?: string;
  template: string;
  status?: LandingPageData["status"];
  kind?: "preset" | "custom";
  pageType?: "landing" | "thank-you";
  parentPageId?: string;
  thumbnail?: string;
  tier?: "free" | "paid" | "premium";
  categoryId?: string | null;
  isPaid?: boolean;
  category?: string | null;
  sections: SectionInstance[];
  config?: SiteConfig;
  openPageSite?: LandingPageData["openPageSite"];
}

export async function createTemplate(input: CreateTemplateInput): Promise<LandingPageData> {
  const raw = await apiFetch<ApiTemplate>(TEMPLATES_PATH, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      slug: input.slug,
      designId: input.designId || "tpl-blank",
      template: input.template,
      status: input.status,
      kind: input.kind,
      pageType: input.pageType,
      parentPageId: input.parentPageId,
      thumbnail: input.thumbnail,
      tier: input.tier,
      categoryId: input.categoryId,
      isPaid: input.isPaid,
      category: input.category,
      content: toContentBody({
        sections: input.sections,
        config: input.config,
        openPageSite: input.openPageSite,
      }),
    }),
  });
  return fromApiTemplate(raw);
}

/**
 * Ensure every catalog design exists as a real preset Template row so the
 * gallery can open / rename / edit them immediately (no "create from design" step).
 */
export async function ensurePresetTemplates(): Promise<LandingPageData[]> {
  const { TEMPLATES } = await import("./data");
  const { seedConfigFor } = await import("./site-config");
  const { buildTemplateSections } = await import("./page-templates");
  const { buildRealEstateTemplate, openPageTemplateIdForDesign } = await import("./re-templates");

  const existing = await loadTemplates({ includeContent: false });

  // Drop the legacy seeded "Project launch (builder)" preset if present.
  for (const row of existing) {
    const legacy =
      row.slug === "skyline-heights-builder" ||
      row.designId === "tpl-estatepro" ||
      /project launch\s*\(builder\)/i.test(row.name);
    if (!legacy) continue;
    try {
      await deleteTemplate(row.id);
    } catch {
      /* ignore */
    }
  }

  const refreshed = await loadTemplates({ includeContent: false });
  const byDesign = new Map(
    refreshed
      .filter((p) => (p.kind ?? "custom") === "preset")
      .map((p) => [p.designId ?? "", p] as const),
  );

  for (const design of TEMPLATES) {
    if (design.id === "tpl-blank") continue;
    const existingRow = byDesign.get(design.id);
    if (existingRow) {
      // Keep catalog preview images in sync (e.g. art-key → real JPG).
      if (design.thumbnail && existingRow.thumbnail !== design.thumbnail) {
        try {
          const updated = await apiFetch<ApiTemplate>(
            `${TEMPLATES_PATH}/${encodeURIComponent(existingRow.id)}`,
            {
              method: "PATCH",
              body: JSON.stringify({ thumbnail: design.thumbnail }),
            },
          );
          byDesign.set(design.id, fromApiTemplate(updated));
        } catch {
          /* ignore */
        }
      }

      const presetPageId = openPageTemplateIdForDesign(design.id);
      const freshSite = buildRealEstateTemplate(presetPageId, design.name);
      const targetRev = freshSite?.vars?.presetRevision;
      if (targetRev && existingRow.id) {
        try {
          const full = await loadTemplate(existingRow.id);
          const currentRev = full?.openPageSite?.vars?.presetRevision;
          if (full && currentRev !== targetRev && freshSite) {
            const synced = await patchTemplate(full.id, { ...full, openPageSite: freshSite });
            byDesign.set(design.id, synced);
          }
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    const slug =
      design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) ||
      design.id;
    const stub: LandingPageData = {
      id: "",
      name: design.name,
      slug,
      status: "published",
      template: design.name,
      domain: "",
      views: "—",
      conversions: "—",
      updated: "",
      thumbnail: design.thumbnail,
      sections: [],
      designId: design.id,
      kind: "preset",
    };

    try {
      const created = await createTemplate({
        name: design.name,
        slug,
        designId: design.id,
        template: design.name,
        status: "published",
        kind: "preset",
        tier: "free",
        thumbnail: design.thumbnail,
        sections: buildTemplateSections(design.id),
        config: seedConfigFor(stub),
        openPageSite: buildRealEstateTemplate(openPageTemplateIdForDesign(design.id), design.name),
      });
      byDesign.set(design.id, created);
    } catch {
      // Race / duplicate slug — ignore; next load will pick up the existing row.
    }
  }

  return loadTemplates({ includeContent: true });
}

async function patchTemplate(id: string, record: LandingPageData): Promise<LandingPageData> {
  saveLocalBackup(record);
  const raw = await apiFetch<ApiTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: record.name,
      slug: record.slug,
      status: record.status,
      domain: record.domain,
      thumbnail: record.thumbnail,
      tier: record.tier,
      categoryId: record.categoryId,
      isPaid: record.isPaid,
      category: record.category,
      content: toContentBody(record),
    }),
  });
  const updated = fromApiTemplate(raw);
  saveLocalBackup(updated);
  return updated;
}

export interface TemplateCategory {
  id: string;
  name: string;
  slug: string;
  tier: "free" | "paid" | "premium";
  templateCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export async function loadTemplateCategories(): Promise<TemplateCategory[]> {
  try {
    return await apiFetch<TemplateCategory[]>("/admin/template-categories");
  } catch {
    return [];
  }
}

export async function createTemplateCategory(data: {
  name: string;
  slug?: string;
  tier?: "free" | "paid" | "premium";
}): Promise<TemplateCategory> {
  return await apiFetch<TemplateCategory>("/admin/template-categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTemplateCategory(
  id: string,
  data: {
    name?: string;
    slug?: string;
    tier?: "free" | "paid" | "premium";
  },
): Promise<TemplateCategory> {
  return await apiFetch<TemplateCategory>(`/admin/template-categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteTemplateCategory(id: string): Promise<void> {
  await apiFetch(`/admin/template-categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// LandingPageUpdateDto only accepts name/slug/thumbnail/content — status,
// domain, isPaid and category don't exist on LandingPage, and the backend's
// ValidationPipe (forbidNonWhitelisted) would 400 the whole request if we
// sent them. Status changes only ever happen through submit/approve/
// reject/publish, never a plain content save.
async function patchLandingPage(id: string, record: LandingPageData): Promise<LandingPageData> {
  saveLocalBackup(record);
  const raw = await apiFetch<ApiLandingPage>(`${LANDING_PAGES_PATH}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: record.name,
      slug: record.slug,
      thumbnail: record.thumbnail,
      content: toContentBody(record),
    }),
  });
  const updated = fromApiLandingPage(raw);
  saveLocalBackup(updated);
  return updated;
}

const SAVE_DEBOUNCE_MS = 500;
interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
  latest: LandingPageData;
  resolvers: ((value: LandingPageData) => void)[];
  rejecters: ((reason: unknown) => void)[];
}
const pendingSaves = new Map<string, PendingSave>();

/** Debounced single-record save — replaces the old bulk "save the whole
 *  array" pattern. Multiple calls for the same record id (within the same
 *  resource) within the debounce window collapse into one PATCH using the
 *  latest record. */
export function saveTemplate(record: LandingPageData, resource: Resource = "template"): Promise<LandingPageData> {
  saveLocalBackup(record);
  return new Promise((resolve, reject) => {
    const key = `${resource}:${record.id}`;
    const existing = pendingSaves.get(key);
    const entry: PendingSave = existing ?? {
      timer: null as unknown as ReturnType<typeof setTimeout>,
      latest: record,
      resolvers: [],
      rejecters: [],
    };
    entry.latest = record;
    entry.resolvers.push(resolve);
    entry.rejecters.push(reject);
    if (existing) clearTimeout(existing.timer);

    entry.timer = setTimeout(() => {
      void flushPendingSave(key, resource);
    }, SAVE_DEBOUNCE_MS);

    pendingSaves.set(key, entry);
  });
}

async function flushPendingSave(key: string, resource: Resource): Promise<LandingPageData | null> {
  const entry = pendingSaves.get(key);
  if (!entry) return null;
  clearTimeout(entry.timer);
  pendingSaves.delete(key);
  const patcher = resource === "landing-page" ? patchLandingPage : patchTemplate;
  try {
    const updated = await patcher(entry.latest.id, entry.latest);
    entry.resolvers.forEach((r) => r(updated));
    return updated;
  } catch (err) {
    entry.rejecters.forEach((r) => r(err));
    throw err;
  }
}

/** Immediate save used by Publish so the live page gets the current builder JSON, not a stale draft. */
export async function saveTemplateNow(record: LandingPageData, resource: Resource = "template"): Promise<LandingPageData> {
  saveLocalBackup(record);
  const key = `${resource}:${record.id}`;
  const existing = pendingSaves.get(key);
  if (existing) {
    existing.latest = record;
    return (await flushPendingSave(key, resource))!;
  }
  const patcher = resource === "landing-page" ? patchLandingPage : patchTemplate;
  return patcher(record.id, record);
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`${TEMPLATES_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function duplicateTemplate(id: string): Promise<LandingPageData> {
  const raw = await apiFetch<ApiTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
  });
  return fromApiTemplate(raw);
}

export async function resetTemplate(
  id: string,
  content: { sections: SectionInstance[]; config: SiteConfig; openPageSite?: LandingPageData["openPageSite"] },
): Promise<LandingPageData> {
  const raw = await apiFetch<ApiTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}/reset`, {
    method: "POST",
    body: JSON.stringify({
      content: toContentBody({
        sections: content.sections,
        config: content.config,
        openPageSite: content.openPageSite,
      }),
    }),
  });
  return fromApiTemplate(raw);
}

/** Publishes an org's own landing page directly — no approval gate. Only
 *  ever called for resource: "landing-page". */
export async function publishLandingPage(id: string): Promise<LandingPageData> {
  const raw = await apiFetch<ApiLandingPage>(`${LANDING_PAGES_PATH}/${encodeURIComponent(id)}/publish`, {
    method: "POST",
  });
  return fromApiLandingPage(raw);
}

export async function unpublishLandingPage(id: string): Promise<LandingPageData> {
  const raw = await apiFetch<ApiLandingPage>(`${LANDING_PAGES_PATH}/${encodeURIComponent(id)}/unpublish`, {
    method: "POST",
  });
  return fromApiLandingPage(raw);
}

// ---------------------------------------------------------------------------
// Builder image upload — replaces base64-data-URI-in-content (413 fix).
// Asks the backend for a short-lived presigned PUT URL, uploads the file
// straight to R2 (never through the API), returns the stored public URL.
// ---------------------------------------------------------------------------

const BUILDER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const BUILDER_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

function resolveImageMime(file: File): string {
  const t = file.type?.toLowerCase().trim();
  if (t && BUILDER_IMAGE_MIMES.includes(t)) return t;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return t || "image/jpeg";
}

export async function uploadBuilderImage(
  file: File,
  opts: { id: string; resource: Resource },
): Promise<string> {
  const mime = resolveImageMime(file);
  if (!BUILDER_IMAGE_MIMES.includes(mime)) {
    throw new Error("Choose a PNG, JPG, WebP, GIF or SVG image");
  }
  if (file.size > BUILDER_IMAGE_MAX_BYTES) {
    throw new Error("Keep images under 5 MB");
  }
  const base =
    opts.resource === "landing-page" ? LANDING_PAGES_PATH : TEMPLATES_PATH;
  const { uploadUrl, publicUrl } = await apiFetch<{
    uploadUrl: string;
    publicUrl: string;
  }>(`${base}/${encodeURIComponent(opts.id)}/upload-url`, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      contentType: mime,
      size: file.size,
    }),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let put: Response;
  try {
    put = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": mime },
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("Upload timed out. Try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!put.ok) {
    throw new Error(`Upload to storage failed (${put.status}).`);
  }
  return publicUrl;
}

// ---------------------------------------------------------------------------
// Saved section templates — "Save as template" in the section toolbar stores
// reusable sections here; they appear under "Saved" in the widget library.
// ---------------------------------------------------------------------------

export interface SavedSectionTemplate {
  id: string;
  name: string;
  type: string;
  savedAt: string;
  data: LandingPageData["sections"][number];
}

const SECTION_TEMPLATES_KEY = "prestate.section-templates.v1";

export function loadSectionTemplates(): SavedSectionTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SECTION_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSectionTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSectionTemplates(templates: SavedSectionTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SECTION_TEMPLATES_KEY, JSON.stringify(templates.slice(0, 40)));
  } catch {
    /* quota */
  }
}
