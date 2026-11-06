"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot, LiveSessionSnapshot } from "../model";
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
  readOddPieceHotspotView,
} from "../match/odd-piece.presentation";

export function OddPieceGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection, presentationReadySocket } =
    useLiveSession();
  const view = useMemo(
    () => readOddPieceView(runtime.modeState),
    [runtime.modeState],
  );
  const hotspotView = useMemo(
    () => readOddPieceHotspotView(runtime.modeState),
    [runtime.modeState],
  );
  const isHotspot = runtime.mode.version === 2;
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);
  const remainingMs = useInteractionDeadline(
    isHotspot ? hotspotView.deadlineAt : view.deadlineAt,
    isHotspot
      ? hotspotView.phase !== "open" && hotspotView.phase !== "answering"
      : view.phase !== "open",
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

  if (isHotspot) {
    return (
      <OddPieceHotspotGameplayPanel
        runtime={runtime}
        actor={actor}
        view={hotspotView}
        snapshot={snapshot}
        live={live}
        remainingMs={remainingMs}
        teamName={teamName}
        send={send}
        presentationReadySocket={presentationReadySocket}
      />
    );
  }

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

type HotspotView = ReturnType<typeof readOddPieceHotspotView>;

function OddPieceHotspotGameplayPanel({
  runtime,
  actor,
  view,
  snapshot,
  live,
  remainingMs,
  teamName,
  send,
  presentationReadySocket,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
  view: HotspotView;
  snapshot?: LiveSessionSnapshot;
  live: boolean;
  remainingMs?: number;
  teamName: (teamId?: string) => string;
  send: (
    commandType: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => void;
  presentationReadySocket?: (input: {
    expectedSessionRevision: number;
    expectedRuntimeRevision: number;
    presentationGeneration?: number;
    presentationOutcome?:
      "ready" | "media-unavailable" | "autoplay-blocked" | "retry";
  }) => Promise<void>;
}) {
  const phone = actor === "participant";
  const reconnectPreparing =
    runtime.presentationSurface?.required === true &&
    runtime.presentationSurface.capability !== "shared";
  const preparing =
    (runtime.modeState as { awaitingPresentation?: boolean })
      .awaitingPresentation === true ||
    view.phase === "preparing" ||
    reconnectPreparing;
  const imageUrl =
    view.modifiedImage?.media.assets[0]?.url ??
    runtime.presentationSurface?.preloadImageUrl;

  if (preparing) {
    return (
      <HotspotPresentationGate
        runtime={runtime}
        snapshot={snapshot}
        imageUrl={imageUrl}
        phone={phone}
        presentationReadySocket={presentationReadySocket}
      />
    );
  }

  const title =
    view.phase === "completed"
      ? "نتيجة التحدي"
      : `اللغز ${view.puzzleIndex + 1} من ${view.puzzleCount}`;
  const image = view.modifiedImage;

  if (phone) {
    return (
      <OddPieceHotspotPhoneController
        view={view}
        title={title}
        image={image}
        live={live}
        remainingMs={remainingMs}
        teamName={teamName}
        send={send}
      />
    );
  }

  return (
    <ChallengeFrame
      eyebrow={ODD_PIECE_CHALLENGE_NAME}
      title={title}
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.puzzleIndex + 1) / view.puzzleCount) * 100
      }
      aside={
        remainingMs !== undefined &&
        (view.phase === "open" || view.phase === "answering") ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="mx-auto max-w-6xl"
    >
      <div className="space-y-4" dir="rtl" data-testid="odd-piece-v2-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-black" data-testid="odd-piece-v2-prompt">
            {view.prompt}
          </h2>
          {view.phase === "answering" && view.answerOwnerTeamId && (
            <span
              className="rounded-full bg-brand-gold/15 px-3 py-1 text-sm font-black"
              data-testid="odd-piece-v2-claim-owner"
            >
              {teamName(view.answerOwnerTeamId)} يحدد الآن
            </span>
          )}
        </div>
        {view.phase !== "revealed" &&
          view.phase !== "completed" &&
          (image ? (
            <HotspotImageSurface
              image={image}
              instruction={
                view.phase === "answering"
                  ? "يحدد الفريق صاحب الحجز القطعة الدخيلة من هاتفه"
                  : "كبّروا الصورة وحرّكوها للمناقشة"
              }
              onTap={() => undefined}
            />
          ) : (
            <p className="rounded-xl border border-warning/40 bg-warning-subtle p-5 text-center font-bold">
              الصورة غير متاحة حالياً
            </p>
          ))}
        {view.phase === "open" && (
          <p className="text-center font-black text-muted-foreground">
            مناقشة مفتوحة — أول فريق يحجز يبدأ نافذة الخمس ثواني.
          </p>
        )}
        {view.phase === "answering" && (
          <p className="text-center font-black text-muted-foreground">
            {teamName(view.answerOwnerTeamId)} لديه 5 ثوانٍ لتحديد الموضع.
          </p>
        )}
        {(view.phase === "revealed" || view.phase === "completed") &&
          view.reveal && <HotspotResolution view={view} teamName={teamName} />}
        {view.phase === "revealed" &&
          runtime.availableActions.includes(
            "mode:advance-odd-piece-hotspot",
          ) && (
            <Button
              type="button"
              className="mx-auto block font-black"
              onClick={() => send("advance-odd-piece-hotspot")}
              data-testid="odd-piece-v2-advance"
            >
              {view.puzzleIndex === view.puzzleCount - 1
                ? "عرض النتيجة النهائية"
                : "اللغز التالي"}
            </Button>
          )}
      </div>
    </ChallengeFrame>
  );
}

function HotspotPresentationGate({
  runtime,
  snapshot,
  imageUrl,
  phone,
  presentationReadySocket,
}: {
  runtime: GameplayRuntimeSnapshot;
  snapshot?: LiveSessionSnapshot;
  imageUrl?: string;
  phone: boolean;
  presentationReadySocket?: (input: {
    expectedSessionRevision: number;
    expectedRuntimeRevision: number;
    presentationGeneration?: number;
    presentationOutcome?:
      "ready" | "media-unavailable" | "autoplay-blocked" | "retry";
  }) => Promise<void>;
}) {
  const sentRef = useRef<string | null>(null);
  const [error, setError] = useState(false);
  const surface = runtime.presentationSurface;
  const key = `${runtime.revision}:${surface?.generation ?? "initial"}`;
  const acknowledge = (outcome?: "media-unavailable") => {
    if (!snapshot || !presentationReadySocket || surface?.required !== true)
      return;
    if (sentRef.current === key) return;
    sentRef.current = key;
    void presentationReadySocket({
      expectedSessionRevision: snapshot.revision,
      expectedRuntimeRevision: runtime.revision,
      ...(surface.generation !== undefined
        ? { presentationGeneration: surface.generation }
        : {}),
      ...(outcome ? { presentationOutcome: outcome } : {}),
    }).catch(() => {
      sentRef.current = null;
    });
  };
  return (
    <section
      className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center gap-4 p-4 text-center"
      dir="rtl"
      data-testid="odd-piece-v2-preparing"
    >
      {imageUrl && !error ? (
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-muted">
          <img
            src={imageUrl}
            alt=""
            className="block max-h-[58vh] w-full object-contain"
            onLoad={(event) => {
              const image = event.currentTarget;
              const decoded = image.decode ? image.decode() : Promise.resolve();
              void decoded
                .catch(() => undefined)
                .finally(() => {
                  window.requestAnimationFrame(() => acknowledge());
                });
            }}
            onError={() => {
              setError(true);
              if (!phone) acknowledge("media-unavailable");
            }}
            data-testid="odd-piece-v2-preload-image"
          />
        </div>
      ) : null}
      <p className="font-black text-muted-foreground">
        {error
          ? "تعذر تحميل الصورة — بانتظار إعادة المحاولة"
          : "نجهّز الصورة للجميع…"}
      </p>
    </section>
  );
}

function OddPieceHotspotPhoneController({
  view,
  title,
  image,
  live,
  remainingMs,
  teamName,
  send,
}: {
  view: HotspotView;
  title: string;
  image?: HotspotView["modifiedImage"];
  live: boolean;
  remainingMs?: number;
  teamName: (teamId?: string) => string;
  send: (
    commandType: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => void;
}) {
  const [pending, setPending] = useState<"claim" | "answer">();
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    setPending(undefined);
  }, [view.phase, view.puzzleIndex, view.answerOwnerTeamId, view.attemptUsed]);
  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
  }, [view.puzzleIndex]);
  const claim = () => {
    if (!live || pending || !view.canClaim) return;
    setPending("claim");
    send("claim-odd-piece-hotspot");
  };
  const answer = (point: { x: number; y: number }) => {
    if (!live || pending || !view.canAnswer) return;
    setPending("answer");
    send("submit-odd-piece-hotspot", point);
  };
  return (
    <ChallengeFrame
      compact
      title={title}
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.puzzleIndex + 1) / view.puzzleCount) * 100
      }
      aside={
        remainingMs !== undefined &&
        (view.phase === "open" || view.phase === "answering") ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 text-center"
        dir="rtl"
        data-testid="odd-piece-v2-phone"
      >
        {image && (
          <HotspotImageSurface
            image={image}
            instruction={
              view.canAnswer
                ? "اضغط على موضع القطعة الدخيلة"
                : "كبّر الصورة وحرّكها أثناء النقاش"
            }
            onTap={answer}
            transform={zoom}
            onTransformChange={setZoom}
            dataTestId="odd-piece-v2-phone-image"
          />
        )}
        {view.phase === "open" && (
          <MobileActionArea>
            <Button
              size="lg"
              className="h-14 w-full text-lg font-black"
              disabled={!live || !view.canClaim || Boolean(pending)}
              onClick={claim}
              data-testid="odd-piece-v2-phone-claim"
            >
              {pending === "claim" ? "جارٍ الحجز…" : "جاوب"}
            </Button>
          </MobileActionArea>
        )}
        {view.phase === "answering" && view.canAnswer && (
          <p className="font-black text-brand-gold">
            {teamName(view.answerOwnerTeamId)} — حدّدوا الآن
          </p>
        )}
        {view.phase === "answering" && !view.canAnswer && (
          <PhoneStatus testId="odd-piece-v2-phone-waiting">
            {teamName(view.answerOwnerTeamId)} يحدد الآن…
          </PhoneStatus>
        )}
        {(view.phase === "revealed" || view.phase === "completed") &&
          view.reveal && (
            <HotspotResolution view={view} teamName={teamName} compact />
          )}
        {view.phase === "completed" && !view.reveal && (
          <PhoneStatus testId="odd-piece-v2-phone-complete">
            انتهى التحدي — تابعوا النتيجة على الشاشة
          </PhoneStatus>
        )}
      </div>
    </ChallengeFrame>
  );
}

function HotspotResolution({
  view,
  teamName,
  compact = false,
}: {
  view: HotspotView;
  teamName: (teamId?: string) => string;
  compact?: boolean;
}) {
  const result = view.result;
  const reveal = view.reveal;
  const modifiedImage = view.modifiedImage;
  const originalImage = reveal?.originalImage;
  const hotspot = reveal?.hotspot;
  const modifiedImageUrl = modifiedImage?.media.assets[0]?.url;
  const originalImageUrl = originalImage?.media.assets[0]?.url;

  const [mode, setMode] = useState<"modified" | "original" | "split">(
    "modified",
  );

  useEffect(() => {
    setMode("modified");
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) return;
    const transition = window.setTimeout(
      () => setMode(compact ? "original" : "split"),
      2200,
    );
    return () => window.clearTimeout(transition);
  }, [compact, originalImageUrl, modifiedImageUrl]);

  const hotspotCenter = useMemo(() => {
    if (!hotspot?.polygon || hotspot.polygon.length === 0)
      return { x: 0.5, y: 0.5 };
    const sum = hotspot.polygon.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / hotspot.polygon.length,
      y: sum.y / hotspot.polygon.length,
    };
  }, [hotspot]);

  const hotspotOverlay = (
    <>
      {hotspot?.polygon && hotspot.polygon.length >= 3 && (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          data-testid="odd-piece-v2-reveal-hotspot-svg"
        >
          <polygon
            points={hotspot.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(239, 68, 68, 0.35)"
            stroke="rgb(239, 68, 68)"
            strokeWidth={0.007}
            className="animate-pulse"
            data-testid="odd-piece-v2-reveal-hotspot-polygon"
          />
        </svg>
      )}
      {reveal && (
        <div
          className="absolute -translate-x-1/2 -translate-y-full transform z-10 pointer-events-none"
          style={{
            left: `${hotspotCenter.x * 100}%`,
            top: `${Math.max(10, hotspotCenter.y * 100 - 4)}%`,
          }}
          data-testid="odd-piece-v2-reveal-hotspot-pin"
        >
          <div className="flex items-center gap-1.5 rounded-full bg-rose-600/95 px-3 py-1 text-xs font-black text-white shadow-lg ring-2 ring-white">
            <span className="size-2 rounded-full bg-white animate-ping" />
            <span>القطعة الدخيلة: {reveal.intruderPartLabel}</span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <section
      className={cn(
        "space-y-4 rounded-2xl border p-4 text-center",
        compact && "p-3 space-y-3",
      )}
      data-testid="odd-piece-v2-resolution"
    >
      {/* Comparison mode controls */}
      <div
        className="flex flex-wrap items-center justify-center gap-2"
        data-testid="odd-piece-v2-comparison-controls"
      >
        <Button
          type="button"
          size="sm"
          variant={mode === "modified" ? "default" : "outline"}
          onClick={() => setMode("modified")}
          className="text-xs font-bold"
          data-testid="odd-piece-v2-toggle-modified"
        >
          🔍 الصورة المعدّلة (مع موضع الحل)
        </Button>
        {originalImage && (
          <Button
            type="button"
            size="sm"
            variant={mode === "original" ? "default" : "outline"}
            onClick={() => setMode("original")}
            className="text-xs font-bold"
            data-testid="odd-piece-v2-toggle-original"
          >
            ✨ الصورة الأصلية (بدون تعديل)
          </Button>
        )}
        {!compact && originalImage && (
          <Button
            type="button"
            size="sm"
            variant={mode === "split" ? "default" : "outline"}
            onClick={() => setMode("split")}
            className="text-xs font-bold"
            data-testid="odd-piece-v2-toggle-split"
          >
            ⚖️ مقارنة جنباً إلى جنب
          </Button>
        )}
      </div>

      {/* Image comparison viewport */}
      {mode === "split" && !compact && originalImage && modifiedImage ? (
        <div
          className="grid grid-cols-2 gap-3"
          data-testid="odd-piece-v2-split-comparison"
        >
          <div className="space-y-1">
            <p className="text-xs font-black text-rose-600 dark:text-rose-400">
              الصورة المعدلة (موضع القطعة الدخيلة)
            </p>
            <HotspotImageSurface
              image={modifiedImage}
              instruction="القطعة الدخيلة محددة باللون الأحمر"
              onTap={() => undefined}
              overlay={hotspotOverlay}
              dataTestId="odd-piece-v2-modified-reveal"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-black text-brand-gold">
              الصورة الأصلية (قبل التعديل)
            </p>
            <HotspotImageSurface
              image={originalImage}
              instruction="السيارة الأصلية الحقيقية"
              onTap={() => undefined}
              dataTestId="odd-piece-v2-original-reveal"
            />
          </div>
        </div>
      ) : mode === "original" && originalImage ? (
        <div className="space-y-1">
          <p className="text-xs font-black text-brand-gold">
            السيارة الأصلية: {reveal?.targetVehicleLabel}
          </p>
          <HotspotImageSurface
            image={originalImage}
            instruction="الصورة الأصلية — بدون أي تعديل"
            onTap={() => undefined}
            dataTestId="odd-piece-v2-original-reveal"
          />
        </div>
      ) : modifiedImage ? (
        <div className="space-y-1">
          <p className="text-xs font-black text-rose-600 dark:text-rose-400">
            القطعة الدخيلة محددة على الصورة المعدّلة
          </p>
          <HotspotImageSurface
            image={modifiedImage}
            instruction="انكشف الحل — القطعة الدخيلة محددة بالإطار الأحمر"
            onTap={() => undefined}
            overlay={hotspotOverlay}
            dataTestId="odd-piece-v2-modified-reveal"
          />
        </div>
      ) : null}

      {/* Answer & Vehicles Recap */}
      <div
        className="rounded-xl border border-brand-gold/40 bg-brand-gold/10 p-3 sm:p-4 text-center space-y-2"
        data-testid="odd-piece-v2-solution-recap"
      >
        <p className="font-black text-base text-brand-gold">
          القطعة الدخيلة:{" "}
          <span className="underline decoration-rose-500 underline-offset-4">
            {reveal?.intruderPartLabel}
          </span>
        </p>
        <p className="text-xs sm:text-sm font-bold text-muted-foreground">
          السيارة الهدف:{" "}
          <span className="text-foreground">{reveal?.targetVehicleLabel}</span>{" "}
          مقابل السيارة الدخيلة:{" "}
          <span className="text-foreground">
            {reveal?.intruderVehicleLabel}
          </span>
        </p>

        {/* Attempts breakdown */}
        <div className="flex flex-col items-center gap-1.5 pt-1 text-xs sm:text-sm">
          {view.attempts.map((attempt, index) => (
            <div
              key={`${attempt.teamId}-${index}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1 font-bold",
                attempt.correct
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20",
              )}
            >
              <span>{teamName(attempt.teamId)}:</span>
              <span>
                {attempt.correct
                  ? "إجابة صحيحة (+1 نقطة)"
                  : attempt.outcome === "timeout"
                    ? "انتهى الوقت (5 ثوانٍ)"
                    : "إجابة غير صحيحة"}
              </span>
            </div>
          ))}
          {view.attempts.length === 0 && (
            <p className="text-xs text-muted-foreground font-bold">
              لم يضغط أي فريق على «جاوب» في نافذة المناقشة
            </p>
          )}
        </div>

        {/* Overall Points and Challenge result */}
        {result && (
          <div className="pt-2 border-t border-border/40 space-y-1">
            <p className="font-black text-sm text-brand-gold">
              {result.tie
                ? "تعادل في النتيجة"
                : `المتصدر: ${teamName(result.winnerTeamId ?? undefined)}`}
            </p>
            <div className="flex justify-center gap-3 text-xs sm:text-sm font-black">
              {Object.entries(result.points).map(([teamId, points]) => (
                <span
                  key={teamId}
                  className="rounded-md bg-background/80 px-2.5 py-1 border border-border"
                >
                  {teamName(teamId)}: {points} {points === 1 ? "نقطة" : "نقاط"}
                </span>
              ))}
            </div>
            {!result.tie && (
              <p
                className="text-xs font-black text-emerald-700 dark:text-emerald-300"
                data-testid="odd-piece-v2-mechanic-point"
              >
                مكافأة الميكانيك: +1 نقطة للغز للفريق الفائز
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function HotspotImageSurface({
  image,
  instruction,
  onTap,
  transform: controlledTransform,
  onTransformChange,
  dataTestId,
  overlay,
}: {
  image: NonNullable<HotspotView["modifiedImage"]>;
  instruction: string;
  onTap: (point: { x: number; y: number }) => void;
  transform?: { scale: number; x: number; y: number };
  onTransformChange?: (value: { scale: number; x: number; y: number }) => void;
  dataTestId?: string;
  overlay?: React.ReactNode;
}) {
  const [local, setLocal] = useState({ scale: 1, x: 0, y: 0 });
  const transform = controlledTransform ?? local;
  const setTransform = onTransformChange ?? setLocal;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number; moved: boolean }>();
  const pinch = useRef<{ distance: number; scale: number }>();
  const pointerTapAt = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const reset = () => setTransform({ scale: 1, x: 0, y: 0 });
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const pointFromClient = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return undefined;
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const baseX =
      center.x + (clientX - center.x - transform.x) / transform.scale;
    const baseY =
      center.y + (clientY - center.y - transform.y) / transform.scale;
    const imageRatio = image.width / image.height;
    const boxRatio = box.width / box.height;
    const rendered =
      imageRatio > boxRatio
        ? {
            width: box.width,
            height: box.width / imageRatio,
            left: box.left,
            top: center.y - box.width / imageRatio / 2,
          }
        : {
            width: box.height * imageRatio,
            height: box.height,
            left: center.x - (box.height * imageRatio) / 2,
            top: box.top,
          };
    if (
      baseX < rendered.left ||
      baseX > rendered.left + rendered.width ||
      baseY < rendered.top ||
      baseY > rendered.top + rendered.height
    )
      return undefined;
    return {
      x: Math.min(1, Math.max(0, (baseX - rendered.left) / rendered.width)),
      y: Math.min(1, Math.max(0, (baseY - rendered.top) / rendered.height)),
    };
  };
  const pointFromOffset = (event: {
    currentTarget: HTMLDivElement;
    nativeEvent: { offsetX?: number; offsetY?: number };
  }) => {
    const width = event.currentTarget.clientWidth;
    const height = event.currentTarget.clientHeight;
    const x = event.nativeEvent.offsetX;
    const y = event.nativeEvent.offsetY;
    if (!width || !height || !Number.isFinite(x) || !Number.isFinite(y))
      return undefined;
    const offsetX = Number(x);
    const offsetY = Number(y);
    return {
      x: Math.min(1, Math.max(0, offsetX / width)),
      y: Math.min(1, Math.max(0, offsetY / height)),
    };
  };
  return (
    <div className="space-y-2">
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden rounded-2xl border bg-black/80"
        style={{
          aspectRatio: `${image.width}/${image.height}`,
          touchAction: "none",
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          if (pointers.current.size === 1)
            start.current = {
              x: event.clientX,
              y: event.clientY,
              moved: false,
            };
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = {
              distance: distance(a, b),
              scale: transform.scale,
            };
            if (start.current) start.current.moved = true;
          }
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          if (pointers.current.size >= 2 && pinch.current) {
            if (start.current) start.current.moved = true;
            const [a, b] = [...pointers.current.values()];
            const nextScale = Math.min(
              4,
              Math.max(
                1,
                pinch.current.scale * (distance(a, b) / pinch.current.distance),
              ),
            );
            setTransform({ ...transform, scale: nextScale });
            return;
          }
          if (pointers.current.size === 1 && start.current) {
            const last = pointers.current.get(event.pointerId)!;
            const dx = last.x - start.current.x;
            const dy = last.y - start.current.y;
            if (Math.hypot(dx, dy) > 6) start.current.moved = true;
            if (transform.scale > 1)
              setTransform({ ...transform, x: dx, y: dy });
          }
        }}
        onPointerUp={(event) => {
          const wasSingle = pointers.current.size === 1;
          const moved = start.current?.moved === true;
          pointers.current.delete(event.pointerId);
          pinch.current = undefined;
          if (wasSingle && !moved) {
            const clientX = Number.isFinite(event.clientX)
              ? event.clientX
              : start.current?.x;
            const clientY = Number.isFinite(event.clientY)
              ? event.clientY
              : start.current?.y;
            const point =
              typeof clientX === "number" &&
              typeof clientY === "number" &&
              Number.isFinite(clientX) &&
              Number.isFinite(clientY)
                ? pointFromClient(clientX, clientY)
                : pointFromOffset(event);
            if (point) {
              pointerTapAt.current = Date.now();
              onTap(point);
            }
          }
          start.current = undefined;
        }}
        onClick={(event) => {
          if (Date.now() - pointerTapAt.current < 500) return;
          const hasClientCoordinates =
            Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
          const point = hasClientCoordinates
            ? pointFromClient(event.clientX, event.clientY)
            : pointFromOffset(event);
          if (point) {
            pointerTapAt.current = Date.now();
            onTap(point);
          }
        }}
        onPointerCancel={() => {
          pointers.current.clear();
          pinch.current = undefined;
          start.current = undefined;
        }}
        data-testid={dataTestId ?? "odd-piece-v2-image"}
      >
        <img
          src={image.media.assets[0].url}
          alt=""
          draggable={false}
          className="absolute inset-0 block h-full w-full select-none object-contain"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "center",
          }}
        />
        {overlay && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "center",
            }}
          >
            {overlay}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
        <span>{instruction}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          data-testid="odd-piece-v2-reset-zoom"
        >
          إعادة ضبط
        </Button>
      </div>
    </div>
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
