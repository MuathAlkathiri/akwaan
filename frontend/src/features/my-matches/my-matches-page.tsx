"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/auth/require-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MATCH_SETUP_ROUTE, writeStoredDraft } from "@/features/match-setup";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { cn } from "@/lib/utils";
import { createReplayDraft } from "./replay";
import type { MyMatchSummary } from "./types";
import { useMyMatches } from "./use-my-matches";

export function MyMatchesPage() {
  return (
    <RequireAuth>
      <MyMatchesContent />
    </RequireAuth>
  );
}

function MyMatchesContent() {
  const [page, setPage] = useState(1);
  const query = useMyMatches(page);
  const worlds = usePlayableWorlds(true);
  const names = useMemo(
    () => new Map((worlds.data ?? []).map((world) => [world.id, world.name])),
    [worlds.data],
  );

  return (
    <div
      dir="rtl"
      className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14"
    >
      <header className="mb-10 text-center">
        <p className="mb-2 text-sm font-bold text-[hsl(var(--brand-gold))]">
          سجل مبارياتك
        </p>
        <h1 className="font-display text-4xl font-black text-[hsl(var(--brand-navy))] sm:text-5xl">
          مبارياتي
        </h1>
      </header>

      {query.isLoading ? (
        <MyMatchesSkeleton />
      ) : query.isError ? (
        <div className="surface-card grid justify-items-center gap-4 p-10 text-center">
          <p className="font-bold text-foreground">تعذر تحميل مبارياتك.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            حاول مرة ثانية
          </Button>
        </div>
      ) : (
        <div className="space-y-12">
          <MatchSection
            title="مباريات جارية"
            empty="ما عندك مباراة جارية حاليًا."
          >
            {query.data?.active.map((match) => (
              <MatchCard key={match.matchId} match={match} worldNames={names} />
            ))}
          </MatchSection>

          <MatchSection
            title="مباريات سابقة"
            empty="ما لعبت مباريات مكتملة حتى الآن."
          >
            {query.data?.completed.map((match) => (
              <MatchCard
                key={match.matchId}
                match={match}
                worldNames={names}
                completed
              />
            ))}
          </MatchSection>

          {(page > 1 || query.data?.pagination.hasMore) && (
            <nav
              aria-label="صفحات المباريات السابقة"
              className="flex items-center justify-center gap-3"
            >
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                الأحدث
              </Button>
              <span className="akwaan-numeral text-sm font-bold text-muted-foreground">
                {page}
              </span>
              <Button
                variant="outline"
                disabled={!query.data?.pagination.hasMore}
                onClick={() => setPage((value) => value + 1)}
              >
                الأقدم
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The initial-query placeholder: the real two-section, two-column card geometry
 * so the list resolves in place without a layout shift. The page header and site
 * shell stay put; only the card area is a skeleton.
 */
function MyMatchesSkeleton() {
  return (
    <div className="space-y-12" data-testid="my-matches-skeleton" aria-hidden>
      {[0, 1].map((section) => (
        <section key={section}>
          <Skeleton className="mb-5 h-8 w-40 rounded-lg" />
          <div className="grid gap-5 md:grid-cols-2">
            {[0, 1].map((card) => (
              <Skeleton
                key={card}
                className="h-64 w-full rounded-[1.5rem]"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children?: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <section aria-labelledby={`section-${title}`}>
      <h2
        id={`section-${title}`}
        className="mb-5 font-display text-2xl font-black text-[hsl(var(--brand-navy))]"
      >
        {title}
      </h2>
      {hasChildren ? (
        <div className="grid gap-5 md:grid-cols-2">{children}</div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-white/65 p-8 text-center text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

function MatchCard({
  match,
  worldNames,
  completed = false,
}: {
  match: MyMatchSummary;
  worldNames: Map<string, string>;
  completed?: boolean;
}) {
  const router = useRouter();
  const replay = () => {
    try {
      writeStoredDraft(createReplayDraft(match));
      router.push(MATCH_SETUP_ROUTE);
    } catch {
      toast.error("تعذر تجهيز هذه المباراة للعب مرة ثانية.");
    }
  };
  const winner = match.result?.winnerTeamId
    ? match.teams.find((team) => team.id === match.result?.winnerTeamId)
    : undefined;
  const date = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
    new Date(match.completedAt ?? match.createdAt),
  );
  return (
    <article className="flex min-w-0 flex-col gap-5 rounded-[1.5rem] border border-[hsl(var(--brand-gold)/.28)] bg-white/85 p-5 shadow-[0_18px_44px_-34px_hsl(var(--brand-navy)/.4)] sm:p-6">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-muted-foreground">
          <CalendarDays
            className="size-4 shrink-0 text-[hsl(var(--brand-gold))]"
            aria-hidden
          />
          <span>{date}</span>
        </div>
        {completed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--brand-gold)/.1)] px-3 py-1 text-xs font-black text-[hsl(var(--brand-navy))]">
            <Trophy
              className="size-3.5 text-[hsl(var(--brand-gold))]"
              aria-hidden
            />
            {match.result?.tie
              ? "تعادل"
              : winner
                ? `فاز ${winner.name}`
                : "مكتملة"}
          </span>
        ) : !match.resumable ? (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
            {match.resumeState === "session_expired"
              ? "انتهت صلاحية الجلسة"
              : "غير متاحة للمتابعة"}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center">
        {match.teams.slice(0, 2).map((team, index) => (
          <div
            key={team.id}
            className={cn("min-w-0", index === 1 && "col-start-3")}
          >
            <p
              className="truncate font-display text-base font-black text-foreground"
              title={team.name}
            >
              {team.name}
            </p>
            <p className="akwaan-numeral mt-1 text-3xl font-black text-[hsl(var(--brand-navy))]">
              {team.displayScore}
            </p>
          </div>
        ))}
        <span className="col-start-2 row-start-1 text-xs font-black text-[hsl(var(--brand-gold))]">
          VS
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {match.occurrences.map((occurrence) => (
          <span
            key={occurrence.occurrenceIndex}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-bold text-[hsl(var(--brand-navy)/.72)]"
          >
            {worldNames.get(occurrence.worldId) ?? "عالم"}
          </span>
        ))}
      </div>

      <p className="akwaan-numeral text-sm font-bold text-muted-foreground">
        {match.progress.completedChallenges}/{match.progress.totalChallenges}{" "}
        تحديات مكتملة
      </p>

      {completed ? (
        <Button className="mt-auto gap-2" onClick={replay}>
          <RotateCcw className="size-4" aria-hidden />
          العب مرة ثانية
        </Button>
      ) : match.resumable ? (
        <Button asChild className="mt-auto gap-2">
          <Link href={`/matches/${match.liveSessionId}`}>
            كمّل المباراة
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </article>
  );
}
