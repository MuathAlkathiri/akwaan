import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({ gameplayCommand: vi.fn() }));
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      teams: [
        { id: "team-a", name: "ألفا" },
        { id: "team-b", name: "بيتا" },
      ],
    },
    gameplayCommand: mocks.gameplayCommand,
    connection: "connected",
  }),
}));

import { FirstNoteGameplayPanel } from "@/features/live-game-session/components/first-note-gameplay-panel";

const state = (overrides: Record<string, unknown> = {}) => ({
  phase: "auction",
  currentSongIndex: 0,
  songCount: 3,
  contextualClueJson: JSON.stringify({ ar: "أغنية خليجية من التسعينات" }),
  clueLabelJson: JSON.stringify({ ar: "الحقبة" }),
  currentBidSeconds: 9,
  currentBidTeamId: "team-b",
  biddingTeamId: "team-a",
  actorTeamId: "team-a",
  canBid: true,
  canPass: true,
  canAnswer: false,
  ...overrides,
});
const runtime = (modeState: Record<string, unknown>, actions: string[] = []) =>
  ({
    runtimeId: "runtime",
    sessionId: "session",
    revision: 3,
    status: "round-active",
    mode: { key: "first-note", version: 1, stateSchemaVersion: 1 },
    modeState,
    activeRound: { id: "round", status: "active" },
    availableActions: actions,
    completedRounds: [],
    transitions: [],
    serverTimestamp: "2026-01-01T00:00:00Z",
  }) as never;

beforeEach(() => mocks.gameplayCommand.mockReset());

describe("من أول نغمة", () => {
  it("shows the one clue, current bid, lower numeric controls, and pass to the current team", async () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(state(), [
          "mode:submit-first-note-bid",
          "mode:pass-first-note-bid",
        ])}
        actor="participant"
      />,
    );
    expect(screen.getByTestId("first-note-clue")).toHaveTextContent(
      "أغنية خليجية من التسعينات",
    );
    expect(screen.getByTestId("first-note-auction")).toHaveTextContent(
      "9 ثانية",
    );
    await userEvent.clear(screen.getByTestId("first-note-bid-input"));
    await userEvent.type(screen.getByTestId("first-note-bid-input"), "8");
    await userEvent.click(screen.getByTestId("first-note-submit-bid"));
    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round",
      commandType: "submit-first-note-bid",
      payload: { seconds: 8 },
    });
    await userEvent.click(screen.getByTestId("first-note-pass"));
    expect(mocks.gameplayCommand).toHaveBeenLastCalledWith(
      "gameplay-command",
      expect.objectContaining({ commandType: "pass-first-note-bid" }),
    );
  });

  it("preloads current public audio on the shared auction surface only", () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({
            audioJson: JSON.stringify({
              type: "audio",
              assets: [{ url: "https://cdn/song.mp3" }],
            }),
          }),
        )}
        actor="shared-screen"
      />,
    );
    expect(screen.getByTestId("first-note-audio-preload")).toHaveAttribute(
      "preload",
      "auto",
    );
  });

  it("locks a waiting phone after its accepted bid", () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({ biddingTeamId: "team-b", canBid: false, canPass: false }),
        )}
        actor="participant"
      />,
    );
    expect(screen.queryByTestId("first-note-bid-input")).toBeNull();
    expect(screen.getByText("بانتظار الفريق الآخر")).toBeInTheDocument();
  });

  it("gives only the answer owner free text while phones receive no audio", async () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({
            phase: "answering",
            answerOwnerTeamId: "team-a",
            finalBidSeconds: 3,
            canAnswer: true,
          }),
          ["mode:submit-first-note-answer"],
        )}
        actor="participant"
      />,
    );
    expect(screen.queryByTestId("first-note-audio")).toBeNull();
    await userEvent.type(
      screen.getByTestId("first-note-answer-input"),
      "الأماكن",
    );
    await userEvent.click(screen.getByRole("button", { name: "إرسال" }));
    expect(mocks.gameplayCommand).toHaveBeenLastCalledWith(
      "gameplay-command",
      expect.objectContaining({ payload: { answer: "الأماكن" } }),
    );
  });

  it("plays the authoritative duration only on the shared screen and keeps it for steal", () => {
    const { rerender } = render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({
            phase: "answering",
            answerOwnerTeamId: "team-a",
            finalBidSeconds: 3,
            audioJson: JSON.stringify({
              type: "audio",
              assets: [{ url: "https://cdn/song.mp3" }],
            }),
          }),
        )}
        actor="shared-screen"
      />,
    );
    expect(screen.getByTestId("first-note-audio")).toHaveAttribute(
      "data-clip-seconds",
      "3",
    );
    rerender(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({
            phase: "steal",
            answerOwnerTeamId: "team-b",
            finalBidSeconds: 3,
            audioJson: JSON.stringify({
              type: "audio",
              assets: [{ url: "https://cdn/song.mp3" }],
            }),
          }),
        )}
        actor="shared-screen"
      />,
    );
    expect(screen.getByTestId("first-note-answer-phase")).toHaveTextContent(
      "مدة المقطع: 3 ثانية",
    );
  });

  it("reveals a song result and renders the three-song recap totals", () => {
    const { rerender } = render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({
            phase: "resolved",
            revealJson: JSON.stringify({
              title: "الأماكن",
              finalBidSeconds: 3,
              auctionTeamId: "team-a",
              winnerTeamId: "team-a",
              stolen: false,
              points: { "team-a": 3, "team-b": 0 },
            }),
          }),
        )}
        actor="shared-screen"
      />,
    );
    expect(screen.getByTestId("first-note-reveal")).toHaveTextContent(
      "الأماكن",
    );
    rerender(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({
            phase: "completed",
            resultJson: JSON.stringify({
              winnerTeamId: "team-a",
              tie: false,
              points: { "team-a": 5, "team-b": 1 },
            }),
          }),
        )}
        actor="shared-screen"
      />,
    );
    expect(screen.getByTestId("first-note-recap")).toHaveTextContent("ألفا: 5");
  });
});
