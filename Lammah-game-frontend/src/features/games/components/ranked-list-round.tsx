"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RankedListRoundActionResponseDtoOutcome,
  RankedListRoundStateResponseDto,
} from "@/api/generated/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";
import { useRankedListRound } from "../hooks/use-games";
import { cn } from "@/lib/utils";
import { useTop10FeedbackSound } from "../hooks/use-top10-feedback-sound";

const feedback: Record<RankedListRoundActionResponseDtoOutcome, string> = {
  started: "بدأت الجولة",
  correct: "إجابة صحيحة!",
  incorrect: "إجابة غير صحيحة — احتُسب خطأ وانتقل الدور",
  already_discovered: "هذه الإجابة مكتشفة مسبقاً — يبقى الدور للفريق نفسه",
  timeout: "انتهى الوقت — احتُسب خطأ وانتقل الدور",
  round_completed: "اكتملت الجولة",
  stale_turn: "تم تجاهل الإجراء لأن الدور تغيّر",
};

export function getRankedListSecondsRemaining(
  turnExpiresAt: string,
  now = Date.now(),
) {
  return Math.max(
    0,
    Math.ceil((new Date(turnExpiresAt).getTime() - now) / 1000),
  );
}

interface RankedListRoundViewProps {
  question: string;
  state: RankedListRoundStateResponseDto;
  secondsRemaining: number;
  answer: string;
  feedbackText?: string;
  pending?: boolean;
  error?: string;
  feedbackKind?: "correct" | "incorrect" | "duplicate";
  feedbackSequence?: number;
  highlightedEntryId?: string;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
}

export function RankedListRoundView({
  question,
  state,
  secondsRemaining,
  answer,
  feedbackText,
  pending,
  error,
  feedbackKind,
  feedbackSequence,
  highlightedEntryId,
  onAnswerChange,
  onSubmit,
  onContinue,
}: RankedListRoundViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const completed = state.status === "completed";
  const winner = state.outcome?.winnerTeamId
    ? state.teams.find(
        (team) => team.teamId === state.outcome?.winnerTeamId,
      )?.name
    : undefined;
  const collectedScore = useMemo(
    () =>
      state.collectedScore ??
      state.entries.reduce(
        (total, entry) => total + (entry.revealed ? entry.points : 0),
        0,
      ),
    [state.collectedScore, state.entries],
  );

  useEffect(() => {
    if (!completed && !pending) inputRef.current?.focus();
  }, [completed, feedbackSequence, pending, state.activeTeamIndex]);

  return (
    <div className="space-y-5" dir="rtl" data-testid="ranked-list-round">
      <header className="space-y-2 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary">
          Top 10
        </p>
        <h2 className="text-2xl font-black md:text-4xl">{question}</h2>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {state.teams.map((team) => {
          const active = !completed && team.teamIndex === state.activeTeamIndex;
          return (
            <div
              key={team.teamId}
              className={`rounded-2xl border p-3 text-center ${
                active ? "border-primary bg-primary/10" : "border-white/10"
              } ${team.eliminated ? "opacity-45" : ""}`}
            >
              <p className="font-black">{team.name}</p>
              <p className="mt-1 text-2xl font-black text-primary">
                {team.temporaryScore}
              </p>
              <p aria-label={`${team.strikes} أخطاء`} className="text-lg">
                {"✕".repeat(team.strikes)}
                {"○".repeat(state.maxStrikesPerTeam - team.strikes)}
              </p>
              {team.eliminated && (
                <p className="text-xs text-destructive">خرج من الجولة</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-lg font-black">
        النقاط المجموعة:{" "}
        <span className="text-primary">{collectedScore} / 600</span>
      </p>

      {!completed && (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            دور {state.teams[state.activeTeamIndex]?.name}
          </p>
          <p
            data-testid="ranked-list-countdown"
            className={`text-5xl font-black ${
              secondsRemaining <= 5 ? "text-destructive" : "text-primary"
            }`}
          >
            {secondsRemaining}
          </p>
        </div>
      )}

      <ol className="grid gap-2 sm:grid-cols-2">
        {state.entries.map((entry) => (
          <li
            key={entry.id}
            data-testid={`ranked-entry-${entry.rank}`}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border px-3 transition-colors",
              entry.revealed
                ? "border-primary/40 bg-primary/10"
                : "border-white/10 bg-white/5",
              highlightedEntryId === entry.id &&
                feedbackKind === "correct" &&
                "top10-answer-reveal border-emerald-300/70 bg-emerald-500/20",
            )}
          >
            <span className="w-7 text-center text-lg font-black">
              {entry.rank}
            </span>
            <span className="min-w-0 flex-1 font-bold">
              {entry.revealed ? entry.answer : "••••••••"}
              {entry.claimedByTeamId && (
                <small className="block text-xs text-muted-foreground">
                  {
                    state.teams.find(
                      (team) => team.teamId === entry.claimedByTeamId,
                    )?.name
                  }
                </small>
              )}
            </span>
            <span className="font-black text-primary">{entry.points}</span>
          </li>
        ))}
      </ol>

      {completed ? (
        <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
          <h3 className="text-2xl font-black">
            {winner ? `الفائز بالجولة: ${winner}` : "تعادل — لا نقاط إضافية"}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {state.teams.map((team) => (
              <p key={team.teamId} className="rounded-xl bg-black/15 p-3">
                <strong className="block">{team.name}</strong>
                جمع {team.temporaryScore} داخل الجولة
                <span className="block font-black text-primary">
                  +
                  {state.outcome?.awardedPointsByTeam[team.teamId] ?? 0} إلى
                  النتيجة
                </span>
              </p>
            ))}
          </div>
          <Button className="w-full" size="lg" onClick={onContinue}>
            العودة إلى اللوحة
          </Button>
        </section>
      ) : (
        <form
          className={cn(
            "space-y-3 rounded-xl",
            feedbackKind === "incorrect" &&
              "top10-answer-shake ring-2 ring-red-400/55",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              autoFocus
              value={answer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="اكتب إجابة واحدة"
              disabled={
                pending || state.teams[state.activeTeamIndex]?.eliminated
              }
              className="h-12 text-lg"
            />
            <Button
              type="submit"
              size="lg"
              disabled={
                pending ||
                !answer.trim() ||
                state.teams[state.activeTeamIndex]?.eliminated
              }
            >
              إرسال
            </Button>
          </div>
          {feedbackText && (
            <p role="status" className="text-center font-semibold">
              {feedbackText}
            </p>
          )}
          {error && (
            <p role="alert" className="text-center text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export function RankedListRound({
  gameId,
  questionId,
  question,
  onComplete,
}: {
  gameId: string;
  questionId: string;
  question: string;
  onComplete: () => void;
}) {
  const round = useRankedListRound(gameId, questionId);
  const [answer, setAnswer] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(20);
  const [lifecycleReady, setLifecycleReady] = useState(false);
  const [feedbackText, setFeedbackText] = useState<string>();
  const [error, setError] = useState<string>();
  const [feedbackKind, setFeedbackKind] = useState<
    "correct" | "incorrect" | "duplicate"
  >();
  const [feedbackSequence, setFeedbackSequence] = useState(0);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string>();
  const expiredSequence = useRef<number>();
  const submissionSequence = useRef(0);
  const sound = useTop10FeedbackSound();

  useEffect(() => {
    round
      .start()
      .then(() => setLifecycleReady(true))
      .catch((reason) => {
        setError(getApiErrorMessage(reason, "تعذر بدء جولة Top 10."));
      });
    // Starting is idempotent; the question identity defines this lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, questionId]);

  useEffect(() => {
    const state = round.data;
    if (!lifecycleReady || !state || state.status === "completed") return;
    const update = () => {
      const remaining = getRankedListSecondsRemaining(state.turnExpiresAt);
      setSecondsRemaining(remaining);
      if (
        remaining === 0 &&
        expiredSequence.current !== state.turnSequence
      ) {
        expiredSequence.current = state.turnSequence;
        round
          .expire(state.turnSequence)
          .then((response) =>
            setFeedbackText(feedback[response.data.outcome]),
          )
          .catch((reason) =>
            setError(getApiErrorMessage(reason, "تعذر تحديث المؤقت.")),
          );
      }
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lifecycleReady,
    round.data?.turnExpiresAt,
    round.data?.turnSequence,
    round.data?.status,
  ]);

  if (!round.data)
    return (
      <div className="py-16 text-center">
        <p>{error || "جاري تجهيز جولة Top 10..."}</p>
      </div>
    );

  return (
    <RankedListRoundView
      question={question}
      state={round.data}
      secondsRemaining={secondsRemaining}
      answer={answer}
      feedbackText={feedbackText}
      feedbackKind={feedbackKind}
      feedbackSequence={feedbackSequence}
      highlightedEntryId={highlightedEntryId}
      pending={round.isSubmitting || round.isExpiring}
      error={error}
      onAnswerChange={setAnswer}
      onSubmit={() => {
        if (!answer.trim()) return;
        sound.prime();
        const requestSequence = ++submissionSequence.current;
        setError(undefined);
        setFeedbackKind(undefined);
        setHighlightedEntryId(undefined);
        round
          .submit(answer, round.data!.turnSequence)
          .then((response) => {
            if (requestSequence !== submissionSequence.current) return;
            const outcome = response.data.outcome;
            setFeedbackText(feedback[outcome]);
            setFeedbackKind(
              outcome === "correct" ||
                (outcome === "round_completed" &&
                  Boolean(response.data.matchedEntry))
                ? "correct"
                : outcome === "already_discovered"
                  ? "duplicate"
                    : outcome === "incorrect" ||
                        (outcome === "round_completed" &&
                          response.data.strikeApplied)
                    ? "incorrect"
                    : undefined,
            );
            setHighlightedEntryId(response.data.matchedEntry?.id);
            setFeedbackSequence((value) => value + 1);
            if (
              outcome === "correct" ||
              (outcome === "round_completed" &&
                Boolean(response.data.matchedEntry))
            )
              sound.play("correct");
            else if (
              outcome === "incorrect" ||
              (outcome === "round_completed" &&
                response.data.strikeApplied)
            )
              sound.play("incorrect");
            setAnswer("");
          })
          .catch((reason) => {
            if (requestSequence !== submissionSequence.current) return;
            setError(getApiErrorMessage(reason, "تعذر إرسال الإجابة."));
          });
      }}
      onContinue={onComplete}
    />
  );
}
