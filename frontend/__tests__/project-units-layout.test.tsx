import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The project Units page follows the project's own unit TEMPLATE — there is
// no fixed layout. Which inventory controls exist (grouping, floors,
// configurations, price-per-area) is derived from which role fields
// (group / floor / configuration / area / price) the template carries.
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

const state = vi.hoisted(() => ({ kind: "plot" as "apartment" | "plot" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/org/projects/p1/units",
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ accessToken: "t", user: { org_id: "org-1" }, hasPermission: () => true }),
}));

const APARTMENT_TEMPLATE = [
  { key: "tower", label: "Tower", type: "text", required: false, role: "group" },
  { key: "apartment_type", label: "Apartment Type", type: "choice", required: false, role: "configuration", options: ["2 BHK", "3 BHK"] },
  { key: "floor_number", label: "Floor", type: "number", required: false, role: "floor" },
  { key: "carpet_area", label: "Carpet Area", type: "number", required: false, role: "area", unit: "sq ft" },
  { key: "price", label: "Price", type: "number", required: false, role: "price" },
];

const PLOT_TEMPLATE = [
  { key: "sector", label: "Sector", type: "text", required: false, role: "group" },
  { key: "dimensions", label: "Dimensions", type: "text", required: false },
  { key: "corner_plot", label: "Corner plot", type: "yesno", required: false },
  { key: "plot_area", label: "Plot Area", type: "number", required: false, role: "area", unit: "sq ft" },
  { key: "price", label: "Price", type: "number", required: false, role: "price" },
];

const project = () => ({
  id: "p1", name: "Green Acres", status: "active", location: null, reraId: null, manager: null,
  currency: "INR", areaUnit: "sqft", possession: null,
  projectType: state.kind === "apartment" ? "Apartment" : "Plot",
  projectTypeId: null,
  projectFieldTemplate: [],
  unitFieldTemplate: state.kind === "apartment" ? APARTMENT_TEMPLATE : PLOT_TEMPLATE,
  customFields: {},
  unitTypes: [], configurations: [], rollup: { totalUnitsPlanned: 0, unitsCreated: 2, unitsAvailable: 2, unitsBooked: 0, unitsHeld: 0, unitsSold: 0 },
});

const unit = (id: string, unitNo: string, extra = {}) => ({
  id, unitNo, orgId: "org-1", projectId: "p1", status: "available", configuration: null, variantLabel: null,
  area: null, areaUnit: "sqft", tower: null, floor: null, facing: null, parking: null,
  price: null, pricePerArea: null, customFields: {}, galleryUrls: [], floorPlanUrl: null,
  createdBy: null, updatedBy: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", ...extra,
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path === "/org/projects/p1") return project();
    if (path === "/org/projects/p1/units") {
      return state.kind === "plot"
        ? [
            unit("u1", "P-1", { tower: "S1", area: 2000, price: 4000000, pricePerArea: 2000, customFields: { dimensions: "40x50", corner_plot: true } }),
            unit("u2", "P-2", { tower: "S2", area: 1500 }),
          ]
        : [
            unit("u1", "A-101", { tower: "A", floor: 3, configuration: "2 BHK", area: 1000 }),
            unit("u2", "A-102", { tower: "A", floor: 4, configuration: "2 BHK", area: 1000 }),
          ];
    }
    return {};
  }),
  getOrgCatalogOptions: vi.fn(async () => []),
}));

const { default: UnitsPage } = await import("@/app/org/projects/[id]/units/page");

describe("project Units page — follows the project's own unit template", () => {
  it("plot template (group role, no floor/configuration): groups by the field's own label, unit fields as columns", async () => {
    state.kind = "plot";
    render(<UnitsPage />);

    expect(await screen.findByText("Availability — Sector S1")).toBeInTheDocument();
    expect(screen.getByText("Availability — Sector S2")).toBeInTheDocument();
    expect(screen.queryByText(/Availability — Tower/)).not.toBeInTheDocument();
    expect(screen.queryByText("＋ Add configuration")).not.toBeInTheDocument();

    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Sector", "Plot Area (sqft)", "Dimensions", "Corner plot"]));
    expect(headers).not.toContain("Floor");
    expect(headers).not.toContain("Config");
    expect(within(table).getByText("40x50")).toBeInTheDocument();
    expect(within(table).getByText("Yes")).toBeInTheDocument();
    // price/area carries no carpet / built-up basis — just the area unit
    expect(within(table).getByText(/2,000\.00 \/ sqft$/)).toBeInTheDocument();
  });

  it("plot template: the add-unit form has the area field and the group, but no configuration or floor", async () => {
    state.kind = "plot";
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(await screen.findByRole("button", { name: /Add unit/ }));

    expect(await screen.findByText("Plot Area (sqft)", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Sector", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Dimensions", { selector: "label" })).toBeInTheDocument();
    expect(screen.queryByText(/^Configuration/, { selector: "label" })).not.toBeInTheDocument();
    expect(screen.queryByText("Floor", { selector: "label" })).not.toBeInTheDocument();
  });

  it("apartment template (group + floor + configuration roles): still the full apartment experience", async () => {
    state.kind = "apartment";
    const user = userEvent.setup();
    render(<UnitsPage />);

    expect(await screen.findByText("Availability — Tower A")).toBeInTheDocument();
    expect(screen.getByText("＋ Add configuration")).toBeInTheDocument();
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Tower", "Apartment Type", "Carpet Area (sqft)", "Floor"]));

    await user.click(screen.getByRole("button", { name: /Add unit/ }));
    expect(await screen.findByText(/^Apartment Type/, { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Floor", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Carpet Area (sqft)", { selector: "label" })).toBeInTheDocument();
  });
});
