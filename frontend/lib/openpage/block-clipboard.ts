import { useConfigStore } from "@/components/openpage/store/configStore";
import { useEditorStore } from "@/components/openpage/store/editorStore";
import { findBlock, pasteTargetAfter, pasteTargetInside } from "@/lib/openpage/block-tree";

/**
 * Builder block clipboard (Copy / Paste of whole widgets and sections).
 * The copy is a deep snapshot; every paste gets fresh ids, so the same copy
 * can be pasted many times without clashing.
 */

/** Copy the block with `id` (at any depth). Returns false when it does not exist. */
export function copyBlockToClipboard(id: string | null | undefined): boolean {
  if (!id) return false;
  const block = findBlock(useConfigStore.getState().getActivePageBlocks(), id);
  if (!block) return false;
  useEditorStore.getState().setClipboardBlock(JSON.parse(JSON.stringify(block)));
  return true;
}

export function hasClipboardBlock(): boolean {
  return Boolean(useEditorStore.getState().clipboardBlock);
}

/**
 * Paste the copied block.
 * - "after": right below `targetId` in the same place (page or column); at
 *   the end of the page when there is no target.
 * - "inside": at the end of container `targetId`'s column `colIndex`.
 * Returns the new block's id, or null when nothing was pasted.
 */
export function pasteClipboardBlock(mode: "after" | "inside", targetId?: string | null, colIndex = 0): string | null {
  const copied = useEditorStore.getState().clipboardBlock;
  if (!copied) return null;
  const blocks = useConfigStore.getState().getActivePageBlocks();
  const target = mode === "inside" && targetId ? pasteTargetInside(blocks, targetId, colIndex) : pasteTargetAfter(blocks, targetId);
  if (!target) return null;
  const id = useConfigStore.getState().pasteBlockAt(target, copied);
  useEditorStore.getState().selectBlock(id);
  return id;
}
