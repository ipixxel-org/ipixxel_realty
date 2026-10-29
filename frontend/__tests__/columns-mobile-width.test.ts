import { beforeEach, describe, expect, it } from "vitest";
import { useConfigStore } from "@/components/openpage/store/configStore";
import { mobileColumnBasis } from "@/components/openpage/blocks/columns/ColumnsBlock";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

type Col = { width: number; mobileWidth?: number; blocks: BlockConfig[] };

function site(block: BlockConfig): SiteConfig {
  return { name: "s", blocks: [], pages: [{ id: "p", name: "Home", path: "/", blocks: [block] }] };
}
const cols = (): Col[] => useConfigStore.getState().config.pages![0].blocks[0].props.columns as Col[];

describe("column widths per device", () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig(
      site({
        id: "c1",
        type: "columns",
        variant: "default",
        props: { columns: [{ width: 33, blocks: [] }, { width: 33, blocks: [] }, { width: 34, blocks: [] }] },
      }),
    );
  });

  it("a mobile width never changes the desktop width", () => {
    useConfigStore.getState().updateColumnMobileWidth("c1", 0, 50);
    expect(cols()[0]).toMatchObject({ width: 33, mobileWidth: 50 });
  });

  it("a desktop width never changes the mobile width", () => {
    useConfigStore.getState().updateColumnMobileWidth("c1", 1, 40);
    useConfigStore.getState().updateColumnWidth("c1", 1, 60);
    expect(cols()[1]).toMatchObject({ width: 60, mobileWidth: 40 });
  });

  it("100% on mobile is the default and is not stored", () => {
    useConfigStore.getState().updateColumnMobileWidth("c1", 2, 50);
    useConfigStore.getState().updateColumnMobileWidth("c1", 2, 100);
    expect(cols()[2].mobileWidth).toBeUndefined();
  });

  it("phones stack columns unless a mobile width is set", () => {
    expect(mobileColumnBasis(undefined, "24px")).toBe("100%");
    expect(mobileColumnBasis(100, "24px")).toBe("100%");
    expect(mobileColumnBasis(50, "24px")).toBe("calc(50% - 24px)");
  });
});
