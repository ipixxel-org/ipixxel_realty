/** NEXT_PUBLIC_BILLING_V2 gates the real-app integration: off = untouched, on = banners, badges, new panels. */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/projects",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
  });
  window.localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function load(flag: "true" | "false", situation?: string) {
  vi.stubEnv("NEXT_PUBLIC_BILLING_V2", flag);
  if (situation) window.localStorage.setItem("billing-v2:mock:v1", JSON.stringify({ situation }));
  const shell = await import("@/components/billing/shell-integration");
  const locked = await import("@/components/billing/locked");
  const overview = await import("@/components/billing/overview");
  // Same fresh module graph as the components (vi.resetModules), so the toast context matches.
  const { ToastProvider } = await import("@/components/ui/toast");
  return { ...shell, ...locked, ...overview, ToastProvider };
}

describe("billing v2 flag", () => {
  it("off: the shell wrapper renders the page untouched, with no banners or badges", async () => {
    const { BillingV2Root, ProjectAccessBadge, TeamChatComposerGate, ToastProvider } = await load("false", "moved_to_basic");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <p>page content</p>
          <ProjectAccessBadge projectId="p2" />
          <TeamChatComposerGate>
            <textarea aria-label="composer" />
          </TeamChatComposerGate>
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("View only")).toBeNull();
    expect(screen.getByLabelText("composer")).toBeInTheDocument();
  });

  it("on: shows the account banner and the locked states for an org moved to Basic", async () => {
    const { BillingV2Root, ProjectAccessBadge, LandingPageAccessBadge, TeamChatComposerGate, ToastProvider } = await load("true", "moved_to_basic");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <ProjectAccessBadge projectId="p2" />
          <ProjectAccessBadge projectId="p1" />
          <LandingPageAccessBadge landingPageId="lp3" />
          <TeamChatComposerGate>
            <textarea aria-label="composer" />
          </TeamChatComposerGate>
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText(/You're on Basic now/)).toBeInTheDocument();
    expect(screen.getAllByText("View only")).toHaveLength(1);
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.queryByLabelText("composer")).toBeNull();
    expect(screen.getByText(/Team chat isn't included in Basic/)).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it("on: Settings → Billing panel renders the overview with a Sample data tag", async () => {
    const { BillingV2Root, BillingOverviewPanel, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <BillingOverviewPanel />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByText("IPX/26-27/0712")).toBeInTheDocument();
    expect(errors).toEqual([]);
  });
});
