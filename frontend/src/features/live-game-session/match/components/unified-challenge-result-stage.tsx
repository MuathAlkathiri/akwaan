"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { getMediaUrl } from "@/lib/api/media-url";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import {
  continueFromChallengeResult,
  occurrenceLabel,
} from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { localizeMatchError } from "../errors/match-errors";
import { teamName } from "../presentation";
import {
  ChallengeResultActionContext,
  type ChallengeResultContinueAction,
} from "./challenge-result-banner";
import { RyoResultRecap } from "./ryo-result-recap";
import { ClosestResultRecap } from "./closest-result-recap";
import { Top5ResultReveal } from "./top5-result-reveal";
import { OneClueResultRecap } from "./one-clue-result-recap";
import { ComboResultRecap } from "./combo-result-recap";
import { MarhalaResultRecap } from "./marhala-result-recap";
import { OddPieceResultRecap } from "./odd-piece-result-recap";
import { LaqathaResultRecap } from "./laqatha-result-recap";
import { EkshifniResultRecap } from "./ekshifni-result-recap";
import { LaTahriqhaResultRecap } from "./la-tahriqha-result-recap";
import { FirstNoteResultRecap } from "./first-note-result-recap";
import { BombResultRecap } from "./bomb-result-recap";
import { RakkibhaResultRecap } from "./rakkibha-result-recap";
import { MovingXoResultRecap } from "./moving-xo-result-recap";
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
/** Mechanics whose recap renders `ChallengeWinnerBanner` directly on the canvas. */
const BANNER_RECAP_KEYS = new Set([
  "read-your-opponent",
  "closest",
  "bomb",
  "odd-piece",
  "ekshifni",
  "la-tahriqha",
  "first-note",
]);

/** Mechanics whose recap lays out its own cards without an outer surface wrapper. */
const CANVAS_RECAP_KEYS = new Set([...BANNER_RECAP_KEYS, "top-5"]);

export function UnifiedChallengeResultStage({
  actor,
  previewOnly = false,
}: {
  actor: MatchActor;
  /** Decorative explainer preview: shows the approved continue pill as an inert element. */
  previewOnly?: boolean;
}) {
  const { snapshot, resync } = useLiveSession();
  // Host surfaces only; see UnifiedBoard.
  const worlds = usePlayableWorlds(actor !== "participant");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [failedBannerUrl, setFailedBannerUrl] = useState<string>();
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

  const rawWorldImageUrl = worlds.data?.find(
    (world) => world.id === result.worldId,
  )?.banner?.url;
  const worldImageUrl = rawWorldImageUrl
    ? getMediaUrl(rawWorldImageUrl)
    : undefined;
  // The last position of the Match: continuing ends it rather than returning.
  const isFinalPosition =
    match.unified.board.completedPositionCount >=
    match.unified.board.totalPositionCount;
  const continueLabel = isFinalPosition ? "إنهاء المباراة" : "العودة إلى الأكوان";
  const usesCanvasLayout = CANVAS_RECAP_KEYS.has(result.challengeKey);
  const bannerOwnsContinue =
    BANNER_RECAP_KEYS.has(result.challengeKey) ||
    (previewOnly && result.challengeKey === "top-5");
  const continueAction: ChallengeResultContinueAction | null = previewOnly
    ? { label: continueLabel, inert: true }
    : actor === "controller"
      ? {
          label: continueLabel,
          disabled: pending,
          onClick: () => void advance(),
        }
      : null;

  const eyebrow = [occurrenceLabel(result.occurrenceIndex), result.worldName]
    .filter(Boolean)
    .join(" · ");
  const headerBadge =
    result.challengeKey === "top-5" && previewOnly
      ? "اكتمل الكشف"
      : "اكتمل التحدي";

  return (
    <div
      className="stage-center mx-auto flex w-full max-w-6xl flex-col gap-4"
      data-testid="unified-challenge-result"
    >
      <header
        data-testid="challenge-result-header"
        className="relative isolate flex flex-wrap items-center justify-between gap-x-6 gap-y-2 overflow-hidden rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] px-6 py-3.5 text-white"
      >
        {worldImageUrl && failedBannerUrl !== worldImageUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={worldImageUrl}
              alt=""
              aria-hidden
              onError={() => setFailedBannerUrl(worldImageUrl)}
              className="pointer-events-none absolute inset-y-0 start-0 h-full w-1/2 object-cover opacity-60"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-l from-[hsl(var(--brand-navy)/0.45)] via-[hsl(var(--brand-navy)/0.92)] to-[hsl(var(--brand-navy))]"
            />
          </>
        )}
        <div className="relative z-10 flex min-w-0 flex-col gap-0.5">
          {eyebrow && (
            <p className="truncate text-[15px] font-semibold text-[hsl(var(--brand-gold))]">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate font-display text-2xl font-extrabold leading-tight lg:text-[28px]">
            {result.challengeName ?? "نتيجة التحدي"}
          </h1>
        </div>
        <p className="relative z-10 inline-flex min-h-9 shrink-0 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-4 text-sm font-extrabold text-[hsl(var(--brand-navy))]">
          {headerBadge}
        </p>
      </header>

      <ChallengeResultActionContext.Provider
        value={bannerOwnsContinue ? continueAction : null}
      >
        {usesCanvasLayout ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <ChallengeResultBody result={result} previewOnly={previewOnly} />
          </div>
        ) : (
          <section className="surface-card p-4 sm:p-5">
            <ChallengeResultBody result={result} previewOnly={previewOnly} />
          </section>
        )}
      </ChallengeResultActionContext.Provider>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="font-bold">{error}</AlertDescription>
        </Alert>
      )}

      {!bannerOwnsContinue &&
        (continueAction ? (
          <div className="flex justify-center">
            <Button
              type="button"
              size="lg"
              disabled={continueAction.disabled}
              onClick={
                continueAction.inert ? undefined : continueAction.onClick
              }
              data-testid={
                continueAction.inert
                  ? "challenge-result-continue-preview"
                  : "challenge-result-continue"
              }
              className="h-auto min-h-[3.5rem] min-w-60 rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] px-8 font-display text-xl font-extrabold text-white shadow-[5px_6px_0_hsl(var(--brand-navy))] hover:-translate-y-0.5 hover:bg-[hsl(var(--brand-navy))]"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {continueAction.label}
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm font-bold text-muted-foreground">
            بانتظار المضيف للمتابعة…
          </p>
        ))}

      {bannerOwnsContinue && !continueAction && (
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
function ChallengeResultBody({
  result,
  previewOnly,
}: {
  result: MatchChallengeResult;
  previewOnly?: boolean;
}) {
  const { snapshot } = useLiveSession();
  if (!snapshot) return null;
  switch (result.challengeKey) {
    case "bomb":
      return <BombResultRecap result={result} snapshot={snapshot} />;
    case "rakkibha":
      return <RakkibhaResultRecap result={result} snapshot={snapshot} />;
    case "moving-xo":
      return <MovingXoResultRecap result={result} snapshot={snapshot} />;
    case "top-5":
      return (
        <Top5ResultReveal
          result={result}
          snapshot={snapshot}
          {...(previewOnly ? { stepMs: 0 } : {})}
        />
      );
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
    case "laqatha":
      return <LaqathaResultRecap result={result} snapshot={snapshot} />;
    case "ekshifni":
      return <EkshifniResultRecap result={result} snapshot={snapshot} />;
    case "la-tahriqha":
      return <LaTahriqhaResultRecap result={result} snapshot={snapshot} />;
    case "first-note":
      return <FirstNoteResultRecap result={result} snapshot={snapshot} />;
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
                /* A point is gold, whoever won it, and the team is a dot
                   beside it. Painting the whole chip in the team's colour
                   collided with the one meaning red already carries here —
                   wrong — so a red team winning a point read as a mistake.
                   Red and green say right and wrong; gold says a point moved;
                   a team's colour identifies, and never fills a surface. */
                <p
                  key={entry.teamId}
                  data-testid={`challenge-result-points-${entry.teamId}`}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border-2 border-brand-navy px-3 py-1 text-sm font-black text-brand-navy",
                    entry.points > 0 ? "bg-brand-gold" : "bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 rounded-full border border-brand-navy",
                      identity.dot,
                    )}
                  />
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
