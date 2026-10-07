import { describe, expect, it } from "vitest";
import { WIDGETS } from "@/lib/openpage/data";
import { resolveVars } from "@/lib/openpage/data";
import { designsForWidget } from "@/lib/openpage/widget-designs";
import { buildThankYouSections } from "@/lib/openpage/page-templates";
import { migrateSections } from "@/lib/openpage/persist";
import type { SectionInstance } from "@/lib/openpage/types";

describe("widget library integrity", () => {
  it("has unique ids across the registry", () => {
    const ids = WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains no duplicate/alias widgets — merged ids are gone", () => {
    const ids = new Set(WIDGETS.map((w) => w.id));
    for (const removed of [
      "slider",
      "accordion",
      "row-2",
      "enquiry-form",
      "multistep-form",
      "whatsapp-form",
      "sticky-footer-bar",
      "whatsapp-cta",
      "offer-banner",
      "map",
      "nearby",
    ]) {
      expect(ids.has(removed)).toBe(false);
    }
  });

  it("every widget produces a valid section instance with a unique id per call", () => {
    for (const w of WIDGETS) {
      const s = w.make();
      expect(s.id).toBeTruthy();
      const s2 = w.make();
      expect(s2.id).not.toBe(s.id);
      expect(s.style.responsive).toBeTypeOf("object");
    }
  });

  it("merged primary widgets expose their configuration knobs", () => {
    const byId = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
    // Carousel keeps autoplay toggle (absorbed slider)
    expect(byId.carousel.make().settings.autoplay).toBe(true);
    // Form (absorbed enquiry/multistep/whatsapp forms) targets a Forms-module form
    expect(byId["lead-form"].make().settings.formId).toBe("form-site-visit");
    // Contact CTA exposes mode
    expect(byId["call-cta"].make().settings.mode).toBe("call");
    // CTA Banner exposes layout
    expect(byId["cta-banner"].make().settings.layout).toBe("banner");
  });

  it("hero exposes three layout presets", () => {
    const hero = WIDGETS.find((w) => w.id === "hero");
    expect(hero).toBeDefined();
    expect(designsForWidget("hero").map((d) => d.id)).toEqual(["split", "slider", "classic"]);
    expect(hero?.make().style.layout?.align).toBe("center");
  });

  it("replaces property variables in templates", () => {
    expect(resolveVars("From {{starting_price}} at {{property_name}}")).toBe("From ₹1.25 Cr at Aurora Residences");
  });

  it("applies bound inventory vars onto the same tokens", async () => {
    const { applyLandingPagePropertyFromConfig } = await import("@/lib/openpage/data");
    applyLandingPagePropertyFromConfig({
      vars: { property_name: "Skyline Heights", starting_price: "₹2 Cr" },
      property: { name: "Skyline Heights", startingPrice: "₹2 Cr" },
    });
    expect(resolveVars("{{property_name}} {{starting_price}}")).toBe("Skyline Heights ₹2 Cr");
    applyLandingPagePropertyFromConfig(null);
    expect(resolveVars("{{property_name}}")).toBe("Aurora Residences");
  });

  it("normalizes old left-aligned sections to centered defaults", () => {
    const hero = WIDGETS.find((w) => w.id === "hero")!.make();
    const migrated = migrateSections([
      {
        ...hero,
        style: {
          ...hero.style,
          layout: { ...hero.style.layout, align: "left" },
        },
      },
    ]);
    expect(migrated[0].style.layout?.align).toBe("center");
  });
});

describe("thank-you template", () => {
  const sections = buildThankYouSections();

  it("uses only current (non-migrated) widget ids", () => {
    const removed = ["slider", "accordion", "row-2", "enquiry-form", "multistep-form", "whatsapp-form", "sticky-footer-bar", "whatsapp-cta", "offer-banner", "map", "nearby"];
    for (const s of sections) expect(removed).not.toContain(s.type);
  });

  it("sends the visitor back home with a clear call to action", () => {
    const button = sections.find((s: SectionInstance) => s.type === "button");
    expect(button).toBeDefined();
    expect(button!.settings.action).toBe("link");
    expect(button!.settings.link).toBe("/");
  });

  it("has no empty copy — heading and body text are filled in", () => {
    const heading = sections.find((s: SectionInstance) => s.type === "heading");
    const body = sections.find((s: SectionInstance) => s.type === "text");
    expect(heading).toBeDefined();
    expect(String(heading!.settings.text ?? "")).not.toBe("");
    expect(body).toBeDefined();
    expect(String(body!.settings.text ?? "")).not.toBe("");
  });
});
