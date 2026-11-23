import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { blockMetadata } from "@/lib/openpage/block-metadata";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { PICKER_GROUPS } from "@/components/openpage/editor/LayersPanel";
import { isActiveHref } from "@/components/openpage/blocks/elements/HamburgerMenu";

const make = (props: Record<string, unknown> = {}): BlockConfig => ({
  id: "b-hm",
  type: "hamburger-menu",
  variant: "default",
  props: { ...(blockMetadata.find((m) => m.type === "hamburger-menu")?.defaultProps ?? {}), ...props },
});

const loc = { origin: "https://site.test", pathname: "/projects/aurum", hash: "" };

describe("Hamburger Menu widget", () => {
  it("is offered in the Core group and renders", () => {
    expect(PICKER_GROUPS.find((g) => g.id === "core")?.types).toContain("hamburger-menu");
    const block = createBlockFromType("hamburger-menu");
    expect(block).toBeTruthy();
    const { container } = render(<RenderBlock block={block!} />);
    expect(container.textContent).not.toMatch(/coming soon|Failed to render/);
    expect(screen.getByLabelText("Open menu")).toBeTruthy();
  });

  it("opens a panel with the custom links and applies link / active colours", () => {
    render(
      <RenderBlock
        block={make({
          linkColor: "#111111",
          activeLinkColor: "#ff0000",
          items: [
            { label: "Home", url: "/home", target: "_self" },
            { label: "Brochure", url: "https://x.com/b.pdf", target: "_blank", active: true },
            { label: "Bad", url: "javascript:alert(1)" },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    const dialog = screen.getByRole("dialog");
    const brochure = screen.getByText("Brochure");
    expect(brochure.getAttribute("href")).toBe("https://x.com/b.pdf");
    expect(brochure.getAttribute("target")).toBe("_blank");
    expect(brochure.getAttribute("aria-current")).toBe("page");
    expect(brochure.className).toContain("op-hm-active");
    expect(screen.getByText("Home").className).not.toContain("op-hm-active");
    // Unsafe link is dropped (rendered as plain text).
    expect(screen.getByText("Bad").getAttribute("href")).toBeNull();
    const root = dialog.parentElement as HTMLElement;
    expect(root.style.getPropertyValue("--hm-link")).toBe("#111111");
    expect(root.style.getPropertyValue("--hm-active")).toBe("#ff0000");
    // Hover falls back to the active colour.
    expect(root.style.getPropertyValue("--hm-hover")).toBe("#ff0000");

    // Clicking a link makes it the active one and closes the panel.
    fireEvent.click(screen.getByText("Home"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("close icon and panel title have their own colours; empty close colour keeps the hamburger icon colour", () => {
    const { unmount } = render(<RenderBlock block={make({ iconColor: "#ffffff", closeIconColor: "#000000", panelTitleColor: "#222222" })} />);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByLabelText("Close menu").style.color).toBe("rgb(0, 0, 0)");
    expect(screen.getByText("Menu", { selector: "p" }).style.color).toBe("rgb(34, 34, 34)");
    unmount();

    render(<RenderBlock block={make({ iconColor: "#ffffff" })} />);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByLabelText("Close menu").style.color).toBe("rgb(255, 255, 255)");
    expect(screen.getByText("Menu", { selector: "p" }).style.color).toBe("");
  });

  it("can show the links inline on wide screens", () => {
    render(<RenderBlock block={make({ display: "inline-desktop" })} />);
    expect(screen.getByText("Overview").getAttribute("href")).toBe("#overview");
  });

  it("detects the active link from the current page", () => {
    expect(isActiveHref("/projects/aurum/", loc)).toBe(true);
    expect(isActiveHref("/projects/other", loc)).toBe(false);
    expect(isActiveHref("#amenities", { ...loc, hash: "#amenities" })).toBe(true);
    expect(isActiveHref("#amenities", loc)).toBe(false);
    expect(isActiveHref("https://elsewhere.test/projects/aurum", loc)).toBe(false);
    expect(isActiveHref("", loc)).toBe(false);
  });
});
