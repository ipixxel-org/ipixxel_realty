import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The wizard pulls in auth, routing, the API client and the catalog fetch.
// Stub all of them so the test exercises the step/validation logic only.
// jsdom has no IntersectionObserver; the shared <Reveal> wrapper constructs one
// on mount. A no-op stub is enough — the wizard content renders either way.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds = [];
}
vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ accessToken: "test-token", user: { org_id: "org-1" }, hasPermission: () => true }),
}));

const CATALOG = [
  { id: "c1", orgId: "org-1", category: "project_type", label: "Apartments", sortOrder: 0, createdAt: "", updatedAt: "" },
  { id: "c2", orgId: "org-1", category: "price_includes", label: "Floor rise", sortOrder: 0, createdAt: "", updatedAt: "" },
  { id: "c3", orgId: "org-1", category: "payment_plan", label: "Construction-linked", sortOrder: 0, createdAt: "", updatedAt: "" },
];

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith("/org/users")) return { data: [] };
    if (path === "/org/settings") return { name: "Skyline Developers" };
    if (path.startsWith("/org/templates")) return { data: [] };
    return {};
  }),
  getOrgCatalogOptions: vi.fn(async () => CATALOG),
  getOrgProjectTypes: vi.fn(async () => [
    { id: "t1", orgId: "org-1", name: "Apartments", layout: "tower", groupLabel: null, projectFields: [], unitFields: [], sortOrder: 0, inUse: 0 },
  ]),
  addCommonProjectTypes: vi.fn(),
  getOrgLandingPages: vi.fn(async () => []),
  getProjectSalesAgentCandidates: vi.fn(async () => ({ data: [], total: 0 })),
  getProjectManagerCandidates: vi.fn(async () => ({ data: [], total: 0 })),
  setProjectSalesAgents: vi.fn(async () => ({})),
}));

// Imported after the mocks so the module graph picks them up.
const { default: AddNewProjectPage } = await import("@/app/org/projects/add-new-project/page");

/** The step-rail button for a step, by its label. */
function railStep(label: string) {
  return screen.getByRole("button", { name: new RegExp(label, "i") });
}

/**
 * Fill a text input in one shot. The wizard re-renders and rewrites its
 * localStorage draft on every keystroke, so `user.type` on a long string is
 * slow enough to flake under a loaded parallel run — and these tests only care
 * that the field is non-empty.
 */
async function fill(user: ReturnType<typeof userEvent.setup>, placeholder: string, value: string) {
  const el = screen.getByPlaceholderText(placeholder);
  await user.click(el);
  await user.paste(value);
}

/** Move to a step via the rail, confirming through the incomplete-step warning. */
async function jumpTo(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(railStep(label));
  const override = screen.queryByRole("button", { name: /anyway/ });
  if (override) await user.click(override);
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("project wizard — per-step required-field validation", () => {
  it("blocks Continue on step 1 and names every missing field", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    expect(screen.getByRole("heading", { name: "Project basics" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next Step/ }));

    // Still on step 1 — nothing advanced.
    expect(screen.getByRole("heading", { name: "Project basics" })).toBeInTheDocument();

    // Every missing field is named inline...
    expect(screen.getByText("Project name is required.")).toBeInTheDocument();
    expect(screen.getByText("Pick a project type.")).toBeInTheDocument();
    // RERA registration no. is optional — it must NOT be demanded.
    expect(screen.queryByText("RERA registration number is required.")).not.toBeInTheDocument();

    // ...and summarised next to the button that refused.
    const summary = screen.getByText(/Fill in these fields to continue/).closest("div")!;
    expect(within(summary).getByText("Project name")).toBeInTheDocument();
    expect(within(summary).getByText("Project type")).toBeInTheDocument();
    expect(within(summary).queryByText("RERA registration no.")).not.toBeInTheDocument();
  });

  it("advances once the step's required fields are filled", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await fill(user, "e.g. Palm Residency", "Palm Residency");
    await user.click(await screen.findByText("Apartments"));
    // No RERA number entered — it's optional, so Step 1 still advances.
    await user.click(screen.getByRole("button", { name: /Next Step/ }));

    expect(screen.getByRole("heading", { name: /Inventory & configuration/ })).toBeInTheDocument();
  });

  it("lets a step with no required fields continue freely", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await fill(user, "e.g. Palm Residency", "Palm Residency");
    await user.click(await screen.findByText("Apartments"));
    await fill(user, "e.g. PR/GJ/AHM/2026/00842", "R1");
    await user.click(screen.getByRole("button", { name: /Next Step/ }));

    // Step 2 (Inventory) has no asterisked fields.
    await user.click(screen.getByRole("button", { name: /Next Step/ }));
    expect(screen.getByRole("heading", { name: /Pricing & payment/ })).toBeInTheDocument();
  });

  it("blocks Continue on each later step that has required fields", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    // Step 3 — Price range from.
    await jumpTo(user, "Pricing & payment");
    await user.click(screen.getByRole("button", { name: /Next Step/ }));
    expect(screen.getByText("Enter the starting price.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pricing & payment/ })).toBeInTheDocument();

    // Step 4 — Full address + City.
    await jumpTo(user, "Location");
    await user.click(screen.getByRole("button", { name: /Next Step/ }));
    expect(screen.getByText("Full address is required.")).toBeInTheDocument();
    expect(screen.getByText("City is required.")).toBeInTheDocument();

    // Step 7 — Project manager auto-assigns when the org has no managers, so it
    // no longer blocks: Team & access continues straight through.
    await jumpTo(user, "Team & access");
    await user.click(screen.getByRole("button", { name: /Next Step/ }));
    expect(screen.getByRole("heading", { name: /Documents & media/ })).toBeInTheDocument();
  });

  it("warns before a step-rail jump ahead out of an incomplete step", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await user.click(railStep("Documents & media"));

    // Blocked, with a warning naming what is unfinished.
    expect(screen.getByText(/Project basics isn/)).toBeInTheDocument();
    expect(screen.getByText(/Still needed here/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project basics" })).toBeInTheDocument();

    // The warning is an override, not a wall.
    await user.click(screen.getByRole("button", { name: /Go to Documents & media anyway/ }));
    expect(screen.getByRole("heading", { name: /Documents & media/ })).toBeInTheDocument();
  });

  it("does not warn when jumping backwards", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await jumpTo(user, "Documents & media");

    // Back to step 1 — no warning, even though step 1 is still incomplete.
    await user.click(railStep("Project basics"));
    expect(screen.queryByText(/Still needed here/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project basics" })).toBeInTheDocument();
  });

  it("lists everything still missing on Review & launch", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await jumpTo(user, "Review & launch");

    // name, type, price-from, address, city. RERA is optional, and Status /
    // Currency start pre-selected. The manager list loads empty, so the
    // project is auto-assigned to the org admin and not required.
    expect(screen.getByText(/5 required fields still empty/)).toBeInTheDocument();
  });

  it("has no Skip button on any step, including Marketing and Team & access", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    for (const label of [
      "Project basics", "Inventory & config", "Pricing & payment", "Location",
      "Amenities & specs", "Marketing & leads", "Team & access", "Documents & media",
      "Review & launch",
    ]) {
      await jumpTo(user, label);
      expect(screen.queryByRole("button", { name: /^Skip$/ })).not.toBeInTheDocument();
    }
    // Walking all nine steps is ~18 awaited interactions on a heavy component;
    // the 5s default is too tight for it in a loaded parallel run.
  }, 30_000);
});

describe("project wizard — catalog-driven pricing options", () => {
  it("shows Price includes and Payment plan from the org catalog", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await jumpTo(user, "Pricing & payment");

    expect(screen.getByText(/included in the price/)).toBeInTheDocument();
    expect(await screen.findByText("Floor rise")).toBeInTheDocument();
    expect(screen.getByText("Construction-linked")).toBeInTheDocument();
    // Nothing survives from the old hardcoded lists.
    expect(screen.queryByText("Club membership")).not.toBeInTheDocument();
    expect(screen.queryByText("Subvention")).not.toBeInTheDocument();
  });
});

describe("project wizard — dynamic specification rows", () => {
  it("starts with four deletable default rows and an Add button", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await jumpTo(user, "Amenities & specs");

    for (const label of ["Flooring", "Kitchen", "Doors & windows", "Fittings"]) {
      expect(screen.getByDisplayValue(label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "+ Add specification" })).toBeInTheDocument();
    expect(screen.getByText("Additional notes")).toBeInTheDocument();
  });

  it("adds and removes rows", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await jumpTo(user, "Amenities & specs");

    await user.click(screen.getByRole("button", { name: "+ Add specification" }));
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "Remove Kitchen" }));
    expect(screen.queryByDisplayValue("Kitchen")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(4);
  });
});

describe("project wizard — project-level floor plan", () => {
  it("offers an overall plan upload without disturbing the per-unit-type note", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);

    await jumpTo(user, "Documents & media");

    expect(screen.getByText("Project floor / site plan")).toBeInTheDocument();
    // The separate per-unit-type concept is still explained without adding a
    // second upload control to the wizard.
    expect(screen.getByText(/Per-unit-type floor plans are added per configuration/)).toBeInTheDocument();
  });
});
