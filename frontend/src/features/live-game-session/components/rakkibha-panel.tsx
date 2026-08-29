"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { useLiveSessionClock } from "../hooks/live-session-clock-context";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import { MarhalaQuestionAudio, MarhalaQuestionImage } from "./marhala-screen";
import {
  RAKKIBHA_CHALLENGE_NAME,
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
  const opponent = progress.find((entry) => entry.teamId !== myTeamId);
  const lockSeconds = remainingLockSeconds(state.myLockUntil, nowMs);
  const raceSeconds = remainingRaceSeconds(state.deadlineAt, nowMs);
  const puzzleCount = Number(state.puzzleCount ?? 3);

  if (state.phase === "completed") {
    const result =
      typeof state.resultJson === "string"
        ? (JSON.parse(state.resultJson) as {
            winnerTeamId?: string;
            tie?: boolean;
          })
        : {};
    return (
      <Card dir="rtl">
        <CardHeader>
          <CardTitle>{RAKKIBHA_CHALLENGE_NAME}</CardTitle>
        </CardHeader>
        <CardContent className="text-center font-black">
          {result.tie
            ? "تعادل"
            : `الفائز: ${teams.get(String(result.winnerTeamId)) ?? "الفريق"}`}
        </CardContent>
      </Card>
    );
  }

  const submit = () => {
    if (!selected || lockSeconds > 0 || connection !== "connected") return;
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType: "submit-candidate",
      payload: {
        contentItemId: String(state.contentItemId ?? ""),
        localCandidateId: selected,
      },
    });
    setSelected("");
  };

  return (
    <Card dir="rtl" className="overflow-hidden border-border">
      <CardHeader className="bg-muted/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {RAKKIBHA_CHALLENGE_NAME}
            </p>
            <CardTitle className="mt-1 text-xl">
              اللغز {Number(state.puzzlePosition ?? 1)} من {puzzleCount}
            </CardTitle>
          </div>
          <div className="flex gap-2">
            <ChallengeCountdown remainingMs={raceSeconds * 1000} />
            <Badge>
              فريقك: {mine?.solved ?? 0}/{puzzleCount}
            </Badge>
            <Badge variant="outline">
              الخصم: {opponent?.solved ?? 0}/{puzzleCount}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <p className="text-center font-bold">
          {String(state.instruction ?? "")}
        </p>
        {reference && (
          <section
            data-testid="rakkibha-reference"
            className="space-y-3 rounded-xl border border-warning/35 bg-warning-subtle p-4"
          >
            <p className="font-black">الشكل الناقص — لا تعرض شاشتك</p>
            <MediaView media={reference.media} />
            {reference.content && <p>{reference.content}</p>}
          </section>
        )}
        {candidateView && (
          <section data-testid="rakkibha-candidates" className="space-y-3">
            <p className="font-black">قطعك الخاصة — اختر المطابقة فقط</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {candidateView.candidates.map((candidate) => (
                <button
                  key={candidate.localId}
                  type="button"
                  aria-pressed={selected === candidate.localId}
                  onClick={() => setSelected(candidate.localId)}
                  disabled={lockSeconds > 0}
                  className="rounded-xl border p-2 aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary"
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
            <Button
              type="button"
              className="w-full"
              disabled={
                !selected || lockSeconds > 0 || connection !== "connected"
              }
              onClick={submit}
            >
              إرسال القطعة
            </Button>
          </section>
        )}
        {!candidateView && reference && (
          <p className="rounded-lg bg-muted p-4 text-center font-bold">
            صف الشكل لزملائك. حامل القطعة المطابقة هو من يرسلها.
          </p>
        )}
        {lockSeconds > 0 && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-4 text-center font-bold text-destructive"
          >
            اختيار غير صحيح — حاولوا بعد {lockSeconds}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
