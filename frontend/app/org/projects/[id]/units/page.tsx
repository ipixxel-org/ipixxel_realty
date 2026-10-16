"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PROJECT_UNIT_ACTIONS } from "@/lib/permissions";
import { apiFetch, getOrgCatalogOptions } from "@/lib/api";
import { parseAmount, parseCount, parseDecimal, parseInteger } from "@/lib/parse";
import { currencyPrefix, formatMoney } from "@/lib/money";
import { prefillFromUnitType } from "@/lib/unit-prefill";
import { plannedMixRemoval } from "@/lib/unit-types";
import {
  customValueText,
  defaultableExtraFields,
  draftToPayload,
  nonRoleFields,
  roleField,
  templateTraits,
  valuesToDraft,
  type CustomValueDraft,
  type FieldDef,
} from "@/lib/field-template";
import { SectionedFieldInputs } from "@/components/org/project-type-fields";
import { Reveal } from "@/components/superadmin/reveal";
import { Seg } from "@/components/superadmin/seg";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { UnitDesignPage } from "@/components/org/unit-modal";
import { ListPager, usePagedRows } from "@/components/ui/list-pager";
import {
  Field,
  FormActions,
  FormAlert,
  FormGrid,
  FormPage,
  PhoneInput,
  SelectInput,
  TextInput,
  formPageStyles,
} from "@/components/forms/form-page";
import { Icon } from "@/components/icons";
import { RowActionsMenu } from "@/components/superadmin/row-actions-menu";
import { ProjectPageHead } from "@/components/org/project-tabs";
import { useProjectViewOnly } from "@/components/billing/locked";
import { PLAN_LOCK_COPY } from "@/lib/plan-lock";
import {
  ConfigurationSelect,
  TowerCombobox,
  UnitMediaFields,
  formatUpdatedAt,
  areaPricePerAreaLabel,
  PrefillNote,
  UnitAttributeSelect,
} from "@/components/org/project-form-fields";
import "@/app/org/org.css";
import type {
  CreateUnitInput,
  UpdateUnitInput,
  CreateUnitTypeInput,
  OrgCatalogOption,
  ProjectDetail,
  Unit,
  UnitStatus,
  UnitType,
} from "@/lib/types";

const STATUS_BADGE: Record<UnitStatus, string> = {
  available: "b-green",
  booked: "b-rose",
  held: "b-amber",
  sold: "b-gray",
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  booked: "Booked",
  held: "Held",
  sold: "Sold",
};

// Class suffix for the availability-grid pills (see .u-cell.avl/.bkd/.hld/.sld).
const STATUS_CELL: Record<UnitStatus, string> = {
  available: "avl",
  booked: "bkd",
  held: "hld",
  sold: "sld",
};

const STATUS_OPTIONS: UnitStatus[] = ["available", "booked", "held", "sold"];

const FILTERS = ["All", "Available", "Booked", "Held", "Sold"] as const;

// Bucket key for units with no group set — grouped together as "All units".
const NO_TOWER = "__NO_TOWER__";

interface UnitTypeForm {
  name: string;
  area: string;
  price: string;
  /** Other defaultable fields (e.g. Built-up Area), keyed by template field key. */
  extra: Record<string, string>;
  totalUnits: string;
}
const EMPTY_UT_FORM: UnitTypeForm = {
  name: "",
  area: "",
  price: "",
  extra: {},
  totalUnits: "",
};

interface UnitForm {
  configuration: string;
  variantLabel: string;
  unitNo: string;
  tower: string;
  floor: string;
  /** Primary area — non-tower layouts. */
  area: string;
  /** Typed values for the project's unit field template. */
  customValues: CustomValueDraft;
  facing: string;
  parking: string;
  price: string;
  status: UnitStatus;
  floorPlanUrl: string;
  galleryUrls: string[];
}
const emptyUnitForm = (): UnitForm => ({
  configuration: "",
  variantLabel: "",
  unitNo: "",
  tower: "",
  floor: "",
  area: "",
  customValues: {},
  facing: "",
  parking: "",
  price: "",
  status: "available",
  floorPlanUrl: "",
  galleryUrls: [],
});

type PendingDelete =
  | { kind: "unitType"; id: string; label: string; extra: string }
  | { kind: "unit"; id: string; label: string; extra: string };

export default function OrgProjectUnitsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  /** `?edit=<unitId>` — the unit detail page's Edit button deep-links here. */
  const editUnitId = searchParams.get("edit");
  /**
   * `?from=unit` — the edit was launched from that unit's detail page, so
   * closing the modal (cancel or save) should land back there rather than
   * stranding the user on the list they never chose to visit. Held in a ref
   * because the query param is stripped as soon as the modal opens.
   */
  const returnToUnit = useRef<string | null>(null);
  const id = params?.id ?? "";
  const { accessToken, hasPermission } = useAuth();
  // Projects > Add unit / Edit unit / Delete unit (unit types included).
  // Billing v2: a view-only project's units can be opened, not changed.
  const viewOnly = useProjectViewOnly(id);
  const canAddUnit = hasPermission("projects", PROJECT_UNIT_ACTIONS.add) && !viewOnly;
  const canEditUnit = hasPermission("projects", PROJECT_UNIT_ACTIONS.edit) && !viewOnly;
  const canDeleteUnit = hasPermission("projects", PROJECT_UNIT_ACTIONS.delete) && !viewOnly;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState(0);

  const [utMode, setUtMode] = useState<"create" | "edit" | null>(null);
  const [utEditingId, setUtEditingId] = useState<string | null>(null);
  const [utForm, setUtForm] = useState<UnitTypeForm>(EMPTY_UT_FORM);
  const [utError, setUtError] = useState<string | null>(null);
  const [utBusy, setUtBusy] = useState(false);

  // Shared load-error for the org's facing/parking/unit-variant catalogs
  // (see the fetch effect below) — a configuration's own choices now come
  // from the project's configuration-role field, not an org-wide catalog.
  const [unitTypeCatalogError, setUnitTypeCatalogError] = useState<
    string | null
  >(null);
  const [unitAttributeCatalog, setUnitAttributeCatalog] = useState<OrgCatalogOption[]>([]);
  const [unitAttributeCatalogLoaded, setUnitAttributeCatalogLoaded] = useState(false);
  // Which fields the unit type filled in, so the "from X" note can be shown
  // and then dropped the moment the user edits that field.
  const [prefilled, setPrefilled] = useState<string[]>([]);

  const [unitMode, setUnitMode] = useState<"create" | "edit" | null>(null);
  const [unitEditingId, setUnitEditingId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnitForm());
  const [unitError, setUnitError] = useState<string | null>(null);
  const [unitBusy, setUnitBusy] = useState(false);
  const [unitAttempted, setUnitAttempted] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Per-row status-dropdown feedback (auto-save, no separate button).
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [statusSavedId, setStatusSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [proj, unitRows] = await Promise.all([
        apiFetch<ProjectDetail>(`/org/projects/${id}`, { headers }),
        apiFetch<Unit[]>(`/org/projects/${id}/units`, { headers }),
      ]);
      setProject(proj);
      setUnits(unitRows);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Arriving from a unit's detail page with `?edit=<unitId>` opens that unit's
   * edit modal directly, pre-populated — the same modal the row's Edit button
   * opens, not a second form.
   *
   * Waits for the units to load, opens once, then strips the param so a later
   * Cancel-and-refresh doesn't silently reopen it. An id that doesn't match a
   * unit on this project is simply ignored: the user still lands on the list.
   */
  useEffect(() => {
    if (!editUnitId || units.length === 0) return;
    const target = units.find((u) => u.id === editUnitId);
    if (target) {
      openUnitEdit(target);
      if (searchParams.get("from") === "unit") returnToUnit.current = target.id;
    }
    router.replace(`/org/projects/${id}/units`, { scroll: false });
    // openUnitEdit is a stable component-scope function; re-running on every
    // render would fight the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editUnitId, units, id, router]);

  /** `?new=1` — another page (All units → Add unit) sent the user here to add a unit to a non-tower project. */
  const wantsNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (!wantsNew || !project) return;
    openUnitCreate();
    router.replace(`/org/projects/${id}/units`, { scroll: false });
    // openUnitCreate is a stable component-scope function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew, project, id, router]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getOrgCatalogOptions()
      .then((rows) => {
        if (cancelled) return;
        setUnitAttributeCatalog(rows);
        setUnitAttributeCatalogLoaded(true);
        setUnitTypeCatalogError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setUnitTypeCatalogError(
            e instanceof Error ? e.message : "Couldn't load configuration options.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const facingOptions = unitAttributeCatalog.filter((option) => option.category === "facing");
  const parkingOptions = unitAttributeCatalog.filter((option) => option.category === "parking");
  const variantOptions = unitAttributeCatalog.filter((option) => option.category === "unit_variant");

  /**
   * Picking a configuration copies the project's matching unit type's carpet /
   * built-up / price into the form. A snapshot, not a binding: every value
   * stays editable, and editing the unit type later never touches this unit.
   */
  function applyConfiguration(configuration: string) {
    const { values, filled } = prefillFromUnitType(
      configuration,
      project?.unitTypes,
      project?.unitFieldTemplate ?? [],
    );
    setPrefilled(filled);
    const groupField = roleField(project?.unitFieldTemplate ?? [], "group");
    const floorField = roleField(project?.unitFieldTemplate ?? [], "floor");
    setUnitForm((f) => ({
      ...f,
      configuration,
      area: areaField ? values[areaField.key] ?? f.area : f.area,
      price: priceField ? values[priceField.key] ?? f.price : f.price,
      tower: groupField ? values[groupField.key] ?? f.tower : f.tower,
      floor: floorField ? values[floorField.key] ?? f.floor : f.floor,
      customValues: Object.fromEntries(
        Object.entries(values).filter(([key]) => ![areaField?.key, priceField?.key, groupField?.key, floorField?.key, roleField(project?.unitFieldTemplate ?? [], "configuration")?.key].includes(key)),
      ),
    }));
  }

  /**
   * Why this planned-mix row can't be removed, or null. Same shared rule the
   * project edit form applies when unticking the configuration — one row,
   * reached two ways, so one behaviour and one message.
   */
  function removalFor(ut: UnitType) {
    return plannedMixRemoval(
      ut.name,
      ut.unitCount,
      unitTypes.filter((t) => t.name === ut.name),
    );
  }

  /** The note is only true until the user edits that field. */
  function clearPrefill(field: string) {
    setPrefilled((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : prev));
  }

  // A project unit may only use configurations assigned to THIS project —
  // its planned mix (UnitType rows, from the wizard / "+ Add configuration")
  // plus anything already on its units (imports, or a value since dropped
  // from the field's options). Only when the project has planned/used
  // nothing yet do we fall back to the configuration field's full option
  // list, so a brand-new project isn't stuck with an empty dropdown.
  const plannedOrUsedConfigurations = project
    ? [...new Set([
        ...project.unitTypes.map((unitType) => unitType.name),
        ...project.configurations.map((configuration) => configuration.label),
        ...units.map((unit) => unit.configuration).filter((value): value is string => !!value),
      ])]
    : [];
  const projectConfigurationOptions: OrgCatalogOption[] = project
    ? (plannedOrUsedConfigurations.length > 0
        ? plannedOrUsedConfigurations
        : roleField(project.unitFieldTemplate ?? [], "configuration")?.options ?? []
      ).map((label, index) => ({
        id: `${project.id}-configuration-${index}`,
        orgId: project.orgId,
        category: "unit_type",
        label,
        sortOrder: index,
        createdAt: "",
        updatedAt: "",
      }))
    : [];
  // The type's full configuration option list — used by "+ Add
  // configuration" (planning a new one), unlike the Add Unit form above
  // which is scoped to what's already planned/used.
  const configFieldOptions: OrgCatalogOption[] = project
    ? (roleField(project.unitFieldTemplate ?? [], "configuration")?.options ?? []).map((label, index) => ({
        id: `${project.id}-configfield-${index}`,
        orgId: project.orgId,
        category: "unit_type",
        label,
        sortOrder: index,
        createdAt: "",
        updatedAt: "",
      }))
    : [];

  // --- unit type handlers ---
  function openUtCreate() {
    if (!canAddUnit) return;
    setUtMode("create");
    setUtEditingId(null);
    setUtForm(EMPTY_UT_FORM);
    setUtError(null);
  }
  function openUtEdit(ut: UnitType) {
    if (!canEditUnit) return;
    setUtMode("edit");
    setUtEditingId(ut.id);
    setUtForm({
      name: ut.name,
      area: unitTypeDefault(ut, areaField)?.toString() ?? "",
      price: unitTypeDefault(ut, priceField)?.toString() ?? "",
      extra: Object.fromEntries(
        extraFields.map((f) => [f.key, unitTypeDefault(ut, f)?.toString() ?? ""]),
      ),
      totalUnits: String(ut.totalUnits),
    });
    setUtError(null);
  }
  async function submitUt() {
    if (!accessToken) return;
    if (!utForm.name.trim()) {
      setUtError("Pick a configuration from the list.");
      return;
    }
    setUtBusy(true);
    setUtError(null);
    try {
      const body: CreateUnitTypeInput = {
        name: utForm.name.trim(),
        fieldDefaults: {
          ...(areaField ? { [areaField.key]: parseDecimal(utForm.area) } : {}),
          ...(priceField ? { [priceField.key]: parseAmount(utForm.price) } : {}),
          ...Object.fromEntries(
            extraFields.map((f) => [f.key, parseDecimal(utForm.extra[f.key] ?? "")]),
          ),
        },
        totalUnits: parseCount(utForm.totalUnits),
      };
      if (utMode === "create") {
        await apiFetch(`/org/projects/${id}/unit-types`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(body),
        });
      } else if (utEditingId) {
        await apiFetch(`/org/projects/${id}/unit-types/${utEditingId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(body),
        });
      }
      setUtMode(null);
      await load();
    } catch (err) {
      setUtError(
        err instanceof Error ? err.message : "Failed to save configuration.",
      );
    } finally {
      setUtBusy(false);
    }
  }

  // --- unit handlers ---
  /**
   * Close the unit modal, returning to the detail page when that's where the
   * edit was launched from. Launching from the list leaves you on the list.
   */
  function closeUnitModal() {
    const back = returnToUnit.current;
    returnToUnit.current = null;
    setUnitMode(null);
    if (back) router.push(`/org/projects/${id}/units/${back}`);
  }

  function openUnitCreate() {
    if (!canAddUnit) return;
    setUnitMode("create");
    setUnitEditingId(null);
    setUnitForm(emptyUnitForm());
    setUnitError(null);
    setUnitAttempted(false);
  }
  function openUnitEdit(unit: Unit) {
    if (!canEditUnit) return;
    setUnitMode("edit");
    setUnitEditingId(unit.id);
    setUnitForm({
      configuration: unit.configuration ?? "",
      variantLabel: unit.variantLabel ?? "",
      unitNo: unit.unitNo,
      tower: unit.tower ?? "",
      floor: unit.floor == null ? "" : String(unit.floor),
      area: unit.area == null ? "" : String(unit.area),
      customValues: valuesToDraft(null, unit.customFields),
      facing: unit.facing ?? "",
      parking: unit.parking ?? "",
      price: unit.price == null ? "" : String(unit.price),
      status: unit.status,
      floorPlanUrl: unit.floorPlanUrl ?? "",
      galleryUrls: unit.galleryUrls ?? [],
    });
    setUnitError(null);
    setUnitAttempted(false);
  }
  async function submitUnit() {
    if (!accessToken) return;
    setUnitAttempted(true);
    if (traits.configurations && !unitForm.configuration) {
      setUnitError("Pick a configuration for this unit.");
      return;
    }
    if (!unitForm.unitNo.trim()) {
      setUnitError("Unit number is required.");
      return;
    }
    // A required template field must be filled on a new unit; on an existing
    // one only if it already held a value (the server enforces the same —
    // fields added to the template later never block old units).
    const stored = unitMode === "edit" ? units.find((u) => u.id === unitEditingId)?.customFields ?? {} : null;
    const unfilled = nonRoleFields(unitTemplate).filter(
      (f) =>
        f.required &&
        !(unitForm.customValues[f.key] ?? "").trim() &&
        (stored === null || (stored[f.key] !== undefined && stored[f.key] !== null && stored[f.key] !== "")),
    );
    if (unfilled.length > 0) {
      setUnitError(`Fill in: ${unfilled.map((f) => f.label).join(", ")}.`);
      return;
    }
    setUnitBusy(true);
    setUnitError(null);
    try {
      if (unitMode === "create") {
        // Only the fields this layout has are sent; the server refuses the rest.
        const body: CreateUnitInput = {
          configuration: traits.configurations ? unitForm.configuration : undefined,
          variantLabel: unitForm.variantLabel.trim() || undefined,
          unitNo: unitForm.unitNo.trim(),
          area: areaField ? parseDecimal(unitForm.area) : undefined,
          customFields: nonRoleFields(unitTemplate).length ? draftToPayload(nonRoleFields(unitTemplate), unitForm.customValues) : undefined,
          tower: traits.grouped ? unitForm.tower.trim() || undefined : undefined,
          floor: traits.floors ? parseInteger(unitForm.floor) : undefined,
          facing: unitForm.facing.trim() || undefined,
          parking: unitForm.parking.trim() || undefined,
          price: priceField ? parseAmount(unitForm.price) : undefined,
          status: unitForm.status,
          floorPlanUrl: unitForm.floorPlanUrl || undefined,
          galleryUrls: unitForm.galleryUrls.length
            ? unitForm.galleryUrls
            : undefined,
        };
        await apiFetch(`/org/projects/${id}/units`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(body),
        });
      } else if (unitEditingId) {
        // PATCH: nullable fields sent explicitly so they can be cleared.
        const body: UpdateUnitInput = {
          ...(traits.configurations ? { configuration: unitForm.configuration } : {}),
          variantLabel: unitForm.variantLabel.trim() || null,
          unitNo: unitForm.unitNo.trim(),
          ...(areaField ? { area: parseDecimal(unitForm.area) ?? null } : {}),
          ...(nonRoleFields(unitTemplate).length ? { customFields: draftToPayload(nonRoleFields(unitTemplate), unitForm.customValues) } : {}),
          ...(traits.grouped ? { tower: unitForm.tower.trim() || null } : {}),
          ...(traits.floors ? { floor: parseInteger(unitForm.floor) ?? null } : {}),
          facing: unitForm.facing.trim() || null,
          parking: unitForm.parking.trim() || null,
          ...(priceField ? { price: parseAmount(unitForm.price) ?? null } : {}),
          status: unitForm.status,
          floorPlanUrl: unitForm.floorPlanUrl || null,
          galleryUrls: unitForm.galleryUrls,
        };
        await apiFetch(`/org/projects/${id}/units/${unitEditingId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(body),
        });
      }
      // Refresh the list before navigating, so returning to the detail page
      // (or staying here) shows the values just saved.
      await load();
      closeUnitModal();
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : "Failed to save unit.");
    } finally {
      setUnitBusy(false);
    }
  }

  // Direct status pick — auto-saves on change, no separate Save button.
  async function changeStatus(unit: Unit, next: UnitStatus) {
    if (!accessToken || next === unit.status) return;
    setStatusSavingId(unit.id);
    setStatusSavedId(null);
    setError(null);
    setUnits((prev) =>
      prev.map((u) => (u.id === unit.id ? { ...u, status: next } : u)),
    );
    try {
      await apiFetch(`/org/projects/${id}/units/${unit.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: next }),
      });
      await load();
      setStatusSavedId(unit.id);
      setTimeout(
        () => setStatusSavedId((cur) => (cur === unit.id ? null : cur)),
        2000,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status.");
      await load();
    } finally {
      setStatusSavingId(null);
    }
  }

  async function runDelete() {
    if (!accessToken || !pendingDelete) return;
    setDeleteBusy(true);
    setError(null);
    const path =
      pendingDelete.kind === "unitType"
        ? `/org/projects/${id}/unit-types/${pendingDelete.id}`
        : `/org/projects/${id}/units/${pendingDelete.id}`;
    try {
      await apiFetch(path, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const tableFilter = FILTERS[filterIndex];
  const pagedUnits = usePagedRows(
    tableFilter === "All" ? units : units.filter((u) => u.status === tableFilter.toLowerCase()),
    String(filterIndex),
  );

  if (notFound) {
    return (
      <>
        <ProjectPageHead active="units" />
        <div className="card">
          <div className="card-b">
            <p className="muted">Project not found.</p>
            <Link href="/org/projects" className="btn btn-ghost btn-sm">
              ← Back to projects
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (loading && !project) {
    return (
      <>
        <ProjectPageHead active="units" />
        <div className="card">
          <div className="card-b">
            <p className="muted">Loading…</p>
          </div>
        </div>
      </>
    );
  }

  const unitTypes = project?.unitTypes ?? [];
  // Which controls exist is derived from the project's own unit template —
  // no fixed layout. Until the project loads, nothing is grouped/floored/
  // configured/priced.
  const unitTemplate: FieldDef[] = project?.unitFieldTemplate ?? [];
  const traits = templateTraits(unitTemplate);
  const groupWord = roleField(unitTemplate, "group")?.label ?? "Group";
  const areaField = roleField(unitTemplate, "area");
  const priceField = roleField(unitTemplate, "price");
  // Other defaultable fields (e.g. Built-up Area) — one extra column in the
  // per-configuration defaults table and summary cards, driven by the
  // template rather than hardcoded.
  const extraFields = defaultableExtraFields(unitTemplate);
  const unitTypeDefault = (ut: UnitType | undefined, field: FieldDef | null) => {
    if (!ut || !field) return null;
    const value = ut.fieldDefaults?.[field.key];
    return value === null || value === undefined || value === "" ? null : Number(value);
  };

  // Only meaningful when the template has a configuration-role field: if so,
  // a unit can't be added until there's at least one configuration to pick
  // (the field's own choices, or one already planned/in use).
  const catalogEmpty = traits.configurations && projectConfigurationOptions.length === 0;

  // One card per configuration = the union of the planned mix (UnitType rows,
  // from the wizard / "Add unit type") and the configurations actually
  // present on units (from the server's live unit.groupBy). A wizard-made
  // project has no planned mix, so without the union its real units would
  // show no per-config cards at all.
  const plannedByName = new Map(unitTypes.map((ut) => [ut.name, ut]));
  const actualByLabel = new Map(
    (project?.configurations ?? []).map((c) => [c.label, c]),
  );
  const configCards = [
    ...new Set([...plannedByName.keys(), ...actualByLabel.keys()]),
  ].sort((a, b) => a.localeCompare(b));

  const filter = FILTERS[filterIndex];
  const visibleUnits =
    filter === "All"
      ? units
      : units.filter((u) => u.status === filter.toLowerCase());

  // Distinct tower names in use by units OTHER than the one being edited —
  // feeds the tower combobox's suggestions (free text, no cap).
  const otherTowers = (() => {
    const set = new Set<string>();
    for (const u of units) {
      if (u.id === unitEditingId) continue;
      if (u.tower && u.tower.trim()) set.add(u.tower.trim());
    }
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  })();

  // Live ₹/sqft for the modal, on the org's chosen basis — never stored,
  // blank when the price or that area is missing. Always labelled with the
  // basis (the helper has no unlabelled form).
  const modalPricePerArea = areaPricePerAreaLabel(
    parseAmount(unitForm.price),
    parseDecimal(unitForm.area),
    project?.areaUnit,
    project?.currency,
  );

  // Can a unit be created at all? Only when the org has ≥1 unit_type catalog
  // option (or the form already carries a legacy configuration value).
  const canPickConfiguration =
    projectConfigurationOptions.length > 0 || unitForm.configuration !== "";

  // Availability grid: units grouped by the explicit `tower` field — but
  // only while the template currently has a group-role field. A unit's own
  // `tower` value survives that field being deleted from the template (data
  // isn't wiped when a role goes away), so without this check the grid kept
  // splitting into stale per-tower sections using a generic "Group" label
  // instead of actually turning grouping off. Units with no tower (or once
  // grouping is off) fall into one "All units" bucket. Floor range per
  // tower is the min/max of `floor` across the units that actually exist.
  const towers = (() => {
    const byTower = new Map<string, Unit[]>();
    for (const u of units) {
      const key = traits.grouped && u.tower && u.tower.trim() ? u.tower.trim() : NO_TOWER;
      const bucket = byTower.get(key);
      if (bucket) bucket.push(u);
      else byTower.set(key, [u]);
    }
    return [...byTower.entries()]
      .sort(([a], [b]) => {
        if (a === NO_TOWER) return 1;
        if (b === NO_TOWER) return -1;
        return a.localeCompare(b, undefined, { numeric: true });
      })
      .map(([tower, rows]) => {
        const floors = rows
          .map((u) => u.floor)
          .filter((f): f is number => f != null);
        return {
          key: tower,
          label: tower === NO_TOWER ? "All units" : `${groupWord} ${tower}`,
          units: [...rows].sort(
            (a, b) =>
              (a.floor ?? 0) - (b.floor ?? 0) ||
              a.unitNo.localeCompare(b.unitNo, undefined, { numeric: true }),
          ),
          floorMin: floors.length ? Math.min(...floors) : null,
          floorMax: floors.length ? Math.max(...floors) : null,
        };
      });
  })();

  function floorBadge(min: number | null, max: number | null): string {
    if (!traits.floors) return "";
    if (min == null || max == null) return "";
    return min === max ? `Floor ${min}` : `Floors ${min}–${max}`;
  }

  // --- Configuration (unit type) create / edit — full-width in-page view,
  // shown in place of the list (was a modal). Same fields and submitUt().
  if (utMode !== null) {
    return (
      <FormPage
        eyebrow={project?.name ? `Projects · ${project.name} · Units` : "Projects · Units"}
        title={utMode === "create" ? "Add configuration" : "Edit configuration"}
        subtitle="Planned units, default area and price for this configuration."
        onBack={() => setUtMode(null)}
        backDisabled={utBusy}
        backLabel="Back to units"
      >
        <div className={formPageStyles.panel}>
          <FormAlert message={utError} />
          <FormGrid>
            <Field htmlFor="ut-name" label="Configuration *" icon="properties">
              {configFieldOptions.length === 0 ? (
                <div className={formPageStyles.hint} style={{ marginTop: 0 }}>
                  <span>
                    This type&apos;s configuration field has no choices yet.{" "}
                    <Link className="brand-link" href="/org/settings?section=catalogs">
                      Edit it in Settings →
                    </Link>
                  </span>
                </div>
              ) : (
                <SelectInput
                  id="ut-name"
                  value={utForm.name}
                  onChange={(e) => setUtForm((f) => ({ ...f, name: e.target.value }))}
                >
                  <option value="">Select a configuration…</option>
                  {configFieldOptions.map((o) => (
                    <option key={o.id} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                  {/* Existing row whose name predates the field's current
                      options: keep it selectable so edit doesn't silently
                      rename it. */}
                  {utForm.name && !configFieldOptions.some((o) => o.label === utForm.name) ? (
                    <option value={utForm.name}>{utForm.name} (not in the field&apos;s options)</option>
                  ) : null}
                </SelectInput>
              )}
            </Field>
            <Field htmlFor="ut-total" label="Planned units" icon="building">
              <TextInput
                id="ut-total"
                icon="building"
                type="number"
                min={0}
                value={utForm.totalUnits}
                onChange={(e) => setUtForm((f) => ({ ...f, totalUnits: e.target.value }))}
              />
            </Field>
          </FormGrid>
          <FormGrid>
            {areaField ? (
              <Field htmlFor="ut-area" label={`${areaField.label} (${project?.areaUnit ?? "sqft"})`} icon="map">
                <TextInput
                  id="ut-area"
                  icon="map"
                  type="number"
                  min={0}
                  value={utForm.area}
                  onChange={(e) => setUtForm((f) => ({ ...f, area: e.target.value }))}
                />
              </Field>
            ) : null}
            {extraFields.map((xf) => (
              <Field key={xf.key} htmlFor={`ut-extra-${xf.key}`} label={`${xf.label}${xf.unit ? ` (${xf.unit})` : ""}`} icon="map">
                <TextInput
                  id={`ut-extra-${xf.key}`}
                  icon="map"
                  type="number"
                  min={0}
                  value={utForm.extra[xf.key] ?? ""}
                  onChange={(e) =>
                    setUtForm((prev) => ({ ...prev, extra: { ...prev.extra, [xf.key]: e.target.value } }))
                  }
                />
              </Field>
            ))}
            {priceField ? (
              <Field htmlFor="ut-price" label={priceField.label} icon="billing">
                <PhoneInput
                  id="ut-price"
                  prefix={currencyPrefix(project?.currency ?? "INR").trim()}
                  type="number"
                  min={0}
                  value={utForm.price}
                  onChange={(e) => setUtForm((f) => ({ ...f, price: e.target.value }))}
                />
              </Field>
            ) : null}
          </FormGrid>
          <FormActions
            onCancel={() => setUtMode(null)}
            busy={utBusy}
            submitDisabled={utMode === "create" && configFieldOptions.length === 0}
            busyLabel="Saving…"
            submitLabel={utMode === "create" ? "Add unit type" : "Save"}
            submitIcon={utMode === "create" ? "plus" : "check"}
            onSubmit={() => void submitUt()}
          />
        </div>
      </FormPage>
    );
  }

  // --- Unit create / edit — full-width in-page view, shown in place of the
  // list (was a modal). Form driven by the project type's unit field template.
  if (unitMode !== null) {
    return (
        <UnitDesignPage
          open
          onClose={closeUnitModal}
          mode={unitMode ?? "create"}
          project={project}
          unitForm={unitForm}
          onSubmit={submitUnit}
          busy={unitBusy}
          error={unitError}
          submitLabel={traits.configurations ? "Add unit" : traits.grouped ? "Add plot" : "Add listing"}
          preview={{
            subtitle: [
              traits.configurations ? unitForm.configuration || "Select a configuration" : project?.projectType || "Unit",
              unitForm.variantLabel || null,
              traits.grouped && unitForm.tower ? `${traits.configurations ? "" : `${groupWord} `}${unitForm.tower}` : null,
              traits.floors && unitForm.floor ? `${roleField(unitTemplate, "floor")?.label ?? "Floor"} ${unitForm.floor}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
            price: priceField && parseAmount(unitForm.price) != null
              ? formatMoney(parseAmount(unitForm.price), project?.currency ?? "INR")
              : null,
            pricePerArea: modalPricePerArea || null,
            area: areaField && unitForm.area
              ? `${Number(unitForm.area).toLocaleString("en-IN")} ${project?.areaUnit ?? "sqft"}`
              : null,
          }}
        >
              {traits.grouped || traits.floors || traits.configurations ? (
              <div className="sec">
                <div className="lbl"><Icon name="map" size={15} /> Placement</div>
                <div className="grid g3">
                  {traits.configurations ? (
                  <div className="field">
                    <label>{roleField(unitTemplate, "configuration")?.label ?? "Configuration"} <span className="req">*</span></label>
                    <ConfigurationSelect
                      catalog={project ? projectConfigurationOptions : null}
                      error={project ? null : unitTypeCatalogError}
                      value={unitForm.configuration}
                      onChange={applyConfiguration}
                    />
                    {unitAttempted && !unitForm.configuration ? <div className="field-err">Pick a configuration for this unit.</div> : null}
                  </div>
                  ) : null}
                  {traits.grouped ? (
                  <div className="field">
                    <label>{groupWord}</label>
                    <TowerCombobox
                      value={unitForm.tower}
                      onChange={(v) => setUnitForm((f) => ({ ...f, tower: v }))}
                      otherTowers={otherTowers}
                      noun={groupWord}
                    />
                  </div>
                  ) : null}
                  {traits.floors ? (
                  <div className="field">
                    <label>{roleField(unitTemplate, "floor")?.label ?? "Floor"}</label>
                    <input
                      className="inp"
                      type="number"
                      placeholder="12"
                      value={unitForm.floor}
                      onChange={(e) =>
                        setUnitForm((f) => ({ ...f, floor: e.target.value }))
                      }
                    />
                  </div>
                  ) : null}
                </div>
              </div>
              ) : null}

              <div className="sec">
                <div className="lbl"><Icon name="home" size={15} /> {traits.configurations ? "Unit details" : traits.grouped ? "Plot details" : "Property details"}</div>
                <div className="grid g3">
                  <div className={`field${unitAttempted && !unitForm.unitNo.trim() ? " field-invalid" : ""}`}>
                    <label>{traits.configurations ? "Unit number" : traits.grouped ? "Plot number" : "Listing number"} <span className="req">*</span></label>
                    <input
                      className="inp"
                      placeholder="B-1204"
                      value={unitForm.unitNo}
                      onChange={(e) =>
                        setUnitForm((f) => ({ ...f, unitNo: e.target.value }))
                      }
                    />
                    {unitAttempted && !unitForm.unitNo.trim() ? <div className="field-err">Unit number is required.</div> : null}
                  </div>
                  <div className="field">
                    <label>{traits.configurations ? "Unit variant" : "Plot variant"}</label>
                    <UnitAttributeSelect
                      options={variantOptions}
                      loaded={unitAttributeCatalogLoaded}
                      error={unitTypeCatalogError}
                      value={unitForm.variantLabel}
                      onChange={(v) => setUnitForm((f) => ({ ...f, variantLabel: v }))}
                      placeholder="None"
                      emptyHint="No unit variants configured yet."
                    />
                    <div className="hint">Optional — e.g. Type A, Corner.</div>
                  </div>
                  <div className="field">
                    <label>Facing</label>
                    <UnitAttributeSelect
                      options={facingOptions}
                      loaded={unitAttributeCatalogLoaded}
                      error={unitTypeCatalogError}
                      value={unitForm.facing}
                      onChange={(v) => setUnitForm((f) => ({ ...f, facing: v }))}
                      placeholder="Select…"
                      emptyHint="No facing options configured yet."
                    />
                  </div>
                </div>
                <div className="grid g3">
                  {areaField ? (
                  <div className="field">
                    <label>{areaField.label} ({project?.areaUnit ?? "sqft"})</label>
                    <input
                      className="inp"
                      type="number"
                      min={0}
                      placeholder="2400"
                      value={unitForm.area}
                      onChange={(e) => {
                        clearPrefill(areaField.key);
                        setUnitForm((f) => ({ ...f, area: e.target.value }));
                      }}
                    />
                    {prefilled.includes(areaField.key) ? <PrefillNote configuration={unitForm.configuration} /> : null}
                  </div>
                  ) : null}
                  <div className="field">
                    <label>Parking</label>
                    <UnitAttributeSelect
                      options={parkingOptions}
                      loaded={unitAttributeCatalogLoaded}
                      error={unitTypeCatalogError}
                      value={unitForm.parking}
                      onChange={(v) => setUnitForm((f) => ({ ...f, parking: v }))}
                      emptyHint="No parking options configured yet."
                    />
                  </div>
                </div>
              </div>

              {unitTemplate.length > 0 ? (
                <div className="sec">
                  <div className="lbl"><Icon name="properties" size={15} /> {project?.projectType ?? "Type"} details</div>
                  <SectionedFieldInputs
                    template={unitTemplate}
                    values={unitForm.customValues}
                    onChange={(key, v) => setUnitForm((f) => ({ ...f, customValues: { ...f.customValues, [key]: v } }))}
                  />
                </div>
              ) : null}

              <div className="sec">
                <div className="lbl"><Icon name="billing" size={15} /> Pricing &amp; status</div>
                <div className="grid g3">
                  {priceField ? (
                  <div className="field">
                    <label>{priceField.label} ({currencyPrefix(project?.currency ?? "INR").trim()})</label>
                    <input
                      className="inp"
                      type="number"
                      min={0}
                      placeholder="16500000"
                      value={unitForm.price}
                      onChange={(e) => {
                        clearPrefill(priceField.key);
                        setUnitForm((f) => ({ ...f, price: e.target.value }));
                      }}
                    />
                    {prefilled.includes(priceField.key) ? <PrefillNote configuration={unitForm.configuration} /> : null}
                  </div>
                  ) : null}
                  {priceField && areaField ? (
                  <div className="field">
                    <label>{priceField.label} / {project?.areaUnit ?? "sqft"}</label>
                    <input className="inp" placeholder="Enter price and area" disabled value={modalPricePerArea} />
                    {!modalPricePerArea ? <div className="hint">Calculated from price ÷ area.</div> : null}
                  </div>
                  ) : null}
                  <div className="field">
                    <label>Status</label>
                    <select
                      className="inp"
                      value={unitForm.status}
                      onChange={(e) =>
                        setUnitForm((f) => ({
                          ...f,
                          status: e.target.value as UnitStatus,
                        }))
                      }
                    >
                      <option value="available">Available</option>
                      <option value="booked">Booked</option>
                      <option value="held">Held / Blocked</option>
                      <option value="sold">Sold</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="sec nb">
                <div className="lbl"><Icon name="document" size={15} /> {traits.configurations ? "Media & documents" : "Media"}</div>
                <UnitMediaFields
                  floorPlanUrl={unitForm.floorPlanUrl}
                  galleryUrls={unitForm.galleryUrls}
                  onFloorPlanChange={(v) =>
                    setUnitForm((f) => ({ ...f, floorPlanUrl: v }))
                  }
                  onGalleryChange={(urls) =>
                    setUnitForm((f) => ({ ...f, galleryUrls: urls }))
                  }
                  ctx={{ projectId: id }}
                  showFloorPlan={traits.configurations}
                />
              </div>
        </UnitDesignPage>
    );
  }

  return (
    <>
      <ProjectPageHead
        active="units"
        project={
          project
            ? {
                name: project.name,
                status: project.status,
                location: project.location,
                reraId: project.reraId,
                manager: project.manager?.name ?? null,
              }
            : undefined
        }
        actions={
          <>
            {traits.configurations && canAddUnit ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={openUtCreate}
              >
                ＋ Add configuration
              </button>
            ) : null}
            {canAddUnit ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={openUnitCreate}
              disabled={catalogEmpty}
              title={
                catalogEmpty
                  ? "Add choices to this type's configuration field, or a planned configuration, first"
                  : undefined
              }
            >
              ＋ Add unit
            </button>
            ) : null}
          </>
        }
      />

      {error ? (
        <Reveal delay={1}>
          <div className="form-alert mb-14">
            {error}
          </div>
        </Reveal>
      ) : null}

      {traits.configurations ? (
      <Reveal delay={1}>
        <div className="grid g2">
          {configCards.length === 0 ? (
            <div className="card">
              <div className="card-b">
                <p className="muted">
                  No configurations yet — add a unit, or a planned unit mix
                  with “＋ Add configuration”.
                </p>
              </div>
            </div>
          ) : (
            configCards.map((label) => {
              const ut = plannedByName.get(label);
              const act = actualByLabel.get(label);
              const available = act?.available ?? 0;
              const total = act?.total ?? 0;
              return (
                <div className="card" key={label}>
                  <div className="pad-18">
                    <div className="row between">
                      <b className="fs-16">{label}</b>
                      <span
                        className={`badge ${available > 0 ? "b-green" : "b-amber"}`}
                      >
                        {available} available
                      </span>
                    </div>
                    <div className="uspec">
                      <div>
                        <div className="k">{areaField?.label ?? "Area"}</div>
                        <div className="v">
                          {unitTypeDefault(ut, areaField) != null
                            ? `${unitTypeDefault(ut, areaField)} ${project?.areaUnit ?? "sqft"}`
                            : "—"}
                        </div>
                      </div>
                      {extraFields.map((f) => (
                        <div key={f.key}>
                          <div className="k">{f.label}</div>
                          <div className="v">
                            {unitTypeDefault(ut, f) != null ? `${unitTypeDefault(ut, f)} ${f.unit ?? project?.areaUnit ?? "sqft"}` : "—"}
                          </div>
                        </div>
                      ))}
                      <div>
                        <div className="k">Planned units</div>
                        <div className="v">{ut?.totalUnits ?? 0}</div>
                      </div>
                      <div>
                        <div className="k">Price</div>
                        <div className="v">
                          {unitTypeDefault(ut, priceField) != null ? formatMoney(unitTypeDefault(ut, priceField)!, project?.currency ?? "INR") : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="k">{currencyPrefix(project?.currency ?? "INR").trim()} / {project?.areaUnit ?? "sqft"}</div>
                        <div className="v">
                          {areaPricePerAreaLabel(unitTypeDefault(ut, priceField), unitTypeDefault(ut, areaField), project?.areaUnit, project?.currency) || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="badge-row">
                      <span className="badge">Total {total}</span>
                      <span className="badge b-green">{available} Available</span>
                      <span className="badge b-rose">
                        {act?.booked ?? 0} Booked
                      </span>
                      <span className="badge b-amber">{act?.held ?? 0} Held</span>
                      <span className="badge b-gray">{act?.sold ?? 0} Sold</span>
                      {ut && ut.totalUnits > 0 ? (
                        <span className="badge b-gray">
                          Planned: {ut.totalUnits}
                        </span>
                      ) : null}
                    </div>
                    <div className="row gap-8 mt-10 between">
                      {ut ? (
                        <>
                          <span className="muted fs-12">
                            {removalFor(ut).kind === "blocked"
                              ? `In use by ${ut.unitCount} unit${ut.unitCount === 1 ? "" : "s"}.`
                              : " "}
                          </span>
                          <RowActionsMenu
                            actions={[
                              {
                                key: "edit",
                                label: "Edit ",
                                onClick: () => openUtEdit(ut),
                              },
                              {
                                key: "remove",
                                label: "Remove",
                                danger: true,
                                // Only actual units block removal — recorded
                                // sizes and pricing just get confirmed. Same
                                // rule as unticking it on the project edit form.
                                disabled: removalFor(ut).kind === "blocked",
                                onClick: () => {
                                  const outcome = removalFor(ut);
                                  if (outcome.kind === "blocked") {
                                    setError(outcome.reason);
                                    return;
                                  }
                                  setError(null);
                                  setPendingDelete({
                                    kind: "unitType",
                                    id: ut.id,
                                    label: ut.name,
                                    // Names what's about to be discarded when
                                    // the row carries values; empty otherwise.
                                    extra: outcome.kind === "confirm" ? outcome.message : "",
                                  });
                                },
                              },
                            ].filter((a) =>
                              a.key === "edit" ? canEditUnit : a.key === "remove" ? canDeleteUnit : true,
                            )}
                          />
                        </>
                      ) : (
                        <span className="muted fs-12">
                          Derived from units — not in the planned mix.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Reveal>
      ) : null}

      {units.length > 0 ? (
        <Reveal delay={2}>
          <div className="col gap-18 mt-18">
            {towers.map((t) => (
              <div className="card" key={t.key}>
                <div className="card-h">
                  <span className="t">Availability — {t.label}</span>
                  {floorBadge(t.floorMin, t.floorMax) ? (
                    <span className="badge b-green">
                      {floorBadge(t.floorMin, t.floorMax)}
                    </span>
                  ) : null}
                </div>
                <div className="card-b">
                  <div className="avail">
                    {t.units.map((u) => (
                      <div
                        key={u.id}
                        className={`u-cell ${STATUS_CELL[u.status]}`}
                        title={`${u.unitNo} · ${STATUS_LABEL[u.status]}${
                          traits.floors && u.floor != null ? ` · Floor ${u.floor}` : ""
                        }`}
                      >
                        {u.unitNo}
                      </div>
                    ))}
                  </div>
                  <div className="legend">
                    <span>
                      <i className="dot-av" /> Available
                    </span>
                    <span>
                      <i className="dot-bk" /> Booked
                    </span>
                    <span>
                      <i className="dot-hl" /> Held
                    </span>
                    <span>
                      <i className="dot-sl" /> Sold
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={2}>
        <div className="my-18">
          <Seg
            options={[...FILTERS]}
            value={filterIndex}
            onChange={setFilterIndex}
          />
        </div>
      </Reveal>

      <Reveal delay={2}>
        <div className="card">
          <div className="card-h">
            <span className="t">All units</span>
            <span className="x muted">
              {visibleUnits.length} of {units.length}
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit No</th>
                  {traits.grouped ? <th>{groupWord}</th> : null}
                  {traits.configurations ? <th>{roleField(unitTemplate, "configuration")?.label ?? "Config"}</th> : null}
                  {areaField ? <th>{areaField.label} ({project?.areaUnit ?? "sqft"})</th> : null}
                  {traits.floors ? <th>{roleField(unitTemplate, "floor")?.label ?? "Floor"}</th> : null}
                  {nonRoleFields(unitTemplate).map((f) => <th key={f.key}>{f.label}</th>)}
                  <th>Facing</th>
                  <th>Parking</th>
                  <th>Price {currencyPrefix(project?.currency ?? "INR").trim()}</th>
                  <th>Created by</th>
                  <th>Updated by</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUnits.length === 0 ? (
                  <tr>
                    <td colSpan={11 - (traits.grouped ? 0 : 1) - (traits.configurations ? 0 : 1) - (areaField ? 0 : 1) - (traits.floors ? 0 : 1) + nonRoleFields(unitTemplate).length} className="muted">
                      {units.length === 0
                        ? "No units yet — add one with “＋ Add unit”."
                        : "No units match this filter."}
                    </td>
                  </tr>
                ) : (
                  pagedUnits.pageRows.map((row) => (
                    <tr key={row.id}>
                      <td className="">{row.unitNo}</td>
                      {traits.grouped ? <td>{row.tower ?? "—"}</td> : null}
                      {traits.configurations ? <td>{row.configuration ?? "—"}</td> : null}
                      {areaField ? <td>{row.area != null ? `${row.area.toLocaleString("en-IN")} ${project?.areaUnit ?? "sqft"}` : "—"}</td> : null}
                      {traits.floors ? <td>{row.floor ?? "—"}</td> : null}
                      {nonRoleFields(unitTemplate).map((f) => (
                        <td key={f.key}>{customValueText(f, row.customFields?.[f.key])}</td>
                      ))}
                      <td>{row.facing ?? "—"}</td>
                      <td>{row.parking ?? "—"}</td>
                      <td>
                        {row.price != null
                          ? formatMoney(row.price, project?.currency ?? "INR")
                          : "—"}
                        {row.pricePerArea != null ? (
                          <div className="hint" style={{ marginTop: 2 }}>
                            {formatMoney(row.pricePerArea, project?.currency ?? "INR", 2)} / {project?.areaUnit ?? "sqft"}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {row.createdBy ? (
                          <>
                            <div>{row.createdBy.name}</div>
                            <div className="hint">{formatUpdatedAt(row.createdAt)}</div>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {row.updatedBy ? (
                          <>
                            <div>{row.updatedBy.name}</div>
                            <div className="hint">{formatUpdatedAt(row.updatedAt)}</div>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="row gap-6">
                          <select
                            className={`badge ${STATUS_BADGE[row.status]} nb`}
                            value={row.status}
                            disabled={statusSavingId === row.id || viewOnly}
                            title={viewOnly ? PLAN_LOCK_COPY.project_view_only.tooltip : undefined}
                            onChange={(e) =>
                              void changeStatus(
                                row,
                                e.target.value as UnitStatus,
                              )
                            }
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          {statusSavingId === row.id ? (
                            <span className="muted fs-11">
                              …
                            </span>
                          ) : statusSavedId === row.id ? (
                            <span className="text-green fs-12">
                              <Icon name="check" size={12} />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <RowActionsMenu
                          actions={[
                            {
                              key: "open",
                              label: "Open",
                              onClick: () =>
                                router.push(`/org/projects/${id}/units/${row.id}`),
                            },
                            {
                              key: "edit",
                              label: "Edit",
                              onClick: () => openUnitEdit(row),
                            },
                            {
                              key: "delete",
                              label: "Delete",
                              danger: true,
                              onClick: () =>
                                setPendingDelete({
                                  kind: "unit",
                                  id: row.id,
                                  label: `unit ${row.unitNo}`,
                                  extra: "",
                                }),
                            },
                          ].filter((a) =>
                            a.key === "edit" ? canEditUnit : a.key === "delete" ? canDeleteUnit : true,
                          )}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ListPager page={pagedUnits.page} total={pagedUnits.total} onPageChange={pagedUnits.setPage} noun="units" />
        </div>
      </Reveal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={
          pendingDelete?.kind === "unitType"
            ? "Delete unit type?"
            : "Delete unit?"
        }
        message={
          pendingDelete ? (
            <>
              <strong>{pendingDelete.label}</strong> will be permanently
              deleted.
              {pendingDelete.extra ? ` ${pendingDelete.extra}` : ""} This
              can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        busy={deleteBusy}
        onConfirm={() => void runDelete()}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}
