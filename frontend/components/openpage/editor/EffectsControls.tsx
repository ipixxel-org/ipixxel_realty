"use client";

import { useState } from "react";
import { ColorInput } from "./shared-components";
import { BorderRadiusControl } from "./BorderRadiusControl";

interface EffectsControlsProps {
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  borderRadius?: string;
  boxShadow?: string;
  transform?: string;
  filter?: string;
  opacity?: string;
  onChange: (updates: {
    borderWidth?: string;
    borderStyle?: string;
    borderColor?: string;
    borderRadius?: string;
    boxShadow?: string;
    transform?: string;
    filter?: string;
    opacity?: string;
  }) => void;
}

export function EffectsControls({
  borderWidth,
  borderStyle = "none",
  borderColor,
  borderRadius,
  boxShadow,
  transform,
  filter,
  opacity,
  onChange,
}: EffectsControlsProps) {
  const [activeTab, setActiveTab] = useState<"border" | "shadow" | "transform" | "filters">("border");

  // Quick Shadows
  const shadowPresets = [
    { label: "None", value: "none" },
    { label: "Subtle", value: "0 2px 8px rgba(0, 0, 0, 0.08)" },
    { label: "Medium", value: "0 8px 24px rgba(0, 0, 0, 0.16)" },
    { label: "Deep", value: "0 20px 48px rgba(0, 0, 0, 0.28)" },
    { label: "Glow", value: "0 0 24px rgba(34, 197, 94, 0.35)" },
  ];

  return (
    <div className="space-y-3">
      {/* Sub tabs */}
      <div className="flex rounded-lg border border-border-default bg-bg-2 p-0.5 text-[10.5px]">
        <button
          type="button"
          onClick={() => setActiveTab("border")}
          className={`flex-1 py-1 rounded transition-all font-medium ${
            activeTab === "border" ? "bg-green/15 text-green" : "text-text-3 hover:text-text-1"
          }`}
        >
          Border
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("shadow")}
          className={`flex-1 py-1 rounded transition-all font-medium ${
            activeTab === "shadow" ? "bg-green/15 text-green" : "text-text-3 hover:text-text-1"
          }`}
        >
          Shadow
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transform")}
          className={`flex-1 py-1 rounded transition-all font-medium ${
            activeTab === "transform" ? "bg-green/15 text-green" : "text-text-3 hover:text-text-1"
          }`}
        >
          Transform
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("filters")}
          className={`flex-1 py-1 rounded transition-all font-medium ${
            activeTab === "filters" ? "bg-green/15 text-green" : "text-text-3 hover:text-text-1"
          }`}
        >
          Filters
        </button>
      </div>

      {/* Border Controls */}
      {activeTab === "border" && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase font-semibold text-text-3 block mb-1">Style</label>
              <select
                value={borderStyle || "none"}
                onChange={(e) => onChange({ borderStyle: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[11px] outline-none"
              >
                <option value="none">None</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
                <option value="double">Double</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-semibold text-text-3 block mb-1">Width</label>
              <input
                type="text"
                value={borderWidth || ""}
                onChange={(e) => onChange({ borderWidth: e.target.value })}
                placeholder="1px"
                className="w-full px-2 py-1.5 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[11px] font-mono outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold text-text-3 block mb-1">Border Color</label>
            <ColorInput
              value={borderColor || ""}
              onChange={(val) => onChange({ borderColor: val })}
            />
          </div>

          {/* Border Radius */}
          <div>
            <BorderRadiusControl
              value={borderRadius}
              onChange={(val) => onChange({ borderRadius: val })}
            />
          </div>
        </div>
      )}

      {/* Box Shadow */}
      {activeTab === "shadow" && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-[10px] uppercase font-semibold text-text-3 block mb-1">Quick Presets</label>
            <div className="flex flex-wrap gap-1">
              {shadowPresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange({ boxShadow: p.value })}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                    boxShadow === p.value
                      ? "bg-green/15 border-green text-green font-semibold"
                      : "border-border-default text-text-3 hover:text-text-0"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold text-text-3 block mb-1">Custom Shadow CSS</label>
            <input
              type="text"
              value={boxShadow || ""}
              onChange={(e) => onChange({ boxShadow: e.target.value })}
              placeholder="0 10px 25px -5px rgba(0, 0, 0, 0.3)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[11px] font-mono outline-none"
            />
          </div>
        </div>
      )}

      {/* Transform */}
      {activeTab === "transform" && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-[10px] uppercase font-semibold text-text-3 block mb-1">CSS Transform</label>
            <input
              type="text"
              value={transform || ""}
              onChange={(e) => onChange({ transform: e.target.value })}
              placeholder="e.g. rotate(-2deg) scale(1.02)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[11px] font-mono outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onChange({ transform: "rotate(-2deg)" })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-text-0"
            >
              Rotate -2°
            </button>
            <button
              type="button"
              onClick={() => onChange({ transform: "rotate(2deg)" })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-text-0"
            >
              Rotate +2°
            </button>
            <button
              type="button"
              onClick={() => onChange({ transform: "scale(1.03)" })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-text-0"
            >
              Scale 103%
            </button>
            <button
              type="button"
              onClick={() => onChange({ transform: undefined })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-red-400"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Filters & Glassmorphism */}
      {activeTab === "filters" && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-[10px] uppercase font-semibold text-text-3 block mb-1">CSS Filter</label>
            <input
              type="text"
              value={filter || ""}
              onChange={(e) => onChange({ filter: e.target.value })}
              placeholder="e.g. blur(4px) brightness(1.1)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[11px] font-mono outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onChange({ filter: "backdrop-filter: blur(12px)" })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-text-0"
            >
              Glassmorphism
            </button>
            <button
              type="button"
              onClick={() => onChange({ filter: "grayscale(100%)" })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-text-0"
            >
              Grayscale
            </button>
            <button
              type="button"
              onClick={() => onChange({ filter: "blur(4px)" })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-text-0"
            >
              Blur 4px
            </button>
            <button
              type="button"
              onClick={() => onChange({ filter: undefined })}
              className="px-2 py-1 text-[10px] rounded border border-border-default text-text-3 hover:text-red-400"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
