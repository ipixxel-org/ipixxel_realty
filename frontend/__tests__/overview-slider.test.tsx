import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { ProjectOverviewBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import { slideIntervalMs } from "@/components/openpage/blocks/ImageSlideshow";

const block = (props: Record<string, unknown>): BlockConfig => ({
  id: "o",
  type: "project-overview",
  variant: "centered",
  props: { title: "About the Project", ...props },
});

const visible = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-slideshow] > div[style]"))
    .filter((el) => el.style.opacity === "1")
    .map((el) => el.querySelector("img")?.getAttribute("src"));

afterEach(() => vi.useRealTimers());

describe("Project Overview centered slider", () => {
  it("keeps the single image when no slider images are set", () => {
    const { container } = render(<ProjectOverviewBlock block={block({ image: "https://cdn.example/main.jpg" })} />);
    expect(container.querySelector("[data-slideshow]")).toBeNull();
    expect(container.querySelector('img[src="https://cdn.example/main.jpg"]')).toBeTruthy();
  });

  it("rotates the main image and slider images automatically", () => {
    vi.useFakeTimers();
    const { container } = render(
      <ProjectOverviewBlock
        block={block({
          image: "https://cdn.example/main.jpg",
          slides: [{ _id: "s1", image: "https://cdn.example/2.jpg" }, { _id: "s2", image: "" }, { _id: "s3", image: "https://cdn.example/3.jpg" }],
          slideInterval: 2,
        })}
      />,
    );
    // Empty slides are skipped: 3 images, 3 indicators.
    expect(container.querySelectorAll("[data-slideshow] img")).toHaveLength(3);
    expect(container.querySelectorAll('[data-slideshow] button')).toHaveLength(3);
    expect(visible(container)).toEqual(["https://cdn.example/main.jpg"]);
    act(() => vi.advanceTimersByTime(2000));
    expect(visible(container)).toEqual(["https://cdn.example/2.jpg"]);
    act(() => vi.advanceTimersByTime(4000));
    expect(visible(container)).toEqual(["https://cdn.example/main.jpg"]);
    fireEvent.click(container.querySelectorAll("[data-slideshow] button")[2]);
    expect(visible(container)).toEqual(["https://cdn.example/3.jpg"]);
  });

  it("works with slider images only (no main image)", () => {
    const { container } = render(
      <ProjectOverviewBlock block={block({ slides: [{ image: "https://cdn.example/a.jpg" }, { image: "https://cdn.example/b.jpg" }] })} />,
    );
    expect(container.querySelectorAll("[data-slideshow] img")).toHaveLength(2);
  });

  it("does not show slider settings as extra text rows", () => {
    const { container } = render(
      <ProjectOverviewBlock block={block({ image: "https://cdn.example/main.jpg", slideInterval: "5" })} />,
    );
    expect(container.textContent).not.toContain("Slide Interval");
  });

  it("reads the interval in seconds with safe limits", () => {
    expect(slideIntervalMs(undefined)).toBe(4000);
    expect(slideIntervalMs("abc")).toBe(4000);
    expect(slideIntervalMs("3")).toBe(3000);
    expect(slideIntervalMs(0.2)).toBe(1000);
    expect(slideIntervalMs(999)).toBe(30000);
  });
});
