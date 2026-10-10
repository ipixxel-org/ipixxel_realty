import { describe, expect, it } from "vitest";
import { moveBlockGroup, allAtRoot } from "@/lib/openpage/block-tree";
import type { BlockConfig } from "@/components/openpage/blocks/types";

function block(id: string): BlockConfig {
  return { id, type: "heading", variant: "default", props: {} };
}

function ids(blocks: BlockConfig[]): string[] {
  return blocks.map((b) => b.id);
}

describe("moveBlockGroup", () => {
  const src = (): BlockConfig[] => ["a", "b", "c", "d", "e"].map(block);

  it("moves the group so its first member lands ahead of the target block", () => {
    const next = moveBlockGroup(src(), ["b", "d"], 2); // before "c"
    expect(ids(next)).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("moves the group to the front", () => {
    expect(ids(moveBlockGroup(src(), ["c", "d"], 0))).toEqual(["c", "d", "a", "b", "e"]);
  });

  it("appends the group at the end when overIndex equals length", () => {
    expect(ids(moveBlockGroup(src(), ["b", "c"], 5))).toEqual(["a", "d", "e", "b", "c"]);
  });

  it("is a no-op when the target points at one of the selected blocks", () => {
    const before = src();
    const after = moveBlockGroup(before, ["b", "d"], 1); // "b" is selected
    expect(after).toBe(before);
  });

  it("preserves the group's source order regardless of id order given", () => {
    expect(ids(moveBlockGroup(src(), ["d", "b", "c"], 4))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("moves a single selection like a plain swap", () => {
    // one-step down: swap with the block that follows it
    expect(ids(moveBlockGroup(src(), ["c"], 5))).toEqual(["a", "b", "d", "e", "c"]);
    // one-step up: swap with the block ahead of it
    expect(ids(moveBlockGroup(src(), ["c"], 1))).toEqual(["a", "c", "b", "d", "e"]);
  });

  it("ignores ids that are not present at root level", () => {
    expect(ids(moveBlockGroup(src(), ["b", "ghost"], 4))).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("returns the same array reference for an empty selection", () => {
    const before = src();
    expect(moveBlockGroup(before, [], 2)).toBe(before);
  });

  it("does not mutate the input arrays or block objects", () => {
    const original = src();
    const before = ids(original);
    const next = moveBlockGroup(original, ["b", "d"], 0);
    expect(original).not.toBe(next);
    expect(ids(original)).toEqual(before);
    expect(next.every((b) => original.includes(b))).toBe(true);
  });
});

describe("allAtRoot", () => {
  const blocks = ["a", "b"].map(block);
  it("returns true when every id is a root block", () => {
    expect(allAtRoot(blocks, ["a", "b"])).toBe(true);
  });
  it("returns false when an id lives elsewhere or is missing", () => {
    expect(allAtRoot(blocks, ["a", "ghost"])).toBe(false);
    expect(allAtRoot(blocks, ["a"])).toBe(true);
  });
});