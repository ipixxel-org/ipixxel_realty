import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import type { BlockConfig } from "@/components/openpage/blocks/types";

function locationBlock(
  props: Record<string, unknown>,
  style: BlockConfig["style"] = {},
  variant = "split-map",
): BlockConfig {
  return { id: "block-location", type: "location", variant, props, style };
}

const aiItems = [
  { _id: "it_1", place: "Noida-Greater Noida Expressway", time: "2 Mins" },
  { _id: "it_2", place: "Upcoming Noida International Airport (Jewar)", time: "15 Mins" },
];

describe("LocationBlock", () => {
  it("shows nearby places saved as place/time (AI-generated pages)", () => {
    render(<LocationBlock block={locationBlock({ title: "Prime Sector 150", items: aiItems })} />);

    expect(screen.getByText("Noida-Greater Noida Expressway")).toBeTruthy();
    expect(screen.getByText("2 Mins")).toBeTruthy();
    expect(screen.getByText("15 Mins")).toBeTruthy();
  });

  it("still reads title/meta, and prefers them over aliases", () => {
    render(
      <LocationBlock
        block={locationBlock({
          items: [{ _id: "it_1", title: "Metro Station", meta: "5 min", place: "ignored", time: "ignored" }],
        })}
      />,
    );

    expect(screen.getByText("Metro Station")).toBeTruthy();
    expect(screen.getByText("5 min")).toBeTruthy();
    expect(screen.queryByText("ignored")).toBeNull();
  });

  it("uses light text on a dark section background", () => {
    render(
      <LocationBlock
        block={locationBlock(
          { title: "Prime Sector 150", address: "Plot GH-02, Sector 150", items: aiItems },
          { backgroundColor: "#0F1E36" },
        )}
      />,
    );

    expect(screen.getByRole("heading", { name: "Prime Sector 150" }).className).toContain("text-white");
    expect(screen.getAllByText("Plot GH-02, Sector 150")[0].closest("p")?.className).toContain("text-white");
    const place = screen.getByText("Noida-Greater Noida Expressway").closest("div");
    expect(place?.className).toContain("text-white");
    expect(screen.getByText("2 Mins").className).toContain("text-white/70");
  });

  it("keeps theme text colours on a light background", () => {
    render(
      <LocationBlock
        block={locationBlock({ title: "Location", items: aiItems }, { backgroundColor: "#ffffff" })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Location" }).className).not.toContain("text-white");
    expect(screen.getByText("2 Mins").className).toContain("text-text-3");
  });

  it("applies the dark treatment to the cards variant too", () => {
    render(
      <LocationBlock
        block={locationBlock({ title: "Advantages", items: aiItems }, { backgroundColor: "rgb(10, 20, 36)" }, "cards")}
      />,
    );

    expect(screen.getByRole("heading", { name: "Advantages" }).className).toContain("text-white");
    expect(screen.getByText("Noida-Greater Noida Expressway").className).toContain("text-white");
  });
});
