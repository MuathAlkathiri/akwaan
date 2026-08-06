"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { JourneyShell, JourneySection } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { ScopeSelection, SCOPES_PER_OCCURRENCE } from "./scope-selection";
import { WorldCover, WorldIcon } from "./world-cover";
import { WorldStats } from "./world-stats";
import { useScopePoolSelection } from "../hooks/use-scope-pool-selection";
import {
  usePlayableScopes,
  usePlayableWorld,
} from "../hooks/use-player-catalog";
import { isSelectableScope } from "../utils/challenge-availability";
import type { PlayableWorld } from "../types";
import { getLiveSession } from "@/features/live-game-session/api/live-session-api";
import { listMatchScopes } from "@/features/live-game-session/match/api/match-api";
// The route only; importing the wizard itself would make worlds depend on setup.
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";

/**
 * Entering a World means choosing the four Scopes this occurrence is played
 * from. A Scope is never a game on its own: the four together are the content
 * pool that every challenge on the occurrence's board draws from.
 *
 * The three outcomes of loading are kept apart — still loading, failed, or
 * genuinely empty. Collapsing a failure into "nothing is ready" is what made
 * this screen look empty while its World was fully authored.
 */
export function WorldScreen({
  worldId,
  sessionId,
}: {
  worldId: string;
  sessionId?: string;
}) {
  const worldQuery = usePlayableWorld(worldId);
  const scopes = usePlayableScopes(worldId);
  const session = useQuery({
    queryKey: ["match-journey-session", sessionId],
    queryFn: () => getLiveSession(sessionId as string),
    enabled: Boolean(sessionId),
    staleTime: 0,
  });
  const occurrence = session.data?.match?.currentOccurrence;
  const occurrenceMatches = occurrence?.worldId === worldId;
  const offeredScopes = useQuery({
    queryKey: ["match-journey-scopes", sessionId, occurrence?.index],
    queryFn: () => listMatchScopes(sessionId as string),
    enabled: Boolean(sessionId && occurrenceMatches),
    staleTime: 0,
  });
  const offeredIds = useMemo(
    () => new Set((offeredScopes.data ?? []).map((scope) => scope.scopeId)),
    [offeredScopes.data],
  );
  const world = worldQuery.data;
  const regions = useMemo(
    () =>
      (scopes.isSuccess ? scopes.data : [])
        .filter((scope) => !sessionId || offeredIds.has(scope.id))
        .filter(isSelectableScope)
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [offeredIds, scopes.data, scopes.isSuccess, sessionId],
  );
  const pool = useScopePoolSelection(sessionId);
  const [confirming, setConfirming] = useState(false);

  if (!world) {
    return (
      <JourneyShell trail={[{ label: "العوالم", href: "/" }]}>
        {worldQuery.isLoading ? (
          <div className="h-56 animate-pulse rounded-3xl border border-black/[0.05] bg-white" />
        ) : worldQuery.isError ? (
          <JourneyError
            title="تعذر تحميل العالم"
            description="تحقّق من اتصالك ثم حاول مرة أخرى."
            onRetry={() => void worldQuery.refetch()}
            retrying={worldQuery.isFetching}
          />
        ) : (
          <div className="rounded-3xl border border-black/[0.06] bg-white p-10 text-center shadow-[0_10px_30px_rgba(24,16,54,.05)]">
            <p className="text-lg font-black text-slate-900">
              هذا العالم غير متاح
            </p>
            <Button asChild className="mt-6 rounded-2xl font-black">
              <Link href="/">العودة للعوالم</Link>
            </Button>
          </div>
        )}
      </JourneyShell>
    );
  }

  return (
    <JourneyShell
      trail={[{ label: "العوالم", href: "/" }, { label: world.name }]}
    >
      <div className="space-y-10">
        <WorldHeader world={world} />

        {!sessionId ? (
          <RecoveryCard />
        ) : session.isLoading ? (
          <div className="h-32 animate-pulse rounded-3xl bg-white" />
        ) : session.isError || !session.data?.match ? (
          <RecoveryCard message="تعذر استعادة المباراة المرتبطة بهذا العالم." />
        ) : !occurrenceMatches ? (
          <RecoveryCard
            message="هذا العالم ليس الدور الحالي في المباراة."
            href={
              occurrence
                ? `/worlds/${occurrence.worldId}?sessionId=${encodeURIComponent(sessionId)}`
                : MATCH_SETUP_ROUTE
            }
            label="الذهاب إلى العالم الحالي"
          />
        ) : (

        <JourneySection
          id="world-scopes"
          title={`اختر ${SCOPES_PER_OCCURRENCE} نطاقات`}
          description="النطاقات الأربعة تكوّن مخزون المحتوى لهذا العالم."
        >
          {scopes.isLoading || offeredScopes.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-60 animate-pulse rounded-3xl border border-black/[0.05] bg-white"
                />
              ))}
            </div>
          ) : scopes.isError || offeredScopes.isError ? (
            <JourneyError
              title="تعذر تحميل النطاقات"
              description="حاول مرة أخرى"
              onRetry={() => {
                void scopes.refetch();
                void offeredScopes.refetch();
              }}
              retrying={scopes.isFetching || offeredScopes.isFetching}
            />
          ) : regions.length ? (
            <ScopeSelection
              scopes={regions}
              selectedScopeIds={pool.selectedScopeIds}
              onToggle={pool.toggle}
              confirming={confirming}
              error={pool.error}
              onConfirm={() => {
                setConfirming(true);
                void pool.confirm(world).finally(() => setConfirming(false));
              }}
            />
          ) : (
            <div className="rounded-3xl border border-black/[0.06] bg-white p-10 text-center text-sm leading-6 text-slate-500 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
              لا توجد نطاقات جاهزة في هذا العالم بعد.
            </div>
          )}
        </JourneySection>
        )}
      </div>
    </JourneyShell>
  );
}

function RecoveryCard({
  message = "ابدأ لعبة جديدة أولًا",
  href = MATCH_SETUP_ROUTE,
  label = "ابدأ لعبة جديدة أولًا",
}: {
  message?: string;
  href?: string;
  label?: string;
}) {
  return (
    <section className="rounded-3xl border border-primary/15 bg-white p-8 text-center shadow-[0_10px_30px_rgba(24,16,54,.05)]">
      <p className="font-black text-slate-900">{message}</p>
      <Button asChild className="mt-5 rounded-2xl font-black">
        <Link href={href}>{label}</Link>
      </Button>
    </section>
  );
}

function WorldHeader({ world }: { world: PlayableWorld }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-[0_10px_30px_rgba(24,16,54,.06)]">
      <span className="relative block h-36 w-full sm:h-44">
        <WorldCover world={world} sizes="100vw" priority />
      </span>
      <div className="relative -mt-10 flex flex-wrap items-end gap-4 px-6 pb-6">
        <WorldIcon world={world} className="h-20 w-20" />
        <div className="min-w-0 flex-1 pb-1">
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">
            {world.name}
          </h1>
          {world.description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {world.description}
            </p>
          )}
        </div>
        <WorldStats world={world} className="pb-1" />
      </div>
    </header>
  );
}
