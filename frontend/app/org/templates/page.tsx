"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Crown,
  ExternalLink,
  Eye,
  FolderPlus,
  Gift,
  Grid,
  Heart,
  Layers,
  LayoutTemplate,
  List,
  Lock,
  Monitor,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, FormActions, FormAlert, FormModal, FormPage, TextInput, formPageStyles } from "@/components/forms/form-page";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { Reveal } from "@/components/superadmin/reveal";
import { TemplateCover, TierBadge } from "@/components/superadmin/templates/shared";
import { SiteRenderer } from "@/components/openpage/renderer/SiteRenderer";
import { siteFromLandingPage } from "@/lib/openpage/content";
import { ensureConfig } from "@/lib/openpage/site-config";
import { orgBuilderPath } from "@/lib/openpage/paths";
import {
  InventoryBindFields,
  inventoryBindPayload,
  needsInventorySelection,
  type InventoryBindValue,
} from "@/components/org/inventory-bind-fields";
import type { LandingPageData } from "@/lib/openpage/types";
import type {
  LandingPageRow,
  OrgTemplateSummary,
  OrgTemplatesListResponse,
  AvailableTemplatesResponse,
} from "@/lib/types";
import "@/app/openpage.css";
import "./templates.css";

const LIMIT = 10;

export default function OrgTemplatesPage() {
  const { accessToken, hasPermission } = useAuth();
  const router = useRouter();

  // One flag per Templates pill (named after the button it unlocks) —
  // enforced for the org admin too, whose access Super Admin sets. "Use"
  // creates a landing page, so it follows Landing Pages > Create.
  const canView = hasPermission("templates", "view");
  const canAdd = hasPermission("templates", "add");
  const canRemove = hasPermission("templates", "delete");
  const canUse = hasPermission("landing_pages", "add");

  useEffect(() => {
    if (accessToken && !canView) router.replace("/org");
  }, [accessToken, canView, router]);

  // Create page from template state
  const [useTemplate, setUseTemplate] = useState<{ id: string; name: string } | null>(null);
  const [useName, setUseName] = useState("");
  const [useBind, setUseBind] = useState<InventoryBindValue>({ kind: "none" });
  const [useHasInventory, setUseHasInventory] = useState(false);
  const [useSubmitting, setUseSubmitting] = useState(false);
  const [useError, setUseError] = useState<string | null>(null);

  // Add Template Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [availableData, setAvailableData] = useState<AvailableTemplatesResponse | null>(null);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableError, setAvailableError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [addModalTierFilter, setAddModalTierFilter] = useState<string>("all");
  const [addModalCategoryFilter, setAddModalCategoryFilter] = useState<string>("all");
  const [upgradePrompt, setUpgradePrompt] = useState<{ title: string; body: string } | null>(null);

  // Remove (unassign)
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBlocked, setRemoveBlocked] = useState<{ name: string; message: string } | null>(null);

  // Filters & Search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("latest");
  const [activeTab, setActiveTab] = useState<"all" | "free" | "paid" | "premium" | "my">("my");
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Assigned Templates list
  const [result, setResult] = useState<OrgTemplatesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // In-app Responsive Preview
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<LandingPageData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  function openUseTemplate(id: string, defaultName: string) {
    setUseTemplate({ id, name: defaultName });
    setUseName(defaultName);
    setUseBind({ kind: "none" });
    setUseError(null);
  }

  async function confirmUseTemplate() {
    if (!useTemplate || !accessToken) return;
    if (!useName.trim()) {
      setUseError("Give the page a name");
      return;
    }
    const missing = needsInventorySelection(useBind, useHasInventory);
    if (missing) {
      setUseError(missing);
      return;
    }
    setUseSubmitting(true);
    setUseError(null);
    try {
      const created = await apiFetch<LandingPageRow>("/org/landing-pages", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          templateId: useTemplate.id,
          name: useName.trim(),
          ...inventoryBindPayload(useBind),
        }),
      });
      router.push(orgBuilderPath(created.id));
    } catch (err) {
      setUseError(err instanceof Error ? err.message : "Failed to create page from this template.");
      setUseSubmitting(false);
    }
  }

  const fetchAssignedTemplates = useCallback(() => {
    if (!accessToken || !canView) return;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set("search", search);
    if (category && category !== "all") params.set("category", category);
    if (tierFilter && tierFilter !== "all") params.set("tier", tierFilter);

    apiFetch<OrgTemplatesListResponse>(`/org/templates?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(setResult)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load templates."))
      .finally(() => setLoading(false));
  }, [accessToken, canView, page, search, category, tierFilter]);

  const loadAvailableTemplates = useCallback(() => {
    if (!accessToken || !canView) return;
    setAvailableLoading(true);
    setAvailableError(null);
    apiFetch<AvailableTemplatesResponse>("/org/templates/available", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(setAvailableData)
      .catch((err) => setAvailableError(err instanceof Error ? err.message : "Failed to load available templates."))
      .finally(() => setAvailableLoading(false));
  }, [accessToken, canView]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    fetchAssignedTemplates();
    loadAvailableTemplates();
  }, [fetchAssignedTemplates, loadAvailableTemplates]);

  function openAddModal() {
    setAddModalOpen(true);
    setAssignMessage(null);
    loadAvailableTemplates();
  }

  async function handleAssignTemplate(templateId: string): Promise<boolean> {
    if (!accessToken) return false;
    setAssigningId(templateId);
    setAssignMessage(null);
    setAvailableError(null);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>(`/org/templates/${templateId}/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setAssignMessage(res.message);
      loadAvailableTemplates();
      fetchAssignedTemplates();
      return true;
    } catch (err) {
      setAvailableError(err instanceof Error ? err.message : "Failed to add template.");
      return false;
    } finally {
      setAssigningId(null);
    }
  }

  function requestRemoveTemplate(id: string, name: string) {
    setRemoveError(null);
    const count =
      rows.find((r) => r.id === id)?.landingPageCount ??
      availableData?.data.find((t) => t.id === id)?.landingPageCount ??
      0;
    if (count > 0) {
      const message = `Can't remove this template — ${count} landing page${count === 1 ? "" : "s"} in your workspace ${count === 1 ? "was" : "were"} built from it. Delete ${count === 1 ? "that page" : "those pages"} first if you want to free up this slot.`;
      setRemoveBlocked({ name, message });
      return;
    }
    setRemoveConfirm({ id, name });
  }

  async function confirmRemoveTemplate() {
    if (!removeConfirm || !accessToken) return;
    const { id } = removeConfirm;
    setRemovingId(id);
    try {
      await apiFetch<{ success: boolean; message: string }>(`/org/templates/${id}/assign`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setRemoveConfirm(null);
      setAssignMessage("Template removed from your organisation");
      fetchAssignedTemplates();
      loadAvailableTemplates();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove template.";
      setRemoveError(message);
      setAvailableError(message);
      setRemoveConfirm(null);
    } finally {
      setRemovingId(null);
    }
  }

  function openPreview(id: string) {
    if (!accessToken) return;
    setPreviewId(id);
    setPreviewData(null);
    setPreviewError(null);
    setPreviewLoading(true);
    apiFetch<LandingPageData>(`/org/templates/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(setPreviewData)
      .catch((err) => setPreviewError(err instanceof Error ? err.message : "Failed to load preview."))
      .finally(() => setPreviewLoading(false));
  }

  function closePreview() {
    setPreviewId(null);
    setPreviewData(null);
    setPreviewError(null);
  }

  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const isFiltered = Boolean(search || (category && category !== "all") || (tierFilter && tierFilter !== "all") || (propertyTypeFilter && propertyTypeFilter !== "all"));

  const previewCfg = previewData ? ensureConfig(previewData) : null;
  const previewedTmpl = availableData?.data.find((t) => t.id === previewId);
  const previewedIsAssigned =
    !!previewId &&
    (rows.some((r) => r.id === previewId) || (previewedTmpl?.isAssigned ?? false));

  const availablePlans = availableData?.plans ?? [];
  const filteredAvailable = (availableData?.data ?? []).filter((t) => {
    // The plan filter holds a subscription plan id: keep templates that plan unlocks.
    if (addModalTierFilter !== "all" && !(t.planIds ?? []).includes(addModalTierFilter)) return false;
    if (addModalCategoryFilter !== "all" && t.category !== addModalCategoryFilter) return false;
    return true;
  });

  // 100% Dynamic: driven by Super Admin assignments (rows) & subscription catalog (availableData)
  const assignedList = rows;
  const catalogList = (availableData?.data && availableData.data.length > 0)
    ? availableData.data
    : assignedList;

  // Active pool:
  // "My Templates" -> strictly templates assigned by superadmin to this organisation
  // "All Templates" -> all eligible templates granted by superadmin under the plan
  const activePool = activeTab === "my" ? assignedList : catalogList;

  const allCategories = Array.from(
    new Set(
      [
        ...catalogList.map((r) => r.category),
        ...assignedList.map((r) => r.category),
      ].filter((c): c is string => Boolean(c)),
    ),
  ).sort();

  // Dynamic KPI Metrics calculated from real superadmin database data
  const totalTemplatesCount = availableData?.data?.length ?? assignedList.length;
  const freeTemplatesCount = catalogList.filter((t) => (t.tier ?? "free") === "free").length;
  const premiumTemplatesCount = catalogList.filter((t) => t.tier && t.tier !== "free").length;
  const myTemplatesCount = availableData?.assignedCount ?? assignedList.length;

  // Filter items dynamically
  const filteredTemplates = activePool.filter((tmpl) => {
    // 1. Tab filter
    if (activeTab === "free") {
      if ((tmpl.tier ?? "free") !== "free") return false;
    } else if (activeTab === "paid") {
      if (tmpl.tier !== "paid" && tmpl.tier !== "premium") return false;
    } else if (activeTab === "premium") {
      if (tmpl.tier !== "premium") return false;
    }

    // 2. Search query
    if (search) {
      const q = search.toLowerCase();
      const meta = getTemplateMeta(tmpl.name, tmpl.thumbnail, tmpl.category);
      const match =
        tmpl.name.toLowerCase().includes(q) ||
        (tmpl.category && tmpl.category.toLowerCase().includes(q)) ||
        meta.headline.toLowerCase().includes(q) ||
        meta.type.toLowerCase().includes(q);
      if (!match) return false;
    }

    // 3. Category filter
    if (category !== "all" && tmpl.category !== category) {
      return false;
    }

    // 4. Property type filter
    if (propertyTypeFilter !== "all") {
      const meta = getTemplateMeta(tmpl.name, tmpl.thumbnail, tmpl.category);
      if (!meta.type.toLowerCase().includes(propertyTypeFilter.toLowerCase())) {
        return false;
      }
    }

    // 5. Tier dropdown filter
    if (tierFilter !== "all") {
      if (tierFilter === "free" && (tmpl.tier ?? "free") !== "free") return false;
      if (tierFilter === "paid" && tmpl.tier !== "paid" && tmpl.tier !== "premium") return false;
      if (tierFilter === "premium" && tmpl.tier !== "premium") return false;
    }

    return true;
  });

  // Sort items dynamically
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (sortBy === "az") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "popular") {
      return (b.landingPageCount ?? 0) - (a.landingPageCount ?? 0);
    }
    return 0;
  });

  async function handleCardUse(tmpl: OrgTemplateSummary) {
    const isAssigned = rows.some((r) => r.id === tmpl.id) || Boolean(tmpl.isAssigned);
    if (isAssigned) {
      openUseTemplate(tmpl.id, tmpl.name);
    } else {
      const ok = await handleAssignTemplate(tmpl.id);
      if (ok) {
        openUseTemplate(tmpl.id, tmpl.name);
      }
    }
  }

  function handleCardPreview(tmpl: OrgTemplateSummary) {
    const hasRealId = rows.some((r) => r.id === tmpl.id) || availableData?.data.some((t) => t.id === tmpl.id);
    if (hasRealId) {
      openPreview(tmpl.id);
    } else if (rows.length > 0) {
      openPreview(rows[0].id);
    } else if (availableData?.data && availableData.data.length > 0) {
      openPreview(availableData.data[0].id);
    }
  }

  // "Add templates to workspace" is a full-width in-page view (a picker); the
  // short "Create landing page" form is a popup rendered below.
  const formView = addModalOpen ? (
    <FormPage
      eyebrow="Website · Templates"
      title="Add templates to workspace"
      subtitle="Select templates granted under your subscription plan to build landing pages."
      onBack={() => setAddModalOpen(false)}
      backLabel="Back to Templates"
    >
      <div className={formPageStyles.panel}>
            <div>
              {availableLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                  <div>Loading available plan templates…</div>
                </div>
              ) : availableError ? (
                <div style={{ padding: "16px 0", color: "var(--rose)", fontSize: 13 }}>{availableError}</div>
              ) : availableData ? (
                <div>
                  {/* Quota Telemetry Banner */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "var(--surface-2, #f8fafc)",
                      borderRadius: 12,
                      border: "1px solid var(--line)",
                      marginBottom: 16,
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                        {availableData.planName} Package
                      </span>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        Template Allowance: {availableData.assignedCount} of{" "}
                        {availableData.maxAllowed == null ? "Unlimited" : availableData.maxAllowed} Selected
                      </div>
                    </div>
                    <span
                      className={`badge ${availableData.remainingQuota === 0
                          ? "b-amber"
                          : availableData.remainingQuota != null
                            ? "b-indigo"
                            : "b-green"
                        }`}
                      style={{ fontWeight: 700 }}
                    >
                      {availableData.remainingQuota === 0
                        ? "Quota Reached"
                        : availableData.remainingQuota != null
                          ? `${availableData.remainingQuota} remaining slots`
                          : "Unlimited access"}
                    </span>
                  </div>

                  {availableData.remainingQuota === 0 ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                        padding: "10px 14px",
                        marginBottom: 16,
                        borderRadius: 12,
                        border: "1px solid var(--amber, #f59e0b)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>⚠️</span>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        Your {availableData.planName} plan allows{" "}
                        <b>{availableData.maxAllowed}</b> template{availableData.maxAllowed === 1 ? "" : "s"} in your
                        workspace and you have <b>{availableData.assignedCount}</b>. Remove a template or upgrade your
                        plan to add more.
                      </div>
                      <Link href="/org/settings?section=billing" className="btn btn-soft btn-sm">
                        Upgrade plan
                      </Link>
                    </div>
                  ) : null}

                  {/* Filters in modal */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                    <select
                      className="inp"
                      style={{ width: 170 }}
                      value={addModalTierFilter}
                      onChange={(e) => setAddModalTierFilter(e.target.value)}
                    >
                      <option value="all">All Plans</option>
                      {availablePlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="inp"
                      style={{ width: 200 }}
                      value={addModalCategoryFilter}
                      onChange={(e) => setAddModalCategoryFilter(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      {(availableData.categories ?? allCategories).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto" }}>
                      {filteredAvailable.length} templates
                    </span>
                  </div>

                  {/* Template Cards Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: 14,
                    }}
                  >
                    {filteredAvailable.map((tmpl) => {
                      const isAssigned = tmpl.isAssigned;
                      const isQuotaFull = availableData.remainingQuota === 0 && !isAssigned;
                      // Corner badge: the user's own plan when it covers this
                      // template, otherwise the plans that would unlock it.
                      const unlockNames = availablePlans
                        .filter((p) => (tmpl.planIds ?? []).includes(p.id))
                        .map((p) => p.name);
                      const planBadge = !tmpl.isLocked
                        ? { cls: "b-green", label: availableData.planName, title: "Included in your current plan" }
                        : unlockNames.length > 0
                          ? {
                              cls: "b-indigo",
                              label:
                                unlockNames.length <= 2
                                  ? unlockNames.join(", ")
                                  : `${unlockNames.slice(0, 2).join(", ")} +${unlockNames.length - 2}`,
                              title: `Available on: ${unlockNames.join(", ")}`,
                            }
                          : null;

                      return (
                        <div
                          key={tmpl.id}
                          style={{
                            border: isAssigned ? "2px solid var(--brand, #0f1424)" : "1px solid var(--line-2)",
                            borderRadius: 14,
                            overflow: "hidden",
                            background: "var(--surface)",
                            display: "flex",
                            flexDirection: "column",
                            position: "relative",
                          }}
                        >
                          <div style={{ position: "relative" }}>
                            <TemplateCover thumbnail={tmpl.thumbnail ?? "hero"} accent={isAssigned ? "#0f1424" : "#94a3b8"} height={150}>
                              <div style={{ position: "absolute", top: 8, left: 8 }}>
                                {planBadge ? (
                                  <span
                                    className={`badge ${planBadge.cls}`}
                                    title={planBadge.title}
                                    style={{ textTransform: "none", fontWeight: 600 }}
                                  >
                                    {planBadge.label}
                                  </span>
                                ) : (
                                  <TierBadge tier={tmpl.tier} />
                                )}
                              </div>
                              {tmpl.isLocked && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 8,
                                    right: 8,
                                    background: "rgba(15, 23, 42, 0.8)",
                                    color: "#f59e0b",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    backdropFilter: "blur(4px)",
                                    zIndex: 2,
                                  }}
                                >
                                  <Lock size={12} /> Locked
                                </div>
                              )}
                            </TemplateCover>
                          </div>

                          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{tmpl.name}</div>
                            {tmpl.category && (
                              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{tmpl.category}</div>
                            )}

                            <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={() => openPreview(tmpl.id)}
                                style={{ width: "100%", justifyContent: "center" }}
                              >
                                Preview
                              </button>
                              {tmpl.isLocked ? (
                                <button
                                  className="btn btn-sm"
                                  type="button"
                                  onClick={() => {
                                    setUpgradePrompt({
                                      title: `${tmpl.tier === "premium" ? "Premium" : "Paid"} Template Locked`,
                                      body:
                                        tmpl.lockReason ??
                                        "This template is not available on your current plan. Please upgrade your subscription to unlock it.",
                                    });
                                  }}
                                  style={{
                                    width: "100%",
                                    justifyContent: "center",
                                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                    color: "#fff",
                                    border: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontWeight: 700,
                                  }}
                                >
                                  <Lock size={13} /> Upgrade to Unlock
                                </button>
                              ) : isAssigned ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "var(--brand)",
                                    background: "var(--brand-050)",
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    width: "100%",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Check size={14} /> Added to Workspace
                                </span>
                              ) : (
                                <button
                                  className="btn btn-primary btn-sm"
                                  type="button"
                                  onClick={() => handleAssignTemplate(tmpl.id)}
                                  disabled={assigningId === tmpl.id || isQuotaFull}
                                  title={isQuotaFull ? "You've reached your plan's template limit" : undefined}
                                  style={{ width: "100%", justifyContent: "center", fontWeight: 700 }}
                                >
                                  {assigningId === tmpl.id
                                    ? "Adding…"
                                    : isQuotaFull
                                      ? "Quota Full"
                                      : "+ Add to Workspace"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
      </div>
    </FormPage>
  ) : null;

  return (
    <>
      {formView}
      <FormModal
        open={useTemplate !== null}
        onClose={() => {
          if (!useSubmitting) setUseTemplate(null);
        }}
        title="Create landing page"
        description={`Start a new landing page based on "${useTemplate?.name ?? ""}".`}
        busy={useSubmitting}
        onSubmit={() => void confirmUseTemplate()}
      >
        <FormAlert message={useError} />
        <Field htmlFor="tpl-use-name" label="Landing page name" icon="landing">
          <TextInput
            id="tpl-use-name"
            icon="landing"
            placeholder="e.g. Skyline Residence Launch"
            value={useName}
            onChange={(e) => setUseName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field htmlFor="tpl-use-bind" label="Project or standalone unit" icon="building">
          <InventoryBindFields
            accessToken={accessToken}
            value={useBind}
            onChange={setUseBind}
            onAvailabilityChange={setUseHasInventory}
            hideLabel
          />
        </Field>
        <FormActions
          onCancel={() => {
            if (!useSubmitting) setUseTemplate(null);
          }}
          busy={useSubmitting}
          busyLabel="Creating…"
          submitLabel="Create & Launch Builder"
          submitIcon="plus"
        />
      </FormModal>
    <div className="tpl-wrap" style={formView ? { display: "none" } : undefined}>
      {/* 1. Hero Banner */}
      <div className="tpl-hero reveal in">
        <div className="tpl-hero-left">
          <div className="tpl-hero-eyebrow">
            <LayoutTemplate size={13} />
            <span>WEBSITE &amp; PAGES</span>
          </div>
          <h1 className="tpl-hero-title">Templates Studio</h1>
          <p className="tpl-hero-sub">
            High-converting real estate landing page templates for your projects.
          </p>
        </div>

        <div className="tpl-hero-right">
          <div className="tpl-hero-img-wrap">
            <img
              src="/templates/hero-building.jpg"
              alt="Templates Studio"
              className="tpl-hero-img"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/templates/modern-living.jpg";
              }}
            />
          </div>
          <div className="tpl-hero-features">
            <div className="tpl-hero-feature-item">
              <CheckCircle2 size={16} className="tpl-hero-check" />
              <span>Professionally designed</span>
            </div>
            <div className="tpl-hero-feature-item">
              <CheckCircle2 size={16} className="tpl-hero-check" />
              <span>Mobile responsive</span>
            </div>
            <div className="tpl-hero-feature-item">
              <CheckCircle2 size={16} className="tpl-hero-check" />
              <span>SEO optimized</span>
            </div>
            <div className="tpl-hero-feature-item">
              <CheckCircle2 size={16} className="tpl-hero-check" />
              <span>Conversion focused</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="tpl-kpi-grid reveal in">
        {/* Card 1: Your Templates (Assigned) */}
        <div
          className="tpl-kpi-card"
          onClick={() => {
            setActiveTab("my");
          }}
        >
          <div className="tpl-kpi-top">
            <div className="tpl-kpi-icon tpl-kpi-icon-blue">
              <User size={18} />
            </div>
            <span className="tpl-kpi-label">Your Templates</span>
          </div>
          <div className="tpl-kpi-bottom">
            <span className="tpl-kpi-val">{myTemplatesCount}</span>
            <span className="tpl-kpi-trend" style={{ color: "#3b82f6" }}>Assigned to workspace</span>
          </div>
          <svg className="tpl-kpi-wave" width="96" height="42" viewBox="0 0 96 42" fill="none">
            <path d="M0 28C22 28 36 38 56 20C76 4 84 24 96 16V42H0V28Z" fill="#3b82f6" fillOpacity="0.15" />
            <path d="M0 28C22 28 36 38 56 20C76 4 84 24 96 16" stroke="#3b82f6" strokeWidth="2.5" fill="none" />
          </svg>
        </div>

        {/* Card 2: Total Templates */}
        <div
          className="tpl-kpi-card"
          onClick={() => {
            setActiveTab("all");
            setTierFilter("all");
            setCategory("all");
          }}
        >
          <div className="tpl-kpi-top">
            <div className="tpl-kpi-icon tpl-kpi-icon-green">
              <Layers size={18} />
            </div>
            <span className="tpl-kpi-label">Browse All Catalog</span>
          </div>
          <div className="tpl-kpi-bottom">
            <span className="tpl-kpi-val">{totalTemplatesCount}</span>
            <span className="tpl-kpi-trend">Full platform catalog</span>
          </div>
          <svg className="tpl-kpi-wave" width="96" height="42" viewBox="0 0 96 42" fill="none">
            <path d="M0 28C22 28 36 38 56 20C76 4 84 24 96 16V42H0V28Z" fill="#10b981" fillOpacity="0.15" />
            <path d="M0 28C22 28 36 38 56 20C76 4 84 24 96 16" stroke="#10b981" strokeWidth="2.5" fill="none" />
          </svg>
        </div>

        {/* Card 3: Free Templates */}
        <div
          className="tpl-kpi-card"
          onClick={() => {
            setActiveTab("free");
            setTierFilter("free");
          }}
        >
          <div className="tpl-kpi-top">
            <div className="tpl-kpi-icon tpl-kpi-icon-purple">
              <Gift size={18} />
            </div>
            <span className="tpl-kpi-label">Free Templates</span>
          </div>
          <div className="tpl-kpi-bottom">
            <span className="tpl-kpi-val">{freeTemplatesCount}</span>
          </div>
          <svg className="tpl-kpi-wave" width="96" height="42" viewBox="0 0 96 42" fill="none">
            <path d="M0 28C24 28 38 40 58 22C78 6 86 24 96 18V42H0V28Z" fill="#9333ea" fillOpacity="0.15" />
            <path d="M0 28C24 28 38 40 58 22C78 6 86 24 96 18" stroke="#9333ea" strokeWidth="2.5" fill="none" />
          </svg>
        </div>

        {/* Card 4: Premium Templates */}
        <div
          className="tpl-kpi-card"
          onClick={() => {
            setActiveTab("premium");
            setTierFilter("premium");
          }}
        >
          <div className="tpl-kpi-top">
            <div className="tpl-kpi-icon tpl-kpi-icon-amber">
              <Crown size={18} />
            </div>
            <span className="tpl-kpi-label">Premium Templates</span>
          </div>
          <div className="tpl-kpi-bottom">
            <span className="tpl-kpi-val">{premiumTemplatesCount}</span>
          </div>
          <svg className="tpl-kpi-wave" width="96" height="42" viewBox="0 0 96 42" fill="none">
            <path d="M0 28C20 28 34 36 54 22C74 8 84 26 96 18V42H0V28Z" fill="#f59e0b" fillOpacity="0.15" />
            <path d="M0 28C20 28 34 36 54 22C74 8 84 26 96 18" stroke="#f59e0b" strokeWidth="2.5" fill="none" />
          </svg>
        </div>
      </div>

      {/* 3. Segmented Tabs & Action Button */}
      <div className="tpl-tabs-row">
        <div className="tpl-tab-pills">
          <button
            type="button"
            className={`tpl-tab-pill ${activeTab === "my" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("my");
            }}
          >
            My Templates
          </button>
          <button
            type="button"
            className={`tpl-tab-pill ${activeTab === "all" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("all");
              setTierFilter("all");
            }}
          >
            Browse All Catalog
          </button>
          <button
            type="button"
            className={`tpl-tab-pill ${activeTab === "free" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("free");
              setTierFilter("free");
            }}
          >
            Free Plan
          </button>
          <button
            type="button"
            className={`tpl-tab-pill ${activeTab === "paid" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("paid");
              setTierFilter("paid");
            }}
          >
            Paid Plans
          </button>
          <button
            type="button"
            className={`tpl-tab-pill ${activeTab === "premium" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("premium");
              setTierFilter("premium");
            }}
          >
            Premium Plans
          </button>
        </div>

        {canAdd && (
          <button
            type="button"
            className="tpl-btn-add"
            onClick={openAddModal}
          >
            <Plus size={16} />
            <span>Add Template from Plan</span>
          </button>
        )}
      </div>

      {/* 4. Filter Toolbar (Strictly in 1 Row) */}
      <div
        className="tpl-filter-bar"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "nowrap",
          gap: 10,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div className="tpl-search-box" style={{ flex: "1 1 auto", minWidth: 180 }}>
          <Search size={15} className="tpl-search-icon" />
          <input
            type="text"
            className="tpl-search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search templates by name, type, or keyword..."
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#94a3b8",
                padding: 2,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Categories Dropdown */}
        <select
          className="tpl-filter-select"
          value={category}
          style={{ flex: "0 0 135px", width: 135, flexShrink: 0 }}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Property Types Dropdown */}
        <select
          className="tpl-filter-select"
          value={propertyTypeFilter}
          style={{ flex: "0 0 145px", width: 145, flexShrink: 0 }}
          onChange={(e) => {
            setPropertyTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Property Types</option>
          <option value="Apartment">Apartment</option>
          <option value="Villa">Villa</option>
          <option value="Penthouse">Penthouse</option>
          <option value="Commercial">Commercial</option>
          <option value="Residential">Residential</option>
        </select>

        {/* Plans Dropdown */}
        <select
          className="tpl-filter-select"
          value={tierFilter}
          style={{ flex: "0 0 120px", width: 120, flexShrink: 0 }}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Plans</option>
          <option value="free">Free Plan</option>
          <option value="paid">Paid Plans</option>
          <option value="premium">Premium Plans</option>
        </select>

        {/* Sort Dropdown */}
        <select
          className="tpl-filter-select"
          value={sortBy}
          style={{ flex: "0 0 115px", width: 115, flexShrink: 0 }}
          onChange={(e) => {
            setSortBy(e.target.value);
          }}
        >
          <option value="latest">Latest</option>
          <option value="popular">Most Popular</option>
          <option value="az">Name A-Z</option>
        </select>

        {/* View Switcher */}
        <div className="tpl-view-mode" style={{ flex: "0 0 auto", flexShrink: 0 }}>
          <button
            type="button"
            className={`tpl-view-btn ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => setViewMode("grid")}
          >
            <Grid size={13} />
            <span>Grid</span>
          </button>
          <button
            type="button"
            className={`tpl-view-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
          >
            <List size={13} />
            <span>List</span>
          </button>
        </div>
      </div>

      {removeError && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--rose-050, #fef2f2)",
            color: "var(--rose, #e11d48)",
            border: "1px solid var(--rose-100, #fecdd3)",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {removeError}
        </div>
      )}

      {/* 5. Main Content: Grid or List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <div>Loading templates…</div>
        </div>
      ) : loadError ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ color: "var(--rose)", fontWeight: 600 }}>{loadError}</div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={fetchAssignedTemplates}
            style={{ marginTop: 12 }}
          >
            Try Again
          </button>
        </div>
      ) : sortedTemplates.length === 0 ? (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
            {activeTab === "my"
              ? "No templates assigned to your workspace yet"
              : isFiltered
                ? "No templates match your filters"
                : "No templates available in your subscription plan"}
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "#64748b" }}>
            {activeTab === "my"
              ? "Super Admin has not assigned any templates to your organisation yet, or you can add templates from your plan catalog."
              : isFiltered
                ? "Try adjusting your search keywords, category, or tier filter."
                : "Contact your Super Admin to publish and grant templates to your package."}
          </p>
          <div style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {isFiltered && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearchInput("");
                  setCategory("all");
                  setPropertyTypeFilter("all");
                  setTierFilter("all");
                  setActiveTab("all");
                }}
              >
                Reset Filters
              </button>
            )}
            {canAdd && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={openAddModal}
              >
                <Plus size={14} /> Add Template from Plan
              </button>
            )}
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* 4-Column Card Grid */
        <div className="tpl-grid">
          {sortedTemplates.map((tmpl) => {
            const isAssigned = rows.some((r) => r.id === tmpl.id) || Boolean(tmpl.isAssigned);
            return (
              <TplCard
                key={tmpl.id}
                tmpl={tmpl}
                isAssigned={isAssigned}
                isFavorite={!!favorites[tmpl.id]}
                onToggleFavorite={() =>
                  setFavorites((prev) => ({ ...prev, [tmpl.id]: !prev[tmpl.id] }))
                }
                onPreview={() => handleCardPreview(tmpl)}
                onUse={canUse ? () => handleCardUse(tmpl) : undefined}
                onAdd={canAdd ? () => handleCardUse(tmpl) : undefined}
                onRemove={canRemove && isAssigned ? () => requestRemoveTemplate(tmpl.id, tmpl.name) : undefined}
                assigning={assigningId === tmpl.id}
                removing={removingId === tmpl.id}
                canUse={canUse}
                canAdd={canAdd}
                canRemove={canRemove}
              />
            );
          })}
        </div>
      ) : (
        /* Modern Data Table View */
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#475569" }}>Template</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#475569" }}>Tier</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#475569" }}>Type</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#475569" }}>Landing Pages</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#475569", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTemplates.map((tmpl) => {
                const meta = getTemplateMeta(tmpl.name, tmpl.thumbnail, tmpl.category);
                const isAssigned = rows.some((r) => r.id === tmpl.id) || Boolean(tmpl.isAssigned);
                const isFree = (tmpl.tier ?? "free") === "free";
                return (
                  <tr key={tmpl.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img
                          src={meta.image}
                          alt={tmpl.name}
                          style={{ width: 44, height: 32, borderRadius: 6, objectFit: "cover" }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/templates/modern-living.jpg";
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{tmpl.name}</div>
                          <div style={{ fontSize: 11.5, color: "#64748b" }}>{meta.headline}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`tpl-card-badge ${isFree ? "tpl-card-badge-free" : "tpl-card-badge-premium"}`} style={{ position: "static", display: "inline-block" }}>
                        {isFree ? "Free Plan" : "Premium"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{meta.type}</td>
                    <td style={{ padding: "12px 16px", color: "#334155", fontWeight: 600 }}>
                      {tmpl.landingPageCount ?? 0}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button
                          type="button"
                          className="tpl-btn-preview"
                          style={{ height: 30, padding: "0 10px" }}
                          onClick={() => handleCardPreview(tmpl)}
                        >
                          <Eye size={12} /> Preview
                        </button>
                        <button
                          type="button"
                          className="tpl-btn-use"
                          style={{ height: 30, padding: "0 12px" }}
                          onClick={() => handleCardUse(tmpl)}
                        >
                          <Plus size={12} /> Use
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {result && Math.ceil(total / LIMIT) > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>
            Page {page} of {Math.ceil(total / LIMIT)}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={page >= Math.ceil(total / LIMIT)}
            onClick={() => setPage((p) => Math.min(Math.ceil(total / LIMIT), p + 1))}
          >
            Next →
          </button>
        </div>
      )}

      {/* Interactive Responsive Device Preview Modal */}
      {previewId && (
        <Modal
          open={!!previewId}
          onClose={closePreview}
          title={previewData?.name ?? previewedTmpl?.name ?? "Template Preview"}
          headerActions={
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {previewedTmpl && <TierBadge tier={previewedTmpl.tier} />}
              {previewedTmpl?.category && (
                <span className="badge b-gray" style={{ fontWeight: 600 }}>
                  {previewedTmpl.category}
                </span>
              )}
            </div>
          }
          footer={
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "space-between" }}>
              {/* Device Viewport Toggle */}
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--surface-2, #f8fafc)",
                  borderRadius: 8,
                  padding: 2,
                  border: "1px solid var(--line-2)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  title="Desktop View"
                  style={{
                    border: "none",
                    background: previewDevice === "desktop" ? "var(--surface)" : "transparent",
                    color: previewDevice === "desktop" ? "var(--brand)" : "var(--muted)",
                    padding: "5px 9px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <Monitor size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("tablet")}
                  title="Tablet View"
                  style={{
                    border: "none",
                    background: previewDevice === "tablet" ? "var(--surface)" : "transparent",
                    color: previewDevice === "tablet" ? "var(--brand)" : "var(--muted)",
                    padding: "5px 9px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <Tablet size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  title="Mobile View"
                  style={{
                    border: "none",
                    background: previewDevice === "mobile" ? "var(--surface)" : "transparent",
                    color: previewDevice === "mobile" ? "var(--brand)" : "var(--muted)",
                    padding: "5px 9px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <Smartphone size={15} />
                </button>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {previewedIsAssigned ? (
                  canUse ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const id = previewId;
                      const name = previewData?.name ?? previewedTmpl?.name ?? "Landing Page";
                      closePreview();
                      openUseTemplate(id, name);
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
                  >
                    <Sparkles size={14} /> Use this template
                  </button>
                  ) : null
                ) : canAdd ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      const id = previewId;
                      const ok = await handleAssignTemplate(id);
                      if (ok) closePreview();
                    }}
                    disabled={assigningId === previewId || previewedTmpl?.isLocked}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
                  >
                    <Plus size={14} /> Add to Workspace
                  </button>
                ) : null}
              </div>
            </div>
          }
        >
          <div
            style={{
              background: "#0f172a",
              borderRadius: 14,
              padding: previewDevice === "desktop" ? "8px" : "24px 12px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 520,
              maxHeight: "75vh",
              overflow: "hidden",
            }}
          >
            {previewLoading ? (
              <div style={{ color: "#ffffff", padding: 40, textAlign: "center" }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                <div>Loading preview canvas…</div>
              </div>
            ) : previewError ? (
              <div style={{ color: "var(--rose)", padding: 20 }}>{previewError}</div>
            ) : previewData ? (
              <div
                style={{
                  width:
                    previewDevice === "desktop"
                      ? "100%"
                      : previewDevice === "tablet"
                        ? 768
                        : 375,
                  height: 520,
                  background: "#ffffff",
                  borderRadius: previewDevice === "desktop" ? 8 : 16,
                  overflowY: "auto",
                  boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
                  transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                  border: previewDevice !== "desktop" ? "8px solid #334155" : "none",
                }}
              >
                <SiteRenderer
                  site={siteFromLandingPage(previewData)}
                  live
                />
              </div>
            ) : null}
          </div>
        </Modal>
      )}

      {/* Remove Confirm Modal */}
      <ConfirmModal
        open={!!removeConfirm}
        title="Remove Template from Workspace?"
        message={
          removeConfirm
            ? `Are you sure you want to remove "${removeConfirm.name}"? You can re-add it anytime if you have quota remaining.`
            : ""
        }
        confirmLabel={removingId ? "Removing…" : "Remove Template"}
        destructive
        onConfirm={confirmRemoveTemplate}
        onClose={() => setRemoveConfirm(null)}
      />

      {/* Remove Blocked Modal */}
      <Modal
        open={!!removeBlocked}
        onClose={() => setRemoveBlocked(null)}
        title="Template In Use"
        footer={
          <button className="btn btn-primary" type="button" onClick={() => setRemoveBlocked(null)}>
            Understood
          </button>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          {removeBlocked?.message}
        </div>
      </Modal>

      {/* Upgrade Prompt Modal */}
      <Modal
        open={!!upgradePrompt}
        onClose={() => setUpgradePrompt(null)}
        title={upgradePrompt?.title ?? "Subscription Upgrade"}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setUpgradePrompt(null)}>
              Close
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setUpgradePrompt(null);
                router.push("/org/settings?section=billing");
              }}
              style={{ fontWeight: 700 }}
            >
              View Subscription Plans →
            </button>
          </>
        }
      >
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#fef3c7",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Lock size={20} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
              {upgradePrompt?.body}
            </p>
          </div>
        </div>
      </Modal>
    </div>
    </>
  );
}

/* ============================================================
   Templates Visual Metadata & Helpers
   ============================================================ */
const TEMPLATE_PREVIEWS: Record<
  string,
  { image: string; headline: string; sub: string; type: string; category: string; tier: "free" | "paid" | "premium" }
> = {
  "vista-framed": {
    image: "/templates/vista-framed.jpg",
    headline: "Modern Living Redefined",
    sub: "Premium Homes in Prime Locations",
    type: "Apartment • Modern",
    category: "Modern",
    tier: "free",
  },
  "vista-curve": {
    image: "/templates/vista-curve.jpg",
    headline: "Find Your Dream Home",
    sub: "Luxury Villas for a Better Tomorrow",
    type: "Villa • Luxury",
    category: "Luxury",
    tier: "free",
  },
  "modern-living": {
    image: "/templates/modern-living.jpg",
    headline: "Luxury Apartments In the Heart of City",
    sub: "Luxury Villas with World Class Amenities",
    type: "Apartment • Premium",
    category: "Apartment",
    tier: "premium",
  },
  "future-home": {
    image: "/templates/future-home.jpg",
    headline: "Your Future Home Starts Here",
    sub: "Exclusive Villas with World Class Amenities",
    type: "Villa • Modern",
    category: "Villa",
    tier: "premium",
  },
  "discover-modern": {
    image: "/templates/discover-modern.jpg",
    headline: "Discover Modern Living in Perfect Location",
    sub: "Apartments designed for your lifestyle",
    type: "Apartment • Modern",
    category: "Apartment",
    tier: "free",
  },
  "investment-hub": {
    image: "/templates/investment-hub.jpg",
    headline: "Invest in Better Tomorrow",
    sub: "Premium Commercial Spaces",
    type: "Commercial • Investment",
    category: "Commercial",
    tier: "premium",
  },
  "elegant-homes": {
    image: "/templates/elegant-homes.jpg",
    headline: "Elegant Homes For a Brighter Life",
    sub: "Custom Crafted Waterfront Residences",
    type: "Villa • Luxury",
    category: "Villa",
    tier: "free",
  },
  "aurelia-reserve": {
    image: "/templates/aurelia-reserve.jpg",
    headline: "Experience Luxury Living",
    sub: "Premium Apartments in Prime Location",
    type: "Apartment • Premium",
    category: "Luxury",
    tier: "premium",
  },
};

function getTemplateMeta(name: string, thumbnail?: string | null, category?: string | null) {
  // If superadmin provided an explicit thumbnail image path or URL, use it directly
  if (thumbnail && (thumbnail.startsWith("http://") || thumbnail.startsWith("https://") || thumbnail.startsWith("/") || thumbnail.startsWith("data:"))) {
    return {
      image: thumbnail,
      headline: name,
      sub: "High-Converting Real Estate Layout",
      type: category ? `${category} • Modern` : "Residential • Modern",
      category: category || "Residential",
      tier: "free" as const,
    };
  }

  const normalized = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  for (const [key, val] of Object.entries(TEMPLATE_PREVIEWS)) {
    if (normalized.includes(key) || (thumbnail && thumbnail.toLowerCase().includes(key))) {
      return {
        ...val,
        headline: name,
      };
    }
  }

  const cat = (category || "").toLowerCase();
  if (cat.includes("villa")) {
    return {
      image: "/templates/elegant-homes.jpg",
      headline: name || "Luxury Villa Living",
      sub: "Exclusive Villas with Modern Amenities",
      type: `${category || "Villa"} • Luxury`,
      category: category || "Villa",
      tier: "free" as const,
    };
  }
  if (cat.includes("commercial")) {
    return {
      image: "/templates/investment-hub.jpg",
      headline: name || "Invest in Better Tomorrow",
      sub: "Premium Commercial Real Estate",
      type: `${category || "Commercial"} • Investment`,
      category: category || "Commercial",
      tier: "premium" as const,
    };
  }
  return {
    image: "/templates/vista-framed.jpg",
    headline: name || "Modern Living Redefined",
    sub: "High-Converting Real Estate Layout",
    type: category ? `${category} • Modern` : "Apartment • Modern",
    category: category || "Apartment",
    tier: "free" as const,
  };
}

/* ============================================================
   TplCard: 4-Column Modern Template Card
   ============================================================ */
function TplCard({
  tmpl,
  isAssigned,
  isFavorite,
  onToggleFavorite,
  onPreview,
  onUse,
  onAdd,
  onRemove,
  assigning,
  removing,
  canUse,
  canAdd,
  canRemove,
}: {
  tmpl: OrgTemplateSummary;
  isAssigned: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPreview: () => void;
  onUse?: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
  assigning?: boolean;
  removing?: boolean;
  canUse: boolean;
  canAdd: boolean;
  canRemove: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = getTemplateMeta(tmpl.name, tmpl.thumbnail, tmpl.category);
  const isFree = (tmpl.tier ?? "free") === "free";

  return (
    <div className="tpl-card">
      {/* Thumbnail Area */}
      <div className="tpl-card-thumb">
        <img
          src={meta.image}
          alt={tmpl.name}
          className="tpl-card-img"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/templates/modern-living.jpg";
          }}
        />
        <div className="tpl-card-vignette" />

        {/* Top-Left Tier Badge */}
        <div className={`tpl-card-badge ${isFree ? "tpl-card-badge-free" : "tpl-card-badge-premium"}`}>
          {isFree ? "Free Plan" : "Premium"}
        </div>

        {/* Top-Right Favorite Heart Button */}
        <button
          type="button"
          className={`tpl-card-fav ${isFavorite ? "favorited" : ""}`}
          onClick={onToggleFavorite}
          title={isFavorite ? "Remove favorite" : "Save to favorites"}
        >
          <Heart size={14} fill={isFavorite ? "#e11d48" : "none"} />
        </button>

        {/* Overlay Text on Thumbnail */}
        <div className="tpl-card-overlay-text">
          <div className="tpl-card-overlay-headline">{meta.headline}</div>
          <div className="tpl-card-overlay-sub">{meta.sub}</div>
        </div>
      </div>

      {/* Card Info & Actions */}
      <div className="tpl-card-body">
        <h3 className="tpl-card-title" title={tmpl.name}>
          {tmpl.name}
        </h3>
        <div className="tpl-card-meta">{meta.type}</div>

        {/* Action Buttons Row */}
        <div className="tpl-card-actions" style={{ position: "relative" }}>
          <button type="button" className="tpl-btn-preview" onClick={onPreview}>
            <Eye size={13} />
            <span>Preview</span>
          </button>

          {isAssigned ? (
            canUse ? (
              <button type="button" className="tpl-btn-use" onClick={onUse}>
                <Plus size={13} />
                <span>Use Template</span>
              </button>
            ) : null
          ) : (
            canAdd ? (
              <button
                type="button"
                className="tpl-btn-use"
                onClick={onAdd}
                disabled={assigning || tmpl.isLocked}
              >
                <Plus size={13} />
                <span>{assigning ? "Adding…" : "Use Template"}</span>
              </button>
            ) : null
          )}

          <button
            type="button"
            className="tpl-btn-dots"
            onClick={() => setMenuOpen(!menuOpen)}
            title="Options"
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 38,
                  right: 0,
                  zIndex: 50,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.12)",
                  minWidth: 160,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onPreview();
                  }}
                  style={{
                    padding: "7px 10px",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#334155",
                  }}
                >
                  <Eye size={13} /> View Live Preview
                </button>

                {isAssigned && onRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRemove();
                    }}
                    style={{
                      padding: "7px 10px",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "#e11d48",
                    }}
                  >
                    <Trash2 size={13} /> Remove from Workspace
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
