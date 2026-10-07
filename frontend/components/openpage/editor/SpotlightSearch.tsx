"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search,
  Plus,
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  FileText,
  Settings2,
  Clock,
  Braces,
  Keyboard,
  Eye,
  Save,
  LayoutTemplate,
  Blocks,
  Globe,
  Layers,
  ClipboardList,
  Palette,
  Type,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Grid3X3,
  Rocket,
  Route,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore, type Viewport, type LeftTab, type RightSidebarTab } from "@/components/openpage/store/editorStore";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import type { BlockType } from "@/components/openpage/blocks/types";

interface SpotlightSearchProps {
  onClose: () => void;
}

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  iconColor?: string;
  keywords: string;
  run: () => void;
}

/** Switches the studio between Canvas Builder and Page Settings. */
function openStudioModule(module: "builder" | "settings") {
  window.dispatchEvent(new CustomEvent("op:set-module", { detail: { module } }));
}

export function SpotlightSearch({ onClose }: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const addBlock = useConfigStore((s) => s.addBlock);
  const pages = useConfigStore((s) => s.config.pages || []);

  // Mounted only while open (CanvasToolbar conditionally renders us), so
  // query/activeIndex reset on unmount — no setState-in-effect here.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Ctrl+K to close is handled by useOpenPageKeyboard (single source of
  // truth) — a second listener here would double-toggle the palette.

  const trimmed = query.trim().toLowerCase();

  const commands = useMemo<Command[]>(() => {
    const editor = useEditorStore.getState();
    const cfg = useConfigStore.getState();

    const leftTabs: { tab: LeftTab; label: string; icon: LucideIcon; color: string; kw: string }[] = [
      { tab: "templates", label: "Section templates", icon: LayoutTemplate, color: "#f59e0b", kw: "preset sections ready-made library" },
      { tab: "components", label: "Blocks library", icon: Blocks, color: "#38bdf8", kw: "widgets components add drag" },
      { tab: "globals", label: "Global widgets", icon: Globe, color: "#a78bfa", kw: "reusable saved" },
      { tab: "layers", label: "Layers", icon: Layers, color: "#34d399", kw: "structure outline reorder" },
      { tab: "forms", label: "Form builder", icon: ClipboardList, color: "#fb7185", kw: "lead form fields edit" },
    ];

    const rightTabs: { tab: RightSidebarTab; label: string; icon: LucideIcon; color: string; kw: string }[] = [
      { tab: "properties", label: "Inspector · Content", icon: Settings2, color: "#38bdf8", kw: "edit props text image" },
      { tab: "style", label: "Inspector · Style", icon: Palette, color: "#e879f9", kw: "color background border spacing" },
      { tab: "typography", label: "Inspector · Typography", icon: Type, color: "#f59e0b", kw: "font size weight" },
      { tab: "element", label: "Inspector · Element", icon: MousePointer2, color: "#22d3ee", kw: "individual element heading button" },
      { tab: "advanced", label: "Inspector · Advanced", icon: Layers, color: "#a78bfa", kw: "more animation anchor custom css" },
    ];

    const list: Command[] = [
      {
        id: "act-save",
        group: "Actions",
        label: "Save page",
        hint: "Ctrl+S",
        icon: Save,
        iconColor: "#34d399",
        keywords: "save persist draft autosave",
        run: () => window.dispatchEvent(new CustomEvent("op:save")),
      },
      {
        id: "act-preview",
        group: "Actions",
        label: "Toggle live preview",
        hint: "P",
        icon: Eye,
        iconColor: "#38bdf8",
        keywords: "preview fullscreen device",
        run: () => editor.togglePreview(),
      },
      {
        id: "act-undo",
        group: "Actions",
        label: "Undo",
        hint: "Ctrl+Z",
        icon: Undo2,
        iconColor: "#f59e0b",
        keywords: "undo revert back",
        run: () => cfg.undo(),
      },
      {
        id: "act-redo",
        group: "Actions",
        label: "Redo",
        hint: "Ctrl+Shift+Z",
        icon: Redo2,
        iconColor: "#f59e0b",
        keywords: "redo forward",
        run: () => cfg.redo(),
      },
      {
        id: "act-publish",
        group: "Actions",
        label: "Publish / Unpublish",
        hint: "top bar",
        icon: Rocket,
        iconColor: "#a78bfa",
        keywords: "publish unpublish live deploy go live",
        run: () => {
          onClose();
          const btn = document.querySelector<HTMLButtonElement>(".ps-topnav-btn--publish");
          btn?.click();
        },
      },
      {
        id: "act-settings",
        group: "Actions",
        label: "Open Page Settings",
        hint: "SEO · Branding · Tracking",
        icon: Settings2,
        iconColor: "#0ea5e9",
        keywords: "page settings seo analytics tracking branding typography social favicon custom code",
        run: () => openStudioModule("settings"),
      },
      {
        id: "act-tour",
        group: "Actions",
        label: "Take the guided tour",
        hint: "onboarding",
        icon: Route,
        iconColor: "#fbbf24",
        keywords: "tour guide onboarding help learn walkthrough",
        run: () => window.dispatchEvent(new CustomEvent("op:tour")),
      },
      {
        id: "act-shortcuts",
        group: "Actions",
        label: "Keyboard shortcuts",
        hint: "?",
        icon: Keyboard,
        iconColor: "#94a3b8",
        keywords: "shortcuts keys keyboard help",
        run: () => editor.toggleShortcutsModal(),
      },
      ...leftTabs.map<Command>((t) => ({
        id: `left-${t.tab}`,
        group: "Open panels",
        label: t.label,
        hint: "left panel",
        icon: t.icon,
        iconColor: t.color,
        keywords: `left panel ${t.kw}`,
        run: () => editor.openLeftTab(t.tab),
      })),
      ...rightTabs.map<Command>((t) => ({
        id: `right-${t.tab}`,
        group: "Open panels",
        label: t.label,
        hint: "right panel",
        icon: t.icon,
        iconColor: t.color,
        keywords: `right panel inspector ${t.kw}`,
        run: () => {
          editor.openRightSidebar();
          editor.setRightSidebarTab(t.tab);
        },
      })),
      {
        id: "panel-history",
        group: "Open panels",
        label: "Version history",
        hint: "H",
        icon: Clock,
        iconColor: "#34d399",
        keywords: "history versions undo stack revisions",
        run: () => editor.toggleHistory(),
      },
      {
        id: "panel-json",
        group: "Open panels",
        label: "JSON drawer",
        hint: "J",
        icon: Braces,
        iconColor: "#f59e0b",
        keywords: "json code source export raw",
        run: () => editor.toggleJsonDrawer(),
      },
      {
        id: "panel-collapse-left",
        group: "Open panels",
        label: "Toggle left panel",
        hint: "blocks & layers",
        icon: PanelLeft,
        iconColor: "#94a3b8",
        keywords: "hide show left sidebar blocks layers",
        run: () => editor.toggleLeftSidebar(),
      },
      {
        id: "panel-collapse-right",
        group: "Open panels",
        label: "Toggle right panel",
        hint: "inspector",
        icon: PanelRight,
        iconColor: "#94a3b8",
        keywords: "hide show right sidebar inspector properties",
        run: () => editor.toggleRightSidebar(),
      },
      {
        id: "act-grid",
        group: "Open panels",
        label: "Toggle alignment grid",
        icon: Grid3X3,
        iconColor: "#38bdf8",
        keywords: "grid alignment guides snap",
        run: () => editor.toggleShowGrid(),
      },
      ...(
        (["desktop", "tablet", "mobile"] as Viewport[]).map<Command>((v) => ({
          id: `vp-${v}`,
          group: "View",
          label: `${v.charAt(0).toUpperCase() + v.slice(1)} viewport`,
          icon: v === "desktop" ? Monitor : v === "tablet" ? Tablet : Smartphone,
          iconColor: v === "desktop" ? "#60a5fa" : v === "tablet" ? "#a78bfa" : "#34d399",
          keywords: `viewport device ${v} responsive`,
          run: () => editor.setViewport(v),
        }))
      ),
      ...pages.map<Command>((p) => ({
        id: `page-${p.id}`,
        group: "Pages",
        label: `Go to ${p.name}`,
        hint: p.path,
        icon: FileText,
        iconColor: "#fbbf24",
        keywords: `page jump switch open ${p.name} ${p.path}`,
        run: () => {
          useConfigStore.getState().setActivePage(p.id);
          toast.info(`Switched to ${p.name}`);
        },
      })),
      {
        id: "page-add",
        group: "Pages",
        label: "Add a new page",
        hint: "creates a blank page",
        icon: Plus,
        iconColor: "#34d399",
        keywords: "add new page create duplicate",
        run: () => {
          const n = pages.length + 1;
          let name = `Page ${n}`;
          while (pages.some((p) => p.name === name)) name = `${name} (2)`;
          const path = `/${name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "")}`;
          useConfigStore.getState().addPage(name, path);
          toast.success(`${name} added`);
        },
      },
    ];

    return list;
  }, [pages, onClose]);

  const matched = useMemo(() => {
    if (!trimmed) return commands;
    const tokens = trimmed.split(/\s+/);
    return commands.filter((c) => {
      const haystack = `${c.label} ${c.group} ${c.hint ?? ""} ${c.keywords}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [commands, trimmed]);

  // Cap insert-widget results so the palette stays scannable when empty/typing
  const visible = useMemo(() => {
    if (trimmed) return matched;
    return matched.filter((c) => c.group !== "Insert").concat(
      matched.filter((c) => c.group === "Insert").slice(0, 6),
    );
  }, [matched, trimmed]);

  const insertCommands = useMemo<Command[]>(
    () =>
      blockMetadata.map((b) => ({
        id: `ins-${b.type}`,
        group: "Insert",
        label: b.label,
        hint: b.category,
        icon: Plus,
        iconColor: "#38bdf8",
        keywords: `insert add widget block ${b.type} ${b.category}`,
        run: () => {
          const newBlock = createBlockFromType(b.type as BlockType);
          if (newBlock) {
            addBlock(newBlock);
            useEditorStore.getState().selectBlock(newBlock.id);
            useEditorStore.getState().setRightSidebarTab("properties");
            toast.success(`${b.label} inserted`);
          }
        },
      })),
    [addBlock],
  );

  const allResults = useMemo(() => {
    const base = trimmed ? matched.filter((c) => c.group !== "Insert") : visible.filter((c) => c.group !== "Insert");
    const inserts = (trimmed ? insertCommands.filter((c) => c.keywords.includes(trimmed) || c.label.toLowerCase().includes(trimmed)) : insertCommands.slice(0, 6));
    return [...base, ...inserts];
  }, [matched, insertCommands, trimmed, visible]);

  const runCommand = useCallback(
    (cmd: Command) => {
      onClose();
      // let the palette unmount before the command mutates UI state
      setTimeout(() => cmd.run(), 0);
    },
    [onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (allResults.length ? (i + 1) % allResults.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (allResults.length ? (i - 1 + allResults.length) % allResults.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = allResults[activeIndex];
      if (cmd) runCommand(cmd);
    }
  };

  // Keep the highlighted row scrolled into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, allResults.length]);

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#161a23] border border-border-default rounded-2xl shadow-2xl overflow-hidden flex flex-col select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-border-default gap-3 bg-bg-1">
          <Search size={16} className="text-text-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search widgets, pages, panels, actions… (Ctrl+K)"
            className="flex-1 bg-transparent text-text-0 text-sm outline-none placeholder:text-text-3"
            aria-label="Command palette search"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-bg-3 border border-border-default text-[10px] text-text-3 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-96 overflow-y-auto p-2 space-y-3">
          {allResults.length === 0 && (
            <div className="py-8 text-center text-text-3 text-xs">
              No matching widgets, pages or actions for &quot;{query}&quot;
            </div>
          )}

          {allResults.map((cmd, index) => {
            const showHeader = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            const Icon = cmd.icon;
            const isActive = index === activeIndex;
            return (
              <div key={cmd.id}>
                {showHeader && (
                  <div className="text-[10px] uppercase font-bold text-text-3 px-2 mb-1.5 mt-1 tracking-wider">
                    {cmd.group}
                  </div>
                )}
                <button
                  type="button"
                  data-cmd-index={index}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runCommand(cmd)}
                  className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between group transition-colors text-left ${
                    isActive ? "bg-bg-3" : "hover:bg-bg-3"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-6 h-6 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0"
                      style={cmd.iconColor ? { color: cmd.iconColor, backgroundColor: `${cmd.iconColor}14`, borderColor: `${cmd.iconColor}33` } : undefined}
                    >
                      <Icon size={13} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-text-1 group-hover:text-white font-medium truncate">{cmd.label}</div>
                      {cmd.hint ? <div className="text-[10px] text-text-3 truncate">{cmd.hint}</div> : null}
                    </div>
                  </div>
                  <span className="text-[11px] text-green flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <span>{cmd.group === "Insert" ? "Insert" : "Open"}</span>
                    <ArrowRight size={11} />
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-border-default bg-bg-1 flex items-center justify-between text-[10.5px] text-text-3">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span className="text-text-3">OpenPage Command Center</span>
        </div>
      </div>
    </div>
  );
}
