"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import type { MatchActor } from "../match/types";
import { MarhalaQuestionImage } from "./marhala-screen";
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
