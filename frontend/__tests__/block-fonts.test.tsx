import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";
import { blockFontFamilies } from "@/lib/openpage/block-fonts";
import { SiteRenderer } from "@/components/openpage/renderer/SiteRenderer";

const heading: BlockConfig = {
  id: "h1", type: "heading", variant: "default", props: { text: "Hi" },
  style: { typography: { fontFamily: "Playfair Display" } },
};
const nested: BlockConfig = {
  id: "c1", type: "columns", variant: "default",
  props: { columns: [{ blocks: [{ id: "t1", type: "text", variant: "default", props: { body: "x" }, elementStyles: { "text:body": { typography: { fontFamily: "Lora" } } } }] }] },
};

describe("fonts picked on blocks", () => {
  it("are found at any depth, without duplicates", () => {
    expect(blockFontFamilies([heading, nested, heading]).sort()).toEqual(["Lora", "Playfair Display"]);
    expect(blockFontFamilies(undefined)).toEqual([]);
  });

  it("are loaded on the live / preview page", () => {
    Object.defineProperty(document, "fonts", { configurable: true, value: { load: () => Promise.resolve([]) } });
    const site = { blocks: [heading, nested] } as unknown as SiteConfig;
    render(<SiteRenderer site={site} live={false} />);
    expect(document.querySelector('link[data-openpage-font="Playfair Display"]')).not.toBeNull();
    expect(document.querySelector('link[data-openpage-font="Lora"]')).not.toBeNull();
  });
});
