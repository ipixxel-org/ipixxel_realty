"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { findBlock, findBlockLocation } from "@/lib/openpage/block-tree";

export function useOpenPageKeyboard() {
  const { toggleJsonDrawer, toggleHistory, toggleShortcutsModal, togglePreview, toggleSpotlight, selectBlock, setClipboardStyle, setRightSidebarTab } = useEditorStore();
  const { undo, redo, removeBlock, duplicateBlock } = useConfigStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl/Cmd+K must work even while an input is focused — it toggles the
      // command palette, which autofocuses its own search field.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleSpotlight();
        return;
      }

      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleShortcutsModal();
        return;
      }

      if (!e.metaKey && !e.ctrlKey) {
        switch (e.key) {
          case "j":
          case "J":
            e.preventDefault();
            toggleJsonDrawer();
            return;
          case "h":
          case "H":
            e.preventDefault();
            toggleHistory();
            return;
          case "p":
          case "P":
            e.preventDefault();
            togglePreview();
            return;
          case "Escape":
            e.preventDefault();
            selectBlock(null);
            return;
          case "Delete":
          case "Backspace": {
            const selectedId = useEditorStore.getState().selectedBlockId;
            if (selectedId) {
              e.preventDefault();
              removeBlock(selectedId);
              selectBlock(null);
              toast('Block deleted');
            }
            return;
          }
          case "d":
          case "D": {
            const selectedId = useEditorStore.getState().selectedBlockId;
            if (selectedId) {
              e.preventDefault();
              duplicateBlock(selectedId);
              toast('Block duplicated');
            }
            return;
          }
          case "1":
            e.preventDefault();
            setRightSidebarTab('properties');
            return;
          case "2":
            e.preventDefault();
            setRightSidebarTab('style');
            return;
          case "3":
            e.preventDefault();
            setRightSidebarTab('typography');
            return;
          case "4":
            e.preventDefault();
            setRightSidebarTab('advanced');
            return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("op:save"));
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const selectedId = useEditorStore.getState().selectedBlockId;
        if (selectedId) {
          duplicateBlock(selectedId);
          toast("Block duplicated");
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        const selectedId = useEditorStore.getState().selectedBlockId;
        if (!selectedId) return;
        const blocks = useConfigStore.getState().getActivePageBlocks();
        const block = findBlock(blocks, selectedId);
        if (block) {
          useEditorStore.getState().setClipboardBlock(block);
          toast("Block copied");
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        const cb = useEditorStore.getState().clipboardBlock;
        if (!cb) {
          toast("No block in clipboard");
          return;
        }
        const blocks = useConfigStore.getState().getActivePageBlocks();
        const selectedId = useEditorStore.getState().selectedBlockId;
        if (selectedId) {
          const loc = findBlockLocation(blocks, selectedId);
          if (loc) {
            const target = loc.sectionId == null
              ? { kind: "root" as const, index: loc.index + 1 }
              : { kind: "column" as const, sectionId: loc.sectionId, colIndex: loc.colIndex ?? 0, index: loc.index + 1 };
            useConfigStore.getState().pasteBlockAt(target, cb);
            toast("Block pasted");
            return;
          }
        }
        useConfigStore.getState().pasteBlockAt({ kind: "root", index: undefined }, cb);
        toast("Block pasted at end");
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        const selectedId = useEditorStore.getState().selectedBlockId;
        if (selectedId) {
          const blocks = useConfigStore.getState().getActivePageBlocks();
          const block = blocks.find((b) => b.id === selectedId);
          if (block?.style) {
            setClipboardStyle(block.style);
            toast('Style copied');
          }
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        const selectedId = useEditorStore.getState().selectedBlockId;
        if (selectedId) {
          const pasted = useEditorStore.getState().clipboardStyle;
          if (pasted) {
            useConfigStore.getState().updateBlockStyle(selectedId, pasted);
            toast('Style pasted');
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleJsonDrawer, toggleHistory, toggleShortcutsModal, togglePreview, toggleSpotlight, selectBlock, undo, redo, removeBlock, duplicateBlock, setClipboardStyle, setRightSidebarTab]);
}
