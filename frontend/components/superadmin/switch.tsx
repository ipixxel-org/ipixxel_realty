"use client";

import { useState } from "react";

type SwitchProps = {
  defaultOn?: boolean;
  checked?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
};

export function Switch({ defaultOn = false, checked, onChange, disabled = false, "aria-label": ariaLabel }: SwitchProps) {
  const [uncontrolledOn, setUncontrolledOn] = useState(defaultOn);
  const isControlled = checked !== undefined;
  const on = isControlled ? checked : uncontrolledOn;

  function toggle() {
    if (disabled) return;
    const next = !on;
    if (!isControlled) setUncontrolledOn(next);
    onChange?.(next);
  }

  return (
    <div
      className={`switch${on ? " on" : ""}`}
      onClick={toggle}
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      tabIndex={disabled ? -1 : 0}
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    />
  );
}
