"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import type { MatchActor } from "../match/types";
import { MarhalaQuestionImage } from "./marhala-screen";
import {
  LAQATHA_CHALLENGE_NAME,
  readLaqathaView,
  type LaqathaClueView,
} from "../match/laqatha.presentation";

function ClueCard({ clue }: { clue: LaqathaClueView }) {
  return (
    <li
      className="rounded-[var(--radius)] border bg-muted/40 p-4"
      data-testid={`laqatha-clue-${clue.order}`}
    >
      <div className="mb-2 flex items-center justify-between text-sm font-bold text-muted-foreground">
        <span>الدليل {clue.order}</span>
        <span>{clue.value} نقاط</span>
      </div>
      {clue.text?.ar && (
        <p className="text-lg font-bold leading-relaxed" dir="rtl">
          {clue.text.ar}
        </p>
      )}
      {clue.modality === "image" && clue.media?.assets[0] && (
        <div className="mt-2">
          <MarhalaQuestionImage
            url={clue.media.assets[0].url}
            altText={clue.media.assets[0].altText ?? `الدليل ${clue.order}`}
          />
        </div>
      )}
      {clue.modality === "audio" && clue.media?.assets[0] && (
        <audio
          controls
          className="mt-2 w-full"
          src={clue.media.assets[0].url}
          data-testid={`laqatha-audio-${clue.order}`}
        />
      )}
    </li>
  );
}

export function LaqathaGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const view = useMemo(
    () => readLaqathaView(runtime.modeState),
    [runtime.modeState],
  );
  const [answer, setAnswer] = useState("");
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase !== "revealing" && view.phase !== "claiming",
  );
  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType,
      payload,
    });
  // Presentational only, as in every other controller: `gameplayCommand` is
  // fire-and-forget, so this closes the double-tap window. It never decides who
  // won the claim — an authoritative snapshot does, and the effect below is what
  // makes a losing phone converge instead of sitting on a stale "pending".
  const [sending, setSending] = useState<"claim" | "answer" | undefined>();

  const teamName = (teamId?: string | null) =>
    snapshot?.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
  const phone = actor === "participant";
  const live = connection === "connected";
  // Any authoritative move releases the guard: the phase changing, a new movie,
  // the claim landing with someone (possibly the opponent), or the right to act
  // being withdrawn. A phone that lost the race stops waiting the moment the
  // server says who owns the claim.
  useEffect(() => {
    setSending(undefined);
  }, [
    view.phase,
    view.questionIndex,
    view.claimOwnerTeamId,
    view.canClaim,
    view.canSubmit,
  ]);

  useEffect(() => {
    setAnswer("");
  }, [view.questionIndex]);

  const claim = () => {
    if (sending) return;
    setSending("claim");
    send("claim-laqatha");
  };

  const submit = () => {
    if (sending || !answer.trim()) return;
    setSending("answer");
    send("submit-laqatha", { answer: answer.trim() });
    setAnswer("");
  };

  return (
    <ChallengeFrame
      {...(phone ? {} : { eyebrow: LAQATHA_CHALLENGE_NAME })}
      compact={phone}
      title={
        view.phase === "completed"
          ? "نتيجة التحدي"
          : `الفيلم ${view.questionIndex + 1} من ${view.questionCount}`
      }
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.questionIndex + 1) / view.questionCount) * 100
      }
      aside={
        remainingMs !== undefined &&
        (view.phase === "revealing" || view.phase === "claiming") ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className={phone ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-4xl"}
    >
      <div
        className={phone ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-5"}
        dir="rtl"
        data-testid="laqatha-panel"
      >
        {view.phase !== "completed" && (
          <div
            className={
              phone
                ? "flex shrink-0 items-center justify-center gap-1.5 text-sm"
                : "flex items-center justify-center gap-2"
            }
            data-testid="laqatha-reward"
          >
            <span
              className={
                phone
                  ? "text-xs font-bold text-muted-foreground"
                  : "text-sm font-bold text-muted-foreground"
              }
            >
              النقاط الآن
            </span>
            <span
              className={
                phone
                  ? "akwaan-numeral text-lg font-black text-foreground"
                  : "grid size-12 place-items-center rounded-full bg-primary text-2xl font-black text-primary-foreground"
              }
            >
              {view.currentReward}
            </span>
          </div>
        )}

        {/* The shared board is the hero: the revealed clue ladder, biggest first. */}
        {!phone && view.clues.length > 0 && (
          <ol className="space-y-3" data-testid="laqatha-clues">
            {view.clues.map((clue) => (
              <ClueCard key={clue.order} clue={clue} />
            ))}
          </ol>
        )}

        {view.phase === "claiming" && (
          <p
            className="text-center font-black text-brand-gold"
            data-testid="laqatha-claimed"
          >
            {teamName(view.claimOwnerTeamId)} حجز الإجابة…
          </p>
        )}

        {/* Phone controls. Both teams may claim while clues progress. */}
        {phone && view.phase === "revealing" && (
          <section
            className="flex min-h-0 flex-1 flex-col text-center"
            data-testid="laqatha-claim-cta"
          >
            {view.canClaim && can("claim-laqatha") ? (
              <>
                <p className="flex flex-1 items-center justify-center px-4 font-black text-muted-foreground">
                  تابعوا الأدلة على الشاشة
                </p>
                {/* One dominant action, sized for a thumb that is about to move
                    fast. Nothing else on this screen competes with it. */}
                <MobileActionArea>
                  <Button
                    size="lg"
                    disabled={!live || Boolean(sending)}
                    onClick={claim}
                    data-testid="laqatha-claim"
                    className="h-20 w-full text-2xl font-black"
                  >
                    {sending === "claim" ? "جارٍ حجز الإجابة…" : "جاوب"}
                  </Button>
                </MobileActionArea>
              </>
            ) : (
              <p
                className="flex flex-1 items-center justify-center px-4 font-black text-muted-foreground"
                data-testid="laqatha-claim-blocked"
              >
                {view.attemptUsed
                  ? "انتهت محاولة فريقكم لهذا الفيلم."
                  : "تابعوا الأدلة على الشاشة."}
              </p>
            )}
          </section>
        )}

        {phone && view.phase === "claiming" && (
          <section
            className="flex min-h-0 flex-1 flex-col text-center"
            data-testid="laqatha-answer"
          >
            {view.canSubmit && can("submit-laqatha") ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-1 flex-col justify-center gap-2">
                  <p className="text-base font-black text-brand-gold">
                    الإجابة لكم
                  </p>
                  {/* Five seconds. The field takes focus immediately and there is
                      nothing to read first — every element here costs typing time. */}
                  <Input
                    autoFocus
                    autoComplete="off"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="اسم الفيلم"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submit();
                    }}
                    data-testid="laqatha-answer-input"
                    className="h-16 rounded-[var(--radius)] border-2 text-center text-xl font-black focus-visible:border-brand-gold"
                  />
                </div>
                <MobileActionArea>
                  <Button
                    size="lg"
                    disabled={!live || Boolean(sending) || !answer.trim()}
                    onClick={submit}
                    data-testid="laqatha-answer-submit"
                    className="h-14 w-full text-base font-black"
                  >
                    {sending === "answer" ? "جارٍ الإرسال…" : "إرسال"}
                  </Button>
                </MobileActionArea>
              </div>
            ) : (
              <p
                className="flex flex-1 items-center justify-center px-4 font-black text-muted-foreground"
                data-testid="laqatha-answer-locked"
              >
                {view.attemptUsed
                  ? "انتهت محاولة فريقكم لهذا الفيلم."
                  : "الفريق الثاني يحاول يجاوب…"}
              </p>
            )}
          </section>
        )}

        {view.phase === "resolved" && view.reveal && (
          <section
            className="akwaan-rise space-y-3 text-center"
            data-testid="laqatha-reveal"
          >
            <div className="rounded-[var(--radius)] bg-primary p-5 text-primary-foreground">
              <p className="text-sm font-bold opacity-80">الفيلم</p>
              <p className="text-3xl font-black">{view.reveal.title}</p>
            </div>
            <p className="font-black">
              {view.reveal.winnerTeamId
                ? `${teamName(view.reveal.winnerTeamId)} أجاب عند الدليل ${view.reveal.solvedAtClue} (+${view.reveal.points[view.reveal.winnerTeamId] ?? 0})`
                : "لم يجب أي فريق"}
            </p>
            {can("advance-laqatha") && (
              <Button
                size="lg"
                onClick={() => send("advance-laqatha")}
                disabled={!live}
                data-testid="laqatha-advance"
              >
                {view.questionIndex + 1 === view.questionCount
                  ? "عرض النتيجة"
                  : "الفيلم التالي"}
              </Button>
            )}
          </section>
        )}

        {view.phase === "completed" && view.result && (
          <section
            className="grid gap-3 sm:grid-cols-2"
            data-testid="laqatha-recap"
          >
            {Object.entries(view.result.points).map(([teamId, points]) => (
              <div
                key={teamId}
                className={cn(
                  "rounded-[var(--radius)] border p-5 text-center",
                  view.result?.winnerTeamId === teamId &&
                    "border-4 border-brand-gold",
                )}
              >
                <p className="font-bold">{teamName(teamId)}</p>
                <p className="text-3xl font-black">{points}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
