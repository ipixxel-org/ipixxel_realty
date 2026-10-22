"use client";

import { INDIAN_STATES } from "@/lib/billing/pricing";

/**
 * The one Indian state picker. The value is the 2-digit GST state code
 * ("29" = Karnataka), which decides how GST is split and must match a GSTIN's
 * first two digits. Used by Settings → General, the Super Admin organisation
 * edit form and Super Admin → Company & tax details.
 */
export function StateSelect({
  value,
  onChange,
  id,
  className = "inp",
  emptyLabel = "Select state…",
  showCodes = false,
  disabled,
  "aria-label": ariaLabel = "State",
}: {
  /** GST state code, or "" / null when none is chosen. */
  value: string | null | undefined;
  onChange: (code: string) => void;
  id?: string;
  className?: string;
  /** Text of the empty option. */
  emptyLabel?: string;
  /** Show "Karnataka (29)" instead of "Karnataka". */
  showCodes?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <select
      id={id}
      className={className || undefined}
      aria-label={ariaLabel}
      data-state-select=""
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {INDIAN_STATES.map((s) => (
        <option key={s.code} value={s.code}>
          {showCodes ? `${s.name} (${s.code})` : s.name}
        </option>
      ))}
    </select>
  );
}
