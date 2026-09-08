import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchGameplayRenderer } from "@/features/live-game-session/match/match-stage-router";
import { MARHALA_MODE_KEY } from "@/features/live-game-session/match/marhala.presentation";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The first challenge start, which recurring questions did not fix.
 *
 * Q1 → Q2 → Q3 works because the server marks a recurring presentation with a
 * `generation` and, for a phone, `required: false` — and the bounded recovery
 * was armed on exactly that pair. The window before the first question looks
 * different: المرحلة only declares a required `shared` surface once its phase is
 * `question`, so while the board is still on `difficulty-choice` the snapshot
 * carries `presentationSurface: { running: true }` with no `required` and no
 * `generation` at all.
 *
 * A surface waiting in that window had no net. When the activation update was
 * lost there, the phone sat on the branded loader for the rest of the match and
 * only a manual browser refresh recovered it — which is precisely what the
 * production device reported.
 *
 * The precondition that matters is "this surface is waiting", not "the server
 * called it a spectator". A snapshot request is a read: it cannot double
 * acknowledge, and the acknowledgement path keeps its own guards.
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

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];
const PARTICIPANTS = [
  { id: "p-1", displayName: "مُعاذ", teamId: "team-alpha", role: "player" },
];

const base = (rev: number) => ({
  sessionId: "session-1",
  revision: 10 + rev,
  serverTimestamp: "2026-01-01T00:00:10.000Z",
  teams: TEAMS,
  participants: PARTICIPANTS,
  availableActions: [],
});

/** المرحلة on `difficulty-choice`: the phone's team picks a band. */
const choosing = () => ({
  phase: "difficulty-choice",
  activeTeamId: "team-alpha",
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  positionsJson: JSON.stringify({ "team-alpha": 1, "team-beta": 1 }),
  turnNumber: 1,
  availableDifficultiesJson: JSON.stringify(["easy", "medium", "hard"]),
  movementRangesJson: JSON.stringify({
    easy: { min: 1, max: 2 },
    medium: { min: 2, max: 4 },
    hard: { min: 4, max: 6 },
  }),
  actorTeamId: "team-alpha",
  isActiveTeam: true,
});

/**
 * The launch window: awaiting, but with neither `required` nor `generation`,
 * because المرحلة declares no required surface until its phase is `question`.
 */
const coldPreparing = (rev: number) =>
  ({
    ...base(rev),
    gameplay: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      revision: rev,
      mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
      status: "round-active",
      availableActions: [],
      modeState: { awaitingPresentation: true },
      presentationSurface: { running: true },
      transitions: [],
    },
  }) as unknown as LiveSessionSnapshot;

/** Activated: the first المرحلة screen the phone should land on. */
const activated = (rev: number) =>
  ({
    ...base(rev),
    gameplay: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      revision: rev,
      mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
      status: "round-active",
      availableActions: ["mode:choose-marhala-difficulty"],
      activeRound: {
        id: "round-1",
        sequence: 1,
        status: "active",
        modeState: choosing(),
      },
      modeState: choosing(),
      transitions: [],
    },
  }) as unknown as LiveSessionSnapshot;

describe("the first المرحلة challenge start reaches the phone", () => {
  const presentationReady = vi.fn();
  const presentationReadySocket = vi.fn();
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
          gameplayCommand: vi.fn(),
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
    presentationReady.mockReset().mockResolvedValue(undefined);
    presentationReadySocket.mockReset().mockResolvedValue(undefined);
    resync.mockReset();
    routerSpy.replace.mockClear();
    routerSpy.push.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers the first activation when its update is lost", async () => {
    // The phone is mounted and connected before the challenge starts, and the
    // launch reaches it: awaiting, loader up. That much already worked.
    const view = render(tree(coldPreparing(4)));
    expect(screen.getByTestId("challenge-preparing")).toHaveAttribute(
      "data-preparing",
      "initial",
    );

    // The activation update is then lost. This is the state the device sat in.
    resync.mockImplementation(() => view.rerender(tree(activated(5))));
    await vi.advanceTimersByTimeAsync(3_000);

    // The first المرحلة screen arrives on its own.
    expect(resync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("marhala-phone")).toBeInTheDocument();
    expect(screen.queryByTestId("challenge-preparing")).toBeNull();

    // One bounded attempt, not a poll, and never a reload or a navigation.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resync).toHaveBeenCalledTimes(1);
    expect(routerSpy.replace).not.toHaveBeenCalled();
    expect(routerSpy.push).not.toHaveBeenCalled();
  });

  it("stays quiet when the first activation arrives on its own", async () => {
    const view = render(tree(coldPreparing(4)));
    await vi.advanceTimersByTimeAsync(1_000);
    view.rerender(tree(activated(5)));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(resync).not.toHaveBeenCalled();
    expect(screen.getByTestId("marhala-phone")).toBeInTheDocument();
  });

  it("lands straight on the live question when it joins mid-challenge", () => {
    // A phone that opens, refreshes or reconnects while المرحلة is already
    // running gets the current snapshot from its subscribe and must render it
    // immediately — not wait for some future announcement.
    render(tree(activated(9)));
    expect(screen.getByTestId("marhala-phone")).toBeInTheDocument();
    expect(screen.queryByTestId("challenge-preparing")).toBeNull();
    expect(resync).not.toHaveBeenCalled();
  });

  it("converges when the challenge started but no runtime arrived at all", async () => {
    // One step earlier than the loader: the phone is in the challenge stage and
    // holds no runtime, so it has nothing to draw and nothing owed to it. That
    // is the same inconsistency and gets the same single bounded request.
    const noRuntime = { ...base(4) } as unknown as LiveSessionSnapshot;
    const view = render(tree(noRuntime));
    expect(screen.queryByTestId("marhala-phone")).toBeNull();

    resync.mockImplementation(() => view.rerender(tree(activated(5))));
    await vi.advanceTimersByTimeAsync(3_000);

    expect(resync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("marhala-phone")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("never acknowledges readiness it was not asked for", async () => {
    // Unchanged Fair-Start: the phone is not a required surface for a
    // shared-only presentation, the prepared question stays hidden, and no
    // deadline starts here.
    render(tree(coldPreparing(4)));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
  });
});
