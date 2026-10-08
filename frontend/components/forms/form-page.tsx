"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { PasswordInput } from "@/components/auth/password-input";
import { Modal } from "@/components/ui/modal";
import styles from "./form-page.module.css";

// Presentational building blocks for the full-width create / edit form pages
// (org Users, Platform Team members and roles). No state or data handling
// lives here — each page keeps its own validation and submit logic.

export { styles as formPageStyles };

export function FormPage({
  eyebrow,
  title,
  subtitle,
  backHref,
  onBack,
  backDisabled,
  backLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: React.ReactNode;
  /** Route to go back to. Use `onBack` instead for an in-page form view. */
  backHref?: string;
  onBack?: () => void;
  backDisabled?: boolean;
  backLabel: string;
  children: React.ReactNode;
}) {
  // A form shown in place of a list (same route) should start at the top,
  // like a freshly opened page.
  useEffect(() => {
    if (onBack) window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          {onBack ? (
            <button
              type="button"
              className={styles.back}
              aria-label={backLabel}
              onClick={onBack}
              disabled={backDisabled}
            >
              <Icon name="chevron-left" size={18} />
            </button>
          ) : (
            <Link href={backHref ?? "/"} className={styles.back} aria-label={backLabel}>
              <Icon name="chevron-left" size={18} />
            </Link>
          )}
          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className={styles.alert} role="alert">
      <Icon name="alert" size={16} />
      {message}
    </div>
  );
}

export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function FormSection({ title, actions }: { title: React.ReactNode; actions?: React.ReactNode }) {
  if (!actions) return <div className={styles.section}>{title}</div>;
  return (
    <div className={`${styles.section} ${styles.sectionRow}`}>
      <span>{title}</span>
      <span className={styles.sectionActions}>{actions}</span>
    </div>
  );
}

/** Small secondary button for section-level actions (e.g. "Enable all"). */
export function MiniButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={styles.mini} onClick={onClick}>
      {children}
    </button>
  );
}

/** Grid wrapper for CheckCards / tiles — 2+ columns on desktop, 1 on phones. */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className={styles.cardGrid}>{children}</div>;
}

/** Checkbox rendered as a selectable card with a title and description. */
export function CheckCard({
  checked,
  onChange,
  title,
  description,
  status,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional right-aligned state text, e.g. ACTIVE / OFF. */
  status?: [on: string, off: string];
}) {
  return (
    <label className={styles.checkCard} data-checked={checked || undefined}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.checkBody}>
        <span className={styles.checkHead}>
          <span className={styles.checkTitle}>{title}</span>
          {status ? <span className={styles.checkStatus}>{checked ? status[0] : status[1]}</span> : null}
        </span>
        {description ? <span className={styles.checkDesc}>{description}</span> : null}
      </span>
    </label>
  );
}

/**
 * Quick-start presets as a radio group. Picking an option calls `onSelect`
 * (the page pre-fills its fields); `selected` is derived from the form by the
 * page, so the radio clears once the fields no longer match a preset.
 */
export function PresetRadios<T extends { name: string; desc: string }>({
  name,
  label,
  options,
  selected,
  disabled,
  onSelect,
}: {
  /** Radio group name — must be unique on the page. */
  name: string;
  label: string;
  options: readonly T[];
  selected: (option: T) => boolean;
  disabled?: boolean;
  onSelect: (option: T) => void;
}) {
  return (
    <div className={styles.presetRadios} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.name} className={styles.presetRadio}>
          {/* onClick as well as onChange: re-clicking the selected option
              re-applies the preset after manual edits. */}
          <input
            type="radio"
            name={name}
            value={option.name}
            checked={selected(option)}
            disabled={disabled}
            onChange={() => onSelect(option)}
            onClick={() => onSelect(option)}
          />
          <span>
            <span className={styles.presetTitle}>{option.name}</span>
            <span className={styles.presetDesc}>{option.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Removable pill list (e.g. plan feature bullets). */
export function TagList({
  items,
  onRemove,
  empty,
}: {
  items: string[];
  onRemove: (index: number) => void;
  empty: React.ReactNode;
}) {
  if (items.length === 0) return <div className={styles.emptyNote}>{empty}</div>;
  return (
    <div className={styles.tags}>
      {items.map((item, idx) => (
        <span key={`${idx}-${item}`} className={styles.tag}>
          <span className={styles.tagTick} aria-hidden="true">
            ✓
          </span>
          {item}
          <button type="button" className={styles.tagRemove} onClick={() => onRemove(idx)} aria-label={`Remove ${item}`}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

/** Read-only highlighted info card (e.g. a fixed "Organisation scope"). */
export function FormNote({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={styles.note}>
      <div className={styles.noteTitle}>{title}</div>
      {children ? <div className={styles.noteBody}>{children}</div> : null}
    </div>
  );
}

export function Field({
  htmlFor,
  label,
  icon,
  note,
  error,
  hint,
  hintId,
  children,
}: {
  htmlFor: string;
  label: string;
  icon: IconName;
  /** Muted text after the label, e.g. "(optional)". */
  note?: string;
  error?: string;
  hint?: React.ReactNode;
  hintId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>
        <span className={styles.labelIcon} aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <span>
          {label}
          {note ? <span className={styles.labelNote}> {note}</span> : null}
        </span>
      </label>
      {children}
      {error ? (
        <div className={styles.error} role="alert">
          <Icon name="alert" size={14} />
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div className={styles.hint} id={hintId}>
          <Icon name="info" size={14} />
          <span>{hint}</span>
        </div>
      ) : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
  icon?: IconName;
  invalid?: boolean;
};

export function TextInput({ icon, invalid, ...props }: InputProps) {
  return (
    <div
      className={styles.control}
      data-invalid={invalid || undefined}
      data-disabled={props.readOnly || props.disabled || undefined}
    >
      {icon ? (
        <span className={styles.lead} aria-hidden="true">
          <Icon name={icon} size={17} />
        </span>
      ) : null}
      <input {...props} aria-invalid={invalid || undefined} className={styles.input} />
    </div>
  );
}

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  icon?: IconName;
  invalid?: boolean;
};

export function SelectInput({ icon, invalid, children, ...props }: SelectProps) {
  return (
    <div className={styles.control} data-invalid={invalid || undefined} data-disabled={props.disabled || undefined}>
      {icon ? (
        <span className={styles.lead} aria-hidden="true">
          <Icon name={icon} size={17} />
        </span>
      ) : null}
      <select {...props} aria-invalid={invalid || undefined} className={styles.select}>
        {children}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        <Icon name="chevron-down" size={16} />
      </span>
    </div>
  );
}

type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  invalid?: boolean;
};

export function TextArea({ invalid, ...props }: TextAreaProps) {
  return (
    <div className={styles.control} data-invalid={invalid || undefined}>
      <textarea {...props} aria-invalid={invalid || undefined} className={styles.textarea} />
    </div>
  );
}

/** Mobile number input with a fixed dial-code prefix (from the Country field). */
export function PhoneInput({ prefix, invalid, ...props }: InputProps & { prefix: string }) {
  return (
    <div className={styles.control} data-invalid={invalid || undefined}>
      <span className={styles.prefix} aria-hidden="true">
        {prefix}
      </span>
      <input {...props} aria-invalid={invalid || undefined} className={styles.input} />
    </div>
  );
}

export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <div className={styles.control} data-invalid={invalid || undefined}>
      <span className={styles.lead} aria-hidden="true">
        <Icon name="key" size={17} />
      </span>
      <div className={styles.passwordSlot}>
        <PasswordInput
          id={id}
          className={styles.input}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="new-password"
        />
      </div>
    </div>
  );
}

export function FormActions({
  cancelHref,
  onCancel,
  busy,
  submitDisabled,
  submitLabel,
  busyLabel,
  submitIcon = "check",
  onSubmit,
  extra,
}: {
  /** Route Cancel goes to. Use `onCancel` instead for an in-page form view. */
  cancelHref?: string;
  onCancel?: () => void;
  busy: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  busyLabel: string;
  submitIcon?: IconName;
  /** Click handler for forms that don't submit through a <form>. */
  onSubmit?: () => void;
  /** Extra buttons placed before Cancel (e.g. a destructive Delete). */
  extra?: React.ReactNode;
}) {
  return (
    <div className={styles.actions}>
      {extra}
      {onCancel ? (
        <button type="button" className={styles.btn} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      ) : (
        <Link
          href={cancelHref ?? "/"}
          className={styles.btn}
          aria-disabled={busy || undefined}
          onClick={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          Cancel
        </Link>
      )}
      <button
        type={onSubmit ? "button" : "submit"}
        onClick={onSubmit}
        className={styles.btnPrimary}
        disabled={busy || submitDisabled}
      >
        <Icon name={submitIcon} size={16} />
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  );
}

/**
 * Short create / edit form (one or two fields) shown as a popup instead of
 * a full page. Same Field / TextInput / FormAlert / FormActions building
 * blocks as FormPage — the wrapper only provides the kit's style scope
 * (the modal renders in a portal, outside any FormPage) and a <form> so
 * Enter submits. Closing is blocked while `busy`.
 */
export function FormModal({
  open,
  onClose,
  title,
  description,
  busy,
  size = "md",
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  busy?: boolean;
  size?: "sm" | "md" | "lg";
  /** Submit handler for the wrapped <form>; omit for click-driven actions. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size={size} closeDisabled={busy}>
      <form
        className={styles.page}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit?.(e);
        }}
      >
        {children}
      </form>
    </Modal>
  );
}
