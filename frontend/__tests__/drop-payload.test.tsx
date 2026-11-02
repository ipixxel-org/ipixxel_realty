import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { parseDropPayload, readDropPayload } from "@/lib/openpage/drag-payload";
import { ColumnsBlock } from "@/components/openpage/blocks/columns/ColumnsBlock";
import { ElementEditorContext } from "@/components/openpage/blocks/El";

// The builder canvas provides this scope; drop targets only exist there.
const Builder = ({ children }: { children: React.ReactNode }) => (
  <ElementEditorContext.Provider value={{ blockId: "c1", isEditing: true }}>{children}</ElementEditorContext.Provider>
);
import { useConfigStore } from "@/components/openpage/store/configStore";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const data = (values: Record<string, string>) => ({ getData: (type: string) => values[type] ?? "" });

describe("drop payload reading", () => {
  it("ignores a dragged image / link URL instead of throwing", () => {
    expect(readDropPayload(data({ "text/plain": "https://pub-example.r2.dev/logo.png" }))).toBeNull();
    expect(readDropPayload(data({ "text/uri-list": "https://x" }))).toBeNull();
    expect(readDropPayload(null)).toBeNull();
  });

  it("ignores JSON that is not a widget", () => {
    for (const raw of ["null", "42", '"text"', "[]", '{"kind":"block"}', '{"kind":"other","type":"x"}']) {
      expect(parseDropPayload(raw), raw).toBeNull();
    }
  });

  it("reads Blocks-panel widgets from either format", () => {
    const widget = JSON.stringify({ kind: "block", type: "heading", label: "Heading" });
    expect(readDropPayload(data({ "application/x-openpage-drag": widget }))).toMatchObject({ kind: "block", type: "heading" });
    expect(readDropPayload(data({ "text/plain": widget }))).toMatchObject({ kind: "block", type: "heading" });
    expect(parseDropPayload('{"kind":"preset","presetId":"p1"}')).toMatchObject({ presetId: "p1" });
  });
});

describe("dropping onto a Container column", () => {
  const block: BlockConfig = { id: "c1", type: "columns", variant: "default", props: { columns: [{ width: 100, blocks: [] }] } };
  const site: SiteConfig = { name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [block] }] };
  const childCount = () =>
    ((useConfigStore.getState().config.pages![0].blocks[0].props.columns as Array<{ blocks: unknown[] }>)[0].blocks).length;

  beforeEach(() => useConfigStore.getState().setConfig(site));

  it("a dragged URL adds nothing and logs no error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<Builder><DndContext><ColumnsBlock block={block} /></DndContext></Builder>);
    const column = container.querySelector("[data-op-container] > div")!;
    fireEvent.drop(column, { dataTransfer: data({ "text/plain": "https://pub-example.r2.dev/logo.png" }) });
    expect(childCount()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a Blocks-panel widget is still added", () => {
    const { container } = render(<Builder><DndContext><ColumnsBlock block={block} /></DndContext></Builder>);
    const column = container.querySelector("[data-op-container] > div")!;
    fireEvent.drop(column, { dataTransfer: data({ "application/x-openpage-drag": JSON.stringify({ kind: "block", type: "heading" }) }) });
    expect(childCount()).toBe(1);
  });
});
