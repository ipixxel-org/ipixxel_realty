"use client";

import {
  Box,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Monitor,
  MousePointerClick,
  Palette,
  RotateCcw,
  Smartphone,
  Sparkles,
  Tablet,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import type { BlockConfig, BlockInteractionState, BlockStyle } from "@/components/openpage/blocks/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { resolveBlockStyleForDevice } from "@/lib/openpage/block-style";
import { isElementHidden } from "@/lib/openpage/element-style";
import type { Device } from "@/lib/openpage/types";
import { ColorInput, Section } from "./shared-components";
import { MediaPicker } from "@/components/media-picker";
import {
  AlignButtons,
  DimensionField,
  InteractionColorControls,
  SegmentedField,
  SelectField,
  SliderField,
  SpacingControl,
  TextField,
  TypographyControls,
} from "./style-controls";

const DEVICES: Array<{ value: Device; icon: typeof Monitor; label: string }> = [
  { value: "desktop", icon: Monitor, label: "Desktop" },
  { value: "tablet", icon: Tablet, label: "Tablet" },
  { value: "mobile", icon: Smartphone, label: "Mobile" },
];

const RADIUS_PRESETS = ["0px", "4px", "8px", "16px", "24px", "9999px"];
const SHADOW_PRESETS = [
  { label: "None", value: "none" },
  { label: "Soft", value: "0 2px 8px rgba(0,0,0,0.08)" },
  { label: "Medium", value: "0 8px 24px rgba(0,0,0,0.15)" },
  { label: "Glow", value: "0 10px 30px rgba(0,0,0,0.5)" },
];

/**
 * Where an image element's picture comes from, so the Element tab can replace
 * it in place: a block prop for fixed images (`text:image`, `cta:media`) or a
 * field of the list item for card images (`items:it_1/image`).
 */
function useImageSource(block: BlockConfig, elementId: string): { value: string; set: (url: string) => void } | null {
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps);
  const updateListItem = useConfigStore((s) => s.updateListItem);

  if (elementId === `${block.type}:image` || elementId === `${block.type}:media`) {
    const key = typeof block.props.image === "string" || !("src" in block.props) ? "image" : "src";
    return {
      value: typeof block.props[key] === "string" ? (block.props[key] as string) : "",
      set: (url) => updateBlockProps(block.id, { [key]: url }),
    };
  }

  const item = /^([^:/]+):([^/]+)\/(image|media)$/.exec(elementId);
  if (item) {
    const [, listKey, itemId] = item;
    const list = block.props[listKey];
    const entry = Array.isArray(list)
      ? (list as Array<Record<string, unknown>>).find((it) => it && it._id === itemId)
      : undefined;
    if (!entry) return null;
    const key = typeof entry.image === "string" || typeof entry.src !== "string" ? "image" : "src";
    return {
      value: typeof entry[key] === "string" ? (entry[key] as string) : "",
      set: (url) => updateListItem(block.id, { path: [listKey] }, itemId, { [key]: url }),
    };
  }
  return null;
}

const JUSTIFY_OPTIONS = [
  { value: "", label: "Default" },
  { value: "flex-start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "flex-end", label: "End" },
  { value: "space-between", label: "Between" },
  { value: "space-around", label: "Around" },
  { value: "space-evenly", label: "Evenly" },
];

const ALIGN_ITEMS_OPTIONS = [
  { value: "", label: "Default" },
  { value: "flex-start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "flex-end", label: "End" },
  { value: "stretch", label: "Stretch" },
  { value: "baseline", label: "Baseline" },
];

/**
 * Styles a single element inside a section — a heading, a paragraph, Button 1,
 * a card, a tab, a footer column, a menu item.
 *
 * Shares its controls with the block-level panels so a section's element and
 * its container can never drift apart visually, and writes to the block's
 * `elementStyles` map keyed by the element's stable id.
 */
export function ElementStylePanel({
  block,
  elementId,
  label,
}: {
  block: BlockConfig;
  elementId: string;

  label?: string;
}) {
  const setElementStyle = useConfigStore((s) => s.setElementStyle);
  const resetElementStyle = useConfigStore((s) => s.resetElementStyle);
  const clearElementSelectionStyle = useConfigStore((s) => s.clearElementSelectionStyle);
  const device = useEditorStore((s) => s.viewport);
  const setViewport = useEditorStore((s) => s.setViewport);

  const raw = block.elementStyles?.[elementId];
  const effective = resolveBlockStyleForDevice(raw, device) || {};
  const title = label || elementId;

  const set = (partial: Partial<BlockStyle>) => setElementStyle(block.id, elementId, partial, device);
  // Nested objects must merge against the value that is *effective* on this
  // device: `setElementStyle` writes into `responsive[device]` for tablet and
  // mobile, so merging with the desktop root would flatten the override.
  const setTypo = (partial: Partial<NonNullable<BlockStyle["typography"]>>) =>
    set({ typography: { ...(effective.typography || {}), ...partial } });
  const setState = (key: "hover" | "active", partial: BlockInteractionState) =>
    set({ [key]: { ...(effective[key] || {}), ...partial } } as Partial<BlockStyle>);

  const typography = effective.typography || {};
  const isHidden = isElementHidden(raw, device);
  const imageSource = useImageSource(block, elementId);

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 border-b border-border-default shrink-0 space-y-2.5 bg-bg-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Sparkles size={12} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-0 truncate">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                useEditorStore.getState().setClipboardStyle(raw as Partial<BlockStyle> | undefined ?? null);
                toast.success("Element style copied");
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:border-border-hover transition-colors"
              title="Copy element style"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                const pasted = useEditorStore.getState().clipboardStyle;
                if (!pasted) {
                  toast.error("No style in clipboard");
                  return;
                }
                const { responsive: _responsive, ...rest } = pasted;
                void _responsive;
                set(rest);
                toast.success("Element style applied");
              }}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-text-1 hover:border-border-hover transition-colors"
              title="Paste element style"
            >
              <Clipboard size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                resetElementStyle(block.id, elementId);
                toast.success(`${title} reset to default`);
              }}
              disabled={!raw}
              className="p-1.5 rounded-md border border-border-default bg-bg-2 text-text-3 hover:text-status-red hover:border-status-red/40 transition-colors disabled:opacity-40 disabled:hover:text-text-3 disabled:hover:border-border-default"
              title="Reset to default"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-border-subtle bg-bg-2">
          {DEVICES.map(({ value, icon: Icon, label: text }) => {
            const active = device === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setViewport(value)}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10.5px] font-semibold transition-all ${
                  active
                    ? "bg-green/15 text-green shadow-sm border border-green/30"
                    : "text-text-3 hover:text-text-1 hover:bg-bg-3 border border-transparent"
                }`}
              >
                <Icon size={12} />
                <span>{text}</span>
              </button>
            );
          })}
        </div>

        {device !== "desktop" ? (
          <button
            type="button"
            onClick={() => resetElementStyle(block.id, elementId, device)}
            className="w-full text-[10px] text-text-3 hover:text-green transition-colors"
          >
            Reset {device} overrides only
          </button>
        ) : null}
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain pb-24">
        <Section title="Visibility" icon={isHidden ? <EyeOff size={12} /> : <Eye size={12} />}>
          <div className="space-y-2">
            <label className="flex items-center justify-between p-2 rounded-lg border border-border-default bg-bg-2/50 hover:bg-bg-3 cursor-pointer transition-colors">
              <span className="text-[11px] text-text-1">Hide this element</span>
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => set({ hidden: e.target.checked || undefined })}
                className="w-4 h-4 rounded border-border-default bg-bg-2 accent-green cursor-pointer"
              />
            </label>
            {[
              { key: "hideOnDesktop" as const, label: "Hide on Desktop", Icon: Monitor },
              { key: "hideOnTablet" as const, label: "Hide on Tablet", Icon: Tablet },
              { key: "hideOnMobile" as const, label: "Hide on Mobile", Icon: Smartphone },
            ].map(({ key, label: text, Icon }) => (
              <label
                key={key}
                className="flex items-center justify-between p-2 rounded-lg border border-border-default bg-bg-2/50 hover:bg-bg-3 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2 text-[11px] text-text-1">
                  <Icon size={13} className="text-text-3" />
                  {text}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(raw?.[key])}
                  onChange={(e) => set({ [key]: e.target.checked || undefined })}
                  className="w-4 h-4 rounded border-border-default bg-bg-2 accent-green cursor-pointer"
                />
              </label>
            ))}
          </div>
        </Section>

        <Section title="Typography" icon={<Type size={12} />}>
          <TypographyControls
            value={typography}
            onChange={(partial) => setTypo(partial)}
            previewText={title}
          />
        </Section>

        <Section title="Colors" icon={<Palette size={12} />}>
          <div className="space-y-3">
            <ColorInput
              label="Text Color"
              value={typography.color}
              onChange={(v) => setTypo({ color: v })}
            />
            <ColorInput
              label="Background Color"
              value={effective.backgroundColor}
              onChange={(v) => set({ backgroundColor: v })}
            />
            <ColorInput
              label="Border Color"
              value={effective.borderColor}
              onChange={(v) => set({ borderColor: v })}
            />
          </div>
        </Section>

        <InteractionColorControls
          label="Hover State"
          value={raw?.hover}
          onChange={(partial) => setState("hover", partial)}
        />

        <InteractionColorControls
          label="Active State"
          value={raw?.active}
          onChange={(partial) => setState("active", partial)}
        />

        <Section title="Layout & Flex" defaultOpen={false} icon={<Box size={12} />}>
          <div className="space-y-3">
            <SelectField
              label="Display"
              value={effective.display ?? ""}
              onChange={(v) => set({ display: v || undefined })}
              options={[
                { value: "", label: "Default" },
                { value: "block", label: "Block" },
                { value: "inline-block", label: "Inline Block" },
                { value: "flex", label: "Flex" },
                { value: "inline-flex", label: "Inline Flex" },
                { value: "grid", label: "Grid" },
                { value: "inline-grid", label: "Inline Grid" },
                { value: "none", label: "None" },
              ]}
            />
            <SegmentedField
              label="Flex Direction"
              value={effective.flexDirection ?? "row"}
              onChange={(v) => set({ flexDirection: v })}
              columns={4}
              options={[
                { value: "row", label: "Row" },
                { value: "row-reverse", label: "Row Rev" },
                { value: "column", label: "Column" },
                { value: "column-reverse", label: "Col Rev" },
              ]}
            />
            <SegmentedField
              label="Flex Wrap"
              value={effective.flexWrap ?? "nowrap"}
              onChange={(v) => set({ flexWrap: v })}
              columns={2}
              options={[
                { value: "nowrap", label: "No Wrap" },
                { value: "wrap", label: "Wrap" },
              ]}
            />
            <SelectField
              label="Justify Content"
              value={effective.justifyContent ?? ""}
              onChange={(v) => set({ justifyContent: v || undefined })}
              options={JUSTIFY_OPTIONS}
            />
            <SelectField
              label="Align Items"
              value={effective.alignItems ?? ""}
              onChange={(v) => set({ alignItems: v || undefined })}
              options={ALIGN_ITEMS_OPTIONS}
            />
            <SelectField
              label="Align Self"
              value={effective.alignSelf ?? ""}
              onChange={(v) => set({ alignSelf: v || undefined })}
              options={[
                { value: "", label: "Default" },
                { value: "flex-start", label: "Start" },
                { value: "center", label: "Center" },
                { value: "flex-end", label: "End" },
                { value: "stretch", label: "Stretch" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <DimensionField
                label="Gap"
                value={effective.gap}
                onChange={(v) => set({ gap: v })}
                presets={["0px", "8px", "16px", "24px"]}
              />
              <DimensionField
                label="Flex Basis"
                value={effective.flex}
                onChange={(v) => set({ flex: v })}
                placeholder="auto / 0 0 200px"
              />
            </div>
            <TextField
              label="Alignment"
              value={effective.alignment}
              onChange={(v) => set({ alignment: v })}
              placeholder="inherit"
            />
            <AlignButtons
              value={typography.textAlign}
              onChange={(v) => setTypo({ textAlign: v })}
            />
          </div>
        </Section>

        <Section title="Spacing & Size" defaultOpen={false} icon={<Layers size={12} />}>
          <div className="space-y-4">
            <SpacingControl
              title="Margin"
              top={effective.marginTop}
              right={effective.marginRight}
              bottom={effective.marginBottom}
              left={effective.marginLeft}
              onChange={(v) =>
                set({
                  marginTop: v.top,
                  marginRight: v.right,
                  marginBottom: v.bottom,
                  marginLeft: v.left,
                })
              }
            />
            <SpacingControl
              title="Padding"
              top={effective.paddingTop}
              right={effective.paddingRight}
              bottom={effective.paddingBottom}
              left={effective.paddingLeft}
              onChange={(v) =>
                set({
                  paddingTop: v.top,
                  paddingRight: v.right,
                  paddingBottom: v.bottom,
                  paddingLeft: v.left,
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <DimensionField
                label="Width"
                value={effective.width}
                onChange={(v) => set({ width: v })}
                presets={["100%", "auto", "50%"]}
              />
              <DimensionField
                label="Height"
                value={effective.height}
                onChange={(v) => set({ height: v })}
                presets={["auto", "120px", "100%"]}
              />
              <DimensionField
                label="Max Width"
                value={effective.maxWidth}
                onChange={(v) => set({ maxWidth: v })}
                presets={["100%", "640px"]}
              />
              <DimensionField
                label="Min Height"
                value={effective.minHeight}
                onChange={(v) => set({ minHeight: v })}
                presets={["auto", "120px"]}
              />
            </div>
          </div>
        </Section>

        <Section title="Border & Radius" defaultOpen={false} icon={<Box size={12} />}>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
                  Corner Radius
                </label>
                <div className="flex items-center gap-1">
                  {RADIUS_PRESETS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set({ borderRadius: r })}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                        effective.borderRadius === r
                          ? "bg-green/15 border-green/40 text-green font-medium"
                          : "border-border-default text-text-3 hover:text-text-1 hover:bg-bg-3"
                      }`}
                    >
                      {r.replace("px", "")}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={effective.borderRadius || ""}
                onChange={(e) => set({ borderRadius: e.target.value })}
                placeholder="e.g. 12px or 9999px"
                className="w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none hover:border-border-hover focus:border-green"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DimensionField
                label="Border Width"
                value={effective.borderWidth}
                onChange={(v) => set({ borderWidth: v })}
                presets={["1px", "2px"]}
                placeholder="0px"
              />
              <SelectField
                label="Border Style"
                value={effective.borderStyle ?? ""}
                onChange={(v) => set({ borderStyle: v || undefined })}
                options={[
                  { value: "", label: "None" },
                  { value: "solid", label: "Solid" },
                  { value: "dashed", label: "Dashed" },
                  { value: "dotted", label: "Dotted" },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section title="Image" defaultOpen={Boolean(imageSource)} icon={<MousePointerClick size={12} />}>
          <div className="space-y-3">
            {imageSource ? (
              <MediaPicker kind="image" label="Image" value={imageSource.value} compact onChange={imageSource.set} />
            ) : (
              <p className="text-[10px] text-text-3 leading-snug">
                Fit, position and ratio apply to the image inside this element. Change the picture itself in the
                Content tab.
              </p>
            )}
            <SelectField
              label="Object Fit"
              value={effective.objectFit ?? ""}
              onChange={(v) => set({ objectFit: v || undefined })}
              options={[
                { value: "", label: "Default" },
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
                { value: "fill", label: "Fill" },
                { value: "none", label: "None" },
                { value: "scale-down", label: "Scale Down" },
              ]}
            />
            <TextField
              label="Object Position"
              value={effective.objectPosition}
              onChange={(v) => set({ objectPosition: v })}
              placeholder="center / top / 50% 20%"
            />
            <TextField
              label="Aspect Ratio"
              value={effective.aspectRatio}
              onChange={(v) => set({ aspectRatio: v })}
              placeholder="16 / 9"
            />
          </div>
        </Section>

        <Section title="Effects" defaultOpen={false} icon={<Sparkles size={12} />}>
          <div className="space-y-3">
            <SliderField
              label="Opacity"
              value={Number.parseFloat(effective.opacity || "1")}
              min={0}
              max={1}
              step={0.05}
              display={`${Math.round(Number.parseFloat(effective.opacity || "1") * 100)}%`}
              onChange={(v) => set({ opacity: v })}
            />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
                  Shadow
                </label>
                <div className="flex items-center gap-1">
                  {SHADOW_PRESETS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => set({ boxShadow: s.value })}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                        effective.boxShadow === s.value
                          ? "bg-green/15 border-green/40 text-green font-medium"
                          : "border-border-default text-text-3 hover:text-text-1 hover:bg-bg-3"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={effective.boxShadow || ""}
                onChange={(e) => set({ boxShadow: e.target.value })}
                placeholder="none / 0 4px 12px rgba(0,0,0,0.15)"
                className="w-full px-2.5 py-1.5 rounded-lg border border-border-default bg-bg-2/80 text-text-0 text-[11px] font-mono outline-none hover:border-border-hover focus:border-green"
              />
            </div>
            <TextField
              label="Transform"
              value={effective.transform}
              onChange={(v) => set({ transform: v })}
              placeholder="none / translateY(-4px) scale(1.02)"
            />
            <TextField
              label="Transition"
              value={effective.transition}
              onChange={(v) => set({ transition: v })}
              placeholder="all 300ms ease"
            />
          </div>
        </Section>

        {/* Bulk reset for every element in this section. */}
        {block.elementStyles && Object.keys(block.elementStyles).length > 1 ? (
          <button
            type="button"
            onClick={() => {
              clearElementSelectionStyle(block.id, Object.keys(block.elementStyles || {}));
              toast.success("All element styles reset for this section");
            }}
            className="w-full py-2 rounded-lg border border-status-red/30 text-status-red bg-status-red/5 hover:bg-status-red/10 transition-colors text-[11px] font-medium"
          >
            Reset all element styles in this section
          </button>
        ) : null}
      </div>
    </div>
  );
}