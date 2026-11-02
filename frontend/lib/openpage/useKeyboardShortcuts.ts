"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { copyBlockToClipboard, hasClipboardBlock, pasteClipboardBlock } from "@/lib/openpage/block-clipboard";

/** True while the user has text selected (Ctrl+C then copies that text). */
function hasTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const sel = window.getSelection();
  return Boolean(sel && !sel.isCollapsed && sel.toString().trim());
}

export function useOpenPageKeyboard() {
  const { toggleJsonDrawer, toggleHistory, toggleShortcutsModal, togglePreview, toggleSpotlight, selectBlock, setRightSidebarTab } = useEditorStore();
  const { undo, redo, removeBlock, duplicateBlock, removeBlocks, duplicateBlocks } = useConfigStore();

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
      // Inline text editing: let the browser handle typing / copy / paste.
      if ((e.target as HTMLElement).isContentEditable) return;

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
            const selectedIds = useEditorStore.getState().selectedBlockIds;
            if (selectedIds.length > 0) {
              e.preventDefault();
              if (selectedIds.length > 1) {
                removeBlocks(selectedIds);
                toast(`${selectedIds.length} blocks deleted`);
              } else {
                removeBlock(selectedIds[0]);
                toast('Block deleted');
              }
              selectBlock(null);
            }
            return;
          }
          case "d":
          case "D": {
            const selectedIds = useEditorStore.getState().selectedBlockIds;
            if (selectedIds.length > 0) {
              e.preventDefault();
              if (selectedIds.length > 1) {
                duplicateBlocks(selectedIds);
                toast(`${selectedIds.length} blocks duplicated`);
              } else {
                duplicateBlock(selectedIds[0]);
                toast('Block duplicated');
              }
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
        const selectedIds = useEditorStore.getState().selectedBlockIds;
        if (selectedIds.length > 1) {
          duplicateBlocks(selectedIds);
          toast(`${selectedIds.length} blocks duplicated`);
        } else if (selectedIds.length === 1) {
          duplicateBlock(selectedIds[0]);
          toast("Block duplicated");
        }
        return;
      }

      // Copy / paste whole blocks (Ctrl+C / Ctrl+V; Ctrl+Shift also works).
      // Selected text on the page is left to the browser.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "c") {
        if (hasTextSelection()) return;
        const selectedId = useEditorStore.getState().selectedBlockId;
        if (!selectedId) return;
        e.preventDefault();
        if (copyBlockToClipboard(selectedId)) toast("Block copied — press Ctrl+V to paste");
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "v") {
        if (!hasClipboardBlock()) return;
        e.preventDefault();
        const selectedId = useEditorStore.getState().selectedBlockId;
        if (pasteClipboardBlock("after", selectedId)) toast(selectedId ? "Block pasted" : "Block pasted at end");
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

    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleJsonDrawer, toggleHistory, toggleShortcutsModal, togglePreview, toggleSpotlight, selectBlock, undo, redo, removeBlock, duplicateBlock, removeBlocks, duplicateBlocks, setRightSidebarTab]);
}
