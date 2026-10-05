"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getOrgCatalogOptions, getOrgLandingPages, getProjectManagerCandidates, getProjectSalesAgentCandidates, setProjectSalesAgents } from "@/lib/api";
import { parseAmount, parseCount, parseDecimal } from "@/lib/parse";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { CURRENCY_OPTIONS } from "@/lib/countries";
import { useProjectTypes } from "@/lib/use-project-types";
import { uploadFile } from "@/lib/upload";
import { reportPresenceError } from "@/hooks/usePagePresence";
import {
  customFieldRequirements,
  defaultableExtraFields,
  draftToPayload,
  fieldsToRows,
  roleBaselineOf,
  roleField,
  rowsToTemplate,
  templateTraits,
  validateFieldRows,
  valuesToDraft,
  type CustomValueDraft,
  type FieldDef,
  type FieldRole,
  type FieldRow,
} from "@/lib/field-template";
import { ProjectFieldRows, UnitFieldRows } from "@/components/org/project-type-fields";
import { GalleryUpload, MediaUpload } from "@/components/org/media-upload";
import {
  alreadyAssignedLabel,
  CatalogOptions,
  ConfigSizePriceTable,
  ManagerPicker,
  MoneyInput,
  personLabel,
  SpecificationRows,
  type ConfigSizePriceRow,
} from "@/components/org/project-form-fields";
import {
  defaultSpecRows,
  serializeSpecifications,
  type SpecRow,
} from "@/lib/specifications";
import {
  allMissing,
  missingOn,
  projectRequirements,
  PROJECT_STEPS as STEPS,
  stepIndicator,
  stepStatus,
} from "@/lib/project-validation";
import { Reveal } from "@/components/superadmin/reveal";
import { Modal } from "@/components/ui/modal";
import { Icon, type IconName } from "@/components/icons";
import { orgBuilderPath } from "@/lib/openpage/paths";
import "@/app/org/org.css";
import type {
  CreateProjectInput,
  CreateUnitTypeInput,
  OrgCatalogCategory,
  OrgCatalogOption,
  LandingPageRow,
  OrgTemplateSummary,
  OrgTemplatesListResponse,
  OrgBillingSummary,
  Project,
  ProjectAssigneeCandidate,
  ProjectStatus,
  SafeOrganisation,
} from "@/lib/types";
import Link from "next/link";

// The wizard's draft rows are the shared table's rows — one shape, so the
// component and the localStorage draft can't drift apart.
type UnitTypeDraft = ConfigSizePriceRow;

const makeUnitType = (): UnitTypeDraft => ({
  key: Date.now() + Math.random(),
  name: "",
  area: "",
  price: "",
  extra: {},
  totalUnits: "",
});

// The wizard's option lists are org-managed catalogs (Settings → Project
// Catalogs), fetched per step (see CatalogOptions in
// components/org/project-form-fields).
//
// Wizard steps (0-indexed) that read a catalog — used to refetch on entry so
// options just added in Settings appear without a full page reload. Step 2
// (pricing) joined the list when "Price includes" and "Payment plan" stopped
// being fixed frontend arrays and became catalogs of their own.
const CATALOG_STEPS = new Set([0, 1, 2, 3, 4]);

// Per-step required-field validation: Continue validates the step you're on and
// refuses to advance while something's missing, the step rail warns before
// letting you jump *ahead* out of an incomplete step (jumping back is always
// free), and Publish re-checks everything. The rules themselves live in
// lib/project-validation, shared with the edit page.

// Format a raw money input for the review summary. Unparseable input falls back to the raw text.
function formatProjectMoney(value: string, currency: string): string {
  const n = parseAmount(value);
  return n === undefined ? value.trim() || "—" : formatMoney(n, currency);
}

// ["2 BHK", "3 BHK"] -> "2 & 3 BHK"; anything not "<x> BHK" -> plain join.
function formatConfigs(labels: string[]): string {
  if (labels.length === 0) return "—";
  const nums = labels.map((l) => /^(.+?)\s+BHK$/i.exec(l)?.[1]);
  return nums.every(Boolean) ? `${nums.join(" & ")} BHK` : labels.join(", ");
}

// Currency-aware price-range string for the Review step. Parses the raw
// money-field text first, then defers to the shared money formatter.
function priceRangeLabel(from: string, to: string, currency: string): string {
  return formatMoneyRange(parseAmount(from), parseAmount(to), currency);
}

// ---------------------------------------------------------------------------
// Draft persistence — STOPGAP. The wizard has no backend save yet, so the
// whole form is mirrored to localStorage on every change and restored on
// mount. Keyed per-org so a draft never leaks between orgs that share a
// browser; cleared on successful publish. The proper backend-based,
// resumable-across-devices version is a separate, deliberately deferred task
// (waiting for the wizard's fields/steps to settle).
// NOTE: nothing here holds a File/Blob. Step 8's uploads aren't wired yet,
// and when they are they'll round-trip as plain R2 URL strings like any other
// text field — so restoring a draft never re-triggers an upload.
// ---------------------------------------------------------------------------
// v2: `specifications` became dynamic label/value rows (replacing the fixed
// flooring / kitchen / doorsWindows / fittings fields) and Step 8 gained
// project floor plans. sweepOldProjectDrafts drops the v1 drafts.
const DRAFT_KEY_PREFIX = "be.project-draft.v2.";
const draftKey = (orgId: string) => `${DRAFT_KEY_PREFIX}${orgId}`;

interface WizardDraft {
  _savedAt: number;
  step: number;
  name: string; projectType: string; tagline: string; reraId: string;
  status: ProjectStatus; launchDate: string; possession: string; constructionStage: string;
  selectedConfigs: string[]; highlights: string; unitTypes: UnitTypeDraft[];
  // This project's copy of its type's templates + the typed values (Step 2).
  projectFields?: FieldDef[]; unitFields?: FieldDef[]; customValues?: CustomValueDraft;
  priceMin: string; priceMax: string; baseRate: string; bookingAmount: string; currency: string; areaUnit?: string;
  priceIncludes: string[]; paymentPlan: string; offers: string;
  address: string; city: string; locality: string; pincode: string;
  nearby: string[]; landmarks: string;
  amenities: string[]; specRows: SpecRow[]; specNotes: string;
  metaAds: boolean; googleAds: boolean; linkedinAds: boolean; portalAds: boolean;
  monthlyBudget: string; targetCpl: string; leadGoal: string; landingPage: string;
  aiCalling: boolean; whatsappAuto: boolean; roundRobin: boolean; aiKnowledgeBase: boolean;
  managerId: string; salesTeam: string; agentAssign: string[];
  requireApproval: boolean; visibleTele: boolean; publishWeb: boolean;
  coverImageUrl: string | null; galleryUrls: string[]; brochureUrl: string | null; reraCertificateUrl: string | null;
  floorPlanUrls: string[];
  customLandingPageId?: string | null;
  customLandingPageSlug?: string | null;
  customLandingPageName?: string | null;
  selectedTemplateId?: string | null;
}

// "They actually started" — decides whether a stored draft is worth a
// resume/discard prompt, or is just a stale empty shell to clear silently.
function isMeaningfulDraft(d: WizardDraft): boolean {
  return (
    d.step > 0 ||
    !!d.name?.trim() ||
    d.projectType !== "" ||
    (d.selectedConfigs?.length ?? 0) > 0 ||
    (d.amenities?.length ?? 0) > 0 ||
    (d.nearby?.length ?? 0) > 0 ||
    !!d.tagline?.trim() ||
    !!d.address?.trim() ||
    !!d.city?.trim()
  );
}

// Drop project drafts written by an older wizard shape (different key
// version) so a stale "Resume" can never rehydrate a mismatched payload.
function sweepOldProjectDrafts() {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("be.project-draft.") && !k.startsWith(DRAFT_KEY_PREFIX)) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    /* private mode / storage disabled — nothing to clean */
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 45000) return "just now";
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(diff / 3600000);
  if (hr < 24) return `${hr} hr ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function AddNewProjectPage() {
  const router = useRouter();
  const { accessToken, user, hasPermission } = useAuth();
  // Projects > New project opens this wizard.
  const canCreate = hasPermission("projects", "add");
  useEffect(() => {
    if (accessToken && !canCreate) router.replace("/org/projects");
  }, [accessToken, canCreate, router]);
  const orgId = user?.org_id ?? null;

  // Step 1 — basics
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState("");
  const [tagline, setTagline] = useState("");
  const [reraId, setReraId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [launchDate, setLaunchDate] = useState("");
  const [possession, setPossession] = useState("");
  const [constructionStage, setConstructionStage] = useState("Under construction");

  // Step 2 — inventory
  const [selectedConfigs, setSelectedConfigs] = useState<string[]>([]);
  const [highlights, setHighlights] = useState("");
  const [unitTypes, setUnitTypes] = useState<UnitTypeDraft[]>([]);

  // Step 3 — pricing
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [baseRate, setBaseRate] = useState("");
  const [bookingAmount, setBookingAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [areaUnit, setAreaUnit] = useState("sqft");
  // Both now come from the org's catalogs, so neither can be pre-seeded with
  // a label this org may not have configured.
  const [priceIncludes, setPriceIncludes] = useState<string[]>([]);
  const [paymentPlan, setPaymentPlan] = useState("");
  const [offers, setOffers] = useState("");

  // Step 4 — location
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [locality, setLocality] = useState("");
  const [pincode, setPincode] = useState("");
  const [nearby, setNearby] = useState<string[]>([]);
  const [landmarks, setLandmarks] = useState("");

  // Step 5 — amenities & specifications. A new project starts with the four
  // rows the old fixed form had, pre-labelled but all deletable.
  const [amenities, setAmenities] = useState<string[]>([]);
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => defaultSpecRows());
  const [specNotes, setSpecNotes] = useState("");

  // Step 6 — marketing
  const [metaAds, setMetaAds] = useState(true);
  const [googleAds, setGoogleAds] = useState(true);
  const [linkedinAds, setLinkedinAds] = useState(false);
  const [portalAds, setPortalAds] = useState(true);
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [targetCpl, setTargetCpl] = useState("");
  const [leadGoal, setLeadGoal] = useState("");
  const [landingPage, setLandingPage] = useState("Create new from template…");
  const [orgLandingPages, setOrgLandingPages] = useState<LandingPageRow[]>([]);
  const [aiCalling, setAiCalling] = useState(true);
  const [whatsappAuto, setWhatsappAuto] = useState(true);
  const [roundRobin, setRoundRobin] = useState(true);
  // Collected via Step 8's "Add to AI knowledge base" toggle, but persisted
  // in the `marketing` blob (Piece A's schema design) — Piece E's file-upload
  // work must NOT add a separate column/toggle for this.
  const [aiKnowledgeBase, setAiKnowledgeBase] = useState(true);

  // The org's registered name — shown read-only as "Developer / channel
  // partner" (it's the organisation entered at onboarding, not a per-project
  // value). Fetched from /org/settings.
  const [orgName, setOrgName] = useState("");

  // Step 7 — team
  const [managerId, setManagerId] = useState("");
  const [managers, setManagers] = useState<ProjectAssigneeCandidate[]>([]);
  const [managersLoaded, setManagersLoaded] = useState(false);
  const noManagers = managersLoaded && managers.length === 0;
  const [salesAgents, setSalesAgents] = useState<ProjectAssigneeCandidate[]>([]);
  const [salesTeam, setSalesTeam] = useState("Ahmedabad — West");
  // User ids of the agents ticked in Step 7.
  const [agentAssign, setAgentAssign] = useState<string[]>([]);
  const [requireApproval, setRequireApproval] = useState(true);
  const [visibleTele, setVisibleTele] = useState(true);
  const [publishWeb, setPublishWeb] = useState(false);

  // Step 8 — documents & media. Uploaded org-scoped during the wizard (the
  // project doesn't exist yet) via the shared MediaUpload / GalleryUpload
  // components; only the returned R2 public URLs are kept in state.
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [brochureUrl, setBrochureUrl] = useState<string | null>(null);
  const [reraCertificateUrl, setReraCertificateUrl] = useState<string | null>(null);
  // The project's overall floor / site plans. Separate concept from the
  // per-unit-type floor plan, which can only exist once real unit types are
  // created after publishing.
  const [floorPlanUrls, setFloorPlanUrls] = useState<string[]>([]);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  async function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const url = await uploadFile(file, { field: "gallery" });
      setCoverImageUrl(url);
    } catch {
      setCoverImageUrl(URL.createObjectURL(file));
    } finally {
      setUploadingCover(false);
    }
  }

  // Wizard state
  const [step, setStep] = useState(0);
  // Steps whose required fields have been checked at least once (by Continue,
  // a rail jump, or Publish). Only these show inline errors, so a field never
  // turns red before the user has tried to move past it.
  const [validatedSteps, setValidatedSteps] = useState<number[]>([]);
  // Set when a rail click would jump ahead out of an incomplete step — holds
  // the warning until the user either fixes the step or confirms the jump.
  const [jumpWarning, setJumpWarning] = useState<{ to: number; missing: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once the project is created. If a follow-up call (e.g. sales-agent
  // assignment) then fails, we stop auto-redirecting and offer a manual link
  // so a partial failure never strands the user on the wizard.
  const [publishedProjectId, setPublishedProjectId] = useState<string | null>(null);

  // Template selection & Instant landing page publishing
  const [selectedTemplate, setSelectedTemplate] = useState<OrgTemplateSummary | null>(null);
  const [templateAppliedToast, setTemplateAppliedToast] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  // Its own toggle is hidden (see Step 6) — default off so publishing a
  // project never silently auto-creates a live landing page with no visible
  // control over it.
  const [publishLandingPageNow, setPublishLandingPageNow] = useState(false);
  const [landingPageTitle, setLandingPageTitle] = useState("");
  const [createdLandingPage, setCreatedLandingPage] = useState<{ id: string; slug: string; name: string } | null>(null);
  const [orgDbTemplates, setOrgDbTemplates] = useState<OrgTemplateSummary[]>([]);

  // Visual Builder Customization state
  const [customLandingPageId, setCustomLandingPageId] = useState<string | null>(null);
  const [customLandingPageSlug, setCustomLandingPageSlug] = useState<string | null>(null);
  const [customLandingPageName, setCustomLandingPageName] = useState<string | null>(null);
  const [customizingInBuilder, setCustomizingInBuilder] = useState(false);

  const applyTemplate = useCallback((tpl: OrgTemplateSummary) => {
    setSelectedTemplate(tpl);
    setCustomLandingPageId(null);
    setCustomLandingPageSlug(null);
    setCustomLandingPageName(null);
    setPublishWeb(true);
    setPublishLandingPageNow(true);
    setTemplateAppliedToast(`"${tpl.name}" selected. The Super Admin template will be used for this project's landing page.`);
    setShowTemplateModal(false);
    setTimeout(() => setTemplateAppliedToast(null), 4000);
  }, []);

  // Draft persistence (localStorage stopgap — see notes above the component).
  // `hydrated` gates auto-save so we never write over a stored draft before
  // the user has chosen to resume or discard it.
  const [hydrated, setHydrated] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<WizardDraft | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Plan project quota. Blocks a fresh wizard when the org is already at its
  // limit (deep-link / bookmark guard — the projects list is the primary
  // block). A resumable draft is still allowed through; the Review step's
  // server-error path handles the "limit reached while mid-wizard" case.
  const [projectQuota, setProjectQuota] = useState<{
    used: number;
    limit: number | null;
    planName: string | null;
  } | null>(null);

  // Org catalogs (Settings → Project Catalogs). `null` = not loaded yet;
  // refetched on entry to each catalog step so freshly-added options show up.
  const [catalog, setCatalog] = useState<OrgCatalogOption[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const projectTypes = useProjectTypes(!!accessToken && CATALOG_STEPS.has(step));
  // The project's own editable copy of its type's field templates, the name of
  // its grouping column, and the typed values for the project-level template.
  const [projectFieldRows, setProjectFieldRows] = useState<FieldRow[]>([]);
  const [unitFieldRows, setUnitFieldRows] = useState<FieldRow[]>([]);
  const [customValues, setCustomValues] = useState<CustomValueDraft>({});
  const dynamicUnitTemplate = rowsToTemplate(unitFieldRows.filter((r) => r.label.trim()));
  // What the picked type currently has a field for, in Settings right now —
  // the reference the "missing role" recovery strip compares live edits
  // against. Derived live (not snapshotted at load) so it stays correct
  // across a type switch, and — the point of it — keeps flagging a role
  // this project lost even after that deletion is saved and the page is
  // reopened: a Plot never had Floor and never will (no strip), but an
  // Apartment missing its Group field is a standing gap until fixed, not a
  // one-session notice that quietly disappears the moment you save.
  const unitRoleBaseline = roleBaselineOf(
    projectTypes.types?.find((t) => t.name === projectType)?.unitFields,
  );
  const dynamicExtraFields = defaultableExtraFields(dynamicUnitTemplate);
  const traits = templateTraits(dynamicUnitTemplate);
  // The type's configuration-role field IS the source of "which configs can
  // this project offer" — not an unrelated org-wide catalog.
  const configFieldOptions: OrgCatalogOption[] = (
    roleField(dynamicUnitTemplate, "configuration")?.options ?? []
  ).map((label, i) => ({
    id: `cfg-${i}`, orgId: "", category: "unit_type" as const, label,
    sortOrder: i, createdAt: "", updatedAt: "",
  }));
  const projectTemplate = useMemo(
    () => rowsToTemplate(projectFieldRows.filter((r) => r.label.trim())),
    [projectFieldRows],
  );
  // Same rows, but for feeding ProjectFieldRows' own label inputs while the
  // user is actively typing: `projectTemplate` trims each label, so on every
  // keystroke a trailing space (exactly what a space bar press produces,
  // right before the next letter) got trimmed straight back out — the space
  // key looked like it did nothing. Trimming only matters for validation and
  // the publish payload, both of which still use `projectTemplate`.
  const projectFieldsLive = projectFieldRows.map((r) => ({
    key: r.key ?? `project_field_${r.rowId}`,
    label: r.label,
    type: r.type,
    required: r.required,
    ...(r.section.trim() ? { section: r.section.trim() } : {}),
    ...(r.role ? { role: r.role } : {}),
    ...(r.type === "choice" ? { options: r.optionsText.split(",").map((o) => o.trim()).filter(Boolean) } : {}),
    ...(r.type === "number" && r.unit.trim() ? { unit: r.unit.trim() } : {}),
    ...(r.type === "text" && r.multiline ? { multiline: true } : {}),
  }));

  useEffect(() => {
    if (!accessToken) return;
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
    // Everyone holding the manager role (same set the Users list gives for
    // role=manager), each with the projects they're already on.
    getProjectManagerCandidates()
      .then((res) => { setManagers(res.data); setManagersLoaded(true); })
      .catch(() => setManagers([]));
    // Everyone except Admins and Managers, resolved server-side — the same
    // rule the PUT enforces.
    getProjectSalesAgentCandidates()
      .then((res) => setSalesAgents(res.data))
      .catch(() => setSalesAgents([]));
    apiFetch<SafeOrganisation>("/org/settings", auth)
      .then((o) => setOrgName(o.name))
      .catch(() => setOrgName(""));
    apiFetch<OrgBillingSummary>("/org/billing", auth)
      .then((b) =>
        setProjectQuota({
          used: b.usage.projectsUsed,
          limit: b.usage.projectsLimit,
          planName: b.plan?.name ?? null,
        }),
      )
      .catch(() => setProjectQuota(null));
    getOrgLandingPages()
      .then((rows) => setOrgLandingPages(rows.filter((lp) => lp.pageType === "landing")))
      .catch(() => setOrgLandingPages([]));
    apiFetch<OrgTemplatesListResponse>("/org/templates?limit=50", auth)
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        setOrgDbTemplates(rows);
      })
      .catch(() => setOrgDbTemplates([]));
  }, [accessToken]);

  useEffect(() => {
    if (orgDbTemplates.length === 0) return;
    setSelectedTemplate((current) => {
      if (current && orgDbTemplates.some((t) => t.id === current.id)) return current;
      return orgDbTemplates[0];
    });
  }, [orgDbTemplates]);

  useEffect(() => {
    if (!accessToken || !CATALOG_STEPS.has(step)) return;
    let cancelled = false;
    getOrgCatalogOptions()
      .then((rows) => {
        if (!cancelled) { setCatalog(rows); setCatalogError(null); }
      })
      .catch((e) => {
        if (!cancelled) {
          setCatalogError(e instanceof Error ? e.message : "Couldn't load catalog options.");
        }
      });
    return () => { cancelled = true; };
  }, [accessToken, step]);

  const catalogByCategory = useMemo(() => {
    const grouped: Record<OrgCatalogCategory, OrgCatalogOption[]> = {
      project_type: [], unit_type: [], connectivity: [], amenity: [],
      price_includes: [], payment_plan: [], facing: [], parking: [], unit_variant: [],
      // Lead-only lists — unused by the project wizard, present only to keep
      // this record exhaustive over OrgCatalogCategory.
      lead_purpose: [], lead_financing: [], lead_loan_status: [],
      lead_timeline_to_buy: [], lead_preferred_floor: [], lead_tag: [],
    };
    for (const opt of catalog ?? []) grouped[opt.category]?.push(opt);
    for (const key of Object.keys(grouped) as OrgCatalogCategory[]) {
      grouped[key].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    }
    return grouped;
  }, [catalog]);

  // --- Required fields, per step. The rules live in lib/project-validation
  // so the edit page enforces exactly the same set. ---
  const requiredByStep = useMemo(
    () =>
      projectRequirements(
        { name, projectType, currency, status, priceMin, address, city, managerId, noManagers },
        { 1: customFieldRequirements(projectTemplate, customValues) },
      ),
    [name, projectType, currency, status, priceMin, address, city, managerId, noManagers, projectTemplate, customValues],
  );

  const missingOnStep = useCallback(
    (i: number) => missingOn(requiredByStep, i),
    [requiredByStep],
  );

  // Every unfilled required field across the whole wizard, in step order —
  // Publish's own last-line check, and what the Review step lists.
  const allMissingFields = useMemo(() => allMissing(requiredByStep), [requiredByStep]);

  const currentMissing = missingOnStep(step);
  const showErrors = validatedSteps.includes(step);
  // True once this step has been checked and this specific field is still empty.
  const invalid = (id: string) =>
    showErrors && currentMissing.some((f) => f.id === id);
  const fieldClass = (id: string, extra = "") =>
    `field${extra ? ` ${extra}` : ""}${invalid(id) ? " field-invalid" : ""}`;
  // The inline message for a field, from the shared rules — never re-typed here.
  const fieldError = (id: string) =>
    currentMissing.find((f) => f.id === id)?.error ?? "";

  const markValidated = useCallback((i: number) => {
    setValidatedSteps((prev) => (prev.includes(i) ? prev : [...prev, i]));
  }, []);

  // Picking a type prefills this project's templates and group name from it and
  // resets what belonged to the previous type. Structure the new layout
  // doesn't have (floors, configurations, group count) is cleared, so nothing
  // stale is submitted.
  function pickProjectType(label: string) {
    const next = projectType === label ? "" : label;
    const def = projectTypes.types?.find((t) => t.name === next) ?? null;
    setProjectType(next);
    setProjectFieldRows(fieldsToRows(def?.projectFields));
    setUnitFieldRows(fieldsToRows(def?.unitFields));
    setCustomValues({});
    const t = templateTraits(def?.unitFields ?? []);
    if (!t.configurations) { setSelectedConfigs([]); setUnitTypes([]); }
  }

  // Continue: check this step's own required fields right here. Anything
  // missing blocks the move and surfaces inline + in the footer summary.
  function goNext() {
    markValidated(step);
    if (missingOnStep(step).length > 0) return;
    setJumpWarning(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function goBack() {
    setJumpWarning(null);
    setStep((s) => Math.max(0, s - 1));
  }

  // Step-rail navigation. Going back to an earlier (or the current) step is
  // free. Jumping *ahead* out of a step with missing required fields raises a
  // warning first rather than silently navigating away from it.
  function goToStep(target: number) {
    if (target <= step || missingOnStep(step).length === 0) {
      setJumpWarning(null);
      setStep(target);
      return;
    }
    markValidated(step);
    setJumpWarning({ to: target, missing: missingOnStep(step).map((f) => f.label) });
  }

  // Filled specification rows, for the Review step's read-only summary.
  const reviewSpecRows = useMemo(
    () =>
      specRows
        .filter((r) => r.value.trim())
        .map((r) => [r.label.trim() || "—", r.value.trim()] as [string, string]),
    [specRows],
  );

  const unitRollup = useMemo(() => {
    const total = unitTypes.reduce((s, u) => s + (parseInt(u.totalUnits, 10) || 0), 0);
    return { total };
  }, [unitTypes]);

  const collectDraft = useCallback(
    (): WizardDraft => ({
      _savedAt: Date.now(),
      step, name, projectType, tagline, reraId, status, launchDate, possession, constructionStage,
      selectedConfigs, highlights, unitTypes,
      projectFields: rowsToTemplate(projectFieldRows.filter((r) => r.label.trim())),
      unitFields: rowsToTemplate(unitFieldRows.filter((r) => r.label.trim())),
      customValues,
      priceMin, priceMax, baseRate, bookingAmount, currency, areaUnit, priceIncludes, paymentPlan, offers,
      address, city, locality, pincode, nearby, landmarks,
      amenities, specRows, specNotes,
      metaAds, googleAds, linkedinAds, portalAds, monthlyBudget, targetCpl, leadGoal, landingPage, aiCalling, whatsappAuto, roundRobin, aiKnowledgeBase,
      managerId, salesTeam, agentAssign, requireApproval, visibleTele, publishWeb,
      coverImageUrl, galleryUrls, brochureUrl, reraCertificateUrl, floorPlanUrls,
      customLandingPageId, customLandingPageSlug, customLandingPageName,
      selectedTemplateId: selectedTemplate?.id ?? null,
    }),
    [
      step, name, projectType, tagline, reraId, status, launchDate, possession, constructionStage,
      selectedConfigs, highlights, unitTypes,
      priceMin, priceMax, baseRate, bookingAmount, currency, areaUnit, priceIncludes, paymentPlan, offers,
      address, city, locality, pincode, nearby, landmarks,
      amenities, specRows, specNotes,
      metaAds, googleAds, linkedinAds, portalAds, monthlyBudget, targetCpl, leadGoal, landingPage, aiCalling, whatsappAuto, roundRobin, aiKnowledgeBase,
      managerId, salesTeam, agentAssign, requireApproval, visibleTele, publishWeb,
      coverImageUrl, galleryUrls, brochureUrl, reraCertificateUrl, floorPlanUrls,
      customLandingPageId, customLandingPageSlug, customLandingPageName, selectedTemplate,
      projectFieldRows, unitFieldRows, customValues,
    ],
  );

  // Mount: look for a saved draft for this org. Never auto-applies and never
  // overwrites — a meaningful draft raises the resume/discard prompt; an
  // empty or unparseable one is cleaned and we start fresh.
  useEffect(() => {
    if (!orgId) return;
    sweepOldProjectDrafts();
    /* eslint-disable react-hooks/set-state-in-effect */
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(draftKey(orgId)); } catch { raw = null; }
    if (!raw) { setHydrated(true); return; }
    let parsed: WizardDraft | null = null;
    try { parsed = JSON.parse(raw) as WizardDraft; } catch { parsed = null; }
    if (parsed && typeof parsed === "object" && isMeaningfulDraft(parsed)) {
      setPendingDraft(parsed);
    } else {
      try { window.localStorage.removeItem(draftKey(orgId)); } catch { /* ignore */ }
      setHydrated(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [orgId]);

  // Auto-save on every change once hydrated — the sole save mechanism; the
  // "Draft saved · {time}" footer indicator reflects it.
  useEffect(() => {
    if (!hydrated || !orgId) return;
    const draft = collectDraft();
    try {
      window.localStorage.setItem(draftKey(orgId), JSON.stringify(draft));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedAt(draft._savedAt);
    } catch {
      /* quota exceeded / storage disabled — the draft just won't persist */
    }
  }, [hydrated, orgId, collectDraft]);

  function toggleConfig(c: string) {
    setSelectedConfigs((prev) => {
      const on = prev.includes(c);
      // Keep one draft unit type per picked configuration. Entering carpet /
      // built-up / price here is what lets the unit form prefill from it after
      // publishing; leaving them blank still creates the planned type.
      setUnitTypes((rows) =>
        on
          ? rows.filter((r) => r.name !== c)
          : rows.some((r) => r.name === c)
            ? rows
            : [...rows, { ...makeUnitType(), name: c }],
      );
      return on ? prev.filter((x) => x !== c) : [...prev, c];
    });
  }
  function toggleAmenity(a: string) {
    setAmenities((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  }
  function toggleNearby(n: string) {
    setNearby((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]);
  }
  function toggleIncludes(v: string) {
    setPriceIncludes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  function updateUnitType(key: string | number, patch: Partial<UnitTypeDraft>) {
    setUnitTypes((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  function applyDraft(d: WizardDraft) {
    setStep(typeof d.step === "number" ? d.step : 0);
    setName(d.name ?? ""); setProjectType(d.projectType ?? ""); setTagline(d.tagline ?? "");
    setReraId(d.reraId ?? ""); setStatus(d.status ?? "active"); setLaunchDate(d.launchDate ?? "");
    setPossession(d.possession ?? ""); setConstructionStage(d.constructionStage ?? "Under construction");
    setSelectedConfigs(d.selectedConfigs ?? []);
    setHighlights(d.highlights ?? "");
    // Older drafts predate the `extra` bag — default it so a resumed draft
    // never crashes the defaults table.
    setUnitTypes((d.unitTypes ?? []).map((u) => ({ ...u, extra: u.extra ?? {} })));
    setProjectFieldRows(fieldsToRows(d.projectFields)); setUnitFieldRows(fieldsToRows(d.unitFields));
    setCustomValues(d.customValues ?? {});
    setPriceMin(d.priceMin ?? ""); setPriceMax(d.priceMax ?? ""); setBaseRate(d.baseRate ?? ""); setBookingAmount(d.bookingAmount ?? "");
    setCurrency(d.currency ?? "INR"); setAreaUnit(d.areaUnit ?? "sqft"); setPriceIncludes(d.priceIncludes ?? []);
    setPaymentPlan(d.paymentPlan ?? ""); setOffers(d.offers ?? "");
    setAddress(d.address ?? ""); setCity(d.city ?? ""); setLocality(d.locality ?? ""); setPincode(d.pincode ?? "");
    setNearby(d.nearby ?? []); setLandmarks(d.landmarks ?? "");
    setAmenities(d.amenities ?? []);
    // A resumed draft keeps exactly the rows it was saved with — including
    // ones the user deleted — so restoring never re-adds the defaults.
    setSpecRows(Array.isArray(d.specRows) ? d.specRows : defaultSpecRows());
    setSpecNotes(d.specNotes ?? "");
    setMetaAds(d.metaAds ?? true); setGoogleAds(d.googleAds ?? true); setLinkedinAds(d.linkedinAds ?? false);
    setPortalAds(d.portalAds ?? true); setMonthlyBudget(d.monthlyBudget ?? ""); setTargetCpl(d.targetCpl ?? "");
    setLeadGoal(d.leadGoal ?? ""); setLandingPage(d.landingPage ?? "Create new from template…");
    setAiCalling(d.aiCalling ?? true); setWhatsappAuto(d.whatsappAuto ?? true); setRoundRobin(d.roundRobin ?? true);
    setAiKnowledgeBase(d.aiKnowledgeBase ?? true);
    setManagerId(d.managerId ?? ""); setSalesTeam(d.salesTeam ?? "Ahmedabad — West"); setAgentAssign(d.agentAssign ?? []);
    setRequireApproval(d.requireApproval ?? true); setVisibleTele(d.visibleTele ?? true); setPublishWeb(d.publishWeb ?? false);
    setCoverImageUrl(d.coverImageUrl ?? null); setGalleryUrls(d.galleryUrls ?? []);
    setBrochureUrl(d.brochureUrl ?? null); setReraCertificateUrl(d.reraCertificateUrl ?? null);
    setFloorPlanUrls(d.floorPlanUrls ?? []);
    if (d.customLandingPageId) setCustomLandingPageId(d.customLandingPageId);
    if (d.customLandingPageSlug) setCustomLandingPageSlug(d.customLandingPageSlug);
    if (d.customLandingPageName) setCustomLandingPageName(d.customLandingPageName);
    if (d.selectedTemplateId) {
      const match = orgDbTemplates.find((t) => t.id === d.selectedTemplateId);
      if (match) setSelectedTemplate(match);
    }
  }

  function resumeDraft() {
    if (pendingDraft) applyDraft(pendingDraft);
    setPendingDraft(null);
    setHydrated(true);
  }

  function discardDraft() {
    if (orgId) {
      try { window.localStorage.removeItem(draftKey(orgId)); } catch { /* ignore */ }
    }
    setPendingDraft(null);
    setHydrated(true);
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const selectedManager = managers.find((m) => m.id === managerId) ?? null;

  const openTemplateInVisualBuilder = useCallback(async (tplTarget?: OrgTemplateSummary) => {
    if (!accessToken) return;
    const tpl = tplTarget || selectedTemplate;
    if (!tpl) {
      setError("Select a Super Admin template first. If none appear, ask an administrator to assign templates to this organisation.");
      setShowTemplateModal(true);
      return;
    }
    setCustomizingInBuilder(true);
    setError(null);
    try {
      if (customLandingPageId) {
        router.push(orgBuilderPath(customLandingPageId, "/org/projects/add-new-project"));
        return;
      }

      const lpName = landingPageTitle.trim() || (name.trim() ? `${name.trim()} — Official Landing Page` : `${tpl.name} — Project Landing Page`);
      const lp = await apiFetch<LandingPageRow>("/org/landing-pages", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ templateId: tpl.id, name: lpName }),
      });

      if (lp?.id) {
        setCustomLandingPageId(lp.id);
        setCustomLandingPageSlug(lp.slug);
        setCustomLandingPageName(lpName);
        setPublishLandingPageNow(true);

        if (orgId) {
          const updatedDraft = {
            ...collectDraft(),
            customLandingPageId: lp.id,
            customLandingPageSlug: lp.slug,
            customLandingPageName: lpName,
            selectedTemplateId: tpl.id,
          };
          try {
            window.localStorage.setItem(draftKey(orgId), JSON.stringify(updatedDraft));
          } catch { }
        }

        router.push(orgBuilderPath(lp.id, "/org/projects/add-new-project"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open visual builder for this template.");
      setCustomizingInBuilder(false);
    }
  }, [
    accessToken,
    selectedTemplate,
    customLandingPageId,
    landingPageTitle,
    name,
    orgId,
    collectDraft,
    router,
  ]);

  async function submit() {
    if (!accessToken) return;
    // Last-line check. Each step already blocks its own Continue, but a draft
    // resumed straight onto Review — or a rail jump the user confirmed past a
    // warning — can still reach here incomplete.
    if (allMissingFields.length > 0) {
      reportPresenceError();
      for (const f of allMissingFields) markValidated(f.step);
      setError(
        `Fill in the required field${allMissingFields.length > 1 ? "s" : ""} first: ${allMissingFields.map((f) => f.label).join(", ")}.`,
      );
      setJumpWarning(null);
      setStep(allMissingFields[0].step);
      return;
    }

    const templateProblem =
      validateFieldRows(projectFieldRows, "Project fields") ?? validateFieldRows(unitFieldRows, "Unit fields");
    if (templateProblem) {
      reportPresenceError();
      setError(templateProblem);
      setStep(1);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Step 5 — specifications: dynamic { label, value } rows plus notes.
      // Omitted entirely when nothing was filled in.
      const specifications = serializeSpecifications(specRows, specNotes);

      // Step 6 — marketing preference blob. Always sent (the toggles have
      // meaningful defaults). `aiKnowledgeBaseEnabled` is collected from
      // Step 8's UI but lives here, not a separate column.
      const marketing = {
        adSources: [
          metaAds && "Meta",
          googleAds && "Google",
          linkedinAds && "LinkedIn",
          portalAds && "Portals",
        ].filter(Boolean) as string[],
        monthlyBudget: parseAmount(monthlyBudget) ?? null,
        targetCpl: parseAmount(targetCpl) ?? null,
        leadGoal: parseCount(leadGoal) ?? null,
        landingPageChoice: landingPage,
        aiCallingEnabled: aiCalling,
        whatsappWelcomeEnabled: whatsappAuto,
        roundRobinEnabled: roundRobin,
        aiKnowledgeBaseEnabled: aiKnowledgeBase,
      };

      const body: CreateProjectInput = {
        name: name.trim(),
        // `location` stays the denormalised display string (project list,
        // cards, header, detail all read it) — kept in sync with the
        // structured city/locality fields below, same as before.
        location: [locality, city].filter(Boolean).join(", ") || undefined,
        reraId: reraId.trim() || undefined,
        possession: possession.trim() || undefined,
        managerId: managerId || undefined,
        status,
        priceMin: parseAmount(priceMin),
        priceMax: parseAmount(priceMax),
        baseRate: parseAmount(baseRate),
        projectType: projectType || undefined,
        // This project's own copy of the type's templates, and the typed
        // values — validated again server-side.
        projectFieldTemplate: projectTemplate,
        unitFieldTemplate: rowsToTemplate(unitFieldRows.filter((r) => r.label.trim())),
        customFields: draftToPayload(projectTemplate, customValues),
        areaUnit,
        tagline: tagline.trim() || undefined,
        launchDate: launchDate || undefined,
        constructionStage: constructionStage || undefined,
        highlights: highlights.trim() || undefined,
        salesTeam: salesTeam || undefined,
        amenities: amenities.map((a) => ({ name: a, iconUrl: null })),
        // Step 3 — pricing & payment (remaining fields)
        bookingAmount: parseAmount(bookingAmount),
        currency,
        priceIncludes: priceIncludes.length ? priceIncludes : undefined,
        paymentPlan: paymentPlan || undefined,
        offers: offers.trim() || undefined,
        // Step 4 — location & connectivity
        addressLine: address.trim() || undefined,
        city: city.trim() || undefined,
        locality: locality.trim() || undefined,
        pincode: pincode.trim() || undefined,
        connectivity: nearby.length ? nearby : undefined,
        landmarks: landmarks.trim() || undefined,
        // Step 5 & 6 — preference blobs
        specifications,
        marketing,
        // Step 7 — access toggles (assigned agents go via a follow-up call)
        requireBookingApproval: requireApproval,
        visibleToTelecallers: visibleTele,
        publishedToWebsite: publishWeb,
        // Step 8 — documents & media (R2 public URLs, uploaded org-scoped above)
        coverImageUrl: coverImageUrl ?? undefined,
        galleryUrls: galleryUrls.length ? galleryUrls : undefined,
        brochureUrl: brochureUrl ?? undefined,
        reraCertificateUrl: reraCertificateUrl ?? undefined,
        floorPlanUrls: floorPlanUrls.length ? floorPlanUrls : undefined,
      };

      const project = await apiFetch<Project>("/org/projects", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      const seededNames = new Set<string>();
      for (const u of traits.configurations ? unitTypes : []) {
        if (!u.name.trim()) continue;
        const areaKey = roleField(dynamicUnitTemplate, "area")?.key;
        const priceKey = roleField(dynamicUnitTemplate, "price")?.key;
        const utBody: CreateUnitTypeInput = {
          name: u.name.trim(),
          fieldDefaults: {
            ...(areaKey ? { [areaKey]: parseDecimal(u.area) } : {}),
            ...(priceKey ? { [priceKey]: parseAmount(u.price) } : {}),
            ...Object.fromEntries(
              Object.entries(u.extra).map(([key, v]) => [key, parseDecimal(v)]),
            ),
          },
          totalUnits: parseCount(u.totalUnits),
        };
        await apiFetch(`/org/projects/${project.id}/unit-types`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(utBody),
        });
        seededNames.add(utBody.name);
      }

      // Seed the planned unit mix from the configurations picked in Step 2.
      // Counts start at 0 — the user fills them in later on the Units tab.
      // Without this the picked configs are shown in Review and then vanish.
      for (const label of traits.configurations ? selectedConfigs : []) {
        if (seededNames.has(label)) continue;
        const utBody: CreateUnitTypeInput = { name: label, totalUnits: 0 };
        await apiFetch(`/org/projects/${project.id}/unit-types`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(utBody),
        });
      }

      // Step 7 — assign the picked sales agents. Follow-up call (needs the
      // new project id). A failure here must NOT fail the publish: the
      // project already exists, so we clear the draft and surface a
      // non-blocking notice with a manual link instead of redirecting.
      let agentsFailed = false;
      if (agentAssign.length > 0) {
        try {
          await setProjectSalesAgents(project.id, agentAssign);
        } catch {
          agentsFailed = true;
        }
      }

      // Automatically create and publish project landing page if enabled
      let publishedLp: { id: string; slug: string; name: string } | null = null;
      if (publishLandingPageNow) {
        try {
          const lpName = landingPageTitle.trim() || `${project.name} — Official Landing Page`;

          if (customLandingPageId) {
            // Already customized in the visual builder! Publish directly.
            await apiFetch(`/org/landing-pages/${customLandingPageId}/publish`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            await apiFetch(`/org/projects/${project.id}`, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                publishedToWebsite: true,
                marketing: {
                  ...marketing,
                  landingPageId: customLandingPageId,
                  landingPageSlug: customLandingPageSlug,
                  landingPageChoice: customLandingPageName || lpName,
                },
              }),
            });

            publishedLp = {
              id: customLandingPageId,
              slug: customLandingPageSlug || "project",
              name: customLandingPageName || lpName,
            };
            setCreatedLandingPage(publishedLp);
          } else {
            if (!selectedTemplate) {
              throw new Error("Select a Super Admin template before publishing a landing page.");
            }

            const lp = await apiFetch<LandingPageRow>("/org/landing-pages", {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                templateId: selectedTemplate.id,
                name: lpName,
                projectId: project.id,
              }),
            });

            if (lp?.id) {
              await apiFetch(`/org/landing-pages/${lp.id}/publish`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
              });

              await apiFetch(`/org/projects/${project.id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                  publishedToWebsite: true,
                  marketing: {
                    ...marketing,
                    landingPageId: lp.id,
                    landingPageSlug: lp.slug,
                    landingPageChoice: lpName,
                  },
                }),
              });

              publishedLp = { id: lp.id, slug: lp.slug, name: lpName };
              setCreatedLandingPage(publishedLp);
            }
          }
        } catch (lpErr) {
          setError(
            lpErr instanceof Error
              ? `Project saved, but the landing page was not created: ${lpErr.message}`
              : "Project saved, but the landing page was not created from the selected template.",
          );
        }
      }

      if (orgId) {
        try { window.localStorage.removeItem(draftKey(orgId)); } catch { /* ignore */ }
      }

      setPublishedProjectId(project.id);

      if (agentsFailed) {
        setError(
          "Project published, but assigning sales agents failed. You can add them from the project's Team section.",
        );
        setSubmitting(false);
        return;
      }

      if (publishedLp) {
        setSubmitting(false);
        return;
      }

      router.push(`/org/projects/${project.id}`);
    } catch (err) {
      reportPresenceError();
      setError(err instanceof Error ? err.message : "Failed to create the project.");
      setSubmitting(false);
    }
  }

  const atProjectLimit =
    projectQuota != null &&
    projectQuota.limit != null &&
    projectQuota.used >= projectQuota.limit;

  // At the limit with no draft to resume — don't let the wizard open at all.
  if (atProjectLimit && !pendingDraft) {
    return (
      <div className="card reveal in" style={{ maxWidth: 620, margin: "40px auto", padding: 28, textAlign: "center" }}>
        <div style={{ marginBottom: 8 }}><Icon name="lock" size={32} /></div>
        <h2 style={{ margin: "0 0 8px" }}>You&apos;ve reached your project limit</h2>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
          Your{projectQuota?.planName ? ` ${projectQuota.planName}` : ""} plan allows{" "}
          <b>{projectQuota?.limit}</b> project{projectQuota?.limit === 1 ? "" : "s"} and you already have{" "}
          <b>{projectQuota?.used}</b>. Upgrade your plan to create another.
        </p>
        <div className="row gap-10" style={{ justifyContent: "center" }}>
          <button className="btn btn-ghost" type="button" onClick={() => router.push("/org/projects")}>← Back to projects</button>
          <Link href="/org/settings?section=billing" className="btn btn-primary">Upgrade plan</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {pendingDraft && (
        <div
          className="card reveal in"
          style={{ marginBottom: 16, borderColor: "var(--brand)", padding: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
        >
          <span style={{ display: "inline-flex" }}><Icon name="document" size={22} /></span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b>Unfinished draft found</b>
            <div className="muted" style={{ fontSize: 13 }}>
              You started a project and left it {formatRelative(pendingDraft._savedAt)}. Resume where you left off, or discard it and start a new one.
            </div>
          </div>
          <div className="row gap-10">
            <button className="btn btn-ghost" onClick={discardDraft}>Discard &amp; start new</button>
            <button className="btn btn-primary" onClick={resumeDraft}>Resume draft</button>
          </div>
        </div>
      )}

      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b", marginBottom: 14 }}>
        <Link href="/org" style={{ color: "#64748b", display: "inline-flex", alignItems: "center" }}>
          <Icon name="home" size={15} />
        </Link>
        <Icon name="chevron-right" size={12} />
        <Link href="/org/projects" style={{ color: "#64748b", textDecoration: "none" }}>
          Projects
        </Link>
        <Icon name="chevron-right" size={12} />
        <span style={{ color: "#0f172a", fontWeight: 600 }}>Add New Project</span>
      </div>

      {/* Page Header */}
      <div className="page-head reveal in" style={{ marginBottom: 20, borderBottom: "none", paddingBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", color: "#0066f5", flexShrink: 0 }}>
            <Icon name="building" size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Create New Project</h1>
            <div className="sub" style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
              Add project details, inventory, pricing and more. After creation, a landing page will be automatically generated.
            </div>
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/org/projects")}
            style={{ borderRadius: 9, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            ← Back to Projects
          </button>
        </div>
      </div>

      {/* Horizontal Stepper (8 Steps matching Image 4) */}
      <div
        className="wz-horizontal-stepper reveal in"
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          overflowX: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", minWidth: 840, position: "relative" }}>
          {STEPS.map((s, i) => {
            const status = stepStatus(i, step, requiredByStep);
            const isActive = step === i;
            const isDone = status === "complete";
            const isWarn = (jumpWarning && step === i) || status === "incomplete";
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => goToStep(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goToStep(i);
                  }
                }}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  position: "relative",
                  cursor: "pointer",
                  userSelect: "none",
                  padding: "8px 6px",
                  borderRadius: 12,
                  background: isWarn ? "#fef9c3" : "transparent",
                  border: isWarn ? "1.5px solid #facc15" : "1.5px solid transparent",
                  boxShadow: isWarn ? "0 2px 10px rgba(234, 179, 8, 0.25)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                {/* Horizontal line connector */}
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 22,
                      left: "50%",
                      width: "100%",
                      height: 2,
                      background: i < step ? "#0066f5" : "#e2e8f0",
                      zIndex: 1,
                      transition: "background 0.2s",
                    }}
                  />
                )}
                {/* Number circle */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    position: "relative",
                    zIndex: 2,
                    background: isWarn
                      ? "#f59e0b"
                      : isActive
                        ? "#0066f5"
                        : isDone
                          ? "#eff6ff"
                          : "#fff",
                    color: isWarn
                      ? "#fff"
                      : isActive
                        ? "#fff"
                        : isDone
                          ? "#0066f5"
                          : "#64748b",
                    border: isWarn
                      ? "2px solid #d97706"
                      : isActive
                        ? "2px solid #0066f5"
                        : isDone
                          ? "2px solid #0066f5"
                          : "2px solid #cbd5e1",
                    boxShadow: isWarn
                      ? "0 4px 12px rgba(245, 158, 11, 0.4)"
                      : isActive
                        ? "0 4px 12px rgba(0, 102, 245, 0.35)"
                        : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {isWarn ? <Icon name="alert" size={13} /> : isDone && !isActive ? <Icon name="check" size={13} /> : i + 1}
                </div>
                {/* Label text */}
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isActive || isWarn ? 700 : 600,
                      color: isWarn ? "#854d0e" : isActive ? "#0f172a" : "#475569",
                      lineHeight: 1.25,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: isWarn ? "#a16207" : "#94a3b8",
                      marginTop: 2,
                      lineHeight: 1.2,
                    }}
                  >
                    {s.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Reveal delay={1}>
        <div className="wz" style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 310px)" }}>
          {/* Raised when a step click would jump ahead out of an incomplete step */}
          {jumpWarning && (
            <div
              className="help err mb-20"
              style={{
                background: "#fffbeb",
                border: "1.5px solid #fde68a",
                borderRadius: 12,
                padding: "16px 18px",
                boxShadow: "0 2px 10px rgba(245, 158, 11, 0.08)",
              }}
            >
              <b style={{ color: "#b45309", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                <Icon name="alert" size={15} /> {STEPS[step].label} isn&apos;t complete.
              </b>
              <div style={{ marginTop: 6, fontSize: 13, color: "#92400e", lineHeight: 1.45 }}>
                Still needed here: <b>{jumpWarning.missing.join(", ")}</b>. You can fill it in now, or skip ahead to <b>{STEPS[jumpWarning.to].label}</b> and come back — the project can&apos;t be published until it&apos;s filled in.
              </div>
              <div className="row gap-10 mt-12" style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ background: "#f59e0b", borderColor: "#d97706", color: "#fff", fontWeight: 600 }}
                  onClick={() => setJumpWarning(null)}
                >
                  Stay and fill it in
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "#92400e", fontWeight: 600 }}
                  onClick={() => { const to = jumpWarning.to; setJumpWarning(null); setStep(to); }}
                >
                  Go to {STEPS[jumpWarning.to].label} anyway →
                </button>
              </div>
            </div>
          )}

          {/* STEP 1 — Basics (2-Column Layout matching Image 4) */}
          {step === 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)", gap: 24, alignItems: "start" }}>
              {/* Left Column: Form Card */}
              <div
                className="card pad-24"
                style={{
                  borderRadius: 14,
                  border: (jumpWarning && step === 0) ? "1.5px solid #fde047" : "1px solid #e2e8f0",
                  background: "#fff",
                  boxShadow: (jumpWarning && step === 0) ? "0 4px 16px rgba(245, 158, 11, 0.1)" : undefined,
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 20,
                    padding: (jumpWarning && step === 0) ? "10px 14px" : undefined,
                    background: (jumpWarning && step === 0) ? "#fef9c3" : undefined,
                    borderRadius: (jumpWarning && step === 0) ? 10 : undefined,
                    border: (jumpWarning && step === 0) ? "1px solid #fde047" : undefined,
                    transition: "all 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: (jumpWarning && step === 0) ? "#fef08a" : "#eff6ff",
                      border: (jumpWarning && step === 0) ? "1px solid #facc15" : "1px solid #bfdbfe",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: (jumpWarning && step === 0) ? "#b45309" : "#0066f5",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={jumpWarning && step === 0 ? "alert" : "document"} size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: (jumpWarning && step === 0) ? "#854d0e" : "#0f172a" }}>
                        Project Basics
                      </h2>
                      {jumpWarning && step === 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 6,
                            background: "#fef08a",
                            color: "#854d0e",
                            border: "1px solid #facc15",
                          }}
                        >
                          Incomplete
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: (jumpWarning && step === 0) ? "#92400e" : "#64748b", marginTop: 2 }}>
                      Enter the basic information about your real estate project.
                    </div>
                  </div>
                </div>

                {/* Row 1: Name and Developer */}
                <div className="grid g2" style={{ gap: 16, marginBottom: 18 }}>
                  <div className={fieldClass("name")}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" }}>
                      Project name <span className="req" style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      className="inp"
                      placeholder="e.g. Palm Residency"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ height: 40, borderRadius: 9, fontSize: 13 }}
                    />
                    {invalid("name") && <div className="field-err">Project name is required.</div>}
                  </div>

                  <div className="field">
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" }}>
                      Developer / channel partner <span className="req" style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      className="inp"
                      value={orgName || "Skyline Developers"}
                      readOnly
                      style={{ height: 40, borderRadius: 9, fontSize: 13, background: "#f8fafc", color: "#334155" }}
                    />
                    <div className="hint" style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      Your organisation, set during onboarding. Change it in Settings → General.
                    </div>
                  </div>
                </div>

                {/* Row 2: Project type * */}
                <div className={fieldClass("projectType")} style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 8, display: "block" }}>
                    Project type <span className="req" style={{ color: "#ef4444" }}>*</span>
                  </label>

                  {/* Visual Card Selector */}
                  {!projectTypes.loaded ? (
                    <div style={{ fontSize: 13, color: "#64748b", padding: "12px 0" }}>
                      Loading project types…
                    </div>
                  ) : (projectTypes.options?.length ?? 0) === 0 ? (
                    <div
                      style={{
                        padding: "14px 16px",
                        background: "#f8fafc",
                        border: "1px dashed #cbd5e1",
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, color: "#64748b" }}>
                        No project types found for your organisation.
                      </div>
                      <button
                        type="button"
                        onClick={() => void projectTypes.addCommon()}
                        disabled={projectTypes.adding}
                        className="btn btn-sm btn-primary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                      >
                        {projectTypes.adding ? "Adding…" : "Add common types"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                      {(() => {
                        const items = [...(projectTypes.options ?? [])];
                        if (
                          projectType &&
                          !items.some((o) => o.label.toLowerCase() === projectType.toLowerCase())
                        ) {
                          items.push({
                            id: "custom",
                            orgId: "",
                            category: "project_type",
                            label: projectType,
                            sortOrder: 999,
                            createdAt: "",
                            updatedAt: "",
                          });
                        }
                        return items.map((item) => {
                          const isSelected = projectType.toLowerCase() === item.label.toLowerCase();
                          const iconName: IconName = (() => {
                            const l = item.label.toLowerCase();
                            if (l.includes("plot") || l.includes("land")) return "map";
                            if (
                              l.includes("villa") ||
                              l.includes("bungalow") ||
                              l.includes("house") ||
                              l.includes("home")
                            )
                              return "home";
                            return "building";
                          })();
                          return (
                            <div
                              key={item.label}
                              onClick={() => pickProjectType(item.label)}
                              style={{
                                border: isSelected ? "2px solid #0066f5" : "1px solid #e2e8f0",
                                background: isSelected ? "rgba(0, 102, 245, 0.04)" : "#fff",
                                borderRadius: 10,
                                padding: "12px 14px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ color: isSelected ? "#0066f5" : "#64748b" }}>
                                  <Icon name={iconName} size={18} />
                                </div>
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: isSelected ? 700 : 500,
                                    color: isSelected ? "#0f172a" : "#334155",
                                  }}
                                >
                                  {item.label}
                                </span>
                              </div>
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  border: isSelected
                                    ? "5px solid #0066f5"
                                    : "1.5px solid #cbd5e1",
                                  background: "#fff",
                                  flexShrink: 0,
                                  transition: "all 0.15s",
                                }}
                              />
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                  {invalid("projectType") && <div className="field-err">Pick a project type.</div>}
                </div>

                {/* Row 3: Currency & Area unit */}
                <div className="grid g2" style={{ gap: 16, marginBottom: 18 }}>
                  <div className={fieldClass("currency")}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" }}>
                      Currency <span className="req" style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      className="inp"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{ height: 40, borderRadius: 9, fontSize: 13 }}
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <div className="hint" style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      Every price on this project is in this currency.
                    </div>
                    {invalid("currency") && <div className="field-err">Pick a currency before entering any prices.</div>}
                  </div>

                  <div className="field">
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" }}>
                      Area unit <span className="req" style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      className="inp"
                      value={areaUnit}
                      onChange={(e) => setAreaUnit(e.target.value)}
                      style={{ height: 40, borderRadius: 9, fontSize: 13 }}
                    >
                      <option value="sqft">sq ft</option>
                      <option value="sqyd">sq yd</option>
                      <option value="sqm">sq m</option>
                      <option value="acre">acre</option>
                    </select>
                    <div className="hint" style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      Used for every area-role value and price per unit area on this project.
                    </div>
                  </div>
                </div>

                {/* Row 4: Short tagline */}
                <div className="field" style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" }}>
                    Short tagline
                  </label>
                  <input
                    className="inp"
                    placeholder="e.g. 2 &amp; 3 BHK homes on SG Highway"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    style={{ height: 40, borderRadius: 9, fontSize: 13 }}
                  />
                  <div className="hint" style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    Shown on the public page and landing pages.
                  </div>
                </div>

                {/* Optional Approvals & Status */}
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16, marginTop: 10 }}>
                  <div className="grid g2" style={{ gap: 16 }}>
                    <div className="field">
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" }}>
                        RERA registration no.
                      </label>
                      <input
                        className="inp"
                        placeholder="e.g. PR/GJ/AHM/2026/00842"
                        value={reraId}
                        onChange={(e) => setReraId(e.target.value)}
                        style={{ height: 40, borderRadius: 9, fontSize: 13 }}
                      />
                    </div>

                    <div className={fieldClass("status")}>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" }}>
                        Status <span className="req" style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <select
                        className="inp"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                        style={{ height: 40, borderRadius: 9, fontSize: 13 }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      {invalid("status") && <div className="field-err">Pick a status.</div>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Project Cover Image + Quick Preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Card 1: Project cover image */}
                <div className="card pad-20" style={{ borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>
                    <Icon name="camera" size={16} /> Project cover image
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
                    {/* Upload Box */}
                    <div
                      style={{
                        border: "1.5px dashed #cbd5e1",
                        borderRadius: 12,
                        padding: "16px 12px",
                        textAlign: "center",
                        background: "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        minHeight: 120,
                      }}
                    >
                      <Icon name="upload" size={20} style={{ color: "#64748b" }} />
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>Upload project image</div>
                      <div style={{ fontSize: 10.5, color: "#94a3b8" }}>JPG, PNG or WebP (Max 5MB)</div>
                      <input
                        type="file"
                        ref={coverFileRef}
                        style={{ display: "none" }}
                        accept="image/*"
                        onChange={handleCoverFileChange}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => coverFileRef.current?.click()}
                        disabled={uploadingCover}
                        style={{ marginTop: 4, borderRadius: 7, fontSize: 11.5, padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        <Icon name="upload" size={12} /> {uploadingCover ? "Uploading…" : "Choose Image"}
                      </button>
                    </div>

                    {/* Cover Thumbnail Preview */}
                    <div
                      style={{
                        height: 120,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid #e2e8f0",
                        position: "relative",
                        background: "#1e293b",
                      }}
                    >
                      <img
                        src={coverImageUrl || "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80"}
                        alt="Cover preview"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 2: Quick Preview */}
                <div className="card pad-20" style={{ borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>
                      <Icon name="eye" size={16} /> Quick preview
                    </div>
                    <span style={{ fontSize: 12, color: "#0066f5", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                      View sample →
                    </span>
                  </div>

                  {/* Mini Property Card */}
                  <div
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "#fff",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ height: 130, position: "relative", overflow: "hidden", background: "#334155" }}>
                      <img
                        src={coverImageUrl || "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80"}
                        alt="Project preview"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ padding: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                        {name.trim() || "Palm Residency"}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {projectType || "Apartment"} by {orgName || "Skyline Developers"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b", marginTop: 6 }}>
                        <Icon name="pin" size={12} /> {city ? `${city}` : "Bangalore, Karnataka"}
                      </div>
                      {tagline && (
                        <div style={{ fontSize: 11.5, color: "#475569", marginTop: 6, fontStyle: "italic" }}>
                          {tagline}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #f1f5f9", marginTop: 12, paddingTop: 10, fontSize: 11, color: "#64748b" }}>
                        <div>
                          <span style={{ display: "block", color: "#94a3b8" }}>Type</span>
                          <b style={{ color: "#334155" }}>{projectType || "Apartment"}</b>
                        </div>
                        <div>
                          <span style={{ display: "block", color: "#94a3b8" }}>Currency</span>
                          <b style={{ color: "#334155" }}>{currency || "INR"} (₹)</b>
                        </div>
                        <div>
                          <span style={{ display: "block", color: "#94a3b8" }}>Area unit</span>
                          <b style={{ color: "#334155" }}>{areaUnit === "sqft" ? "sq ft" : areaUnit}</b>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CARD CONTAINER FOR STEPS 2 to 9 */}
          {step > 0 && (
            <div className="card pad-26" style={{ borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff" }}>

            {/* STEP 2 — Inventory */}
            {step === 1 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 2 of 9</div><h2>Inventory &amp; configuration</h2><div className="sub">Which unit types this project offers and the overall inventory picture.</div></div>
                <div className="help mb-14">Project type: <b>{projectType || "Not selected"}</b></div>
                <div className="q-sec">
                  <div className="lbl">{traits.configurations ? <><Icon name="home" size={15} /> Unit configurations (select all)</> : <><Icon name="home" size={15} /> Inventory</>}</div>
                  {traits.configurations ? (
                    <div className="field">
                      <CatalogOptions
                        category="unit_type"
                        options={configFieldOptions}
                        loaded={true}
                        error={null}
                        isSelected={(label) => selectedConfigs.includes(label)}
                        onToggle={toggleConfig}
                      />
                      <div className="hint">
                        Choices come from this type&apos;s configuration field.{" "}
                        <Link className="brand-link" href="/org/settings?section=catalogs" target="_blank" rel="noreferrer">
                          Edit them in Settings →
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  {traits.configurations ? (
                    <ConfigSizePriceTable
                      configurations={selectedConfigs}
                      rows={unitTypes}
                      onChange={updateUnitType}
                      currency={currency}
                      areaField={roleField(dynamicUnitTemplate, "area")}
                      priceField={roleField(dynamicUnitTemplate, "price")}
                      extraFields={dynamicExtraFields}
                      hint="Optional, and editable later from the project's Edit page or the Units page. Filling these in means adding a unit prefills its area and price from here instead of asking for them again."
                    />
                  ) : null}
                  {/* No. of towers/blocks, Floors/structure, Area range and
                      Total land area are ordinary default project fields now
                      (see the type's Project fields, rendered below) — not
                      hardcoded inputs, so an org can rename, edit or remove
                      any of them. */}
                  <ProjectFieldRows
                    template={projectFieldsLive}
                    values={customValues}
                    onTemplateChange={(template) => setProjectFieldRows(fieldsToRows(template))}
                    onValueChange={(key, value) => setCustomValues((cur) => ({ ...cur, [key]: value }))}
                  />
                  <UnitFieldRows rows={unitFieldRows} onChange={setUnitFieldRows} roleBaseline={unitRoleBaseline} />
                  <div className="hint">Unit counts come from the Units section after publishing.</div>
                </div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="star" size={15} /> Unique selling points</div>
                  <div className="field"><label>Highlights (one per line)</label><textarea className="inp" rows={4} placeholder={"Riverfront view\n5 mins from SG Highway\nVastu-compliant layouts\n90% open space"} value={highlights} onChange={(e) => setHighlights(e.target.value)} /><div className="hint">Used across ads, WhatsApp templates and AI-calling scripts.</div></div>
                </div>
              </div>
            )}

            {/* STEP 3 — Pricing */}
            {step === 2 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 3 of 9</div><h2>Pricing &amp; payment</h2><div className="sub">How units are priced and the payment structure buyers will see.</div></div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="billing" size={15} /> Pricing</div>
                  <div className="grid g2">
                    <div className={fieldClass("priceMin")}><label>Price range — from <span className="req">*</span></label><MoneyInput currency={currency} placeholder="62,00,000" value={priceMin} onChange={setPriceMin} />{invalid("priceMin") && <div className="field-err">Enter the starting price.</div>}</div>
                    <div className="field"><label>Price range — to</label><MoneyInput currency={currency} placeholder="1,20,00,000" value={priceMax} onChange={setPriceMax} /></div>
                  </div>
                  <div className="grid g2">
                    <div className="field"><label>Price per sqft</label><MoneyInput currency={currency} placeholder="6,400" value={baseRate} onChange={setBaseRate} /></div>
                    <div className="field"><label>Booking amount</label><MoneyInput currency={currency} placeholder="1,00,000" value={bookingAmount} onChange={setBookingAmount} /></div>
                  </div>
                  <div className="hint mb-14">Prices above are in {currency} — set on Step 1.</div>
                  <div className="field"><label>What&apos;s included in the price?</label>
                    <CatalogOptions
                      category="price_includes"
                      options={catalogByCategory.price_includes}
                      loaded={catalog !== null}
                      error={catalogError}
                      isSelected={(label) => priceIncludes.includes(label)}
                      onToggle={toggleIncludes}
                    />
                  </div>
                </div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="document" size={15} /> Payment plan</div>
                  <div className="field"><label>Payment plan</label>
                    <CatalogOptions
                      category="payment_plan"
                      options={catalogByCategory.payment_plan}
                      loaded={catalog !== null}
                      error={catalogError}
                      single
                      isSelected={(label) => paymentPlan === label}
                      onToggle={(label) => setPaymentPlan((cur) => (cur === label ? "" : label))}
                    />
                  </div>
                  <div className="field"><label>Current offers / schemes</label><textarea className="inp" rows={3} placeholder={"No floor-rise charges till 30 Sep\nFree modular kitchen on 3 BHK\nAssured rental for 2 years"} value={offers} onChange={(e) => setOffers(e.target.value)} /></div>
                </div>
              </div>
            )}

            {/* STEP 4 — Location */}
            {step === 3 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 4 of 9</div><h2>Location &amp; connectivity</h2><div className="sub">Where the project is and what surrounds it — powers maps and ad targeting.</div></div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="pin" size={15} /> Address</div>
                  <div className={fieldClass("address")}><label>Full address <span className="req">*</span></label><textarea className="inp" rows={2} placeholder="Survey No. 214, SG Highway, Bopal, Ahmedabad, Gujarat 380058" value={address} onChange={(e) => setAddress(e.target.value)} />{invalid("address") && <div className="field-err">Full address is required.</div>}</div>
                  <div className="grid g3">
                    <div className={fieldClass("city")}><label>City <span className="req">*</span></label><input className="inp" placeholder="Ahmedabad" value={city} onChange={(e) => setCity(e.target.value)} />{invalid("city") && <div className="field-err">City is required.</div>}</div>
                    <div className="field"><label>Locality</label><input className="inp" placeholder="SG Highway" value={locality} onChange={(e) => setLocality(e.target.value)} /></div>
                    <div className="field"><label>Pincode</label><input className="inp" placeholder="380058" value={pincode} onChange={(e) => setPincode(e.target.value)} /></div>
                  </div>
                </div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="map" size={15} /> Connectivity &amp; landmarks</div>
                  <div className="field"><label>Nearby connectivity (select all that apply)</label>
                    <CatalogOptions
                      category="connectivity"
                      options={catalogByCategory.connectivity}
                      loaded={catalog !== null}
                      error={catalogError}
                      isSelected={(label) => nearby.includes(label)}
                      onToggle={toggleNearby}
                    />
                  </div>
                  <div className="field"><label>Key landmarks (with distance)</label><textarea className="inp" rows={3} placeholder={"SG Highway — 0.5 km\nAhmedabad Airport — 14 km\nNirma University — 6 km"} value={landmarks} onChange={(e) => setLandmarks(e.target.value)} /></div>
                </div>
              </div>
            )}

            {/* STEP 5 — Amenities */}
            {step === 4 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 5 of 9</div><h2>Amenities &amp; specifications</h2><div className="sub">Lifestyle features and build quality — shown on the project page and brochures.</div></div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="sparkles" size={15} /> Amenities (select all)</div>
                  <div className="field">
                    <CatalogOptions
                      category="amenity"
                      options={catalogByCategory.amenity}
                      loaded={catalog !== null}
                      error={catalogError}
                      isSelected={(label) => amenities.includes(label)}
                      onToggle={toggleAmenity}
                    />
                  </div>
                </div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="properties" size={15} /> Specifications</div>
                  <div className="hint" style={{ marginBottom: 12 }}>
                    Name each specification and describe it. The four below are just a starting point — rename or remove any of them, and add your own.
                  </div>
                  <SpecificationRows
                    rows={specRows}
                    onChange={setSpecRows}
                    notes={specNotes}
                    onNotesChange={setSpecNotes}
                  />
                </div>
              </div>
            )}

            {/* STEP 6 — Marketing */}
            {step === 5 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 6 of 9</div><h2>Marketing &amp; lead sources</h2><div className="sub">Where leads come from and how they&apos;ll be worked — connect ads, AI calling and WhatsApp.</div></div>
                {/* Intentionally hidden: Ad sources is pure UI with no backing data collection
                    or integration behind it — nothing happens with these toggles today. */}
                {/*
                <div className="q-sec">
                  <div className="lbl"><Icon name="flag" size={15} /> Ad sources (enable &amp; set budget)</div>
                  <div className="sw-row"><div className="tx"><b>Meta Ads (Facebook / Instagram)</b><small>Lead-form &amp; click campaigns</small></div><div className={`switch ${metaAds ? "on" : ""}`} onClick={() => setMetaAds(!metaAds)} /></div>
                  <div className="sw-row"><div className="tx"><b>Google Ads</b><small>Search &amp; Performance Max</small></div><div className={`switch ${googleAds ? "on" : ""}`} onClick={() => setGoogleAds(!googleAds)} /></div>
                  <div className="sw-row"><div className="tx"><b>LinkedIn Ads</b><small>Premium / NRI targeting</small></div><div className={`switch ${linkedinAds ? "on" : ""}`} onClick={() => setLinkedinAds(!linkedinAds)} /></div>
                  <div className="sw-row"><div className="tx"><b>Housing / 99acres / MagicBricks</b><small>Portal listings</small></div><div className={`switch ${portalAds ? "on" : ""}`} onClick={() => setPortalAds(!portalAds)} /></div>
                </div>
                */}
                {/* Intentionally hidden: ad budget / CPL / lead-goal targets have no
                    ad-platform integration behind them yet (same reasoning as Ad
                    sources above) — inputs with nothing acting on them. May return
                    once ad tracking is actually wired up. */}
                {/*
                <div className="q-sec">
                  <div className="lbl"><Icon name="target" size={15} /> Targets</div>
                  <div className="grid g3">
                    <div className="field"><label>Monthly ad budget</label><MoneyInput currency={currency} placeholder="1,50,000" value={monthlyBudget} onChange={setMonthlyBudget} /></div>
                    <div className="field"><label>Target CPL</label><MoneyInput currency={currency} placeholder="300" value={targetCpl} onChange={setTargetCpl} /></div>
                    <div className="field"><label>Monthly lead goal</label><input className="inp" type="number" placeholder="400" value={leadGoal} onChange={(e) => setLeadGoal(e.target.value)} /></div>
                  </div>
                </div>
                */}
                {/* Intentionally hidden: landing page selection here is deferred — a
                    project's landing page is set up from the project's own Overview
                    page instead, same reasoning as the Publish card just below. */}
                {/*
                <div className="q-sec">
                  <div className="lbl"><Icon name="globe" size={15} /> Landing page</div>
                  <div className="field"><label>Landing page</label>
                    <select className="inp" value={landingPage} onChange={(e) => setLandingPage(e.target.value)}>
                      <option>Create new from template…</option>
                      {orgLandingPages.map((lp) => (
                        <option key={lp.id} value={`Use existing — ${lp.name}`}>Use existing — {lp.name}</option>
                      ))}
                      <option>External URL</option>
                    </select>
                    {orgLandingPages.length === 0 ? <div className="hint">No landing pages yet — create one from Landing Pages.</div> : null}
                  </div>
                </div>
                */}

                {/* Intentionally hidden: auto-publishing a live landing page during
                      project creation is premature here — a project's landing page is
                      set up afterwards from the project's own page instead. */}
                {/*
                  <div className="card pad-14 mt-16" style={{ background: "var(--surface-2, #f8fafc)", border: "1.5px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="flag" size={13} /> Publish Live Landing Page</span>
                          <span className="badge b-green">Instant Go-Live</span>
                          {customLandingPageId && <span className="badge b-blue"><Icon name="sparkles" size={11} /> Visually Edited in Builder</span>}
                        </div>
                        <div className="muted fs-12" style={{ marginTop: 2 }}>
                          {customLandingPageId
                            ? `Visual customisations made to "${customLandingPageName || selectedTemplate?.name}" will be published live with this project.`
                            : `Automatically create and publish a dynamic landing page using "${selectedTemplate?.name || "the selected template"}".`}
                        </div>
                      </div>
                      <div className={`switch ${publishLandingPageNow ? "on" : ""}`} onClick={() => setPublishLandingPageNow(!publishLandingPageNow)} />
                    </div>

                    {publishLandingPageNow && (
                      <>
                        <div className="grid g2 mt-12">
                          <div className="field mb-0">
                            <label style={{ fontSize: 12 }}>Landing page title</label>
                            <input
                              className="inp"
                              value={landingPageTitle}
                              placeholder={`${name.trim() || "Project"} — Official Launch`}
                              onChange={(e) => setLandingPageTitle(e.target.value)}
                            />
                          </div>
                          <div className="field mb-0">
                            <label style={{ fontSize: 12 }}>Live web URL preview</label>
                            <div style={{ height: 38, background: "#fff", border: "1px solid var(--line)", borderRadius: 6, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 12, color: "var(--muted)" }}>
                              /p/{name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project-slug"}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openTemplateInVisualBuilder()}
                            disabled={customizingInBuilder}
                            style={{ display: "flex", alignItems: "center", gap: 6 }}
                          >
                            <Icon name="edit" size={13} /> {customizingInBuilder ? "Opening Builder…" : customLandingPageId ? "Re-open in Visual Builder" : "Customize Template in Visual Builder"}
                          </button>
                          {customLandingPageId && (
                            <a
                              href={`/preview/${customLandingPageId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost btn-sm"
                              style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                            >
                              <Icon name="eye" size={13} /> Preview
                            </a>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  */}
                <div className="q-sec">
                  <div className="lbl"><Icon name="puzzle" size={15} /> Automation &amp; assignment</div>
                  {/* Intentionally hidden: the backing AI voice calling feature is not implemented yet and may return later. */}
                  {/* <div className="sw-row"><div className="tx"><b>AI voice calling</b><small>Auto-call &amp; qualify new leads within 60s</small></div><div className={`switch ${aiCalling ? "on" : ""}`} onClick={() => setAiCalling(!aiCalling)} /></div> */}
                  {/* Intentionally hidden: the backing WhatsApp auto-welcome feature is not implemented yet and may return later. */}
                  {/* <div className="sw-row"><div className="tx"><b>WhatsApp auto-welcome</b><small>Send brochure + book site visit</small></div><div className={`switch ${whatsappAuto ? "on" : ""}`} onClick={() => setWhatsappAuto(!whatsappAuto)} /></div> */}
                  <div className="sw-row"><div className="tx"><b>Round-robin assignment</b><small>Distribute leads across the sales team</small></div><div className={`switch ${roundRobin ? "on" : ""}`} onClick={() => setRoundRobin(!roundRobin)} /></div>
                </div>
              </div>
            )}

            {/* STEP 7 — Team */}
            {step === 6 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 7 of 9</div><h2>Team &amp; access</h2><div className="sub">Who owns this project and which agents can work its leads.</div></div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="profile" size={15} /> Ownership</div>
                  <div>
                    <div className={fieldClass("managerId")}><label>Project manager <span className="req">*</span></label><ManagerPicker managers={managers} value={managerId} onChange={setManagerId} loaded={managersLoaded} />{invalid("managerId") && <div className="field-err">Assign a project manager.</div>}</div>
                    {/* Intentionally hidden: this is a free-text regional label ("Ahmedabad — West"), not a
                        reference to the real Team model (org-teams module) — Project.salesTeam is stored
                        and echoed back but never read anywhere in the backend. May return once it's wired
                        to real teams. */}
                    {/* <div className="field"><label>Sales team</label><select className="inp" value={salesTeam} onChange={(e) => setSalesTeam(e.target.value)}><option>Ahmedabad — West</option><option>Ahmedabad — Core</option><option>NRI Desk</option></select></div> */}
                  </div>
                  <div className="field"><label>Assigned sales agents</label>
                    {salesAgents.length === 0 ? (
                      <div className="hint">No assignable users in your organisation yet — add them under Users.</div>
                    ) : (
                      <div className="opts project-assignee-options">
                        {salesAgents.map((u) => {
                          const on = agentAssign.includes(u.id);
                          return (
                            <span
                              key={u.id}
                              className={`opt project-assignee-option ${on ? "on" : ""}`}
                              onClick={() => setAgentAssign((prev) => (on ? prev.filter((x) => x !== u.id) : [...prev, u.id]))}
                            >
                              <span className="b">{on ? <Icon name="check" size={11} /> : ""}</span>
                              <span className="project-assignee-meta">
                                <b>{u.name}</b>
                                <small className="project-assignee-role">{u.role?.name ?? "No role"}</small>
                                {alreadyAssignedLabel(u.projects) ? (
                                  <small className="project-assignee-projects">{alreadyAssignedLabel(u.projects)}</small>
                                ) : null}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                {/* Intentionally hidden: the Visibility & approvals controls are not implemented yet and may return later. */}
                {/*
                <div className="q-sec">
                  <div className="lbl"><Icon name="lock" size={15} /> Visibility &amp; approvals</div>
                  <div className="sw-row"><div className="tx"><b>Require manager approval on bookings</b><small>Bookings move to Pending until approved</small></div><div className={`switch ${requireApproval ? "on" : ""}`} onClick={() => setRequireApproval(!requireApproval)} /></div>
                  <div className="sw-row"><div className="tx"><b>Visible to telecallers</b><small>Show in the calling dashboard queue</small></div><div className={`switch ${visibleTele ? "on" : ""}`} onClick={() => setVisibleTele(!visibleTele)} /></div>
                  <div className="sw-row"><div className="tx"><b>Publish to public website</b><small>List on skylinedev.in projects page</small></div><div className={`switch ${publishWeb ? "on" : ""}`} onClick={() => setPublishWeb(!publishWeb)} /></div>
                </div>
                */}
              </div>
            )}

            {/* STEP 8 — Documents */}
            {step === 7 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 8 of 9</div><h2>Documents &amp; media</h2><div className="sub">Upload the assets that power the public page, brochures and AI knowledge base.</div></div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="camera" size={15} /> Images</div>
                  <div className="grid g2">
                    <MediaUpload field="gallery" label="Cover / elevation image" value={coverImageUrl} onChange={setCoverImageUrl} />
                    <GalleryUpload value={galleryUrls} onChange={setGalleryUrls} />
                  </div>
                  <GalleryUpload
                    value={floorPlanUrls}
                    onChange={setFloorPlanUrls}
                    label="Project floor / site plan"
                    field="floorPlan"
                  />
                  <div className="hint" style={{ marginTop: -4 }}>
                    The overall plan for the development — master site layout, tower plans, podium levels. Add as many as you need.
                  </div>
                  <div className="hint">Per-unit-type floor plans are added per configuration from the Units section after publishing.</div>
                </div>
                <div className="q-sec">
                  <div className="lbl"><Icon name="document" size={15} /> Documents</div>
                  <div className="grid g2">
                    <MediaUpload field="brochure" label="Brochure (PDF)" value={brochureUrl} onChange={setBrochureUrl} />
                    <MediaUpload field="brochure" label="RERA certificate (PDF)" value={reraCertificateUrl} onChange={setReraCertificateUrl} />
                  </div>
                  {/* Intentionally hidden: the backing AI knowledge-base feature is not implemented yet and may return later. */}
                  {/* <div className="sw-row"><div className="tx"><b>Add to AI knowledge base</b><small>Let AI calling &amp; WhatsApp answer from these documents</small></div><div className={`switch ${aiKnowledgeBase ? "on" : ""}`} onClick={() => setAiKnowledgeBase(!aiKnowledgeBase)} /></div> */}
                </div>
              </div>
            )}

            {/* STEP 9 — Review */}
            {step === 8 && (
              <div className="wz-pane on">
                <div className="q-h"><div className="st">Step 9 of 9</div><h2>Review &amp; launch</h2><div className="sub">Confirm the details below, then publish. You can edit everything later from the project page.</div></div>
                <div className="rev">
                  <div className="rev-grid">
                    <div>
                      <div className="q-sec"><div className="lbl"><Icon name="document" size={15} /> Basics</div>
                        <div className="sp"><span className="k">Project name</span><span className="v">{name || "—"}</span></div>
                        <div className="sp"><span className="k">Project type</span><span className="v">{projectType || "—"}</span></div>
                        <div className="sp"><span className="k">RERA registration no.</span><span className="v">{reraId || "—"}</span></div>
                        <div className="sp"><span className="k">Status</span><span className="v"><span className={`badge ${status === "active" ? "b-green" : "b-gray"}`}>{status === "active" ? "Active" : "Inactive"}</span></span></div>
                      </div>
                      <div className="q-sec"><div className="lbl"><Icon name="home" size={15} /> Inventory</div>
                        {traits.configurations ? (
                          <div className="sp"><span className="k">Unit configurations</span><span className="v">{formatConfigs(selectedConfigs)}</span></div>
                        ) : null}
                        {projectTemplate.map((f) => {
                          const raw = customValues[f.key] ?? "";
                          const shown = f.type === "yesno" ? (raw === "yes" ? "Yes" : raw === "no" ? "No" : "") : raw && f.unit ? `${raw} ${f.unit}` : raw;
                          return <div className="sp" key={f.key}><span className="k">{f.label}</span><span className="v">{shown || "—"}</span></div>;
                        })}
                        <div className="sp"><span className="k">Price range</span><span className="v">{priceRangeLabel(priceMin, priceMax, currency)}</span></div>
                      </div>
                      <div className="q-sec"><div className="lbl"><Icon name="pin" size={15} /> Location</div>
                        <div className="sp"><span className="k">City</span><span className="v">{city || "—"}</span></div>
                        <div className="sp"><span className="k">Locality</span><span className="v">{locality || "—"}</span></div>
                      </div>
                      <div className="q-sec"><div className="lbl"><Icon name="properties" size={15} /> Specifications</div>
                        {reviewSpecRows.length === 0 ? (
                          <div className="sp"><span className="k">Specifications</span><span className="v">—</span></div>
                        ) : (
                          reviewSpecRows.map(([label, value], i) => (
                            <div className="sp" key={`${label}-${i}`}><span className="k">{label}</span><span className="v">{value}</span></div>
                          ))
                        )}
                        <div className="sp"><span className="k">Notes</span><span className="v">{specNotes.trim() || "—"}</span></div>
                      </div>
                    </div>
                    <div>
                      <div className="q-sec"><div className="lbl"><Icon name="bell" size={15} /> Marketing</div>
                        {/* Intentionally hidden: ad-source settings are not implemented yet and may return later. */}
                        {/* <div className="sp"><span className="k">Sources</span><span className="v">{[metaAds && "Meta", googleAds && "Google", linkedinAds && "LinkedIn", portalAds && "Portals"].filter(Boolean).join(", ") || "—"}</span></div> */}
                        {/* Intentionally hidden: ad budget / CPL / lead-goal targets have no
                            ad-platform integration behind them — same reasoning as Sources above. */}
                        {/* <div className="sp"><span className="k">Monthly ad budget</span><span className="v">{monthlyBudget ? formatProjectMoney(monthlyBudget, currency) : "—"}</span></div> */}
                        {/* <div className="sp"><span className="k">Target CPL</span><span className="v">{targetCpl ? formatProjectMoney(targetCpl, currency) : "—"}</span></div> */}
                        {/* <div className="sp"><span className="k">Monthly lead goal</span><span className="v">{leadGoal || "—"}</span></div> */}
                        {/* Intentionally hidden: the backing AI voice calling feature is not implemented yet and may return later. */}
                        {/* <div className="sp"><span className="k">AI calling</span><span className="v"><span className={`badge ${aiCalling ? "b-green" : "b-gray"}`}>{aiCalling ? "On" : "Off"}</span></span></div> */}
                        {/* Intentionally hidden: the backing WhatsApp auto-welcome feature is not implemented yet and may return later. */}
                        {/* <div className="sp"><span className="k">WhatsApp welcome</span><span className="v"><span className={`badge ${whatsappAuto ? "b-green" : "b-gray"}`}>{whatsappAuto ? "On" : "Off"}</span></span></div> */}
                        <div className="sp"><span className="k">Round-robin assignment</span><span className="v"><span className={`badge ${roundRobin ? "b-green" : "b-gray"}`}>{roundRobin ? "On" : "Off"}</span></span></div>
                      </div>
                      {/* Intentionally hidden: template selection and live-landing-page
                          auto-publish are deferred from the wizard (see Step 1 and Step 6) —
                          nothing left here to summarize until that's set up from the
                          project's own page instead. */}
                      {/*
                      <div className="q-sec"><div className="lbl"><Icon name="globe" size={15} /> Project Template &amp; Website</div>
                        <div className="sp"><span className="k">Template</span><span className="v">{selectedTemplate?.name || "Standard Template"}</span></div>
                        <div className="sp">
                          <span className="k">Customization</span>
                          <span className="v">
                            {customLandingPageId ? (
                              <span className="badge b-green"><Icon name="sparkles" size={11} /> Visually Customized in Builder</span>
                            ) : (
                              <span className="badge b-gray">Default Presets</span>
                            )}
                          </span>
                        </div>
                        <div className="sp"><span className="k">Live landing page</span><span className="v"><span className={`badge ${publishLandingPageNow ? "b-green" : "b-gray"}`}>{publishLandingPageNow ? "Yes — Auto Publish" : "Disabled"}</span></span></div>
                        {publishLandingPageNow && (
                          <div className="sp"><span className="k">Target URL</span><span className="v mono">/p/{name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project-slug"}</span></div>
                        )}
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openTemplateInVisualBuilder()}
                            disabled={customizingInBuilder}
                          >
                            <Icon name="edit" size={13} /> {customLandingPageId ? "Re-open in Visual Builder" : "Customize Template in Visual Builder"}
                          </button>
                          {customLandingPageId && (
                            <a
                              href={`/preview/${customLandingPageId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost btn-sm"
                              style={{ textDecoration: "none" }}
                            >
                              <Icon name="eye" size={13} /> Preview
                            </a>
                          )}
                        </div>
                      </div>
                      */}
                      <div className="q-sec"><div className="lbl"><Icon name="profile" size={15} /> Team &amp; access</div>
                        <div className="sp"><span className="k">Project manager</span><span className="v">{selectedManager ? personLabel(selectedManager) : noManagers ? "Organisation admin (auto-assigned)" : "Unassigned"}</span></div>
                        <div className="sp"><span className="k">Assigned sales agents</span><span className="v">{agentAssign.length} assigned</span></div>
                        {/* Intentionally hidden: booking approval, telecaller visibility, and public website publishing are not implemented yet and may return later. */}
                        {/*
                        <div className="sp"><span className="k">Booking approval</span><span className="v">{requireApproval ? "Required" : "Not required"}</span></div>
                        <div className="sp"><span className="k">Visible to telecallers</span><span className="v"><span className={`badge ${visibleTele ? "b-green" : "b-gray"}`}>{visibleTele ? "On" : "Off"}</span></span></div>
                        <div className="sp"><span className="k">Publish to website</span><span className="v"><span className={`badge ${publishWeb ? "b-green" : "b-gray"}`}>{publishWeb ? "On" : "Off"}</span></span></div>
                        */}
                      </div>
                      <div className="q-sec"><div className="lbl"><Icon name="document" size={15} /> Media</div>
                        <div className="sp"><span className="k">Cover / elevation image</span><span className="v">{coverImageUrl ? <><Icon name="check" size={11} /> Uploaded</> : "—"}</span></div>
                        <div className="sp"><span className="k">Gallery images</span><span className="v">{galleryUrls.length ? `${galleryUrls.length} photo${galleryUrls.length > 1 ? "s" : ""}` : "—"}</span></div>
                        <div className="sp"><span className="k">Brochure</span><span className="v">{brochureUrl ? <><Icon name="check" size={11} /> Uploaded</> : "—"}</span></div>
                        <div className="sp"><span className="k">RERA certificate</span><span className="v">{reraCertificateUrl ? <><Icon name="check" size={11} /> Uploaded</> : "—"}</span></div>
                        <div className="sp"><span className="k">Project floor / site plan</span><span className="v">{floorPlanUrls.length ? `${floorPlanUrls.length} plan${floorPlanUrls.length > 1 ? "s" : ""}` : "—"}</span></div>
                        {/* Intentionally hidden: the backing AI knowledge-base feature is not implemented yet and may return later. */}
                        {/* <div className="sp"><span className="k">AI knowledge</span><span className="v"><span className={`badge ${aiKnowledgeBase ? "b-green" : "b-gray"}`}>{aiKnowledgeBase ? "On" : "Off"}</span></span></div> */}
                      </div>
                    </div>
                  </div>
                  {error && (
                    <div className="help err mt-16">
                      <Icon name="alert" size={13} /> {error}
                      {publishedProjectId ? (
                        <>
                          {" "}
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ marginLeft: 8 }}
                            onClick={() => router.push(`/org/projects/${publishedProjectId}`)}
                          >
                            Go to project →
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                  {allMissingFields.length > 0 ? (
                    <div className="help err mt-20">
                      <b><Icon name="alert" size={13} /> {allMissingFields.length} required field{allMissingFields.length > 1 ? "s" : ""} still empty.</b>
                      <ul>
                        {allMissingFields.map((f) => (
                          <li key={f.id}>
                            {f.label}{" "}
                            <button className="brand-link" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} onClick={() => { setJumpWarning(null); setStep(f.step); }}>
                              — go to {STEPS[f.step].label} →
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="help mt-20"><Icon name="flag" size={14} /> <b>Ready to go live.</b> Publishing creates the project and starts routing new leads immediately.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Blocked-Continue summary */}
        {showErrors && currentMissing.length > 0 && step < STEPS.length - 1 ? (
          <div className="help err mt-16" style={{ background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: 12, padding: 14 }}>
            <b><Icon name="alert" size={13} /> Fill in {currentMissing.length === 1 ? "this field" : "these fields"} to continue:</b>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              {currentMissing.map((f) => <li key={f.id}>{f.label}</li>)}
            </ul>
          </div>
        ) : null}

        {/* Sticky/Clean Footer Navigation matching Image 4 */}
        <div
          className="wz-foot"
          style={{
            position: "sticky",
            bottom: 12,
            zIndex: 25,
            background: "rgba(255, 255, 255, 0.98)",
            backdropFilter: "blur(10px)",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "14px 115px 14px 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/org/projects")}
            style={{ borderRadius: 9, padding: "8px 18px", fontSize: 13, color: "#64748b" }}
          >
            Cancel
          </button>
          <span className="save" style={{ fontSize: 12, color: "#94a3b8" }}>
            {savedAt ? `Draft saved · ${formatRelative(savedAt)}` : "Not saved yet"}
          </span>
          <div className="row gap-10" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={step === 0}
              onClick={goBack}
              style={{
                borderRadius: 9,
                padding: "8px 18px",
                fontSize: 13,
                opacity: step === 0 ? 0.45 : 1,
                cursor: step === 0 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={goNext}
                style={{
                  background: "#0066f5",
                  borderRadius: 9,
                  padding: "9px 22px",
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: "0 4px 14px rgba(0, 102, 245, 0.35)",
                }}
              >
                Next Step →
              </button>
            ) : publishedProjectId && !createdLandingPage ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => router.push(`/org/projects/${publishedProjectId}`)}
                style={{ background: "#0066f5", borderRadius: 9, padding: "9px 22px", fontSize: 13, fontWeight: 600 }}
              >
                Go to project →
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => void submit()}
                style={{ background: "#0066f5", borderRadius: 9, padding: "9px 22px", fontSize: 13, fontWeight: 600 }}
              >
                {submitting ? "Publishing…" : <><Icon name="flag" size={14} /> Publish project</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </Reveal>

      <Modal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title="Select a project template"
        description="These are the templates Super Admin assigned to your organisation. The selected design is copied onto this project's landing page."
        size="full"
      >
        <div className="grid g2" style={{ gap: 20 }}>
          {orgDbTemplates.length === 0 ? (
            <div className="muted" style={{ gridColumn: "1 / -1", padding: 24, textAlign: "center" }}>
              No templates are assigned to this organisation yet. Ask Super Admin to assign templates, or open{" "}
              <a href="/org/templates" style={{ color: "var(--brand)", fontWeight: 600 }}>Templates</a>.
            </div>
          ) : orgDbTemplates.map((tpl) => {
            const isSelected = selectedTemplate?.id === tpl.id;
            return (
              <div
                key={tpl.id}
                style={{
                  border: isSelected ? "2px solid var(--brand, #0f1424)" : "1px solid var(--line, #e2e8f0)",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: isSelected ? "rgba(21, 27, 46, 0.02)" : "#fff",
                  display: "flex",
                  flexDirection: "column",
                  transition: "all 0.2s ease",
                  boxShadow: isSelected ? "0 4px 20px rgba(21, 27, 46, 0.15)" : "none",
                }}
              >
                <div style={{ height: 160, position: "relative", overflow: "hidden", background: "#1e293b" }}>
                  {tpl.thumbnail ? (
                    <img
                      src={tpl.thumbnail}
                      alt={tpl.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                      <Icon name="building" size={26} />
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%)",
                    }}
                  />
                  <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6 }}>
                    {tpl.category ? (
                      <span className="badge b-teal" style={{ background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)" }}>
                        {tpl.category}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ position: "absolute", bottom: 12, left: 12, right: 12 }}>
                    <b style={{ color: "#fff", fontSize: 16, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{tpl.name}</b>
                  </div>
                </div>

                <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1 }}>
                  <p className="muted fs-12-5" style={{ margin: "0 0 12px", lineHeight: 1.5, flex: 1 }}>
                    Super Admin template · {tpl.template || "landing"}
                  </p>

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div className="row gap-8">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          applyTemplate(tpl);
                          void openTemplateInVisualBuilder(tpl);
                        }}
                        disabled={customizingInBuilder}
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Icon name="edit" size={13} /> Customize in Builder
                      </button>
                      <button
                        type="button"
                        className={`btn ${isSelected ? "btn-secondary" : "btn-primary"} btn-sm`}
                        onClick={() => applyTemplate(tpl)}
                      >
                        {isSelected ? <><Icon name="check" size={11} /> Active Template</> : "Use this template →"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={!!createdLandingPage}
        onClose={() => {
          if (publishedProjectId) router.push(`/org/projects/${publishedProjectId}`);
        }}
        title="Project published"
        description={
          <>
            <b>{name}</b> is now live. Its dedicated landing page has been generated using <b>{selectedTemplate?.name || "the selected template"}</b> and is immediately accessible.
          </>
        }
        size="md"
      >
        {createdLandingPage ? (
          <>
            <div
              className="card pad-16"
              style={{
                background: "var(--surface-2, #f8fafc)",
                border: "1px solid var(--line, #e2e8f0)",
                borderRadius: 12,
                textAlign: "left",
                marginBottom: 24,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: ".05em" }}>
                  Public Landing Page
                </span>
                <span className="badge b-green">● Published</span>
              </div>
              <a
                href={`/p/${createdLandingPage.slug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "var(--brand, #0f1424)",
                  fontWeight: 600,
                  fontSize: 14,
                  wordBreak: "break-all",
                  display: "inline-block",
                }}
              >
                {typeof window !== "undefined" ? window.location.origin : ""}/p/{createdLandingPage.slug} ↗
              </a>
              <div className="muted fs-11" style={{ marginTop: 6 }}>
                <Icon name="info" size={13} /> You can edit, add, or remove any sections anytime without affecting the original master template.
              </div>
            </div>

            <div className="col gap-10">
              <a
                href={`/p/${createdLandingPage.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-block"
                style={{ textDecoration: "none" }}
              >
                <Icon name="globe" size={14} /> View Live Landing Page
              </a>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => router.push(`/org-builder?id=${createdLandingPage.id}`)}
              >
                <Icon name="edit" size={14} /> Customize in Visual Builder
              </button>
              {publishedProjectId && (
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => router.push(`/org/projects/${publishedProjectId}`)}
                >
                  <Icon name="building" size={14} /> Go to Project Dashboard →
                </button>
              )}
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
