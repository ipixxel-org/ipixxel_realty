import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { ProjectOverviewBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import { migrateBlockListIds } from "@/lib/openpage/element-style";

const overview = (highlights: unknown[]): BlockConfig => ({
  id: "po",
  type: "project-overview",
  variant: "split",
  props: { title: "Radhey Skye", body: "Text", highlights },
});

describe("Project Overview highlights", () => {
  it("upgrades plain-text highlights to editable items on load", () => {
    const migrated = migrateBlockListIds(overview(["4-Side Ventilated Homes", "  ", { title: "Club Skye" }]));
    const list = migrated.props.highlights as Array<Record<string, unknown>>;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ title: "4-Side Ventilated Homes" });
    expect(typeof list[0]._id).toBe("string");
    expect(list[1]).toMatchObject({ title: "Club Skye" });
    // Running again changes nothing.
    expect(migrateBlockListIds(migrated)).toBe(migrated);
  });

  it("leaves plain-text lists that are meant to be text alone", () => {
    const tiers: BlockConfig = { id: "p", type: "pricing", variant: "default", props: { tiers: [{ name: "A", features: ["x", "y"] }] } };
    const tier = (migrateBlockListIds(tiers).props.tiers as Array<Record<string, unknown>>)[0];
    expect(tier.features).toEqual(["x", "y"]);
  });

  it("renders plain-text highlights instead of an empty icon", () => {
    const { container } = render(<ProjectOverviewBlock block={overview(["2,00,000 Sq.ft. Stilt + Clubhouse Amenities"])} />);
    expect(container.textContent).toContain("2,00,000 Sq.ft. Stilt + Clubhouse Amenities");
  });

  it("skips empty highlights", () => {
    const { container } = render(<ProjectOverviewBlock block={overview([{ title: "", description: "" }])} />);
    expect(container.querySelectorAll('[data-el-name^="highlights:"]').length).toBe(0);
  });

  it("shows an uploaded logo in place of the check mark", () => {
    const { container } = render(
      <ProjectOverviewBlock block={overview([{ _id: "h1", title: "Club Skye", icon: "https://cdn.example/logo.png" }])} />,
    );
    const icon = container.querySelector("[data-el-name=\"highlights:h1/icon\"]");
    expect(icon?.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/logo.png");
  });

  it("keeps the check mark when no logo is set", () => {
    const { container } = render(<ProjectOverviewBlock block={overview([{ _id: "h1", title: "Club Skye" }])} />);
    const icon = container.querySelector("[data-el-name=\"highlights:h1/icon\"]");
    expect(icon?.querySelector("img")).toBeNull();
    expect(icon?.querySelector("svg")).toBeTruthy();
  });
});
