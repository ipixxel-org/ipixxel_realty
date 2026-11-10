"use client";

import { COLUMN_STYLE_KEYS, type ColumnStyle } from "@/lib/openpage/column-style";
import { BackgroundControls } from "./BackgroundControls";

const inputCls =
  "w-full px-2 py-1 text-[11px] rounded border border-border-default bg-white text-text-0 focus:outline-none focus:border-green";

function TextField({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[9px] uppercase font-semibold text-text-3 mb-1">{label}</label>
      <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

/**
 * Background, overlay, padding and rounded corners for one column of a Div /
 * Container. Uses the same Background controls as the Style tab, but saves on
 * the column, so the outer Div's own background is untouched.
 */
export function ColumnBackgroundControls({
  value,
  onChange,
}: {
  value: ColumnStyle;
  onChange: (patch: ColumnStyle) => void;
}) {
  const isSet = Object.keys(value).length > 0;
  return (
    <details className="mt-1.5" open={isSet || undefined}>
      <summary className="text-[10px] text-text-2 cursor-pointer select-none hover:text-text-0">Background &amp; spacing</summary>
      <div className="mt-2 space-y-3">
        <BackgroundControls
          backgroundColor={value.bgColor}
          backgroundImage={value.bgImage}
          backgroundSize={value.bgSize}
          backgroundPosition={value.bgPosition}
          backgroundRepeat={value.bgRepeat}
          overlayColor={value.bgOverlay}
          overlayOpacity={value.bgOverlayOpacity}
          onChange={(u) => {
            // Map the shared control's keys to the column's keys; only the
            // keys it sent are changed (undefined clears one).
            const patch: ColumnStyle = {};
            if ("backgroundColor" in u) patch.bgColor = u.backgroundColor;
            if ("backgroundImage" in u) patch.bgImage = u.backgroundImage;
            if ("backgroundSize" in u) patch.bgSize = u.backgroundSize;
            if ("backgroundPosition" in u) patch.bgPosition = u.backgroundPosition;
            if ("backgroundRepeat" in u) patch.bgRepeat = u.backgroundRepeat;
            if ("overlayColor" in u) patch.bgOverlay = u.overlayColor;
            if ("overlayOpacity" in u) patch.bgOverlayOpacity = u.overlayOpacity;
            onChange(patch);
          }}
        />
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border-subtle">
          <TextField label="Padding" placeholder="0" value={value.padding} onChange={(v) => onChange({ padding: v })} />
          <TextField label="Radius" placeholder="0" value={value.borderRadius} onChange={(v) => onChange({ borderRadius: v })} />
          <TextField label="Min height" placeholder="auto" value={value.minHeight} onChange={(v) => onChange({ minHeight: v })} />
        </div>
        {isSet ? (
          <button
            type="button"
            onClick={() => onChange(Object.fromEntries(COLUMN_STYLE_KEYS.map((k) => [k, ""])) as ColumnStyle)}
            className="text-[10px] text-text-3 hover:text-status-red"
          >
            Reset column background
          </button>
        ) : null}
      </div>
    </details>
  );
}
