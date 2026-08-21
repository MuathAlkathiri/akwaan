import { Check, Flame, Timer, Trophy, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";

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
    return { Icon: Flame, text: "أكمل الكومبو للنهاية", lost: false };
  }
  if (run.endedBy === "cash-out") {
    return { Icon: Check, text: `ثبّت ${run.bankedPoints}`, lost: false };
  }
  if (run.endedBy === "timeout") {
    return { Icon: Timer, text: "انتهى الوقت", lost: true };
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
            <span aria-hidden className="h-px w-2.5 bg-current opacity-30" />
          )}
          <span
            aria-hidden
            className={cn(
              "grid size-4 place-items-center rounded-full border text-[0.6rem] font-black leading-none",
              mark === "cleared" && "border-current bg-current/20",
              mark === "lost" && "border-destructive text-destructive",
              mark === "unplayed" && "border-current opacity-35",
            )}
          >
            {mark === "lost" ? "✕" : mark === "cleared" ? "●" : ""}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ComboResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = result.details as ComboDetails;
  const points = details.points ?? {};
  const runs = details.runs ?? [];
  const rewarded = result.matchPoints.filter((entry) => entry.points !== 0);

  return (
    <div className="space-y-4" data-testid="combo-challenge-result">
      {/* The two Runs, side by side on a shared screen and stacked on a phone. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {snapshot.teams.map((team) => {
          const identity = teamIdentityOf(team.id, snapshot.teams);
          const run = runs.find((entry) => entry.teamId === team.id);
          const banked = points[team.id] ?? run?.bankedPoints ?? 0;
          const isWinner = result.winnerTeamId === team.id;
          return (
            <div
              key={team.id}
              data-testid={`combo-result-${team.id}`}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-[var(--radius)] border p-4 text-center",
                identity.surface,
                identity.border,
                isWinner && "ring-2 ring-inset ring-current",
              )}
            >
              <p className={cn("text-sm font-black", identity.text)}>
                {team.name}
              </p>
              <p className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
                نقاط الكومبو
              </p>
              <p
                className="akwaan-numeral text-5xl font-black leading-none text-foreground"
                data-testid={`combo-points-${team.id}`}
              >
                {banked}
              </p>
              {/* Only shown when the summary says how the Run ended. */}
              {run && (
                <>
                  {(() => {
                    const outcome = outcomeOf(run, snapshot);
                    return (
                      <p
                        className={cn(
                          "flex items-center gap-1.5 text-sm font-bold",
                          outcome.lost ? "text-destructive" : "text-foreground",
                        )}
                        data-testid={`combo-outcome-${team.id}`}
                      >
                        <outcome.Icon className="size-3.5" aria-hidden />
                        {outcome.text}
                      </p>
                    );
                  })()}
                  <div className={identity.text}>
                    <StageTrail run={run} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* The mechanic's verdict, taken verbatim from the server. */}
      <p
        className="flex items-center justify-center gap-2 text-center text-xl font-black text-foreground sm:text-2xl"
        data-testid="combo-verdict"
      >
        {result.tie ? (
          <>
            <Flame className="size-5 text-muted-foreground" aria-hidden />
            تعادل في الكومبو
          </>
        ) : (
          <>
            <Trophy className="size-5 text-primary" aria-hidden />
            {`${teamName(snapshot, result.winnerTeamId!)} يفوز بالكومبو`}
          </>
        )}
      </p>

      {/* Deliberately smaller and separated: a Match point means "won a
          challenge", so it must never read as the Combo total carrying over. */}
      <div className="flex flex-col items-center gap-1">
        {rewarded.length ? (
          <div
            className="flex flex-wrap justify-center gap-2"
            data-testid="combo-match-reward"
          >
            {rewarded.map((entry) => {
              const identity = teamIdentityOf(entry.teamId, snapshot.teams);
              return (
                <span
                  key={entry.teamId}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-black",
                    identity.surface,
                    identity.border,
                    identity.text,
                  )}
                >
                  {`${entry.points > 0 ? "+" : ""}${entry.points} نقطة للمباراة`}
                </span>
              );
            })}
          </div>
        ) : (
          <p
            className="text-sm font-bold text-muted-foreground"
            data-testid="combo-match-reward-none"
          >
            لا نقطة مباراة عند التعادل
          </p>
        )}
        <p className="text-xs font-bold text-muted-foreground">
          نقاط الكومبو لا تُضاف إلى نتيجة المباراة
        </p>
      </div>
    </div>
  );
}
