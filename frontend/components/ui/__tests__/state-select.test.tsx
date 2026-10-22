import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StateSelect } from "../state-select";

describe("StateSelect", () => {
  it("lists the Indian states and reports the GST state code", () => {
    const onChange = vi.fn();
    render(<StateSelect value="" onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "State" });
    expect(screen.getByRole("option", { name: "Select state…" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Karnataka" })).toHaveValue("29");
    fireEvent.change(select, { target: { value: "27" } });
    expect(onChange).toHaveBeenCalledWith("27");
  });

  it("can show codes and a custom empty option", () => {
    render(<StateSelect value="29" onChange={() => undefined} showCodes emptyLabel="Not set" />);
    expect(screen.getByRole("combobox")).toHaveValue("29");
    expect(screen.getByRole("option", { name: "Karnataka (29)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Not set" })).toBeInTheDocument();
  });
});

/** Every state picker is the shared component — no screen builds its own list. */
describe("StateSelect is the one state picker", () => {
  const root = process.cwd();
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const SCREENS = [
    "app/org/settings/page.tsx", // Settings → General
    "app/admin-console/organisation-detail/[id]/page.tsx", // Super Admin → edit organisation
    "components/billing/admin/company.tsx", // Super Admin → Company & tax details
  ];

  it.each(SCREENS)("%s uses <StateSelect>", (file) => {
    const src = read(file);
    expect(src).toMatch(/import \{ StateSelect \} from "@\/components\/ui\/state-select"/);
    expect(src).toMatch(/<StateSelect\b/);
  });

  it("billing no longer has its own state field (details are read-only from General settings)", () => {
    const src = read("components/billing/checkout.tsx");
    expect(src).not.toMatch(/<select/);
    expect(src).not.toMatch(/INDIAN_STATES/);
  });

  it("no other component maps INDIAN_STATES into options", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(root, dir))) {
        if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(join(root, p)).isDirectory()) walk(p);
        else if (/\.tsx$/.test(name) && /INDIAN_STATES\.map/.test(read(p))) hits.push(relative(".", p).replace(/\\/g, "/"));
      }
    };
    ["app", "components"].forEach(walk);
    expect(hits).toEqual(["components/ui/state-select.tsx"]);
  });
});
