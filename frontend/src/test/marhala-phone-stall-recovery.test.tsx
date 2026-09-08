import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchGameplayRenderer } from "@/features/live-game-session/match/match-stage-router";
import { MARHALA_MODE_KEY } from "@/features/live-game-session/match/marhala.presentation";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The stall a real iPhone showed, and the recovery that ends it.
 *
 * The shared screen advanced to the next المرحلة question and the phone did
 * not: it sat on the preparing state until the player reloaded Safari, after
 * which it adopted the correct state immediately. So the authoritative state
 * existed and the phone was simply stale — the update never landed.
 *
 * The phone cannot fix that by acknowledging: المرحلة requires a `shared`
 * surface, which a phone can never satisfy, so it deliberately stays silent and
 * has nothing to retry. The only thing that ends the wait is the update — and
 * when the update is lost, something has to ask for it. That is what these
 * tests pin: a bounded, silent request through the canonical snapshot path,
 * once per transition, with no reload and no polling.
 */

const routerSpy = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerSpy,
  usePathname: () => "/join/live-session/ABC123",
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10.000Z"),
  }),
);

const PROMPT = "ما اسم بطل لعبة GTA San Andreas؟";
const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];
const PARTICIPANTS = [
  { id: "p-1", displayName: "مُعاذ", teamId: "team-alpha", role: "player" },
];

const playing = (turn: number) => ({
  phase: "question",
  activeTeamId: "team-alpha",
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  positionsJson: JSON.stringify({ "team-alpha": 5, "team-beta": 1 }),
  turnNumber: turn,
  availableDifficultiesJson: JSON.stringify(["easy", "medium", "hard"]),
  movementRangesJson: JSON.stringify({
    easy: { min: 1, max: 2 },
    medium: { min: 2, max: 4 },
    hard: { min: 4, max: 6 },
  }),
  actorTeamId: "team-alpha",
  isActiveTeam: true,
  selectedDifficulty: "medium",
  deadlineAt: "2026-01-01T00:00:27.000Z",
  questionPrompt: JSON.stringify({ ar: `${PROMPT} (${turn})` }),
});

/** What the phone holds while a question is live. */
const active = (runtimeRevision: number, turn: number) =>
  ({
    sessionId: "session-1",
    revision: 10 + runtimeRevision,
    serverTimestamp: "2026-01-01T00:00:10.000Z",
    teams: TEAMS,
    participants: PARTICIPANTS,
    availableActions: [],
    gameplay: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      revision: runtimeRevision,
      mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
      status: "round-active",
      availableActions: ["mode:submit-marhala-answer"],
      activeRound: {
        id: `round-${turn}`,
        sequence: turn,
        status: "active",
        modeState: playing(turn),
      },
      modeState: playing(turn),
      transitions: [],
    },
  }) as unknown as LiveSessionSnapshot;

/**
 * What the phone holds once the next question is prepared, before activation.
 *
 * `required: false` is the server telling this actor it is not one of the
 * surfaces being waited on — the fix that stopped the phone acknowledging a
 * `shared`-only generation and being refused every time.
 */
const preparing = (runtimeRevision: number, generation: number) =>
  ({
    sessionId: "session-1",
    revision: 10 + runtimeRevision,
    serverTimestamp: "2026-01-01T00:00:10.000Z",
    teams: TEAMS,
    participants: PARTICIPANTS,
    availableActions: [],
    gameplay: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      revision: runtimeRevision,
      mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
      status: "round-active",
      availableActions: [],
      modeState: { awaitingPresentation: true },
      presentationSurface: {
        running: true,
        required: false,
        generation,
      },
      transitions: [],
    },
  }) as unknown as LiveSessionSnapshot;

describe("the phone recovers from a lost المرحلة transition", () => {
  const presentationReady = vi.fn();
  const presentationReadySocket = vi.fn();
  const gameplayCommand = vi.fn();
  const resync = vi.fn();

  const tree = (snapshot: LiveSessionSnapshot) => (
    <LiveSessionContext.Provider
      value={
        {
          snapshot,
          connection: "connected",
          connectionEpoch: 1,
          presentationReady,
          presentationReadySocket,
          gameplayCommand,
          resync,
          sessionId: "session-1",
        } as never
      }
    >
      <MatchGameplayRenderer actor="participant" />
    </LiveSessionContext.Provider>
  );

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // `restoreMocks` wipes implementations between tests, so they are set here.
    presentationReady.mockReset().mockResolvedValue(undefined);
    presentationReadySocket.mockReset().mockResolvedValue(undefined);
    gameplayCommand.mockReset().mockResolvedValue(undefined);
    resync.mockReset();
    routerSpy.replace.mockClear();
    routerSpy.push.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks once for the snapshot it never received, and plays on into Q3", async () => {
    // The forbidden escape hatch, watched for real: recovery must never be a
    // page reload.
    const reload = vi.fn();
    const location = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...location, reload, assign: vi.fn(), replace: vi.fn() },
    });
    try {
      // Q1 is live and the phone is playing it.
      const view = render(tree(active(7, 1)));
      expect(screen.getByTestId("marhala-phone")).toHaveTextContent(
        `${PROMPT} (1)`,
      );
      expect(screen.queryByTestId("challenge-preparing")).toBeNull();

      // Q1 resolves and the server prepares Q2. This snapshot the phone did get.
      view.rerender(tree(preparing(8, 2)));
      expect(screen.getByTestId("challenge-preparing")).toBeInTheDocument();
      // The phone is a spectator of this readiness and must stay silent.
      expect(presentationReady).not.toHaveBeenCalled();
      expect(presentationReadySocket).not.toHaveBeenCalled();
      // Nothing is owed yet: the normal update still has its chance.
      expect(resync).not.toHaveBeenCalled();

      // The activation update is lost — the exact real-device failure — so the
      // phone is stale with nothing left to wake it. A recovery request is the
      // only thing that can end this wait, and asking delivers the snapshot
      // through the ordinary adoption path, exactly as a real reply would.
      resync.mockImplementation(() => view.rerender(tree(active(9, 2))));
      await vi.advanceTimersByTimeAsync(3_000);

      // Q2 is simply on screen. Nothing reloaded and nothing navigated.
      expect(screen.getByTestId("marhala-phone")).toHaveTextContent(
        `${PROMPT} (2)`,
      );
      expect(screen.queryByTestId("challenge-preparing")).toBeNull();
      expect(resync).toHaveBeenCalledTimes(1);

      // Waiting on does not turn one recovery into a poll.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(resync).toHaveBeenCalledTimes(1);

      // Q2 → Q3: the next transition gets its own single attempt.
      view.rerender(tree(preparing(10, 3)));
      expect(screen.getByTestId("challenge-preparing")).toBeInTheDocument();
      resync.mockImplementation(() => view.rerender(tree(active(11, 3))));
      await vi.advanceTimersByTimeAsync(3_000);
      expect(screen.getByTestId("marhala-phone")).toHaveTextContent(
        `${PROMPT} (3)`,
      );
      expect(resync).toHaveBeenCalledTimes(2);

      // Never acknowledged, never submitted anything, never navigated, never
      // reloaded: the recovery is a snapshot request and nothing else.
      expect(presentationReady).not.toHaveBeenCalled();
      expect(presentationReadySocket).not.toHaveBeenCalled();
      expect(gameplayCommand).not.toHaveBeenCalled();
      expect(routerSpy.replace).not.toHaveBeenCalled();
      expect(routerSpy.push).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(window.location.assign).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: location,
      });
    }
  });

  it("stays quiet when the transition lands on its own", async () => {
    // The normal path must remain the one that wins: an update that arrives
    // inside the grace window cancels the pending request entirely.
    const view = render(tree(active(7, 1)));
    view.rerender(tree(preparing(8, 2)));
    await vi.advanceTimersByTimeAsync(1_000);
    view.rerender(tree(active(9, 2)));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(resync).not.toHaveBeenCalled();
    expect(screen.getByTestId("marhala-phone")).toHaveTextContent(
      `${PROMPT} (2)`,
    );
  });

  it("does not ask on behalf of a surface the server is waiting on", async () => {
    // A shared screen owes an acknowledgement, so its wait is its own to end.
    // Asking for a snapshot there would race the ack it has not sent yet.
    const owed = preparing(8, 2) as unknown as {
      gameplay: { presentationSurface: { required: boolean } };
    };
    owed.gameplay.presentationSurface.required = true;
    render(tree(owed as unknown as LiveSessionSnapshot));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resync).not.toHaveBeenCalled();
  });

  it("keeps the preparing state light between questions", () => {
    // A cold open is a page opening and gets the full loader; the gap between
    // two questions is not, and filling the phone with a loading screen every
    // time reads as the app restarting.
    const view = render(tree(preparing(8, 2)));
    expect(screen.getByTestId("challenge-preparing")).toHaveAttribute(
      "data-preparing",
      "recurring",
    );
    expect(screen.queryByTestId("akwaan-loader")).toBeNull();
    // And it still refuses to show the prepared question.
    expect(document.body.textContent).not.toContain(PROMPT);

    // Initial fair-start has no generation, and keeps the branded loader.
    const cold = preparing(8, 2) as unknown as {
      gameplay: { presentationSurface: { generation?: number } };
    };
    delete cold.gameplay.presentationSurface.generation;
    view.rerender(tree(cold as unknown as LiveSessionSnapshot));
    expect(screen.getByTestId("challenge-preparing")).toHaveAttribute(
      "data-preparing",
      "initial",
    );
    expect(screen.getByTestId("akwaan-loader")).toBeInTheDocument();
  });
});
