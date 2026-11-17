import { describe, expect, it } from "vitest";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { propsForVariantSwitch, VARIANT_CONTENT_KEY } from "@/lib/openpage/variant-content";
import type { BlockConfig } from "@/components/openpage/blocks/types";

const hero = (variant: string, props: Record<string, unknown> = {}): BlockConfig => {
  const block = createBlockFromType("ipixxel-hero")!;
  return { ...block, variant, props: { ...block.props, ...props } };
};

/** Switch like the editor does: new props + new variant. */
const switchTo = (block: BlockConfig, next: string): BlockConfig => ({ ...block, variant: next, props: propsForVariantSwitch(block, next) });

describe("per-template content (iPixxel hero)", () => {
  it("content edited on one template does not show on another", () => {
    const skyline = hero("skyline", { logo: "tarc.png", image: "towers.jpg", location: "Sector 63A, Gurugram", phone: "+91 11111 11111" });
    const offer = switchTo(skyline, "offer-slider");
    expect(offer.props.logo).toBe("");
    expect(offer.props.image).toBe("");
    expect(offer.props.phone).toBe("+91 90000 00000");
    // Offer slider shows no location, so it is left as is; Emerald shows one.
    expect(switchTo(offer, "emerald-slider").props.location).toBe("Sector 150, Noida");
  });

  it("each template gets its own content back when switched to again", () => {
    let block = hero("skyline", { logo: "tarc.png", phone: "+91 11111 11111" });
    block = switchTo(block, "offer-slider");
    block = { ...block, props: { ...block.props, logo: "offer.png", phone: "+91 22222 22222" } };
    block = switchTo(block, "skyline");
    expect(block.props.logo).toBe("tarc.png");
    expect(block.props.phone).toBe("+91 11111 11111");
    block = switchTo(block, "offer-slider");
    expect(block.props.logo).toBe("offer.png");
    expect(block.props.phone).toBe("+91 22222 22222");
  });

  it("template-only fields and the section ID are left alone", () => {
    const block = switchTo(hero("skyline", { skylineTitle: "My title", anchor: "top" }), "offer-slider");
    expect(block.props.skylineTitle).toBe("My title");
    expect(block.props.anchor).toBe("top");
  });

  it("saves only the old template's shared values", () => {
    const block = switchTo(hero("skyline", { logo: "tarc.png" }), "modern-form");
    const store = block.props[VARIANT_CONTENT_KEY] as Record<string, Record<string, unknown>>;
    expect(store.skyline.logo).toBe("tarc.png");
    expect(store.skyline).not.toHaveProperty("skylineTitle");
    expect(store).not.toHaveProperty("modern-form");
  });

  it("does nothing for the same template or for other widgets", () => {
    const block = hero("skyline", { logo: "tarc.png" });
    expect(propsForVariantSwitch(block, "skyline")).toBe(block.props);
    const other = { type: "ipx-highlights", variant: "tarc-compass", props: { title: "x" } } as unknown as BlockConfig;
    expect(propsForVariantSwitch(other, "modern-grid")).toBe(other.props);
  });
});
