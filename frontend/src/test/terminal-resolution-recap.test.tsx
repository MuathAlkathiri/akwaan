import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BombResultRecap } from "@/features/live-game-session/match/components/bomb-result-recap";
import { RakkibhaResultRecap } from "@/features/live-game-session/match/components/rakkibha-result-recap";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";
import type { MatchChallengeResult } from "@/features/live-game-session/match/types";

const snapshot = {
  teams: [{ id: "a", name: "الفريق الأول" }],
} as LiveSessionSnapshot;
describe("terminal resolution recaps", () => {
  it("shows Bomb's recorded outcomes without inventing timeout submissions", () => {
    const result = {
      winnerTeamId: "a",
      details: {
        items: [
          {
            teamId: "a",
            prompt: "السؤال",
            submittedAnswer: null,
            correctAnswer: "الحقيقة",
            outcome: "timeout",
          },
        ],
      },
    } as unknown as MatchChallengeResult;
    render(<BombResultRecap result={result} snapshot={snapshot} />);
    expect(screen.getByText("الحقيقة")).toBeTruthy();
    expect(screen.getByText("ما تم إرسال إجابة")).toBeTruthy();
    expect(screen.getByText("انتهى الوقت")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("shows native Rakkibha selections and only the supplied encountered puzzle", () => {
    const selection = {
      content: "القطعة الصحيحة",
      media: { type: "image", url: "/uploads/piece.webp" },
    };
    const result = {
      winnerTeamId: "a",
      details: {
        puzzles: [
          {
            teamId: "a",
            contentItemId: "p1",
            instruction: "اللغز",
            selections: [],
            correctSelection: selection,
            outcome: "unfinished",
          },
        ],
      },
    } as unknown as MatchChallengeResult;
    render(<RakkibhaResultRecap result={result} snapshot={snapshot} />);
    expect(screen.getByRole("img").getAttribute("src")).toContain(
      "/uploads/piece.webp",
    );
    expect(screen.getAllByTestId("resolution-reveal")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
