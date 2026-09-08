"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BidiText } from "@/components/akwaan/bidi-text";
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Volume2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { MarhalaBoard } from "../match/components/marhala-board";
import { MarhalaAnswerReveal } from "../match/components/marhala-answer-reveal";
import { MarhalaMovementRoll } from "../match/components/marhala-movement-roll";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import { useWaitingForNextQuestion } from "../hooks/use-recurring-question-transition";
import {
  useMarhalaTurnReplay,
  usePrefersReducedMotion,
} from "../hooks/use-marhala-turn-replay";
import {
  MARHALA_CHALLENGE_NAME,
  MARHALA_DIFFICULTY_LABEL,
  marhalaBandPreviews,
  marhalaBandValues,
  marhalaPositionOf,
  marhalaPromptText,
  readMarhalaView,
  type MarhalaBandRisk,
  type MarhalaView,
} from "../match/marhala.presentation";
import type { GameplayRuntimeSnapshot } from "../model";

/**
 * "المرحلة" on the shared screen — the board is the screen.
 *
 * The mechanic's whole decision is spatial: from tile 5, does سهل tuck you safely
 * onto 7, or does صعب risk the عطل on 9 for a shot at 11? A trivia card filling the
 * screen would make that decision invisible, so the board takes the room and the
 * question sits beside it, never on top of it.
 *
 * Everything here is read from the projection: positions, whose turn it is, which
 * bands the server still has content for, the prompt, the clock, and the committed
 * record of the last turn. Nothing is predicted — the landings shown for a band are
 * its whole range, never a guess at the roll.
 */
export function MarhalaScreen({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot } = useLiveSession();
  const view = useMemo(
    () => readMarhalaView(runtime.modeState),
    [runtime.modeState],
  );
  const reducedMotion = usePrefersReducedMotion();
  const replay = useMarhalaTurnReplay({
    positions: view.positions,
    ...(view.lastTurn ? { lastTurn: view.lastTurn } : {}),
    reducedMotion,
  });
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase === "completed",
  );
  const teams = (snapshot?.teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
  }));
  const teamName = (id: string) =>
    teams.find((team) => team.id === id)?.name ?? "الفريق";
  const activeIdentity = teamIdentityOf(view.activeTeamId, teams);
  // Between two questions the board, the pawns and the header are exactly what
  // the room should keep looking at; only this panel is between states.
  const waitingForNext = useWaitingForNextQuestion();

  return (
    <section
      dir="rtl"
      data-testid="marhala-screen"
      data-marhala-phase={view.phase}
      className="space-y-3"
    >
      <header className="surface-card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-black text-muted-foreground">
            {MARHALA_CHALLENGE_NAME}
          </p>
          <p className="truncate text-lg font-black text-foreground">
            {view.phase === "completed" ? (
              "انتهى السباق"
            ) : (
              <>
                الدور <span className="akwaan-numeral">{view.turnNumber}</span>{" "}
                —{" "}
                <span className={activeIdentity.text}>
                  {teamName(view.activeTeamId)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view.selectedDifficulty && view.phase !== "completed" && (
            <BandChip view={view} />
          )}
          {!waitingForNext &&
            replay.phase !== "answer" &&
            remainingMs !== undefined &&
            view.phase === "question" && (
              <ChallengeCountdown remainingMs={remainingMs} />
            )}
        </div>
      </header>

      {/* The board is the hero; the side column supports it. It is sized to stay
          whole on a 1280×720 shared screen without scrolling, which is the point
          of it. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid place-items-center">
          <MarhalaBoard
            // The board is square, so on a short shared screen its *width* has
            // to be governed by the height left over — otherwise a wide 1280×720
            // TV pushes the finish square below the fold and the room scrolls.
            className="max-w-[min(100%,calc(100dvh-11rem))]"
            teams={teams}
            positions={replay.positions}
            activeTeamId={view.activeTeamId}
            // Only during the movement beat. A calm board is sixteen readable
            // squares; whose turn it is already sits in the header above, so an
            // always-on overlay would cover four squares to repeat it.
            {...(replay.replaying && replay.phase !== "answer"
              ? {
                  centre: (
                    <BoardCentre
                      view={view}
                      teamName={teamName}
                      movement={replay.movement}
                      rolling={replay.phase === "reveal"}
                      reducedMotion={reducedMotion}
                      {...(replay.effect ? { effect: replay.effect } : {})}
                    />
                  ),
                }
              : {})}
            {...(replay.effect ? { effect: replay.effect } : {})}
            {...(replay.travellingTeamId
              ? { travellingTeamId: replay.travellingTeamId }
              : {})}
          />
        </div>

        <div className="space-y-3">
          <StandingsStrip view={view} teams={teams} replay={replay.positions} />
          {waitingForNext ? (
            <NextQuestionPanel />
          ) : replay.phase === "answer" && view.lastTurn ? (
            // Answer truth first, movement second. The board beside this panel
            // never leaves the screen for either beat.
            <MarhalaAnswerReveal turn={view.lastTurn} teamName={teamName} />
          ) : replay.replaying && replay.movement !== undefined ? (
            <MovementReveal
              movement={replay.movement}
              teamName={teamName(view.lastTurn?.teamId ?? "")}
              effect={replay.effect}
            />
          ) : view.phase === "difficulty-choice" ? (
            <DecisionPanel view={view} teamName={teamName(view.activeTeamId)} />
          ) : view.phase === "question-pending" ? (
            <PendingPanel view={view} />
          ) : view.phase === "question" ? (
            <QuestionPanel view={view} />
          ) : (
            <TerminalPanel view={view} teamName={teamName} />
          )}
          {!replay.replaying && view.lastTurn && view.phase !== "completed" && (
            <LastTurnLine view={view} teamName={teamName} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * What each risk tier says out loud.
 *
 * The tier itself is ranked from the server's own movement ranges, so this table
 * only supplies the words — it never decides which band is the bold one. No
 * probability is stated anywhere: the runtime publishes none, and inventing one
 * would be a claim the mechanic cannot keep.
 */
const BAND_RISK: Record<
  MarhalaBandRisk,
  { label: string; blurb: string; tone: string }
> = {
  steady: {
    label: "تقدّم مضمون",
    blurb: "خطوات قصيرة، لكن أقل تعرّضًا للفخاخ.",
    tone: "text-muted-foreground",
  },
  balanced: {
    label: "متوازن",
    blurb: "تقدّم معقول مقابل مخاطرة معقولة.",
    tone: "text-foreground",
  },
  bold: {
    label: "مخاطرة عالية",
    blurb: "أبعد تقدّم ممكن — ومدى أوسع قد يوقعكم في فخ.",
    tone: "text-brand-gold",
  },
};

/**
 * The middle of the ring.
 *
 * Calm by default — whose turn it is, and nothing else. While a committed turn is
 * being replayed it becomes the focal point and shows the movement the *server*
 * decided, then names the tile that reacted. It never computes a value and never
 * holds state the board does not already have.
 */
function BoardCentre({
  view,
  teamName,
  movement,
  rolling,
  reducedMotion,
  effect,
}: {
  view: MarhalaView;
  teamName: (id: string) => string;
  movement?: number;
  rolling: boolean;
  reducedMotion: boolean;
  effect?: { position: number; kind: "boost" | "trap" };
}) {
  if (movement !== undefined) {
    // The band the team actually elected on this turn, read off the committed
    // record, and its values read off the server's ranges. The reel can only ever
    // show numbers that band can produce.
    const band = view.lastTurn?.difficulty;
    const range = band ? view.movementRanges[band] : undefined;
    return (
      <div data-testid="marhala-centre-movement" className="space-y-1">
        <MarhalaMovementRoll
          values={range ? marhalaBandValues(range) : []}
          result={movement}
          rolling={rolling}
          reducedMotion={reducedMotion}
          teamName={teamName(view.lastTurn?.teamId ?? "")}
        />
        {effect && (
          <p
            data-testid="marhala-centre-effect"
            className={cn(
              "text-xs font-black sm:text-sm",
              // Gold for a launch, rose for a trap — the same two colours the
              // board itself paints those squares in.
              effect.kind === "boost" ? "text-brand-gold" : "text-destructive",
            )}
          >
            {effect.kind === "boost" ? "انطلاق" : "فخ"}
          </p>
        )}
      </div>
    );
  }
  if (view.phase === "completed") {
    return (
      <p className="text-sm font-black text-muted-foreground sm:text-lg">
        انتهى السباق
      </p>
    );
  }
  return (
    <div data-testid="marhala-centre-calm" className="space-y-0.5">
      <p className="text-[0.7rem] font-black text-muted-foreground sm:text-xs">
        الدور <span className="akwaan-numeral">{view.turnNumber}</span>
      </p>
      <p className="text-sm font-black leading-tight text-foreground sm:text-xl">
        {teamName(view.activeTeamId)}
      </p>
    </div>
  );
}

/**
 * The gap between two questions, on the shared screen.
 *
 * Deliberately small and deliberately empty of information: the board beside it
 * still holds every position, and the next question has not been revealed to
 * anyone yet. A result card belongs here eventually; it is not this task's.
 */
function NextQuestionPanel() {
  return (
    <div
      className="surface-card flex items-center justify-center gap-2 px-4 py-6"
      data-testid="marhala-next-question"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="size-2 animate-pulse rounded-full bg-brand-gold motion-reduce:animate-none"
      />
      <p className="text-sm font-black text-muted-foreground">
        السؤال التالي بعد لحظة…
      </p>
    </div>
  );
}

function BandChip({ view }: { view: MarhalaView }) {
  const band = view.selectedDifficulty;
  if (!band) return null;
  const range = view.movementRanges[band];
  return (
    <span
      data-testid="marhala-selected-band"
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-sm font-black text-foreground"
    >
      {MARHALA_DIFFICULTY_LABEL[band]}
      <span className="akwaan-numeral text-xs font-bold text-muted-foreground">
        {range.min}–{range.max}
      </span>
    </span>
  );
}

/** Where both teams stand, in words, beside the board that shows it. */
function StandingsStrip({
  view,
  teams,
  replay,
}: {
  view: MarhalaView;
  teams: Array<{ id: string; name: string }>;
  replay: Record<string, number>;
}) {
  return (
    <ul
      data-testid="marhala-standings"
      className="grid grid-cols-2 gap-2 text-center"
    >
      {teams.map((team) => {
        const identity = teamIdentityOf(team.id, teams);
        const position = replay[team.id] ?? marhalaPositionOf(view, team.id);
        const active = team.id === view.activeTeamId;
        return (
          <li
            key={team.id}
            data-testid={`marhala-standing-${team.id}`}
            className={cn(
              "rounded-[var(--radius)] border px-3 py-2",
              identity.surface,
              identity.border,
              active &&
                "ring-2 ring-offset-1 ring-offset-background " + identity.ring,
            )}
          >
            <p className={cn("truncate text-sm font-black", identity.text)}>
              {team.name}
            </p>
            <p className="text-xs font-bold text-muted-foreground">
              المربّع <span className="akwaan-numeral">{position}</span>
              {active && " · دورهم"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The decision, laid out as a comparison rather than three buttons.
 *
 * Each band names the tiles it could actually land on from where the team stands,
 * and marks which of those are rewards, hazards or the finish — that comparison is
 * the mechanic. A band the server has no unseen content for is shown as spent
 * rather than hidden, so the room can see why it is not an option.
 */
function DecisionPanel({
  view,
  teamName,
}: {
  view: MarhalaView;
  teamName: string;
}) {
  const previews = marhalaBandPreviews(view);
  return (
    <div
      className="surface-card space-y-2.5 p-3 sm:p-4"
      data-testid="marhala-decision"
    >
      <div>
        <p className="text-sm font-black text-foreground">
          {teamName}: اختاروا مستوى الخطر
        </p>
        <p className="text-xs font-bold text-muted-foreground">
          من المربّع{" "}
          <span className="akwaan-numeral">
            {marhalaPositionOf(view, view.activeTeamId)}
          </span>{" "}
          — الاختيار من جوالاتكم.
        </p>
      </div>
      <ul className="space-y-2">
        {previews.map((band) => (
          <li
            key={band.difficulty}
            data-testid={`marhala-band-${band.difficulty}`}
            data-band-available={band.available ? "true" : "false"}
            className={cn(
              "rounded-[var(--radius)] border px-3 py-2",
              band.available
                ? "border-border bg-card"
                : "border-dashed border-border bg-muted/40 opacity-70",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-black text-foreground">
                {band.label}
                <span className="akwaan-numeral ms-1.5 text-xs font-bold text-muted-foreground">
                  {band.range.min}–{band.range.max}
                </span>
              </p>
              {band.available ? (
                <p
                  className={cn(
                    "text-[0.7rem] font-black",
                    BAND_RISK[band.risk].tone,
                  )}
                  data-testid={`marhala-band-${band.difficulty}-risk`}
                  data-band-risk={band.risk}
                >
                  {BAND_RISK[band.risk].label}
                </p>
              ) : (
                <p
                  className="text-[0.7rem] font-black text-muted-foreground"
                  data-testid={`marhala-band-${band.difficulty}-spent`}
                >
                  لا أسئلة جديدة
                </p>
              )}
            </div>
            {band.available && (
              <p className="mt-1 text-[0.7rem] font-bold leading-snug text-muted-foreground">
                {BAND_RISK[band.risk].blurb}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The server is drawing the question.
 *
 * Normally invisible — the draw is discharged inside the same request that commits
 * the choice — so this exists for the reconnect that legitimately lands on it. It
 * keeps the board and the chosen band and claims nothing else.
 */
function PendingPanel({ view }: { view: MarhalaView }) {
  return (
    <div
      className="surface-card flex items-center gap-2 p-4"
      data-testid="marhala-pending"
      role="status"
    >
      <Loader2
        className="size-4 animate-spin text-muted-foreground"
        aria-hidden
      />
      <p className="text-sm font-black text-foreground">
        جارٍ تجهيز السؤال…
        {view.selectedDifficulty && (
          <span className="ms-1.5 text-xs font-bold text-muted-foreground">
            المستوى: {MARHALA_DIFFICULTY_LABEL[view.selectedDifficulty]}
          </span>
        )}
      </p>
    </div>
  );
}

export function MarhalaQuestionImage({
  url,
  altText,
}: {
  url: string;
  altText?: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "unavailable">(
    url ? "loading" : "unavailable",
  );
  const resolvedUrl = getMediaUrl(url);

  return (
    <div
      data-testid="marhala-question-image"
      className="relative mx-auto flex aspect-video w-full max-w-xl items-center justify-center overflow-hidden rounded-[var(--radius)] border border-border/50 bg-muted/60"
    >
      {state === "loading" && (
        <div
          role="status"
          className="absolute inset-0 flex animate-pulse items-center justify-center text-xs font-bold text-muted-foreground"
        >
          جارٍ تحميل الصورة…
        </div>
      )}
      {resolvedUrl && state !== "unavailable" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedUrl}
          alt={altText || "صورة السؤال"}
          className={cn(
            "h-full w-full object-contain transition-opacity duration-300",
            state === "loaded" ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setState("loaded")}
          onError={() => setState("unavailable")}
        />
      )}
      {state === "unavailable" && (
        <p
          role="status"
          data-testid="marhala-image-unavailable"
          className="p-4 text-center text-xs font-bold text-muted-foreground"
        >
          تعذّر تحميل صورة السؤال
        </p>
      )}
    </div>
  );
}

export function MarhalaQuestionAudio({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const resolvedUrl = getMediaUrl(url);

  useEffect(() => {
    setIsPlaying(false);
    setHasError(false);
    if (!audioRef.current || !resolvedUrl) return;

    try {
      if (typeof audioRef.current.load === "function") {
        audioRef.current.load();
      }
      if (typeof audioRef.current.play === "function") {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(() => {
              // Autoplay blocked by browser policy - user can press play manually
              setIsPlaying(false);
            });
        }
      }
    } catch {
      // Audio element not supported in test environment or error loading
    }
  }, [resolvedUrl]);

  const togglePlay = () => {
    if (!audioRef.current || hasError) return;
    if (isPlaying) {
      if (typeof audioRef.current.pause === "function") {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      if (typeof audioRef.current.play === "function") {
        try {
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          }
        } catch {
          setIsPlaying(false);
        }
      }
    }
  };

  const restartAudio = () => {
    if (!audioRef.current || hasError) return;
    try {
      audioRef.current.currentTime = 0;
      if (typeof audioRef.current.play === "function") {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        }
      }
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <div
      data-testid="marhala-question-audio"
      className="relative mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-primary/25 bg-primary/5 p-4 text-center"
    >
      <audio
        ref={audioRef}
        src={resolvedUrl}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setHasError(true)}
      />

      <div className="flex items-center gap-2">
        <Volume2 className="size-5 text-primary" aria-hidden />
        <span className="text-xs font-black text-foreground">
          مقطع صوتي للسؤال
        </span>
      </div>

      {hasError ? (
        <p
          data-testid="marhala-audio-error"
          role="status"
          className="text-xs font-bold text-destructive"
        >
          تعذّر تشغيل المقطع الصوتي
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={togglePlay}
            className="flex items-center gap-1.5 font-bold"
            data-testid="marhala-audio-play-button"
            aria-label={isPlaying ? "إيقاف الصوت مؤقتاً" : "تشغيل الصوت"}
          >
            {isPlaying ? (
              <>
                <Pause className="size-4" aria-hidden />
                إيقاف مؤقت
              </>
            ) : (
              <>
                <Play className="size-4" aria-hidden />
                تشغيل المقطع
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={restartAudio}
            className="flex items-center gap-1.5 font-bold text-muted-foreground hover:text-foreground"
            data-testid="marhala-audio-restart-button"
            aria-label="إعادة تشغيل المقطع"
          >
            <RotateCcw className="size-4" aria-hidden />
            إعادة
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionPanel({ view }: { view: MarhalaView }) {
  const media = view.media;

  return (
    <div
      className="surface-card space-y-3 p-3 sm:p-4"
      data-testid="marhala-question"
    >
      <p className="text-xs font-black text-muted-foreground">
        السؤال — الإجابة من جوالات الفريق
      </p>

      {media?.type === "image" && media.url && (
        <MarhalaQuestionImage url={media.url} altText={media.altText} />
      )}

      {media?.type === "audio" && media.url && (
        <MarhalaQuestionAudio url={media.url} />
      )}

      <p className="text-xl font-black leading-snug text-foreground sm:text-2xl">
        <BidiText>{marhalaPromptText(view)}</BidiText>
      </p>
    </div>
  );
}

/** The roll, then the tile that answered it. */
function MovementReveal({
  movement,
  teamName,
  effect,
}: {
  movement: number;
  teamName: string;
  effect?: { position: number; kind: "boost" | "trap" };
}) {
  return (
    <div
      className="surface-card space-y-1.5 p-4 text-center"
      data-testid="marhala-movement-reveal"
      data-movement={movement}
      role="status"
    >
      <p className="text-xs font-black text-muted-foreground">{teamName}</p>
      <p className="akwaan-numeral text-4xl font-black text-success">
        +{movement}
      </p>
      {effect && (
        <p
          data-testid={`marhala-effect-${effect.kind}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black",
            effect.kind === "boost"
              ? "bg-brand-gold/20 text-brand-gold"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {effect.kind === "boost" ? (
            <Rocket className="size-4" aria-hidden />
          ) : (
            <Zap className="size-4" aria-hidden />
          )}
          {effect.kind === "boost" ? "قفزة!" : "عطل!"}
        </p>
      )}
    </div>
  );
}

/** What the last turn did, in one line, while the next team decides. */
function LastTurnLine({
  view,
  teamName,
}: {
  view: MarhalaView;
  teamName: (id: string) => string;
}) {
  const turn = view.lastTurn;
  if (!turn) return null;
  const name = teamName(turn.teamId);
  if (!turn.correct) {
    return (
      <p
        data-testid="marhala-last-turn"
        data-turn-outcome={turn.resolvedBy === "timeout" ? "timeout" : "wrong"}
        className="flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border bg-muted/50 px-3 py-2 text-sm font-bold text-muted-foreground"
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        {turn.resolvedBy === "timeout"
          ? `انتهى وقت ${name} — بقوا في مكانهم`
          : `إجابة ${name} غير صحيحة — بقوا في مكانهم`}
      </p>
    );
  }
  return (
    <p
      data-testid="marhala-last-turn"
      data-turn-outcome="correct"
      className="rounded-[var(--radius)] border border-border bg-muted/50 px-3 py-2 text-center text-sm font-bold text-muted-foreground"
    >
      {name} تقدّموا <span className="akwaan-numeral">{turn.movement}</span>
      {turn.tile === "boost" && " ثم قفزة"}
      {turn.tile === "trap" && " ثم عطل"}
      {" — "}المربّع <span className="akwaan-numeral">{turn.finalLanding}</span>
    </p>
  );
}

/**
 * The race is over, on the gameplay screen.
 *
 * The Match's own result stage owns the record and the reward; this is the moment
 * before it, so it says who won — or, when the account has simply run out of unseen
 * questions, says that plainly instead of dressing it as a draw.
 */
function TerminalPanel({
  view,
  teamName,
}: {
  view: MarhalaView;
  teamName: (id: string) => string;
}) {
  const result = view.result;
  if (result?.endedBy === "content-exhausted") {
    return (
      <div
        className="surface-card space-y-1.5 p-4 text-center"
        data-testid="marhala-exhausted"
        role="status"
      >
        <p className="text-lg font-black text-foreground">
          خلصت الأسئلة الجديدة المتاحة لهذا التحدي
        </p>
        <p className="text-sm font-bold text-muted-foreground">
          انتهى السباق دون فائز، ولم تُمنح نقاط لهذا التحدي.
        </p>
      </div>
    );
  }
  return (
    <div
      className="surface-card space-y-1.5 p-4 text-center"
      data-testid="marhala-finished"
      role="status"
    >
      <p className="text-xs font-black text-muted-foreground">وصلوا النهاية</p>
      <p className="text-2xl font-black text-foreground">
        {result?.winnerTeamId ? teamName(result.winnerTeamId) : "انتهى السباق"}
      </p>
    </div>
  );
}
