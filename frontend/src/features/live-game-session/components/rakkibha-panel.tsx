"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useLiveSessionClock } from "../hooks/live-session-clock-context";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import { MarhalaQuestionAudio, MarhalaQuestionImage } from "./marhala-screen";
import {
  parseRakkibhaCandidates,
  parseRakkibhaProgress,
  parseRakkibhaReference,
  remainingLockSeconds,
  remainingRaceSeconds,
  type RakkibhaMedia,
} from "../match/rakkibha.presentation";

function MediaView({ media }: { media: RakkibhaMedia }) {
  if (media.type === "image")
    return <MarhalaQuestionImage url={media.url} altText={media.altText} />;
  if (media.type === "audio") return <MarhalaQuestionAudio url={media.url} />;
  return <video controls src={media.url} className="w-full rounded-lg" />;
}

export function RakkibhaPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const nowMs = useLiveSessionClock();
  const [selected, setSelected] = useState("");
  const [sending, setSending] = useState(false);
  const state = runtime.modeState;
  const reference = useMemo(
    () => parseRakkibhaReference(state.myReferenceJson),
    [state.myReferenceJson],
  );
  const candidateView = useMemo(
    () => parseRakkibhaCandidates(state.myCandidatesJson),
    [state.myCandidatesJson],
  );
  const progress = useMemo(
    () => parseRakkibhaProgress(state.progressJson),
    [state.progressJson],
  );
  const teams = useMemo(
    () => new Map(snapshot?.teams.map((team) => [team.id, team.name]) ?? []),
    [snapshot?.teams],
  );
  const myTeamId = String(state.myTeamId ?? "");
  const mine = progress.find((entry) => entry.teamId === myTeamId);
  const lockSeconds = remainingLockSeconds(state.myLockUntil, nowMs);
  const raceSeconds = remainingRaceSeconds(state.deadlineAt, nowMs);
  const puzzleCount = Number(state.puzzleCount ?? 3);

  useEffect(() => {
    setSelected("");
    setSending(false);
  }, [state.contentItemId, state.phase, state.myLockUntil]);

  if (state.phase === "completed") {
    const result =
      typeof state.resultJson === "string"
        ? (JSON.parse(state.resultJson) as {
            winnerTeamId?: string;
            tie?: boolean;
          })
        : {};
    return (
      <ChallengeFrame compact title="انتهى التحدي" progressValue={100}>
        <div
          className="flex min-h-48 items-center justify-center text-center font-black"
          data-testid="rakkibha-phone-complete"
        >
          {result.tie
            ? "تعادل"
            : `الفائز: ${teams.get(String(result.winnerTeamId)) ?? "الفريق"}`}
        </div>
      </ChallengeFrame>
    );
  }

  const submit = () => {
    if (!selected || sending || lockSeconds > 0 || connection !== "connected")
      return;
    setSending(true);
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType: "submit-candidate",
      payload: {
        contentItemId: String(state.contentItemId ?? ""),
        localCandidateId: selected,
      },
    });
  };

  return (
    <ChallengeFrame
      compact
      title={`اللغز ${Number(state.puzzlePosition ?? 1)} من ${puzzleCount}`}
      progressValue={((mine?.solved ?? 0) / puzzleCount) * 100}
      aside={<ChallengeCountdown remainingMs={raceSeconds * 1000} />}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3"
        dir="rtl"
        data-testid="rakkibha-phone-controller"
      >
        <p className="shrink-0 text-center text-sm font-bold text-muted-foreground">
          {String(state.instruction ?? "")}
        </p>
        {reference && (
          <section
            data-testid="rakkibha-reference"
            dir="ltr"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden [&_img]:max-h-[48dvh] [&_img]:w-full [&_img]:object-contain [&_video]:max-h-[48dvh] [&_video]:object-contain"
          >
            <MediaView media={reference.media} />
            {reference.content && (
              <p dir="rtl" className="text-center font-bold">
                {reference.content}
              </p>
            )}
          </section>
        )}
        {candidateView && (
          <section
            data-testid="rakkibha-candidates"
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <p className="shrink-0 text-center text-sm font-black">
              قطعك الخاصة — اختر المطابقة
            </p>
            {/* One column on a phone, and rows that actually fill the height.
                The previous `grid-cols-2 content-center` halved an already
                narrow region and then left the leftover height empty, so a
                candidate rendered ~142×53 inside a 332×667 area. These pieces
                are the private content the player is matching against a
                teammate's description — they have to be the screen, not
                thumbnails on it. Two columns return once there is real width
                (landscape and up). `auto-rows-fr` gives every candidate an
                equal share of the height, so 2 and 3 candidates both fit
                without a magic number. */}
            <div
              className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2"
              dir="ltr"
            >
              {candidateView.candidates.map((candidate) => (
                <button
                  key={candidate.localId}
                  type="button"
                  aria-pressed={selected === candidate.localId}
                  onClick={() => setSelected(candidate.localId)}
                  disabled={lockSeconds > 0 || sending}
                  data-candidate-id={candidate.localId}
                  className="flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-xl border p-2 aria-pressed:border-selected aria-pressed:bg-selected-subtle aria-pressed:ring-2 aria-pressed:ring-selected [&_img]:max-h-full [&_img]:w-full [&_img]:object-contain [&_video]:max-h-full [&_video]:w-full [&_video]:object-contain"
                >
                  <MediaView media={candidate.media} />
                  {candidate.content && (
                    <p className="mt-2 text-sm font-bold">
                      {candidate.content}
                    </p>
                  )}
                </button>
              ))}
            </div>
            <MobileActionArea>
              <Button
                type="button"
                size="lg"
                className="h-14 w-full font-black"
                disabled={
                  !selected ||
                  sending ||
                  lockSeconds > 0 ||
                  connection !== "connected"
                }
                onClick={submit}
              >
                {sending ? "جارٍ تثبيت الاختيار…" : "إرسال القطعة"}
              </Button>
            </MobileActionArea>
          </section>
        )}
        {!candidateView && reference && (
          <p className="flex flex-1 items-center justify-center px-4 text-center font-bold text-muted-foreground">
            صف الشكل لزملائك. حامل القطعة المطابقة هو من يرسلها.
          </p>
        )}
        {lockSeconds > 0 && (
          <p
            role="alert"
            className="shrink-0 rounded-lg bg-destructive/10 p-3 text-center font-bold text-destructive"
          >
            اختيار غير صحيح — حاولوا بعد {lockSeconds}
          </p>
        )}
      </div>
    </ChallengeFrame>
  );
}
