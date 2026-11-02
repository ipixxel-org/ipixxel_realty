"use client";

import type { ComponentType } from "react";
import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  StretchHorizontal,
} from "lucide-react";
import {
  isVertical,
  type FlexAlign,
  type FlexDirection,
  type FlexJustify,
  type FlexLayout,
} from "@/lib/openpage/flex-layout";

type Icon = ComponentType<{ size?: number; className?: string }>;
type Option<T extends string> = { value: T; label: string; icon: Icon };

const DIRECTIONS: Option<FlexDirection>[] = [
  { value: "row", label: "Row (left to right)", icon: ArrowRight },
  { value: "column", label: "Column (top to bottom)", icon: ArrowDown },
  { value: "row-reverse", label: "Row reversed (right to left)", icon: ArrowLeft },
  { value: "column-reverse", label: "Column reversed (bottom to top)", icon: ArrowUp },
];

const JUSTIFY: Option<FlexJustify>[] = [
  { value: "start", label: "Start", icon: AlignHorizontalJustifyStart },
  { value: "center", label: "Center", icon: AlignHorizontalJustifyCenter },
  { value: "end", label: "End", icon: AlignHorizontalJustifyEnd },
  { value: "space-between", label: "Space between", icon: AlignHorizontalSpaceBetween },
  { value: "space-around", label: "Space around", icon: AlignHorizontalSpaceAround },
  { value: "space-evenly", label: "Space evenly", icon: AlignHorizontalDistributeCenter },
];

const ALIGN: Option<FlexAlign>[] = [
  { value: "start", label: "Start", icon: AlignStartHorizontal },
  { value: "center", label: "Center", icon: AlignCenterHorizontal },
  { value: "end", label: "End", icon: AlignEndHorizontal },
  { value: "stretch", label: "Stretch", icon: StretchHorizontal },
];

function Choice<T extends string>({
  label,
  options,
  value,
  fallback,
  rotate,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T | undefined;
  /** The value used when nothing is set; shown as active. */
  fallback: T;
  /** Turn the icons 90° when the items run top-to-bottom. */
  rotate?: boolean;
  onChange: (next: T | undefined) => void;
}) {
  const active = value ?? fallback;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-text-2 shrink-0">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-md border border-border-default overflow-hidden">
        {options.map((o) => {
          const Icon = o.icon;
          const on = o.value === active;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.label}
              // Picking the default again clears the setting.
              onClick={() => onChange(o.value === fallback ? undefined : o.value)}
              className={`w-7 h-7 flex items-center justify-center border-l first:border-l-0 border-border-default transition-colors ${
                on ? "bg-slate-200 text-text-0" : "bg-white text-text-3 hover:bg-slate-50 hover:text-text-1"
              }`}
            >
              <Icon size={13} className={rotate ? "rotate-90" : undefined} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Elementor-style "Items" controls: Direction, Justify Content, Align Items.
 * `defaultDirection` is how the items run when nothing is set (a container's
 * columns run in a row; a column's widgets stack top-to-bottom).
 */
export function FlexItemsControls({
  value,
  defaultDirection,
  onChange,
}: {
  value: FlexLayout;
  defaultDirection: FlexDirection;
  onChange: (patch: Partial<Record<keyof FlexLayout, string | undefined>>) => void;
}) {
  const vertical = isVertical(value.direction, defaultDirection);
  return (
    <div className="space-y-2">
      <Choice
        label="Direction"
        options={DIRECTIONS}
        value={value.direction}
        fallback={defaultDirection}
        onChange={(v) => onChange({ direction: v })}
      />
      <Choice
        label="Justify Content"
        options={JUSTIFY}
        value={value.justifyContent}
        fallback="start"
        rotate={vertical}
        onChange={(v) => onChange({ justifyContent: v })}
      />
      <Choice
        label="Align Items"
        options={ALIGN}
        value={value.alignItems}
        fallback="stretch"
        rotate={vertical}
        onChange={(v) => onChange({ alignItems: v })}
      />
    </div>
  );
}
