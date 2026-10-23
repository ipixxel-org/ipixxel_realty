import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettingsView } from "@/lib/types";

const api = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  updateAiSettings: vi.fn(),
  clearAiSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { roleKeys: ["super_admin"] } }),
}));

import { AiSettings } from "@/components/superadmin/ai-settings";

const MASK = "••••••••";

function view(over: Partial<AiSettingsView> = {}): AiSettingsView {
  return {
    source: "database",
    provider: "anthropic",
    activeProvider: "anthropic",
    activeModel: "claude-sonnet-5-5",
    geminiModel: "gemini-3.8-flash",
    geminiThinkingBudget: "",
    geminiApiKey: "",
    hasGeminiApiKey: false,
    anthropicModel: "claude-sonnet-5-5",
    anthropicApiKey: MASK,
    hasAnthropicApiKey: true,
    aiGenerateApiUrl: "",
    aiGenerateApiKey: "",
    hasAiGenerateApiKey: false,
    updatedAt: null,
    ...over,
  };
}

async function renderLoaded(v: AiSettingsView) {
  api.getAiSettings.mockResolvedValue(v);
  api.updateAiSettings.mockImplementation((input: { anthropicModel: string }) =>
    Promise.resolve(view({ ...v, anthropicModel: input.anthropicModel })),
  );
  render(<AiSettings />);
  const select = await screen.findByLabelText(/^Model/, { selector: "select#ai-anthropic-model" });
  await waitFor(() => expect(select).not.toBeDisabled());
  return select as HTMLSelectElement;
}

describe("AI settings — Claude model picker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the saved Claude model selected and offers Sonnet, Opus and Haiku", async () => {
    const select = await renderLoaded(view());

    expect(select.value).toBe("claude-sonnet-5-5");
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]),
    );
  });

  it("saves the chosen model with the existing payload shape", async () => {
    const select = await renderLoaded(view());

    fireEvent.change(select, { target: { value: "claude-opus-5-5" } });
    fireEvent.click(screen.getByRole("button", { name: /Save AI credentials/i }));

    await waitFor(() => expect(api.updateAiSettings).toHaveBeenCalledTimes(1));
    expect(api.updateAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", anthropicModel: "claude-opus-5-5", anthropicApiKey: MASK }),
    );
  });

  it("keeps an unlisted saved model editable as a custom ID", async () => {
    const select = await renderLoaded(view({ anthropicModel: "claude-opus-5" }));

    expect(select.value).toBe("__custom__");
    const custom = screen.getByLabelText("Custom Claude model ID") as HTMLInputElement;
    expect(custom.value).toBe("claude-opus-5");

    fireEvent.change(custom, { target: { value: "claude-sonnet-4-6" } });
    fireEvent.click(screen.getByRole("button", { name: /Save AI credentials/i }));
    await waitFor(() =>
      expect(api.updateAiSettings).toHaveBeenCalledWith(
        expect.objectContaining({ anthropicModel: "claude-sonnet-4-6" }),
      ),
    );
  });
});
