import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";

interface OddPieceDetails {
  points?: Record<string, number>;
  puzzles?: Array<{ puzzleIndex: number; winnerTeamId: string | null }>;
}

/**
 * Who found the odd piece, picture by picture.
 *
 * One card a picture, on the same result shell as every other challenge. The
 * pictures' own points and the one Match point are separate numbers, and the
 * banner keeps them apart.
 */
export function OddPieceResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = (result.details ?? {}) as OddPieceDetails;
  return (
    <div className="space-y-5" data-testid="odd-piece-challenge-result">
      <ol className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {details.puzzles?.map((puzzle, index) => (
          <ResultRoundCard
            key={puzzle.puzzleIndex}
            data-testid={`odd-piece-result-puzzle-${index}`}
            round={index + 1}
            snapshot={snapshot}
            facts={[
              {
                label: "اللي لمس القطعة صح",
                value: puzzle.winnerTeamId
                  ? teamName(snapshot, puzzle.winnerTeamId)
                  : "ما أحد لمسها صح",
              },
            ]}
            points={
              puzzle.winnerTeamId
                ? [{ teamId: puzzle.winnerTeamId, points: 1 }]
                : []
            }
          />
        ))}
      </ol>
      <ChallengeWinnerBanner
        result={result}
        snapshot={snapshot}
        {...(details.points ? { totals: details.points } : {})}
      />
    </div>
  );
}
