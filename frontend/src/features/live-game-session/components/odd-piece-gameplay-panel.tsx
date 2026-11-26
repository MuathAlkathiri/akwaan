"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { countdownThresholdsForWindow } from "../match/components/countdown-urgency";

const GOLD_ACTION =
  "inline-flex min-h-[60px] items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-7 font-display text-xl font-black text-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))] disabled:shadow-none";
const TEAM_ROW =
  "flex items-center justify-between gap-2.5 rounded-[18px] border-[3px] border-[hsl(var(--brand-navy))] px-4 py-3.5";
const TOGGLE =
  "inline-flex min-h-9 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-4 text-sm font-bold";
const TOGGLE_ON = "bg-[hsl(var(--brand-gold))]";

/** «نقطة», «نقطتين», «3 نقاط» — never «2 نقاط». */
function pointsLabel(count: number) {
  if (count === 1) return "نقطة";
  if (count === 2) return "نقطتين";
  if (count >= 3 && count <= 10) return `${count} نقاط`;
  return `${count} نقطة`;
}

/** The hotspot answer window is five seconds. */
const ODD_PIECE_ANSWER_THRESHOLDS = countdownThresholdsForWindow(5);
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot, LiveSessionSnapshot } from "../model";
import type { MatchActor } from "../match/types";
import {
  ODD_PIECE_CHALLENGE_NAME,
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
    () => readOddPieceHotspotView(runtime.modeState),
    [runtime.modeState],
  );
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase !== "open" && view.phase !== "answering",
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

  return (
    <OddPieceHotspotGameplayPanel
      runtime={runtime}
      actor={actor}
      view={view}
      snapshot={snapshot}
      live={connection === "connected"}
      remainingMs={remainingMs}
      teamName={teamName}
      send={send}
      presentationReadySocket={presentationReadySocket}
    />
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
  const context = useChallengeContext();
  const dotOf = (teamId: string) =>
    teamIdentityOf(teamId, snapshot?.teams ?? []).dot;
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

  const step = `الصورة ${view.puzzleIndex + 1} من ${view.puzzleCount}`;
  const title = view.phase === "completed" ? "نتيجة التحدي" : step;
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
        dotOf={dotOf}
        send={send}
      />
    );
  }

  const revealed = view.phase === "revealed" || view.phase === "completed";
  const teamIds = (snapshot?.teams ?? [])
    .filter((team) => team.active !== false)
    .map((team) => team.id);
  const statusOf = (teamId: string) => {
    if (view.phase === "answering") {
      if (teamId === view.answerOwnerTeamId) return "يلمسون الحين";
      return view.attempts.some((attempt) => attempt.teamId === teamId)
        ? "راحت فرصتهم"
        : "ينتظرون";
    }
    return "يتناقشون…";
  };

  return (
    <section
      dir="rtl"
      data-testid="odd-piece-v2-panel"
      className="flex flex-col gap-[18px] text-[hsl(var(--brand-navy))]"
    >
      <ChallengeContextStrip
        {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
        title={context.title ?? ODD_PIECE_CHALLENGE_NAME}
        aside={
          <span className="inline-flex min-h-9 items-center whitespace-nowrap rounded-full bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))]">
            {revealed ? `الكشف · ${step}` : step}
          </span>
        }
      />

      {revealed && view.reveal ? (
        <HotspotResolution
          view={view}
          teamName={teamName}
          dotOf={dotOf}
          teamIds={teamIds}
          footer={
            view.phase === "revealed" &&
            runtime.availableActions.includes(
              "mode:advance-odd-piece-hotspot",
            ) ? (
              <button
                type="button"
                className={GOLD_ACTION}
                onClick={() => send("advance-odd-piece-hotspot")}
                data-testid="odd-piece-v2-advance"
              >
                {view.puzzleIndex === view.puzzleCount - 1
                  ? "نشوف النتيجة"
                  : "الصورة الجاية"}
              </button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <main className="flex items-center rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-4 shadow-[7px_8px_0_hsl(var(--brand-navy))]">
            {image ? (
              <div className="w-full">
                <HotspotImageSurface image={image} onTap={() => undefined} />
              </div>
            ) : (
              <p className="w-full rounded-[20px] border-2 border-dashed border-brand-dash bg-brand-wash p-10 text-center text-lg font-bold">
                الصورة مو متوفرة الحين
              </p>
            )}
          </main>

          <aside className="flex flex-col gap-3.5">
            <div className="flex flex-col items-center gap-3 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-5 text-center">
              {remainingMs !== undefined &&
                (view.phase === "open" || view.phase === "answering") && (
                  <ChallengeCountdown
                    remainingMs={remainingMs}
                    {...(view.phase === "answering"
                      ? { thresholds: ODD_PIECE_ANSWER_THRESHOLDS }
                      : {})}
                  />
                )}
              <h2
                className="font-display text-2xl font-black"
                data-testid="odd-piece-v2-prompt"
              >
                {view.prompt}
              </h2>
              <p className="text-base leading-[1.7] text-brand-slate">
                {view.phase === "answering"
                  ? "عندهم 5 ثواني يلمسون فيها القطعة من الجوال. أول لمسة هي الإجابة."
                  : "في الصورة قطعة مو منها. تناقشوا، وأول فريق يضغط «جاوب» ياخذ الفرصة."}
              </p>
            </div>

            {teamIds.map((teamId) => {
              const owner =
                view.phase === "answering" && teamId === view.answerOwnerTeamId;
              return (
                <div
                  key={teamId}
                  {...(owner
                    ? { "data-testid": "odd-piece-v2-claim-owner" }
                    : {})}
                  className={cn(
                    TEAM_ROW,
                    owner
                      ? "bg-[hsl(var(--brand-gold))] shadow-[4px_5px_0_hsl(var(--brand-navy))]"
                      : "bg-white",
                  )}
                >
                  <span className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
                    <TeamDot className={dotOf(teamId)} />
                    {teamName(teamId)}
                  </span>
                  <span className="text-[15px] font-bold">
                    {statusOf(teamId)}
                  </span>
                </div>
              );
            })}

            <p className="text-center text-sm text-brand-slate">
              {view.phase === "answering"
                ? "لو ما صابوها، الفرصة تروح للفريق الثاني."
                : "الصورة نفسها في جوالاتكم، وتقدرون تكبّرونها."}
            </p>
          </aside>
        </div>
      )}
    </section>
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
        <div className="w-full max-w-2xl overflow-hidden rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-wash">
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
      <p className="text-lg font-bold text-brand-slate">
        {error
          ? "ما قدرنا نحمّل الصورة. نحاول مرة ثانية…"
          : "نجهّز الصورة للكل…"}
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
  dotOf,
  send,
}: {
  view: HotspotView;
  title: string;
  image?: HotspotView["modifiedImage"];
  live: boolean;
  remainingMs?: number;
  teamName: (teamId?: string) => string;
  dotOf: (teamId: string) => string;
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
  const tapping = view.phase === "answering" && view.canAnswer;
  const seconds =
    remainingMs !== undefined ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;
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
        !tapping &&
        (view.phase === "open" || view.phase === "answering") ? (
          <ChallengeCountdown
            remainingMs={remainingMs}
            {...(view.phase === "answering"
              ? { thresholds: ODD_PIECE_ANSWER_THRESHOLDS }
              : {})}
          />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3.5 text-center text-[hsl(var(--brand-navy))]"
        dir="rtl"
        data-testid="odd-piece-v2-phone"
      >
        {tapping && (
          <div
            className="flex items-center justify-between gap-2.5 rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 py-2.5"
            data-testid="odd-piece-v2-phone-tap-bar"
          >
            <span className="font-display text-xl font-black">
              المس القطعة الدخيلة
            </span>
            <span
              role="timer"
              aria-label={`باقي ${seconds} ثواني`}
              dir="ltr"
              className="akwaan-numeral text-3xl font-bold leading-none"
            >
              {seconds} ث
            </span>
          </div>
        )}
        {image &&
          !(view.phase === "revealed" || view.phase === "completed") && (
            <HotspotImageSurface
              image={image}
              instruction={tapping ? "" : "كبّر الصورة بإصبعين"}
              onTap={answer}
              transform={zoom}
              onTransformChange={setZoom}
              dataTestId="odd-piece-v2-phone-image"
            />
          )}
        {tapping && (
          <p className="text-[17px] font-bold leading-[1.7]">
            {pending === "answer"
              ? "وصلت لمستكم…"
              : "أول لمسة هي إجابتكم، وما تنعاد."}
          </p>
        )}
        {view.phase === "open" && (
          <>
            <p className="text-sm leading-[1.7] text-brand-slate">
              {view.canClaim
                ? "لقيتوها؟ اضغط «جاوب» قبل الخصم. بعدها عندك 5 ثواني تلمس فيها القطعة."
                : "راحت فرصتكم في هالصورة."}
            </p>
            <MobileActionArea>
              <button
                type="button"
                className={cn(GOLD_ACTION, "min-h-[84px] w-full text-[30px]")}
                disabled={!live || !view.canClaim || Boolean(pending)}
                onClick={claim}
                data-testid="odd-piece-v2-phone-claim"
              >
                {pending === "claim" ? "نحجزها…" : "جاوب"}
              </button>
            </MobileActionArea>
          </>
        )}
        {view.phase === "answering" && !view.canAnswer && (
          <PhoneStatus testId="odd-piece-v2-phone-waiting">
            {teamName(view.answerOwnerTeamId)} يلمسون الحين…
          </PhoneStatus>
        )}
        {(view.phase === "revealed" || view.phase === "completed") &&
          view.reveal && (
            <HotspotResolution
              view={view}
              teamName={teamName}
              dotOf={dotOf}
              teamIds={Object.keys(view.result?.points ?? {})}
              compact
            />
          )}
        {view.phase === "completed" && !view.reveal && (
          <PhoneStatus testId="odd-piece-v2-phone-complete">
            خلص التحدي. شوفوا النتيجة على الشاشة.
          </PhoneStatus>
        )}
      </div>
    </ChallengeFrame>
  );
}

function HotspotResolution({
  view,
  teamName,
  dotOf,
  teamIds,
  compact = false,
  footer,
}: {
  view: HotspotView;
  teamName: (teamId?: string) => string;
  dotOf: (teamId: string) => string;
  teamIds: string[];
  compact?: boolean;
  /** What the shared screen puts under the summary: the way onward. */
  footer?: React.ReactNode;
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

  const ring = useMemo(() => {
    const polygon = hotspot?.polygon ?? [];
    if (polygon.length < 3) return undefined;
    const reach = Math.max(
      ...polygon.map((point) => Math.abs(point.x - hotspotCenter.x)),
    );
    return Math.min(0.5, Math.max(0.12, reach * 2 + 0.05));
  }, [hotspot, hotspotCenter]);

  // The foreign part: a gold ring, with the rest of the picture dimmed.
  const hotspotOverlay = ring ? (
    <span
      aria-hidden
      className="absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-[hsl(var(--brand-gold))] shadow-[0_0_0_9999px_rgba(27,23,59,0.28)] outline outline-[3px] outline-[hsl(var(--brand-navy))]"
      style={{
        left: `${hotspotCenter.x * 100}%`,
        top: `${hotspotCenter.y * 100}%`,
        width: `${ring * 100}%`,
      }}
      data-testid="odd-piece-v2-reveal-hotspot-pin"
    />
  ) : null;

  const attemptOf = (teamId: string) =>
    view.attempts.find((attempt) => attempt.teamId === teamId);
  const rows = teamIds.length
    ? teamIds
    : [...new Set(view.attempts.map((attempt) => attempt.teamId))];

  const pictures =
    mode === "split" && !compact && originalImage && modifiedImage ? (
      <div
        className="grid w-full grid-cols-2 gap-3.5"
        data-testid="odd-piece-v2-split-comparison"
      >
        <div className="flex flex-col gap-2">
          <p className="text-base font-extrabold">المعدّلة</p>
          <HotspotImageSurface
            image={modifiedImage}
            onTap={() => undefined}
            overlay={hotspotOverlay}
            dataTestId="odd-piece-v2-modified-reveal"
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-base font-extrabold">الأصلية</p>
          <HotspotImageSurface
            image={originalImage}
            onTap={() => undefined}
            dataTestId="odd-piece-v2-original-reveal"
          />
        </div>
      </div>
    ) : mode === "original" && originalImage ? (
      <div className="flex w-full flex-col gap-2">
        <p className="text-base font-extrabold">الأصلية</p>
        <HotspotImageSurface
          image={originalImage}
          onTap={() => undefined}
          dataTestId="odd-piece-v2-original-reveal"
        />
      </div>
    ) : modifiedImage ? (
      <div className="flex w-full flex-col gap-2">
        <p className="text-base font-extrabold">المعدّلة</p>
        <HotspotImageSurface
          image={modifiedImage}
          onTap={() => undefined}
          overlay={hotspotOverlay}
          dataTestId="odd-piece-v2-modified-reveal"
        />
      </div>
    ) : null;

  const summary = (
    <>
      <div
        className="flex flex-col gap-2 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender p-5 text-start"
        data-testid="odd-piece-v2-solution-recap"
      >
        <span className="text-[15px] font-bold text-brand-slate">
          القطعة الدخيلة
        </span>
        <span className="font-display text-[30px] font-black leading-tight">
          {reveal?.intruderPartLabel}
        </span>
        <span className="text-base leading-[1.7] text-brand-slate">
          السيارة <bdi>{reveal?.targetVehicleLabel}</bdi>، والقطعة مأخوذة من{" "}
          <bdi>{reveal?.intruderVehicleLabel}</bdi>. الدائرة الذهبية تبين
          مكانها.
        </span>
      </div>

      {rows.map((teamId) => {
        const attempt = attemptOf(teamId);
        return (
          <div
            key={teamId}
            className={cn(
              TEAM_ROW,
              attempt?.correct
                ? "bg-[hsl(var(--brand-gold))] shadow-[4px_5px_0_hsl(var(--brand-navy))]"
                : "bg-white",
            )}
          >
            <span className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
              <TeamDot className={dotOf(teamId)} />
              {teamName(teamId)}
            </span>
            <span className="text-[15px] font-bold">
              {attempt?.correct ? (
                <>
                  لمسوها صح · <bdi dir="ltr">+1</bdi>
                </>
              ) : attempt?.outcome === "timeout" ? (
                "خلص وقتهم"
              ) : attempt ? (
                "لمسوا غلط"
              ) : view.attempts.length ? (
                "ما وصلهم الدور"
              ) : (
                "ما ضغطوا «جاوب»"
              )}
            </span>
          </div>
        );
      })}

      {result && (
        <div className="flex flex-col gap-2 rounded-[18px] border-2 border-[hsl(var(--brand-navy))] bg-white px-4 py-3 text-center">
          <p className="font-display text-lg font-extrabold">
            {result.tie
              ? "متعادلين للحين"
              : `${teamName(result.winnerTeamId ?? undefined)} متقدمين`}
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-sm font-bold">
            {Object.entries(result.points).map(([teamId, points]) => (
              <span
                key={teamId}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3 py-1"
              >
                <TeamDot className={dotOf(teamId)} size={12} />
                {pointsLabel(points)}
              </span>
            ))}
          </div>
          {!result.tie && (
            <p
              className="text-sm font-bold text-brand-slate"
              data-testid="odd-piece-v2-mechanic-point"
            >
              الفايز بالتحدي ياخذ <bdi dir="ltr">+1</bdi> نقطة
            </p>
          )}
        </div>
      )}
      {footer}
    </>
  );

  if (compact) {
    return (
      <section
        className="flex flex-col gap-3"
        data-testid="odd-piece-v2-resolution"
      >
        {originalImage && (
          <div
            className="flex justify-center gap-2"
            data-testid="odd-piece-v2-comparison-controls"
          >
            <button
              type="button"
              onClick={() => setMode("modified")}
              className={cn(TOGGLE, mode === "modified" && TOGGLE_ON)}
              data-testid="odd-piece-v2-toggle-modified"
            >
              المعدّلة
            </button>
            <button
              type="button"
              onClick={() => setMode("original")}
              className={cn(TOGGLE, mode === "original" && TOGGLE_ON)}
              data-testid="odd-piece-v2-toggle-original"
            >
              الأصلية
            </button>
          </div>
        )}
        {pictures}
        {summary}
      </section>
    );
  }

  return (
    <section
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
      data-testid="odd-piece-v2-resolution"
    >
      <main className="flex items-center rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-4 shadow-[7px_8px_0_hsl(var(--brand-navy))]">
        {pictures}
      </main>
      <aside className="flex flex-col gap-3.5">{summary}</aside>
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
  /** A line under the picture, with the way back from a zoom. Leave out for a still picture. */
  instruction?: string;
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
        className="relative w-full overflow-hidden rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-wash"
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
      {instruction !== undefined && (
        <div className="flex min-h-9 items-center justify-between gap-2 text-sm font-bold text-brand-slate">
          <span>{instruction}</span>
          {transform.scale > 1 && (
            <button
              type="button"
              onClick={reset}
              className={TOGGLE}
              data-testid="odd-piece-v2-reset-zoom"
            >
              رجّع الصورة
            </button>
          )}
        </div>
      )}
    </div>
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
      className="flex flex-1 items-center justify-center px-4 text-lg font-bold text-brand-slate"
      data-testid={testId}
    >
      {children}
    </p>
  );
}
