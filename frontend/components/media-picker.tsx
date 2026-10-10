"use client";

import { useId, useRef, useState } from "react";
import { Link2, Sparkles, Trash2, Upload, AlertCircle } from "lucide-react";
import { isMediaSrc, readMediaFile } from "@/lib/media";
import { useBuilderImageUpload } from "@/components/openpage/builder/upload-context";

export function MediaPicker({
  kind,
  label,
  value,
  onChange,
  iconNames,
  compact,
}: {
  kind: "image" | "icon";
  label?: string;
  value: string;
  onChange: (v: string) => void;
  iconNames?: string[];
  compact?: boolean;
}) {
  const fileInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadImage = useBuilderImageUpload();
  const src = value.trim();
  const showImg = isMediaSrc(src);

  const handleTriggerUpload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setSuccess("");

    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds 5 MB limit. Please select a smaller file.");
      return;
    }

    // In the builder: attempt cloud upload first
    if (uploadImage) {
      setUploading(true);
      try {
        const url = await uploadImage(file);
        onChange(url);
        setSuccess(`Uploaded ${file.name}`);
        return;
      } catch (err) {
        console.warn("Cloud upload failed, falling back to inline data URL:", err);
        // Seamless fallback to inline data URI so user is NEVER blocked!
        const result = await readMediaFile(file);
        if (result.ok) {
          onChange(result.data);
          setSuccess(`Uploaded ${file.name}`);
          return;
        }
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
      return;
    }

    // Fallback: direct inline data URI
    const result = await readMediaFile(file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.data);
    setSuccess(`Uploaded ${file.name}`);
  };

  return (
    <div className="w-full">
      {label ? (
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-3 mb-1.5">
          {label}
        </div>
      ) : null}

      <div className={`flex gap-2.5 ${compact ? "items-center" : "items-start py-1"}`}>
        {/* Preview / Trigger thumbnail */}
        <button
          type="button"
          onClick={handleTriggerUpload}
          title={kind === "icon" ? "Upload icon file" : "Upload image file"}
          className={`shrink-0 rounded-xl border border-dashed border-border-default hover:border-green bg-bg-2/70 flex items-center justify-center overflow-hidden cursor-pointer transition-all hover:scale-105 shadow-sm ${
            compact ? "w-10 h-10" : "w-12 h-12"
          }`}
        >
          {uploading ? (
            <span className="text-[10px] font-bold text-green animate-pulse">…</span>
          ) : showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="w-full h-full object-cover" />
          ) : (
            <Upload size={compact ? 14 : 16} className="text-text-3 hover:text-green" />
          )}
        </button>

        {/* Input & buttons container */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleTriggerUpload}
              disabled={uploading}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11px] font-semibold hover:bg-bg-3 hover:border-border-hover transition-colors cursor-pointer select-none ${
                uploading ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <Upload size={12} className="text-green" />
              <span>{uploading ? "Uploading…" : kind === "icon" ? "Upload Icon" : "Upload File"}</span>
            </button>

            {src ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setSuccess("");
                  setError("");
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-status-red hover:bg-status-red/10 transition-colors"
                title="Remove"
              >
                <Trash2 size={11} />
                <span>Clear</span>
              </button>
            ) : null}
          </div>

          <div className="relative">
            <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none" />
            <input
              value={src.startsWith("data:") ? "" : src}
              onChange={(e) => {
                setError("");
                setSuccess("");
                onChange(e.target.value);
              }}
              placeholder={kind === "icon" ? "Icon URL, SVG or name" : "Image URL (https://…)"}
              className="w-full pl-7 pr-2.5 py-1 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none hover:border-border-hover focus:border-green focus:bg-bg-2 transition-all placeholder:text-text-3"
            />
          </div>

          {success ? (
            <div className="text-[9.5px] text-green font-medium flex items-center gap-1">
              <span>✓ {success}</span>
            </div>
          ) : src.startsWith("data:") ? (
            <div className="text-[9.5px] text-green font-medium flex items-center gap-1">
              <span>✓ File uploaded & saved</span>
            </div>
          ) : null}
        </div>
      </div>

      {kind === "icon" && iconNames && iconNames.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] font-semibold text-text-3 mb-1 flex items-center gap-1">
            <Sparkles size={11} className="text-amber-400" /> Built-in icons
          </div>
          <select
            value={iconNames.includes(src) ? src : ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green"
          >
            <option value="">Custom upload / URL</option>
            {iconNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <div className="text-[11px] text-status-red mt-1.5 flex items-center gap-1 bg-status-red/10 border border-status-red/20 px-2 py-1 rounded-md">
          <AlertCircle size={11} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Hidden file input with explicit ref and id */}
      <input
        id={fileInputId}
        ref={inputRef}
        type="file"
        accept="image/*,.svg"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="hidden"
      />
    </div>
  );
}
