"use client";

import Image from "next/image";
import { Check, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlayableScope } from "../types";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import { washFor } from "./world-cover";

/** A World occurrence is played from exactly this many Scopes. */
export const SCOPES_PER_OCCURRENCE = 4;

/**
 * Choosing the content pool of one World occurrence.
 *
 * The Scopes are selection cards, not links: a Scope is never a game on its own,
 * it is one quarter of the pool the occurrence's challenges draw from. Nothing
 * here is authoritative — the confirmed selection is sent to the Match, and the
 * Match decides.
 */
export function ScopeSelection({
  scopes,
  selectedScopeIds,
  onToggle,
  onConfirm,
  confirming = false,
  error,
  confirmLabel = "ابدأ اللعب",
}: {
  scopes: PlayableScope[];
  selectedScopeIds: string[];
  onToggle: (scopeId: string) => void;
  onConfirm: () => void;
  confirming?: boolean;
  error?: string;
  confirmLabel?: string;
}) {
  const complete = selectedScopeIds.length === SCOPES_PER_OCCURRENCE;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-slate-500">
          اختاروا {SCOPES_PER_OCCURRENCE} نطاقات لهذا العالم. كل تحديات اللوحة
          تُسحب من هذه النطاقات.
        </p>
        <span
          data-testid="scope-selection-count"
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-black tabular-nums",
            complete
              ? "border-[#22C55E]/25 bg-[#22C55E]/[0.09] text-[#15803D]"
              : "border-primary/15 bg-primary/[0.07] text-primary",
          )}
        >
          {selectedScopeIds.length}/{SCOPES_PER_OCCURRENCE}
        </span>
      </div>

      <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scopes.map((scope) => (
          <li key={scope.id}>
            <ScopeSelectionCard
              scope={scope}
              selected={selectedScopeIds.includes(scope.id)}
              // A fifth pick is refused until one is released.
              disabled={complete && !selectedScopeIds.includes(scope.id)}
              onToggle={onToggle}
            />
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-black/[0.06] bg-white px-6 py-5 shadow-[0_10px_30px_rgba(24,16,54,.05)]">
        <p className="text-sm leading-6 text-slate-500">
          {complete
            ? "جاهزون. اللوحة تفتح بعد التأكيد."
            : `اختاروا ${SCOPES_PER_OCCURRENCE - selectedScopeIds.length} نطاقات إضافية.`}
        </p>
        <Button
          type="button"
          size="lg"
          disabled={!complete || confirming}
          onClick={onConfirm}
          className="min-w-44 rounded-2xl font-black shadow-[0_10px_26px_rgba(91,33,182,.2)]"
        >
          {confirming ? "جارٍ التأكيد..." : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function ScopeSelectionCard({
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
        "group relative flex h-full min-h-[14rem] w-full flex-col overflow-hidden rounded-3xl border bg-white text-right shadow-[0_10px_30px_rgba(24,16,54,.06)] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
        selected
          ? "border-primary/45 ring-2 ring-primary/20"
          : "border-black/[0.06] hover:-translate-y-0.5 hover:border-primary/25",
      )}
    >
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
        {selected && (
          <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(91,33,182,.3)]">
            <Check className="h-5 w-5" aria-hidden="true" />
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
        <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-[#15803D]">
          <Layers className="h-4 w-4" aria-hidden="true" />
          <span className="tabular-nums">{scope.readyContentItemCount}</span>
          عنصر جاهز
        </span>
      </span>
    </button>
  );
}
