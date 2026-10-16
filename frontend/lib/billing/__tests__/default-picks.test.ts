import { describe, expect, it } from "vitest";
import { defaultPicks, rankLandingPages, rankProjects, rankUsers, type PickUser } from "../default-picks";
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
