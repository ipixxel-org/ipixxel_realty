import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroBlock } from "@/components/openpage/blocks/hero/HeroBlock";

describe("hero CTA controls", () => {
  it("renders primary and secondary CTAs with independent destinations and colors", () => {
    render(
      <HeroBlock
        block={{
          id: "hero",
          type: "hero",
          variant: "default",
          props: {
            headline: "Welcome",
            subheadline: "Explore",
            primaryCta: "Book now",
            primaryCtaUrl: "/book",
            primaryCtaTarget: "_blank",
            primaryCtaColor: "#123456",
            secondaryCta: "Learn more",
            secondaryCtaUrl: "#details",
            secondaryCtaColor: "#abcdef",
          },
        }}
      />,
    );

    const primary = screen.getByRole("link", { name: "Book now" });
    const secondary = screen.getByRole("link", { name: "Learn more" });
    expect(primary).toHaveAttribute("href", "/book");
    expect(primary).toHaveAttribute("target", "_blank");
    expect(primary).toHaveStyle({ backgroundColor: "#123456" });
    expect(secondary).toHaveAttribute("href", "#details");
    expect(secondary).toHaveAttribute("target", "_self");
    expect(secondary).toHaveStyle({ backgroundColor: "#abcdef" });
  });
});
