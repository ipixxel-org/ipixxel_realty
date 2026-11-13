import { describe, expect, it } from "vitest";
import { IPX_ITEM_FIELDS, ipxItemFieldsFor } from "@/lib/openpage/ipixxel-blocks";

const keys = (variant: string | undefined) =>
  ipxItemFieldsFor("ipx-amenities", "items", variant, IPX_ITEM_FIELDS["ipx-amenities.items"])!.map((f) => f.key);

describe("ipx-amenities item fields per template", () => {
  it("modern-pills shows only icon and name", () => {
    expect(keys("modern-pills")).toEqual(["icon", "title"]);
  });
  it("burgundy-list keeps photo, category and description", () => {
    expect(keys("burgundy-list")).toEqual(["image", "category", "title", "text"]);
  });
  it("eldeco-tiles keeps icon and highlight", () => {
    expect(keys("eldeco-tiles")).toEqual(["icon", "title", "highlight"]);
  });
  it("unknown variant falls back to the first template", () => {
    expect(keys(undefined)).toEqual(keys("burgundy-list"));
  });
  it("leaves other lists untouched", () => {
    const f = [{ key: "a" }];
    expect(ipxItemFieldsFor("ipx-gallery", "images", "modern-tabs", f)).toBe(f);
  });
});
