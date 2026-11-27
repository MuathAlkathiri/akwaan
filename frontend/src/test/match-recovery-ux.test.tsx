import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LiveSessionContext,
  type LiveSessionContextValue,
} from "@/features/live-game-session/hooks/live-session-context";
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
      expect(screen.queryByText("تمت استعادة أحدث حالة للمباراة.")).toBeNull();
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
    expect(screen.getByRole("button", { name: "حدّث الحين" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حدّث الحين" }));
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("says a live connection was lost only after it stays down, and clears on return", () => {
    vi.useFakeTimers();
    try {
      const base: LiveSessionContextValue = {
        connection: "connected",
        syncState: "idle",
        command: vi.fn(),
        gameplayCommand: vi.fn(),
        resync: vi.fn(),
      };
      const tree = (
        connection: LiveSessionContextValue["connection"],
        phone = false,
      ) => (
        <LiveSessionContext.Provider value={{ ...base, connection }}>
          <MatchConnectionBanner phone={phone} />
        </LiveSessionContext.Provider>
      );
      const { rerender } = render(tree("connected"));
      rerender(tree("reconnecting"));
      // A blip the socket recovers from says nothing.
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByTestId("match-disconnect-strip")).toBeNull();
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByTestId("match-disconnect-strip")).toHaveTextContent(
        "المباراة محفوظة",
      );
      rerender(tree("reconnecting", true));
      expect(screen.getByTestId("match-disconnect-strip")).toHaveTextContent(
        "مكانك في الفريق محفوظ",
      );
      rerender(tree("connected", true));
      expect(screen.queryByTestId("match-disconnect-strip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call the first connect a drop", () => {
    vi.useFakeTimers();
    try {
      renderBanner({ connection: "connecting" });
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByTestId("match-disconnect-strip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
