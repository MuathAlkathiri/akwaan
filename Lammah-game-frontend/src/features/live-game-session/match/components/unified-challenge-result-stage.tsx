"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  continueFromChallengeResult,
  occurrenceLabel,
} from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { localizeMatchError } from "../errors/match-errors";
import { slotLabels, teamName } from "../presentation";
import { RyoResultRecap } from "./ryo-result-recap";
import { Top5ResultReveal } from "./top5-result-reveal";
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
      <section
        role="alert"
        dir="rtl"
        data-testid="challenge-result-missing"
        className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center"
      >
        <p className="text-base font-black text-slate-900">
          تعذّر عرض نتيجة التحدي
        </p>
        <p className="text-sm text-slate-600">
          المباراة في مرحلة النتيجة لكن الخادم لم يرسل تفاصيلها.
        </p>
        <Button type="button" onClick={() => resync?.()} className="rounded-xl font-black">
          <RefreshCw className="ml-1.5 size-4" aria-hidden />
          مزامنة المباراة
        </Button>
      </section>
    );
  }

  // The last position of the Match: continuing ends it rather than returning.
  const isFinalPosition =
    match.unified.board.completedPositionCount >=
    match.unified.board.totalPositionCount;

  return (
    <div className="space-y-5" data-testid="unified-challenge-result">
      <header className="rounded-2xl border border-black/[0.05] bg-white p-4">
        <p className="text-xs font-black text-primary">
          {occurrenceLabel(result.occurrenceIndex)}
          {result.worldName ? ` · ${result.worldName}` : ""}
          {` · ${slotLabels[result.slotKey]}`}
        </p>
        <h1 className="mt-0.5 text-xl font-black text-slate-900">
          {result.challengeName ?? "نتيجة التحدي"}
        </h1>
      </header>

      <section className="rounded-2xl border border-black/[0.05] bg-white p-5">
        <ChallengeResultBody result={result} />
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm font-bold text-destructive"
        >
          {error}
        </p>
      )}

      {actor === "controller" ? (
        <div className="flex justify-center">
          <Button
            type="button"
            size="lg"
            disabled={pending}
            onClick={() => void advance()}
            data-testid="challenge-result-continue"
            className="rounded-xl font-black"
          >
            <ArrowLeft className="ml-1.5 size-4" aria-hidden />
            {isFinalPosition ? "إنهاء المباراة" : "العودة إلى الأكوان"}
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
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
    default:
      return (
        <div className="space-y-2 text-center" data-testid="generic-challenge-result">
          <p className="text-2xl font-black text-slate-900">
            {result.winnerTeamId
              ? `🏆 فوز ${teamName(snapshot, result.winnerTeamId)}`
              : "انتهى التحدي دون فائز"}
          </p>
          {result.teamPoints
            .filter((entry) => entry.points !== 0)
            .map((entry) => (
              <p key={entry.teamId} className="text-sm font-bold text-slate-600">
                {teamName(snapshot, entry.teamId)}:{" "}
                {entry.points > 0 ? `+${entry.points}` : entry.points} نقطة
                للمباراة
              </p>
            ))}
        </div>
      );
  }
}
