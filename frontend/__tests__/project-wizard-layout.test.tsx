import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Step 2 of the create wizard renders from the picked project's templates.
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ accessToken: "test-token", user: { org_id: "org-1" }, hasPermission: () => true }),
}));

const type = (id: string, name: string, extra = {}) => ({
  id, orgId: "org-1", name, projectFields: [], unitFields: [], sortOrder: 0, inUse: 0, ...extra,
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith("/org/users")) return { data: [] };
    if (path === "/org/settings") return { name: "Skyline Developers" };
    if (path.startsWith("/org/templates")) return { data: [] };
    if (path === "/org/project-types") {
      return [
        type("t1", "Apartments", {
          projectFields: [
            { key: "tower_count", label: "No. of Towers / Blocks", type: "number", required: false },
            { key: "floors", label: "Floors / Structure", type: "text", required: false },
            { key: "area_range", label: "Area Range", type: "text", required: false },
            { key: "total_land", label: "Total Land Area", type: "number", required: false, unit: "acres" },
          ],
          unitFields: [
            { key: "tower", label: "Tower / Building", type: "text", required: false, role: "group" },
            { key: "configuration", label: "Apartment Type", type: "choice", required: false, role: "configuration", options: ["2 BHK"] },
            { key: "floor", label: "Floor Number", type: "number", required: false, role: "floor" },
            { key: "area", label: "Carpet Area", type: "number", required: false, role: "area" },
            { key: "price", label: "Price", type: "number", required: false, role: "price" },
          ],
        }),
        type("t2", "Plots", {
          projectFields: [
            { key: "number_of_plots", label: "Number of plots", type: "number", required: true },
            { key: "total_land", label: "Total land", type: "number", required: false, unit: "acres" },
          ],
          unitFields: [
            { key: "configuration", label: "Plot Type", type: "choice", required: false, role: "configuration", options: ["Residential"] },
            { key: "plot_area", label: "Plot Area", type: "number", required: false, role: "area", unit: "sq ft" },
            { key: "price", label: "Price", type: "number", required: false, role: "price" },
          ],
        }),
        type("t3", "Villas", {
          projectFields: [],
          unitFields: [
            { key: "configuration", label: "Configuration", type: "choice", required: false, role: "configuration", options: ["2 BHK"] },
            { key: "built_up_area", label: "Built-up Area", type: "number", required: false, role: "area", unit: "sq ft" },
            { key: "plot_area", label: "Plot Area", type: "number", required: false, unit: "sq ft" },
            { key: "price", label: "Price", type: "number", required: false, role: "price" },
          ],
        }),
        type("t4", "Farmhouses"),
      ];
    }
    return {};
  }),
  getOrgCatalogOptions: vi.fn(async () => []),
  getOrgProjectTypes: vi.fn(async () => [
    type("t1", "Apartments", {
      projectFields: [
        { key: "tower_count", label: "No. of Towers / Blocks", type: "number", required: false },
        { key: "floors", label: "Floors / Structure", type: "text", required: false },
        { key: "area_range", label: "Area Range", type: "text", required: false },
        { key: "total_land", label: "Total Land Area", type: "number", required: false, unit: "acres" },
      ],
      unitFields: [
        { key: "tower", label: "Tower / Building", type: "text", required: false, role: "group" },
        { key: "configuration", label: "Apartment Type", type: "choice", required: false, role: "configuration", options: ["2 BHK"] },
        { key: "floor", label: "Floor Number", type: "number", required: false, role: "floor" },
        { key: "area", label: "Carpet Area", type: "number", required: false, role: "area" },
        { key: "price", label: "Price", type: "number", required: false, role: "price" },
      ],
    }),
    type("t2", "Plots", {
      projectFields: [
        { key: "number_of_plots", label: "Number of plots", type: "number", required: true },
        { key: "total_land", label: "Total land", type: "number", required: false, unit: "acres" },
      ],
      unitFields: [
        { key: "configuration", label: "Plot Type", type: "choice", required: false, role: "configuration", options: ["Residential"] },
        { key: "plot_area", label: "Plot Area", type: "number", required: false, role: "area", unit: "sq ft" },
        { key: "price", label: "Price", type: "number", required: false, role: "price" },
      ],
    }),
    type("t3", "Villas", {
      projectFields: [],
      unitFields: [
        { key: "configuration", label: "Configuration", type: "choice", required: false, role: "configuration", options: ["2 BHK"] },
        { key: "built_up_area", label: "Built-up Area", type: "number", required: false, role: "area", unit: "sq ft" },
        { key: "plot_area", label: "Plot Area", type: "number", required: false, unit: "sq ft", extraDefault: true },
        { key: "price", label: "Price", type: "number", required: false, role: "price" },
      ],
    }),
    type("t4", "Farmhouses"),
  ]),
  addCommonProjectTypes: vi.fn(async () => ({
    types: [
      type("t1", "Apartments", {
        projectFields: [
          { key: "tower_count", label: "No. of Towers / Blocks", type: "number", required: false },
          { key: "floors", label: "Floors / Structure", type: "text", required: false },
          { key: "area_range", label: "Area Range", type: "text", required: false },
          { key: "total_land", label: "Total Land Area", type: "number", required: false, unit: "acres" },
        ],
        unitFields: [
          { key: "tower", label: "Tower / Building", type: "text", required: false, role: "group" },
          { key: "configuration", label: "Apartment Type", type: "choice", required: false, role: "configuration", options: ["2 BHK"] },
          { key: "floor", label: "Floor Number", type: "number", required: false, role: "floor" },
          { key: "area", label: "Carpet Area", type: "number", required: false, role: "area" },
          { key: "price", label: "Price", type: "number", required: false, role: "price" },
        ],
      }),
      type("t2", "Plots", {
        projectFields: [
          { key: "number_of_plots", label: "Number of plots", type: "number", required: true },
          { key: "total_land", label: "Total land", type: "number", required: false, unit: "acres" },
        ],
        unitFields: [
          { key: "configuration", label: "Plot Type", type: "choice", required: false, role: "configuration", options: ["Residential"] },
          { key: "plot_area", label: "Plot Area", type: "number", required: false, role: "area", unit: "sq ft" },
          { key: "price", label: "Price", type: "number", required: false, role: "price" },
        ],
      }),
      type("t3", "Villas", {
        projectFields: [],
        unitFields: [
          { key: "configuration", label: "Configuration", type: "choice", required: false, role: "configuration", options: ["2 BHK"] },
          { key: "built_up_area", label: "Built-up Area", type: "number", required: false, role: "area", unit: "sq ft" },
          { key: "plot_area", label: "Plot Area", type: "number", required: false, unit: "sq ft" },
          { key: "price", label: "Price", type: "number", required: false, role: "price" },
        ],
      }),
      type("t4", "Farmhouses"),
    ],
  })),
  getOrgLandingPages: vi.fn(async () => []),
  getProjectSalesAgentCandidates: vi.fn(async () => ({ data: [], total: 0 })),
  getProjectManagerCandidates: vi.fn(async () => ({ data: [], total: 0 })),
  setProjectSalesAgents: vi.fn(async () => ({})),
}));

const { default: AddNewProjectPage } = await import("@/app/org/projects/add-new-project/page");

async function toStep2(user: ReturnType<typeof userEvent.setup>, typeName: string) {
  const nameInput = screen.getByPlaceholderText("e.g. Palm Residency");
  await user.click(nameInput);
  await user.paste("Test Project");
  await user.click(await screen.findByText(typeName));
  await user.click(screen.getByRole("button", { name: /Next Step/ }));
  expect(await screen.findByRole("heading", { name: /Inventory & configuration/ })).toBeInTheDocument();
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("project wizard — Step 2 follows the project type's layout", () => {
  it("apartment: shows role-driven configuration controls and project fields", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);
    await toStep2(user, "Apartments");

    expect(screen.getByText(/Unit configurations \(select all\)/)).toBeInTheDocument();
    // The picked type's project fields are prefilled rows — their labels live
    // in editable label inputs, a deliberate redesign from the old hardcoded
    // tower/floor/area inputs.
    expect(screen.getByDisplayValue("No. of Towers / Blocks")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Floors / Structure")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Area Range")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Total Land Area")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add project field" })).toBeInTheDocument();
    expect(screen.getByText("Unit fields")).toBeInTheDocument();
  });

  it("plot: no grouping or floors, but keeps its own plot area defaults", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);
    await toStep2(user, "Plots");

    expect(screen.queryByDisplayValue("No. of Towers / Blocks")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Floors / Structure")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Number of plots")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Total land")).toBeInTheDocument();
    // The single configuration chip is off by default; toggling it on seeds the
    // area default the plot's template carries.
    await user.click(screen.getByText("Residential"));
    expect(screen.getByLabelText("Plot Area for Residential")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add project field" })).toBeInTheDocument();
    expect(screen.getByText("Unit fields")).toBeInTheDocument();
  });

  it("plot: a required type field blocks Continue until it is filled", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);
    await toStep2(user, "Plots");

    await user.click(screen.getByRole("button", { name: /Next Step/ }));
    expect(screen.getByText("Number of plots is required.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Inventory & configuration/ })).toBeInTheDocument();
  });

  it("plot and villa: show the project-specific default area fields for each configuration", async () => {
    let user = userEvent.setup();
    let view = render(<AddNewProjectPage />);
    await toStep2(user, "Plots");
    await user.click(screen.getByText("Residential"));
    expect(screen.getByLabelText("Plot Area for Residential")).toBeInTheDocument();
    view.unmount();

    user = userEvent.setup();
    render(<AddNewProjectPage />);
    await toStep2(user, "Villas");
    await user.click(screen.getByText("2 BHK"));
    expect(screen.getByLabelText("Built-up Area for 2 BHK")).toBeInTheDocument();
    expect(screen.getByLabelText("Plot Area for 2 BHK")).toBeInTheDocument();
  });

  it("custom flat type: no grouping at all", async () => {
    const user = userEvent.setup();
    render(<AddNewProjectPage />);
    await toStep2(user, "Farmhouses");

    expect(screen.queryByText(/No\. of/)).not.toBeInTheDocument();
    expect(screen.queryByText("Floors / Structure")).not.toBeInTheDocument();
    expect(screen.queryByText(/Unit configurations/)).not.toBeInTheDocument();
  });
});
