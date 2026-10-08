"use client";

import { LeftSidebar } from "./LeftSidebar";
import { Canvas } from "./Canvas";
import { RightSidebar } from "./RightSidebar";
import { JsonDrawer } from "./JsonDrawer";
import { VersionHistory } from "./VersionHistory";
import { CanvasToolbar } from "./CanvasToolbar";
import { ShortcutsModal } from "./ShortcutsModal";
import { OnboardingTour } from "./OnboardingTour";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { OpenPageRuntimeProvider } from "@/components/openpage/runtime/OpenPageRuntime";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { Toaster } from "sonner";
import { useOpenPageKeyboard } from "@/lib/openpage/useKeyboardShortcuts";
import type { Resource } from "@/lib/openpage/persist";
import { PanelLeft, PanelRight } from "lucide-react";

function EdgeStrip({
  side,
  title,
}: {
  side: "left" | "right";
  title: string;
}) {
  const openLeftSidebar = useEditorStore((s) => s.openLeftSidebar);
  const openRightSidebar = useEditorStore((s) => s.openRightSidebar);
  const open = side === "left" ? openLeftSidebar : openRightSidebar;
  const Icon = side === "left" ? PanelLeft : PanelRight;
  return (
    <button
      type="button"
      onClick={open}
      className={`hidden md:flex w-7 h-full items-center justify-center bg-bg-1 ${
        side === "left" ? "border-r" : "border-l"
      } border-border-default text-text-3 hover:text-green hover:bg-bg-3 transition-colors shrink-0`}
      title={title}
    >
      <Icon size={14} />
    </button>
  );
}

export function EditorLayout({
  pageId,
  captureLeads = true,
  resource = "landing-page",
}: {
  pageId?: string;
  /** When true and pageId is set, canvas form submits write to CRM (same as Preview). */
  captureLeads?: boolean;
  /** Which backend resource this session edits — gates Version History's
   *  server-side saved versions (org landing pages have them; templates
   *  don't yet). */
  resource?: Resource;
}) {
  useOpenPageKeyboard();
  const previewMode = useEditorStore((s) => s.previewMode);
  const leftSidebarOpen = useEditorStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useEditorStore((s) => s.rightSidebarOpen);
  const config = useConfigStore((s) => s.config);
  const canCapture = Boolean(captureLeads && pageId);

  return (
    <OpenPageRuntimeProvider
      live={canCapture}
      pageId={pageId}
      projectName={config.property?.name || config.name}
      projectId={
        config.propertyBinding?.kind === "project"
          ? config.propertyBinding.projectId
          : undefined
      }
      unitId={
        config.propertyBinding?.kind === "unit"
          ? config.propertyBinding.unitId
          : undefined
      }
      forms={config.forms ?? []}
      popups={config.popups ?? []}
    >
      <div className="op-root h-full flex flex-col relative min-h-0">
        <Toaster theme="dark" position="bottom-right" />
        <div className="flex-1 flex overflow-hidden min-h-0">
          {!previewMode &&
            (leftSidebarOpen ? (
              <LeftSidebar />
            ) : (
              <EdgeStrip side="left" title="Open builder panel" />
            ))}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <CanvasToolbar />
            <div className="flex-1 flex flex-col overflow-hidden relative">
              <Canvas />
              <JsonDrawer />
            </div>
          </div>
          {!previewMode &&
            (rightSidebarOpen ? (
              <RightSidebar />
            ) : (
              <EdgeStrip side="right" title="Open inspector" />
            ))}
        </div>
        <VersionHistory pageId={pageId} resource={resource} />
        <ShortcutsModal />
        <OnboardingTour />
      </div>
    </OpenPageRuntimeProvider>
  );
}