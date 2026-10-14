import { describe, expect, it } from "vitest";
import { filterHiddenItems } from "@/components/openpage/blocks/render-utils";

describe("repeatable builder items", () => {
  it("omits hidden entries from nested published block props", () => {
    const props = {
      cards: [
        { _id: "visible", title: "Visible" },
        { _id: "hidden", title: "Hidden", hidden: true },
      ],
      nested: {
        plans: [{ _id: "plan-hidden", hidden: true }, { _id: "plan-visible", name: "Plan" }],
      },
    };

    expect(filterHiddenItems(props)).toEqual({
      cards: [{ _id: "visible", title: "Visible" }],
      nested: { plans: [{ _id: "plan-visible", name: "Plan" }] },
    });
    expect(props.cards).toHaveLength(2);
  });

  it("keeps entries without builder identity and entries that are not hidden", () => {
    expect(filterHiddenItems([{ hidden: true }, { _id: "shown", hidden: false }, "value"])).toEqual([
      { hidden: true },
      { _id: "shown", hidden: false },
      "value",
    ]);
  });
});
