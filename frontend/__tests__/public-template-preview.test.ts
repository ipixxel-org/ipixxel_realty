import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("../lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { loadPublicTemplate } from "@/lib/openpage/persist";

describe("loadPublicTemplate (no-login template preview)", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    localStorage.clear();
  });

  it("reads the public endpoint, never the admin one", async () => {
    apiFetch.mockResolvedValue({ id: "abc", name: "Green", slug: "green", status: "published", content: { sections: [], config: {} } });
    const page = await loadPublicTemplate("abc");
    expect(apiFetch).toHaveBeenCalledWith("/templates/abc");
    expect(page?.id).toBe("abc");
  });

  it("returns null for drafts / missing templates instead of a local copy", async () => {
    localStorage.setItem("prestate.page.abc", JSON.stringify({ id: "abc", name: "Local draft" }));
    apiFetch.mockRejectedValue(new Error("Template not found"));
    expect(await loadPublicTemplate("abc")).toBeNull();
  });

  it("encodes the id", async () => {
    apiFetch.mockResolvedValue({ id: "a/b", name: "x", slug: "x", status: "published", content: { sections: [], config: {} } });
    await loadPublicTemplate("a/b");
    expect(apiFetch).toHaveBeenCalledWith("/templates/a%2Fb");
  });
});
