"use client";

import Link from "next/link";
import { CheckCircle2, Lock, Play } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JourneyShell } from "./journey-shell";
import { JourneyError } from "./journey-error";
import {
  usePlayableScopes,
  usePlayableWorld,
} from "../hooks/use-player-catalog";
import {
  buildOccurrenceBoard,
  countAvailable,
  type BoardChallenge,
} from "../utils/challenge-availability";
import { getLiveSession } from "@/features/live-game-session/api/live-session-api";
import { continueMatchWorld } from "@/features/live-game-session/match/api/match-api";
// The route only; importing the wizard itself would make worlds depend on setup.
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";

/**
 * The World board.
 *
 * Every challenge in the scope is shown at once, as equals. There is no first
 * challenge and no next challenge: a Match may revisit a World and may play its
 * challenges in any order, so the board must never imply a sequence. Choosing
 * one and finishing it returns the player here with that one completed and the
 * rest still open.
 */
export function BoardScreen({
  worldId,
  sessionId,
}: {
  worldId: string;
  sessionId?: string;
}) {
  const router = useRouter();
  const worldQuery = usePlayableWorld(worldId);
  const scopes = usePlayableScopes(worldId);
  const session = useQuery({
    queryKey: ["match-journey-session", sessionId],
    queryFn: () => getLiveSession(sessionId as string),
    enabled: Boolean(sessionId),
    staleTime: 0,
  });
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string>();
  const world = worldQuery.data;
  const match = session.data?.match;
  const occurrence = match?.currentOccurrence;
  const occurrenceMatches = occurrence?.worldId === worldId;
  const selectedScopeIds = occurrenceMatches
    ? occurrence?.selectedScopeIds
    : undefined;
  const pool = (scopes.isSuccess ? scopes.data : []).filter((scope) =>
    (selectedScopeIds ?? []).includes(scope.id),
  );
  // The board belongs to the World occurrence, so it is built from the World's
  // configured challenges — never from a single Scope.
  const challenges = buildOccurrenceBoard(pool);
  const available = countAvailable(challenges);
  const completed = challenges.filter(
    (challenge) => challenge.availability === "completed",
  ).length;

  const trail = [
    { label: "العوالم", href: "/" },
    { label: world?.name ?? "العالم", href: `/worlds/${worldId}` },
    { label: "اللوحة" },
  ];

  const advance = async () => {
    if (!sessionId || !match) return;
    setAdvancing(true);
    setAdvanceError(undefined);
    try {
      const next = await continueMatchWorld(sessionId, match.revision);
      if (next.match?.stage.key === "match_complete") {
        router.push(`/matches/${sessionId}`);
        return;
      }
      const nextOccurrence = next.match?.currentOccurrence;
      if (nextOccurrence) {
        router.push(
          `/worlds/${nextOccurrence.worldId}?sessionId=${encodeURIComponent(sessionId)}`,
        );
      }
    } catch {
      setAdvanceError("تعذر الانتقال إلى العالم التالي.");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <JourneyShell trail={trail}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">
              عالم {world?.name ?? ""}
            </h1>
            <div className="mt-3">
              <p className="text-sm font-black text-[#15803D]">
                النطاقات المختارة:
              </p>
              <ul className="mt-1.5 flex list-none flex-wrap items-center gap-2">
                {pool.map((scope) => (
                  <li
                    key={scope.id}
                    className="rounded-full border border-primary/15 bg-primary/[0.07] px-3 py-1 text-xs font-bold text-primary"
                  >
                    {scope.name}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              اختر أي تحدٍّ متاح. لا يوجد ترتيب مفروض.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/[0.09] px-3 py-1.5 text-[#15803D]">
              {completed} مكتمل
            </span>
            <span className="rounded-full border border-primary/15 bg-primary/[0.07] px-3 py-1.5 text-primary">
              {available} متاح
            </span>
          </div>
        </header>

        {!sessionId || session.isError || !match ? (
          <BoardRecovery />
        ) : !occurrenceMatches ? (
          <BoardRecovery
            href={
              occurrence
                ? `/worlds/${occurrence.worldId}?sessionId=${encodeURIComponent(sessionId)}`
                : MATCH_SETUP_ROUTE
            }
            label="الذهاب إلى العالم الحالي"
          />
        ) : match.stage.key === "world_complete" ? (
          <section className="rounded-3xl border border-[#22C55E]/25 bg-[#22C55E]/[0.06] p-8 text-center">
            <h2 className="text-2xl font-black text-slate-900">اكتمل هذا العالم</h2>
            <Button className="mt-5 rounded-2xl font-black" disabled={advancing} onClick={() => void advance()}>
              {advancing ? "جارٍ الانتقال…" : "الانتقال إلى العالم التالي"}
            </Button>
            {advanceError && <p role="alert" className="mt-3 text-sm text-destructive">{advanceError}</p>}
          </section>
        ) : match.stage.key === "match_complete" ? (
          <section className="rounded-3xl border border-primary/20 bg-white p-8 text-center">
            <h2 className="text-2xl font-black text-slate-900">اكتملت المباراة</h2>
            <Button asChild className="mt-5 rounded-2xl font-black"><Link href={`/matches/${sessionId}`}>عرض النتيجة</Link></Button>
          </section>
        ) : (
          <>

        {worldQuery.isLoading || scopes.isLoading || session.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-3xl border border-black/[0.05] bg-white"
              />
            ))}
          </div>
        ) : worldQuery.isError || scopes.isError ? (
          <JourneyError
            title="تعذر تحميل اللوحة"
            description="تحقّق من اتصالك ثم حاول مرة أخرى."
            onRetry={() => {
              void worldQuery.refetch();
              void scopes.refetch();
            }}
            retrying={worldQuery.isFetching || scopes.isFetching}
          />
        ) : !selectedScopeIds?.length ? (
          <BoardMessage>لم يتم تأكيد نطاقات هذا العالم بعد.</BoardMessage>
        ) : pool.length !== selectedScopeIds.length ? (
          <BoardMessage>
            بعض النطاقات المختارة لم تعد متاحة. اختر النطاقات من جديد.
          </BoardMessage>
        ) : challenges.length ? (
          <ul className="grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {challenges.map((challenge) => (
              <li key={challenge.slot.slotKey}>
                <ChallengeTile challenge={challenge} sessionId={sessionId} />
              </li>
            ))}
          </ul>
        ) : (
          <BoardMessage>
            لا توجد خانات تحدٍّ قابلة للاستخدام في النطاقات المختارة.
          </BoardMessage>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-black/[0.06] bg-white px-6 py-5 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
          <p className="text-sm leading-6 text-slate-500">
            بعد أي تحدٍّ ترجعون هنا، ويبقى الباقي متاحاً.
          </p>
          <Button
            asChild
            variant="outline"
            className="rounded-2xl border-primary/20 bg-white font-black text-primary hover:bg-primary/[0.06] hover:text-primary"
          >
            <Link href={`/worlds/${worldId}?sessionId=${encodeURIComponent(sessionId)}`}>تغيير النطاقات</Link>
          </Button>
        </div>
          </>
        )}
      </div>
    </JourneyShell>
  );
}

function BoardRecovery({
  href = MATCH_SETUP_ROUTE,
  label = "ابدأ لعبة جديدة أولًا",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <section className="rounded-3xl border border-primary/15 bg-white p-8 text-center">
      <p className="font-black text-slate-900">ابدأ لعبة جديدة أولًا</p>
      <Button asChild className="mt-5 rounded-2xl font-black"><Link href={href}>{label}</Link></Button>
    </section>
  );
}

function BoardMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-black/[0.06] bg-white p-10 text-center text-sm leading-6 text-slate-500 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
      {children}
    </div>
  );
}

/**
 * One challenge on the board. Its state is the whole message: selectable,
 * already played, or not open yet.
 */
function ChallengeTile({
  challenge,
  sessionId,
}: {
  challenge: BoardChallenge;
  sessionId?: string;
}) {
  const { slot, availability, lockedReason } = challenge;
  const selectable = availability === "available";
  const playable = selectable && Boolean(sessionId);

  return (
    <article
      aria-label={slot.displayName}
      data-availability={availability}
      className={cn(
        "flex h-full min-h-[11rem] flex-col justify-between rounded-3xl border p-5 shadow-[0_10px_30px_rgba(24,16,54,.05)] transition duration-200",
        availability === "completed" &&
          "border-[#22C55E]/25 bg-[#22C55E]/[0.06]",
        availability === "locked" && "border-black/[0.05] bg-slate-50",
        selectable &&
          "border-black/[0.06] bg-white hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_40px_rgba(91,33,182,.12)]",
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2
            className={cn(
              "text-lg font-black leading-tight",
              availability === "locked" ? "text-slate-400" : "text-slate-900",
            )}
          >
            {slot.displayName}
          </h2>
          {availability === "completed" && (
            <CheckCircle2
              className="h-6 w-6 shrink-0 text-[#15803D]"
              aria-label="مكتمل"
            />
          )}
          {availability === "locked" && (
            <Lock
              className="h-5 w-5 shrink-0 text-slate-300"
              aria-label="مقفل"
            />
          )}
        </div>
        <p
          className={cn(
            "mt-2 text-xs font-bold",
            availability === "completed" && "text-[#15803D]",
            availability === "locked" && "text-slate-400",
            selectable && "text-primary",
          )}
        >
          {availability === "completed"
            ? "مكتمل"
            : availability === "locked"
              ? (lockedReason ?? "غير متاح")
              : "متاح"}
        </p>
      </div>

      {selectable ? (
        <Button
          asChild={playable}
          disabled={!playable}
          className="mt-4 w-full rounded-2xl font-black shadow-[0_8px_20px_rgba(91,33,182,.18)]"
        >
          {playable ? (
            <Link href={`/live-sessions/${sessionId}/screen`}>
              <Play className="ml-2 h-4 w-4 fill-current" aria-hidden="true" />
              ابدأ التحدي
            </Link>
          ) : (
            <span>
              <Play className="ml-2 h-4 w-4 fill-current" aria-hidden="true" />
              ابدأ التحدي
            </span>
          )}
        </Button>
      ) : (
        <p className="mt-4 text-xs leading-5 text-slate-400">
          {availability === "completed"
            ? "تم لعب هذا التحدي في هذه الجلسة."
            : "سيصبح متاحاً عند تجهيزه."}
        </p>
      )}
    </article>
  );
}
