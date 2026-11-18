import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getPublicFormByEmbed: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), getPublicFormByEmbed: api.getPublicFormByEmbed }));

import { OpenPageRuntimeProvider } from "@/components/openpage/runtime/OpenPageRuntime";
import { newFormDefinition, type FormDefinition } from "@/lib/openpage/forms-store";
import { popupTargetFromHref } from "@/lib/openpage/popup-links";

describe("popupTargetFromHref", () => {
  it("reads #popup, #popup:<id> and form embed URLs", () => {
    expect(popupTargetFromHref("#popup")).toEqual({ ref: "", fromUrl: false });
    expect(popupTargetFromHref("#popup:emb_gvorb3rqgwd7")).toEqual({ ref: "emb_gvorb3rqgwd7", fromUrl: false });
    expect(popupTargetFromHref("#popup:form_lfrpmwb")).toEqual({ ref: "form_lfrpmwb", fromUrl: false });
    expect(popupTargetFromHref("https://app.ipixxelos.com/embed/form/emb_gvorb3rqgwd7")).toEqual({ ref: "emb_gvorb3rqgwd7", fromUrl: true });
    expect(popupTargetFromHref("/embed/form/emb_x/")).toEqual({ ref: "emb_x", fromUrl: true });
  });

  it("leaves every other link alone", () => {
    for (const href of ["", "#enquire", "#popular", "#popups", "https://example.com", "/about", "tel:+911234", "javascript:alert(1)", "https://x.com/embed/form/"]) {
      expect(popupTargetFromHref(href)).toBeNull();
    }
  });
});

function makeForm(name: string): FormDefinition {
  const f = newFormDefinition(undefined, name);
  f.submitLabel = `Send ${name}`;
  return f;
}

function page(forms: FormDefinition[], href: string, opts: { editing?: boolean } = {}) {
  return render(
    <OpenPageRuntimeProvider live={false} forms={forms} popups={[]}>
      <div data-block-id="b1">
        <a href={href} onClick={opts.editing ? (e) => e.preventDefault() : undefined}>
          Enquire Now
        </a>
      </div>
    </OpenPageRuntimeProvider>,
  );
}

afterEach(() => {
  api.getPublicFormByEmbed.mockReset();
  window.localStorage.clear();
});

describe("popup links on the page", () => {
  it("#popup:<form id> opens that form in a popup", async () => {
    const main = makeForm("Main");
    const visit = makeForm("Site visit");
    page([main, visit], `#popup:${visit.id}`);
    fireEvent.click(screen.getByText("Enquire Now"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Send Site visit/ })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Send Main/ })).toBeNull();
  });

  it("a form URL for a form not on the page loads it and opens it in a popup", async () => {
    const remote = makeForm("Brochure");
    api.getPublicFormByEmbed.mockResolvedValue({ id: "rec1", name: "Brochure", content: remote, createdAt: "", updatedAt: "" });
    page([makeForm("Main")], "https://app.ipixxelos.com/embed/form/emb_abc456");
    fireEvent.click(screen.getByText("Enquire Now"));
    expect(api.getPublicFormByEmbed).toHaveBeenCalledWith("emb_abc456");
    await waitFor(() => expect(screen.getByRole("button", { name: /Send Brochure/ })).toBeTruthy());
  });

  it("ordinary links and clicks the editor already handled open nothing", () => {
    const { unmount } = page([makeForm("Main")], "#enquire");
    fireEvent.click(screen.getByText("Enquire Now"));
    expect(screen.queryByLabelText("Close")).toBeNull();
    unmount();
    page([makeForm("Main")], "#popup", { editing: true });
    fireEvent.click(screen.getByText("Enquire Now"));
    expect(screen.queryByLabelText("Close")).toBeNull();
  });
});
