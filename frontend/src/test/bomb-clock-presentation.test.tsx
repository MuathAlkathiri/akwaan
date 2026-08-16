import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * Bomb's countdown is presentation. It is not allowed to end a challenge.
 *
 * This panel used to send `expire-team` the moment its own countdown reached
 * zero. The command was always re-checked against the server clock, so it could
 * never expire a team early — but a backgrounded tab, a throttled timer or a
 * device clock skewed past the 60s anchoring window all moved when the client
 * *thought* the deadline had passed, and the send raced the server's own timer
 * for no benefit. `GameplayDeadlineScheduler` derives the same instant from
 * persisted state, so the client no longer has an opinion worth sending.
 */

const mocks = vi.hoisted(() => ({ gameplayCommand: vi.fn() }));

const snapshot = {
  status: "active",
  serverTimestamp: "2026-08-14T00:01:00.000Z",
  teams: [
    {
      id: "team-1",
      name: "صقور الرياض",
      clock: {
        allocatedMs: 60_000,
        consumedMs: 0,
        remainingMs: 0,
        startedAt: "2026-08-14T00:00:00.000Z",
        running: true,
        expired: true,
      },
    },
  ],
  participants: [{ id: "player-1", displayName: "معاذ" }],
};

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    connection: "connected",
    gameplayCommand: mocks.gameplayCommand,
    snapshot,
    // The clock ran out a full minute ago by the client's reckoning.
    nowMs: Date.parse("2026-08-14T00:01:00.000Z"),
    snapshotReceivedAtMs: Date.parse("2026-08-14T00:01:00.000Z"),
  }),
}));

vi.mock("@/features/live-game-session/hooks/use-bomb-voice-input", () => ({
  useBombVoiceInput: () => ({
    state: "idle",
    supported: false,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

import { BombGameplayPanel } from "@/features/live-game-session/components/bomb-gameplay-panel";

const runtime = {
  runtimeId: "runtime-1",
  sessionId: "session-1",
  status: "round-active",
  revision: 3,
  mode: { key: "bomb", version: 1, stateSchemaVersion: 1 },
  modeState: { phase: "ready", questionIndex: 0, questionCount: 1 },
  activeTeamId: "team-1",
  activeRound: {
    id: "round-1",
    sequence: 1,
    status: "active",
    activeTeamId: "team-1",
    activeParticipantId: "player-1",
    transitionRevision: 3,
    createdAt: "2026-08-14T00:00:00.000Z",
    modeState: {
      phase: "presenting",
      questionId: "question-1",
      prompt: "من هو؟",
      itemIndex: 0,
      itemCount: 3,
      imageUrl: "/media/item.png",
      altText: "",
    },
  },
  currentItem: {
    id: "question-1:0",
    index: 0,
    totalItems: 3,
    image: { url: "/media/item.png" },
  },
  prompt: "من هو؟",
  completedRounds: [],
  transitions: [],
  // The server still offers the command; only this panel declines to send it.
  availableActions: ["mode:submit-answer", "mode:skip", "mode:expire-team"],
  serverTimestamp: "2026-08-14T00:01:00.000Z",
} as unknown as GameplayRuntimeSnapshot;

describe("bomb countdown is presentation only", () => {
  beforeEach(() => mocks.gameplayCommand.mockClear());

  it("sends no expire-team when its own countdown has run out", () => {
    render(<BombGameplayPanel runtime={runtime} />);
    const sent = mocks.gameplayCommand.mock.calls.map(
      (call) => (call[1] as { commandType?: string })?.commandType,
    );
    expect(sent).not.toContain("expire-team");
    expect(mocks.gameplayCommand).not.toHaveBeenCalled();
  });

  it("sends no expire-team on rerender either", () => {
    // The old effect guarded itself with a ref keyed by round and team, which a
    // remount reset. Nothing to reset now, but a rerender is the cheapest way
    // to prove the trigger is gone rather than merely deduplicated.
    const view = render(<BombGameplayPanel runtime={runtime} />);
    view.rerender(<BombGameplayPanel runtime={runtime} />);
    view.rerender(<BombGameplayPanel runtime={{ ...runtime, revision: 4 }} />);
    expect(mocks.gameplayCommand).not.toHaveBeenCalled();
  });

  it("still tells the players the clock is spent", () => {
    // The countdown keeps doing its real job: it stops offering an answer box
    // for a clock that has visibly run out, and says why.
    render(<BombGameplayPanel runtime={runtime} />);
    expect(screen.getByText(/Time is up/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
