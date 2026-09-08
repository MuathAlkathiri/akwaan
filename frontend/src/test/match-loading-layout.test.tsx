import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LiveSessionContext,
  type LiveSessionContextValue,
} from "@/features/live-game-session/hooks/live-session-context";
import { MatchHostScreen } from "@/features/live-game-session/match/components/match-host-screen";
import { isHostMatchPath } from "@/components/layout";

/**
 * The composition of the Match wait, not the loader itself.
 *
 * The approved loader is untouched here: these assertions are about the region
 * it sits in. A Match owns the viewport, so a state that has no content yet must
 * centre in the space between the HUD and the bottom of the screen rather than
 * being stranded at the top of a full-height empty canvas.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches/session-1",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

function renderHydrating(overrides: Partial<LiveSessionContextValue> = {}) {
  const value = {
    connection: "connected",
    syncState: "idle",
    command: vi.fn(),
    gameplayCommand: vi.fn(),
    resync: vi.fn(),
    ...overrides,
  } as LiveSessionContextValue;
  return render(
    <LiveSessionContext.Provider value={value}>
      <MatchHostScreen />
    </LiveSessionContext.Provider>,
  );
}

describe("Match loading composition", () => {
  it("still shows the one approved loader, with its caller-supplied line", () => {
    renderHydrating();
    const loader = screen.getByTestId("akwaan-loader");
    expect(loader).toBeTruthy();
    expect(loader.getAttribute("role")).toBe("status");
    // The label is rendered twice by design: visible, plus the polite live text.
    expect(loader.textContent).toContain("نجهّز المباراة...");
  });

  it("renders exactly one loader — the wait is never doubled", () => {
    renderHydrating();
    expect(screen.getAllByTestId("akwaan-loader")).toHaveLength(1);
  });

  it("centres the wait in the region the shell leaves, not at the top", () => {
    renderHydrating();
    const region = screen.getByTestId("match-hydrating");
    expect(region.className).toContain("flex-1");
    expect(region.className).toContain("items-center");
    expect(region.className).toContain("justify-center");
  });

  it("gives the Match shell the viewport to compose against", () => {
    renderHydrating();
    const shell = screen.getByTestId("match-shell");
    expect(shell.className).toContain("min-h-[100dvh]");
    expect(shell.className).toContain("flex-col");
  });

  it("keeps the loader inside the shell, under the Match HUD", () => {
    renderHydrating();
    const shell = screen.getByTestId("match-shell");
    expect(shell.contains(screen.getByTestId("akwaan-loader"))).toBe(true);
  });

  it("does not let the site footer share the Match surface", () => {
    // The shell owns the whole screen for a Match, so the website footer is
    // excluded by route — the loader never competes with it.
    expect(isHostMatchPath("/matches/session-1")).toBe(true);
    expect(document.querySelector("footer")).toBeNull();
  });
});
