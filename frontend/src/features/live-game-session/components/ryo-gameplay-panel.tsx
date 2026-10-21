"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HelpCircle, Lock, Swords, Unlock } from "lucide-react";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { AnswerOption } from "../match/components/answer-option";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
import { teamIdentityOf, type TeamIdentity } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { BidiText } from "@/components/akwaan/bidi-text";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import { authoredText, type AuthoredText } from "../authored-text";
import {
  RYO_DECISION_PRESENTATION,
  ryoDecisionRevealLabel,
} from "../match/ryo-decision.presentation";
import type { GameplayRuntimeSnapshot } from "../model";
import { MarhalaQuestionAudio } from "./marhala-screen";
import { getMediaUrl } from "@/lib/api/media-url";
import { useRyoAudioReplay } from "../hooks/use-ryo-audio-replay";

/**
 * «إعادة المقطع» — one control, rendered on whichever surface the actor holds.
 *
 * Both teams hear the same clip, so replay belongs to the table rather than to
 * a turn: the server authorises the host or any connected player on either
 * side, and this renders exactly what the server says. The cooldown shown is
 * the server's own, counted down against server time; the button being enabled
 * is never what makes a replay legal.
 */
/**
 * The barrier could not be satisfied, said out loud.
 *
 * Shown on every surface, because a room staring at a loader with no
 * explanation is the failure mode this replaces — but only the host is offered
 * the control, and the server decides that (`canRetry`), not this component.
 *
 * The text names the class of problem and never the asset: these words are on a
 * television in front of both teams, and «تعذّر تحميل umm-kulthum-enta-omri»
 * would hand one of them the answer.
 */
function RyoPresentationFailure({
  reason,
  canRetry,
  busy,
  onRecover,
}: {
  reason: "media-unavailable" | "autoplay-blocked" | "readiness-timeout";
  canRetry: boolean;
  busy: boolean;
  onRecover: () => void;
}) {
  // Autoplay is a different problem with a different fix: the clip is fine, the
  // browser simply will not start it without a gesture — and the button IS the
  // gesture, so the host does not reload anything.
  const blocked = reason === "autoplay-blocked";
  return (
    <div
      className="flex max-w-md flex-col items-center gap-3 text-center"
      role="status"
      data-testid="ryo-presentation-failure"
    >
      <p className="text-lg font-black text-foreground">
        {blocked ? "الصوت متوقف في المتصفح" : "تعذّر تحميل المقطع الصوتي"}
      </p>
      <p className="text-sm font-bold text-muted-foreground">
        {blocked
          ? "اضغط لتفعيل الصوت قبل بدء السؤال"
          : "لم يبدأ وقت السؤال — الفريقان لم يخسرا شيئاً"}
      </p>
      {canRetry && (
        <Button
          type="button"
          onClick={onRecover}
          disabled={busy}
          className="font-black"
          data-testid="ryo-presentation-recover"
        >
          {blocked ? "تفعيل الصوت" : "إعادة المحاولة"}
        </Button>
      )}
    </div>
  );
}

function RyoReplayButton({
  onRequest,
  disabled,
  cooldownMs,
  compact = false,
}: {
  onRequest: () => void;
  disabled: boolean;
  cooldownMs: number;
  compact?: boolean;
}) {
  const waiting = cooldownMs > 0;
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "default" : "sm"}
      onClick={onRequest}
      disabled={disabled}
      data-testid="ryo-replay-button"
      aria-label="إعادة تشغيل المقطع الصوتي للجميع"
      className={cn("font-bold", compact && "w-full")}
    >
      {waiting ? `إعادة المقطع (${Math.ceil(cooldownMs / 1000)})` : "إعادة المقطع"}
    </Button>
  );
}

/**
 * The item as the runtime republishes it — which is as the author wrote it. The
 * text fields are localized objects, not strings; typing them as strings is what
 * crashed this panel the first time a read-your-opponent challenge could start.
 *
 * `media` is already the server-narrowed safe shape (an explicit `type`, never
 * inferred from the URL) — the projection strips storage path/filename/mimetype
 * before it ever reaches this client.
 */
interface RyoItem {
  id: string;
  prompt: AuthoredText;
  media?: {
    type: "image" | "audio";
    url: string;
    altText?: AuthoredText;
  } | null;
  answerMode: "multiple_choice" | "closest";
  options?: Array<{ id: string; label: AuthoredText }> | null;
}

/**
 * How long the shared screen waits for a clip before reporting ready anyway.
 *
 * Shorter than the server's own `PRESENTATION_ACTIVATION_TIMEOUT_SECONDS`, so
 * the ordinary slow-network case is resolved by the surface that knows why it
 * is slow, and the server's bound stays what it is for: a surface that has
 * stopped answering at all. A question whose clip never loads still opens —
 * with a full window and a visible playback error — rather than hanging the
 * table.
 */
export const RYO_AUDIO_READY_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_RYO_AUDIO_READY_TIMEOUT_MS ?? 8000,
);

function parseItem(value: unknown): RyoItem | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as RyoItem;
  } catch {
    return undefined;
  }
}

export function RyoGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const {
    snapshot,
    gameplayCommand,
    connection,
    presentationReadySocket,
    connectionEpoch,
  } = useLiveSession();
  const [number, setNumber] = useState("");
  // This phone's own decision, echoed back after it locks in. It is the local
  // player's own choice — never the opponent's — so showing it leaks nothing.
  const [myDecision, setMyDecision] = useState<string>();
  const [sending, setSending] = useState(false);
  const round = runtime.activeRound;
  const interaction = round?.interaction;
  const prompt = interaction?.prompt;
  const item = parseItem(prompt?.payload.itemJson);
  const role = String(prompt?.payload.actorRole ?? "spectator");
  const terminal = Boolean(
    interaction &&
    ["resolved", "cancelled", "expired"].includes(interaction.status),
  );
  // Fair-start multi-surface shell: while the first RYO item is waiting for every
  // surface (shared screen, answerer, decider) to mount, the server exposes only
  // this phone's capability — no question, options, target or Steal/Trust state.
  // This surface acknowledges over the socket (bound to this connection) so the
  // server counts it toward activation. Re-acknowledges on the next authoritative
  // snapshot while still awaiting; once activated, `awaiting` clears.
  const awaiting =
    (runtime.modeState as { awaitingPresentation?: boolean } | undefined)
      ?.awaitingPresentation === true;
  const ackedRef = useRef<string | null>(null);
  const inFlightRef = useRef<string | null>(null);
  // The clip this surface is being asked to be ready for, present only on the
  // shared screen and only while a presentation is held.
  const preloadAudioUrl = runtime.presentationSurface?.preloadAudioUrl;
  // Readiness that actually means something — and, since M3.1, readiness that
  // can come back **negative**.
  //
  // Acknowledging on mount would anchor the window before the clip had loaded a
  // byte. But acknowledging on `error` or on a timeout, as M3 did, is worse than
  // that: it reports success for a clip that will never play, and the question
  // then burns its blind window in silence. So this produces a verdict, and only
  // one of its three values releases the barrier.
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const [audioVerdict, setAudioVerdict] = useState<{
    url: string;
    verdict: "ready" | "media-unavailable" | "autoplay-blocked";
  } | null>(null);
  const verdict =
    preloadAudioUrl && audioVerdict?.url === preloadAudioUrl
      ? audioVerdict.verdict
      : undefined;
  const audioGateOpen = !preloadAudioUrl || verdict === "ready";

  /**
   * Prove the clip can actually be *heard*, not merely that it downloaded.
   *
   * `canplaythrough` says the bytes are there and decodable. It says nothing
   * about whether this browser will let them out of the speakers: an autoplay
   * policy refuses `play()` long after the media is perfectly ready, and a
   * question that silently eats its own timer behind that refusal looks
   * identical to a question nobody could answer.
   *
   * The probe plays at **zero volume rather than muted** on purpose. Browsers
   * grant muted autoplay freely, so a muted probe would report success for
   * exactly the case it exists to catch; `volume = 0` is inaudible to the room
   * while still being, to the policy, ordinary audible playback.
   */
  const probePlayable = useCallback(async (): Promise<
    "ready" | "media-unavailable" | "autoplay-blocked"
  > => {
    const element = preloadRef.current;
    if (!element) return "media-unavailable";
    const restore = element.volume;
    try {
      element.volume = 0;
      await element.play();
      element.pause();
      element.currentTime = 0;
      return "ready";
    } catch (error) {
      // `NotAllowedError` is the policy refusing; anything else is the asset.
      return (error as { name?: string })?.name === "NotAllowedError"
        ? "autoplay-blocked"
        : "media-unavailable";
    } finally {
      try {
        element.volume = restore;
      } catch {
        /* element gone */
      }
    }
  }, []);

  const settleAudio = useCallback(
    async (url: string, outcome?: "media-unavailable") => {
      if (outcome) {
        setAudioVerdict({ url, verdict: outcome });
        return;
      }
      setAudioVerdict({ url, verdict: await probePlayable() });
    },
    [probePlayable],
  );

  useEffect(() => {
    if (!preloadAudioUrl) return;
    setAudioVerdict(null);
    // Bounded, and deliberately shorter than the server's own timeout so the
    // surface that knows *why* it is slow is the one that reports it. A stall
    // is a failure now, not a silent pass: the clock does not start on a clip
    // that never arrived.
    const timer = setTimeout(
      () => void settleAudio(preloadAudioUrl, "media-unavailable"),
      RYO_AUDIO_READY_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [preloadAudioUrl, settleAudio]);
  const failure = runtime.presentationSurface?.failure;
  const [recovering, setRecovering] = useState(false);
  // A ref, not the state above. Three presses inside one tick do not re-render
  // between themselves, so a state flag is still `false` for the second — and
  // a double-tapped retry would open three generations, each invalidating the
  // last, leaving the room acknowledging a barrier that keeps moving.
  const recoveringRef = useRef(false);
  useEffect(() => {
    recoveringRef.current = false;
    setRecovering(false);
  }, [runtime.revision]);

  /**
   * The host's way out of a failed barrier, and it is two different things.
   *
   * Autoplay blocked: the clip is fine and the browser is waiting for a
   * gesture. This click **is** the gesture, so the right move is to probe again
   * right here — if sound is now permitted the surface simply reports ready and
   * the question starts, with no server round trip to reopen anything.
   *
   * Anything else: the asset did not arrive. Ask the server to reopen the
   * barrier, which issues a fresh generation and makes every surface say so
   * again — readiness recorded against the generation that failed must not be
   * allowed to satisfy the retry.
   */
  const recoverPresentation = useCallback(() => {
    if (!snapshot || !presentationReadySocket || recoveringRef.current) return;
    recoveringRef.current = true;
    setRecovering(true);
    const generation = runtime.presentationSurface?.generation;
    const send = (
      outcome: "ready" | "media-unavailable" | "autoplay-blocked" | "retry",
    ) =>
      presentationReadySocket({
        expectedSessionRevision: snapshot.revision,
        expectedRuntimeRevision: runtime.revision,
        ...(generation !== undefined
          ? { presentationGeneration: generation }
          : {}),
        presentationOutcome: outcome,
      }).catch(() => {
        // A refused recovery leaves the failure standing, which is the honest
        // outcome: the host can press again.
        recoveringRef.current = false;
        setRecovering(false);
      });

    if (failure?.reason === "autoplay-blocked") {
      void probePlayable().then((next) => {
        if (preloadAudioUrl) setAudioVerdict({ url: preloadAudioUrl, verdict: next });
        void send(next === "ready" ? "ready" : next);
      });
      return;
    }
    void send("retry");
  }, [
    snapshot,
    presentationReadySocket,
    runtime,
    failure,
    probePlayable,
    preloadAudioUrl,
  ]);

  useEffect(() => {
    if (!awaiting || !runtime || !snapshot || !presentationReadySocket) return;
    // Three outcomes reach the server, not one. A surface that cannot present
    // says so explicitly; the server records it and leaves the barrier up,
    // which is what keeps the gameplay clock stopped. Still probing means say
    // nothing yet.
    const outcome = preloadAudioUrl
      ? verdict === undefined
        ? undefined
        : verdict === "ready"
          ? "ready"
          : verdict
      : "ready";
    if (outcome === undefined) return;
    if (!audioGateOpen && runtime.presentationSurface?.failure) return;
    // Recurring fair-start: echo the server-projected generation, with a SEMANTIC
    // identity (generation + capability + socket connection epoch) so an ordinary
    // revision bump does not re-acknowledge, a reconnect (new epoch) does, and a
    // success for one generation never suppresses the next. Initial fair-start has
    // no generation and keeps its existing revision-keyed identity.
    const generation = runtime.presentationSurface?.generation;
    const capability = runtime.presentationSurface?.capability;
    // The outcome is part of the identity: a surface that reported a failure
    // and then recovered must be able to say so, and `ready` must not be
    // suppressed by a `media-unavailable` already sent for the same generation.
    const key =
      generation !== undefined
        ? `${runtime.mode.key}:gen${generation}:${capability ?? "single"}:conn${
            connectionEpoch ?? 0
          }:${outcome}`
        : `${runtime.mode.key}:${runtime.revision}:initial:${outcome}`;
    if (ackedRef.current === key || inFlightRef.current === key) return;
    inFlightRef.current = key;
    presentationReadySocket({
      expectedSessionRevision: snapshot.revision,
      expectedRuntimeRevision: runtime.revision,
      ...(generation !== undefined
        ? { presentationGeneration: generation }
        : {}),
      presentationOutcome: outcome,
    })
      .then(() => {
        ackedRef.current = key;
      })
      .catch(() => {
        // Not accepted: leave the key unpinned so a later snapshot retries.
      })
      .finally(() => {
        if (inFlightRef.current === key) inFlightRef.current = null;
      });
  }, [
    awaiting,
    runtime,
    snapshot,
    presentationReadySocket,
    connectionEpoch,
    audioGateOpen,
    preloadAudioUrl,
    verdict,
  ]);
  const remainingMs = useInteractionDeadline(prompt?.deadlineAt, terminal);
  // Which *side* has locked in, from the server's redacted projection: it publishes
  // that a submission exists and its kind, never the choice inside it. `kind`
  // follows from the two roles the screen already shows, so this leaks nothing —
  // and it is what lets both teams watch each other commit.
  const submissions = interaction?.submissions ?? [];
  const answerLocked = submissions.some(
    (submission) => submission.payload.kind === "answer",
  );
  const decisionLocked = submissions.some(
    (submission) => submission.payload.kind === "decision",
  );
  const alreadySubmitted =
    role === "answering"
      ? answerLocked
      : role === "opposing"
        ? decisionLocked
        : false;
  // The server names one authoritative answerer and one authoritative
  // Trust/Steal decision-maker per item. Submission authorisation alone is
  // team-wide, so without this every teammate would be offered a button the
  // server would then refuse.
  //
  // The server answers this per actor and against the live runtime, so a
  // disconnect handoff moves the controls with the assignment.
  const isAssignedActor = prompt?.payload.isAssignedActor === true;
  const canSubmit =
    runtime.availableActions.includes("submission:create") &&
    isAssignedActor &&
    !alreadySubmitted &&
    connection === "connected";
  const phone = useMobileSurface();
  const deciderName = (participantId: unknown) =>
    snapshot?.participants.find((person) => person.id === participantId)
      ?.displayName ?? "";
  const assignedName = deciderName(
    role === "answering"
      ? prompt?.payload.answererParticipantId
      : prompt?.payload.deciderParticipantId,
  );
  const itemIndex = Number(runtime.modeState.currentItemIndex ?? 0);
  // The clip exists for this item. The URL does not travel to a phone — only
  // the shared screen plays it — so presence, not address, is what gates the
  // control here.
  const hasAudio = item?.media?.type === "audio";
  const replay = useRyoAudioReplay(runtime, {
    hasAudio: Boolean(hasAudio),
    itemIndex,
    eligiblePhase:
      String(round?.modeState.phase ?? "") === "collecting" && !terminal,
  });
  const [replaySending, setReplaySending] = useState(false);
  // The guard is a ref, not the state above. Two taps inside one tick — an
  // impatient finger, or a stuck touch event — do not re-render between
  // themselves, so a state flag is still `false` for the second and the server
  // receives both. The ref closes synchronously; the state is only what renders.
  const replaySendingRef = useRef(false);
  const requestReplay = () => {
    if (!replay.canRequest || replaySendingRef.current) return;
    // Presentational only, exactly as every other controller does it: this
    // closes the double-tap window between the press and the next authoritative
    // snapshot. It never decides whether the replay happened — the server does,
    // and a refusal simply leaves the next snapshot unchanged.
    replaySendingRef.current = true;
    setReplaySending(true);
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType: "request-ryo-replay",
      payload: { itemIndex },
    });
  };
  // Any authoritative movement releases the local guard, so a refused request
  // cannot leave the button stuck.
  useEffect(() => {
    replaySendingRef.current = false;
    setReplaySending(false);
  }, [runtime.revision, itemIndex]);
  const answeringTeamId = String(round?.modeState.answeringTeamId ?? "");
  const opposingTeamId = String(round?.modeState.opposingTeamId ?? "");
  const team = (id: string) =>
    snapshot?.teams.find((candidate) => candidate.id === id)?.name ?? "الفريق";
  useEffect(() => {
    setSending(false);
  }, [interaction?.id, interaction?.status, submissions.length, itemIndex]);
  useEffect(() => {
    setNumber("");
    setMyDecision(undefined);
  }, [interaction?.id, itemIndex]);

  const submit = (payload: Record<string, string | number>) => {
    if (!canSubmit || sending) return;
    setSending(true);
    gameplayCommand("interaction-submit", { roundId: round?.id, payload });
  };

  const answeringIdentity = teamIdentityOf(
    answeringTeamId,
    snapshot?.teams ?? [],
  );
  const opposingIdentity = teamIdentityOf(
    opposingTeamId,
    snapshot?.teams ?? [],
  );

  if (awaiting) {
    return (
      <ChallengeFrame
        {...(phone ? {} : { eyebrow: "اقرأ خصمك" })}
        compact={phone}
        // Named by the server. Hardcoding "1 من 3" was right while only the
        // first item could be held; an audio item 2 or 3 holds too now.
        title={`السؤال ${runtime.presentationSurface?.itemOrdinal ?? 1} من 3`}
        progressValue={
          ((runtime.presentationSurface?.itemOrdinal ?? 1) - 1) * (100 / 3)
        }
        className={phone ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-3xl"}
      >
        <div
          className="grid place-items-center gap-4 py-16"
          data-testid="ryo-preparing"
        >
          {failure ? (
            <RyoPresentationFailure
              reason={failure.reason}
              canRetry={failure.canRetry}
              busy={recovering}
              onRecover={recoverPresentation}
            />
          ) : (
            <AkwaanLoader
              label={preloadAudioUrl ? "نحمّل المقطع…" : "نجهّز التحدي…"}
            />
          )}
          {/* The whole point of the barrier: buffer the clip BEFORE the clock
              starts. Nothing is played here and nothing is shown — the element
              exists to load, and then to be *probed*, because bytes arriving is
              not the same as sound coming out. It stays mounted through a
              failure so the host's retry has something to re-probe. */}
          {preloadAudioUrl && (
            <audio
              ref={preloadRef}
              data-testid="ryo-audio-preload"
              src={getMediaUrl(preloadAudioUrl)}
              preload="auto"
              className="hidden"
              onCanPlayThrough={() => void settleAudio(preloadAudioUrl)}
              onError={() =>
                void settleAudio(preloadAudioUrl, "media-unavailable")
              }
            />
          )}
        </div>
      </ChallengeFrame>
    );
  }

  if (phone) {
    return (
      <PhoneRyoController
        runtime={runtime}
        item={item}
        role={role}
        itemIndex={itemIndex}
        number={number}
        setNumber={setNumber}
        remainingMs={remainingMs}
        canSubmit={canSubmit}
        sending={sending}
        alreadySubmitted={alreadySubmitted}
        isAssignedActor={isAssignedActor}
        assignedName={assignedName}
        myDecision={myDecision}
        setMyDecision={setMyDecision}
        submit={submit}
        outcome={interaction?.outcome?.payload}
        replayCooldownMs={replay.cooldownMs}
        canReplay={replay.canRequest && !replaySending}
        showReplay={Boolean(hasAudio)}
        onReplay={requestReplay}
      />
    );
  }

  return (
    <ChallengeFrame
      eyebrow="اقرأ خصمك"
      title={`السؤال ${Math.min(3, itemIndex + 1)} من 3`}
      progressValue={(Math.min(3, itemIndex) / 3) * 100}
      className="mx-auto max-w-3xl"
    >
      <div className="space-y-5">
        {/* Both sides' lock state, one indicator each, both visible to both teams.
            That a team has committed is public; what it chose is not — the drama of
            this mechanic is watching your opponent lock in before you do. */}
        <div
          className="grid gap-2 text-sm sm:grid-cols-2"
          data-testid="ryo-lock-indicators"
        >
          <TeamLockIndicator
            teamName={team(answeringTeamId)}
            role="يجيب"
            identity={answeringIdentity}
            locked={answerLocked}
            testId="ryo-lock-answering"
          />
          <TeamLockIndicator
            teamName={team(opposingTeamId)}
            role="يقرأ الخصم"
            identity={opposingIdentity}
            locked={decisionLocked}
            testId="ryo-lock-opposing"
          />
        </div>
        {item ? (
          <section className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
            {item.media?.type === "image" && item.media.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.media.url}
                alt={authoredText(item.media.altText, "صورة السؤال")}
                className="mx-auto max-h-52 rounded-[var(--radius)] object-contain"
              />
            )}
            {item.media?.type === "audio" && item.media.url && (
              <>
                <MarhalaQuestionAudio
                  url={item.media.url}
                  replaySignal={replay.signal}
                  // The window is the authority on playback too: a clip still
                  // running after the deadline is talking over the reveal.
                  stopped={terminal || remainingMs === 0}
                />
                {runtime.availableActions.includes(
                  "mode:request-ryo-replay",
                ) && (
                  <RyoReplayButton
                    onRequest={requestReplay}
                    disabled={!replay.canRequest || replaySending}
                    cooldownMs={replay.cooldownMs}
                  />
                )}
              </>
            )}
            {/* The question is the largest thing on screen, at a size that reads
                from three metres on a television. */}
            <h2 className="text-[2rem] font-black leading-snug text-foreground sm:text-[2.5rem]">
              <BidiText>{authoredText(item.prompt)}</BidiText>
            </h2>

            {/* Second-largest, immediately after it: in a ~10-second blind window
                the clock is the only tension driver in the mechanic. */}
            {remainingMs !== undefined && (
              <ChallengeCountdown
                remainingMs={remainingMs}
                variant="prominent"
              />
            )}

            {role === "answering" &&
              canSubmit &&
              item.answerMode === "multiple_choice" && (
                <div
                  className="grid w-full gap-2 sm:grid-cols-2"
                  data-testid="ryo-answer-controls"
                >
                  {item.options?.map((option) => (
                    <AnswerOption
                      key={option.id}
                      onClick={() =>
                        submit({
                          kind: "answer",
                          mode: "multiple_choice",
                          optionId: option.id,
                        })
                      }
                    >
                      <BidiText>{authoredText(option.label)}</BidiText>
                    </AnswerOption>
                  ))}
                </div>
              )}
            {role === "answering" &&
              canSubmit &&
              item.answerMode === "closest" && (
                <div
                  className="mx-auto flex max-w-sm gap-2"
                  data-testid="ryo-answer-controls"
                >
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                    placeholder="اكتب تقديرك الرقمي"
                  />
                  <Button
                    disabled={
                      !number.trim() || !Number.isFinite(Number(number))
                    }
                    onClick={() =>
                      submit({
                        kind: "answer",
                        mode: "closest",
                        value: Number(number),
                      })
                    }
                  >
                    إرسال
                  </Button>
                </div>
              )}
            {role === "opposing" && canSubmit && (
              /**
               * Steal and Trust, weighted identically.
               *
               * The payoff matrix is symmetric, so the two options must look
               * symmetric. They were a bright red button and a filled navy one —
               * "danger, don't" beside "safe default" — which pushed players toward
               * Trust and removed the bluffing layer the mechanic is built on.
               *
               * Same border, same fill, same size, same padding, same weight. They
               * differ by icon and label and by nothing else, and neither takes a
               * semantic colour: at this moment nothing on screen is correct or
               * wrong yet.
               */
              <div
                className="grid w-full grid-cols-2 gap-3"
                data-testid="ryo-decision-controls"
              >
                {DECISIONS.map(({ decision, label, description, Icon }) => (
                  <Button
                    key={decision}
                    size="lg"
                    variant="outline"
                    data-decision={decision}
                    className="h-auto min-h-[4rem] flex-col items-center gap-1 whitespace-normal border-2 bg-card px-3 py-3 text-center hover:bg-accent active:scale-[0.99]"
                    onClick={() => {
                      setMyDecision(decision);
                      submit({ kind: "decision", decision });
                    }}
                  >
                    <Icon className="size-6" aria-hidden />
                    <span className="text-base font-black leading-tight">
                      {label}
                    </span>
                    {/* Static instructional copy: what this choice means, before
                        the tap. Secondary in weight, still readable on a phone, and
                        it says nothing about the other side's private choice. */}
                    <span className="text-xs font-medium leading-snug text-muted-foreground">
                      {description}
                    </span>
                  </Button>
                ))}
              </div>
            )}
            {(role === "spectator" || alreadySubmitted || !canSubmit) &&
              !terminal && (
                <p
                  className="rounded-[var(--radius)] bg-muted p-4 font-bold text-muted-foreground"
                  data-testid="ryo-waiting"
                >
                  {alreadySubmitted
                    ? myDecision
                      ? `اخترت «${ryoDecisionRevealLabel(myDecision)}». ننتظر الطرف الثاني…`
                      : "وصل اختيارك. ننتظر الطرف الثاني…"
                    : !isAssignedActor && role !== "spectator" && assignedName
                      ? `${assignedName} هو صاحب القرار في هذه الفقرة. ناقشوها معه.`
                      : "ننتظر اختيارات الفريقين…"}
                </p>
              )}
          </section>
        ) : (
          <p className="rounded-[var(--radius)] bg-muted p-6 text-center font-bold text-muted-foreground">
            جارٍ تجهيز السؤال التالي…
          </p>
        )}
        {interaction?.outcome && (
          /**
           * The one place a semantic colour belongs: a full-surface state that
           * exists for the moment an answer resolves and then goes away. Nothing
           * persistent in this product is allowed to be green or red, which is what
           * makes this surface legible the instant it appears.
           */
          <div
            data-testid="ryo-reveal"
            data-outcome={
              interaction.outcome.payload.correct ? "correct" : "wrong"
            }
            className={cn(
              "akwaan-rise rounded-[var(--radius)] p-5 text-center text-sem-reveal-foreground",
              interaction.outcome.payload.correct
                ? "bg-sem-success"
                : "bg-sem-error",
            )}
            role="status"
          >
            <p className="text-2xl font-black">
              {interaction.outcome.payload.correct
                ? "إجابة صحيحة"
                : "إجابة غير صحيحة"}
            </p>
            <p className="text-sm font-bold opacity-90">
              قرار الخصم:{" "}
              {ryoDecisionRevealLabel(
                String(interaction.outcome.payload.decision),
              )}
            </p>
            {/* The answers, inside the one native reveal rather than a second
                screen after it: اقرأ خصمك resolves both sides simultaneously,
                and splitting that into two beats would break the mechanic. */}
            <div className="mt-3 grid gap-2 text-start sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs font-bold opacity-80">الإجابة المُرسلة</p>
                <p className="break-words text-lg font-black [overflow-wrap:anywhere]">
                  {String(
                    interaction.outcome.payload.selectedAnswer ?? "",
                  ).trim() || "ما تم إرسال إجابة"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold opacity-80">الإجابة الصحيحة</p>
                <p className="break-words text-lg font-black [overflow-wrap:anywhere]">
                  {String(interaction.outcome.payload.correctAnswer ?? "")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </ChallengeFrame>
  );
}

function PhoneRyoController({
  runtime,
  item,
  role,
  itemIndex,
  number,
  setNumber,
  remainingMs,
  canSubmit,
  sending,
  alreadySubmitted,
  isAssignedActor,
  assignedName,
  myDecision,
  setMyDecision,
  submit,
  outcome,
  replayCooldownMs,
  canReplay,
  showReplay,
  onReplay,
}: {
  runtime: GameplayRuntimeSnapshot;
  item?: RyoItem;
  role: string;
  itemIndex: number;
  number: string;
  setNumber: (value: string) => void;
  remainingMs?: number;
  canSubmit: boolean;
  sending: boolean;
  alreadySubmitted: boolean;
  isAssignedActor: boolean;
  assignedName: string;
  myDecision?: string;
  setMyDecision: (decision: string) => void;
  submit: (payload: Record<string, string | number>) => void;
  outcome?: Record<string, unknown>;
  replayCooldownMs: number;
  canReplay: boolean;
  showReplay: boolean;
  onReplay: () => void;
}) {
  const completed = runtime.modeState.phase === "completed";
  const numericAnswerValid =
    number.trim().length > 0 && Number.isFinite(Number(number));

  return (
    <ChallengeFrame
      compact
      title={
        completed ? "انتهى التحدي" : `السؤال ${Math.min(3, itemIndex + 1)} من 3`
      }
      progressValue={completed ? 100 : (Math.min(3, itemIndex) / 3) * 100}
      aside={
        remainingMs !== undefined && !outcome ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 text-center"
        data-testid="ryo-phone-controller"
      >
        {outcome ? (
          <section
            className="flex flex-1 flex-col items-center justify-center gap-2"
            data-testid="ryo-phone-reveal"
          >
            <p className="text-2xl font-black text-foreground">
              {outcome.correct === true ? "إجابة صحيحة" : "إجابة غير صحيحة"}
            </p>
            <p className="font-bold text-muted-foreground">
              قرار الخصم: {ryoDecisionRevealLabel(String(outcome.decision))}
            </p>
            <p className="text-sm font-bold text-muted-foreground">
              تابعوا النتيجة على الشاشة
            </p>
          </section>
        ) : completed ? (
          <PhoneRyoWaiting testId="ryo-phone-complete">
            انتهى التحدي — تابعوا النتيجة على الشاشة
          </PhoneRyoWaiting>
        ) : item ? (
          <>
            <h2 className="flex shrink-0 items-center justify-center text-base font-black leading-relaxed text-foreground">
              <BidiText>{authoredText(item.prompt)}</BidiText>
            </h2>

            {/* The clip plays on the shared screen, so a phone offers no
                playback of its own — only the request to hear it again. Both
                teams get it: they are listening to the same thing, and a side
                that missed it is not a side that should have to answer blind.
                Hidden entirely for a text question. */}
            {showReplay && (
              <div className="shrink-0" data-testid="ryo-phone-replay">
                <RyoReplayButton
                  compact
                  onRequest={onReplay}
                  disabled={!canReplay}
                  cooldownMs={replayCooldownMs}
                />
              </div>
            )}

            {role === "answering" &&
              canSubmit &&
              item.answerMode === "multiple_choice" && (
                <div
                  className="flex min-h-0 flex-1 flex-col"
                  data-testid="ryo-phone-answer-controls"
                >
                  {sending && (
                    <p className="flex flex-1 items-center justify-center font-black text-muted-foreground">
                      جارٍ تثبيت اختيارك…
                    </p>
                  )}
                  <MobileActionArea className="grid grid-cols-1 sm:grid-cols-2">
                    {item.options?.map((option) => (
                      <AnswerOption
                        key={option.id}
                        disabled={sending}
                        onClick={() =>
                          submit({
                            kind: "answer",
                            mode: "multiple_choice",
                            optionId: option.id,
                          })
                        }
                      >
                        <BidiText>{authoredText(option.label)}</BidiText>
                      </AnswerOption>
                    ))}
                  </MobileActionArea>
                </div>
              )}

            {role === "answering" &&
              canSubmit &&
              item.answerMode === "closest" && (
                <div
                  className="flex min-h-0 flex-1 flex-col"
                  data-testid="ryo-phone-answer-controls"
                >
                  <div className="flex flex-1 items-center">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      enterKeyHint="send"
                      value={number}
                      onChange={(event) => setNumber(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && numericAnswerValid) {
                          submit({
                            kind: "answer",
                            mode: "closest",
                            value: Number(number),
                          });
                        }
                      }}
                      placeholder="اكتب تقديرك الرقمي"
                      className="h-20 text-center text-3xl font-black"
                      data-testid="ryo-phone-number"
                    />
                  </div>
                  <MobileActionArea>
                    <Button
                      size="lg"
                      disabled={!numericAnswerValid || sending}
                      onClick={() =>
                        submit({
                          kind: "answer",
                          mode: "closest",
                          value: Number(number),
                        })
                      }
                      className="h-14 w-full font-black"
                      data-testid="ryo-phone-number-submit"
                    >
                      {sending ? "جارٍ الإرسال…" : "إرسال الإجابة"}
                    </Button>
                  </MobileActionArea>
                </div>
              )}

            {role === "opposing" && canSubmit && (
              <section
                className="flex min-h-0 flex-1 flex-col"
                data-testid="ryo-phone-decision-controls"
              >
                <p className="flex flex-1 items-center justify-center text-sm font-bold text-muted-foreground">
                  {sending
                    ? "جارٍ تثبيت اختيارك…"
                    : "اقرأوا الفريق الثاني واختاروا"}
                </p>
                <MobileActionArea className="grid grid-cols-2">
                  {DECISIONS.map(({ decision, label, description, Icon }) => (
                    <Button
                      key={decision}
                      size="lg"
                      variant="outline"
                      data-decision={decision}
                      disabled={sending}
                      className="h-auto min-h-20 flex-col gap-1 whitespace-normal border-2 bg-card px-2 py-3 text-center font-black"
                      onClick={() => {
                        setMyDecision(decision);
                        submit({ kind: "decision", decision });
                      }}
                    >
                      <Icon className="size-5" aria-hidden />
                      <span>{label}</span>
                      <span className="text-[0.65rem] font-medium leading-tight text-muted-foreground">
                        {description}
                      </span>
                    </Button>
                  ))}
                </MobileActionArea>
              </section>
            )}

            {(alreadySubmitted || !canSubmit) && (
              <PhoneRyoWaiting testId="ryo-phone-waiting">
                {alreadySubmitted
                  ? sending
                    ? "جارٍ تثبيت اختيارك…"
                    : myDecision
                      ? `اخترت «${ryoDecisionRevealLabel(myDecision)}». ننتظر الطرف الثاني…`
                      : "وصل اختيارك. ننتظر الطرف الثاني…"
                  : !isAssignedActor && role !== "spectator" && assignedName
                    ? `${assignedName} هو صاحب القرار. ناقشوها معه.`
                    : "ننتظر صاحب القرار…"}
              </PhoneRyoWaiting>
            )}
          </>
        ) : (
          <PhoneRyoWaiting testId="ryo-phone-between-items">
            جارٍ تجهيز السؤال التالي…
          </PhoneRyoWaiting>
        )}
      </div>
    </ChallengeFrame>
  );
}

function PhoneRyoWaiting({
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

/**
 * The two choices, defined once.
 *
 * Kept as data rather than two hand-written buttons so the pair cannot drift apart:
 * one of them gaining a variant, a size or a colour is the defect this whole screen
 * was rebuilt to remove. The wording is the psychological read of the opponent, not
 * the mechanic's `trust`/`steal` — it comes from the single presentation source so
 * every RYO surface says the same thing. The icons stay neutral and symmetric: at
 * this moment nothing on screen is correct or wrong yet.
 */
const DECISIONS = [
  {
    decision: "trust",
    label: RYO_DECISION_PRESENTATION.trust.title,
    description: RYO_DECISION_PRESENTATION.trust.description,
    Icon: HelpCircle,
  },
  {
    decision: "steal",
    label: RYO_DECISION_PRESENTATION.steal.title,
    description: RYO_DECISION_PRESENTATION.steal.description,
    Icon: Swords,
  },
] as const;

/**
 * One team's lock state.
 *
 * Flips the instant that team submits, independently of the other. In the team's own
 * colour, and never in a semantic colour: locking in is not a correct or a wrong
 * thing to have done. The lock icon carries the state as well, so the change is
 * readable without comparing two hues.
 */
function TeamLockIndicator({
  teamName,
  role,
  identity,
  locked,
  testId,
}: {
  teamName: string;
  role: string;
  identity: TeamIdentity;
  locked: boolean;
  testId: string;
}) {
  const Icon = locked ? Lock : Unlock;
  return (
    <p
      data-testid={testId}
      data-locked={locked ? "true" : "false"}
      className={cn(
        "flex items-center justify-between gap-2 rounded-[var(--radius)] border-2 p-3 font-bold transition-colors duration-base ease-akwaan",
        identity.border,
        // Locked fills with the team's own colour; still deciding stays a tint. An
        // opacity step alone was too quiet to read across a room, and this is the
        // moment the mechanic wants everyone to notice. Both states are the team's
        // colour: committing is not a correct or an incorrect thing to have done.
        locked ? identity.solid : cn(identity.surface, identity.text),
      )}
    >
      <span className="min-w-0">
        <span className="block text-[0.7rem] font-bold opacity-80">{role}</span>
        <strong className="block truncate font-black">{teamName}</strong>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-black">
        <Icon className="size-4" aria-hidden />
        {/* One verb for both sides: the answering team picks an answer and the
            opposing team picks Steal or Trust, and "يقرر" only described the second. */}
        {locked ? "اختار" : "يختار…"}
      </span>
    </p>
  );
}
