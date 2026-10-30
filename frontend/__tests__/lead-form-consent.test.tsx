import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockConfig } from "@/components/openpage/blocks/types";
import { LeadFormBlock } from "@/components/openpage/blocks/realestate/RealEstateBlocks";
import { CustomFields } from "@/components/openpage/blocks/CustomFields";

const TEXT = "I authorize company representatives to Call, SMS, Email or WhatsApp me about its products and offers.";
const block = (props: Record<string, unknown>, variant: string): BlockConfig => ({ id: "lf", type: "lead-form", variant, props });

describe("Contact / Enquiry form consent text", () => {
  it.each(["split", "card", "inline", "default"])("shows the consent text in the %s template", (variant) => {
    const { container } = render(<LeadFormBlock block={block({ title: "Get a Call Back", consent: TEXT }, variant)} />);
    expect(container.querySelector('[data-el-name="lead-form:consent"]')).toHaveTextContent(TEXT);
  });

  it("shows nothing when the consent text is empty", () => {
    const { container } = render(<LeadFormBlock block={block({ consent: "  " }, "split")} />);
    expect(container.querySelector('[data-el-name="lead-form:consent"]')).toBeNull();
  });

  it.each(["split", "card", "inline", "default"])("shows the description right after the title in the %s template", (variant) => {
    const { container } = render(
      <LeadFormBlock block={block({ title: "Get a Call Back", subtitle: "Sub", description: "Talk to our expert today.\nNo spam.", consent: "" }, variant)} />,
    );
    const title = container.querySelector('[data-el-name="lead-form:title"]');
    const desc = container.querySelector('[data-el-name="lead-form:description"]');
    expect(desc).toHaveTextContent("Talk to our expert today.");
    expect(title?.nextElementSibling).toBe(desc);
  });

  it("shows no description when it is empty", () => {
    const { container } = render(<LeadFormBlock block={block({ title: "T", description: " " }, "card")} />);
    expect(container.querySelector('[data-el-name="lead-form:description"]')).toBeNull();
  });

  it("is not shown twice when consent was added with Add Field", () => {
    const { container } = render(<CustomFields block={block({ consent: TEXT, _customFields: ["consent"] }, "split")} />);
    expect(container.textContent).not.toContain(TEXT);
  });
});
