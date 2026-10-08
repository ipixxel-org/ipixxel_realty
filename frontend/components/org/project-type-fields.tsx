"use client";

import { FieldRolesPanel, TypedFieldEditor } from "@/components/org/typed-field-editor";
import { RowListEditor } from "@/components/org/row-list-editor";
import {
  groupBySection,
  nonRoleFields,
  type CustomValueDraft,
  type FieldDef,
  type FieldRole,
  type FieldRow,
} from "@/lib/field-template";

/**
 * The typed inputs for a field template — number (with its unit), text,
 * yes/no and choice. Used for the project's summary fields on the wizard and
 * the edit page. Values are strings (see CustomValueDraft).
 */
export function CustomFieldInputs({
  template,
  values,
  onChange,
  errorFor,
}: {
  template: FieldDef[];
  values: CustomValueDraft;
  onChange: (key: string, value: string) => void;
  /** The inline error for a field id (`cf_<key>`), once the user has tried to continue. */
  errorFor?: (id: string) => string;
}) {
  if (template.length === 0) return null;
  return (
    <div className="grid g3">
      {template.map((f) => (
        <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => onChange(f.key, v)} error={errorFor?.(`cf_${f.key}`) ?? ""} />
      ))}
    </div>
  );
}

/** One field's input, by type — number (with unit), long/short text, yes/no, choice. */
export function FieldInput({
  field: f,
  value,
  onChange,
  error,
  showLabel = true,
  className,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const wrapperClassName = ["field", error ? "field-invalid" : "", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClassName}>
      {showLabel ? (
        <label>
          {f.label}
          {f.required ? <span className="req"> *</span> : null}
        </label>
      ) : null}
      {f.type === "number" ? (
        <div style={{ position: "relative" }}>
          <input
            className="inp"
            type="number"
            step="any"
            style={f.unit ? { paddingRight: 12 + f.unit.length * 8 } : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {f.unit ? (
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 13, pointerEvents: "none" }}>
              {f.unit}
            </span>
          ) : null}
        </div>
      ) : f.type === "yesno" ? (
        <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      ) : f.type === "choice" ? (
        <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {/* A stored value no longer among the options stays visible. */}
          {value && !(f.options ?? []).includes(value) ? <option value={value}>{value}</option> : null}
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.multiline ? (
        <textarea className="inp" rows={3} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="inp" value={value} maxLength={500} onChange={(e) => onChange(e.target.value)} />
      )}
      {error ? <div className="field-err">{error}</div> : null}
    </div>
  );
}

/** Project summary fields use the same compact label/value/delete pattern as Specifications. */
export function ProjectFieldRows({
  template,
  values,
  onTemplateChange,
  onValueChange,
  errorFor,
}: {
  template: FieldDef[];
  values: CustomValueDraft;
  onTemplateChange: (template: FieldDef[]) => void;
  onValueChange: (key: string, value: string) => void;
  /** The inline error for a field key (id `cf_<key>`), once a blocked Continue has surfaced it. */
  errorFor?: (key: string) => string;
}) {
  return (
    <RowListEditor<FieldDef>
      rows={template}
      getKey={(field) => field.key}
      onChange={onTemplateChange}
      makeRow={() => ({ key: `project_field_${Date.now()}`, label: "New project field", type: "text", required: false })}
      addLabel="+ Add project field"
      emptyText="No project fields — add the first one below."
      removeLabel={(field) => `Remove ${field.label || "this project field"}`}
      renderCells={(field, update) => (
        <>
          <input
            className="inp"
            aria-label="Project field label"
            placeholder="e.g. Number of towers"
            value={field.label}
            onChange={(event) => update({ label: event.target.value })}
          />
          <FieldInput
            field={field}
            value={values[field.key] ?? ""}
            onChange={(value) => onValueChange(field.key, value)}
            showLabel={false}
            error={errorFor?.(field.key) ?? ""}
            className="field-compact"
          />
        </>
      )}
    />
  );
}

export function UnitFieldRows({
  rows,
  onChange,
  roleBaseline = new Set(),
}: {
  rows: FieldRow[];
  onChange: (rows: FieldRow[]) => void;
  /** The role set this list originally had — see `FieldRolesPanel`. */
  roleBaseline?: Set<FieldRole>;
}) {
  return (
    <div className="field unit-field-editor">
      <label className="unit-fields-title">Unit fields</label>
      <div className="hint unit-fields-hint">Fields captured for each unit — e.g. Bedrooms, Floor, Price.</div>
      <FieldRolesPanel rows={rows} baseline={roleBaseline} onChange={onChange} />
      <TypedFieldEditor rows={rows} onChange={onChange} emptyText="No unit fields — add a field." />
    </div>
  );
}

/**
 * A unit template's NON-role fields, grouped under section headings. Role
 * fields (price / area / group / floor / configuration) are never rendered
 * here — they power dedicated inputs the caller renders itself, since each
 * backs real behaviour (tower limits, configuration validation, …) beyond a
 * plain typed value.
 */
export function SectionedFieldInputs({
  template,
  values,
  onChange,
  errorFor,
}: {
  template: FieldDef[];
  values: CustomValueDraft;
  onChange: (key: string, value: string) => void;
  errorFor?: (id: string) => string;
}) {
  const fields = nonRoleFields(template);
  if (fields.length === 0) return null;
  const sections = groupBySection(fields);
  return (
    <>
      {sections.map((s, i) => (
        <div className="q-sec" key={s.section ?? `_${i}`}>
          {s.section ? <div className="lbl">{s.section}</div> : null}
          <div className="grid g3">
            {s.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => onChange(f.key, v)} error={errorFor?.(`cf_${f.key}`) ?? ""} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
