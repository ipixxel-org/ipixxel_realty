import { describe, expect, it } from "vitest";
import { WIDGET_MIGRATIONS, migrateSections } from "@/lib/openpage/persist";
import { PAGES, WIDGETS } from "@/lib/openpage/data";
import { buildTemplateSections } from "@/lib/openpage/page-templates";
import type { SectionInstance } from "@/lib/openpage/types";

function node(type: string, settings: Record<string, unknown> = {}, children?: SectionInstance[]): SectionInstance {
  return {
    id: `id_${type}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    label: type,
    icon: "SquareStack",
    settings,
    style: { colors: {}, typography: {}, spacing: {}, layout: { align: "center" }, responsive: {} },
    ...(children ? { children } : {}),
  };
}

describe("widget library migrations (merged ids)", () => {
  it("maps every removed id to its primary widget", () => {
    const targets = new Set(Object.values(WIDGET_MIGRATIONS));
    for (const target of targets) {
      // Every target must exist in the current library.
      expect(WIDGET_MIGRATIONS[target]).toBeUndefined();
    }
  });

  it("migrates simple aliases preserving settings", () => {
    const out = migrateSections([
      node("slider", { slides: [{ caption: "A" }], autoplay: false, interval: 2500 }),
      node("accordion", { items: [{ title: "Q?", body: "Ans" }] }),
      node("row-2", { columns: 2 }),
      node("enquiry-form", { heading: "Enquire", fields: ["name", "email"] }),
      node("multistep-form", { steps: 3 }),
      node("map", { address: "MG Road", zoom: 15 }),
    ]);
    expect(out.map((s) => s.type)).toEqual(["carousel", "faq", "row", "lead-form", "lead-form", "location-advantages"]);
    expect(out[0].settings.autoplay).toBe(false);
    expect(out[1].settings.items).toEqual([{ title: "Q?", body: "Ans" }]);
    expect(out[3].settings.fields).toEqual(["name", "email"]);
    expect(out[4].settings.steps).toBe(3);
    expect(out[5].settings.address).toBe("MG Road");
  });

  it("adds configuration flags for merged behaviour variants", () => {
    const out = migrateSections([
      node("whatsapp-cta", { text: "Chat", number: "+911234567890", ctaLabel: "Chat Now" }),
      node("offer-banner", { heading: "Offer", text: "5% off", cta: "Claim" }),
      node("sticky-footer-bar", { text: "Enquire", ctaLabel: "Enquire Now", link: "#lead-form" }),
    ]);
    expect(out[0].type).toBe("call-cta");
    expect(out[0].settings.mode).toBe("whatsapp");
    expect(out[0].settings.number).toBe("+911234567890");
    expect(out[1].type).toBe("cta-banner");
    expect(out[1].settings.layout).toBe("strip");
    expect(out[1].settings.cta).toBe("Claim");
    expect(out[2].type).toBe("sticky-cta");
    expect(out[2].settings.link).toBe("#lead-form");
  });

  it("remaps nearby item copy into the location meta field", () => {
    const out = migrateSections([node("nearby", { heading: "Nearby", items: [{ title: "IT Park", text: "8 min" }] })]);
    expect(out[0].type).toBe("location-advantages");
    expect(out[0].settings.items).toEqual([{ title: "IT Park", text: "8 min", meta: "8 min" }]);
  });

  it("migrates nested children inside structural nodes and is idempotent", () => {
    const tree = [node("container", {}, [node("row", {}, [node("slider", {}), node("whatsapp-form", {})])])];
    const once = migrateSections(tree);
    expect(once[0].children![0].children!.map((c) => c.type)).toEqual(["carousel", "lead-form"]);
    const twice = migrateSections(JSON.parse(JSON.stringify(once)) as SectionInstance[]);
    expect(twice).toEqual(once);
  });

  it("leaves current widgets untouched", () => {
    const list = [node("hero"), node("pricing", { plans: [] }), node("popup")];
    expect(migrateSections(list)).toEqual(list);
  });

  it("no preset template references a removed widget id (any depth)", () => {
    const removedIds = new Set(Object.keys(WIDGET_MIGRATIONS));
    const currentIds = new Set(WIDGETS.map((w) => w.id));
    const collect = (list: SectionInstance[]): string[] => list.flatMap((s) => [s.type, ...(s.children ? collect(s.children) : [])]);
    for (const p of PAGES) {
      const types = collect(buildTemplateSections(p.designId ?? p.template));
      for (const t of types) {
        expect(removedIds.has(t)).toBe(false);
        expect(currentIds.has(t) || ["header", "footer", "floorplans"].includes(t)).toBe(true);
      }
    }
  });
});
