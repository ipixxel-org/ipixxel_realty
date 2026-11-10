"use client";

import { useMemo, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";
import {
  AlignLeft,
  ArrowLeft,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock,
  Code,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Hash,
  Heading,
  Layers,
  Mail,
  MapPin,
  Monitor,
  Phone,
  Plus,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Type,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { DynamicLeadForm } from "@/components/openpage/dynamic-lead-form";
import { FIELD_LOGIC_ACTIONS, FIELD_LOGIC_OPS } from "@/lib/openpage/form-logic";
import { defaultField, FIELD_TYPE_HINT, FIELD_TYPE_LABEL, PALETTE_TYPES } from "@/lib/openpage/form-fields";
import type { FormDefinition } from "@/lib/openpage/forms-store";
import type { FieldLogic, FormFieldType, FormLeadField } from "@/lib/openpage/types";

function slugKey(label: string) {
  const s = label.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ");
  const [a, ...rest] = s;
  return (a || "field").toLowerCase() + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

interface PaletteEntry {
  type: FormFieldType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  bg: string;
  fg: string;
}

const PALETTE_GROUPS: { title: string; items: PaletteEntry[] }[] = [
  {
    title: "Standard Fields",
    items: [
      { type: "text", label: "Text", hint: "Single line input", icon: Type, bg: "#eff6ff", fg: "#2563eb" },
      { type: "name", label: "Full Name", hint: "Lead / Contact name", icon: User, bg: "#eef2ff", fg: "#0f1424" },
      { type: "email", label: "Email", hint: "Verified email address", icon: Mail, bg: "#faf5ff", fg: "#7c3aed" },
      { type: "phone", label: "Phone", hint: "Mobile / WhatsApp", icon: Phone, bg: "#ecfdf5", fg: "#059669" },
      { type: "number", label: "Number", hint: "Numeric amount / age", icon: Hash, bg: "#fffbeb", fg: "#d97706" },
      { type: "textarea", label: "Paragraph", hint: "Multi-line notes / query", icon: AlignLeft, bg: "#f0f9ff", fg: "#0284c7" },
    ],
  },
  {
    title: "Options & Choice",
    items: [
      { type: "select", label: "Dropdown", hint: "Single pick list", icon: ChevronDown, bg: "#f5f3ff", fg: "#8b5cf6" },
      { type: "radio", label: "Radio Choice", hint: "Single selectable option", icon: CircleDot, bg: "#fff7ed", fg: "#ea580c" },
      { type: "checkbox", label: "Checkbox", hint: "Multi-choice or switch", icon: CheckSquare, bg: "#f0fdf4", fg: "#16a34a" },
    ],
  },
  {
    title: "Date & Attachments",
    items: [
      { type: "date", label: "Date", hint: "Calendar date picker", icon: Calendar, bg: "#fff1f2", fg: "#e11d48" },
      { type: "datetime", label: "Date & Time", hint: "Tour / Visit booking", icon: Clock, bg: "#fdf2f8", fg: "#db2777" },
      { type: "file", label: "File Upload", hint: "Identity / Document", icon: UploadCloud, bg: "#eff6ff", fg: "#1d4ed8" },
      { type: "address", label: "Address", hint: "Location / City / Pincode", icon: MapPin, bg: "#ecfdf5", fg: "#047857" },
    ],
  },
  {
    title: "Structure & Security",
    items: [
      { type: "heading", label: "Heading", hint: "Section separator", icon: Heading, bg: "#f8fafc", fg: "#334155" },
      { type: "html", label: "Custom HTML", hint: "Raw markup / Embed", icon: Code, bg: "#f8fafc", fg: "#334155" },
      { type: "consent", label: "Consent", hint: "Terms & GDPR check", icon: ShieldCheck, bg: "#ecfeff", fg: "#0891b2" },
      { type: "captcha", label: "CAPTCHA", hint: "Spam bot prevention", icon: Shield, bg: "#f1f5f9", fg: "#475569" },
      { type: "hidden", label: "Hidden Field", hint: "URL / Campaign tracking", icon: EyeOff, bg: "#f8fafc", fg: "#64748b" },
      { type: "submit", label: "Submit Button", hint: "Action button", icon: Send, bg: "#eef2ff", fg: "#0f1424" },
    ],
  },
];

export interface FormDesignerProps {
  form: FormDefinition;
  onChange: (next: FormDefinition) => void;
  onSave: () => void;
  backHref?: string;
  backLabel?: string;
  isSaving?: boolean;
}

export function FormDesigner({
  form,
  onChange,
  onSave,
  backHref = "/admin-console/forms",
  backLabel = "Back to Forms",
  isSaving = false,
}: FormDesignerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(form.fields[0]?.id ?? null);
  const [rightTab, setRightTab] = useState<"field" | "logic" | "form">("field");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(false);
  const [stepFilter, setStepFilter] = useState<number | "all">("all");
  const [paletteSearch, setPaletteSearch] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);

  const selected = form.fields.find((f) => f.id === selectedId) ?? null;
  const stepCount = Math.max(1, form.stepCount ?? 1, ...form.fields.map((f) => (f.step ?? 0) + 1));

  const canvasFields = useMemo(() => {
    if (!form.multiStep || stepFilter === "all") return form.fields;
    return form.fields.filter((f) => (f.step ?? 0) === stepFilter);
  }, [form.fields, form.multiStep, stepFilter]);

  function patch(partial: Partial<FormDefinition>) {
    onChange({ ...form, ...partial, updatedAt: new Date().toISOString() });
  }

  function patchField(id: string, next: FormLeadField) {
    onChange({
      ...form,
      fields: form.fields.map((f) => (f.id === id ? next : f)),
      updatedAt: new Date().toISOString(),
    });
  }

  function addField(type: FormFieldType) {
    const field = defaultField(type);
    if (form.multiStep && stepFilter !== "all") field.step = stepFilter;
    onChange({ ...form, fields: [...form.fields, field], updatedAt: new Date().toISOString() });
    setSelectedId(field.id);
    setRightTab("field");
    toast.success(`Added ${FIELD_TYPE_LABEL[type]} field`);
  }

  function duplicateField(id: string) {
    const idx = form.fields.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const orig = form.fields[idx];
    const copy: FormLeadField = {
      ...JSON.parse(JSON.stringify(orig)),
      id: `fld_${Math.random().toString(36).slice(2, 9)}`,
      label: `${orig.label} (Copy)`,
    };
    const nextFields = [...form.fields];
    nextFields.splice(idx + 1, 0, copy);
    onChange({ ...form, fields: nextFields, updatedAt: new Date().toISOString() });
    setSelectedId(copy.id);
    setRightTab("field");
    toast.success("Field duplicated");
  }

  function moveField(id: string, dir: -1 | 1) {
    const idx = form.fields.findIndex((f) => f.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= form.fields.length) return;
    const fields = [...form.fields];
    const [item] = fields.splice(idx, 1);
    fields.splice(next, 0, item);
    onChange({ ...form, fields, updatedAt: new Date().toISOString() });
  }

  function removeField(id: string) {
    const fields = form.fields.filter((f) => f.id !== id);
    onChange({ ...form, fields, updatedAt: new Date().toISOString() });
    if (selectedId === id) setSelectedId(fields[0]?.id ?? null);
    toast.info("Field removed");
  }

  function addStep() {
    patch({ multiStep: true, stepCount: stepCount + 1, progressBar: form.progressBar !== false });
    toast.success(`Step ${stepCount + 1} added`);
  }

  function copyKeyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    toast.success("Copied variable key");
  }

  function logicFor(field: FormLeadField): FieldLogic {
    return field.logic ?? { enabled: false, match: "all", rules: [], action: "show" };
  }

  const filteredPaletteGroups = useMemo(() => {
    if (!paletteSearch.trim()) return PALETTE_GROUPS;
    const q = paletteSearch.toLowerCase();
    return PALETTE_GROUPS.map((grp) => ({
      ...grp,
      items: grp.items.filter(
        (it) => it.label.toLowerCase().includes(q) || it.hint.toLowerCase().includes(q) || it.type.toLowerCase().includes(q)
      ),
    })).filter((grp) => grp.items.length > 0);
  }, [paletteSearch]);

  return (
    <div className="fb-cms">
      {/* Studio Sticky Header */}
      <div className="fb-studio-topbar">
        <div className="fb-topbar-left">
          <Link href={backHref} className="fb-back-link">
            <ArrowLeft size={14} />
            <span>{backLabel}</span>
          </Link>
          <div className="fb-topbar-divider" />
          <div className="fb-title-wrap">
            <div className="fb-title-row">
              <input
                className="fb-title-input"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Untitled Form"
                title="Click to edit form title"
              />
              <div className="fb-meta-pills">
                <span className="fb-count-badge">
                  <Layers size={12} />
                  {form.fields.length} Fields
                </span>
                <button
                  type="button"
                  className={`fb-status-pill ${form.enabled === false ? "is-off" : ""}`}
                  onClick={() => patch({ enabled: form.enabled === false ? true : false })}
                  title="Click to toggle status"
                >
                  <span className="fb-status-dot" />
                  <span>{form.enabled === false ? "Disabled" : "Active & receiving leads"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="fb-topbar-actions">
          <div className="fb-devices-toggle">
            <button
              type="button"
              className={device === "desktop" ? "is-on" : ""}
              onClick={() => setDevice("desktop")}
              title="Desktop preview"
            >
              <Monitor size={14} />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              className={device === "mobile" ? "is-on" : ""}
              onClick={() => setDevice("mobile")}
              title="Mobile device mockup"
            >
              <Smartphone size={14} />
              <span>Mobile</span>
            </button>
          </div>

          <button
            type="button"
            className="fb-btn-preview"
            onClick={() => setShowPreview(true)}
            title="Open real form simulation"
          >
            <Eye size={14} />
            <span>Full Preview</span>
          </button>

          <button
            type="button"
            className="fb-btn-save"
            onClick={() => {
              onSave();
              toast.success("Form saved successfully");
            }}
            disabled={isSaving}
          >
            <Save size={14} />
            <span>{isSaving ? "Saving…" : "Save Form"}</span>
          </button>
        </div>
      </div>

      {/* 3-Column Studio Grid */}
      <div className="fb-grid">
        {/* LEFT COLUMN: Steps & Component Palette */}
        <aside className="fb-col">
          {/* Quick Nav to Settings */}
          <button
            type="button"
            className="fb-quick-nav-btn"
            onClick={() => setRightTab("form")}
          >
            <div>
              <strong>Form Settings & Rules</strong>
              <span>Notifications, redirects & integrations</span>
            </div>
            <Settings size={16} className="text-slate-400" />
          </button>

          {/* Form Steps Manager */}
          <div className="fb-card">
            <div className="fb-card-h">
              <span>Form Steps & Flow</span>
              <label className="fb-toggle">
                <input
                  type="checkbox"
                  checked={form.multiStep}
                  onChange={(e) =>
                    patch({
                      multiStep: e.target.checked,
                      stepCount: Math.max(2, form.stepCount ?? 2),
                    })
                  }
                />
                <span className="fb-toggle-slider" />
              </label>
            </div>

            <button
              type="button"
              className={`fb-step-btn ${stepFilter === "all" ? "is-on" : ""}`}
              onClick={() => setStepFilter("all")}
            >
              <span>Show All Fields</span>
              <b>{form.fields.length}</b>
            </button>

            {form.multiStep
              ? Array.from({ length: stepCount }, (_, i) => {
                const count = form.fields.filter((f) => (f.step ?? 0) === i).length;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`fb-step-btn ${stepFilter === i ? "is-on" : ""}`}
                    onClick={() => setStepFilter(i)}
                  >
                    <span>Step {i + 1}</span>
                    <b>{count} fields</b>
                  </button>
                );
              })
              : null}

            {form.multiStep && (
              <button type="button" className="fb-add-step" onClick={addStep}>
                <Plus size={13} />
                <span>Add Next Step</span>
              </button>
            )}
          </div>

          {/* Component Palette */}
          <div className="fb-card">
            <div className="fb-card-h">
              <span>Component Palette</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Click to add</span>
            </div>

            {/* Filter / Search input */}
            <div className="fb-palette-search">
              <Search size={13} />
              <input
                type="text"
                placeholder="Filter components…"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
              />
            </div>

            {filteredPaletteGroups.map((group) => (
              <div key={group.title} className="fb-palette-cat">
                <div className="fb-palette-cat-title">
                  <span>{group.title}</span>
                </div>
                <div className="fb-palette-grid">
                  {group.items.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        className="fb-palette-item"
                        onClick={() => addField(item.type)}
                      >
                        <div
                          className="fb-palette-icon-box"
                          style={{ background: item.bg, color: item.fg }}
                        >
                          <IconComp size={14} />
                        </div>
                        <div className="fb-palette-text">
                          <strong>{item.label}</strong>
                          <span>{item.hint}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER COLUMN: Live Form Canvas */}
        <section className="fb-canvas-wrap">
          <div className="fb-canvas-h">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={14} style={{ color: "var(--brand)" }} />
              <span>
                Interactive Canvas · {canvasFields.length} of {form.fields.length} Fields Active
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {device === "mobile" ? "Mobile View (375px)" : "Desktop View"}
            </span>
          </div>

          <div className="fb-canvas-body">
            <div className={device === "mobile" ? "fb-frame-mobile" : "fb-frame-desktop"}>
              {device === "mobile" && <div className="fb-phone-notch" />}

              {/* Form Header Banner (Click to edit) */}
              <div
                className="fb-form-head-card"
                onClick={() => setRightTab("form")}
                title="Click to configure form title, description & redirects"
              >
                <div className="fb-form-head-tag">
                  <SlidersHorizontal size={11} />
                  <span>Form Header (Click to edit)</span>
                </div>
                <h3>{form.name || "Untitled Lead Form"}</h3>
                <p>{form.description || "Capture enquiries and automatically push leads to your CRM."}</p>
              </div>

              {/* Canvas Fields */}
              {canvasFields.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                  <Plus size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ fontWeight: 700, margin: "0 0 4px", color: "var(--ink)" }}>No fields in this step yet</p>
                  <p style={{ fontSize: 12, margin: 0 }}>
                    Select any input element from the left Component Palette to add it here.
                  </p>
                </div>
              ) : (
                canvasFields.map((field) => {
                  const isSelected = selectedId === field.id;
                  return (
                    <div
                      key={field.id}
                      className={`fb-canvas-field ${isSelected ? "is-on" : ""}`}
                      onClick={() => {
                        setSelectedId(field.id);
                        setRightTab("field");
                      }}
                    >
                      <div className="fb-field-topbar">
                        <div className="fb-field-badge-group">
                          <span className="fb-field-type-pill">{field.type.toUpperCase()}</span>
                          <span className="fb-field-key-chip">{slugKey(field.label)}</span>
                          {field.required && (
                            <span style={{ fontSize: 10, color: "#e11d48", fontWeight: 700 }}>Required</span>
                          )}
                        </div>

                        <div className="fb-field-action-bar" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="fb-field-tool-btn"
                            title="Move Up"
                            onClick={() => moveField(field.id, -1)}
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="fb-field-tool-btn"
                            title="Move Down"
                            onClick={() => moveField(field.id, 1)}
                          >
                            <ChevronDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="fb-field-tool-btn"
                            title="Duplicate Field"
                            onClick={() => duplicateField(field.id)}
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            className="fb-field-tool-btn danger"
                            title="Delete Field"
                            onClick={() => removeField(field.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Realistic Field Preview */}
                      {field.type !== "checkbox" &&
                        field.type !== "consent" &&
                        field.type !== "heading" &&
                        field.type !== "html" &&
                        field.type !== "submit" ? (
                        <label>
                          {field.label}
                          {field.required ? <span className="fb-req-star"> *</span> : null}
                        </label>
                      ) : null}

                      {field.type === "select" ? (
                        <select className="fb-mock-input" disabled defaultValue="">
                          <option>{field.placeholder || "Choose an option…"}</option>
                        </select>
                      ) : field.type === "textarea" || field.type === "address" ? (
                        <textarea
                          className="fb-mock-textarea"
                          disabled
                          placeholder={field.placeholder || "Type here…"}
                        />
                      ) : field.type === "checkbox" || field.type === "consent" ? (
                        <label className="fb-mock-option-row" style={{ cursor: "pointer" }}>
                          <input type="checkbox" disabled style={{ width: "auto" }} />
                          <span>
                            {field.label}
                            {field.required ? <span className="fb-req-star"> *</span> : null}
                          </span>
                        </label>
                      ) : field.type === "heading" ? (
                        <div style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 6, margin: "6px 0" }}>
                          <strong style={{ fontSize: 15, color: "var(--ink)" }}>{field.label}</strong>
                        </div>
                      ) : field.type === "html" ? (
                        <div
                          style={{ padding: "8px 10px", background: "#f8fafc", borderRadius: 8, fontSize: 12 }}
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(field.html || "<p>Custom HTML Block</p>") }}
                        />
                      ) : field.type === "radio" ? (
                        <div className="fb-mock-options">
                          {(field.options ?? ["Option 1", "Option 2"]).map((o) => (
                            <label key={o} className="fb-mock-option-row">
                              <input type="radio" disabled style={{ width: "auto" }} />
                              <span>{o}</span>
                            </label>
                          ))}
                        </div>
                      ) : field.type === "file" ? (
                        <div
                          style={{
                            border: "1px dashed #cbd5e1",
                            padding: "14px",
                            textAlign: "center",
                            borderRadius: 10,
                            background: "#f8fafc",
                          }}
                        >
                          <UploadCloud size={20} style={{ margin: "0 auto 4px", color: "var(--muted)" }} />
                          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                            {field.placeholder || "Click or drag documents to upload"}
                          </span>
                        </div>
                      ) : field.type === "captcha" ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            background: "#f8fafc",
                          }}
                        >
                          <input type="checkbox" disabled style={{ width: "auto" }} />
                          <span style={{ fontSize: 12, fontWeight: 600 }}>I&apos;m not a robot</span>
                          <Shield size={16} style={{ marginLeft: 8, color: "#64748b" }} />
                        </div>
                      ) : field.type === "submit" ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ width: "100%", pointerEvents: "none", marginTop: 4 }}
                        >
                          {form.submitLabel || "Submit Enquiry"}
                        </button>
                      ) : (
                        <input
                          className="fb-mock-input"
                          disabled
                          placeholder={field.placeholder || `e.g. Enter ${field.label.toLowerCase()}`}
                        />
                      )}

                      {field.helpText ? <div className="fb-mock-help">{field.helpText}</div> : null}
                    </div>
                  );
                })
              )}

              {/* Dropzone notice at bottom of form */}
              <div className="fb-canvas-footer">
                <span>+ Select any component from the left palette to add more fields</span>
              </div>

              {device === "mobile" && <div className="fb-phone-bar" />}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Inspector Panel (Tabs) */}
        <aside className="fb-col">
          <div className="fb-tabs">
            <button
              type="button"
              className={rightTab === "field" ? "is-on" : ""}
              onClick={() => setRightTab("field")}
            >
              <SlidersHorizontal size={13} />
              <span>Field Properties</span>
            </button>
            <button
              type="button"
              className={rightTab === "logic" ? "is-on" : ""}
              onClick={() => setRightTab("logic")}
            >
              <GitBranch size={13} />
              <span>Conditions</span>
            </button>
            <button
              type="button"
              className={rightTab === "form" ? "is-on" : ""}
              onClick={() => setRightTab("form")}
            >
              <Settings size={13} />
              <span>Form Settings</span>
            </button>
          </div>

          {/* TAB 1: Field Properties */}
          {rightTab === "field" && selected ? (
            <div className="fb-card">
              <div className="fb-props">
                <div className="fb-prop-header">
                  <div>
                    <span className="fb-prop-header-tag">Field Inspector</span>
                    <h4 style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 800 }}>
                      {FIELD_TYPE_LABEL[selected.type as FormFieldType] || selected.type}
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="fb-field-tool-btn danger"
                    title="Delete this field"
                    onClick={() => removeField(selected.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="fb-prop-group">
                  <label>Field Label *</label>
                  <input
                    value={selected.label}
                    onChange={(e) => patchField(selected.id, { ...selected, label: e.target.value })}
                    placeholder="Field label"
                  />
                </div>

                <div className="fb-prop-group">
                  <label>Variable Name (Field Key)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={slugKey(selected.label)} readOnly style={{ background: "#f8fafc" }} />
                    <button
                      type="button"
                      className="fb-btn-preview"
                      onClick={() => copyKeyToClipboard(slugKey(selected.label))}
                      title="Copy variable key"
                    >
                      {copiedKey ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                <div className="fb-prop-group">
                  <label>Input Type</label>
                  <select
                    value={selected.type}
                    onChange={(e) => patchField(selected.id, { ...selected, type: e.target.value as FormFieldType })}
                  >
                    {PALETTE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>

                {form.multiStep && (
                  <div className="fb-prop-group">
                    <label>Assign to Step</label>
                    <select
                      value={String(selected.step ?? 0)}
                      onChange={(e) => patchField(selected.id, { ...selected, step: Number(e.target.value) })}
                    >
                      {Array.from({ length: stepCount }, (_, i) => (
                        <option key={i} value={i}>
                          Step {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="fb-prop-group">
                  <label>Placeholder Text</label>
                  <input
                    value={selected.placeholder ?? ""}
                    onChange={(e) => patchField(selected.id, { ...selected, placeholder: e.target.value })}
                    placeholder="e.g. Enter value…"
                  />
                </div>

                {/* Required Toggle */}
                <label className="fb-switch-row">
                  <span>Required / Mandatory Field</span>
                  <input
                    type="checkbox"
                    checked={selected.required}
                    onChange={(e) => patchField(selected.id, { ...selected, required: e.target.checked })}
                    style={{ width: "auto" }}
                  />
                </label>

                {/* Options list for select, radio, checkbox */}
                {(selected.type === "select" || selected.type === "radio" || selected.type === "checkbox") && (
                  <div className="fb-prop-group">
                    <label>Options (one item per line)</label>
                    <textarea
                      rows={4}
                      value={(selected.options ?? []).join("\n")}
                      onChange={(e) =>
                        patchField(selected.id, {
                          ...selected,
                          options: e.target.value.split("\n"),
                        })
                      }
                      placeholder="Option 1&#10;Option 2&#10;Option 3"
                    />
                  </div>
                )}

                {/* HTML content */}
                {selected.type === "html" && (
                  <div className="fb-prop-group">
                    <label>Custom HTML Markup</label>
                    <textarea
                      rows={4}
                      value={selected.html ?? ""}
                      onChange={(e) => patchField(selected.id, { ...selected, html: e.target.value })}
                      placeholder="<p>Enter HTML here…</p>"
                    />
                  </div>
                )}

                {/* Advanced Attributes */}
                <div className="fb-section-divider">Styling & Tracking</div>

                <div className="fb-prop-group">
                  <label>Help Text / Hint</label>
                  <input
                    value={selected.helpText ?? ""}
                    onChange={(e) => patchField(selected.id, { ...selected, helpText: e.target.value })}
                    placeholder="Displayed beneath the input"
                  />
                </div>

                <div className="fb-prop-group">
                  <label>Custom CSS / Column Class</label>
                  <input
                    value={selected.cssClass ?? ""}
                    onChange={(e) => patchField(selected.id, { ...selected, cssClass: e.target.value })}
                    placeholder="e.g. col-span-2 or w-1/2"
                  />
                </div>

                <div className="fb-prop-group">
                  <label>URL Parameter Auto-fill</label>
                  <input
                    value={selected.queryParam ?? ""}
                    onChange={(e) => patchField(selected.id, { ...selected, queryParam: e.target.value })}
                    placeholder="e.g. utm_campaign or source"
                  />
                </div>
              </div>
            </div>
          ) : rightTab === "field" ? (
            <div className="fb-card" style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>
              <SlidersHorizontal size={24} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
              <p style={{ fontWeight: 700, margin: "0 0 4px", color: "var(--ink)" }}>No field selected</p>
              <p style={{ fontSize: 12, margin: 0 }}>Click any field on the canvas to inspect and edit its settings.</p>
            </div>
          ) : null}

          {/* TAB 2: Conditional Logic */}
          {rightTab === "logic" && selected ? (
            <div className="fb-card">
              <div className="fb-props">
                <div className="fb-prop-header">
                  <div>
                    <span className="fb-prop-header-tag">Logic Rules</span>
                    <h4 style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 800 }}>
                      Condition for {selected.label}
                    </h4>
                  </div>
                </div>

                <label className="fb-switch-row">
                  <span>Enable Conditional Logic</span>
                  <input
                    type="checkbox"
                    checked={!!selected.logic?.enabled}
                    onChange={(e) =>
                      patchField(selected.id, {
                        ...selected,
                        logic: { ...logicFor(selected), enabled: e.target.checked },
                      })
                    }
                    style={{ width: "auto" }}
                  />
                </label>

                {selected.logic?.enabled && (
                  <>
                    <div className="fb-prop-group">
                      <label>Action to Perform</label>
                      <select
                        value={selected.logic?.action ?? "show"}
                        onChange={(e) =>
                          patchField(selected.id, {
                            ...selected,
                            logic: { ...logicFor(selected), action: e.target.value as FieldLogic["action"] },
                          })
                        }
                      >
                        {FIELD_LOGIC_ACTIONS.map((a) => (
                          <option key={a.action} value={a.action}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(selected.logic?.action ?? "show") === "set_value" && (
                      <div className="fb-prop-group">
                        <label>Set Value To</label>
                        <input
                          value={selected.logic?.setValue ?? ""}
                          onChange={(e) =>
                            patchField(selected.id, {
                              ...selected,
                              logic: { ...logicFor(selected), setValue: e.target.value },
                            })
                          }
                          placeholder="Replacement value"
                        />
                      </div>
                    )}

                    <div className="fb-prop-group">
                      <label>Rule Matching Logic</label>
                      <select
                        value={selected.logic?.match ?? "all"}
                        onChange={(e) =>
                          patchField(selected.id, {
                            ...selected,
                            logic: { ...logicFor(selected), match: e.target.value as "all" | "any" },
                          })
                        }
                      >
                        <option value="all">Match ALL conditions (AND)</option>
                        <option value="any">Match ANY condition (OR)</option>
                      </select>
                    </div>

                    <div className="fb-section-divider">Conditions List</div>

                    {(selected.logic?.rules ?? []).map((rule, idx) => (
                      <div key={idx} className="fb-rule-card">
                        <label style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)" }}>
                          RULE #{idx + 1}
                        </label>
                        <select
                          value={rule.field}
                          onChange={(e) => {
                            const rules = [...(selected.logic?.rules ?? [])];
                            rules[idx] = { ...rule, field: e.target.value };
                            patchField(selected.id, { ...selected, logic: { ...logicFor(selected), rules } });
                          }}
                        >
                          <option value="">Select target field…</option>
                          {form.fields
                            .filter((f) => f.id !== selected.id)
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                        </select>

                        <select
                          value={rule.op}
                          onChange={(e) => {
                            const rules = [...(selected.logic?.rules ?? [])];
                            rules[idx] = { ...rule, op: e.target.value as typeof rule.op };
                            patchField(selected.id, { ...selected, logic: { ...logicFor(selected), rules } });
                          }}
                        >
                          {FIELD_LOGIC_OPS.map((o) => (
                            <option key={o.op} value={o.op}>
                              {o.label}
                            </option>
                          ))}
                        </select>

                        {FIELD_LOGIC_OPS.find((o) => o.op === rule.op)?.needsValue !== false ? (
                          <input
                            value={rule.value}
                            onChange={(e) => {
                              const rules = [...(selected.logic?.rules ?? [])];
                              rules[idx] = { ...rule, value: e.target.value };
                              patchField(selected.id, { ...selected, logic: { ...logicFor(selected), rules } });
                            }}
                            placeholder="Expected comparison value"
                          />
                        ) : null}

                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ color: "#ef4444", fontSize: 11, alignSelf: "flex-end", padding: "4px 8px" }}
                          onClick={() =>
                            patchField(selected.id, {
                              ...selected,
                              logic: {
                                ...logicFor(selected),
                                rules: (selected.logic?.rules ?? []).filter((_, i) => i !== idx),
                              },
                            })
                          }
                        >
                          Remove Rule
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="fb-add-step"
                      onClick={() =>
                        patchField(selected.id, {
                          ...selected,
                          logic: {
                            ...logicFor(selected),
                            rules: [
                              ...(selected.logic?.rules ?? []),
                              {
                                field: form.fields.find((f) => f.id !== selected.id)?.id ?? "",
                                op: "eq",
                                value: "",
                              },
                            ],
                          },
                        })
                      }
                    >
                      <Plus size={13} />
                      <span>Add Condition Rule</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : rightTab === "logic" ? (
            <div className="fb-card" style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>
              <GitBranch size={24} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
              <p style={{ fontWeight: 700, margin: "0 0 4px", color: "var(--ink)" }}>Select a field</p>
              <p style={{ fontSize: 12, margin: 0 }}>Click any field on the canvas to configure its conditional logic.</p>
            </div>
          ) : null}

          {/* TAB 3: Form Settings & Integrations */}
          {rightTab === "form" ? (
            <div className="fb-card">
              <div className="fb-props">
                <div className="fb-prop-header">
                  <div>
                    <span className="fb-prop-header-tag">Global Form Settings</span>
                    <h4 style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 800 }}>Settings & Handlers</h4>
                  </div>
                </div>

                <div className="fb-prop-group">
                  <label>Form Title</label>
                  <input
                    value={form.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="Form title"
                  />
                </div>

                <div className="fb-prop-group">
                  <label>Form Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="Short description displayed on header"
                  />
                </div>

                <label className="fb-switch-row">
                  <span>Active & Receiving Leads</span>
                  <input
                    type="checkbox"
                    checked={form.enabled !== false}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                    style={{ width: "auto" }}
                  />
                </label>

                <div className="fb-section-divider">Submission & Response</div>

                <div className="fb-prop-group">
                  <label>Submit Button Text</label>
                  <input
                    value={form.submitLabel}
                    onChange={(e) => patch({ submitLabel: e.target.value })}
                    placeholder="e.g. Claim Free Brochure"
                  />
                </div>

                <div className="fb-prop-group">
                  <label>Success Behavior</label>
                  <select
                    value={form.successAction}
                    onChange={(e) => patch({ successAction: e.target.value as FormDefinition["successAction"] })}
                  >
                    <option value="message">Show in-place thank you message</option>
                    <option value="url">Redirect to custom external URL</option>
                    <option value="thankyou">Redirect to dedicated Thank You page</option>
                  </select>
                </div>

                {form.successAction === "url" ? (
                  <div className="fb-prop-group">
                    <label>Redirect URL</label>
                    <input
                      value={form.successUrl}
                      onChange={(e) => patch({ successUrl: e.target.value })}
                      placeholder="https://yourwebsite.com/thank-you"
                    />
                  </div>
                ) : (
                  <div className="fb-prop-group">
                    <label>Thank You Message</label>
                    <input
                      value={form.thankYou}
                      onChange={(e) => patch({ thankYou: e.target.value })}
                      placeholder="Thanks! Our executive will contact you shortly."
                    />
                  </div>
                )}

                <div className="fb-section-divider">Lead Notifications & Webhooks</div>

                <div className="fb-prop-group">
                  <label>Notify Email Address</label>
                  <input
                    value={form.notifyEmail}
                    onChange={(e) => patch({ notifyEmail: e.target.value })}
                    placeholder="sales@company.com"
                  />
                </div>

                <div className="fb-prop-group">
                  <label>Webhook URL (POST lead payload)</label>
                  <input
                    value={form.webhookUrl ?? ""}
                    onChange={(e) => patch({ webhookUrl: e.target.value })}
                    placeholder="https://api.crm.com/leads/webhook"
                  />
                </div>

                <div className="fb-prop-group">
                  <label>Google Sheets Webhook URL</label>
                  <input
                    value={form.integrations?.googleSheetsUrl ?? ""}
                    onChange={(e) =>
                      patch({
                        integrations: { ...form.integrations, googleSheetsUrl: e.target.value },
                      })
                    }
                    placeholder="https://script.google.com/macros/s/…"
                  />
                </div>

                <div className="fb-section-divider">Spam & Abuse Protection</div>

                <label className="fb-switch-row">
                  <span>Honeypot Spam Trap</span>
                  <input
                    type="checkbox"
                    checked={form.honeypot === true}
                    onChange={(e) => patch({ honeypot: e.target.checked })}
                    style={{ width: "auto" }}
                  />
                </label>

                <label className="fb-switch-row">
                  <span>Prevent Duplicate Submissions</span>
                  <input
                    type="checkbox"
                    checked={!!form.preventDuplicate}
                    onChange={(e) => patch({ preventDuplicate: e.target.checked })}
                    style={{ width: "auto" }}
                  />
                </label>

                <label className="fb-switch-row">
                  <span>Google CAPTCHA Protection</span>
                  <input
                    type="checkbox"
                    checked={!!form.captchaEnabled}
                    onChange={(e) => patch({ captchaEnabled: e.target.checked })}
                    style={{ width: "auto" }}
                  />
                </label>

                <div className="fb-section-divider">Lead Magnet & File Download</div>

                <label className="fb-switch-row">
                  <span>Download file after submission</span>
                  <input
                    type="checkbox"
                    checked={!!form.pdf?.enabled}
                    onChange={(e) => patch({ pdf: { ...form.pdf, enabled: e.target.checked } })}
                    style={{ width: "auto" }}
                  />
                </label>

                {form.pdf?.enabled && (
                  <>
                    <div className="fb-prop-group">
                      <label>File Type</label>
                      <select
                        value={form.pdf?.kind || "pdf"}
                        onChange={(e) =>
                          patch({ pdf: { ...form.pdf, kind: e.target.value as "pdf" | "image" } })
                        }
                      >
                        <option value="pdf">PDF Document (.pdf)</option>
                        <option value="image">Image Brochure (.jpg / .png)</option>
                      </select>
                    </div>

                    <div className="fb-prop-group">
                      <label>File Direct URL</label>
                      <input
                        value={form.pdf?.url ?? ""}
                        onChange={(e) => patch({ pdf: { ...form.pdf, url: e.target.value } })}
                        placeholder="https://domain.com/brochure.pdf"
                      />
                    </div>

                    <div className="fb-prop-group">
                      <label>Download Filename</label>
                      <input
                        value={form.pdf?.filename ?? ""}
                        onChange={(e) => patch({ pdf: { ...form.pdf, filename: e.target.value } })}
                        placeholder="brochure.pdf"
                      />
                    </div>

                    <label className="fb-switch-row">
                      <span>Auto-trigger download on submit</span>
                      <input
                        type="checkbox"
                        checked={form.pdf?.autoDownload !== false}
                        onChange={(e) => patch({ pdf: { ...form.pdf, autoDownload: e.target.checked } })}
                        style={{ width: "auto" }}
                      />
                    </label>
                  </>
                )}

                {/* Conditional download rules */}
                <div className="fb-section-divider">Conditional Downloads</div>
                <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 6px" }}>
                  Serve different brochures depending on client answers (e.g. 2BHK vs 3BHK).
                </p>

                {(form.downloadRules ?? []).map((rule, idx) => (
                  <div key={idx} className="fb-rule-card">
                    <label style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)" }}>
                      DOWNLOAD RULE #{idx + 1}
                    </label>
                    <select
                      value={rule.field}
                      onChange={(e) => {
                        const downloadRules = [...(form.downloadRules ?? [])];
                        downloadRules[idx] = { ...rule, field: e.target.value };
                        patch({ downloadRules });
                      }}
                    >
                      <option value="">Select Field…</option>
                      {form.fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>

                    <input
                      value={rule.value}
                      onChange={(e) => {
                        const downloadRules = [...(form.downloadRules ?? [])];
                        downloadRules[idx] = { ...rule, value: e.target.value };
                        patch({ downloadRules });
                      }}
                      placeholder="Matching value (e.g. 3 BHK)"
                    />

                    <input
                      value={rule.url}
                      onChange={(e) => {
                        const downloadRules = [...(form.downloadRules ?? [])];
                        downloadRules[idx] = { ...rule, url: e.target.value };
                        patch({ downloadRules });
                      }}
                      placeholder="https://…/file.pdf"
                    />

                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: "#ef4444", fontSize: 11, alignSelf: "flex-end", padding: "4px 8px" }}
                      onClick={() =>
                        patch({
                          downloadRules: (form.downloadRules ?? []).filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Remove Rule
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="fb-add-step"
                  onClick={() =>
                    patch({
                      downloadRules: [
                        ...(form.downloadRules ?? []),
                        {
                          field: form.fields[0]?.id ?? "",
                          op: "eq",
                          value: "",
                          url: "",
                          kind: "pdf",
                          filename: "brochure.pdf",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={13} />
                  <span>Add Conditional Download</span>
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {/* Full Live Preview Modal */}
      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="Live Form Interactive Simulation" size="lg">
        <div style={{ padding: 12 }}>
          <DynamicLeadForm form={form} live={false} place="admin-preview" />
        </div>
      </Modal>
    </div>
  );
}
