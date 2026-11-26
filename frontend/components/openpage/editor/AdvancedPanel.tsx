"use client";

import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { BlockConditional, BlockConfig, GlobalWidget } from "@/components/openpage/blocks/types";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { Section } from "./shared-components";

export const EMPTY_GLOBAL_WIDGETS: GlobalWidget[] = [];

/** Common dynamic fields exposed by the property data binding. */
const CONDITIONAL_FIELD_SUGGESTIONS = [
  "property.name",
  "property.startingPrice",
  "property.reraNumber",
  "property.possession",
  "property.location",
  "property.carpetArea",
  "property.landArea",
  "property.towers",
  "property.units",
  "property.description",
];

const animationOptions = [
  { value: '', label: 'None' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'fade-up', label: 'Fade Up' },
  { value: 'fade-down', label: 'Fade Down' },
  { value: 'fade-left', label: 'Fade Left' },
  { value: 'fade-right', label: 'Fade Right' },
  { value: 'scale-in', label: 'Scale In' },
  { value: 'scale-up', label: 'Scale Up' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
  { value: 'rotate-in', label: 'Rotate In' },
  { value: 'flip-in', label: 'Flip In' },
  { value: 'bounce-in', label: 'Bounce In' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'shake', label: 'Shake' },
  { value: 'float', label: 'Float' },
]

const durationOptions = [
  { value: 'fast', label: 'Fast (200ms)' },
  { value: 'normal', label: 'Normal (400ms)' },
  { value: 'slow', label: 'Slow (600ms)' },
  { value: 'slower', label: 'Slower (800ms)' },
  { value: 'slowest', label: 'Slowest (1200ms)' },
]

export function AdvancedPanel({ block }: { block: BlockConfig }) {
  const updateBlock = useConfigStore((s) => s.updateBlock)
  const { addGlobalWidget, removeGlobalWidget } = useConfigStore()
  const globalWidgets = useConfigStore((s) => s.config.globalWidgets ?? EMPTY_GLOBAL_WIDGETS)
  const [newWidgetName, setNewWidgetName] = useState('')

  function handleSaveAsGlobal() {
    const name = newWidgetName.trim()
    if (!name) return
    const gw: GlobalWidget = {
      id: `gw-${Date.now()}`,
      name,
      block: JSON.parse(JSON.stringify(block)),
      createdAt: Date.now(),
    }
    addGlobalWidget(gw)
    setNewWidgetName('')
    toast(`Global widget "${name}" saved`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3.5 py-2.5 border-b border-border-default">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-2">Advanced</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Animation */}
        <Section title="Entrance Animation">
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] text-text-3 mb-1">Animation</label>
              <select
                value={block.animation || ''}
                onChange={(e) => updateBlock(block.id, { animation: e.target.value })}
                className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green cursor-pointer"
              >
                {animationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {block.animation && (
              <>
                <div>
                  <label className="block text-[10px] text-text-3 mb-1">Duration</label>
                  <select
                    value={block.animationDuration || 'normal'}
                    onChange={(e) => updateBlock(block.id, { animationDuration: e.target.value })}
                    className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green cursor-pointer"
                  >
                    {durationOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-text-3 mb-1">Delay (ms)</label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={100}
                    value={block.animationDelay ? parseInt(block.animationDelay) : 0}
                    onChange={(e) => updateBlock(block.id, { animationDelay: e.target.value })}
                    className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green"
                  />
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Widget ID */}
        <Section title="Widget ID" defaultOpen={false}>
          <div>
            <label className="block text-[10px] text-text-3 mb-1">HTML ID</label>
            <input
              type="text"
              value={block.id}
              readOnly
              className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-3 text-text-3 text-[11px] font-mono"
            />
            <p className="text-[9px] text-text-3 mt-1">
              For menu scroll targets, set <b>Section ID</b> on the section Properties tab
              (e.g. <code>amenities</code>), then use that same ID in Header → Menu items.
            </p>
          </div>
        </Section>

        {/* Dynamic Conditional Rendering */}
        <Section title="Conditional Rendering (showIf)" defaultOpen={false}>
          <div className="space-y-2">
            <p className="text-[10px] text-text-3">
              Builder.io-style conditional logic: show or hide this block based on real estate dynamic fields.
            </p>
            <div>
              <label className="block text-[10px] text-text-3 mb-1">Field Name / Expression</label>
              <input
                type="text"
                list="op-conditional-fields"
                placeholder="e.g. property.reraNumber or property.startingPrice"
                value={block.conditional?.field || block.showIf || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  updateBlock(block.id, {
                    // Setting a structured rule retires any legacy showIf so
                    // the renderer doesn't keep evaluating the old expression.
                    showIf: undefined,
                    conditional: {
                      ...(block.conditional || { operator: "exists" }),
                      field: val,
                    },
                  });
                }}
                className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green font-mono"
              />
              <datalist id="op-conditional-fields">
                {CONDITIONAL_FIELD_SUGGESTIONS.map((field) => (
                  <option key={field} value={field} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-[10px] text-text-3 mb-1">Condition Rule</label>
              <select
                value={block.conditional?.operator || "exists"}
                onChange={(e) => {
                  updateBlock(block.id, {
                    conditional: {
                      ...(block.conditional || { field: "property.reraNumber" }),
                      operator: e.target.value as BlockConditional["operator"],
                    },
                  });
                }}
                className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green cursor-pointer"
              >
                <option value="exists">Is Present / Non-empty</option>
                <option value="notExists">Is Empty / Absent</option>
                <option value="equals">Equals Exact Value</option>
                <option value="notEquals">Does Not Equal</option>
                <option value="contains">Contains Substring</option>
              </select>
            </div>
            {["equals", "notEquals", "contains"].includes(block.conditional?.operator || "") && (
              <div>
                <label className="block text-[10px] text-text-3 mb-1">Target Value</label>
                <input
                  type="text"
                  placeholder="Expected value"
                  value={block.conditional?.value || ""}
                  onChange={(e) => {
                    updateBlock(block.id, {
                      conditional: {
                        ...(block.conditional || { field: "property.status", operator: "equals" }),
                        value: e.target.value,
                      },
                    });
                  }}
                  className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green"
                />
              </div>
            )}
            {block.conditional?.field && (
              <button
                type="button"
                onClick={() => updateBlock(block.id, { conditional: undefined, showIf: undefined })}
                className="text-[10px] text-status-red hover:underline mt-1"
              >
                Remove condition (always show)
              </button>
            )}
          </div>
        </Section>

        {/* Global Widget */}
        <Section title="Global Widget" defaultOpen={false}>
          {block.globalWidgetId ? (
            <div className="text-[11px] text-text-2">
              <p>This block is linked to global widget.</p>
              <button
                onClick={() => updateBlock(block.id, { globalWidgetId: undefined })}
                className="text-[10px] text-status-red hover:underline mt-1"
              >
                Unlink from global
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-text-3">Save this block as a reusable global widget.</p>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newWidgetName}
                  onChange={(e) => setNewWidgetName(e.target.value)}
                  placeholder="Widget name..."
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAsGlobal()}
                  className="flex-1 px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-[11px] outline-none focus:border-green"
                />
                <button
                  onClick={handleSaveAsGlobal}
                  disabled={!newWidgetName.trim()}
                  className="px-2 py-1.5 rounded bg-green text-bg-0 text-[11px] font-semibold hover:bg-green/90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Save size={12} />
                </button>
              </div>
              {globalWidgets.length > 0 && (
                <div className="space-y-1 mt-2">
                  <label className="block text-[10px] text-text-3">Saved Global Widgets</label>
                  {globalWidgets.map((gw) => (
                    <div key={gw.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg-2 border border-border-default">
                      <span className="text-[11px] text-text-1 flex-1 truncate">{gw.name}</span>
                      <span className="text-[9px] text-text-3">{gw.block.type}</span>
                      <button
                        onClick={() => { removeGlobalWidget(gw.id); toast(`Removed "${gw.name}"`) }}
                        className="p-0.5 rounded hover:bg-status-red/10 text-text-3 hover:text-status-red transition-colors"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
