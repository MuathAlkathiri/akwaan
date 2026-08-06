"use client";

import { useQueries } from "@tanstack/react-query";
import { Layers, Shuffle, Smartphone, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JourneySection } from "@/features/worlds/components/journey-shell";
import {
  fetchPlayableScopes,
  fetchPlayableWorld,
} from "@/features/worlds/api/player-catalog.api";
import type { PlayableScope, PlayableWorld } from "@/features/worlds/types";
import {
  BOARD_POSITION_COUNT,
  OCCURRENCE_COUNT,
  SCOPES_PER_OCCURRENCE,
  occurrenceLabel,
  type DraftOccurrence,
  type MatchSetupDraft,
} from "../state/match-setup-draft";
import { StepFooter } from "./occurrence-world-step";

/**
 * The whole Match, before anything exists on the server.
 *
 * All three occurrences are listed separately even when two share a World: they
 * are independent, with their own four Scopes and their own four board positions.
 * Nothing here shows a session code or a QR — no session has been created yet.
 */
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
  const worldIds = [
    ...new Set(
      draft.occurrences
        .map((occurrence) => occurrence.worldId)
        .filter((worldId): worldId is string => Boolean(worldId)),
    ),
  ];
  // A repeated World is fetched once; its two occurrences still keep their own
  // Scope pools.
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

  return (
    <JourneySection
      id="match-review"
      title="مراجعة المباراة"
      description="ثلاث محطات مستقلة. راجعها قبل إنشاء المباراة."
    >
      <div className="space-y-5">
        <Summary />

        <ol className="grid list-none gap-4">
          {draft.occurrences.map((occurrence) => (
            <li key={occurrence.occurrenceIndex}>
              <OccurrenceReviewCard
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
          <p role="alert" className="text-sm font-bold text-destructive">
            {draft.issue.message}
          </p>
        )}

        <StepFooter onBack={onBack}>
          <Button
            type="button"
            size="lg"
            onClick={onContinue}
            className="min-w-44 rounded-2xl font-black"
          >
            متابعة إلى الفريقين
          </Button>
        </StepFooter>
      </div>
    </JourneySection>
  );
}

function Summary() {
  const facts = [
    { icon: Swords, text: `${OCCURRENCE_COUNT} عوالم` },
    { icon: Layers, text: `${BOARD_POSITION_COUNT} نطاقًا مختارًا` },
    { icon: Swords, text: `${BOARD_POSITION_COUNT} تحديًا على البورد` },
    { icon: Shuffle, text: "يمكن اختيار التحديات بأي ترتيب" },
    { icon: Smartphone, text: "بعض التحديات قد تحتاج جوالات بعد بدء المباراة" },
  ];
  return (
    <ul
      data-testid="review-summary"
      className="grid list-none gap-3 rounded-3xl border border-black/[0.06] bg-white p-6 shadow-[0_10px_30px_rgba(24,16,54,.05)] sm:grid-cols-2"
    >
      {facts.map((fact) => (
        <li
          key={fact.text}
          className="flex items-center gap-2 text-sm font-bold text-slate-600"
        >
          <fact.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {fact.text}
        </li>
      ))}
    </ul>
  );
}

function OccurrenceReviewCard({
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
  const selected = occurrence.selectedScopeIds.map(
    (scopeId) => scopeById.get(scopeId),
  );
  // The four configured mechanics of this occurrence's World, read from the
  // Scopes' usable positions — the same source the board will be built from.
  const challengeNames = [
    ...new Map(
      selected
        .flatMap((scope) => scope?.usableSlots ?? [])
        .map((slot) => [slot.slotKey, slot]),
    ).values(),
  ]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((slot) => slot.displayName);

  return (
    <article
      data-testid={`review-occurrence-${occurrence.occurrenceIndex}`}
      className="rounded-3xl border border-black/[0.06] bg-white p-6 shadow-[0_10px_30px_rgba(24,16,54,.05)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-primary">
            {occurrenceLabel(occurrence.occurrenceIndex)}
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-900">
            {world?.name ?? "…"}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onEditWorld(occurrence.occurrenceIndex)}
            className="rounded-2xl font-black"
          >
            تغيير العالم
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onEditScopes(occurrence.occurrenceIndex)}
            className="rounded-2xl font-black"
          >
            تغيير النطاقات
          </Button>
        </div>
      </header>

      <p className="mt-4 text-xs font-black text-slate-400">
        النطاقات ({occurrence.selectedScopeIds.length}/{SCOPES_PER_OCCURRENCE})
      </p>
      <ul className="mt-2 flex list-none flex-wrap gap-2">
        {occurrence.selectedScopeIds.map((scopeId) => (
          <li
            key={scopeId}
            className="rounded-2xl border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-sm font-bold text-primary"
          >
            {scopeById.get(scopeId)?.name ?? "…"}
          </li>
        ))}
      </ul>

      {challengeNames.length > 0 && (
        <>
          <p className="mt-4 text-xs font-black text-slate-400">
            التحديات ({challengeNames.length})
          </p>
          <ul className="mt-2 flex list-none flex-wrap gap-2">
            {challengeNames.map((name) => (
              <li
                key={name}
                className="rounded-2xl border border-black/[0.07] bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-600"
              >
                {name}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
