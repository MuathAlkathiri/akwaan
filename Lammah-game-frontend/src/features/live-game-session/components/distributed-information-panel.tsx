"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import {
  DISTRIBUTED_CHALLENGE_NAME,
  describeDistributedError,
  parseDistributedSegments,
  parseDistributedOptions,
  parseDistributedProgress,
  remainingLockSeconds,
  remainingRaceSeconds,
  type DistributedProgress,
} from "../match/distributed-information.presentation";

/**
 * "ركّبها" on a player's phone.
 *
 * Everything shown here comes from the actor-specific snapshot the server built
 * for *this* participant: their own segments, their own team's progress, and
 * whether they are the one who answers. Nothing is derived locally — not the
 * progress, not the lock, not the winner.
 */
export function DistributedInformationPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection, nowMs } = useLiveSession();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const state = runtime.modeState;
  const round = runtime.activeRound;

  const segments = useMemo(
    () => parseDistributedSegments(state.mySegmentsJson),
    [state.mySegmentsJson],
  );
  const options = useMemo(
    () => parseDistributedOptions(state.optionsJson),
    [state.optionsJson],
  );
  const progress = useMemo(
    () => parseDistributedProgress(state.progressJson),
    [state.progressJson],
  );
  const teams = useMemo(
    () => new Map(snapshot?.teams.map((team) => [team.id, team.name]) ?? []),
    [snapshot?.teams],
  );

  const myTeamId = String(state.myTeamId ?? "");
  const mine = progress.find((entry) => entry.teamId === myTeamId);
  const opponent = progress.find((entry) => entry.teamId !== myTeamId);
  const lockSeconds = remainingLockSeconds(state.myLockUntil, nowMs);
  const raceSeconds = remainingRaceSeconds(state.deadlineAt, nowMs);
  const isAnswerer = state.isAnswerer === true;
  const completed = state.phase === "completed";
  const teamFinished = state.myTeamFinished === true;
  const puzzleCount = Number(state.puzzleCount ?? 3);

  const submit = () => {
    if (!isAnswerer || submitting || lockSeconds > 0) return;
    setSubmitting(true);
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType: "submit-answer",
      payload: {
        // The server rejects an answer aimed at a puzzle the team has left.
        contentItemId: String(state.contentItemId ?? ""),
        answer:
          state.answerMode === "closest" ? Number(answer) : answer.trim(),
      },
    });
    setAnswer("");
    // The authoritative snapshot re-enables input; nothing is assumed here.
    setSubmitting(false);
  };

  if (completed) {
    return (
      <DistributedResultCard
        state={state}
        progress={progress}
        teams={teams}
        myTeamId={myTeamId}
      />
    );
  }

  return (
    <Card dir="rtl" className="overflow-hidden border-border">
      <CardHeader className="bg-muted/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {DISTRIBUTED_CHALLENGE_NAME}
            </p>
            <CardTitle className="mt-1 text-xl">
              اللغز {Number(state.puzzlePosition ?? 1)} من {puzzleCount}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">الوقت المتبقي: {raceSeconds} ثانية</Badge>
            <Badge variant="secondary">
              فريقك: {mine?.solved ?? 0}/{puzzleCount}
            </Badge>
            <Badge variant="outline">
              الخصم: {opponent?.solved ?? 0}/{puzzleCount}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {teamFinished ? (
          <p className="rounded-[var(--radius)] bg-success-subtle p-4 text-center font-bold text-success">
            أنهى فريقك كل الألغاز. بانتظار النتيجة النهائية...
          </p>
        ) : (
          <>
            <section>
              <p className="text-sm font-bold text-muted-foreground">السؤال</p>
              <p className="mt-1 text-lg font-black">
                {String(state.publicPrompt ?? "")}
              </p>
            </section>

            <section
              aria-label="معلوماتك الخاصة"
              className="rounded-[var(--radius)] border border-warning/35 bg-warning-subtle p-4"
            >
              <p className="text-sm font-black text-foreground">
                معلوماتك الخاصة — لا تعرض شاشتك
              </p>
              <ul className="mt-3 space-y-2">
                {segments.map((segment) => (
                  <li
                    key={segment.id}
                    className="rounded-lg bg-card p-3 text-base font-bold shadow-sm"
                  >
                    {segment.content}
                  </li>
                ))}
              </ul>
            </section>

            {lockSeconds > 0 && (
              <p
                role="alert"
                className="rounded-[var(--radius)] bg-destructive/[0.07] p-4 text-center font-bold text-destructive"
              >
                إجابة غير صحيحة
                <span className="mt-1 block">
                  حاولوا مجددًا بعد {lockSeconds}
                </span>
              </p>
            )}

            {isAnswerer ? (
              <section className="space-y-3">
                <p className="font-black text-foreground">
                  أنت المجيب في هذا اللغز
                </p>
                {state.answerMode === "multiple_choice" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.map((option) => (
                      <Button
                        key={option.id}
                        type="button"
                        variant={answer === option.id ? "default" : "outline"}
                        disabled={lockSeconds > 0 || connection !== "connected"}
                        onClick={() => setAnswer(option.id)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Input
                    value={answer}
                    inputMode={
                      state.answerMode === "closest" ? "numeric" : "text"
                    }
                    onChange={(event) => setAnswer(event.target.value)}
                    disabled={lockSeconds > 0}
                    placeholder={
                      state.answerMode === "closest"
                        ? "اكتب الرقم"
                        : "اكتب الإجابة"
                    }
                    aria-label="إجابتك"
                  />
                )}
                <Button
                  type="button"
                  className="w-full"
                  disabled={
                    !answer.trim() ||
                    submitting ||
                    lockSeconds > 0 ||
                    connection !== "connected"
                  }
                  onClick={submit}
                >
                  إرسال الإجابة
                </Button>
              </section>
            ) : (
              <p className="rounded-[var(--radius)] bg-muted p-4 text-center font-bold text-foreground">
                ناقش معلوماتك مع فريقك
                <span className="mt-1 block">والمجيب سيرسل الإجابة</span>
              </p>
            )}
          </>
        )}

        <DistributedCommandError />
      </CardContent>
    </Card>
  );
}

/** Backend codes never reach the player as primary copy. */
function DistributedCommandError() {
  const { error } = useLiveSession();
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-bold text-destructive">
      {describeDistributedError(error)}
    </p>
  );
}

function DistributedResultCard({
  state,
  progress,
  teams,
  myTeamId,
}: {
  state: GameplayRuntimeSnapshot["modeState"];
  progress: DistributedProgress[];
  teams: Map<string, string>;
  myTeamId: string;
}) {
  const result = useMemo(() => {
    if (typeof state.resultJson !== "string") return undefined;
    try {
      return JSON.parse(state.resultJson) as {
        winnerTeamId: string | null;
        tie: boolean;
      };
    } catch {
      return undefined;
    }
  }, [state.resultJson]);

  return (
    <Card dir="rtl" className="border-success/25">
      <CardHeader className="text-center">
        <p className="text-sm font-medium text-success">
          {DISTRIBUTED_CHALLENGE_NAME}
        </p>
        <CardTitle className="text-2xl font-black">
          {result?.tie
            ? "تعادل"
            : result?.winnerTeamId === myTeamId
              ? "فزتم بالتحدي"
              : "فاز الفريق الآخر"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-center">
        {progress.map((entry) => (
          <p key={entry.teamId} className="font-bold">
            {teams.get(entry.teamId) ?? entry.teamId}: {entry.solved}/3
          </p>
        ))}
        {!result?.tie && result?.winnerTeamId && (
          <p className="font-black text-success">
            نقطة مباراة واحدة للفريق الفائز
          </p>
        )}
      </CardContent>
    </Card>
  );
}
