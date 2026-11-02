import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { ButtonBlock, buttonAlignment } from "@/components/openpage/blocks/core/CoreWidgets";
import { DeviceProvider } from "@/components/openpage/runtime/device";

const button = (props: Record<string, unknown>, style?: Record<string, unknown>): BlockConfig =>
  ({ id: "b", type: "button", variant: "solid", props: { label: "Enquire Now", ...props }, style } as BlockConfig);
const renderOn = (block: BlockConfig, device: "desktop" | "mobile" = "desktop") =>
  render(
    <DeviceProvider device={device}>
      <ButtonBlock block={block} />
    </DeviceProvider>,
  );
const row = (c: HTMLElement) => c.querySelector("section")!;
const link = (c: HTMLElement) => c.querySelector("a")!;

describe("Button alignment", () => {
  it("stays centred by default (unchanged)", () => {
    const { container } = renderOn(button({}));
    expect(row(container).className).toContain("justify-center");
    expect(link(container).className).not.toContain("w-full");
  });

  it("still follows the Content tab Alignment when the Style tab is not set", () => {
    const { container } = renderOn(button({ align: "right" }));
    expect(row(container).className).toContain("justify-end");
  });

  it("follows the Style tab Block Alignment, which wins over the Content tab", () => {
    const { container } = renderOn(button({ align: "right" }, { alignment: "left" }));
    expect(row(container).className).toContain("justify-start");
  });

  it("Justify makes the button full width", () => {
    const { container } = renderOn(button({}, { alignment: "justify" }));
    expect(link(container).className).toContain("w-full");
  });

  it("uses the device's own alignment", () => {
    const block = button({}, { alignment: "left", responsive: { mobile: { alignment: "justify" } } });
    expect(row(renderOn(block, "desktop").container).className).toContain("justify-start");
    expect(link(renderOn(block, "mobile").container).className).toContain("w-full");
  });

  it("ignores unknown values", () => {
    expect(buttonAlignment("diagonal", undefined)).toBe("center");
    expect(buttonAlignment(undefined, "left")).toBe("left");
  });
});
