import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchShell } from "@/features/live-game-session/match/components/match-shell";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The Match-wide active-team band is suppressed during the preflight — the
 * preflight card carries its own compact "{team} يبدأ" chip, so the large band
 * would only repeat it. It must still render for every other stage, and the
 * underlying selecting-team state is unchanged either way.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches/session-1",
  useParams: () => ({ sessionId: "session-1" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/match-setup", () => ({
  adjustUnifiedMatchScore: vi.fn(() => Promise.resolve()),
  armUnifiedMatchDouble: vi.fn(() => Promise.resolve()),
  switchUnifiedMatchTurn: vi.fn(() => Promise.resolve()),
}));

const snapshot = (stageKey: string): LiveSessionSnapshot =>
  ({
    sessionId: "session-1",
    serverTimestamp: new Date().toISOString(),
    teams: [
      { id: "team-alpha", name: "ألفا" },
      { id: "team-beta", name: "بيتا" },
    ],
    participants: [],
    match: {
      revision: 3,
      stage: { key: stageKey },
      availableActions: [],
      standings: [
        { teamId: "team-alpha", name: "ألفا", displayTotal: 0, signedTotal: 0 },
        { teamId: "team-beta", name: "بيتا", displayTotal: 0, signedTotal: 0 },
      ],
      scoring: {
        matchTotals: [
          { teamId: "team-alpha", displayTotal: 0, signedTotal: 0 },
          { teamId: "team-beta", displayTotal: 0, signedTotal: 0 },
        ],
      },
      doubles: [
        { teamId: "team-alpha", status: "available" },
        { teamId: "team-beta", status: "available" },
      ],
      unified: {
        board: { completedPositionCount: 0, totalPositionCount: 12 },
        selectingTeamId: "team-alpha",
        preflight: { selectingTeamId: "team-alpha" },
      },
    },
  }) as unknown as LiveSessionSnapshot;

function renderShell(stageKey: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot: snapshot(stageKey),
            connection: "connected",
            command: vi.fn(),
            gameplayCommand: vi.fn(),
            resync: vi.fn(),
          } as unknown as React.ContextType<typeof LiveSessionContext>
        }
      >
        <MatchShell actor="controller">
          <div data-testid="stage-body">stage</div>
        </MatchShell>
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("preflight suppresses the Match-wide active-team band", () => {
  it("does not render the large active-team band on the preflight stage", () => {
    renderShell("preflight");
    expect(screen.queryByTestId("active-team-band")).toBeNull();
    // The HUD (and therefore the selecting-team state) is still there.
    expect(screen.getByTestId("match-score-hud")).toBeTruthy();
  });

  it("still renders the active-team band on the board stage", () => {
    renderShell("board");
    expect(screen.getByTestId("active-team-band")).toHaveAttribute(
      "data-team-id",
      "team-alpha",
    );
  });

  it("still renders the active-team band during a challenge", () => {
    renderShell("challenge");
    expect(screen.getByTestId("active-team-band")).toBeTruthy();
  });
});
