import { describe, expect, it } from "vitest";
import { businessSyncPatch, businessValuesFromOrg } from "@/lib/openpage/business-defaults";
import type { SafeOrganisation } from "@/lib/types";

const org = {
  name: "ipixxel tech",
  city: "janpur",
  address_line1: "jaunpur",
  address_line2: " up ",
  support_email: "info@ipixxel.example",
  support_phone: null,
  website: "https://ignored.example",
} as unknown as SafeOrganisation;

describe("Business Info from the organisation", () => {
  it("maps the fields Settings → General owns", () => {
    expect(businessValuesFromOrg(org)).toEqual({
      name: "ipixxel tech",
      address: "jaunpur, up",
      city: "janpur",
      email: "info@ipixxel.example",
      phone: "",
    });
  });

  it("has nothing for Super Admin templates (no organisation)", () => {
    expect(businessValuesFromOrg(null)).toBeNull();
  });

  it("syncs only the org-owned fields that differ, keeping page-only ones", () => {
    const values = businessValuesFromOrg(org)!;
    expect(
      businessSyncPatch({ name: "old name", city: "janpur", tagline: "Live well", website: "https://x" }, values),
    ).toEqual({ name: "ipixxel tech", address: "jaunpur, up", email: "info@ipixxel.example" });
  });

  it("writes nothing when the page already matches", () => {
    const values = businessValuesFromOrg(org)!;
    expect(businessSyncPatch({ ...values, tagline: "t" }, values)).toBeNull();
    // An empty org value matches a missing page value.
    expect(businessSyncPatch({ name: "ipixxel tech", address: "jaunpur, up", city: "janpur", email: "info@ipixxel.example" }, values)).toBeNull();
  });
});
