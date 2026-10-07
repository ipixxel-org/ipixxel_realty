"use client";

import { LayersPanel } from "./LayersPanel";

export function LeftSidebar() {
  return (
    <div data-tour="left-panel" className="hidden md:flex w-[300px] h-full min-h-0 bg-bg-1 border-r border-border-default flex-col shrink-0 overflow-hidden">
      <LayersPanel />
    </div>
  )
}