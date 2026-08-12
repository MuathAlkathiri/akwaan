"use client";

import { useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARABIC_NOUNS, arabicCount } from "@/lib/arabic-plural";
import { challengeIcon } from "@/features/live-game-session/match/challenge-identity";
import { WorldCover } from "@/features/worlds/components/world-cover";
import {
  fetchPlayableScopes,
  fetchPlayableWorld,
} from "@/features/worlds/api/player-catalog.api";
import type {
  PlayableBoardSlot,
  PlayableScope,
  PlayableWorld,
} from "@/features/worlds/types";
import {
  BOARD_POSITION_COUNT,
  OCCURRENCE_COUNT,
  isOccurrenceComplete,
  occurrenceLabel,
  selectedScopeTotal,
  type DraftOccurrence,
  type MatchSetupDraft,
} from "../state/match-setup-draft";

/** A compact loadout of the three independently configured World occurrences. */
export function MatchSetupReview({
  draft,
  onEditWorld,
  onEditScopes,
  onBack,
  onContinue,
}: {
  draft: MatchSetupDraft;
  onEditWorld: (occurrenceIndex: number) => void;
  onEditScopes: (occurrenceIndex: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  useEffect(() => {
    const frame = window.setTimeout(() => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(frame);
  }, []);

  const worldIds = [
    ...new Set(
      draft.occurrences
        .map((occurrence) => occurrence.worldId)
        .filter((worldId): worldId is string => Boolean(worldId)),
    ),
  ];
  const worlds = useQueries({
    queries: worldIds.map((worldId) => ({
      queryKey: ["player-catalog", "worlds", worldId],
      queryFn: () => fetchPlayableWorld(worldId),
    })),
  });
  const scopes = useQueries({
    queries: worldIds.map((worldId) => ({
      queryKey: ["player-catalog", "worlds", worldId, "scopes"],
      queryFn: () => fetchPlayableScopes(worldId),
    })),
  });
  const worldById = new Map<string, PlayableWorld>(
    worlds
      .map((query) => query.data)
      .filter((world): world is PlayableWorld => Boolean(world))
      .map((world) => [world.id, world]),
  );
  const scopeById = new Map<string, PlayableScope>(
    scopes
      .flatMap((query) => query.data ?? [])
      .map((scope) => [scope.id, scope]),
  );
  const scopeTotal = selectedScopeTotal(draft);
  const readyCount = draft.occurrences.filter(isOccurrenceComplete).length;

  return (
    <section id="match-review" aria-labelledby="match-review-title">
      <header className="mb-5">
        <h1
          id="match-review-title"
          className="font-display text-3xl font-black text-foreground sm:text-4xl"
        >
          راجع مباراتك
        </h1>
        <p className="mt-2 text-sm font-bold text-muted-foreground">
          {OCCURRENCE_COUNT} عوالم · {scopeTotal} نطاق · {BOARD_POSITION_COUNT}{" "}
          تحدي
        </p>
      </header>

      <ol
        className="grid list-none gap-4 md:grid-cols-2 xl:grid-cols-3"
        data-testid="review-world-stations"
      >
        {draft.occurrences.map((occurrence) => (
          <li key={occurrence.occurrenceIndex} className="min-w-0">
            <WorldStation
              occurrence={occurrence}
              world={
                occurrence.worldId
                  ? worldById.get(occurrence.worldId)
                  : undefined
              }
              scopeById={scopeById}
              onEditWorld={onEditWorld}
              onEditScopes={onEditScopes}
            />
          </li>
        ))}
      </ol>

      {draft.issue && (
        <p role="alert" className="mt-4 text-sm font-bold text-destructive">
          {draft.issue.message}
        </p>
      )}

      <footer className="sticky bottom-3 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/95 px-4 py-3 shadow-[0_8px_28px_hsl(var(--foreground)/0.08)] backdrop-blur sm:px-5">
        <p className="text-sm font-bold text-muted-foreground">
          {readyCount}/{OCCURRENCE_COUNT} عوالم جاهزة · {scopeTotal}/
          {BOARD_POSITION_COUNT} نطاق
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="rounded-[var(--radius)] font-black"
          >
            رجوع
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onContinue}
            className="min-w-44 rounded-[var(--radius)] font-black shadow-[0_8px_22px_hsl(var(--primary)/0.18)]"
          >
            متابعة إلى الفريقين
          </Button>
        </div>
      </footer>
    </section>
  );
}

function WorldStation({
  occurrence,
  world,
  scopeById,
  onEditWorld,
  onEditScopes,
}: {
  occurrence: DraftOccurrence;
  world?: PlayableWorld;
  scopeById: Map<string, PlayableScope>;
  onEditWorld: (occurrenceIndex: number) => void;
  onEditScopes: (occurrenceIndex: number) => void;
}) {
  const selected = occurrence.selectedScopeIds
    .map((scopeId) => scopeById.get(scopeId))
    .filter((scope): scope is PlayableScope => Boolean(scope));
  const challenges = [
    ...new Map(
      selected
        .flatMap((scope) => scope.usableSlots)
        .map((slot) => [slot.slotKey, slot]),
    ).values(),
    // By slot, the same order the board uses. Sorting one screen by the slot
    // definition's own `sortOrder` and the other by slot key is how the setup review
    // and the board came to list a World's challenges differently.
  ].sort((left, right) => left.slotKey.localeCompare(right.slotKey));
  const ready = isOccurrenceComplete(occurrence);

  return (
    <article
      data-testid={`review-occurrence-${occurrence.occurrenceIndex}`}
      className="flex h-full min-h-[27.5rem] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_10px_28px_hsl(var(--foreground)/0.055)]"
    >
      <div className="relative h-24 shrink-0 bg-secondary">
        {world && <WorldCover world={world} sizes="(min-width: 1280px) 30vw, 50vw" />}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-primary">
              {occurrenceLabel(occurrence.occurrenceIndex)}
            </p>
            <h2 className="mt-1 truncate font-display text-xl font-black text-foreground">
              {world?.name ?? "…"}
            </h2>
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              {arabicCount(occurrence.selectedScopeIds.length, ARABIC_NOUNS.scope)}{" "}
              · {arabicCount(challenges.length, ARABIC_NOUNS.challenge)}
            </p>
          </div>
          <span
            data-testid="review-ready-state"
            className={
              ready
                ? "inline-flex shrink-0 items-center gap-1 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-black text-success"
                : "shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-black text-destructive"
            }
          >
            {ready && <Check className="size-3.5" aria-hidden />}
            {ready ? "جاهز" : "غير مكتمل"}
          </span>
        </header>

        <section className="mt-3" aria-label="النطاقات المختارة">
          <h3 className="text-xs font-black text-disabled-foreground">النطاقات</h3>
          <ul className="mt-2 flex list-none flex-wrap gap-1.5">
            {occurrence.selectedScopeIds.map((scopeId) => (
              <li
                key={scopeId}
                className="rounded-full border border-primary/10 bg-primary/[0.055] px-2.5 py-1 text-xs font-bold text-primary"
              >
                {scopeById.get(scopeId)?.name ?? "…"}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-3" aria-label="تحديات العالم">
          <h3 className="text-xs font-black text-disabled-foreground">التحديات</h3>
          <ul className="mt-1.5 grid list-none gap-1">
            {challenges.map((challenge) => (
              <ChallengeRow key={challenge.slotKey} challenge={challenge} />
            ))}
          </ul>
        </section>

        <div className="mt-auto flex flex-wrap gap-2 border-t border-border/70 pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onEditScopes(occurrence.occurrenceIndex)}
            className="rounded-[var(--radius)] font-black text-primary"
          >
            <Pencil className="ml-1.5 size-3.5" aria-hidden />
            تعديل النطاقات
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onEditWorld(occurrence.occurrenceIndex)}
            className="rounded-[var(--radius)] font-bold text-muted-foreground"
          >
            تغيير العالم
          </Button>
        </div>
      </div>
    </article>
  );
}

function ChallengeRow({ challenge }: { challenge: PlayableBoardSlot }) {
  const Icon = challengeIcon(challenge.challengeTypeSlug);
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/55 px-2.5 py-1 text-sm font-bold text-foreground">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background text-primary">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="truncate">{challenge.displayName}</span>
    </li>
  );
}

