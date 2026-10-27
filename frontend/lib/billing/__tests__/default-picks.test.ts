import { describe, expect, it } from "vitest";
import { defaultPicks, rankLandingPages, rankProjects, rankTemplates, rankUsers, type PickUser } from "../default-picks";
import { DEMO_LANDING_PAGES, DEMO_PROJECTS, DEMO_USERS, PLANS } from "../mock/data";

const data = { users: DEMO_USERS, projects: DEMO_PROJECTS, landingPages: DEMO_LANDING_PAGES };
const limits = (id: string) => PLANS.find((p) => p.id === id)!.limits;

describe("default picks", () => {
  it("keeps the owner, then admins, then the most recent logins", () => {
    expect(defaultPicks(data, limits("basic")).users).toEqual(["u1", "u2"]);
    // Owner, both admins (latest login first), then Kavya (14 Oct) and Vikram (12 Oct).
    expect(defaultPicks(data, limits("growth")).users).toEqual(["u1", "u2", "u3", "u4", "u5"]);
  });

  it("puts the owner first even when an admin signed in more recently", () => {
    const users: PickUser[] = [
      { id: "a", name: "Admin", role: "admin", lastLoginAt: "2026-10-14" },
      { id: "o", name: "Owner", role: "owner", lastLoginAt: "2025-01-01" },
      { id: "g", name: "Agent", role: "agent", lastLoginAt: "2026-10-15" },
    ];
    const ranked = rankUsers(users, 2);
    expect(ranked.map((r) => r.item.id)).toEqual(["o", "a", "g"]);
    expect(ranked.map((r) => r.picked)).toEqual([true, true, false]);
    expect(ranked[0].reason).toMatch(/Owner/);
  });

  it("keeps the most recently updated projects", () => {
    expect(rankProjects(DEMO_PROJECTS, 2).filter((r) => r.picked).map((r) => r.item.id)).toEqual(["p1", "p2"]);
  });

  it("keeps the landing pages with the most leads in the last 30 days", () => {
    const ranked = rankLandingPages(DEMO_LANDING_PAGES, 1);
    expect(ranked[0].item.id).toBe("lp1");
    expect(ranked[0].reason).toBe("142 leads in the last 30 days");
    expect(ranked.filter((r) => r.picked)).toHaveLength(1);
  });
});

describe("template default picks (same rule as backend retention.util)", () => {
  it("most pages made, then most recently used, then most recently assigned", () => {
    const t = (id: string, pagesMade: number, lastUsedAt: string | null, assignedAt: string) => ({ id, name: id, pagesMade, lastUsedAt, assignedAt });
    const templates = [
      t("new-unused", 0, null, "2026-10-20"),
      t("old-unused", 0, null, "2026-08-01"),
      t("two-old", 2, "2026-09-01", "2026-07-01"),
      t("two-recent", 2, "2026-10-15", "2026-07-01"),
      t("five", 5, "2026-06-01", "2026-05-01"),
    ];
    const ranked = rankTemplates(templates, 2);
    expect(ranked.map((r) => r.item.id)).toEqual(["five", "two-recent", "two-old", "new-unused", "old-unused"]);
    expect(ranked.filter((r) => r.picked).map((r) => r.item.id)).toEqual(["five", "two-recent"]);
    expect(ranked[4].reason).toBe("No landing pages made from it yet");
    expect(defaultPicks({ users: [], projects: [], landingPages: [], templates }, { users: null, projects: null, landingPages: null, templates: 1 }).templates).toEqual(["five"]);
  });
});
