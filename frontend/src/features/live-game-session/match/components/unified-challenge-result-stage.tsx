"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorldMedia } from "@/components/akwaan/world-media";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import {
  continueFromChallengeResult,
  occurrenceLabel,
} from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { localizeMatchError } from "../errors/match-errors";
import { teamName } from "../presentation";
import { RyoResultRecap } from "./ryo-result-recap";
import { ClosestResultRecap } from "./closest-result-recap";
import { Top5ResultReveal } from "./top5-result-reveal";
import { OneClueResultRecap } from "./one-clue-result-recap";
import { ComboResultRecap } from "./combo-result-recap";
import { MarhalaResultRecap } from "./marhala-result-recap";
import { OddPieceResultRecap } from "./odd-piece-result-recap";
import type { MatchActor, MatchChallengeResult } from "../types";

/**
 * The challenge result, as an authoritative Match stage.
 *
 * It is not a frontend interlude on top of a Match that has already gone back to
 * its board: the server is standing here too, the record is persisted, and a
 * refresh mid-reveal restores exactly this screen. Nothing on it is computed —
 * the winner, the points, and the reveal order were all decided server side.
 *
 * The host's continue button is the only thing that moves the Match on, and it
 * awards nothing, so pressing it twice is safe.
 */
export function UnifiedChallengeResultStage({ actor }: { actor: MatchActor }) {
  const { snapshot, resync } = useLiveSession();
  // Host surfaces only; see UnifiedBoard.
  const worlds = usePlayableWorlds(actor !== "participant");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  // Fixed per press, so a retry is a replay to the server rather than a second
  // command.
  const commandId = useRef<string>();

  const match = snapshot?.match;
  const result = match?.challengeResult;

  const advance = useCallback(async () => {
    if (!snapshot || !match || pending) return;
    setPending(true);
    setError(undefined);
    commandId.current ??= crypto.randomUUID();
    try {
      await continueFromChallengeResult({
        sessionId: snapshot.sessionId,
        expectedMatchRevision: match.revision,
        commandId: commandId.current,
      });
      commandId.current = undefined;
      resync?.();
    } catch (cause) {
      setError(localizeMatchError(cause).message);
    } finally {
      setPending(false);
    }
  }, [match, pending, resync, snapshot]);

  if (!snapshot || !match) return null;
  if (!result) {
    // The stage says there is a result and the projection does not carry one.
    // Showing the board instead would be showing something the server did not mean.
    return (
      <Alert
        role="alert"
        dir="rtl"
        data-testid="challenge-result-missing"
        className="mx-auto max-w-xl text-center"
      >
        <AlertTitle className="text-base font-black">
          تعذّر عرض نتيجة التحدي
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-sm">انتهى التحدي، لكن تفاصيل نتيجته لم تصل بعد.</p>
          <Button
            type="button"
            onClick={() => resync?.()}
            className="font-black"
          >
            <RefreshCw className="size-4" aria-hidden />
            تحديث النتيجة
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const worldImageUrl = worlds.data?.find(
    (world) => world.id === result.worldId,
  )?.banner?.url;
  // The last position of the Match: continuing ends it rather than returning.
  const isFinalPosition =
    match.unified.board.completedPositionCount >=
    match.unified.board.totalPositionCount;

  return (
    <div
      className="stage-center mx-auto max-w-5xl space-y-3.5"
      data-testid="unified-challenge-result"
    >
      <header className="surface-card overflow-hidden">
        <WorldMedia
          name={result.worldName ?? "عالم"}
          eyebrow={occurrenceLabel(result.occurrenceIndex)}
          variant="strip"
          {...(worldImageUrl ? { imageUrl: worldImageUrl } : {})}
          // A finished challenge is about its result, not its World: the strip
          // stays for identity and gives most of its height back to the record.
          className="rounded-none aspect-[16/2.4] sm:aspect-[16/2]"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5">
          <h1 className="text-lg font-black text-foreground sm:text-xl">
            {result.challengeName ?? "نتيجة التحدي"}
          </h1>
          <p className="text-xs font-bold text-muted-foreground">
            اكتمل التحدي
          </p>
        </div>
      </header>

      <section className="surface-card p-4 sm:p-5">
        <ChallengeResultBody result={result} />
      </section>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="font-bold">{error}</AlertDescription>
        </Alert>
      )}

      {actor === "controller" ? (
        <div className="flex justify-center">
          <Button
            type="button"
            size="lg"
            disabled={pending}
            onClick={() => void advance()}
            data-testid="challenge-result-continue"
            className="min-w-52 font-black"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {isFinalPosition ? "إنهاء المباراة" : "العودة إلى الأكوان"}
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm font-bold text-muted-foreground">
          بانتظار المضيف للمتابعة…
        </p>
      )}
    </div>
  );
}

/**
 * The mechanic's own result view, chosen by the key the server recorded.
 *
 * Same rule as the gameplay renderer: the runtime identity picks the screen, and
 * a mechanic this build has no result view for says so rather than rendering an
 * empty box.
 */
function ChallengeResultBody({ result }: { result: MatchChallengeResult }) {
  const { snapshot } = useLiveSession();
  if (!snapshot) return null;
  switch (result.challengeKey) {
    case "top-5":
      return <Top5ResultReveal result={result} snapshot={snapshot} />;
    case "read-your-opponent":
      return <RyoResultRecap result={result} snapshot={snapshot} />;
    case "closest":
      return <ClosestResultRecap result={result} snapshot={snapshot} />;
    case "one-clue":
      return <OneClueResultRecap result={result} snapshot={snapshot} />;
    case "combo":
      return <ComboResultRecap result={result} snapshot={snapshot} />;
    case "marhala":
      return <MarhalaResultRecap result={result} snapshot={snapshot} />;
    case "odd-piece":
      return <OddPieceResultRecap result={result} snapshot={snapshot} />;
    default:
      return (
        <div
          className="space-y-2 text-center"
          data-testid="generic-challenge-result"
        >
          <p className="text-2xl font-black text-foreground">
            {result.winnerTeamId
              ? `فوز ${teamName(snapshot, result.winnerTeamId)}`
              : "انتهى التحدي دون فائز"}
          </p>
          {result.matchPoints
            .filter((entry) => entry.points !== 0)
            .map((entry) => {
              const identity = teamIdentityOf(entry.teamId, snapshot.teams);
              return (
                <p
                  key={entry.teamId}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-black",
                    identity.surface,
                    identity.border,
                    identity.text,
                  )}
                >
                  {teamName(snapshot, entry.teamId)}
                  <span className="akwaan-numeral">
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </span>{" "}
                  نقطة للمباراة
                </p>
              );
            })}
        </div>
      );
  }
}
