import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  gameplayCommand: vi.fn(),
  connection: "connected",
  nowMs: Date.parse("2026-01-01T00:00:10Z"),
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => mocks.nowMs }),
);
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      teams: [
        { id: "team-a", name: "ألفا" },
        { id: "team-b", name: "بيتا" },
      ],
      participants: [],
      serverTimestamp: "2026-01-01T00:00:10Z",
    },
    snapshotReceivedAtMs: mocks.nowMs,
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
  }),
}));

import { LaqathaGameplayPanel } from "@/features/live-game-session/components/laqatha-gameplay-panel";

const textClue = (order: number) => ({
  order,
  value: 6 - order,
  modality: "text" as const,
  text: { ar: `دليل ${order}` },
});

const state = (overrides: Record<string, unknown> = {}) => ({
  phase: "revealing",
  currentQuestionIndex: 0,
  questionCount: 3,
  revealedClueCount: 2,
  currentReward: 4,
  cluesJson: JSON.stringify([textClue(1), textClue(2)]),
  claimOwnerTeamId: null,
  failedTeamIdsJson: "[]",
  teamIdsJson: JSON.stringify(["team-a", "team-b"]),
  deadlineAt: "2026-01-01T00:00:13Z",
  ...overrides,
});

const runtime = (modeState: Record<string, unknown>, actions: string[] = []) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 1,
    mode: { key: "laqatha", version: 1, stateSchemaVersion: 1 },
    modeState,
    activeRound: { id: "round-1", status: "active" },
    availableActions: actions,
    completedRounds: [],
    transitions: [],
    serverTimestamp: "2026-01-01T00:00:10Z",
  }) as never;

beforeEach(() => mocks.gameplayCommand.mockReset());

describe("القطها", () => {
  it("makes the revealed clue ladder the shared-screen hero, showing only revealed clues and the current reward", () => {
    render(
      <LaqathaGameplayPanel runtime={runtime(state())} actor="shared-screen" />,
    );
    expect(
      screen.getByTestId("laqatha-clues").querySelectorAll("li"),
    ).toHaveLength(2);
    expect(screen.getByTestId("laqatha-reward")).toHaveTextContent("4");
    expect(screen.getByText("الفيلم 1 من 3")).toBeInTheDocument();
  });

  it("renders image and audio clues without a library", () => {
    const modeState = state({
      revealedClueCount: 3,
      cluesJson: JSON.stringify([
        textClue(1),
        {
          order: 2,
          value: 4,
          modality: "image",
          media: { type: "image", assets: [{ url: "https://cdn/c2.webp" }] },
        },
        {
          order: 3,
          value: 3,
          modality: "audio",
          media: { type: "audio", assets: [{ url: "https://cdn/c3.mp3" }] },
        },
      ]),
    });
    render(
      <LaqathaGameplayPanel runtime={runtime(modeState)} actor="shared-screen" />,
    );
    expect(
      screen.getByTestId("laqatha-clue-2").querySelector("img"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("laqatha-audio-3")).toBeInTheDocument();
  });

  it("lets an eligible phone on either team claim while clues progress", async () => {
    render(
      <LaqathaGameplayPanel
        runtime={runtime(state({ canClaim: true }), ["mode:claim-laqatha"])}
        actor="participant"
      />,
    );
    await userEvent.click(screen.getByTestId("laqatha-claim"));
    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "claim-laqatha",
      payload: {},
    });
  });

  it("gives only the claiming team a free-text answer box, and locks the opponent", async () => {
    const { rerender } = render(
      <LaqathaGameplayPanel
        runtime={runtime(
          state({
            phase: "claiming",
            claimOwnerTeamId: "team-a",
            canSubmit: true,
            deadlineAt: "2026-01-01T00:00:15Z",
          }),
          ["mode:submit-laqatha"],
        )}
        actor="participant"
      />,
    );
    await userEvent.type(
      screen.getByTestId("laqatha-answer-input"),
      "الأسد الملك",
    );
    await userEvent.click(screen.getByTestId("laqatha-answer-submit"));
    expect(mocks.gameplayCommand).toHaveBeenLastCalledWith(
      "gameplay-command",
      expect.objectContaining({
        commandType: "submit-laqatha",
        payload: { answer: "الأسد الملك" },
      }),
    );

    rerender(
      <LaqathaGameplayPanel
        runtime={runtime(
          state({
            phase: "claiming",
            claimOwnerTeamId: "team-a",
            canSubmit: false,
          }),
        )}
        actor="participant"
      />,
    );
    expect(screen.queryByTestId("laqatha-answer-input")).toBeNull();
    expect(screen.getByText("بانتظار إجابة الفريق الآخر…")).toBeInTheDocument();
  });

  it("reveals the movie and lets the controller advance once resolved", async () => {
    render(
      <LaqathaGameplayPanel
        runtime={runtime(
          state({
            phase: "resolved",
            deadlineAt: null,
            revealJson: JSON.stringify({
              title: "الأسد الملك",
              winnerTeamId: "team-a",
              solvedAtClue: 2,
              points: { "team-a": 4, "team-b": 0 },
              failedTeamIds: [],
              clues: [textClue(1), textClue(2)],
            }),
          }),
          ["mode:advance-laqatha"],
        )}
        actor="controller"
      />,
    );
    expect(screen.getByTestId("laqatha-reveal")).toHaveTextContent(
      "الأسد الملك",
    );
    await userEvent.click(screen.getByTestId("laqatha-advance"));
    expect(mocks.gameplayCommand).toHaveBeenLastCalledWith(
      "gameplay-command",
      expect.objectContaining({ commandType: "advance-laqatha" }),
    );
  });
});
