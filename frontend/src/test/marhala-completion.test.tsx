import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarhalaResultRecap } from "@/features/live-game-session/match/components/marhala-result-recap";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";
import type { MatchChallengeResult } from "@/features/live-game-session/match/types";

/**
 * How a "المرحلة" race is recorded once it is over.
 *
 * Two endings that must not look alike. A finish is a win on the board. Running out
 * of unseen questions is neither a loss nor a tie: nobody reached the end, no
 * reward was given, and the room deserves to be told that in words rather than
 * shown a scoreless draw and left to guess.
 */

const snapshot = {
  sessionId: "session-1",
  teams: [
    { id: "team-alpha", name: "ألفا" },
    { id: "team-beta", name: "بيتا" },
  ],
} as unknown as LiveSessionSnapshot;

const result = (
  overrides: Partial<MatchChallengeResult> = {},
): MatchChallengeResult =>
  ({
    id: "result-1",
    positionKey: "0:slot_4",
    occurrenceIndex: 0,
    slotKey: "slot_4",
    worldId: "world-video-games",
    worldName: "فيديو قيمز",
    challengeTypeId: "ct-marhala",
    challengeKey: "marhala",
    challengeName: "المرحلة",
    selectedScopeIds: [],
    winnerTeamId: "team-alpha",
    matchPoints: [
      { teamId: "team-alpha", points: 1 },
      { teamId: "team-beta", points: 0 },
    ],
    tie: false,
    double: { consumedTeamIds: [], appliedTeamId: null },
    details: {
      endedBy: "finish",
      positions: { "team-alpha": 16, "team-beta": 9 },
      turnsPlayed: 7,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:05:00.000Z",
    ...overrides,
  }) as unknown as MatchChallengeResult;

describe("a race that was won", () => {
  it("names the winning team", () => {
    render(<MarhalaResultRecap result={result()} snapshot={snapshot} />);
    expect(screen.getByTestId("marhala-result-winner")).toHaveTextContent(
      "ألفا وصلوا النهاية",
    );
  });

  it("shows the board as it finished, with both tokens on it", () => {
    render(<MarhalaResultRecap result={result()} snapshot={snapshot} />);
    expect(
      within(screen.getByTestId("marhala-tile-16")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("marhala-tile-9")).getByTestId(
        "marhala-token-team-beta",
      ),
    ).toBeInTheDocument();
  });

  it("reads the winner's tile as the finish rather than as a number", () => {
    render(<MarhalaResultRecap result={result()} snapshot={snapshot} />);
    expect(screen.getByTestId("marhala-final-team-alpha")).toHaveTextContent(
      "النهاية",
    );
    expect(screen.getByTestId("marhala-final-team-beta")).toHaveTextContent(
      "المربّع",
    );
  });

  it("keeps the Match reward separate from board progress", () => {
    render(<MarhalaResultRecap result={result()} snapshot={snapshot} />);
    // The board says where they stopped; the points are the Match's own.
    expect(screen.getByTestId("marhala-result-recap")).toHaveTextContent(
      "نقطة للمباراة",
    );
  });
});

describe("a race that ran out of questions", () => {
  const exhausted = () =>
    result({
      winnerTeamId: null,
      matchPoints: [
        { teamId: "team-alpha", points: 0 },
        { teamId: "team-beta", points: 0 },
      ],
      details: {
        endedBy: "content-exhausted",
        positions: { "team-alpha": 7, "team-beta": 5 },
        turnsPlayed: 4,
      },
    } as Partial<MatchChallengeResult>);

  it("says the new questions ran out, in the product's words", () => {
    render(<MarhalaResultRecap result={exhausted()} snapshot={snapshot} />);
    expect(screen.getByTestId("marhala-result-exhausted")).toHaveTextContent(
      "خلصت الأسئلة الجديدة المتاحة لهذا التحدي",
    );
  });

  it("explains that nobody won and nothing was awarded", () => {
    render(<MarhalaResultRecap result={exhausted()} snapshot={snapshot} />);
    const recap = screen.getByTestId("marhala-result-recap");
    expect(recap).toHaveTextContent("لم يصل أي فريق إلى النهاية");
    expect(recap).toHaveTextContent("لم تُمنح نقاط");
    // Not a win, not a tie, and no reward badge invented for it.
    expect(screen.queryByTestId("marhala-result-winner")).toBeNull();
    expect(recap).not.toHaveTextContent("نقطة للمباراة");
  });

  it("still shows where both teams stopped", () => {
    render(<MarhalaResultRecap result={exhausted()} snapshot={snapshot} />);
    expect(screen.getByTestId("marhala-final-team-alpha")).toHaveTextContent(
      "7",
    );
    expect(screen.getByTestId("marhala-final-team-beta")).toHaveTextContent(
      "5",
    );
  });

  it("never looks like an error and never leaks a technical label", () => {
    render(<MarhalaResultRecap result={exhausted()} snapshot={snapshot} />);
    const text = screen.getByTestId("marhala-result-recap").textContent ?? "";
    for (const leak of [
      "content-exhausted",
      "endedBy",
      "winnerTeamId",
      "challenge.win",
      "MATCH_CONTENT_EXHAUSTED_FOR_ACCOUNT",
      "null",
    ]) {
      expect(text).not.toContain(leak);
    }
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a result whose details never arrived", () => {
  it("falls back to the start tiles rather than rendering nothing", () => {
    render(
      <MarhalaResultRecap
        result={result({ details: {} } as Partial<MatchChallengeResult>)}
        snapshot={snapshot}
      />,
    );
    // A missing record is not a reason to hide the recap; both teams are drawn on
    // the opening tile and the winner the Match recorded is still named.
    expect(screen.getByTestId("marhala-result-winner")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("marhala-tile-1")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeInTheDocument();
  });
});
