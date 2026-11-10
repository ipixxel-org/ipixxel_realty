import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { LeadFormBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import { OpenPageRuntimeProvider } from "@/components/openpage/runtime/OpenPageRuntime";
import { newFormDefinition, saveFormLibrary, type FormDefinition } from "@/lib/openpage/forms-store";
import { pageFormsWithLibraryFallback } from "@/lib/openpage/resolve-form";

// The same form twice: the Lead Forms original mirrored into the browser
// library, and the page's own copy restyled in the builder's Forms panel.
function formPair() {
  const original = newFormDefinition(undefined, "Get in touch form");
  original.submitLabel = "Submit";
  original.style = { background: "", textColor: "", buttonColor: "", radius: 10 };
  const pageCopy: FormDefinition = JSON.parse(JSON.stringify(original));
  pageCopy.submitLabel = "Submit now";
  pageCopy.style = { background: "#f8f4ef", textColor: "#5c0030", buttonColor: "#5c0030", radius: 0 };
  return { original, pageCopy };
}

function renderLeadForm(pageForms: FormDefinition[], formId = "") {
  const block: BlockConfig = { id: "lf", type: "lead-form", variant: "card", props: { formId } };
  return render(
    <OpenPageRuntimeProvider live={false} forms={pageForms} popups={[]}>
      <LeadFormBlock block={block} />
    </OpenPageRuntimeProvider>,
  );
}

afterEach(() => window.localStorage.clear());

describe("page form copies win over the browser form library", () => {
  it("keeps the page copy when the library has the same id", () => {
    const { original, pageCopy } = formPair();
    const merged = pageFormsWithLibraryFallback([pageCopy], [original]);
    expect(merged).toHaveLength(1);
    expect(merged[0].style?.buttonColor).toBe("#5c0030");
  });

  it("adds library forms the page has no copy of, after the page forms", () => {
    const { pageCopy } = formPair();
    const other = newFormDefinition(undefined, "Request Call Back");
    const merged = pageFormsWithLibraryFallback([pageCopy], [other]);
    expect(merged.map((f) => f.id)).toEqual([pageCopy.id, other.id]);
  });

  it("handles missing lists and forms without an id", () => {
    const { pageCopy } = formPair();
    expect(pageFormsWithLibraryFallback(undefined, undefined)).toEqual([]);
    const noId = { ...pageCopy, id: "" } as FormDefinition;
    expect(pageFormsWithLibraryFallback([noId], [pageCopy]).map((f) => f.id)).toEqual([pageCopy.id]);
  });

  it("renders the restyled page copy, not the library original", () => {
    const { original, pageCopy } = formPair();
    saveFormLibrary([original]);
    renderLeadForm([pageCopy], pageCopy.id);
    const button = screen.getByRole("button", { name: "Submit now" });
    expect(button).toHaveStyle({ backgroundColor: "#5c0030", borderRadius: "0px" });
  });

  it("still shows the page's first form when no form is selected", () => {
    const { pageCopy } = formPair();
    const libraryOnly = newFormDefinition(undefined, "Library form");
    libraryOnly.submitLabel = "Library submit";
    saveFormLibrary([libraryOnly]);
    renderLeadForm([pageCopy]);
    expect(screen.getByRole("button", { name: "Submit now" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Library submit" })).toBeNull();
  });

  it("falls back to the library when the page has no copy of the selected form", () => {
    const { original } = formPair();
    saveFormLibrary([original]);
    renderLeadForm([], original.id);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });
});
