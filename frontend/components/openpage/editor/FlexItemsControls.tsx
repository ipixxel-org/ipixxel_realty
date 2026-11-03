"use client";

import { useState, type ComponentType } from "react";
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
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceAround,
  AlignVerticalSpaceBetween,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  CornerDownLeft,
  StretchHorizontal,
  StretchVertical,
  WrapText,
} from "lucide-react";
import {
  DEFAULT_GRID_COLUMNS,
  FLEX_DISPLAYS,
  isBlockDisplay,
  isGridDisplay,
  isVertical,
  normalizeLayoutValue,
  type FlexAlign,
  type FlexAlignContent,
  type FlexDirection,
  type FlexDisplay,
  type FlexJustify,
  type FlexLayout,
  type FlexLayoutPatch,
  type FlexWrap,
} from "@/lib/openpage/flex-layout";

type Icon = ComponentType<{ size?: number; className?: string }>;
type Option<T extends string> = { value: T; label: string; icon: Icon };

const DISPLAY_LABELS: Record<FlexDisplay, string> = {
  flex: "Flex",
  "inline-flex": "Inline Flex",
  grid: "Grid",
  "inline-grid": "Inline Grid",
  block: "Block",
  "inline-block": "Inline Block",
};

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

const WRAP: Option<FlexWrap>[] = [
  { value: "nowrap", label: "No wrap (one line)", icon: ArrowRightLeft },
  { value: "wrap", label: "Wrap onto new lines", icon: WrapText },
  { value: "wrap-reverse", label: "Wrap reversed", icon: CornerDownLeft },
];

const ALIGN_CONTENT: Option<FlexAlignContent>[] = [
  { value: "start", label: "Lines: start", icon: AlignVerticalJustifyStart },
  { value: "center", label: "Lines: center", icon: AlignVerticalJustifyCenter },
  { value: "end", label: "Lines: end", icon: AlignVerticalJustifyEnd },
  { value: "space-between", label: "Lines: space between", icon: AlignVerticalSpaceBetween },
  { value: "space-around", label: "Lines: space around", icon: AlignVerticalSpaceAround },
  { value: "space-evenly", label: "Lines: space evenly", icon: AlignVerticalDistributeCenter },
  { value: "stretch", label: "Lines: stretch", icon: StretchVertical },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-text-2 shrink-0">{label}</span>
      {children}
    </div>
  );
}

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
    <Row label={label}>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap justify-end rounded-md border border-border-default overflow-hidden">
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
    </Row>
  );
}

/** A small text box that saves on blur / Enter and rejects invalid values. */
function TextValue({
  label,
  value,
  placeholder,
  inputMode,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: "numeric" | "text";
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Follow the saved value when it changes (e.g. undo, another block).
  const [saved, setSaved] = useState(value);
  if (saved !== value) {
    setSaved(value);
    setDraft(value);
  }
  return (
    <Row label={label}>
      <input
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft);
          // An invalid value snaps back to the saved one; a valid one
          // comes back through `value`.
          setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-24 h-7 px-2 rounded-md border border-border-default bg-white text-[11px] text-text-0 focus:outline-none focus:border-sky-500"
      />
    </Row>
  );
}

/**
 * Elementor-style "Items" controls: Display, Direction, Justify Content,
 * Align Items, Wrap, Align Content, Grid columns / rows and Gap.
 * `defaultDirection` is how the items run when nothing is set (a container's
 * columns run in a row; a column's widgets stack top-to-bottom).
 */
export function FlexItemsControls({
  value,
  defaultDirection,
  showGap = false,
  onChange,
}: {
  value: FlexLayout;
  defaultDirection: FlexDirection;
  /** Show the Gap box (containers have their own Gap field instead). */
  showGap?: boolean;
  onChange: (patch: FlexLayoutPatch) => void;
}) {
  const grid = isGridDisplay(value.display);
  const block = isBlockDisplay(value.display);
  const vertical = isVertical(value.direction, defaultDirection);
  // Rows wrap by default; stacked items do not.
  const defaultWrap: FlexWrap = vertical ? "nowrap" : "wrap";
  const set = (key: keyof FlexLayout, raw: unknown) => {
    const next = normalizeLayoutValue(key, raw);
    // Invalid text is ignored (the box snaps back to the saved value).
    if (raw !== "" && raw !== undefined && next === undefined) return;
    onChange({ [key]: next });
  };

  return (
    <div className="space-y-2">
      <Row label="Display">
        <select
          aria-label="Display"
          value={value.display ?? "flex"}
          // Flex is the default, so choosing it clears the setting.
          onChange={(e) => onChange({ display: e.target.value === "flex" ? undefined : e.target.value })}
          className="h-7 px-1.5 rounded-md border border-border-default bg-white text-[11px] text-text-0 focus:outline-none focus:border-sky-500"
        >
          {FLEX_DISPLAYS.map((d) => (
            <option key={d} value={d}>
              {DISPLAY_LABELS[d]}
            </option>
          ))}
        </select>
      </Row>

      {block ? (
        <p className="text-[10px] text-text-3 leading-snug">
          Block: items stack one under another at full width. Choose Flex or Grid for more layout options.
        </p>
      ) : (
        <>
          {grid ? (
            <>
              <TextValue
                label="Columns"
                value={String(value.gridColumns ?? "")}
                placeholder={String(DEFAULT_GRID_COLUMNS)}
                inputMode="numeric"
                onCommit={(raw) => set("gridColumns", raw.trim())}
              />
              <TextValue
                label="Rows"
                value={String(value.gridRows ?? "")}
                placeholder="auto"
                inputMode="numeric"
                onCommit={(raw) => set("gridRows", raw.trim())}
              />
            </>
          ) : (
            <Choice
              label="Direction"
              options={DIRECTIONS}
              value={value.direction}
              fallback={defaultDirection}
              onChange={(v) => onChange({ direction: v })}
            />
          )}
          <Choice
            label="Justify Content"
            options={JUSTIFY}
            value={value.justifyContent}
            fallback="start"
            rotate={!grid && vertical}
            onChange={(v) => onChange({ justifyContent: v })}
          />
          <Choice
            label="Align Items"
            options={ALIGN}
            value={value.alignItems}
            fallback="stretch"
            rotate={!grid && vertical}
            onChange={(v) => onChange({ alignItems: v })}
          />
          {!grid && (
            <Choice
              label="Wrap"
              options={WRAP}
              value={value.wrap}
              fallback={defaultWrap}
              onChange={(v) => onChange({ wrap: v })}
            />
          )}
          <Choice
            label="Align Content"
            options={ALIGN_CONTENT}
            value={value.alignContent}
            fallback="stretch"
            onChange={(v) => onChange({ alignContent: v })}
          />
        </>
      )}

      {showGap && (
        <TextValue
          label="Gap"
          value={value.itemsGap ?? ""}
          placeholder="e.g. 16px"
          onCommit={(raw) => set("itemsGap", raw.trim())}
        />
      )}
    </div>
  );
}
