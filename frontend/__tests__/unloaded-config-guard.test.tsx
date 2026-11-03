import { render } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, isUnloadedConfig, siteToSave, useConfigStore } from "@/components/openpage/store/configStore";
import { OpenPageBridge } from "@/components/openpage/editor/OpenPageBridge";
import type { LandingPageData } from "@/lib/openpage/types";
import type { BlockConfig, SiteConfig } from "@/components/openpage/blocks/types";

const heading: BlockConfig = { id: "h1", type: "heading", variant: "default", props: { text: "Rakesh Tech" } };
const realSite: SiteConfig = { name: "Rakesh Tech", blocks: [heading], pages: [{ id: "p", name: "Home", path: "/", blocks: [heading] }] };
const page = { id: "tpl-1", name: "Rakesh Tech", openPageSite: realSite, sections: [] } as unknown as LandingPageData;

afterEach(() => {
  vi.useRealTimers();
  useConfigStore.setState({ config: defaultConfig });
});

describe("never save the builder's starter page over a real page", () => {
  it("knows when nothing has been loaded", () => {
    useConfigStore.setState({ config: defaultConfig });
    expect(isUnloadedConfig(useConfigStore.getState().config)).toBe(true);
    expect(siteToSave(() => realSite)).toBe(realSite);
    useConfigStore.getState().setConfig(realSite);
    expect(isUnloadedConfig(useConfigStore.getState().config)).toBe(false);
    expect(siteToSave(() => realSite).name).toBe("Rakesh Tech");
  });

  it("reloads the page instead of saving when the store was reset (dev hot reload)", () => {
    vi.useFakeTimers();
    const onPersist = vi.fn();
    render(<OpenPageBridge page={page} onPersist={onPersist} />);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    // A hot reload recreates the store with the starter page...
    act(() => {
      useConfigStore.setState({ config: defaultConfig });
    });
    // ...and the next change happens on that starter page.
    act(() => {
      useConfigStore.setState({ config: { ...defaultConfig, name: "My Website (edited)" } });
    });
    expect(onPersist).not.toHaveBeenCalled();
    expect(useConfigStore.getState().config.name).toBe("Rakesh Tech");
    // Normal edits after that are saved as usual.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    act(() => {
      useConfigStore.setState({ config: { ...useConfigStore.getState().config, name: "Rakesh Tech v2" } });
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0].name).toBe("Rakesh Tech v2");
  });
});
