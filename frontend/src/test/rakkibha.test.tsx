import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RakkibhaPanel } from "@/features/live-game-session/components/rakkibha-panel";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

const gameplayCommand = vi.fn();
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      teams: [
        { id: "alpha", name: "ألفا" },
        { id: "beta", name: "بيتا" },
      ],
    },
    gameplayCommand,
    connection: "connected",
  }),
}));
vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => Date.parse("2026-01-01T00:00:00Z") }),
);
vi.mock("@/features/live-game-session/components/marhala-screen", () => ({
  MarhalaQuestionImage: ({ url }: { url: string }) => (
    <img src={url} alt="private visual" />
  ),
  MarhalaQuestionAudio: ({ url }: { url: string }) => <audio src={url} />,
}));

const runtime = (modeState: Record<string, unknown>) =>
  ({
    mode: { key: "rakkibha", version: 1, stateSchemaVersion: 1 },
    modeState: {
      phase: "active",
      puzzleCount: 3,
      puzzlePosition: 1,
      myTeamId: "alpha",
      contentItemId: "honeycomb",
      deadlineAt: "2026-01-01T00:02:15Z",
      progressJson: JSON.stringify([
        { teamId: "alpha", solved: 0, wrongAttempts: 0, locked: 0 },
        { teamId: "beta", solved: 0, wrongAttempts: 0, locked: 0 },
      ]),
      ...modeState,
    },
    activeRound: { id: "round-1", status: "active", modeState: {} },
  }) as unknown as GameplayRuntimeSnapshot;

describe("Rakkibha private UI", () => {
  beforeEach(() => gameplayCommand.mockReset());
  it("renders a reference without answer controls", () => {
    render(
      <RakkibhaPanel
        runtime={runtime({
          hasReference: true,
          myReferenceJson: JSON.stringify({
            media: { type: "image", url: "/reference.webp" },
          }),
        })}
      />,
    );
    expect(screen.getByTestId("rakkibha-reference")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "إرسال القطعة" })).toBeNull();
  });
  it("renders two local candidates and submits the selected local id", () => {
    render(
      <RakkibhaPanel
        runtime={runtime({
          myCandidatesJson: JSON.stringify({
            id: "holder-b",
            candidates: [
              {
                localId: "option-1",
                media: { type: "image", url: "/one.webp" },
              },
              {
                localId: "option-2",
                media: { type: "image", url: "/two.webp" },
              },
            ],
          }),
        })}
      />,
    );
    const candidates = screen.getByTestId("rakkibha-candidates");
    fireEvent.click(candidates.querySelectorAll("button")[1]);
    fireEvent.click(screen.getByRole("button", { name: "إرسال القطعة" }));
    expect(gameplayCommand).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({
        commandType: "submit-candidate",
        payload: { contentItemId: "honeycomb", localCandidateId: "option-2" },
      }),
    );
    expect(document.body.textContent).not.toContain("canonicalIdentity");
  });
});
