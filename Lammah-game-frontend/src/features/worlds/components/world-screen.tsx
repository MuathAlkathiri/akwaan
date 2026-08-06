"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Layers, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import { JourneyShell, JourneySection } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { WorldCover, WorldIcon, washFor } from "./world-cover";
import { WorldStats } from "./world-stats";
import {
  usePlayableScopes,
  usePlayableWorld,
} from "../hooks/use-player-catalog";
import { isSelectableScope } from "../utils/scopes";
import type { PlayableScope, PlayableWorld } from "../types";
// The route only; importing the wizard itself would make worlds depend on setup.
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";

/**
 * A World, to look at.
 *
 * Browsing only. A Match is configured whole before it exists — three World
 * occurrences with four Scopes each — so this screen chooses nothing and starts
 * nothing; its one call to action is the setup wizard. Anything else here would be
 * a second way to run a Match.
 *
 * The three outcomes of loading are kept apart — still loading, failed, or
 * genuinely empty. Collapsing a failure into "nothing is ready" is what made this
 * screen look empty while its World was fully authored.
 */
export function WorldScreen({ worldId }: { worldId: string }) {
  const worldQuery = usePlayableWorld(worldId);
  const scopes = usePlayableScopes(worldId);
  const world = worldQuery.data;
  const regions = useMemo(
    () =>
      (scopes.isSuccess ? scopes.data : [])
        .filter(isSelectableScope)
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [scopes.data, scopes.isSuccess],
  );

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

        <JourneySection
          id="world-scopes"
          title="نطاقات هذا العالم"
          description="كل محطة في المباراة تُلعب من أربعة نطاقات من عالمها."
        >
          {scopes.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-60 animate-pulse rounded-3xl border border-black/[0.05] bg-white"
                />
              ))}
            </div>
          ) : scopes.isError ? (
            <JourneyError
              title="تعذر تحميل النطاقات"
              description="حاول مرة أخرى"
              onRetry={() => void scopes.refetch()}
              retrying={scopes.isFetching}
            />
          ) : regions.length ? (
            <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {regions.map((scope) => (
                <li key={scope.id}>
                  <ScopePreviewCard scope={scope} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-3xl border border-black/[0.06] bg-white p-10 text-center text-sm leading-6 text-slate-500 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
              لا توجد نطاقات جاهزة في هذا العالم بعد.
            </div>
          )}
        </JourneySection>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-primary/15 bg-white px-6 py-5 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
          <p className="text-sm leading-6 text-slate-500">
            تُجهَّز المباراة بالكامل قبل أن تبدأ: ثلاث محطات عوالم وأربعة نطاقات
            لكل محطة.
          </p>
          <Button asChild size="lg" className="rounded-2xl font-black">
            <Link href={MATCH_SETUP_ROUTE}>
              <Play className="ml-2 h-5 w-5 fill-current" aria-hidden />
              ابدأ لعبة جديدة
            </Link>
          </Button>
        </section>
      </div>
    </JourneyShell>
  );
}

/** A Scope as something to read about, not something to pick. */
function ScopePreviewCard({ scope }: { scope: PlayableScope }) {
  const imageUrl = getMediaUrl(scope.image?.url);

  return (
    <article className="flex h-full min-h-[14rem] flex-col overflow-hidden rounded-3xl border border-black/[0.06] bg-white text-right shadow-[0_10px_30px_rgba(24,16,54,.06)]">
      <span className="relative block h-28 w-full overflow-hidden">
        <span
          className={cn(
            "absolute inset-0 bg-gradient-to-bl",
            washFor(scope.slug || scope.id),
          )}
        />
        {imageUrl && (
          <Image
            src={imageUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent" />
      </span>

      <div className="flex flex-1 flex-col gap-2 px-5 pb-5">
        <h3 className="text-lg font-black text-slate-900">{scope.name}</h3>
        {scope.description && (
          <p className="line-clamp-2 text-sm leading-6 text-slate-500">
            {scope.description}
          </p>
        )}
        <p className="mt-auto inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-[#15803D]">
          <Layers className="h-4 w-4" aria-hidden="true" />
          <span className="tabular-nums">{scope.readyContentItemCount}</span>
          عنصر جاهز
        </p>
      </div>
    </article>
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
