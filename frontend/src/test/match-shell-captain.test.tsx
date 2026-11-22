import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchShell } from "@/features/live-game-session/match/components/match-shell";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches/session-1",
  useParams: () => ({ sessionId: "session-1" }),
}));
vi.mock("@/features/live-game-session/api/live-session-api", () => ({
  setTeamCaptain: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/match-setup", () => ({
  adjustUnifiedMatchScore: vi.fn(),
  armUnifiedMatchDouble: vi.fn(),
  switchUnifiedMatchTurn: vi.fn(),
}));
import { setTeamCaptain } from "@/features/live-game-session/api/live-session-api";

const snapshot = (stage: string = "board") =>
  ({
    sessionId: "session-1",
    status: "active",
    revision: 11,
    teams: [
      { id: "team-1", name: "فريق 1", captainParticipantId: "p1" },
      { id: "team-2", name: "فريق 2" },
    ],
    participants: [
      {
        id: "p1",
        teamId: "team-1",
        role: "team-player",
        presence: "connected",
        displayName: "سارة",
      },
      {
        id: "p2",
        teamId: "team-1",
        role: "team-player",
        presence: "connected",
        displayName: "نورة",
      },
      {
        id: "p3",
        teamId: "team-1",
        role: "team-player",
        presence: "stale",
        displayName: "حنين",
      },
    ],
    match: {
      revision: 7,
      stage: { key: stage },
      availableActions: [],
      standings: [],
      scoring: { matchTotals: [] },
      unified: {},
    },
  }) as unknown as LiveSessionSnapshot;

function show(
  actor: "controller" | "participant" | "shared-screen",
  stage?: string,
) {
  render(
    <LiveSessionContext.Provider
      value={
        {
          snapshot: snapshot(stage),
          resync: vi.fn(),
        } as unknown as React.ContextType<typeof LiveSessionContext>
      }
    >
      <MatchShell actor={actor}>
        <div>challenge</div>
      </MatchShell>
    </LiveSessionContext.Provider>,
  );
}

describe("Match shell captain control", () => {
  it.each(["participant", "shared-screen"] as const)(
    "hides the control from %s",
    (actor) => {
      show(actor);
      expect(
        screen.queryByRole("button", { name: "تغيير قائد الفريق" }),
      ).toBeNull();
    },
  );
  it("shows the control to the controller on the board", () => {
    show("controller");
    expect(
      screen.getByRole("button", { name: "تغيير قائد الفريق" }),
    ).toBeTruthy();
  });
  it("marks who is away, because that is why the host opened this", () => {
    // The host reaches for this control when a captain has vanished. A list
    // that does not say who is actually here lets him pick a second absent
    // player and change nothing.
    show("controller", "challenge");
    fireEvent.click(screen.getByRole("button", { name: "تغيير قائد الفريق" }));
    expect(
      screen.getByRole("option", { name: /حنين — غير متصل/ }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: /^نورة$/ })).toBeTruthy();
  });

  it("changes a captain while a challenge is on screen", async () => {
    show("controller", "challenge");
    fireEvent.click(screen.getByRole("button", { name: "تغيير قائد الفريق" }));
    expect(screen.getByText("challenge")).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /سارة — القائد الحالي/ }),
    ).toBeTruthy();
    fireEvent.change(screen.getByTestId("match-captain-team-1"), {
      target: { value: "p2" },
    });
    await waitFor(() =>
      expect(setTeamCaptain).toHaveBeenCalledWith(
        "session-1",
        "team-1",
        "p2",
        11,
      ),
    );
  });
});
