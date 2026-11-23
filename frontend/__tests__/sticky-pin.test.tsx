import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { DeviceProvider } from "@/components/openpage/runtime/device";
import { stickyTopPx } from "@/components/openpage/blocks/use-sticky-pin";

const block = (style: Record<string, unknown>, id = "b1"): BlockConfig =>
  ({ id, type: "spacer", variant: "default", props: { height: "60px" }, style } as unknown as BlockConfig);

const section = (blocks: unknown[]): BlockConfig =>
  ({ id: "sec", type: "columns", variant: "1-col", props: { columns: [{ id: "c1", blocks }] } } as unknown as BlockConfig);

const byId = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-block-id="${id}"]`);

const rect = (top: number, height: number) => ({ top, height, left: 0, width: 800, bottom: top + height, right: 800, x: 0, y: top, toJSON() {} }) as DOMRect;

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll("[data-op-sticky-holder]").forEach((n) => n.remove());
});

describe("Sticky position", () => {
  it("reads Top as px (auto / empty = 0)", () => {
    expect(stickyTopPx("0px")).toBe(0);
    expect(stickyTopPx("10px")).toBe(10);
    expect(stickyTopPx("12")).toBe(12);
    expect(stickyTopPx("1rem")).toBe(16);
    expect(stickyTopPx("auto")).toBe(0);
    expect(stickyTopPx(undefined)).toBe(0);
  });

  it("keeps the block in the flow and above other content", () => {
    const { container } = render(<RenderBlock block={block({ position: "sticky", top: "0px" })} />);
    const el = byId(container, "b1")!;
    expect(el.style.position).toBe("relative");
    expect(el.style.top).toBe("");
    expect(el.style.zIndex).toBe("40");
  });

  it("a block placed directly on the page uses native CSS sticky on its own slot", () => {
    const { container } = render(
      <div data-op-page-root="">
        <RenderBlock block={block({ position: "sticky", top: "8px" })} />
        <div style={{ height: 2000 }} />
      </div>,
    );
    const el = byId(container, "b1")!;
    expect(el.style.position).toBe("sticky");
    expect(el.style.top).toBe("8px");
    expect(el.style.zIndex).toBe("40");
  });

  it("never makes the parent Section sticky, even when it holds only the sticky block", () => {
    const { container } = render(
      <div data-op-page-root="">
        <RenderBlock block={section([block({ position: "sticky", top: "8px" })])} />
      </div>,
    );
    expect(byId(container, "sec")!.style.position).not.toBe("sticky");
  });

  it("an Icon inside a Div: only the Icon sticks, and the empty part of the bar lets clicks through", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("data-block-id") === "ic") return rect(-40, 96);
      return rect(0, 600);
    });
    const icon = { id: "ic", type: "icon", variant: "default", props: { size: "48px" }, style: { position: "sticky" } };
    const heading = { id: "h", type: "heading", variant: "default", props: { text: "Stays in the page" } };
    const { container } = render(
      <div data-op-page-root="">
        <RenderBlock block={section([icon, heading])} />
      </div>,
    );
    const holder = document.querySelector<HTMLElement>("[data-op-sticky-holder]")!;
    expect(byId(holder, "ic")).toBeTruthy();
    // The heading and the Section stay in the page.
    expect(byId(holder, "h")).toBeNull();
    expect(byId(container, "h")).toBeTruthy();
    expect(byId(container, "sec")!.style.position).not.toBe("sticky");
    expect(document.getElementById("op-sticky-holder-css")?.textContent).toContain("pointer-events: none");
  });

  it("a Div inside a tall hero Container: only the Div sticks, pinned to the top once scrolled past", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    // The hero Container is much taller than the header Div.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("data-block-id") === "b1" || this.hasAttribute("data-op-sticky-spacer")) return rect(window.__slotTop ?? 50, 60);
      return rect(0, 900);
    });
    window.__slotTop = 50;
    const { container } = render(
      <div data-op-page-root="">
        <RenderBlock block={section([block({ position: "sticky" })])} />
      </div>,
    );
    // The Container does not become sticky.
    expect(byId(container, "sec")!.style.position).not.toBe("sticky");
    expect(document.querySelector("[data-op-sticky-holder]")).toBeNull();

    // Scroll: the Div's spot goes above the top of the window.
    window.__slotTop = -120;
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    const holder = document.querySelector<HTMLElement>("[data-op-sticky-holder]")!;
    expect(holder).toBeTruthy();
    expect(holder.style.position).toBe("fixed");
    expect(holder.style.top).toBe("0px");
    // The Div is drawn in the fixed bar; an empty box keeps its place.
    expect(byId(holder, "b1")).toBeTruthy();
    expect(byId(container, "b1")).toBeNull();
    expect(container.querySelector<HTMLElement>("[data-op-sticky-spacer]")!.style.height).toBe("60px");

    // Scroll back up: the Div returns to the page.
    window.__slotTop = 50;
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(byId(container, "b1")).toBeTruthy();
    expect(container.querySelector("[data-op-sticky-spacer]")).toBeNull();
  });

  it("only applies on the device it is set for", () => {
    const style = { responsive: { mobile: { position: "sticky", top: "0px" } } };
    const desk = render(
      <DeviceProvider device="desktop">
        <RenderBlock block={block(style)} />
      </DeviceProvider>,
    );
    expect(byId(desk.container, "b1")!.style.position).toBe("");
    desk.unmount();
    const mob = render(
      <DeviceProvider device="mobile">
        <RenderBlock block={block(style)} />
      </DeviceProvider>,
    );
    expect(byId(mob.container, "b1")!.style.position).toBe("relative");
  });

  it("leaves Fixed / Absolute / Relative unchanged", () => {
    const { container } = render(<RenderBlock block={block({ position: "fixed", top: "0px", left: "0px" })} />);
    const el = byId(container, "b1")!;
    expect(el.style.position).toBe("fixed");
    expect(el.style.top).toBe("0px");
    expect(el.style.zIndex).toBe("");
  });
});

declare global {
  interface Window {
    __slotTop?: number;
  }
}
