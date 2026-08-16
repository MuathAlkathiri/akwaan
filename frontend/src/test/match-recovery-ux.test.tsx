import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext, type LiveSessionContextValue } from "@/features/live-game-session/hooks/live-session-context";
import { MatchConnectionBanner } from "@/features/live-game-session/match/components/match-connection-banner";

function renderBanner(overrides: Partial<LiveSessionContextValue> = {}) {
  const resync = vi.fn();
  const value: LiveSessionContextValue = {
    connection: "connected",
    syncState: "idle",
    command: vi.fn(),
    gameplayCommand: vi.fn(),
    resync,
    ...overrides,
  };
  render(
    <LiveSessionContext.Provider value={value}>
      <MatchConnectionBanner />
    </LiveSessionContext.Provider>,
  );
  return { resync };
}

describe("Match recovery UX", () => {
  it.each(["idle", "resynchronizing", "restored"] as const)(
    "keeps a successful %s state silent",
    (syncState) => {
      renderBanner({ syncState });
      expect(screen.queryByTestId("match-connection-banner")).toBeNull();
      expect(
        screen.queryByText("تمت استعادة أحدث حالة للمباراة."),
      ).toBeNull();
    },
  );

  it("leaves a genuine disconnect to the fixed MatchShell connection status", () => {
    renderBanner({ connection: "reconnecting", syncState: "resynchronizing" });
    expect(screen.queryByTestId("match-connection-banner")).toBeNull();
  });

  it("keeps actionable recovery errors visible and retryable", () => {
    const { resync } = renderBanner({
      error: { code: "LOAD_FAILED", message: "Unable to restore snapshot" },
    });
    expect(screen.getByTestId("match-connection-banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "حدِّث الآن" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حدِّث الآن" }));
    expect(resync).toHaveBeenCalledTimes(1);
  });
});
