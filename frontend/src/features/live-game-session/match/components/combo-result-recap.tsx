import { Check, Flame, Timer, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";

/**
 * How "الكومبو" ended, read from the completion summary the launcher recorded.
 *
 * Everything here is authoritative. `endedBy` is the mechanic's own word for how
 * a Run finished, so the outcome line is never guessed from a point total — a
 * team can bank zero by being broken on question one or by cashing out nothing,
 * and those are different stories.
 */
interface ComboRunDetail {
  teamId: string;
  bankedPoints: number;
  /** The question the Run *ended on*, 1-based — not always the count answered. */
  questionsAnswered: number;
  endedBy: "cash-out" | "combo-break" | "timeout" | "final-question";
  brokenByTeamId: string | null;
}

interface ComboDetails {
  points?: Record<string, number>;
  tie?: boolean;
  runs?: ComboRunDetail[];
}

const COMBO_STAGE_COUNT = 4;

/** True when the Run ended by losing the question it was on. */
function lostOnLastQuestion(run: ComboRunDetail): boolean {
  return run.endedBy === "combo-break" || run.endedBy === "timeout";
}

/**
 * The Run as four dots.
 *
 * Derived only from `questionsAnswered` and `endedBy`: the questions cleared, the
 * one that ended it when it ended badly, and the ones never reached. No
 * client-side history is kept to produce this.
 */
function stageMarks(
  run: ComboRunDetail,
): Array<"cleared" | "lost" | "unplayed"> {
  const lost = lostOnLastQuestion(run);
  const cleared = lost ? run.questionsAnswered - 1 : run.questionsAnswered;
  return Array.from({ length: COMBO_STAGE_COUNT }, (_, index) => {
    const question = index + 1;
    if (question <= cleared) return "cleared";
    if (lost && question === run.questionsAnswered) return "lost";
    return "unplayed";
  });
}

/**
 * How the Run ended, as an icon and words.
 *
 * An icon rather than a pictograph, and never colour alone: the label carries the
 * outcome on its own for anyone who cannot separate the two.
 */
function outcomeOf(
  run: ComboRunDetail,
  snapshot: LiveSessionSnapshot,
): { Icon: LucideIcon; text: string; lost: boolean } {
  if (run.endedBy === "final-question") {
    return { Icon: Flame, text: "كمّلوا الكومبو للنهاية", lost: false };
  }
  if (run.endedBy === "cash-out") {
    return { Icon: Check, text: `ثبّتوا ${run.bankedPoints}`, lost: false };
  }
  if (run.endedBy === "timeout") {
    return { Icon: Timer, text: "خلص وقتهم", lost: true };
  }
  return {
    Icon: Zap,
    text: run.brokenByTeamId
      ? `كسره ${teamName(snapshot, run.brokenByTeamId)}`
      : "انكسر الكومبو",
    lost: true,
  };
}

function StageTrail({ run }: { run: ComboRunDetail }) {
  const marks = stageMarks(run);
  return (
    <div
      className="flex items-center justify-center gap-1"
      data-testid={`combo-trail-${run.teamId}`}
      aria-label={`تقدّم الجولة: ${marks.filter((mark) => mark === "cleared").length} من ${COMBO_STAGE_COUNT}`}
    >
      {marks.map((mark, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden className="h-px w-2.5 bg-brand-navy opacity-30" />
          )}
          <span
            aria-hidden
            className={cn(
              "grid size-5 place-items-center rounded-full border-2 border-brand-navy text-[0.65rem] font-black leading-none text-brand-navy",
              mark === "cleared" && "bg-sem-success",
              mark === "lost" && "bg-sem-error",
              mark === "unplayed" && "bg-white opacity-45",
            )}
          >
            {mark === "lost" ? "✕" : mark === "cleared" ? "●" : ""}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The two runs, laid face up on the same result card every challenge ends on.
 *
 * The Combo's own points and the one Match point are different numbers, so the
 * banner keeps them apart and the line under it says so in words.
 */
export function ComboResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = (result.details ?? {}) as ComboDetails;
  const points = details.points ?? {};
  const runs = details.runs ?? [];
  const totals = Object.fromEntries(
    snapshot.teams.map((team) => [
      team.id,
      points[team.id] ??
        runs.find((entry) => entry.teamId === team.id)?.bankedPoints ??
        0,
    ]),
  );

  return (
    <div className="space-y-5" data-testid="combo-challenge-result">
      <ol className="grid list-none gap-5 sm:grid-cols-2">
        {snapshot.teams.map((team, index) => {
          const run = runs.find((entry) => entry.teamId === team.id);
          const outcome = run ? outcomeOf(run, snapshot) : undefined;
          return (
            <ResultRoundCard
              key={team.id}
              data-testid={`combo-result-${team.id}`}
              round={index + 1}
              snapshot={snapshot}
              question={`جولة ${teamName(snapshot, team.id)}`}
              {...(outcome
                ? {
                    stamp: {
                      label: outcome.text,
                      tone: outcome.lost
                        ? ("wrong" as const)
                        : ("correct" as const),
                      testId: `combo-outcome-${team.id}`,
                    },
                  }
                : {})}
              facts={[
                {
                  label: "نقاط الكومبو",
                  value: (
                    <span
                      className="akwaan-numeral text-4xl font-black leading-none"
                      data-testid={`combo-points-${team.id}`}
                    >
                      {totals[team.id]}
                    </span>
                  ),
                },
              ]}
            >
              {run && <StageTrail run={run} />}
            </ResultRoundCard>
          );
        })}
      </ol>

      <ChallengeWinnerBanner
        result={result}
        snapshot={snapshot}
        totals={totals}
        testIds={{
          root: "combo-verdict",
          totals: "combo-mechanic-totals",
          matchPoint: "combo-match-reward",
        }}
      />

      {/* A Match point means "won a challenge", so it must never read as the
          Combo total carrying over. */}
      <p
        className="text-center text-sm font-bold text-brand-slate"
        data-testid="combo-match-note"
      >
        نقاط الكومبو ما تنضاف لنتيجة المباراة
      </p>
    </div>
  );
}
