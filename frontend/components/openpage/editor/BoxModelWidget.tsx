"use client";

import { useState } from "react";
import { Link2, Link2Off, RotateCcw } from "lucide-react";

interface BoxModelProps {
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  onChangeMargin: (m: { top?: string; right?: string; bottom?: string; left?: string }) => void;
  onChangePadding: (p: { top?: string; right?: string; bottom?: string; left?: string }) => void;
}

function cleanVal(v?: string): string {
  if (!v) return "";
  return v;
}

export function BoxModelWidget({
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
  onChangeMargin,
  onChangePadding,
}: BoxModelProps) {
  const [marginLinked, setMarginLinked] = useState(false);
  const [paddingLinked, setPaddingLinked] = useState(false);

  const handleMarginChange = (side: "top" | "right" | "bottom" | "left", val: string) => {
    if (marginLinked) {
      onChangeMargin({ top: val, right: val, bottom: val, left: val });
    } else {
      onChangeMargin({
        top: side === "top" ? val : marginTop,
        right: side === "right" ? val : marginRight,
        bottom: side === "bottom" ? val : marginBottom,
        left: side === "left" ? val : marginLeft,
      });
    }
  };

  const handlePaddingChange = (side: "top" | "right" | "bottom" | "left", val: string) => {
    if (paddingLinked) {
      onChangePadding({ top: val, right: val, bottom: val, left: val });
    } else {
      onChangePadding({
        top: side === "top" ? val : paddingTop,
        right: side === "right" ? val : paddingRight,
        bottom: side === "bottom" ? val : paddingBottom,
        left: side === "left" ? val : paddingLeft,
      });
    }
  };

  const marginInput =
    "w-full min-w-0 h-6 px-0.5 text-center rounded-md bg-bg-1 border border-amber-500/30 hover:border-amber-500 focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.15)] text-amber-700 placeholder:text-amber-700/40 text-[10px] font-mono outline-none transition-colors";
  const paddingInput =
    "w-full min-w-0 h-6 px-0.5 text-center rounded-md bg-bg-1 border border-emerald-500/30 hover:border-emerald-500 focus:border-emerald-500 focus:shadow-[0_0_0_2px_rgba(16,185,129,0.15)] text-emerald-700 placeholder:text-emerald-700/40 text-[10px] font-mono outline-none transition-colors";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-[10px] text-text-3 font-semibold uppercase tracking-wider">
        <span className="truncate whitespace-nowrap">Margin & Padding</span>
        <button
          type="button"
          onClick={() => {
            onChangeMargin({ top: "", right: "", bottom: "", left: "" });
            onChangePadding({ top: "", right: "", bottom: "", left: "" });
          }}
          className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] normal-case tracking-normal text-text-3 hover:text-text-0 hover:bg-bg-3 transition-colors"
          title="Reset All Spacing"
        >
          <RotateCcw size={10} /> Reset
        </button>
      </div>

      {/* Visual CSS Box Diagram */}
      <div className="rounded-xl border border-border-default bg-bg-2/60 p-1.5 select-none">
        {/* Margin Box (Outer) */}
        <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/[0.04] px-1.5 pt-1 pb-1.5">
          <div className="flex items-center gap-1 h-5 text-[9px] font-bold text-amber-600 uppercase tracking-widest">
            <span>Margin</span>
            <button
              type="button"
              onClick={() => setMarginLinked(!marginLinked)}
              className={`p-0.5 rounded hover:bg-amber-500/15 ${marginLinked ? "text-amber-600" : "text-amber-600/60 hover:text-amber-600"}`}
              title={marginLinked ? "Unlink margin sides" : "Link all margin sides"}
            >
              {marginLinked ? <Link2 size={10} /> : <Link2Off size={10} />}
            </button>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.8fr)_minmax(0,1fr)] items-center gap-1">
            {/* Margin Top */}
            <div className="col-start-2 flex justify-center">
              <input
                type="text"
                value={cleanVal(marginTop)}
                onChange={(e) => handleMarginChange("top", e.target.value)}
                placeholder="0px"
                className={`${marginInput} max-w-[56px]`}
              />
            </div>

            {/* Margin Left */}
            <input
              type="text"
              value={cleanVal(marginLeft)}
              onChange={(e) => handleMarginChange("left", e.target.value)}
              placeholder="auto"
              className={`${marginInput} col-start-1`}
            />

            {/* Padding Box (Inner) */}
            <div className="min-w-0 rounded-md border border-dashed border-emerald-500/50 bg-emerald-500/[0.05] px-1 pt-0.5 pb-1">
              <div className="flex items-center gap-1 h-5 text-[9px] font-bold text-emerald-600 uppercase tracking-widest">
                <span>Padding</span>
                <button
                  type="button"
                  onClick={() => setPaddingLinked(!paddingLinked)}
                  className={`p-0.5 rounded hover:bg-emerald-500/15 ${paddingLinked ? "text-emerald-600" : "text-emerald-600/60 hover:text-emerald-600"}`}
                  title={paddingLinked ? "Unlink padding sides" : "Link all padding sides"}
                >
                  {paddingLinked ? <Link2 size={10} /> : <Link2Off size={10} />}
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-1">
                {/* Padding Top */}
                <div className="col-start-2 flex justify-center">
                  <input
                    type="text"
                    value={cleanVal(paddingTop)}
                    onChange={(e) => handlePaddingChange("top", e.target.value)}
                    placeholder="0px"
                    className={paddingInput}
                  />
                </div>

                {/* Padding Left */}
                <input
                  type="text"
                  value={cleanVal(paddingLeft)}
                  onChange={(e) => handlePaddingChange("left", e.target.value)}
                  placeholder="0px"
                  className={`${paddingInput} col-start-1`}
                />

                {/* Content Center */}
                <div className="h-6 min-w-0 flex items-center justify-center rounded bg-blue-500/10 border border-blue-500/30 text-blue-600 text-[8px] uppercase tracking-wide font-semibold overflow-hidden">
                  <span className="truncate px-0.5">Content</span>
                </div>

                {/* Padding Right */}
                <input
                  type="text"
                  value={cleanVal(paddingRight)}
                  onChange={(e) => handlePaddingChange("right", e.target.value)}
                  placeholder="0px"
                  className={paddingInput}
                />

                {/* Padding Bottom */}
                <div className="col-start-2 flex justify-center">
                  <input
                    type="text"
                    value={cleanVal(paddingBottom)}
                    onChange={(e) => handlePaddingChange("bottom", e.target.value)}
                    placeholder="0px"
                    className={paddingInput}
                  />
                </div>
              </div>
            </div>

            {/* Margin Right */}
            <input
              type="text"
              value={cleanVal(marginRight)}
              onChange={(e) => handleMarginChange("right", e.target.value)}
              placeholder="auto"
              className={marginInput}
            />

            {/* Margin Bottom */}
            <div className="col-start-2 flex justify-center">
              <input
                type="text"
                value={cleanVal(marginBottom)}
                onChange={(e) => handleMarginChange("bottom", e.target.value)}
                placeholder="0px"
                className={`${marginInput} max-w-[56px]`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
