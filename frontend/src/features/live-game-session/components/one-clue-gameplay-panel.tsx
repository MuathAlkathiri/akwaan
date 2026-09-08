"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Badge } from "@/components/ui/badge";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
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
  // Which surface is rendering this, from the shell that mounted it. The host and
  // the shared screen read `false` and keep exactly the presentation they had.
  const phone = useMobileSurface();
  const [answer, setAnswer] = useState("");
  // Presentational only. `gameplayCommand` is fire-and-forget, so there is no
  // in-flight promise to await; this closes the window in which Enter and the
  // button could each queue their own copy of the same lock.
  const [sending, setSending] = useState(false);
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

  useEffect(() => {
    setAnswer("");
    setSending(false);
  }, [runtime.runtimeId, item?.id, itemIndex]);

  // The server locking this team's answer is the release: the guard has nothing
  // left to guard once the authoritative state says the answer is in.
  useEffect(() => {
    if (state.ownAnswerLocked === true) setSending(false);
  }, [state.ownAnswerLocked]);

  /**
   * One place the answer is locked from.
   *
   * Enter and the button used to carry two identical copies of this command, so
   * a fast player could send both. The payload and command name are unchanged —
   * only the number of places that can emit them.
   */
  const lockAnswer = () => {
    if (sending || !answer.trim()) return;
    setSending(true);
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType: "submit-one-clue-answer",
      payload: {
        answer: answer.trim(),
        assignmentSequence: Number(state.ownAssignmentSequence),
      },
    });
    setAnswer("");
  };

  return (
    <ChallengeFrame
      {...(phone ? {} : { eyebrow: "بدليل واحد" })}
      title={`السؤال ${itemIndex + 1} من 3`}
      progressValue={(itemIndex / 3) * 100}
      compact={phone}
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
      className={phone ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-4xl"}
    >
      <div
        className={
          phone ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-5"
        }
        dir="rtl"
      >
        <h2
          className={
            phone
              ? "text-center text-base font-black leading-snug text-foreground"
              : "text-center text-[2rem] font-black leading-snug text-foreground sm:text-[2.5rem]"
          }
        >
          <BidiText>
            {item ? authoredText(item.prompt) : "جارٍ تجهيز السؤال…"}
          </BidiText>
        </h2>

        {!revealed && (
          <ol
            className={
              phone
                ? "min-h-0 flex-1 space-y-1.5 overflow-y-auto"
                : "space-y-2"
            }
            data-testid="one-clue-revealed-clues"
          >
            {item?.clues.map((clue) => (
              <li
                key={clue.order}
                className={
                  phone
                    ? "akwaan-rise rounded-[var(--radius)] border border-border bg-card px-3 py-2 text-sm font-bold"
                    : "akwaan-rise rounded-[var(--radius)] border border-border bg-card p-4 text-lg font-bold"
                }
              >
                <span
                  className={
                    phone
                      ? "ms-2 text-xs text-muted-foreground"
                      : "ms-2 text-sm text-muted-foreground"
                  }
                >
                  الدليل {clue.order}
                </span>
                {authoredText(clue.text)}
              </li>
            ))}
          </ol>
        )}

        {!revealed && !phone && (
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

        {canAnswer &&
          (phone ? (
            <div className="shrink-0" data-testid="one-clue-answer-controls">
              <Input
                autoComplete="off"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="اكتب إجابة فريقك"
                data-testid="one-clue-answer-input"
                className="h-14 rounded-[var(--radius)] border-2 text-center text-lg font-black focus-visible:border-brand-gold"
                onKeyDown={(event) => {
                  if (event.key === "Enter") lockAnswer();
                }}
              />
              <MobileActionArea>
                <Button
                  size="lg"
                  disabled={sending || !answer.trim()}
                  onClick={lockAnswer}
                  data-testid="one-clue-submit"
                  className="h-14 w-full text-base font-black"
                >
                  {sending ? "جارٍ التثبيت…" : "قفل الإجابة"}
                </Button>
              </MobileActionArea>
            </div>
          ) : (
            <div
              className="mx-auto flex max-w-lg gap-2"
              data-testid="one-clue-answer-controls"
            >
              <Input
                autoComplete="off"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="اكتب إجابة فريقك"
                onKeyDown={(event) => {
                  if (event.key === "Enter") lockAnswer();
                }}
              />
              <Button
                disabled={sending || !answer.trim()}
                onClick={lockAnswer}
                data-testid="one-clue-submit"
              >
                قفل الإجابة
              </Button>
            </div>
          ))}

        {!revealed && actorTeamId && !canAnswer && (
          <div
            className={
              phone
                ? "flex flex-1 flex-col items-center justify-center gap-2 text-center"
                : ""
            }
            data-testid="one-clue-phone-status"
          >
            {phone && state.ownAnswerLocked === true && (
              <span
                aria-hidden
                className="grid size-14 place-items-center rounded-full border border-brand-gold/40 bg-brand-gold/10"
              >
                <Lock className="size-6 text-brand-gold" />
              </span>
            )}
            <p
              className={
                phone
                  ? "text-base font-black text-foreground"
                  : "rounded-[var(--radius)] bg-muted p-4 text-center font-bold text-muted-foreground"
              }
            >
              {eliminated.includes(actorTeamId)
                ? "إجابة غير صحيحة — خرجتم من هذا السؤال"
                : state.ownAnswerLocked
                  ? phone
                    ? "تم تثبيت إجابتكم"
                    : "تم تثبيت إجابتك"
                  : `${nameOf(assigned[actorTeamId])} يثبت إجابة الفريق`}
            </p>
            {phone && state.ownAnswerLocked === true && (
              <p className="text-sm font-bold text-muted-foreground">
                ننتظر بقية الفرق…
              </p>
            )}
          </div>
        )}

        {result && phone && (
          <section
            className="akwaan-rise flex flex-1 flex-col items-center justify-center gap-2 text-center"
            data-testid="one-clue-phone-reveal"
          >
            <p className="text-xs font-black text-muted-foreground">
              الإجابة الصحيحة
            </p>
            <p className="text-3xl font-black text-foreground">
              {result.correctAnswer}
            </p>
            {actorTeamId && (
              <p className="akwaan-numeral text-lg font-black text-brand-gold">
                +{result.points[actorTeamId] ?? 0}
              </p>
            )}
            <p className="text-sm font-bold text-muted-foreground">
              التفاصيل على الشاشة.
            </p>
          </section>
        )}

        {result && !phone && (
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
