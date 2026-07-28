"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bomb, Send, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMediaUrl } from "@/lib/api/media-url";
import { useLiveSession } from "../hooks/live-session-context";
import { useTeamClockDisplay } from "../hooks/use-team-clock-display";
import type { GameplayRuntimeSnapshot } from "../model";

function BombItemImage({
  url,
  altText,
}: {
  url: string;
  altText: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "unavailable">(
    url ? "loading" : "unavailable",
  );

  return (
    <div className="relative mx-auto flex aspect-video w-full max-w-2xl items-center justify-center overflow-hidden rounded-xl bg-muted">
      {state === "loading" && (
        <div
          role="status"
          className="absolute inset-0 flex animate-pulse items-center justify-center text-sm text-muted-foreground"
        >
          Loading image…
        </div>
      )}
      {url && state !== "unavailable" && (
        // The backend serves managed game media directly; bypassing Next's
        // optimizer keeps the resolved API-origin URL identical for all clients.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={altText}
          className={`h-full w-full object-contain transition-opacity ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setState("loaded")}
          onError={() => setState("unavailable")}
        />
      )}
      {state === "unavailable" && (
        <p role="status" className="p-6 text-center text-muted-foreground">
          The image for this Bomb item is unavailable.
        </p>
      )}
    </div>
  );
}

export function BombGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const [answer, setAnswer] = useState("");
  const answerInputRef = useRef<HTMLInputElement>(null);
  const expirySentFor = useRef<string>();
  const round = runtime.activeRound;
  const activeTeamId = runtime.activeTeamId ?? round?.activeTeamId;
  const clock = useTeamClockDisplay(activeTeamId ?? "");
  const canSubmit = runtime.availableActions.includes("mode:submit-answer");
  const canSkip = runtime.availableActions.includes("mode:skip");
  const canExpire = runtime.availableActions.includes("mode:expire-team");
  const phase = String(round?.modeState.phase ?? "");
  const resolvingExpiration =
    Boolean(round && activeTeamId) &&
    clock.expired &&
    phase === "presenting" &&
    !snapshot?.bombResult;
  const answerEnabled =
    canSubmit &&
    connection === "connected" &&
    phase === "presenting" &&
    snapshot?.status === "active" &&
    !resolvingExpiration;

  useEffect(() => {
    if (answerEnabled) {
      answerInputRef.current?.focus();
    }
  }, [answerEnabled, activeTeamId]);

  useEffect(() => {
    if (
      !round ||
      !activeTeamId ||
      !clock.expired ||
      !canExpire ||
      phase !== "presenting" ||
      expirySentFor.current === `${round.id}:${activeTeamId}`
    ) {
      return;
    }
    expirySentFor.current = `${round.id}:${activeTeamId}`;
    gameplayCommand("gameplay-command", {
      roundId: round.id,
      commandType: "expire-team",
      payload: {},
    });
  }, [
    activeTeamId,
    canExpire,
    clock.expired,
    gameplayCommand,
    phase,
    round,
  ]);

  if (!round) return null;
  if (snapshot?.bombResult) return null;
  const roundId = round.id;
  const prompt = runtime.prompt ?? String(round.modeState.prompt ?? "");
  const currentItemImage = {
    url: getMediaUrl(
      runtime.currentItem?.image.url ??
        String(round.modeState.imageUrl ?? ""),
    ),
    altText:
      runtime.currentItem?.image.altText?.trim() ||
      String(round.modeState.altText ?? "").trim() ||
      prompt,
  };
  const itemIndex =
    runtime.currentItem?.index ?? Number(round.modeState.itemIndex ?? 0);
  const itemCount =
    runtime.currentItem?.totalItems ?? Number(round.modeState.itemCount ?? 0);
  const activeTeam = snapshot?.teams.find((team) => team.id === activeTeamId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = answer.trim();
    if (!value || !canSubmit) return;
    gameplayCommand("gameplay-command", {
      roundId,
      commandType: "submit-answer",
      payload: { answer: value },
    });
    setAnswer("");
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          <Bomb className="size-5 text-destructive" aria-hidden />
          Bomb
        </h3>
        <p className="text-sm text-muted-foreground">
          Item {Math.min(itemIndex + 1, itemCount)} of {itemCount}
        </p>
      </header>
      <div className="space-y-2 text-center">
        <p className="text-2xl font-bold">{prompt}</p>
        <p className="text-sm text-muted-foreground">
          Active team: {activeTeam?.name ?? "—"}
        </p>
      </div>
      {phase === "presenting" ? (
        <BombItemImage
          key={currentItemImage.url}
          url={currentItemImage.url}
          altText={currentItemImage.altText}
        />
      ) : (
        <p className="rounded-lg bg-muted p-6 text-center font-medium">
          This Bomb question is complete. The host can complete the round and
          start the next question.
        </p>
      )}
      {resolvingExpiration && (
        <p
          role="status"
          className="rounded-lg bg-muted p-4 text-center font-medium"
        >
          Time is up. Resolving the Bomb result…
        </p>
      )}
      {(canSubmit || canSkip) &&
        phase === "presenting" &&
        !resolvingExpiration &&
        snapshot?.status === "active" && (
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <Input
            ref={answerInputRef}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Type your answer"
            aria-label="Bomb answer"
            autoComplete="off"
            disabled={!answerEnabled}
          />
          <Button
            type="submit"
            disabled={!canSubmit || !answer.trim() || connection !== "connected"}
          >
            <Send className="size-4" aria-hidden />
            Submit
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canSkip || connection !== "connected"}
            onClick={() =>
              gameplayCommand("gameplay-command", {
                roundId: round.id,
                commandType: "skip",
                payload: {},
              })
            }
          >
            <SkipForward className="size-4" aria-hidden />
            Skip (-5s)
          </Button>
        </form>
        )}
    </section>
  );
}
