import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import {
  ParticipantMatchView,
  ControllerMatchView,
} from "@/features/live-game-session/match/views";
import { mobilePhaseOf } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The universal phone shell.
 *
 * A phone is a controller, not a small television — so these assertions are about
 * what the frame carries, what it refuses to carry, and above all that it stays
 * out of the way structurally: the Match router underneath must keep its identity
 * across the whole lifecycle, because a remount would re-run fair-start readiness.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

const snapshotWith = (
  stage: string,
  over: Record<string, unknown> = {},
): LiveSessionSnapshot =>
  ({
    sessionId: "session-1",
    revision: 4,
    serverTimestamp: "2026-01-01T00:00:00.000Z",
    mode: { key: "core-timed-turns", version: 1 },
    status: "active",
    teams: TEAMS,
    participants: [
      {
        id: "p-1",
        displayName: "مُعاذ",
        teamId: "team-alpha",
        ready: true,
        role: "player",
      },
    ],
    availableActions: [],
    match: {
      id: "match-1",
      revision: 12,
      status: "active",
      stage: { key: stage, enteredAt: "2026-01-01T00:00:00.000Z" },
      unified: {
        occurrences: [],
        board: {
          positions: [
            {
              positionKey: "0#slot_1",
              occurrenceIndex: 0,
              worldId: "world-anime",
              worldName: "انمي",
              slotKey: "slot_1",
              challengeTypeId: "type-1",
              challengeKey: "closest",
              challengeName: "الأقرب",
              requiresPhones: true,
              launchability: "launchable",
              status: "available",
            },
          ],
          totalPositionCount: 12,
          completedPositionCount: 0,
        },
        selectingTeamId: "team-alpha",
      },
      scoring: {
        matchTotals: [
          { teamId: "team-alpha", signedTotal: 3, displayTotal: 3 },
          { teamId: "team-beta", signedTotal: 1, displayTotal: 1 },
        ],
        worldSubtotals: [],
      },
      standings: [
        { teamId: "team-alpha", signedTotal: 3, displayTotal: 3, name: TEAMS[0].name },
        { teamId: "team-beta", signedTotal: 1, displayTotal: 1, name: TEAMS[1].name },
      ],
      availableActions: [],
      ...over,
    },
  }) as unknown as LiveSessionSnapshot;

const renderHost = (snapshot: LiveSessionSnapshot) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveSessionContext.Provider
        value={{ snapshot, connection: "connected", resync: vi.fn() } as never}
      >
        <ControllerMatchView />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );

const renderPhone = (snapshot: LiveSessionSnapshot) =>
  render(
    <LiveSessionContext.Provider
      value={{ snapshot, connection: "connected", resync: vi.fn() } as never}
    >
      <ParticipantMatchView participantId="p-1" />
    </LiveSessionContext.Provider>,
  );

describe("the phone shell wraps the Match", () => {
  it("gives a participant the mobile shell", () => {
    renderPhone(snapshotWith("board"));
    expect(screen.getByTestId("mobile-gameplay-shell")).toBeInTheDocument();
  });

  it("never gives the host the mobile shell", () => {
    renderHost(snapshotWith("board"));
    expect(screen.queryByTestId("mobile-gameplay-shell")).toBeNull();
  });

  it("owns the phone viewport with dvh and a flex column, not a pixel height", () => {
    renderPhone(snapshotWith("board"));
    const shell = screen.getByTestId("mobile-gameplay-shell");
    expect(shell.className).toContain("min-h-[100dvh]");
    expect(shell.className).toContain("flex-col");
    // The interaction region can shrink, which is what lets a state centre in it.
    const main = screen.getByTestId("mobile-shell-main");
    expect(main.className).toContain("min-h-0");
    expect(main.className).toContain("flex-1");
  });

  it("applies the safe-area insets on every edge", () => {
    renderPhone(snapshotWith("board"));
    const shell = screen.getByTestId("mobile-gameplay-shell");
    for (const inset of ["top", "bottom", "left", "right"]) {
      expect(shell.className).toContain(`env(safe-area-inset-${inset})`);
    }
  });

  it("names the player's own team, and not by colour alone", () => {
    renderPhone(snapshotWith("board"));
    const team = screen.getByTestId("mobile-shell-team");
    expect(team).toHaveAttribute("data-team-id", "team-alpha");
    expect(team).toHaveTextContent("أسود الشمال");
  });

  it("keeps a stable slot for a future shared timer, and shows no countdown of its own", () => {
    renderPhone(snapshotWith("board"));
    expect(screen.getByTestId("mobile-shell-timer-slot")).toBeInTheDocument();
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
  });
});

describe("the lifecycle word is derived, never invented", () => {
  it.each([
    ["preflight", "ready"],
    ["board", "waiting"],
    ["challenge_result", "complete"],
    ["match_complete", "complete"],
  ])("reads %s as %s", (stage, phase) => {
    expect(mobilePhaseOf(snapshotWith(stage))).toBe(phase);
  });

  it("is ACTION only once the server has sent a runtime", () => {
    expect(mobilePhaseOf(snapshotWith("challenge"))).toBe("waiting");
    const running = snapshotWith("challenge");
    expect(
      mobilePhaseOf({
        ...running,
        gameplay: { runtimeId: "r-1" },
      } as unknown as LiveSessionSnapshot),
    ).toBe("action");
  });

  it("shows READY on the shell during the preflight", () => {
    renderPhone(snapshotWith("preflight"));
    expect(screen.getByTestId("mobile-shell-status")).toHaveAttribute(
      "data-phase",
      "ready",
    );
    expect(screen.getByTestId("mobile-shell-status")).toHaveTextContent("جاهزين");
  });
});

describe("the phone is not a small television", () => {
  it("does not repeat the shared screen's two-team scoreboard", () => {
    renderPhone(
      snapshotWith("challenge", {
        currentChallenge: { occurrenceIndex: 0, slotKey: "slot_1" },
      }),
    );
    const stage = screen.getByTestId("unified-challenge");
    expect(stage).toHaveAttribute("data-challenge-surface", "phone");
    // The opposing team's running total belongs to the screen the room watches.
    expect(stage).not.toHaveTextContent("صقور الرياض");
  });

  it("still gives the host that header, unchanged", () => {
    renderHost(
      snapshotWith("challenge", {
        currentChallenge: { occurrenceIndex: 0, slotKey: "slot_1" },
      }),
    );
    const stage = screen.getByTestId("unified-challenge");
    expect(stage).toHaveAttribute("data-challenge-surface", "screen");
    expect(stage).toHaveTextContent("صقور الرياض");
    expect(stage).toHaveTextContent("أسود الشمال");
  });

  it("does not surface any board position content on the phone", () => {
    // The shell reads the board only to name the running challenge; it must not
    // become a route by which the host's board reaches a player's hand.
    renderPhone(snapshotWith("board"));
    const shell = screen.getByTestId("mobile-gameplay-shell");
    expect(shell.querySelector("[data-testid='unified-board']")).toBeNull();
    expect(shell).not.toHaveTextContent("الأقرب");
  });
});

describe("waiting and completion own the screen", () => {
  it("fills the shell rather than floating in it", () => {
    renderPhone(snapshotWith("board"));
    const waiting = screen.getByTestId("participant-waiting");
    expect(waiting.className).toContain("flex-1");
    expect(waiting.className).toContain("justify-center");
    // The old defect: a fixed-width card pinned near the top.
    expect(waiting.className).not.toContain("max-w-md");
    expect(waiting.className).not.toContain("mt-8");
  });

  it("shows a challenge result from the Match's own award, never a fabricated one", () => {
    renderPhone(
      snapshotWith("challenge_result", {
        challengeResult: {
          winnerTeamId: "team-alpha",
          matchPoints: [{ teamId: "team-alpha", points: 1 }],
        },
      }),
    );
    expect(screen.getByTestId("participant-challenge-winner")).toHaveTextContent(
      "أسود الشمال",
    );
    expect(screen.getByTestId("participant-challenge-points")).toHaveTextContent(
      "+1 نقطة",
    );
    // …and settles into the wait on the same screen.
    expect(screen.getByTestId("participant-waiting")).toHaveTextContent(
      "بانتظار التحدي القادم…",
    );
  });

  it("says nothing about points when the Match awarded none", () => {
    renderPhone(
      snapshotWith("challenge_result", {
        challengeResult: { winnerTeamId: "team-alpha", matchPoints: [] },
      }),
    );
    expect(screen.getByTestId("participant-challenge-winner")).toBeInTheDocument();
    expect(screen.queryByTestId("participant-challenge-points")).toBeNull();
  });

  it("keeps Match complete visually distinct from a challenge result", () => {
    renderPhone(snapshotWith("match_complete"));
    const waiting = screen.getByTestId("participant-waiting");
    expect(waiting).toHaveAttribute("data-match-complete", "true");
    expect(waiting).toHaveTextContent("انتهت المباراة");
    expect(waiting).not.toHaveTextContent("انتهى التحدي");
  });
});

describe("fair-start: the shell must not remount what it wraps", () => {
  it("keeps the Match router's own element across the whole lifecycle", () => {
    const { rerender } = renderPhone(snapshotWith("board"));
    const routerNode = screen
      .getByTestId("mobile-shell-main")
      .querySelector("main");
    expect(routerNode).not.toBeNull();
    expect(routerNode).toHaveAttribute("data-match-stage", "board");

    for (const stage of ["preflight", "challenge", "challenge_result", "match_complete"]) {
      rerender(
        <LiveSessionContext.Provider
          value={
            {
              snapshot: snapshotWith(stage),
              connection: "connected",
              resync: vi.fn(),
            } as never
          }
        >
          <ParticipantMatchView participantId="p-1" />
        </LiveSessionContext.Provider>,
      );
      const now = screen.getByTestId("mobile-shell-main").querySelector("main");
      // The same DOM node throughout: React reused it, so nothing below it
      // unmounted, so no presentation surface re-acknowledged.
      expect(now).toBe(routerNode);
      expect(now).toHaveAttribute("data-match-stage", stage);
    }
  });
});

describe("المرحلة recurring generations on one continuously mounted phone", () => {
  /**
   * The shape a real phone actually receives.
   *
   * While a generation is prepared the server hides the content behind
   * `awaitingPresentation` and projects a surface that says, explicitly, that
   * this actor is NOT one it is waiting on — المرحلة requires only `shared`,
   * which a phone can never satisfy. The phone must therefore send nothing and
   * simply wait for the shared screen to activate.
   */
  const preparing = (generation: number) =>
    ({
      ...snapshotWith("challenge", {
        currentChallenge: { occurrenceIndex: 0, slotKey: "slot_1" },
      }),
      gameplay: {
        runtimeId: "runtime-1",
        revision: 20 + generation,
        mode: { key: "marhala", version: 1 },
        status: "active",
        modeState: { awaitingPresentation: true },
        presentationSurface: {
          running: true,
          generation,
          required: false,
        },
        transitions: [],
        availableActions: [],
      },
    }) as unknown as LiveSessionSnapshot;

  const activated = (generation: number) =>
    ({
      ...snapshotWith("challenge", {
        currentChallenge: { occurrenceIndex: 0, slotKey: "slot_1" },
      }),
      gameplay: {
        runtimeId: "runtime-1",
        revision: 30 + generation,
        mode: { key: "marhala", version: 1 },
        status: "active",
        modeState: {
          phase: "question",
          activeTeamId: "team-alpha",
          teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
          positionsJson: JSON.stringify({ "team-alpha": 5, "team-beta": 1 }),
          turnNumber: generation,
          availableDifficultiesJson: JSON.stringify(["easy", "medium", "hard"]),
          movementRangesJson: JSON.stringify({
            easy: { min: 1, max: 2 },
            medium: { min: 2, max: 4 },
            hard: { min: 4, max: 6 },
          }),
          selectedDifficulty: "medium",
          questionPrompt: JSON.stringify({ ar: `سؤال رقم ${generation}` }),
          actorTeamId: "team-alpha",
          isActiveTeam: true,
        },
        transitions: [],
        availableActions: ["mode:submit-marhala-answer"],
      },
    }) as unknown as LiveSessionSnapshot;

  const tree = (snapshot: LiveSessionSnapshot, ack: ReturnType<typeof vi.fn>) => (
    <LiveSessionContext.Provider
      value={
        {
          snapshot,
          connection: "connected",
          connectionEpoch: 1,
          resync: vi.fn(),
          presentationReady: ack,
          presentationReadySocket: ack,
        } as never
      }
    >
      <ParticipantMatchView participantId="p-1" />
    </LiveSessionContext.Provider>
  );

  it("reaches Q3 without a refresh, and never acknowledges a surface it cannot satisfy", async () => {
    // This is the sequence a human ran on a real phone: it stuck on
    // "نجهّز التحدي…" at Q2 with the recovery banner, because every one of the
    // phone's acknowledgements was refused PRESENTATION_SURFACE_INVALID.
    const ack = vi.fn().mockRejectedValue(new Error("PRESENTATION_SURFACE_INVALID"));
    const { rerender } = render(tree(preparing(1), ack));
    const routerNode = screen
      .getByTestId("mobile-shell-main")
      .querySelector("main");

    for (const generation of [1, 2, 3]) {
      rerender(tree(preparing(generation), ack));
      // Prepared: the loader is shown, the question is hidden, and no clock.
      expect(screen.getByTestId("challenge-preparing")).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(`سؤال رقم ${generation}`);
      expect(screen.queryByTestId("challenge-countdown")).toBeNull();

      rerender(tree(activated(generation), ack));
      // The shared screen activated it; this phone simply receives the question.
      expect(screen.queryByTestId("challenge-preparing")).toBeNull();
      expect(screen.getByTestId("marhala-phone")).toHaveTextContent(
        `سؤال رقم ${generation}`,
      );
      // Same router element throughout: nothing remounted, nothing refreshed.
      expect(
        screen.getByTestId("mobile-shell-main").querySelector("main"),
      ).toBe(routerNode);
    }

    await Promise.resolve();
    // The whole defect in one assertion: not a single acknowledgement was sent,
    // so the server never refused one and the banner never appeared.
    expect(ack).not.toHaveBeenCalled();
  });
});

