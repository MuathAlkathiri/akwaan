"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  ResolutionAnswerRow,
  ResolutionOutcome,
  ResolutionReveal,
} from "../match/components/resolution-reveal";
import {
  ODD_PIECE_CHALLENGE_NAME,
  readOddPieceView,
} from "../match/odd-piece.presentation";

export function OddPieceGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const view = useMemo(
    () => readOddPieceView(runtime.modeState),
    [runtime.modeState],
  );
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase !== "open",
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
  const teamName = (teamId?: string) =>
    snapshot?.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
  const phone = actor === "participant";
  const live = connection === "connected";

  if (phone) {
    return (
      <OddPiecePhoneController
        view={view}
        live={live}
        can={can}
        remainingMs={remainingMs}
        teamName={teamName}
        send={send}
      />
    );
  }

  return (
    <ChallengeFrame
      eyebrow={ODD_PIECE_CHALLENGE_NAME}
      title={
        view.phase === "completed"
          ? "نتيجة التحدي"
          : `اللغز ${view.puzzleIndex + 1} من ${view.puzzleCount}`
      }
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.puzzleIndex + 1) / view.puzzleCount) * 100
      }
      aside={
        remainingMs !== undefined && view.phase === "open" ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="mx-auto max-w-5xl"
    >
      <div className="space-y-5" dir="rtl" data-testid="odd-piece-panel">
        {view.phase !== "completed" && (
          <h2
            className="text-center text-xl font-black"
            data-testid="odd-piece-prompt"
          >
            {view.prompt}
          </h2>
        )}

        {!phone && view.phase !== "completed" && (
          <div className="grid grid-cols-2 gap-3" data-testid="odd-piece-grid">
            {view.pieces.map((piece, index) => {
              const odd = view.reveal?.oddPieceId === piece.id;
              return (
                <figure
                  key={piece.id}
                  className={cn(
                    "relative overflow-hidden rounded-[var(--radius)] border bg-muted",
                    odd && "border-4 border-brand-gold",
                  )}
                  data-testid={`odd-piece-card-${piece.id}`}
                >
                  <MarhalaQuestionImage
                    url={piece.imageUrl}
                    altText={piece.altText ?? `القطعة ${index + 1}`}
                  />
                  <figcaption className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-background/90 font-black">
                    {index + 1}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}

        {view.phase === "open" && (
          <section
            className="space-y-3 text-center"
            data-testid="odd-piece-open"
          >
            <p className="font-bold">عرفتوا القطعة؟ أول فريق يحجز يختار.</p>
            {phone && view.canClaim && can("claim-odd-piece") && (
              <Button
                size="lg"
                disabled={!live}
                onClick={() => send("claim-odd-piece")}
                data-testid="odd-piece-claim"
              >
                جاوب
              </Button>
            )}
          </section>
        )}

        {view.phase === "selecting" && (
          <section
            className="space-y-3 text-center"
            data-testid="odd-piece-selecting"
          >
            <p className="font-black">
              {teamName(view.answerOwnerTeamId)} يختار القطعة الدخيلة
            </p>
            {phone && view.canSelect && can("submit-odd-piece") ? (
              <div className="grid grid-cols-2 gap-3">
                {view.pieces.map((piece, index) => (
                  <Button
                    key={piece.id}
                    variant="outline"
                    className="h-20 text-2xl font-black"
                    disabled={!live}
                    onClick={() =>
                      send("submit-odd-piece", { pieceId: piece.id })
                    }
                    data-testid={`odd-piece-select-${piece.id}`}
                  >
                    {index + 1}
                  </Button>
                ))}
              </div>
            ) : phone ? (
              <p className="rounded-[var(--radius)] bg-muted p-4 font-bold text-muted-foreground">
                {view.attemptUsed
                  ? "انتهت محاولة فريقكم."
                  : "بانتظار اختيار الفريق الآخر…"}
              </p>
            ) : null}
          </section>
        )}

        {(view.phase === "revealed" || view.phase === "completed") &&
          view.reveal && (
            <section
              className="space-y-4 text-center"
              data-testid="odd-piece-reveal"
            >
              <p className="text-xl font-black">
                السيارة الأساسية: {view.reveal.targetVehicleLabel}
              </p>
              <p className="font-bold text-brand-gold">
                القطعة الدخيلة من {view.reveal.intruderVehicleLabel}
              </p>
              {/* Who picked what. Released with the answer and never before it:
                  a selection narrows the puzzle for whoever is still solving. */}
              {view.attempts.length > 0 && (
                <div
                  className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2"
                  data-testid="odd-piece-attempts"
                >
                  {view.attempts.map((attempt) => (
                    <p
                      key={`${attempt.teamId}-${attempt.pieceId}`}
                      data-testid={`odd-piece-attempt-${attempt.teamId}`}
                      className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-bold"
                    >
                      {teamName(attempt.teamId)}:{" "}
                      {attempt.correct ? "أصابت" : "أخطأت"}
                    </p>
                  ))}
                </div>
              )}
              {!phone && (
                <div
                  className="mx-auto max-w-xl"
                  data-testid="odd-piece-target-reveal"
                >
                  <MarhalaQuestionImage
                    url={view.reveal.targetReveal.imageUrl}
                    altText={
                      view.reveal.targetReveal.altText ??
                      view.reveal.targetVehicleLabel
                    }
                  />
                </div>
              )}
              {view.phase === "revealed" && can("advance-odd-piece") && (
                <Button
                  size="lg"
                  onClick={() => send("advance-odd-piece")}
                  disabled={!live}
                  data-testid="odd-piece-advance"
                >
                  {view.puzzleIndex + 1 === view.puzzleCount
                    ? "عرض النتيجة"
                    : "اللغز التالي"}
                </Button>
              )}
            </section>
          )}

        {view.phase === "completed" && view.result && (
          <section
            className="grid gap-3 sm:grid-cols-2"
            data-testid="odd-piece-recap"
          >
            {Object.entries(view.result.points).map(([teamId, points]) => (
              <div
                key={teamId}
                className="rounded-[var(--radius)] border p-5 text-center"
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

function OddPiecePhoneController({
  view,
  live,
  can,
  remainingMs,
  teamName,
  send,
}: {
  view: ReturnType<typeof readOddPieceView>;
  live: boolean;
  can: (action: string) => boolean;
  remainingMs?: number;
  teamName: (teamId?: string) => string;
  send: (
    commandType: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => void;
}) {
  const [selectedPieceId, setSelectedPieceId] = useState<string>();
  const [pending, setPending] = useState<"claim" | "submit">();
  // Released with the answer, so this is empty until the puzzle is terminal.
  const ownAttempt = view.attempts.find(
    (attempt) => attempt.teamId === view.actorTeamId,
  );
  /** The number the player sees on the shared board, from the same ordering. */
  const pieceNumber = (pieceId: string) =>
    view.pieces.findIndex((piece) => piece.id === pieceId) + 1;

  useEffect(() => {
    setSelectedPieceId(undefined);
    setPending(undefined);
  }, [view.phase, view.puzzleIndex, view.answerOwnerTeamId, view.attemptUsed]);

  const claim = () => {
    if (!live || pending || !view.canClaim || !can("claim-odd-piece")) return;
    setPending("claim");
    send("claim-odd-piece");
  };
  const submit = () => {
    if (
      !live ||
      pending ||
      !selectedPieceId ||
      !view.canSelect ||
      !can("submit-odd-piece")
    )
      return;
    setPending("submit");
    send("submit-odd-piece", { pieceId: selectedPieceId });
  };

  return (
    <ChallengeFrame
      compact
      title={
        view.phase === "completed"
          ? "انتهى التحدي"
          : `اللغز ${view.puzzleIndex + 1} من ${view.puzzleCount}`
      }
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.puzzleIndex + 1) / view.puzzleCount) * 100
      }
      aside={
        remainingMs !== undefined && view.phase === "open" ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 text-center"
        dir="rtl"
        data-testid="odd-piece-phone-controller"
      >
        {view.phase === "preparing" ? (
          <PhoneStatus testId="odd-piece-phone-preparing">
            شاهدوا الشاشة — نجهّز اللغز التالي…
          </PhoneStatus>
        ) : view.phase === "open" ? (
          <>
            <PhoneStatus testId="odd-piece-phone-open">
              {pending === "claim"
                ? "جارٍ تثبيت الحجز…"
                : view.canClaim && can("claim-odd-piece")
                  ? "عرفتوها؟ احجزوا أولاً"
                  : "شاهدوا الشاشة — بانتظار الحجز…"}
            </PhoneStatus>
            {view.canClaim && can("claim-odd-piece") && (
              <MobileActionArea>
                <Button
                  size="lg"
                  className="h-16 w-full text-lg font-black"
                  disabled={!live || Boolean(pending)}
                  onClick={claim}
                  data-testid="odd-piece-phone-claim"
                >
                  {pending === "claim" ? "جارٍ الحجز…" : "جاوب"}
                </Button>
              </MobileActionArea>
            )}
          </>
        ) : view.phase === "selecting" &&
          view.canSelect &&
          can("submit-odd-piece") ? (
          <>
            <p className="shrink-0 text-sm font-black text-muted-foreground">
              اختاروا رقم القطعة من الشاشة
            </p>
            <div
              className="grid flex-1 grid-cols-2 content-center gap-3"
              dir="ltr"
              data-testid="odd-piece-phone-piece-controls"
            >
              {view.pieces.map((piece, index) => (
                <Button
                  key={piece.id}
                  type="button"
                  variant="outline"
                  data-piece-id={piece.id}
                  data-selected={
                    selectedPieceId === piece.id ? "true" : "false"
                  }
                  className={cn(
                    "h-20 text-2xl font-black",
                    selectedPieceId === piece.id &&
                      "border-selected bg-selected-subtle text-selected",
                  )}
                  disabled={!live || Boolean(pending)}
                  onClick={() => setSelectedPieceId(piece.id)}
                  data-testid={`odd-piece-phone-select-${piece.id}`}
                >
                  {index + 1}
                </Button>
              ))}
            </div>
            <MobileActionArea>
              <Button
                size="lg"
                className="h-16 w-full text-lg font-black"
                disabled={!live || !selectedPieceId || Boolean(pending)}
                onClick={submit}
                data-testid="odd-piece-phone-submit"
              >
                {pending === "submit"
                  ? "جارٍ تثبيت الاختيار…"
                  : "تأكيد الاختيار"}
              </Button>
            </MobileActionArea>
          </>
        ) : view.phase === "selecting" ? (
          <PhoneStatus testId="odd-piece-phone-waiting">
            {view.attemptUsed
              ? "انتهت محاولة فريقكم — تابعوا الشاشة"
              : `${teamName(view.answerOwnerTeamId)} يختار الآن…`}
          </PhoneStatus>
        ) : view.phase === "revealed" ? (
          // Answer truth in the phone's own language: piece numbers.
          //
          // القطعة الدخيلة is played on images, and the two vehicle identities
          // and the proof photo stay on the shared screen — a phone here is a
          // numbered input surface, which is why the server strips image urls
          // from its pieces at all. The numbers carry the whole answer without
          // carrying any of that.
          <div data-testid="odd-piece-phone-resolved">
            <ResolutionReveal compact title="انكشفت القطعة الدخيلة">
              {ownAttempt && (
                <ResolutionAnswerRow label="اختياركم">
                  <span data-testid="odd-piece-phone-selected">
                    القطعة {pieceNumber(ownAttempt.pieceId)}
                  </span>
                </ResolutionAnswerRow>
              )}
              {view.reveal && (
                <ResolutionAnswerRow label="القطعة الدخيلة">
                  <span data-testid="odd-piece-phone-odd">
                    القطعة {pieceNumber(view.reveal.oddPieceId)}
                  </span>
                </ResolutionAnswerRow>
              )}
              <ResolutionOutcome>
                {ownAttempt
                  ? ownAttempt.correct
                    ? "إجابة صحيحة"
                    : "إجابة غير صحيحة"
                  : "انكشف الحل"}
              </ResolutionOutcome>
            </ResolutionReveal>
          </div>
        ) : (
          <PhoneStatus testId="odd-piece-phone-complete">
            انتهى التحدي — تابعوا النتيجة على الشاشة
          </PhoneStatus>
        )}
      </div>
    </ChallengeFrame>
  );
}

function PhoneStatus({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <p
      className="flex flex-1 items-center justify-center px-4 font-black text-muted-foreground"
      data-testid={testId}
    >
      {children}
    </p>
  );
}
