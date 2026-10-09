"use client";

import { useState } from "react";
import { Zap, Database, Check } from "lucide-react";
import { useConfigStore } from "@/components/openpage/store/configStore";

interface DynamicDataPickerProps {
  onSelectTag: (tag: string) => void;
}

export const DYNAMIC_REALESTATE_TAGS = [
  { group: "Project Info", tags: [
    { label: "Project Name", tag: "{{property.name}}", fallback: "Grand Vista" },
    { label: "Builder / Developer", tag: "{{property.builder}}", fallback: "Prestige Group" },
    { label: "Location", tag: "{{property.location}}", fallback: "Whitefield, Bangalore" },
    { label: "Property Type", tag: "{{property.type}}", fallback: "Luxury Apartments" },
    { label: "Project Status", tag: "{{property.status}}", fallback: "Under Construction" },
  ]},
  { group: "Pricing & Specs", tags: [
    { label: "Starting Price", tag: "{{property.startingPrice}}", fallback: "₹85 Lakhs*" },
    { label: "Carpet Area", tag: "{{property.carpetArea}}", fallback: "1,250 - 2,400 sq.ft." },
    { label: "Total Units", tag: "{{property.units}}", fallback: "450 Units" },
    { label: "Possession Date", tag: "{{property.possession}}", fallback: "Dec 2026" },
    { label: "RERA Number", tag: "{{property.reraNumber}}", fallback: "PRM/KA/RERA/1251/446/PR/12345" },
  ]},
];

export function DynamicDataPicker({ onSelectTag }: DynamicDataPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const property = useConfigStore((s) => s.config.property);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded text-amber-400/80 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
        title="Insert Dynamic Real Estate Field"
      >
        <Zap size={12} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-bg-1 border border-border-default rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.14)] p-2 z-50 text-xs animate-in fade-in select-none">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider border-b border-border-subtle mb-1">
              <Database size={11} />
              <span>Real Estate Dynamic Data</span>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 py-1">
              {DYNAMIC_REALESTATE_TAGS.map((group) => (
                <div key={group.group}>
                  <div className="text-[9px] font-semibold uppercase text-text-3 px-2 mb-0.5">
                    {group.group}
                  </div>
                  <div className="space-y-0.5">
                    {group.tags.map((item) => {
                      // Live value if property has it
                      const key = item.tag.replace(/[{}]/g, "").replace("property.", "") as keyof typeof property;
                      const liveVal = property?.[key] as string | undefined;

                      return (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => {
                            onSelectTag(liveVal || item.tag);
                            setIsOpen(false);
                          }}
                          className="w-full text-left px-2 py-1 rounded hover:bg-bg-3 flex items-center justify-between group transition-colors"
                        >
                          <span className="text-[11px] text-text-1 group-hover:text-text-0">
                            {item.label}
                          </span>
                          <span className="text-[10px] font-mono text-amber-400/80 max-w-[100px] truncate">
                            {liveVal || item.tag}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
