import type { LiveSessionSnapshot } from "../../model";
import { MOVING_XO_CONTENT_EXHAUSTED_COPY } from "../moving-xo.presentation";
import { teamName } from "../presentation";
import type { MatchChallengeResult } from "../types";

export function MovingXoResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const exhausted = result.details.endedBy === "content-exhausted";
  return (
    <div className="space-y-2 text-center" data-testid="moving-xo-result-recap">
      <p className="text-2xl font-black text-foreground">
        {exhausted
          ? MOVING_XO_CONTENT_EXHAUSTED_COPY
          : result.winnerTeamId
            ? `فوز ${teamName(snapshot, result.winnerTeamId)}`
            : "انتهى التحدي بالتعادل"}
      </p>
    </div>
  );
}
