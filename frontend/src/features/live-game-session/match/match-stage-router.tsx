"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";
import { RyoGameplayPanel } from "../components/ryo-gameplay-panel";
import { Top5Panel } from "../components/top5-panel";
import { ClosestGameplayPanel } from "../components/closest-gameplay-panel";
import { OneClueGameplayPanel } from "../components/one-clue-gameplay-panel";
import { RakkibhaPanel } from "../components/rakkibha-panel";
import { RakkibhaScreen } from "../components/rakkibha-screen";
import { ComboGameplayPanel } from "../components/combo-gameplay-panel";
import { BombGameplayPanel } from "../components/bomb-gameplay-panel";
import { MarhalaScreen } from "../components/marhala-screen";
import { MarhalaPhonePanel } from "../components/marhala-phone-panel";
import { RAKKIBHA_MODE_KEY } from "./rakkibha.presentation";
import { COMBO_MODE_KEY } from "./combo.presentation";
import { MARHALA_MODE_KEY } from "./marhala.presentation";
import { ODD_PIECE_MODE_KEY } from "./odd-piece.presentation";
import { OddPieceGameplayPanel } from "../components/odd-piece-gameplay-panel";
import { useLiveSession } from "../hooks/live-session-context";
import { MatchConnectionBanner } from "./components/match-connection-banner";
import { UnifiedBoard } from "./components/unified-board";
import { UnifiedChallengeResultStage } from "./components/unified-challenge-result-stage";
import { UnifiedChallengeStage } from "./components/unified-challenge-stage";
import { UnifiedMatchComplete } from "./components/unified-match-complete";
import { ParticipantWaiting } from "./components/participant-waiting";
import { UnifiedPreflightStage } from "./components/unified-preflight-stage";
import type { MatchActor } from "./types";
import { isMatchStageKey } from "./types";

/**
 * The only Match router.
 *
 * A Match has five stages and this switch has five branches. Anything else — an
 * unknown key, or a stage whose projection is missing — is reported as a recovery
 * error rather than mapped onto the board, because silently showing the board for
 * a state the server did not mean is how a host ends up acting on a lie.
 *
 * `challenge_result` is a real stage, not a frontend interlude: the server is
 * standing on it too, so a refresh during a reveal comes back to the reveal.
 */
export function MatchStageRouter({
  actor,
  participantId,
}: {
  actor: MatchActor;
  /** A phone, so its waiting screen can name the team it belongs to. */
  participantId?: string;
}) {
  const { snapshot, error, resync } = useLiveSession();

  if (!snapshot) {
    return (
      <div
        className="space-y-4"
        aria-label="جارٍ تحميل المباراة"
        data-testid="match-loading"
        dir="rtl"
      >
        <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
        <Skeleton className="h-72 w-full rounded-[var(--radius)]" />
      </div>
    );
  }
  if (!snapshot.match) return <MatchAbsent actor={actor} />;

  const match = snapshot.match;
  const stage = match.stage.key;
  const isPhone = actor === "participant";
  // A phone shows the team it belongs to while it waits; it has no other use for
  // its own identity, because the server already scopes everything else to it.
  const phoneTeamName = participantId
    ? snapshot.teams.find(
        (team) =>
          team.id ===
          snapshot.participants.find((person) => person.id === participantId)
            ?.teamId,
      )?.name
    : undefined;

  let content: React.ReactNode;
  if (!isMatchStageKey(stage)) {
    content = <UnsupportedStage stage={stage} onResync={resync} />;
  } else if (stage === "board") {
    // The board is the host's screen. A phone between challenges waits instead,
    // on the page it joined on, with its socket open.
    content = isPhone ? (
      <ParticipantWaiting
        {...(phoneTeamName ? { teamName: phoneTeamName } : {})}
      />
    ) : (
      <UnifiedBoard actor={actor} />
    );
  } else if (stage === "preflight") {
    // The preflight is entirely server state; without it there is nothing to show
    // and nothing to launch.
    content = !match.unified.preflight ? (
      <UnsupportedStage stage={stage} onResync={resync} />
    ) : isPhone && !match.unified.preflight.requiresPhones ? (
      // Being gathered for a challenge that does not want phones would be a lie.
      <ParticipantWaiting
        {...(phoneTeamName ? { teamName: phoneTeamName } : {})}
      />
    ) : (
      <UnifiedPreflightStage
        actor={actor}
        {...(participantId ? { participantId } : {})}
      />
    );
  } else if (stage === "challenge") {
    content = <UnifiedChallengeStage actor={actor} />;
  } else if (stage === "challenge_result") {
    // A phone gets one screen that is both the result and the wait for whatever
    // comes next — no second page, no redirect, same socket.
    content = isPhone ? (
      <ParticipantWaiting
        {...(match.challengeResult
          ? { challengeResult: match.challengeResult }
          : {})}
        {...(phoneTeamName ? { teamName: phoneTeamName } : {})}
      />
    ) : (
      <UnifiedChallengeResultStage actor={actor} />
    );
  } else {
    content = isPhone ? (
      <ParticipantWaiting
        matchComplete
        {...(phoneTeamName ? { teamName: phoneTeamName } : {})}
      />
    ) : (
      <UnifiedMatchComplete actor={actor} />
    );
  }

  return (
    <main
      dir="rtl"
      className={`mx-auto w-full space-y-4 ${stage === "board" ? "max-w-[92rem]" : "max-w-6xl"}`}
      data-match-actor={actor}
      data-match-stage={stage}
    >
      <MatchConnectionBanner />
      {error && actor !== "controller" && (
        <p className="sr-only" role="alert">
          تعذر تحديث المباراة. ستتم إعادة المحاولة تلقائيًا.
        </p>
      )}
      {content}
    </main>
  );
}

/**
 * A stage this client cannot render.
 *
 * Deliberately explicit about which key arrived: the host cannot fix it, but the
 * person they call can, and resyncing is the one action that might resolve it.
 */
function UnsupportedStage({
  stage,
  onResync,
}: {
  stage: string;
  onResync?: () => void;
}) {
  return (
    <section
      role="alert"
      dir="rtl"
      data-testid="match-stage-recovery"
      className="space-y-4 rounded-[var(--radius)] border border-warning/35 bg-warning-subtle p-6 text-center"
    >
      <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden />
      <h1 className="text-xl font-black text-foreground">
        تعذر عرض المرحلة الحالية
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        هذه المرحلة غير مفهومة لهذا الإصدار. نتائج المباراة محفوظة ولم يتغيّر
        شيء.
      </p>
      <p className="text-xs font-bold text-muted-foreground">
        المرحلة المُستلمة: <span dir="ltr">{stage || "—"}</span>
      </p>
      <Button
        type="button"
        onClick={() => onResync?.()}
        className="rounded-[var(--radius)] font-black"
      >
        <RefreshCw className="ml-1.5 size-4" aria-hidden />
        تحديث المباراة
      </Button>
    </section>
  );
}

/**
 * A live session with no Match.
 *
 * A Match is created by the setup wizard, before the session exists, so there is
 * nothing to start from here — only somewhere to go.
 */
function MatchAbsent({ actor }: { actor: MatchActor }) {
  if (actor !== "controller") {
    return (
      <section
        dir="rtl"
        data-testid="match-absent"
        className="mx-auto max-w-xl space-y-2 rounded-[var(--radius)] border border-border bg-card p-10 text-center"
      >
        <h1 className="text-2xl font-black text-foreground">
          المباراة لم تبدأ بعد
        </h1>
        <p className="text-sm text-muted-foreground">بانتظار المتحكّم.</p>
      </section>
    );
  }
  return (
    <section
      dir="rtl"
      data-testid="match-absent"
      className="mx-auto max-w-xl space-y-4 rounded-[var(--radius)] border border-border bg-card p-10 text-center"
    >
      <h1 className="text-2xl font-black text-foreground">
        لا توجد مباراة في هذه الجلسة
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        تُجهَّز المباراة بالكامل قبل أن تبدأ: ثلاث محطات عوالم وأربعة نطاقات لكل
        محطة.
      </p>
      <Button asChild className="rounded-[var(--radius)] font-black">
        <Link href={MATCH_SETUP_ROUTE}>ابدأ إعداد مباراة جديدة</Link>
      </Button>
    </section>
  );
}

/**
 * The runtime in progress, routed by its own mode key.
 *
 * The key is the authoritative runtime identity the server published; nothing here
 * compares a challenge name or a slug. A phone gets the mechanic's private
 * projection, a screen and the host get the public one.
 */
export function MatchGameplayRenderer({ actor }: { actor: MatchActor }) {
  const {
    snapshot,
    presentationReady,
    presentationReadySocket,
    connectionEpoch,
  } = useLiveSession();
  const gameplay = snapshot?.gameplay;
  // Fair-start: while a mechanic that opted into presentation activation is
  // preparing, the server sends no playable content — only this marker. This
  // surface acknowledges once (per runtime revision) that it can present, which
  // is what lets the server start the clock, and shows a preparing loader until
  // the real gameplay arrives.
  const awaiting =
    (gameplay?.modeState as { awaitingPresentation?: boolean } | undefined)
      ?.awaitingPresentation === true;
  // A mechanic that declares multiple surfaces (RYO) must be acknowledged over
  // the socket so the server can bind the ack to this exact connection and
  // withdraw it on disconnect. Single-surface mechanics keep the HTTP ack.
  const multiSurface = gameplay?.presentationSurface?.running === true;
  // The acknowledgement is keyed to the exact runtime revision, and is pinned
  // ONLY once the request has actually been issued and accepted. An attempt that
  // could not be delivered (or that the server rejected) leaves the key open, so
  // the next authoritative snapshot retries — this is what lets a cold-open or a
  // refresh into an already-awaiting runtime acknowledge, instead of depending on
  // provider effect ordering. `inFlightRef` keeps a still-pending attempt from
  // being duplicated; once activated, `awaiting` is false and nothing is sent.
  const ackedRef = useRef<string | null>(null);
  const inFlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (!awaiting || !gameplay || !snapshot) return;
    const ack = multiSurface ? presentationReadySocket : presentationReady;
    if (!ack) return;
    // Recurring fair-start: the server projects a `generation` on the surface only
    // while a recurring presentation is prepared. Its acknowledgement identity is
    // SEMANTIC — the runtime, that generation, this surface's capability, and the
    // socket connection epoch — never the runtime revision. So a success for
    // generation N never suppresses N+1, an ordinary revision bump on the same live
    // connection does not re-acknowledge (no storm), and a reconnect (new epoch,
    // after which the server withdrew the old readiness) does re-acknowledge. The
    // client only echoes what the server projected and never invents a generation.
    // Initial fair-start has no generation and keeps its existing revision identity.
    const generation = gameplay.presentationSurface?.generation;
    const capability = gameplay.presentationSurface?.capability;
    const key =
      generation !== undefined
        ? `${gameplay.mode.key}:gen${generation}:${capability ?? "single"}:conn${
            connectionEpoch ?? 0
          }`
        : `${gameplay.mode.key}:${gameplay.revision}:initial`;
    if (ackedRef.current === key || inFlightRef.current === key) return;
    inFlightRef.current = key;
    ack({
      expectedSessionRevision: snapshot.revision,
      expectedRuntimeRevision: gameplay.revision,
      ...(generation !== undefined
        ? { presentationGeneration: generation }
        : {}),
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
    gameplay,
    snapshot,
    presentationReady,
    presentationReadySocket,
    multiSurface,
    connectionEpoch,
  ]);

  if (!gameplay) return null;
  if (awaiting) {
    return (
      <div
        className="grid place-items-center py-16"
        data-testid="challenge-preparing"
      >
        <AkwaanLoader label="نجهّز التحدي…" />
      </div>
    );
  }
  const runtime =
    actor === "shared-screen"
      ? { ...gameplay, availableActions: [] }
      : gameplay;
  switch (runtime.mode.key) {
    case "read-your-opponent":
      return <RyoGameplayPanel runtime={runtime} />;
    case "top-5":
      return <Top5Panel runtime={runtime} />;
    case "closest":
      return <ClosestGameplayPanel runtime={runtime} />;
    case "one-clue":
      return <OneClueGameplayPanel runtime={runtime} />;
    case RAKKIBHA_MODE_KEY:
      return actor === "participant" ? (
        <RakkibhaPanel runtime={runtime} />
      ) : (
        <RakkibhaScreen runtime={runtime} />
      );
    // One panel for all three actors: the server sends each a different
    // projection, so the screen a viewer gets is decided there, not here.
    case COMBO_MODE_KEY:
      return <ComboGameplayPanel runtime={runtime} />;
    // Bomb runs on the session clock and shows the same screen to everyone; the
    // panel reads the active team from the snapshot rather than from the actor.
    case "bomb":
      return <BombGameplayPanel runtime={runtime} />;
    // The board is the shared screen's whole job, and a phone's job is one tap or
    // one typed answer — two different information roles, so two views rather than
    // one responsive component pretending to serve both.
    case MARHALA_MODE_KEY:
      return actor === "participant" ? (
        <MarhalaPhonePanel runtime={runtime} />
      ) : (
        <MarhalaScreen runtime={runtime} />
      );
    case ODD_PIECE_MODE_KEY:
      return <OddPieceGameplayPanel runtime={runtime} actor={actor} />;
    default:
      // The server started a mechanic this client has no screen for. Saying so is
      // the only honest option: the runtime is real and running.
      return (
        <section
          role="alert"
          data-testid="runtime-renderer-missing"
          className="space-y-2 rounded-[var(--radius)] border border-warning/35 bg-warning-subtle p-6 text-center"
        >
          <AlertTriangle className="mx-auto size-7 text-warning" aria-hidden />
          <p className="text-base font-black text-foreground">
            لا توجد شاشة لهذا التحدي في هذا التطبيق
          </p>
          <p className="text-sm text-muted-foreground">
            هذا التحدي يحتاج إصدارًا أحدث من اللعبة. حدِّث الصفحة، أو ألغِ
            التحدي وواصلوا اللعب.
          </p>
          <p className="text-xs font-bold text-muted-foreground">
            آلية اللعب: <span dir="ltr">{runtime.mode.key}</span>
          </p>
        </section>
      );
  }
}
