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
import { Spark } from "@/components/akwaan/sticker";
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

  const nothingYet =
    query.data !== undefined &&
    query.data.active.length === 0 &&
    query.data.completed.length === 0 &&
    page === 1;

  return (
    <div
      dir="rtl"
      className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-20 pt-8 sm:px-8 sm:pt-12"
    >
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[40px] font-black leading-[1.3] text-brand-navy sm:text-[56px]">
            مبارياتي
          </h1>
          <p className="mt-2 text-base leading-[1.8] text-brand-slate sm:text-lg">
            كل مباراة لعبتها، واللي ما كملت تقدر تكملها من هنا.
          </p>
        </div>
        {!nothingYet && (
          <Link href="/#worlds" className={GOLD_LINK}>
            مباراة جديدة
          </Link>
        )}
      </header>

      {query.isLoading ? (
        <MyMatchesSkeleton />
      ) : query.isError ? (
        <div className="surface-card grid justify-items-center gap-4 p-10 text-center">
          <p className="font-bold text-brand-navy">تعذر تحميل مبارياتك.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            حاول مرة ثانية
          </Button>
        </div>
      ) : nothingYet ? (
        <div
          data-testid="my-matches-empty"
          className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-[28px] border-[3px] border-brand-navy bg-brand-lavender px-6 py-12 text-center shadow-[6px_7px_0_hsl(var(--brand-navy))]"
        >
          <span
            aria-hidden
            className="grid size-24 place-items-center rounded-full border-[3px] border-brand-navy bg-brand-purple"
          >
            <Spark className="size-10" fill="#fff" />
          </span>
          <h2 className="font-display text-[26px] font-black text-brand-navy sm:text-[32px]">
            ما لعبت ولا مباراة للحين
          </h2>
          <p className="max-w-sm text-base leading-[1.8] text-brand-slate sm:text-lg">
            اختر 3 عوالم، اجمع ربعك، وأول مباراة تطلع لك هنا.
          </p>
          <Link href="/#worlds" className={GOLD_LINK}>
            ابدأ أول مباراة
          </Link>
        </div>
      ) : (
        <div className="space-y-12">
          <MatchSection
            title="مباراة ما كملت"
            empty="ما عندك مباراة جارية حاليًا."
          >
            {query.data?.active.map((match) => (
              <MatchCard key={match.matchId} match={match} worldNames={names} />
            ))}
          </MatchSection>

          <MatchSection
            title="مباريات خلصت"
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
              <span className="akwaan-numeral text-sm font-bold text-brand-slate">
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

const GOLD_LINK =
  "inline-flex min-h-[3.5rem] items-center justify-center rounded-full border-[3px] border-brand-navy bg-brand-gold px-8 font-display text-lg font-extrabold text-brand-navy no-underline shadow-[5px_6px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5 sm:text-xl";

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
          <div className="grid gap-6 md:grid-cols-2">
            {[0, 1].map((card) => (
              <Skeleton key={card} className="h-64 w-full rounded-3xl" />
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
        className="mb-5 font-display text-2xl font-extrabold text-brand-navy sm:text-[28px]"
      >
        {title}
      </h2>
      {hasChildren ? (
        <div className="grid gap-6 md:grid-cols-2">{children}</div>
      ) : (
        <p className="rounded-[20px] border-2 border-dashed border-brand-dash bg-white p-8 text-center text-brand-slate">
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
  // Gregorian with Western digits: the site writes every number one way.
  const date = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
  }).format(new Date(match.completedAt ?? match.createdAt));
  const tie = Boolean(match.result?.tie);
  const total = match.progress.totalChallenges;
  const done = match.progress.completedChallenges;

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-3xl border-[3px] border-brand-navy p-5 sm:p-6",
        // An unfinished Match is the one thing here to act on, so it is the
        // card that stands off the page.
        completed
          ? "bg-brand-paper"
          : "bg-brand-lavender shadow-[6px_7px_0_hsl(var(--brand-navy))]",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-brand-slate">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <span>{date}</span>
        </div>
        {completed ? (
          <span
            className={cn(
              "inline-flex min-h-7 items-center gap-1.5 rounded-full border-2 border-brand-navy px-3 text-xs font-bold text-brand-navy",
              // Gold for a win; lavender for a draw. Never green or red.
              tie || !winner ? "bg-brand-lavender" : "bg-brand-gold",
            )}
          >
            {!tie && winner && <Trophy className="size-3.5" aria-hidden />}
            {tie ? "تعادل" : winner ? `فاز ${winner.name}` : "مكتملة"}
          </span>
        ) : !match.resumable ? (
          <span className="rounded-full border-2 border-brand-dash bg-white px-3 py-1 text-xs font-bold text-brand-plum">
            {match.resumeState === "session_expired"
              ? "انتهت صلاحية الجلسة"
              : "غير متاحة للمتابعة"}
          </span>
        ) : null}
      </div>

      <p className="font-display text-lg font-extrabold leading-relaxed text-brand-navy sm:text-xl">
        {match.occurrences.map((occurrence, index) => (
          <span key={occurrence.occurrenceIndex}>
            {index > 0 && <span className="text-brand-dash"> · </span>}
            {worldNames.get(occurrence.worldId) ?? "عالم"}
          </span>
        ))}
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-[18px] border-2 border-brand-mist bg-white px-4 py-3 text-center">
        {match.teams.slice(0, 2).map((team, index) => (
          <div
            key={team.id}
            className={cn("min-w-0", index === 1 && "col-start-3")}
          >
            <p
              className="truncate text-sm font-bold text-brand-navy sm:text-base"
              title={team.name}
            >
              {team.name}
            </p>
            <p
              className={cn(
                "akwaan-numeral mt-0.5 text-4xl font-bold leading-none",
                completed && (tie || team.id === winner?.id)
                  ? "text-[hsl(40_57%_42%)]"
                  : "text-brand-navy",
              )}
            >
              {team.displayScore}
            </p>
          </div>
        ))}
        <span className="col-start-2 row-start-1 font-display text-sm font-extrabold text-brand-bronze">
          VS
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-brand-slate">
          <span className="akwaan-numeral">
            {done}/{total}
          </span>{" "}
          تحديات مكتملة
        </p>
        {!completed && total > 0 && total <= 24 && (
          <div aria-hidden className="flex flex-wrap gap-1">
            {Array.from({ length: total }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-2.5 min-w-4 flex-1 rounded-full border-2 border-brand-navy",
                  index < done ? "bg-brand-gold" : "bg-white",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {completed ? (
        <Button
          variant="outline"
          className="mt-auto h-12 gap-2 rounded-full border-[3px] border-brand-navy bg-white text-base font-bold text-brand-navy hover:bg-brand-lavender"
          onClick={replay}
        >
          <RotateCcw className="size-4" aria-hidden />
          العب مرة ثانية
        </Button>
      ) : match.resumable ? (
        <Link
          href={`/matches/${match.liveSessionId}`}
          className={cn(GOLD_LINK, "mt-auto gap-2")}
        >
          كمّل المباراة
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      ) : null}
    </article>
  );
}
