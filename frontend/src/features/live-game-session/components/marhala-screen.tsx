"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Loader2, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import {
  MarhalaBoard,
  MarhalaBoardLegend,
} from "../match/components/marhala-board";
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
  MARHALA_FINISH_POSITION,
  marhalaBandPreviews,
  marhalaBandValues,
  marhalaLastCheckpoint,
  marhalaPositionOf,
  marhalaPromptText,
  readMarhalaView,
  type MarhalaBandRisk,
  type MarhalaView,
} from "../match/marhala.presentation";
import type { GameplayRuntimeSnapshot } from "../model";

const NAVY_BORDER = "border-[hsl(var(--brand-navy))]";
const STICKER =
  "border-[3px] border-[hsl(var(--brand-navy))] shadow-[7px_8px_0_hsl(var(--brand-navy))]";

/**
 * "المرحلة" on the shared screen — the board is the screen.
 *
 * The approved layout (design canvas, `TVMarhala`): the navy context strip, the
 * board in its own card with the legend under it, and a lavender side panel that
 * holds the turn, whatever the turn is waiting on, and where both teams stand.
 * The mechanic's whole decision is spatial, so the question sits beside the
 * board and never on top of it.
 *
 * Everything here is read from the projection: positions, whose turn it is, which
 * bands the server still has content for, the prompt, the clock, and the committed
 * record of the last turn. Nothing is predicted.
 */
export function MarhalaScreen({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot } = useLiveSession();
  const context = useChallengeContext();
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
  // The pawn is the character its player picked in the lobby: the turn-holder's
  // when this team holds the turn, otherwise the team's first player, so both
  // pawns are always somebody rather than a letter.
  const teams = (snapshot?.teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    avatarKey:
      snapshot?.participants.find(
        (participant) =>
          participant.teamId === team.id &&
          participant.id === view.assignedParticipantId,
      )?.avatarKey ??
      snapshot?.participants.find(
        (participant) => participant.teamId === team.id && participant.avatarKey,
      )?.avatarKey,
  }));
  const teamName = (id: string) =>
    teams.find((team) => team.id === id)?.name ?? "الفريق";
  const activeIdentity = teamIdentityOf(view.activeTeamId, teams);
  // Whose phone carries the turn — the lobby captain or the rotation's pick —
  // so the room knows who to talk to.
  const holderName = view.assignedParticipantId
    ? snapshot?.participants.find(
        (participant) => participant.id === view.assignedParticipantId,
      )?.displayName
    : undefined;
  // Between two questions the board, the pawns and the header are exactly what
  // the room should keep looking at; only the side panel is between states.
  const waitingForNext = useWaitingForNextQuestion();
  const done = view.phase === "completed";
  const activeName = teamName(view.activeTeamId);

  const status = done
    ? "انتهى التحدي"
    : replay.replaying
      ? "عيونكم على اللوحة…"
      : waitingForNext || view.phase === "question-pending"
        ? "نجهّز السؤال…"
        : view.phase === "question"
          ? `${activeName} يجاوبون من جوالهم…`
          : `${activeName} يختارون مستوى السؤال…`;

  return (
    <section
      dir="rtl"
      data-testid="marhala-screen"
      data-marhala-phase={view.phase}
      className="flex min-h-0 flex-1 flex-col gap-[18px]"
    >
      <ChallengeContextStrip
        {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
        title={context.title ?? MARHALA_CHALLENGE_NAME}
        aside={
          <p className="text-base font-bold lg:text-lg">
            أول فريق يوصل النهاية يفوز
          </p>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-7 lg:flex-row lg:items-stretch">
        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-2.5 rounded-[28px] bg-brand-paper px-[18px] py-3.5",
            STICKER,
          )}
        >
          <MarhalaBoard
            // The board is wide, so on a short shared screen its *width* has to
            // be governed by the height left over — otherwise a 1280×720 TV
            // pushes the start row below the fold and the room scrolls.
            className="max-w-[min(100%,calc((100dvh-22rem)*1.71))]"
            teams={teams}
            positions={replay.positions}
            activeTeamId={view.activeTeamId}
            // Only during the movement beat. A calm board is sixteen readable
            // stations; whose turn it is already sits in the panel beside it.
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
          <MarhalaBoardLegend />
        </main>

        <aside
          className={cn(
            "flex w-full flex-none flex-col gap-4 rounded-[28px] bg-brand-lavender p-[22px] lg:w-[400px]",
            STICKER,
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              data-testid="marhala-turn-chip"
              className={cn(
                "inline-flex min-h-[44px] -rotate-2 items-center gap-2.5 rounded-full border-[3px] bg-[hsl(var(--brand-gold))] px-[18px] text-lg font-extrabold text-[hsl(var(--brand-navy))]",
                NAVY_BORDER,
              )}
            >
              {done ? (
                "انتهى السباق"
              ) : (
                <>
                  <TeamDot className={activeIdentity.dot} />
                  دور {activeName}
                </>
              )}
            </p>
            {!waitingForNext &&
              replay.phase !== "answer" &&
              remainingMs !== undefined &&
              view.phase === "question" && (
                <ChallengeCountdown
                  remainingMs={remainingMs}
                  size="md"
                  sound={view.media?.type !== "audio"}
                />
              )}
          </div>
          {!done && (
            <p className="-mt-2 text-sm font-semibold text-brand-slate">
              الدور <span className="akwaan-numeral">{view.turnNumber}</span>
              {holderName && (
                <span data-testid="marhala-turn-holder">
                  {" "}
                  · الجوال مع <bdi>{holderName}</bdi>
                </span>
              )}
            </p>
          )}

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
            <DecisionPanel view={view} />
          ) : view.phase === "question-pending" ? (
            <PendingPanel view={view} />
          ) : view.phase === "question" ? (
            <QuestionPanel view={view} />
          ) : (
            <TerminalPanel view={view} teamName={teamName} />
          )}
          {!replay.replaying && view.lastTurn && !done && (
            <LastTurnLine view={view} teamName={teamName} />
          )}

          <StandingsStrip view={view} teams={teams} replay={replay.positions} />
        </aside>
      </div>

      <p
        data-testid="marhala-status-line"
        role="status"
        className="text-[17px] font-semibold text-brand-slate"
      >
        {status}
      </p>
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
const BAND_RISK: Record<MarhalaBandRisk, string> = {
  steady: "مضمون، بس الخطوة قصيرة",
  balanced: "بين وبين",
  bold: "مخاطرة، والخطوة كبيرة",
};

/**
 * Over the board, during the movement beat only: the die the *server* rolled,
 * then a word for the station that reacted. It never computes a value and never
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
      <div data-testid="marhala-centre-movement" className="space-y-2">
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
            className="font-display text-base font-black text-[hsl(var(--brand-navy))] sm:text-lg"
          >
            {effect.kind === "boost" ? "وقفوا على قفزة!" : "وقفوا على فخ!"}
          </p>
        )}
      </div>
    );
  }
  if (view.phase === "completed") {
    return (
      <p className="text-sm font-black text-brand-slate sm:text-lg">
        انتهى السباق
      </p>
    );
  }
  return (
    <div data-testid="marhala-centre-calm" className="space-y-0.5">
      <p className="text-xs font-bold text-brand-slate">
        الدور <span className="akwaan-numeral">{view.turnNumber}</span>
      </p>
      <p className="text-sm font-black leading-tight text-[hsl(var(--brand-navy))] sm:text-xl">
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
 * anyone yet.
 */
function NextQuestionPanel() {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 rounded-2xl border-2 bg-white px-4 py-6",
        NAVY_BORDER,
      )}
      data-testid="marhala-next-question"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="size-2 animate-pulse rounded-full bg-[hsl(var(--brand-gold))] motion-reduce:animate-none"
      />
      <p className="text-sm font-bold text-brand-slate">
        السؤال الجاي بعد لحظة…
      </p>
    </div>
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
      className="mt-auto flex list-none flex-col gap-2"
    >
      {teams.map((team) => {
        const identity = teamIdentityOf(team.id, teams);
        const position = replay[team.id] ?? marhalaPositionOf(view, team.id);
        const active = team.id === view.activeTeamId;
        return (
          <li
            key={team.id}
            data-testid={`marhala-standing-${team.id}`}
            data-standing-active={active ? "true" : "false"}
            className={cn(
              "flex items-center justify-between gap-2.5 rounded-[14px] border-2 bg-white px-3.5 py-3",
              NAVY_BORDER,
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-base font-extrabold text-[hsl(var(--brand-navy))]">
              <TeamDot className={identity.dot} size={14} />
              <span className="truncate">{team.name}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-brand-slate">
              المحطة <span className="akwaan-numeral">{position}</span> · آخر
              حفظ{" "}
              <span className="akwaan-numeral">
                {marhalaLastCheckpoint(position)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The decision: three bands, each with the die it buys.
 *
 * A band the server has no unseen content for is shown as spent rather than
 * hidden, so the room can see why it is not an option.
 */
function DecisionPanel({ view }: { view: MarhalaView }) {
  const previews = marhalaBandPreviews(view);
  return (
    <div className="flex flex-col gap-4" data-testid="marhala-decision">
      <div>
        <h2 className="font-display text-2xl font-black text-[hsl(var(--brand-navy))] lg:text-[26px]">
          اختاروا مستوى السؤال
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-brand-slate">
          كل ما صعب السؤال كبر النرد. جاوبوا صح وارموا.
        </p>
      </div>
      <ul className="flex list-none gap-2">
        {previews.map((band) => (
          <li
            key={band.difficulty}
            data-testid={`marhala-band-${band.difficulty}`}
            data-band-available={band.available ? "true" : "false"}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-2xl border-[3px] px-2 py-3 text-[hsl(var(--brand-navy))]",
              band.available
                ? cn("bg-white", NAVY_BORDER)
                : "border-dashed border-brand-dash bg-brand-wash text-brand-slate",
            )}
          >
            <span className="font-display text-xl font-extrabold">
              {band.label}
            </span>
            <span className="text-[13px] font-semibold">النرد</span>
            <span dir="ltr" className="akwaan-numeral text-[22px] font-bold">
              {band.range.min} – {band.range.max}
            </span>
            {band.available ? (
              <span
                className="text-center text-[11px] font-semibold leading-snug text-brand-slate"
                data-testid={`marhala-band-${band.difficulty}-risk`}
                data-band-risk={band.risk}
              >
                {BAND_RISK[band.risk]}
              </span>
            ) : (
              <span
                className="text-center text-[11px] font-bold"
                data-testid={`marhala-band-${band.difficulty}-spent`}
              >
                لا أسئلة جديدة
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The band a team elected, and the die it bought. */
function BandChip({ view }: { view: MarhalaView }) {
  const band = view.selectedDifficulty;
  if (!band) return null;
  const range = view.movementRanges[band];
  return (
    <span
      data-testid="marhala-selected-band"
      className={cn(
        "inline-flex min-h-[30px] items-center gap-1.5 self-start rounded-full border-2 bg-[hsl(var(--brand-gold))] px-3 text-sm font-bold text-[hsl(var(--brand-navy))]",
        NAVY_BORDER,
      )}
    >
      سؤال {MARHALA_DIFFICULTY_LABEL[band]} · النرد
      <span dir="ltr" className="akwaan-numeral">
        {range.min} – {range.max}
      </span>
    </span>
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
      className={cn(
        "flex flex-col gap-3 rounded-2xl border-2 bg-white p-4",
        NAVY_BORDER,
      )}
      data-testid="marhala-pending"
      role="status"
    >
      <BandChip view={view} />
      <p className="flex items-center gap-2 text-base font-bold text-[hsl(var(--brand-navy))]">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        نجهّز السؤال…
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
  // Each retry mounts a fresh <img>, which is what makes the browser ask again.
  const [attempt, setAttempt] = useState(0);
  const resolvedUrl = getMediaUrl(url);

  return (
    <div
      data-testid="marhala-question-image"
      className="relative mx-auto flex aspect-video w-full max-w-xl items-center justify-center overflow-hidden rounded-2xl border-2 border-[hsl(var(--brand-navy))] bg-brand-wash"
    >
      {state === "loading" && (
        <div
          role="status"
          className="absolute inset-0 flex animate-pulse items-center justify-center text-sm font-bold text-brand-slate motion-reduce:animate-none"
        >
          نحمّل الصورة…
        </div>
      )}
      {resolvedUrl && state !== "unavailable" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={attempt}
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
        // The same slot, saying what happened and offering the one thing that
        // can fix it, instead of a blank box the room has to guess about.
        <div
          role="status"
          data-testid="marhala-image-unavailable"
          className="flex flex-col items-center gap-3 p-4 text-center"
        >
          <p className="text-base font-bold text-[hsl(var(--brand-navy))]">
            ما قدرنا نحمّل الصورة
          </p>
          {resolvedUrl && (
            <button
              type="button"
              data-testid="marhala-image-retry"
              onClick={() => {
                setAttempt((current) => current + 1);
                setState("loading");
              }}
              className="inline-flex min-h-11 items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-5 text-[15px] font-bold text-[hsl(var(--brand-navy))] hover:bg-brand-lavender"
            >
              حاول مرة ثانية
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The one question-audio element, now able to take a server-authoritative replay.
 *
 * Every prop beyond `url` is optional and defaults to the behaviour this
 * component has always had, because مرحلة, ركّبها, إكس أو المتحرك and الأقرب all
 * render it and none of them replays, stops at a deadline or reports readiness.
 * اقرأ خصمك is the only caller that passes them.
 */
export function MarhalaQuestionAudio({
  url,
  replaySignal,
  stopped = false,
  onReady,
  onUnplayable,
}: {
  url: string;
  /**
   * A monotonic counter from authoritative state. Every *increase* restarts the
   * clip; the first value seen is only a baseline. It is deliberately not a
   * boolean or an event — a snapshot can be re-delivered, and a counter is what
   * makes "the server has authorised one more replay than I have played"
   * answerable from state alone.
   */
  replaySignal?: number;
  /** The authoritative window has closed; playback must not continue past it. */
  stopped?: boolean;
  /** The clip can play. Fires once per source. */
  onReady?: () => void;
  /** The clip cannot play, so a barrier waiting on it must stop waiting. */
  onUnplayable?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const resolvedUrl = getMediaUrl(url);
  // Readiness is reported at most once per source: a `canplay` that fires again
  // after a seek is not a second arrival.
  const reportedFor = useRef<string | null>(null);
  const report = (callback: (() => void) | undefined, key: string) => {
    if (reportedFor.current === key) return;
    reportedFor.current = key;
    callback?.();
  };

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

  // Server-authorised replay. The baseline is established on the first value
  // seen for a source, so an initial snapshot — or a reconnect that redelivers
  // one — never replays a request the room already heard. Only an *increase*
  // restarts, so a repeated snapshot at the same sequence is inert and a signal
  // this client missed is still recovered from the next snapshot that carries a
  // higher one.
  const playedSignal = useRef<{ key: string; value: number } | null>(null);
  useEffect(() => {
    if (replaySignal === undefined || !resolvedUrl) return;
    const seen = playedSignal.current;
    if (!seen || seen.key !== resolvedUrl) {
      playedSignal.current = { key: resolvedUrl, value: replaySignal };
      return;
    }
    if (replaySignal <= seen.value) return;
    playedSignal.current = { key: resolvedUrl, value: replaySignal };
    restartAudio();
    // `restartAudio` is recreated every render and is not part of this effect's
    // identity; the signal and the source are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaySignal, resolvedUrl]);

  // The window closed. A clip still playing underneath a resolved question —
  // or underneath the next one — is the audio equivalent of a stale screen.
  useEffect(() => {
    if (!stopped) return;
    const element = audioRef.current;
    if (!element) return;
    try {
      element.pause();
    } catch {
      /* playback unavailable in this environment */
    }
    setIsPlaying(false);
  }, [stopped]);

  // Leaving the question for any reason — resolution, the next item, abort,
  // unmount — must never leave audio running under what replaces it.
  useEffect(() => {
    // Captured on mount, not read at cleanup time: React may have already
    // detached the ref by the time an unmount cleanup runs, and a cleanup that
    // silently no-ops is exactly the "audio kept playing under the next
    // screen" bug this exists to prevent.
    const element = audioRef.current;
    return () => {
      try {
        element?.pause();
      } catch {
        /* playback unavailable in this environment */
      }
    };
  }, []);

  // A source that will never play must not hold a readiness barrier open. The
  // barrier's own timeout would eventually release it, but reporting the
  // failure releases it immediately and keeps the bound a backstop rather than
  // the normal path.
  useEffect(() => {
    if (!resolvedUrl) return;
    reportedFor.current = null;
    const element = audioRef.current;
    // jsdom and some browsers report a clip already buffered without ever
    // firing `canplay` again, so the current state counts as an arrival.
    if (element && element.readyState >= 3) report(onReady, resolvedUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl]);

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
        onCanPlay={() => report(onReady, resolvedUrl)}
        onError={() => {
          setHasError(true);
          report(onUnplayable, resolvedUrl);
        }}
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
          className="text-xs font-bold text-foreground"
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
      className={cn(
        "flex flex-col gap-3 rounded-2xl border-2 bg-white p-4",
        NAVY_BORDER,
      )}
      data-testid="marhala-question"
    >
      <BandChip view={view} />

      {media?.type === "image" && media.url && (
        <MarhalaQuestionImage url={media.url} altText={media.altText} />
      )}

      {media?.type === "audio" && media.url && (
        <MarhalaQuestionAudio url={media.url} />
      )}

      <p className="font-display text-xl font-extrabold leading-relaxed text-[hsl(var(--brand-navy))] sm:text-2xl">
        <BidiText>{marhalaPromptText(view)}</BidiText>
      </p>
      <p className="text-sm font-semibold text-brand-slate">
        جاوبوا صح عشان ترمون النرد.
      </p>
    </div>
  );
}

/** The roll, then the station that answered it. */
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
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border-2 bg-white p-4 text-center",
        NAVY_BORDER,
      )}
      data-testid="marhala-movement-reveal"
      data-movement={movement}
      role="status"
    >
      <span className="inline-flex min-h-[32px] -rotate-3 items-center rounded-[10px] border-[3px] border-brand-navy bg-sem-success px-3 text-sm font-extrabold text-foreground">
        جاوبوا صح
      </span>
      <p className="font-display text-2xl font-black text-[hsl(var(--brand-navy))]">
        {teamName} طلع لهم <span className="akwaan-numeral">{movement}</span>
      </p>
      {effect && (
        <p
          data-testid={`marhala-effect-${effect.kind}`}
          className={cn(
            "inline-flex min-h-[32px] items-center rounded-full border-2 px-3 text-sm font-extrabold",
            NAVY_BORDER,
            effect.kind === "boost"
              ? "bg-[hsl(var(--brand-purple))] text-white"
              : "bg-[#2E2860] text-white",
          )}
        >
          {effect.kind === "boost" ? "قفزة! السلم يطلّعهم" : "فخ! الزحليقة تنزّلهم"}
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
  const line =
    "rounded-[14px] border-2 border-dashed border-brand-dash bg-white/70 px-3 py-2 text-center text-sm font-semibold text-brand-plum";
  if (!turn.correct) {
    return (
      <p
        data-testid="marhala-last-turn"
        data-turn-outcome={turn.resolvedBy === "timeout" ? "timeout" : "wrong"}
        className={line}
      >
        {turn.resolvedBy === "timeout"
          ? `خلص وقت ${name}، وبقوا مكانهم`
          : `${name} جاوبوا غلط، وبقوا مكانهم`}
      </p>
    );
  }
  return (
    <p
      data-testid="marhala-last-turn"
      data-turn-outcome="correct"
      className={line}
    >
      {name} مشوا <span className="akwaan-numeral">{turn.movement}</span>
      {turn.tile === "boost" && " ثم قفزة"}
      {turn.tile === "trap" && " ثم فخ"}
      {" ووصلوا "}المحطة{" "}
      <span className="akwaan-numeral">{turn.finalLanding}</span>
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
        className={cn(
          "flex flex-col gap-1.5 rounded-2xl border-2 bg-white p-4 text-center",
          NAVY_BORDER,
        )}
        data-testid="marhala-exhausted"
        role="status"
      >
        <p className="font-display text-lg font-black text-[hsl(var(--brand-navy))]">
          خلصت الأسئلة الجديدة لهالتحدي
        </p>
        <p className="text-sm font-semibold text-brand-slate">
          انتهى السباق بدون فائز، وما انحسبت نقطة لهالتحدي.
        </p>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl border-[3px] bg-[hsl(var(--brand-gold))] p-5 text-center shadow-[4px_5px_0_hsl(var(--brand-navy))]",
        NAVY_BORDER,
      )}
      data-testid="marhala-finished"
      role="status"
    >
      <p className="text-sm font-bold text-[hsl(var(--brand-navy))]">
        وصلوا المحطة{" "}
        <span className="akwaan-numeral">{MARHALA_FINISH_POSITION}</span>
      </p>
      <p className="font-display text-3xl font-black text-[hsl(var(--brand-navy))]">
        {result?.winnerTeamId
          ? `فوز ${teamName(result.winnerTeamId)}`
          : "انتهى السباق"}
      </p>
    </div>
  );
}
