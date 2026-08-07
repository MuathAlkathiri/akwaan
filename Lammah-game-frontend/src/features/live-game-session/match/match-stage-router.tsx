"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";
import { RyoGameplayPanel } from "../components/ryo-gameplay-panel";
import { Top10PoisonDeckPanel } from "../components/top10-poison-deck-panel";
import { DistributedInformationPanel } from "../components/distributed-information-panel";
import { DistributedInformationScreen } from "../components/distributed-information-screen";
import { DISTRIBUTED_INFORMATION_MODE_KEY } from "./distributed-information.presentation";
import { useLiveSession } from "../hooks/live-session-context";
import { MatchConnectionBanner } from "./components/match-connection-banner";
import { UnifiedBoard } from "./components/unified-board";
import { UnifiedChallengeStage } from "./components/unified-challenge-stage";
import { UnifiedMatchComplete } from "./components/unified-match-complete";
import { ParticipantWaiting } from "./components/participant-waiting";
import { UnifiedPreflightStage } from "./components/unified-preflight-stage";
import type { MatchActor } from "./types";
import { isMatchStageKey } from "./types";

/**
 * The only Match router.
 *
 * A Match has four stages and this switch has four branches. Anything else — an
 * unknown key, or a stage whose projection is missing — is reported as a recovery
 * error rather than mapped onto the board, because silently showing the board for
 * a state the server did not mean is how a host ends up acting on a lie.
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
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
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
      <ParticipantWaiting {...(phoneTeamName ? { teamName: phoneTeamName } : {})} />
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
      <ParticipantWaiting {...(phoneTeamName ? { teamName: phoneTeamName } : {})} />
    ) : (
      <UnifiedPreflightStage actor={actor} />
    );
  } else if (stage === "challenge") {
    content = <UnifiedChallengeStage actor={actor} />;
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
      className="mx-auto w-full max-w-6xl space-y-4"
      data-match-actor={actor}
      data-match-stage={stage}
    >
      <MatchConnectionBanner actor={actor} />
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
      className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center"
    >
      <AlertTriangle className="mx-auto size-8 text-amber-600" aria-hidden />
      <h1 className="text-xl font-black text-slate-900">
        تعذر عرض المرحلة الحالية
      </h1>
      <p className="text-sm leading-6 text-slate-600">
        وصلت حالة غير معروفة أو ناقصة من الخادم. بيانات المباراة محفوظة ولم يتغيّر
        شيء.
      </p>
      <p className="text-xs font-bold text-slate-500">
        المرحلة المُستلمة: <span dir="ltr">{stage || "—"}</span>
      </p>
      <Button
        type="button"
        onClick={() => onResync?.()}
        className="rounded-xl font-black"
      >
        <RefreshCw className="ml-1.5 size-4" aria-hidden />
        مزامنة المباراة
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
        className="mx-auto max-w-xl space-y-2 rounded-2xl border border-black/[0.06] bg-white p-10 text-center"
      >
        <h1 className="text-2xl font-black text-slate-900">
          المباراة لم تبدأ بعد
        </h1>
        <p className="text-sm text-slate-600">بانتظار المتحكّم.</p>
      </section>
    );
  }
  return (
    <section
      dir="rtl"
      data-testid="match-absent"
      className="mx-auto max-w-xl space-y-4 rounded-2xl border border-black/[0.06] bg-white p-10 text-center"
    >
      <h1 className="text-2xl font-black text-slate-900">
        لا توجد مباراة في هذه الجلسة
      </h1>
      <p className="text-sm leading-6 text-slate-600">
        تُجهَّز المباراة بالكامل قبل أن تبدأ: ثلاث محطات عوالم وأربعة نطاقات لكل
        محطة.
      </p>
      <Button asChild className="rounded-xl font-black">
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
  const { snapshot } = useLiveSession();
  if (!snapshot?.gameplay) return null;
  const runtime =
    actor === "shared-screen"
      ? { ...snapshot.gameplay, availableActions: [] }
      : snapshot.gameplay;
  switch (runtime.mode.key) {
    case "read-your-opponent":
      return <RyoGameplayPanel runtime={runtime} />;
    case "top-10":
      return <Top10PoisonDeckPanel runtime={runtime} />;
    case DISTRIBUTED_INFORMATION_MODE_KEY:
      return actor === "participant" ? (
        <DistributedInformationPanel runtime={runtime} />
      ) : (
        <DistributedInformationScreen runtime={runtime} />
      );
    default:
      // The server started a mechanic this client has no screen for. Saying so is
      // the only honest option: the runtime is real and running.
      return (
        <section
          role="alert"
          data-testid="runtime-renderer-missing"
          className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center"
        >
          <AlertTriangle
            className="mx-auto size-7 text-amber-600"
            aria-hidden
          />
          <p className="text-base font-black text-slate-900">
            لا توجد شاشة لهذا التحدي في هذا التطبيق
          </p>
          <p className="text-sm text-slate-600">
            بدأ الخادم آلية لعب لا يعرف هذا الإصدار عرضها. حدِّث التطبيق أو ألغِ
            التحدي من الخادم.
          </p>
          <p className="text-xs font-bold text-slate-500">
            آلية اللعب: <span dir="ltr">{runtime.mode.key}</span>
          </p>
        </section>
      );
  }
}
