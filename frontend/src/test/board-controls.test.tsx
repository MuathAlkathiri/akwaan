import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchShell } from "@/features/live-game-session/match/components/match-shell";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The idle-board recovery controls, held to their contract.
 *
 * Three authoritative controls live in the Match shell — a once-per-team Double,
 * a signed ±1 score correction, and a turn switch. Each is a server command, so
 * these tests prove three things the UI must never get wrong: that only the
 * controller sees them, that they appear only while the server says the board is
 * idle (`availableActions`), and that the Double belongs to the *current* team
 * alone. A control that leaks to a player, survives an active challenge, or offers
 * the other team's Double fails here.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/matches/session-1",
  useParams: () => ({ sessionId: "session-1" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/features/match-setup", () => ({
  adjustUnifiedMatchScore: vi.fn(() => Promise.resolve()),
  armUnifiedMatchDouble: vi.fn(() => Promise.resolve()),
  switchUnifiedMatchTurn: vi.fn(() => Promise.resolve()),
}));

import {
  adjustUnifiedMatchScore,
  armUnifiedMatchDouble,
  switchUnifiedMatchTurn,
} from "@/features/match-setup";
import { toast } from "sonner";

/** The full idle-board action set the server reports when nothing is running. */
const IDLE_ACTIONS = [
  "match:launch-challenge",
  "match:arm-double",
  "match:adjust-score",
  "match:switch-turn",
  "match:cancel",
];

type SnapshotOptions = {
  availableActions?: string[];
  alphaDoubleStatus?: "available" | "armed" | "consumed";
  betaDoubleStatus?: "available" | "armed" | "consumed";
  selectingTeamId?: string;
};

/** A board snapshot with ألفا selecting, a real 2–1 score, and Double tokens. */
const snapshot = (options: SnapshotOptions = {}): LiveSessionSnapshot =>
  ({
    sessionId: "session-1",
    serverTimestamp: new Date().toISOString(),
    teams: [
      { id: "team-alpha", name: "ألفا" },
      { id: "team-beta", name: "بيتا" },
    ],
    participants: [],
    match: {
      revision: 7,
      stage: { key: "board" },
      availableActions: options.availableActions ?? IDLE_ACTIONS,
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
      doubles: [
        { teamId: "team-alpha", status: options.alphaDoubleStatus ?? "available" },
        { teamId: "team-beta", status: options.betaDoubleStatus ?? "available" },
      ],
      unified: {
        board: { completedPositionCount: 1, totalPositionCount: 12 },
        selectingTeamId: options.selectingTeamId ?? "team-alpha",
      },
    },
  }) as unknown as LiveSessionSnapshot;

const resync = vi.fn();

function renderShell(
  actor: "controller" | "shared-screen" | "participant",
  options: SnapshotOptions = {},
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot: snapshot(options),
            connection: "connected",
            command: vi.fn(),
            gameplayCommand: vi.fn(),
            resync,
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

afterEach(() => {
  vi.mocked(adjustUnifiedMatchScore).mockClear();
  vi.mocked(armUnifiedMatchDouble).mockClear();
  vi.mocked(switchUnifiedMatchTurn).mockClear();
  vi.mocked(adjustUnifiedMatchScore).mockResolvedValue(undefined as never);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  resync.mockClear();
});

describe("the controller's idle-board controls", () => {
  it("arms the Double for the current team, at the current revision", async () => {
    renderShell("controller");
    const double = screen.getByRole("button", { name: /استخدام الدبل/ });
    fireEvent.click(double);
    await waitFor(() =>
      expect(armUnifiedMatchDouble).toHaveBeenCalledTimes(1),
    );
    expect(armUnifiedMatchDouble).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedMatchRevision: 7,
      teamId: "team-alpha",
    });
  });

  it("offers the Double to the selecting team only — never the other team", () => {
    renderShell("controller");
    // Exactly one arm button exists, and it belongs to ألفا (the selecting team).
    // بيتا, though it also has a token available, is never offered one here.
    expect(screen.getAllByRole("button", { name: /استخدام الدبل/ })).toHaveLength(
      1,
    );
  });

  it("corrects a team's score by a signed ±1 through the ledger", async () => {
    renderShell("controller");
    fireEvent.click(screen.getByRole("button", { name: "إضافة نقطة إلى ألفا" }));
    await waitFor(() =>
      expect(adjustUnifiedMatchScore).toHaveBeenCalledTimes(1),
    );
    expect(adjustUnifiedMatchScore).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedMatchRevision: 7,
      teamId: "team-alpha",
      delta: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "إنقاص نقطة من بيتا" }));
    await waitFor(() =>
      expect(adjustUnifiedMatchScore).toHaveBeenCalledTimes(2),
    );
    expect(adjustUnifiedMatchScore).toHaveBeenLastCalledWith({
      sessionId: "session-1",
      expectedMatchRevision: 7,
      teamId: "team-beta",
      delta: -1,
    });
  });

  it("switches the selecting turn through the authoritative command", async () => {
    renderShell("controller");
    fireEvent.click(
      screen.getByRole("button", { name: "تبديل دور اختيار التحدي" }),
    );
    await waitFor(() =>
      expect(switchUnifiedMatchTurn).toHaveBeenCalledTimes(1),
    );
    expect(switchUnifiedMatchTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedMatchRevision: 7,
    });
  });

  it("shows the Double as armed, with no second arming, once it is set", () => {
    renderShell("controller", { alphaDoubleStatus: "armed" });
    // Armed is a restrained, non-actionable 2× marker on the team's block — no
    // second arm button is offered.
    expect(screen.getByTestId("hud-double-armed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /استخدام الدبل/ })).toBeNull();
  });

  it("folds the Double into the current team's header block, not a detached button", () => {
    renderShell("controller");
    const hud = screen.getByTestId("match-score-hud");
    expect(screen.getByTestId("match-hud-safe-area")).toContainElement(hud);
    const teamOne = screen.getByTestId("hud-team-1");
    const teamTwo = screen.getByTestId("hud-team-2");
    const double = screen.getByRole("button", { name: /استخدام الدبل/ });
    // The 2× lives inside the HUD (the header scoreboard), carrying the plain 2×.
    expect(hud.contains(double)).toBe(true);
    expect(teamOne.contains(double)).toBe(true);
    expect(teamTwo.contains(double)).toBe(false);
    expect(double.textContent).toContain("2×");
  });
});

describe("the controls answer only to the server's idle signal", () => {
  it("hides every control when the board reports no idle actions", () => {
    // An active challenge, a pending launch, or convergence: the server drops the
    // idle actions and the shell must offer none of the three controls, even to a
    // controller sitting on the board stage.
    renderShell("controller", { availableActions: [] });
    expect(screen.queryByRole("button", { name: /استخدام الدبل/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /إضافة نقطة/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "تبديل دور اختيار التحدي" }),
    ).toBeNull();
  });

  it("offers each control independently of the others", () => {
    // Only score correction is live: the Double and turn switch stay hidden while
    // the score buttons show. The controls are not an all-or-nothing block.
    renderShell("controller", { availableActions: ["match:adjust-score"] });
    expect(screen.getAllByRole("button", { name: /نقطة/ }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("button", { name: /استخدام الدبل/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "تبديل دور اختيار التحدي" }),
    ).toBeNull();
  });
});

describe("the controls belong to the controller alone", () => {
  it.each(["shared-screen", "participant"] as const)(
    "shows no board control to the %s",
    (actor) => {
      renderShell(actor);
      expect(screen.queryByRole("button", { name: /استخدام الدبل/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /نقطة/ })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "تبديل دور اختيار التحدي" }),
      ).toBeNull();
    },
  );
});

describe("score-change feedback", () => {
  it("shows NO success toast on a successful correction — the score is its own feedback", async () => {
    renderShell("controller");
    fireEvent.click(screen.getByRole("button", { name: "إضافة نقطة إلى ألفا" }));
    await waitFor(() =>
      expect(adjustUnifiedMatchScore).toHaveBeenCalledTimes(1),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("still surfaces an error toast when the correction fails", async () => {
    vi.mocked(adjustUnifiedMatchScore).mockRejectedValueOnce(new Error("nope"));
    renderShell("controller");
    fireEvent.click(screen.getByRole("button", { name: "إضافة نقطة إلى ألفا" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("the compact header HUD", () => {
  it("carries both team scores and a VS in the header scoreboard", () => {
    renderShell("controller");
    const hud = screen.getByTestId("match-score-hud");
    // Scores come straight from the authoritative snapshot standings (2 and 1).
    const numerals = [...hud.querySelectorAll(".akwaan-numeral")].map(
      (n) => n.textContent,
    );
    expect(numerals).toEqual(["2", "1"]);
    expect(screen.getByTestId("hud-vs").textContent).toBe("VS");
    expect(screen.getByTestId("hud-team-1")).toBeTruthy();
    expect(screen.getByTestId("hud-team-2")).toBeTruthy();
    expect(screen.getByTestId("hud-team-slot-right")).toContainElement(
      screen.getByTestId("hud-team-1"),
    );
    expect(screen.getByTestId("hud-team-slot-left")).toContainElement(
      screen.getByTestId("hud-team-2"),
    );
  });
});
