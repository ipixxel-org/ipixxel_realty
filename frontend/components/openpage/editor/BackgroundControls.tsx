"use client";

import { useState } from "react";
import { Palette, Image as ImageIcon, Sparkles, Layers, Sliders } from "lucide-react";
import { ColorInput } from "./shared-components";
import { MediaPicker } from "@/components/media-picker";

interface BackgroundControlsProps {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  overlayColor?: string;
  overlayOpacity?: string;
  onChange: (updates: {
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    backgroundRepeat?: string;
    overlayColor?: string;
    overlayOpacity?: string;
  }) => void;
}

export function BackgroundControls({
  backgroundColor,
  backgroundImage,
  backgroundSize = "cover",
  backgroundPosition = "center",
  backgroundRepeat = "no-repeat",
  overlayColor,
  overlayOpacity,
  onChange,
}: BackgroundControlsProps) {
  const [bgType, setBgType] = useState<"color" | "gradient" | "image">(() => {
    if (backgroundImage?.includes("gradient")) return "gradient";
    if (backgroundImage) return "image";
    return "color";
  });

  const [gradientAngle, setGradientAngle] = useState(135);
  const [gradientColor1, setGradientColor1] = useState("#1e1b4b");
  const [gradientColor2, setGradientColor2] = useState("#0f172a");

  const applyGradient = (angle: number, c1: string, c2: string) => {
    const css = `linear-gradient(${angle}deg, ${c1}, ${c2})`;
    onChange({ backgroundImage: css, backgroundColor: undefined });
  };

  const rawImageUrl =
    backgroundImage && !backgroundImage.includes("gradient")
      ? backgroundImage.replace(/^url\(['"]?/, "").replace(/['"]?\)$/, "")
      : "";

  return (
    <div className="space-y-3">
      {/* Background Type Selector (Elementor Classic / Gradient / Image) */}
      <div className="flex rounded-lg border border-border-default bg-bg-2 p-0.5">
        <button
          type="button"
          onClick={() => {
            setBgType("color");
            onChange({ backgroundImage: undefined });
          }}
          className={`flex-1 py-1 text-[11px] rounded flex items-center justify-center gap-1.5 transition-all ${
            bgType === "color"
              ? "bg-green/15 text-green font-semibold shadow-xs"
              : "text-text-3 hover:text-text-1"
          }`}
        >
          <Palette size={12} /> Color
        </button>

        <button
          type="button"
          onClick={() => {
            setBgType("gradient");
            applyGradient(gradientAngle, gradientColor1, gradientColor2);
          }}
          className={`flex-1 py-1 text-[11px] rounded flex items-center justify-center gap-1.5 transition-all ${
            bgType === "gradient"
              ? "bg-green/15 text-green font-semibold shadow-xs"
              : "text-text-3 hover:text-text-1"
          }`}
        >
          <Sparkles size={12} /> Gradient
        </button>

        <button
          type="button"
          onClick={() => setBgType("image")}
          className={`flex-1 py-1 text-[11px] rounded flex items-center justify-center gap-1.5 transition-all ${
            bgType === "image"
              ? "bg-green/15 text-green font-semibold shadow-xs"
              : "text-text-3 hover:text-text-1"
          }`}
        >
          <ImageIcon size={12} /> Image
        </button>
      </div>

      {/* Solid Color */}
      {bgType === "color" && (
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
            Background Color
          </label>
          <ColorInput
            value={backgroundColor || ""}
            onChange={(val) => onChange({ backgroundColor: val, backgroundImage: undefined })}
          />
        </div>
      )}

      {/* Gradient */}
      {bgType === "gradient" && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-text-3 font-semibold uppercase mb-1 block">Color 1</label>
              <ColorInput
                value={gradientColor1}
                onChange={(c) => {
                  setGradientColor1(c);
                  applyGradient(gradientAngle, c, gradientColor2);
                }}
              />
            </div>
            <div>
              <label className="text-[10px] text-text-3 font-semibold uppercase mb-1 block">Color 2</label>
              <ColorInput
                value={gradientColor2}
                onChange={(c) => {
                  setGradientColor2(c);
                  applyGradient(gradientAngle, gradientColor1, c);
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-text-3 font-semibold mb-1">
              <span>ANGLE</span>
              <span>{gradientAngle}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={gradientAngle}
              onChange={(e) => {
                const angle = parseInt(e.target.value, 10);
                setGradientAngle(angle);
                applyGradient(angle, gradientColor1, gradientColor2);
              }}
              className="w-full accent-green cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Image */}
      {bgType === "image" && (
        <div className="space-y-3 pt-1">
          <MediaPicker
            kind="image"
            label="Background Image"
            value={rawImageUrl}
            compact
            onChange={(url) =>
              onChange({ backgroundImage: url ? `url('${url}')` : undefined })
            }
          />

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] uppercase font-semibold text-text-3 mb-1 block">Size</label>
              <select
                value={backgroundSize}
                onChange={(e) => onChange({ backgroundSize: e.target.value })}
                className="w-full px-2 py-1 rounded bg-bg-2 border border-border-default text-text-0 text-[10.5px] outline-none"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="auto">Auto</option>
                <option value="100% 100%">Stretch</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] uppercase font-semibold text-text-3 mb-1 block">Position</label>
              <select
                value={backgroundPosition}
                onChange={(e) => onChange({ backgroundPosition: e.target.value })}
                className="w-full px-2 py-1 rounded bg-bg-2 border border-border-default text-text-0 text-[10.5px] outline-none"
              >
                <option value="center">Center</option>
                <option value="top center">Top</option>
                <option value="bottom center">Bottom</option>
                <option value="center left">Left</option>
                <option value="center right">Right</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] uppercase font-semibold text-text-3 mb-1 block">Repeat</label>
              <select
                value={backgroundRepeat}
                onChange={(e) => onChange({ backgroundRepeat: e.target.value })}
                className="w-full px-2 py-1 rounded bg-bg-2 border border-border-default text-text-0 text-[10.5px] outline-none"
              >
                <option value="no-repeat">No Repeat</option>
                <option value="repeat">Repeat</option>
                <option value="repeat-x">Repeat X</option>
                <option value="repeat-y">Repeat Y</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Background Overlay */}
      <div className="pt-2 border-t border-border-subtle">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-1.5 flex items-center justify-between">
          <span>Background Overlay</span>
          {overlayColor && (
            <button
              type="button"
              onClick={() => onChange({ overlayColor: undefined, overlayOpacity: undefined })}
              className="text-[9px] text-text-3 hover:text-text-0"
            >
              Clear
            </button>
          )}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <ColorInput
            value={overlayColor || ""}
            onChange={(val) => onChange({ overlayColor: val })}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] text-text-3">Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={overlayOpacity ? Math.round(parseFloat(overlayOpacity) * 100) : 50}
              onChange={(e) => onChange({ overlayOpacity: (parseInt(e.target.value, 10) / 100).toString() })}
              className="w-full accent-green cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
