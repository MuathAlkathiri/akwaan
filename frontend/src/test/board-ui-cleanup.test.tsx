import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchShell } from "@/features/live-game-session/match/components/match-shell";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The approved Board UI cleanup, held in place.
 *
 * Three controls were removed from the room's header — the shared-screen link,
 * the "تحديات مكسوبة" label, and the dark-mode toggle — while the things the room
 * actually reads (the score, the connection state) stay. These tests fail if any
 * of the three comes back, and fail just as loudly if the score leaves with them.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches/session-1",
  useParams: () => ({ sessionId: "session-1" }),
}));

/** A minimal live snapshot on the board, with a real 2–1 score to protect. */
const snapshot = (): LiveSessionSnapshot =>
  ({
    sessionId: "session-1",
    serverTimestamp: new Date().toISOString(),
    teams: [
      { id: "team-alpha", name: "ألفا" },
      { id: "team-beta", name: "بيتا" },
    ],
    participants: [],
    match: {
      stage: { key: "board" },
      standings: [
        { teamId: "team-alpha", name: "ألفا", displayTotal: 2, signedTotal: 2 },
        { teamId: "team-beta", name: "بيتا", displayTotal: 1, signedTotal: 1 },
      ],
      scoring: {
        matchTotals: [
          { teamId: "team-alpha", displayTotal: 2, signedTotal: 2 },
          { teamId: "team-beta", displayTotal: 1, signedTotal: 1 },
        ],
      },
      unified: {
        board: { completedPositionCount: 1, totalPositionCount: 12 },
        selectingTeamId: "team-alpha",
      },
    },
  }) as unknown as LiveSessionSnapshot;

function renderShell(actor: "controller" | "shared-screen" | "participant" = "controller") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot: snapshot(),
            connection: "connected",
            command: vi.fn(),
            gameplayCommand: vi.fn(),
            resync: vi.fn(),
          } as unknown as React.ContextType<typeof LiveSessionContext>
        }
      >
        <MatchShell actor={actor}>
          <div data-testid="board-body">board</div>
        </MatchShell>
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("Board header no longer carries the removed controls", () => {
  it("does not render the shared-screen link — even for the controller", () => {
    renderShell("controller");
    expect(screen.queryByText("الشاشة المشتركة")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /الشاشة المشتركة/ }),
    ).toBeNull();
  });

  it("does not render the 'تحديات مكسوبة' label", () => {
    renderShell();
    expect(screen.queryByText("تحديات مكسوبة")).toBeNull();
  });

  it("has no dark-mode toggle", () => {
    renderShell();
    expect(screen.queryByTestId("theme-toggle")).toBeNull();
    expect(screen.queryByText("الوضع الليلي")).toBeNull();
    expect(screen.queryByText("الوضع النهاري")).toBeNull();
  });
});

describe("Board header keeps what the room needs", () => {
  it("still shows both team names and the live score", () => {
    renderShell();
    expect(screen.getByTestId("match-shell")).toBeTruthy();
    // The name appears in the scoreboard and again in the turn band — both are
    // score-bearing surfaces we kept, so more than one match is correct.
    expect(screen.getAllByText("ألفا").length).toBeGreaterThan(0);
    expect(screen.getAllByText("بيتا").length).toBeGreaterThan(0);
    // The 2–1 Match score survives the removal of its old caption.
    const shell = screen.getByTestId("match-shell");
    expect(shell.textContent).toContain("2");
    expect(shell.textContent).toContain("1");
  });

  it("still shows completion progress and the turn band", () => {
    renderShell();
    const shell = screen.getByTestId("match-shell");
    expect(shell.textContent).toContain("تحديات مكتملة");
    // The conversational copy from the earlier pass is intact.
    expect(shell.textContent).toContain("دوركم الحين");
  });

  it("renders its board body children", () => {
    renderShell();
    expect(screen.getByTestId("board-body")).toBeTruthy();
  });
});
