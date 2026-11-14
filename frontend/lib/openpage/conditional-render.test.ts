import { describe, expect, it } from "vitest";
import type { BlockConfig, SiteProperty } from "@/components/openpage/blocks/types";
import { applyVarsDeep } from "@/lib/openpage/block-style";
import { resolveContextValue, shouldRenderBlock } from "@/lib/openpage/conditional-render";

const property: SiteProperty = {
  name: "Emerald Heights",
  builder: "iPixxel",
  startingPrice: "₹1.2 Cr",
  reraNumber: "",
  location: "Gurugram",
} as SiteProperty;

function block(patch: Partial<BlockConfig>): BlockConfig {
  return { id: "b1", type: "features", variant: "default", props: {}, ...patch } as BlockConfig;
}

describe("resolveContextValue", () => {
  it("reads direct vars and dotted property fields", () => {
    const ctx = { vars: { property_name: "Skyline" }, property };
    expect(resolveContextValue("property_name", ctx)).toBe("Skyline");
    expect(resolveContextValue("property.startingPrice", ctx)).toBe("₹1.2 Cr");
  });

  it("normalises underscore / dot variants", () => {
    const ctx = { vars: { starting_price: "₹2 Cr" }, property };
    expect(resolveContextValue("starting.price", ctx)).toBe("₹2 Cr");
  });
});

describe("shouldRenderBlock", () => {
  const ctx = { property };

  it("renders blocks with no condition", () => {
    expect(shouldRenderBlock(block({}), ctx)).toBe(true);
  });

  it("supports legacy showIf existence and negation", () => {
    expect(shouldRenderBlock(block({ showIf: "property.name" }), ctx)).toBe(true);
    expect(shouldRenderBlock(block({ showIf: "property.reraNumber" }), ctx)).toBe(false);
    expect(shouldRenderBlock(block({ showIf: "!property.reraNumber" }), ctx)).toBe(true);
  });

  it("evaluates structured operators", () => {
    expect(
      shouldRenderBlock(
        block({ conditional: { field: "property.location", operator: "equals", value: "gurugram" } }),
        ctx,
      ),
    ).toBe(true);
    expect(
      shouldRenderBlock(
        block({ conditional: { field: "property.location", operator: "contains", value: "noida" } }),
        ctx,
      ),
    ).toBe(false);
    expect(
      shouldRenderBlock(
        block({ conditional: { field: "property.reraNumber", operator: "notExists" } }),
        ctx,
      ),
    ).toBe(true);
  });

  it("gives a structured conditional precedence over legacy showIf", () => {
    expect(
      shouldRenderBlock(
        block({
          showIf: "property.name",
          conditional: { field: "property.reraNumber", operator: "exists" },
        }),
        ctx,
      ),
    ).toBe(false);
  });
});

describe("applyVarsDeep", () => {
  it("binds dot-notation and underscore tokens inside nested props", () => {
    const value = {
      heading: "{{property.name}}",
      price: "{{starting_price}}",
      items: [{ text: "{{property.location}}" }],
    };
    expect(
      applyVarsDeep(value, {
        "property.name": "Emerald Heights",
        starting_price: "₹1.2 Cr",
        "property.location": "Gurugram",
      }),
    ).toEqual({
      heading: "Emerald Heights",
      price: "₹1.2 Cr",
      items: [{ text: "Gurugram" }],
    });
  });

  it("leaves unknown tokens intact", () => {
    expect(applyVarsDeep("{{property.nope}}", {})).toBe("{{property.nope}}");
  });
});
