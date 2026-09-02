import { describe, expect, it } from "vitest";
import { readFirstNoteView } from "@/features/live-game-session/match/first-note.presentation";
describe("First Note presentation", () => {
  it("reads auction ownership and direct bid bounds without answer truth", () => {
    const view = readFirstNoteView({
      phase: "auction",
      currentSongIndex: 0,
      songCount: 3,
      contextualClueJson: JSON.stringify({ ar: "سنة 1998" }),
      currentBidSeconds: 5,
      currentBidTeamId: "a",
      biddingTeamId: "b",
      canBid: true,
      canPass: true,
    });
    expect(view).toMatchObject({
      phase: "auction",
      clue: { ar: "سنة 1998" },
      currentBidSeconds: 5,
      currentBidTeamId: "a",
      biddingTeamId: "b",
      canBid: true,
      canPass: true,
    });
  });
  it("keeps the exact final duration through first answer and steal", () => {
    for (const phase of ["answering", "steal"] as const)
      expect(readFirstNoteView({ phase, finalBidSeconds: 3 })).toMatchObject({
        phase,
        finalBidSeconds: 3,
      });
  });
  it("does not invent audio when phones receive none", () => {
    expect(
      readFirstNoteView({ phase: "answering", finalBidSeconds: 2 }).audio,
    ).toBeUndefined();
  });
});
