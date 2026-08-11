"use client";

import Image from "next/image";
import { Check, Layers, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import { ARABIC_NOUNS, arabicNoun } from "@/lib/arabic-plural";
import { WorldArtworkPending } from "@/features/worlds/components/world-cover";
import { JourneySection } from "@/features/worlds/components/journey-shell";
import { JourneyError } from "@/features/worlds/components/journey-error";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { playableWorlds } from "@/features/worlds/utils/featured-worlds";
import type { PlayableWorld } from "@/features/worlds/types";
import { occurrenceLabel } from "../state/match-setup-draft";

/**
 * Choosing the World of one occurrence.
 *
 * A World may be chosen for more than one occurrence, so nothing is deduplicated
 * and nothing is disabled because it was already used: the second Anime is a
 * separate occurrence with its own Scopes and its own four board positions. The
 * step names which occurrence is being configured so a repeat never looks like a
 * mistake.
 */
export function OccurrenceWorldStep({
  occurrenceIndex,
  selectedWorldId,
  alreadyChosenWorldIds,
  onChoose,
}: {
  occurrenceIndex: number;
  selectedWorldId: string | null;
  /** Worlds already used at earlier occurrences, labelled rather than blocked. */
  alreadyChosenWorldIds: string[];
  onChoose: (worldId: string) => void;
}) {
  const query = usePlayableWorlds();
  const worlds = query.isSuccess ? playableWorlds(query.data) : [];

  return (
    <JourneySection
      id="occurrence-world"
      title={`اختر ${occurrenceLabel(occurrenceIndex)}`}
      description="بعد اختيار العالم تختار نطاقاته الأربعة. يمكن تكرار العالم نفسه في محطة أخرى."
    >
      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-52 animate-pulse rounded-3xl border border-border bg-card"
            />
          ))}
        </div>
      ) : query.isError ? (
        <JourneyError
          title="تعذر تحميل العوالم"
          description="تحقّق من اتصالك ثم حاول مرة أخرى."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : worlds.length ? (
        <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {worlds.map((world) => (
            <li key={world.id}>
              <WorldChoiceCard
                world={world}
                selected={world.id === selectedWorldId}
                repeated={alreadyChosenWorldIds.includes(world.id)}
                onChoose={onChoose}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-3xl border border-border bg-card p-10 text-center text-sm leading-6 text-muted-foreground">
          لا توجد عوالم جاهزة للعب بعد.
        </p>
      )}
    </JourneySection>
  );
}

function WorldChoiceCard({
  world,
  selected,
  repeated,
  onChoose,
}: {
  world: PlayableWorld;
  selected: boolean;
  repeated: boolean;
  onChoose: (worldId: string) => void;
}) {
  const cover = getMediaUrl(world.banner?.url ?? world.icon?.url);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={world.name}
      onClick={() => onChoose(world.id)}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border bg-card text-right shadow-[0_10px_30px_rgba(24,16,54,.06)] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
        selected
          ? "border-primary/45 ring-2 ring-primary/20"
          : "border-border hover:-translate-y-0.5 hover:border-primary/25",
      )}
    >
      {/* The same pending plate the home grid uses. A World waiting for artwork
          must not look like two different problems on two screens. */}
      <span
        className="relative -mx-px -mt-px mb-px block h-28 w-[calc(100%+2px)] overflow-hidden bg-primary/[0.06]"
        data-has-artwork={cover ? "true" : "false"}
      >
        {cover ? (
          <>
            <Image
              src={cover}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          </>
        ) : (
          <WorldArtworkPending />
        )}
        {selected && (
          <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-5 w-5" aria-hidden />
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-2 px-5 pb-5">
        <span className="flex items-center gap-2">
          <span className="block text-lg font-black text-foreground">
            {world.name}
          </span>
          {repeated && (
            <span className="rounded-full border border-primary/20 bg-primary/[0.07] px-2 py-0.5 text-xs font-black text-primary">
              مُختار في محطة أخرى
            </span>
          )}
        </span>
        {world.description && (
          <span className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {world.description}
          </span>
        )}
        <span className="mt-auto flex flex-wrap gap-3 pt-1 text-xs font-bold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{world.scopeCount}</span>{" "}
            {arabicNoun(world.scopeCount, ARABIC_NOUNS.scope)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Puzzle className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">
              {world.challengeConfigurationCount}
            </span>{" "}
            {arabicNoun(
              world.challengeConfigurationCount,
              ARABIC_NOUNS.challenge,
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Back out of a World step without losing the other occurrences. */
export function StepFooter({
  onBack,
  backDisabled,
  children,
}: {
  onBack: () => void;
  backDisabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card px-6 py-5 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
      <Button
        type="button"
        variant="outline"
        disabled={backDisabled}
        onClick={onBack}
        className="rounded-[var(--radius)] font-black"
      >
        رجوع
      </Button>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
