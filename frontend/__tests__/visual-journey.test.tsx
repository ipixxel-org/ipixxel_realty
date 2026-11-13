import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { RenderBlock } from "@/components/openpage/blocks/registry";
import { createBlockFromType } from "@/lib/openpage/block-factory";
import { PICKER_GROUPS } from "@/components/openpage/editor/LayersPanel";

const make = (props: Record<string, unknown> = {}): BlockConfig => {
  const block = createBlockFromType("visual-journey")!;
  return { ...block, props: { ...block.props, ...props } };
};

describe("Visual Journey widget", () => {
  it("is offered in the Real Estate group of the Blocks panel", () => {
    const re = PICKER_GROUPS.find((g) => g.id === "re");
    expect(re?.types).toContain("visual-journey");
  });

  it("shows the heading and the first image's name", () => {
    render(<RenderBlock block={make()} />);
    expect(screen.getByText("Visual Journey")).toBeTruthy();
    expect(screen.getByText("Pickle Ball Court")).toBeTruthy();
  });

  it("arrows move one image at a time and wrap around", () => {
    render(<RenderBlock block={make()} />);
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(screen.getByText("Clubhouse")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Previous image"));
    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(screen.getByText("Swimming Pool")).toBeTruthy();
  });

  it("paragraphs and button only show when filled in", () => {
    const { container, rerender } = render(<RenderBlock block={make()} />);
    expect(container.querySelector("a, button.op-btn")).toBeNull();
    rerender(
      <RenderBlock
        block={make({
          description: "Life above the city",
          buttonText: "Book a visit",
          buttonUrl: "#enquire",
          buttonColor: "#112233",
          images: [{ src: "a.jpg", caption: "Pool", description: "Infinity edge pool" }],
        })}
      />,
    );
    expect(screen.getByText("Life above the city")).toBeTruthy();
    expect(screen.getByText("Infinity edge pool")).toBeTruthy();
    const btn = screen.getByText("Book a visit").closest("a")!;
    expect(btn.getAttribute("href")).toBe("#enquire");
    expect(btn.style.backgroundColor).toBe("rgb(17, 34, 51)");
    // A single image needs no arrows.
    expect(screen.queryByLabelText("Next image")).toBeNull();
  });
});
