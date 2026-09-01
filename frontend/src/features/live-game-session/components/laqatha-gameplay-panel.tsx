"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
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
  const teamName = (teamId?: string | null) =>
    snapshot?.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
  const phone = actor === "participant";
  const live = connection === "connected";
  const submit = () => {
    if (!answer.trim()) return;
    send("submit-laqatha", { answer: answer.trim() });
    setAnswer("");
  };

  return (
    <ChallengeFrame
      eyebrow={LAQATHA_CHALLENGE_NAME}
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
      className="mx-auto max-w-4xl"
    >
      <div className="space-y-5" dir="rtl" data-testid="laqatha-panel">
        {view.phase !== "completed" && (
          <div
            className="flex items-center justify-center gap-2"
            data-testid="laqatha-reward"
          >
            <span className="text-sm font-bold text-muted-foreground">
              النقاط الآن
            </span>
            <span className="grid size-12 place-items-center rounded-full bg-primary text-2xl font-black text-primary-foreground">
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
          <section className="space-y-3 text-center" data-testid="laqatha-claim-cta">
            {view.canClaim && can("claim-laqatha") ? (
              <Button
                size="lg"
                disabled={!live}
                onClick={() => send("claim-laqatha")}
                data-testid="laqatha-claim"
              >
                جاوب
              </Button>
            ) : (
              <p className="rounded-[var(--radius)] bg-muted p-4 font-bold text-muted-foreground">
                {view.attemptUsed
                  ? "انتهت محاولة فريقكم لهذا الفيلم."
                  : "تابعوا الأدلة واضغطوا «جاوب» متى ما عرفتم."}
              </p>
            )}
          </section>
        )}

        {phone && view.phase === "claiming" && (
          <section className="space-y-3 text-center" data-testid="laqatha-answer">
            {view.canSubmit && can("submit-laqatha") ? (
              <div className="mx-auto flex max-w-lg gap-2">
                <Input
                  autoComplete="off"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="اكتب اسم الفيلم"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                  }}
                  data-testid="laqatha-answer-input"
                />
                <Button
                  disabled={!live || !answer.trim()}
                  onClick={submit}
                  data-testid="laqatha-answer-submit"
                >
                  إرسال
                </Button>
              </div>
            ) : (
              <p className="rounded-[var(--radius)] bg-muted p-4 font-bold text-muted-foreground">
                بانتظار إجابة الفريق الآخر…
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
