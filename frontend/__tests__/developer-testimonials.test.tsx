import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { TestimonialsBlock } from "@/components/openpage/blocks/testimonials/TestimonialsBlock";
import { DeveloperBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";

function block(type: BlockConfig["type"], props: Record<string, unknown>, variant: string): BlockConfig {
  return { id: `${type}-t`, type, variant, props };
}

describe("Testimonials", () => {
  it("does not crash when a testimonial has no name (carousel / spotlight)", () => {
    for (const variant of ["carousel", "spotlight", "cards", "band"]) {
      const { container, unmount } = render(
        <TestimonialsBlock block={block("testimonials", { items: [{ quote: "Lovely home" }] }, variant)} />,
      );
      expect(container.textContent).toContain("Lovely home");
      expect(container.textContent).toContain("?"); // initials fallback
      unmount();
    }
  });

  it("spotlight shows the title, subtitle and avatar photo", () => {
    const { container } = render(
      <TestimonialsBlock
        block={block("testimonials", {
          title: "Residents",
          subtitle: "Real stories",
          items: [{ _id: "a", name: "Priya Sharma", quote: "Great", avatar: "https://x/p.jpg" }],
        }, "spotlight")}
      />,
    );
    expect(container.textContent).toContain("Residents");
    expect(container.textContent).toContain("Real stories");
    expect(container.querySelector('img[src="https://x/p.jpg"]')).toBeTruthy();
  });

  it("carousel shows the subtitle", () => {
    const { container } = render(
      <TestimonialsBlock block={block("testimonials", { subtitle: "Sub", items: [{ name: "A", quote: "Q" }] }, "carousel")} />,
    );
    expect(container.textContent).toContain("Sub");
  });

  it("skips empty testimonials instead of showing empty quote marks", () => {
    const { container } = render(
      <TestimonialsBlock block={block("testimonials", { items: [{ name: "", role: "", quote: "" }] }, "cards")} />,
    );
    expect(container.textContent).not.toContain("“”");
    expect(container.querySelectorAll('[data-el-name^="items:"]').length).toBe(0);
  });

  it("uses the Section ID and makes items styleable", () => {
    const { container } = render(
      <TestimonialsBlock block={block("testimonials", { anchor: "reviews", items: [{ _id: "a", name: "A", quote: "Q", rating: "4" }] }, "cards")} />,
    );
    expect(container.querySelector("section#reviews")).toBeTruthy();
    expect(container.querySelector('[data-el-name="items:a/quote"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="4 out of 5 stars"]')).toBeTruthy();
  });
});

describe("Builder / Developer", () => {
  it("stats template never shows made-up numbers", () => {
    const { container } = render(<DeveloperBlock block={block("developer", { name: "Acme", stats: [] }, "stats")} />);
    expect(container.textContent).not.toContain("50+");
    expect(container.textContent).not.toContain("10k+");
  });

  it("split template has no empty heading and shows the logo", () => {
    const { container } = render(
      <DeveloperBlock block={block("developer", { name: "", logo: "https://x/logo.png" }, "split")} />,
    );
    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector('img[src="https://x/logo.png"]')).toBeTruthy();
  });

  it("default template uses the full width when there is no image or logo", () => {
    const { container } = render(<DeveloperBlock block={block("developer", { name: "Acme", body: "Hi" }, "default")} />);
    expect(container.innerHTML).not.toContain("aspect-[4/3]");
    expect(container.textContent).toContain("Hi");
  });

  it("name, about text and stats are styleable elements", () => {
    const { container } = render(
      <DeveloperBlock block={block("developer", { name: "Acme", body: "Line 1\nLine 2", stats: [{ _id: "s1", value: "10", label: "Years" }] }, "band")} />,
    );
    expect(container.querySelector('[data-el-name="developer:name"]')).toBeTruthy();
    expect(container.querySelector('[data-el-name="developer:body"]')?.className).toContain("whitespace-pre-line");
    expect(container.querySelector('[data-el-name="stats:s1/value"]')).toBeTruthy();
  });
});
