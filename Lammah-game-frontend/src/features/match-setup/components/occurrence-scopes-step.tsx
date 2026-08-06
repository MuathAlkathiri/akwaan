"use client";

import Image from "next/image";
import { Check, Layers, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import { JourneySection } from "@/features/worlds/components/journey-shell";
import { JourneyError } from "@/features/worlds/components/journey-error";
import {
  usePlayableScopes,
  usePlayableWorld,
} from "@/features/worlds/hooks/use-player-catalog";
import { isSelectableScope } from "@/features/worlds/utils/challenge-availability";
import type { PlayableScope } from "@/features/worlds/types";
import {
  SCOPES_PER_OCCURRENCE,
  occurrenceLabel,
} from "../state/match-setup-draft";
import { StepFooter } from "./occurrence-world-step";

/**
 * The four Scopes of one occurrence.
 *
 * Exactly four, always: three cannot continue and a fifth is refused until one is
 * released. The Scopes belong to this occurrence alone — a repeated World answers
 * this step again, and the two pools stay independent.
 */
export function OccurrenceScopesStep({
  occurrenceIndex,
  worldId,
  selectedScopeIds,
  issue,
  onToggle,
  onBack,
  onChangeWorld,
  onClear,
  onConfirm,
}: {
  occurrenceIndex: number;
  worldId: string;
  selectedScopeIds: string[];
  issue?: string;
  onToggle: (scopeId: string) => void;
  onBack: () => void;
  onChangeWorld: () => void;
  onClear: () => void;
  onConfirm: () => void;
}) {
  const world = usePlayableWorld(worldId);
  const query = usePlayableScopes(worldId);
  // A Scope with no usable board position cannot supply a challenge, so it is
  // never offered — the count is supporting information, not the gate.
  const scopes = (query.isSuccess ? query.data : [])
    .filter(isSelectableScope)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const complete = selectedScopeIds.length === SCOPES_PER_OCCURRENCE;

  return (
    <JourneySection
      id="occurrence-scopes"
      title={`اختر 4 نطاقات لهذا العالم`}
      description={`${occurrenceLabel(occurrenceIndex)} — ${world.data?.name ?? "العالم"}. كل تحديات هذه المحطة تُسحب من هذه النطاقات وحدها.`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="scope-count"
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-black tabular-nums",
              complete
                ? "border-[#22C55E]/25 bg-[#22C55E]/[0.09] text-[#15803D]"
                : "border-primary/15 bg-primary/[0.07] text-primary",
            )}
          >
            {selectedScopeIds.length}/{SCOPES_PER_OCCURRENCE}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={onChangeWorld}
            className="rounded-2xl font-black"
          >
            تغيير العالم
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="rounded-2xl font-black text-slate-500"
          >
            إفراغ هذه المحطة
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {query.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-56 animate-pulse rounded-3xl border border-black/[0.05] bg-white"
              />
            ))}
          </div>
        ) : query.isError ? (
          <JourneyError
            title="تعذر تحميل النطاقات"
            description="تحقّق من اتصالك ثم حاول مرة أخرى."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : scopes.length ? (
          <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scopes.map((scope) => (
              <li key={scope.id}>
                <ScopeChoiceCard
                  scope={scope}
                  selected={selectedScopeIds.includes(scope.id)}
                  // The fifth pick is refused, not queued.
                  disabled={complete && !selectedScopeIds.includes(scope.id)}
                  onToggle={onToggle}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl border border-black/[0.06] bg-white p-10 text-center text-sm leading-6 text-slate-500">
            لا توجد نطاقات جاهزة في هذا العالم بعد. اختر عالماً آخر لهذه المحطة.
          </p>
        )}

        {issue && (
          <p role="alert" className="text-sm font-bold text-destructive">
            {issue}
          </p>
        )}

        <StepFooter onBack={onBack}>
          <p className="text-sm leading-6 text-slate-500">
            {complete
              ? "هذه المحطة جاهزة."
              : `اختر ${SCOPES_PER_OCCURRENCE - selectedScopeIds.length} نطاقات إضافية.`}
          </p>
          <Button
            type="button"
            size="lg"
            disabled={!complete}
            onClick={onConfirm}
            className="min-w-40 rounded-2xl font-black"
          >
            متابعة
          </Button>
        </StepFooter>
      </div>
    </JourneySection>
  );
}

function ScopeChoiceCard({
  scope,
  selected,
  disabled,
  onToggle,
}: {
  scope: PlayableScope;
  selected: boolean;
  disabled: boolean;
  onToggle: (scopeId: string) => void;
}) {
  const imageUrl = getMediaUrl(scope.image?.url);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={scope.name}
      disabled={disabled}
      onClick={() => onToggle(scope.id)}
      className={cn(
        "group relative flex h-full min-h-[13rem] w-full flex-col overflow-hidden rounded-3xl border bg-white text-right shadow-[0_10px_30px_rgba(24,16,54,.06)] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
        selected
          ? "border-primary/45 ring-2 ring-primary/20"
          : "border-black/[0.06] hover:-translate-y-0.5 hover:border-primary/25",
      )}
    >
      <span className="relative block h-24 w-full overflow-hidden bg-primary/[0.06]">
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
        {selected && (
          <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-5 w-5" aria-hidden />
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-2 px-5 pb-5">
        <span className="block text-lg font-black text-slate-900">
          {scope.name}
        </span>
        {scope.description && (
          <span className="line-clamp-2 text-sm leading-6 text-slate-500">
            {scope.description}
          </span>
        )}
        <span className="mt-auto flex flex-wrap gap-3 pt-1 text-xs font-bold text-slate-500">
          <span className="inline-flex items-center gap-1.5 text-[#15803D]">
            <Layers className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{scope.readyContentItemCount}</span>
            عنصر جاهز
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swords className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{scope.usableSlots.length}</span>
            تحدٍ متاح
          </span>
        </span>
      </span>
    </button>
  );
}
