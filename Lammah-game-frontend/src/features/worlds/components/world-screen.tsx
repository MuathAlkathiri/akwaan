"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Layers, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JourneyShell, JourneySection } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { ScopeCardMedia } from "./scope-card-media";
import { WorldCover } from "./world-cover";
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
          <div className="h-56 animate-pulse rounded-3xl border border-border bg-card" />
        ) : worldQuery.isError ? (
          <JourneyError
            title="تعذر تحميل العالم"
            description="تحقّق من اتصالك ثم حاول مرة أخرى."
            onRetry={() => void worldQuery.refetch()}
            retrying={worldQuery.isFetching}
          />
        ) : (
          <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-[0_10px_30px_rgba(24,16,54,.05)]">
            <p className="text-lg font-black text-foreground">
              هذا العالم غير متاح
            </p>
            <Button asChild className="mt-6 rounded-[var(--radius)] font-black">
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
                  className="h-60 animate-pulse rounded-3xl border border-border bg-card"
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
            <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm leading-6 text-muted-foreground shadow-[0_10px_30px_rgba(24,16,54,.05)]">
              لا توجد نطاقات جاهزة في هذا العالم بعد.
            </div>
          )}
        </JourneySection>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-primary/15 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
          <p className="text-sm leading-6 text-muted-foreground">
            تُجهَّز المباراة بالكامل قبل أن تبدأ: ثلاث محطات عوالم وأربعة نطاقات
            لكل محطة.
          </p>
          <Button asChild size="lg" className="rounded-[var(--radius)] font-black">
            <Link href={MATCH_SETUP_ROUTE}>
              <Play className="ml-2 h-5 w-5 fill-current" aria-hidden />
              ابدأ مباراة جديدة
            </Link>
          </Button>
        </section>
      </div>
    </JourneyShell>
  );
}

/** A Scope as something to read about, not something to pick. */
function ScopePreviewCard({ scope }: { scope: PlayableScope }) {
  return (
    <article className="group flex h-full min-h-[15rem] flex-col overflow-hidden rounded-3xl border border-border bg-card text-right shadow-[0_10px_30px_rgba(24,16,54,.06)]">
      <ScopeCardMedia scope={scope} />

      <div className="relative -mt-3 flex flex-1 flex-col gap-2 px-5 pb-4">
        <h3 className="text-xl font-black tracking-tight text-foreground">
          {scope.name}
        </h3>
        {scope.description && (
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {scope.description}
          </p>
        )}
        <p className="mt-auto inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-success">
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
    <header className="relative grid items-center gap-6 py-3 md:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] md:py-5">
      <div className="relative mx-auto w-full max-w-[18rem] sm:max-w-[20rem] md:max-w-[22rem]">
        <WorldArtworkAtmosphere world={world} />
        <div className="relative rounded-full border border-primary/15 bg-card p-2 shadow-[0_16px_40px_rgba(24,16,54,.11)]">
          <span
            data-testid="world-hero-artwork"
            className="relative block aspect-square overflow-hidden rounded-full bg-secondary"
          >
            <WorldCover
              world={world}
              sizes="(min-width: 768px) 22rem, 18rem"
              priority
            />
          </span>
        </div>
      </div>

      <div className="min-w-0 text-center md:text-right">
        <div>
          <h1 className="text-3xl font-black text-foreground sm:text-4xl">
            {world.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {world.description || "عالم جاهز للعب."}
          </p>
        </div>
        <WorldStats world={world} className="mt-5 justify-center md:justify-start" />
      </div>
    </header>
  );
}

/** Local atmosphere: the artwork itself supplies the World-specific colour. */
function WorldArtworkAtmosphere({ world }: { world: PlayableWorld }) {
  return (
    <div
      aria-hidden
      data-testid="world-hero-background"
      className="pointer-events-none absolute -inset-9"
    >
      <div className="absolute inset-[15%] overflow-hidden rounded-full opacity-[0.14] blur-3xl scale-110">
        <WorldCover world={world} sizes="22rem" />
      </div>
      <div className="absolute inset-3 rounded-full border border-primary/[0.06]" />
      <div className="absolute inset-0 rounded-full border border-primary/[0.04]" />
      <div className="absolute inset-0 rounded-full opacity-30 bg-[radial-gradient(hsl(var(--foreground)/0.1)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(circle,transparent_45%,black_78%,transparent_100%)]" />
    </div>
  );
}
