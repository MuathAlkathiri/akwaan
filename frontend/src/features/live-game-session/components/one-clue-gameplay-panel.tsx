"use client";

import { useEffect, useState } from "react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Badge } from "@/components/ui/badge";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { authoredText, type AuthoredText } from "../authored-text";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";

interface OneClueItem {
  id: string;
  prompt: AuthoredText;
  clues: Array<{ order: number; value: number; text: AuthoredText }>;
}

interface OneClueResult {
  correctAnswer: string;
  clueNumber: number;
  answers: Record<string, string | null>;
  statuses: Record<string, "correct" | "wrong" | "no-answer">;
  points: Record<string, number>;
}

function parsed<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function OneClueGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const [answer, setAnswer] = useState("");
  const state = runtime.modeState;
  const round = runtime.activeRound;
  const item = parsed<OneClueItem | null>(state.currentItemJson, null);
  const teams = parsed<string[]>(state.teamIdsJson, []);
  const submitted = parsed<Record<string, boolean>>(
    state.submissionStatusJson,
    {},
  );
  const eliminated = parsed<string[]>(state.eliminatedTeamIdsJson, []);
  const assigned = parsed<Record<string, string>>(
    state.assignedParticipantIdsJson,
    {},
  );
  const result = parsed<OneClueResult | null>(state.revealedResultJson, null);
  const itemIndex = Number(state.currentItemIndex ?? 0);
  const revealed = state.phase === "revealed" || state.phase === "completed";
  const remainingMs = useInteractionDeadline(
    typeof state.deadlineAt === "string" ? state.deadlineAt : undefined,
    revealed,
  );
  const actorTeamId =
    typeof state.actorTeamId === "string" ? state.actorTeamId : "";
  const canAnswer =
    state.isAssignedActor === true &&
    state.ownAnswerLocked !== true &&
    !eliminated.includes(actorTeamId) &&
    !revealed &&
    runtime.availableActions.includes("mode:submit-one-clue-answer") &&
    connection === "connected";
  const nameOf = (id: string) =>
    snapshot?.participants.find((person) => person.id === id)?.displayName ??
    "لاعب الفريق";
  const teamName = (id: string) =>
    snapshot?.teams.find((team) => team.id === id)?.name ?? "الفريق";

  useEffect(() => setAnswer(""), [runtime.runtimeId, item?.id, itemIndex]);

  return (
    <ChallengeFrame
      eyebrow="بدليل واحد"
      title={`السؤال ${itemIndex + 1} من 3`}
      progressValue={(itemIndex / 3) * 100}
      aside={
        !revealed ? (
          <div className="flex gap-2">
            <Badge variant="secondary" className="font-black">
              {Number(state.currentClueValue ?? 5)} نقاط
            </Badge>
            {remainingMs !== undefined && (
              <ChallengeCountdown remainingMs={remainingMs} />
            )}
          </div>
        ) : null
      }
      className="mx-auto max-w-4xl"
    >
      <div className="space-y-5" dir="rtl">
        <h2 className="text-center text-[2rem] font-black leading-snug text-foreground sm:text-[2.5rem]">
          <BidiText>
            {item ? authoredText(item.prompt) : "جارٍ تجهيز السؤال…"}
          </BidiText>
        </h2>

        {!revealed && (
          <ol className="space-y-2" data-testid="one-clue-revealed-clues">
            {item?.clues.map((clue) => (
              <li
                key={clue.order}
                className="akwaan-rise rounded-[var(--radius)] border border-border bg-card p-4 text-lg font-bold"
              >
                <span className="ms-2 text-sm text-muted-foreground">
                  الدليل {clue.order}
                </span>
                {authoredText(clue.text)}
              </li>
            ))}
          </ol>
        )}

        {!revealed && (
          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((teamId) => {
              const identity = teamIdentityOf(teamId, snapshot?.teams ?? []);
              return (
                <div
                  key={teamId}
                  className={cn(
                    "rounded-[var(--radius)] border p-4 text-center",
                    identity.surface,
                    identity.border,
                  )}
                >
                  <p className={cn("font-black", identity.text)}>
                    {teamName(teamId)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-muted-foreground">
                    {eliminated.includes(teamId)
                      ? "إجابة غير صحيحة — خرجتم من هذا السؤال"
                      : submitted[teamId]
                        ? "تم تثبيت الإجابة"
                        : `${nameOf(assigned[teamId])} يفكر…`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {canAnswer && (
          <div className="mx-auto flex max-w-lg gap-2">
            <Input
              autoComplete="off"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="اكتب إجابة فريقك"
              onKeyDown={(event) => {
                if (event.key === "Enter" && answer.trim()) {
                  gameplayCommand("gameplay-command", {
                    roundId: round?.id,
                    commandType: "submit-one-clue-answer",
                    payload: {
                      answer: answer.trim(),
                      assignmentSequence: Number(state.ownAssignmentSequence),
                    },
                  });
                  setAnswer("");
                }
              }}
            />
            <Button
              disabled={!answer.trim()}
              onClick={() => {
                gameplayCommand("gameplay-command", {
                  roundId: round?.id,
                  commandType: "submit-one-clue-answer",
                  payload: {
                    answer: answer.trim(),
                    assignmentSequence: Number(state.ownAssignmentSequence),
                  },
                });
                setAnswer("");
              }}
            >
              قفل الإجابة
            </Button>
          </div>
        )}

        {!revealed && actorTeamId && !canAnswer && (
          <p className="rounded-[var(--radius)] bg-muted p-4 text-center font-bold text-muted-foreground">
            {eliminated.includes(actorTeamId)
              ? "إجابة غير صحيحة — خرجتم من هذا السؤال"
              : state.ownAnswerLocked
                ? "تم تثبيت إجابتك"
                : `${nameOf(assigned[actorTeamId])} يثبت إجابة الفريق`}
          </p>
        )}

        {result && (
          <section className="akwaan-rise space-y-4 text-center">
            <div className="rounded-[var(--radius)] bg-primary p-5 text-primary-foreground">
              <p className="text-sm font-bold opacity-80">الإجابة الصحيحة</p>
              <p className="text-3xl font-black">{result.correctAnswer}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((teamId) => (
                <div
                  key={teamId}
                  className="rounded-[var(--radius)] border p-4"
                >
                  <p className="font-black">{teamName(teamId)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {result.answers[teamId] ?? "لم يثبت إجابة"}
                  </p>
                  <p className="akwaan-numeral mt-2 text-2xl font-black">
                    +{result.points[teamId] ?? 0}
                  </p>
                </div>
              ))}
            </div>
            {runtime.availableActions.includes("mode:advance-one-clue-item") ? (
              <Button
                size="lg"
                onClick={() =>
                  gameplayCommand("gameplay-command", {
                    roundId: round?.id,
                    commandType: "advance-one-clue-item",
                    payload: {},
                  })
                }
              >
                {itemIndex === 2 ? "عرض نتيجة التحدي" : "السؤال التالي"}
              </Button>
            ) : (
              <p className="text-sm font-bold text-muted-foreground">
                بانتظار المضيف للمتابعة…
              </p>
            )}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
