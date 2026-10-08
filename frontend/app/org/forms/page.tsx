"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  FormInput,
  Grid,
  Layers,
  LayoutTemplate,
  List,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { CountUp } from "@/components/superadmin/count-up";
import { ListPager, usePagedRows } from "@/components/ui/list-pager";
import { Reveal } from "@/components/superadmin/reveal";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { embedSnippet, iframeSnippet, shortcodeSnippet } from "@/lib/openpage/forms-store";
import {
  createFormDef,
  deleteFormDef,
  duplicateFormDef,
  ensureFormLibrary,
  type BackedForm,
} from "@/lib/openpage/forms-backend";

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrgFormsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();

  const [forms, setForms] = useState<BackedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters & Views
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "disabled">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "single" | "multi">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modals
  const [embedFor, setEmbedFor] = useState<BackedForm | null>(null);
  const [embedTab, setEmbedTab] = useState<"html" | "iframe" | "shortcode" | "id">("html");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<BackedForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  // One flag per Lead Forms pill — enforced for the org admin too.
  const canView = hasPermission("forms", "view");
  const canCreate = hasPermission("forms", "add");
  const canEdit = hasPermission("forms", "edit");
  const canDelete = hasPermission("forms", "delete");

  function refresh(quiet = false) {
    if (!canView) return;
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }
    ensureFormLibrary("org")
      .then(setForms)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load forms."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (canView) {
      setLoading(true);
      setLoadError(null);
      ensureFormLibrary("org")
        .then(setForms)
        .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load forms."))
        .finally(() => setLoading(false));
    }
  }, [canView]);

  const activeCount = forms.filter((f) => f.enabled !== false).length;
  const multiStepCount = forms.filter((f) => Boolean(f.multiStep)).length;
  const totalFields = forms.reduce((acc, f) => acc + (f.fields?.length ?? 0), 0);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return forms.filter((f) => {
      const enabled = f.enabled !== false;
      if (filter === "active" && !enabled) return false;
      if (filter === "disabled" && enabled) return false;

      if (typeFilter === "single" && f.multiStep) return false;
      if (typeFilter === "multi" && !f.multiStep) return false;

      if (!query) return true;
      const hay = [
        f.name,
        f.description,
        f.id,
        f.embed?.id,
        ...(f.fields ?? []).flatMap((field) => [field.label, field.cssClass, field.type]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [forms, q, filter, typeFilter]);
  // 10 per page; the counters and tab counts still use every form.
  const paged = usePagedRows(visible, `${q}|${filter}|${typeFilter}`);

  async function createForm() {
    setBusy(true);
    try {
      const created = await createFormDef("org", "New enquiry form");
      router.push(`/org/forms/${created.backendId}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to create form.");
      setBusy(false);
    }
  }

  async function duplicate(id: string) {
    setBusy(true);
    try {
      await duplicateFormDef("org", id);
      notify("Form duplicated");
      refresh(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to duplicate form.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: BackedForm) {
    setBusy(true);
    try {
      await deleteFormDef("org", target.backendId);
      notify("Form deleted");
      refresh(true);
      setDeleteFor(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete form.");
    } finally {
      setBusy(false);
    }
  }

  const copySnippet = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    notify("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2200);
  };

  if (!canView) {
    return (
      <Reveal>
        <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--faint)" }}>
            <FormInput size={40} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Lead Forms are locked</div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Your role doesn&apos;t include access to lead forms. Ask your organisation admin to grant the &quot;forms&quot; permission.
          </div>
        </div>
      </Reveal>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 60 }}>
      {/* Header */}
      <div
        className="reveal in"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 800,
              color: "var(--brand, #0f1424)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            <FormInput size={13} />
            <span>WEBSITE &amp; LEAD CAPTURE</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            Lead Forms
          </h1>
          <div className="sub" style={{ marginTop: 4, maxWidth: 680, fontSize: 13.5, color: "var(--muted)" }}>
            Build and manage high-converting lead capture forms for your landing pages and property widgets.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => refresh()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10 }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>

          {canCreate ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={createForm}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 10,
              fontWeight: 700,
              padding: "9px 18px",
            }}
          >
            <Plus size={16} /> Create New Form
          </button>
          ) : null}
        </div>
      </div>

      {/* Metric Counters Banner */}
      <Reveal delay={1}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {/* Card: Total */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Total Forms</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                <CountUp value={forms.length} />
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--brand-050)",
                color: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={18} />
            </div>
          </div>

          {/* Card: Active */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              borderColor: filter === "active" ? "var(--green)" : "var(--line-2)",
            }}
            onClick={() => setFilter(filter === "active" ? "all" : "active")}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Active Forms</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green)", marginTop: 2 }}>
                <CountUp value={activeCount} />
              </div>
            </div>
            <span className="badge b-green" style={{ fontWeight: 700 }}>
              Live
            </span>
          </div>

          {/* Card: Multi-Step */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              borderColor: typeFilter === "multi" ? "var(--violet)" : "var(--line-2)",
            }}
            onClick={() => setTypeFilter(typeFilter === "multi" ? "all" : "multi")}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Multi-Step</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--violet)", marginTop: 2 }}>
                <CountUp value={multiStepCount} />
              </div>
            </div>
            <span className="badge b-violet" style={{ fontWeight: 700 }}>
              Multi-Step
            </span>
          </div>

          {/* Card: Fields */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Total Fields</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                <CountUp value={totalFields} />
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--surface-2)",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers size={18} />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Floating & Sticky Control Toolbar */}
      <div
        style={{
          position: "sticky",
          top: 12,
          zIndex: 30,
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid var(--line-2)",
          borderRadius: 16,
          padding: "12px 16px",
          boxShadow: "0 10px 28px -10px rgba(14, 21, 37, 0.08), 0 2px 6px rgba(14, 21, 37, 0.03)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Search input */}
        <div style={{ position: "relative", minWidth: 240, maxWidth: 360, flex: 1 }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search forms by name, field label, ID, CSS…"
            style={{
              paddingLeft: 36,
              paddingRight: q ? 32 : 12,
              height: 38,
              borderRadius: 10,
              fontSize: 13,
              width: "100%",
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--muted)",
                padding: 2,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Segmented Pills */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--surface-2, #f8fafc)",
            padding: 3,
            borderRadius: 10,
            border: "1px solid var(--line-2)",
          }}
        >
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={{
              border: "none",
              background: filter === "all" ? "var(--surface)" : "transparent",
              color: filter === "all" ? "var(--ink)" : "var(--muted)",
              fontWeight: filter === "all" ? 700 : 500,
              fontSize: 12.5,
              padding: "6px 12px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: filter === "all" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            All ({forms.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            style={{
              border: "none",
              background: filter === "active" ? "var(--surface)" : "transparent",
              color: filter === "active" ? "var(--ink)" : "var(--muted)",
              fontWeight: filter === "active" ? 700 : 500,
              fontSize: 12.5,
              padding: "6px 12px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: filter === "active" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("disabled")}
            style={{
              border: "none",
              background: filter === "disabled" ? "var(--surface)" : "transparent",
              color: filter === "disabled" ? "var(--ink)" : "var(--muted)",
              fontWeight: filter === "disabled" ? 700 : 500,
              fontSize: 12.5,
              padding: "6px 12px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: filter === "disabled" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Disabled ({forms.length - activeCount})
          </button>
        </div>

        {/* View Switcher */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--surface-2, #f8fafc)",
            padding: 3,
            borderRadius: 10,
            border: "1px solid var(--line-2)",
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            title="Visual Cards View"
            style={{
              border: "none",
              background: viewMode === "grid" ? "var(--surface)" : "transparent",
              color: viewMode === "grid" ? "var(--ink)" : "var(--muted)",
              padding: "6px 10px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: viewMode === "grid" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <Grid size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            title="Data Table View"
            style={{
              border: "none",
              background: viewMode === "table" ? "var(--surface)" : "transparent",
              color: viewMode === "table" ? "var(--ink)" : "var(--muted)",
              padding: "6px 10px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: viewMode === "table" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <div>Loading form definitions…</div>
        </div>
      ) : loadError ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ color: "var(--rose)", fontWeight: 600 }}>{loadError}</div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => refresh()}
            style={{ marginTop: 12 }}
          >
            Try Again
          </button>
        </div>
      ) : visible.length === 0 ? (
        /* Empty State */
        <div
          style={{
            background: "linear-gradient(135deg, rgba(21, 27, 46, 0.08) 0%, rgba(124, 58, 237, 0.04) 100%)",
            border: "1px solid var(--brand-100, #e0e3fd)",
            borderRadius: 20,
            padding: "48px 32px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "var(--brand)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px -4px rgba(21, 27, 46, 0.4)",
              marginBottom: 16,
            }}
          >
            <FormInput size={28} />
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", margin: "0 0 8px" }}>
            {q ? "No matching lead forms" : "Create Your First Lead Capture Form"}
          </h2>
          <p style={{ maxWidth: 540, fontSize: 14, color: "var(--ink-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
            {q
              ? "Try clearing your search query or switching filters to view all forms."
              : "Generate high-converting lead forms for site visits, brochure downloads, and VIP reservations."}
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {q ? (
              <button type="button" className="btn btn-ghost" onClick={() => setQ("")}>
                Clear Search
              </button>
            ) : canCreate ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={createForm}
                style={{
                  padding: "10px 22px",
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 12,
                  boxShadow: "0 4px 14px rgba(21, 27, 46, 0.35)",
                }}
              >
                <Plus size={16} /> Create New Form
              </button>
            ) : null}
          </div>
        </div>
      ) : viewMode === "table" ? (
        /* Structured Data Table View */
        <div className="card" style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Form Title &amp; Description</th>
                  <th>Form ID</th>
                  <th>Type &amp; Fields</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((form) => (
                  <tr key={form.backendId}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: form.enabled === false ? "var(--muted)" : "#10b981",
                            flexShrink: 0,
                          }}
                        />
                        <Link
                          href={`/org/forms/${form.backendId}`}
                          style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}
                        >
                          {form.name || "Untitled form"}
                        </Link>
                      </div>
                      {form.description && (
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, paddingLeft: 16 }}>
                          {form.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className="badge b-gray"
                        style={{
                          fontFamily: "var(--font-mono), monospace",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                        onClick={() => copySnippet(form.embed?.id || form.id, form.backendId)}
                        title="Click to copy ID"
                      >
                        {form.embed?.id || form.id}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {form.multiStep ? (
                          <span className="badge b-violet" style={{ fontWeight: 600 }}>
                            Multi-Step
                          </span>
                        ) : (
                          <span className="badge b-gray" style={{ fontWeight: 600 }}>
                            Standard
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          {form.fields?.length ?? 0} fields
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${form.enabled === false ? "b-gray" : "b-green"}`}>
                        <span className="dot" style={{ background: "currentColor" }} />
                        {form.enabled === false ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{formatWhen(form.createdAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        {canEdit ? (
                        <Link
                          href={`/org/forms/${form.backendId}`}
                          className="btn btn-soft btn-sm"
                        >
                          <Pencil size={12} /> Edit
                        </Link>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEmbedFor(form)}
                          title="Embed Code"
                        >
                          <Code2 size={13} /> Embed
                        </button>
                        <Link
                          href={`/org/forms/${form.backendId}?preview=1`}
                          className="btn btn-ghost btn-sm"
                          title="Preview"
                        >
                          <Eye size={13} />
                        </Link>
                        {canCreate ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Duplicate"
                          disabled={busy}
                          onClick={() => duplicate(form.backendId)}
                        >
                          <Copy size={13} />
                        </button>
                        ) : null}
                        {canDelete ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Delete"
                          style={{ color: "var(--rose)" }}
                          disabled={busy}
                          onClick={() => setDeleteFor(form)}
                        >
                          <Trash2 size={13} />
                        </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Visual Form Cards Showcase Grid */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))",
            gap: 20,
          }}
        >
          {paged.pageRows.map((form) => (
            <OrgVisualFormCard
              key={form.backendId}
              form={form}
              onEmbed={() => setEmbedFor(form)}
              onDuplicate={canCreate ? () => duplicate(form.backendId) : undefined}
              onDelete={canDelete ? () => setDeleteFor(form) : undefined}
              canEdit={canEdit}
              onCopyId={() => copySnippet(form.embed?.id || form.id, form.backendId)}
            />
          ))}
        </div>
      )}
      <ListPager page={paged.page} total={paged.total} onPageChange={paged.setPage} noun="forms" />

      {/* Embed Modal */}
      <Modal
        open={!!embedFor}
        onClose={() => setEmbedFor(null)}
        title={embedFor ? `Embed “${embedFor.name}”` : "Embed Form"}
        description="Drop this lead form on any landing page or external website."
        size="lg"
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setEmbedFor(null)}>
            Done
          </button>
        }
      >
        {embedFor && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Tab switcher */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--surface-2, #f8fafc)",
                padding: 3,
                borderRadius: 10,
                border: "1px solid var(--line-2)",
              }}
            >
              {[
                { id: "html", label: "HTML Script Tag" },
                { id: "iframe", label: "iFrame Code" },
                { id: "shortcode", label: "React Shortcode" },
                { id: "id", label: "Embed ID Only" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEmbedTab(tab.id as any)}
                  style={{
                    border: "none",
                    background: embedTab === tab.id ? "var(--surface)" : "transparent",
                    color: embedTab === tab.id ? "var(--ink)" : "var(--muted)",
                    fontWeight: embedTab === tab.id ? 700 : 500,
                    fontSize: 12.5,
                    padding: "6px 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    boxShadow: embedTab === tab.id ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Snippet box */}
            <div
              style={{
                background: "#0f172a",
                borderRadius: 12,
                padding: 16,
                position: "relative",
              }}
            >
              <pre
                style={{
                  margin: 0,
                  color: "#38bdf8",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 160,
                  overflowY: "auto",
                }}
              >
                {embedTab === "html"
                  ? embedSnippet(embedFor.embed?.id || embedFor.id)
                  : embedTab === "iframe"
                    ? iframeSnippet(embedFor.embed?.id || embedFor.id)
                    : embedTab === "shortcode"
                      ? shortcodeSnippet(embedFor.embed?.id || embedFor.id)
                      : embedFor.embed?.id || embedFor.id}
              </pre>

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const text =
                    embedTab === "html"
                      ? embedSnippet(embedFor.embed?.id || embedFor.id)
                      : embedTab === "iframe"
                        ? iframeSnippet(embedFor.embed?.id || embedFor.id)
                        : embedTab === "shortcode"
                          ? shortcodeSnippet(embedFor.embed?.id || embedFor.id)
                          : embedFor.embed?.id || embedFor.id;
                  copySnippet(text, "modal-snippet");
                }}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "rgba(255,255,255,0.15)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {copiedKey === "modal-snippet" ? <Check size={13} /> : <Copy size={13} />}
                {copiedKey === "modal-snippet" ? "Copied" : "Copy Code"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Delete */}
      <ConfirmModal
        open={!!deleteFor}
        title="Delete Lead Form?"
        message={deleteFor ? `Are you sure you want to delete "${deleteFor.name}"? Any landing pages relying on this embed ID will stop capturing leads.` : undefined}
        confirmLabel="Delete Form"
        destructive
        onConfirm={() => deleteFor && remove(deleteFor)}
        onClose={() => setDeleteFor(null)}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}>
          <div
            style={{
              background: "#0e1525",
              color: "#fff",
              padding: "10px 18px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} style={{ color: "#10b981" }} />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* Modern Visual Card for Org Lead Forms */
function OrgVisualFormCard({
  form,
  onEmbed,
  onDuplicate,
  onDelete,
  onCopyId,
  canEdit,
}: {
  form: BackedForm;
  onEmbed: () => void;
  // Omitted handlers hide their menu item (the user lacks that permission).
  onDuplicate?: () => void;
  onDelete?: () => void;
  onCopyId: () => void;
  canEdit: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = form.enabled !== false;
  const fields = form.fields ?? [];

  return (
    <div
      className="card form-visual-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setMenuOpen(false);
      }}
      style={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 18,
        overflow: "hidden",
        border: hovered ? "1px solid var(--brand-100, #c7d2fe)" : "1px solid var(--line-2)",
        boxShadow: hovered
          ? "0 14px 34px -10px rgba(21, 27, 46, 0.16), 0 4px 14px -4px rgba(14, 21, 37, 0.08)"
          : "0 2px 8px -2px rgba(14, 21, 37, 0.05)",
        transform: hovered ? "translateY(-4px)" : "none",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        background: "var(--surface)",
        position: "relative",
      }}
    >
      {/* Top Banner / ID Bar */}
      <div
        style={{
          padding: "14px 18px",
          background: "var(--surface-2, #f8fafc)",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isActive ? "#10b981" : "var(--muted)",
            }}
          />
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: isActive ? "var(--green)" : "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {isActive ? "Active" : "Disabled"}
          </span>

          {form.multiStep && (
            <span
              className="badge b-violet"
              style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px" }}
            >
              Multi-Step
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onCopyId}
          title="Click to copy Form ID"
          style={{
            border: "1px solid var(--line-2)",
            background: "var(--surface)",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 11,
            fontFamily: "var(--font-mono), monospace",
            color: "var(--brand)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>{form.embed?.id || form.id}</span>
          <Copy size={11} />
        </button>
      </div>

      {/* Card Content & Blueprint Preview */}
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div>
          <Link
            href={`/org/forms/${form.backendId}`}
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "var(--ink)",
              lineHeight: 1.3,
              display: "block",
            }}
          >
            {form.name || "Untitled form"}
          </Link>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--muted)",
              marginTop: 4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.45,
              minHeight: 36,
            }}
          >
            {form.description || "Lead capture form blueprint."}
          </div>
        </div>

        {/* Blueprint Field Chips Container */}
        <div
          style={{
            background: "var(--surface-2, #f8fafc)",
            border: "1px dashed var(--line-2)",
            borderRadius: 12,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
              Field Schema ({fields.length})
            </span>
            <span style={{ fontSize: 11, color: "var(--faint)" }}>
              {formatWhen(form.createdAt)}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 68, overflow: "hidden" }}>
            {fields.length === 0 ? (
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>No fields defined yet</span>
            ) : (
              fields.slice(0, 4).map((fld, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: "var(--surface)",
                    border: "1px solid var(--line-2)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    color: "var(--ink-2)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ color: "var(--brand)" }}>●</span>
                  {fld.label || fld.type}
                  {fld.required && <span style={{ color: "var(--rose)" }}>*</span>}
                </span>
              ))
            )}
            {fields.length > 4 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  background: "var(--brand-050)",
                  color: "var(--brand)",
                  padding: "3px 8px",
                  borderRadius: 6,
                }}
              >
                +{fields.length - 4} more
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: "auto",
            paddingTop: 10,
            borderTop: "1px solid var(--line)",
            alignItems: "center",
          }}
        >
          {canEdit ? (
          <Link
            href={`/org/forms/${form.backendId}`}
            className="btn btn-soft btn-sm"
            style={{
              flex: 1,
              justifyContent: "center",
              fontWeight: 700,
              borderRadius: 9,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Pencil size={13} /> Edit Builder
          </Link>
          ) : null}

          <Link
            href={`/org/forms/${form.backendId}?preview=1`}
            className="btn btn-ghost btn-sm"
            style={{
              padding: "7px 10px",
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
            title="Preview Form"
          >
            <Eye size={14} />
          </Link>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onEmbed}
            style={{
              padding: "7px 10px",
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
            title="Get Embed Code"
          >
            <Code2 size={14} />
          </button>

          {/* More menu — only when there is something in it */}
          {onDuplicate || onDelete ? (
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ padding: "7px 8px", borderRadius: 8 }}
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  right: 0,
                  marginBottom: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 12,
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
                  zIndex: 50,
                  minWidth: 150,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {onDuplicate ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate();
                    }}
                    style={{ justifyContent: "flex-start", gap: 8, fontSize: 12 }}
                  >
                    <Copy size={13} /> Duplicate
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    style={{ justifyContent: "flex-start", gap: 8, fontSize: 12, color: "var(--rose)" }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                ) : null}
              </div>
            )}
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}